import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  delay,
  downloadContentFromMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import readline from 'readline';

// ============================================================
// CONFIG
// ============================================================
const config = {
  botName:        'SEIGNEUR TD',
  prefix:         '.',
  sessionFolder:  './auth_info_baileys',
  usePairingCode: true,
  phoneNumber:    '',
  maxViewOnce:    50
};

const SUPER_ADMIN = '23591234568';
const OWNER_JID   = SUPER_ADMIN + '@s.whatsapp.net';
const DEV_NAME    = 'LE SEIGNEUR DES APPAREILS';
const GITHUB      = 'https://github.com/Azountou235/SEIGNEUR-TD-.git';

// ============================================================
// ETAT GLOBAL
// ============================================================
let botMode    = 'public';
let autoReact  = false;
let autoTyping = true;
let antiDelete = false;
let antiEdit   = false;
let antiLink   = false;

const startTime    = Date.now();
const messageCache = new Map();
const savedViewOnce = new Map();

// ============================================================
// UTILITAIRES
// ============================================================

function isSuperAdmin(jid) {
  if (!jid) return false;
  const phone = jid.split(':')[0].split('@')[0];
  return phone === SUPER_ADMIN;
}

function isAdmin(jid) {
  if (!jid) return false;

  // Normaliser
  const normalizedJid = jid.split(':')[0];
  const phoneNumber   = normalizedJid.split('@')[0];

  // Super admin toujours autorisé
  if (phoneNumber === SUPER_ADMIN) return true;

  // Le bot lui-même est toujours admin
  if (global._botJid) {
    const botPhone = global._botJid.split(':')[0].split('@')[0];
    if (phoneNumber === botPhone) return true;
  }

  // Vérifier dans adminNumbers (même logique que le backup original)
  const adminNums = [SUPER_ADMIN, SUPER_ADMIN + '@s.whatsapp.net'];
  return adminNums.some(adminJid => {
    if (!adminJid || adminJid === '') return false;
    const normalizedAdmin = adminJid.split(':')[0];
    const adminPhone      = normalizedAdmin.split('@')[0];
    return jid === adminJid ||
           normalizedJid === normalizedAdmin ||
           phoneNumber === adminPhone ||
           phoneNumber === adminJid ||
           jid.includes(adminPhone);
  });
}

async function isGroupAdmin(sock, groupJid, userJid) {
  try {
    // Le bot est toujours considere admin (comme dans le backup original)
    if (global._botJid) {
      const botPhone  = global._botJid.split(':')[0].split('@')[0];
      const userPhone = userJid.split(':')[0].split('@')[0];
      if (userPhone === botPhone) return true;
    }
    const meta = await sock.groupMetadata(groupJid);
    const p    = meta.participants.find(x => x.id.split(':')[0] === userJid.split(':')[0]);
    return p && (p.admin === 'admin' || p.admin === 'superadmin');
  } catch(e) { return false; }
}

// Bot toujours considere admin comme dans le backup original
async function isBotGroupAdmin(sock, groupJid) {
  return true;
}

