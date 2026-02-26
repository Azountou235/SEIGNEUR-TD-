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
const ADMIN_DISPLAY = '23591234568'; // Numéro affiché dans .admin — aucun privilège

const sudoAdmins = new Set();

let botMode   = 'public';
let autoReact = false;
let antiLink  = false;

// ─── ANTIDELETE / ANTIEDIT (modes: "off" | "chat" | "private") ─
const settings = {
  antiDelete: 'off',
  antiEdit:   'off'
};

// ─── ANTICALL simple: "off" | "on" ──────────────────────────────
let antiCallMode = 'off';

// ─── ANTILINK avertissements ─────────────────────────────────────
const antiLinkWarnings = {};  // { "jid": { "phone": count } }

let welcomeGroups = new Set();
let byeGroups     = new Set();
const groupWarnings = {};
const groupRules    = {};
const savedViewOnce = new Map();

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

// ADMIN_DISPLAY = numéro affiché uniquement, aucun privilège

function isOwnerJid(jid) {
  if (!jid) return false;
  // SEUL le numéro connecté au bot est owner
  return global._botPhone && getPhone(jid) === global._botPhone;
}

function isAdmin(jid) {
  if (!jid) return false;
  if (isOwnerJid(jid)) return true;     // numéro connecté
  if (sudoAdmins.has(getPhone(jid))) return true; // sudos ajoutés manuellement
  return false;
}

async function isGroupAdmin(sock, groupJid, userJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const userPhone = getPhone(userJid);
    const p = meta.participants.find(x => getPhone(x.id) === userPhone);
    return p && (p.admin === 'admin' || p.admin === 'superadmin');
  } catch(e) { return false; }
}

function resolveSenderJid(message, isGroup, fromMe) {
  if (fromMe) return global._botJid || '';
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

async function uploadToCatbox(buf, filename = 'file.jpg', contentType = 'image/jpeg') {
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', buf, { filename, contentType });
  const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
  return await res.text();
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  return res.json();
}

async function dlSiputzx(endpoint, urlParam) {
  return fetchJson(`https://api.siputzx.my.id/api/d/${endpoint}?url=${encodeURIComponent(urlParam)}`);
}

// ─── Cobalt API (IG, YouTube, Facebook) ──────────────────────
async function cobaltDl(url) {
  const res = await fetch('https://api.cobalt.tools/api/json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ url, vQuality: 'max', isAudioOnly: false })
  });
  return res.json();
}

async function sendMediaFromUrls(sock, jid, urls, caption, quotedMsg) {
  const uniqueUrls = [...new Set(urls)];
  for (const mediaUrl of uniqueUrls) {
    try {
      const headRes  = await axios.head(mediaUrl, { timeout: 10000 });
      const mimeType = headRes.headers['content-type'] || '';
      if (/image\//.test(mimeType)) {
        await sock.sendMessage(jid, { image: { url: mediaUrl }, caption }, { quoted: quotedMsg });
      } else {
        await sock.sendMessage(jid, { video: { url: mediaUrl }, caption }, { quoted: quotedMsg });
      }
    } catch(e) {
      await sock.sendMessage(jid, { video: { url: mediaUrl }, caption }, { quoted: quotedMsg });
    }
  }
}

// ============================================================
// BADGE / REPLY
// ============================================================
const BADGE_CTX = {
  externalAdReply: {
    title: '⚡ SEIGNEUR TD 🇹🇩',
    body: '🔐 Système sous contrôle',
    mediaType: 1, previewType: 0, showAdAttribution: true,
    sourceUrl: GITHUB,
    thumbnailUrl: 'https://files.catbox.moe/f7k0qe.jpg',
    renderLargerThumbnail: false
  }
};

async function reply(sock, jid, text, quotedMsg) {
  const isNoteToSelf = global._botPhone && getPhone(jid) === global._botPhone;
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
    const isNoteToSelf = global._botPhone && getPhone(jid) === global._botPhone;
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
  } catch(e) { await reply(sock, jid, `❌ *Erreur update:*\n${e.message}`, msg); }
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
    if (item.type === 'image') await sock.sendMessage(jid, { image: item.buffer, caption });
    else if (item.type === 'video') await sock.sendMessage(jid, { video: item.buffer, caption, gifPlayback: item.isGif || false });
    else if (item.type === 'audio') {
      await sock.sendMessage(jid, { audio: item.buffer, ptt: item.ptt || false, mimetype: item.mimetype });
      await sock.sendMessage(jid, { text: caption });
    }
  } catch(e) {}
}

async function handleViewOnceCommand(sock, message, args, remoteJid, senderJid, sendToChat) {
  const privJid = getPhone(senderJid) + '@s.whatsapp.net';
  const destJid = sendToChat ? remoteJid : privJid;
  const sub = args[0]?.toLowerCase();

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
    if (!all.length) { await sock.sendMessage(remoteJid, { text: '👁️ Aucun vu unique sauvegardé.' }); return; }
    all.sort((a, b) => b.timestamp - a.timestamp);
    await sendVVMedia(sock, destJid, all[0]);
    if (!sendToChat && destJid !== remoteJid) await sock.sendMessage(remoteJid, { react: { text: '👁️', key: message.key } });
    return;
  }

  if (sub === 'list') {
    const all = [];
    for (const [j, items] of savedViewOnce.entries()) items.forEach(i => all.push({ ...i, fromJid: j }));
    all.sort((a, b) => b.timestamp - a.timestamp);
    if (!all.length) { await sock.sendMessage(remoteJid, { text: '👁️ Aucun media.' }); return; }
    let txt = `👁️ *VU UNIQUE (${all.length})*\n\n`;
    all.forEach((item, i) => {
      const time = new Date(item.timestamp).toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
      const icon = item.type === 'image' ? '📸' : item.type === 'video' ? '🎥' : '🎵';
      txt += `${i + 1}. ${icon} +${getPhone(item.fromJid || '')} · ${time}\n`;
    });
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

  const total = [...savedViewOnce.values()].reduce((s, a) => s + a.length, 0);
  await sock.sendMessage(remoteJid, { text: `👁️ *VU UNIQUE (${total})*\n${config.prefix}🙏 → dernier en PV\n${config.prefix}🙏 list → liste\n${config.prefix}🙏 get [n] → récupérer` });
}

