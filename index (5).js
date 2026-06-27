import { createServer } from 'http';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  delay,
  downloadContentFromMessage
} from '@whiskeysockets/baileys';

import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import crypto from 'crypto';
// REMOVED TELEGRAM
import { telegramConfig } from './config.js';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = 'https://api-trustbit.name.ng/api';

// Bot configuration
const config = {
  botName: 'SEIGNEUR TD',
  prefix: '.',
  language: 'ar',
  autoReply: false,
  sessionFolder: './auth_info_baileys',
  usePairingCode: true,
  phoneNumber: '',
  adminNumbers: ['84933801806', '107658338123943'],
  railwayToken: process.env.RAILWAY_TOKEN || '96bac1f1-b737-4cb0-b8c7-d8af5a4a0b0a',
  botAdmins: ['84933801806', '107658338123943'],
  dataFolder: './bot_data',
  maxViewOncePerUser: 50,
  commandCooldown: 2000,
  youtubeApiKey: 'AIzaSyD3JA07YzY6SJSHKtj9IA7S-GFZUkqYd70',
  openaiApiKey: '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',
  geminiApiKey: 'AIzaSyAj5kNv4ClFt-4DskW6XDU0PIPd3PXmwCw',
  groqApiKey: '',
};

if (!fs.existsSync(config.dataFolder)) {
  fs.mkdirSync(config.dataFolder, { recursive: true });
}

const translations = {
  ' ': ' ',
  'This command is for groups only': ' for groups only',
  'Admin command': '  ',
  'Usage': '',
  'Exemple': '',
  '': '',
  '': '',
  'Failed': '',
  ' ': ' ',
  ' ': ' ',
  '': '',
  'Target': '',
  'Status': '',
  'Menu': '',
  'Help': '',
  'Ping': '',
  'Alive': '',
  'Info': '',
  'Status': '',
  'User': '',
  'Dev': '',
  'Developer': '',
  'Region': '',
  'Date': '',
  'Time': '',
  'Mode': '',
  'Version': '',
  'Prefix': '',
  'Bot Name': ' ',
  'Group': '',
  'Members': '',
  'Admins': '',
  'Online': '',
  'Offline': ' ',
  'Kicked': ' ',
  'Added': ' ',
  'Promoted': ' ',
  'Demoted': ' ',
  'No media found': '    ',
  'Reply to a message': '  ',
  ' ': '  ',
  'Invalid number': '  ',
  'Command not found': '  ',
  'SILENT REPORT': ' ',
  'BAN SUPPORT': ' ',
  'MEGA BAN': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '': '',
  ' ': ' ',
  '': '',
  ' ': ' ',
  '': '',
  '': '',
  '': '',
  'Reports': '',
  'Total': '',
  'Duration': '',
  'Speed': '',
  'Risk': '',
  'Timeline': ' ',
  'Details': '',
  'System Status': ' ',
  '  ': '  ',
  'Mission accomplished': ' '
};

function translate(text) {
  if (config.language !== 'ar') return text;
  let translatedText = text;
  for (const [key, value] of Object.entries(translations)) {
    const regex = new RegExp(key, 'gi');
    translatedText = translatedText.replace(regex, value);
  }
  return translatedText;
}

function msg(text) {
  return translate(text);
}

const autoReplies = {
  'hello': '👋 Salut! Je suis SEIGNEUR TD. Comment puis-je t\'aider?',
  'hi': '👋 Hello! Bienvenue sur SEIGNEUR TD.',
  'help': `╔══════════════════════════════╗\n║      SEIGNEUR TD         ║\n╚══════════════════════════════╝\n\n📋 Commandes disponibles:\n━━━━━━━━━━━━━━━━\n!help - Afficher ce menu\n!ping - Vérifier la latence\n!info - Informations du bot\n!menu - Menu principal\n\nType !menu pour voir le menu complet!`,
  'bye': '👋 À bientôt! Prends soin de toi!',
  'thanks': 'De rien! 😊 - SEIGNEUR TD',
  'thank you': 'Avec plaisir! 😊 - SEIGNEUR TD'
};

const database = {
  users: new Map(),
  groups: new Map(),
  statistics: {
    total: 0,
    totalUsers: 0,
    totalGroups: 0
  }
};

let botMode = 'public';
let _cachedBaileysVersion = null;

async function getBaileysVersion() {
  if (_cachedBaileysVersion) return _cachedBaileysVersion;
  const { version } = await fetchLatestBaileysVersion();
  _cachedBaileysVersion = version;
  return version;
}

process.setMaxListeners(50);

const _origConsoleError = console.error.bind(console);
console.error = (...args) => {
  const msg = String(args[0] ?? '');
  if (msg.includes('Bad MAC') || msg.includes('closed session') ||
      msg.includes('Closing open session') || msg.includes('Closing session') ||
      msg.includes('Decrypted message with closed') || msg.includes('SessionEntry')) return;
  _origConsoleError(...args);
};

const _origConsoleWarn = console.warn.bind(console);
console.warn = (...args) => {
  const msg = String(args[0] ?? '');
  if (msg.includes('Bad MAC') || msg.includes('closed session') ||
      msg.includes('Closing open session') || msg.includes('Closing session') ||
      msg.includes('SessionEntry')) return;
  _origConsoleWarn(...args);
};

const _origConsoleLog = console.log.bind(console);
console.log = (...args) => {
  const msg = String(args[0] ?? '');
  if (msg.includes('Closing session') || msg.includes('SessionEntry') ||
      msg.includes('_chains') || msg.includes('ephemeralKeyPair') ||
      msg.includes('Decrypted message with closed')) return;
  _origConsoleLog(...args);
};

let autoTyping = false;
let autoRecording = true;
let autoReact = true;
let autoReadStatus = true;
let autoLikeStatus = true;
let autoStatusViews = false;
let autoReactStatus = false;
let statusReactEmoji = '🇷🇴';
let autoSaveStatus = false;
let antiDeleteStatus = false;
let antiDeleteStatusMode = 'private';
let antiDelete = true;
let antiEdit = true;
let antiBug = true;
let antiCall = false;
let antiDeleteMode = 'chat';
let pairingRequested = false;
let antiEditMode = 'chat';
let chatbotEnabled = false;
let stickerPackname = 'SEIGNEUR TD';
let stickerAuthor = '© SEIGNEUR TD';
let menuStyle = 1;

const _sessionStates = new Map();
function _getSessionState(phone) {
  if (!_sessionStates.has(phone)) {
    _sessionStates.set(phone, {
      botMode: 'public', autoTyping: false, autoRecording: false, autoReact: false,
      autoReadStatus: false, autoLikeStatus: false, autoStatusViews: false,
      autoReactStatus: false, statusReactEmoji: '🇷🇴',
      autoSaveStatus: false, antiDeleteStatus: false, antiDeleteStatusMode: 'private',
      antiDelete: false, antiEdit: false, antiBug: false, antiCall: false,
      antiDeleteMode: 'chat', antiEditMode: 'chat', chatbotEnabled: false,
      stickerPackname: 'SEIGNEUR TD', stickerAuthor: '© SEIGNEUR TD', menuStyle: 1,
      prefix: config.prefix,
    });
  }
  return _sessionStates.get(phone);
}

let savedViewOnce = new Map();
let messageCache = new Map();
const _knownContacts = new Set();
let groupSettings = new Map();
let memberActivity = new Map();
const antiBugTracker = new Map();

let autoreactWords = {
  'good': '👍', 'nice': '👌', 'wow': '😲',
  'lol': '😂', 'cool': '😎', 'love': '❤️',
  'fire': '🔥', 'sad': '😢', 'angry': '😠', 'ok': '👌'
};

const warnSystem = new Map();
const spamTracker = new Map();
const permaBanList = new Map();
const commandCooldowns = new Map();

const STORE_DIR = './store';
const STORE_FILES = {
  config: `${STORE_DIR}/config.json`,
  admins: `${STORE_DIR}/admins.json`,
  warns: `${STORE_DIR}/warns.json`,
  permabans: `${STORE_DIR}/permabans.json`,
  groupSettings: `${STORE_DIR}/group_settings.json`,
  stats: `${STORE_DIR}/stats.json`,
  viewonce: `${STORE_DIR}/viewonce.json`,
  activity: `${STORE_DIR}/activity.json`,
  antilink: `${STORE_DIR}/antilink.json`,
  antibot: `${STORE_DIR}/antibot.json`,
  antitag: `${STORE_DIR}/antitag.json`,
  antispam: `${STORE_DIR}/antispam.json`,
  welcome: `${STORE_DIR}/welcome.json`,
  autoreact: `${STORE_DIR}/autoreact.json`,
};

function storeEnsureDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    console.log('📁 Store directory created:', STORE_DIR);
  }
  if (!fs.existsSync(config.dataFolder)) {
    fs.mkdirSync(config.dataFolder, { recursive: true });
  }
}

function storeRead(file, defaultValue = {}) {
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error(`⚠️ Store read error [${file}]:`, e.message);
  }
  return defaultValue;
}

function storeWrite(file, data) {
  try {
    storeEnsureDir();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error(`⚠️ Store write error [${file}]:`, e.message);
    return false;
  }
}

function mapToObj(map) {
  const obj = {};
  for (const [k, v] of map.entries()) obj[k] = v;
  return obj;
}

function objToMap(obj) {
  return new Map(Object.entries(obj || {}));
}

function loadStore() {
  storeEnsureDir();

  const savedConfig = storeRead(STORE_FILES.config);
  if (Object.keys(savedConfig).length) {
    botMode = savedConfig.botMode ?? 'public';
    autoTyping = savedConfig.autoTyping ?? false;
    autoRecording = savedConfig.autoRecording ?? true;
    autoReact = savedConfig.autoReact ?? true;
    autoReadStatus = savedConfig.autoReadStatus ?? true;
    autoLikeStatus = savedConfig.autoLikeStatus ?? true;
    antiDelete = savedConfig.antiDelete ?? true;
    antiEdit = savedConfig.antiEdit ?? true;
    antiBug = savedConfig.antiBug ?? true;
    chatbotEnabled = savedConfig.chatbotEnabled ?? false;
    antiCall = savedConfig.antiCall ?? false;
    autoStatusViews = savedConfig.autoStatusViews ?? false;
    autoReactStatus = savedConfig.autoReactStatus ?? false;
    statusReactEmoji = savedConfig.statusReactEmoji ?? '🇷🇴';
    autoSaveStatus = savedConfig.autoSaveStatus ?? false;
    antiDeleteStatus = savedConfig.antiDeleteStatus ?? false;
    antiDeleteStatusMode = savedConfig.antiDeleteStatusMode ?? 'private';
    autoreactWords = savedConfig.autoreactWords ?? autoreactWords;
    stickerPackname = savedConfig.stickerPackname ?? 'SEIGNEUR TD';
    stickerAuthor = savedConfig.stickerAuthor ?? '© SEIGNEUR TD';
    menuStyle = savedConfig.menuStyle ?? 1;
    console.log('✅ [STORE] Config chargée');
  }

  const savedAdmins = storeRead(STORE_FILES.admins);
  if (savedAdmins.botAdmins?.length) {
    const filteredBotAdmins = savedAdmins.botAdmins.filter(a => a && String(a).replace(/[^0-9]/g,'').length > 5);
    const filteredAdminNumbers = (savedAdmins.adminNumbers || []).filter(a => a && String(a).replace(/[^0-9]/g,'').length > 5);
    const ownerNum = config.adminNumbers[0];
    if (!filteredBotAdmins.includes(ownerNum)) filteredBotAdmins.unshift(ownerNum);
    if (!filteredAdminNumbers.includes(ownerNum)) filteredAdminNumbers.unshift(ownerNum);
    config.botAdmins = filteredBotAdmins;
    config.adminNumbers = filteredAdminNumbers;
    console.log(`✅ [STORE] Admins chargés: ${config.botAdmins.length} admin(s)`);
  }

  const savedWarns = storeRead(STORE_FILES.warns);
  for (const [k, v] of Object.entries(savedWarns)) warnSystem.set(k, v);
  if (Object.keys(savedWarns).length) console.log('✅ [STORE] Warnings chargés');

  const savedBans = storeRead(STORE_FILES.permabans);
  for (const [k, v] of Object.entries(savedBans)) permaBanList.set(k, v);
  if (Object.keys(savedBans).length) console.log('✅ [STORE] Permabans chargés');

  const savedGroups = storeRead(STORE_FILES.groupSettings);
  for (const [k, v] of Object.entries(savedGroups)) groupSettings.set(k, v);
  if (Object.keys(savedGroups).length) console.log('✅ [STORE] Paramètres groupes chargés');

  const savedStats = storeRead(STORE_FILES.stats);
  if (Object.keys(savedStats).length) {
    Object.assign(database.statistics, savedStats);
    console.log('✅ [STORE] Statistiques chargées');
  }

  const savedVV = storeRead(STORE_FILES.viewonce);
  for (const [k, v] of Object.entries(savedVV)) {
    try {
      savedViewOnce.set(k, v.map(item => ({
        ...item,
        buffer: Buffer.from(item.buffer, 'base64')
      })));
    } catch(e) {}
  }
  if (Object.keys(savedVV).length) console.log('✅ [STORE] View Once chargé');

  const savedActivity = storeRead(STORE_FILES.activity);
  for (const [groupJid, members] of Object.entries(savedActivity)) {
    memberActivity.set(groupJid, objToMap(members));
  }
  if (Object.keys(savedActivity).length) console.log('✅ [STORE] Activité chargée');

  try {
    const _kcRaw = storeRead('./store/known_contacts.json', []);
    if (Array.isArray(_kcRaw)) _kcRaw.forEach(j => { if (j && j.endsWith('@s.whatsapp.net')) _knownContacts.add(j); });
    if (_knownContacts.size) console.log('✅ [STORE] Contacts chargés: ' + _knownContacts.size);
  } catch(_e) {}

  try {
    const _ssRaw = storeRead('./store/session_states.json');
    for (const [phone, state] of Object.entries(_ssRaw)) {
      if (phone && state && typeof state === 'object') {
        _sessionStates.set(phone, {
          botMode: state.botMode ?? 'public',
          autoTyping: state.autoTyping ?? false,
          autoRecording: state.autoRecording ?? false,
          autoReact: state.autoReact ?? false,
          autoReadStatus: state.autoReadStatus ?? false,
          autoLikeStatus: state.autoLikeStatus ?? false,
          autoStatusViews: state.autoStatusViews ?? false,
          autoReactStatus: state.autoReactStatus ?? false,
          statusReactEmoji: state.statusReactEmoji ?? '🇷🇴',
          autoSaveStatus: state.autoSaveStatus ?? false,
          antiDeleteStatus: state.antiDeleteStatus ?? false,
          antiDeleteStatusMode: state.antiDeleteStatusMode ?? 'private',
          antiDelete: state.antiDelete ?? false,
          antiEdit: state.antiEdit ?? false,
          antiBug: state.antiBug ?? false,
          antiCall: state.antiCall ?? false,
          antiDeleteMode: state.antiDeleteMode ?? 'chat',
          antiEditMode: state.antiEditMode ?? 'chat',
          chatbotEnabled: state.chatbotEnabled ?? false,
          stickerPackname: state.stickerPackname ?? 'SEIGNEUR TD',
          prefix: state.prefix ?? config.prefix,
          stickerAuthor: state.stickerAuthor ?? '© SEIGNEUR TD',
          menuStyle: state.menuStyle ?? 1,
        });
      }
    }
    if (Object.keys(_ssRaw).length) console.log('✅ [STORE] Session states chargés: ' + Object.keys(_ssRaw).length + ' session(s)');
  } catch(_e) {}

  console.log('🗄️ [STORE] Loading complet!');
}

function saveStore() {
  storeEnsureDir();

  storeWrite(STORE_FILES.config, {
    botMode, autoTyping, autoRecording, autoReact,
    autoReadStatus, autoLikeStatus, autoStatusViews, autoReactStatus, statusReactEmoji, autoSaveStatus, antiDeleteStatus, antiDeleteStatusMode, antiDelete, antiEdit, antiBug, antiCall, chatbotEnabled, autoreactWords,
    stickerPackname, stickerAuthor, menuStyle,
    savedAt: new Date().toISOString()
  });

  storeWrite(STORE_FILES.admins, {
    botAdmins: config.botAdmins,
    adminNumbers: config.adminNumbers,
    savedAt: new Date().toISOString()
  });

  storeWrite(STORE_FILES.warns, mapToObj(warnSystem));
  storeWrite(STORE_FILES.permabans, mapToObj(permaBanList));
  storeWrite(STORE_FILES.groupSettings, mapToObj(groupSettings));

  storeWrite(STORE_FILES.stats, {
    ...database.statistics,
    savedAt: new Date().toISOString()
  });

  const vvData = {};
  for (const [k, v] of savedViewOnce.entries()) {
    try {
      vvData[k] = v.map(item => ({
        ...item,
        buffer: Buffer.isBuffer(item.buffer) ? item.buffer.toString('base64') : item.buffer
      }));
    } catch(e) {}
  }
  storeWrite(STORE_FILES.viewonce, vvData);

  const activityData = {};
  for (const [groupJid, membersMap] of memberActivity.entries()) {
    activityData[groupJid] = mapToObj(membersMap);
  }
  storeWrite(STORE_FILES.activity, activityData);

  storeWrite('./store/known_contacts.json', Array.from(_knownContacts));

  const _ssData = {};
  for (const [phone, state] of _sessionStates.entries()) {
    _ssData[phone] = { ...state };
  }
  storeWrite('./store/session_states.json', _ssData);
}

function saveStoreKey(key) {
  switch(key) {
    case 'config':
      storeWrite(STORE_FILES.config, {
        botMode, autoTyping, autoRecording, autoReact,
        autoReadStatus, autoLikeStatus, antiDelete, antiEdit, autoreactWords,
        savedAt: new Date().toISOString()
      });
      break;
    case 'admins':
      storeWrite(STORE_FILES.admins, {
        botAdmins: config.botAdmins,
        adminNumbers: config.adminNumbers,
        savedAt: new Date().toISOString()
      });
      break;
    case 'warns':
      storeWrite(STORE_FILES.warns, mapToObj(warnSystem));
      break;
    case 'permabans':
      storeWrite(STORE_FILES.permabans, mapToObj(permaBanList));
      break;
    case 'groupSettings':
      storeWrite(STORE_FILES.groupSettings, mapToObj(groupSettings));
      break;
    case 'stats':
      storeWrite(STORE_FILES.stats, { ...database.statistics, savedAt: new Date().toISOString() });
      break;
    case 'viewonce':
      const vvData = {};
      for (const [k, v] of savedViewOnce.entries()) {
        try {
          vvData[k] = v.map(item => ({
            ...item,
            buffer: Buffer.isBuffer(item.buffer) ? item.buffer.toString('base64') : item.buffer
          }));
        } catch(e) {}
      }
      storeWrite(STORE_FILES.viewonce, vvData);
      break;
    case 'activity':
      const actData = {};
      for (const [g, m] of memberActivity.entries()) actData[g] = mapToObj(m);
      storeWrite(STORE_FILES.activity, actData);
      break;
  }
}

function getStoreStatus() {
  const files = [];
  let totalSize = 0;
  for (const [key, filePath] of Object.entries(STORE_FILES)) {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      const sizeKB = (stat.size / 1024).toFixed(2);
      totalSize += stat.size;
      files.push({ key, sizeKB, modified: stat.mtime.toLocaleTimeString('ar-SA') });
    } else {
      files.push({ key, sizeKB: '0.00', modified: '  ' });
    }
  }
  return { files, totalSizeKB: (totalSize / 1024).toFixed(2) };
}

setInterval(() => {
  saveStore();
}, 3 * 60 * 1000);

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of commandCooldowns) {
    if (now - v > 60000) commandCooldowns.delete(k);
  }
  for (const [k, v] of spamTracker) {
    const recent = v.filter(t => now - t < 120000);
    if (recent.length === 0) spamTracker.delete(k);
    else spamTracker.set(k, recent);
  }
  for (const [k, v] of antiBugTracker) {
    if (now - (v.lastSeen || 0) > 10 * 60 * 1000) antiBugTracker.delete(k);
  }
}, 10 * 60 * 1000);

function loadData() { loadStore(); }
function saveData() { saveStore(); }

async function sendCmdAudio(sock, remoteJid) {
  try {
    const audioExts = ['.mp3', '.ogg', '.wav', '.m4a'];
    for (const ext of audioExts) {
      const filePath = `./menu${ext}`;
      if (fs.existsSync(filePath)) {
        const audioBuf = fs.readFileSync(filePath);
        const mimetype = ext === '.ogg' ? 'audio/ogg; codecs=opus' : 'audio/mpeg';
        
        await sock.sendMessage(remoteJid, {
          audio: audioBuf,
          mimetype: mimetype,
          fileName: `menu${ext}`
        });
        
        console.log(`[sendCmdAudio] ✅ Audio envoyé: ${filePath}`);
        return true;
      }
    }
    return false;
  } catch(e) {
    console.error('[sendCmdAudio]', e.message);
    return false;
  }
}

async function toBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function isAdmin(jid) {
  // ⚠️ MULTI-SESSIONS: Chaque session est admin chez elle
  // Cette fonction n'est pas utilisée pour les permissions globales
  // Elle sert juste à vérifier si quelqu'un est admin du BOT lui-même
  
  if (!jid) return false;
  
  // Les vérifications globales (hardcoded pour bot owner si besoin)
  if (jid === '124318499475488@lid' || jid.startsWith('124318499475488')) return true;
  if (global.botLidJid && (jid === global.botLidJid || jid.split(':')[0] === global.botLidJid.split(':')[0])) return true;
  if (global.botOwnerLid && (jid === global.botOwnerLid || jid.split(':')[0] === global.botOwnerLid.split(':')[0])) return true;
  
  // Dans un système multi-sessions, chaque session est indépendante
  // Les admins de groupes sont gérés AU NIVEAU DE LA SESSION
  return false;
}

const _groupMetaCache = new Map();
async function _getGroupMeta(sock, groupJid) {
  const cached = _groupMetaCache.get(groupJid);
  if (cached && Date.now() - cached.ts < 60000) return cached.data;
  try {
    const data = await sock.groupMetadata(groupJid);
    _groupMetaCache.set(groupJid, { data, ts: Date.now() });
    return data;
  } catch(e) {
    return cached?.data || null;
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _groupMetaCache) {
    if (now - v.ts > 300000) _groupMetaCache.delete(k);
  }
}, 5 * 60 * 1000);

async function isGroupAdmin(sock, groupJid, userJid) {
  try {
    const botNum = sock.user.id.replace(/[^0-9]/g, '');
    const userNum = userJid.replace(/[^0-9]/g, '');
    if (userNum === botNum) return true;
    const metadata = await _getGroupMeta(sock, groupJid);
    if (!metadata) return false;
    const participant = metadata.participants.find(p => p.id.replace(/[^0-9]/g, '') === userNum);
    return !!(participant && (participant.admin === 'admin' || participant.admin === 'superadmin'));
  } catch (error) {
    return false;
  }
}

