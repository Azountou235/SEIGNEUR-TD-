import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  delay,
  downloadContentFromMessage,
  jidNormalizedUser
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import axios from 'axios';

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

const GITHUB_REPO   = 'https://github.com/Azountou235/SEIGNEUR-TD-.git';
const GITHUB_BRANCH = 'main';
const GITHUB        = GITHUB_REPO;
const DEV_NAME      = 'LE SEIGNEUR DES APPAREILS';

// SUPER ADMIN fixe — répond toujours même en mode privé
const SUPER_ADMIN = '23591234568';

const sudoAdmins = new Set();

let botMode    = 'public';
let autoReact  = false;
let antiDelete = false;
let antiEdit   = false;
let antiLink   = false;

let antiCallMode      = 'off';
let antiCallWhitelist = new Set();
let antiDeleteDest    = 'pv';

let welcomeGroups = new Set();
let byeGroups     = new Set();
const groupWarnings = {};
const groupRules    = {};

const savedViewOnce = new Map();

// Guard anti-restart : on refuse les messages reçus AVANT que le bot soit prêt
let isReady      = false;
let botStartTime = Date.now();
const BOT_START_TIME = Math.floor(Date.now() / 1000);

// ============================================================
// UTILITAIRES
// ============================================================
function getPhone(jid) {
  if (!jid) return '';
  return jid.split(':')[0].split('@')[0];
}

function normalizeBotJid(rawJid) {
  if (!rawJid) return '';
  try { return jidNormalizedUser(rawJid); } catch(e) {}
  const phone = rawJid.split(':')[0].split('@')[0];
  return phone + '@s.whatsapp.net';
}

function isSuperAdmin(jid) {
  return getPhone(jid) === SUPER_ADMIN;
}

function isOwnerJid(jid) {
  if (!jid) return false;
  const phone = getPhone(jid);
  if (global._botPhone && phone === global._botPhone) return true;
  if (isSuperAdmin(jid)) return true;
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
    const userPhone = getPhone(userJid);
    const p = meta.participants.find(x => getPhone(x.id) === userPhone);
    return p && (p.admin === 'admin' || p.admin === 'superadmin');
  } catch(e) { return false; }
}

function resolveSenderJid(message, isGroup, fromMe) {
  if (fromMe) {
    return global._botJid || (SUPER_ADMIN ? SUPER_ADMIN + '@s.whatsapp.net' : '');
  }
  if (isGroup) return message.key.participant || '';
  return message.key.remoteJid;
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

// Upload vers catbox.moe
async function uploadToCatbox(buf, filename = 'file.jpg', contentType = 'image/jpeg') {
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', buf, { filename, contentType });
  const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
  return await res.text();
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

async function reply(sock, jid, text, quotedMsg) {
  const botPhone  = global._botPhone || '';
  const jidPhone  = getPhone(jid);
  const isNoteToSelf = botPhone && jidPhone === botPhone;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const opts = (quotedMsg && !isNoteToSelf) ? { quoted: quotedMsg } : {};
      return await sock.sendMessage(jid, { text, contextInfo: BADGE_CTX }, opts);
    } catch(e) {
      if (e.message?.includes('No sessions') && attempt < 2) { await delay(3000); continue; }
      try { return await sock.sendMessage(jid, { text }); } catch(_) {}
      break;
    }
  }
}

async function sendWithImage(sock, jid, text, mentions = [], quotedMsg) {
  try {
    const botPhone = global._botPhone || '';
    const isNoteToSelf = botPhone && getPhone(jid) === botPhone;
    if (fs.existsSync('./menu.jpg')) {
      const opts = (quotedMsg && !isNoteToSelf) ? { quoted: quotedMsg } : {};
      return await sock.sendMessage(jid, { image: fs.readFileSync('./menu.jpg'), caption: text, mentions, contextInfo: BADGE_CTX }, opts);
    }
  } catch(e) {}
  return await reply(sock, jid, text, quotedMsg);
}

// ============================================================
// AUTO-UPDATE
// ============================================================
async function performUpdate(sock, jid, msg) {
  try {
    await reply(sock, jid, '🔄 *Mise à jour en cours...*', msg);
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
// VIEW ONCE
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

// .🙏 → envoie en PV silencieusement
// .vv2 → ouvre directement dans le chat
async function handleViewOnceCommand(sock, message, args, remoteJid, senderJid, sendToChat) {
  const sub     = args[0]?.toLowerCase();
  const privJid = getPhone(senderJid) + '@s.whatsapp.net';
  const destJid = sendToChat ? remoteJid : privJid;

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
          if (mt === 'image') await sock.sendMessage(destJid, { image: buf, caption });
          else await sock.sendMessage(destJid, { video: buf, caption });
          if (!sendToChat && destJid !== remoteJid) await sock.sendMessage(remoteJid, { react: { text: '👁️', key: message.key } });
          return;
        }
      } catch(e) {}
    }
    const all = [];
    for (const [j, items] of savedViewOnce.entries()) items.forEach(i => all.push({ ...i, fromJid: j }));
    if (all.length === 0) { await sock.sendMessage(remoteJid, { text: '👁️ Aucun vu unique sauvegardé.' }); return; }
    all.sort((a, b) => b.timestamp - a.timestamp);
    await sendVVMedia(sock, destJid, all[0]);
    if (!sendToChat && destJid !== remoteJid) await sock.sendMessage(remoteJid, { react: { text: '👁️', key: message.key } });
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
    txt += `\n${config.prefix}🙏 get [n]`;
    await sock.sendMessage(remoteJid, { text: txt });
    return;
  }

  if (sub === 'get') {
    const idx = parseInt(args[1]) - 1;
    const all = [];
    for (const [j, items] of savedViewOnce.entries()) items.forEach(i => all.push({ ...i, fromJid: j }));
    all.sort((a, b) => b.timestamp - a.timestamp);
    if (isNaN(idx) || idx < 0 || idx >= all.length) { await sock.sendMessage(remoteJid, { text: `❌ Range: 1-${all.length}` }); return; }
    await sendVVMedia(sock, destJid, all[idx]);
    if (!sendToChat && destJid !== remoteJid) await sock.sendMessage(remoteJid, { react: { text: '👁️', key: message.key } });
    return;
  }

  if (sub === 'clear') {
    const total = [...savedViewOnce.values()].reduce((s, a) => s + a.length, 0);
    savedViewOnce.clear();
    await sock.sendMessage(remoteJid, { text: `✅ ${total} médias supprimés.` });
    return;
  }

  const total = [...savedViewOnce.values()].reduce((s, a) => s + a.length, 0);
  await sock.sendMessage(remoteJid, { text: `👁️ *VU UNIQUE (${total})*\n${config.prefix}🙏 → dernier en PV\n${config.prefix}vv2 → ouvrir dans le chat\n${config.prefix}🙏 list → liste\n${config.prefix}🙏 get [n] → récupérer\n${config.prefix}🙏 clear → supprimer` });
}

// ============================================================
// GROUPE — TAG ALL
// ============================================================
async function handleTagAll(sock, message, args, remoteJid, isGroup, senderJid) {
  if (!isGroup) { await sock.sendMessage(remoteJid, { text: '⛔ Groupe uniquement.' }); return; }
  try {
    const meta    = await sock.groupMetadata(remoteJid);
    const members = meta.participants.map(p => p.id);
    const msgText = args.join(' ') || 'Attention tout le monde!';
    const now     = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
    // Mention invisible — texte affiché sans numéros
    let tagMsg = `📢 *${msgText}*\n🕒 ${now}\n\n`;
    members.forEach(jid => { tagMsg += `\u200e@${jid.split('@')[0]} `; });
    await sock.sendMessage(remoteJid, { text: tagMsg, mentions: members });
  } catch(e) { await sock.sendMessage(remoteJid, { text: `❌ ${e.message}` }); }
}

// ============================================================
// HELPER — téléchargement API siputzx
// ============================================================
async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  return res.json();
}

async function dlSiputzx(endpoint, urlParam) {
  const res = await fetchJson(`https://api.siputzx.my.id/api/d/${endpoint}?url=${encodeURIComponent(urlParam)}`);
  return res;
}

