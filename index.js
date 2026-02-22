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
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================
// CONFIG
// ============================================================
const config = {
  botName:       'SEIGNEUR TD',
  prefix:        '.',
  sessionFolder: './auth_info_baileys',
  phoneNumber:   '',
  maxViewOnce:   50
};

// ============================================================
// GITHUB
// ============================================================
const GITHUB_REPO   = 'https://github.com/Azountou235/SEIGNEUR-TD-.git';
const GITHUB_BRANCH = 'main';
const GITHUB        = GITHUB_REPO;
const DEV_NAME      = 'LE SEIGNEUR DES APPAREILS';

// ============================================================
// OWNER = uniquement le numéro connecté au bot (détecté auto)
// Pour ajouter un owner manuellement, modifie EXTRA_OWNER_NUM
// ============================================================
const EXTRA_OWNER_NUM = ''; // ex: '23591234568' si tu veux en ajouter un fixe

const sudoAdmins = new Set();

// ============================================================
// ETAT GLOBAL
// ============================================================
let botMode   = 'public';
let autoReact = false;
let antiDelete = false;
let antiEdit   = false;
let antiLink   = false;

const savedViewOnce = new Map();

// Timestamp de démarrage - ignorer tous les messages antérieurs
const BOT_START_TIME = Math.floor(Date.now() / 1000);

// ============================================================
// UTILITAIRES
// ============================================================
function getPhone(jid) {
  if (!jid) return '';
  return jid.split(':')[0].split('@')[0];
}

// Owner = numéro connecté OU EXTRA_OWNER_NUM si défini
function isOwnerJid(jid) {
  if (!jid) return false;
  const phone = getPhone(jid);
  if (global._botJid && phone === getPhone(global._botJid)) return true;
  if (EXTRA_OWNER_NUM && phone === EXTRA_OWNER_NUM) return true;
  return false;
}

function isAdmin(jid) {
  if (!jid) return false;
  if (isOwnerJid(jid)) return true;
  if (sudoAdmins.has(getPhone(jid))) return true;
  return false;
}

async function isGroupAdmin(sock, groupJid, userJid) {
  try {
    if (isOwnerJid(userJid)) return true;
    const meta = await sock.groupMetadata(groupJid);
    const p    = meta.participants.find(x => getPhone(x.id) === getPhone(userJid));
    return p && (p.admin === 'admin' || p.admin === 'superadmin');
  } catch(e) { return false; }
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

function getDateTime() {
  return new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Ndjamena' });
}

async function toBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ============================================================
// BADGE CTX
// ============================================================
const BADGE_CTX = {
  externalAdReply: {
    title: '⚡ SEIGNEUR TD 🇹🇩',
    body: '🔐 Système sous contrôle',
    mediaType: 1,
    previewType: 0,
    showAdAttribution: true,
    sourceUrl: GITHUB,
    thumbnailUrl: 'https://files.catbox.moe/f7k0qe.jpg',
    renderLargerThumbnail: false
  }
};

// Réponse rapide sans delay
async function reply(sock, jid, text, quotedMsg) {
  // En note-to-self (jid = propre numéro) et en PV fromMe:
  // NE PAS utiliser quoted car ça crée des messages invisibles "En attente"
  const botPhone = global._botJid ? getPhone(global._botJid) : '';
  const jidPhone = getPhone(jid);
  const isNoteToSelf = botPhone && jidPhone === botPhone;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Pas de quoted en note-to-self pour éviter messages invisibles
      const opts = (quotedMsg && !isNoteToSelf) ? { quoted: quotedMsg } : {};
      return await sock.sendMessage(jid, { text, contextInfo: BADGE_CTX }, opts);
    } catch(e) {
      if (e.message?.includes('No sessions') && attempt < 2) {
        await delay(3000);
        continue;
      }
      try { return await sock.sendMessage(jid, { text }); } catch(_) {}
      break;
    }
  }
}

async function sendWithImage(sock, jid, text, mentions = [], quotedMsg) {
  try {
    const botPhone = global._botJid ? getPhone(global._botJid) : '';
    const isNoteToSelf = botPhone && getPhone(jid) === botPhone;
    if (fs.existsSync('./menu.jpg')) {
      const opts = (quotedMsg && !isNoteToSelf) ? { quoted: quotedMsg } : {};
      return await sock.sendMessage(jid, {
        image: fs.readFileSync('./menu.jpg'), caption: text, mentions, contextInfo: BADGE_CTX
      }, opts);
    }
  } catch(e) {}
  return await reply(sock, jid, text, quotedMsg);
}

// ============================================================
// AUTO-UPDATE
// ============================================================
async function performUpdate(sock, jid, msg) {
  try {
    await reply(sock, jid, `🔄 *Mise à jour en cours...*`, msg);
    const hasGit = fs.existsSync('./.git');
    let output = '';
    if (hasGit) {
      const { stdout, stderr } = await execAsync(`git fetch origin ${GITHUB_BRANCH} && git reset --hard origin/${GITHUB_BRANCH}`);
      output = stdout || stderr || 'OK';
    } else {
      await execAsync(`git init && git remote add origin ${GITHUB_REPO}`);
      const { stdout, stderr } = await execAsync(`git fetch origin ${GITHUB_BRANCH} && git reset --hard origin/${GITHUB_BRANCH}`);
      output = stdout || stderr || 'OK';
    }
    try { await execAsync('npm install --prefer-offline'); } catch(e) {}
    const lines = output.trim().split('\n').slice(-3).join('\n');
    await reply(sock, jid, `✅ *Mise à jour réussie!*\n\n${lines}\n\n♻️ Redémarrage...`, msg);
    await delay(2000);
    process.exit(0);
  } catch(e) {
    await reply(sock, jid, `❌ *Erreur update:*\n${e.message}`, msg);
  }
}