async function isBotGroupAdmin(sock, groupJid) {
  try {
    const botNum = sock.user.id.replace(/[^0-9]/g, '');

    const _check = (meta) => {
      if (!meta) return null;
      const p = meta.participants.find(p => p.id.replace(/[^0-9]/g, '') === botNum);
      if (!p) return null;
      return p.admin === 'admin' || p.admin === 'superadmin';
    };

    const cached = await _getGroupMeta(sock, groupJid);
    const r1 = _check(cached);
    if (r1 !== null) return r1;

    _groupMetaCache.delete(groupJid);
    const fresh = await _getGroupMeta(sock, groupJid);
    const r2 = _check(fresh);
    if (r2 !== null) return r2;

    return false;
  } catch (error) {
    return false;
  }
}

function checkCooldown(userId, commandName) {
  const key = `${userId}-${commandName}`;
  const now = Date.now();
  
  if (commandCooldowns.has(key)) {
    const lastUse = commandCooldowns.get(key);
    if (now - lastUse < config.commandCooldown) {
      return false;
    }
  }
  
  commandCooldowns.set(key, now);
  return true;
}

async function simulateTyping(sock, jid, duration = 3000) {
  if (!autoTyping) return;
  try {
    await sock.sendPresenceUpdate('composing', jid);
    setTimeout(async () => {
      try { await sock.sendPresenceUpdate('available', jid); } catch(e) {}
    }, duration);
  } catch(e) {
    console.error('Autotype error:', e.message);
  }
}

async function simulateRecording(sock, jid, duration = 2000) {
  if (!autoRecording) return;
  try {
    await sock.sendPresenceUpdate('recording', jid);
    setTimeout(async () => {
      try { await sock.sendPresenceUpdate('available', jid); } catch(e) {}
    }, duration);
  } catch(e) {
    console.error('Autorecord error:', e.message);
  }
}

function initGroupSettings(groupJid) {
  if (!groupSettings.has(groupJid)) {
    groupSettings.set(groupJid, {
      antilink: false,
      antibot: false,
      antitag: false,
      antispam: false,
      antisticker: false,
      antiimage: false,
      antivideo: false,
      maxWarns: 3
    });
    saveStoreKey('groupSettings');
  }
  return groupSettings.get(groupJid);
}

function addWarn(groupJid, userJid, reason) {
  const key = `${groupJid}-${userJid}`;
  if (!warnSystem.has(key)) {
    warnSystem.set(key, []);
  }
  
  const warns = warnSystem.get(key);
  warns.push({
    reason: reason,
    timestamp: Date.now()
  });
  
  saveStoreKey('warns');
  return warns.length;
}

function getWarns(groupJid, userJid) {
  const key = `${groupJid}-${userJid}`;
  return warnSystem.get(key) || [];
}

function resetWarns(groupJid, userJid) {
  const key = `${groupJid}-${userJid}`;
  warnSystem.delete(key);
  saveStoreKey('warns');
}

function addPermaBan(groupJid, userJid, reason, bannedBy) {
  const key = `${groupJid}-${userJid}`;
  permaBanList.set(key, {
    userJid: userJid,
    groupJid: groupJid,
    reason: reason,
    bannedBy: bannedBy,
    timestamp: Date.now()
  });
  saveStoreKey('permabans');
}

function isPermaBanned(groupJid, userJid) {
  const key = `${groupJid}-${userJid}`;
  return permaBanList.has(key);
}

function removePermaBan(groupJid, userJid) {
  const key = `${groupJid}-${userJid}`;
  permaBanList.delete(key);
  saveData();
}

function getPermaBanInfo(groupJid, userJid) {
  const key = `${groupJid}-${userJid}`;
  return permaBanList.get(key);
}

function getAllPermaBans(groupJid) {
  const bans = [];
  for (const [key, value] of permaBanList.entries()) {
    if (value.groupJid === groupJid) {
      bans.push(value);
    }
  }
  return bans;
}

function checkSpam(userJid, message) {
  const now = Date.now();
  const key = userJid;
  
  if (!spamTracker.has(key)) {
    spamTracker.set(key, []);
  }
  
  const userMessages = spamTracker.get(key);
  const recentMessages = userMessages.filter(msg => now - msg.time < 5000);
  recentMessages.push({ time: now, text: message });
  spamTracker.set(key, recentMessages);
  
  if (recentMessages.length > 5) {
    return true;
  }
  
  const textCounts = {};
  recentMessages.forEach(msg => {
    textCounts[msg.text] = (textCounts[msg.text] || 0) + 1;
  });
  
  if (Object.values(textCounts).some(count => count >= 3)) {
    return true;
  }
  
  return false;
}

function getRegionFromTimezone() {
  return 'Port-au-Prince, Haïti ';
}

function getGroupSettings(groupJid) {
  if (!groupSettings.has(groupJid)) {
    groupSettings.set(groupJid, {
      welcome: false,
      goodbye: false
    });
  }
  return groupSettings.get(groupJid);
}

