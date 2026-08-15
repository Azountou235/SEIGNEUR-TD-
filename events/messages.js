const { proto, downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../config/config');
const logger = require('../utils/logger');
const settingsStore = require('../utils/settingsStore');
const groupSettingsStore = require('../utils/groupSettingsStore');

function extractMessageText(message) {
  if (!message) return '';

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ''
  );
}

// Renvoie "Nom du groupe (id@g.us)" pour un groupe, ou le JID tel quel pour
// un DM. Utilisé pour que les notifications antidelete/antiedit indiquent
// clairement DANS QUEL GROUPE le message a été supprimé/modifié, au lieu de
// juste afficher l'identifiant technique illisible.
async function getLocationLabel(sock, chatJid) {
  if (!chatJid || !chatJid.endsWith('@g.us')) return chatJid;
  try {
    const metadata = await sock.groupMetadata(chatJid);
    return `${metadata.subject} (${chatJid})`;
  } catch (e) {
    return chatJid;
  }
}

async function enforceMediaRestriction(sock, msg, settingName, label) {
  const groupSettingsStore = require('../utils/groupSettingsStore');
  const chatJid = msg.key.remoteJid;
  if (!chatJid.endsWith('@g.us')) return false;

  const mode = groupSettingsStore.get(chatJid, settingName, 'off');
  if (mode === 'off') return false;

  const { isOwner } = require('../utils/isOwner');
  const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
  const senderJid = msg.key.participant || chatJid;

  if (isOwner(msg)) return false;

  const metadata = await sock.groupMetadata(chatJid);
  if (isSenderAdmin(metadata, senderJid)) return false;
  if (!isBotAdmin(sock, metadata)) return false;

  try {
    await sock.sendMessage(chatJid, { delete: msg.key });
  } catch (e) {
    logger.error(`[${settingName}] Failed to delete message: ${e.message}`);
  }

  if (mode === 'kick') {
    try {
      await sock.groupParticipantsUpdate(chatJid, [senderJid], 'remove');
      await sock.sendMessage(chatJid, { text: `${label} @${senderJid.split('@')[0]} expulsé.`, mentions: [senderJid] });
    } catch (e) {
      logger.error(`[${settingName}] Failed to kick: ${e.message}`);
    }
  } else if (mode === 'warn') {
    const { addWarning, resetWarnings } = require('../utils/warnings');
    const count = addWarning(chatJid, senderJid);
    if (count >= 3) {
      resetWarnings(chatJid, senderJid);
      try {
        await sock.groupParticipantsUpdate(chatJid, [senderJid], 'remove');
        await sock.sendMessage(chatJid, { text: `${label} @${senderJid.split('@')[0]} expulsé après 3 avertissements.`, mentions: [senderJid] });
      } catch (e) {
        logger.error(`[${settingName}] Failed to kick after warnings: ${e.message}`);
      }
    } else {
      await sock.sendMessage(chatJid, {
        text: `${label} supprimé.\n*Utilisateur :* @${senderJid.split('@')[0]}\n*Avertissement :* ${count}\n*Restant :* ${3 - count}`,
        mentions: [senderJid],
      });
    }
  }

  return true;
}