// ============================================================
// VIEW ONCE - DETECTION
// ============================================================
async function handleViewOnce(sock, message, remoteJid, senderJid) {
  try {
    let mediaData = null, mediaType = '', mimetype = '', isGif = false, isPtt = false;
    const voMsg  = message.message?.viewOnceMessageV2 || message.message?.viewOnceMessageV2Extension;
    const imgMsg = voMsg?.message?.imageMessage  || message.message?.imageMessage;
    const vidMsg = voMsg?.message?.videoMessage  || message.message?.videoMessage;
    const audMsg = voMsg?.message?.audioMessage  || message.message?.audioMessage;

    if (imgMsg) {
      mediaType = 'image'; mimetype = imgMsg.mimetype || 'image/jpeg';
      mediaData = await toBuffer(await downloadContentFromMessage(imgMsg, 'image'));
    } else if (vidMsg) {
      mediaType = 'video'; mimetype = vidMsg.mimetype || 'video/mp4';
      isGif = vidMsg.gifPlayback || false;
      mediaData = await toBuffer(await downloadContentFromMessage(vidMsg, 'video'));
    } else if (audMsg) {
      mediaType = 'audio'; mimetype = audMsg.mimetype || 'audio/ogg';
      isPtt = audMsg.ptt || false;
      mediaData = await toBuffer(await downloadContentFromMessage(audMsg, 'audio'));
    }

    if (mediaData) {
      if (!savedViewOnce.has(senderJid)) savedViewOnce.set(senderJid, []);
      const arr = savedViewOnce.get(senderJid);
      arr.push({ type: mediaType, buffer: mediaData, mimetype, isGif, ptt: isPtt, timestamp: Date.now(), sender: senderJid, size: mediaData.length });
      if (arr.length > config.maxViewOnce) arr.shift();
    }
  } catch(e) { console.error('VOne err:', e.message); }
}

// ============================================================
// VIEW ONCE - ENVOI PV
// ============================================================
async function sendVVMedia(sock, jid, item) {
  try {
    const time    = new Date(item.timestamp).toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
    const from    = getPhone(item.fromJid || item.sender || '');
    const caption = `+${from} · ${time}`;
    if (item.type === 'image') {
      await sock.sendMessage(jid, { image: item.buffer, caption });
    } else if (item.type === 'video') {
      await sock.sendMessage(jid, { video: item.buffer, caption, gifPlayback: item.isGif || false });
    } else if (item.type === 'audio') {
      await sock.sendMessage(jid, { audio: item.buffer, ptt: item.ptt || false, mimetype: item.mimetype });
      await sock.sendMessage(jid, { text: caption });
    }
  } catch(e) { console.error('sendVV err:', e.message); }
}

// ============================================================
// VIEW ONCE - COMMANDE .vv
// ============================================================
async function handleViewOnceCommand(sock, message, args, remoteJid, senderJid) {
  const sub     = args[0]?.toLowerCase();
  const privJid = getPhone(senderJid) + '@s.whatsapp.net';

  if (!sub || sub === 'last') {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted) {
      try {
        let buf = null, mt = '';
        const qVo  = quoted.viewOnceMessageV2 || quoted.viewOnceMessageV2Extension;
        const qImg = qVo?.message?.imageMessage || quoted.imageMessage;
        const qVid = qVo?.message?.videoMessage || quoted.videoMessage;
        if (qImg) { mt = 'image'; buf = await toBuffer(await downloadContentFromMessage(qImg, 'image')); }
        else if (qVid) { mt = 'video'; buf = await toBuffer(await downloadContentFromMessage(qVid, 'video')); }
        if (buf && buf.length > 100) {
          const time = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
          const caption = `+${getPhone(senderJid)} · ${time}`;
          if (mt === 'image') await sock.sendMessage(privJid, { image: buf, caption });
          else await sock.sendMessage(privJid, { video: buf, caption });
          if (privJid !== remoteJid) await sock.sendMessage(remoteJid, { react: { text: '👁️', key: message.key } });
          return;
        }
      } catch(e) {}
    }
    const all = [];
    for (const [j, items] of savedViewOnce.entries()) items.forEach(i => all.push({ ...i, fromJid: j }));
    if (all.length === 0) { await sock.sendMessage(remoteJid, { text: '👁️ Aucun vu unique sauvegardé.' }); return; }
    all.sort((a, b) => b.timestamp - a.timestamp);
    await sendVVMedia(sock, privJid, all[0]);
    if (privJid !== remoteJid) await sock.sendMessage(remoteJid, { react: { text: '👁️', key: message.key } });
    return;
  }

  if (sub === 'list') {
    const all = [];
    for (const [j, items] of savedViewOnce.entries()) items.forEach(i => all.push({ ...i, fromJid: j }));
    all.sort((a, b) => b.timestamp - a.timestamp);
    if (all.length === 0) { await sock.sendMessage(remoteJid, { text: '👁️ Aucun media.' }); return; }
    let txt = `👁️ *VU UNIQUE (${all.length})*\n\n`;
    all.forEach((item, i) => {
      const time = new Date(item.timestamp).toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
      const icon = item.type === 'image' ? '📸' : item.type === 'video' ? '🎥' : '🎵';
      txt += `${i + 1}. ${icon} +${getPhone(item.fromJid || '')} · ${time}\n`;
    });
    txt += `\n${config.prefix}vv get [n]`;
    await sock.sendMessage(remoteJid, { text: txt });
    return;
  }

  if (sub === 'get') {
    const idx = parseInt(args[1]) - 1;
    const all = [];
    for (const [j, items] of savedViewOnce.entries()) items.forEach(i => all.push({ ...i, fromJid: j }));
    all.sort((a, b) => b.timestamp - a.timestamp);
    if (isNaN(idx) || idx < 0 || idx >= all.length) { await sock.sendMessage(remoteJid, { text: `❌ Range: 1-${all.length}` }); return; }
    await sendVVMedia(sock, privJid, all[idx]);
    if (privJid !== remoteJid) await sock.sendMessage(remoteJid, { react: { text: '👁️', key: message.key } });
    return;
  }

  if (sub === 'clear') {
    const total = [...savedViewOnce.values()].reduce((s, a) => s + a.length, 0);
    savedViewOnce.clear();
    await sock.sendMessage(remoteJid, { text: `✅ ${total} médias supprimés.` });
    return;
  }

  const total = [...savedViewOnce.values()].reduce((s, a) => s + a.length, 0);
  await sock.sendMessage(remoteJid, { text: `👁️ *VU UNIQUE (${total})*\n${config.prefix}vv → dernier\n${config.prefix}vv list → liste\n${config.prefix}vv get [n] → récupérer\n${config.prefix}vv clear → supprimer` });
}