function buildUptime() {
  const s   = Math.floor(process.uptime());
  const d   = Math.floor(s / 86400);
  const h   = Math.floor((s % 86400) / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}j ${h}h ${m}m ${sec}s`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

async function simulateTyping(sock, jid) {
  if (!autoTyping) return;
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await delay(1000);
    await sock.sendPresenceUpdate('paused', jid);
  } catch(e) {}
}

async function toBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function sendWithImage(sock, jid, text, mentions = []) {
  try {
    if (fs.existsSync('./menu.jpg')) {
      return await sock.sendMessage(jid, {
        image:    fs.readFileSync('./menu.jpg'),
        caption:  text,
        mentions
      });
    }
  } catch(e) {}
  return await sock.sendMessage(jid, { text, mentions });
}

function getDate() {
  return new Date().toLocaleDateString('fr-FR', {
    timeZone: 'Africa/Ndjamena',
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function getDateTime() {
  return new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Ndjamena' });
}

// ============================================================
// VIEW ONCE - DETECTION AUTOMATIQUE (du backup original)
// ============================================================
async function handleViewOnce(sock, message, remoteJid, senderJid) {
  try {
    let mediaData = null;
    let mediaType = '';
    let mimetype  = '';
    let isGif     = false;
    let isPtt     = false;

    const viewOnceMsg = message.message?.viewOnceMessageV2 ||
                        message.message?.viewOnceMessageV2Extension;

    const imgMsg   = viewOnceMsg?.message?.imageMessage  || message.message?.imageMessage;
    const vidMsg   = viewOnceMsg?.message?.videoMessage  || message.message?.videoMessage;
    const audioMsg = viewOnceMsg?.message?.audioMessage  || message.message?.audioMessage;

    if (imgMsg) {
      mediaType = 'image';
      mimetype  = imgMsg.mimetype || 'image/jpeg';
      const stream = await downloadContentFromMessage(imgMsg, 'image');
      mediaData = await toBuffer(stream);
    } else if (vidMsg) {
      mediaType = 'video';
      mimetype  = vidMsg.mimetype || 'video/mp4';
      isGif     = vidMsg.gifPlayback || false;
      const stream = await downloadContentFromMessage(vidMsg, 'video');
      mediaData = await toBuffer(stream);
    } else if (audioMsg) {
      mediaType = 'audio';
      mimetype  = audioMsg.mimetype || 'audio/ogg';
      isPtt     = audioMsg.ptt || false;
      const stream = await downloadContentFromMessage(audioMsg, 'audio');
      mediaData = await toBuffer(stream);
    }

    if (mediaData) {
      if (!savedViewOnce.has(senderJid)) savedViewOnce.set(senderJid, []);
      const userSaved = savedViewOnce.get(senderJid);
      userSaved.push({
        type: mediaType, buffer: mediaData, mimetype,
        isGif, ptt: isPtt, timestamp: Date.now(),
        sender: senderJid, size: mediaData.length
      });
      if (userSaved.length > config.maxViewOnce) userSaved.shift();

      const icon = mediaType === 'image' ? 'Photo' : mediaType === 'video' ? 'Video' : 'Audio';
      const total = [...savedViewOnce.values()].reduce((s, a) => s + a.length, 0);
      await sock.sendMessage(remoteJid, {
        text: `*[View Once capture]*\n${icon} sauvegarde automatiquement!\nTotal: ${total}\nRecupere avec: ${config.prefix}vv`
      });
    }
  } catch(e) {
    console.error('Erreur view once auto:', e.message);
  }
}

// ============================================================
// VIEW ONCE - COMMANDE VV (du backup original)
// ============================================================
async function handleViewOnceCommand(sock, message, args, remoteJid, senderJid) {
  const sub = args[0]?.toLowerCase();

  if (!sub || sub === 'last') {
    // CAS 1: Reponse directe a un view once
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted) {
      try {
        let mediaData = null, mediaType = '', mimetype = '', isGif = false;
        const qViewOnce = quoted.viewOnceMessageV2 || quoted.viewOnceMessageV2Extension;
        const qImage    = qViewOnce?.message?.imageMessage || quoted.imageMessage;
        const qVideo    = qViewOnce?.message?.videoMessage || quoted.videoMessage;

        if (qImage) {
          mediaType = 'image'; mimetype = qImage.mimetype || 'image/jpeg';
          const stream = await downloadContentFromMessage(qImage, 'image');
          mediaData = await toBuffer(stream);
        } else if (qVideo) {
          mediaType = 'video'; mimetype = qVideo.mimetype || 'video/mp4';
          isGif = qVideo.gifPlayback || false;
          const stream = await downloadContentFromMessage(qVideo, 'video');
          mediaData = await toBuffer(stream);
        }

        if (mediaData && mediaData.length > 100) {
          // Envoyer en prive au numero de l'utilisateur lui-même
          const destJid = senderJid.endsWith('@g.us') ? senderJid : senderJid.split(':')[0].split('@')[0] + '@s.whatsapp.net';
          await sendVVMedia(sock, destJid, {
            type: mediaType, buffer: mediaData, mimetype, isGif, ptt: false,
            timestamp: Date.now(), sender: senderJid, size: mediaData.length, fromJid: senderJid
          }, 1, 1);
          if (destJid !== remoteJid) {
            await sock.sendMessage(remoteJid, { text: '👁️ View once envoye en prive!' });
          }
          return;
        }
      } catch(e) {
        console.error('[VV reply]', e.message);
      }
    }

    // CAS 2: Depuis le cache
    const all = [];
    for (const [jid, items] of savedViewOnce.entries()) {
      items.forEach(item => all.push({ ...item, fromJid: jid }));
    }
    if (all.length === 0) {
      await sock.sendMessage(remoteJid, {
        text: `*View Once*\n\nAucun media sauvegarde.\n\nComment utiliser:\n- Envoie un view once dans ce chat et il sera sauvegarde automatiquement\n- Reponds a un view once avec ${config.prefix}vv pour l extraire\n\nCommandes:\n${config.prefix}vv → dernier media\n${config.prefix}vv list → liste complete\n${config.prefix}vv get 1 → recuperer par numero`
      });
      return;
    }
    all.sort((a, b) => b.timestamp - a.timestamp);
    await sendVVMedia(sock, remoteJid, all[0], 1, all.length);
    return;
  }

  if (sub === 'list') {
    const all = [];
    for (const [jid, items] of savedViewOnce.entries()) {
      items.forEach(item => all.push({ ...item, fromJid: jid }));
    }
    all.sort((a, b) => b.timestamp - a.timestamp);
    if (all.length === 0) {
      await sock.sendMessage(remoteJid, { text: `*Liste View Once*\n\nAucun media sauvegarde.` });
      return;
    }
    let listText = `*Liste View Once - ${all.length} medias*\n\n`;
    all.forEach((item, i) => {
      const date = new Date(item.timestamp).toLocaleString('fr-FR', { timeZone: 'Africa/Ndjamena' });
      const icon = item.type === 'image' ? 'Photo' : item.type === 'video' ? 'Video' : 'Audio';
      listText += `${i + 1}. ${icon} - +${item.fromJid.split('@')[0]}\n   ${date} - ${(item.size / 1024).toFixed(0)} KB\n\n`;
    });
    listText += `Recuperer: ${config.prefix}vv get [numero]`;
    await sock.sendMessage(remoteJid, { text: listText });
    return;
  }

  if (sub === 'get') {
    const idx = parseInt(args[1]) - 1;
    const all = [];
    for (const [jid, items] of savedViewOnce.entries()) {
      items.forEach(item => all.push({ ...item, fromJid: jid }));
    }
    all.sort((a, b) => b.timestamp - a.timestamp);
    if (isNaN(idx) || idx < 0 || idx >= all.length) {
      await sock.sendMessage(remoteJid, { text: `Numero invalide. Range: 1 - ${all.length}` });
      return;
    }
    await sendVVMedia(sock, remoteJid, all[idx], idx + 1, all.length);
    return;
  }

  if (sub === 'clear') {
    const total = [...savedViewOnce.values()].reduce((s, a) => s + a.length, 0);
    savedViewOnce.clear();
    await sock.sendMessage(remoteJid, { text: `Tous les medias supprimes (${total} fichiers)` });
    return;
  }

  await sock.sendMessage(remoteJid, {
    text: `*View Once - Commandes:*\n${config.prefix}vv → dernier media\n${config.prefix}vv list → liste\n${config.prefix}vv get [n] → recuperer\n${config.prefix}vv clear → tout supprimer\n\nTotal: ${[...savedViewOnce.values()].reduce((s,a)=>s+a.length,0)}`
  });
}

async function sendVVMedia(sock, remoteJid, item, num, total) {
  try {
    const date    = new Date(item.timestamp).toLocaleString('fr-FR', { timeZone: 'Africa/Ndjamena' });
    const from    = item.fromJid.split('@')[0];
    const caption = `*View Once #${num}/${total}*\nDe: +${from}\nDate: ${date}\nTaille: ${(item.size / 1024).toFixed(0)} KB\n\nSEIGNEUR TD`;

    if (item.type === 'image') {
      await sock.sendMessage(remoteJid, { image: item.buffer, caption });
    } else if (item.type === 'video') {
      await sock.sendMessage(remoteJid, { video: item.buffer, caption, gifPlayback: item.isGif || false });
    } else if (item.type === 'audio') {
      await sock.sendMessage(remoteJid, { audio: item.buffer, ptt: item.ptt || false, mimetype: item.mimetype });
      await sock.sendMessage(remoteJid, { text: caption });
    }
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `Erreur envoi media: ${e.message}` });
  }
}