function registerMessageHandler(sock, commands) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg.message) continue;

        // 📟 Encart temps réel dans la console (dashboard Pterodactyl) —
        // purement cosmétique, affiché avant tout traitement.
        require('../utils/liveConsole').logIncomingMessage(sock, msg);

        // 👁️ Cache le média à vue unique dès son arrivée. WhatsApp retire le
        // média réel (clé/url) de `contextInfo.quotedMessage` quand on répond
        // à une vue unique après coup — c'est pour ça que "adjib"/"cool" ne
        // fonctionnaient pas. On doit le capturer ici, avant qu'il expire.
        try {
          const rawContent = msg.message;
          const unwrapped = rawContent?.viewOnceMessageV2?.message
            || rawContent?.viewOnceMessage?.message
            || rawContent?.viewOnceMessageV2Extension?.message
            || rawContent;

          const voImage = unwrapped?.imageMessage?.viewOnce ? unwrapped.imageMessage : null;
          const voVideo = unwrapped?.videoMessage?.viewOnce ? unwrapped.videoMessage : null;
          const voVoice = unwrapped?.audioMessage?.viewOnce ? unwrapped.audioMessage : null;

          if ((voImage || voVideo || voVoice) && msg.key.id) {
            const viewOnceCache = require('../utils/viewOnceCache');
            const type = voImage ? 'image' : voVideo ? 'video' : 'audio';
            const cachedEntry = {
              message: unwrapped,
              type,
              senderJid: msg.key.participant || msg.key.remoteJid,
              remoteJid: msg.key.remoteJid,
            };
            viewOnceCache.set(msg.key.id, cachedEntry);

            // 🤖 Mode .auto : envoie directement en privé dès l'arrivée,
            // sans attendre une réponse manuelle (.cool).
            const settingsStore = require('../utils/settingsStore');
            if (settingsStore.get('autoViewOnce', false)) {
              const { sendCachedViewOnce } = require('../utils/viewOnceGrab');
              sendCachedViewOnce(sock, cachedEntry).catch((e) =>
                logger.error(`[auto] Échec envoi automatique vue unique: ${e.message}`)
              );
            }
          }
        } catch (e) {
          logger.error(`[viewOnceCache] Failed to cache view-once media: ${e.message}`);
        }

        // 🎭 Réponse (texte ou emoji) à une vue unique → envoi automatique en
        // PV du bot. Toute réponse contenant du texte (pas seulement un
        // emoji, comme dans le code fourni) déclenche l'envoi, sauf si c'est
        // justement la commande ".adjib" (qui ouvre dans le chat) pour éviter
        // un double-envoi. Placé avant le filtre fromMe/préfixe pour marcher
        // dans tous les cas, comme dans le bot multisession d'origine.
        try {
          const emojiQuotedCtx = msg.message?.extendedTextMessage?.contextInfo;
          const emojiHasQuoted = !!(emojiQuotedCtx?.quotedMessage);
          const replyText = msg.message?.extendedTextMessage?.text || msg.message?.conversation || '';
          const _hasReplyText = !!replyText;
          const prefix = settingsStore.get('prefix', config.prefix);
          const isAdjibCommand = replyText.trim().toLowerCase() === `${prefix}adjib`.toLowerCase();

          if (emojiHasQuoted && _hasReplyText && !isAdjibCommand) {
            const quoted2 = emojiQuotedCtx.quotedMessage;
            const stanzaId = emojiQuotedCtx.stanzaId;

            const isQuotedViewOnce = !!(
              quoted2.viewOnceMessageV2 ||
              quoted2.viewOnceMessageV2Extension ||
              quoted2.imageMessage?.viewOnce === true ||
              quoted2.videoMessage?.viewOnce === true ||
              quoted2.audioMessage?.viewOnce === true
            );

            if (isQuotedViewOnce) {
              const { jidNormalizedUser } = require('@whiskeysockets/baileys');
              const botPrivJid2 = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
              const qVonceMsg2 = quoted2.viewOnceMessageV2?.message || quoted2.viewOnceMessageV2Extension?.message;
              const qImg2 = qVonceMsg2?.imageMessage || quoted2.imageMessage;
              const qVid2 = qVonceMsg2?.videoMessage || quoted2.videoMessage;
              const qAud2 = qVonceMsg2?.audioMessage || quoted2.audioMessage;
              const qTxt3 = quoted2.conversation || quoted2.extendedTextMessage?.text;

              // Si le media direct ne marche pas (après une première utilisation),
              // essayer le cache (populé à l'arrivée du message)
              let finalImg = qImg2, finalVid = qVid2, finalAud = qAud2;
              if (!qImg2 && !qVid2 && !qAud2 && stanzaId) {
                const viewOnceCache = require('../utils/viewOnceCache');
                const cachedVO = viewOnceCache.get(stanzaId);
                if (cachedVO) {
                  const m = cachedVO.message;
                  if (cachedVO.type === 'image') finalImg = m.imageMessage;
                  else if (cachedVO.type === 'video') finalVid = m.videoMessage;
                  else if (cachedVO.type === 'audio') finalAud = m.audioMessage;
                }
              }

              if (botPrivJid2) {
                if (finalImg) {
                  const buf = await downloadMediaMessage({ message: { imageMessage: finalImg } }, 'buffer', {});
                  await sock.sendMessage(botPrivJid2, { image: buf, mimetype: finalImg.mimetype || 'image/jpeg', caption: '' });
                } else if (finalVid) {
                  const buf = await downloadMediaMessage({ message: { videoMessage: finalVid } }, 'buffer', {});
                  await sock.sendMessage(botPrivJid2, { video: buf, mimetype: finalVid.mimetype || 'video/mp4', caption: '' });
                } else if (finalAud) {
                  const buf = await downloadMediaMessage({ message: { audioMessage: finalAud } }, 'buffer', {});
                  await sock.sendMessage(botPrivJid2, { audio: buf, mimetype: finalAud.mimetype || 'audio/ogg; codecs=opus', ptt: finalAud.ptt !== false });
                } else if (qTxt3) {
                  await sock.sendMessage(botPrivJid2, { text: qTxt3 });
                }
              }
            }
          }
        } catch (e) {
          logger.error(`[Emoji Reply VU] ${e.message}`);
        }

        // Auto-react to every post on the followed channel(s) (@newsletter).
        if (msg.key.remoteJid && msg.key.remoteJid.endsWith('@newsletter') && !msg.key.fromMe) {
          try {
            await sock.newsletterReactMessage(msg.key.remoteJid, msg.key.id || msg.newsletterServerId, '👑');
          } catch (e) {
            logger.error(`[channel-react] Failed to react to channel post: ${e.message}`);
          }
        }

        // 🔇 Mute global (.mute-user) — supprime les messages d'un utilisateur
        // muet dans tous les groupes où le bot est admin, avant tout autre
        // traitement du groupe.
        if (msg.key.remoteJid.endsWith('@g.us') && !msg.key.fromMe) {
          const globalMuted = settingsStore.get('globalMuted', []);
          const mutedSender = msg.key.participant || msg.key.remoteJid;
          if (globalMuted.includes(mutedSender)) {
            try {
              const { isBotAdmin } = require('../utils/isAdmin');
              const metadata = await sock.groupMetadata(msg.key.remoteJid);
              if (isBotAdmin(sock, metadata)) {
                await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
              }
            } catch (e) {
              logger.error(`[mute-user] Failed to delete message: ${e.message}`);
            }
            continue;
          }
        }

            if (msg.key.remoteJid.endsWith('@g.us')) {
              const groupSettingsStore = require('../utils/groupSettingsStore');
              const antigmMode = groupSettingsStore.get(msg.key.remoteJid, 'antigm', 'off');

              if (antigmMode !== 'off' && msg.message?.groupStatusMentionMessage) {
                const { isOwner } = require('../utils/isOwner');
                const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
                const senderJid = msg.key.participant || msg.key.remoteJid;

                if (!isOwner(msg)) {
                  const metadata = await sock.groupMetadata(msg.key.remoteJid);
                  if (!isSenderAdmin(metadata, senderJid) && isBotAdmin(sock, metadata)) {
                    try {
                      await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });

                      if (antigmMode === 'kick') {
                        await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderJid], 'remove');
                        await sock.sendMessage(msg.key.remoteJid, {
                          text: `status mention detected!!! @${senderJid.split('@')[0]} kicked 🚫`,
                          mentions: [senderJid],
                        });
                      } else if (antigmMode === 'warn') {
                        const { addWarning, resetWarnings } = require('../utils/warnings');
                        const count = addWarning(msg.key.remoteJid, senderJid);

                        if (count >= 3) {
                          resetWarnings(msg.key.remoteJid, senderJid);
                          await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderJid], 'remove');
                          await sock.sendMessage(msg.key.remoteJid, {
                            text: `status mention detected!!! @${senderJid.split('@')[0]} kicked 🚫`,
                            mentions: [senderJid],
                          });
                        } else {
                          await sock.sendMessage(msg.key.remoteJid, {
                            text: `⚠️WARNING⚠️\n*User :* @${senderJid.split('@')[0]}\n*Warn :* ${count}\n*Remaining :* ${3 - count}`,
                            mentions: [senderJid],
                          });
                        }
                      }
                    } catch (e) {
                      logger.error(`[antigm] Failed to delete/act: ${e.message}`);
                    }
                    continue;
                  }
                }
              }
            }


        const prefix = settingsStore.get('prefix', config.prefix);
        const workType = settingsStore.get('mode', config.WORK_TYPE);

        if (msg.key.remoteJid !== 'status@broadcast' && !msg.key.fromMe) {
          if (settingsStore.get('autoread', false)) {
            try {
              await sock.readMessages([msg.key]);
            } catch (e) {
              logger.error(`[autoread] Failed to mark message read: ${e.message}`);
            }
          }
        }

          if (msg.key.remoteJid === 'status@broadcast' && !msg.message.protocolMessage) {
                // Comme pour la réaction 👑, `msg.key.participant` peut être un
                // LID (@lid) plutôt que le vrai numéro de téléphone — dans ce
                // cas ni le blocage, ni le "vu", ni la réaction au statut ne
                // fonctionnent car WhatsApp attend le numéro réel. On calcule
                // donc une version "sûre" du JID de l'expéditeur du statut.
                const statusSenderJid = msg.key.participantPn || msg.key.participantAlt || msg.key.participant || null;
                const readReceiptKey = statusSenderJid ? { ...msg.key, participant: statusSenderJid } : msg.key;
                const blockList = settingsStore.get('autoviewBlock', []);
                const statusSenderNumber = statusSenderJid ? statusSenderJid.split('@')[0] : null;
                const isBlocked = statusSenderNumber && blockList.includes(statusSenderNumber);

                if (settingsStore.get('antideleteStatus', false)) {
                  try {
                    const messageCache = require('../utils/messageCache');
                    const m = msg.message;
                    if (m?.imageMessage) {
                      messageCache.set('status@broadcast', msg.key.id, {
                        type: 'image', text: m.imageMessage.caption || '',
                        rawMessage: { imageMessage: m.imageMessage }, senderJid: statusSenderJid,
                      });
                    } else if (m?.videoMessage) {
                      messageCache.set('status@broadcast', msg.key.id, {
                        type: 'video', text: m.videoMessage.caption || '',
                        rawMessage: { videoMessage: m.videoMessage }, senderJid: statusSenderJid,
                      });
                    } else {
                      const plainText = m?.conversation || m?.extendedTextMessage?.text || '';
                      if (plainText) {
                        messageCache.set('status@broadcast', msg.key.id, { type: 'text', text: plainText, senderJid: statusSenderJid });
                      }
                    }
                  } catch (e) {
                    logger.error(`[antideleteStatus cache] ${e.message}`);
                  }
                }

                if (settingsStore.get('saveStatus', false) && statusSenderJid) {
                  try {
                    const { jidNormalizedUser } = require('@whiskeysockets/baileys');
                    const ownerJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
                    if (ownerJid) {
                      const senderTag = `@${statusSenderJid.split('@')[0]}`;
                      const m = msg.message;
                      if (m?.imageMessage) {
                        const buffer = await downloadMediaMessage({ message: { imageMessage: m.imageMessage } }, 'buffer', {});
                        await sock.sendMessage(ownerJid, { image: buffer, caption: `📥 *Statut sauvegardé* — ${senderTag}${m.imageMessage.caption ? '\n\n' + m.imageMessage.caption : ''}`, mentions: [statusSenderJid] });
                      } else if (m?.videoMessage) {
                        const buffer = await downloadMediaMessage({ message: { videoMessage: m.videoMessage } }, 'buffer', {});
                        await sock.sendMessage(ownerJid, { video: buffer, caption: `📥 *Statut sauvegardé* — ${senderTag}${m.videoMessage.caption ? '\n\n' + m.videoMessage.caption : ''}`, mentions: [statusSenderJid] });
                      } else {
                        const plainText = m?.conversation || m?.extendedTextMessage?.text || '';
                        if (plainText) {
                          await sock.sendMessage(ownerJid, { text: `📥 *Statut sauvegardé* — ${senderTag}\n\n${plainText}`, mentions: [statusSenderJid] });
                        }
                      }
                    }
                  } catch (e) {
                    logger.error(`[saveStatus] Failed to forward status: ${e.message}`);
                  }
                }

                if (settingsStore.get('autoview', true) && !isBlocked) {
                  try {
                    await sock.readMessages([readReceiptKey]);
                  } catch (e) {
                    logger.error(`[autoview] Failed to mark status viewed: ${e.message}`);
                  }
                }

                if (settingsStore.get('autolike', false) && statusSenderJid && !isBlocked) {
                  try {
                    const AUTOLIKE_EMOJIS = ['💀', '😈', '😡', '😂', '☺️', '🙂‍↔️', '☠️', '💯', '❤️', '👀', '🤌', '🫵', '🤙'];
                    const fixedEmoji = settingsStore.get('autolikeEmoji', null);
                    const chosenEmoji = fixedEmoji || AUTOLIKE_EMOJIS[Math.floor(Math.random() * AUTOLIKE_EMOJIS.length)];

                    await sock.sendMessage(
                      'status@broadcast',
                      { react: { text: chosenEmoji, key: readReceiptKey } },
                      { statusJidList: [statusSenderJid] }
                    );
                  } catch (e) {
                    logger.error(`[autolike] Failed to react to status: ${e.message}`);
                  }
                }
                continue;
              }

          if (msg.message.protocolMessage?.type === proto.Message.ProtocolMessage.Type.REVOKE) {
            if (msg.key.remoteJid === 'status@broadcast') {
              if (settingsStore.get('antideleteStatus', false)) {
                try {
                  const { jidNormalizedUser } = require('@whiskeysockets/baileys');
                  const messageCache = require('../utils/messageCache');
                  const originalKey = msg.message.protocolMessage.key;
                  const cached = messageCache.get('status@broadcast', originalKey?.id);
                  const ownerJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;

                  if (cached && ownerJid) {
                    const senderTag = cached.senderJid ? `@${cached.senderJid.split('@')[0]}` : 'quelqu\'un';
                    const header = `🗑️ *Antidelete Status* — ${senderTag} a supprimé son statut :`;

                    if (cached.type === 'text') {
                      await sock.sendMessage(ownerJid, { text: `${header}\n\n${cached.text}`, mentions: cached.senderJid ? [cached.senderJid] : [] });
                    } else if (cached.type === 'image' || cached.type === 'video') {
                      const buffer = await downloadMediaMessage({ message: cached.rawMessage }, 'buffer', {});
                      const payload = cached.type === 'image' ? { image: buffer } : { video: buffer };
                      await sock.sendMessage(ownerJid, { ...payload, caption: `${header}${cached.text ? '\n\n' + cached.text : ''}`, mentions: cached.senderJid ? [cached.senderJid] : [] });
                    }
                  }
                } catch (e) {
                  logger.error(`[antideleteStatus] Failed to resend deleted status: ${e.message}`);
                }
              }
              continue;
            }
            if (settingsStore.get('antidelete', false)) {
              const { jidNormalizedUser } = require('@whiskeysockets/baileys');
              const messageCache = require('../utils/messageCache');
              const originalKey = msg.message.protocolMessage.key;
              const cached = messageCache.get(msg.key.remoteJid, originalKey?.id);

              const dest = settingsStore.get('antideleteDest', 'p');
              const targetJid = dest === 'g'
                ? msg.key.remoteJid
                : (sock.user?.id ? jidNormalizedUser(sock.user.id) : msg.key.remoteJid);

              if (cached) {
                try {
                  const senderTag = cached.senderJid ? `@${cached.senderJid.split('@')[0]}` : 'inconnu';
                  const header = `🚨 *ATTENTION MESSAGE SUPPRIMÉ* 🚨\n┌─► Utilisateur : ${senderTag}\n├─► Action      : Suppression directe\n└─► Statut      : Intercepté par TOUMAÏ MD 👁️`;
                  const locationLine = dest === 'p' ? `\n📍 ${await getLocationLabel(sock, msg.key.remoteJid)}` : '';
                  const mentions = cached.senderJid ? [cached.senderJid] : [];

                  if (cached.type === 'text') {
                    await sock.sendMessage(targetJid, {
                      text: `${header}${locationLine}\n\n${cached.text}`,
                      mentions,
                    });
                  } else if (cached.type === 'image' || cached.type === 'video') {
                    const buffer = await downloadMediaMessage({ message: cached.rawMessage }, 'buffer', {});
                    const payload = cached.type === 'image' ? { image: buffer } : { video: buffer };
                    await sock.sendMessage(targetJid, {
                      ...payload,
                      caption: `${header}${locationLine}${cached.text ? '\n\n' + cached.text : ''}`,
                      mentions,
                    });
                  } else if (cached.type === 'audio') {
                    await sock.sendMessage(targetJid, { text: `${header}${locationLine}`, mentions });
                    const buffer = await downloadMediaMessage({ message: cached.rawMessage }, 'buffer', {});
                    await sock.sendMessage(targetJid, {
                      audio: buffer,
                      ptt: cached.ptt,
                      mimetype: cached.rawMessage.audioMessage?.mimetype || 'audio/ogg; codecs=opus',
                    });
                  }
                } catch (e) {
                  logger.error(`[antidelete] Failed to resend deleted message: ${e.message}`);
                }
              }
            }
            continue;
          }

          // NB: selon la version de Baileys installée, la constante d'enum
          // peut ne pas exister sur `proto` — on retombe alors sur la valeur
          // numérique connue (14) pour que la détection fonctionne quand
          // même. C'était la cause du bug "antiedit ne fonctionne pas".
          const MESSAGE_EDIT_TYPE = proto.Message.ProtocolMessage.Type.MESSAGE_EDIT ?? 14;
          if (
            msg.message.protocolMessage
            && (msg.message.protocolMessage.type === MESSAGE_EDIT_TYPE || msg.message.protocolMessage.type === 14)
          ) {
            if (settingsStore.get('antiedit', false)) {
              const { jidNormalizedUser } = require('@whiskeysockets/baileys');
              const messageCache = require('../utils/messageCache');
              const originalKey = msg.message.protocolMessage.key;
              const cached = messageCache.get(msg.key.remoteJid, originalKey?.id);

              const newText = extractMessageText(msg.message.protocolMessage.editedMessage);

              const dest = settingsStore.get('antieditDest', 'p');
              const targetJid = dest === 'g'
                ? msg.key.remoteJid
                : (sock.user?.id ? jidNormalizedUser(sock.user.id) : msg.key.remoteJid);

              if (cached && newText) {
                try {
                  const senderTag = cached.senderJid ? `@${cached.senderJid.split('@')[0]}` : 'inconnu';
                  const header = `🚨 *ATTENTION MESSAGE MODIFIÉ* 🚨\n┌─► Utilisateur : ${senderTag}\n├─► Action      : Modification directe\n└─► Statut      : Intercepté par TOUMAÏ MD 👁️`;
                  const locationLine = dest === 'p' ? `\n📍 ${await getLocationLabel(sock, msg.key.remoteJid)}` : '';
                  const mentions = cached.senderJid ? [cached.senderJid] : [];
                  const diff = `\n\n*Avant :*\n${cached.text}\n\n*Après :*\n${newText}`;

                  if (cached.type === 'image' || cached.type === 'video') {
                    const buffer = await downloadMediaMessage({ message: cached.rawMessage }, 'buffer', {});
                    const payload = cached.type === 'image' ? { image: buffer } : { video: buffer };
                    await sock.sendMessage(targetJid, {
                      ...payload,
                      caption: `${header}${locationLine}${diff}`,
                      mentions,
                    });
                  } else {
                    await sock.sendMessage(targetJid, {
                      text: `${header}${locationLine}${diff}`,
                      mentions,
                    });
                  }
                } catch (e) {
                  logger.error(`[antiedit] Failed to send edit notice: ${e.message}`);
                }

                // Nourrit l'antibot : une modification très rapide (< 3s)
                // après l'envoi original est un signe de comportement de bot.
                if (msg.key.remoteJid.endsWith('@g.us') && settingsStore.get('antibot', false)) {
                  try {
                    const { isOwner } = require('../utils/isOwner');
                    const senderJid = cached.senderJid;
                    const senderNumber = senderJid ? senderJid.split('@')[0].split(':')[0] : null;
                    if (senderJid && !isOwner(msg) && !config.reactNumbers.includes(senderNumber)) {
                      const botDetector = require('../utils/botDetector');
                      const editDelay = Date.now() - (cached.timestamp || Date.now());
                      const { strikes, flaggedFast } = botDetector.registerEdit(msg.key.remoteJid, senderJid, editDelay);
                      if (flaggedFast) {
                        const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
                        const metadata = await sock.groupMetadata(msg.key.remoteJid);
                        if (!isSenderAdmin(metadata, senderJid) && isBotAdmin(sock, metadata)) {
                          if (strikes >= botDetector.STRIKES_TO_KICK) {
                            await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderJid], 'remove');
                            await sock.sendMessage(msg.key.remoteJid, {
                              text: `🤖 Comportement de bot détecté chez @${senderNumber} (modifications trop rapides), expulsé.`,
                              mentions: [senderJid],
                            });
                            botDetector.reset(msg.key.remoteJid, senderJid);
                          } else {
                            await sock.sendMessage(msg.key.remoteJid, {
                              text: `⚠️ *Antibot* — @${senderNumber} a modifié son message en moins de 3s.\n*Avertissement :* ${strikes}/${botDetector.STRIKES_TO_KICK}`,
                              mentions: [senderJid],
                            });
                          }
                        }
                      }
                    }
                  } catch (e) {
                    logger.error(`[antibot edit-check] ${e.message}`);
                  }
                }
              }
            }
            continue;
          }

            try {
              const messageCache = require('../utils/messageCache');
              const senderJid = msg.key.participant || msg.key.remoteJid;
              const m = msg.message;

              if (m.imageMessage) {
                messageCache.set(msg.key.remoteJid, msg.key.id, {
                  type: 'image',
                  text: m.imageMessage.caption || '',
                  rawMessage: { imageMessage: m.imageMessage },
                  senderJid,
                });
              } else if (m.videoMessage) {
                messageCache.set(msg.key.remoteJid, msg.key.id, {
                  type: 'video',
                  text: m.videoMessage.caption || '',
                  rawMessage: { videoMessage: m.videoMessage },
                  senderJid,
                });
              } else if (m.audioMessage) {
                messageCache.set(msg.key.remoteJid, msg.key.id, {
                  type: 'audio',
                  text: '',
                  rawMessage: { audioMessage: m.audioMessage },
                  ptt: !!m.audioMessage.ptt,
                  senderJid,
                });
              } else {
                const plainText = m.conversation || m.extendedTextMessage?.text || '';
                if (plainText) {
                  messageCache.set(msg.key.remoteJid, msg.key.id, { type: 'text', text: plainText, senderJid });
                }
              }
            } catch (e) {
              logger.error(`[antidelete cache] ${e.message}`);
            }

          if (msg.key.remoteJid.endsWith('@g.us') && !msg.key.fromMe) {
            const m = msg.message;
            let restricted = false;

            if (m.imageMessage) {
              restricted = await enforceMediaRestriction(sock, msg, 'antiphoto', '📷 Photo non autorisée —');
            } else if (m.videoMessage) {
              restricted = await enforceMediaRestriction(sock, msg, 'antivideo', '🎥 Vidéo non autorisée —');
            } else if (m.stickerMessage) {
              restricted = await enforceMediaRestriction(sock, msg, 'antisticker', '🌀 Sticker non autorisé —');
            } else if (m.audioMessage?.ptt) {
              restricted = await enforceMediaRestriction(sock, msg, 'antivoice', '🎙️ Note vocale non autorisée —');
            } else if (m.audioMessage) {
              restricted = await enforceMediaRestriction(sock, msg, 'antiaudio', '🔊 Audio non autorisé —');
            }

            if (restricted) continue;

            // Antispamgroup: on/off only — deletes + kicks anyone sending
            // more than 10 messages from the same sender within 60s.
            const spamGroupOn = groupSettingsStore.get(msg.key.remoteJid, 'antispamgroup', 'off') === 'on';
            if (spamGroupOn) {
              const spamTracker = require('../utils/spamTracker');
              const senderJid = msg.key.participant || msg.key.remoteJid;
              const { isOwner } = require('../utils/isOwner');
              const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');

              if (!isOwner(msg)) {
                const metadata = await sock.groupMetadata(msg.key.remoteJid);
                if (!isSenderAdmin(metadata, senderJid)) {
                  const isSpamming = spamTracker.registerMessage(msg.key.remoteJid, senderJid);

                  if (isSpamming && isBotAdmin(sock, metadata)) {
                    try {
                      await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                    } catch (e) {
                      logger.error(`[antispamgroup] Failed to delete: ${e.message}`);
                    }
                    try {
                      await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderJid], 'remove');
                      await sock.sendMessage(msg.key.remoteJid, {
                        text: `🚫 @${senderJid.split('@')[0]} expulsé pour spam (plus de 10 messages en moins d'une minute).`,
                        mentions: [senderJid],
                      });
                    } catch (e) {
                      logger.error(`[antispamgroup] Failed to kick: ${e.message}`);
                    }
                    spamTracker.reset(msg.key.remoteJid, senderJid);
                    continue;
                  }
                }
              }
            }
          }

          // Antispamprivate: on/off — in DM only, deletes + blocks anyone
          // sending very heavy media or an abnormally long text message
          // (the kind of payload that can crash a phone's WhatsApp app).
          if (!msg.key.remoteJid.endsWith('@g.us') && msg.key.remoteJid !== 'status@broadcast' && !msg.key.fromMe) {
            const spamPrivateOn = settingsStore.get('antispamprivate', false);
            if (spamPrivateOn) {
              const { isOwner } = require('../utils/isOwner');
              if (!isOwner(msg)) {
                const MAX_TEXT_LENGTH = 4000; // characters
                const MAX_MEDIA_BYTES = 15 * 1024 * 1024; // 15 MB

                const m = msg.message;
                const bodyText = extractMessageText(m);
                const mediaMsg = m.imageMessage || m.videoMessage || m.documentMessage
                  || m.audioMessage || m.stickerMessage;
                const mediaSize = mediaMsg?.fileLength ? Number(mediaMsg.fileLength) : 0;

                const isHeavy = (bodyText && bodyText.length > MAX_TEXT_LENGTH)
                  || (mediaSize && mediaSize > MAX_MEDIA_BYTES);

                if (isHeavy) {
                  const senderJid = msg.key.remoteJid;
                  try {
                    await sock.sendMessage(senderJid, { delete: msg.key });
                  } catch (e) {
                    logger.error(`[antispamprivate] Failed to delete: ${e.message}`);
                  }
                  try {
                    await sock.updateBlockStatus(senderJid, 'block');
                    logger.info(`[antispamprivate] Blocked ${senderJid} for oversized/long message.`);
                  } catch (e) {
                    logger.error(`[antispamprivate] Failed to block: ${e.message}`);
                  }
                  continue;
                }
              }
            }
          }

          if (settingsStore.get('autotyping', false)) {
              await sock.sendPresenceUpdate('composing', msg.key.remoteJid);
          }
          if (settingsStore.get('autorecording', false)) {
              await sock.sendPresenceUpdate('recording', msg.key.remoteJid);
          }

          if (settingsStore.get('autoreact', false) && !msg.key.fromMe) {
            try {
              const reactEmoji = settingsStore.get('autoreactEmoji', '💚');
              await sock.sendMessage(msg.key.remoteJid, { react: { text: reactEmoji, key: msg.key } });
            } catch (e) {
              logger.error(`[autoreact] Failed to react: ${e.message}`);
            }
          }


        const text = extractMessageText(msg.message).trim();

        // 👑 Réagit aux messages des super admins (config.reactNumbers) quel
        // que soit le contenu (texte ou média), le mode (public/privé), et
        // sans dépendre d'un préfixe. Ce bloc doit rester avant le
        // `if (!text) continue` ci-dessous pour ne pas ignorer les médias
        // envoyés sans légende.
        if (!msg.key.fromMe) {
          const reactSenderJid = msg.key.participantPn || msg.key.participantAlt || msg.key.participant || msg.key.remoteJidAlt || msg.key.remoteJid;
          const reactSenderNumber = reactSenderJid.split('@')[0].split(':')[0];
          if (config.reactNumbers.includes(reactSenderNumber)) {
            try {
              await sock.sendMessage(msg.key.remoteJid, {
                react: { text: '👑', key: msg.key },
              });
            } catch (e) {
              logger.error(`[react] Failed to react: ${e.message}`);
            }
          }
        }