// ============================================================
// GROUPE
// ============================================================
async function handleTagAll(sock, message, args, remoteJid, isGroup, senderJid) {
  if (!isGroup) { await sock.sendMessage(remoteJid, { text: '⛔ Groupe uniquement.' }); return; }
  try {
    const meta    = await sock.groupMetadata(remoteJid);
    const members = meta.participants.map(p => p.id);
    const msgText = args.join(' ') || 'Attention tout le monde!';
    const now     = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
    let tagMsg    = `📢 *TAG ALL* — ${meta.subject}\n🕒 ${now}\n\n${msgText}\n\n`;
    members.forEach(jid => { tagMsg += `@${jid.split('@')[0]} `; });
    await sock.sendMessage(remoteJid, { text: tagMsg, mentions: members });
  } catch(e) { await sock.sendMessage(remoteJid, { text: `❌ ${e.message}` }); }
}

async function handleToStatus(sock, args, message, remoteJid, senderJid) {
  try {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const text   = args.join(' ');
    if (!quoted && text) {
      const colors = ['#FF5733','#33FF57','#3357FF','#FF33A8','#FFD700'];
      await sock.sendMessage('status@broadcast', { text, backgroundColor: colors[Math.floor(Math.random() * colors.length)], font: 0, statusJidList: [senderJid] });
      await sock.sendMessage(remoteJid, { text: `✅ Status texte publié!` });
    } else if (quoted?.imageMessage) {
      const buf = await toBuffer(await downloadContentFromMessage(quoted.imageMessage, 'image'));
      await sock.sendMessage('status@broadcast', { image: buf, caption: text || '', statusJidList: [senderJid] });
      await sock.sendMessage(remoteJid, { text: '✅ Status image publié!' });
    } else if (quoted?.videoMessage) {
      const buf = await toBuffer(await downloadContentFromMessage(quoted.videoMessage, 'video'));
      await sock.sendMessage('status@broadcast', { video: buf, caption: text || '', statusJidList: [senderJid] });
      await sock.sendMessage(remoteJid, { text: '✅ Status vidéo publié!' });
    } else {
      await sock.sendMessage(remoteJid, { text: `${config.prefix}tostatus [texte] / rép image / rép vidéo` });
    }
  } catch(e) { await sock.sendMessage(remoteJid, { text: `❌ ${e.message}` }); }
}

// ============================================================
// CONNEXION
// ============================================================
let _isConnecting = false;

