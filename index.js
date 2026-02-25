import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  delay,
  downloadContentFromMessage,
  jidNormalizedUser   // ✅ FIX BUG 1 — normaliser le JID proprement
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';  // APIs de téléchargement (siputzx, tikwm, vreden)
import axios from 'axios';        // requêtes HTTP (tikwm, mediafire)
import ytScraper from '@vreden/youtube_scraper'; // ✅ même package que Riselia

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
// OWNER
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

// Anti-call: 'off' | 'all' | whitelist Set de numéros autorisés
let antiCallMode = 'off';           // 'off', 'all', 'whitelist'
let antiCallWhitelist = new Set();  // numéros qui PEUVENT appeler

// Anti-delete destination: 'pv' (PV bot) ou jid groupe
let antiDeleteDest = 'pv';

// Guard contre restart automatique
let botStartTime = Date.now();
let isReady = false; // true seulement après 5s post-connexion
let antiLink   = false;

// ✅ NOUVEAU — Welcome/Bye/Warn
let welcomeGroups = new Set();  // groupes avec welcome activé
let byeGroups     = new Set();  // groupes avec bye activé
const groupWarnings = {};       // { groupJid: { userPhone: count } }
const groupRules    = {};       // { groupJid: "texte des règles" }

const savedViewOnce = new Map();

// Timestamp de démarrage
const BOT_START_TIME = Math.floor(Date.now() / 1000);

// ============================================================
// UTILITAIRES
// ============================================================
function getPhone(jid) {
  if (!jid) return '';
  return jid.split(':')[0].split('@')[0];
}

// ✅ FIX BUG 1 — Normalise le JID du bot (supprime le device suffix :XX)
function normalizeBotJid(rawJid) {
  if (!rawJid) return '';
  // ex: "23591234568:5@s.whatsapp.net" → "23591234568@s.whatsapp.net"
  try { return jidNormalizedUser(rawJid); } catch(e) {}
  const phone = rawJid.split(':')[0].split('@')[0];
  return phone + '@s.whatsapp.net';
}

function isOwnerJid(jid) {
  if (!jid) return false;
  const phone = getPhone(jid);
  if (global._botPhone && phone === global._botPhone) return true;
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
    // ✅ FIX BUG 2 — comparer par phone pour éviter LID mismatch
    const userPhone = getPhone(userJid);
    const p = meta.participants.find(x => getPhone(x.id) === userPhone);
    return p && (p.admin === 'admin' || p.admin === 'superadmin');
  } catch(e) { return false; }
}