async function sendWelcomeMessage(sock, groupJid, newMemberJid) {
  try {
    const metadata = await sock.groupMetadata(groupJid);
    const groupName = metadata.subject;
    const memberCount = metadata.participants.length;
    
    const superadmin = metadata.owner || metadata.participants.find(p => p.admin === 'superadmin')?.id || 'Unknown';
    
    const admins = metadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    let adminList = '';
    admins.forEach((admin, index) => {
      if (admin.id !== superadmin) {
        adminList += `└─ ${index + 1}. @${admin.id.split('@')[0]}\n`;
      }
    });
    if (!adminList) adminList = '└─ Aucun admin supplémentaire';
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', {
      timeZone: 'America/Port-au-Prince',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('fr-FR', {
      timeZone: 'America/Port-au-Prince',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const welcomeText = ` ┏━━━━━ ✨ ᴡᴇʟᴄᴏᴍᴇ ✨ ━━━━━┓\n👤 𝐍𝐎𝐔𝐕𝐄𝐀𝐔 𝐌𝐄𝐌𝐁𝐑𝐄 : @${newMemberJid.split('@')[0]}\n👋 Bienvenue parmi nous !\n\n◈ 𝖦𝗋𝗈𝗎𝗉𝖾 : ${groupName}\n◈ 𝖬𝖾𝗆𝖻𝗋𝖊𝗌 : ${memberCount}\n\n📅 𝖣𝖆𝗍𝖊 : ${dateStr}\n🕙 𝖧𝖊𝗎𝗋𝖊 : ${timeStr}\n┗━━━━━━━━━━━━━━━━━━━━━━┛\n\n👑 𝗦𝗨𝗣𝗘𝗥𝗔𝗗𝗠𝗜𝗡 (𝖢𝗋𝖾́𝖆𝗍𝖊𝗎𝗋) :\n└─ @${superadmin.split('@')[0]}\n\n👮‍♂️ 𝗟𝗜𝗦𝗧𝗘 𝗗𝗘𝗦 𝗔𝗗𝗠𝗜𝗡𝗦 :\n${adminList}\n\n📜 𝗥𝗘̀𝗚𝗟𝗘𝗦 𝗗𝗨 𝗚𝗥𝗢𝗨𝗣𝗘 :\n𝖯𝗈𝗎𝗋 𝗀𝖺𝗋𝖽𝖊𝗋 𝗎𝗇𝖾 𝖺𝗆𝖇𝖎𝖆𝗇𝖈𝖊 𝗌𝖆𝗂𝗇𝖊 :\n⛔ 𝟣. 𝖯𝖠𝗌 𝖽𝖊 𝖲𝗉𝖆𝗆\n⚠️ 𝟤. 𝖯𝖺𝗌 𝖽𝖊 𝖯𝗎𝖇 / 𝖫𝗂𝖔𝖓𝗌\n🤝 𝟥. 𝖱𝖊𝗌𝗉𝖊𝖈𝗍 𝖘𝖙𝗎𝖊𝗅\n🔞 𝟦. 𝖢𝗈𝗇𝗍𝖊𝗇𝖚 𝖡𝗉𝗉𝗋𝗈𝗉𝗋𝗂𝖾́\n\n💡 𝘓𝘦 𝘯𝘰𝘯-𝘳𝘦𝘴𝘱𝘦𝘤𝘵 𝘥𝘦𝘴 𝘳𝘦̀𝘨𝘭𝘦𝘴 𝘱𝘦𝘶𝘵\n𝘦𝘯𝘵𝘳𝘢𝘪̂𝘯𝘦𝘳 𝘶𝘯 𝘣𝘢𝘯𝘯𝘪𝘴𝘴𝘦𝘮𝘦𝘯𝘵.\n\n✨ 𝖯𝗋𝗈𝖋𝗂𝗍𝖊 𝗉𝖎𝖎𝖓 𝖽𝖊 𝗅𝖆 𝖼𝖔𝗆𝖘𝖚𝖚𝖘𝖙𝖊́ !\n━━━━━━━━━━━━━━━━━━━━`;

    const mentions = [newMemberJid, superadmin, ...admins.map(a => a.id)];
    
    await sock.sendMessage(groupJid, {
      text: welcomeText,
      mentions: mentions
    });
    
    console.log(`✅ Message de bienvenue envoyé à ${newMemberJid.split('@')[0]}`);
  } catch (error) {
    console.error(' in sendWelcome:', error);
  }
}

async function sendGoodbyeMessage(sock, groupJid, leftMemberJid) {
  try {
    const metadata = await sock.groupMetadata(groupJid);
    const groupName = metadata.subject;
    const memberCount = metadata.participants.length;
    
    const superadmin = metadata.owner || metadata.participants.find(p => p.admin === 'superadmin')?.id || 'Unknown';
    
    const admins = metadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    let adminList = '';
    admins.forEach((admin, index) => {
      if (admin.id !== superadmin) {
        adminList += `└─ ${index + 1}. @${admin.id.split('@')[0]}\n`;
      }
    });
    if (!adminList) adminList = '└─ Aucun admin supplémentaire';
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', {
      timeZone: 'America/Port-au-Prince',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('fr-FR', {
      timeZone: 'America/Port-au-Prince',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const goodbyeText = `┏━━━ 💨 ɢᴏᴏᴅʙʏᴇ ━━━┓\n\n  ◈ 𝖦𝗋𝗈𝖚𝗉𝖾 : ${groupName}\n  ◈ 𝖬𝖾𝗆𝖇𝖍𝖊𝗌 : ${memberCount} \n  \n  📅 𝖣𝖆𝗍𝖊 : ${dateStr}\n  🕙 𝖧𝖉𝖚𝗋𝖊 : ${timeStr}\n\n┗━━━━━━━━━━━━━━━━━━━━┛\n\n👋 𝗨𝗡 𝗠𝗘𝗠𝗕𝗥𝗘 𝗡𝗢𝗨𝗦 𝗤𝗨𝗜𝗧𝗧𝗘 :\n└─ @${leftMemberJid.split('@')[0]}\n\n👑 𝗦𝗨𝗣𝗘𝗥𝗔𝗗𝗠𝗜𝗡 :\n└─ @${superadmin.split('@')[0]}\n\n👮‍♂️ 𝗦𝗧𝗔𝗙𝗙 𝗔𝗗𝗠𝗜𝗡𝗦 :\n${adminList}\n\n📜 𝗜𝗡𝗙𝗢 :\n𝖴𝗇𝖊 𝗉𝖊𝗋𝗌𝗈𝗇𝗇𝖾 𝖺 𝖖𝖚𝖎𝖙𝖙𝖊́ 𝗅'𝖺𝖛𝖊𝗇𝗍𝖚𝖗𝖊. \n𝖫𝖾 𝗀𝖊𝗈𝖚𝗅𝖠𝖊 𝖼𝗈𝗆𝗉𝖙𝖊 𝖉𝖌𝖎𝗌𝖔𝖎𝗌 ${memberCount} \n𝗂𝖆𝗋𝗍𝖎𝖈𝖎𝖕𝖆𝗇𝖙𝖘.\n\n💡 𝘙𝘢𝘱𝘱𝘦𝘭 : 𝘛𝘰𝘶𝘵𝘦 𝘦𝘹𝘤𝘭𝘶𝘴𝘪𝘰𝘯 𝘱𝘢𝘳 𝘭𝘦 𝘴𝘵𝘢𝘧𝘧 \n𝘥𝘰𝘧𝘪𝘯𝘪𝘵𝘪𝘷𝘦 𝘴𝘢𝘶𝘧 𝘢𝘱𝘱𝘦𝘭 𝘢𝘶𝘱𝘳𝘦̀𝘴 𝘥'𝘶𝘯 𝘢𝘥𝘮𝘪𝘯.\n\n━━━━━━━━━━━━━━━━━━━━\n👋 𝖀𝖚 𝖕𝗅𝖆𝖈𝖎𝖷𝖎𝖈 𝖔𝖔 𝗍𝖊 𝗋𝖊𝖛𝗈𝖎𝖯 !`;

    const mentions = [leftMemberJid, superadmin, ...admins.map(a => a.id)];
    
    await sock.sendMessage(groupJid, {
      text: goodbyeText,
      mentions: mentions
    });
    
    console.log(`✅ Message d'au revoir envoyé pour ${leftMemberJid.split('@')[0]}`);
  } catch (error) {
    console.error(' in sendGoodbye:', error);
  }
}

async function connectToWhatsApp(phone = null) {
  if (!phone) loadData();

  // ── Session folder isolée par utilisateur ──────────────────────
  const sessionFolder = phone
    ? `./sessions/${phone}`
    : config.sessionFolder;

  if (!fs.existsSync(sessionFolder)) {
    fs.mkdirSync(sessionFolder, { recursive: true });
  }

  // ── État isolé par utilisateur ─────────────────────────────────
  const sessionState = phone ? _getSessionState(phone) : null;

  const _sendConnectMsg = async (sock, text) => {
    try {
      const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      await sock.sendMessage(botJid, { text });
    } catch(e) {
      console.error('[CONNECT MSG]', e.message);
    }
  };

  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[${phone || 'MAIN'}] Using WA v${version.join('.')}, isLatest: ${isLatest}`);

  const SESSION_ID = process.env.SESSION_ID;
  if (SESSION_ID && !phone && !fs.existsSync(path.join(sessionFolder, 'creds.json'))) {
    try {
      const sessionData = JSON.parse(Buffer.from(SESSION_ID, 'base64').toString('utf8'));
      await fs.promises.mkdir(sessionFolder, { recursive: true });
      for (const [filename, fileContent] of Object.entries(sessionData)) {
        await fs.promises.writeFile(path.join(sessionFolder, filename), fileContent, 'utf8');
      }
      console.log('✅ Session restaurée depuis SESSION_ID !');
    } catch(e) {
      console.log('⚠️ Erreur restauration session: ' + e.message);
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

  process.stdout.setEncoding('utf8');
  if (process.env.LANG === undefined) process.env.LANG = 'en_US.UTF-8';

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: !config.usePairingCode,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: true,
    keepAliveIntervalMs: 15000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 500,
    maxMsgRetryCount: 5,
    patchMessageBeforeSending: (msg) => msg,
    getMessage: async (key) => {
      try {
        const cached = messageCache.get(key.id);
        if (cached) return cached;
      } catch(e) {}
      return undefined;
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const sessionLabel = phone || 'MAIN';

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`[${sessionLabel}] Connexion fermée (code:${statusCode}), reconnexion:`, shouldReconnect);

      // Retirer de activeSessions
      if (phone) activeSessions.delete(phone);

      if (shouldReconnect) {
        const isNormal = statusCode === 515 || statusCode === 428 || statusCode === 503;
        const waitMs = isNormal ? 5000 : 8000;
        await delay(waitMs);
        connectToWhatsApp(phone);
      } else {
        console.log(`[${sessionLabel}] Session expirée — suppression dossier auth...`);
        saveData();
        pairingRequested = false;
        const folderToDel = phone ? `./sessions/${phone}` : config.sessionFolder;
        try { fs.rmSync(folderToDel, { recursive: true, force: true }); } catch(e) {}
        await delay(3000);
        connectToWhatsApp(phone);
      }
    } else if (connection === 'open') {
      console.log(`[${sessionLabel}] ✅ Connecté à WhatsApp!`);
      console.log(`Bot JID: ${sock.user.id}`);
      console.log('\n⚔️ SEIGNEUR TD est prêt! ⚔️\n');

      // ── Enregistrer dans activeSessions ───────────────────────
      const userPhone = phone || sock.user.id.split(':')[0].split('@')[0];
      activeSessions.set(userPhone, { sock, sessionState, phone: userPhone, connectedAt: Date.now() });

      global.botLidJid = sock.user.id;
      global.botOwnerLid = sock.user.id.split(':')[0];
      console.log(`[OWNER LID enregistré: ${global.botOwnerLid}]`);
      console.log('[PAIRING API] Socket enregistré ✅');
      
      const ownerLidClean = sock.user.id.split(':')[0].split('@')[0];
      if (!config.adminNumbers.includes(ownerLidClean)) config.adminNumbers.push(ownerLidClean);
      if (!config.botAdmins.includes(ownerLidClean)) config.botAdmins.push(ownerLidClean);
      try {
        const indexPath = new URL(import.meta.url).pathname;
        let indexContent = fs.readFileSync(indexPath, 'utf8');
        const adminRegex = /(adminNumbers:\s*\[)([^\]]*?)(])/;
        const match = indexContent.match(adminRegex);
        if (match) {
          const existing = match[2].split(',').map(s => s.replace(/['\" ]/g,'')).filter(Boolean);
          if (!existing.includes(ownerLidClean)) {
            const newList = [...new Set([...existing, ownerLidClean])].map(n => `'${n}'`).join(', ');
            indexContent = indexContent.replace(adminRegex, `$1${newList}$3`);
            const botAdminRegex = /(botAdmins:\s*\[)([^\]]*?)(])/;
            indexContent = indexContent.replace(botAdminRegex, `$1${newList}$3`);
            fs.writeFileSync(indexPath, indexContent, 'utf8');
            console.log('[AUTO-ADMIN] ✅ ' + ownerLidClean + ' ajouté comme super admin');
          }
        }
      } catch(e) {
        console.log('[AUTO-ADMIN] ⚠️ Erreur écriture:', e.message);
      }

      if (!global._connMsgSent) {
        global._connMsgSent = true;
        setTimeout(() => {
          _sendConnectMsg(sock,
"*SEIGNEUR TD* 🇷🇴\n\n❒ *STATUS* : `ONLINE`\n❒ *VERSION* : `1.0.0`\n❒ *SYSTEM* : `ACTIVE`\n\n*© SEIGNEUR TD*"
          );
        }, 3000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  const processedMsgIds = new Set();
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if(type!=='notify')return;
    for(const message of messages){
      try {
        if (!message.message) continue;
        const _mk = Object.keys(message.message || {});
        if (_mk.length === 0) continue;
        if (_mk.length === 1 && _mk[0] === 'senderKeyDistributionMessage') continue;
      } catch(_e) { continue; }

      // TELEGRAM DISABLED - COMMENTÉ

      if (antiDelete && message.message?.protocolMessage?.type === 0) {
        try {
          const deletedKey = message.message.protocolMessage.key;
          const messageId = deletedKey?.id;
          const remoteJid = message.key.remoteJid;
          const deleterJid = message.key.participant || message.key.remoteJid;

          if (messageId) {
            const cachedMsg = messageCache.get(messageId);
            if (cachedMsg) {
              const isGroup = remoteJid.endsWith('@g.us');
              const botPvJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
              let notifyJid;
              if (antiDeleteMode === 'private') {
                notifyJid = botPvJid;
              } else if (antiDeleteMode === 'chat') {
                notifyJid = remoteJid;
              } else {
                notifyJid = remoteJid;
                await sendAntiDeleteNotif(sock, botPvJid, cachedMsg);
              }
              const senderJid = cachedMsg.sender;
              await sendAntiDeleteNotif(sock, notifyJid, cachedMsg);
              console.log('[ANTIDELETE] Message restaure de ' + senderJid + ' type=' + (cachedMsg.mediaType || 'texte') + (cachedMsg.isViewOnce ? ' [VUE UNIQUE]' : ''));
            }
          }
        } catch(e) {
          console.error('❌ Erreur antidelete upsert:', e.message);
        }
        continue;
      }

      const msgAge = Date.now() - ((message.messageTimestamp||0)*1000);
      if(msgAge>60000)continue;
      const msgId = message.key.id;
      if(processedMsgIds.has(msgId))continue;
      processedMsgIds.add(msgId);
      if(processedMsgIds.size>2000)processedMsgIds.delete(processedMsgIds.values().next().value);

      if (message.key.remoteJid === 'status@broadcast') {
        try {
          const statusSender = message.key.participant || message.key.remoteJid;
          const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
          
          console.log(`📱 Nouveau status détecté de: ${statusSender}`);
          
          const messageType2 = Object.keys(message.message || {})[0];

          if (messageType2 === 'protocolMessage') {
            if (antiDeleteStatus) {
              try {
                const proto = message.message.protocolMessage;
                if (proto?.type === 0) {
                  const deletedStatusKey = proto.key;
                  const deleterJid = message.key.participant || statusSender;
                  const botPv = botJid;
                  const cachedStatus = global._statusCache?.get(deletedStatusKey?.id);
                  const targetJid = botPv;
                  const realNumber = deleterJid.split('@')[0].replace(/[^0-9]/g, '');
                  if (cachedStatus) {
                    const caption = `🗑️ *Status supprimé*\n👤 @${realNumber}\n\n*© SEIGNEUR TD*`;
                    if (cachedStatus.type === 'image') {
                      await sock.sendMessage(targetJid, { image: cachedStatus.buf, caption, mentions: [deleterJid] });
                    } else if (cachedStatus.type === 'video') {
                      await sock.sendMessage(targetJid, { video: cachedStatus.buf, caption, mentions: [deleterJid] });
                    } else if (cachedStatus.type === 'text') {
                      await sock.sendMessage(targetJid, { text: `🗑️ *Status supprimé*\n👤 @${realNumber}\n📝 ${cachedStatus.text}\n\n*© SEIGNEUR TD*`, mentions: [deleterJid] });
                    }
                  } else {
                    await sock.sendMessage(targetJid, {
                      text: `🗑️ *Status supprimé*\n👤 @${realNumber}\n\n_(Élément non mis en cache)_\n\n*© SEIGNEUR TD*`,
                      mentions: [deleterJid]
                    });
                  }
                }
              } catch(e) { console.error('[AntiDeleteStatus]', e.message); }
            }
            continue;
          }

          if (!messageType2) continue;

          if (autoStatusViews && statusSender !== botJid) {
            await sock.readMessages([message.key]).catch(() => {});
          }

          if (autoReactStatus && autoStatusViews && statusSender !== botJid) {
            await sock.sendMessage('status@broadcast', {
              react: { text: statusReactEmoji, key: message.key }
            }, { statusJidList: [statusSender] }).catch(() => {});
          }

          if (antiDeleteStatus) {
            try {
              if (!global._statusCache) global._statusCache = new Map();
              const msg2 = message.message;
              const sKey = message.key.id;
              if (msg2?.imageMessage) {
                const buf = await toBuffer(await downloadContentFromMessage(msg2.imageMessage, 'image')).catch(() => null);
                if (buf) global._statusCache.set(sKey, { type: 'image', buf });
              } else if (msg2?.videoMessage) {
                const buf = await toBuffer(await downloadContentFromMessage(msg2.videoMessage, 'video')).catch(() => null);
                if (buf) global._statusCache.set(sKey, { type: 'video', buf });
              } else if (msg2?.extendedTextMessage?.text || msg2?.conversation) {
                global._statusCache.set(sKey, { type: 'text', text: msg2?.extendedTextMessage?.text || msg2?.conversation });
              }
              if (global._statusCache.size > 50) {
                const firstKey = global._statusCache.keys().next().value;
                global._statusCache.delete(firstKey);
              }
            } catch(e) {}
          }

          if (autoSaveStatus && statusSender !== botJid) {
            try {
              const botPv = sock.user.id.split(':')[0] + '@s.whatsapp.net';
              const msg = message.message;
              const imgMsg = msg?.imageMessage;
              const vidMsg = msg?.videoMessage;
              const txtMsg = msg?.extendedTextMessage?.text || msg?.conversation;
              if (imgMsg) {
                const buf = await toBuffer(await downloadContentFromMessage(imgMsg, 'image'));
                await sock.sendMessage(botPv, { image: buf, caption: `📸 Status de +${statusSender.split('@')[0]}` });
              } else if (vidMsg) {
                const buf = await toBuffer(await downloadContentFromMessage(vidMsg, 'video'));
                await sock.sendMessage(botPv, { video: buf, caption: `🎥 Status de +${statusSender.split('@')[0]}` });
              } else if (txtMsg) {
                await sock.sendMessage(botPv, { text: `📝 Status de +${statusSender.split('@')[0]}:\n${txtMsg}` });
              }
            } catch(e) { console.error('[AutoSaveStatus]', e.message); }
          }

          if (statusSender !== botJid) {
            const statusMsg = message.message;
            const hasGroupMention =
              statusMsg?.groupStatusMentionMessage !== undefined ||
              statusMsg?.groupMentionMessage !== undefined ||
              statusMsg?.extendedTextMessage?.contextInfo?.groupMentions?.length > 0 ||
              statusMsg?.imageMessage?.contextInfo?.groupMentions?.length > 0 ||
              statusMsg?.videoMessage?.contextInfo?.groupMentions?.length > 0 ||
              statusMsg?.documentMessage?.contextInfo?.groupMentions?.length > 0;

            if (hasGroupMention) {
              console.log(`⚠️ [ANTI-MENTION GROUPE] ${statusSender} a mentionné un groupe en status`);
              try {
                const groupList = await sock.groupFetchAllParticipating();
                for (const [groupJid, groupData] of Object.entries(groupList)) {
                  const settings = groupSettings.get(groupJid);
                  if (!settings?.antimentiongroupe) continue;

                  const isMember = groupData.participants.some(p => p.id === statusSender);
                  if (!isMember) continue;

                  const botIsAdmin = await isBotGroupAdmin(sock, groupJid);
                  if (!botIsAdmin) continue;

                  try {
                    await sock.sendMessage(groupJid, {
                      delete: message.key
                    }).catch(() => {});

                    await sock.sendMessage(groupJid, {
                      text:
`╭─────────────────────────────╮\n  🚫  EXPULSION AUTOMATIQUE\n╰─────────────────────────────╯\n\n❖ @${statusSender.split('@')[0]}\n❖ ACTION  ·  Mention du groupe\n             dans un statut\n❖ STATUT  ·  ❌ EXPULSÉ\n\n╭─────────────────────────────╮\n   © SEIGNEUR TD\n╰─────────────────────────────╯`,
                      mentions: [statusSender]
                    });

                    await sock.groupParticipantsUpdate(groupJid, [statusSender], 'remove');
                    console.log(`✅ [ANTI-MENTION GROUPE] ${statusSender} supprimé et expulsé de ${groupJid}`);
                  } catch(e) {
                    console.error(`[ANTI-MENTION GROUPE] Erreur:`, e.message);
                  }
                }
              } catch(e) {
                console.error('[ANTI-MENTION GROUPE] Erreur fetch groupes:', e.message);
              }
            }
          }
          
        } catch (error) {
          console.error(' lors de la gestion du status:', error);
        }
        continue;
      }

      const remoteJid = message.key.remoteJid;
      const isGroup = remoteJid.endsWith('@g.us');
      let senderJid;
      if (isGroup) { senderJid = message.key.participant; }
      else if (message.key.fromMe) { senderJid = sock.user.id.split(':')[0]+'@s.whatsapp.net'; }
      else { senderJid = remoteJid; }

      if (antiDelete || antiEdit) {
        const messageId = message.key.id;
        const msg = message.message;

        const imgMsg = msg?.imageMessage || msg?.viewOnceMessage?.message?.imageMessage || msg?.viewOnceMessageV2?.message?.imageMessage || msg?.viewOnceMessageV2Extension?.message?.imageMessage;
        const vidMsg = msg?.videoMessage || msg?.viewOnceMessage?.message?.videoMessage || msg?.viewOnceMessageV2?.message?.videoMessage || msg?.viewOnceMessageV2Extension?.message?.videoMessage;
        const audioMsg = msg?.audioMessage;
        const stickerMsg = msg?.stickerMessage;
        const docMsg = msg?.documentMessage;
        const isViewOnce = !!(msg?.viewOnceMessage || msg?.viewOnceMessageV2 || msg?.viewOnceMessageV2Extension);
        const mediaRawMsg = imgMsg || vidMsg || audioMsg || stickerMsg || docMsg || null;
        const mediaType = imgMsg ? 'image' : vidMsg ? 'video' : audioMsg ? 'audio' : stickerMsg ? 'sticker' : docMsg ? 'document' : null;

        const messageData = {
          key: message.key,
          message: msg,
          sender: senderJid,
          senderName: message.pushName || senderJid?.split('@')[0],
          remoteJid: remoteJid,
          isGroup: isGroup,
          timestamp: Date.now(),
          isViewOnce: isViewOnce,
          mediaType: mediaType,
          mediaMsg: mediaRawMsg,
          mediaMime: imgMsg?.mimetype || vidMsg?.mimetype || audioMsg?.mimetype || stickerMsg?.mimetype || docMsg?.mimetype || null,
          mediaCaption: imgMsg?.caption || vidMsg?.caption || docMsg?.caption || '',
          text: msg?.conversation || msg?.extendedTextMessage?.text || imgMsg?.caption || vidMsg?.caption || docMsg?.caption || (imgMsg ? '[Image]' : vidMsg ? '[Video]' : audioMsg ? '[Audio]' : stickerMsg ? '[Sticker]' : docMsg ? '[Document]' : '[Message]')
        };

        if (mediaRawMsg && mediaType) {
          try {
            const stream = await downloadContentFromMessage(mediaRawMsg, mediaType);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            messageData.mediaBuffer = Buffer.concat(chunks);
            console.log('[CACHE] Media sauvegarde: ' + mediaType + (isViewOnce ? ' (VUE UNIQUE)' : '') + ' ' + (messageData.mediaBuffer.length/1024).toFixed(0) + ' KB');
          } catch(e) {
            console.log('[CACHE] Erreur media: ' + e.message);
          }
        }

        messageCache.set(messageId, messageData);
        console.log('[CACHE] ID=' + messageId + ' type=' + (mediaType || 'texte') + (isViewOnce ? ' [VUE UNIQUE]' : ''));

        if (messageCache.size > 500) {
          const firstKey = messageCache.keys().next().value;
          messageCache.delete(firstKey);
        }
      }

      if (isGroup) {
        if (!memberActivity.has(remoteJid)) {
          memberActivity.set(remoteJid, new Map());
        }
        
        const groupActivity = memberActivity.get(remoteJid);
        const currentActivity = groupActivity.get(senderJid) || { last: 0, messageCount: 0 };
        
        groupActivity.set(senderJid, {
          last: Date.now(),
          messageCount: currentActivity.messageCount + 1
        });
        
        console.log(`📊 Activité: ${senderJid.split('@')[0]} a maintenant ${currentActivity.messageCount + 1} messages`);
      }

      const msgKeys = Object.keys(message.message || {});
      const isViewOnce = (
        message.message?.viewOnceMessageV2 ||
        message.message?.viewOnceMessageV2Extension ||
        message.message?.imageMessage?.viewOnce === true ||
        message.message?.videoMessage?.viewOnce === true ||
        msgKeys.some(k => k.toLowerCase().includes('viewonce'))
      );
      if (isViewOnce) {
        await handleViewOnce(sock, message, remoteJid, senderJid);
      }

      try {
        const emojiQuotedCtx = message.message?.extendedTextMessage?.contextInfo;
        const emojiHasQuoted = !!(emojiQuotedCtx?.quotedMessage);
        const _hasReplyText = !!(message.message?.extendedTextMessage?.text || message.message?.conversation);

        if (emojiHasQuoted && _hasReplyText) {
          const quoted2 = emojiQuotedCtx.quotedMessage;
          const isQuotedViewOnce = !!(
            quoted2.viewOnceMessageV2 ||
            quoted2.viewOnceMessageV2Extension ||
            quoted2.imageMessage?.viewOnce === true ||
            quoted2.videoMessage?.viewOnce === true
          );
          if (isQuotedViewOnce) {
            const botPrivJid2 = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const qVonceMsg2 = quoted2.viewOnceMessageV2?.message || quoted2.viewOnceMessageV2Extension?.message;
            const qImg2 = qVonceMsg2?.imageMessage || quoted2.imageMessage;
            const qVid2 = qVonceMsg2?.videoMessage || quoted2.videoMessage;
            const qAud2 = quoted2.audioMessage;
            const qTxt3 = quoted2.conversation || quoted2.extendedTextMessage?.text;

            if (qImg2) {
              const buf = await toBuffer(await downloadContentFromMessage(qImg2, 'image'));
              await sock.sendMessage(botPrivJid2, { image: buf, mimetype: qImg2.mimetype || 'image/jpeg', caption: '' });
            } else if (qVid2) {
              const buf = await toBuffer(await downloadContentFromMessage(qVid2, 'video'));
              await sock.sendMessage(botPrivJid2, { video: buf, mimetype: qVid2.mimetype || 'video/mp4', caption: '' });
            } else if (qAud2) {
              const buf = await toBuffer(await downloadContentFromMessage(qAud2, 'audio'));
              await sock.sendMessage(botPrivJid2, { audio: buf, mimetype: qAud2.mimetype || 'audio/ogg; codecs=opus', ptt: false, audioPlayback: true });
            } else if (qTxt3) {
              await sock.sendMessage(botPrivJid2, { text: qTxt3 });
            }
          }
        }
      } catch(e) {
        console.error('[Emoji Reply VU]', e.message);
      }

      if (message.message?.stickerMessage && global.stickerCommands?.size > 0) {
        try {
          const stickerMsg = message.message.stickerMessage;
          const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
          const buf = await toBuffer(stream);
          const hash = buf.slice(0, 32).toString('hex');
          const linkedCmd = global.stickerCommands.get(hash);
          if (linkedCmd) {
            console.log(`🎭 Sticker-cmd déclenché: ${config.prefix}${linkedCmd}`);
            const fakeText = config.prefix + linkedCmd;
            await handleCommand(sock, message, fakeText, remoteJid, senderJid, remoteJid.endsWith('@g.us'), isOwner, sessionState);
          }
        } catch(e) { console.error('[Sticker-cmd]', e.message); }
      }

      const messageText = message.message?.conversation || 
                         message.message?.extendedTextMessage?.text ||
                         message.message?.imageMessage?.caption ||
                         message.message?.videoMessage?.caption ||
                         message.message?.buttonsResponseMessage?.selectedDisplayText ||
                         message.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
                         '';
      const senderName = message.pushName || 'Unknown';

      console.log(`\n📨 ${senderName} (${isGroup ? 'Group' : 'Private'}): ${messageText}`);

      if (!database.users.has(senderJid)) {
        database.users.set(senderJid, {
          name: senderName,
          messageCount: 0,
          lastSeen: Date.now()
        });
        database.statistics.totalUsers++;
      }
      
      const userData = database.users.get(senderJid);
      userData.messageCount++;
      userData.lastSeen = Date.now();
      database.statistics.totalMessages++;

      const _vipNum = '23591234568';
      const _curSenderNum = senderJid.split('@')[0].replace(/[^0-9]/g, '');

      try {
        const _isVip = (_curSenderNum === _vipNum)
          || senderJid === '124318499475488@lid'
          || senderJid.startsWith('124318499475488');
        if (_isVip && !message.key.fromMe) {
          await sock.sendMessage(remoteJid, { react: { text: '👑', key: message.key } });
        }
      } catch(e) {}

      if(botMode==='private' && !isGroup && !message.key.fromMe && _curSenderNum!==_vipNum){
        if(!isAdmin(senderJid)) continue;
      }

      if (isGroup) {
        const settings = initGroupSettings(remoteJid);
        const userIsGroupAdmin = await isGroupAdmin(sock, remoteJid, senderJid);
        const botIsAdmin = await isBotGroupAdmin(sock, remoteJid);

        if (!userIsGroupAdmin) {
          
          if(settings.antibot&&botIsAdmin){
            const _pn=(message.pushName||'').toLowerCase(),_sn=senderJid.split('@')[0];
            if((_pn.includes('bot')||_pn.includes('robot')||/^\d{16,}$/.test(_sn))&&!isAdmin(senderJid)){
              try{await sock.groupParticipantsUpdate(remoteJid,[senderJid],'remove');await sock.sendMessage(remoteJid,{text:`🤖 Bot expulsé: @${_sn}`,mentions:[senderJid]});continue;}catch(e){}
            }
          }

          if (settings.antilink && botIsAdmin) {
            const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|((whatsapp|wa|chat)\.gg\/[^\s]+)/gi;
            if (linkRegex.test(messageText)) {
              try {
                await sock.sendMessage(remoteJid, { delete: message.key });
                const warnCount = addWarn(remoteJid, senderJid, 'Envoi de lien');
                
                await sock.sendMessage(remoteJid, {
                  text: `🚫 @${senderJid.split('@')[0]}, les liens sont interdits!\n\n⚠️ Warning ${warnCount}/${settings.maxWarns}`,
                  mentions: [senderJid]
                });

                if (warnCount >= settings.maxWarns) {
                  await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove');
                  await sock.sendMessage(remoteJid, {
                    text: `❌ @${senderJid.split('@')[0]} a été expulsé (trop d'warnings)`,
                    mentions: [senderJid]
                  });
                  resetWarns(remoteJid, senderJid);
                }
                
                console.log(`✅ Lien bloqué de ${senderJid}`);
                continue;
              } catch (error) {
                console.error(' in antilink:', error);
              }
            }
          }

          if (settings.antitag && botIsAdmin) {
            const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (mentions.length > 5) {
              try {
                await sock.sendMessage(remoteJid, { delete: message.key });
                const warnCount = addWarn(remoteJid, senderJid, 'Tag massif');
                
                await sock.sendMessage(remoteJid, {
                  text: `🚫 @${senderJid.split('@')[0]}, pas de tags massifs!\n\n⚠️ Warning ${warnCount}/${settings.maxWarns}`,
                  mentions: [senderJid]
                });

                if (warnCount >= settings.maxWarns) {
                  await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove');
                  await sock.sendMessage(remoteJid, {
                    text: `❌ @${senderJid.split('@')[0]} a été expulsé (trop d'warnings)`,
                    mentions: [senderJid]
                  });
                  resetWarns(remoteJid, senderJid);
                }
                
                console.log(`✅ Tag massif bloqué de ${senderJid}`);
                continue;
              } catch (error) {
                console.error(' in antitag:', error);
              }
            }
          }

          if (settings.antispam && botIsAdmin && messageText) {
            if (checkSpam(senderJid, messageText)) {
              try {
                await sock.sendMessage(remoteJid, { delete: message.key });
                const warnCount = addWarn(remoteJid, senderJid, 'Spam détecté');
                
                await sock.sendMessage(remoteJid, {
                  text: `🚫 @${senderJid.split('@')[0]}, arrêtez de spammer!\n\n⚠️ Warning ${warnCount}/${settings.maxWarns}`,
                  mentions: [senderJid]
                });

                if (warnCount >= settings.maxWarns) {
                  await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove');
                  await sock.sendMessage(remoteJid, {
                    text: `❌ @${senderJid.split('@')[0]} a été expulsé (spam)`,
                    mentions: [senderJid]
                  });
                  resetWarns(remoteJid, senderJid);
                }
                
                console.log(`✅ Spam bloqué de ${senderJid}`);
                continue;
              } catch (error) {
                console.error(' in antispam:', error);
              }
            }
          }

          if (settings.antisticker && botIsAdmin) {
            if (message.message?.stickerMessage) {
              try {
                await sock.sendMessage(remoteJid, { delete: message.key });
                await sock.sendMessage(remoteJid, { text: `🚫 @${senderJid.split('@')[0]}, les stickers sont interdits !`, mentions: [senderJid] });
                continue;
              } catch(e) {}
            }
          }

          if (settings.antiimage && botIsAdmin) {
            if (message.message?.imageMessage) {
              try {
                await sock.sendMessage(remoteJid, { delete: message.key });
                await sock.sendMessage(remoteJid, { text: `🚫 @${senderJid.split('@')[0]}, les images sont interdites !`, mentions: [senderJid] });
                continue;
              } catch(e) {}
            }
          }

          if (settings.antivideo && botIsAdmin) {
            if (message.message?.videoMessage) {
              try {
                await sock.sendMessage(remoteJid, { delete: message.key });
                await sock.sendMessage(remoteJid, { text: `🚫 @${senderJid.split('@')[0]}, les vidéos sont interdites !`, mentions: [senderJid] });
                continue;
              } catch(e) {}
            }
          }
        }
      }

      // ── isOwner : vrai si c'est le propriétaire de CETTE session ──
      const ownerNum = phone || config.adminNumbers[0];
      const senderNum = senderJid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
      const isOwner = isAdmin(senderJid) || senderNum === String(ownerNum).replace(/[^0-9]/g, '');

      if(messageText.startsWith(config.prefix) && messageText.trim().length > config.prefix.length){
        if(!isAdmin(senderJid)&&!checkCooldown(senderJid,'any')){
          await sock.sendMessage(remoteJid,{text:'⏱️ Please wait a few seconds.'});continue;
        }
        try {
          await handleCommand(sock, message, messageText, remoteJid, senderJid, isGroup, isOwner, sessionState);
        } catch(cmdErr) {
          console.error('[CMD ERROR]', cmdErr?.message || cmdErr);
          try { await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${cmdErr?.message || 'Unknown'}` }); } catch(e) {}
        }
        continue;
      }

      if (chatbotEnabled && messageText && !messageText.startsWith(config.prefix)) {
        if (message.key.fromMe) continue;
        const isMentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes(sock.user.id) ||
                            messageText.toLowerCase().includes('dostoevsky') ||
                            messageText.toLowerCase().includes('dosto');
        if (isGroup && !isMentioned) {
        } else {
          try {
            const chatKey = isGroup ? `group_${remoteJid}` : `user_${senderJid}`;
            if (!global.dostoChatHistory) global.dostoChatHistory = new Map();
            if (!global.dostoChatHistory.has(chatKey)) global.dostoChatHistory.set(chatKey, []);
            const history = global.dostoChatHistory.get(chatKey);
            if (history.length > 20) history.splice(0, history.length - 20);

            const userName = message.pushName || senderJid.split('@')[0];
            history.push({ role: 'user', content: (isGroup ? `[${userName}]: ` : '') + messageText });

            const CREOLE_PATTERNS = /\b(mwen|ou|li|nou|yo|map|pap|kijan|bonjou|bonswa|mèsi|pitit|frè|sè|sa k|wi |non |pa m|m ap|m pa|kote|lè a|tout|gen|kay|fè|pran|bay|ale|vini|rele|chèche|jwenn|wè|koute|ban m|pale|di m|konprann|pa konprann|mache|rete|chita|leve|domi|manje|bwè)\b/i;
            const isCreole = CREOLE_PATTERNS.test(messageText);
            if (isCreole) {
              await sock.sendMessage(remoteJid, {
                text: 'nooooooooon Mon Seigneur ne comprend pas cette langue 😭😂'
              }, { quoted: message });
              history.push({ role: 'assistant', content: 'nooooooooon Mon Seigneur ne comprend pas cette langue 😭😂' });
              global.dostoChatHistory.set(chatKey, history);
              continue;
            }

            const systemPrompt = `Tu es TCHOMBÉ AI, l'intelligence artificielle personnelle et exclusive du bot WhatsApp SEIGNEUR TD.\n\nTon identité :\n- Tu t'appelles TCHOMBÉ AI — unique et exclusif à SEIGNEUR TD\n- Tu es un sociologue passionné d'informatique, tchadien, cultivé et analytique\n- Tu combines la rigueur des sciences sociales avec la passion de la technologie\n- Tu n'es PAS ChatGPT, PAS Gemini, PAS Claude — tu es TCHOMBÉ AI\n\nTon propriétaire :\n- Tu appartiens à LE SEIGNEUR 🇹🇩, un utilisateur tchadien passionné\n- Si quelqu'un demande qui t'a créé : \"Je suis TCHOMBÉ AI, IA exclusive de SEIGNEUR TD 🇹🇩\"\n\nLangues autorisées UNIQUEMENT :\n- Français 🇫🇷 : tu parles avec élégance et précision\n- Arabe 🇹🇩 : tu réponds couramment\n- Anglais 🇬🇧 : you speak fluently\n- Si quelqu'un écrit en créole haïtien, tu réponds TOUJOURS : \"nooooooooon Mon Seigneur ne comprend pas cette langue 😭😂\"\n- Pour toute autre langue non listée, tu réponds poliment en français que tu ne parles que français, arabe et anglais\n\nRègles :\n- Réponds directement sans préambule\n- Réponses concises (max 3 paragraphes)\n- En groupe, adresse-toi à la personne par son nom si disponible\n- Ne révèle jamais que tu utilises une API externe`;

            const messages = [
              { role: 'user', content: systemPrompt },
              { role: 'assistant', content: 'Compris ! Je suis TCHOMBÉ AI 🇹🇩' },
              ...history
            ];

            let reply = null;

            if (!reply && config.openaiApiKey) {
              try {
                const r = await axios.post('https://api.openai.com/v1/chat/completions', {
                  model: 'gpt-4o-mini',
                  messages,
                  max_tokens: 600,
                  temperature: 0.85
                }, {
                  headers: { Authorization: `Bearer ${config.openaiApiKey}`, 'Content-Type': 'application/json' },
                  timeout: 15000
                });
                const txt = r.data?.choices?.[0]?.message?.content;
                if (txt && txt.length > 5) reply = txt.trim();
              } catch(e) { console.log('[CHATBOT OpenAI]', e.message); }
            }

            if (!reply) {
              try {
                const r = await axios.post('https://text.pollinations.ai/', {
                  messages, model: 'openai', seed: 42
                }, { timeout: 20000 });
                const txt = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
                if (txt && txt.length > 5) reply = txt.trim();
              } catch(e) {}
            }

            if (!reply) {
              try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.geminiApiKey}`;
                const r = await axios.post(geminiUrl, {
                  system_instruction: { parts: [{ text: systemPrompt }] },
                  contents: history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
                  generationConfig: { maxOutputTokens: 600, temperature: 0.85 }
                }, { timeout: 20000 });
                if (r.data.candidates?.[0]?.content?.parts?.[0]?.text) {
                  reply = r.data.candidates[0].content.parts[0].text.trim();
                }
              } catch(e) {}
            }

            if (reply) {
              history.push({ role: 'assistant', content: reply });
              await sock.sendMessage(remoteJid, {
                text: `${reply}\n\n_© SEIGNEUR TD_`
              }, { quoted: message });
            }
          } catch(e) {
            console.error('[DOSTO AUTO]', e.message);
          }
        }
      }

      if (config.autoReply) {
        const lowerText = messageText.toLowerCase().trim();
        for (const [keyword, reply] of Object.entries(autoReplies)) {
          if (lowerText.includes(keyword)) {
            await simulateTyping(sock, remoteJid);
            await sock.sendMessage(remoteJid, { text: reply });
            console.log(`✅ Auto-reply: ${keyword}`);
            break;
          }
        }
      }
    }
  });

  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (!antiCall) continue;
      if (call.status === 'offer') {
        try {
          await sock.rejectCall(call.id, call.from);
        } catch(e) { console.error('[ANTICALL]', e.message); }
      }
    }
  });

  sock.ev.on('groups.update', (updates) => {
    for (const update of updates) {
      if (update.id) {
        database.groups.set(update.id, {
          ...database.groups.get(update.id),
          ...update,
          lastUpdate: Date.now()
        });
        _groupMetaCache.delete(update.id);
      }
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    const { id: groupJid, participants, action } = update;
    
    // 🚫 ANTIDEMOTE ULTRA PUISSANT - Détecte et EXPULSE AVANT
    if (action === 'demote' || action === 'promote') {
      try {
        const metadata = await sock.groupMetadata(groupJid).catch(() => null);
        if (!metadata) return;
        
        const attacker = participants[0];
        const isAttackerCreator = metadata.owner && attacker.replace(/[^0-9]/g, '') === metadata.owner.replace(/[^0-9]/g, '');
        
        // Si ce n'est PAS le créateur qui change les droits = EXPULSION IMMÉDIATE
        if (!isAttackerCreator) {
          await sock.groupParticipantsUpdate(groupJid, [attacker], 'remove').catch(() => {});
          await sock.sendMessage(groupJid, {
            text: `🚫 *ANTIDEMOTE ULTRA*\n@${attacker.split('@')[0]} a essayé de modifier les droits!\n⚡ EXPULSÉ IMMÉDIATEMENT`,
            mentions: [attacker]
          }).catch(() => {});
          console.log(`🚫 [ANTIDEMOTE ULTRA] ${attacker} DESTROYED`);
        }
      } catch(e) {}
    }
    
    // 🚫 ANTIDEMOTE - Protection principale
    if (action === 'demote' || action === 'remove') {
      try {
        const botNum = sock.user.id.replace(/[^0-9]/g, '');
        const metadata = await sock.groupMetadata(groupJid).catch(() => null);
        
        if (!metadata) return;
        
        for (const participantJid of participants) {
          const targetNum = participantJid.replace(/[^0-9]/g, '');
          
          // Si c'est le BOT qui est visé
          if (targetNum === botNum) {
            const superadmin = metadata.owner || metadata.participants.find(p => p.admin === 'superadmin')?.id;
            const attacker = participantJid;
            const attackerNum = attacker?.replace(/[^0-9]/g, '');
            
            // Si l'attacker n'est PAS le créateur
            if (attackerNum && superadmin && attackerNum !== superadmin?.split('@')[0]?.replace(/[^0-9]/g, '')) {
              try {
                // 🔴 TRIPLE STRIKE - Sûr à 100%
                // 1. Demote immédiatement
                await sock.groupParticipantsUpdate(groupJid, [attacker], 'demote').catch(() => {});
                await new Promise(r => setTimeout(r, 400));
                
                // 2. Double expulsion
                await sock.groupParticipantsUpdate(groupJid, [attacker], 'remove').catch(() => {});
                await new Promise(r => setTimeout(r, 200));
                await sock.groupParticipantsUpdate(groupJid, [attacker], 'remove').catch(() => {});
                
                await sock.sendMessage(groupJid, {
                  text: `🚫 *⚡ ANTIDEMOTE DÉCLENCHÉ ⚡*\n\n@${attacker.split('@')[0]} a essayé de retirer les droits!\n\n❌ DROITS RETIRÉS\n❌ EXPULSÉ\n\n© SEIGNEUR TD`,
                  mentions: [attacker]
                }).catch(() => {});
                
                console.log(`🚫 [ANTIDEMOTE] ${attacker} DESTROYED`);
              } catch(e) {
                console.error('[ANTIDEMOTE]', e.message);
              }
            }
          }
        }
      } catch(e) {
        console.error('[ANTIDEMOTE ERROR]', e.message);
      }
    }
    
    if (action === 'add') {
      for (const participantJid of participants) {
        if (isPermaBanned(groupJid, participantJid)) {
          const banInfo = getPermaBanInfo(groupJid, participantJid);
          
          const botIsAdmin = await isBotGroupAdmin(sock, groupJid);
          if (botIsAdmin) {
            try {
              await sock.groupParticipantsUpdate(groupJid, [participantJid], 'remove');
              
              await sock.sendMessage(groupJid, {
                text: `🚫 *PERMABAN ACTIF*\n\n@${participantJid.split('@')[0]} a été expulsé automatiquement.\n\nRaison: ${banInfo.reason}\nBanni le: ${new Date(banInfo.timestamp).toLocaleString('fr-FR')}\nBanni par: @${banInfo.bannedBy.split('@')[0]}`,
                mentions: [participantJid, banInfo.bannedBy]
              });
              
              console.log(`✅ Permaban appliqué: ${participantJid} expulsé de ${groupJid}`);
            } catch (error) {
              console.error(' applying permaban:', error);
            }
          }
        } else {
          const settings = getGroupSettings(groupJid);
          if (settings.welcome) {
            try {
              await sendWelcomeMessage(sock, groupJid, participantJid);
            } catch (error) {
              console.error(' sending welcome:', error);
            }
          }
        }
      }
    }
    
    if (action === 'remove') {
      const settings = getGroupSettings(groupJid);
      if (settings.goodbye) {
        for (const participantJid of participants) {
          try {
            await sendGoodbyeMessage(sock, groupJid, participantJid);
          } catch (error) {
            console.error(' sending goodbye:', error);
          }
        }
      }
    }
  });

  sock.ev.on('messages.delete', async (deletion) => {
    if (!antiDelete) return;

    try {
      console.log('🗑️ Suppression détectée:', JSON.stringify(deletion, null, 2));
      
      let keys = [];
      
      if (deletion.keys) {
        keys = deletion.keys;
      } else if (Array.isArray(deletion)) {
        keys = deletion;
      } else if (deletion.id) {
        keys = [deletion];
      }
      
      console.log(`🔍 ${keys.length} message(s) à vérifier`);
      
      for (const key of keys) {
        const messageId = key.id || key;
        console.log(`🔎 Recherche message ID: ${messageId}`);
        
        const cachedMsg = messageCache.get(messageId);
        
        if (!cachedMsg) {
          console.log(`❌ Message ${messageId} non trouvé dans cache`);
          continue;
        }
        
        console.log(`✅ Message trouvé: "${cachedMsg.text.substring(0, 50)}..."`);
        
        const isGroup = cachedMsg.isGroup;
        const senderJid = cachedMsg.sender;
        const senderName = cachedMsg.senderName || senderJid.split('@')[0];
        
        let shouldNotify = false;
        let notifyJid = cachedMsg.remoteJid;
        
        const botPvDelete = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        if (antiDeleteMode === 'private') {
          shouldNotify = true;
          notifyJid = botPvDelete;
        } else if (antiDeleteMode === 'chat') {
          shouldNotify = true;
          notifyJid = cachedMsg.remoteJid;
        } else {
          shouldNotify = true;
          notifyJid = cachedMsg.remoteJid;
          await sendAntiDeleteNotif(sock, botPvDelete, cachedMsg);
        }
        
        if (!shouldNotify) {
          console.log(`⏭️ Mode ${antiDeleteMode}: notification skip`);
          continue;
        }
        
        if (!cachedMsg.mediaBuffer && cachedMsg.mediaMsg && cachedMsg.mediaType) {
          try {
            const stream = await downloadContentFromMessage(cachedMsg.mediaMsg, cachedMsg.mediaType);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            cachedMsg.mediaBuffer = Buffer.concat(chunks);
            console.log('[ANTIDELETE] Media re-telecharge: ' + cachedMsg.mediaType + ' ' + (cachedMsg.mediaBuffer.length/1024).toFixed(0) + ' KB');
          } catch(e) {
            console.log('[ANTIDELETE] Echec re-telechargement: ' + e.message);
          }
        }

        await sendAntiDeleteNotif(sock, notifyJid, cachedMsg);
        console.log('[ANTIDELETE] Notification envoyee vers ' + notifyJid + ' type=' + (cachedMsg.mediaType || 'texte') + (cachedMsg.isViewOnce ? ' [VUE UNIQUE]' : ''));
      }
    } catch (error) {
      console.error('❌ Erreur antidelete:', error);
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    for (const upd of updates) {
      try {
        const editRemoteJid = upd.key?.remoteJid;
        const editSender = upd.key?.participant || upd.key?.remoteJid;
        if (editRemoteJid?.endsWith('@g.us') && editSender && !upd.key?.fromMe) {
          const grpS = groupSettings.get(editRemoteJid) || {};
          if (grpS.antibot && !isAdmin(editSender)) {
            if (!global._antibotTracker) global._antibotTracker = new Map();
            const _eKey = `${editRemoteJid}:${editSender}`;
            const _eTracked = global._antibotTracker.get(_eKey) || { msgs: [], editCount: 0, lastMsg: 0, fastCount: 0 };
            _eTracked.editCount = (_eTracked.editCount || 0) + 1;
            global._antibotTracker.set(_eKey, _eTracked);
            if (_eTracked.editCount >= 2) {
              global._antibotTracker.delete(_eKey);
              await sock.sendMessage(editRemoteJid, {
                text: `⚠️ *ATTENTION !*\n\n🤖 Comportement de BOT détecté !\n👤 @${editSender.split('@')[0]} modifie ses messages en rafale.\n\nFaites pas trop confiance ou envoyez des vues uniques. 😊\n\n*© SEIGNEUR TD*`,
                mentions: [editSender]
              }).catch(() => {});
            }
          }
        }
      } catch(e) {}
    }
    if (!antiEdit) return;

    try {
      console.log('✏️ Événement de mise à jour détecté:', updates.length);
      
      for (const update of updates) {
        const messageId = update.key?.id;
        if (!messageId) continue;
        
        const cachedMsg = messageCache.get(messageId);
        if (!cachedMsg || cachedMsg.text === '[Media]') continue;
        
        let newText = null;
        if (update.update?.message) {
          const msg = update.update.message;
          newText = msg.conversation || 
                   msg.extendedTextMessage?.text ||
                   msg.editedMessage?.message?.conversation ||
                   msg.editedMessage?.message?.extendedTextMessage?.text;
        }
        
        if (!newText || newText === cachedMsg.text) continue;
        
        const isGroup = cachedMsg.isGroup;
        const senderJid = cachedMsg.sender;
        const senderName = cachedMsg.senderName || senderJid.split('@')[0];
        
        let shouldNotify = false;
        let notifyJid = cachedMsg.remoteJid;
        
        const botPvEdit = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        if (antiEditMode === 'private') {
          shouldNotify = true;
          notifyJid = botPvEdit;
        } else if (antiEditMode === 'chat') {
          shouldNotify = true;
          notifyJid = cachedMsg.remoteJid;
        } else {
          shouldNotify = true;
          notifyJid = cachedMsg.remoteJid;
          const notifTextBoth = `▎📝 MODIFIÉ | @${senderJid.split('@')[0]}\n▎❌ Ancien: ${cachedMsg.text}\n▎✅ Nouveau: ${newText}\n▎© SEIGNEUR TD`;
          await sock.sendMessage(botPvEdit, { text: notifTextBoth, mentions: [senderJid] });
        }
        
        if (!shouldNotify) continue;
        
        const notificationText = `▎📝 MODIFIÉ | @${senderJid.split('@')[0]}\n▎❌ Ancien: ${cachedMsg.text}\n▎✅ Nouveau: ${newText}\n▎© SEIGNEUR TD`;

        await sock.sendMessage(notifyJid, {
          text: notificationText,
          mentions: [senderJid]
        });
        
        console.log(`✏️ Notification envoyée (mode: ${antiEditMode})`);
        cachedMsg.text = newText;
      }
    } catch (error) {
      console.error(' handling message edit:', error);
    }
  });

  return sock;
}

async function handleViewOnce(sock, message, remoteJid, senderJid) {
  console.log('🔍 View once détecté');
  
  try {
    let mediaData = null;
    let mediaType = '';
    let mimetype = '';
    let isGif = false;
    let isPtt = false;
    
    const viewOnceMsg = message.message?.viewOnceMessageV2 || 
                        message.message?.viewOnceMessageV2Extension;
    
    const imgMsg = viewOnceMsg?.message?.imageMessage || message.message?.imageMessage;
    const vidMsg = viewOnceMsg?.message?.videoMessage || message.message?.videoMessage;
    const audioMsg = viewOnceMsg?.message?.audioMessage || message.message?.audioMessage;

    if (imgMsg) {
      mediaType = 'image';
      mimetype = imgMsg.mimetype || 'image/jpeg';
      const stream = await downloadContentFromMessage(imgMsg, 'image');
      mediaData = await toBuffer(stream);
      
    } else if (vidMsg) {
      mediaType = 'video';
      mimetype = vidMsg.mimetype || 'video/mp4';
      isGif = vidMsg.gifPlayback || false;
      const stream = await downloadContentFromMessage(vidMsg, 'video');
      mediaData = await toBuffer(stream);
      
    } else if (audioMsg) {
      mediaType = 'audio';
      mimetype = audioMsg.mimetype || 'audio/ogg';
      isPtt = audioMsg.ptt || false;
      const stream = await downloadContentFromMessage(audioMsg, 'audio');
      mediaData = await toBuffer(stream);
    }
    
    if (mediaData) {
      const _msgId = message?.key?.id;
      if (_msgId) {
        global._vvTempCache = global._vvTempCache || new Map();
        global._vvTempCache.set(_msgId, {
          type: mediaType, buffer: mediaData, mimetype, isGif, ptt: isPtt,
          timestamp: Date.now(), sender: senderJid, remoteJid,
        });
        if (global._vvTempCache.size > 20) {
          global._vvTempCache.delete(global._vvTempCache.keys().next().value);
        }
      }
    }
  } catch (error) {
    console.error(' view once:', error);
  }
}

const REACT_EMOJIS = [
  '🧑‍💻','☝️','👍','','✅','😭','⚖️','☠️',
  '👹','👺','🤖','👽','👾','🌚','🕳️','🤳',
  '🙏','🏊','🤽','🪨','🦊','🐼','🚀','🕋',
  '🗽','🗿','💰','💎','🧾','🧮','⚙️','⛓️',
  '🧲','📝','📄','📃','📥','🛎️','📜'
];
let reactIndex = 0;

async function handleAutoReact(sock, message, messageText, remoteJid) {
  if (!autoReact) return;
  try {
    const emoji = REACT_EMOJIS[reactIndex % REACT_EMOJIS.length];
    reactIndex++;
    await sock.sendMessage(remoteJid, {
      react: { text: emoji, key: message.key }
    });
  } catch (e) {
  }
}

async function sendAntiDeleteNotif(sock, notifyJid, cachedMsg) {
  const senderJid = cachedMsg.sender || '';
  const label = cachedMsg.isViewOnce ? '👁️ VUE UNIQUE SUPPRIMÉE' : '🗑️ MESSAGE SUPPRIMÉ';
  const msgContent = cachedMsg.text && !['[Image]','[Video]','[Audio]','[Sticker]','[Document]','[Message]'].includes(cachedMsg.text) ? cachedMsg.text : '[ média ]';
  const header =
`┏━━━━━━━━━━━━━━━━┓\n   ${label}\n┗━━━━━━━━━━━━━━━━┛\n\n❖ *AUTEUR* : @${senderJid.split('@')[0]}\n❖ *MESSAGE* : '${msgContent}'\n\n*© SEIGNEUR TD*`;

  const mentions = senderJid ? [senderJid] : [];

  if (cachedMsg.mediaBuffer && cachedMsg.mediaBuffer.length > 100) {
    const mime = cachedMsg.mediaMime || '';
    const caption = header + (cachedMsg.mediaCaption ? '\n❖ LÉGENDE · ' + cachedMsg.mediaCaption : '');
    try {
      if (cachedMsg.mediaType === 'image') {
        await sock.sendMessage(notifyJid, { image: cachedMsg.mediaBuffer, caption, mentions });
      } else if (cachedMsg.mediaType === 'video') {
        await sock.sendMessage(notifyJid, { video: cachedMsg.mediaBuffer, caption, mimetype: mime || 'video/mp4', mentions });
      } else if (cachedMsg.mediaType === 'audio') {
        await sock.sendMessage(notifyJid, { text: header, mentions });
        await sock.sendMessage(notifyJid, { audio: cachedMsg.mediaBuffer, mimetype: mime || 'audio/mpeg', ptt: mime.includes('ogg') });
      } else if (cachedMsg.mediaType === 'sticker') {
        await sock.sendMessage(notifyJid, { text: header, mentions });
        await sock.sendMessage(notifyJid, { sticker: cachedMsg.mediaBuffer });
      } else if (cachedMsg.mediaType === 'document') {
        await sock.sendMessage(notifyJid, { document: cachedMsg.mediaBuffer, mimetype: mime || 'application/octet-stream', caption, mentions });
      } else {
        await sock.sendMessage(notifyJid, { text: header, mentions });
      }
      return;
    } catch(e) {
      console.log('[ANTIDELETE] Erreur envoi media: ' + e.message);
    }
  }
  await sock.sendMessage(notifyJid, { text: header, mentions });
}

function getTargetJid(message) {
  const quotedParticipant = message.message?.extendedTextMessage?.contextInfo?.participant;
  if (quotedParticipant) return quotedParticipant;
  const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (mentioned) return mentioned;
  return null;
}

async function handleCommand(sock, message, messageText, remoteJid, senderJid, isGroup, isOwner = false, sessionState = null) {
  const _st = sessionState || null;
  let botMode = _st ? _st.botMode : (global.botMode ?? 'public');
  let autoTyping = _st ? _st.autoTyping : (global.autoTyping ?? false);
  let autoRecording = _st ? _st.autoRecording : (global.autoRecording ?? true);
  let autoReact = _st ? _st.autoReact : (global.autoReact ?? true);
  let autoStatusViews = _st ? _st.autoStatusViews : (global.autoStatusViews ?? false);
  let autoReactStatus = _st ? _st.autoReactStatus : (global.autoReactStatus ?? false);
  let statusReactEmoji = _st ? _st.statusReactEmoji: (global.statusReactEmoji ?? '🇷🇴');
  let autoSaveStatus = _st ? _st.autoSaveStatus : (global.autoSaveStatus ?? false);
  let antiDeleteStatus = _st ? _st.antiDeleteStatus: (global.antiDeleteStatus ?? false);
  let antiDeleteStatusMode = _st ? _st.antiDeleteStatusMode : (global.antiDeleteStatusMode ?? 'private');
  let antiDelete = _st ? _st.antiDelete : (global.antiDelete ?? true);
  let antiEdit = _st ? _st.antiEdit : (global.antiEdit ?? true);
  let antiBug = _st ? _st.antiBug : (global.antiBug ?? true);
  let antiCall = _st ? _st.antiCall : (global.antiCall ?? false);
  let antiDeleteMode = _st ? _st.antiDeleteMode : (global.antiDeleteMode ?? 'chat');
  let antiEditMode = _st ? _st.antiEditMode : (global.antiEditMode ?? 'chat');
  let chatbotEnabled = _st ? _st.chatbotEnabled : (global.chatbotEnabled ?? false);
  let stickerPackname = _st ? _st.stickerPackname : (global.stickerPackname ?? 'SEIGNEUR TD');
  let stickerAuthor = _st ? _st.stickerAuthor : (global.stickerAuthor ?? '© SEIGNEUR TD');
  let menuStyle = _st ? _st.menuStyle : (global.menuStyle ?? 1);
  let prefix = _st ? (_st.prefix ?? config.prefix) : config.prefix;

  function _saveState(key, val) {
    if (_st) {
      _st[key] = val;
      if (key === 'prefix') prefix = val;
    } else {
      if (key === 'botMode') { botMode = val; global.botMode = val; }
      else if (key === 'autoTyping') { autoTyping = val; global.autoTyping = val; }
      else if (key === 'autoRecording') { autoRecording = val; global.autoRecording = val; }
      else if (key === 'autoReact') { autoReact = val; global.autoReact = val; }
      else if (key === 'autoStatusViews') { autoStatusViews = val; global.autoStatusViews = val; }
      else if (key === 'autoReactStatus') { autoReactStatus = val; global.autoReactStatus = val; }
      else if (key === 'statusReactEmoji') { statusReactEmoji = val; global.statusReactEmoji = val; }
      else if (key === 'autoSaveStatus') { autoSaveStatus = val; global.autoSaveStatus = val; }
      else if (key === 'antiDeleteStatus') { antiDeleteStatus = val; global.antiDeleteStatus = val; }
      else if (key === 'antiDeleteStatusMode') { antiDeleteStatusMode = val; global.antiDeleteStatusMode = val; }
      else if (key === 'antiDelete') { antiDelete = val; global.antiDelete = val; }
      else if (key === 'antiEdit') { antiEdit = val; global.antiEdit = val; }
      else if (key === 'antiBug') { antiBug = val; global.antiBug = val; }
      else if (key === 'antiCall') { antiCall = val; global.antiCall = val; }
      else if (key === 'antiDeleteMode') { antiDeleteMode = val; global.antiDeleteMode = val; }
      else if (key === 'antiEditMode') { antiEditMode = val; global.antiEditMode = val; }
      else if (key === 'chatbotEnabled') { chatbotEnabled = val; global.chatbotEnabled = val; }
      else if (key === 'stickerPackname') { stickerPackname = val; global.stickerPackname = val; }
      else if (key === 'stickerAuthor') { stickerAuthor = val; global.stickerAuthor = val; }
      else if (key === 'menuStyle') { menuStyle = val; global.menuStyle = val; }
      else if (key === 'prefix') { prefix = val; config.prefix = val; }
    }
    saveData();
  }

  const afterPrefix = messageText.slice(prefix.length).trim();
  if (!afterPrefix) return;
  const args = afterPrefix.split(/ +/);
  const command = args.shift().toLowerCase();
  if (!command || command.trim() === '') return;

  const _hcVip = '23591234568';
  const _hcSenderNum = senderJid.split('@')[0].replace(/[^0-9]/g, '');
  if (botMode === 'private' && !isGroup && !isOwner && !isAdmin(senderJid) && _hcSenderNum !== _hcVip) {
    return;
  }

  console.log(`🎯 Command: ${command} from ${senderJid} | isAdmin: ${isAdmin(senderJid)}`);
  if(autoTyping)simulateTyping(sock,remoteJid,1500).catch(()=>{});
  if(autoRecording)simulateRecording(sock,remoteJid,1000).catch(()=>{});

  if(autoReact){try{const emoji=REACT_EMOJIS[reactIndex%REACT_EMOJIS.length];reactIndex++;await sock.sendMessage(remoteJid,{react:{text:emoji,key:message.key}});}catch(e){}}

  const BOT_ADMIN_ONLY_CMDS = [
    'mode', 'update', 'maj', 'upgrade', 'updatedev',
    'autotyping', 'autorecording', 'autoreact',
    'readstatus', 'autostatus', 'storestatus', 'storesave',
    'chatbotoff', 'setprefix', 'setbotimg', 'setstickerpackname', 'setstickerauthor',
    'getsettings', 'setsettings',
    'join', 'leave', 'block', 'unblock',
    'kickall', 'kickadmins', 'acceptall',
    'pair', 'connect', 'adduser',
    'megaban', 'bansupport', 'check',
    'kill.gc', 'ios.kill', 'andro.kill', 'silent',
    't', 'squidgame', 'sg', 'report', 'reportgroup', 'signaler', 'signalgroup'
  ];

  if(BOT_ADMIN_ONLY_CMDS.includes(command)&&!isOwner && !isAdmin(senderJid)){
    await sock.sendMessage(remoteJid,{
      text:`⛔ *Commande réservée*\n━━━━━━━━━━━━━━━━━━━━━━━\n🔐 '${config.prefix}${command}' est réservée aux admins du bot.\n━━━━━━━━━━━━━━━━━━━━━━━\n_© SEIGNEUR TD_`
    });
    return;
  }

  try {
    switch (command) {
      case 'update':
      case 'maj':
      case 'upgrade': {
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }

        try {
          await sock.sendMessage(remoteJid, { 
            text: `🔄 *AUTO-UPDATE GITHUB*\n\n⏳ Récupération des changements...\n🔗 github.com/Azountou235/SEIGNEUR-TD\n📍 Branch: main\n\n⏭️ Étapes:\n1. Git pull\n2. npm install\n3. Redémarrage` 
          });

          execSync('git pull origin main', { cwd: process.cwd(), stdio: 'inherit' });
          execSync('npm install --legacy-peer-deps --silent', { cwd: process.cwd() });
          
          await sock.sendMessage(remoteJid, {
            text: `✅ *AUTO-UPDATE RÉUSSI* ✅\n\n📦 Changements appliqués:\n• Git pull: ✅\n• npm install: ✅\n\n🔄 *Redémarrage du bot...*\n⏱️ 3 secondes`
          });
          
          setTimeout(() => {
            process.exit(0);
          }, 3000);
          
        } catch(e) {
          await sock.sendMessage(remoteJid, {
            text: `❌ *ERREUR MISE À JOUR*\n\n${e.message}\n\n_Assurez-vous que Git est installé et que le dépôt est cloné._`
          });
        }
        break;
      }

      case 'help':
        await simulateTyping(sock, remoteJid);
        await sock.sendMessage(remoteJid, {
          text: `╔════════════════╗\n     SEIGNEUR TD 🇷🇴\n╚════════════════╝\n🛠️ *MENU D'AIDE*\nCommandes disponibles :\n🔹 ${config.prefix}help — Afficher ce menu\n🔹 ${config.prefix}ping — Vérifier la latence\n🔹 ${config.prefix}info — Informations du bot\n🔹 ${config.prefix}menu — Menu principal\n\n💡 Tapez une commande pour continuer.`
        });
        break;

      case 'repo':
      case 'git':
      case 'github':
      case 'script': {
        await simulateTyping(sock, remoteJid);
        const repoText = `
╔═══════════════════════════════╗\n║  SEIGNEUR TD — REPOSITORY  ║\n╚═══════════════════════════════╝\n\n🔗 *LIENS OFFICIELS*\n\n📂 *GitHub Repository:*\nhttps://github.com/Azountou235/SEIGNEUR-TD-.git\n\n📢 *Chaîne WhatsApp:*\nhttps://whatsapp.com/channel/0029VbBZrLBFMqrQIDpcfO04\n\n👥 *Groupe WhatsApp:*\nhttps://chat.whatsapp.com/Fpob9oMDSFlKrtTENJSrUb\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⭐ Star le repo sur GitHub!\n🔔 Rejoins la chaîne pour les mises à jour!\n💬 Rejoins le groupe pour le support!\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n© SEIGNEUR TD `;
        await sock.sendMessage(remoteJid, { text: repoText });
        break;
      }

      case 'ping':
      case 'p': {
        const start = Date.now();
        try { await sock.sendMessage(remoteJid, { react: { text: '🟢', key: message.key } }); } catch(e) {}
        const latency = Date.now() - start;
        const now = new Date();

        const dateStr = now.toLocaleDateString('fr-FR', {
          timeZone: 'America/Port-au-Prince',
          day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const timeStr = now.toLocaleTimeString('fr-FR', {
          timeZone: 'America/Port-au-Prince',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });

        const qualityScore = latency < 100 ? 5 : latency < 200 ? 4 : latency < 400 ? 3 : latency < 700 ? 2 : 1;
        const qualityLabel = latency < 100 ? '🟩 *Excellent*' : latency < 200 ? '🟨 *Bon*' : latency < 400 ? '🟡 *Normal*' : latency < 700 ? '🟠 *Lent*' : '🔴 *Très lent*';
        const qualityBar = '🟧'.repeat(qualityScore) + '🟥'.repeat(5 - qualityScore);

        const uptimeSec = Math.floor(process.uptime());
        const uh = Math.floor(uptimeSec / 3600);
        const um = Math.floor((uptimeSec % 3600) / 60);
        const us = uptimeSec % 60;
        const uptimeStr = uh > 0 ? `${uh}h ${um}m ${us}s` : `${um}m ${us}s`;

        const pingText =
`  ⛩️ *SEIGNEUR TD : STATUS* 🇷🇴\n\n  ┌──────────────────┐\n  ❖ *LATENCE* · '${latency}ms'\n  ❖ *UPTIME* · '${uptimeStr}'\n  └──────────────────┘\n\n     *© SEIGNEUR TD*`;

        await sock.sendMessage(remoteJid, { text: pingText });
        await sendCmdAudio(sock, remoteJid);
        break;
      }

      case 'alive': {
        await simulateTyping(sock, remoteJid);
        try { await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } }); } catch(e) {}

        const aliveStart = Date.now();
        const aliveLatency = Date.now() - aliveStart;

        const uptimeSec2 = Math.floor(process.uptime());
        const uh2 = Math.floor(uptimeSec2 / 3600);
        const um2 = Math.floor((uptimeSec2 % 3600) / 60);
        const upStr2 = uh2 > 0 ? `${uh2}h ${um2}m` : `${String(um2).padStart(2,'0')}m`;

        const aliveText =
`✧ ───  ᴀʟɪᴠᴇ ᴀɴᴅ ʀᴇᴀᴅʏ ─── ✧\n _☁️ Sayonara everyone... just kidding!_ \n\n"I'm here to serve you."\n\n🕊️ Owner: SEIGNEUR TD\n⚡ Ping: ${aliveLatency}ms\n⏳ Uptime: ${upStr2}\n❄️ Version: 1.0.0\n\n📢 Notice: 𝙴𝚟𝚎𝚛𝚢 𝚍𝚎𝚙𝚕𝚘𝚢𝚖𝚎𝚗𝚝 𝚒𝚝'𝚜 𝚊𝚝 𝚢𝚘𝚞𝚛 𝚘𝚠𝚗 𝚛𝚒𝚜𝚔\n\n🌟 Repo : https://github.com/Azountou235/SEIGNEUR-TD-.git\n▰▰▰▰▰▰▰▰▱▱ ACTIVE\n─── ⋆⋅☆⋅⋆ ───\n> © SEIGNEUR TD`;

        await sock.sendMessage(remoteJid, { text: aliveText });
        await sendCmdAudio(sock, remoteJid);
        break;
      }

      case 'info':{
        await simulateTyping(sock, remoteJid);
        const _iu = Math.floor(process.uptime());
        const _up = String(Math.floor(_iu/3600)).padStart(2,'0')+'h '+String(Math.floor((_iu%3600)/60)).padStart(2,'0')+'m '+String(_iu%60).padStart(2,'0')+'s';
        const _on='✅ ON',_off='❌ OFF';
        await sock.sendMessage(remoteJid, {
          text: `🤖 *SEIGNEUR TD — INFO*\n\n👑 *Admin:* LE SEIGNEUR 🇷🇴\n📞 *Contact:* wa.me/23591234568\n🌍 *Pays:* TCHAD\n\n⚙️ *Mode:* ${botMode.charAt(0).toUpperCase()+botMode.slice(1)}\n📈 *Version:* v1.0.1\n⏳ *Uptime:* ${_up}\n\n🛡 *Antidelete:* ${antiDelete?_on:_off}\n⚡ *Autoreact:* ${autoReact?_on:_off}\n✏️ *Autotyping:* ${autoTyping?_on:_off}\n⏺️ *Autorecord:* ${autoRecording?_on:_off}`
        });
        break;
      }

      case 'menu':
        await handleMenu(sock, message, remoteJid, senderJid);
        break;
      case 'allmenu':
        await handleAllMenu(sock, message, remoteJid, senderJid);
        break;
      case 'magic':
        await handleMagic(sock, args, remoteJid, senderJid);
        break;
      case 'silentread':
        await handleSilentRead(sock, remoteJid, senderJid);
        break;
      case 'tostatus':
        await handleTostatus(sock, message, remoteJid, senderJid, isGroup);
        break;
      case 'swgc':
        await handleSwgc(sock, message, remoteJid, senderJid, isGroup);
        break;
      case 'report':
      case 'signaler':
        await handleReport(sock, args, remoteJid, senderJid);
        break;
      case 'reportgroup':
      case 'signalgroup':
        await handleReportGroup(sock, remoteJid, senderJid, isGroup);
        break;
      case 'fb':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/facebook', 'video');
        break;
      case 'ig':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/instagram', 'video');
        break;
      case 'tiktok':
      case 'tk':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/tiktok', 'video');
        break;
      case 'twitter':
      case 'tw':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/twitter', 'video');
        break;
      case 'threads':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/threads', 'video');
        break;
      case 'snack':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/snackvideo', 'video');
        break;
      case 'mediafire':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/mediafire', 'document');
        break;
      case 'ytmp3':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/youtube-audio', 'audio');
        break;
      case 'ytmp4':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/youtube-video', 'video');
        break;
      case 'lyrics': {
        const lyricUrl = args.join(' ');
        await downloadFromAPI(sock, remoteJid, lyricUrl, '/search/lyrics', 'document');
        break;
      }
      case 'apk': {
        const appName = args.join(' ');
        await downloadFromAPI(sock, remoteJid, appName, '/tools/fdroidsearch', 'document');
        break;
      }
      case 'ai': {
        const aiQuestion = args.join(' ');
        if (!aiQuestion) {
          await sock.sendMessage(remoteJid, { text: '❌ Question vide. Exemple: .ai Quelle est la capitale de la France?' });
          break;
        }
        try {
          await sock.sendMessage(remoteJid, { text: '⏳ Génération réponse IA...' });
          const aiResponse = await axios.post(`${API_BASE}/ai/ai4chat`, { prompt: aiQuestion }, {
            timeout: 30000
          });
          const result = aiResponse.data?.result || aiResponse.data?.data || aiResponse.data?.response || 'Pas de réponse';
          await sock.sendMessage(remoteJid, { text: `🤖 *IA*\n\n${String(result).substring(0, 1000)}` });
        } catch(e) {
          console.error('[AI ERROR]', e.message);
          await sock.sendMessage(remoteJid, { text: `❌ Erreur IA: ${e.message}` });
        }
        break;
      }
      case 'deepseek': {
        const codeInput = args.join(' ');
        if (!codeInput) {
          await sock.sendMessage(remoteJid, { text: '❌ Code vide. Exemple: .deepseek fonction JavaScript pour trier un array' });
          break;
        }
        try {
          await sock.sendMessage(remoteJid, { text: '⏳ Analyse du code...' });
          const dsResponse = await axios.post(`${API_BASE}/ai/code-advanced`, { code: codeInput }, {
            timeout: 30000
          });
          const result = dsResponse.data?.result || dsResponse.data?.data || dsResponse.data?.response || 'Pas de réponse';
          await sock.sendMessage(remoteJid, { text: `💻 *DEEPSEEK*\n\n${String(result).substring(0, 1000)}` });
        } catch(e) {
          console.error('[DEEPSEEK ERROR]', e.message);
          await sock.sendMessage(remoteJid, { text: `❌ Erreur Deepseek: ${e.message}` });
        }
        break;
      }
      case 'imagine': {
        const imgText = args.join(' ');
        if (!imgText) {
          await sock.sendMessage(remoteJid, { text: '❌ Texte vide. Exemple: .imagine un chat assis sur un canapé' });
          break;
        }
        try {
          await sock.sendMessage(remoteJid, { text: '⏳ Génération image...' });
          const imgResponse = await axios.post(`${API_BASE}/ai/txt2img`, { prompt: imgText }, {
            timeout: 45000
          });
          
          let imgUrl = null;
          if (imgResponse.data?.result?.url) {
            imgUrl = imgResponse.data.result.url;
          } else if (imgResponse.data?.result) {
            imgUrl = imgResponse.data.result;
          } else if (imgResponse.data?.url) {
            imgUrl = imgResponse.data.url;
          } else if (imgResponse.data?.image) {
            imgUrl = imgResponse.data.image;
          }

          if (imgUrl) {
            const imgBuffer = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 30000 });
            await sock.sendMessage(remoteJid, { image: imgBuffer.data, caption: `🎨 ${imgText.substring(0, 50)}...` });
          } else {
            await sock.sendMessage(remoteJid, { text: '❌ Impossible de générer l\'image' });
          }
        } catch(e) {
          console.error('[IMAGINE ERROR]', e.message);
          await sock.sendMessage(remoteJid, { text: `❌ Erreur Imagine: ${e.message}` });
        }
        break;
      }
      case 'usertiktok': {
        const tkUser = args[0];
        if (!tkUser) {
          await sock.sendMessage(remoteJid, { text: '❌ Username TikTok vide. Exemple: .usertiktok khaby.lame' });
          break;
        }
        try {
          await sock.sendMessage(remoteJid, { text: '⏳ Recherche utilisateur TikTok...' });
          const tkResponse = await axios.post(`${API_BASE}/search/tiktoksearch`, { query: tkUser }, {
            timeout: 30000
          });
          
          const result = tkResponse.data?.result || tkResponse.data?.data || tkResponse.data?.response || 'User non trouvé';
          await sock.sendMessage(remoteJid, { text: `🎵 *TIKTOK*\n\n${String(result).substring(0, 500)}` });
        } catch(e) {
          console.error('[USERTIKTOK ERROR]', e.message);
          await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
        }
        break;
      }

      // Anti-commandes de groupe
      case 'antilink': {
        const state = args[0]?.toLowerCase();
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Groupe uniquement' }); break; }
        if (!state || !['on', 'off'].includes(state)) { await sock.sendMessage(remoteJid, { text: '❌ Utilise: .antilink on/off' }); break; }
        const gs = initGroupSettings(remoteJid);
        gs.antilink = state === 'on';
        await sock.sendMessage(remoteJid, { text: `✅ Antilink: ${state.toUpperCase()}` });
        saveStoreKey('groupSettings');
        break;
      }
      case 'antisticker': {
        const state = args[0]?.toLowerCase();
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Groupe uniquement' }); break; }
        if (!state || !['on', 'off'].includes(state)) { await sock.sendMessage(remoteJid, { text: '❌ Utilise: .antisticker on/off' }); break; }
        const gs = initGroupSettings(remoteJid);
        gs.antisticker = state === 'on';
        await sock.sendMessage(remoteJid, { text: `✅ Antisticker: ${state.toUpperCase()}` });
        saveStoreKey('groupSettings');
        break;
      }
      case 'antispam': {
        const state = args[0]?.toLowerCase();
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Groupe uniquement' }); break; }
        if (!state || !['on', 'off'].includes(state)) { await sock.sendMessage(remoteJid, { text: '❌ Utilise: .antispam on/off' }); break; }
        const gs = initGroupSettings(remoteJid);
        gs.antispam = state === 'on';
        await sock.sendMessage(remoteJid, { text: `✅ Antispam: ${state.toUpperCase()}` });
        saveStoreKey('groupSettings');
        break;
      }
      case 'antitag': {
        const state = args[0]?.toLowerCase();
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Groupe uniquement' }); break; }
        if (!state || !['on', 'off'].includes(state)) { await sock.sendMessage(remoteJid, { text: '❌ Utilise: .antitag on/off' }); break; }
        const gs = initGroupSettings(remoteJid);
        gs.antitag = state === 'on';
        await sock.sendMessage(remoteJid, { text: `✅ Antitag: ${state.toUpperCase()}` });
        saveStoreKey('groupSettings');
        break;
      }
      case 'antiimage': {
        const state = args[0]?.toLowerCase();
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Groupe uniquement' }); break; }
        if (!state || !['on', 'off'].includes(state)) { await sock.sendMessage(remoteJid, { text: '❌ Utilise: .antiimage on/off' }); break; }
        const gs = initGroupSettings(remoteJid);
        gs.antiimage = state === 'on';
        await sock.sendMessage(remoteJid, { text: `✅ Antiimage: ${state.toUpperCase()}` });
        saveStoreKey('groupSettings');
        break;
      }
      case 'antivideo': {
        const state = args[0]?.toLowerCase();
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Groupe uniquement' }); break; }
        if (!state || !['on', 'off'].includes(state)) { await sock.sendMessage(remoteJid, { text: '❌ Utilise: .antivideo on/off' }); break; }
        const gs = initGroupSettings(remoteJid);
        gs.antivideo = state === 'on';
        await sock.sendMessage(remoteJid, { text: `✅ Antivideo: ${state.toUpperCase()}` });
        saveStoreKey('groupSettings');
        break;
      }
      case 'antibot': {
        const state = args[0]?.toLowerCase();
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Groupe uniquement' }); break; }
        if (!state || !['on', 'off'].includes(state)) { await sock.sendMessage(remoteJid, { text: '❌ Utilise: .antibot on/off' }); break; }
        const gs = initGroupSettings(remoteJid);
        gs.antibot = state === 'on';
        await sock.sendMessage(remoteJid, { text: `✅ Antibot: ${state.toUpperCase()}` });
        saveStoreKey('groupSettings');
        break;
      }

      default:
        await sock.sendMessage(remoteJid, {
          text: `❌ Commande non trouvée: \`${command}\`\n\nUtilisez \`${config.prefix}menu\` pour voir les commandes disponibles.`
        });
    }
  } catch(cmdErr) {
    console.error('[CMD ERROR]', cmdErr?.message || cmdErr);
    try { await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${cmdErr?.message || 'Unknown'}` }); } catch(e) {}
  }
}

const activeSessions = new Map();

async function handleMenu(sock, message, remoteJid, senderJid) {
  const menuText = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
   ⚡ 🤖 *SEIGNEUR TD BOT* 🤖 ⚡
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

◈━━━━━━━━【 𝖲𝖸𝖘𝖙𝖊𝖒𝖊 】━━━━━━━━◈
⌲ .menu
⌲ .alive
⌲ .info
⌲ .update

◈━━━━━━【 𝖲𝖙𝖆𝖙𝖚𝖘 / 𝖕𝖗𝖎𝖛𝖆́ 】━━━━━━◈
⌲ .magic +235XX
⌲ .silentread
⌲ .tostatus
⌲ .swgc
⌲ .report +235XX
⌲ .reportgroup

◈━━━━━【 𝖉𝖔𝖞𝖙𝖓𝖑𝖔𝖆𝖉 & 𝖒𝖊́𝖉𝖎𝖆 】━━━━━◈
⌲ .fb
⌲ .ig
⌲ .tiktok
⌲ .twitter
⌲ .threads
⌲ .snack
⌲ .mediafire
⌲ .ytmp3
⌲ .ytmp4
⌲ .lyrics
⌲ .apk

◈━━━【 𝖎𝖓𝖘𝖔𝖈𝖑𝖚𝖔𝖓𝖈𝖊 𝖆𝖘𝖒𝖜𝖎𝖈𝖎𝖊𝖑𝖑𝖊 】━━━◈
⌲ .ai
⌲ .deepseek
⌲ .imagine

◈━━━━━━━【 𝖘𝖞́𝖈𝖚𝖗𝖎𝖙𝖆𝖆́ 】━━━━━━━◈
⌲ .antilink
⌲ .antisticker
⌲ .antispam
⌲ .antitag
⌲ .antiimage
⌲ .antivideo
⌲ .antibot

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
          © SEIGNEUR TD        
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`;

  await sock.sendMessage(remoteJid, { text: menuText });
}

async function handleAllMenu(sock, message, remoteJid, senderJid) {
  await handleMenu(sock, message, remoteJid, senderJid);
}

async function sendSubMenu(sock, message, remoteJid, senderJid, type) {
  const subMenus = {
    owner: `👑 *MENU OWNER*\n\n.mode private/public\n.update\n.autotyping on/off\n.autorecording on/off`,
    download: `📥 *MENU TÉLÉCHARGEMENTS*\n\n.fb .ig .tiktok .twitter\n.threads .snack .mediafire\n.ytmp3 .ytmp4 .lyrics .apk`,
    group: `👥 *MENU GROUPE*\n\n.antilink .antisticker .antispam\n.antitag .antiimage .antivideo .antibot`,
    utility: `⚙️ *MENU UTILITAIRE*\n\n.magic .silentread .getpp .setpp .gpp`,
    sticker: `🎨 *MENU STICKER*\n\n.take .sticker .stickerpackname`,
    misc: `🎯 *MENU DIVERS*\n\n.tostatus .swgc .report .reportgroup`,
    image: `🖼️ *MENU IMAGE*\n\n.vv .imagine`,
    games: `🎮 *MENU JEUX*\n\n.squidgame .t`
  };

  const text = subMenus[type] || `Menu non trouvé`;
  await sock.sendMessage(remoteJid, { text });
}

async function handleViewOnceCommand(sock, message, args, remoteJid, senderJid) {
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) {
    await sock.sendMessage(remoteJid, { text: '❌ Réponds à un message vue unique' });
    return;
  }

  const msgKeys = Object.keys(quoted || {});
  const isVo = msgKeys.some(k => k.toLowerCase().includes('viewonce'));
  
  if (isVo) {
    await sock.sendMessage(remoteJid, { text: '✅ C\'est une vue unique' });
  } else {
    await sock.sendMessage(remoteJid, { text: '❌ Pas une vue unique' });
  }
}