// ============================================================
// COMMANDES GROUPE (code exact du backup)
// ============================================================
async function handleTagAll(sock, message, args, remoteJid, isGroup, senderJid) {
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { text: 'Commande reservee aux groupes.' });
    return;
  }
  try {
    const metadata     = await sock.groupMetadata(remoteJid);
    const participants = metadata.participants.map(p => p.id);
    const customMessage = args.join(' ') || 'Attention tout le monde!';
    const now      = new Date();
    const timeStr  = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    let tagMessage = `*SEIGNEUR TD - TAG ALL*\n\nGroupe: ${metadata.subject}\nMembres: ${participants.length}\nHeure: ${timeStr}\n\n${customMessage}\n\n`;
    participants.forEach(jid => {
      tagMessage += `@${jid.split('@')[0]} `;
    });

    await sock.sendMessage(remoteJid, { text: tagMessage, mentions: participants });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `Erreur: ${e.message}` });
  }
}

async function handleLeave(sock, remoteJid, isGroup, senderJid) {
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { text: 'Commande reservee aux groupes.' });
    return;
  }
  const isUA = await isGroupAdmin(sock, remoteJid, senderJid);
  if (!isUA && !isAdmin(senderJid)) {
    await sock.sendMessage(remoteJid, { text: 'Seuls les admins peuvent utiliser cette commande.' });
    return;
  }
  await sock.sendMessage(remoteJid, { text: 'Au revoir! SEIGNEUR TD quitte le groupe.' });
  await delay(2000);
  await sock.groupLeave(remoteJid);
}

async function handleToStatus(sock, args, message, remoteJid, senderJid) {
  try {
    const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const text      = args.join(' ');

    if (!quotedMsg && text) {
      const colors  = ['#FF5733','#33FF57','#3357FF','#FF33A8','#FFD700','#00CED1'];
      const bgColor = colors[Math.floor(Math.random() * colors.length)];
      await sock.sendMessage('status@broadcast', {
        text, backgroundColor: bgColor, font: Math.floor(Math.random() * 5),
        statusJidList: [senderJid]
      });
      await sock.sendMessage(remoteJid, { text: `Status texte publie!\n"${text}"` });
      return;
    }

    if (quotedMsg?.imageMessage) {
      const stream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
      const buffer = await toBuffer(stream);
      await sock.sendMessage('status@broadcast', {
        image: buffer, caption: text || '', statusJidList: [senderJid]
      });
      await sock.sendMessage(remoteJid, { text: 'Status image publie!' });
      return;
    }

    if (quotedMsg?.videoMessage) {
      const stream = await downloadContentFromMessage(quotedMsg.videoMessage, 'video');
      const buffer = await toBuffer(stream);
      await sock.sendMessage('status@broadcast', {
        video: buffer, caption: text || '', statusJidList: [senderJid]
      });
      await sock.sendMessage(remoteJid, { text: 'Status video publie!' });
      return;
    }

    await sock.sendMessage(remoteJid, {
      text: `*ToStatus - Publier un status*\n\nUsage:\n${config.prefix}tostatus [texte] → status texte\nRepondre a une image + ${config.prefix}tostatus → status image\nRepondre a une video + ${config.prefix}tostatus → status video`
    });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `Erreur: ${e.message}` });
  }
}

