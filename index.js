import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  delay,
  downloadContentFromMessage,
  jidNormalizedUser   // \u2705 FIX BUG 1 \u2014 normaliser le JID proprement
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';  // APIs de t\u00e9l\u00e9chargement (siputzx, tikwm, vreden)
import axios from 'axios';        // requ\u00eates HTTP (tikwm, mediafire)
import ytScraper from '@vreden/youtube_scraper'; // \u2705 m\u00eame package que Riselia

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

// Anti-call: 'off' | 'all' | whitelist Set de num\u00e9ros autoris\u00e9s
let antiCallMode = 'off';           // 'off', 'all', 'whitelist'
let antiCallWhitelist = new Set();  // num\u00e9ros qui PEUVENT appeler

// Anti-delete destination: 'pv' (PV bot) ou jid groupe
let antiDeleteDest = 'pv';

// Guard contre restart automatique
let botStartTime = Date.now();
let isReady = false; // true seulement apr\u00e8s 5s post-connexion
let antiLink   = false;

// \u2705 NOUVEAU \u2014 Welcome/Bye/Warn
let welcomeGroups = new Set();  // groupes avec welcome activ\u00e9
let byeGroups     = new Set();  // groupes avec bye activ\u00e9
const groupWarnings = {};       // { groupJid: { userPhone: count } }
const groupRules    = {};       // { groupJid: "texte des r\u00e8gles" }

const savedViewOnce = new Map();

// Timestamp de d\u00e9marrage
const BOT_START_TIME = Math.floor(Date.now() / 1000);

// ============================================================
// UTILITAIRES
// ============================================================
function getPhone(jid) {
  if (!jid) return '';
  return jid.split(':')[0].split('@')[0];
}

// \u2705 FIX BUG 1 \u2014 Normalise le JID du bot (supprime le device suffix :XX)
function normalizeBotJid(rawJid) {
  if (!rawJid) return '';
  // ex: "23591234568:5@s.whatsapp.net" \u2192 "23591234568@s.whatsapp.net"
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
    // \u2705 FIX BUG 2 \u2014 comparer par phone pour \u00e9viter LID mismatch
    const userPhone = getPhone(userJid);
    const p = meta.participants.find(x => getPhone(x.id) === userPhone);
    return p && (p.admin === 'admin' || p.admin === 'superadmin');
  } catch(e) { return false; }
}