async function connectToWhatsApp() {
  if (_isConnecting) return;
  _isConnecting = true;
  const { version }          = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionFolder);

  const sock = makeWASocket({
    version,
    logger:                         pino({ level: 'silent' }),
    printQRInTerminal:              false,
    auth:                           state,
    browser:                        ['Ubuntu', 'Chrome', '20.0.04'],
    generateHighQualityLinkPreview: false,
    syncFullHistory:                false,
    markOnlineOnConnect:            false,
    msgRetryCounterCache:           undefined,
    retryRequestDelayMs:            250,
  });

  if (!sock.authState.creds.registered) {
    if (!config.phoneNumber) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const phone = await new Promise(resolve => {
        rl.question('Entrez votre numero WhatsApp (ex: 23591234568): ', ans => { rl.close(); resolve(ans.trim()); });
      });
      if (phone) config.phoneNumber = phone;
    }
    if (config.phoneNumber) {
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
      _isConnecting = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('❌ Déconnecté (loggedOut). Relance manuelle requise.');
        return;
      }
      console.log('🔄 Reconnexion dans 5s...');
      setTimeout(() => connectToWhatsApp(), 5000);
    } else if (connection === 'open') {
      _isConnecting = false;
      global._botJid = sock.user.id;
      console.log('✅ SEIGNEUR TD connecte! JID:', global._botJid);
      const ownerJid = EXTRA_OWNER_NUM
        ? EXTRA_OWNER_NUM + '@s.whatsapp.net'
        : getPhone(global._botJid) + '@s.whatsapp.net';
      try {
        await sock.sendMessage(ownerJid, {
          text:
`┏━━━━ ⚙️ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 𝐈𝐍𝐈𝐓 ━━━━
┃
┃ ᴘʀᴇғɪx  ⪧ [ ${config.prefix} ]
┃ ᴍᴏᴅᴇ    ⪧ ${botMode === 'public' ? 'ᴘᴜʙʟɪᴄ' : 'ᴘʀɪᴠᴀᴛᴇ'}
┃ sᴛᴀᴛᴜs  ⪧ ᴏɴʟɪɴᴇ
┃ ᴘᴀɴᴇʟ   ⪧ ᴘʀᴇᴍɪᴜᴍ
┃ super_admin  ⪧ +235 91234568
┃
┗━━━━━━━━━━━━━━━━━━━━━━━`,
          contextInfo: BADGE_CTX
        });
      } catch(e) { console.error('Conn msg err:', e.message); }
    }
  });

  // ============================================================
  // HANDLER MESSAGES
  // ============================================================
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    for (const message of messages) {
      if (!message.message) continue;
      const fromMe = message.key.fromMe;
      const txt = message.message?.conversation ||
                  message.message?.extendedTextMessage?.text || '';

      // Log pour debug PV
      if (fromMe && txt.startsWith(config.prefix)) {
        console.log(`[CMD] type=${type} remoteJid=${message.key.remoteJid} txt=${txt}`);
      }

      // Traiter TOUS les types si fromMe + prefix (note-to-self, append, notify)
      if (fromMe && txt.startsWith(config.prefix)) {
        processMessage(sock, message).catch(e => console.error('process err:', e.message));
      } else if (type === 'notify' && !fromMe) {
        // Messages des autres
        processMessage(sock, message).catch(e => console.error('process err:', e.message));
      }
    }
  });

  sock.ev.on('messages.delete', async (item) => {
    if (!antiDelete) return;
    for (const key of (item.keys || [])) {
      if (key.fromMe) continue;
      const ownerJid = EXTRA_OWNER_NUM ? EXTRA_OWNER_NUM + '@s.whatsapp.net' : (global._botJid ? getPhone(global._botJid) + '@s.whatsapp.net' : null);
      if (ownerJid) try { await sock.sendMessage(ownerJid, { text: `🗑️ *ANTI-DELETE* — Message supprimé.` }); } catch(e) {}
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    if (!antiEdit) return;
    for (const update of updates) {
      if (!update.update?.editedMessage || update.key.fromMe) continue;
      const ownerJid = EXTRA_OWNER_NUM ? EXTRA_OWNER_NUM + '@s.whatsapp.net' : (global._botJid ? getPhone(global._botJid) + '@s.whatsapp.net' : null);
      if (ownerJid) try { await sock.sendMessage(ownerJid, { text: `✏️ *ANTI-EDIT* — Message modifié.` }); } catch(e) {}
    }
  });

  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (call.status === 'offer') {
        try {
          await sock.rejectCall(call.id, call.from);
          await sock.sendMessage(call.from, { text: "⛔ Pas d'appel. Envoyez un message." });
        } catch(e) {}
      }
    }
  });
}