// ✅ FIX BUG 2 — Résoudre le senderJid même quand c'est un LID
function resolveSenderJid(message, isGroup, fromMe) {
  if (fromMe) {
    return global._botJid || (EXTRA_OWNER_NUM ? EXTRA_OWNER_NUM + '@s.whatsapp.net' : '');
  }
  if (isGroup) {
    const participant = message.key.participant || '';
    // Si c'est un LID (@lid) → essayer de récupérer depuis participant
    if (participant.endsWith('@lid')) {
      // Fallback: utiliser quand même, getPhone() extraira juste les chiffres
      return participant;
    }
    return participant;
  }
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
  const botPhone = global._botPhone || '';
  const jidPhone = getPhone(jid);
  const isNoteToSelf = botPhone && jidPhone === botPhone;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
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
    const botPhone = global._botPhone || '';
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

      // ✅ FIX BUG 1 — Stocker le JID normalisé ET le phone séparément
      global._botJid   = normalizeBotJid(sock.user.id);  // "23591234568@s.whatsapp.net"
      global._botPhone = getPhone(global._botJid);        // "23591234568"

      // Guard restart: ignorer commandes pendant 5s au démarrage
      isReady = false;
      botStartTime = Date.now();
      setTimeout(() => { isReady = true; console.log('✅ Bot prêt à recevoir les commandes.'); }, 5000);

      console.log('✅ SEIGNEUR TD connecte! JID:', global._botJid, '| Phone:', global._botPhone);

      const ownerJid = EXTRA_OWNER_NUM
        ? EXTRA_OWNER_NUM + '@s.whatsapp.net'
        : global._botJid;

      try {
        await sock.sendMessage(ownerJid, {
          text:
`┏━━━━ ⚙️ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 𝐈𝐍𝐈𝐓 ━━━━
┃
┃ ᴘʀᴇғɪx  ⪧ [ ${config.prefix} ]
┃ ᴍᴏᴅᴇ    ⪧ ${botMode === 'public' ? 'ᴘᴜʙʟɪᴄ' : 'ᴘʀɪᴠᴀᴛᴇ'}
┃ sᴛᴀᴛᴜs  ⪧ ᴏɴʟɪɴᴇ
┃ ɴᴜᴍᴇʀᴏ  ⪧ +${global._botPhone}
┃
┗━━━━━━━━━━━━━━━━━━━━━━━`,
          contextInfo: BADGE_CTX
        });
      } catch(e) { console.error('Conn msg err:', e.message); }
    }
  });

  // ============================================================
  // HANDLER MESSAGES
  // ✅ FIX BUG 3 — Traiter TOUS les fromMe (pas seulement avec prefix)
  // ============================================================
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // ✅ COPIÉ DE RISELIA — traiter tous les messages comme Riselia.js ligne 297-320
    for (const message of messages) {
      if (!message.message) continue;

      // Ignorer ephemeral wrapper (comme Riselia)
      if (Object.keys(message.message)[0] === 'ephemeralMessage') {
        message.message = message.message.ephemeralMessage.message;
      }

      if (message.key?.remoteJid === 'status@broadcast') {
        // Traiter quand même pour viewOnce dans les statuts
        processMessage(sock, message).catch(() => {});
        continue;
      }

      // Comme Riselia: si mode privé ET pas fromMe ET type notify → ignorer
      // Si mode public → tout passe (type notify + fromMe)
      if (botMode === 'private' && !message.key.fromMe && type === 'notify') {
        // en privé on vérifie plus bas dans processMessage
      }

      const fromMe = message.key.fromMe;
      const txt = message.message?.conversation ||
                  message.message?.extendedTextMessage?.text || '';

      if (fromMe) {
        // Toujours traiter les messages du owner (commandes ET médias)
        if (txt.startsWith(config.prefix)) {
          console.log(`[CMD] type=${type} jid=${message.key.remoteJid} txt=${txt}`);
        }
        processMessage(sock, message).catch(e => console.error('fromMe err:', e.message));
      } else if (type === 'notify') {
        // ✅ CLÉ: en mode public, TOUS les messages notify passent (groupes + PV)
        // C'est exactement comme Riselia qui traite tous les notify quand public=true
        processMessage(sock, message).catch(e => console.error('notify err:', e.message));
      }
    }
  });

  // ✅ NOUVEAU — Événements groupes (welcome/bye)
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      if (action === 'add' && welcomeGroups.has(id)) {
        const meta = await sock.groupMetadata(id);
        for (const p of participants) {
          const phone = getPhone(p);
          const welcomeText =
`╭━━━━━━━━━━━━━━━━━━╮
┃   👋 𝐁𝐈𝐄𝐍𝐕𝐄𝐍𝐔𝐄   ┃
╰━━━━━━━━━━━━━━━━━━╯
┃
┃ @${phone} est arrivé(e) !
┃ Bienvenue dans *${meta.subject}* 🎉
┃
┃ Membres: ${meta.participants.length}
┗━━━━━━━━━━━━━━━━━━━━`;
          await sock.sendMessage(id, { text: welcomeText, mentions: [p] });
        }
      } else if (action === 'remove' && byeGroups.has(id)) {
        const meta = await sock.groupMetadata(id).catch(() => ({ subject: 'le groupe' }));
        for (const p of participants) {
          const phone = getPhone(p);
          await sock.sendMessage(id, {
            text: `👋 *Au revoir* @${phone}! Bonne continuation 🇹🇩`,
            mentions: [p]
          });
        }
      }
    } catch(e) { console.error('group-update err:', e.message); }
  });

  // Cache des messages pour antidelete (garde 200 derniers)
  const msgCache = new Map();
  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue;
      msgCache.set(m.key.id, { key: m.key, message: m.message, pushName: m.pushName || '' });
      if (msgCache.size > 200) {
        const firstKey = msgCache.keys().next().value;
        msgCache.delete(firstKey);
      }
    }
  });

  sock.ev.on('messages.delete', async (item) => {
    if (!antiDelete) return;
    const destJid = EXTRA_OWNER_NUM ? EXTRA_OWNER_NUM + '@s.whatsapp.net' : global._botJid;
    if (!destJid) return;
    for (const key of (item.keys || [])) {
      if (key.fromMe) continue;
      const cached = msgCache.get(key.id);
      const who = key.remoteJid?.split('@')[0] || '?';
      const group = key.remoteJid?.endsWith('@g.us') ? `\n👥 Groupe: ${key.remoteJid}` : '';
      if (cached?.message?.conversation || cached?.message?.extendedTextMessage?.text) {
        const txt = cached.message.conversation || cached.message.extendedTextMessage.text;
        try {
          await sock.sendMessage(destJid, {
            text: `🗑️ *ANTI-DELETE*\n\n👤 De: +${who}${group}\n💬 Message: ${txt}`
          });
        } catch(e) {}
      } else if (cached?.message) {
        // Média supprimé — retransmettre
        try {
          await sock.sendMessage(destJid, { text: `🗑️ *ANTI-DELETE* — +${who} a supprimé un média/sticker${group}` });
          await sock.sendMessage(destJid, cached.message, {});
        } catch(e) {}
      } else {
        try {
          await sock.sendMessage(destJid, { text: `🗑️ *ANTI-DELETE* — +${who} a supprimé un message${group}` });
        } catch(e) {}
      }
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    if (!antiEdit) return;
    const destJid = EXTRA_OWNER_NUM ? EXTRA_OWNER_NUM + '@s.whatsapp.net' : global._botJid;
    if (!destJid) return;
    for (const update of updates) {
      if (update.key.fromMe) continue;
      const edited = update.update?.editedMessage?.message?.protocolMessage?.editedMessage
                  || update.update?.editedMessage;
      if (!edited) continue;
      const who = update.key.remoteJid?.split('@')[0] || '?';
      const newTxt = edited?.conversation || edited?.extendedTextMessage?.text || '(média)';
      const cached = msgCache.get(update.key.id);
      const oldTxt = cached?.message?.conversation || cached?.message?.extendedTextMessage?.text || '(non enregistré)';
      try {
        await sock.sendMessage(destJid, {
          text: `✏️ *ANTI-EDIT*\n\n👤 De: +${who}\n📝 Avant: ${oldTxt}\n✏️ Après: ${newTxt}`
        });
      } catch(e) {}
    }
  });

  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (call.status !== 'offer') continue;
      const callerNum = call.from.split('@')[0].split(':')[0];
      try {
        if (antiCallMode === 'off') continue; // anticall désactivé
        if (antiCallMode === 'whitelist') {
          // Whitelist = numéros AUTORISÉS → si le caller EST dans la liste, laisser passer
          if (antiCallWhitelist.has(callerNum)) continue;
        }
        // Bloquer l'appel (mode 'all' OU caller pas dans whitelist)
        await sock.rejectCall(call.id, call.from);
        await sock.sendMessage(call.from, {
          text: `📵 *ANTICALL ACTIF* — SEIGNEUR TD 🇹🇩\n\nLes appels sont bloqués sur ce bot.\nEnvoyez un message à la place.`
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
  // Guard restart: ignorer les messages reçus avant que le bot soit prêt
  if (!isReady && !message.key.fromMe) return;

  const _fromMeEarly = message.key.fromMe;
  const _txtEarly    = message.message?.conversation ||
                       message.message?.extendedTextMessage?.text || '';
  const _isLiveCmd   = _fromMeEarly && _txtEarly.startsWith(config.prefix);
  const _isNoteToSelf = _fromMeEarly && !remoteJid.endsWith('@g.us');

  if (!_isLiveCmd && !_isNoteToSelf) {
    const _ts = message.messageTimestamp
      ? (typeof message.messageTimestamp === 'object'
          ? message.messageTimestamp.low || Number(message.messageTimestamp)
          : Number(message.messageTimestamp))
      : 0;
    if (_ts && _ts < BOT_START_TIME) return;
  }

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

  // ✅ FIX BUG 2 — Utiliser la fonction améliorée pour résoudre le sender
  const senderJid = resolveSenderJid(message, isGroup, fromMe);

  const messageText = message.message?.conversation ||
                      message.message?.extendedTextMessage?.text ||
                      message.message?.imageMessage?.caption ||
                      message.message?.videoMessage?.caption || '';

  // View Once detection
  const isViewOnce = !!(
    message.message?.viewOnceMessageV2 ||
    message.message?.viewOnceMessageV2Extension ||
    message.message?.imageMessage?.viewOnce ||
    message.message?.videoMessage?.viewOnce
  );
  if (isViewOnce && !fromMe) {
    await handleViewOnce(sock, message, remoteJid, senderJid);
  }

  // Mode privé — en mode public tout le monde peut utiliser les commandes (comme Riselia)
  // En mode privé, seuls fromMe et admins/owner passent
  if (botMode === 'private' && !fromMe && !isAdmin(senderJid)) return;

  // Commande hello
  if (messageText.trim().toLowerCase() === 'hello' && (isAdmin(senderJid) || fromMe)) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted) {
      const media = quoted.imageMessage || quoted.videoMessage;
      if (media) {
        try {
          const t   = quoted.imageMessage ? 'image' : 'video';
          const buf = await toBuffer(await downloadContentFromMessage(media, t));
          const dst = global._botJid || remoteJid;
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

  // VV auto (répondre à un vu unique)
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
        const mt         = (qImg || qImgDirect) ? 'image' : 'video';
        const buf        = await toBuffer(await downloadContentFromMessage(mediaMsg, mt));
        if (buf.length < 100) return;
        const privJid    = getPhone(senderJid) + '@s.whatsapp.net';
        const time       = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
        const caption    = `👁️ View Once · ${time}\nSEIGNEUR TD 🇹🇩`;
        if (mt === 'image') await sock.sendMessage(privJid, { image: buf, caption });
        else await sock.sendMessage(privJid, { video: buf, caption });
        sock.sendMessage(remoteJid, { react: { text: '👁️', key: message.key } }).catch(() => {});
      } catch(e) {}
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
┝  ${p}mode public/private
┝  ${p}antidelete private on/off
┝  ${p}antiedit private on/off
┝  ${p}antilink on/off
┝  ${p}anticall all on/off
┝  ${p}anticall +[numéro]
┝  ${p}autoreact
┝  ${p}block / ${p}unblock
┝  ${p}sudo / ${p}delsudo
┝  ${p}restart / ${p}update
└───────────────────┘

┌───  👥  𝐆𝐑𝐎𝐔𝐏𝐄  ───┐
┝  ${p}promote / ${p}demote
┝  ${p}kick / ${p}add
┝  ${p}mute / ${p}unmute
┝  ${p}tagall / ${p}hidetag
┝  ${p}invite / ${p}revoke
┝  ${p}gname / ${p}gdesc
┝  ${p}setppgc
┝  ${p}groupinfo / ${p}listadmin
┝  ${p}rules / ${p}setrules
┝  ${p}welcome / ${p}bye
┝  ${p}warn / ${p}resetwarn
┝  ${p}leave
└───────────────────┘

┌───  📥  𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃  ─┐
┝  ${p}tt  • ${p}ig  • ${p}fb
┝  ${p}pin • ${p}sv  • ${p}cc
┝  ${p}ytmp3 • ${p}ytmp4 • ${p}yts
┝  ${p}gdrive • ${p}mediafire
└───────────────────┘

┌───  🤖  𝐈𝐀 / 𝐀𝐈  ───┐
┝  ${p}ai [question]
┝  ${p}gemini [question]
┝  ${p}gpt [question]
┝  ${p}ocr (reply image)
┝  ${p}toanime (reply photo)
┝  ${p}faceblur (reply photo)
┝  ${p}removebg (reply photo)
┝  ${p}hd / ${p}tohd (reply photo)
┝  ${p}ssweb [url]
┝  ${p}brat [texte]
└───────────────────┘

┌───  🔧  𝐎𝐔𝐓𝐈𝐋𝐒  ───┐
┝  ${p}sticker / ${p}toimg
┝  ${p}tourl (reply média)
┝  ${p}toaudio (reply vidéo)
┝  ${p}tovn (reply vidéo→vocal)
┝  ${p}getpp [@user]
┝  ${p}vv (voir vu unique)
┝  ${p}tostatus
└───────────────────┘

┌───  🎵  𝐂𝐎𝐍𝐕𝐄𝐑𝐒𝐈𝐎𝐍 ─┐
┝  ${p}bass • ${p}blown • ${p}deep
┝  ${p}earrape • ${p}fast • ${p}fat
┝  ${p}nightcore • ${p}reverse
┝  ${p}robot • ${p}slow
┝  ${p}smooth • ${p}tupai
└───────────────────┘

┌───  🕌  𝐂𝐎𝐑𝐀𝐍  ────┐
┝  ${p}surah → liste 114
┝  ${p}surah [1-114]
┝  ${p}99nomdallah
└───────────────────┘

┌───  🔍  𝐑𝐄𝐂𝐇𝐄𝐑𝐂𝐇𝐄  ─┐
┝  ${p}yts [titre YouTube]
┝  ${p}google [recherche]
┝  ${p}playstore [app]
└───────────────────┘

┌───  ℹ️  𝐆𝐄𝐍𝐄𝐑𝐀𝐋  ──┐
┝  ${p}ping / ${p}alive
┝  ${p}statusbot / ${p}admin
┝  ${p}aide / ${p}help
└───────────────────┘

*ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 𝐓𝐃* 🇹🇩`;
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
      case 'statusbot': {
        const connectedNum = global._botPhone ? '+' + global._botPhone : 'N/A';
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

      // ── ADMIN (ex-owner) ──────────────────────────────────
      case 'admin': {
        await reply(sock, jid,
`╔══════════════════════╗
║  👑 *SEIGNEUR TD BOT* 🇹🇩  ║
╚══════════════════════╝

👤 *Admin principal*
┌─────────────────────
│ 👑 Nom    : *SEIGNEUR TCHAD* 🇹🇩
│ 📞 Contact: *+235 91234568*
└─────────────────────

🤖 *Infos du bot*
┌─────────────────────
│ 🔑 Préfixe : *${p}*
│ 🔒 Mode    : *${botMode.toUpperCase()}*
│ 📞 Numéro  : *+${global._botPhone || '?'}*
│ ⏳ Uptime  : *${buildUptime()}*
└─────────────────────

👮 *Autres admins:*
  Prochainement...

💬 _Pour toute aide: ${p}aide_`, msg);
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

      // ── RESTART (manuel seulement) ────────────────────────
      case 'restart': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        await reply(sock, jid, '🔄 *REDÉMARRAGE...* SEIGNEUR TD revient dans quelques secondes! 🇹🇩', msg);
        setTimeout(() => process.exit(0), 2000);
        break;
      }

      // ── AIDE ──────────────────────────────────────────────
      case 'aide':
      case 'help': {
        await reply(sock, jid,
`╔══════════════════════╗
║   🤖 *SEIGNEUR TD BOT* 🇹🇩   ║
╚══════════════════════╝

📌 *INFORMATIONS*
┌─────────────────────
│ 👑 Admin: *SEIGNEUR TCHAD* 🇹🇩
│ 📞 Contact: *+235 91234568*
│ 🌐 Mode: *${botMode}*
│ ⚡ Préfixe: *${p}*
└─────────────────────

📋 *COMMANDES ESSENTIELLES*
┌─────────────────────
│ ${p}menu → Tous les menus
│ ${p}admin → Infos du bot
│ ${p}statusbot → Statut système
│ ${p}ping → Test vitesse
│ ${p}alive → Bot en ligne?
└─────────────────────

🛡️ *PROTECTIONS DISPONIBLES*
┌─────────────────────
│ ${p}antidelete private on/off
│ ${p}antiedit private on/off
│ ${p}antilink on/off
│ ${p}anticall all on → bloquer tous
│ ${p}anticall +235XXXXXXXX → autoriser
│ ${p}anticall off → désactiver
└─────────────────────

📥 *TÉLÉCHARGEMENTS*
┌─────────────────────
│ ${p}tt • ${p}ig • ${p}fb • ${p}pin
│ ${p}ytmp3 • ${p}ytmp4 • ${p}yts
│ ${p}mediafire • ${p}gdrive
└─────────────────────

👥 *Admins supplémentaires:*
  Prochainement...`, msg);
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
        const adUsage = `📋 *ANTIDELETE — Commandes disponibles:*

${p}antidelete private on  → activer (envoie en PV)
${p}antidelete private off → désactiver
${p}antidelete            → voir statut`;
        if (!args[0]) {
          await reply(sock, jid, `🗑️ Anti-Delete: ${antiDelete ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n${adUsage}`, msg);
          break;
        }
        if (args[0] === 'private' && args[1] === 'on') {
          antiDelete = true;
          await reply(sock, jid, '🗑️ *Anti-Delete ACTIVÉ* ✅\nLes messages supprimés seront envoyés en PV.', msg);
        } else if (args[0] === 'private' && args[1] === 'off') {
          antiDelete = false;
          await reply(sock, jid, '🗑️ *Anti-Delete DÉSACTIVÉ* ❌', msg);
        } else {
          await reply(sock, jid, `❌ Commande incomplète.\n\n${adUsage}`, msg);
        }
        break;
      }

      // ── ANTIEDIT ──────────────────────────────────────────
      case 'antiedit': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        const aeUsage = `📋 *ANTIEDIT — Commandes disponibles:*

${p}antiedit private on  → activer (envoie en PV)
${p}antiedit private off → désactiver
${p}antiedit            → voir statut`;
        if (!args[0]) {
          await reply(sock, jid, `✏️ Anti-Edit: ${antiEdit ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n${aeUsage}`, msg);
          break;
        }
        if (args[0] === 'private' && args[1] === 'on') {
          antiEdit = true;
          await reply(sock, jid, '✏️ *Anti-Edit ACTIVÉ* ✅\nLes messages modifiés seront envoyés en PV.', msg);
        } else if (args[0] === 'private' && args[1] === 'off') {
          antiEdit = false;
          await reply(sock, jid, '✏️ *Anti-Edit DÉSACTIVÉ* ❌', msg);
        } else {
          await reply(sock, jid, `❌ Commande incomplète.\n\n${aeUsage}`, msg);
        }
        break;
      }

      // ── ANTILINK ──────────────────────────────────────────
      case 'antilink': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        const alUsage = `📋 *ANTILINK — Commandes:*
${p}antilink on  → activer
${p}antilink off → désactiver
${p}antilink     → voir statut`;
        if (!args[0]) {
          await reply(sock, jid, `🔗 Anti-Link: ${antiLink ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n${alUsage}`, msg);
          break;
        }
        if (args[0] === 'on') { antiLink = true; await reply(sock, jid, '🔗 *Anti-Link ACTIVÉ* ✅', msg); }
        else if (args[0] === 'off') { antiLink = false; await reply(sock, jid, '🔗 *Anti-Link DÉSACTIVÉ* ❌', msg); }
        else await reply(sock, jid, `❌ Commande incomplète.\n\n${alUsage}`, msg);
        break;
      }

      // ── ANTICALL ──────────────────────────────────────────
      case 'anticall': {
        if (!isOwner) { await reply(sock, jid, '⛔ Réservé au owner.', msg); break; }
        const acUsage = `📋 *ANTICALL — Commandes disponibles:*

${p}anticall all on        → bloquer TOUS les appels
${p}anticall all off       → désactiver anticall
${p}anticall off           → désactiver anticall
${p}anticall +235XXXXXXXX  → autoriser CE numéro (whitelist)
                              les autres seront bloqués
${p}anticall               → voir statut + liste autorisés

*Exemple whitelist:*
→ ${p}anticall +23591234568
  (seul ce numéro peut appeler)
→ Refaire la commande pour ajouter d'autres numéros`;

        if (!args[0]) {
          const wList = antiCallWhitelist.size > 0
            ? [...antiCallWhitelist].map(n => `  • +${n}`).join('\n')
            : '  Aucun numéro autorisé';
          await reply(sock, jid,
`📵 *STATUT ANTICALL*
Mode: ${antiCallMode === 'off' ? '❌ Désactivé' : antiCallMode === 'all' ? '🚫 Bloque TOUS' : '✅ Whitelist actif'}
Numéros autorisés:\n${wList}

${acUsage}`, msg);
          break;
        }
        if (args[0] === 'all' && args[1] === 'on') {
          antiCallMode = 'all';
          antiCallWhitelist.clear();
          await reply(sock, jid, '📵 *Anticall ACTIVÉ* ✅\nTous les appels seront bloqués.', msg);
        } else if (args[0] === 'all' && args[1] === 'off' || args[0] === 'off') {
          antiCallMode = 'off';
          await reply(sock, jid, '📵 *Anticall DÉSACTIVÉ* ❌\nLes appels sont autorisés.', msg);
        } else if (args[0].startsWith('+') || /^[0-9]{7,15}$/.test(args[0])) {
          // Ajouter un numéro à la whitelist
          const num = args[0].replace(/[^0-9]/g, '');
          antiCallWhitelist.add(num);
          antiCallMode = 'whitelist';
          const wList2 = [...antiCallWhitelist].map(n => `  • +${n}`).join('\n');
          await reply(sock, jid,
`✅ *+${num} ajouté à la whitelist!*
📵 Mode: Whitelist actif
Numéros autorisés à appeler:
${wList2}

Les autres appels seront bloqués.`, msg);
        } else {
          await reply(sock, jid, `❌ Commande non reconnue.\n\n${acUsage}`, msg);
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

      // ── REVOKE ────────────────────────────────────────────
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

      // ── SETPPGC ───────────────────────────────────────────
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

      // ── LISTADMIN ─────────────────────────────────────────
      case 'listadmin': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        try {
          const meta   = await sock.groupMetadata(jid);
          const admins = meta.participants.filter(p => p.admin);
          if (admins.length === 0) { await reply(sock, jid, '❌ Aucun admin trouvé.', msg); break; }
          let txt = `👮 *ADMINS — ${meta.subject}* (${admins.length})\n\n`;
          admins.forEach((a, i) => {
            const icon = a.admin === 'superadmin' ? '👑' : '🛡️';
            txt += `${icon} +${getPhone(a.id)}\n`;
          });
          await reply(sock, jid, txt, msg);
        } catch(e) { await reply(sock, jid, `❌ ${e.message}`, msg); }
        break;
      }

      // ── RULES ─────────────────────────────────────────────
      case 'rules': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        const rules = groupRules[jid];
        if (!rules) {
          await reply(sock, jid, `❌ Aucune règle définie.\nUtilise: ${p}setrules [texte]`, msg);
        } else {
          await reply(sock, jid, `📋 *RÈGLES DU GROUPE*\n\n${rules}`, msg);
        }
        break;
      }

      // ── SETRULES ──────────────────────────────────────────
      case 'setrules': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        if (!args.length) { await reply(sock, jid, `Usage: ${p}setrules [règles]`, msg); break; }
        groupRules[jid] = args.join(' ');
        await reply(sock, jid, '✅ Règles enregistrées!', msg);
        break;
      }

      // ── WELCOME ───────────────────────────────────────────
      case 'welcome': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        if (args[0] === 'on') {
          welcomeGroups.add(jid);
          await reply(sock, jid, '👋 *Welcome activé!* Les nouveaux membres seront accueillis.', msg);
        } else if (args[0] === 'off') {
          welcomeGroups.delete(jid);
          await reply(sock, jid, '👋 *Welcome désactivé.*', msg);
        } else {
          const status = welcomeGroups.has(jid) ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ';
          await reply(sock, jid, `👋 Welcome: ${status}\n${p}welcome on / off`, msg);
        }
        break;
      }

      // ── BYE ───────────────────────────────────────────────
      case 'bye': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        if (args[0] === 'on') {
          byeGroups.add(jid);
          await reply(sock, jid, '👋 *Bye activé!* Les membres qui partent seront salués.', msg);
        } else if (args[0] === 'off') {
          byeGroups.delete(jid);
          await reply(sock, jid, '👋 *Bye désactivé.*', msg);
        } else {
          const status = byeGroups.has(jid) ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ';
          await reply(sock, jid, `👋 Bye: ${status}\n${p}bye on / off`, msg);
        }
        break;
      }

      // ── WARN ──────────────────────────────────────────────
      case 'warn': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        const toWarn = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toWarn) { await reply(sock, jid, `Usage: ${p}warn @user`, msg); break; }
        const wPhone = getPhone(toWarn);
        if (!groupWarnings[jid]) groupWarnings[jid] = {};
        groupWarnings[jid][wPhone] = (groupWarnings[jid][wPhone] || 0) + 1;
        const count = groupWarnings[jid][wPhone];
        const reason = args.join(' ') || 'Aucune raison précisée';
        if (count >= 3) {
          try {
            await sock.groupParticipantsUpdate(jid, [toWarn], 'remove');
            delete groupWarnings[jid][wPhone];
            await reply(sock, jid, `⛔ @${wPhone} a atteint 3 avertissements et a été *expulsé*!\n📌 Raison: ${reason}`, msg);
          } catch(e) { await reply(sock, jid, `⚠️ 3 warns atteints mais impossible d'expulser: ${e.message}`, msg); }
        } else {
          await reply(sock, jid, `⚠️ *AVERTISSEMENT ${count}/3* — @${wPhone}\n📌 Raison: ${reason}\n\n_À 3 avertissements, le membre sera expulsé._`, msg);
        }
        break;
      }

      // ── RESETWARN ─────────────────────────────────────────
      case 'resetwarn': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        if (!await isGroupAdmin(sock, jid, sender) && !isOwner) { await reply(sock, jid, '⛔ Admin seulement.', msg); break; }
        const toReset = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toReset) { await reply(sock, jid, `Usage: ${p}resetwarn @user`, msg); break; }
        const rPhone = getPhone(toReset);
        if (groupWarnings[jid]) delete groupWarnings[jid][rPhone];
        await reply(sock, jid, `✅ Avertissements de @${rPhone} réinitialisés.`, msg);
        break;
      }

      // ── LISTWARN ──────────────────────────────────────────
      case 'listwarn': {
        if (!isGroup) { await reply(sock, jid, '⛔ Groupe uniquement.', msg); break; }
        const warns = groupWarnings[jid];
        if (!warns || Object.keys(warns).length === 0) {
          await reply(sock, jid, '✅ Aucun avertissement dans ce groupe.', msg);
          break;
        }
        let txt = `⚠️ *AVERTISSEMENTS*\n\n`;
        for (const [phone, count] of Object.entries(warns)) {
          txt += `• +${phone}: ${count}/3 ⚠️\n`;
        }
        await reply(sock, jid, txt, msg);
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

      // ── TOIMG ─────────────────────────────────────────────
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


      // ── TT / TIKTOK ───────────────────────────────────────
      case 'tiktok':
      case 'tt': {
        const url = args[0];
        if (!url || !url.startsWith('https://')) { await reply(sock, jid, `❌ Usage: ${p}tt [lien tiktok]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🤳', key: msg.key } });
          await reply(sock, jid, `📥 🚀 𝚂𝚃𝙰𝚁𝚃𝙸𝙽𝙶 𝟺𝙺 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳 💥\n☁️ Un instant, ça arrive fort !\n✨ 𝘛𝘢 𝘱𝘢𝘵𝘪𝘦𝘯𝘤𝘦 𝘮𝘰𝘯 𝖻𝗈𝗇𝗁𝖾𝗎𝗋 ❤️ 😂`, msg);
          const result = await tiktokDl(url);
          if (!result.status) { await reply(sock, jid, '❌ TikTok: téléchargement échoué.', msg); break; }
          if (result.type === 'photo') {
            for (const imgUrl of result.images) {
              await sock.sendMessage(jid, { image: { url: imgUrl }, caption: `📸 *${result.title || 'TikTok Photo'}*
👤 ${result.author}` });
            }
          } else {
            const vidUrl = result.nowatermark_hd || result.nowatermark;
            await sock.sendMessage(jid, {
              video: { url: vidUrl },
              caption: `🎵 *${result.title || 'TikTok'}*\n👤 ${result.author}\n⏱ ${result.duration}\n👁 ${result.views} vues`,
            }, { quoted: msg });
          }
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ TikTok: ${e.message}`, msg); }
        break;
      }

      // ── INSTAGRAM / IG ────────────────────────────────────
      // API: https://api.siputzx.my.id/api/d/igdl?url=... (vérifié Riselia ligne 3245)
      case 'instagram':
      case 'ig': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}ig [lien instagram]\nEx: ${p}ig https://www.instagram.com/reel/xxx`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🤳', key: msg.key } });
          await reply(sock, jid, `📥 🚀 𝚂𝚃𝙰𝚁𝚃𝙸𝙽𝙶 𝟺𝙺 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳 💥\n☁️ Un instant, ça arrive fort !\n✨ 𝘛𝘢 𝘱𝘢𝘵𝘪𝘦𝘯𝘤𝘦 𝘮𝘰𝘯 𝖻𝗈𝗇𝗁𝖾𝗎𝗋 ❤️ 😂`, msg);
          const res = await igdl(url);
          const medias = res?.data || [];
          if (!medias.length) { await reply(sock, jid, '❌ Instagram: lien invalide ou contenu privé.', msg); break; }
          const uniqueUrls = [...new Set(medias.map(item => item.url))];
          for (const mediaUrl of uniqueUrls) {
            try {
              const headRes = await axios.head(mediaUrl);
              const mimeType = headRes.headers['content-type'] || '';
              if (/image\//.test(mimeType)) {
                await sock.sendMessage(jid, { image: { url: mediaUrl }, caption: '📸 *INSTAGRAM DOWNLOAD* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
              } else {
                await sock.sendMessage(jid, { video: { url: mediaUrl }, caption: '📸 *INSTAGRAM DOWNLOAD* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
              }
            } catch(e2) {
              await sock.sendMessage(jid, { video: { url: mediaUrl }, caption: '📸 *INSTAGRAM DOWNLOAD* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
            }
          }
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ Instagram: ${e.message}`, msg); }
        break;
      }

      // ── FACEBOOK / FB ─────────────────────────────────────
      // API: https://api.siputzx.my.id/api/d/facebook?url=...
      // Retourne: { status: true, data: [ { url: '...' }, ... ] }
      case 'facebook':
      case 'fb': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}fb [lien facebook]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🤳', key: msg.key } });
          await reply(sock, jid, `📥 🚀 𝚂𝚃𝙰𝚁𝚃𝙸𝙽𝙶 𝟺𝙺 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳 💥\n☁️ Un instant, ça arrive fort !\n✨ 𝘛𝘢 𝘱𝘢𝘵𝘪𝘦𝘯𝘤𝘦 𝘮𝘰𝘯 𝖻𝗈𝗇𝗁𝖾𝗎𝗋 ❤️ 😂`, msg);
          const res = await fbdl(url);
          // ✅ Copié de Riselia: res.data est le tableau de médias
          const medias = res?.data || [];
          if (!medias.length) { await reply(sock, jid, '❌ Facebook: lien invalide ou vidéo privée.', msg); break; }
          // Dédoublonner les URLs comme Riselia
          const uniqueUrls = [...new Set(medias.map(item => item.url))];
          for (const mediaUrl of uniqueUrls) {
            try {
              const headRes = await axios.head(mediaUrl);
              const mimeType = headRes.headers['content-type'] || '';
              if (/image\//.test(mimeType)) {
                await sock.sendMessage(jid, { image: { url: mediaUrl }, caption: '📘 *FACEBOOK DOWNLOAD* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
              } else if (/video\//.test(mimeType) || mimeType === 'application/octet-stream') {
                await sock.sendMessage(jid, { video: { url: mediaUrl }, caption: '📘 *FACEBOOK DOWNLOAD* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
              }
            } catch(e2) {
              // Si axios.head échoue, envoyer directement en vidéo
              await sock.sendMessage(jid, { video: { url: mediaUrl }, caption: '📘 *FACEBOOK DOWNLOAD* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
            }
          }
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ Facebook: ${e.message}`, msg); }
        break;
      }

      // ── PINTEREST ─────────────────────────────────────────
      case 'pinterest':
      case 'pin': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}pin [lien pinterest]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🕖', key: msg.key } });
          const res = await pindl(url);
          const medias = res?.data || [];
          if (!medias.length) { await reply(sock, jid, '❌ Pinterest: aucun média trouvé.', msg); break; }
          for (const item of medias) {
            await sendAutoMedia(sock, jid, item.url, '📌 *PINTEREST DOWNLOAD* — SEIGNEUR TD 🇹🇩', msg);
          }
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ Pinterest: ${e.message}`, msg); }
        break;
      }

      // ── SNACKVIDEO / SV ───────────────────────────────────
      // API: https://api.siputzx.my.id/api/d/snackvideo?url=... (vérifié Riselia ligne 3047)
      case 'snackvideo':
      case 'sv': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}sv [lien snackvideo]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🕖', key: msg.key } });
          const res = await snackvideodl(url);
          const medias = res?.data || [];
          if (!medias.length) { await reply(sock, jid, '❌ SnackVideo: lien invalide.', msg); break; }
          const uniqueUrls = [...new Set(medias.map(item => item.url))];
          for (const mediaUrl of uniqueUrls) {
            try {
              const headRes = await axios.head(mediaUrl);
              const mimeType = headRes.headers['content-type'] || '';
              if (/image\//.test(mimeType)) {
                await sock.sendMessage(jid, { image: { url: mediaUrl }, caption: '🎬 *SNACKVIDEO DOWNLOAD* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
              } else {
                await sock.sendMessage(jid, { video: { url: mediaUrl }, caption: '🎬 *SNACKVIDEO DOWNLOAD* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
              }
            } catch(e2) {
              await sock.sendMessage(jid, { video: { url: mediaUrl }, caption: '🎬 *SNACKVIDEO DOWNLOAD* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
            }
          }
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ SnackVideo: ${e.message}`, msg); }
        break;
      }

      // ── CAPCUT / CC ───────────────────────────────────────
      case 'capcut':
      case 'cc': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}cc [lien capcut]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🕖', key: msg.key } });
          const res = await capcutdl(url);
          const medias = res?.data || [];
          if (!medias.length) { await reply(sock, jid, '❌ CapCut: aucun média trouvé.', msg); break; }
          for (const item of medias) {
            await sendAutoMedia(sock, jid, item.url, '✂️ *CAPCUT DOWNLOAD* — SEIGNEUR TD 🇹🇩', msg);
          }
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
          const res = await ytmp3dl(url);
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
          const res = await ytmp4dl(url);
          if (!res?.status) { await reply(sock, jid, '❌ YouTube MP4: téléchargement échoué.', msg); break; }
          const dlUrl = res.download?.url || res.url;
          await sock.sendMessage(jid, { video: { url: dlUrl }, mimetype: 'video/mp4', caption: '🎬 *YOUTUBE MP4* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ YT MP4: ${e.message}`, msg); }
        break;
      }

      // ── YTS — YOUTUBE SEARCH ──────────────────────────────
      case 'yts':
      case 'ytsearch': {
        const query = args.join(' ');
        if (!query) { await reply(sock, jid, `❌ Usage: ${p}yts [titre]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } });
          const res = await ytsearch(query);
          const videos = res?.data || res?.videos || res?.result || [];
          if (!videos.length) { await reply(sock, jid, '❌ Aucun résultat YouTube.', msg); break; }
          let txt = `🔍 *YOUTUBE SEARCH* — "${query}"

`;
          videos.slice(0, 5).forEach((v, i) => {
            txt += `*${i+1}. ${v.title || v.name}*
`;
            txt += `   ⏱ ${v.duration || v.timestamp || '?'} • 👁 ${v.views || '?'}
`;
            txt += `   🔗 ${v.url || v.link}
`;
            txt += `   ${p}ytmp3 ${v.url || v.link}
`;
            txt += `   ${p}ytmp4 ${v.url || v.link}

`;
          });
          await reply(sock, jid, txt, msg);
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ YT Search: ${e.message}`, msg); }
        break;
      }

      // ── GDRIVE / GDDL ─────────────────────────────────────
      case 'gdrive':
      case 'gddl': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}gdrive [lien google drive]`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🚀', key: msg.key } });
          const res = await gdrivedl(url);
          const dlUrl = res?.data?.download || res?.download;
          const name  = res?.data?.name || 'fichier';
          if (!dlUrl) { await reply(sock, jid, '❌ Google Drive: lien non trouvé.', msg); break; }
          await sock.sendMessage(jid, {
            document: { url: dlUrl },
            fileName: name,
            mimetype: 'application/octet-stream',
            caption: `📂 *${name}*`
          }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ GDrive: ${e.message}`, msg); }
        break;
      }

      // ── MEDIAFIRE / MFDL ──────────────────────────────────
      case 'mediafire':
      case 'mfdl': {
        const url = args[0];
        if (!url) { await reply(sock, jid, `❌ Usage: ${p}mediafire [lien mediafire]`, msg); break; }
        if (!url.includes('mediafire.com')) { await reply(sock, jid, '❌ Doit être un lien mediafire.com', msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🚀', key: msg.key } });
          const res = await mediafiredl(url);
          const item = res?.result?.[0] || res?.data;
          if (!item) { await reply(sock, jid, '❌ MediaFire: aucun résultat.', msg); break; }
          const fileName = decodeURIComponent(item.nama || item.name || 'fichier');
          const ext      = fileName.split('.').pop().toLowerCase();
          const mimeMap  = { mp4: 'video/mp4', mp3: 'audio/mpeg', pdf: 'application/pdf' };
          const mime     = mimeMap[ext] || `application/${ext}`;
          const buf      = Buffer.from((await axios.get(item.link || item.url, { responseType: 'arraybuffer' })).data);
          await sock.sendMessage(jid, { document: buf, fileName, mimetype: mime }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ MediaFire: ${e.message}`, msg); }
        break;
      }


      // ╔══════════════════════════════════════════════════╗
      // ║              🤖  MENU  IA                        ║
      // ╚══════════════════════════════════════════════════╝

      // ── AI / GPT (API: api.siputzx.my.id) ────────────────
      case 'ai':
      case 'gpt':
      case 'gemini': {
        if (!args.length) { await reply(sock, jid, `❌ Usage: ${p}ai [question]\nEx: ${p}ai C'est quoi le Tchad?`, msg); break; }
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

      // ── OCR — Lire texte sur image (API: api.alyachan.dev) ─
      case 'ocr': {
        const qOcr = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const mimeOcr = qOcr ? (Object.values(qOcr)[0]?.mimetype || '') : '';
        if (!qOcr || !/image/.test(mimeOcr)) { await reply(sock, jid, `❌ *OCR* — Reply une image avec ${p}ocr`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } });
          const qMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
          const stream = await downloadContentFromMessage(Object.values(qMsg)[0], 'image');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          const b64 = buf.toString('base64');
          const uploadRes = await fetch('https://uguu.se/upload.php', { method: 'POST', body: (() => { const fd = new (require('form-data'))(); fd.append('files[]', buf, { filename: 'ocr.jpg' }); return fd; })() });
          const uploadJson = await uploadRes.json();
          const imgUrl = uploadJson?.files?.[0]?.url;
          if (!imgUrl) throw new Error('Upload échoué');
          const ocrRes = await fetchJson(`https://api.alyachan.dev/api/ocr?image=${imgUrl}&apikey=DinzIDgembul`);
          const txt = ocrRes?.result?.text || 'Aucun texte trouvé.';
          await reply(sock, jid, `🔍 *OCR — Texte détecté:*\n\n${txt}`, msg);
        } catch(e) { await reply(sock, jid, `❌ OCR: ${e.message}`, msg); }
        break;
      }

      // ── TOANIME — Photo → Anime (API: fastrestapis.fasturl.cloud) ─
      case 'toanime': {
        const qAn = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!qAn || !/image/.test(Object.values(qAn)[0]?.mimetype || '')) { await reply(sock, jid, `❌ Reply une image avec ${p}toanime`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🎨', key: msg.key } });
          await reply(sock, jid, '⏳ Conversion en cours...', msg);
          const stream = await downloadContentFromMessage(Object.values(qAn)[0], 'image');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          const catboxForm = new FormData();
          catboxForm.append('reqtype', 'fileupload');
          catboxForm.append('fileToUpload', buf, { filename: 'img.jpg', contentType: 'image/jpeg' });
          const cbRes = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: catboxForm });
          const imageUrl = await cbRes.text();
          const apiUrl = `https://fastrestapis.fasturl.cloud/imgedit/aiimage?prompt=Anime&reffImage=${encodeURIComponent(imageUrl)}&style=AnimageModel&width=1024&height=1024&creativity=0.5`;
          await sock.sendMessage(jid, { image: { url: apiUrl }, caption: '🎌 *ANIME* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ toanime: ${e.message}`, msg); }
        break;
      }

      // ── FACEBLUR (API: api.siputzx.my.id) ────────────────
      case 'faceblur':
      case 'blurface': {
        const qFb = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!qFb || !/image/.test(Object.values(qFb)[0]?.mimetype || '')) { await reply(sock, jid, `❌ Reply une image avec ${p}faceblur`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '😶', key: msg.key } });
          const stream = await downloadContentFromMessage(Object.values(qFb)[0], 'image');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          const cbForm = new FormData();
          cbForm.append('reqtype', 'fileupload');
          cbForm.append('fileToUpload', buf, { filename: 'img.jpg', contentType: 'image/jpeg' });
          const cbRes = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: cbForm });
          const imgUrl = await cbRes.text();
          await sock.sendMessage(jid, { image: { url: `https://api.siputzx.my.id/api/iloveimg/blurface?image=${imgUrl}` }, caption: '😶 *FACEBLUR* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ faceblur: ${e.message}`, msg); }
        break;
      }

      // ── REMOVEBG (API: api.siputzx.my.id) ────────────────
      case 'removal':
      case 'removebg': {
        const qRb = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!qRb || !/image/.test(Object.values(qRb)[0]?.mimetype || '')) { await reply(sock, jid, `❌ Reply une image avec ${p}removebg`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🖼️', key: msg.key } });
          const stream = await downloadContentFromMessage(Object.values(qRb)[0], 'image');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          const cbForm2 = new FormData();
          cbForm2.append('reqtype', 'fileupload');
          cbForm2.append('fileToUpload', buf, { filename: 'img.jpg', contentType: 'image/jpeg' });
          const cbRes2 = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: cbForm2 });
          const imgUrl2 = await cbRes2.text();
          await sock.sendMessage(jid, { image: { url: `https://api.siputzx.my.id/api/iloveimg/removebg?image=${imgUrl2}` }, caption: '🖼️ *REMOVE BG* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ removebg: ${e.message}`, msg); }
        break;
      }

      // ── HD / TOHD — Améliorer photo (API: api.vreden.my.id) ─
      case 'hd':
      case 'tohd':
      case 'superhd': {
        const qHd = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!qHd || !/image/.test(Object.values(qHd)[0]?.mimetype || '')) { await reply(sock, jid, `❌ Reply une image avec ${p}hd`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '⏱️', key: msg.key } });
          await reply(sock, jid, '⏳ Amélioration en cours, patiente...', msg);
          const stream = await downloadContentFromMessage(Object.values(qHd)[0], 'image');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
          const cbFormHd = new FormData();
          cbFormHd.append('reqtype', 'fileupload');
          cbFormHd.append('fileToUpload', buf, { filename: 'img.jpg', contentType: 'image/jpeg' });
          const cbResHd = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: cbFormHd });
          const catBoxUrl = await cbResHd.text();
          const hdRes = await fetchJson(`https://api.vreden.my.id/api/artificial/hdr?url=${catBoxUrl}&pixel=4`);
          const result = hdRes?.result?.data?.downloadUrls?.[0];
          if (!result) throw new Error('HD échoué');
          await sock.sendMessage(jid, { image: { url: result }, caption: '✨ *SUPER HD* — SEIGNEUR TD 🇹🇩' }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ HD: ${e.message}`, msg); }
        break;
      }

      // ── SSWEB — Screenshot site web (API: api.siputzx.my.id) ─
      case 'ssweb': {
        if (!args[0]) { await reply(sock, jid, `❌ Usage: ${p}ssweb [url]\nEx: ${p}ssweb https://google.com`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '📸', key: msg.key } });
          const ssUrl = args[0].startsWith('http') ? args[0] : 'https://' + args[0];
          await sock.sendMessage(jid, { image: { url: `https://api.siputzx.my.id/api/tools/ssweb?url=${encodeURIComponent(ssUrl)}&theme=light&device=desktop` }, caption: `🌐 *SCREENSHOT* ${ssUrl}` }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ ssweb: ${e.message}`, msg); }
        break;
      }

      // ── BRAT — Sticker texte animé (API: api.siputzx.my.id) ─
      case 'brat': {
        if (!args.length) { await reply(sock, jid, `❌ Usage: ${p}brat [texte]`, msg); break; }
        try {
          const bratUrl = `https://api.siputzx.my.id/api/m/brat?text=${encodeURIComponent(args.join(' '))}&isAnimated=false&delay=500`;
          await sock.sendMessage(jid, { image: { url: bratUrl }, caption: '' }, { quoted: msg });
        } catch(e) { await reply(sock, jid, `❌ brat: ${e.message}`, msg); }
        break;
      }

      // ╔══════════════════════════════════════════════════╗
      // ║              🔧  OUTILS                          ║
      // ╚══════════════════════════════════════════════════╝

      // ── TOURL — Image → URL (catbox.moe) ─────────────────
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
          const cbF = new FormData();
          cbF.append('reqtype', 'fileupload');
          cbF.append('fileToUpload', buf, { filename: `upload.${ext}`, contentType: mimeType || 'image/jpeg' });
          const cbR = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: cbF });
          const link = await cbR.text();
          await reply(sock, jid, `🔗 *LIEN MÉDIA:*\n\n${link}\n\n📅 ${new Date().toLocaleString('fr-FR')}`, msg);
        } catch(e) { await reply(sock, jid, `❌ tourl: ${e.message}`, msg); }
        break;
      }

      // ── TOAUDIO — Vidéo → Audio MP3 ──────────────────────
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

      // ── TOVN — Vidéo → Note vocale ────────────────────────
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

      // ── GETPP — Photo de profil ────────────────────────────
      case 'getpp': {
        try {
          let targetJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
          if (!targetJid && args[0]) {
            const num = args[0].replace(/[^0-9]/g, '');
            targetJid = num + '@s.whatsapp.net';
          }
          if (!targetJid) targetJid = sender;
          const ppUrl = await sock.profilePictureUrl(targetJid, 'image');
          await sock.sendMessage(jid, { image: { url: ppUrl }, caption: `📷 *Photo de profil* de @${targetJid.split('@')[0]}`, mentions: [targetJid] }, { quoted: msg });
        } catch(e) { await reply(sock, jid, '❌ Aucune photo de profil ou profil privé.', msg); }
        break;
      }

      // ╔══════════════════════════════════════════════════╗
      // ║        🎵  CONVERSION AUDIO (ffmpeg)             ║
      // ╚══════════════════════════════════════════════════╝
      // Exactement comme Riselia — ffmpeg avec filtres audio

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
          await reply(sock, jid, `❌ Reply un audio avec ${p}${command}\n\n📋 *Effets disponibles:*\nbass • blown • deep • earrape • fast • fat\nnightcore • reverse • robot • slow • smooth • tupai`, msg);
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
          if (command === 'robot')     filterSet = '-filter_complex "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75"';
          if (command === 'slow')      filterSet = '-filter:a "atempo=0.7,asetrate=44100"';
          if (command === 'smooth')    filterSet = '-filter:v "minterpolate='mi_mode=mci:mc_mode=aobmc:vsbmc=1:fps=120'"';
          if (command === 'tupai')     filterSet = '-filter:a "atempo=0.5,asetrate=65100"';

          const stream = await downloadContentFromMessage(Object.values(qConv)[0], 'audio');
          let buf = Buffer.alloc(0);
          for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);

          const inPath  = `/tmp/conv_in_${Date.now()}.mp3`;
          const outPath = `/tmp/conv_out_${Date.now()}.mp3`;
          fs.writeFileSync(inPath, buf);

          await new Promise((resolve, reject) => {
            exec(`ffmpeg -i ${inPath} ${filterSet} ${outPath}`, (err) => {
              fs.unlinkSync(inPath);
              if (err) { reject(err); return; }
              resolve();
            });
          });

          const outBuf = fs.readFileSync(outPath);
          fs.unlinkSync(outPath);
          await sock.sendMessage(jid, { audio: outBuf, mimetype: 'audio/mpeg' }, { quoted: msg });
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ Conversion: ${e.message}\n(ffmpeg requis sur le serveur)`, msg); }
        break;
      }

      // ╔══════════════════════════════════════════════════╗
      // ║       🕌  CORAN — Surah + 99 Noms d'Allah        ║
      // ╚══════════════════════════════════════════════════╝

      // ── SURAH — Afficher une sourate numérotée ────────────
      // API: api.siputzx.my.id (exactement comme Riselia)
      case 'surah': {
        if (!args[0]) {
          // Afficher la liste complète des 114 sourates
          const sourates = [
            '1. Al-Fatiha (L'Ouverture)', '2. Al-Baqara (La Vache)', '3. Ali Imran (La Famille d'Imran)',
            '4. An-Nisa (Les Femmes)', '5. Al-Maida (La Table servie)', '6. Al-An'am (Les Bestiaux)',
            '7. Al-A'raf (Les Murailles)', '8. Al-Anfal (Le Butin)', '9. At-Tawba (Le Repentir)',
            '10. Yunus (Jonas)', '11. Hud', '12. Yusuf (Joseph)', '13. Ar-Ra'd (Le Tonnerre)',
            '14. Ibrahim (Abraham)', '15. Al-Hijr', '16. An-Nahl (Les Abeilles)',
            '17. Al-Isra (Le Voyage Nocturne)', '18. Al-Kahf (La Caverne)', '19. Maryam (Marie)',
            '20. Ta-Ha', '21. Al-Anbiya (Les Prophètes)', '22. Al-Hajj (Le Pèlerinage)',
            '23. Al-Mu'minun (Les Croyants)', '24. An-Nur (La Lumière)', '25. Al-Furqan (Le Discernement)',
            '26. Ash-Shu'ara (Les Poètes)', '27. An-Naml (Les Fourmis)', '28. Al-Qasas (Les Récits)',
            '29. Al-Ankabut (L'Araignée)', '30. Ar-Rum (Les Byzantins)', '31. Luqman',
            '32. As-Sajda (La Prosternation)', '33. Al-Ahzab (Les Coalisés)', '34. Saba',
            '35. Fatir (Le Créateur)', '36. Ya-Sin', '37. As-Saffat (Ceux qui se rangent en rangs)',
            '38. Sad', '39. Az-Zumar (Les Groupes)', '40. Ghafir (Le Pardonneur)',
            '41. Fussilat (Les versets détaillés)', '42. Ash-Shura (La Consultation)',
            '43. Az-Zukhruf (L'Ornement)', '44. Ad-Dukhan (La Fumée)', '45. Al-Jathiya (L'Agenouillée)',
            '46. Al-Ahqaf', '47. Muhammad', '48. Al-Fath (La Victoire)', '49. Al-Hujurat (Les Appartements)',
            '50. Qaf', '51. Adh-Dhariyat (Les Vents dispersants)', '52. At-Tur (Le Mont Sinaï)',
            '53. An-Najm (L'Étoile)', '54. Al-Qamar (La Lune)', '55. Ar-Rahman (Le Tout Miséricordieux)',
            '56. Al-Waqi'a (L'Événement)', '57. Al-Hadid (Le Fer)', '58. Al-Mujadila (La Femme qui plaide)',
            '59. Al-Hashr (Le Rassemblement)', '60. Al-Mumtahana', '61. As-Saff (Le Rang)',
            '62. Al-Jumu'a (Le Vendredi)', '63. Al-Munafiqun (Les Hypocrites)', '64. At-Taghabun (La Déception mutuelle)',
            '65. At-Talaq (Le Divorce)', '66. At-Tahrim (L'Interdiction)', '67. Al-Mulk (La Royauté)',
            '68. Al-Qalam (La Plume)', '69. Al-Haqqa (L'Inévitable)', '70. Al-Ma'arij (Les Voies d'Ascension)',
            '71. Nuh (Noé)', '72. Al-Jinn', '73. Al-Muzzammil (L'Enveloppé)',
            '74. Al-Muddaththir (Le Revêtu d'un manteau)', '75. Al-Qiyama (La Résurrection)',
            '76. Al-Insan (L'Homme)', '77. Al-Mursalat (Les Envoyés)', '78. An-Naba (La Nouvelle)',
            '79. An-Nazi'at (Les Arracheurs)', '80. Abasa (Il a froncé les sourcils)',
            '81. At-Takwir (L'Enroulement)', '82. Al-Infitar (La Rupture)', '83. Al-Mutaffifin (Les Fraudeurs)',
            '84. Al-Inshiqaq (La Fissure)', '85. Al-Buruj (Les Constellations)', '86. At-Tariq (L'Astre nocturne)',
            '87. Al-A'la (Le Très-Haut)', '88. Al-Ghashiya (L'Enveloppante)', '89. Al-Fajr (L'Aube)',
            '90. Al-Balad (La Cité)', '91. Ash-Shams (Le Soleil)', '92. Al-Layl (La Nuit)',
            '93. Ad-Duha (Le Matin)', '94. Ash-Sharh (L'Expansion)', '95. At-Tin (Le Figuier)',
            '96. Al-Alaq (L'Adhérence)', '97. Al-Qadr (La Nuit du Destin)', '98. Al-Bayyina (La Preuve)',
            '99. Az-Zalzala (Le Séisme)', '100. Al-Adiyat (Les Coureurs)', '101. Al-Qari'a (Le Fracas)',
            '102. At-Takathur (L'Accumulation)', '103. Al-Asr (Le Temps)', '104. Al-Humaza (Le Calomniateur)',
            '105. Al-Fil (L'Éléphant)', '106. Quraish', '107. Al-Ma'un (Les Ustensiles)',
            '108. Al-Kawthar (L'Abondance)', '109. Al-Kafirun (Les Mécréants)', '110. An-Nasr (Le Secours)',
            '111. Al-Masad (La Fibre)', '112. Al-Ikhlas (Le Monothéisme pur)', '113. Al-Falaq (L'Aube naissante)',
            '114. An-Nas (Les Hommes)'
          ];
          await reply(sock, jid,
`📖 *LE SAINT CORAN — 114 SOURATES*