// \u2705 FIX BUG 2 \u2014 R\u00e9soudre le senderJid m\u00eame quand c'est un LID
function resolveSenderJid(message, isGroup, fromMe) {
  if (fromMe) {
    return global._botJid || (EXTRA_OWNER_NUM ? EXTRA_OWNER_NUM + '@s.whatsapp.net' : '');
  }
  if (isGroup) {
    const participant = message.key.participant || '';
    // Si c'est un LID (@lid) \u2192 essayer de r\u00e9cup\u00e9rer depuis participant
    if (participant.endsWith('@lid')) {
      // Fallback: utiliser quand m\u00eame, getPhone() extraira juste les chiffres
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
    title: '\u26a1 SEIGNEUR TD \ud83c\uddf9\ud83c\udde9',
    body: '\ud83d\udd10 Syst\u00e8me sous contr\u00f4le',
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
    await reply(sock, jid, `\ud83d\udd04 *Mise \u00e0 jour en cours...*`, msg);
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
    await reply(sock, jid, `\u2705 *Mise \u00e0 jour r\u00e9ussie!*\n\n${lines}\n\n\u267b\ufe0f Red\u00e9marrage...`, msg);
    await delay(2000);
    process.exit(0);
  } catch(e) {
    await reply(sock, jid, `\u274c *Erreur update:*\n${e.message}`, msg);
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
    const caption = `+${from} \u00b7 ${time}`;
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
          const caption = `+${getPhone(senderJid)} \u00b7 ${time}`;
          if (mt === 'image') await sock.sendMessage(privJid, { image: buf, caption });
          else await sock.sendMessage(privJid, { video: buf, caption });
          if (privJid !== remoteJid) await sock.sendMessage(remoteJid, { react: { text: '\ud83d\udc41\ufe0f', key: message.key } });
          return;
        }
      } catch(e) {}
    }
    const all = [];
    for (const [j, items] of savedViewOnce.entries()) items.forEach(i => all.push({ ...i, fromJid: j }));
    if (all.length === 0) { await sock.sendMessage(remoteJid, { text: '\ud83d\udc41\ufe0f Aucun vu unique sauvegard\u00e9.' }); return; }
    all.sort((a, b) => b.timestamp - a.timestamp);
    await sendVVMedia(sock, privJid, all[0]);
    if (privJid !== remoteJid) await sock.sendMessage(remoteJid, { react: { text: '\ud83d\udc41\ufe0f', key: message.key } });
    return;
  }

  if (sub === 'list') {
    const all = [];
    for (const [j, items] of savedViewOnce.entries()) items.forEach(i => all.push({ ...i, fromJid: j }));
    all.sort((a, b) => b.timestamp - a.timestamp);
    if (all.length === 0) { await sock.sendMessage(remoteJid, { text: '\ud83d\udc41\ufe0f Aucun media.' }); return; }
    let txt = `\ud83d\udc41\ufe0f *VU UNIQUE (${all.length})*\n\n`;
    all.forEach((item, i) => {
      const time = new Date(item.timestamp).toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
      const icon = item.type === 'image' ? '\ud83d\udcf8' : item.type === 'video' ? '\ud83c\udfa5' : '\ud83c\udfb5';
      txt += `${i + 1}. ${icon} +${getPhone(item.fromJid || '')} \u00b7 ${time}\n`;
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
    if (isNaN(idx) || idx < 0 || idx >= all.length) { await sock.sendMessage(remoteJid, { text: `\u274c Range: 1-${all.length}` }); return; }
    await sendVVMedia(sock, privJid, all[idx]);
    if (privJid !== remoteJid) await sock.sendMessage(remoteJid, { react: { text: '\ud83d\udc41\ufe0f', key: message.key } });
    return;
  }

  if (sub === 'clear') {
    const total = [...savedViewOnce.values()].reduce((s, a) => s + a.length, 0);
    savedViewOnce.clear();
    await sock.sendMessage(remoteJid, { text: `\u2705 ${total} m\u00e9dias supprim\u00e9s.` });
    return;
  }

  const total = [...savedViewOnce.values()].reduce((s, a) => s + a.length, 0);
  await sock.sendMessage(remoteJid, { text: `\ud83d\udc41\ufe0f *VU UNIQUE (${total})*\n${config.prefix}vv \u2192 dernier\n${config.prefix}vv list \u2192 liste\n${config.prefix}vv get [n] \u2192 r\u00e9cup\u00e9rer\n${config.prefix}vv clear \u2192 supprimer` });
}

// ============================================================
// GROUPE
// ============================================================
async function handleTagAll(sock, message, args, remoteJid, isGroup, senderJid) {
  if (!isGroup) { await sock.sendMessage(remoteJid, { text: '\u26d4 Groupe uniquement.' }); return; }
  try {
    const meta    = await sock.groupMetadata(remoteJid);
    const members = meta.participants.map(p => p.id);
    const msgText = args.join(' ') || 'Attention tout le monde!';
    const now     = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' });
    let tagMsg    = `\ud83d\udce2 *TAG ALL* \u2014 ${meta.subject}\n\ud83d\udd52 ${now}\n\n${msgText}\n\n`;
    members.forEach(jid => { tagMsg += `@${jid.split('@')[0]} `; });
    await sock.sendMessage(remoteJid, { text: tagMsg, mentions: members });
  } catch(e) { await sock.sendMessage(remoteJid, { text: `\u274c ${e.message}` }); }
}

async function handleToStatus(sock, args, message, remoteJid, senderJid) {
  try {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const text   = args.join(' ');
    if (!quoted && text) {
      const colors = ['#FF5733','#33FF57','#3357FF','#FF33A8','#FFD700'];
      await sock.sendMessage('status@broadcast', { text, backgroundColor: colors[Math.floor(Math.random() * colors.length)], font: 0, statusJidList: [senderJid] });
      await sock.sendMessage(remoteJid, { text: `\u2705 Status texte publi\u00e9!` });
    } else if (quoted?.imageMessage) {
      const buf = await toBuffer(await downloadContentFromMessage(quoted.imageMessage, 'image'));
      await sock.sendMessage('status@broadcast', { image: buf, caption: text || '', statusJidList: [senderJid] });
      await sock.sendMessage(remoteJid, { text: '\u2705 Status image publi\u00e9!' });
    } else if (quoted?.videoMessage) {
      const buf = await toBuffer(await downloadContentFromMessage(quoted.videoMessage, 'video'));
      await sock.sendMessage('status@broadcast', { video: buf, caption: text || '', statusJidList: [senderJid] });
      await sock.sendMessage(remoteJid, { text: '\u2705 Status vid\u00e9o publi\u00e9!' });
    } else {
      await sock.sendMessage(remoteJid, { text: `${config.prefix}tostatus [texte] / r\u00e9p image / r\u00e9p vid\u00e9o` });
    }
  } catch(e) { await sock.sendMessage(remoteJid, { text: `\u274c ${e.message}` }); }
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
        console.log('\u274c D\u00e9connect\u00e9 (loggedOut). Relance manuelle requise.');
        return;
      }
      console.log('\ud83d\udd04 Reconnexion dans 5s...');
      setTimeout(() => connectToWhatsApp(), 5000);
    } else if (connection === 'open') {
      _isConnecting = false;

      // \u2705 FIX BUG 1 \u2014 Stocker le JID normalis\u00e9 ET le phone s\u00e9par\u00e9ment
      global._botJid   = normalizeBotJid(sock.user.id);  // "23591234568@s.whatsapp.net"
      global._botPhone = getPhone(global._botJid);        // "23591234568"

      // Guard restart: ignorer commandes pendant 5s au d\u00e9marrage
      isReady = false;
      botStartTime = Date.now();
      setTimeout(() => { isReady = true; console.log('\u2705 Bot pr\u00eat \u00e0 recevoir les commandes.'); }, 5000);

      console.log('\u2705 SEIGNEUR TD connecte! JID:', global._botJid, '| Phone:', global._botPhone);

      const ownerJid = EXTRA_OWNER_NUM
        ? EXTRA_OWNER_NUM + '@s.whatsapp.net'
        : global._botJid;

      try {
        await sock.sendMessage(ownerJid, {
          text:
`\u250f\u2501\u2501\u2501\u2501 \u2699\ufe0f \ud835\udc12\ud835\udc04\ud835\udc08\ud835\udc06\ud835\udc0d\ud835\udc04\ud835\udc14\ud835\udc11 \ud835\udc08\ud835\udc0d\ud835\udc08\ud835\udc13 \u2501\u2501\u2501\u2501
\u2503
\u2503 \u1d18\u0280\u1d07\u0493\u026ax  \u2aa7 [ ${config.prefix} ]
\u2503 \u1d0d\u1d0f\u1d05\u1d07    \u2aa7 ${botMode === 'public' ? '\u1d18\u1d1c\u0299\u029f\u026a\u1d04' : '\u1d18\u0280\u026a\u1d20\u1d00\u1d1b\u1d07'}
\u2503 s\u1d1b\u1d00\u1d1b\u1d1cs  \u2aa7 \u1d0f\u0274\u029f\u026a\u0274\u1d07
\u2503 \u0274\u1d1c\u1d0d\u1d07\u0280\u1d0f  \u2aa7 +${global._botPhone}
\u2503
\u2517\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
          contextInfo: BADGE_CTX
        });
      } catch(e) { console.error('Conn msg err:', e.message); }
    }
  });

  // ============================================================
  // HANDLER MESSAGES
  // \u2705 FIX BUG 3 \u2014 Traiter TOUS les fromMe (pas seulement avec prefix)
  // ============================================================
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // \u2705 COPI\u00c9 DE RISELIA \u2014 traiter tous les messages comme Riselia.js ligne 297-320
    for (const message of messages) {
      if (!message.message) continue;

      // Ignorer ephemeral wrapper (comme Riselia)
      if (Object.keys(message.message)[0] === 'ephemeralMessage') {
        message.message = message.message.ephemeralMessage.message;
      }

      if (message.key?.remoteJid === 'status@broadcast') {
        // Traiter quand m\u00eame pour viewOnce dans les statuts
        processMessage(sock, message).catch(() => {});
        continue;
      }

      // Comme Riselia: si mode priv\u00e9 ET pas fromMe ET type notify \u2192 ignorer
      // Si mode public \u2192 tout passe (type notify + fromMe)
      if (botMode === 'private' && !message.key.fromMe && type === 'notify') {
        // en priv\u00e9 on v\u00e9rifie plus bas dans processMessage
      }

      const fromMe = message.key.fromMe;
      const txt = message.message?.conversation ||
                  message.message?.extendedTextMessage?.text || '';

      if (fromMe) {
        // Toujours traiter les messages du owner (commandes ET m\u00e9dias)
        if (txt.startsWith(config.prefix)) {
          console.log(`[CMD] type=${type} jid=${message.key.remoteJid} txt=${txt}`);
        }
        processMessage(sock, message).catch(e => console.error('fromMe err:', e.message));
      } else if (type === 'notify') {
        // \u2705 CL\u00c9: en mode public, TOUS les messages notify passent (groupes + PV)
        // C'est exactement comme Riselia qui traite tous les notify quand public=true
        processMessage(sock, message).catch(e => console.error('notify err:', e.message));
      }
    }
  });

  // \u2705 NOUVEAU \u2014 \u00c9v\u00e9nements groupes (welcome/bye)
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      if (action === 'add' && welcomeGroups.has(id)) {
        const meta = await sock.groupMetadata(id);
        for (const p of participants) {
          const phone = getPhone(p);
          const welcomeText =
`\u256d\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u256e
\u2503   \ud83d\udc4b \ud835\udc01\ud835\udc08\ud835\udc04\ud835\udc0d\ud835\udc15\ud835\udc04\ud835\udc0d\ud835\udc14\ud835\udc04   \u2503
\u2570\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u256f
\u2503
\u2503 @${phone} est arriv\u00e9(e) !
\u2503 Bienvenue dans *${meta.subject}* \ud83c\udf89
\u2503
\u2503 Membres: ${meta.participants.length}
\u2517\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`;
          await sock.sendMessage(id, { text: welcomeText, mentions: [p] });
        }
      } else if (action === 'remove' && byeGroups.has(id)) {
        const meta = await sock.groupMetadata(id).catch(() => ({ subject: 'le groupe' }));
        for (const p of participants) {
          const phone = getPhone(p);
          await sock.sendMessage(id, {
            text: `\ud83d\udc4b *Au revoir* @${phone}! Bonne continuation \ud83c\uddf9\ud83c\udde9`,
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
      const group = key.remoteJid?.endsWith('@g.us') ? `\n\ud83d\udc65 Groupe: ${key.remoteJid}` : '';
      if (cached?.message?.conversation || cached?.message?.extendedTextMessage?.text) {
        const txt = cached.message.conversation || cached.message.extendedTextMessage.text;
        try {
          await sock.sendMessage(destJid, {
            text: `\ud83d\uddd1\ufe0f *ANTI-DELETE*\n\n\ud83d\udc64 De: +${who}${group}\n\ud83d\udcac Message: ${txt}`
          });
        } catch(e) {}
      } else if (cached?.message) {
        // M\u00e9dia supprim\u00e9 \u2014 retransmettre
        try {
          await sock.sendMessage(destJid, { text: `\ud83d\uddd1\ufe0f *ANTI-DELETE* \u2014 +${who} a supprim\u00e9 un m\u00e9dia/sticker${group}` });
          await sock.sendMessage(destJid, cached.message, {});
        } catch(e) {}
      } else {
        try {
          await sock.sendMessage(destJid, { text: `\ud83d\uddd1\ufe0f *ANTI-DELETE* \u2014 +${who} a supprim\u00e9 un message${group}` });
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
      const newTxt = edited?.conversation || edited?.extendedTextMessage?.text || '(m\u00e9dia)';
      const cached = msgCache.get(update.key.id);
      const oldTxt = cached?.message?.conversation || cached?.message?.extendedTextMessage?.text || '(non enregistr\u00e9)';
      try {
        await sock.sendMessage(destJid, {
          text: `\u270f\ufe0f *ANTI-EDIT*\n\n\ud83d\udc64 De: +${who}\n\ud83d\udcdd Avant: ${oldTxt}\n\u270f\ufe0f Apr\u00e8s: ${newTxt}`
        });
      } catch(e) {}
    }
  });

  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (call.status !== 'offer') continue;
      const callerNum = call.from.split('@')[0].split(':')[0];
      try {
        if (antiCallMode === 'off') continue; // anticall d\u00e9sactiv\u00e9
        if (antiCallMode === 'whitelist') {
          // Whitelist = num\u00e9ros AUTORIS\u00c9S \u2192 si le caller EST dans la liste, laisser passer
          if (antiCallWhitelist.has(callerNum)) continue;
        }
        // Bloquer l'appel (mode 'all' OU caller pas dans whitelist)
        await sock.rejectCall(call.id, call.from);
        await sock.sendMessage(call.from, {
          text: `\ud83d\udcf5 *ANTICALL ACTIF* \u2014 SEIGNEUR TD \ud83c\uddf9\ud83c\udde9\n\nLes appels sont bloqu\u00e9s sur ce bot.\nEnvoyez un message \u00e0 la place.`
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
  // Guard restart: ignorer les messages re\u00e7us avant que le bot soit pr\u00eat
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

  // \u2705 FIX BUG 2 \u2014 Utiliser la fonction am\u00e9lior\u00e9e pour r\u00e9soudre le sender
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

  // Mode priv\u00e9 \u2014 en mode public tout le monde peut utiliser les commandes (comme Riselia)
  // En mode priv\u00e9, seuls fromMe et admins/owner passent
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
          if (t === 'image') await sock.sendMessage(dst, { image: buf, caption: 'Status \ud83d\udcf8' });
          else await sock.sendMessage(dst, { video: buf, caption: 'Status \ud83c\udfa5' });
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
          await sock.sendMessage(remoteJid, { text: `\ud83d\udeab @${getPhone(senderJid)} liens interdits!`, mentions: [senderJid] });
        } catch(e) {}
        return;
      }
    }
  }

  // Auto react
  if (autoReact && messageText && !fromMe) {
    try {
      const emojis = ['\u2705','\ud83d\udc4d','\ud83d\udd25','\ud83d\udcaf','\u26a1','\ud83c\udfaf','\ud83d\udcaa','\ud83c\uddf9\ud83c\udde9'];
      sock.sendMessage(remoteJid, { react: { text: emojis[Math.floor(Math.random() * emojis.length)], key: message.key } });
    } catch(e) {}
  }

  // VV auto (r\u00e9pondre \u00e0 un vu unique)
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
        const caption    = `\ud83d\udc41\ufe0f View Once \u00b7 ${time}\nSEIGNEUR TD \ud83c\uddf9\ud83c\udde9`;
        if (mt === 'image') await sock.sendMessage(privJid, { image: buf, caption });
        else await sock.sendMessage(privJid, { video: buf, caption });
        sock.sendMessage(remoteJid, { react: { text: '\ud83d\udc41\ufe0f', key: message.key } }).catch(() => {});
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

  try { sock.sendMessage(jid, { react: { text: '\u26a1', key: msg.key } }).catch(() => {}); } catch(e) {}

  try {
    switch (command.toLowerCase()) {

      // \u2500\u2500 MENU \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
      case 'menu': {
        const ram    = (process.memoryUsage().heapUsed  / 1024 / 1024).toFixed(0);
        const ramT   = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(0);
        const pct    = Math.min(100, Math.max(0, Math.round((parseFloat(ram) / parseFloat(ramT)) * 100)));
        const filled = Math.min(9, Math.max(0, Math.round(pct / 11)));
        const bar    = '\u2593'.repeat(filled) + '\u2591'.repeat(9 - filled);
        const menuText =
`\u256d\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u256e
\u2503   \u232c \ud835\udc12\ud835\udc04\ud835\udc08\ud835\udc06\ud835\udc0d\ud835\udc04\ud835\udc14\ud835\udc11 \ud835\udc13\ud835\udc03 \ud835\udc01\ud835\udc0e\ud835\udc13 \u232c   \u2503
\u2570\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u256f

\u250c\u2500\u2500\u2500  \ud83d\udcca  \ud835\udc12\ud835\udc18\ud835\udc12\ud835\udc13\ud835\udc04\ud835\udc0c  \u2500\u2500\u2500\u2510
\u2502 \u1d18\u0280\u1d07\u0493\u026ax : [ ${p} ]
\u2502 \u1d1c\u1d18\u1d1b\u026a\u1d0d\u1d07 : ${buildUptime()}
\u2502 \u0280\u1d00\u1d0d    : ${ram}MB / ${ramT}MB
\u2502 \u029f\u1d0f\u1d00\u1d05   : [${bar}] ${pct}%
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518

\u250c\u2500\u2500\u2500  \ud83d\udee1\ufe0f  \ud835\udc0e\ud835\udc16\ud835\udc0d\ud835\udc04\ud835\udc11  \u2500\u2500\u2500\u2510
\u251d  ${p}mode public/private
\u251d  ${p}antidelete private on/off
\u251d  ${p}antiedit private on/off
\u251d  ${p}antilink on/off
\u251d  ${p}anticall all on/off
\u251d  ${p}anticall +[num\u00e9ro]
\u251d  ${p}autoreact
\u251d  ${p}block /