async function sendMediaFromUrls(sock, jid, urls, caption, quotedMsg) {
  const uniqueUrls = [...new Set(urls)];
  for (const mediaUrl of uniqueUrls) {
    try {
      const headRes  = await axios.head(mediaUrl);
      const mimeType = headRes.headers['content-type'] || '';
      if (/image\//.test(mimeType)) {
        await sock.sendMessage(jid, { image: { url: mediaUrl }, caption }, { quoted: quotedMsg });
      } else if (/video\//.test(mimeType) || mimeType === 'application/octet-stream') {
        await sock.sendMessage(jid, { video: { url: mediaUrl }, caption }, { quoted: quotedMsg });
      } else {
        await sock.sendMessage(jid, { document: { url: mediaUrl }, fileName: 'fichier', mimetype: mimeType }, { quoted: quotedMsg });
      }
    } catch(e) {
      await sock.sendMessage(jid, { video: { url: mediaUrl }, caption }, { quoted: quotedMsg });
    }
  }
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
      global._botJid   = normalizeBotJid(sock.user.id);
      global._botPhone = getPhone(global._botJid);

      isReady = false;
      botStartTime = Date.now();
      setTimeout(() => { isReady = true; console.log('✅ Bot prêt à recevoir les commandes.'); }, 5000);

      console.log('✅ SEIGNEUR TD connecté! JID:', global._botJid, '| Phone:', global._botPhone);

      const ownerJid = SUPER_ADMIN ? SUPER_ADMIN + '@s.whatsapp.net' : global._botJid;
      try {
        await sock.sendMessage(ownerJid, {
          text: `┏━━━━ ⚙️ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 𝐈𝐍𝐈𝐓 ━━━━\n┃\n┃ ᴘʀᴇғɪx  ⪧ [ ${config.prefix} ]\n┃ ᴍᴏᴅᴇ    ⪧ ${botMode === 'public' ? 'ᴘᴜʙʟɪᴄ' : 'ᴘʀɪᴠᴀᴛᴇ'}\n┃ sᴛᴀᴛᴜs  ⪧ ᴏɴʟɪɴᴇ\n┃ ɴᴜᴍᴇʀᴏ  ⪧ +${global._botPhone}\n┃\n┗━━━━━━━━━━━━━━━━━━━━━━━`,
          contextInfo: BADGE_CTX
        });
      } catch(e) { console.error('Conn msg err:', e.message); }
    }
  });

  // ============================================================
  // HANDLER MESSAGES — mode public = tout le monde
  // ============================================================
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const message of messages) {
      if (!message.message) continue;
      if (Object.keys(message.message)[0] === 'ephemeralMessage') {
        message.message = message.message.ephemeralMessage.message;
      }
      if (message.key?.remoteJid === 'status@broadcast') {
        processMessage(sock, message).catch(() => {});
        continue;
      }
      const fromMe = message.key.fromMe;

      // En mode public → traiter TOUS les messages (notify + fromMe)
      // En mode privé → seulement fromMe et super admin et admins
      if (fromMe) {
        processMessage(sock, message).catch(e => console.error('fromMe err:', e.message));
      } else if (type === 'notify') {
        // Mode public = tout le monde, mode privé = filtré dans processMessage
        processMessage(sock, message).catch(e => console.error('notify err:', e.message));
      }
    }
  });

  // Welcome/Bye groupes
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      if (action === 'add' && welcomeGroups.has(id)) {
        const meta = await sock.groupMetadata(id);
        for (const p of participants) {
          const phone = getPhone(p);
          await sock.sendMessage(id, {
            text: `╭━━━━━━━━━━━━━━━━━━╮\n┃   👋 𝐁𝐈𝐄𝐍𝐕𝐄𝐍𝐔𝐄   ┃\n╰━━━━━━━━━━━━━━━━━━╯\n┃\n┃ @${phone} est arrivé(e) !\n┃ Bienvenue dans *${meta.subject}* 🎉\n┃\n┃ Membres: ${meta.participants.length}\n┗━━━━━━━━━━━━━━━━━━━━`,
            mentions: [p]
          });
        }
      } else if (action === 'remove' && byeGroups.has(id)) {
        for (const p of participants) {
          const phone = getPhone(p);
          await sock.sendMessage(id, { text: `👋 *Au revoir* @${phone}! Bonne continuation 🇹🇩`, mentions: [p] });
        }
      }
    } catch(e) { console.error('group-update err:', e.message); }
  });

  // Cache anti-delete
  const msgCache = new Map();
  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue;
      msgCache.set(m.key.id, { key: m.key, message: m.message, pushName: m.pushName || '' });
      if (msgCache.size > 200) { const firstKey = msgCache.keys().next().value; msgCache.delete(firstKey); }
    }
  });

  sock.ev.on('messages.delete', async (item) => {
    if (!antiDelete) return;
    const destJid = SUPER_ADMIN ? SUPER_ADMIN + '@s.whatsapp.net' : global._botJid;
    if (!destJid) return;
    for (const key of (item.keys || [])) {
      if (key.fromMe) continue;
      const cached = msgCache.get(key.id);
      const who = key.remoteJid?.split('@')[0] || '?';
      const group = key.remoteJid?.endsWith('@g.us') ? `\n👥 Groupe: ${key.remoteJid}` : '';
      if (cached?.message?.conversation || cached?.message?.extendedTextMessage?.text) {
        const txt = cached.message.conversation || cached.message.extendedTextMessage.text;
        try { await sock.sendMessage(destJid, { text: `🗑️ *ANTI-DELETE*\n\n👤 De: +${who}${group}\n💬 Message: ${txt}` }); } catch(e) {}
      } else if (cached?.message) {
        try {
          await sock.sendMessage(destJid, { text: `🗑️ *ANTI-DELETE* — +${who} a supprimé un média${group}` });
          await sock.sendMessage(destJid, cached.message, {});
        } catch(e) {}
      } else {
        try { await sock.sendMessage(destJid, { text: `🗑️ *ANTI-DELETE* — +${who} a supprimé un message${group}` }); } catch(e) {}
      }
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    if (!antiEdit) return;
    const destJid = SUPER_ADMIN ? SUPER_ADMIN + '@s.whatsapp.net' : global._botJid;
    if (!destJid) return;
    for (const update of updates) {
      if (update.key.fromMe) continue;
      const edited = update.update?.editedMessage?.message?.protocolMessage?.editedMessage || update.update?.editedMessage;
      if (!edited) continue;
      const who = update.key.remoteJid?.split('@')[0] || '?';
      const newTxt = edited?.conversation || edited?.extendedTextMessage?.text || '(média)';
      const cached = msgCache.get(update.key.id);
      const oldTxt = cached?.message?.conversation || cached?.message?.extendedTextMessage?.text || '(non enregistré)';
      try { await sock.sendMessage(destJid, { text: `✏️ *ANTI-EDIT*\n\n👤 De: +${who}\n📝 Avant: ${oldTxt}\n✏️ Après: ${newTxt}` }); } catch(e) {}
    }
  });

  // Anti-call
  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (call.status !== 'offer') continue;
      const callerNum = call.from.split('@')[0].split(':')[0];
      try {
        if (antiCallMode === 'off') continue;
        if (antiCallMode === 'whitelist' && antiCallWhitelist.has(callerNum)) continue;
        await sock.rejectCall(call.id, call.from);
        await sock.sendMessage(call.from, {
          text: 'LE NUMÉRO NE PEUT PAS RECEVOIR DES APPELS POUR LE MOMENT VEILLEZ RAPPELER PLUS TARD SVP'
        });
      } catch(e) {}
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

  // Guard anti-commandes post-restart : ignorer pendant 5s SAUF super admin
  if (!isReady && !message.key.fromMe) {
    if (!isSuperAdmin(message.key.participant || message.key.remoteJid)) return;
  }

  const _fromMeEarly = message.key.fromMe;
  const _txtEarly    = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
  const _isLiveCmd   = _fromMeEarly && _txtEarly.startsWith(config.prefix);
  const _isNoteToSelf = _fromMeEarly && !remoteJid.endsWith('@g.us');

  if (!_isLiveCmd && !_isNoteToSelf) {
    const _ts = message.messageTimestamp
      ? (typeof message.messageTimestamp === 'object' ? message.messageTimestamp.low || Number(message.messageTimestamp) : Number(message.messageTimestamp))
      : 0;
    if (_ts && _ts < BOT_START_TIME) return;
  }

  if (remoteJid === 'status@broadcast') {
    try { await sock.readMessages([message.key]); } catch(e) {}
    const isVo = !!(message.message?.viewOnceMessageV2 || message.message?.viewOnceMessageV2Extension);
    if (isVo) await handleViewOnce(sock, message, remoteJid, message.key.participant || remoteJid);
    return;
  }

  const isGroup = remoteJid.endsWith('@g.us');
  const fromMe  = message.key.fromMe;
  const senderJid = resolveSenderJid(message, isGroup, fromMe);
  const senderPhone = getPhone(senderJid);

  const messageText = message.message?.conversation ||
                      message.message?.extendedTextMessage?.text ||
                      message.message?.imageMessage?.caption ||
                      message.message?.videoMessage?.caption || '';

  // View Once auto-save
  const isViewOnce = !!(message.message?.viewOnceMessageV2 || message.message?.viewOnceMessageV2Extension);
  if (isViewOnce && !fromMe) { await handleViewOnce(sock, message, remoteJid, senderJid); }

  // Mode privé — super admin passe toujours
  if (botMode === 'private' && !fromMe && !isAdmin(senderJid) && !isSuperAdmin(senderJid)) return;

  // Anti-link
  if (isGroup && antiLink && !fromMe) {
    const isUA = await isGroupAdmin(sock, remoteJid, senderJid);
    if (!isUA && !isAdmin(senderJid)) {
      if (/(https?:\/\/|wa\.me|chat\.whatsapp\.com)/i.test(messageText)) {
        try {
          await sock.sendMessage(remoteJid, { delete: message.key });
          await sock.sendMessage(remoteJid, { text: `🚫 @${senderPhone} liens interdits!`, mentions: [senderJid] });
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

  // VV auto sur réponse à vue unique
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
        if (!mediaMsg) return;
        const mt  = (qImg || qImgDirect) ? 'image' : 'video';
        const buf = await toBuffer(await downloadContentFromMessage(mediaMsg, mt));
        if (buf.length < 100) return;
        const privJid = getPhone(senderJid) + '@s.whatsapp.net';
        const time    = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
        const caption = `👁️ View Once · ${time}\nSEIGNEUR TD 🇹🇩`;
        if (mt === 'image') await sock.sendMessage(privJid, { image: buf, caption });
        else await sock.sendMessage(privJid, { video: buf, caption });
        sock.sendMessage(remoteJid, { react: { text: '👁️', key: message.key } }).catch(() => {});
      } catch(e) {}
    })();
  }

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
  const command = args.shift().toLowerCase();
  const p       = config.prefix;
  const isOwner = isAdmin(sender) || fromMe || isSuperAdmin(sender);

  try { sock.sendMessage(jid, { react: { text: '⚡', key: msg.key } }).catch(() => {}); } catch(e) {}

  try {
    switch (command) {

      // ── MENU ─────────────────────────────────────────────
      case 'menu': {
        const ram  = (process.memoryUsage().heapUsed  / 1024 / 1024).toFixed(0);
        const ramT = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(0);
        const pct  = Math.min(100, Math.max(0, Math.round((parseFloat(ram) / parseFloat(ramT)) * 100)));
        const bar  = '▓'.repeat(Math.round(pct/11)) + '░'.repeat(9 - Math.round(pct/11));
        const menuText = `╭━━━━━━━━━━━━━━━━━━━━━╮\n┃   ⌬ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 𝐓𝐃 𝐁𝐎𝐓 ⌬   ┃\n╰━━━━━━━━━━━━━━━━━━━━━╯\n\n┌───  📊  𝐒𝐘𝐒𝐓𝐄𝐌  ───┐\n│ ᴘʀᴇғɪx : [ ${p} ]\n│ ᴜᴘᴛɪᴍᴇ : ${buildUptime()}\n│ ʀᴀᴍ    : ${ram}MB / ${ramT}MB\n│ ʟᴏᴀᴅ   : [${bar}] ${pct}%\n└─────────────────────┘\n\n┌───  🛡️  𝐎𝐖𝐍𝐄𝐑  ───┐\n│ ${p}mode public/private\n│ ${p}antidelete private on/off\n│ ${p}antiedit private on/off\n│ ${p}antilink on/off\n│ ${p}anticall all on/off\n│ ${p}anticall +[numéro]\n│ ${p}autoreact\n│ ${p}block / ${p}unblock\n│ ${p}sudo / ${p}delsudo\n│ ${p}restart / ${p}update\n└───────────────────┘\n\n┌───  👥  𝐆𝐑𝐎𝐔𝐏𝐄  ───┐\n│ ${p}promote / ${p}demote\n│ ${p}kick / ${p}add\n│ ${p}mute / ${p}unmute\n│ ${p}tagall / ${p}hidetag\n│ ${p}invite / ${p}revoke\n│ ${p}gname / ${p}gdesc\n│ ${p}setppgc\n│ ${p}groupinfo / ${p}listadmin\n│ ${p}rules / ${p}setrules\n│ ${p}welcome / ${p}bye\n│ ${p}warn / ${p}resetwarn\n│ ${p}tosgroup\n│ ${p}leave\n└───────────────────┘\n\n┌───  📥  𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃  ─┐\n│ ${p}tt  • ${p}ig  • ${p}fb\n│ ${p}pin • ${p}sv  • ${p}cc\n│ ${p}ytmp3 • ${p}ytmp4 • ${p}yts\n│ ${p}gdrive • ${p}mediafire\n└───────────────────┘\n\n┌───  🤖  𝐈𝐀 / 𝐀𝐈  ───┐\n│ ${p}ai [question]\n│ ${p}ocr (reply image)\n│ ${p}toanime (reply photo)\n│ ${p}faceblur (reply photo)\n│ ${p}removebg (reply photo)\n│ ${p}hd / ${p}tohd (reply photo)\n│ ${p}ssweb [url]\n│ ${p}brat [texte]\n│ ${p}dictionnaire [mot]\n└───────────────────┘\n\n┌───  🔧  𝐎𝐔𝐓𝐈𝐋𝐒  ───┐\n│ ${p}sticker / ${p}toimg\n│ ${p}tourl (reply média)\n│ ${p}toaudio (reply vidéo)\n│ ${p}tovn (reply vidéo→vocal)\n│ ${p}getpp [@user]\n│ ${p}🙏 (vu unique → PV)\n│ ${p}vv2 (vu unique → chat)\n│ ${p}tostatus\n└───────────────────┘\n\n┌───  🎵  𝐂𝐎𝐍𝐕𝐄𝐑𝐒𝐈𝐎𝐍 ─┐\n│ ${p}bass • ${p}blown • ${p}deep\n│ ${p}earrape • ${p}fast • ${p}fat\n│ ${p}nightcore • ${p}reverse\n│ ${p}robot • ${p}slow\n│ ${p}smooth • ${p}tupai\n└───────────────────┘\n\n┌───  🕌  𝐂𝐎𝐑𝐀𝐍  ────┐\n│ ${p}surah [1-114]\n│ ${p}99nomdallah\n└───────────────────┘\n\n┌───  🔍  𝐑𝐄𝐂𝐇𝐄𝐑𝐂𝐇𝐄  ─┐\n│ ${p}yts [titre YouTube]\n│ ${p}google [recherche]\n│ ${p}playstore [app]\n└───────────────────┘\n\n*ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 𝐓𝐃* 🇹🇩`;
        await sendWithImage(sock, jid, menuText, [sender], msg);
        break;
      }

      // ── PING ─────────────────────────────────────────────
      case 'p':
      case 'ping': {
        const t0      = Date.now();
        await sock.sendMessage(jid, { react: { text: '🏓', key: msg.key } });
        const latency = Date.now() - t0;
        const timeStr = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
        const ram2    = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        const ramT2   = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(1);
        const pct2    = Math.min(100, Math.max(0, Math.round((parseFloat(ram2) / parseFloat(ramT2)) * 100)));
        await reply(sock, jid, `⌬ 𝐒𝐘𝐒𝐓𝐄𝐌 𝐒𝐓𝐀𝐓𝐒\n────────────────────\n  🏓 ᴘɪɴɢ   : ${latency}ms\n  ⏳ ᴜᴘᴛɪᴍᴇ : ${buildUptime()}\n  💾 ʀᴀᴍ    : ${ram2}MB (${pct2}%)\n  📍 ʟᴏᴄ    : NDjamena 🇹🇩\n  🕒 ᴛɪᴍᴇ   : ${timeStr}\n────────────────────`, msg);
        break;
      }

      // ── ALIVE ─────────────────────────────────────────────
      case 'alive': {
        const timeStr = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
        const dateStr = new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Ndjamena', day: '2-digit', month: '2-digit', year: 'numeric' });
        const ram3    = (process.memoryUsage().heapUsed  / 1024 / 1024).toFixed(0);
        const ramT3   = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(0);
        await sendWithImage(sock, jid, `╭━━━━━━━━━━━━━━━━━━━━━╮\n┃   ⚡  A L I V E  ⚡   ┃\n╰━━━━━━━━━━━━━━━━━━━━━╯\n┃\n┃  🤖 𝐒𝐓𝐀𝐓𝐔𝐒  ▸ Active ✅\n┃  👑 𝐃𝐄𝐕     ▸ ${DEV_NAME}\n┃  🔒 𝐌𝐎𝐃𝐄    ▸ ${botMode.toUpperCase()}\n┃\n┃  📍 𝐋𝐎𝐂     ▸ NDjamena 🇹🇩\n┃  📅 𝐃𝐀𝐓𝐄    ▸ ${dateStr}\n┃  🕒 𝐓𝐈𝐌𝐄    ▸ ${timeStr}\n┃\n┃  💾 𝐑𝐀𝐌     ▸ ${ram3}MB / ${ramT3}MB\n┃  ⏳ 𝐔𝐏𝐓𝐈𝐌𝐄  ▸ ${buildUptime()}\n┃\n┗━━━━━━━━━━━━━━━━━━━━━━━\n© ${DEV_NAME} 🇹🇩`, [], msg);
        break;
      }

      // ── STATUSBOT ─────────────────────────────────────────
      case 'statusbot': {
        const connectedNum = global._botPhone ? '+' + global._botPhone : 'N/A';
        await reply(sock, jid, `╭─「 ℹ️ *SEIGNEUR TD* 」\n│ 🤖 Bot      ▸ SEIGNEUR TD\n│ 👑 Dev      ▸ ${DEV_NAME}\n│ 📞 Connecté ▸ ${connectedNum}\n│ 🔑 Prefix   ▸ ${p}\n│ 🔒 Mode     ▸ ${botMode.toUpperCase()}\n│ 🗑️ Anti-Del ▸ ${antiDelete ? '✅' : '❌'}\n│ ✏️ Anti-Edit▸ ${antiEdit   ? '✅' : '❌'}\n│ 🔗 Anti-Lnk ▸ ${antiLink   ? '✅' : '❌'}\n│ 💬 AutoReact▸ ${autoReact  ? '✅' : '❌'}\n│ 👮 Sudos    ▸ ${sudoAdmins.size}\n│ 📅 ${getDateTime()}\n╰─ *SEIGNEUR TD* 🇹🇩`, msg);
        break;
      }

      // ── ADMIN ─────────────────────────────────────────────
      case 'admin': {
        await reply(sock, jid, `╔══════════════════════╗\n║  👑 *SEIGNEUR TD BOT* 🇹🇩  ║\n╚══════════════════════╝\n\n👤 *Super Admin*\n│ 👑 Numéro : *+${SUPER_ADMIN}*\n\n🤖 *Infos du bot*\n│ 🔑 Préfixe : *${p}*\n│ 🔒 Mode    : *${botMode.toUpperCase()}*\n│ 📞 Numéro  : *+${global._botPhone || '?'}*\n│ ⏳ Uptime  : *${buildUptime()}*`, msg);
        break;
      }

      // ── REPO ──────────────────────────────────────────────
      case 'repo':
      case 'git':
      case 'github': {
        await reply(sock, jid, `🔗 *GITHUB*\n\n${GITHUB}\n\n*POWERED BY ${DEV_NAME}* 🇹🇩`, msg);
        break;
      }

      // ── AIDE ──────────────────────────────────────────────
      case 'aide':
      case 'help': {
        await reply(sock, jid, `╔══════════════════════╗\n║   🤖 *SEIGNEUR TD BOT* 🇹🇩   ║\n╚══════════════════════╝\n\n📌 *INFORMATIONS*\n│ 👑 Super Admin: *+${SUPER_ADMIN}*\n│ 🌐 Mode: *${botMode}*\n│ ⚡ Préfixe: *${p}*\n\n📋 *COMMANDES ESSENTIELLES*\n│ ${p}menu → Tous les menus\n│ ${p}ping → Test vitesse\n│ ${p}alive → Bot en ligne?\n\n🛡️ *PROTECTIONS*\n│ ${p}antidelete private on/off\n│ ${p}antilink on/off\n│ ${p}anticall all on/off`, msg);
        break;
      }

      // ── UPDATE ────────────────────────────────────────────
      case 'update': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        await performUpdate(sock, jid, msg);
        break;
      }

      // ── RESTART ───────────────────────────────────────────
      case 'restart': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        await reply(sock, jid, '🔄 *REDÉMARRAGE...* 🇹🇩', msg);
        setTimeout(() => process.exit(0), 2000);
        break;
      }

      // ── MODE ──────────────────────────────────────────────
      case 'mode': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        if (args[0] === 'private') { botMode = 'private'; await reply(sock, jid, '🔒 *Mode PRIVÉ activé.*', msg); }
        else if (args[0] === 'public') { botMode = 'public'; await reply(sock, jid, '🔓 *Mode PUBLIC activé.*', msg); }
        else { await reply(sock, jid, `Mode: *${botMode.toUpperCase()}*\n${p}mode private / public`, msg); }
        break;
      }

      // ── ANTIDELETE ────────────────────────────────────────
      case 'antidelete':
      case 'antidel': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        if (args[0] === 'private' && args[1] === 'on') { antiDelete = true; await reply(sock, jid, '🗑️ *Anti-Delete ACTIVÉ* ✅', msg); }
        else if (args[0] === 'private' && args[1] === 'off') { antiDelete = false; await reply(sock, jid, '🗑️ *Anti-Delete DÉSACTIVÉ* ❌', msg); }
        else { await reply(sock, jid, `🗑️ Anti-Delete: ${antiDelete ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n${p}antidelete private on/off`, msg); }
        break;
      }

      // ── ANTIEDIT ──────────────────────────────────────────
      case 'antiedit': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        if (args[0] === 'private' && args[1] === 'on') { antiEdit = true; await reply(sock, jid, '✏️ *Anti-Edit ACTIVÉ* ✅', msg); }
        else if (args[0] === 'private' && args[1] === 'off') { antiEdit = false; await reply(sock, jid, '✏️ *Anti-Edit DÉSACTIVÉ* ❌', msg); }
        else { await reply(sock, jid, `✏️ Anti-Edit: ${antiEdit ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n${p}antiedit private on/off`, msg); }
        break;
      }

      // ── ANTILINK ──────────────────────────────────────────
      case 'antilink': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        if (args[0] === 'on') { antiLink = true; await reply(sock, jid, '🔗 *Anti-Link ACTIVÉ* ✅', msg); }
        else if (args[0] === 'off') { antiLink = false; await reply(sock, jid, '🔗 *Anti-Link DÉSACTIVÉ* ❌', msg); }
        else { await reply(sock, jid, `🔗 Anti-Link: ${antiLink ? '✅' : '❌'}\n${p}antilink on/off`, msg); }
        break;
      }

      // ── ANTICALL ──────────────────────────────────────────
      case 'anticall': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        if (args[0] === 'all' && args[1] === 'on') {
          antiCallMode = 'all'; antiCallWhitelist.clear();
          await reply(sock, jid, '📵 *Anticall ACTIVÉ* ✅\nTous les appels seront bloqués.', msg);
        } else if ((args[0] === 'all' && args[1] === 'off') || args[0] === 'off') {
          antiCallMode = 'off';
          await reply(sock, jid, '📵 *Anticall DÉSACTIVÉ* ❌', msg);
        } else if (args[0] && (args[0].startsWith('+') || /^[0-9]{7,15}$/.test(args[0]))) {
          const num = args[0].replace(/[^0-9]/g, '');
          antiCallWhitelist.add(num);
          antiCallMode = 'whitelist';
          await reply(sock, jid, `✅ *+${num} autorisé à appeler!*\nLes autres appels seront bloqués.`, msg);
        } else {
          const wList = antiCallWhitelist.size > 0 ? [...antiCallWhitelist].map(n => `• +${n}`).join('\n') : 'Aucun';
          await reply(sock, jid, `📵 Mode: ${antiCallMode === 'off' ? '❌ Désactivé' : antiCallMode === 'all' ? '🚫 Bloque TOUS' : '✅ Whitelist'}\nAutorisés:\n${wList}\n\n${p}anticall all on/off\n${p}anticall +[numéro]`, msg);
        }
        break;
      }

      // ── AUTOREACT ─────────────────────────────────────────
      case 'autoreact': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        autoReact = !autoReact;
        await reply(sock, jid, `💬 Auto-React: ${autoReact ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}`, msg);
        break;
      }

      // ── BLOCK / UNBLOCK ───────────────────────────────────
      case 'block': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        const toBlock = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toBlock) { await reply(sock, jid, `Usage: ${p}block @user`, msg); break; }
        await sock.updateBlockStatus(toBlock, 'block');
        await reply(sock, jid, `✅ +${toBlock.split('@')[0]} bloqué.`, msg);
        break;
      }
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
        if (!target && args[0]) { const num = args[0].replace(/[^0-9]/g, ''); if (num.length >= 7) target = num + '@s.whatsapp.net'; }
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
      case 'delsudo':
      case 'removesudo': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        let target2 = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target2 && args[0]) { const num = args[0].replace(/[^0-9]/g, ''); if (num.length >= 7) target2 = num + '@s.whatsapp.net'; }
        if (!target2) { await reply(sock, jid, `Usage: ${p}delsudo @user`, msg); break; }
        const tp2 = getPhone(target2);
        sudoAdmins.has(tp2) ? (sudoAdmins.delete(tp2), await reply(sock, jid, `✅ +${tp2} retiré.`, msg)) : await reply(sock, jid, `❌ +${tp2} n'est pas sudo.`, msg);
        break;
      }

      // ── COMMANDES GROUPES ─────────────────────────────────
      case 'kick': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        const toKick = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toKick) { await reply(sock, jid, `Usage: ${p}kick @user`, msg); break; }
        try { await sock.groupParticipantsUpdate(jid, [toKick], 'remove'); await reply(sock, jid, `✅ @${toKick.split('@')[0]} expulsé.`, msg); }
        catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }
      case 'add': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        if (!args[0]) { await reply(sock, jid, `Usage: ${p}add [numéro]`, msg); break; }
        const num = args[0].replace(/[^0-9]/g, '');
        try { await sock.groupParticipantsUpdate(jid, [num + '@s.whatsapp.net'], 'add'); await reply(sock, jid, `✅ +${num} ajouté.`, msg); }
        catch(e) { await reply(sock, jid, `❌ Impossible d'ajouter.`, msg); }
        break;
      }
      case 'promote': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        const toPro = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toPro) { await reply(sock, jid, `Usage: ${p}promote @user`, msg); break; }
        try { await sock.groupParticipantsUpdate(jid, [toPro], 'promote'); await reply(sock, jid, `⬆️ @${toPro.split('@')[0]} promu admin!`, msg); }
        catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }
      case 'demote': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        const toDem = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toDem) { await reply(sock, jid, `Usage: ${p}demote @user`, msg); break; }
        try { await sock.groupParticipantsUpdate(jid, [toDem], 'demote'); await reply(sock, jid, `⬇️ @${toDem.split('@')[0]} rétrogradé.`, msg); }
        catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }
      case 'tagall':
      case 'hidetag': {
        await handleTagAll(sock, msg, args, jid, isGroup, sender);
        break;
      }
      case 'mute': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        try { await sock.groupSettingUpdate(jid, 'announcement'); await reply(sock, jid, '🔇 Groupe muté.', msg); }
        catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }
      case 'unmute': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        try { await sock.groupSettingUpdate(jid, 'not_announcement'); await reply(sock, jid, '🔊 Groupe ouvert.', msg); }
        catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }
      case 'invite':
      case 'lien': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        try { const code = await sock.groupInviteCode(jid); await reply(sock, jid, `🔗 https://chat.whatsapp.com/${code}`, msg); }
        catch(e) { await reply(sock, jid, '❌ Je dois être admin.', msg); }
        break;
      }
      case 'revoke': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        try {
          await sock.groupRevokeInvite(jid);
          const newCode = await sock.groupInviteCode(jid);
          await reply(sock, jid, `✅ Lien réinitialisé!\n🔗 https://chat.whatsapp.com/${newCode}`, msg);
        } catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }
      case 'gname': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        if (!args.length) { await reply(sock, jid, `Usage: ${p}gname Nom`, msg); break; }
        try { await sock.groupUpdateSubject(jid, args.join(' ')); await reply(sock, jid, `✅ Nom: *${args.join(' ')}*`, msg); }
        catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }
      case 'gdesc': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        if (!args.length) { await reply(sock, jid, `Usage: ${p}gdesc Description`, msg); break; }
        try { await sock.groupUpdateDescription(jid, args.join(' ')); await reply(sock, jid, '✅ Description changée!', msg); }
        catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }
      case 'setppgc': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        try {
          let imgMsg = msg.message?.imageMessage;
          if (!imgMsg) {
            const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (q?.imageMessage) imgMsg = q.imageMessage;
          }
          if (!imgMsg) { await reply(sock, jid, `Envoie une image avec ${p}setppgc`, msg); break; }
          const buf = await toBuffer(await downloadContentFromMessage(imgMsg, 'image'));
          await sock.updateProfilePicture(jid, buf);
          await reply(sock, jid, '✅ Photo du groupe changée!', msg);
        } catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }
      case 'groupinfo': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        try {
          const meta   = await sock.groupMetadata(jid);
          const admins = meta.participants.filter(p => p.admin).length;
          const cree   = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString('fr-FR') : '?';
          await reply(sock, jid, `👥 *${meta.subject}*\n├ Membres: ${meta.participants.length}\n├ Admins: ${admins}\n├ Créateur: @${(meta.owner || '').split('@')[0]}\n├ Créé le: ${cree}\n╰ ${meta.desc || 'Aucune description'}`, msg);
        } catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }
      case 'listadmin': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        try {
          const meta   = await sock.groupMetadata(jid);
          const admins = meta.participants.filter(p => p.admin);
          if (!admins.length) { await reply(sock, jid, '❌ Aucun admin.', msg); break; }
          let txt = `👮 *ADMINS — ${meta.subject}* (${admins.length})\n\n`;
          admins.forEach(a => { txt += `${a.admin === 'superadmin' ? '👑' : '🛡️'} +${getPhone(a.id)}\n`; });
          await reply(sock, jid, txt, msg);
        } catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }
      case 'rules': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        const rules = groupRules[jid];
        if (!rules) { await reply(sock, jid, `❌ Aucune règle.\nUtilise: ${p}setrules [texte]`, msg); }
        else { await reply(sock, jid, `📋 *RÈGLES DU GROUPE*\n\n${rules}`, msg); }
        break;
      }
      case 'setrules': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        if (!args.length) { await reply(sock, jid, `Usage: ${p}setrules [règles]`, msg); break; }
        groupRules[jid] = args.join(' ');
        await reply(sock, jid, '✅ Règles enregistrées!', msg);
        break;
      }
      case 'welcome': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        if (args[0] === 'on') { welcomeGroups.add(jid); await reply(sock, jid, '👋 *Welcome activé!*', msg); }
        else if (args[0] === 'off') { welcomeGroups.delete(jid); await reply(sock, jid, '👋 *Welcome désactivé.*', msg); }
        else { await reply(sock, jid, `👋 Welcome: ${welcomeGroups.has(jid) ? '✅' : '❌'}\n${p}welcome on/off`, msg); }
        break;
      }
      case 'bye': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        if (args[0] === 'on') { byeGroups.add(jid); await reply(sock, jid, '👋 *Bye activé!*', msg); }
        else if (args[0] === 'off') { byeGroups.delete(jid); await reply(sock, jid, '👋 *Bye désactivé.*', msg); }
        else { await reply(sock, jid, `👋 Bye: ${byeGroups.has(jid) ? '✅' : '❌'}\n${p}bye on/off`, msg); }
        break;
      }
      case 'warn': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        const toWarn = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toWarn) { await reply(sock, jid, `Usage: ${p}warn @user`, msg); break; }
        const wPhone = getPhone(toWarn);
        if (!groupWarnings[jid]) groupWarnings[jid] = {};
        groupWarnings[jid][wPhone] = (groupWarnings[jid][wPhone] || 0) + 1;
        const count = groupWarnings[jid][wPhone];
        const reason = args.join(' ') || 'Aucune raison';
        if (count >= 3) {
          try {
            await sock.groupParticipantsUpdate(jid, [toWarn], 'remove');
            delete groupWarnings[jid][wPhone];
            await reply(sock, jid, `⛔ @${wPhone} expulsé après 3 avertissements!\n📌 ${reason}`, msg);
          } catch(e) { await reply(sock, jid, `⚠️ 3 warns mais impossible d'expulser: ${e.message}`, msg); }
        } else {
          await reply(sock, jid, `⚠️ *AVERTISSEMENT ${count}/3* — @${wPhone}\n📌 ${reason}`, msg);
        }
        break;
      }
      case 'resetwarn': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        const toReset = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toReset) { await reply(sock, jid, `Usage: ${p}resetwarn @user`, msg); break; }
        if (groupWarnings[jid]) delete groupWarnings[jid][getPhone(toReset)];
        await reply(sock, jid, `✅ Avertissements réinitialisés.`, msg);
        break;
      }
      case 'leave': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        await reply(sock, jid, '👋 Au revoir! 🇹🇩', msg);
        await delay(1000);
        await sock.groupLeave(jid);
        break;
      }

      // ── TOSGROUP — Poster sur statut depuis groupe ─────────
      case 'tosgroup': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé aux admins du bot.', msg); break; }
        try {
          const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const captionText = args.join(' ');
          if (quotedMsg?.imageMessage) {
            const buf = await toBuffer(await downloadContentFromMessage(quotedMsg.imageMessage, 'image'));
            await sock.sendMessage('status@broadcast', { image: buf, caption: captionText || '' });
            await reply(sock, jid, '✅ Image postée sur le statut!', msg);
          } else if (quotedMsg?.videoMessage) {
            const buf = await toBuffer(await downloadContentFromMessage(quotedMsg.videoMessage, 'video'));
            await sock.sendMessage('status@broadcast', { video: buf, caption: captionText || '' });
            await reply(sock, jid, '✅ Vidéo postée sur le statut!', msg);
          } else if (quotedMsg?.audioMessage) {
            const buf = await toBuffer(await downloadContentFromMessage(quotedMsg.audioMessage, 'audio'));
            await sock.sendMessage('status@broadcast', { audio: buf, mimetype: 'audio/mpeg' });
            await reply(sock, jid, '✅ Audio posté sur le statut!', msg);
          } else if (captionText) {
            const colors = ['#FF5733','#33FF57','#3357FF','#FF33A8','#FFD700'];
            await sock.sendMessage('status@broadcast', { text: captionText, backgroundColor: colors[Math.floor(Math.random() * colors.length)], font: 0 });
            await reply(sock, jid, '✅ Texte posté sur le statut!', msg);
          } else {
            await reply(sock, jid, `Usage: ${p}tosgroup [texte]\nOu réponds à une image/vidéo/audio avec ${p}tosgroup`, msg);
          }
        } catch(e) { await reply(sock, jid, `❌ tosgroup: ${e.message}`, msg); }
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
          await sock.sendMessage(jid, { sticker: buf });
        } catch(e) { await reply(sock, jid, `❌ Sticker: ${e.message}`, msg); }
        break;
      }
      case 'toimg': {
        try {
          let stickerMsg = msg.message?.stickerMessage;
          if (!stickerMsg) {
            const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (q?.stickerMessage) stickerMsg = q.stickerMessage;
          }
          if (!stickerMsg) { await reply(sock, jid, `Réponds à un sticker avec ${p}toimg`, msg); break; }
          const buf = await toBuffer(await downloadContentFromMessage(stickerMsg, 'sticker'));
          await sock.sendMessage(jid, { image: buf, caption: '🖼️ Sticker → Image' }, { quoted: msg });
        } catch(e) { await reply(sock, jid, `❌ ToImg: ${e.message}`, msg); }
        break;
      }

      // ── VU UNIQUE ─────────────────────────────────────────
      case '🙏': {
        // Envoie en PV silencieusement
        await handleViewOnceCommand(sock, msg, args, jid, sender, false);
        break;
      }
      case 'vv2': {
        // Ouvre directement dans le chat
        await handleViewOnceCommand(sock, msg, args, jid, sender, true);
        break;
      }

      // ── TOSTATUS ──────────────────────────────────────────
      case 'tostatus': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        try {
          const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const text = args.join(' ');
          if (!quotedMsg && text) {
            const colors = ['#FF5733','#33FF57','#3357FF','#FF33A8','#FFD700'];
            await sock.sendMessage('status@broadcast', { text, backgroundColor: colors[Math.floor(Math.random() * colors.length)], font: 0, statusJidList: [sender] });
            await reply(sock, jid, '✅ Status texte publié!', msg);
          } else if (quotedMsg?.imageMessage) {
            const buf = await toBuffer(await downloadContentFromMessage(quotedMsg.imageMessage, 'image'));
            await sock.sendMessage('status@broadcast', { image: buf, caption: text || '', statusJidList: [sender] });
            await reply(sock, jid, '✅ Status image publié!', msg);
          } else if (quotedMsg?.videoMessage) {
            const buf = await toBuffer(await downloadContentFromMessage(quotedMsg.videoMessage, 'video'));
            await sock.sendMessage('status@broadcast', { video: buf, caption: text || '', statusJidList: [sender] });
            await reply(sock, jid, '✅ Status vidéo publié!', msg);
          } else {
            await reply(sock, jid, `${p}tostatus [texte] / réponds image / réponds vidéo`, msg);
          }
        } catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }

      // ── TOAUDIO ───────────────────────────────────────────
      case 'toaudio': {
        const qTa = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!qTa || !/video|audio/.test(Object.values(qTa)[0]?.mimetype || '')) {
          await reply(sock, jid, `❌ Reply une vidéo/audio avec ${p}toaudio`, msg); break;
        }
        try {
          const stream = await downloadContentFromMessage(Object.values(qTa)[0], 'video');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
        } catch(e) { await reply(sock, jid, `❌ toaudio: ${e.message}`, msg); }
        break;
      }
      case 'tovn': {
        const qTv = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!qTv || !/video|audio/.test(Object.values(qTv)[0]?.mimetype || '')) {
          await reply(sock, jid, `❌ Reply une vidéo/audio avec ${p}tovn`, msg); break;
        }
        try {
          const stream = await downloadContentFromMessage(Object.values(qTv)[0], 'video');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
        } catch(e) { await reply(sock, jid, `❌ tovn: ${e.message}`, msg); }
        break;
      }

      // ── TOURL ─────────────────────────────────────────────
      case 'tourl': {
        const qTu = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!qTu) { await reply(sock, jid, `❌ Reply une image/vidéo avec ${p}tourl`, msg); break; }
        try {
          const mimeType = Object.values(qTu)[0]?.mimetype || '';
          const dlType = /video/.test(mimeType) ? 'video' : 'image';
          const stream = await downloadContentFromMessage(Object.values(qTu)[0], dlType);
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          const ext = /video/.test(mimeType) ? 'mp4' : 'jpg';
          const link = await uploadToCatbox(buf, `upload.${ext}`, mimeType || 'image/jpeg');
          await reply(sock, jid, `🔗 *LIEN MÉDIA:*\n\n${link}`, msg);
        } catch(e) { await reply(sock, jid, `❌ tourl: ${e.message}`, msg); }
        break;
      }

      // ── GETPP ─────────────────────────────────────────────
      case 'getpp': {
        try {
          let targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
          if (!targetJid && args[0]) { const num = args[0].replace(/[^0-9]/g, ''); targetJid = num + '@s.whatsapp.net'; }
          if (!targetJid) targetJid = sender;
          const ppUrl = await sock.profilePictureUrl(targetJid, 'image');
          await sock.sendMessage(jid, { image: { url: ppUrl }, caption: `📷 Photo de profil de @${targetJid.split('@')[0]}`, mentions: [targetJid] }, { quoted: msg });
        } catch(e) { await reply(sock, jid, '❌ Aucune photo de profil ou profil privé.', msg); }
        break;
      }

      // ══════════════════════════════════════════════════════
      // 📥 TÉLÉCHARGEMENTS (basés sur Riselia.js)
      // ══════════════════════════════════════════════════════

      // ── TT / TIKTOK ───────────────────────────────────────
      case 'tiktok':
      case 'tt': {
        const url = args[0];
        if (!url || !url.startsWith('https://')) { await reply(sock, jid, `❌ Usage: ${p}tt [lien tiktok]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🕖', key: msg.key } });
          await reply(sock, jid, `📥 🚀 Téléchargement TikTok en cours...\n✨ Patiente un instant!`, msg);
          const res = await fetchJson(`https://api.tikwm.com/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ url, count: 12, cursor: 0, web: 1, hd: 1 })
          });
          const d = res?.data;
          if (!d) { await reply(sock, jid, '❌ TikTok: aucun résultat.', msg); break; }
          if (d.duration == 0 && d.images) {
            for (const imgUrl of d.images) {
              await sock.sendMessage(jid, { image: { url: imgUrl }, caption: `📸 *${d.title || 'TikTok Photo'}*\n👤 ${d.author?.nickname || ''}` }, { quoted: msg });
            }
          } else {
            const vidUrl = 'https://www.tikwm.com' + (d.hdplay || d.play || '');
            await sock.sendMessage(jid, { video: { url: vidUrl }, caption: `🎵 *${d.title || 'TikTok'}*\n👤 ${d.author?.nickname || ''}\n⏱ ${d.duration}s` }, { quoted: msg });
          }
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ TikTok: ${e.message}`, msg); }
        break;
      }

      // ── INSTAGRAM ─────────────────────────────────────────
      case 'instagram':
      case 'ig': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}ig [lien instagram]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🕖', key: msg.key } });
          const res = await dlSiputzx('igdl', url);
          const medias = res?.data || [];
          if (!medias.length) { await reply(sock, jid, '❌ Instagram: lien invalide ou contenu privé.', msg); break; }
          const uniqueUrls = [...new Set(medias.map(item => item.url))];
          await sendMediaFromUrls(sock, jid, uniqueUrls, '📸 *INSTAGRAM DOWNLOAD* — SEIGNEUR TD 🇹🇩', msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ Instagram: ${e.message}`, msg); }
        break;
      }

      // ── FACEBOOK ──────────────────────────────────────────
      case 'facebook':
      case 'fb': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}fb [lien facebook]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🕖', key: msg.key } });
          const res = await dlSiputzx('facebook', url);
          const medias = res?.data || [];
          if (!medias.length) { await reply(sock, jid, '❌ Facebook: lien invalide ou vidéo privée.', msg); break; }
          const uniqueUrls = [...new Set(medias.map(item => item.url))];
          await sendMediaFromUrls(sock, jid, uniqueUrls, '📘 *FACEBOOK DOWNLOAD* — SEIGNEUR TD 🇹🇩', msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ Facebook: ${e.message}`, msg); }
        break;
      }

      // ── PINTEREST ─────────────────────────────────────────
      case 'pinterest':
      case 'pin':
      case 'pindl': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}pin [lien pinterest]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🕖', key: msg.key } });
          const res = await dlSiputzx('pinterest', url);
          const medias = res?.data || [];
          if (!medias.length) { await reply(sock, jid, '❌ Pinterest: aucun média trouvé.', msg); break; }
          const uniqueUrls = [...new Set(medias.map(item => item.url))];
          await sendMediaFromUrls(sock, jid, uniqueUrls, '📌 *PINTEREST DOWNLOAD* — SEIGNEUR TD 🇹🇩', msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ Pinterest: ${e.message}`, msg); }
        break;
      }

      // ── SNACKVIDEO ────────────────────────────────────────
      case 'snackvideo':
      case 'sv': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}sv [lien snackvideo]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🕖', key: msg.key } });
          const res = await dlSiputzx('snackvideo', url);
          const medias = res?.data || [];
          if (!medias.length) { await reply(sock, jid, '❌ SnackVideo: lien invalide.', msg); break; }
          const uniqueUrls = [...new Set(medias.map(item => item.url))];
          await sendMediaFromUrls(sock, jid, uniqueUrls, '🎬 *SNACKVIDEO DOWNLOAD* — SEIGNEUR TD 🇹🇩', msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ SnackVideo: ${e.message}`, msg); }
        break;
      }

      // ── CAPCUT ────────────────────────────────────────────
      case 'capcut':
      case 'cc': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}cc [lien capcut]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🕖', key: msg.key } });
          const res = await dlSiputzx('capcut', url);
          const medias = res?.data || [];
          if (!medias.length) { await reply(sock, jid, '❌ CapCut: aucun média.', msg); break; }
          const uniqueUrls = [...new Set(medias.map(item => item.url))];
          await sendMediaFromUrls(sock, jid, uniqueUrls, '✂️ *CAPCUT DOWNLOAD* — SEIGNEUR TD 🇹🇩', msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ CapCut: ${e.message}`, msg); }
        break;
      }

      // ── YTMP3 ─────────────────────────────────────────────
      case 'ytmp3': {
        const url = args[0];
        if (!url || !url.startsWith('https://')) { await reply(sock, jid, `❌ Usage: ${p}ytmp3 [lien youtube]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🕖', key: msg.key } });
          const res = await fetchJson(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(url)}`);
          if (!res?.status) { await reply(sock, jid, '❌ YouTube MP3: téléchargement échoué.', msg); break; }
          const dlUrl = res.download?.url || res.url;
          await sock.sendMessage(jid, { audio: { url: dlUrl }, mimetype: 'audio/mpeg' }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ YT MP3: ${e.message}`, msg); }
        break;
      }

      // ── YTMP4 ─────────────────────────────────────────────
      case 'ytmp4': {
        const url = args[0];
        if (!url || !url.startsWith('https://')) { await reply(sock, jid, `❌ Usage: ${p}ytmp4 [lien youtube]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🕖', key: msg.key } });
          const res = await fetchJson(`https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(url)}`);
          if (!res?.status) { await reply(sock, jid, '❌ YouTube MP4: téléchargement échoué.', msg); break; }
          const dlUrl = res.download?.url || res.url;
          await sock.sendMessage(jid, { video: { url: dlUrl }, mimetype: 'video/mp4', caption: '🎬 *YOUTUBE MP4* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ YT MP4: ${e.message}`, msg); }
        break;
      }

      // ── YTS — YOUTUBE SEARCH (basé sur Riselia) ───────────
      case 'yts':
      case 'ytsearch': {
        const query = args.join(' ');
        if (!query) { await reply(sock, jid, `❌ Usage: ${p}yts [titre]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } });
          const res = await fetchJson(`https://api.siputzx.my.id/api/d/yts?q=${encodeURIComponent(query)}`);
          const videos = res?.data || res?.videos || res?.result || [];
          if (!videos.length) { await reply(sock, jid, '❌ Aucun résultat YouTube.', msg); break; }
          let txt = `🔍 *YOUTUBE SEARCH* — "${query}"\n\n`;
          videos.slice(0, 5).forEach((v, i) => {
            txt += `*${i+1}. ${v.title || v.name}*\n`;
            txt += `   ⏱ ${v.duration || v.timestamp || '?'} • 👁 ${v.views || '?'}\n`;
            txt += `   🔗 ${v.url || v.link}\n`;
            txt += `   ${p}ytmp3 ${v.url || v.link}\n`;
            txt += `   ${p}ytmp4 ${v.url || v.link}\n\n`;
          });
          await reply(sock, jid, txt, msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ YT Search: ${e.message}`, msg); }
        break;
      }

      // ── GDRIVE ────────────────────────────────────────────
      case 'gdrive':
      case 'gddl': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}gdrive [lien google drive]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🚀', key: msg.key } });
          const res = await fetchJson(`https://api.siputzx.my.id/api/d/gdrive?url=${encodeURIComponent(url)}`);
          const dlUrl = res?.data?.download || res?.download;
          const name  = res?.data?.name || 'fichier';
          if (!dlUrl) { await reply(sock, jid, '❌ Google Drive: lien non trouvé.', msg); break; }
          await sock.sendMessage(jid, { document: { url: dlUrl }, fileName: name, mimetype: 'application/octet-stream', caption: `📂 *${name}*` }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ GDrive: ${e.message}`, msg); }
        break;
      }

      // ── MEDIAFIRE ─────────────────────────────────────────
      case 'mediafire':
      case 'mfdl': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}mediafire [lien mediafire]`, msg); break; }
        if (!url.includes('mediafire.com')) { await reply(sock, jid, '❌ Doit être un lien mediafire.com', msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🚀', key: msg.key } });
          const res = await fetchJson(`https://api.vreden.web.id/api/mediafiredl?url=${encodeURIComponent(url)}`);
          const item = res?.result?.[0] || res?.data;
          if (!item) { await reply(sock, jid, '❌ MediaFire: aucun résultat.', msg); break; }
          const fileName = decodeURIComponent(item.nama || item.name || 'fichier');
          const ext      = fileName.split('.').pop().toLowerCase();
          const mimeMap  = { mp4: 'video/mp4', mp3: 'audio/mpeg', pdf: 'application/pdf' };
          const mime     = mimeMap[ext] || `application/${ext}`;
          const dlRes    = await axios.get(item.link || item.url, { responseType: 'arraybuffer' });
          const buf      = Buffer.from(dlRes.data);
          await sock.sendMessage(jid, { document: buf, fileName, mimetype: mime }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ MediaFire: ${e.message}`, msg); }
        break;
      }

      // ══════════════════════════════════════════════════════
      // 🤖 IA / OUTILS (basés sur Riselia.js)
      // ══════════════════════════════════════════════════════

      // ── AI / GPT ──────────────────────────────────────────
      case 'ai':
      case 'gpt':
      case 'gemini': {
        if (!args.length) { await reply(sock, jid, `❌ Usage: ${p}ai [question]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '💬', key: msg.key } });
          const prompt = `Tu es SEIGNEUR TD, un assistant WhatsApp du Tchad. Réponds en français.`;
          const res = await fetchJson(`https://api.siputzx.my.id/api/ai/gpt3?prompt=${encodeURIComponent(prompt)}&content=${encodeURIComponent(args.join(' '))}`);
          const rep = res?.data || res?.result || 'Pas de réponse.';
          await reply(sock, jid, `🤖 *SEIGNEUR TD AI*\n\n${rep}`, msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ AI: ${e.message}`, msg); }
        break;
      }

      // ── OCR (basé sur Riselia.js) ─────────────────────────
      case 'ocr': {
        const qOcr = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!qOcr) { await reply(sock, jid, `❌ Réponds à une image avec ${p}ocr`, msg); break; }
        const mimeOcr = Object.values(qOcr)[0]?.mimetype || '';
        if (!/image/.test(mimeOcr)) { await reply(sock, jid, `❌ Réponds seulement avec une image.`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🕒', key: msg.key } });
          const stream = await downloadContentFromMessage(Object.values(qOcr)[0], 'image');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          const ext = mimeOcr.split('/')[1] || 'jpg';
          const imgUrl = await uploadToCatbox(buf, `ocr.${ext}`, mimeOcr);
          const ocrRes = await fetchJson(`https://api.alyachan.dev/api/ocr?image=${imgUrl}&apikey=DinzIDgembul`);
          const txt = ocrRes?.result?.text?.replace(/\r/g, '').trim() || 'Aucun texte trouvé.';
          await reply(sock, jid, `🔍 *OCR — Texte détecté:*\n\n${txt}`, msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ OCR: ${e.message}`, msg); }
        break;
      }

      // ── TOANIME (basé sur Riselia.js) ─────────────────────
      case 'toanime': {
        const qAn = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!qAn) { await reply(sock, jid, `❌ Réponds à une image avec ${p}toanime`, msg); break; }
        if (!/image/.test(Object.values(qAn)[0]?.mimetype || '')) { await reply(sock, jid, '❌ Réponds seulement avec une image.', msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🚀', key: msg.key } });
          await reply(sock, jid, '⏳ Conversion anime en cours...', msg);
          const stream = await downloadContentFromMessage(Object.values(qAn)[0], 'image');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          const imageUrl = await uploadToCatbox(buf, 'img.jpg', 'image/jpeg');
          const apiUrl = `https://fastrestapis.fasturl.cloud/imgedit/aiimage?prompt=Anime&reffImage=${encodeURIComponent(imageUrl)}&style=AnimageModel&width=1024&height=1024&creativity=0.5`;
          await sock.sendMessage(jid, { image: { url: apiUrl }, caption: '🎌 *ANIME* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ toanime: ${e.message}`, msg); }
        break;
      }

      // ── FACEBLUR (basé sur Riselia.js) ────────────────────
      case 'faceblur':
      case 'blurface': {
        const qFb = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!qFb) { await reply(sock, jid, `❌ Réponds à une image avec ${p}faceblur`, msg); break; }
        if (!/image/.test(Object.values(qFb)[0]?.mimetype || '')) { await reply(sock, jid, '❌ Réponds seulement avec une image.', msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '😶', key: msg.key } });
          const stream = await downloadContentFromMessage(Object.values(qFb)[0], 'image');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          const imgUrl = await uploadToCatbox(buf, 'img.jpg', 'image/jpeg');
          await sock.sendMessage(jid, { image: { url: `https://api.siputzx.my.id/api/iloveimg/blurface?image=${imgUrl}` }, caption: '😶 *FACEBLUR* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ faceblur: ${e.message}`, msg); }
        break;
      }

      // ── REMOVEBG (basé sur Riselia.js) ────────────────────
      case 'removal':
      case 'removebg': {
        const qRb = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!qRb) { await reply(sock, jid, `❌ Réponds à une image avec ${p}removebg`, msg); break; }
        if (!/image/.test(Object.values(qRb)[0]?.mimetype || '')) { await reply(sock, jid, '❌ Réponds seulement avec une image.', msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🖼️', key: msg.key } });
          const stream = await downloadContentFromMessage(Object.values(qRb)[0], 'image');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          const imgUrl = await uploadToCatbox(buf, 'img.jpg', 'image/jpeg');
          await sock.sendMessage(jid, { image: { url: `https://api.siputzx.my.id/api/iloveimg/removebg?image=${imgUrl}` }, caption: '🖼️ *REMOVE BG* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ removebg: ${e.message}`, msg); }
        break;
      }

      // ── HD (basé sur Riselia.js) ───────────────────────────
      case 'hd':
      case 'tohd':
      case 'superhd': {
        const qHd = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!qHd) { await reply(sock, jid, `❌ Réponds à une image avec ${p}hd`, msg); break; }
        if (!/image/.test(Object.values(qHd)[0]?.mimetype || '')) {
          await reply(sock, jid, '❌ Réponds seulement avec une image.', msg); break;
        }
        try {
          await sock.sendMessage(jid, { react: { text: '⏱️', key: msg.key } });
          await reply(sock, jid, '⏳ Amélioration HD en cours, patiente...', msg);
          const stream = await downloadContentFromMessage(Object.values(qHd)[0], 'image');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          const catBoxUrl = await uploadToCatbox(buf, 'img.jpg', 'image/jpeg');
          const hdRes = await fetchJson(`https://api.vreden.my.id/api/artificial/hdr?url=${catBoxUrl}&pixel=4`);
          const result = hdRes?.result?.data?.downloadUrls?.[0];
          if (!result) throw new Error('HD échoué');
          await sock.sendMessage(jid, { image: { url: result }, caption: '✨ *SUPER HD* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ HD: ${e.message}`, msg); }
        break;
      }

      // ── SSWEB (basé sur Riselia.js) ───────────────────────
      case 'ssweb': {
        if (!args[0]) { await reply(sock, jid, `❌ Usage: ${p}ssweb [url]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '📸', key: msg.key } });
          const ssUrl = args[0].startsWith('http') ? args[0] : 'https://' + args[0];
          await sock.sendMessage(jid, { image: { url: `https://api.siputzx.my.id/api/tools/ssweb?url=${encodeURIComponent(ssUrl)}&theme=light&device=desktop` }, caption: `🌐 *SCREENSHOT* ${ssUrl}` }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ ssweb: ${e.message}`, msg); }
        break;
      }

      // ── BRAT (basé sur Riselia.js) ────────────────────────
      case 'brat': {
        if (!args.length) { await reply(sock, jid, `❌ Usage: ${p}brat [texte]`, msg); break; }
        try {
          const bratUrl = `https://api.siputzx.my.id/api/m/brat?text=${encodeURIComponent(args.join(' '))}&isAnimated=false&delay=500`;
          await sock.sendMessage(jid, { image: { url: bratUrl }, caption: '' }, { quoted: msg });
        } catch(e) { await reply(sock, jid, `❌ brat: ${e.message}`, msg); }
        break;
      }

      // ── DICTIONNAIRE ──────────────────────────────────────
      case 'dictionnaire':
      case 'dict': {
        if (!args.length) { await reply(sock, jid, `❌ Usage: ${p}dictionnaire [mot]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '📖', key: msg.key } });
          const mot = args[0].toLowerCase();
          const res = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/fr/${encodeURIComponent(mot)}`);
          if (!Array.isArray(res) || !res.length) { await reply(sock, jid, `❌ Mot "${mot}" non trouvé dans le dictionnaire.`, msg); break; }
          const entry = res[0];
          let txt = `📖 *DICTIONNAIRE — ${entry.word}*\n`;
          if (entry.phonetic) txt += `🔤 Phonétique: ${entry.phonetic}\n`;
          txt += '\n';
          (entry.meanings || []).slice(0, 3).forEach((meaning, i) => {
            txt += `*${meaning.partOfSpeech || ''}*\n`;
            (meaning.definitions || []).slice(0, 2).forEach((def, j) => {
              txt += `  ${j+1}. ${def.definition}\n`;
              if (def.example) txt += `     _Ex: ${def.example}_\n`;
            });
            txt += '\n';
          });
          await reply(sock, jid, txt, msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) {
          if (e.message?.includes('404') || e.message?.includes('json')) {
            await reply(sock, jid, `❌ Mot "${args[0]}" introuvable dans le dictionnaire.`, msg);
          } else {
            await reply(sock, jid, `❌ Dictionnaire: ${e.message}`, msg);
          }
        }
        break;
      }

      // ══════════════════════════════════════════════════════
      // 🎵 CONVERSION AUDIO (ffmpeg)
      // ══════════════════════════════════════════════════════

      case 'bass':
      case 'blown':
      case 'deep':
      case 'earrape':
      case 'fast':
      case 'fat':
      case 'nightcore':
      case 'reverse':
      case 'robot':
      case 'slow':
      case 'smooth':
      case 'tupai': {
        const qConv = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const mimeConv = qConv ? (Object.values(qConv)[0]?.mimetype || '') : '';
        if (!qConv || !/audio/.test(mimeConv)) {
          await reply(sock, jid, `❌ Reply un audio avec ${p}${command}\n\n📋 *Effets:* bass • blown • deep • earrape • fast • fat • nightcore • reverse • robot • slow • smooth • tupai`, msg);
          break;
        }
        try {
          await sock.sendMessage(jid, { react: { text: '🎵', key: msg.key } });
          let filterSet = '';
          if (command === 'bass')      filterSet = '-af equalizer=f=54:width_type=o:width=2:g=20';
          if (command === 'blown')     filterSet = '-af acrusher=.1:1:64:0:log';
          if (command === 'deep')      filterSet = '-af atempo=4/4,asetrate=44500*2/3';
          if (command === 'earrape')   filterSet = '-af volume=12';
          if (command === 'fast')      filterSet = '-filter:a "atempo=1.63,asetrate=44100"';
          if (command === 'fat')       filterSet = '-filter:a "atempo=1.6,asetrate=22100"';
          if (command === 'nightcore') filterSet = '-filter:a atempo=1.06,asetrate=44100*1.25';
          if (command === 'reverse')   filterSet = '-filter_complex "areverse"';
          if (command === 'robot')     filterSet = `-filter_complex "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75"`;
          if (command === 'slow')      filterSet = '-filter:a "atempo=0.7,asetrate=44100"';
          if (command === 'smooth')    filterSet = '-filter:v "minterpolate=\'mi_mode=mci:mc_mode=aobmc:vsbmc=1:fps=120\'"';
          if (command === 'tupai')     filterSet = '-filter:a "atempo=0.5,asetrate=65100"';

          const stream = await downloadContentFromMessage(Object.values(qConv)[0], 'audio');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);

          const inPath  = `/tmp/conv_in_${Date.now()}.mp3`;
          const outPath = `/tmp/conv_out_${Date.now()}.mp3`;
          fs.writeFileSync(inPath, buf);

          await new Promise((resolve, reject) => {
            exec(`ffmpeg -i ${inPath} ${filterSet} ${outPath}`, (err) => {
              try { fs.unlinkSync(inPath); } catch(_) {}
              if (err) { reject(err); return; }
              resolve();
            });
          });

          const outBuf = fs.readFileSync(outPath);
          try { fs.unlinkSync(outPath); } catch(_) {}
          await sock.sendMessage(jid, { audio: outBuf, mimetype: 'audio/mpeg' }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ Conversion: ${e.message}`, msg); }
        break;
      }

      // ══════════════════════════════════════════════════════
      // 🕌 CORAN
      // ══════════════════════════════════════════════════════

      case 'surah': {
        if (!args[0]) {
          // Liste des 114 sourates
          const noms = ['Al-Fatiha','Al-Baqara','Ali Imran','An-Nisa','Al-Maida','Al-An\'am','Al-A\'raf','Al-Anfal','At-Tawba','Yunus','Hud','Yusuf','Ar-Ra\'d','Ibrahim','Al-Hijr','An-Nahl','Al-Isra','Al-Kahf','Maryam','Ta-Ha','Al-Anbiya','Al-Hajj','Al-Mu\'minun','An-Nur','Al-Furqan','Ash-Shu\'ara','An-Naml','Al-Qasas','Al-Ankabut','Ar-Rum','Luqman','As-Sajda','Al-Ahzab','Saba','Fatir','Ya-Sin','As-Saffat','Sad','Az-Zumar','Ghafir','Fussilat','Ash-Shura','Az-Zukhruf','Ad-Dukhan','Al-Jathiya','Al-Ahqaf','Muhammad','Al-Fath','Al-Hujurat','Qaf','Adh-Dhariyat','At-Tur','An-Najm','Al-Qamar','Ar-Rahman','Al-Waqi\'a','Al-Hadid','Al-Mujadila','Al-Hashr','Al-Mumtahana','As-Saff','Al-Jumu\'a','Al-Munafiqun','At-Taghabun','At-Talaq','At-Tahrim','Al-Mulk','Al-Qalam','Al-Haqqa','Al-Ma\'arij','Nuh','Al-Jinn','Al-Muzzammil','Al-Muddaththir','Al-Qiyama','Al-Insan','Al-Mursalat','An-Naba','An-Nazi\'at','Abasa','At-Takwir','Al-Infitar','Al-Mutaffifin','Al-Inshiqaq','Al-Buruj','At-Tariq','Al-A\'la','Al-Ghashiya','Al-Fajr','Al-Balad','Ash-Shams','Al-Layl','Ad-Duha','Ash-Sharh','At-Tin','Al-Alaq','Al-Qadr','Al-Bayyina','Az-Zalzala','Al-Adiyat','Al-Qari\'a','At-Takathur','Al-Asr','Al-Humaza','Al-Fil','Quraish','Al-Ma\'un','Al-Kawthar','Al-Kafirun','An-Nasr','Al-Masad','Al-Ikhlas','Al-Falaq','An-Nas'];
          let txt = `📖 *LE SAINT CORAN — 114 SOURATES*\n\n`;
          noms.forEach((n, i) => { txt += `${i+1}. ${n}\n`; });
          txt += `\n_Tape ${p}surah [numéro] pour lire une sourate_`;
          await reply(sock, jid, txt, msg);
          break;
        }
        const numSurah = parseInt(args[0]);
        if (isNaN(numSurah) || numSurah < 1 || numSurah > 114) {
          await reply(sock, jid, '❌ Numéro invalide. Entre 1 et 114.', msg); break;
        }
        try {
          await sock.sendMessage(jid, { react: { text: '📖', key: msg.key } });
          // API alquran.cloud — texte arabe uniquement
          const res = await fetchJson(`https://api.alquran.cloud/v1/surah/${numSurah}`);
          const data = res?.data;
          if (!data) { await reply(sock, jid, '❌ Sourate introuvable.', msg); break; }
          let txt = `📖 *${data.number}. ${data.name} (${data.englishName})*\n`;
          txt += `Versets: ${data.numberOfAyahs}\n`;
          txt += '━'.repeat(28) + '\n\n';
          txt += data.ayahs.map(ayah => `(${ayah.numberInSurah}) ${ayah.text}`).join('\n\n');
          // Envoyer en chunks si trop long
          for (let i = 0; i < txt.length; i += 3900) {
            await sock.sendMessage(jid, { text: txt.slice(i, i + 3900) }, { quoted: i === 0 ? msg : undefined });
          }
        } catch(e) { await reply(sock, jid, `❌ Surah: ${e.message}`, msg); }
        break;
      }

      // ── 99 NOMS D'ALLAH ───────────────────────────────────
      case '99nomdallah':
      case '99nom':
      case 'asmaul':
      case 'asmaulhusna': {
        const noms99 = `﷽\n🌟 Les 99 Noms d'Allah\n\nArabe — Traduction en Français\n\nالرحمن — Le Très-Miséricordieux\nالرحيم — Le Tout-Miséricordieux\nالملك — Le Souverain\nالقدوس — Le Pur / Le Saint\nالسلام — La Paix / Le Salut\nالمؤمن — Le Sécurisant\nالمهيمن — Le Préservateur\nالعزيز — Le Tout-Puissant\nالجبار — Le Contraignant\nالمتكبر — Le Majestueux\nالخالق — Le Créateur\nالبارئ — Le Producteur\nالمصور — Le Formateur\nالغفار — Le Grand Pardonneur\nالقهار — Le Dominateur Suprême\nالوهاب — Le Donateur Généreux\nالرزاق — Le Pourvoyeur\nالفتاح — Celui qui ouvre les portes\nالعليم — L'Omniscient\nالقابض — Celui qui retient\nالباسط — Celui qui étend Sa largesse\nالخافض — Celui qui abaisse\nالرافع — Celui qui élève\nالمعز — Celui qui donne la puissance\nالمذل — Celui qui humilie\nالسميع — L'Audient\nالبصير — Le Voyant\nالحكم — Le Juge\nالعدل — Le Juste\nاللطيف — Le Subtil / Le Bienveillant\nالخبير — Le Parfaitement Connaisseur\nالحليم — Le Clément\nالعظيم — L'Immense\nالغفور — Le Pardonneur\nالشكور — Le Reconnaissant\nالعلي — Le Très-Haut\nالكبير — L'Infiniment Grand\nالحفيظ — Le Préservateur\nالمقيت — Le Nourricier\nالحسيب — Celui qui tient compte de tout\nالجليل — Le Majestueux\nالكريم — Le Tout-Généreux\nالرقيب — L'Observateur\nالمجيب — Celui qui exauce\nالواسع — L'Immense\nالحكيم — Le Sage\nالودود — L'Affectueux\nالمجيد — Le Très-Glorieux\nالباعث — Celui qui ressuscite\nالشهيد — Le Témoin\nالحق — La Vérité\nالوكيل — Le Garant\nالقوي — Le Fort\nالمتين — L'Inébranlable\nالولي — Le Protecteur\nالحميد — Le Louable\nالمحصي — Celui qui dénombre tout\nالمبدئ — L'Auteur\nالمعيد — Celui qui fait revivre\nالمحيي — Celui qui donne la vie\nالمميت — Celui qui donne la mort\nالحي — Le Vivant\nالقيوم — L'Immuable\nالواجد — Celui qui trouve tout\nالماجد — L'Illustre\nالواحد — L'Unique\nالاحد — L'Un\nالصمد — Le Soutien Universel\nالقادر — Le Puissant\nالمقتدر — Le Tout-Puissant\nالمقدم — Celui qui fait avancer\nالمؤخر — Celui qui fait reculer\nالأول — Le Premier\nالأخر — Le Dernier\nالظاهر — L'Apparent\nالباطن — Le Caché\nالوالي — Le Maître\nالمتعالي — Le Sublime\nالبر — Le Bienveillant\nالتواب — Celui qui accepte le repentir\nالمنتقم — Le Vengeur\nالعفو — L'Indulgent\nالرؤوف — Le Très-Doux\nمالك الملك — Le Possesseur du Royaume\nذو الجلال والإكرام — Détenteur de la Majesté\nالمقسط — L'Équitable\nالجامع — Celui qui rassemble\nالغني — Le Riche par soi-même\nالمغني — Celui qui enrichit\nالمانع — Celui qui empêche\nالضار — Celui qui peut nuire\nالنافع — Celui qui est utile\nالنور — La Lumière\nالهادي — Le Guide\nالبديع — L'Incomparable\nالباقي — L'Éternel\nالوارث — L'Héritier\nالرشيد — Le Guide sur la voie droite\nالصبور — Le Patient`;
        for (let i = 0; i < noms99.length; i += 3900) {
          await sock.sendMessage(jid, { text: noms99.slice(i, i + 3900) }, { quoted: i === 0 ? msg : undefined });
        }
        break;
      }

      // ══════════════════════════════════════════════════════
      // 🔍 RECHERCHE
      // ══════════════════════════════════════════════════════

      // ── GOOGLE ────────────────────────────────────────────
      case 'google': {
        if (!args.length) { await reply(sock, jid, `❌ Usage: ${p}google [recherche]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🌐', key: msg.key } });
          const apiKey = 'AIzaSyAajE2Y-Kgl8bjPyFvHQ-PgRUSMWgBEsSk';
          const cx = 'e5c2be9c3f94c4bbb';
          const res = await fetchJson(`https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(args.join(' '))}&key=${apiKey}&cx=${cx}`);
          const items = res?.items || [];
          if (!items.length) { await reply(sock, jid, '❌ Aucun résultat Google.', msg); break; }
          let txt = `🌐 *GOOGLE — "${args.join(' ')}"*\n\n`;
          items.slice(0, 5).forEach((item, i) => {
            txt += `*${i+1}. ${item.title}*\n`;
            txt += `   📝 ${item.snippet}\n`;
            txt += `   🔗 ${item.link}\n\n`;
          });
          await reply(sock, jid, txt, msg);
        } catch(e) { await reply(sock, jid, `❌ Google: ${e.message}`, msg); }
        break;
      }

      // ── PLAYSTORE (basé sur Riselia) ──────────────────────
      case 'playstore': {
        if (!args.length) { await reply(sock, jid, `❌ Usage: ${p}playstore [nom app]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } });
          const res = await fetchJson(`https://api.vreden.web.id/api/playstore?query=${encodeURIComponent(args.join(' '))}`);
          const results = res?.result || [];
          if (!results.length) { await reply(sock, jid, '❌ Aucun résultat Play Store.', msg); break; }
          let txt = `🎮 *PLAY STORE — "${args.join(' ')}"*\n\n`;
          txt += results.slice(0, 5).map((app, i) =>
            `*${i+1}. ${app.title || args.join(' ')}*\n   👨‍💻 ${app.developer || '?'}\n   ⭐ ${app.rate2 || '?'}\n   🔗 ${app.link || '?'}\n`
          ).join('\n');
          const imgUrl = results[0]?.img;
          if (imgUrl) {
            await sock.sendMessage(jid, { image: { url: imgUrl }, caption: txt }, { quoted: msg });
          } else {
            await reply(sock, jid, txt, msg);
          }
        } catch(e) { await reply(sock, jid, `❌ Play Store: ${e.message}`, msg); }
        break;
      }

      // ── DEFAULT ───────────────────────────────────────────
      default: {
        // Silencieux — pas de réponse pour les commandes inconnues
        break;
      }
    }
  } catch(e) {
    console.error(`Err [${command}]:`, e.message);
    try { await sock.sendMessage(jid, { text: `❌ ${e.message}` }); } catch(_) {}
  }
}

// ============================================================
// LANCEMENT
// ============================================================
console.log('\n  ⚡ SEIGNEUR TD — LE SEIGNEUR DES APPAREILS 🇹🇩\n');

connectToWhatsApp().catch(err => {
  console.error('Erreur demarrage:', err);
  process.exit(1);
});

process.on('uncaughtException', err => {
  const msg = err.message || '';
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