// ============================================================
// CONNEXION WHATSAPP
// ============================================================
async function connectToWhatsApp() {
  const { version }          = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionFolder);

  const sock = makeWASocket({
    version,
    logger:            pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth:              state,
    browser:           ['Ubuntu', 'Chrome', '20.0.04']
  });

  // Pairing code - methode exacte du backup original
  if (!sock.authState.creds.registered) {
    console.log('\n Pairing Code en cours...\n');
    if (!config.phoneNumber) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const phoneNumber = await new Promise(resolve => {
        rl.question('Entrez votre numero WhatsApp (ex: 23591234568): ', answer => {
          rl.close();
          resolve(answer.trim());
        });
      });
      if (phoneNumber) {
        config.phoneNumber = phoneNumber;
        await delay(2000);
        const code = await sock.requestPairingCode(phoneNumber);
        console.log('\n==============================');
        console.log('  CODE PAIRING: ' + code);
        console.log('==============================\n');
      }
    } else {
      await delay(2000);
      const code = await sock.requestPairingCode(config.phoneNumber);
      console.log('\n==============================');
      console.log('  CODE PAIRING: ' + code);
      console.log('==============================\n');
    }
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        await delay(code === 408 ? 10000 : 5000);
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      global._botJid = sock.user.id;
      console.log('SEIGNEUR TD connecte!');
      try {
        await delay(2000);
        await sock.sendMessage(OWNER_JID, {
          text:
`┏━━━━ ⚙️ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 𝐈𝐍𝐈𝐓 ━━━━
┃
┃ ᴘʀᴇғɪx  ⪧ [ ${config.prefix} ]
┃ ᴍᴏᴅᴇ    ⪧ ${botMode === 'public' ? 'ᴘᴜʙʟɪᴄ' : 'ᴘʀɪᴠᴀᴛᴇ'}
┃ sᴛᴀᴛᴜs  ⪧ ᴏɴʟɪɴᴇ ✅
┃ ᴘᴀɴᴇʟ   ⪧ ᴘʀᴇᴍɪᴜᴍ
┃ ᴛᴇʟᴇɢ.  ⪧ @seigneu_235
┃
┗━━━━━━━━━━━━━━━━━━━━━━`
        });
      } catch(e) {}
    }
  });

  // ============================================================
  // MESSAGES
  // ============================================================
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;
      const jid = msg.key.remoteJid;
      if (!jid) continue;

      // Vue auto des status
      if (jid === 'status@broadcast') {
        try { await sock.readMessages([msg.key]); } catch(e) {}

        // Detection view once dans les status
        const isViewOnce = (
          msg.message?.viewOnceMessageV2 ||
          msg.message?.viewOnceMessageV2Extension ||
          msg.message?.imageMessage?.viewOnce === true ||
          msg.message?.videoMessage?.viewOnce === true
        );
        if (isViewOnce) {
          const statusSender = msg.key.participant || jid;
          await handleViewOnce(sock, msg, jid, statusSender);
        }
        continue;
      }

      const isGroup = jid.endsWith('@g.us');
      const fromMe  = msg.key.fromMe;
      // Si fromMe en groupe, participant peut être vide - utiliser le JID du bot
      let sender = isGroup ? (msg.key.participant || '') : jid;
      if (fromMe && (!sender || sender === '')) {
        sender = global._botJid ? global._botJid.split(':')[0] + '@s.whatsapp.net' : OWNER_JID;
      }
      const text    = msg.message?.conversation ||
                      msg.message?.extendedTextMessage?.text ||
                      msg.message?.imageMessage?.caption ||
                      msg.message?.videoMessage?.caption || '';

      // Cache anti-delete/edit
      if (!fromMe) {
        messageCache.set(msg.key.id, {
          key: msg.key, message: msg.message,
          sender, text, jid, isGroup,
          name: msg.pushName || sender.split('@')[0],
          time: Date.now()
        });
        if (messageCache.size > 500) {
          messageCache.delete(messageCache.keys().next().value);
        }
      }

      // Detection view once automatique (du backup)
      const isViewOnce = (
        msg.message?.viewOnceMessageV2 ||
        msg.message?.viewOnceMessageV2Extension ||
        msg.message?.imageMessage?.viewOnce === true ||
        msg.message?.videoMessage?.viewOnce === true
      );
      if (isViewOnce && !fromMe) {
        await handleViewOnce(sock, msg, jid, sender);
      }

      // Mode prive: fromMe passe TOUJOURS, sinon verifier isAdmin
      if (botMode === 'private') {
        if (fromMe) {
          // Le owner envoie depuis son telephone - toujours autorise
        } else if (!isAdmin(sender)) {
          // Repondre uniquement si c'est une commande
          if (text.startsWith(config.prefix)) {
            await sock.sendMessage(jid, {
              text: '⛔ *𝐀𝐃𝐌𝐈𝐍 𝐃𝐔 𝐁𝐎𝐓 𝐔𝐍𝐈𝐐𝐔𝐄𝐌𝐄𝐍𝐓 !*

Le bot est en mode privé.
Seul le owner peut utiliser les commandes.'
            });
          }
          continue;
        }
      }

      // Commande hello - sauvegarder status
      if (text.trim().toLowerCase() === 'hello' && (isAdmin(sender) || fromMe)) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted) {
          const media = quoted.imageMessage || quoted.videoMessage;
          if (media) {
            try {
              const t      = quoted.imageMessage ? 'image' : 'video';
              const stream = await downloadContentFromMessage(media, t);
              const buf    = await toBuffer(stream);
              if (t === 'image') {
                await sock.sendMessage(OWNER_JID, { image: buf, caption: 'Status sauvegarde' });
              } else {
                await sock.sendMessage(OWNER_JID, { video: buf, caption: 'Status sauvegarde' });
              }
              await sock.sendMessage(jid, { text: 'Status sauvegarde et envoye en prive.' });
            } catch(e) {}
          }
        }
        continue;
      }

      // Anti-link
      if (isGroup && antiLink && !fromMe) {
        const isUA = await isGroupAdmin(sock, jid, sender);
        if (!isUA && !isAdmin(sender)) {
          const hasLink = /(https?:\/\/|wa\.me|chat\.whatsapp\.com)/i.test(text);
          if (hasLink) {
            try {
              await sock.sendMessage(jid, { delete: msg.key });
              await sock.sendMessage(jid, {
                text: `@${sender.split('@')[0]} les liens sont interdits!`,
                mentions: [sender]
              });
            } catch(e) {}
          }
        }
      }

      // Auto react
      if (autoReact && text && !fromMe) {
        try {
          const emojis = ['✅','👍','🔥','💯','⚡','🎯','💪','🇹🇩'];
          const emoji  = emojis[Math.floor(Math.random() * emojis.length)];
          await sock.sendMessage(jid, { react: { text: emoji, key: msg.key } });
        } catch(e) {}
      }

      // Commandes
      if (text.startsWith(config.prefix)) {
        await handleCommand(sock, msg, text, jid, sender, isGroup, fromMe);
      }

      // Detection emoji seul → envoie le dernier view once en PRIVE sur le numero de l'envoyeur
      const emojiOnly = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})$/u.test(text.trim());
      if (emojiOnly && !fromMe && savedViewOnce.size > 0) {
        try {
          // Construire le JID prive de l'envoyeur (toujours @s.whatsapp.net)
          const senderPhone   = sender.split(':')[0].split('@')[0];
          const senderPrivJid = senderPhone + '@s.whatsapp.net';

          // Chercher le dernier view once sauvegarde
          const all = [];
          for (const [j, items] of savedViewOnce.entries()) {
            items.forEach(item => all.push({ ...item, fromJid: j }));
          }
          all.sort((a, b) => b.timestamp - a.timestamp);

          if (all.length > 0) {
            const last = all[0];
            // Envoyer en prive au numero de l'utilisateur
            await sendVVMedia(sock, senderPrivJid, last, 1, all.length);
            // Confirmer dans le chat original
            try {
              await sock.sendMessage(jid, { react: { text: '👁️', key: msg.key } });
            } catch(e) {}
          }
        } catch(e) {
          console.error('Erreur emoji vv:', e.message);
        }
      }
    }
  });

  // Anti-delete
  sock.ev.on('messages.delete', async (item) => {
    if (!antiDelete) return;
    for (const key of (item.keys || [])) {
      if (key.fromMe) continue;
      const cached = messageCache.get(key.id);
      if (!cached) continue;
      try {
        await sock.sendMessage(OWNER_JID, {
          text: `*[ANTI-DELETE]*\nDe: ${cached.name}\n${cached.isGroup ? 'Groupe: ' + cached.jid : 'Prive'}\n\n${cached.text || '[Media]'}`
        });
      } catch(e) {}
    }
  });

  // Anti-edit
  sock.ev.on('messages.update', async (updates) => {
    if (!antiEdit) return;
    for (const update of updates) {
      if (!update.update?.editedMessage || update.key.fromMe) continue;
      const cached = messageCache.get(update.key.id);
      if (!cached) continue;
      try {
        await sock.sendMessage(OWNER_JID, {
          text: `*[ANTI-EDIT]*\nDe: ${cached.name}\nOriginal: ${cached.text || '[Media]'}`
        });
      } catch(e) {}
    }
  });

  // Anti-call
  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (call.status === 'offer') {
        try {
          await sock.rejectCall(call.id, call.from);
          await sock.sendMessage(call.from, { text: "Impossible d'appeler ce numero. Envoyez un message." });
        } catch(e) {}
      }
    }
  });

  // Bienvenue / Au revoir desactive
  // sock.ev.on('group-participants.update', ...) - desactive
}