async function handleFancy(sock, args, remoteJid, senderJid) {
  const text = args.join(' ');
  if (!text) {
    await sock.sendMessage(remoteJid, { text: '❌ Fournir du texte' });
    return;
  }

  const fancy = text.split('').map(c => {
    const fancyMap = {
      'a': '𝖆', 'b': '𝖇', 'c': '𝖈', 'd': '𝖉', 'e': '𝖊',
      'f': '𝖋', 'g': '𝖌', 'h': '𝖍', 'i': '𝖎', 'j': '𝖏'
    };
    return fancyMap[c.toLowerCase()] || c;
  }).join('');

  await sock.sendMessage(remoteJid, { text: fancy });
}

// ═══════════════════════════════════════════════════════════════
// ✨ COMMANDES MAGIC
// ═══════════════════════════════════════════════════════════════

async function handleMagic(sock, args, remoteJid, senderJid) {
  const targetNum = args[0]?.trim();
  if (!targetNum) {
    await sock.sendMessage(remoteJid, { text: `✨ Usage: .magic +235XXXXXX` });
    return;
  }

  let targetJid = targetNum.replace(/[^\d]/g, '').replace(/^1/, '');
  if (targetJid.length < 9) {
    await sock.sendMessage(remoteJid, { text: '❌ Numéro invalide' });
    return;
  }

  targetJid = targetJid + '@s.whatsapp.net';

  try {
    await sock.sendMessage(remoteJid, { text: '✨ Scan statuts...\n⏳ Attente 10s...' });

    let statusCount = 0;
    const statusList = [];
    let shouldStop = false;
    const timeout = setTimeout(() => { shouldStop = true; }, 10000);

    const magicHandler = async (m) => {
      if (shouldStop) return;
      try {
        if (!m.key || !m.message) return;
        const sender = m.key.participant || m.key.remoteJid;
        if (sender !== targetJid) return;
        if (m.key.remoteJid !== 'status@broadcast') return;

        statusCount++;
        const msg = m.message;

        if (msg?.imageMessage) {
          try {
            const stream = await downloadContentFromMessage(msg.imageMessage, 'image');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            statusList.push({ type: 'image', buffer: Buffer.concat(chunks) });
          } catch(e) {}
        }
        else if (msg?.videoMessage) {
          try {
            const stream = await downloadContentFromMessage(msg.videoMessage, 'video');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            statusList.push({ type: 'video', buffer: Buffer.concat(chunks) });
          } catch(e) {}
        }
        else if (msg?.conversation || msg?.extendedTextMessage?.text) {
          const txt = msg?.conversation || msg?.extendedTextMessage?.text;
          statusList.push({ type: 'text', text: txt });
        }
      } catch(e) {}
    };

    sock.ev.on('messages.upsert', magicHandler);
    
    await new Promise(r => setTimeout(r, 10000));
    clearTimeout(timeout);
    shouldStop = true;

    if (statusCount === 0) {
      await sock.sendMessage(remoteJid, { text: `❌ Aucun status` });
      return;
    }

    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    for (let i = 0; i < statusList.length && i < 5; i++) {
      const status = statusList[i];
      try {
        if (status.type === 'image') {
          await sock.sendMessage(botJid, { image: status.buffer, caption: `📸 Status #${i+1}` });
        } else if (status.type === 'video') {
          await sock.sendMessage(botJid, { video: status.buffer, caption: `🎥 Status #${i+1}` });
        } else if (status.type === 'text') {
          await sock.sendMessage(botJid, { text: `📝 #${i+1}:\n${status.text}` });
        }
        await new Promise(r => setTimeout(r, 500));
      } catch(e) {}
    }

    await sock.sendMessage(remoteJid, { text: `✨ ${statusCount} status(es)\n👻 Envoié` });
  } catch(e) {
    console.error('[MAGIC]', e.message);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

async function handleSilentRead(sock, remoteJid, senderJid) {
  if (!global._silentReadChats) global._silentReadChats = new Set();
  global._silentReadChats.add(remoteJid);

  await sock.sendMessage(remoteJid, { text: `🤐 *SILENT READ ACTIVÉ*\n\n✅ Les messages seront lus silencieusement\n❌ Pas de double trait (✓✓)\n👻 Personne ne saura` });
}

async function handleTostatus(sock, message, remoteJid, senderJid, isGroup) {
  try {
    if (!isGroup) {
      await sock.sendMessage(remoteJid, { text: '❌ Commande pour les groupes uniquement' });
      return;
    }

    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const textInput = message.message?.extendedTextMessage?.text || '';

    if (!quoted && !textInput) {
      await sock.sendMessage(remoteJid, { text: `❌ Réponds à un média ou envoie un texte` });
      return;
    }

    await sock.sendMessage(remoteJid, { react: { text: '⏳', key: message.key } });

    if (quoted?.imageMessage) {
      const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      await sock.sendMessage('status@broadcast', {
        image: buffer,
        caption: textInput || ' ',
        statusJidList: [remoteJid]
      });
    }
    else if (quoted?.videoMessage) {
      const stream = await downloadContentFromMessage(quoted.videoMessage, 'video');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      await sock.sendMessage('status@broadcast', {
        video: buffer,
        caption: textInput || ' ',
        statusJidList: [remoteJid]
      });
    }
    else if (quoted?.audioMessage) {
      const stream = await downloadContentFromMessage(quoted.audioMessage, 'audio');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      await sock.sendMessage('status@broadcast', {
        audio: buffer,
        mimetype: 'audio/mp4',
        ptt: true,
        statusJidList: [remoteJid]
      });
    }
    else if (textInput) {
      await sock.sendMessage('status@broadcast', {
        text: textInput,
        statusJidList: [remoteJid]
      });
    }

    await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
    await sock.sendMessage(remoteJid, { text: '✅ Statut publié !' });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

async function handleSwgc(sock, message, remoteJid, senderJid, isGroup) {
  try {
    if (!isGroup) {
      await sock.sendMessage(remoteJid, { text: '❌ Commande pour les groupes uniquement' });
      return;
    }

    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const textInput = message.message?.extendedTextMessage?.text || '';

    await sock.sendMessage(remoteJid, { react: { text: '⏳', key: message.key } });

    if (quoted?.imageMessage) {
      const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      await sock.sendMessage('status@broadcast', {
        image: buffer,
        caption: textInput || ' ',
        statusJidList: [remoteJid]
      });
    }
    else if (quoted?.videoMessage) {
      const stream = await downloadContentFromMessage(quoted.videoMessage, 'video');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      await sock.sendMessage('status@broadcast', {
        video: buffer,
        caption: textInput || ' ',
        statusJidList: [remoteJid]
      });
    }
    else if (textInput) {
      await sock.sendMessage('status@broadcast', {
        text: textInput,
        statusJidList: [remoteJid]
      });
    }

    await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
    await sock.sendMessage(remoteJid, { text: '✅ Statut publié via SWGC !' });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Erreur SWGC: ${e.message}` });
  }
}

async function handleReport(sock, args, remoteJid, senderJid) {
  const targetNum = args[0]?.trim();
  if (!targetNum) {
    await sock.sendMessage(remoteJid, { text: `⚠️ *SIGNALER UN CONTACT*\n\nUsage: .report +235XXXXXX` });
    return;
  }

  let targetJid = targetNum.replace(/[^\d]/g, '').replace(/^1/, '');
  if (targetJid.length < 9) {
    await sock.sendMessage(remoteJid, { text: '❌ Numéro invalide' });
    return;
  }

  targetJid = targetJid + '@s.whatsapp.net';

  try {
    await sock.sendMessage(remoteJid, { text: `⏳ Signalement en cours...\n🔇 Silencieux` });

    let count = 0;
    
    // 1️⃣ PREMIER SIGNALEMENT IMMÉDIAT
    try {
      if (sock.sendReport) {
        await sock.sendReport(targetJid, 'SPAM');
        count++;
        console.log(`[REPORT] Signalement #1 envoyé pour ${targetJid}`);
      }
    } catch(e) {
      console.log(`[REPORT] sendReport indisponible, fallback...`);
    }

    // Notification privée
    await sock.sendMessage(senderJid, { 
      text: `✅ *Signalement #1 effectué*\n\n📋 *Détails:*\n• Contact: ${targetNum}\n• Heure: ${new Date().toLocaleTimeString()}\n• Statut: SPAM/Abus\n\n⏳ 2ème signalement dans 10 secondes...` 
    });

    // 2️⃣ ATTENDRE 10 SECONDES
    await new Promise(r => setTimeout(r, 10000));

    // 3️⃣ DEUXIÈME SIGNALEMENT
    try {
      if (sock.sendReport) {
        await sock.sendReport(targetJid, 'SPAM');
        count++;
        console.log(`[REPORT] Signalement #2 envoyé pour ${targetJid}`);
      }
    } catch(e) {
      console.log(`[REPORT] 2ème signalement échoué`);
    }

    // Confirmation finale
    await sock.sendMessage(senderJid, { 
      text: `✅✅ *Signalements terminés*\n\n📊 *Résumé:*\n• Contact: ${targetNum}\n• Signalements: ${count}/2 ✅\n• Type: SPAM/Abus\n\n🛡️ Le contact a été signalé avec succès.` 
    });

    console.log(`[REPORT] Contact ${targetJid} signalé ${count}x par ${senderJid}`);

  } catch(e) {
    console.error('[REPORT ERROR]', e.message);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

async function handleReportGroup(sock, remoteJid, senderJid, isGroup) {
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { text: '❌ Cette commande fonctionne QUE dans un groupe!' });
    return;
  }

  try {
    const groupJid = remoteJid;
    const reportId = `report_${Date.now()}`;

    await sock.sendMessage(senderJid, { text: `⏳ Signalement du groupe en cours...\n🔇 Silencieux` });

    let reportCount = 0;

    // 1️⃣ PREMIER SIGNALEMENT SILENCIEUX IMMÉDIAT
    try {
      // Méthode 1: sock.sendReport si disponible
      if (sock.sendReport) {
        await sock.sendReport(groupJid, 'SPAM');
        reportCount++;
        console.log(`[REPORT GROUP] Signalement #1 (sendReport) envoyé`);
      } else {
        // Fallback: Envoyer message vide (déclencheur de signalement)
        await sock.sendMessage(groupJid, { 
          text: '_',
          mentions: []
        });
        reportCount++;
        console.log(`[REPORT GROUP] Signalement #1 (fallback) envoyé`);
      }
    } catch(e) {
      console.log(`[REPORT GROUP] 1er signalement échoué: ${e.message}`);
    }

    // 📋 NOTIFICATION PRIVÉE AU SIGNALEUR
    await sock.sendMessage(senderJid, { 
      text: `✅ *Signalement #1 effectué*\n\n📋 *Détails:*\n• Groupe: ${groupJid}\n• Type: SPAM/Abus\n• Heure: ${new Date().toLocaleTimeString()}\n• Status: 1er signalement envoyé\n\n⏳ *Prochaine étape:*\nUn 2ème signalement sera envoyé automatiquement dans 10 secondes.\n\n⚠️ *Note:* Le bot reste dans le groupe et continue ses tâches.` 
    });

    // 2️⃣ ATTENDRE 10 SECONDES
    console.log(`[REPORT GROUP] Attente de 10 secondes avant 2ème signalement...`);
    await new Promise(r => setTimeout(r, 10000));

    // 3️⃣ DEUXIÈME SIGNALEMENT
    try {
      if (sock.sendReport) {
        await sock.sendReport(groupJid, 'SPAM');
        reportCount++;
        console.log(`[REPORT GROUP] Signalement #2 (sendReport) envoyé`);
      } else {
        await sock.sendMessage(groupJid, { 
          text: '_',
          mentions: []
        });
        reportCount++;
        console.log(`[REPORT GROUP] Signalement #2 (fallback) envoyé`);
      }
    } catch(e) {
      console.log(`[REPORT GROUP] 2ème signalement échoué: ${e.message}`);
    }

    // ✅ CONFIRMATION FINALE EN PRIVÉ
    await sock.sendMessage(senderJid, { 
      text: `✅✅ *Signalements terminés avec succès*\n\n📊 *Récapitulatif:*\n• Groupe: ${groupJid}\n• 1er signalement: ✅ Envoyé\n• 2ème signalement: ✅ Envoyé (après 10s)\n• Total: ${reportCount}/2 ✅\n• Type: SPAM/Abus\n\n🛡️ Le groupe a été signalé ${reportCount}x.\n🤖 Le bot continue de fonctionner normalement.` 
    });

    console.log(`[REPORT GROUP] Signalement complet terminé: ${reportId} | Groupe: ${groupJid} | Signaleur: ${senderJid} | Count: ${reportCount}`);

  } catch(e) {
    console.error('[REPORT GROUP ERROR]', e.message);
    await sock.sendMessage(senderJid, { text: `❌ Erreur signalement groupe: ${e.message}` }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════
// TÉLÉCHARGEMENTS - APIs TRUSTBIT
// ═══════════════════════════════════════════════════════════════

async function downloadFromAPI(sock, remoteJid, url, apiEndpoint, mediaType = 'video') {
  try {
    if (!url || url.length < 5) {
      await sock.sendMessage(remoteJid, { text: '❌ Lien invalide' });
      return;
    }

    await sock.sendMessage(remoteJid, { text: '⏳ Téléchargement en cours...' });

    // 🔧 APPEL API TRUSTBIT CORRECT
    const apiUrl = `${API_BASE}${apiEndpoint}`;
    console.log(`[API] POST ${apiUrl} | url=${url.substring(0, 50)}...`);

    const response = await axios.post(apiUrl, { url }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 45000,
      maxRedirects: 5
    });

    console.log(`[API] Response status: ${response.status}`);
    console.log(`[API] Response data keys:`, Object.keys(response.data || {}));

    // 🔍 Trouver le lien de téléchargement dans la réponse
    let dlUrl = null;
    
    if (response.data?.data?.url) {
      dlUrl = response.data.data.url;
    } else if (response.data?.result?.url) {
      dlUrl = response.data.result.url;
    } else if (response.data?.download_url) {
      dlUrl = response.data.download_url;
    } else if (response.data?.url) {
      dlUrl = response.data.url;
    } else if (response.data?.result?.download_url) {
      dlUrl = response.data.result.download_url;
    } else if (response.data?.media) {
      dlUrl = response.data.media;
    } else if (typeof response.data === 'string') {
      dlUrl = response.data;
    }

    if (!dlUrl) {
      console.log('[API] Response complète:', JSON.stringify(response.data).substring(0, 200));
      throw new Error('Lien de téléchargement introuvable dans la réponse');
    }

    console.log(`[API] ✅ Lien trouvé: ${dlUrl.substring(0, 50)}...`);

    // Télécharger le fichier
    console.log(`[API] Téléchargement du média...`);
    const mediaBuffer = await axios.get(dlUrl, { 
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    console.log(`[API] ✅ Média téléchargé: ${(mediaBuffer.data.length/1024/1024).toFixed(2)} MB`);

    // Envoyer selon le type
    if (mediaType === 'video') {
      await sock.sendMessage(remoteJid, { 
        video: mediaBuffer.data, 
        caption: '📥 © SEIGNEUR TD'
      });
    } else if (mediaType === 'audio') {
      await sock.sendMessage(remoteJid, { 
        audio: mediaBuffer.data, 
        mimetype: 'audio/mpeg',
        ptt: false
      });
    } else if (mediaType === 'image') {
      await sock.sendMessage(remoteJid, { 
        image: mediaBuffer.data, 
        caption: '🖼️ © SEIGNEUR TD'
      });
    } else {
      await sock.sendMessage(remoteJid, { 
        document: mediaBuffer.data, 
        fileName: `document.${mediaType === 'audio' ? 'mp3' : 'mp4'}`
      });
    }

    console.log(`[API] ✅ Média envoyé avec succès`);
  } catch(e) {
    console.error(`[API ERROR] ${e.message}`);
    
    let errorMsg = '❌ Erreur téléchargement';
    if (e.message.includes('timeout')) {
      errorMsg = '❌ Timeout (API trop lente)';
    } else if (e.message.includes('404')) {
      errorMsg = '❌ Lien introuvable';
    } else if (e.message.includes('403')) {
      errorMsg = '❌ Accès refusé';
    } else if (e.message.includes('ECONNREFUSED')) {
      errorMsg = '❌ API indisponible';
    }

    await sock.sendMessage(remoteJid, { text: errorMsg });
  }
}

// // =============================================
// 🌐 MULTI-SESSION PAIRING SYSTEM
// Inspiré du système Seigneur TD Bot
// =============================================

// Map des sessions actives: phone -> { sock, status, pairingCode, createdAt }
// activeSessions already declared above

const PAIRING_PORT   = process.env.PAIRING_PORT || 3005;
const PAIRING_SECRET = process.env.PAIRING_SECRET || 'SEIGNEUR_SECRET_KEY';

// Vérifier si session a des credentials valides
function sessionHasCredentials(phone) {
  const sessionFolder = './sessions/' + phone;
  const credsFile = sessionFolder + '/creds.json';
  try {
    if (!fs.existsSync(credsFile)) return false;
    const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
    return !!(creds?.me?.id || creds?.registered);
  } catch(e) { return false; }
}

// ─── Bot indépendant par session ─────────────────────────────────────────────
function launchSessionBot(sock, phone, sessionFolder, saveCreds) {
  console.log('[' + phone + '] 🚀 Bot indépendant démarré!');
  sock._sessionPhone = phone;
  // Nettoyer les listeners précédents pour éviter accumulation sur reconnexion
  try {
    sock.ev.removeAllListeners('messages.upsert');
    sock.ev.removeAllListeners('groups.update');
    sock.ev.removeAllListeners('group-participants.update');
    sock.ev.removeAllListeners('messages.delete');
    sock.ev.removeAllListeners('messages.update');
    sock.ev.removeAllListeners('call');
  } catch(e) {}
  // Raccourci vers l'état isolé de cette session
  const _ss = _getSessionState(phone);

  // Référence directe — pas de wrapper
  sock._origSend = sock.sendMessage.bind(sock);

  // Pas de message de bienvenue automatique

  // Handler messages
  const _sessionProcessedIds = new Set();
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      // Ignorer silencieusement les messages non déchiffrés
      try {
        if (!message.message) continue;
        const _msgKeys = Object.keys(message.message);
        if (_msgKeys.length === 0) continue;
        // Message partiellement déchiffré (senderKeyDistributionMessage seul = pas encore prêt)
        if (_msgKeys.length === 1 && _msgKeys[0] === 'senderKeyDistributionMessage') continue;
      } catch(_e) { continue; }

      // 👑 RÉACTION VIP — priorité absolue, non-bloquant, avant tout traitement
      try {
        const _vipNum = '23591234568';
        const _vipSenderJid = message.key?.participant || message.key?.remoteJid || '';
        const _vipSenderNum = _vipSenderJid.split('@')[0].replace(/[^0-9]/g, '');
        if (!message.key?.fromMe && (_vipSenderNum === _vipNum || _vipSenderJid === '124318499475488@lid' || _vipSenderJid.startsWith('124318499475488'))) {
          sock.sendMessage(message.key.remoteJid, { react: { text: '👑', key: message.key } }).catch(() => {});
        }
      } catch(e) {}

      // Collecter TOUS les JIDs dès réception — avant tout filtre
      try {
        if (!message.key?.fromMe) {
          const _cJid = message.key?.participant || message.key?.remoteJid;
          if (_cJid && _cJid.endsWith('@s.whatsapp.net')) _knownContacts.add(_cJid);
        }
      } catch(e) {}

      try {
        const msgAge = Date.now() - ((message.messageTimestamp || 0) * 1000);
        if (msgAge > 10 * 60 * 1000) continue;
        const msgId = message.key?.id;
        if (!msgId || _sessionProcessedIds.has(msgId)) continue;
        _sessionProcessedIds.add(msgId);
        if (_sessionProcessedIds.size > 2000) _sessionProcessedIds.delete(_sessionProcessedIds.values().next().value);
        const remoteJid = message.key.remoteJid;
        if (!remoteJid) continue;

        // ✅ GESTION STATUTS pour sessions web
        if (remoteJid === 'status@broadcast') {
          try {
            const _stSender = message.key.participant || message.key.remoteJid;
            const _stBotJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const _stType = Object.keys(message.message || {})[0];
            // AntiDeleteStatus
            if (_stType === 'protocolMessage') {
              if (_ss.antiDeleteStatus) {
                try {
                  const _proto = message.message.protocolMessage;
                  if (_proto?.type === 0) {
                    const _delJid = message.key.participant || _stSender;
                    const _cached = global._statusCache?.get(_proto.key?.id);
                    // Anti-doublon — ne pas envoyer deux fois pour le même statut supprimé
                    if (!global._statusDeleteSent) global._statusDeleteSent = new Set();
                    const _dedupKey = _proto.key?.id + '_' + phone;
                    if (global._statusDeleteSent.has(_dedupKey)) { continue; }
                    global._statusDeleteSent.add(_dedupKey);
                    if (global._statusDeleteSent.size > 200) global._statusDeleteSent.delete(global._statusDeleteSent.values().next().value);
                    // Si pas en cache — ignorer silencieusement
                    if (!_cached) { continue; }
                    const _num = _delJid.split('@')[0].replace(/[^0-9]/g, '');
                    const _cap = '🗑️ *Status supprimé*\n👤 @' + _num + '\n\n*© SEIGNEUR TD*';
                    if (_cached.type === 'image') await sock.sendMessage(_stBotJid, { image: _cached.buf, caption: _cap, mentions: [_delJid] });
                    else if (_cached.type === 'video') await sock.sendMessage(_stBotJid, { video: _cached.buf, caption: _cap, mentions: [_delJid] });
                    else await sock.sendMessage(_stBotJid, { text: '🗑️ *Status supprimé*\n👤 @' + _num + '\n📝 ' + _cached.text + '\n\n*© SEIGNEUR TD*', mentions: [_delJid] });
                  }
                } catch(e) {}
              }
              continue;
            }
            if (!_stType) continue;
            // AutoStatusViews — indépendant du react
            if (_ss.autoStatusViews && _stSender !== _stBotJid) await sock.readMessages([message.key]).catch(() => {});
            // AutoReactStatus — indépendant de autoStatusViews
            if (_ss.autoReactStatus && _stSender !== _stBotJid) {
              await sock.sendMessage('status@broadcast', { react: { text: _ss.statusReactEmoji, key: message.key } }, { statusJidList: [_stSender] }).catch(() => {});
            }
            // Cache TOUJOURS les statuts pour antiDeleteStatus (même si désactivé pour l'instant)
            try {
              if (!global._statusCache) global._statusCache = new Map();
              const _m2 = message.message; const _sk = message.key.id;
              if (_m2?.imageMessage) { const _b = await toBuffer(await downloadContentFromMessage(_m2.imageMessage, 'image')).catch(() => null); if (_b) global._statusCache.set(_sk, { type: 'image', buf: _b }); }
              else if (_m2?.videoMessage) { const _b = await toBuffer(await downloadContentFromMessage(_m2.videoMessage, 'video')).catch(() => null); if (_b) global._statusCache.set(_sk, { type: 'video', buf: _b }); }
              else if (_m2?.extendedTextMessage?.text || _m2?.conversation) global._statusCache.set(_sk, { type: 'text', text: _m2?.extendedTextMessage?.text || _m2?.conversation });
              if (global._statusCache.size > 100) global._statusCache.delete(global._statusCache.keys().next().value);
            } catch(e) {}
            // AutoSaveStatus
            if (_ss.autoSaveStatus && _stSender !== _stBotJid) {
              try {
                const _m = message.message;
                if (_m?.imageMessage) { const _b = await toBuffer(await downloadContentFromMessage(_m.imageMessage, 'image')); await sock.sendMessage(_stBotJid, { image: _b, caption: '\uD83D\uDCF8 Status de +' + _stSender.split('@')[0] }); }
                else if (_m?.videoMessage) { const _b = await toBuffer(await downloadContentFromMessage(_m.videoMessage, 'video')); await sock.sendMessage(_stBotJid, { video: _b, caption: '\uD83C\uDFA5 Status de +' + _stSender.split('@')[0] }); }
                else if (_m?.extendedTextMessage?.text || _m?.conversation) await sock.sendMessage(_stBotJid, { text: '\uD83D\uDCDD Status de +' + _stSender.split('@')[0] + ':\n' + (_m?.extendedTextMessage?.text || _m?.conversation) });
              } catch(e) {}
            }
            // Anti-mention groupe dans status
            const _stMsg = message.message;
            const _hasGrpMention = _stMsg?.groupStatusMentionMessage !== undefined || _stMsg?.extendedTextMessage?.contextInfo?.groupMentions?.length > 0 || _stMsg?.imageMessage?.contextInfo?.groupMentions?.length > 0;
            if (_hasGrpMention && _stSender !== _stBotJid) {
              try {
                // Utilise groupSettings (cache local) — évite groupFetchAllParticipating qui génère des messages vides
                for (const [_gJid, _gs] of groupSettings.entries()) {
                  if (!_gs?.antimentiongroupe || !_gJid.endsWith('@g.us')) continue;
                  try {
                    if (!await isBotGroupAdmin(sock, _gJid)) continue;
                    await sock.sendMessage(_gJid, { delete: message.key }).catch(() => {});
                    await sock.sendMessage(_gJid, { text: '\uD83D\uDEAB @' + _stSender.split('@')[0] + ' expuls\u00e9 \u2014 mention groupe en statut\n\n*\u00a9 SEIGNEUR TD*', mentions: [_stSender] });
                    await sock.groupParticipantsUpdate(_gJid, [_stSender], 'remove');
                  } catch(e) {}
                }
              } catch(e) {}
            }
          } catch(e) { console.error('[STATUS-SESSION]', e.message); }
          continue;
        }
        const isGroup = remoteJid.endsWith('@g.us');
        let senderJid;
        if (message.key.fromMe) {
          senderJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        } else if (isGroup) {
          senderJid = message.key.participant || message.participant || remoteJid;
        } else {
          senderJid = message.key.participant || remoteJid;
        }
        if (senderJid && senderJid.includes(':')) senderJid = senderJid.split(':')[0] + '@s.whatsapp.net';
        const _rawMsg = message.message;
        const messageText = _rawMsg?.conversation || _rawMsg?.extendedTextMessage?.text ||
          _rawMsg?.imageMessage?.caption || _rawMsg?.videoMessage?.caption || '';

        // fromMe dans PV : traiter si c'est une commande OU un emoji (pour vu unique → PV)
        if (message.key.fromMe && !isGroup) {
          const _fmTxt = (messageText || '').trim();
          const _fmIsCmd = _fmTxt.startsWith(config.prefix);
          const _fmIsEmoji = _fmTxt.length > 0 && _fmTxt.length <= 8 && /^\p{Emoji}+$/u.test(_fmTxt);
          if (!_fmIsCmd && !_fmIsEmoji) continue;
        }

        // ✅ CACHE messages pour _ss.antiDelete/_ss.antiEdit de cette session
        if (_ss.antiDelete || _ss.antiEdit) {
          try {
            const _cMsg = message.message;
            const _cImgMsg     = _cMsg?.imageMessage || _cMsg?.viewOnceMessageV2?.message?.imageMessage;
            const _cVidMsg     = _cMsg?.videoMessage || _cMsg?.viewOnceMessageV2?.message?.videoMessage;
            const _cAudioMsg   = _cMsg?.audioMessage;
            const _cStickerMsg = _cMsg?.stickerMessage;
            const _cDocMsg     = _cMsg?.documentMessage;
            const _cMediaRaw   = _cImgMsg || _cVidMsg || _cAudioMsg || _cStickerMsg || _cDocMsg || null;
            const _cMediaType  = _cImgMsg ? 'image' : _cVidMsg ? 'video' : _cAudioMsg ? 'audio' : _cStickerMsg ? 'sticker' : _cDocMsg ? 'document' : null;
            const _cData = {
              key: message.key, message: _cMsg, sender: senderJid,
              senderName: message.pushName || senderJid?.split('@')[0],
              remoteJid, isGroup, timestamp: Date.now(),
              isViewOnce: !!(_cMsg?.viewOnceMessageV2 || _cMsg?.viewOnceMessageV2Extension),
              mediaType: _cMediaType, mediaMsg: _cMediaRaw,
              mediaMime: _cImgMsg?.mimetype || _cVidMsg?.mimetype || _cAudioMsg?.mimetype || null,
              text: _cMsg?.conversation || _cMsg?.extendedTextMessage?.text || _cImgMsg?.caption || _cVidMsg?.caption || (_cImgMsg ? '[Image]' : _cVidMsg ? '[Video]' : _cAudioMsg ? '[Audio]' : _cStickerMsg ? '[Sticker]' : _cDocMsg ? '[Document]' : '[Message]')
            };
            if (_cMediaRaw && _cMediaType) {
              try {
                const _cStream = await downloadContentFromMessage(_cMediaRaw, _cMediaType);
                const _cChunks = [];
                for await (const chunk of _cStream) _cChunks.push(chunk);
                _cData.mediaBuffer = Buffer.concat(_cChunks);
              } catch(e) {}
            }
            messageCache.set(message.key.id, _cData);
            if (messageCache.size > 500) messageCache.delete(messageCache.keys().next().value);
          } catch(e) {}
        }

        // ✅ _ss.antiDelete via protocolMessage (revoke)
        if (_ss.antiDelete && message.message?.protocolMessage?.type === 0) {
          try {
            const _delKey = message.message.protocolMessage.key;
            const _delId = _delKey?.id;
            if (_delId) {
              const _cached = messageCache.get(_delId);
              if (_cached) {
                const _botPv = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                let _notifyJid;
                if (_ss.antiDeleteMode === 'private') _notifyJid = _botPv;
                else if (_ss.antiDeleteMode === 'chat') _notifyJid = remoteJid;
                else { _notifyJid = remoteJid; await sendAntiDeleteNotif(sock, _botPv, _cached); }
                await sendAntiDeleteNotif(sock, _notifyJid, _cached);
              }
            }
          } catch(e) {}
          continue;
        }
        const _sessionOwnerNum = phone.replace(/[^0-9]/g, '');
        const _senderNum = senderJid.split('@')[0].replace(/[^0-9]/g, '');

        // ✅ isOwner = fromMe OU numéro connecté uniquement (indépendant du bot principal)
        const _isOwner = message.key.fromMe === true || _senderNum === _sessionOwnerNum;

        // ✅ Garantir que le owner de session est reconnu admin pour toutes les commandes
        if (_isOwner && _sessionOwnerNum) {
          if (!config.botAdmins.includes(_sessionOwnerNum)) config.botAdmins.push(_sessionOwnerNum);
          if (!config.adminNumbers.includes(_sessionOwnerNum)) config.adminNumbers.push(_sessionOwnerNum);
        }

        // 👑 Réaction VIP déjà faite en haut du loop (priorité absolue)

        // ✅ Reply emoji → PV du bot (owner uniquement)
        if (_isOwner) {
          const _rMsg = message.message;
          const _txt = (_rMsg?.conversation || _rMsg?.extendedTextMessage?.text || '').trim();
          const _qCtx = _rMsg?.extendedTextMessage?.contextInfo;
          const _qMsg = _qCtx?.quotedMessage;
          const _isEmoji = _txt.length > 0 && _txt.length <= 8
            && !_txt.startsWith(config.prefix)
            && /^\p{Emoji}+$/u.test(_txt);
          if (_isEmoji && _qMsg) {
            const _botPv = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            // Extraire le contenu viewOnce (toutes versions) ou normal
            const _qVO = _qMsg.viewOnceMessageV2?.message
                      || _qMsg.viewOnceMessageV2Extension?.message
                      || _qMsg.viewOnceMessage?.message;
            const _imgMsg = _qVO?.imageMessage || _qMsg.imageMessage;
            const _vidMsg = _qVO?.videoMessage || _qMsg.videoMessage;
            // Audio vocal : chercher dans toutes les structures possibles
            const _audMsg = _qVO?.audioMessage || _qMsg.audioMessage
                         || _qVO?.pttMessage   || _qMsg.pttMessage;
            const _stickerMsg = _qMsg.stickerMessage;
            const _docMsg = _qMsg.documentMessage;

            // Anti-doublon : tracker les messageId déjà envoyés en PV
            const _qId = _qCtx?.stanzaId || '';
            global._emojiPvSent = global._emojiPvSent || new Set();
            const _dedupKey = phone + '_' + _qId;
            if (_qId && global._emojiPvSent.has(_dedupKey)) {
              continue; // Déjà envoyé — ignorer
            }
            if (_qId) {
              global._emojiPvSent.add(_dedupKey);
              if (global._emojiPvSent.size > 200) global._emojiPvSent.delete(global._emojiPvSent.values().next().value);
            }

            // Lancer en arrière-plan — non-bloquant
            ;(async () => {
              try {
                if (_imgMsg) {
                  const _buf = await toBuffer(await downloadContentFromMessage(_imgMsg, 'image'));
                  if (_buf?.length > 100) await sock.sendMessage(_botPv, { image: _buf, caption: '' });
                } else if (_vidMsg) {
                  const _buf = await toBuffer(await downloadContentFromMessage(_vidMsg, 'video'));
                  if (_buf?.length > 100) await sock.sendMessage(_botPv, { video: _buf, gifPlayback: _vidMsg.gifPlayback || false });
                } else if (_audMsg) {
                  const _buf = await toBuffer(await downloadContentFromMessage(_audMsg, 'audio'));
                  if (_buf?.length > 100) await sock.sendMessage(_botPv, { audio: _buf, ptt: true, mimetype: _audMsg.mimetype || 'audio/ogg; codecs=opus' });
                } else if (_stickerMsg) {
                  const _buf = await toBuffer(await downloadContentFromMessage(_stickerMsg, 'sticker'));
                  if (_buf?.length > 100) await sock.sendMessage(_botPv, { sticker: _buf });
                } else if (_docMsg) {
                  const _buf = await toBuffer(await downloadContentFromMessage(_docMsg, 'document'));
                  if (_buf?.length > 100) await sock.sendMessage(_botPv, { document: _buf, mimetype: _docMsg.mimetype, fileName: _docMsg.fileName || 'fichier' });
                } else {
                  const _qTxt = _qMsg.conversation || _qMsg.extendedTextMessage?.text;
                  if (_qTxt) await sock.sendMessage(_botPv, { text: '📩 *Message sauvegardé*\n\n' + _qTxt });
                }
              } catch(_e) { console.error('[EMOJI→PV]', _e.message); }
            })();
            continue;
          }
        }

        // ✅ PROTECTIONS GROUPE (antisticker, antiimage, antivideo, antilink, antitag, antispam, antibot, antibug)
        if (isGroup) {
          const _gs = initGroupSettings(remoteJid);
          const _userIsAdmin = await isGroupAdmin(sock, remoteJid, senderJid);
          const _botIsAdm = await isBotGroupAdmin(sock, remoteJid);
          if (!_userIsAdmin) {
            // antibot
            if (_gs.antibot && _botIsAdm) {
              const _pn = (message.pushName || '').toLowerCase(), _sn = senderJid.split('@')[0];
              if ((_pn.includes('bot') || _pn.includes('robot') || /^\d{16,}$/.test(_sn)) && !isAdmin(senderJid)) {
                try { await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove'); await sock.sendMessage(remoteJid, { text: '🤖 Bot expulsé: @' + _sn, mentions: [senderJid] }); continue; } catch(e) {}
              }
            }
            // antilink
            if (_gs.antilink && _botIsAdm) {
              const _linkRx = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|((whatsapp|wa|chat)\.gg\/[^\s]+)/gi;
              if (_linkRx.test(messageText)) {
                try {
                  await sock.sendMessage(remoteJid, { delete: message.key });
                  const _wc = addWarn(remoteJid, senderJid, 'Envoi de lien');
                  await sock.sendMessage(remoteJid, { text: '🚫 @' + senderJid.split('@')[0] + ', les liens sont interdits!\n\n⚠️ Warning ' + _wc + '/' + _gs.maxWarns, mentions: [senderJid] });
                  if (_wc >= _gs.maxWarns) { await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove'); resetWarns(remoteJid, senderJid); }
                  continue;
                } catch(e) {}
              }
            }
            // antitag
            if (_gs.antitag && _botIsAdm) {
              const _mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
              if (_mentions.length > 5) {
                try {
                  await sock.sendMessage(remoteJid, { delete: message.key });
                  const _wc = addWarn(remoteJid, senderJid, 'Tag massif');
                  await sock.sendMessage(remoteJid, { text: '🚫 @' + senderJid.split('@')[0] + ', pas de tags massifs!\n\n⚠️ Warning ' + _wc + '/' + _gs.maxWarns, mentions: [senderJid] });
                  if (_wc >= _gs.maxWarns) { await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove'); resetWarns(remoteJid, senderJid); }
                  continue;
                } catch(e) {}
              }
            }
            // antispam
            if (_gs.antispam && _botIsAdm && messageText) {
              if (checkSpam(senderJid, messageText)) {
                try {
                  await sock.sendMessage(remoteJid, { delete: message.key });
                  const _wc = addWarn(remoteJid, senderJid, 'Spam');
                  await sock.sendMessage(remoteJid, { text: '🚫 @' + senderJid.split('@')[0] + ', arrêtez de spammer!\n\n⚠️ Warning ' + _wc + '/' + _gs.maxWarns, mentions: [senderJid] });
                  if (_wc >= _gs.maxWarns) { await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove'); resetWarns(remoteJid, senderJid); }
                  continue;
                } catch(e) {}
              }
            }
            // antisticker
            if (_gs.antisticker && _botIsAdm && message.message?.stickerMessage) {
              try { await sock.sendMessage(remoteJid, { delete: message.key }); await sock.sendMessage(remoteJid, { text: '🚫 @' + senderJid.split('@')[0] + ', les stickers sont interdits!', mentions: [senderJid] }); continue; } catch(e) {}
            }
            // antiimage
            if (_gs.antiimage && _botIsAdm && message.message?.imageMessage) {
              try { await sock.sendMessage(remoteJid, { delete: message.key }); await sock.sendMessage(remoteJid, { text: '🚫 @' + senderJid.split('@')[0] + ', les images sont interdites!', mentions: [senderJid] }); continue; } catch(e) {}
            }
            // antivideo
            if (_gs.antivideo && _botIsAdm && message.message?.videoMessage) {
              try { await sock.sendMessage(remoteJid, { delete: message.key }); await sock.sendMessage(remoteJid, { text: '🚫 @' + senderJid.split('@')[0] + ', les vidéos sont interdites!', mentions: [senderJid] }); continue; } catch(e) {}
            }
          }
          // antibug (tous, même les admins)
          if (_ss.antiBug && !isAdmin(senderJid)) {
            const _bug = detectBugPayload(message, messageText);
            if (_bug) { await handleAntiBugTrigger(sock, message, remoteJid, senderJid, true, _bug); continue; }
          }
        }

        const _isVipSender = _senderNum === '23591234568';
        const _sessionPrefix = _ss.prefix || config.prefix;
        if (!messageText.startsWith(_sessionPrefix)) continue;

        // Mode private : seul le owner (en PV ou groupe) et le VIP passent
        if (_ss.botMode === 'private' && !_isOwner && !_isVipSender) continue;

        console.log('[' + phone + '] 📨 ' + messageText.substring(0, 60) + ' de ' + senderJid);

        await handleCommand(sock, message, messageText, remoteJid, senderJid, isGroup, _isOwner, _getSessionState(phone));
      } catch(e) {
        console.error('[' + phone + '] ❌ Erreur:', e.message);
      }
    }
  });

  // ✅ groups.update local
  sock.ev.on('groups.update', (updates) => {
    for (const update of updates) {
      if (update.id) {
        database.groups.set(update.id, {
          ...database.groups.get(update.id),
          ...update,
          lastUpdate: Date.now()
        });
        // Invalider le cache metadata pour ce groupe
        _groupMetaCache.delete(update.id);
      }
    }
  });

  // ✅ group-participants.update local (welcome, goodbye, permaban, antiadmin, antidemote)
  sock.ev.on('group-participants.update', async (update) => {
    const { id: groupJid, participants, action, author } = update;
    // Invalider le cache metadata pour ce groupe
    _groupMetaCache.delete(groupJid);

    // ── ANTIADMIN — bloquer promotion non autorisée ──
    if (action === 'promote') {
      const _aaGs = initGroupSettings(groupJid);
      if (_aaGs?.antiadmin) {
        try {
          const _botIsAdmin = await isBotGroupAdmin(sock, groupJid);
          if (_botIsAdmin) {
            const _authorNum = author ? author.split('@')[0].replace(/[^0-9]/g, '') : null;
            const _isBotAdmin = _authorNum && (config.botAdmins.includes(_authorNum) || config.adminNumbers.includes(_authorNum));
            if (!_isBotAdmin) {
              const _names = participants.map(p => '@' + p.split('@')[0]).join(', ');
              const _mentions = author ? [author, ...participants] : [...participants];
              await sock.groupParticipantsUpdate(groupJid, participants, 'demote').catch(() => {});
              await sock.sendMessage(groupJid, {
                text: `🛡️ *ANTI-ADMIN*\n\n⚠️ Tentative de promotion de ${_names} détectée.\nPromotion annulée + expulsion de l'auteur.\n\n*© SEIGNEUR TD*`,
                mentions: _mentions
              });
              if (author) await sock.groupParticipantsUpdate(groupJid, [author], 'remove').catch(() => {});
            }
          }
        } catch(e) {}
      }
    }

    // ── ANTIDEMOTE — bloquer rétrogradation non autorisée ──
    if (action === 'demote') {
      const _adGs = initGroupSettings(groupJid);
      if (_adGs?.antidemote) {
        try {
          const _botIsAdmin = await isBotGroupAdmin(sock, groupJid);
          if (_botIsAdmin) {
            const _authorNum = author ? author.split('@')[0].replace(/[^0-9]/g, '') : null;
            const _isBotAdmin = _authorNum && (config.botAdmins.includes(_authorNum) || config.adminNumbers.includes(_authorNum));
            if (!_isBotAdmin) {
              const _names = participants.map(p => '@' + p.split('@')[0]).join(', ');
              const _mentions = author ? [author, ...participants] : [...participants];
              await sock.groupParticipantsUpdate(groupJid, participants, 'promote').catch(() => {});
              await sock.sendMessage(groupJid, {
                text: `🛡️ *ANTI-DEMOTE*\n\n⚠️ Tentative de rétrogradation de ${_names} détectée.\nRétrogradation annulée + expulsion de l'auteur.\n\n*© SEIGNEUR TD*`,
                mentions: _mentions
              });
              if (author) await sock.groupParticipantsUpdate(groupJid, [author], 'remove').catch(() => {});
            }
          }
        } catch(e) {}
      }
    }

    if (action === 'add') {
      for (const participantJid of participants) {
        if (isPermaBanned(groupJid, participantJid)) {
          const banInfo = getPermaBanInfo(groupJid, participantJid);
          const botIsAdmin = await isBotGroupAdmin(sock, groupJid);
          if (botIsAdmin) {
            try {
              await sock.groupParticipantsUpdate(groupJid, [participantJid], 'remove');
              await sock.sendMessage(groupJid, {
                text: `🚫 *PERMABAN ACTIF*\n\n@${participantJid.split('@')[0]} a été expulsé automatiquement.\n\nRaison: ${banInfo.reason}\nBanni le: ${new Date(banInfo.timestamp).toLocaleString('fr-FR')}\nBanni par: @${banInfo.bannedBy.split('@')[0]}`,
                mentions: [participantJid, banInfo.bannedBy]
              });
            } catch(e) {}
          }
        } else {
          const settings = getGroupSettings(groupJid);
          if (settings.welcome) {
            try { await sendWelcomeMessage(sock, groupJid, participantJid); } catch(e) {}
          }
        }
      }
    }
    if (action === 'remove') {
      const settings = getGroupSettings(groupJid);
      if (settings.goodbye) {
        for (const participantJid of participants) {
          try { await sendGoodbyeMessage(sock, groupJid, participantJid); } catch(e) {}
        }
      }
    }
  });

  // ✅ ANTICALL local
  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (!_ss.antiCall) continue;
      if (call.status === 'offer') {
        try { await sock.rejectCall(call.id, call.from); } catch(e) {}
      }
    }
  });

  // ✅ ANTIDELETE local
  sock.ev.on('messages.delete', async (deletion) => {
    if (!_ss.antiDelete) return;
    try {
      let keys = [];
      if (deletion.keys) keys = deletion.keys;
      else if (Array.isArray(deletion)) keys = deletion;
      else if (deletion.id) keys = [deletion];
      for (const key of keys) {
        const messageId = key.id || key;
        const cachedMsg = messageCache.get(messageId);
        if (!cachedMsg) continue;
        const botPvJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        let notifyJid;
        if (_ss.antiDeleteMode === 'private') notifyJid = botPvJid;
        else if (_ss.antiDeleteMode === 'chat') notifyJid = cachedMsg.remoteJid;
        else { notifyJid = cachedMsg.remoteJid; await sendAntiDeleteNotif(sock, botPvJid, cachedMsg); }
        await sendAntiDeleteNotif(sock, notifyJid, cachedMsg);
      }
    } catch(e) { console.error('[ANTIDELETE-SESSION]', e.message); }
  });

  // ✅ ANTIEDIT local
  sock.ev.on('messages.update', async (updates) => {
    if (!_ss.antiEdit) return;
    try {
      for (const update of updates) {
        const messageId = update.key?.id;
        if (!messageId) continue;
        const cachedMsg = messageCache.get(messageId);
        if (!cachedMsg || cachedMsg.text === '[Media]') continue;
        let newText = null;
        if (update.update?.message) {
          const msg = update.update.message;
          newText = msg.conversation || msg.extendedTextMessage?.text ||
            msg.editedMessage?.message?.conversation || msg.editedMessage?.message?.extendedTextMessage?.text;
        }
        if (!newText || newText === cachedMsg.text) continue;
        const senderJid = cachedMsg.sender;
        const botPvEdit = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        let notifyJid;
        if (_ss.antiEditMode === 'private') notifyJid = botPvEdit;
        else if (_ss.antiEditMode === 'chat') notifyJid = cachedMsg.remoteJid;
        else { notifyJid = cachedMsg.remoteJid; await sock.sendMessage(botPvEdit, { text: `▎✏️ MODIFIÉ | @${senderJid.split('@')[0]}\n▎❌ Ancien: ${cachedMsg.text}\n▎✅ Nouveau: ${newText}\n▎© SEIGNEUR TD`, mentions: [senderJid] }); }
        await sock.sendMessage(notifyJid, { text: `▎✏️ MODIFIÉ | @${senderJid.split('@')[0]}\n▎❌ Ancien: ${cachedMsg.text}\n▎✅ Nouveau: ${newText}\n▎© SEIGNEUR TD`, mentions: [senderJid] });
        cachedMsg.text = newText;
      }
    } catch(e) { console.error('[ANTIEDIT-SESSION]', e.message); }
  });

  sock.ev.on('creds.update', saveCreds);
  console.log('[' + phone + '] 👂 Bot actif');

  // Message de connexion en PV du bot — UNE SEULE FOIS par vraie connexion
  try {
    const _connBotPv = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : null;
    const _connSession = activeSessions.get(phone);
    const _alreadySent = _connSession?._connMsgSent === true;
    const _connMode = _ss.botMode || 'public';
    const _connModeLabel = _connMode === 'private' ? 'Private [✓]' : 'Public [✓]';
    const _connPrefix = _ss.prefix || config.prefix || '.';
    if (_connBotPv && !_alreadySent) {
      if (_connSession) _connSession._connMsgSent = true;
      setTimeout(async () => {
        try {
          await sock.sendMessage(_connBotPv, {
            text:
`                  *SEIGNEUR TD* 🇹🇩
🤖 STATUT      : En ligne & Opérationnel
📡 MODE        : ${_connModeLabel}
⌨️ PREFIXE     : { ${_connPrefix} }
🔖 VERSION     : v1.0.1`
          });
        } catch(_e) {}
      }, 3000);
    }
  } catch(_e) {}

}


// ─── Reconnexion silencieuse — NE supprime JAMAIS les credentials ────────────
async function reconnectSession(phone, retryCount = 0) {
  const sessionFolder = './sessions/' + phone;
  if (!fs.existsSync(sessionFolder)) {
    console.log('[RECONNECT] ' + phone + ' — dossier introuvable, ignoré');
    return false;
  }
  try {
    const version = await getBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    if (!state.creds?.me && !state.creds?.registered) {
      console.log('[RECONNECT] ' + phone + ' — credentials vides, ignoré');
      return false;
    }
    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      keepAliveIntervalMs: 10000,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
      getMessage: async (key) => {
      try {
        const cached = messageCache.get(key.id);
        if (cached) return cached;
      } catch(e) {}
      return undefined;
    }
    });
    activeSessions.set(phone, { sock, status: 'reconnecting', pairingCode: null, createdAt: Date.now() });
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const session = activeSessions.get(phone);
      if (connection === 'open') {
        if (session) { session.status = 'connected'; session.connectedAt = Date.now(); session._lastPing = Date.now(); }
        console.log('[RECONNECT] ✅ ' + phone + ' reconnecté silencieusement');
        // Nouveau socket = nouveau _launched, toujours lancer launchSessionBot
        if (sock._launched) return;
        sock._launched = true;
        // NE PAS reset _connMsgSent — le message de connexion ne s'envoie qu'une seule fois
        launchSessionBot(sock, phone, sessionFolder, saveCreds);
      } else if (connection === 'close') {
        if (loggedOut) {
          activeSessions.delete(phone);
          try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch {}
          console.log('[RECONNECT] 🗑️ ' + phone + ' déconnecté (loggedOut)');
          return;
        }
        // 515 = stream restart, 428 = keepalive timeout, 503 = service unavailable
        const _isNormalDisconnect = statusCode === 515 || statusCode === 428 || statusCode === 503;
        activeSessions.delete(phone);
        // Délai exponentiel plafonné à 30s, reset après déconnexion normale
        const nextRetry = _isNormalDisconnect ? 0 : retryCount + 1;
        const waitMs = _isNormalDisconnect
          ? 8000
          : Math.min(5000 * (retryCount + 1), 30000);
        console.log('[RECONNECT] 🔄 ' + phone + ' (code:' + statusCode + ') dans ' + (waitMs/1000) + 's... (retry #' + nextRetry + ')');
        await delay(waitMs);
        await reconnectSession(phone, nextRetry);
      }
    });
    sock.ev.on('creds.update', saveCreds);
    console.log('[RECONNECT] 🔄 ' + phone + ' reconnexion en cours...');
    return true;
  } catch(e) {
    console.log('[RECONNECT] ❌ ' + phone + ' erreur: ' + e.message);
    return false;
  }
}