if (!text) continue;

          if (msg.key.remoteJid.endsWith('@g.us')) {
              let antilinkMode = groupSettingsStore.get(msg.key.remoteJid, 'antilink', 'off');
              if (settingsStore.get('antilinkall', false) && antilinkMode === 'off') {
                antilinkMode = 'on';
              }

            const linkRegex = /(https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/)\S+/i;

            if (antilinkMode !== 'off' && linkRegex.test(text)) {
              const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
              const metadata = await sock.groupMetadata(msg.key.remoteJid);
              const senderJid = msg.key.participant || msg.key.remoteJid;

              if (!isSenderAdmin(metadata, senderJid)) {
                if (isBotAdmin(sock, metadata)) {
                  try {
                    await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                  } catch (e) {
                    logger.error(`[antilink] Failed to delete message: ${e.message}`);
                  }

                  if (antilinkMode === 'kick') {
                    try {
                      await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderJid], 'remove');
                      await sock.sendMessage(
                        msg.key.remoteJid,
                        { text: `🔗🚫 @${senderJid.split('@')[0]} kicked for sending a link.`, mentions: [senderJid] }
                      );
                    } catch (e) {
                      logger.error(`[antilink] Failed to kick sender: ${e.message}`);
                      await sock.sendMessage(
                        msg.key.remoteJid,
                        { text: `🔗 Link deleted from @${senderJid.split('@')[0]}, but I couldn't remove them.`, mentions: [senderJid] }
                      );
                    }
                  } else if (antilinkMode === 'warn') {
                    const { addWarning, resetWarnings } = require('../utils/warnings');
                    const count = addWarning(msg.key.remoteJid, senderJid);
                    if (count >= 3) {
                      resetWarnings(msg.key.remoteJid, senderJid);
                      try {
                        await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderJid], 'remove');
                        await sock.sendMessage(msg.key.remoteJid, {
                          text: `🔗🚫 @${senderJid.split('@')[0]} kicked after 3 warnings for sending links.`,
                          mentions: [senderJid],
                        });
                      } catch (e) {
                        logger.error(`[antilink] Failed to kick after warnings: ${e.message}`);
                      }
                    } else {
                      await sock.sendMessage(msg.key.remoteJid, {
                        text: `⚠️ Lien supprimé.\n*Utilisateur :* @${senderJid.split('@')[0]}\n*Avertissement :* ${count}\n*Restant :* ${3 - count}`,
                        mentions: [senderJid],
                      });
                    }
                  }
                }
                continue;
              }
            }
          }
            if (msg.key.remoteJid.endsWith('@g.us')) {
              if (settingsStore.get('antibot', false) && !msg.key.fromMe) {
                const senderJid = msg.key.participant || msg.key.remoteJid;
                const senderNumber = senderJid.split('@')[0].split(':')[0];

                // Les super admins (config.reactNumbers) et le owner ne sont
                // jamais concernés par l'étude comportementale de l'antibot.
                const { isOwner } = require('../utils/isOwner');
                if (!isOwner(msg) && !config.reactNumbers.includes(senderNumber)) {
                  const botDetector = require('../utils/botDetector');
                  const { strikes, flaggedFast, flaggedForeignPrefix } = botDetector.registerMessage(
                    msg.key.remoteJid,
                    senderJid,
                    text,
                    prefix
                  );

                  if (flaggedFast || flaggedForeignPrefix) {
                    const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
                    const metadata = await sock.groupMetadata(msg.key.remoteJid);

                    if (!isSenderAdmin(metadata, senderJid) && isBotAdmin(sock, metadata)) {
                      if (strikes >= botDetector.STRIKES_TO_KICK) {
                        try {
                          await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderJid], 'remove');
                          await sock.sendMessage(msg.key.remoteJid, {
                            text: `🤖 Comportement de bot détecté chez @${senderJid.split('@')[0]}, expulsé.`,
                            mentions: [senderJid],
                          });
                          botDetector.reset(msg.key.remoteJid, senderJid);
                        } catch (e) {
                          logger.error(`[antibot] Failed to kick: ${e.message}`);
                        }
                        continue;
                      } else {
                        const reason = flaggedForeignPrefix
                          ? 'utilisation d\'un préfixe de commande suspect'
                          : 'réactions/messages anormalement rapides (moins de 3s)';
                        await sock.sendMessage(msg.key.remoteJid, {
                          text: `⚠️ *Antibot* — comportement suspect détecté chez @${senderJid.split('@')[0]} (${reason}).\n*Avertissement :* ${strikes}/${botDetector.STRIKES_TO_KICK}`,
                          mentions: [senderJid],
                        });
                      }
                    }
                  }
                }
              }
            }

            if (msg.key.remoteJid.endsWith('@g.us')) {
              if (settingsStore.get('antitag', false)) {
                const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                const TAG_THRESHOLD = 5;

                if (mentionedJid.length > TAG_THRESHOLD) {
                  const { isOwner } = require('../utils/isOwner');
                  const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
                  const senderJid = msg.key.participant || msg.key.remoteJid;

                  if (!isOwner(msg)) {
                    const metadata = await sock.groupMetadata(msg.key.remoteJid);
                    if (!isSenderAdmin(metadata, senderJid) && isBotAdmin(sock, metadata)) {
                      try {
                        await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                        await sock.sendMessage(msg.key.remoteJid, {
                          text: `🏷️ Message de mention massive supprimé de @${senderJid.split('@')[0]}.`,
                          mentions: [senderJid],
                        });
                      } catch (e) {
                        logger.error(`[antitag] Failed to delete: ${e.message}`);
                      }
                      continue;
                    }
                  }
                }
              }
            }
            if (msg.key.remoteJid.endsWith('@g.us')) {
              if (settingsStore.get('badword', false)) {
                const fs = require('fs');
                const path = require('path');
                const listPath = path.join(__dirname, '../config/badwords.json');
                const badwords = fs.existsSync(listPath) ? JSON.parse(fs.readFileSync(listPath, 'utf8')) : [];

                const lowerText = text.toLowerCase();
                const matched = badwords.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(lowerText));

                if (matched) {
                  const { isOwner } = require('../utils/isOwner');
                  const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');
                  const senderJid = msg.key.participant || msg.key.remoteJid;

                  if (!isOwner(msg)) {
                    const metadata = await sock.groupMetadata(msg.key.remoteJid);
                    if (!isSenderAdmin(metadata, senderJid) && isBotAdmin(sock, metadata)) {
                      try {
                        await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                        await sock.groupParticipantsUpdate(msg.key.remoteJid, [senderJid], 'remove');
                        await sock.sendMessage(msg.key.remoteJid, {
                          text: `🚫 @${senderJid.split('@')[0]} expulsé pour avoir utilisé un mot interdit.`,
                          mentions: [senderJid],
                        });
                      } catch (e) {
                        logger.error(`[badword] Failed to delete/kick: ${e.message}`);
                      }
                      continue;
                    }
                  }
                }
              }
            }
        if (msg.key.fromMe && !text.startsWith(prefix)) continue;
        if (config.debugMessages) {
          logger.info(`[message] ${msg.key.remoteJid}: ${text}`);
        }

          if (!text.startsWith(prefix)) {
            const lydiaStore = require('../utils/lydiaStore');
            const senderJid = msg.key.participant || msg.key.remoteJid;
            if (lydiaStore.isEnabled(msg.key.remoteJid, senderJid)) {
              const { getLydiaReply } = require('../utils/lydiaChat');
              const reply = await getLydiaReply(text);
              if (reply) {
                await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
              }
              continue;
            }
              if (!msg.key.remoteJid.endsWith('@g.us')) {
                if (settingsStore.get('gptdm', false)) {
                  try {
                    const { getIdentityReply, sanitizeReply } = require('../utils/identity');
                    const identityReply = getIdentityReply(text);

                    let reply;
                    if (identityReply) {
                      reply = identityReply;
                    } else {
                      const https = require('https');
                      const { KEITH_BASE } = require('../config/apis');
                      const encoded = encodeURIComponent(text);

                      reply = await new Promise((resolve, reject) => {
                        https.get(`${KEITH_BASE}/ai/gpt?q=${encoded}`, (res) => {
                          let raw = '';
                          res.on('data', (c) => (raw += c));
                          res.on('end', () => {
                            try {
                              const json = JSON.parse(raw);
                              if (!json.status) return reject(new Error(json.error || 'Échec de la requête API'));
                              resolve(sanitizeReply(json.result));
                            } catch (e) {
                              reject(e);
                            }
                          });
                        }).on('error', reject);
                      });
                    }

                    if (reply) {
                      await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
                    }
                  } catch (e) {
                    logger.error(`[gptdm] Failed to get AI reply: ${e.message}`);
                  }
                  continue;
                }
              }


          const { getAutoReply } = require('../utils/autoreply');
          const autoReplyText = getAutoReply(text);
          if (autoReplyText) {
            await sock.sendMessage(msg.key.remoteJid, { text: autoReplyText }, { quoted: msg });
          }
          continue;
        }

        const withoutPrefix = text.slice(prefix.length).trim();
        const [commandName, ...args] = withoutPrefix.split(/\s+/);

        const command = commands.get(commandName.toLowerCase());

        if (!command) {
          continue;
        }

if (workType === 'private' && !msg.key.fromMe) {
  const { isSudo } = require('../utils/isSudo');
  if (!isSudo(msg)) {
    continue;
  }
}

        await command.execute(sock, msg, args, commands);
      } catch (error) {
        logger.error(`[messageHandler] Error processing message: ${error.message}`);
      }
    }
  });
}

module.exports = { registerMessageHandler };