// ============================================================
// COMMANDES
// ============================================================
async function handleCommand(sock, msg, text, jid, sender, isGroup, fromMe) {
  const args    = text.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const p       = config.prefix;
  const isOwner = isAdmin(sender) || fromMe;
  const name    = msg.pushName || sender.split('@')[0];

  // Reaction
  try { await sock.sendMessage(jid, { react: { text: '⚡', key: msg.key } }); } catch(e) {}
  await simulateTyping(sock, jid);

  try {
    switch(command) {

      // ── MENU ──────────────────────────────────────────────
      case 'menu': {
        const ramUsed  = (process.memoryUsage().heapUsed  / 1024 / 1024).toFixed(0);
        const ramTotal = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(0);
        const loadPct  = Math.min(100, Math.round((parseFloat(ramUsed) / parseFloat(ramTotal)) * 100));
        const filled   = Math.round(loadPct / 9);
        const loadBar  = '▓'.repeat(filled) + '░'.repeat(9 - filled);

        // Animation: message arabe -> emoji -> menu
        const arabicMsg = await sock.sendMessage(jid, {
          text: 'وَأَنَّا لَمَسْنَا السَّمَاءَ فَوَجَدْنَاهَا مُلِئَتْ حَرَسًا شَدِيدًا وَشُهُبًا 👽'
        });
        await delay(1200);
        try {
          await sock.sendMessage(jid, { text: '🇷🇴', edit: arabicMsg.key });
        } catch(e) {}
        await delay(800);

        const menuText =
`╭━━━━━━━━━━━━━━━━━━━━━╮
┃   ⌬ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 𝐓𝐃 𝐁𝐎𝐓 ⌬   ┃
╰━━━━━━━━━━━━━━━━━━━━━╯

┌───  📊  𝐒𝐘𝐒𝐓𝐄𝐌  ───┐
│ ᴘʀᴇғɪx : [ ${p} ]
│ ᴜᴘᴛɪᴍᴇ : ${buildUptime()}
│ ʀᴀᴍ    : ${ramUsed}MB / ${ramTotal}MB
│ ʟᴏᴀᴅ   : [${loadBar}] ${loadPct}%
└─────────────────────┘

┌───  🛡️  𝐎𝐖𝐍𝐄𝐑  ───┐
┝  ${p}mode
┝  ${p}antidelete
┝  ${p}antiedit
┝  ${p}antilink
┝  ${p}autoreact
┝  ${p}block
┝  ${p}unblock
└───────────────────┘

┌───  👥  𝐆𝐑𝐎𝐔𝐏  ───┐
┝  ${p}promote
┝  ${p}demote
┝  ${p}kick
┝  ${p}add
┝  ${p}mute
┝  ${p}unmute
┝  ${p}tagall
┝  ${p}hidetag
┝  ${p}invite
┝  ${p}gname
┝  ${p}gdesc
┝  ${p}groupinfo
┝  ${p}leave
└───────────────────┘

┌───  🎨  𝐌𝐄𝐃𝐈𝐀  ───┐
┝  ${p}sticker
┝  ${p}vv
┝  ${p}tostatus
┝  hello
└───────────────────┘

┌───  📂  𝐆𝐄𝐍𝐄𝐑𝐀𝐋  ──┐
┝  ${p}ping
┝  ${p}alive
┝  ${p}info
┝  ${p}repo
└───────────────────┘

*ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐋𝐄 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 𝐃𝐄𝐒 𝐀𝐏𝐏𝐀𝐑𝐄𝐈𝐋𝐒* 🇹🇩`;
        await sendWithImage(sock, jid, menuText, [sender]);
        break;
      }

      // ── PING ──────────────────────────────────────────────
      case 'p':
      case 'ping': {
        const start = Date.now();
        await sock.sendMessage(jid, { text: '⚡ ...' });
        const latency = Date.now() - start;
        const now = new Date();
        const dateStr = now.toLocaleDateString('fr-FR', {
          timeZone: 'Africa/Ndjamena', day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const timeStr = now.toLocaleTimeString('fr-FR', {
          timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit'
        });
        const ramUsed  = (process.memoryUsage().heapUsed  / 1024 / 1024).toFixed(2);
        const ramTotal = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2);
        const loadPct  = Math.min(100, Math.round((parseFloat(ramUsed) / parseFloat(ramTotal)) * 100));
        const filled   = Math.round(loadPct / 10);
        const loadBar  = '▓'.repeat(filled) + '░'.repeat(10 - filled);
        const uptimeSec = Math.floor(process.uptime());
        const uh = Math.floor(uptimeSec / 3600);
        const um = Math.floor((uptimeSec % 3600) / 60);
        const us = uptimeSec % 60;
        const uptimeStr = `${uh}h ${um}m ${us}s`;

        const pingText =
`⌬ 𝐒𝐘𝐒𝐓𝐄𝐌 𝐒𝐓𝐀𝐓𝐒
────────────────────
  🏓 ᴘɪɴɢ   : ${latency}ms ${latency < 100 ? '⚡ Instant' : latency < 500 ? '✅ Fast' : '⚠️ Slow'}
  ⏳ ᴜᴘᴛɪᴍᴇ : ${uptimeStr}
  💾 ʀᴀᴍ    : ${ramUsed}MB (${loadPct}%)
  📍 ʟᴏᴄ    : NDjamena 🇹🇩
  🕒 ᴛɪᴍᴇ   : ${timeStr}
────────────────────`;

        await sock.sendMessage(jid, { text: pingText });
        break;
      }

      // ── ALIVE ─────────────────────────────────────────────
      case 'alive': {
        const now2 = new Date();
        const dateStr2 = now2.toLocaleDateString('fr-FR', {
          timeZone: 'Africa/Ndjamena', day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const timeStr2 = now2.toLocaleTimeString('fr-FR', {
          timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit'
        });
        const ramUsed2  = (process.memoryUsage().heapUsed  / 1024 / 1024).toFixed(0);
        const ramTotal2 = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(1);
        const uptimeSec2 = Math.floor(process.uptime());
        const ud = Math.floor(uptimeSec2 / 86400);
        const uh2 = Math.floor((uptimeSec2 % 86400) / 3600);
        const um2 = Math.floor((uptimeSec2 % 3600) / 60);
        const us2 = uptimeSec2 % 60;
        const upStr2 = ud > 0 ? `${ud}j ${uh2}h ${um2}m ${us2}s`
          : uh2 > 0 ? `${uh2}h ${um2}m ${us2}s`
          : `${um2}m ${us2}s`;

        const aliveText =
`⌈ ⚡  A L I V E  ⌋
┏╋━━━━━━◥◣◆◢◤━━━━━━╋┓
┃
┃  『 🤖 』 S Y S T E M ‣ Active ✅
┃  『 👑 』 D E V ‣ ${DEV_NAME}
┃  『 ⚙️ 』 V E R ‣ v1.0.0
┃  『 🔒 』 M O D E ‣ ${botMode.charAt(0).toUpperCase() + botMode.slice(1)}
┃
┃  『 📍 』 L O C ‣ NDjamena 🇹🇩
┃  『 📅 』 D A T E ‣ ${dateStr2}
┃  『 🕒 』 T I M E ‣ ${timeStr2}
┃
┃  『 💾 』 R A M ‣ ${ramUsed2}MB / ${ramTotal2}MB
┃  『 ⏳ 』 U P ‣ ${upStr2}
┃
┗╋━━━━━━◥◣◆◢◤━━━━━━╋┛
© POWERED BY ${DEV_NAME} 🇹🇩`;

        await sendWithImage(sock, jid, aliveText);
        break;
      }

      // ── INFO ──────────────────────────────────────────────
      case 'info': {
        await sock.sendMessage(jid, {
          text:
`*INFORMATIONS - SEIGNEUR TD*

Bot         : SEIGNEUR TD
Dev         : ${DEV_NAME}
Owner       : +235 91 23 45 68
Prefix      : ${p}
Mode        : ${botMode}
Anti-Delete : ${antiDelete ? 'ON' : 'OFF'}
Anti-Edit   : ${antiEdit   ? 'ON' : 'OFF'}
Anti-Link   : ${antiLink   ? 'ON' : 'OFF'}
Auto-React  : ${autoReact  ? 'ON' : 'OFF'}
Date        : ${getDateTime()}
GitHub      : ${GITHUB}`
        });
        break;
      }

      // ── REPO / GITHUB ─────────────────────────────────────
      case 'repo':
      case 'git':
      case 'github': {
        await sock.sendMessage(jid, {
          text: `*SEIGNEUR TD - GITHUB*\n\n${GITHUB}\n\n*POWERED BY ${DEV_NAME}* 🇹🇩`
        });
        break;
      }

      // ── MODE ──────────────────────────────────────────────
      case 'mode': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        if (args[0] === 'private') {
          botMode = 'private';
          await sock.sendMessage(jid, { text: 'Mode PRIVE active. Seul le owner peut utiliser le bot.' });
        } else if (args[0] === 'public') {
          botMode = 'public';
          await sock.sendMessage(jid, { text: 'Mode PUBLIC active.' });
        } else {
          await sock.sendMessage(jid, { text: `Mode actuel: ${botMode}\nUsage: ${p}mode private / ${p}mode public` });
        }
        break;
      }

      // ── ANTI DELETE ───────────────────────────────────────
      case 'antidelete':
      case 'antidel': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        antiDelete = !antiDelete;
        await sock.sendMessage(jid, { text: `Anti-Delete: ${antiDelete ? 'ACTIVE' : 'DESACTIVE'}` });
        break;
      }

      // ── ANTI EDIT ─────────────────────────────────────────
      case 'antiedit': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        antiEdit = !antiEdit;
        await sock.sendMessage(jid, { text: `Anti-Edit: ${antiEdit ? 'ACTIVE' : 'DESACTIVE'}` });
        break;
      }

      // ── ANTI LINK ─────────────────────────────────────────
      case 'antilink': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        antiLink = !antiLink;
        await sock.sendMessage(jid, { text: `Anti-Link: ${antiLink ? 'ACTIVE' : 'DESACTIVE'}` });
        break;
      }

      // ── AUTO REACT ────────────────────────────────────────
      case 'autoreact': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        autoReact = !autoReact;
        await sock.sendMessage(jid, { text: `Auto-React: ${autoReact ? 'ACTIVE' : 'DESACTIVE'}` });
        break;
      }

      // ── BLOCK ─────────────────────────────────────────────
      case 'block': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        const toBlock = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toBlock) { await sock.sendMessage(jid, { text: `Usage: ${p}block @user` }); break; }
        await sock.updateBlockStatus(toBlock, 'block');
        await sock.sendMessage(jid, { text: `@${toBlock.split('@')[0]} bloque.`, mentions: [toBlock] });
        break;
      }

      // ── UNBLOCK ───────────────────────────────────────────
      case 'unblock': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        const toUnblock = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toUnblock) { await sock.sendMessage(jid, { text: `Usage: ${p}unblock @user` }); break; }
        await sock.updateBlockStatus(toUnblock, 'unblock');
        await sock.sendMessage(jid, { text: `@${toUnblock.split('@')[0]} debloque.`, mentions: [toUnblock] });
        break;
      }

      // ── KICK ──────────────────────────────────────────────
      case 'kick': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUA = await isGroupAdmin(sock, jid, sender);
        if (!isUA && !isOwner) { await sock.sendMessage(jid, { text: 'Admin du groupe uniquement.' }); break; }
        const botAdmin = await isBotGroupAdmin(sock, jid);
        if (!botAdmin) { await sock.sendMessage(jid, { text: 'Je dois etre admin pour expulser.' }); break; }
        const toKick = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toKick) { await sock.sendMessage(jid, { text: `Usage: ${p}kick @user` }); break; }
        try {
          await sock.groupParticipantsUpdate(jid, [toKick], 'remove');
          await sock.sendMessage(jid, { text: `@${toKick.split('@')[0]} expulse.`, mentions: [toKick] });
        } catch(e) { await sock.sendMessage(jid, { text: `Erreur: ${e.message}` }); }
        break;
      }

      // ── ADD ───────────────────────────────────────────────
      case 'add': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUA2 = await isGroupAdmin(sock, jid, sender);
        if (!isUA2 && !isOwner) { await sock.sendMessage(jid, { text: 'Admin du groupe uniquement.' }); break; }
        const botAdmin2 = await isBotGroupAdmin(sock, jid);
        if (!botAdmin2) { await sock.sendMessage(jid, { text: 'Je dois etre admin pour ajouter.' }); break; }
        if (!args[0]) { await sock.sendMessage(jid, { text: `Usage: ${p}add 23591234568` }); break; }
        const numToAdd = args[0].replace(/[^0-9]/g, '');
        if (numToAdd.length < 7) { await sock.sendMessage(jid, { text: 'Numero invalide.' }); break; }
        const jidToAdd = numToAdd + '@s.whatsapp.net';
        try {
          await sock.groupParticipantsUpdate(jid, [jidToAdd], 'add');
          await sock.sendMessage(jid, { text: `@${numToAdd} ajoute.`, mentions: [jidToAdd] });
        } catch(e) {
          await sock.sendMessage(jid, { text: `Impossible d ajouter ce numero.\nVerifiez:\n- Numero correct\n- Confidentialite du contact` });
        }
        break;
      }

      // ── PROMOTE ───────────────────────────────────────────
      case 'promote': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUP = await isGroupAdmin(sock, jid, sender);
        if (!isUP && !isOwner) { await sock.sendMessage(jid, { text: 'Admin du groupe uniquement.' }); break; }
        const botAdminP = await isBotGroupAdmin(sock, jid);
        if (!botAdminP) { await sock.sendMessage(jid, { text: 'Je dois etre admin pour promouvoir.' }); break; }
        const toPro = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toPro) { await sock.sendMessage(jid, { text: `Usage: ${p}promote @user` }); break; }
        try {
          await sock.groupParticipantsUpdate(jid, [toPro], 'promote');
          await sock.sendMessage(jid, { text: `@${toPro.split('@')[0]} est maintenant admin!`, mentions: [toPro] });
        } catch(e) { await sock.sendMessage(jid, { text: `Erreur: ${e.message}` }); }
        break;
      }

      // ── DEMOTE ────────────────────────────────────────────
      case 'demote': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUD = await isGroupAdmin(sock, jid, sender);
        if (!isUD && !isOwner) { await sock.sendMessage(jid, { text: 'Admin du groupe uniquement.' }); break; }
        const botAdminD = await isBotGroupAdmin(sock, jid);
        if (!botAdminD) { await sock.sendMessage(jid, { text: 'Je dois etre admin pour retrograder.' }); break; }
        const toDem = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toDem) { await sock.sendMessage(jid, { text: `Usage: ${p}demote @user` }); break; }
        try {
          await sock.groupParticipantsUpdate(jid, [toDem], 'demote');
          await sock.sendMessage(jid, { text: `@${toDem.split('@')[0]} n est plus admin.`, mentions: [toDem] });
        } catch(e) { await sock.sendMessage(jid, { text: `Erreur: ${e.message}` }); }
        break;
      }

      // ── TAGALL ────────────────────────────────────────────
      case 'tagall':
      case 'hidetag': {
        await handleTagAll(sock, msg, args, jid, isGroup, sender);
        break;
      }

      // ── MUTE ──────────────────────────────────────────────
      case 'mute': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUM = await isGroupAdmin(sock, jid, sender);
        if (!isUM && !isOwner) { await sock.sendMessage(jid, { text: 'Admin du groupe uniquement.' }); break; }
        const botAdminM = await isBotGroupAdmin(sock, jid);
        if (!botAdminM) { await sock.sendMessage(jid, { text: 'Je dois etre admin pour muter.' }); break; }
        try {
          await sock.groupSettingUpdate(jid, 'announcement');
          await sock.sendMessage(jid, { text: 'Groupe mute. Seuls les admins peuvent ecrire.' });
        } catch(e) { await sock.sendMessage(jid, { text: `Erreur: ${e.message}` }); }
        break;
      }

      // ── UNMUTE ────────────────────────────────────────────
      case 'unmute': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUUM = await isGroupAdmin(sock, jid, sender);
        if (!isUUM && !isOwner) { await sock.sendMessage(jid, { text: 'Admin du groupe uniquement.' }); break; }
        const botAdminUM = await isBotGroupAdmin(sock, jid);
        if (!botAdminUM) { await sock.sendMessage(jid, { text: 'Je dois etre admin pour demuter.' }); break; }
        try {
          await sock.groupSettingUpdate(jid, 'not_announcement');
          await sock.sendMessage(jid, { text: 'Groupe ouvert. Tout le monde peut ecrire.' });
        } catch(e) { await sock.sendMessage(jid, { text: `Erreur: ${e.message}` }); }
        break;
      }

      // ── INVITE ────────────────────────────────────────────
      case 'invite':
      case 'lien': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        try {
          const code = await sock.groupInviteCode(jid);
          await sock.sendMessage(jid, { text: `*Lien d invitation:*\nhttps://chat.whatsapp.com/${code}` });
        } catch(e) { await sock.sendMessage(jid, { text: 'Impossible de recuperer le lien. Je dois etre admin.' }); }
        break;
      }

      // ── GNAME ─────────────────────────────────────────────
      case 'gname': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUGN = await isGroupAdmin(sock, jid, sender);
        if (!isUGN && !isOwner) { await sock.sendMessage(jid, { text: 'Admin du groupe uniquement.' }); break; }
        if (!args.length) { await sock.sendMessage(jid, { text: `Usage: ${p}gname Nouveau nom` }); break; }
        try {
          await sock.groupUpdateSubject(jid, args.join(' '));
          await sock.sendMessage(jid, { text: `Nom du groupe change en: *${args.join(' ')}*` });
        } catch(e) { await sock.sendMessage(jid, { text: `Erreur: ${e.message}` }); }
        break;
      }

      // ── GDESC ─────────────────────────────────────────────
      case 'gdesc': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUGD = await isGroupAdmin(sock, jid, sender);
        if (!isUGD && !isOwner) { await sock.sendMessage(jid, { text: 'Admin du groupe uniquement.' }); break; }
        if (!args.length) { await sock.sendMessage(jid, { text: `Usage: ${p}gdesc Nouvelle description` }); break; }
        try {
          await sock.groupUpdateDescription(jid, args.join(' '));
          await sock.sendMessage(jid, { text: 'Description du groupe changee!' });
        } catch(e) { await sock.sendMessage(jid, { text: `Erreur: ${e.message}` }); }
        break;
      }

      // ── GROUPINFO ─────────────────────────────────────────
      case 'groupinfo': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        try {
          const meta   = await sock.groupMetadata(jid);
          const admins = meta.participants.filter(p => p.admin).length;
          const owner  = meta.owner || 'Inconnu';
          const created = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString('fr-FR') : 'Inconnu';
          await sock.sendMessage(jid, {
            text:
`*INFOS GROUPE*

Nom      : ${meta.subject}
Membres  : ${meta.participants.length}
Admins   : ${admins}
Createur : @${owner.split('@')[0]}
Cree le  : ${created}

Description:
${meta.desc || 'Aucune description'}`,
            mentions: [owner]
          });
        } catch(e) { await sock.sendMessage(jid, { text: `Erreur: ${e.message}` }); }
        break;
      }

      // ── LEAVE ─────────────────────────────────────────────
      case 'leave': {
        await handleLeave(sock, jid, isGroup, sender);
        break;
      }

      // ── STICKER ───────────────────────────────────────────
      case 'sticker':
      case 's': {
        try {
          let imageMessage = null;
          let videoMessage = null;

          if (msg.message?.imageMessage) {
            imageMessage = msg.message.imageMessage;
          } else if (msg.message?.videoMessage) {
            videoMessage = msg.message.videoMessage;
          } else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quoted = msg.message.extendedTextMessage.contextInfo.quotedMessage;
            if (quoted.imageMessage) imageMessage = quoted.imageMessage;
            else if (quoted.videoMessage) videoMessage = quoted.videoMessage;
          }

          if (!imageMessage && !videoMessage) {
            await sock.sendMessage(jid, { text: `Envoie une image/video avec ${p}sticker\nOU reponds a une image/video avec ${p}sticker` });
            break;
          }

          const loadMsg = await sock.sendMessage(jid, { text: 'Creation du sticker...' });

          let buffer;
          let isVideo = false;

          if (imageMessage) {
            const stream = await downloadContentFromMessage(imageMessage, 'image');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            buffer = Buffer.concat(chunks);
          } else {
            isVideo = true;
            if (videoMessage.seconds && videoMessage.seconds > 10) {
              await sock.sendMessage(jid, { text: 'Video trop longue! Max 10 secondes.', edit: loadMsg.key });
              break;
            }
            const stream = await downloadContentFromMessage(videoMessage, 'video');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            buffer = Buffer.concat(chunks);
          }

          const maxSize = isVideo ? 500 * 1024 : 1024 * 1024;
          if (buffer.length > maxSize) {
            await sock.sendMessage(jid, { text: `Fichier trop grand! Max: ${isVideo ? '500KB' : '1MB'}`, edit: loadMsg.key });
            break;
          }

          await sock.sendMessage(jid, { sticker: buffer });
          try { await sock.sendMessage(jid, { delete: loadMsg.key }); } catch(e) {}
        } catch(e) {
          await sock.sendMessage(jid, { text: `Erreur sticker: ${e.message}` });
        }
        break;
      }

      // ── VV ────────────────────────────────────────────────
      case 'vv': {
        await handleViewOnceCommand(sock, msg, args, jid, sender);
        break;
      }

      // ── TOSTATUS ──────────────────────────────────────────
      case 'tostatus': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        await handleToStatus(sock, args, msg, jid, sender);
        break;
      }

      // ── DEFAUT ────────────────────────────────────────────
      default:
        await sock.sendMessage(jid, {
          text: `Commande inconnue. Tape *${p}menu* pour voir toutes les commandes.`
        });
        break;
    }
  } catch(e) {
    console.error(`Erreur [${command}]:`, e.message);
    try { await sock.sendMessage(jid, { text: `Erreur lors de l execution: ${e.message}` }); } catch(_) {}
  }
}

// ============================================================
// LANCEMENT
// ============================================================
console.log('');
console.log('  SEIGNEUR TD - LE SEIGNEUR DES APPAREILS');
console.log('');

connectToWhatsApp().catch(err => {
  console.error('Erreur demarrage:', err);
  process.exit(1);
});

process.on('uncaughtException',  err => console.error('Erreur:', err.message));
process.on('unhandledRejection', err => console.error('Rejet:',  err?.message || err));