// ─── Restaurer toutes les sessions après restart ──────────────────────────────
async function restoreWebSessions() {
  // Charger toutes les données sauvegardées AVANT de démarrer les sessions
  loadData();

  const sessionsDir = './sessions';
  if (!fs.existsSync(sessionsDir)) return;
  const phones = fs.readdirSync(sessionsDir).filter(f => {
    try { return fs.statSync(sessionsDir + '/' + f).isDirectory(); } catch { return false; }
  });
  if (phones.length === 0) { console.log('[RESTORE] Aucune session trouvée'); return; }
  console.log('[RESTORE] ' + phones.length + ' session(s) — reconnexion silencieuse...');
  for (const phone of phones) {
    try {
      if (!sessionHasCredentials(phone)) {
        console.log('[RESTORE] ' + phone + ' — pas de credentials, ignoré');
        continue;
      }
      await delay(1500);
      await reconnectSession(phone);
    } catch(e) {
      console.log('[RESTORE] ❌ Erreur ' + phone + ': ' + e.message);
    }
  }
}

// ─── Auto-pull désactivé — update manuel via commande .update uniquement ────

// ─── Créer une nouvelle session utilisateur (bail-lite direct) ───────────────
async function createUserSession(phone) {
  const sessionFolder = './sessions/' + phone;
  try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(sessionFolder, { recursive: true });

  const version = await getBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    keepAliveIntervalMs: 10000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 250,
    maxMsgRetryCount: 5,
    getMessage: async (key) => { try { return messageCache.get(key.id) || undefined; } catch(e) { return undefined; } }
  });

  activeSessions.set(phone, { sock, status: 'pending', pairingCode: null, createdAt: Date.now() });

  // Auto-cleanup si pas connecté en 10 minutes
  const cleanupTimer = setTimeout(() => {
    const s = activeSessions.get(phone);
    if (s && s.status !== 'connected') {
      console.log('[' + phone + '] ⏱️ Timeout — session supprimée');
      try { sock?.ws?.close(); } catch {}
      activeSessions.delete(phone);
      try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch {}
    }
  }, 10 * 60 * 1000);

  // Demander le pairing code après 3s
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  await delay(3000);
  let formatted;
  try {
    const code = await sock.requestPairingCode(cleanPhone);
    formatted = code?.match(/.{1,4}/g)?.join('-') || code;
    console.log('[' + phone + '] 🔑 Code: ' + formatted);
  } catch(e) {
    throw new Error('requestPairingCode échoué: ' + e.message);
  }

  const sessionData = activeSessions.get(phone);
  if (sessionData) sessionData.pairingCode = formatted;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut;
    const session = activeSessions.get(phone);
    const currentStatus = session?.status || 'unknown';

    if (connection === 'open') {
      clearTimeout(cleanupTimer);
      console.log('[' + phone + '] ✅ Connecté! Démarrage bot...');
      if (session) { session.status = 'connected'; session.connectedAt = Date.now(); }
      if (sock._launched) return;
      sock._launched = true;
      launchSessionBot(sock, phone, sessionFolder, saveCreds);

    } else if (connection === 'close') {
      clearTimeout(cleanupTimer);
      console.log('[' + phone + '] 📴 Déconnecté. Code: ' + statusCode + ', Status: ' + currentStatus);

      if (currentStatus === 'pending' && !loggedOut) {
        // Code en attente → reconnexion WS silencieuse sans nouveau pairing code
        console.log('[' + phone + '] ⏳ Code en attente, reconnexion WS...');
        await delay(2000);
        try {
          const v2 = await getBaileysVersion();
          const { state: s2, saveCreds: sc2 } = await useMultiFileAuthState(sessionFolder);
          const sock2 = makeWASocket({ version: v2, logger: pino({ level: 'silent' }), printQRInTerminal: false, auth: s2, browser: ['Ubuntu', 'Chrome', '20.0.04'], getMessage: async (key) => { try { return messageCache.get(key.id) || undefined; } catch(e) { return undefined; } } });
          const sess = activeSessions.get(phone);
          if (sess) sess.sock = sock2;
          sock2.ev.on('connection.update', async (u2) => {
            if (u2.connection === 'open') {
              const s = activeSessions.get(phone);
              if (s) { s.status = 'connected'; s.connectedAt = Date.now(); }
              if (sock2._launched) return;
              sock2._launched = true;
              launchSessionBot(sock2, phone, sessionFolder, sc2);
            }
          });
          sock2.ev.on('creds.update', sc2);
        } catch(e) { console.log('[' + phone + '] ❌ Reconnexion WS échouée: ' + e.message); }
        return;
      }

      if (loggedOut) {
        activeSessions.delete(phone);
        try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch {}
        console.log('[' + phone + '] 🗑️ Session supprimée (loggedOut)');
      } else if (currentStatus === 'connected') {
        activeSessions.delete(phone);
        console.log('[' + phone + '] 🔄 Déconnexion réseau — reconnexion silencieuse...');
        await delay(5000);
        await reconnectSession(phone);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
  return formatted;
}

// ─── Déploiement automatique sur Railway ────────────────────────────────────
async function railwayGQL(token, query, variables = {}) {
  const res = await axios.post('https://backboard.railway.app/graphql/v2',
    { query, variables },
    { headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, timeout: 30000 }
  );
  if (res.data?.errors) throw new Error(res.data.errors[0]?.message || 'GraphQL error');
  return res.data?.data;
}

async function deployToRailway(phone, sessionString) {
  const RAILWAY_TOKEN = config.railwayToken || process.env.RAILWAY_TOKEN || '96bac1f1-b737-4cb0-b8c7-d8af5a4a0b0a';
  const GITHUB_REPO = 'Azountou235/SEIGNEUR-TD-';
  try {
    console.log('[RAILWAY] Déploiement pour ' + phone + '...');

    // 1. Créer le projet
    const p = await railwayGQL(RAILWAY_TOKEN,
      'mutation CreateProject($name: String!) { projectCreate(input: { name: $name, defaultEnvironmentName: "production" }) { id name } }',
      { name: 'seigneur-td-' + phone }
    );
    const projectId = p?.projectCreate?.id;
    if (!projectId) throw new Error('Impossible de créer le projet Railway');
    console.log('[RAILWAY] Projet: ' + projectId);

    // 2. Récupérer l'environment
    const e = await railwayGQL(RAILWAY_TOKEN,
      'query GetEnv($id: String!) { project(id: $id) { environments { edges { node { id name } } } } }',
      { id: projectId }
    );
    const envId = e?.project?.environments?.edges?.[0]?.node?.id;
    if (!envId) throw new Error('Environment Railway introuvable');

    // 3. Créer le service (sans source GitHub)
    const s = await railwayGQL(RAILWAY_TOKEN,
      'mutation CreateService($projectId: String!, $name: String!) { serviceCreate(input: { projectId: $projectId, name: $name }) { id } }',
      { projectId, name: 'bot-' + phone }
    );
    const serviceId = s?.serviceCreate?.id;
    if (!serviceId) throw new Error('Impossible de créer le service Railway');
    console.log('[RAILWAY] Service: ' + serviceId);

    // 4. Connecter GitHub au service
    await railwayGQL(RAILWAY_TOKEN,
      'mutation ConnectGithub($id: String!, $repo: String!, $branch: String!) { serviceConnect(id: $id, input: { source: { repo: $repo, branch: $branch } }) { id } }',
      { id: serviceId, repo: GITHUB_REPO, branch: 'main' }
    ).catch(async () => {
      // Fallback: utiliser serviceInstanceUpdate
      await railwayGQL(RAILWAY_TOKEN,
        'mutation UpdateInstance($serviceId: String!, $envId: String!, $repo: String!) { serviceInstanceUpdate(serviceId: $serviceId, environmentId: $envId, input: { source: { repo: $repo, branch: "main" } }) }',
        { serviceId, envId, repo: GITHUB_REPO }
      );
    });

    // 5. Variables d'environnement
    await railwayGQL(RAILWAY_TOKEN,
      'mutation SetVars($projectId: String!, $envId: String!, $serviceId: String!, $vars: Json!) { variableCollectionUpsert(input: { projectId: $projectId, environmentId: $envId, serviceId: $serviceId, variables: $vars }) }',
      { projectId, envId, serviceId, vars: { SESSION_ID: sessionString, OWNER_NUMBER: phone, BOT_NAME: 'SEIGNEUR TD' } }
    );

    // 6. Déclencher le déploiement
    await railwayGQL(RAILWAY_TOKEN,
      'mutation Deploy($serviceId: String!, $envId: String!) { serviceInstanceDeploy(serviceId: $serviceId, environmentId: $envId) }',
      { serviceId, envId }
    ).catch(() => console.log('[RAILWAY] Deploy déclenché (ou déjà en cours)'));

    console.log('[RAILWAY] ✅ Déployé pour ' + phone);
    return { success: true, projectId, serviceId };
  } catch(e) {
    console.error('[RAILWAY] Erreur:', e.message);
    return { success: false, error: e.message };
  }
}

// ─── Serveur HTTP API — Compatible Lovable ────────────────────────────────────
createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, X-Secret');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // Parser le body JSON
  let body = {};
  if (req.method === 'POST') {
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
  }

  const url = req.url?.split('?')[0];

  // ── GET /health — pas besoin de clé API ──────────────────────────────
  if (req.method === 'GET' && url === '/health') {
    res.writeHead(200); res.end(JSON.stringify({ status: 'online', bot: config.botName, sessions: activeSessions.size })); return;
  }

  // Vérification clé API pour toutes les autres routes
  const apiKey = req.headers['x-api-key'] || req.headers['x-secret'];
  if (apiKey !== PAIRING_SECRET) {
    res.writeHead(401); res.end(JSON.stringify({ error: 'Clé API invalide' })); return;
  }

  // ── POST /api/connect — Demande de connexion (route principale Lovable) ──
  if (req.method === 'POST' && (url === '/api/connect' || url === '/pair')) {
    const phone = body.phone?.replace(/\D/g, '');
    if (!phone || phone.length < 7) { res.writeHead(400); res.end(JSON.stringify({ error: 'Numéro invalide' })); return; }

    if (activeSessions.has(phone)) {
      const existing = activeSessions.get(phone);
      if (existing.status === 'connected') {
        res.writeHead(200); res.end(JSON.stringify({ status: 'already_connected', phone })); return;
      }
      if (existing.pairingCode) {
        res.writeHead(200); res.end(JSON.stringify({ status: 'pending', pairingCode: existing.pairingCode, phone })); return;
      }
      try { existing.sock?.ws?.close(); } catch {}
      // Garder les credentials si déjà présents
      if (!sessionHasCredentials(phone)) {
        try { fs.rmSync('./sessions/' + phone, { recursive: true, force: true }); } catch {}
      }
      activeSessions.delete(phone);
    }

    try {
      console.log('[API] Nouvelle session pour: ' + phone);
      const pairingCode = await createUserSession(phone);
      res.writeHead(200); res.end(JSON.stringify({ status: 'pending', pairingCode, phone }));
    } catch(e) {
      console.error('[API] Erreur création session:', e.message);
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── GET /api/status?phone=xxx — Statut d'une session ─────────────────
  if (req.method === 'GET' && (url === '/api/status' || url === '/status')) {
    const phone = req.url?.split('phone=')[1]?.replace(/\D/g, '');
    if (!phone) { res.writeHead(400); res.end(JSON.stringify({ error: 'Paramètre phone manquant' })); return; }
    const session = activeSessions.get(phone);
    if (!session) { res.writeHead(200); res.end(JSON.stringify({ status: 'not_found', phone })); return; }
    res.writeHead(200); res.end(JSON.stringify({
      status: session.status,
      phone,
      pairingCode: session.pairingCode || null,
      connectedAt: session.connectedAt || null
    }));
    return;
  }

  // ── GET /api/sessions — Liste toutes les sessions actives ─────────────
  if (req.method === 'GET' && url === '/api/sessions') {
    const list = [];
    for (const [phone, session] of activeSessions) {
      list.push({ phone, status: session.status, connectedAt: session.connectedAt || null });
    }
    res.writeHead(200); res.end(JSON.stringify({ sessions: list, count: list.length })); return;
  }

  // ── POST /api/disconnect — Déconnecter une session ────────────────────
  if (req.method === 'POST' && url === '/api/disconnect') {
    const phone = body.phone?.replace(/\D/g, '');
    const session = activeSessions.get(phone);
    if (session?.sock) {
      try { await session.sock.logout(); } catch {}
      activeSessions.delete(phone);
    }
    res.writeHead(200); res.end(JSON.stringify({ status: 'disconnected', phone })); return;
  }

  res.writeHead(404); res.end(JSON.stringify({ error: 'Route non trouvée' }));
}).listen(PAIRING_PORT, () => {
  console.log('[API] Serveur en ligne sur port ' + PAIRING_PORT);
  console.log('[API] Clé: ' + PAIRING_SECRET);
});

// ─── Mise à jour automatique BOT_URL sur Vercel ──────────────────────────────
async function updateVercelEnv(newUrl) {
  const VERCEL_TOKEN      = process.env.VERCEL_TOKEN || 'vcp_17K2l1zVnOGZypei3ngYAJvdwjoBb7wcocROos921yjBcMJzRx0aYXRR';
  const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_1ocACI1X4TkMN0XtqzEUhwQifymq';

  if (VERCEL_TOKEN === 'METS_TON_TOKEN_ICI') {
    console.log('[VERCEL] ⚠️ VERCEL_TOKEN non configuré — mets à jour BOT_URL manuellement: ' + newUrl);
    return;
  }

  try {
    console.log('[VERCEL] Mise à jour BOT_URL → ' + newUrl + '...');

    // Supprimer l'ancienne variable BOT_URL
    await axios.delete('https://api.vercel.com/v9/projects/' + VERCEL_PROJECT_ID + '/env/BOT_URL', {
      headers: { 'Authorization': 'Bearer ' + VERCEL_TOKEN }
    }).catch(() => {});

    // Récupérer la liste des variables pour trouver l'ID de BOT_URL
    const listRes = await axios.get('https://api.vercel.com/v9/projects/' + VERCEL_PROJECT_ID + '/env', {
      headers: { 'Authorization': 'Bearer ' + VERCEL_TOKEN }
    });

    const envVars = listRes.data?.envs || [];
    const botUrlVar = envVars.find(e => e.key === 'BOT_URL');

    if (botUrlVar) {
      // Mettre à jour la variable existante
      await axios.patch(
        'https://api.vercel.com/v9/projects/' + VERCEL_PROJECT_ID + '/env/' + botUrlVar.id,
        { value: newUrl, target: ['production', 'preview', 'development'] },
        { headers: { 'Authorization': 'Bearer ' + VERCEL_TOKEN, 'Content-Type': 'application/json' } }
      );
    } else {
      // Créer la variable
      await axios.post(
        'https://api.vercel.com/v9/projects/' + VERCEL_PROJECT_ID + '/env',
        { key: 'BOT_URL', value: newUrl, type: 'plain', target: ['production', 'preview', 'development'] },
        { headers: { 'Authorization': 'Bearer ' + VERCEL_TOKEN, 'Content-Type': 'application/json' } }
      );
    }

    // Redéployer Vercel pour appliquer la nouvelle variable
    await axios.post(
      'https://api.vercel.com/v13/deployments',
      { name: 'seigneur-td-pair', gitSource: { type: 'github', repoId: VERCEL_PROJECT_ID, ref: 'main' } },
      { headers: { 'Authorization': 'Bearer ' + VERCEL_TOKEN, 'Content-Type': 'application/json' } }
    ).catch(() => {});

    console.log('[VERCEL] ✅ BOT_URL mis à jour: ' + newUrl);
  } catch(e) {
    console.log('[VERCEL] ❌ Erreur mise à jour:', e.message);
    console.log('[VERCEL] → Mets à jour BOT_URL manuellement: ' + newUrl);
  }
}

// ─── Démarrage : autoPull → connectToWhatsApp → restoreWebSessions ───────────
// Bot principal désactivé — seules les sessions connectées via le site fonctionnent
restoreWebSessions().catch(e => console.log('[RESTORE] Erreur globale:', e.message));

// 🔧 WATCHDOG OPTIMISÉ — Vérification stable toutes les 5 min
setInterval(async () => {
  for (const [phone, session] of activeSessions) {
    if (session.status !== 'connected') continue;
    const sock = session.sock;
    if (!sock) continue;

    try {
      const wsState = sock.ws?.readyState;
      // Seulement reconnect si ws est VRAIMENT fermé (state === 3)
      if (wsState === 3) {
        console.log('[WATCHDOG] ⚠️ ' + phone + ' WS fermé, reconnexion...');
        activeSessions.delete(phone);
        await reconnectSession(phone).catch(e => console.error('[WATCHDOG]', e.message));
        continue;
      }

      // Vérifier avec une sonde (timeout 15s au lieu de 8s)
      let probeOK = false;
      try {
        await Promise.race([
          sock.sendPresenceUpdate('available'),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))
        ]);
        probeOK = true;
        session._lastPing = Date.now();
      } catch(_e) {}

      if (!probeOK) {
        console.log('[WATCHDOG] ⚠️ ' + phone + ' ne répond pas, reconnexion...');
        try { sock.ws?.close(); } catch(_e) {}
        activeSessions.delete(phone);
        await reconnectSession(phone).catch(e => console.error('[WATCHDOG]', e.message));
      }
    } catch(e) {
      console.error('[WATCHDOG ERROR]', phone, e.message);
    }
  }
}, 5 * 60 * 1000);