// ============================================================
// TRAITEMENT MESSAGE
// ============================================================
async function processMessage(sock, message) {
  if (!message.message) return;
  const remoteJid = message.key.remoteJid;
  if (!remoteJid) return;

  // Ignorer les messages envoyés AVANT le démarrage du bot
  // EXCEPTION 1: commandes fromMe en temps réel passent toujours
  // EXCEPTION 2: note-to-self (chat avec soi-même) passe toujours si fromMe
  const _fromMeEarly = message.key.fromMe;
  const _txtEarly    = message.message?.conversation ||
                       message.message?.extendedTextMessage?.text || '';
  const _isLiveCmd   = _fromMeEarly && _txtEarly.startsWith(config.prefix);
  // Note-to-self: remoteJid = propre numéro (pas de participant)
  const _isNoteToSelf = _fromMeEarly && !remoteJid.endsWith('@g.us');

  if (!_isLiveCmd && !_isNoteToSelf) {
    const _ts = message.messageTimestamp
      ? (typeof message.messageTimestamp === 'object'
          ? message.messageTimestamp.low || Number(message.messageTimestamp)
          : Number(message.messageTimestamp))
      : 0;
    if (_ts && _ts < BOT_START_TIME) return;
  }

  // Status broadcast
  if (remoteJid === 'status@broadcast') {
    try { await sock.readMessages([message.key]); } catch(e) {}
    const isVo = !!(
      message.message?.viewOnceMessageV2 ||
      message.message?.viewOnceMessageV2Extension ||
      message.message?.imageMessage?.viewOnce ||
      message.message?.videoMessage?.viewOnce
    );
    if (isVo) await handleViewOnce(sock, message, remoteJid, message.key.participant || remoteJid);
    return;
  }

  const isGroup = remoteJid.endsWith('@g.us');
  const fromMe  = message.key.fromMe;

  // senderJid — fromMe = toujours le bot (= owner)
  let senderJid;
  if (fromMe) {
    senderJid = global._botJid || (EXTRA_OWNER_NUM ? EXTRA_OWNER_NUM + '@s.whatsapp.net' : '');
  } else if (isGroup) {
    senderJid = message.key.participant || '';
  } else {
    senderJid = remoteJid;
  }

  const messageText = message.message?.conversation ||
                      message.message?.extendedTextMessage?.text ||
                      message.message?.imageMessage?.caption ||
                      message.message?.videoMessage?.caption || '';

  // View Once detection automatique
  const isViewOnce = !!(
    message.message?.viewOnceMessageV2 ||
    message.message?.viewOnceMessageV2Extension ||
    message.message?.imageMessage?.viewOnce ||
    message.message?.videoMessage?.viewOnce
  );
  if (isViewOnce && !fromMe) {
    await handleViewOnce(sock, message, remoteJid, senderJid);
  }

  // Mode privé
  // fromMe = toujours autorisé (c'est le owner qui parle depuis son tel)
  // isAdmin = owner ou sudo = autorisé
  if (botMode === 'private' && !fromMe && !isAdmin(senderJid)) {
    return;
  }

  // Commande hello
  if (messageText.trim().toLowerCase() === 'hello' && (isAdmin(senderJid) || fromMe)) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted) {
      const media = quoted.imageMessage || quoted.videoMessage;
      if (media) {
        try {
          const t   = quoted.imageMessage ? 'image' : 'video';
          const buf = await toBuffer(await downloadContentFromMessage(media, t));
          const dst = global._botJid ? getPhone(global._botJid) + '@s.whatsapp.net' : remoteJid;
          if (t === 'image') await sock.sendMessage(dst, { image: buf, caption: 'Status 📸' });
          else await sock.sendMessage(dst, { video: buf, caption: 'Status 🎥' });
        } catch(e) {}
      }
    }
    return;
  }

  // Anti-link
  if (isGroup && antiLink && !fromMe) {
    const isUA = await isGroupAdmin(sock, remoteJid, senderJid);
    if (!isUA && !isAdmin(senderJid)) {
      if (/(https?:\/\/|wa\.me|chat\.whatsapp\.com)/i.test(messageText)) {
        try {
          await sock.sendMessage(remoteJid, { delete: message.key });
          await sock.sendMessage(remoteJid, { text: `🚫 @${getPhone(senderJid)} liens interdits!`, mentions: [senderJid] });
        } catch(e) {}
        return;
      }
    }
  }

  // Auto react
  if (autoReact && messageText && !fromMe) {
    try {
      const emojis = ['✅','👍','🔥','💯','⚡','🎯','💪','🇹🇩'];
      sock.sendMessage(remoteJid, { react: { text: emojis[Math.floor(Math.random() * emojis.length)], key: message.key } });
    } catch(e) {}
  }

  // VV: réponse à un vu unique → envoyer en privé automatiquement
  // Juste répondre au vu unique suffit, sans commande ni emoji
  const hasReply = !!message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (hasReply && !fromMe && !messageText.startsWith(config.prefix)) {
    (async () => {
      try {
        const quotedMsg  = message.message.extendedTextMessage.contextInfo.quotedMessage;
        const qVo        = quotedMsg.viewOnceMessageV2 || quotedMsg.viewOnceMessageV2Extension;
        const qImg       = qVo?.message?.imageMessage;
        const qVid       = qVo?.message?.videoMessage;
        const qImgDirect = (!qImg && quotedMsg.imageMessage?.viewOnce) ? quotedMsg.imageMessage : null;
        const qVidDirect = (!qVid && quotedMsg.videoMessage?.viewOnce) ? quotedMsg.videoMessage : null;
        const mediaMsg   = qImg || qImgDirect || qVid || qVidDirect;
        if (!mediaMsg) return; // pas un view once
        const mt         = (qImg || qImgDirect) ? 'image' : 'video';
        const buf        = await toBuffer(await downloadContentFromMessage(mediaMsg, mt));
        if (buf.length < 100) return;
        const privJid    = getPhone(senderJid) + '@s.whatsapp.net';
        const time       = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
        const caption    = `👁️ View Once · ${time}\nSEIGNEUR TD 🇹🇩`;
        if (mt === 'image') await sock.sendMessage(privJid, { image: buf, caption });
        else await sock.sendMessage(privJid, { video: buf, caption });
        // Réaction 👁️ pour confirmer
        sock.sendMessage(remoteJid, { react: { text: '👁️', key: message.key } }).catch(() => {});
      } catch(e) { /* silence */ }
    })();
  }

  // Commandes avec prefix
  if (messageText.startsWith(config.prefix)) {
    await handleCommand(sock, message, messageText, remoteJid, senderJid, isGroup, fromMe);
  }
}