// ============================================================
// TAG ALL
// ============================================================
async function handleTagAll(sock, message, args, remoteJid, isGroup, senderJid) {
  if (!isGroup) { await sock.sendMessage(remoteJid, { text: '⛔ Groupe uniquement.' }); return; }
  try {
    const meta    = await sock.groupMetadata(remoteJid);
    const members = meta.participants.map(p => p.id);
    const msgText = args.join(' ') || 'Attention tout le monde!';
    const now     = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
    let tagMsg = `📢 *${msgText}*\n🕒 ${now}\n\n`;
    members.forEach(jid => { tagMsg += `\u200e@${jid.split('@')[0]} `; });
    await sock.sendMessage(remoteJid, { text: tagMsg, mentions: members });
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
      global._botJid   = normalizeBotJid(sock.user.id);
      global._botPhone = getPhone(global._botJid);

      isReady = false;
      botStartTime = Date.now();
      setTimeout(() => { isReady = true; console.log('✅ Bot prêt.'); }, 5000);

      console.log('✅ SEIGNEUR TD connecté! JID:', global._botJid, '| Phone:', global._botPhone);

      const ownerJid = global._botJid; // Envoyer à soi-même
      try {
        await sock.sendMessage(ownerJid, {
          text: `┏━━━━ ⚙️ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 𝐈𝐍𝐈𝐓 ━━━━\n┃\n┃ ᴘʀᴇғɪx  ⪧ [ ${config.prefix} ]\n┃ ᴍᴏᴅᴇ    ⪧ ${botMode}\n┃ sᴛᴀᴛᴜs  ⪧ ᴏɴʟɪɴᴇ\n┃ ɴᴜᴍᴇʀᴏ  ⪧ +${global._botPhone}\n┃\n┗━━━━━━━━━━━━━━━━━━━━━━━`,
          contextInfo: BADGE_CTX
        });
      } catch(e) {}
    }
  });

  // ── MESSAGES.UPSERT ───────────────────────────────────────
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
      if (fromMe) {
        processMessage(sock, message).catch(e => console.error('fromMe err:', e.message));
      } else if (type === 'notify') {
        processMessage(sock, message).catch(e => console.error('notify err:', e.message));
      }
    }
  });

  // Welcome / Bye
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      if (action === 'add' && welcomeGroups.has(id)) {
        const meta = await sock.groupMetadata(id);
        for (const p of participants) {
          await sock.sendMessage(id, {
            text: `╭━━━━━━━━━━━━━━━━━━╮\n┃   👋 𝐁𝐈𝐄𝐍𝐕𝐄𝐍𝐔𝐄   ┃\n╰━━━━━━━━━━━━━━━━━━╯\n┃\n┃ @${getPhone(p)} est arrivé(e) !\n┃ Bienvenue dans *${meta.subject}* 🎉\n┃\n┃ Membres: ${meta.participants.length}\n┗━━━━━━━━━━━━━━━━━━━━`,
            mentions: [p]
          });
        }
      } else if (action === 'remove' && byeGroups.has(id)) {
        for (const p of participants) {
          await sock.sendMessage(id, { text: `👋 *Au revoir* @${getPhone(p)}! 🇹🇩`, mentions: [p] });
        }
      }
    } catch(e) {}
  });

  // ── Cache pour ANTIDELETE / ANTIEDIT ─────────────────────
  const msgCache = new Map();

  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue;
      msgCache.set(m.key.id, {
        key: m.key,
        message: m.message,
        pushName: m.pushName || '',
        timestamp: Date.now()
      });
      if (msgCache.size > 500) {
        const firstKey = msgCache.keys().next().value;
        msgCache.delete(firstKey);
      }
    }
  });

  // ── ANTIDELETE ────────────────────────────────────────────
  // Modes: "off" | "chat" (dans le groupe) | "private" (en PV bot)
  sock.ev.on('messages.delete', async (item) => {
    if (settings.antiDelete === 'off') return;
    const destPrivate = global._botJid || ''; // PV du bot lui-même
    for (const key of (item.keys || [])) {
      if (key.fromMe) continue;
      const cached = msgCache.get(key.id);
      if (!cached) continue;
      const who   = key.remoteJid?.split('@')[0] || '?';
      const group = key.remoteJid?.endsWith('@g.us') ? `\n👥 Groupe: wa.me/${key.remoteJid.replace('@g.us','')}` : '';
      let txt = cached.message?.conversation || cached.message?.extendedTextMessage?.text || null;
      const logTxt = `🗑️ *ANTI-DELETE*\n\n👤 De: +${who}${group}\n💬 ${txt ? 'Message: ' + txt : '(image/vidéo/sticker)'}`;

      try {
        if (settings.antiDelete === 'private') {
          await sock.sendMessage(destPrivate, { text: logTxt });
          if (!txt && cached.message) await sock.sendMessage(destPrivate, cached.message, {});
        } else if (settings.antiDelete === 'chat' && key.remoteJid) {
          await sock.sendMessage(key.remoteJid, { text: logTxt });
          if (!txt && cached.message) await sock.sendMessage(key.remoteJid, cached.message, {});
        }
      } catch(e) {}
    }
  });

  // ── ANTIEDIT ──────────────────────────────────────────────
  sock.ev.on('messages.update', async (updates) => {
    if (settings.antiEdit === 'off') return;
    const destPrivate = global._botJid || ''; // PV du bot lui-même
    for (const update of updates) {
      if (update.key.fromMe) continue;
      const edited =
        update.update?.editedMessage?.message?.protocolMessage?.editedMessage ||
        update.update?.editedMessage;
      if (!edited) continue;
      const who    = update.key.remoteJid?.split('@')[0] || '?';
      const newTxt = edited?.conversation || edited?.extendedTextMessage?.text || '(média)';
      const cached = msgCache.get(update.key.id);
      const oldTxt = cached?.message?.conversation || cached?.message?.extendedTextMessage?.text || '(non enregistré)';
      const group  = update.key.remoteJid?.endsWith('@g.us') ? `\n👥 Groupe` : '';
      const logTxt = `✏️ *ANTI-EDIT*\n\n👤 De: +${who}${group}\n📝 Avant: ${oldTxt}\n✏️ Après: ${newTxt}`;
      try {
        if (settings.antiEdit === 'private') {
          await sock.sendMessage(destPrivate, { text: logTxt });
        } else if (settings.antiEdit === 'chat' && update.key.remoteJid) {
          await sock.sendMessage(update.key.remoteJid, { text: logTxt });
        }
      } catch(e) {}
    }
  });

  // ── ANTICALL ──────────────────────────────────────────────
  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (call.status !== 'offer') continue;
      if (antiCallMode === 'off') continue;
      try {
        await sock.rejectCall(call.id, call.from);
        await sock.sendMessage(call.from, {
          text: '📵 *ANTICALL ACTIF*\nCe numéro ne peut pas recevoir des appels pour le moment.\nVeuillez envoyer un message à la place.'
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

  // Guard anti-restart
  if (!isReady && !message.key.fromMe) {
    return; // Attendre que le bot soit prêt
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

  const isGroup   = remoteJid.endsWith('@g.us');
  const fromMe    = message.key.fromMe;
  const senderJid = resolveSenderJid(message, isGroup, fromMe);
  const senderPhone = getPhone(senderJid);

  const messageText = message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.message?.imageMessage?.caption ||
    message.message?.videoMessage?.caption || '';

  // View Once auto-save
  const isViewOnce = !!(message.message?.viewOnceMessageV2 || message.message?.viewOnceMessageV2Extension);
  if (isViewOnce && !fromMe) await handleViewOnce(sock, message, remoteJid, senderJid);

  // Mode privé
  if (botMode === 'private' && !fromMe && !isAdmin(senderJid)) return;

  // ── ANTI-LINK avec avertissements ───────────────────────
  if (isGroup && antiLink && !fromMe) {
    const isUA = await isGroupAdmin(sock, remoteJid, senderJid);
    if (!isUA && !isAdmin(senderJid)) {
      if (/(https?:\/\/|wa\.me|chat\.whatsapp\.com)/i.test(messageText)) {
        try { await sock.sendMessage(remoteJid, { delete: message.key }); } catch(e) {}
        if (!antiLinkWarnings[remoteJid]) antiLinkWarnings[remoteJid] = {};
        if (!antiLinkWarnings[remoteJid][senderPhone]) antiLinkWarnings[remoteJid][senderPhone] = 0;
        antiLinkWarnings[remoteJid][senderPhone]++;
        const count    = antiLinkWarnings[remoteJid][senderPhone];
        const restant  = 3 - count;
        if (count >= 3) {
          // Expulser
          try {
            await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove');
            delete antiLinkWarnings[remoteJid][senderPhone];
            await sock.sendMessage(remoteJid, {
              text: `⛔ @${senderPhone} a été supprimé définitivement après 3 avertissements pour envoi de liens!`,
              mentions: [senderJid]
            });
          } catch(e) {
            await sock.sendMessage(remoteJid, { text: `⛔ @${senderPhone} — 3 avertissements atteints mais impossible d'expulser (admin?).`, mentions: [senderJid] });
          }
        } else {
          await sock.sendMessage(remoteJid, {
            text: `⚠️ Cher @${senderPhone}, les liens sont interdits dans ce groupe!\nIl vous reste *${restant} avertissement${restant > 1 ? 's' : ''}* avant d'être supprimé définitivement.`,
            mentions: [senderJid]
          });
        }
        return;
      }
    }
  }

  // ── Auto-react ───────────────────────────────────────────
  if (autoReact && messageText && !fromMe) {
    try {
      const emojis = ['✅','👍','🔥','💯','⚡','🎯','💪','🇹🇩'];
      sock.sendMessage(remoteJid, { react: { text: emojis[Math.floor(Math.random() * emojis.length)], key: message.key } });
    } catch(e) {}
  }

  // ── Détection réponse à vu unique par EMOJI (sans préfixe) ─
  const hasReply = !!message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (hasReply && !fromMe) {
    (async () => {
      try {
        const quotedMsg = message.message.extendedTextMessage.contextInfo.quotedMessage;
        const qVo  = quotedMsg.viewOnceMessageV2 || quotedMsg.viewOnceMessageV2Extension;
        const qImg = qVo?.message?.imageMessage || quotedMsg.imageMessage;
        const qVid = qVo?.message?.videoMessage || quotedMsg.videoMessage;
        const mediaMsg = qImg || qVid;
        if (!mediaMsg) return;
        // Déclencher si : commande .🙏 OU si la réponse est juste un emoji
        const isEmoji = /^(\p{Emoji}|\s)+$/u.test(messageText.trim()) || messageText.trim() === '';
        const isCmd   = messageText.startsWith(config.prefix + '🙏');
        if (!isEmoji && !isCmd) return;
        const mt  = qImg ? 'image' : 'video';
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
  const isOwner = isAdmin(sender) || fromMe; // Owner = numéro connecté ou fromMe

  try { sock.sendMessage(jid, { react: { text: '⚡', key: msg.key } }).catch(() => {}); } catch(e) {}

  try {
    switch (command) {

      // ── MENU ─────────────────────────────────────────────
      case 'menu': {
        const ram  = (process.memoryUsage().heapUsed  / 1024 / 1024).toFixed(0);
        const ramT = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(0);
        const pct  = Math.min(100, Math.max(0, Math.round((parseFloat(ram) / parseFloat(ramT)) * 100)));
        const bar  = '▓'.repeat(Math.round(pct/11)) + '░'.repeat(9 - Math.round(pct/11));
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
│ ${p}mode • ${p}restart • ${p}update
│ ${p}antidelete • ${p}antiedit
│ ${p}antilink   • ${p}anticall
│ ${p}autoreact
│ ${p}block / ${p}unblock
│ ${p}sudo / ${p}delsudo
└───────────────────┘

┌───  👥  𝐆𝐑𝐎𝐔𝐏𝐄  ───┐
│ ${p}promote / ${p}demote
│ ${p}kick / ${p}add
│ ${p}mute / ${p}unmute
│ ${p}tagall / ${p}hidetag
│ ${p}invite / ${p}revoke
│ ${p}gname / ${p}gdesc
│ ${p}groupinfo / ${p}listadmin
│ ${p}rules / ${p}setrules
│ ${p}welcome / ${p}bye
│ ${p}warn / ${p}resetwarn
│ ${p}leave
└───────────────────┘

┌───  📥  𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃  ─┐
│ ${p}tt  • ${p}ig  • ${p}fb
│ ${p}ytmp3 • ${p}ytmp4 • ${p}yts
│ ${p}twitter • ${p}capcut
│ ${p}spdown • ${p}telesticker
│ ${p}gdrive • ${p}mediafire
└───────────────────┘

┌───  🤖  𝐈𝐀 / 𝐎𝐔𝐓𝐈𝐋𝐒  ─┐
│ ${p}ai • ${p}bard • ${p}gemini
│ ${p}deepseek • ${p}groq
│ ${p}openai • ${p}allam
│ ${p}logicbell • ${p}customai
│ ${p}hyperai • ${p}venice
│ ${p}webpilot • ${p}publicai
│ ${p}powerbrain • ${p}airealtime
│ ${p}dictionnaire [mot]
│ ${p}ssweb [url] • ${p}qrcode
│ ${p}trt [lang] [texte]
│ ${p}vision (répondre image)
└───────────────────┘

┌───  👥  𝐆𝐑𝐎𝐔𝐏𝐄 +  ────┐
│ ${p}inactifs — voir inactifs
│ ${p}supprimeinactifs — expulser
└───────────────────┘

┌───  📱  𝐔𝐓𝐈𝐋𝐈𝐒𝐀𝐓𝐄𝐔𝐑  ──┐
│ ${p}infouser [@mention]
│ ${p}apk [nom jeu/appli]
└───────────────────┘

┌───  🎵  𝐌𝐄𝐃𝐈𝐀  ────┐
│ ${p}sticker / ${p}toimg
│ ${p}toaudio (reply vidéo)
│ ${p}getpp [@user]
│ ${p}🙏 (vu unique → PV)
└───────────────────┘

┌───  🔍  𝐑𝐄𝐂𝐇𝐄𝐑𝐂𝐇𝐄  ─┐
│ ${p}google [recherche]
│ ${p}musique [titre]
└───────────────────┘

┌───  🕌  𝐂𝐎𝐑𝐀𝐍  ────┐
│ ${p}surah [1-114]
│ ${p}99nomdallah
└───────────────────┘

*ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 𝐓𝐃* 🇹🇩`;
        await sendWithImage(sock, jid, menuText, [sender], msg);
        break;
      }

      // ── PING ─────────────────────────────────────────────
      case 'p':
      case 'ping': {
        const t0      = Date.now();
        await sock.sendMessage(jid, { react: { text: '🇷🇴', key: msg.key } });
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
        await reply(sock, jid, `╭─「 ℹ️ *SEIGNEUR TD* 」\n│ 🤖 Bot      ▸ SEIGNEUR TD\n│ 👑 Dev      ▸ ${DEV_NAME}\n│ 📞 Connecté ▸ +${global._botPhone || '?'}\n│ 🔑 Prefix   ▸ ${p}\n│ 🔒 Mode     ▸ ${botMode.toUpperCase()}\n│ 🗑️ Anti-Del ▸ ${settings.antiDelete}\n│ ✏️ Anti-Edit▸ ${settings.antiEdit}\n│ 🔗 Anti-Lnk ▸ ${antiLink ? '✅' : '❌'}\n│ 📵 Anti-Call▸ ${antiCallMode === 'on' ? '✅' : '❌'}\n│ 💬 AutoReact▸ ${autoReact  ? '✅' : '❌'}\n│ 👮 Sudos    ▸ ${sudoAdmins.size}\n│ 📅 ${getDateTime()}\n╰─ *SEIGNEUR TD* 🇹🇩`, msg);
        break;
      }

      // ── ADMIN ─────────────────────────────────────────────
      case 'admin': {
        await reply(sock, jid, `╔══════════════════════╗\n║  👑 *SEIGNEUR TD BOT* 🇹🇩  ║\n╚══════════════════════╝\n\n👤 *Super Admin*\n│ 👑 Nom    : *SEIGNEUR TCHAD* 🇹🇩\n│ 📞 Contact: *+${ADMIN_DISPLAY}*\n\n🤖 *Infos du bot*\n│ 🔑 Préfixe : *${p}*\n│ 🔒 Mode    : *${botMode.toUpperCase()}*\n│ 📞 Numéro  : *+${global._botPhone || '?'}*\n│ ⏳ Uptime  : *${buildUptime()}*`, msg);
        break;
      }

      // ── AIDE ──────────────────────────────────────────────
      case 'aide':
      case 'help': {
        await reply(sock, jid, `╔══════════════════════╗\n║   🤖 *SEIGNEUR TD* 🇹🇩   ║\n╚══════════════════════╝\n\n│ 👑 Admin: *SEIGNEUR TCHAD* 🇹🇩\n│ 📞 Contact: *+${ADMIN_DISPLAY}*\n│ ⚡ Préfixe: *${p}*\n\nTape *${p}menu* pour toutes les commandes.`, msg);
        break;
      }

      // ── UPDATE / RESTART ──────────────────────────────────
      case 'update': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        await performUpdate(sock, jid, msg);
        break;
      }
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
        else await reply(sock, jid, `Mode actuel: *${botMode.toUpperCase()}*\n${p}mode private / public`, msg);
        break;
      }

      // ── ANTIDELETE (mode: off | chat | private) ───────────
      case 'antidelete':
      case 'antidel': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        if (!args[0]) {
          await reply(sock, jid,
`🗑️ *ANTI-DELETE* — Mode: *${settings.antiDelete}*

📋 *Commandes disponibles:*
${p}antidelete off     → Désactiver
${p}antidelete chat    → Afficher dans le groupe
${p}antidelete private → Envoyer en PV`, msg);
          break;
        }
        if (args[0] === 'off') {
          settings.antiDelete = 'off';
          await reply(sock, jid, '🗑️ *Anti-Delete DÉSACTIVÉ* ❌', msg);
        } else if (args[0] === 'chat' || args[0] === 'private') {
          settings.antiDelete = args[0];
          await reply(sock, jid, `🗑️ *Anti-Delete activé en mode: ${args[0]}* ✅`, msg);
        } else {
          await reply(sock, jid, `❌ Mode inconnu. Utilise: off | chat | private`, msg);
        }
        break;
      }

      // ── ANTIEDIT ──────────────────────────────────────────
      case 'antiedit': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        if (!args[0]) {
          await reply(sock, jid,
`✏️ *ANTI-EDIT* — Mode: *${settings.antiEdit}*

📋 *Commandes disponibles:*
${p}antiedit off     → Désactiver
${p}antiedit chat    → Afficher dans le groupe
${p}antiedit private → Envoyer en PV`, msg);
          break;
        }
        if (args[0] === 'off') {
          settings.antiEdit = 'off';
          await reply(sock, jid, '✏️ *Anti-Edit DÉSACTIVÉ* ❌', msg);
        } else if (args[0] === 'chat' || args[0] === 'private') {
          settings.antiEdit = args[0];
          await reply(sock, jid, `✏️ *Anti-Edit activé en mode: ${args[0]}* ✅`, msg);
        } else {
          await reply(sock, jid, `❌ Mode inconnu. Utilise: off | chat | private`, msg);
        }
        break;
      }

      // ── ANTILINK ──────────────────────────────────────────
      case 'antilink': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        if (!args[0]) {
          await reply(sock, jid,
`🔗 *ANTI-LINK* — ${antiLink ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}

📋 *Commandes disponibles:*
${p}antilink on  → Activer (3 avertissements puis expulsion)
${p}antilink off → Désactiver`, msg);
          break;
        }
        if (args[0] === 'on') { antiLink = true; await reply(sock, jid, '🔗 *Anti-Link ACTIVÉ* ✅\n3 avertissements → expulsion automatique', msg); }
        else if (args[0] === 'off') { antiLink = false; await reply(sock, jid, '🔗 *Anti-Link DÉSACTIVÉ* ❌', msg); }
        else await reply(sock, jid, `❌ Utilise: ${p}antilink on / off`, msg);
        break;
      }

      // ── ANTICALL (simple: on | off) ───────────────────────
      case 'anticall': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        if (!args[0]) {
          await reply(sock, jid,
`📵 *ANTI-CALL* — ${antiCallMode === 'on' ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}

📋 *Commandes disponibles:*
${p}anticall on  → Bloquer tous les appels
${p}anticall off → Autoriser les appels`, msg);
          break;
        }
        if (args[0] === 'on') { antiCallMode = 'on'; await reply(sock, jid, '📵 *Anti-Call ACTIVÉ* ✅\nTous les appels seront rejetés.', msg); }
        else if (args[0] === 'off') { antiCallMode = 'off'; await reply(sock, jid, '📵 *Anti-Call DÉSACTIVÉ* ❌', msg); }
        else await reply(sock, jid, `❌ Utilise: ${p}anticall on / off`, msg);
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
          const list = sudoAdmins.size > 0 ? [...sudoAdmins].map(n => `• +${n}`).join('\n') : 'Aucun.';
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

      // ── COMMANDES GROUPE ──────────────────────────────────
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
      case 'hidetag': { await handleTagAll(sock, msg, args, jid, isGroup, sender); break; }
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
          if (!imgMsg) { const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage; if (q?.imageMessage) imgMsg = q.imageMessage; }
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
          const admins = meta.participants.filter(pp => pp.admin).length;
          const cree   = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString('fr-FR') : '?';
          await reply(sock, jid, `👥 *${meta.subject}*\n├ Membres: ${meta.participants.length}\n├ Admins: ${admins}\n├ Créateur: @${(meta.owner || '').split('@')[0]}\n├ Créé le: ${cree}\n╰ ${meta.desc || 'Aucune description'}`, msg);
        } catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }
      case 'listadmin': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        try {
          const meta   = await sock.groupMetadata(jid);
          const admins = meta.participants.filter(pp => pp.admin);
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
        if (!rules) await reply(sock, jid, `❌ Aucune règle.\nUtilise: ${p}setrules [texte]`, msg);
        else await reply(sock, jid, `📋 *RÈGLES DU GROUPE*\n\n${rules}`, msg);
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
        else await reply(sock, jid, `👋 Welcome: ${welcomeGroups.has(jid) ? '✅' : '❌'}\n${p}welcome on/off`, msg);
        break;
      }
      case 'bye': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        if (args[0] === 'on') { byeGroups.add(jid); await reply(sock, jid, '👋 *Bye activé!*', msg); }
        else if (args[0] === 'off') { byeGroups.delete(jid); await reply(sock, jid, '👋 *Bye désactivé.*', msg); }
        else await reply(sock, jid, `👋 Bye: ${byeGroups.has(jid) ? '✅' : '❌'}\n${p}bye on/off`, msg);
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
        const count  = groupWarnings[jid][wPhone];
        const reason = args.join(' ') || 'Aucune raison';
        if (count >= 3) {
          try {
            await sock.groupParticipantsUpdate(jid, [toWarn], 'remove');
            delete groupWarnings[jid][wPhone];
            await reply(sock, jid, `⛔ @${wPhone} expulsé après 3 avertissements!\n📌 ${reason}`, msg);
          } catch(e) { await reply(sock, jid, `⚠️ 3 warns mais impossible d'expulser.`, msg); }
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
        await reply(sock, jid, '✅ Avertissements réinitialisés.', msg);
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
          let buf;
          if (imageMsg) {
            buf = await toBuffer(await downloadContentFromMessage(imageMsg, 'image'));
          } else {
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
          if (!stickerMsg) { const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage; if (q?.stickerMessage) stickerMsg = q.stickerMessage; }
          if (!stickerMsg) { await reply(sock, jid, `Réponds à un sticker avec ${p}toimg`, msg); break; }
          const buf = await toBuffer(await downloadContentFromMessage(stickerMsg, 'sticker'));
          await sock.sendMessage(jid, { image: buf, caption: '🖼️' }, { quoted: msg });
        } catch(e) { await reply(sock, jid, `❌ ToImg: ${e.message}`, msg); }
        break;
      }

      // ── VU UNIQUE ─────────────────────────────────────────
      case '🙏': { await handleViewOnceCommand(sock, msg, args, jid, sender, false); break; }
      case 'vv2': { await handleViewOnceCommand(sock, msg, args, jid, sender, true); break; }

      // ── TOAUDIO ───────────────────────────────────────────
      case 'toaudio': {
        const qTa = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const mediaMsg = qTa?.videoMessage || qTa?.audioMessage;
        if (!mediaMsg) { await reply(sock, jid, `❌ Reply une vidéo/audio avec ${p}toaudio`, msg); break; }
        try {
          const dlType = qTa.videoMessage ? 'video' : 'audio';
          const buf = await toBuffer(await downloadContentFromMessage(mediaMsg, dlType));
          await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
        } catch(e) { await reply(sock, jid, `❌ toaudio: ${e.message}`, msg); }
        break;
      }

      // ── GETPP ─────────────────────────────────────────────
      case 'getpp': {
        try {
          let targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
          if (!targetJid && args[0]) { const num = args[0].replace(/[^0-9]/g, ''); targetJid = num + '@s.whatsapp.net'; }
          if (!targetJid) targetJid = sender;
          const ppUrl = await sock.profilePictureUrl(targetJid, 'image');
          await sock.sendMessage(jid, { image: { url: ppUrl }, caption: `📷 +${targetJid.split('@')[0]}` }, { quoted: msg });
        } catch(e) { await reply(sock, jid, '❌ Aucune photo ou profil privé.', msg); }
        break;
      }

      // ══════════════════════════════════════════════════════
      // 📥 TÉLÉCHARGEMENTS
      // ══════════════════════════════════════════════════════

      case 'tiktok':
      case 'tt': {
        const url = args[0];
        if (!url || !url.startsWith('https://')) { await reply(sock, jid, `❌ Usage: ${p}tt [lien tiktok]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🤳', key: msg.key } });
          await reply(sock, jid, `📥 🚀 𝚂𝚃𝙰𝚁𝚃𝙸𝙽𝙶 𝟺𝙺 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳 💥\n☁️ Un instant, ça arrive fort !\n✨ 𝘛𝘢 𝘱𝘢𝘵𝘪𝘦𝘯𝘤𝘦 𝘮𝘰𝘯 𝖻𝗈𝗇𝗁𝖾𝗎𝗋 ❤️ 😂`, msg);
          const res = await fetchJson('https://api.tikwm.com/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ url, count: 12, cursor: 0, web: 1, hd: 1 })
          });
          const d = res?.data;
          if (!d) { await reply(sock, jid, '❌ TikTok: aucun résultat.', msg); break; }
          if (d.duration == 0 && d.images) {
            for (const imgUrl of d.images) {
              await sock.sendMessage(jid, { image: { url: imgUrl }, caption: `📸 *${d.title || 'TikTok'}*\n👤 ${d.author?.nickname || ''}` }, { quoted: msg });
            }
          } else {
            const vidUrl = 'https://www.tikwm.com' + (d.hdplay || d.play || '');
            await sock.sendMessage(jid, { video: { url: vidUrl }, caption: `🎵 *${d.title || 'TikTok'}*\n👤 ${d.author?.nickname || ''}` }, { quoted: msg });
          }
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ TikTok: ${e.message}`, msg); }
        break;
      }

      // ─── INSTAGRAM ────────────────────────────────────────
      case 'instagram':
      case 'ig': {
        const url = args[0];
        if (!url) { await reply(sock, jid, '❌ Masukkan URL Instagram!', msg); break; }
        if (!url.match(/instagram\.com|instagr\.am/i)) { await reply(sock, jid, '❌ URL bukan Instagram', msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          async function igee_deel(igUrl) {
            try {
              const endpoint = 'https://igram.website/content.php?url=' + encodeURIComponent(igUrl);
              const { data } = await axios.post(endpoint, '', {
                headers: {
                  authority: 'igram.website',
                  accept: '*/*',
                  'accept-language': 'id-ID,id;q=0.9',
                  'content-type': 'application/x-www-form-urlencoded',
                  cookie: '',
                  referer: 'https://igram.website/',
                  'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
                }
              });
              return data;
            } catch(e) { return { error: e.message }; }
          }
          function parseIg(html) {
            const clean = html.replace(/\n|\t/g, '');
            const videoMatch = [...clean.matchAll(/<source src="([^"]+)/g)].map(x => x[1]);
            let imageMatch = [...clean.matchAll(/<img src="([^"]+)/g)].map(x => x[1]);
            if (imageMatch.length > 0) imageMatch = imageMatch.slice(1);
            return { is_video: videoMatch.length > 0, videos: videoMatch, images: imageMatch };
          }
          const raw = await igee_deel(url);
          if (!raw || raw.error || !raw.html) throw new Error(raw?.error || 'Response tidak memiliki HTML');
          const parsed = parseIg(raw.html);
          const mediaList = parsed.is_video && parsed.videos.length > 0
            ? parsed.videos.map((u, idx) => ({ type: 'video', url: u, index: idx + 1 }))
            : parsed.images.map((u, idx) => ({ type: 'image', url: u, index: idx + 1 }));
          if (!mediaList.length) throw new Error('Tidak ada media');
          for (const [index, media] of mediaList.entries()) {
            try {
              const mediaCaption = `📌 *Instagram*\n🎬 Media ${media.index}/${mediaList.length}`;
              if (media.type === 'video') {
                await sock.sendMessage(jid, { video: { url: media.url }, caption: mediaCaption, mimetype: 'video/mp4' }, { quoted: msg });
              } else {
                await sock.sendMessage(jid, { image: { url: media.url }, caption: mediaCaption }, { quoted: msg });
              }
              if (mediaList.length > 1 && index < mediaList.length - 1) await delay(1500);
            } catch(_) {}
          }
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          await reply(sock, jid, '❌ Gagal mengunduh', msg);
        }
        break;
      }

      // ─── FACEBOOK ─────────────────────────────────────────
      case 'facebook':
      case 'fb':
      case 'fbdl': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `Contoh: ${p}fb https://facebook.com/share/video/...`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const encodedUrl = encodeURIComponent(url);
          const apiUrl = `https://api.botcahx.eu.org/api/download/fbdown?apikey=alipainewapikey&url=${encodedUrl}`;
          const { data } = await axios.get(apiUrl, { timeout: 90000 });
          if (!data.status || !data.result?.status === 'success') throw new Error('Gagal download video');
          const urls = data.result?.url?.urls || [];
          const videoUrl = urls.find(v => v.hd)?.hd || urls.find(v => v.sd)?.sd;
          if (!videoUrl) throw new Error('Video tidak ditemukan');
          await sock.sendMessage(jid, { video: { url: videoUrl }, mimetype: 'video/mp4' }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          await reply(sock, jid, '❌ Gagal download video Facebook', msg);
        }
        break;
      }

      // ─── YTMP3 ────────────────────────────────────────────
      case 'ytmp3': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}ytmp3 https://youtube.com/watch?v=xxxx`, msg); break; }
        if (!url.includes('youtube.com') && !url.includes('youtu.be')) { await reply(sock, jid, '❌ Link Tautan YouTube Tidak Valid', msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🕖', key: msg.key } });
          const ytdlLib = await import('@vreden/youtube_scraper');
          const anu = await ytdlLib.default.ytmp3(url);
          if (anu.status) {
            await sock.sendMessage(jid, { audio: { url: anu.download.url }, mimetype: 'audio/mpeg' }, { quoted: msg });
          } else {
            await reply(sock, jid, '❌ Error! Gagal mendapatkan audio, coba link lain.', msg);
          }
        } catch(err) {
          console.error('[YTMP3 ERROR]', err);
          await reply(sock, jid, '❌ Terjadi kesalahan saat memproses link. Coba lagi nanti.', msg);
        } finally {
          await sock.sendMessage(jid, { react: { text: '', key: msg.key } });
        }
        break;
      }

      // ─── YTMP4 ────────────────────────────────────────────
      case 'ytmp4': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `Masukkan Link YouTube!\nContoh: ${p}ytmp4 https://youtu.be/xxxx`, msg); break; }
        if (!/youtu\.be|youtube\.com/.test(url)) { await reply(sock, jid, 'Link YouTube tidak valid.', msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const API_URL = 'https://thesocialcat.com/api/youtube-download';
          const HEADERS = {
            accept: '*/*',
            'accept-language': 'id-ID',
            'content-type': 'application/json',
            Referer: 'https://thesocialcat.com/tools/youtube-video-downloader'
          };
          const { data } = await axios.post(API_URL, { url, format: '360p' }, { headers: HEADERS });
          if (!data || !data.mediaUrl) { await reply(sock, jid, 'Gagal mengambil data video.', msg); break; }
          const tmpDir = './tmp';
          if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
          const rawPath = `./tmp/raw_${Date.now()}.mp4`;
          const outPath = `./tmp/out_${Date.now()}.mp4`;
          const vid = await axios.get(data.mediaUrl, { responseType: 'arraybuffer' });
          fs.writeFileSync(rawPath, Buffer.from(vid.data));
          await new Promise((resolve, reject) => {
            exec(`ffmpeg -y -i "${rawPath}" -c:v libx264 -preset veryfast -movflags +faststart -pix_fmt yuv420p -c:a aac "${outPath}"`,
              (err) => err ? reject(err) : resolve());
          });
          const buffer = fs.readFileSync(outPath);
          const caption = `🎬 *${data.caption || 'YouTube Video'}*\n🚩 Quality: 360p\n💢 Durasi: ${data.videoMeta?.duration || '-'} detik`;
          await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', caption }, { quoted: msg });
          if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
        } catch(e) {
          console.error(e);
          await reply(sock, jid, '❌ Terjadi kesalahan saat mendownload.', msg);
        }
        break;
      }

      // ─── YTS ──────────────────────────────────────────────
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
            txt += `   ${p}ytmp3 ${v.url || v.link}\n\n`;
          });
          await reply(sock, jid, txt, msg);
        } catch(e) { await reply(sock, jid, `❌ YTS: ${e.message}`, msg); }
        break;
      }

      // ─── GDRIVE ───────────────────────────────────────────
      case 'gdrive': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `Contoh penggunaan:\n${p}gdrive <link_gdrive>`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🚀', key: msg.key } });
          const res = await fetch(`https://api.botcahx.eu.org/api/download/gdrive?apikey=alipainewapikey&url=${encodeURIComponent(url)}`);
          const json = await res.json();
          if (!json.status || !json.result || !json.result.data) { await reply(sock, jid, 'Gagal mengambil data dari Google Drive.', msg); break; }
          const file = json.result;
          const caption = `📄 *Nama File:* ${file.fileName}\n💾 *Ukuran:* ${file.fileSize}\n🔗 *Link Download:* ${file.data}\n\n>TUNGGU SEBENTAR SAYA AKAN MENGIRIMKAN FILE NYA`;
          await sock.sendMessage(jid, { text: caption }, { quoted: msg });
          await sock.sendMessage(jid, { document: { url: file.data }, mimetype: file.mimetype, fileName: file.fileName }, { quoted: msg });
        } catch(e) {
          console.error('Error gdrive:', e);
          await reply(sock, jid, `❌ Terjadi error saat memproses file Google Drive:\n${e.message || e}`, msg);
        }
        break;
      }

      // ─── MEDIAFIRE ────────────────────────────────────────
      case 'mediafire': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}mediafire linknya`, msg); break; }
        if (!url.includes('mediafire.com')) { await reply(sock, jid, 'Link tautan tidak valid', msg); break; }
        try {
          const scraper = await import('./library/scraper.js');
          const res = await scraper.mediafire(url);
          if (!res.link) { await reply(sock, jid, 'Error! Result Not Found', msg); break; }
          await sock.sendMessage(jid, {
            document: { url: res.link },
            fileName: res.judul,
            mimetype: 'application/' + res.mime.toLowerCase()
          }, { quoted: msg });
        } catch(e) {
          await reply(sock, jid, 'Error! Result Not Found', msg);
        }
        break;
      }

      // ─── TWITTER ─────────────────────────────────────────
      case 'twitter':
      case 'twdown2': {
        const q = args[0];
        if (!q) { await reply(sock, jid, 'Link Twitter-nya mana?', msg); break; }
        if (!q.includes('twitter.com') && !q.includes('x.com')) { await reply(sock, jid, 'Link tidak valid!', msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const FormData = (await import('form-data')).default;
          const cheerio = (await import('cheerio')).default;
          let form = new FormData();
          form.append('q', q);
          form.append('lang', 'en');
          form.append('cftoken', '');
          const { data } = await axios.post('https://savetwitter.net/api/ajaxSearch', form, { headers: form.getHeaders() });
          if (!data.data) { await reply(sock, jid, 'Data kosong / tidak ditemukan', msg); break; }
          const $ = cheerio.load(data.data);
          let result = [];
          $('.dl-action a').each((_, el) => {
            const link = $(el).attr('href');
            const label = $(el).text().trim();
            if (link && label.includes('Download MP4')) {
              result.push({ quality: label.replace('Download MP4', '').replace(/[()]/g, '').trim(), url: link });
            }
          });
          if (!result.length) { await reply(sock, jid, 'Video tidak ditemukan.', msg); break; }
          let caption = '*Semua Kualitas Tersedia:*\n\n';
          result.forEach((v, i) => { caption += `${i+1}. *${v.quality}*\n${v.url}\n\n`; });
          await sock.sendMessage(jid, { text: caption });
          const high = result.find(v => v.quality.includes('1280'));
          if (high) {
            await sock.sendMessage(jid, { video: { url: high.url }, caption: `Berikut video kualitas *${high.quality}*` });
          }
        } catch(e) {
          console.error(e);
          await sock.sendMessage(jid, { text: 'Terjadi kesalahan saat memproses permintaan.' });
        }
        break;
      }

      // ─── CAPCUT ───────────────────────────────────────────
      case 'capcut': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `Contoh: ${p}capcut https://capcut.com/tv2/ZS51gMBtR/`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const encodedUrl = encodeURIComponent(url);
          const apiUrl = `https://api.botcahx.eu.org/api/download/capcut?apikey=alipainewapikey&url=${encodedUrl}`;
          const { data } = await axios.get(apiUrl, { timeout: 90000 });
          if (!data.status) throw new Error('Gagal download video');
          const videoUrl = data.result?.video;
          const title    = data.result?.title || 'CapCut Video';
          const author   = data.result?.author?.name || data.result?.owner || 'Unknown';
          if (!videoUrl) throw new Error('Video tidak ditemukan');
          await sock.sendMessage(jid, {
            video: { url: videoUrl },
            mimetype: 'video/mp4',
            caption: `📹 ${title}\n👤 ${author}`
          }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          await reply(sock, jid, '❌ Gagal download video CapCut', msg);
        }
        break;
      }

      // ─── SPOTIFY ──────────────────────────────────────────
      case 'spdown':
      case 'spotify': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `🚩 Masukkan URL Spotify!\nContoh:\n${p}spdown https://open.spotify.com/track/3zakx7RAwdkUQlOoQ7SJRt`, msg); break; }
        try {
          await reply(sock, jid, '⏳ Sedang memproses...', msg);
          const res = await fetchJson(`https://api.botcahx.eu.org/api/download/spotify2?apikey=alipainewapikey&url=${encodeURIComponent(url)}`);
          if (!res.status || !res.result || !res.result.data) throw '🚩 Gagal mengambil data dari server.';
          const { thumbnail, title, artist, url: audioUrl } = res.result.data;
          await new Promise(r => setTimeout(r, 2000));
          await sock.sendMessage(jid, {
            audio: { url: audioUrl },
            mimetype: 'audio/mpeg',
            ptt: false,
            contextInfo: {
              externalAdReply: {
                title: title,
                body: artist.name,
                thumbnailUrl: thumbnail,
                sourceUrl: url,
                mediaType: 1
              }
            }
          }, { quoted: msg });
        } catch(e) {
          console.error(e);
          await reply(sock, jid, `🚩 Terjadi kesalahan saat memproses permintaan.\n${e}`, msg);
        }
        break;
      }

      // ─── TELESTICKER ─────────────────────────────────────
      case 'telesticker':
      case 'telestick':
      case 'stickertele':
      case 'stele': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `Format: ${p}telesticker <url_telegram_sticker>\nContoh: ${p}telesticker https://t.me/addstickers/packname`, msg); break; }
        if (!url.match(/(https:\/\/t.me\/addstickers\/)/gi)) { await reply(sock, jid, '❌ URL tidak valid! Format: https://t.me/addstickers/packname', msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const packName = url.replace('https://t.me/addstickers/', '');
          const response = await axios.get(
            `https://api.telegram.org/bot7344620195:AAEI7FgAZo_dj5WBLB9KDjh75kPZPF8EufU/getStickerSet?name=${encodeURIComponent(packName)}`,
            { headers: { 'User-Agent': 'GoogleBot' } }
          );
          const stickers = response.data.result.stickers;
          if (!stickers || stickers.length === 0) { await reply(sock, jid, '❌ Sticker pack tidak ditemukan atau kosong.', msg); break; }
          await reply(sock, jid, `📦 *Sticker Pack Found*\n\n🎯 Pack Name: ${packName}\n📊 Total Stickers: ${stickers.length}\n\n⏳ Mengirim sticker...`, msg);
          for (let i = 0; i < stickers.length; i++) {
            try {
              const fileId = stickers[i].thumb.file_id;
              const fileResponse = await axios.get(
                `https://api.telegram.org/bot7344620195:AAEI7FgAZo_dj5WBLB9KDjh75kPZPF8EufU/getFile?file_id=${fileId}`
              );
              const stickerUrl = `https://api.telegram.org/file/bot7344620195:AAEI7FgAZo_dj5WBLB9KDjh75kPZPF8EufU/${fileResponse.data.result.file_path}`;
              await sock.sendMessage(jid, { sticker: { url: stickerUrl } });
              await delay(2000);
            } catch(_) { continue; }
          }
          await reply(sock, jid, `✅ Berhasil mengirim ${stickers.length} sticker dari pack ${packName}`, msg);
        } catch(e) {
          console.error('TeleSticker Error:', e);
          await reply(sock, jid, '❌ Gagal mengambil sticker pack. Pastikan URL valid dan pack public.', msg);
        }
        break;
      }

      // ══════════════════════════════════════════════════════
      // 🤖 IA / OUTILS
      // ══════════════════════════════════════════════════════

      // ── DICTIONNAIRE (api.dictionaryapi.dev) ──────────────
      case 'dictionnaire':
      case 'dict': {
        if (!args.length) { await reply(sock, jid, `❌ Usage: ${p}dictionnaire [mot]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '📖', key: msg.key } });
          const mot = args[0].toLowerCase();
          const res = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/fr/${encodeURIComponent(mot)}`);
          if (!Array.isArray(res) || !res.length) { await reply(sock, jid, `❌ Mot "${mot}" non trouvé.`, msg); break; }
          const entry = res[0];
          let txt = `📖 *DICTIONNAIRE — ${entry.word}*\n`;
          if (entry.phonetic) txt += `🔤 ${entry.phonetic}\n`;
          txt += '\n';
          (entry.meanings || []).slice(0, 3).forEach(meaning => {
            txt += `*${meaning.partOfSpeech || ''}*\n`;
            (meaning.definitions || []).slice(0, 2).forEach((def, j) => {
              txt += `  ${j+1}. ${def.definition}\n`;
              if (def.example) txt += `     _Ex: ${def.example}_\n`;
            });
            txt += '\n';
          });
          await reply(sock, jid, txt, msg);
        } catch(e) { await reply(sock, jid, `❌ Dictionnaire: ${e.message}`, msg); }
        break;
      }

      // ── SSWEB — Screenshot (screenshotmachine) ────────────
      case 'ssweb': {
        if (!args[0]) { await reply(sock, jid, `❌ Usage: ${p}ssweb [url]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '📸', key: msg.key } });
          const ssUrl = args[0].startsWith('http') ? args[0] : 'https://' + args[0];
          const apiUrl = `https://api.screenshotmachine.com/?key=FREE&url=${encodeURIComponent(ssUrl)}&dimension=1024x768`;
          await sock.sendMessage(jid, { image: { url: apiUrl }, caption: `🌐 *SCREENSHOT* ${ssUrl}` }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ ssweb: ${e.message}`, msg); }
        break;
      }

      // ── QRCODE ────────────────────────────────────────────
      case 'qrcode':
      case 'qr': {
        if (!args.length) { await reply(sock, jid, `❌ Usage: ${p}qrcode [texte]\nEx: ${p}qrcode https://chat.whatsapp.com/xxx`, msg); break; }
        try {
          const texte  = args.join(' ');
          const qrUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(texte)}`;
          await sock.sendMessage(jid, { image: { url: qrUrl }, caption: `✅ *QR Code généré!*\n\n📝 Texte: ${texte}` }, { quoted: msg });
        } catch(e) { await reply(sock, jid, `❌ QR: ${e.message}`, msg); }
        break;
      }

      // ── TRT — TRADUCTION (LibreTranslate) ─────────────────
      case 'trt':
      case 'translate': {
        if (!args.length) {
          await reply(sock, jid,
`❌ Usage: ${p}trt [lang] [texte]

*Codes de langue:*
fr = Français
en = Anglais
ar = Arabe
es = Espagnol
de = Allemand
pt = Portugais
zh = Chinois
ru = Russe

Ex: ${p}trt en Bonjour tout le monde`, msg);
          break;
        }
        const targetLang = args[0].toLowerCase();
        const textToTr   = args.slice(1).join(' ');
        if (!textToTr) { await reply(sock, jid, `❌ Usage: ${p}trt [lang] [texte]\nEx: ${p}trt en Bonjour`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🌍', key: msg.key } });
          const res = await fetch('https://libretranslate.de/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: textToTr, source: 'auto', target: targetLang, format: 'text' })
          });
          const data = await res.json();
          if (!data?.translatedText) { await reply(sock, jid, '❌ Traduction échouée. Vérifie le code de langue.', msg); break; }
          await reply(sock, jid, `🌍 *TRADUCTION → ${targetLang.toUpperCase()}*\n\n📝 Original: ${textToTr}\n✅ Traduit: ${data.translatedText}`, msg);
        } catch(e) { await reply(sock, jid, `❌ Traduction: ${e.message}`, msg); }
        break;
      }

      // ── LIENS? — Analyser un lien (PhishStats) ────────────
      case 'liens?':
      case 'liencheck':
      case 'checkurl': {
        if (!args[0]) { await reply(sock, jid, `❌ Usage: ${p}liens? [url]\nEx: ${p}liens? https://exemple.com`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } });
          const urlToCheck = args[0];
          const res = await fetchJson(`https://phishstats.info:2096/api/v1/phishing?url=${encodeURIComponent(urlToCheck)}`);
          const entries = Array.isArray(res) ? res : (res?.data || []);
          if (!entries.length) {
            await reply(sock, jid, `✅ *LIEN SÛREMENT PROPRE*\n\n🔗 ${urlToCheck}\n\n🛡️ Aucun signalement de phishing trouvé dans la base de données.`, msg);
          } else {
            const entry = entries[0];
            await reply(sock, jid,
`⚠️ *ALERTE — LIEN DANGEREUX!*

🔗 URL: ${urlToCheck}
🚨 Score: ${entry.score || '?'}/10
🌍 IP: ${entry.ip || '?'}
📅 Signalé: ${entry.date || '?'}
🏷️ Type: ${entry.title || 'Phishing/Malware'}

❌ *Ne partagez pas ce lien!*`, msg);
          }
        } catch(e) { await reply(sock, jid, `❌ Analyse: ${e.message}`, msg); }
        break;
      }

      // ── VISION — OCR avancé (OCR.space) ───────────────────
      case 'vision': {
        const qVis = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!qVis) { await reply(sock, jid, `❌ Réponds à une image avec ${p}vision`, msg); break; }
        const mimeVis = qVis?.imageMessage?.mimetype || '';
        if (!qVis.imageMessage || !/image/.test(mimeVis)) { await reply(sock, jid, '❌ Réponds seulement avec une image.', msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '👁️', key: msg.key } });
          await reply(sock, jid, "🔍 Analyse de l'image en cours...", msg);
          const stream = await downloadContentFromMessage(qVis.imageMessage, 'image');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          const imgUrl = await uploadToCatbox(buf, 'vision.jpg', 'image/jpeg');
          const res = await fetchJson(`https://api.ocr.space/parse/imageurl?apikey=helloworld&url=${encodeURIComponent(imgUrl)}&language=fre`);
          const parsed = res?.ParsedResults?.[0];
          if (!parsed || !parsed.ParsedText?.trim()) {
            await reply(sock, jid, '❌ Aucun texte détecté sur cette image.', msg); break;
          }
          const txt = parsed.ParsedText.trim();
          await reply(sock, jid, `👁️ *VISION — Texte extrait:*\n\n${txt}`, msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ Vision: ${e.message}`, msg); }
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
          const cx     = 'e5c2be9c3f94c4bbb';
          const res    = await fetchJson(`https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(args.join(' '))}&key=${apiKey}&cx=${cx}`);
          const items  = res?.items || [];
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

      // ── MUSIQUE — YouTube via Invidious ───────────────────
      case 'musique':
      case 'music': {
        if (!args.length) { await reply(sock, jid, `❌ Usage: ${p}musique [titre]\nEx: ${p}musique Afrobeat Tchad`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🎵', key: msg.key } });
          const q   = encodeURIComponent(args.join(' '));
          const res = await fetchJson(`https://inv.tux.rs/api/v1/search?q=${q}&type=video&fields=title,videoId,author,lengthSeconds,viewCount`);
          const items = Array.isArray(res) ? res : (res?.items || []);
          if (!items.length) { await reply(sock, jid, '❌ Aucun résultat musique.', msg); break; }
          let txt = `🎵 *MUSIQUE — "${args.join(' ')}"*\n\n`;
          items.slice(0, 6).forEach((v, i) => {
            const dur = v.lengthSeconds ? `${Math.floor(v.lengthSeconds/60)}:${String(v.lengthSeconds%60).padStart(2,'0')}` : '?';
            txt += `*${i+1}. ${v.title}*\n`;
            txt += `   🎤 ${v.author || '?'} • ⏱ ${dur}\n`;
            txt += `   🔗 https://youtube.com/watch?v=${v.videoId}\n`;
            txt += `   📥 ${p}ytmp3 https://youtube.com/watch?v=${v.videoId}\n\n`;
          });
          await reply(sock, jid, txt, msg);
        } catch(e) { await reply(sock, jid, `❌ Musique: ${e.message}`, msg); }
        break;
      }

      // ══════════════════════════════════════════════════════
      // 🕌 CORAN
      // ══════════════════════════════════════════════════════

      case 'surah': {
        if (!args[0]) {
          const noms = ["Al-Fatiha","Al-Baqara","Ali Imran","An-Nisa","Al-Maida","Al-An'am","Al-A'raf","Al-Anfal","At-Tawba","Yunus","Hud","Yusuf","Ar-Ra'd","Ibrahim","Al-Hijr","An-Nahl","Al-Isra","Al-Kahf","Maryam","Ta-Ha","Al-Anbiya","Al-Hajj","Al-Mu'minun","An-Nur","Al-Furqan","Ash-Shu'ara","An-Naml","Al-Qasas","Al-Ankabut","Ar-Rum","Luqman","As-Sajda","Al-Ahzab","Saba","Fatir","Ya-Sin","As-Saffat","Sad","Az-Zumar","Ghafir","Fussilat","Ash-Shura","Az-Zukhruf","Ad-Dukhan","Al-Jathiya","Al-Ahqaf","Muhammad","Al-Fath","Al-Hujurat","Qaf","Adh-Dhariyat","At-Tur","An-Najm","Al-Qamar","Ar-Rahman","Al-Waqi'a","Al-Hadid","Al-Mujadila","Al-Hashr","Al-Mumtahana","As-Saff","Al-Jumu'a","Al-Munafiqun","At-Taghabun","At-Talaq","At-Tahrim","Al-Mulk","Al-Qalam","Al-Haqqa","Al-Ma'arij","Nuh","Al-Jinn","Al-Muzzammil","Al-Muddaththir","Al-Qiyama","Al-Insan","Al-Mursalat","An-Naba","An-Nazi'at","Abasa","At-Takwir","Al-Infitar","Al-Mutaffifin","Al-Inshiqaq","Al-Buruj","At-Tariq","Al-A'la","Al-Ghashiya","Al-Fajr","Al-Balad","Ash-Shams","Al-Layl","Ad-Duha","Ash-Sharh","At-Tin","Al-Alaq","Al-Qadr","Al-Bayyina","Az-Zalzala","Al-Adiyat","Al-Qari'a","At-Takathur","Al-Asr","Al-Humaza","Al-Fil","Quraish","Al-Ma'un","Al-Kawthar","Al-Kafirun","An-Nasr","Al-Masad","Al-Ikhlas","Al-Falaq","An-Nas"];
          let txt = '📖 *LE SAINT CORAN — 114 SOURATES*\n\n';
          noms.forEach((n, i) => { txt += `${i+1}. ${n}\n`; });
          txt += `\n_Tape ${p}surah [numéro] pour lire une sourate_`;
          await reply(sock, jid, txt, msg);
          break;
        }
        const numSurah = parseInt(args[0]);
        if (isNaN(numSurah) || numSurah < 1 || numSurah > 114) { await reply(sock, jid, '❌ Entre 1 et 114.', msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '📖', key: msg.key } });
          const res  = await fetchJson(`https://api.alquran.cloud/v1/surah/${numSurah}`);
          const data = res?.data;
          if (!data) { await reply(sock, jid, '❌ Sourate introuvable.', msg); break; }
          let txt = `📖 *${data.number}. ${data.name} (${data.englishName})*\nVersets: ${data.numberOfAyahs}\n${'━'.repeat(28)}\n\n`;
          txt += data.ayahs.map(ayah => `(${ayah.numberInSurah}) ${ayah.text}`).join('\n\n');
          for (let i = 0; i < txt.length; i += 3900) {
            await sock.sendMessage(jid, { text: txt.slice(i, i + 3900) }, { quoted: i === 0 ? msg : undefined });
          }
        } catch(e) { await reply(sock, jid, `❌ Surah: ${e.message}`, msg); }
        break;
      }

      case '99nomdallah':
      case '99nom':
      case 'asmaulhusna': {
        const noms99 = `﷽\n🌟 *Les 99 Noms d\'Allah — Asmaul Husna*\n\nالرحمن — Le Très-Miséricordieux\nالرحيم — Le Tout-Miséricordieux\nالملك — Le Souverain\nالقدوس — Le Pur / Le Saint\nالسلام — La Paix\nالمؤمن — Le Sécurisant\nالمهيمن — Le Préservateur\nالعزيز — Le Tout-Puissant\nالجبار — Le Contraignant\nالمتكبر — Le Majestueux\nالخالق — Le Créateur\nالبارئ — Le Producteur\nالمصور — Le Formateur\nالغفار — Le Grand Pardonneur\nالقهار — Le Dominateur\nالوهاب — Le Donateur Généreux\nالرزاق — Le Pourvoyeur\nالفتاح — Celui qui ouvre\nالعليم — L\'Omniscient\nالقابض — Celui qui retient\nالباسط — Celui qui étend\nالخافض — Celui qui abaisse\nالرافع — Celui qui élève\nالمعز — Celui qui donne la puissance\nالمذل — Celui qui humilie\nالسميع — L\'Audient\nالبصير — Le Voyant\nالحكم — Le Juge\nالعدل — Le Juste\nاللطيف — Le Subtil\nالخبير — Le Parfaitement Connaisseur\nالحليم — Le Clément\nالعظيم — L\'Immense\nالغفور — Le Pardonneur\nالشكور — Le Reconnaissant\nالعلي — Le Très-Haut\nالكبير — L\'Infiniment Grand\nالحفيظ — Le Préservateur\nالمقيت — Le Nourricier\nالحسيب — Celui qui tient compte\nالجليل — Le Majestueux\nالكريم — Le Tout-Généreux\nالرقيب — L\'Observateur\nالمجيب — Celui qui exauce\nالواسع — L\'Immense\nالحكيم — Le Sage\nالودود — L\'Affectueux\nالمجيد — Le Très-Glorieux\nالباعث — Celui qui ressuscite\nالشهيد — Le Témoin\nالحق — La Vérité\nالوكيل — Le Garant\nالقوي — Le Fort\nالمتين — L\'Inébranlable\nالولي — Le Protecteur\nالحميد — Le Louable\nالمحصي — Celui qui dénombre\nالمبدئ — L\'Auteur\nالمعيد — Celui qui fait revivre\nالمحيي — Celui qui donne la vie\nالمميت — Celui qui donne la mort\nالحي — Le Vivant\nالقيوم — L\'Immuable\nالواجد — Celui qui trouve\nالماجد — L\'Illustre\nالواحد — L\'Unique\nالاحد — L\'Un\nالصمد — Le Soutien Universel\nالقادر — Le Puissant\nالمقتدر — Le Tout-Puissant\nالمقدم — Celui qui fait avancer\nالمؤخر — Celui qui fait reculer\nالأول — Le Premier\nالأخر — Le Dernier\nالظاهر — L\'Apparent\nالباطن — Le Caché\nالوالي — Le Maître\nالمتعالي — Le Sublime\nالبر — Le Bienveillant\nالتواب — Celui qui accepte le repentir\nالمنتقم — Le Vengeur\nالعفو — L\'Indulgent\nالرؤوف — Le Très-Doux\nمالك الملك — Le Possesseur du Royaume\nذو الجلال والإكرام — Détenteur de la Majesté\nالمقسط — L\'Équitable\nالجامع — Celui qui rassemble\nالغني — Le Riche par soi-même\nالمغني — Celui qui enrichit\nالمانع — Celui qui empêche\nالضار — Celui qui peut nuire\nالنافع — Celui qui est utile\nالنور — La Lumière\nالهادي — Le Guide\nالبديع — L\'Incomparable\nالباقي — L\'Éternel\nالوارث — L\'Héritier\nالرشيد — Le Guide sur la voie droite\nالصبور — Le Patient\n\n_سبحان الله — SEIGNEUR TD 🇹🇩_`;
        for (let i = 0; i < noms99.length; i += 3900) {
          await sock.sendMessage(jid, { text: noms99.slice(i, i + 3900) }, { quoted: i === 0 ? msg : undefined });
        }
        break;
      }


      // ══════════════════════════════════════════════════════
      // 🤖 INTELLIGENCE ARTIFICIELLE
      // ══════════════════════════════════════════════════════

      // ─── AI (Gemini direct sans clé) ──────────────────────
      case 'ai': {
        if (!args.length) { await reply(sock, jid, `Utilisation: ${p}ai [question]\nEx: ${p}ai explique le JavaScript`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          class GeminiClient {
            constructor() { this.s = null; this.r = 1; }
            async init() {
              const res = await fetch('https://gemini.google.com/', { headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36' } });
              const h = await res.text();
              this.s = { a: h.match(/"SNlM0e":"(.*?)"/)?.[1] || '', b: h.match(/"cfb2h":"(.*?)"/)?.[1] || '', c: h.match(/"FdrFJe":"(.*?)"/)?.[1] || '' };
            }
            async ask(m) {
              if (!this.s) await this.init();
              const p2 = [null, JSON.stringify([[m, 0, null, null, null, null, 0], ["id"], ["", "", "", null, null, null, null, null, null, ""], null, null, null, [1], 1, null, null, 1, 0, null, null, null, null, null, [[0]], 1, null, null, null, null, null, ["", "", "Kamu adalah ALIP-AI. Jawab singkat, jelas, langsung ke inti. Maksimal 3 kalimat.", null, null, null, null, null, 0, null, 1, null, null, null, []], null, null, 1, null, null, null, null, null, null, null, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 1, null, null, null, null, [1]])];
              const q = `bl=${this.s.b}&f.sid=${this.s.c}&hl=id&_reqid=${this.r++}&rt=c`;
              const res = await fetch(`https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?${q}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36', 'x-same-domain': '1' }, body: `f.req=${encodeURIComponent(JSON.stringify(p2))}&at=${this.s.a}` });
              const t = await res.text();
              const texts = [];
              for (const ln of t.split('\n')) {
                if (ln.startsWith('[[\"wrb.fr\"')) {
                  try { const d = JSON.parse(JSON.parse(ln)[0][2]); if (d[4] && Array.isArray(d[4])) { for (const item of d[4]) { if (item?.[1]?.[0] && typeof item[1][0] === 'string') texts.push(item[1][0]); } } } catch(e) {}
                }
              }
              if (!texts.length) return null;
              return texts[texts.length - 1].replace(/\\n/g, '\n');
            }
          }
          const gemini = new GeminiClient();
          const result = await gemini.ask(text);
          if (!result) { await reply(sock, jid, '❌ Pas de réponse de l\'IA.', msg); break; }
          await reply(sock, jid, `🎀 *SEIGNEUR TD AI*\n\n${result}`, msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ AI: ${e.message}`, msg); }
        break;
      }

      // ─── AI REALTIME ──────────────────────────────────────
      case 'airealtime': {
        if (!text) { await reply(sock, jid, `Ex: ${p}airealtime quelle heure est-il`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const response = await fetchJson(`https://api-faa.my.id/faa/ai-realtime?text=${encodeURIComponent(text)}`);
          if (response.status && response.result) {
            await reply(sock, jid, `⚡ *AI REALTIME*\n\n${response.result}`, msg);
            await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          } else throw new Error('Pas de réponse');
        } catch(e) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          await reply(sock, jid, '❌ Échec AI Realtime. Réessaie plus tard.', msg);
        }
        break;
      }

      // ─── BARD ─────────────────────────────────────────────
      case 'bard': {
        if (!text) { await reply(sock, jid, `Ex: ${p}bard bonjour, qui es-tu ?`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const { data } = await axios.get(`https://api.termai.cc/api/chat/bard?query=${encodeURIComponent(text)}&key=alipxtermai`, { timeout: 60000 });
          const response = data.chatUi || data.result || 'Pas de réponse';
          await reply(sock, jid, `🎀 *BARD AI*\n\n${response}`, msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          await reply(sock, jid, '❌ Échec de la requête Bard.', msg);
        }
        break;
      }

      // ─── LOGICBELL ────────────────────────────────────────
      case 'logicbell': {
        if (!text) { await reply(sock, jid, `Ex: ${p}logicbell bonjour !`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const senderName = msg.pushName || sender.split('@')[0];
          const payload = {
            text, id: jid,
            fullainame: 'Bella Clarissa', nickainame: 'Bella',
            senderName, ownerName: 'SEIGNEUR TD',
            date: new Date().toISOString(), role: 'Sahabat Deket', msgtype: 'text',
            custom_profile: `- Nama kamu adalah Bella Clarissa, lebih suka dipanggil Bella.\n- Kamu berpikir bahwa kamu adalah manusia, bukan AI atau Bot.\n- Responmu singkat dan sama seperti perempuan pada umumnya.\n- Kamu menggunakan bahasa yang baik dan mencerminkan gadis yang baik.\n- Kamu harus menggunakan kata-kata yang identik dengan perempuan yang polos dan feminin.`,
            commands: []
          };
          const response = await axios.post(`https://api.termai.cc/api/chat/logic-bell?key=alipxtermai`, payload, { timeout: 60000, headers: { 'Content-Type': 'application/json' } });
          if (!response.data.status) throw new Error('Pas de réponse');
          const result = response.data.data?.msg || 'Pas de réponse';
          await reply(sock, jid, `🎀 *BELLA AI*\n\n${result}`, msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          await reply(sock, jid, '❌ Échec LogicBell.', msg);
        }
        break;
      }

      // ─── HYPERAI / WEBPILOT / VENICE / POWERBRAIN / PUBLICAI
      case 'hyperai':
      case 'webpilot':
      case 'venice':
      case 'powerbrain':
      case 'publicai': {
        if (!text) { await reply(sock, jid, `Ex: ${p}${command} bonjour`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const encodedText = encodeURIComponent(text);
          let apiUrl = '';
          if (command === 'hyperai')    apiUrl = `https://api-faa.my.id/faa/ai-hyper?text=${encodedText}`;
          else if (command === 'webpilot')  apiUrl = `https://api-faa.my.id/faa/webpilot?text=${encodedText}`;
          else if (command === 'venice')    apiUrl = `https://api-faa.my.id/faa/venice-ai?text=${encodedText}`;
          else if (command === 'powerbrain') apiUrl = `https://api-faa.my.id/faa/powerbrain-ai?text=${encodedText}`;
          else if (command === 'publicai')  apiUrl = `https://api-faa.my.id/faa/publicai?text=${encodedText}`;
          const { data } = await axios.get(apiUrl, { timeout: 60000 });
          if (!data.status) throw new Error('API returned false');
          let result = data.result || data.msg || 'Pas de réponse';
          if (command === 'webpilot' && data.source?.length) {
            result += '\n\n📰 *Sources:*\n';
            data.source.slice(0, 3).forEach((s, i) => { if (s?.title) result += `${i+1}. ${s.title}\n`; });
          }
          await reply(sock, jid, `🎀 *${command.toUpperCase()} AI*\n\n${result}`, msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          await reply(sock, jid, `❌ Échec ${command}: ${e.message}`, msg);
        }
        break;
      }

      // ─── ALLAM ────────────────────────────────────────────
      case 'allam': {
        if (!text) { await reply(sock, jid, `Ex: ${p}allam explique Allam 2.7B`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const response = await fetchJson(`https://velyn.mom/api/ai/allam-2-7b?apikey=zizzmarket&prompt=${encodeURIComponent(text)}`);
          if (response.status === 200 && response.data?.result) {
            await reply(sock, jid, `🤖 *ALLAM 2-7B AI*\n\n*Question:*\n${text}\n\n*Réponse:*\n${response.data.result}`, msg);
            await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          } else throw new Error(response.message || 'Échec');
        } catch(e) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          await reply(sock, jid, '❌ Échec Allam AI.', msg);
        }
        break;
      }

      // ─── DEEPSEEK ─────────────────────────────────────────
      case 'deepseek':
      case 'ds': {
        if (!text) { await reply(sock, jid, `Ex: ${p}deepseek qu'est-ce que JavaScript ?`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const response = await fetchJson(`https://velyn.mom/api/ai/deepseek-coder-67b?apikey=zizzmarket&prompt=${encodeURIComponent(text)}`);
          if (response.status === 200 && response.data?.result) {
            const aiResponse = response.data.result;
            const finalResponse = aiResponse.length > 3000 ? aiResponse.substring(0, 3000) + '...' : aiResponse;
            await reply(sock, jid, `🤖 *DEEPSEEK AI*\n\n${finalResponse}`, msg);
            await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          } else throw new Error(response.message || 'Échec');
        } catch(e) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          await reply(sock, jid, '❌ Échec DeepSeek.', msg);
        }
        break;
      }

      // ─── GEMINI ───────────────────────────────────────────
      case 'gemini': {
        if (!text) { await reply(sock, jid, `Ex: ${p}gemini parle-moi du Tchad`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const response = await fetchJson(`https://velyn.mom/api/ai/gemini?apikey=zizzmarket&prompt=${encodeURIComponent(text)}`);
          if (response.status === 200 && response.data?.result) {
            await reply(sock, jid, `✨ *GEMINI AI*\n\n*Question:*\n${text}\n\n*Réponse:*\n${response.data.result}`, msg);
            await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          } else throw new Error(response.message || 'Échec');
        } catch(e) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          await reply(sock, jid, '❌ Échec Gemini AI.', msg);
        }
        break;
      }

      // ─── OPENAI ───────────────────────────────────────────
      case 'openai':
      case 'oai': {
        if (!text) { await reply(sock, jid, `Ex: ${p}openai écris un poème sur la nature`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const response = await fetchJson(`https://velyn.mom/api/ai/openai?apikey=zizzmarket&prompt=${encodeURIComponent(text)}`);
          if (response.status === 200 && response.data?.result) {
            await reply(sock, jid, `🧠 *OPENAI AI*\n\n*Question:*\n${text}\n\n*Réponse:*\n${response.data.result}`, msg);
            await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          } else throw new Error(response.message || 'Échec');
        } catch(e) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          await reply(sock, jid, '❌ Échec OpenAI.', msg);
        }
        break;
      }

      // ─── GROQ ─────────────────────────────────────────────
      case 'groq': {
        if (!text) { await reply(sock, jid, `Ex: ${p}groq quel est l'avantage de Groq ?`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const response = await fetchJson(`https://velyn.mom/api/ai/groq?apikey=zizzmarket&prompt=${encodeURIComponent(text)}`);
          if (response.status === 200 && response.data?.result) {
            await reply(sock, jid, `🚀 *GROQ AI (Réponse rapide)*\n\n*Question:*\n${text}\n\n*Réponse:*\n${response.data.result}`, msg);
            await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          } else throw new Error(response.message || 'Échec');
        } catch(e) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          await reply(sock, jid, '❌ Échec Groq AI.', msg);
        }
        break;
      }

      // ─── CUSTOM AI ────────────────────────────────────────
      case 'customai': {
        if (!text || !text.includes('|')) { await reply(sock, jid, `Ex: ${p}customai Qui es-tu ? | Tu es un robot drôle qui aime plaisanter`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
          const sep = text.indexOf('|');
          const userPrompt = text.substring(0, sep).trim();
          const systemRole = text.substring(sep + 1).trim();
          if (!userPrompt || !systemRole) { await reply(sock, jid, `Format incorrect. Ex: ${p}customai Question | Rôle`, msg); break; }
          const response = await fetchJson(`https://velyn.mom/api/ai/customai?apikey=zizzmarket&prompt=${encodeURIComponent(userPrompt)}&system=${encodeURIComponent(systemRole)}`);
          if (response.status === 200 && response.data?.result) {
            await reply(sock, jid, `🎭 *CUSTOM ROLE AI*\n\n*Rôle:* ${systemRole}\n*Question:*\n${userPrompt}\n\n*Réponse:*\n${response.data.result}`, msg);
            await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
          } else throw new Error(response.message || 'Échec');
        } catch(e) {
          await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
          await reply(sock, jid, '❌ Échec Custom AI.', msg);
        }
        break;
      }

      // ══════════════════════════════════════════════════════
      // 👥 GROUPE — MEMBRES INACTIFS
      // ══════════════════════════════════════════════════════

      // ─── INACTIFS (lister les membres inactifs) ────────────
      case 'inactifs':
      case 'sider': {
        if (!isGroup) { await reply(sock, jid, '❌ Cette commande est réservée aux groupes.', msg); break; }
        const isAdminSider = (await sock.groupMetadata(jid)).participants.find(p => p.id === sender)?.admin;
        if (!isAdminSider && !isSudo) { await reply(sock, jid, '❌ Réservé aux admins du groupe.', msg); break; }
        try {
          const groupMetadata = await sock.groupMetadata(jid);
          const participants = groupMetadata.participants;
          const now = Date.now();
          if (!global._siderDB) global._siderDB = {};
          if (!global._siderDB[jid]) global._siderDB[jid] = { botJoinTime: now - (30 * 86400000), users: {} };
          if (!global._siderDB[jid].botJoinTime) global._siderDB[jid].botJoinTime = now - (30 * 86400000);
          const botAgeDays = Math.floor((now - global._siderDB[jid].botJoinTime) / 86400000);
          let siderList = [], activeList = [], adminList = [];
          for (let participant of participants) {
            let memberJid = participant.jid || participant.id;
            const isAdminM = participant.admin !== null;
            if (isAdminM) { adminList.push(memberJid); continue; }
            if (memberJid.endsWith('@lid')) memberJid = memberJid.replace('@lid', '@s.whatsapp.net');
            if (!memberJid.endsWith('@s.whatsapp.net')) memberJid = memberJid + '@s.whatsapp.net';
            if (!global._siderDB[jid].users) global._siderDB[jid].users = {};
            let userData = global._siderDB[jid].users[memberJid];
            if (!userData) {
              global._siderDB[jid].users[memberJid] = { messages: 0, lastMessage: 0, name: participant.notify || memberJid.split('@')[0], firstSeen: now };
              userData = global._siderDB[jid].users[memberJid];
            }
            if (userData.lastMessage > 0) {
              const inactiveDays = Math.floor((now - userData.lastMessage) / 86400000);
              if (inactiveDays > 7) siderList.push({ jid: memberJid, name: userData.name, lastMessage: userData.lastMessage, daysInactive: inactiveDays, messageCount: userData.messages });
              else activeList.push({ jid: memberJid, name: userData.name, daysInactive: inactiveDays });
            } else {
              const memberAge = Math.floor((now - userData.firstSeen) / 86400000);
              if (memberAge > 7) siderList.push({ jid: memberJid, name: participant.notify || memberJid.split('@')[0], daysInactive: memberAge, status: 'JAMAIS_ECRIT' });
            }
          }
          if (siderList.length === 0) {
            await reply(sock, jid, `✅ *AUCUN INACTIF*\n\nTotal: ${participants.length}\nActifs: ${activeList.length}\nAdmins: ${adminList.length}\nBot: ${botAgeDays} jours`, msg); break;
          }
          siderList.sort((a, b) => b.daysInactive - a.daysInactive);
          let resultText = `📊 *RAPPORT INACTIFS*\n\n`;
          resultText += `👥 *Groupe:* ${groupMetadata.subject}\n`;
          resultText += `📈 *Statistiques:*\n`;
          resultText += `• Total: ${participants.length} membres\n`;
          resultText += `• Inactifs: ${siderList.length}\n`;
          resultText += `• Actifs: ${activeList.length}\n`;
          resultText += `• Admins: ${adminList.length}\n`;
          resultText += `• Bot: ${botAgeDays} jours\n\n`;
          resultText += `📌 *Critères:*\n`;
          resultText += `1. Pas de message depuis >7 jours\n`;
          resultText += `2. Membre depuis >7 jours sans avoir écrit\n\n`;
          resultText += `👤 *LISTE DES INACTIFS:*\n`;
          let mentionJids = [];
          for (let i = 0; i < Math.min(siderList.length, 20); i++) {
            const sider = siderList[i];
            if (sider.status === 'JAMAIS_ECRIT') {
              resultText += `${i+1}. @${sider.jid.split('@')[0]}\n   📛 ${sider.name} - ${sider.daysInactive} jours sans écrire\n\n`;
            } else {
              const lastDate = new Date(sider.lastMessage).toLocaleDateString('fr-FR');
              resultText += `${i+1}. @${sider.jid.split('@')[0]}\n   ⏳ ${sider.name} - ${sider.daysInactive} jours (${lastDate})\n\n`;
            }
            mentionJids.push(sider.jid);
          }
          if (siderList.length > 20) resultText += `📋 +${siderList.length - 20} inactif(s) supplémentaire(s)\n\n`;
          resultText += `⚡ *Utilise:* ${p}supprimeinactifs pour les expulser`;
          await sock.sendMessage(jid, { text: resultText, mentions: mentionJids }, { quoted: msg });
        } catch(e) {
          console.error('Sider error:', e);
          await reply(sock, jid, '❌ Échec de la détection des inactifs.', msg);
        }
        break;
      }

      // ─── SUPPRIMER INACTIFS ───────────────────────────────
      case 'supprimeinactifs':
      case 'siderkick': {
        if (!isGroup) { await reply(sock, jid, '❌ Cette commande est réservée aux groupes.', msg); break; }
        const groupMetaSK = await sock.groupMetadata(jid);
        const isAdminSK = groupMetaSK.participants.find(p => p.id === sender)?.admin;
        if (!isAdminSK && !isSudo) { await reply(sock, jid, '❌ Réservé aux admins du groupe.', msg); break; }
        const botJidSK = sock.user?.id?.replace(/:.*@/, '@') || '';
        const botIsAdminSK = groupMetaSK.participants.find(p => p.id === botJidSK || p.id?.startsWith(botJidSK.split('@')[0]))?.admin;
        if (!botIsAdminSK) { await reply(sock, jid, '❌ Le bot doit être admin pour expulser.', msg); break; }
        try {
          const participants = groupMetaSK.participants;
          const now = Date.now();
          if (!global._siderDB) global._siderDB = {};
          if (!global._siderDB[jid]) global._siderDB[jid] = { users: {} };
          if (!global._siderDB[jid].users) global._siderDB[jid].users = {};
          let kickList = [];
          for (let participant of participants) {
            let memberJid = participant.jid || participant.id;
            const isAdminM = participant.admin !== null;
            if (isAdminM) continue;
            if (memberJid.endsWith('@lid')) memberJid = memberJid.replace('@lid', '@s.whatsapp.net');
            if (!memberJid.endsWith('@s.whatsapp.net')) memberJid = memberJid + '@s.whatsapp.net';
            let userData = global._siderDB[jid].users[memberJid];
            if (!userData) {
              global._siderDB[jid].users[memberJid] = { messages: 0, lastMessage: 0, name: participant.notify || memberJid.split('@')[0], firstSeen: now };
              userData = global._siderDB[jid].users[memberJid];
            }
            let shouldKick = false, reason = '';
            if (userData.lastMessage > 0) {
              const inactiveDays = Math.floor((now - userData.lastMessage) / 86400000);
              if (inactiveDays > 7) { shouldKick = true; reason = `${inactiveDays} jours sans message`; }
            } else {
              const memberAge = Math.floor((now - userData.firstSeen) / 86400000);
              if (memberAge > 7) { shouldKick = true; reason = `${memberAge} jours sans jamais écrire`; }
            }
            if (shouldKick) kickList.push({ jid: memberJid, name: userData.name || participant.notify || memberJid.split('@')[0], reason });
          }
          if (kickList.length === 0) { await reply(sock, jid, '✅ Aucun membre à expulser.', msg); break; }
          let warningText = `⚠️ *EXPULSION EN COURS*\n\n${kickList.length} membre(s) vont être expulsés:\n\n`;
          let mentionJids = [];
          for (let i = 0; i < Math.min(kickList.length, 10); i++) {
            warningText += `${i+1}. @${kickList[i].jid.split('@')[0]}\n   ${kickList[i].name}\n   ${kickList[i].reason}\n\n`;
            mentionJids.push(kickList[i].jid);
          }
          if (kickList.length > 10) warningText += `📋 +${kickList.length - 10} membres supplémentaires\n\n`;
          warningText += `⏳ Début dans 5 secondes...`;
          await sock.sendMessage(jid, { text: warningText, mentions: mentionJids }, { quoted: msg });
          await delay(5000);
          let success = 0, failed = 0;
          for (let member of kickList) {
            try { await sock.groupParticipantsUpdate(jid, [member.jid], 'remove'); success++; await delay(1200); }
            catch(e) { failed++; }
          }
          await reply(sock, jid, `✅ *EXPULSION TERMINÉE*\n\n• Réussis: ${success}\n• Échoués: ${failed}\n• Total: ${kickList.length}`, msg);
        } catch(e) {
          console.error('Siderkick error:', e);
          await reply(sock, jid, '❌ Échec de l\'expulsion des inactifs.', msg);
        }
        break;
      }

      // ══════════════════════════════════════════════════════
      // 📱 INFORMATIONS UTILISATEUR
      // ══════════════════════════════════════════════════════

      // ─── INFO UTILISATEUR ─────────────────────────────────
      case 'infouser':
      case 'userinfo':
      case 'profil': {
        try {
          let targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
          if (!targetJid && args[0]) { const num = args[0].replace(/[^0-9]/g, ''); targetJid = num + '@s.whatsapp.net'; }
          if (!targetJid) targetJid = sender;
          let targetName;
          try {
            if (isGroup) {
              const gm = await sock.groupMetadata(jid);
              const part = gm.participants.find(p => p.id === targetJid);
              targetName = part?.notify || part?.name || targetJid.split('@')[0];
            } else {
              targetName = msg.pushName || targetJid.split('@')[0];
            }
          } catch { targetName = targetJid.split('@')[0]; }
          await reply(sock, jid, '⏳ Récupération des informations...', msg);
          let profilePicture;
          try { profilePicture = await sock.profilePictureUrl(targetJid, 'image'); }
          catch { profilePicture = 'https://telegra.ph/file/a059a6a734ed202c879d3.jpg'; }
          const numero = targetJid.split('@')[0];
          const infoText = `╭─⬣「 *INFORMATIONS UTILISATEUR* 」⬣
│
├─ 📱 *Numéro:* ${numero}
├─ 🆔 *User ID:* ${targetJid}
├─ 👤 *Nom:* ${targetName}
│
├─ 🔗 *Contact*
│  ├─ 👤 Profil: wa.me/${numero}
│  └─ 📞 Chat: https://wa.me/${numero}?text=Bonjour
│
├─ 📅 *Date d'info:* ${new Date().toLocaleString('fr-FR')}
│
╰─⬣
_ℹ️ SEIGNEUR TD 🇹🇩_`;
          await sock.sendMessage(jid, { image: { url: profilePicture }, caption: infoText, mentions: [targetJid] }, { quoted: msg });
        } catch(e) { await reply(sock, jid, `❌ Impossible de récupérer les infos: ${e.message}`, msg); }
        break;
      }

      // ══════════════════════════════════════════════════════
      // 📦 RECHERCHE APK
      // ══════════════════════════════════════════════════════

      // ─── APK (Recherche jeu/application Android MOD) ──────
      case 'apk':
      case 'searchgame':
      case 'gamesearch': {
        if (!text) { await reply(sock, jid, `❌ Entrez le nom d'un jeu/appli!\nEx: ${p}apk Pou`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } });
          await reply(sock, jid, '🔍 Recherche en cours...', msg);
          const searchQuery = encodeURIComponent(text);
          const response = await fetch(`https://api.yydz.biz.id/api/search/an1?q=${searchQuery}&apikey=alipaixyudz`);
          const data = await response.json();
          if (data.status !== 200 || !data.data || data.data.length === 0) {
            await reply(sock, jid, '❌ Aucun résultat trouvé ! Essaie un autre mot-clé.', msg); break;
          }
          const games = data.data.slice(0, 10);
          let resultText = `🎮 *RÉSULTATS DE RECHERCHE APK*\n\n`;
          resultText += `🔍 Mot-clé: *${text}*\n`;
          resultText += `📊 Trouvés: ${data.data.length} résultats\n\n`;
          games.forEach((game, index) => {
            resultText += `*${index + 1}. ${game.name}*\n`;
            resultText += `   👨‍💻 Développeur: ${game.developer}\n`;
            resultText += `   ⭐ Note: ${game.rating}/5\n`;
            resultText += `   🔗 ${game.link}\n\n`;
          });
          if (data.data.length > 10) resultText += `📋 Et ${data.data.length - 10} résultats supplémentaires...\n`;
          resultText += `\n📌 *Conseil:* Clique sur le lien pour télécharger l'APK MOD`;
          await sock.sendMessage(jid, { image: { url: games[0].imageUrl }, caption: resultText }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) {
          console.error('APK search error:', e);
          await reply(sock, jid, '❌ Échec de la recherche. L\'API est peut-être indisponible.', msg);
        }
        break;
      }

      // ── DEFAULT ───────────────────────────────────────────
      default: { break; }
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
    console.error('⚠️ Session err:', msg); return;
  }
  console.error('❌ uncaught:', msg);
});

process.on('unhandledRejection', err => {
  const msg = err?.message || String(err);
  if (msg.includes('Bad MAC') || msg.includes('decrypt') || msg.includes('No sessions') || msg.includes('session')) {
    console.error('⚠️ Session reject:', msg); return;
  }
  console.error('❌ unhandled:', msg);
});