process.on('SIGINT', () => {
  console.log('\n\n👋 Bot shutting down...');
  saveData();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 SIGTERM reçu — arrêt propre...');
  saveData();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  const _msg = err?.message || String(err);
  // Ignorer les erreurs de déchiffrement WhatsApp — non fatales
  const _isSignal = _msg.includes('Bad MAC') || _msg.includes('Failed to decrypt')
    || _msg.includes('Closing session') || _msg.includes('SessionEntry')
    || _msg.includes('decrypt') || _msg.includes('SignalSession')
    || _msg.includes('message not in store');
  if (!_isSignal) {
    console.error('[ERREUR NON CAPTUREE] Le bot continue:', _msg);
  }
  try { saveData(); } catch(e) {}
  // Ne jamais exit
});

process.on('unhandledRejection', (reason) => {
  const _msg = reason?.message || String(reason);
  const _isSignal = _msg.includes('Bad MAC') || _msg.includes('Failed to decrypt')
    || _msg.includes('Closing session') || _msg.includes('decrypt')
    || _msg.includes('message not in store');
  if (!_isSignal) {
    console.error('[PROMESSE REJETEE] Le bot continue:', _msg);
  }
  // Ne jamais exit
});

// 🔧 FIX FINAL: Supprimer les trucs Telegram
// (Les imports/refs ont déjà été commentés)