// ============================================================
// COMMANDES
// ============================================================
async function handleCommand(sock, msg, text, jid, sender, isGroup, fromMe) {
  const withoutPrefix = text.slice(config.prefix.length).trim();
  const args    = withoutPrefix.split(/ +/);
  const command = args.shift();
  const p       = config.prefix;
  const isOwner = isAdmin(sender) || fromMe;

  // Réaction instantanée (silencieuse si échec)
  try { sock.sendMessage(jid, { react: { text: '⚡', key: msg.key } }).catch(() => {}); } catch(e) {}

  try {
    switch (command.toLowerCase()) {

      // ── MENU ──────────────────────────────────────────────
      case 'menu': {
        const ram    = (process.memoryUsage().heapUsed  / 1024 / 1024).toFixed(0);
        const ramT   = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(0);
        const pct    = Math.min(100, Math.max(0, Math.round((parseFloat(ram) / parseFloat(ramT)) * 100)));
        const filled = Math.min(9, Math.max(0, Math.round(pct / 11)));
        const bar    = '▓'.repeat(filled) + '░'.repeat(9 - filled);
        const menuText =
`╭━━━━━━━━━━━━━━━━━━━━━╮
┃   ⌬ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 𝐓𝐃 𝐁𝐎𝐓 ⌬   ┃
╰━━━━━━━━━━━━━━━━━━━━━╯

┌───  📊  𝐒𝐘𝐒𝐓𝐄𝐌  ───┐
│ ᴘʀᴇғɪx : [ ${p} ]
│ ᴜᴘᴛɪᴍᴇ : ${buildUptime()}
│ ʀᴀᴍ    : ${ram}MB / ${ramT}MB
│ ʟᴏᴀᴅ   : [${bar}] ${pct}%
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
┝  ${p}update
└───────────────────┘

*ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑  𝐓𝐃* 🇹🇩`;
        await sendWithImage(sock, jid, menuText, [sender], msg);
        break;
      }

      // ── PING ──────────────────────────────────────────────
      case 'p':
      case 'ping': {
        const t0      = Date.now();
        await sock.sendMessage(jid, { react: { text: '🏓', key: msg.key } });
        const latency = Date.now() - t0;
        const timeStr = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
        const ram2    = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        const ramT2   = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(1);
        const pct2    = Math.min(100, Math.max(0, Math.round((parseFloat(ram2) / parseFloat(ramT2)) * 100)));
        await reply(sock, jid,
`⌬ 𝐒𝐘𝐒𝐓𝐄𝐌 𝐒𝐓𝐀𝐓𝐒
────────────────────
  🏓 ᴘɪɴɢ   : ${latency}ms
  ⏳ ᴜᴘᴛɪᴍᴇ : ${buildUptime()}
  💾 ʀᴀᴍ    : ${ram2}MB (${pct2}%)
  📍 ʟᴏᴄ    : NDjamena 🇹🇩
  🕒 ᴛɪᴍᴇ   : ${timeStr}
────────────────────`, msg);
        break;
      }

      // ── ALIVE ─────────────────────────────────────────────
      case 'alive': {
        const timeStr = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
        const dateStr = new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Ndjamena', day: '2-digit', month: '2-digit', year: 'numeric' });
        const ram3    = (process.memoryUsage().heapUsed  / 1024 / 1024).toFixed(0);
        const ramT3   = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(0);
        await sendWithImage(sock, jid,
`╭━━━━━━━━━━━━━━━━━━━━━╮
┃   ⚡  A L I V E  ⚡   ┃
╰━━━━━━━━━━━━━━━━━━━━━╯
┃
┃  🤖 𝐒𝐓𝐀𝐓𝐔𝐒  ▸ Active ✅
┃  👑 𝐃𝐄𝐕     ▸ ${DEV_NAME}
┃  🔒 𝐌𝐎𝐃𝐄    ▸ ${botMode.toUpperCase()}
┃
┃  📍 𝐋𝐎𝐂     ▸ NDjamena 🇹🇩
┃  📅 𝐃𝐀𝐓𝐄    ▸ ${dateStr}
┃  🕒 𝐓𝐈𝐌𝐄    ▸ ${timeStr}
┃
┃  💾 𝐑𝐀𝐌     ▸ ${ram3}MB / ${ramT3}MB
┃  ⏳ 𝐔𝐏𝐓𝐈𝐌𝐄  ▸ ${buildUptime()}
┃
┗━━━━━━━━━━━━━━━━━━━━━━━
© ${DEV_NAME} 🇹🇩`, [], msg);
        break;
      }

      // ── INFO ──────────────────────────────────────────────
      case 'info': {
        const connectedNum = global._botJid ? '+' + getPhone(global._botJid) : 'N/A';
        await reply(sock, jid,
`╭─「 ℹ️ *SEIGNEUR TD* 」
│ 🤖 Bot      ▸ SEIGNEUR TD
│ 👑 Dev      ▸ ${DEV_NAME}
│ 📞 Connecté ▸ ${connectedNum}
│ 🔑 Prefix   ▸ ${p}
│ 🔒 Mode     ▸ ${botMode.toUpperCase()}
│ 🗑️ Anti-Del ▸ ${antiDelete ? '✅' : '❌'}
│ ✏️ Anti-Edit▸ ${antiEdit   ? '✅' : '❌'}
│ 🔗 Anti-Lnk ▸ ${antiLink   ? '✅' : '❌'}
│ 💬 AutoReact▸ ${autoReact  ? '✅' : '❌'}
│ 👮 Sudos    ▸ ${sudoAdmins.size}
│ 📅 ${getDateTime()}
╰─ *SEIGNEUR TD* 🇹🇩`, msg);
        break;
      }

      // ── REPO ──────────────────────────────────────────────
      case 'repo':
      case 'git':
      case 'github': {
        await reply(sock, jid, `🔗 *GITHUB*\n\n${GITHUB}\n\n*POWERED BY ${DEV_NAME}* 🇹🇩`, msg);
        break;
      }

      // ── UPDATE ────────────────────────────────────────────
      case 'update': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        await performUpdate(sock, jid, msg);
        break;
      }

      // ── MODE ──────────────────────────────────────────────
      case 'mode': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        if (args[0] === 'private') {
          botMode = 'private';
          await reply(sock, jid, '🔒 *Mode PRIVÉ activé.*', msg);
        } else if (args[0] === 'public') {
          botMode = 'public';
          await reply(sock, jid, '🔓 *Mode PUBLIC activé.*', msg);
        } else {
          await reply(sock, jid, `Mode: *${botMode.toUpperCase()}*\n${p}mode private / public`, msg);
        }
        break;
      }

      // ── ANTIDELETE ────────────────────────────────────────
      case 'antidelete':
      case 'antidel': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        antiDelete = !antiDelete;
        await reply(sock, jid, `🗑️ Anti-Delete: ${antiDelete ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}`, msg);
        break;
      }

      // ── ANTIEDIT ──────────────────────────────────────────
      case 'antiedit': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        antiEdit = !antiEdit;
        await reply(sock, jid, `✏️ Anti-Edit: ${antiEdit ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}`, msg);
        break;
      }

      // ── ANTILINK ──────────────────────────────────────────
      case 'antilink': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        antiLink = !antiLink;
        await reply(sock, jid, `🔗 Anti-Link: ${antiLink ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}`, msg);
        break;
      }

      // ── AUTOREACT ─────────────────────────────────────────
      case 'autoreact': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        autoReact = !autoReact;
        await reply(sock, jid, `💬 Auto-React: ${autoReact ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}`, msg);
        break;
      }

      // ── BLOCK ─────────────────────────────────────────────
      case 'block': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        const toBlock = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toBlock) { await reply(sock, jid, `Usage: ${p}block @user`, msg); break; }
        await sock.updateBlockStatus(toBlock, 'block');
        await reply(sock, jid, `✅ +${toBlock.split('@')[0]} bloqué.`, msg);
        break;
      }

      // ── UNBLOCK ───────────────────────────────────────────
      case 'unblock': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        const toUnblock = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toUnblock) { await reply(sock, jid, `Usage: ${p}unblock @user`, msg); break; }
        await sock.updateBlockStatus(toUnblock, 'unblock');
        await reply(sock, jid, `✅ +${toUnblock.split('@')[0]} débloqué.`, msg);
        break;
      }

      // ── SUDO ──────────────────────────────────────────────
      case 'addsudo':
      case 'sudo': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        let target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target && args[0]) {
          const num = args[0].replace(/[^0-9]/g, '');
          if (num.length >= 7) target = num + '@s.whatsapp.net';
        }
        if (!target) {
          const list = sudoAdmins.size > 0 ? [...sudoAdmins].map(n => `• +${n}`).join('\n') : 'Aucun sudo.';
          await reply(sock, jid, `👮 *SUDO ADMINS*\n\n${list}\n\n${p}sudo @user\n${p}delsudo @user`, msg);
          break;
        }
        const tp = getPhone(target);
        sudoAdmins.add(tp);
        await reply(sock, jid, `✅ +${tp} ajouté comme sudo!`, msg);
        try { await sock.sendMessage(target, { text: `✅ *Tu es maintenant sudo de SEIGNEUR TD!*`, contextInfo: BADGE_CTX }); } catch(e) {}
        break;
      }

      // ── DELSUDO ───────────────────────────────────────────
      case 'delsudo':
      case 'removesudo': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        let target2 = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target2 && args[0]) {
          const num = args[0].replace(/[^0-9]/g, '');
          if (num.length >= 7) target2 = num + '@s.whatsapp.net';
        }
        if (!target2) { await reply(sock, jid, `Usage: ${p}delsudo @user`, msg); break; }
        const tp2 = getPhone(target2);
        sudoAdmins.has(tp2) ? (sudoAdmins.delete(tp2), await reply(sock, jid, `✅ +${tp2} retiré.`, msg)) : await reply(sock, jid, `❌ +${tp2} n'est pas sudo.`, msg);
        break;
      }

      // ── KICK ──────────────────────────────────────────────
      case 'kick': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        const toKick = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toKick) { await reply(sock, jid, `Usage: ${p}kick @user`, msg); break; }
        try { await sock.groupParticipantsUpdate(jid, [toKick], 'remove'); await reply(sock, jid, `✅ @${toKick.split('@')[0]} expulsé.`, msg); }
        catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }

      // ── ADD ───────────────────────────────────────────────
      case 'add': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        if (!args[0]) { await reply(sock, jid, `Usage: ${p}add [numéro]`, msg); break; }
        const num = args[0].replace(/[^0-9]/g, '');
        if (num.length < 7) { await reply(sock, jid, '❌ Numéro invalide.', msg); break; }
        try { await sock.groupParticipantsUpdate(jid, [num + '@s.whatsapp.net'], 'add'); await reply(sock, jid, `✅ +${num} ajouté.`, msg); }
        catch(e) { await reply(sock, jid, `❌ Impossible d'ajouter.`, msg); }
        break;
      }

      // ── PROMOTE ───────────────────────────────────────────
      case 'promote': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        const toPro = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toPro) { await reply(sock, jid, `Usage: ${p}promote @user`, msg); break; }
        try { await sock.groupParticipantsUpdate(jid, [toPro], 'promote'); await reply(sock, jid, `⬆️ @${toPro.split('@')[0]} promu admin!`, msg); }
        catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }

      // ── DEMOTE ────────────────────────────────────────────
      case 'demote': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        const toDem = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toDem) { await reply(sock, jid, `Usage: ${p}demote @user`, msg); break; }
        try { await sock.groupParticipantsUpdate(jid, [toDem], 'demote'); await reply(sock, jid, `⬇️ @${toDem.split('@')[0]} rétrogradé.`, msg); }
        catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }

      // ── TAGALL / HIDETAG ──────────────────────────────────
      case 'tagall':
      case 'hidetag': {
        await handleTagAll(sock, msg, args, jid, isGroup, sender);
        break;
      }

      // ── MUTE ──────────────────────────────────────────────
      case 'mute': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        try { await sock.groupSettingUpdate(jid, 'announcement'); await reply(sock, jid, '🔇 Groupe muté.', msg); }
        catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }

      // ── UNMUTE ────────────────────────────────────────────
      case 'unmute': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        try { await sock.groupSettingUpdate(jid, 'not_announcement'); await reply(sock, jid, '🔊 Groupe ouvert.', msg); }
        catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }

      // ── INVITE ────────────────────────────────────────────
      case 'invite':
      case 'lien': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        try { const code = await sock.groupInviteCode(jid); await reply(sock, jid, `🔗 https://chat.whatsapp.com/${code}`, msg); }
        catch(e) { await reply(sock, jid, '❌ Je dois être admin.', msg); }
        break;
      }

      // ── GNAME ─────────────────────────────────────────────
      case 'gname': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        if (!args.length) { await reply(sock, jid, `Usage: ${p}gname Nom`, msg); break; }
        try { await sock.groupUpdateSubject(jid, args.join(' ')); await reply(sock, jid, `✅ Nom: *${args.join(' ')}*`, msg); }
        catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }

      // ── GDESC ─────────────────────────────────────────────
      case 'gdesc': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        if (!args.length) { await reply(sock, jid, `Usage: ${p}gdesc Description`, msg); break; }
        try { await sock.groupUpdateDescription(jid, args.join(' ')); await reply(sock, jid, '✅ Description changée!', msg); }
        catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }

      // ── GROUPINFO ─────────────────────────────────────────
      case 'groupinfo': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        try {
          const meta   = await sock.groupMetadata(jid);
          const admins = meta.participants.filter(p => p.admin).length;
          const cree   = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString('fr-FR') : '?';
          await reply(sock, jid,
`👥 *${meta.subject}*
├ Membres: ${meta.participants.length}
├ Admins: ${admins}
├ Créateur: @${(meta.owner || '').split('@')[0]}
├ Créé le: ${cree}
╰ ${meta.desc || 'Aucune description'}`, msg);
        } catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }

      // ── LEAVE ─────────────────────────────────────────────
      case 'leave': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        await reply(sock, jid, '👋 Au revoir! 🇹🇩', msg);
        await delay(1000);
        await sock.groupLeave(jid);
        break;
      }

      // ── STICKER ───────────────────────────────────────────
      case 'sticker':
      case 's': {
        try {
          let imageMsg = msg.message?.imageMessage;
          let videoMsg = msg.message?.videoMessage;
          if (!imageMsg && !videoMsg) {
            const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (q?.imageMessage) imageMsg = q.imageMessage;
            else if (q?.videoMessage) videoMsg = q.videoMessage;
          }
          if (!imageMsg && !videoMsg) { await reply(sock, jid, `Envoie image/vidéo avec ${p}sticker`, msg); break; }
          let buf, isVid = false;
          if (imageMsg) {
            buf = await toBuffer(await downloadContentFromMessage(imageMsg, 'image'));
          } else {
            isVid = true;
            if (videoMsg.seconds && videoMsg.seconds > 10) { await reply(sock, jid, '❌ Max 10s.', msg); break; }
            buf = await toBuffer(await downloadContentFromMessage(videoMsg, 'video'));
          }
          if (buf.length > (isVid ? 500 * 1024 : 1024 * 1024)) { await reply(sock, jid, '❌ Fichier trop grand!', msg); break; }
          await sock.sendMessage(jid, { sticker: buf });
        } catch(e) { await reply(sock, jid, `❌ Sticker: ${e.message}`, msg); }
        break;
      }

      // ── VV ────────────────────────────────────────────────
      case 'vv': {
        await handleViewOnceCommand(sock, msg, args, jid, sender);
        break;
      }

      // ── TOSTATUS ──────────────────────────────────────────
      case 'tostatus': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        await handleToStatus(sock, args, msg, jid, sender);
        break;
      }

      // ── DEFAULT ───────────────────────────────────────────
      default: {
        await reply(sock, jid, `❓ *${command}* inconnu. Tape *${p}menu*`, msg);
        break;
      }
    }
  } catch(e) {
    console.error(`Err [${command}]:`, e.message);
    try { await sock.sendMessage(jid, { text: `❌ ${e.message}` }); } catch(_) {}
  }
}