${sourates.join('
')}

_Tape ${p}surah [numéro] pour lire une sourate_
_Ex: ${p}surah 1 → Al-Fatiha_`, msg);
          break;
        }
        const numSurah = parseInt(args[0]);
        if (isNaN(numSurah) || numSurah < 1 || numSurah > 114) {
          await reply(sock, jid, '❌ Numéro invalide. Entre 1 et 114.', msg);
          break;
        }
        try {
          await sock.sendMessage(jid, { react: { text: '📖', key: msg.key } });
          const res = await fetchJson(`https://api.siputzx.my.id/api/s/surah?no=${numSurah}`);
          const data = res?.data || [];
          if (!data.length) { await reply(sock, jid, '❌ Sourate introuvable.', msg); break; }
          const surahNames = ['', 'Al-Fatiha', 'Al-Baqara', 'Ali Imran', 'An-Nisa', 'Al-Maida', 'Al-An'am', 'Al-A'raf', 'Al-Anfal', 'At-Tawba', 'Yunus'];
          const name = surahNames[numSurah] || `Sourate ${numSurah}`;
          let txt = `📖 *${numSurah}. ${name}*
${'━'.repeat(28)}

`;
          txt += data.map((ayat, i) =>
            `*Ayat ${i+1}:*
🔤 ${ayat.arab}
📝 ${ayat.latin}
💬 ${ayat.indo || ''}
`
          ).join('
');
          // Envoyer par morceaux si trop long
          if (txt.length > 4000) {
            for (let i = 0; i < txt.length; i += 3900) {
              await sock.sendMessage(jid, { text: txt.slice(i, i + 3900) }, { quoted: i === 0 ? msg : undefined });
            }
          } else {
            await reply(sock, jid, txt, msg);
          }
        } catch(e) { await reply(sock, jid, `❌ Surah: ${e.message}`, msg); }
        break;
      }

      // ── 99 NOMS D'ALLAH (API: islamic-api-zhirrr.vercel.app) ─
      case '99nomdallah':
      case '99nom':
      case 'asmaul':
      case 'asmaulhusna': {
        try {
          await sock.sendMessage(jid, { react: { text: '🕌', key: msg.key } });
          const res = await fetchJson('https://islamic-api-zhirrr.vercel.app/api/asmaulhusna');
          const data = res?.data || [];
          if (!data.length) { await reply(sock, jid, '❌ Impossible de récupérer les 99 noms.', msg); break; }
          let txt = `✨🌟 *99 NOMS D'ALLAH — ASMAUL HUSNA* 🌟✨
${'═'.repeat(32)}

`;
          txt += data.map(item =>
            `*${item.index}. ﴾ ${item.arabic} ﴿*
` +
            `   🔤 ${item.latin}
` +
            `   🇫🇷 ${item.translation_id || item.translation_en}
`
          ).join('
');
          txt += `
${'═'.repeat(32)}
_سبحان الله وبحمده_
_SEIGNEUR TD 🇹🇩_`;
          // Envoyer par morceaux
          for (let i = 0; i < txt.length; i += 3900) {
            await sock.sendMessage(jid, { text: txt.slice(i, i + 3900) }, { quoted: i === 0 ? msg : undefined });
          }
          await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
        } catch(e) { await reply(sock, jid, `❌ 99 noms: ${e.message}`, msg); }
        break;
      }

      // ╔══════════════════════════════════════════════════╗
      // ║        🔍  RECHERCHE                             ║
      // ╚══════════════════════════════════════════════════╝

      // ── PLAYSTORE (API: api.vreden.web.id) ───────────────
      case 'playstore': {
        if (!args.length) { await reply(sock, jid, `❌ Usage: ${p}playstore [nom app]\nEx: ${p}playstore whatsapp`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } });
          const res = await fetchJson(`https://api.vreden.web.id/api/playstore?query=${encodeURIComponent(args.join(' '))}`);
          const results = res?.result || [];
          if (!results.length) { await reply(sock, jid, '❌ Aucun résultat Play Store.', msg); break; }
          let txt = `🎮 *PLAY STORE — "${args.join(' ')}"*

`;
          txt += results.slice(0, 5).map((app, i) =>
            `*${i+1}. ${app.title || args.join(' ')}*
` +
            `   👨‍💻 Dev: ${app.developer || '?'}
` +
            `   ⭐ Note: ${app.rate2 || '?'}
` +
            `   🔗 ${app.link || '?'}
`
          ).join('
');
          const imgUrl = results[0]?.img;
          if (imgUrl) {
            await sock.sendMessage(jid, { image: { url: imgUrl }, caption: txt }, { quoted: msg });
          } else {
            await reply(sock, jid, txt, msg);
          }
        } catch(e) { await reply(sock, jid, `❌ Play Store: ${e.message}`, msg); }
        break;
      }

      // ── GOOGLE (API: googleapis.com/customsearch) ────────
      case 'google': {
        if (!args.length) { await reply(sock, jid, `❌ Usage: ${p}google [recherche]\nEx: ${p}google Tchad`, msg); break; }
        try {
          await sock.sendMessage(jid, { react: { text: '🌐', key: msg.key } });
          const apiKey = 'AIzaSyAajE2Y-Kgl8bjPyFvHQ-PgRUSMWgBEsSk';
          const cx = 'e5c2be9c3f94c4bbb';
          const res = await fetchJson(`https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(args.join(' '))}&key=${apiKey}&cx=${cx}`);
          const items = res?.items || [];
          if (!items.length) { await reply(sock, jid, '❌ Aucun résultat Google.', msg); break; }
          let txt = `🌐 *GOOGLE — "${args.join(' ')}"*

`;
          txt += items.slice(0, 5).map((item, i) =>
            `*${i+1}. ${item.title}*
` +
            `   📝 ${item.snippet}
` +
            `   🔗 ${item.link}
`
          ).join('
');
          await reply(sock, jid, txt, msg);
        } catch(e) { await reply(sock, jid, `❌ Google: ${e.message}`, msg); }
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
// ✅ FONCTIONS DE TÉLÉCHARGEMENT — APIs identiques à Riselia
// ============================================================

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  return res.json();
}

async function tiktokDl(url) {
  const res = await axios.post('https://www.tikwm.com/api/', {}, {
    headers: {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Origin': 'https://www.tikwm.com',
      'Referer': 'https://www.tikwm.com/',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/116.0.0.0 Mobile Safari/537.36',
    },
    params: { url, count: 12, cursor: 0, web: 1, hd: 1 }
  });
  const d = res.data.data;
  if (!d) throw new Error('TikTok: aucun résultat');
  if (d.duration == 0 && d.images) {
    return { status: true, type: 'photo', images: d.images, title: d.title || '', author: d.author?.nickname || '' };
  }
  return {
    status: true, type: 'video',
    title: d.title || '', author: d.author?.nickname || '',
    duration: d.duration + 's',
    views: d.play_count, likes: d.digg_count,
    nowatermark: 'https://www.tikwm.com' + (d.play || ''),
    nowatermark_hd: 'https://www.tikwm.com' + (d.hdplay || ''),
    music: 'https://www.tikwm.com' + (d.music || ''),
    cover: 'https://www.tikwm.com' + (d.cover || '')
  };
}

async function igdl(url) {
  return fetchJson(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(url)}`);
}

async function fbdl(url) {
  return fetchJson(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`);
}

async function pindl(url) {
  return fetchJson(`https://api.siputzx.my.id/api/d/pinterest?url=${encodeURIComponent(url)}`);
}

async function snackvideodl(url) {
  return fetchJson(`https://api.siputzx.my.id/api/d/snackvideo?url=${encodeURIComponent(url)}`);
}

async function capcutdl(url) {
  return fetchJson(`https://api.siputzx.my.id/api/d/capcut?url=${encodeURIComponent(url)}`);
}

async function gdrivedl(url) {
  return fetchJson(`https://api.siputzx.my.id/api/d/gdrive?url=${encodeURIComponent(url)}`);
}

async function mediafiredl(url) {
  return fetchJson(`https://api.vreden.web.id/api/mediafiredl?url=${encodeURIComponent(url)}`);
}

// ✅ COPIÉ DE RISELIA — utilise @vreden/youtube_scraper exactement comme Riselia.js ligne 16+3406
async function ytmp3dl(url) {
  try {
    const res = await ytScraper.ytmp3(url);
    return res; // retourne { status: true, download: { url: '...' } }
  } catch(e) {
    // fallback API siputzx si package échoue
    return fetchJson(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(url)}`);
  }
}

async function ytmp4dl(url) {
  try {
    const res = await ytScraper.ytmp4(url);
    return res; // retourne { status: true, download: { url: '...' } }
  } catch(e) {
    // fallback API siputzx si package échoue
    return fetchJson(`https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(url)}`);
  }
}

async function ytsearch(query) {
  return fetchJson(`https://api.siputzx.my.id/api/d/yts?q=${encodeURIComponent(query)}`);
}

async function sendAutoMedia(sock, jid, mediaUrl, caption, quotedMsg) {
  const head = await axios.head(mediaUrl);
  const mime = head.headers['content-type'] || '';
  if (/image\//.test(mime)) {
    await sock.sendMessage(jid, { image: { url: mediaUrl }, caption }, { quoted: quotedMsg });
  } else if (/video\//.test(mime) || mime === 'application/octet-stream') {
    await sock.sendMessage(jid, { video: { url: mediaUrl }, caption }, { quoted: quotedMsg });
  } else {
    await sock.sendMessage(jid, { document: { url: mediaUrl }, fileName: 'fichier', mimetype: mime || 'application/octet-stream' }, { quoted: quotedMsg });
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