// ============================================================
// AUTO-UPDATE AU DEMARRAGE
// ============================================================
async function autoUpdateOnStart() {
  try {
    if (fs.existsSync('./.git')) {
      console.log('🔄 Vérification mise à jour GitHub...');
      const { stdout } = await execAsync(
        `git fetch origin ${GITHUB_BRANCH} && git reset --hard origin/${GITHUB_BRANCH}`
      );
      const changed = stdout.includes('HEAD') || stdout.includes('index.js');
      if (changed) {
        console.log('✅ Mise à jour appliquée! Redémarrage...');
        try { await execAsync('npm install --prefer-offline'); } catch(e) {}
        process.exit(0); // Pterodactyl relance automatiquement
      } else {
        console.log('✅ Déjà à jour.');
      }
    }
  } catch(e) {
    console.log('⚠️ Auto-update ignoré:', e.message);
  }
}

// ============================================================
// LANCEMENT
// ============================================================
console.log('\n  ⚡ SEIGNEUR TD — LE SEIGNEUR DES APPAREILS 🇹🇩\n');

autoUpdateOnStart().then(() => {
  connectToWhatsApp().catch(err => {
    console.error('Erreur demarrage:', err);
    process.exit(1);
  });
});

process.on('uncaughtException', err => {
  const msg = err.message || '';
  // Erreurs de session = non-fatales, le bot continue
  if (msg.includes('Bad MAC') || msg.includes('decrypt') || msg.includes('No sessions') || msg.includes('session')) {
    console.error('⚠️ Session err (non-fatal):', msg);
    return;
  }
  console.error('❌ uncaught:', msg);
});

process.on('unhandledRejection', err => {
  const msg = err?.message || String(err);
  if (msg.includes('Bad MAC') || msg.includes('decrypt') || msg.includes('No sessions') || msg.includes('session')) {
    console.error('⚠️ Session reject (non-fatal):', msg);
    return;
  }
  console.error('❌ unhandled:', msg);
});
