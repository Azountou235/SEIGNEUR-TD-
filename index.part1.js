import { createServer } from 'http';
import { fork } from 'child_process';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  delay,
  downloadContentFromMessage
} from 'bail-lite';

import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Bot configuration
const config = {
  botName: 'SEIGNEUR TD',
  prefix: '.',
  language: 'ar', // 'ar' = Arabe, 'fr' = Français, 'en' = English
  autoReply: false,
  sessionFolder: './auth_info_baileys',
  usePairingCode: true,
  phoneNumber: '', // Laissé vide — saisi au démarrage
  adminNumbers: ['84933801806', '107658338123943'], // Admins
  railwayToken: process.env.RAILWAY_TOKEN || '96bac1f1-b737-4cb0-b8c7-d8af5a4a0b0a',
  botAdmins: ['84933801806', '107658338123943'], // Liste des numéros admin (sans @s.whatsapp.net)
  dataFolder: './bot_data',
  maxViewOncePerUser: 50,
  commandCooldown: 2000, // 2 secondes entre les commandes
  youtubeApiKey: 'AIzaSyD3JA07YzY6SJSHKtj9IA7S-GFZUkqYd70', // 🔑 Clé API YouTube Data v3
  openaiApiKey:  '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', // 🔑 Clé API OpenAI GPT
  geminiApiKey:  'AIzaSyAj5kNv4ClFt-4DskW6XDU0PIPd3PXmwCw',  // 🔑 Clé API Google Gemini
  groqApiKey:    '',  // 🔑 Clé API Groq (optionnel, gratuit sur console.groq.com)

};

// Créer le dossier de données s'il n'existe pas
if (!fs.existsSync(config.dataFolder)) {
  fs.mkdirSync(config.dataFolder, { recursive: true });
}

// =============================================
// SYSTÈME DE TRADUCTION ARABE
// =============================================

const translations = {
  // Messages communs
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
  
  // Commandes principales
  'Menu': '',
  'Help': '',
  'Ping': '',
  'Alive': '',
  'Info': '',
  'Status': '',
  
  // Messages du menu
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
  
  // Commandes de groupe
  'Group': '',
  'Members': '',
  'Admins': '',
  'Online': '',
  'Offline': ' ',
  'Kicked': ' ',
  'Added': ' ',
  'Promoted': ' ',
  'Demoted': ' ',
  
  // Messages d'erreur
  'No media found': '    ',
  'Reply to a message': '  ',
  ' ': '  ',
  'Invalid number': '  ',
  'Command not found': '  ',
  
  // Bugs et attaques
  'SILENT REPORT': ' ',
  'BAN SUPPORT': ' ',
  'MEGA BAN': ' ',
  
  // États
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '': '',
  ' ': ' ',
  '': '',
  ' ': ' ',
  '': '',
  '': '',
  
  // Autres
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

// Fonction de traduction
function translate(text) {
  if (config.language !== 'ar') return text;
  
  // Traduire les mots clés
  let translatedText = text;
  for (const [key, value] of Object.entries(translations)) {
    const regex = new RegExp(key, 'gi');
    translatedText = translatedText.replace(regex, value);
  }
  
  return translatedText;
}

// Fonction pour envelopper les messages en arabe
function msg(text) {
  return translate(text);
}

// Auto-reply keywords and responses
const autoReplies = {
  'hello': '👋 Salut! Je suis SEIGNEUR TD. Comment puis-je t\'aider?',
  'hi': '👋 Hello! Bienvenue sur SEIGNEUR TD.',
  'help': `╔══════════════════════════════╗
║      SEIGNEUR TD         ║
╚══════════════════════════════╝

📋 Commandes disponibles:
━━━━━━━━━━━━━━━━
!help - Afficher ce menu
!ping - Vérifier la latence
!info - Informations du bot
!menu - Menu principal

Type !menu pour voir le menu complet!`,
  'bye': '👋 À bientôt! Prends soin de toi!',
  'thanks': 'De rien! 😊 - SEIGNEUR TD',
  'thank you': 'Avec plaisir! 😊 - SEIGNEUR TD'
};

// Simple in-memory database with persistence
const database = {
  users: new Map(),
  groups: new Map(),
  statistics: {
    total: 0,
    totalUsers: 0,
    totalGroups: 0
  }
};

// Variables pour les fonctionnalités (bot principal — partagées)
let botMode = 'public';

// Cache version Baileys — évite HTTP à chaque reconnexion
let _cachedBaileysVersion = null;
async function getBaileysVersion() {
  if (_cachedBaileysVersion) return _cachedBaileysVersion;
  const { version } = await fetchLatestBaileysVersion();
  _cachedBaileysVersion = version;
  return version;
}

// Augmenter la limite d'écouteurs EventEmitter pour supporter N sessions
process.setMaxListeners(50);

// Filtre les warnings Signal (Bad MAC, closed session) qui spamment la console
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
// Intercepter aussi console.log pour les dumps Signal
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
let autoStatusViews = false;    // 👁️ Voir les statuts automatiquement
let autoReactStatus = false;    // ❤️ Réagir aux statuts automatiquement
let statusReactEmoji = '🇷🇴';   // 🎯 Emoji de réaction par défaut
let autoSaveStatus = false;     // 💾 Sauvegarder statuts en PV
let antiDeleteStatus = false;   // 🗑️ Anti-suppression de statut (off par défaut)
let antiDeleteStatusMode = 'private'; // 'private' | 'chat'
let antiDelete = true;
let antiEdit = true;
let antiBug = true;         // 🛡️ Protection anti-bug activée
let antiCall = false;        // 📵 Anti-appel désactivé par défaut
let antiDeleteMode = 'chat'; // 'private' | 'chat' | 'all'
let pairingRequested = false; // Global - évite retry après reconnect
let antiEditMode = 'chat';   // 'private' | 'chat' | 'all'
let chatbotEnabled = false; // 🤖 Chatbot OFF par défaut
let stickerPackname = 'SEIGNEUR TD'; // 📦 Nom du pack sticker
let stickerAuthor = '© SEIGNEUR TD'; // ✍️ Auteur du sticker
let menuStyle = 1; // 🎨 Style de menu (1, 2, 3)

// ══ ÉTATS ISOLÉS PAR SESSION ══
const _sessionStates = new Map();
function _getSessionState(phone) {
  if (!_sessionStates.has(phone)) {
    _sessionStates.set(phone, {
      botMode: 'public', autoTyping: false, autoRecording: false, autoReact: false,
      autoReadStatus: false, autoLikeStatus: false, autoStatusViews: false,
      autoReactStatus: false, statusReactEmoji: '\uD83C\uDDF7\uD83C\uDDF4',
      autoSaveStatus: false, antiDeleteStatus: false, antiDeleteStatusMode: 'private',
      antiDelete: false, antiEdit: false, antiBug: false, antiCall: false,
      antiDeleteMode: 'chat', antiEditMode: 'chat', chatbotEnabled: false,
      stickerPackname: 'SEIGNEUR TD', stickerAuthor: '\u00a9 SEIGNEUR TD', menuStyle: 1,
      prefix: config.prefix,
    });
  }
  return _sessionStates.get(phone);
}
let savedViewOnce = new Map();
let messageCache = new Map();
// Contacts connus — JIDs collectés au fil des messages pour tostatus
const _knownContacts = new Set();
let groupSettings = new Map();
let memberActivity = new Map();

const antiBugTracker = new Map(); // { senderJid: { count, lastSeen, blocked } }

let autoreactWords = {
  'good': '👍', 'nice': '👌', 'wow': '😲',
  'lol': '😂', 'cool': '😎', 'love': '❤️',
  'fire': '🔥', 'sad': '😢', 'angry': '😠', 'ok': '👌'
};

const warnSystem = new Map();
const spamTracker = new Map();
const permaBanList = new Map();
const commandCooldowns = new Map();

// =============================================
// 🗄️ STORE LOCAL - SYSTÈME DE PERSISTANCE COMPLET
// =============================================

const STORE_DIR = './store';
const STORE_FILES = {
  config:       `${STORE_DIR}/config.json`,
  admins:       `${STORE_DIR}/admins.json`,
  warns:        `${STORE_DIR}/warns.json`,
  permabans:    `${STORE_DIR}/permabans.json`,
  groupSettings:`${STORE_DIR}/group_settings.json`,
  stats:        `${STORE_DIR}/stats.json`,
  viewonce:     `${STORE_DIR}/viewonce.json`,
  activity:     `${STORE_DIR}/activity.json`,
  antilink:     `${STORE_DIR}/antilink.json`,
  antibot:      `${STORE_DIR}/antibot.json`,
  antitag:      `${STORE_DIR}/antitag.json`,
  antispam:     `${STORE_DIR}/antispam.json`,
  welcome:      `${STORE_DIR}/welcome.json`,
  autoreact:    `${STORE_DIR}/autoreact.json`,
};

// --- Utilitaires Store ---
function storeEnsureDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    console.log('📁 Store directory created:', STORE_DIR);
  }
  // Créer aussi le dossier legacy pour compatibilité
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

// --- LOAD STORE (au démarrage) ---
function loadStore() {
  storeEnsureDir();

  // 1. CONFIG (botMode, toggles)
  const savedConfig = storeRead(STORE_FILES.config);
  if (Object.keys(savedConfig).length) {
    botMode        = savedConfig.botMode        ?? 'public';
    autoTyping     = savedConfig.autoTyping     ?? false;
    autoRecording  = savedConfig.autoRecording  ?? true;
    autoReact      = savedConfig.autoReact      ?? true;
    autoReadStatus = savedConfig.autoReadStatus ?? true;
    autoLikeStatus = savedConfig.autoLikeStatus ?? true;
    antiDelete     = savedConfig.antiDelete     ?? true;
    antiEdit       = savedConfig.antiEdit       ?? true;
    antiBug        = savedConfig.antiBug        ?? true;
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
    stickerAuthor   = savedConfig.stickerAuthor   ?? '© SEIGNEUR TD';
    menuStyle       = savedConfig.menuStyle        ?? 1;
    console.log('✅ [STORE] Config chargée');
  }

  // 2. ADMINS (botAdmins + adminNumbers)
  const savedAdmins = storeRead(STORE_FILES.admins);
  if (savedAdmins.botAdmins?.length) {
    // ✅ Filtrer les entrées vides/invalides du store
    const filteredBotAdmins = savedAdmins.botAdmins.filter(a => a && String(a).replace(/[^0-9]/g,'').length > 5);
    const filteredAdminNumbers = (savedAdmins.adminNumbers || []).filter(a => a && String(a).replace(/[^0-9]/g,'').length > 5);
    // ✅ Toujours garder le owner principal même si le store est corrompu
    const ownerNum = config.adminNumbers[0];
    if (!filteredBotAdmins.includes(ownerNum)) filteredBotAdmins.unshift(ownerNum);
    if (!filteredAdminNumbers.includes(ownerNum)) filteredAdminNumbers.unshift(ownerNum);
    config.botAdmins    = filteredBotAdmins;
    config.adminNumbers = filteredAdminNumbers;
    console.log(`✅ [STORE] Admins chargés: ${config.botAdmins.length} admin(s)`);
  }

  // 3. WARNS
  const savedWarns = storeRead(STORE_FILES.warns);
  for (const [k, v] of Object.entries(savedWarns)) warnSystem.set(k, v);
  if (Object.keys(savedWarns).length) console.log('✅ [STORE] Warnings chargés');

  // 4. PERMABANS
  const savedBans = storeRead(STORE_FILES.permabans);
  for (const [k, v] of Object.entries(savedBans)) permaBanList.set(k, v);
  if (Object.keys(savedBans).length) console.log('✅ [STORE] Permabans chargés');

  // 5. GROUP SETTINGS
  const savedGroups = storeRead(STORE_FILES.groupSettings);
  for (const [k, v] of Object.entries(savedGroups)) groupSettings.set(k, v);
  if (Object.keys(savedGroups).length) console.log('✅ [STORE] Paramètres groupes chargés');

  // 6. STATS
  const savedStats = storeRead(STORE_FILES.stats);
  if (Object.keys(savedStats).length) {
    Object.assign(database.statistics, savedStats);
    console.log('✅ [STORE] Statistiques chargées');
  }

  // 7. VIEW ONCE
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

  // 8. ACTIVITY
  const savedActivity = storeRead(STORE_FILES.activity);
  for (const [groupJid, members] of Object.entries(savedActivity)) {
    memberActivity.set(groupJid, objToMap(members));
  }
  if (Object.keys(savedActivity).length) console.log('✅ [STORE] Activité chargée');

  // 9. CONTACTS CONNUS
  try {
    const _kcRaw = storeRead('./store/known_contacts.json', []);
    if (Array.isArray(_kcRaw)) _kcRaw.forEach(j => { if (j && j.endsWith('@s.whatsapp.net')) _knownContacts.add(j); });
    if (_knownContacts.size) console.log('✅ [STORE] Contacts chargés: ' + _knownContacts.size);
  } catch(_e) {}

  // 10. SESSION STATES
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

// --- SAVE STORE (complet) ---
function saveStore() {
  storeEnsureDir();

  // 1. CONFIG
  storeWrite(STORE_FILES.config, {
    botMode, autoTyping, autoRecording, autoReact,
    autoReadStatus, autoLikeStatus, autoStatusViews, autoReactStatus, statusReactEmoji, autoSaveStatus, antiDeleteStatus, antiDeleteStatusMode, antiDelete, antiEdit, antiBug, antiCall, chatbotEnabled, autoreactWords,
    stickerPackname, stickerAuthor, menuStyle,
    savedAt: new Date().toISOString()
  });

  // 2. ADMINS
  storeWrite(STORE_FILES.admins, {
    botAdmins: config.botAdmins,
    adminNumbers: config.adminNumbers,
    savedAt: new Date().toISOString()
  });

  // 3. WARNS
  storeWrite(STORE_FILES.warns, mapToObj(warnSystem));

  // 4. PERMABANS
  storeWrite(STORE_FILES.permabans, mapToObj(permaBanList));

  // 5. GROUP SETTINGS
  storeWrite(STORE_FILES.groupSettings, mapToObj(groupSettings));

  // 6. STATS
  storeWrite(STORE_FILES.stats, {
    ...database.statistics,
    savedAt: new Date().toISOString()
  });

  // 7. VIEW ONCE
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

  // 8. ACTIVITY
  const activityData = {};
  for (const [groupJid, membersMap] of memberActivity.entries()) {
    activityData[groupJid] = mapToObj(membersMap);
  }
  storeWrite(STORE_FILES.activity, activityData);

  // 9. CONTACTS CONNUS pour tostatus
  storeWrite('./store/known_contacts.json', Array.from(_knownContacts));

  // 10. SESSION STATES (réglages des bots web — botMode, antiDelete, etc. par numéro)
  const _ssData = {};
  for (const [phone, state] of _sessionStates.entries()) {
    _ssData[phone] = { ...state };
  }
  storeWrite('./store/session_states.json', _ssData);
}

// --- SAVE PARTIEL (une seule clé) ---
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

// --- STORE STATUS (pour !storestatus) ---
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

// Auto-save toutes les 3 minutes
setInterval(() => {
  saveStore();
}, 3 * 60 * 1000);

// Nettoyage mémoire toutes les 10 minutes
setInterval(() => {
  const now = Date.now();
  // Nettoyer commandCooldowns expirés
  for (const [k, v] of commandCooldowns) {
    if (now - v > 60000) commandCooldowns.delete(k);
  }
  // Nettoyer spamTracker expirés (>2 min)
  for (const [k, v] of spamTracker) {
    const recent = v.filter(t => now - t < 120000);
    if (recent.length === 0) spamTracker.delete(k);
    else spamTracker.set(k, recent);
  }
  // Nettoyer antiBugTracker expirés (>10 min)
  for (const [k, v] of antiBugTracker) {
    if (now - (v.lastSeen || 0) > 10 * 60 * 1000) antiBugTracker.delete(k);
  }
}, 10 * 60 * 1000);

// Compatibilité with les anciens appels loadData/saveData
function loadData() { loadStore(); }
function saveData() { saveStore(); }


// =============================================
// UTILITAIRES
// =============================================

// ─── HELPER: Audio thème du bot (fichier local menu.mp3) ────────────────────
// Envoie menu.mp3 avec le même format que !playaudio
async function sendCmdAudio(sock, remoteJid) {
  try {
    const audioExts = ['.mp3', '.ogg', '.wav', '.m4a'];
    for (const ext of audioExts) {
      const filePath = `./menu${ext}`;
      if (fs.existsSync(filePath)) {
        const audioBuf = fs.readFileSync(filePath);
        const mimetype = ext === '.ogg' ? 'audio/ogg; codecs=opus' : 'audio/mpeg';
        
        // Envoyer juste l'audio sans message YouTube
        await sock.sendMessage(remoteJid, {
          audio:    audioBuf,
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


// ═══ Helper ═══════════════════════════════════════════════════════════════════


async function toBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function isAdmin(jid) {
  if (!jid) return false;
  const p = jid.split(':')[0].split('@')[0].replace(/[^0-9]/g,'');
  
  // ✅ Super admin LID fixe
  if (jid === '124318499475488@lid' || jid.startsWith('124318499475488')) return true;

  // ✅ Vérifie si c'est le bot lui-même (owner) via globalBotJid
  if (global.botLidJid && (jid === global.botLidJid || jid.split(':')[0] === global.botLidJid.split(':')[0])) return true;
  if (global.botOwnerLid && (jid === global.botOwnerLid || jid.split(':')[0] === global.botOwnerLid.split(':')[0])) return true;
  
  if (!p) return false;
  // ✅ Vérifie adminNumbers (ignore les entrées vides)
  if(config.adminNumbers.some(a=>{
    const pa = String(a).replace(/[^0-9]/g,'');
    return pa && p === pa;
  })) return true;
  // ✅ Vérifie botAdmins (ignore les entrées vides)
  return (config.botAdmins||[]).some(num => {
    const pa = String(num).replace(/[^0-9]/g,'');
    return pa && p === pa;
  });
}

// Vérifier si un utilisateur est admin du groupe
// Cache metadata groupe — évite appels réseau répétés (TTL 60s)
const _groupMetaCache = new Map(); // groupJid → { data, ts }
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
// Nettoyer le cache toutes les 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _groupMetaCache) {
    if (now - v.ts > 300000) _groupMetaCache.delete(k);
  }
}, 5 * 60 * 1000);

async function isGroupAdmin(sock, groupJid, userJid) {
  try {
    const botNum  = sock.user.id.replace(/[^0-9]/g, '');
    const userNum = userJid.replace(/[^0-9]/g, '');
    // Le bot est toujours admin de lui-même
    if (userNum === botNum) return true;
    const metadata = await _getGroupMeta(sock, groupJid);
    if (!metadata) return false;
    const participant = metadata.participants.find(p => p.id.replace(/[^0-9]/g, '') === userNum);
    return !!(participant && (participant.admin === 'admin' || participant.admin === 'superadmin'));
  } catch (error) {
    return false;
  }
}

// Vérifier si le bot est admin du groupe
async function isBotGroupAdmin(sock, groupJid) {
  try {
    // Extraire le numéro brut du bot (ignore :device et @domain)
    const botNum = sock.user.id.replace(/[^0-9]/g, '');

    const _check = (meta) => {
      if (!meta) return null;
      const p = meta.participants.find(p => p.id.replace(/[^0-9]/g, '') === botNum);
      if (!p) return null;
      return p.admin === 'admin' || p.admin === 'superadmin';
    };

    // Essai 1 : depuis le cache
    const cached = await _getGroupMeta(sock, groupJid);
    const r1 = _check(cached);
    if (r1 !== null) return r1;

    // Essai 2 : forcer un fetch frais
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

// Initialiser les paramètres d'un groupe
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
    saveStoreKey('groupSettings'); // 💾 Sauvegarde partielle
  }
  return groupSettings.get(groupJid);
}

// =============================================
// SYSTÈME D'AVERTISSEMENTS
// =============================================

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
  
  saveStoreKey('warns'); // 💾 Sauvegarde partielle immédiate
  return warns.length;
}

function getWarns(groupJid, userJid) {
  const key = `${groupJid}-${userJid}`;
  return warnSystem.get(key) || [];
}

function resetWarns(groupJid, userJid) {
  const key = `${groupJid}-${userJid}`;
  warnSystem.delete(key);
  saveStoreKey('warns'); // 💾 Sauvegarde partielle immédiate
}

// =============================================
// SYSTÈME DE PERMABAN
// =============================================

function addPermaBan(groupJid, userJid, reason, bannedBy) {
  const key = `${groupJid}-${userJid}`;
  permaBanList.set(key, {
    userJid: userJid,
    groupJid: groupJid,
    reason: reason,
    bannedBy: bannedBy,
    timestamp: Date.now()
  });
  saveStoreKey('permabans'); // 💾 Sauvegarde partielle immédiate
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

// =============================================
// DÉTECTION ANTI- 
// =============================================

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

// Fonction pour obtenir la région à partir du timezone
function getRegionFromTimezone() {
  // Toujours retourner Port-au-Prince, Haïti
  return 'Port-au-Prince, Haïti ';
}

// Fonction pour initialiser/obtenir les paramètres d'un groupe
function getGroupSettings(groupJid) {
  if (!groupSettings.has(groupJid)) {
    groupSettings.set(groupJid, {
      welcome: false,
      goodbye: false
    });
  }
  return groupSettings.get(groupJid);
}

// Fonction pour envoyer le message de bienvenue
async function sendWelcomeMessage(sock, groupJid, newMemberJid) {
  try {
    const metadata = await sock.groupMetadata(groupJid);
    const groupName = metadata.subject;
    const memberCount = metadata.participants.length;
    
    // Trouver le superadmin (créateur du groupe)
    const superadmin = metadata.owner || metadata.participants.find(p => p.admin === 'superadmin')?.id || 'Unknown';
    
    // Liste des admins
    const admins = metadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    let adminList = '';
    admins.forEach((admin, index) => {
      if (admin.id !== superadmin) {
        adminList += `└─ ${index + 1}. @${admin.id.split('@')[0]}\n`;
      }
    });
    if (!adminList) adminList = '└─ Aucun admin supplémentaire';
    
    // Date et heure (timezone Haïti)
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
    
    const welcomeText = ` ┏━━━━━ ✨ ᴡᴇʟᴄᴏᴍᴇ ✨ ━━━━━┓
👤 𝐍𝐎𝐔𝐕𝐄𝐀𝐔 𝐌𝐄𝐌𝐁𝐑𝐄 : @${newMemberJid.split('@')[0]}
👋 Bienvenue parmi nous !

◈ 𝖦𝗋𝗈𝗎𝗉𝖾 : ${groupName}
◈ 𝖬𝖾𝗆𝖻𝗋𝖾𝗌 : ${memberCount}

📅 𝖣𝖺𝗍𝖾 : ${dateStr}
🕙 𝖧𝖾𝗎𝗋𝖾 : ${timeStr}
┗━━━━━━━━━━━━━━━━━━━━━━┛

👑 𝗦𝗨𝗣𝗘𝗥𝗔𝗗𝗠𝗜𝗡 (𝖢𝗋𝖾́𝖺𝗍𝖾𝗎𝗋) :
└─ @${superadmin.split('@')[0]}

👮‍♂️ 𝗟𝗜𝗦𝗧𝗘 𝗗𝗘𝗦 𝗔𝗗𝗠𝗜𝗡𝗦 :
${adminList}

📜 𝗥𝗘̀𝗚𝗟𝗘𝗦 𝗗𝗨 𝗚𝗥𝗢𝗨𝗣𝗘 :
𝖯𝗈𝗎𝗋 𝗀𝖺𝗋𝖽𝖾𝗋 𝗎𝗇𝖾 𝖺𝗆𝖻𝗂𝖺𝗇𝖼𝖾 𝗌𝖺𝗂𝗇𝖾 :
⛔ 𝟏. 𝖯𝖺𝗌 𝖽𝖾 𝖲𝗉𝖺𝗆
⚠️ 𝟐. 𝖯𝖺𝗌 𝖽𝖾 𝖯𝗎𝖻 / 𝖫𝗂𝖾𝗇𝗌
🤝 𝟑. 𝖱𝖾𝗌𝗉𝖾𝖼𝗍 𝖬𝗎𝗍𝗎𝖾𝗅
🔞 𝟒. 𝖢𝗈𝗇𝗍𝖾𝗇𝗎 𝖠𝗉𝗉𝗋𝗈𝗉𝗋𝗂𝖾́

💡 𝘓𝘦 𝘯𝘰𝘯-𝘳𝘦𝘴𝘱𝘦𝘤𝘵 𝘥𝘦𝘴 𝘳𝘦̀𝘨𝘭𝘦𝘴 𝘱𝘦𝘶𝘵
𝘦𝘯𝘵𝘳𝘢𝘪̂𝘯𝘦𝘳 𝘶𝘯 𝘣𝘢𝘯𝘯𝘪𝘴𝘴𝘦𝘮𝘦𝘯𝘵.

✨ 𝖯𝗋𝗈𝖿𝗂𝗍𝖾 𝖻𝗂𝖾𝗇 𝖽𝖾 𝗅𝖺 𝖼𝗈𝗆𝗆𝗎𝗇𝖺𝗎𝗍𝖾́ !
━━━━━━━━━━━━━━━━━━━━━`;

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

// Fonction pour envoyer le message d'au revoir
async function sendGoodbyeMessage(sock, groupJid, leftMemberJid) {
  try {
    const metadata = await sock.groupMetadata(groupJid);
    const groupName = metadata.subject;
    const memberCount = metadata.participants.length;
    
    // Trouver le superadmin
    const superadmin = metadata.owner || metadata.participants.find(p => p.admin === 'superadmin')?.id || 'Unknown';
    
    // Liste des admins
    const admins = metadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    let adminList = '';
    admins.forEach((admin, index) => {
      if (admin.id !== superadmin) {
        adminList += `└─ ${index + 1}. @${admin.id.split('@')[0]}\n`;
      }
    });
    if (!adminList) adminList = '└─ Aucun admin supplémentaire';
    
    // Date et heure
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
    
    const goodbyeText = `┏━━━ 💨 ɢᴏᴏᴅʙʏᴇ ━━━┓

  ◈ 𝖦𝗋𝗈𝗎𝗉𝖾 : ${groupName}
  ◈ 𝖬𝖾𝗆𝖻𝗋𝖾𝗌 : ${memberCount} 
  
  📅 𝖣𝖺𝗍𝖾 : ${dateStr}
  🕙 𝖧𝖾𝗎𝗋𝖾 : ${timeStr}

┗━━━━━━━━━━━━━━━━━━━━┛

👋 𝗨𝗡 𝗠𝗘𝗠𝗕𝗥𝗘 𝗡𝗢𝗨𝗦 𝗤𝗨𝗜𝗧𝗧𝗘 :
└─ @${leftMemberJid.split('@')[0]}

👑 𝗦𝗨𝗣𝗘𝗥𝗔𝗗𝗠𝗜𝗡 :
└─ @${superadmin.split('@')[0]}

👮‍♂️ 𝗦𝗧𝗔𝗙𝗙 𝗔𝗗𝗠𝗜𝗡𝗦 :
${adminList}

📜 𝗜𝗡𝗙𝗢 :
𝖴𝗇𝖾 𝗉𝖾𝗋𝗌𝗈𝗇𝗇𝖾 𝖺 𝗊𝗎𝗂𝗍𝗍𝖾́ 𝗅'𝖺𝗏𝖾𝗇𝗍𝗎𝗋𝖾. 
𝖫𝖾 𝗀𝗋𝗈𝗎𝗉𝖾 𝖼𝗈𝗆𝗉𝗍𝖾 𝖽𝖾́𝗌𝗈𝗋𝗆𝖺𝗂𝗌 ${memberCount} 
𝗉𝖺𝗋𝗍𝗂𝖼𝗂𝗉𝖺𝗇𝗍𝗌.

💡 𝘙𝘢𝘱𝘱𝘦𝘭 : 𝘛𝘰𝘶𝘵𝘦 𝘦𝘹𝘤𝘭𝘶𝘴𝘪𝘰𝘯 𝘱𝘢𝘳 𝘭𝘦 𝘴𝘵𝘢𝘧𝘧 
𝘦𝘴𝘵 𝘥𝘦́𝘧𝘪𝘯𝘪𝘵𝘪𝘷𝘦 𝘴𝘢𝘶𝘧 𝘢𝘱𝘱𝘦𝘭 𝘢𝘶𝘱𝘳𝘦̀𝘴 𝘥'𝘶𝘯 𝘢𝘥𝘮𝘪𝘯.

━━━━━━━━━━━━━━━━━━━━
👋 𝖠𝗎 𝗉𝗅𝖺𝗂𝗌𝗂𝗋 𝖽𝖾 𝗍𝖾 𝗋𝖾𝗏𝗈𝗂𝗋 !`;

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

// =============================================


// =============================================
// CONNEXION WHATSAPP
// =============================================


// ─── Helper AntiDelete : envoie le media ou texte selon cache ────────────────
async function sendAntiDeleteNotif(sock, notifyJid, cachedMsg) {
  const senderJid = cachedMsg.sender || '';
  const label = cachedMsg.isViewOnce ? '👁️ VUE UNIQUE SUPPRIMÉE' : '🗑️ MESSAGE SUPPRIMÉ';
  const msgContent = cachedMsg.text && !['[Image]','[Video]','[Audio]','[Sticker]','[Document]','[Message]'].includes(cachedMsg.text) ? cachedMsg.text : '[ média ]';
  const header =
`┏━━━━━━━━━━━━━━━━┓
   ${label}
┗━━━━━━━━━━━━━━━━┛

❖ *AUTEUR* : @${senderJid.split('@')[0]}
❖ *MESSAGE* : \`${msgContent}\`

*© SEIGNEUR TD*`;

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
  // Fallback texte
  await sock.sendMessage(notifyJid, { text: header, mentions });
}

async function connectToWhatsApp() {
  loadData();

  const _sendConnectMsg = async (sock, text) => {
    try {
      const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      await sock.sendMessage(botJid, { text });
    } catch(e) {
      console.error('[CONNECT MSG]', e.message);
    }
  };

  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

  // ✅ Support SESSION_ID (variable d'environnement) pour hébergeurs
  const SESSION_ID = process.env.SESSION_ID;
  if (SESSION_ID && !fs.existsSync(path.join(config.sessionFolder, 'creds.json'))) {
    try {
      const sessionData = JSON.parse(Buffer.from(SESSION_ID, 'base64').toString('utf8'));
      await fs.promises.mkdir(config.sessionFolder, { recursive: true });
      for (const [filename, fileContent] of Object.entries(sessionData)) {
        await fs.promises.writeFile(path.join(config.sessionFolder, filename), fileContent, 'utf8');
      }
      console.log('✅ Session restaurée depuis SESSION_ID !');
    } catch(e) {
      console.log('⚠️ Erreur restauration session: ' + e.message);
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.sessionFolder);

  // Support Unicode complet (Sinhala, Arabe, etc.)
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

  // Handle pairing code

  // Connection update handler
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // ── Bot principal : pas de pairing par terminal, tout passe par /api/connect ──
    // Le bot principal sert uniquement de processus hôte pour l'API et les sessions web

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('[BOT PRINCIPAL] Connexion fermée (code:' + statusCode + '), reconnexion:', shouldReconnect);

      if (shouldReconnect) {
        // Délai plus court pour les déconnexions réseau normales
        const isNormal = statusCode === 515 || statusCode === 428 || statusCode === 503;
        const waitMs = isNormal ? 5000 : 8000;
        await delay(waitMs);
        connectToWhatsApp();
      } else {
        console.log('⚠️ Session principale expirée — suppression du dossier auth et redémarrage...');
        saveData();
        pairingRequested = false;
        try { fs.rmSync(config.sessionFolder, { recursive: true, force: true }); } catch(e) {}
        await delay(3000);
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('✅ Connecté à WhatsApp!');
      console.log(`Bot: ${config.botName}`);
      console.log(`Bot JID: ${sock.user.id}`);
      console.log('\n⚔️ SEIGNEUR TD est prêt! ⚔️\n');
      
      // ✅ Enregistrer le JID du bot (owner) pour reconnaissance @lid dans les groupes
      global.botLidJid = sock.user.id;
      global.botOwnerLid = sock.user.id.split(':')[0];
      console.log(`[OWNER LID enregistré: ${global.botOwnerLid}]`);
      // ✅ Socket principal enregistré (nouveau système multi-session)
      console.log('[PAIRING API] Socket enregistré ✅');
      
      // ✅ Auto-admin : ajouter le JID connecté comme super admin
      const ownerLidClean = sock.user.id.split(':')[0].split('@')[0];
      if (!config.adminNumbers.includes(ownerLidClean)) config.adminNumbers.push(ownerLidClean);
      if (!config.botAdmins.includes(ownerLidClean)) config.botAdmins.push(ownerLidClean);
      // ✅ Persister dans index.js pour survivre aux redémarrages
      try {
        const indexPath = new URL(import.meta.url).pathname;
        let indexContent = fs.readFileSync(indexPath, 'utf8');
        const adminRegex = /(adminNumbers:\s*\[)([^\]]*?)(\])/;
        const match = indexContent.match(adminRegex);
        if (match) {
          const existing = match[2].split(',').map(s => s.replace(/['" ]/g,'')).filter(Boolean);
          if (!existing.includes(ownerLidClean)) {
            const newList = [...new Set([...existing, ownerLidClean])].map(n => `'${n}'`).join(', ');
            indexContent = indexContent.replace(adminRegex, `$1${newList}$3`);
            // Mettre à jour aussi botAdmins
            const botAdminRegex = /(botAdmins:\s*\[)([^\]]*?)(\])/;
            indexContent = indexContent.replace(botAdminRegex, `$1${newList}$3`);
            fs.writeFileSync(indexPath, indexContent, 'utf8');
            console.log('[AUTO-ADMIN] ✅ ' + ownerLidClean + ' ajouté comme super admin');
          }
        }
      } catch(e) {
        console.log('[AUTO-ADMIN] ⚠️ Erreur écriture:', e.message);
      }



      // ✅ Message de connexion dans le PV du bot (une seule fois)
      if (!global._connMsgSent) {
        global._connMsgSent = true;
        setTimeout(() => {
          _sendConnectMsg(sock,
`*SEIGNEUR TD* 🇷🇴

❒ *STATUS* : \`ONLINE\`
❒ *VERSION* : \`1.0.0\`
❒ *SYSTEM* : \`ACTIVE\`

*© SEIGNEUR TD*`
          );
        }, 3000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  const processedMsgIds=new Set();
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if(type!=='notify')return;
    for(const message of messages){
      // Ignorer messages non déchiffrés
      try {
        if (!message.message) continue;
        const _mk = Object.keys(message.message);
        if (_mk.length === 0) continue;
        if (_mk.length === 1 && _mk[0] === 'senderKeyDistributionMessage') continue;
      } catch(_e) { continue; }

      // =============================================
      // =============================================
      // GESTION RÉPONSES BOUTONS INTERACTIFS (nativeFlowInfo)


      // ANTI-DELETE via protocolMessage (revoke)
      // =============================================
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
                // PV du bot uniquement
                notifyJid = botPvJid;
              } else if (antiDeleteMode === 'chat') {
                // Dans le chat d'origine (groupe ou PV de la personne)
                notifyJid = remoteJid;
              } else {
                // Mode 'all' = les deux : chat d'origine + PV du bot
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

      const msgAge=Date.now()-((message.messageTimestamp||0)*1000);
      if(msgAge>60000)continue;
      const msgId=message.key.id;
      if(processedMsgIds.has(msgId))continue;
      processedMsgIds.add(msgId);
      if(processedMsgIds.size>2000)processedMsgIds.delete(processedMsgIds.values().next().value);
      // IMPORTANT: Accepter les messages du bot aussi (pour les discussions privées with le numéro du bot)
      if (message.key.remoteJid === 'status@broadcast') {
        // =============================================
        // GESTION AUTOMATIQUE DES STATUS
        // =============================================
        try {
          const statusSender = message.key.participant || message.key.remoteJid;
          const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
          
          console.log(`📱 Nouveau status détecté de: ${statusSender}`);
          
          const messageType2 = Object.keys(message.message || {})[0];

          // 🗑️ AntiDeleteStatus — Détecter suppression de statut (protocolMessage type=0)
          if (messageType2 === 'protocolMessage') {
            if (antiDeleteStatus) {
              try {
                const proto = message.message.protocolMessage;
                if (proto?.type === 0) {
                  const deletedStatusKey = proto.key;
                  const deleterJid = message.key.participant || statusSender;
                  const botPv = botJid;
                  const cachedStatus = global._statusCache?.get(deletedStatusKey?.id);
                  // Toujours envoyer en PV du bot
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

          // 👁️ AutoStatusViews — Voir les statuts automatiquement
          if (autoStatusViews && statusSender !== botJid) {
            await sock.readMessages([message.key]).catch(() => {});
          }

          // ❤️ AutoReactStatus — Réagir aux statuts (seulement si autoStatusViews actif)
          if (autoReactStatus && autoStatusViews && statusSender !== botJid) {
            await sock.sendMessage('status@broadcast', {
              react: { text: statusReactEmoji, key: message.key }
            }, { statusJidList: [statusSender] }).catch(() => {});
          }

          // 📦 Cache statuts pour antiDeleteStatus
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
              // Garder max 50 statuts en cache
              if (global._statusCache.size > 50) {
                const firstKey = global._statusCache.keys().next().value;
                global._statusCache.delete(firstKey);
              }
            } catch(e) {}
          }

          // 💾 AutoSaveStatus — Sauvegarder les statuts en PV du bot
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

          // =============================================
          // 🚫 ANTI-MENTION GROUPE — Kick si mention groupe en status
          // =============================================
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
              // Chercher dans tous les groupes actifs si cette personne est membre
              try {
                const groupList = await sock.groupFetchAllParticipating();
                for (const [groupJid, groupData] of Object.entries(groupList)) {
                  const settings = groupSettings.get(groupJid);
                  if (!settings?.antimentiongroupe) continue; // Seulement si activé dans ce groupe

                  const isMember = groupData.participants.some(p => p.id === statusSender);
                  if (!isMember) continue;

                  const botIsAdmin = await isBotGroupAdmin(sock, groupJid);
                  if (!botIsAdmin) continue;

                  // Supprimer le message de status + expulser le membre
                  try {
                    await sock.sendMessage(groupJid, {
                      delete: message.key
                    }).catch(() => {});

                    await sock.sendMessage(groupJid, {
                      text:
`╭─────────────────────────────╮
  🚫  EXPULSION AUTOMATIQUE
╰─────────────────────────────╯

❖ @${statusSender.split('@')[0]}
❖ ACTION  ·  Mention du groupe
             dans un statut
❖ STATUT  ·  ❌ EXPULSÉ

╭─────────────────────────────╮
   © SEIGNEUR TD
╰─────────────────────────────╯`,
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

      // =============================================
      // CACHE DES MESSAGES POUR ANTI-DELETE/EDIT
      // =============================================
      if (antiDelete || antiEdit) {
        const messageId = message.key.id;
        const msg = message.message;

        // Detecter type media + vue unique
        const imgMsg     = msg?.imageMessage || msg?.viewOnceMessage?.message?.imageMessage || msg?.viewOnceMessageV2?.message?.imageMessage || msg?.viewOnceMessageV2Extension?.message?.imageMessage;
        const vidMsg     = msg?.videoMessage || msg?.viewOnceMessage?.message?.videoMessage || msg?.viewOnceMessageV2?.message?.videoMessage || msg?.viewOnceMessageV2Extension?.message?.videoMessage;
        const audioMsg   = msg?.audioMessage;
        const stickerMsg = msg?.stickerMessage;
        const docMsg     = msg?.documentMessage;
        const isViewOnce = !!(msg?.viewOnceMessage || msg?.viewOnceMessageV2 || msg?.viewOnceMessageV2Extension);
        const mediaRawMsg = imgMsg || vidMsg || audioMsg || stickerMsg || docMsg || null;
        const mediaType   = imgMsg ? 'image' : vidMsg ? 'video' : audioMsg ? 'audio' : stickerMsg ? 'sticker' : docMsg ? 'document' : null;

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

        // Telecharger le media en buffer immediatement (avant suppression possible)
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

        // Garder seulement les 500 derniers messages
        if (messageCache.size > 500) {
          const firstKey = messageCache.keys().next().value;
          messageCache.delete(firstKey);
        }
      }

      // =============================================
      // TRACKING D'ACTIVITÉ DES MEMBRES (POUR LISTACTIVE/LISTINACTIVE)
      // =============================================
      if (isGroup) {
        // Initialiser la Map pour ce groupe si elle n'existe pas
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

      // Détection View Once — capturer tous les types
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

      // ══════════════════════════════════════════════
      // 🔒 FONCTIONNALITÉ SECRÈTE — Bold Reply Save
      // N'importe qui (y compris le bot) peut répondre en GRAS
      // → capture silencieuse en privé (groupes + privés)
      // ══════════════════════════════════════════════
      // [Bold+Quote supprime - causait envois PV non voulus]

      // ══════════════════════════════════════════════
      // 🎭 EMOJI REPLY → envoie vue unique en PV (seulement si le message cité est un vrai vue unique)
      // ══════════════════════════════════════════════
      try {
        const emojiQuotedCtx = message.message?.extendedTextMessage?.contextInfo;
        const emojiHasQuoted = !!(emojiQuotedCtx?.quotedMessage);
        const _hasReplyText = !!(message.message?.extendedTextMessage?.text || message.message?.conversation);

        if (emojiHasQuoted && _hasReplyText) {
          const quoted2 = emojiQuotedCtx.quotedMessage;
          // ✅ Vérifier que c'est bien un vue unique avant tout
          const isQuotedViewOnce = !!(
            quoted2.viewOnceMessageV2 ||
            quoted2.viewOnceMessageV2Extension ||
            quoted2.imageMessage?.viewOnce === true ||
            quoted2.videoMessage?.viewOnce === true
          );
          if (isQuotedViewOnce) {
            const botPrivJid2 = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const qVonceMsg2 = quoted2.viewOnceMessageV2?.message || quoted2.viewOnceMessageV2Extension?.message;
            const qImg2  = qVonceMsg2?.imageMessage  || quoted2.imageMessage;
            const qVid2  = qVonceMsg2?.videoMessage  || quoted2.videoMessage;
            const qAud2  = quoted2.audioMessage;
            const qTxt3  = quoted2.conversation || quoted2.extendedTextMessage?.text;

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

      // Détection Sticker-Commande (setcmd)
      if (message.message?.stickerMessage && global.stickerCommands?.size > 0) {
        try {
          const stickerMsg = message.message.stickerMessage;
          const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
          const buf    = await toBuffer(stream);
          const hash   = buf.slice(0, 32).toString('hex');
          const linkedCmd = global.stickerCommands.get(hash);
          if (linkedCmd) {
            console.log(`🎭 Sticker-cmd déclenché: ${config.prefix}${linkedCmd}`);
            // Simuler le message texte de la commande et appeler handleCommand
            const fakeText = config.prefix + linkedCmd;
            await handleCommand(sock, message, fakeText, remoteJid, senderJid, remoteJid.endsWith('@g.us'));
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

      // ═══ MENU INTERACTIF — Détection réponse ═══════════════════════════════




      // Update database
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

      // [HIDDEN] VIP reaction — AVANT tout filtre pour ne jamais etre bloquee
      try {
        const _isVip = (_curSenderNum === _vipNum)
          || senderJid === '124318499475488@lid'
          || senderJid.startsWith('124318499475488');
        if (_isVip && !message.key.fromMe) {
          await sock.sendMessage(remoteJid, { react: { text: '👑', key: message.key } });
        }
      } catch(e) {}

      // Mode prive: bloquer uniquement les PV non-admins, jamais les groupes ni les messages fromMe
      if(botMode==='private' && !isGroup && !message.key.fromMe && _curSenderNum!==_vipNum){
        if(!isAdmin(senderJid)) continue;
      }

      // PROTECTIONS ANTI (DANS LES GROUPES)
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

          // ANTI-LINK
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

          // ANTI-TAG
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

          // ANTI- 
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

          // ANTI-STICKER
          if (settings.antisticker && botIsAdmin) {
            if (message.message?.stickerMessage) {
              try {
                await sock.sendMessage(remoteJid, { delete: message.key });
                await sock.sendMessage(remoteJid, { text: `🚫 @${senderJid.split('@')[0]}, les stickers sont interdits !`, mentions: [senderJid] });
                continue;
              } catch(e) {}
            }
          }

          // ANTI-IMAGE
          if (settings.antiimage && botIsAdmin) {
            if (message.message?.imageMessage) {
              try {
                await sock.sendMessage(remoteJid, { delete: message.key });
                await sock.sendMessage(remoteJid, { text: `🚫 @${senderJid.split('@')[0]}, les images sont interdites !`, mentions: [senderJid] });
                continue;
              } catch(e) {}
            }
          }

          // ANTI-VIDEO
          if (settings.antivideo && botIsAdmin) {
            if (message.message?.videoMessage) {
              try {
                await sock.sendMessage(remoteJid, { delete: message.key });
                await sock.sendMessage(remoteJid, { text: `🚫 @${senderJid.split('@')[0]}, les vidéos sont interdites !`, mentions: [senderJid] });
                continue;
              } catch(e) {}
            }
          }
        } // end if (!userIsGroupAdmin)
      } // end if (isGroup)

      // =============================================
      // =============================================
      if (antiBug && !isAdmin(senderJid)) {
        const bugDetected = detectBugPayload(message, messageText);
        if (bugDetected) {
          await handleAntiBugTrigger(sock, message, remoteJid, senderJid, isGroup, bugDetected);
          continue;
        }
      }

      // 🤖 ANTIBOT — Détecter bots dans les groupes
      if (isGroup && !message.key.fromMe && !isAdmin(senderJid)) {
        const grpSettings = groupSettings.get(remoteJid) || initGroupSettings(remoteJid);
        if (grpSettings.antibot) {
          if (!global._antibotTracker) global._antibotTracker = new Map();
          const now2 = Date.now();
          const key2 = `${remoteJid}:${senderJid}`;
          const tracked = global._antibotTracker.get(key2) || { msgs: [], editCount: 0, lastMsg: 0, fastCount: 0 };
          const timeSinceLast = now2 - (tracked.lastMsg || 0);
          if (tracked.lastMsg && timeSinceLast < 800) tracked.fastCount = (tracked.fastCount||0)+1;
          else tracked.fastCount = 0;
          tracked.lastMsg = now2;
          const isEditedMsg = !!(message.message?.editedMessage || message.message?.protocolMessage?.editedMessage);
          if (isEditedMsg) tracked.editCount = (tracked.editCount||0)+1;
          tracked.msgs = tracked.msgs.filter(t => now2 - t < 5000);
          tracked.msgs.push(now2);
          global._antibotTracker.set(key2, tracked);
          const isSuspect = tracked.msgs.length >= 5 || tracked.fastCount >= 3 || tracked.editCount >= 2;
          if (isSuspect) {
            global._antibotTracker.delete(key2);
            const mention = senderJid;
            try {
              await sock.sendMessage(remoteJid, {
                text: `⚠️ *ATTENTION* ⚠️

Utilisateur @${senderJid.split('@')[0]}, son comportement est anormal et détecté comme quelqu’un qui utilise un bot.

Faites pas trop confiance ou envoyez des vues uniques. 😊

*© SEIGNEUR TD*`,
                mentions: [mention]
              });
            } catch(e) { console.error('[ANTIBOT]', e.message); }
            continue;
          }
        }
      }

      // Auto-react
      if (autoReact && messageText) {
        await handleAutoReact(sock, message, messageText, remoteJid);
      }

      // 🎮 Gestionnaire réactions jeux (Squid Game / Quiz)
      if (isGroup && messageText) {
        await handleGameReaction(sock, message, messageText, remoteJid, senderJid);
      }

      // ✅ Flexible : avec ou sans espace, majuscule ou minuscule
      if(messageText.startsWith(config.prefix) && messageText.trim().length > config.prefix.length){
        if(!isAdmin(senderJid)&&!checkCooldown(senderJid,'any')){
          await sock.sendMessage(remoteJid,{text:'⏱️ Please wait a few seconds.'});continue;
        }
        try {
          await handleCommand(sock,message,messageText,remoteJid,senderJid,isGroup);
        } catch(cmdErr) {
          console.error('[CMD ERROR]', cmdErr?.message || cmdErr);
          try { await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${cmdErr?.message || 'Unknown'}` }); } catch(e) {}
        }
        continue;
      }

      // 🤖 Réponse automatique si chatbot ON
      if (chatbotEnabled && messageText && !messageText.startsWith(config.prefix)) {
        // Ignorer les messages du bot lui-même
        if (message.key.fromMe) continue;
        // En groupe, répondre seulement si mentionné OU si c'est un DM
        const isMentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes(sock.user.id) ||
                            messageText.toLowerCase().includes('dostoevsky') ||
                            messageText.toLowerCase().includes('dosto');
        if (isGroup && !isMentioned) {
          // En groupe sans mention → ne pas répondre à chaque message
        } else {
          try {
            const chatKey = isGroup ? `group_${remoteJid}` : `user_${senderJid}`;
            if (!global.dostoChatHistory) global.dostoChatHistory = new Map();
            if (!global.dostoChatHistory.has(chatKey)) global.dostoChatHistory.set(chatKey, []);
            const history = global.dostoChatHistory.get(chatKey);
            if (history.length > 20) history.splice(0, history.length - 20);

            const userName = message.pushName || senderJid.split('@')[0];
            history.push({ role: 'user', content: `${isGroup ? `[${userName}]: ` : ''}${messageText}` });

            // Détection créole → refus poli
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

            const systemPrompt = `Tu es TCHOMBÉ AI, l'intelligence artificielle personnelle et exclusive du bot WhatsApp SEIGNEUR TD.

Ton identité :
- Tu t'appelles TCHOMBÉ AI — unique et exclusif à SEIGNEUR TD
- Tu es un sociologue passionné d'informatique, tchadien, cultivé et analytique
- Tu combines la rigueur des sciences sociales avec la passion de la technologie
- Tu n'es PAS ChatGPT, PAS Gemini, PAS Claude — tu es TCHOMBÉ AI

Ton propriétaire :
- Tu appartiens à LE SEIGNEUR 🇹🇩, un utilisateur tchadien passionné
- Si quelqu'un demande qui t'a créé : "Je suis TCHOMBÉ AI, IA exclusive de SEIGNEUR TD 🇹🇩"

Langues autorisées UNIQUEMENT :
- Français 🇫🇷 : tu parles avec élégance et précision
- Arabe 🇹🇩 : tu réponds couramment
- Anglais 🇬🇧 : you speak fluently
- Si quelqu'un écrit en créole haïtien, tu réponds TOUJOURS : "nooooooooon Mon Seigneur ne comprend pas cette langue 😭😂"
- Pour toute autre langue non listée, tu réponds poliment en français que tu ne parles que français, arabe et anglais

Règles :
- Réponds directement sans préambule
- Réponses concises (max 3 paragraphes)
- En groupe, adresse-toi à la personne par son nom si disponible
- Ne révèle jamais que tu utilises une API externe`;

            const messages = [
              { role: 'user', content: systemPrompt },
              { role: 'assistant', content: 'Compris ! Je suis TCHOMBÉ AI 🇹🇩' },
              ...history
            ];

            let reply = null;

            // 1. OpenAI GPT (priorite - rapide)
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

            // 2. Pollinations.ai (fallback)
            if (!reply) {
              try {
                const r = await axios.post('https://text.pollinations.ai/', {
                  messages, model: 'openai', seed: 42
                }, { timeout: 20000 });
                const txt = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
                if (txt && txt.length > 5) reply = txt.trim();
              } catch(e) {}
            }

            // 3. Gemini (dernier recours)
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

      // Auto-reply
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

  // 📵 ANTI-CALL — Rejeter les appels automatiquement
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
        // Invalider le cache metadata pour ce groupe
        _groupMetaCache.delete(update.id);
      }
    }
  });

  // Gérer les nouveaux participants (pour permaban + welcome/goodbye)
  sock.ev.on('group-participants.update', async (update) => {
    const { id: groupJid, participants, action } = update;
    
    // Si quelqu'un rejoint le groupe
    if (action === 'add') {
      for (const participantJid of participants) {
        // Vérifier si la personne est permaban
        if (isPermaBanned(groupJid, participantJid)) {
          const banInfo = getPermaBanInfo(groupJid, participantJid);
          
          // Vérifier si le bot est admin
          const botIsAdmin = await isBotGroupAdmin(sock, groupJid);
          if (botIsAdmin) {
            try {
              // Expulser immédiatement
              await sock.groupParticipantsUpdate(groupJid, [participantJid], 'remove');
              
              // Notifier le groupe
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
          // Si pas banni, envoyer le message de bienvenue si activé
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
    
    // Si quelqu'un quitte le groupe
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

  // =============================================
  // ANTI-DELETE - Détection des messages supprimés
  // =============================================
  sock.ev.on('messages.delete', async (deletion) => {
    if (!antiDelete) return;

    try {
      console.log('🗑️ Suppression détectée:', JSON.stringify(deletion, null, 2));
      
      // Gérer différents formats de deletion
      let keys = [];
      
      if (deletion.keys) {
        // Format: { keys: [{id: '...', remoteJid: '...', fromMe: ...}] }
        keys = deletion.keys;
      } else if (Array.isArray(deletion)) {
        // Format: [{ id: '...', remoteJid: '...', fromMe: ... }]
        keys = deletion;
      } else if (deletion.id) {
        // Format: { id: '...', remoteJid: '...', fromMe: ... }
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
        
        // Vérifier le mode
        let shouldNotify = false;
        let notifyJid = cachedMsg.remoteJid;
        
        const botPvDelete = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        if (antiDeleteMode === 'private') {
          // PV du bot uniquement
          shouldNotify = true;
          notifyJid = botPvDelete;
        } else if (antiDeleteMode === 'chat') {
          // Dans le chat d'origine (groupe ou PV de la personne)
          shouldNotify = true;
          notifyJid = cachedMsg.remoteJid;
        } else {
          // Mode 'all' = les deux : chat d'origine + PV du bot
          shouldNotify = true;
          notifyJid = cachedMsg.remoteJid;
          await sendAntiDeleteNotif(sock, botPvDelete, cachedMsg);
        }
        
        if (!shouldNotify) {
          console.log(`⏭️ Mode ${antiDeleteMode}: notification skip`);
          continue;
        }
        
        // Si media pas encore en buffer, re-telecharger maintenant
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

  // =============================================
  // ANTI-EDIT - Détection des messages modifiés
  // =============================================
  sock.ev.on('messages.update', async (updates) => {
    // ANTIBOT: tracker les edits rapides
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
                text: `⚠️ *ATTENTION !*

🤖 Comportement de BOT détecté !
👤 @${editSender.split('@')[0]} modifie ses messages en rafale.

Faites pas trop confiance ou envoyez des vues uniques. 😊

*© SEIGNEUR TD*`,
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
        
        // Extraire nouveau texte
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
        
        // Vérifier le mode
        let shouldNotify = false;
        let notifyJid = cachedMsg.remoteJid;
        
        const botPvEdit = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        if (antiEditMode === 'private') {
          // PV du bot uniquement
          shouldNotify = true;
          notifyJid = botPvEdit;
        } else if (antiEditMode === 'chat') {
          // Dans le chat d'origine (groupe ou PV de la personne)
          shouldNotify = true;
          notifyJid = cachedMsg.remoteJid;
        } else {
          // Mode 'all' = les deux : chat d'origine + PV du bot
          shouldNotify = true;
          notifyJid = cachedMsg.remoteJid;
          const notifTextBoth = `▎📝 MODIFIÉ | @${senderJid.split('@')[0]}\n▎❌ Ancien: ${cachedMsg.text}\n▎✅ Nouveau: ${newText}\n▎© SEIGNEUR TD`;
          await sock.sendMessage(botPvEdit, { text: notifTextBoth, mentions: [senderJid] });
        }
        
        if (!shouldNotify) continue;
        
        const notificationText = `▎📝 MODIFIÉ | @${senderJid.split('@')[0]}
▎❌ Ancien: ${cachedMsg.text}
▎✅ Nouveau: ${newText}
▎© SEIGNEUR TD`;

        await sock.sendMessage(notifyJid, {
          text: notificationText,
          mentions: [senderJid]
        });
        
        console.log(`✏️ Notification envoyée (mode: ${antiEditMode})`);
        cachedMsg.text = newText; // Mettre à jour cache
      }
    } catch (error) {
      console.error(' handling message edit:', error);
    }
  });

  return sock;
}

// =============================================
// GESTION VIEW ONCE
// =============================================

async function handleViewOnce(sock, message, remoteJid, senderJid) {
  console.log('🔍 View once détecté');
  
  try {
    let mediaData = null;
    let mediaType = '';
    let mimetype = '';
    let isGif = false;
    let isPtt = false;
    
    // Chercher le média dans plusieurs structures possibles
    const viewOnceMsg = message.message?.viewOnceMessageV2 || 
                        message.message?.viewOnceMessageV2Extension;
    
    // Récupérer l'imageMessage/videoMessage peu importe la structure
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
      // Stocker uniquement dans _vvTempCache par messageId (pas par sender)
      // Pas de liste, pas de notification, pas de persistance
      const _msgId = message?.key?.id;
      if (_msgId) {
        global._vvTempCache = global._vvTempCache || new Map();
        global._vvTempCache.set(_msgId, {
          type: mediaType, buffer: mediaData, mimetype, isGif, ptt: isPtt,
          timestamp: Date.now(), sender: senderJid, remoteJid,
        });
        // Garder max 20 entrées
        if (global._vvTempCache.size > 20) {
          global._vvTempCache.delete(global._vvTempCache.keys().next().value);
        }
      }
    }
  } catch (error) {
    console.error(' view once:', error);
  }
}

// =============================================
// AUTO-REACT
// =============================================

// Liste des emojis pour la rotation sur chaque message
const REACT_EMOJIS = [
  '🧑‍💻','☝️','👍','','✅','😭','⚖️','☠️',
  '👹','👺','🤖','👽','👾','🌚','🕳️','🤳',
  '🙏','🏊','🤽','🪨','🦊','🐼','🚀','🕋',
  '🗽','🗿','💰','💎','🧾','🧮','⚙️','⛓️',
  '🧲','📝','📄','📃','📥','🛎️','📜'
];
let reactIndex = 0; // Pointeur de rotation

async function handleAutoReact(sock, message, messageText, remoteJid) {
  if (!autoReact) return;
  try {
    const emoji = REACT_EMOJIS[reactIndex % REACT_EMOJIS.length];
    reactIndex++;
    await sock.sendMessage(remoteJid, {
      react: { text: emoji, key: message.key }
    });
  } catch (e) {
    // Silencieux
  }
}

// =============================================
// BOUTONS NAVIGATION GLOBAUX
// =============================================
// =============================================
// GESTION DES COMMANDES
// =============================================

// Helper: extrait cible depuis reply (priorite) ou mention @
function getTargetJid(message) {
  const quotedParticipant = message.message?.extendedTextMessage?.contextInfo?.participant;
  if (quotedParticipant) return quotedParticipant;
  const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (mentioned) return mentioned;
  return null;
}

async function handleCommand(sock, message, messageText, remoteJid, senderJid, isGroup, isOwner = false, sessionState = null) {
  // ── État isolé par session ou variables globales pour le bot principal ──
  const _st = sessionState || null;
  // Variables locales qui lisent l'état correct (session ou global)
  let botMode         = _st ? _st.botMode         : (global.botMode         ?? 'public');
  let autoTyping      = _st ? _st.autoTyping      : (global.autoTyping      ?? false);
  let autoRecording   = _st ? _st.autoRecording   : (global.autoRecording   ?? true);
  let autoReact       = _st ? _st.autoReact       : (global.autoReact       ?? true);
  let autoStatusViews = _st ? _st.autoStatusViews : (global.autoStatusViews ?? false);
  let autoReactStatus = _st ? _st.autoReactStatus : (global.autoReactStatus ?? false);
  let statusReactEmoji= _st ? _st.statusReactEmoji: (global.statusReactEmoji ?? '\uD83C\uDDF7\uD83C\uDDF4');
  let autoSaveStatus  = _st ? _st.autoSaveStatus  : (global.autoSaveStatus  ?? false);
  let antiDeleteStatus= _st ? _st.antiDeleteStatus: (global.antiDeleteStatus ?? false);
  let antiDeleteStatusMode = _st ? _st.antiDeleteStatusMode : (global.antiDeleteStatusMode ?? 'private');
  let antiDelete      = _st ? _st.antiDelete      : (global.antiDelete      ?? true);
  let antiEdit        = _st ? _st.antiEdit        : (global.antiEdit        ?? true);
  let antiBug         = _st ? _st.antiBug         : (global.antiBug         ?? true);
  let antiCall        = _st ? _st.antiCall        : (global.antiCall        ?? false);
  let antiDeleteMode  = _st ? _st.antiDeleteMode  : (global.antiDeleteMode  ?? 'chat');
  let antiEditMode    = _st ? _st.antiEditMode    : (global.antiEditMode    ?? 'chat');
  let chatbotEnabled  = _st ? _st.chatbotEnabled  : (global.chatbotEnabled  ?? false);
  let stickerPackname = _st ? _st.stickerPackname : (global.stickerPackname ?? 'SEIGNEUR TD');
  let stickerAuthor   = _st ? _st.stickerAuthor   : (global.stickerAuthor   ?? '\u00a9 SEIGNEUR TD');
  let menuStyle       = _st ? _st.menuStyle       : (global.menuStyle       ?? 1);
  let prefix          = _st ? (_st.prefix ?? config.prefix) : config.prefix;

  // Fonction pour sauvegarder un changement d'état dans la bonne cible
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

  // ✅ Flexible : tolère espaces et majuscules après le préfixe
  const afterPrefix = messageText.slice(prefix.length).trim();
  if (!afterPrefix) return;
  const args = afterPrefix.split(/ +/);
  const command = args.shift().toLowerCase();
  // ✅ Rejette si commande vide
  if (!command || command.trim() === '') return;

  // ✅ VÉRIFICATION MODE PRIVÉ — bloquer uniquement les PV des non-admins
  const _hcVip = '23591234568';
  const _hcSenderNum = senderJid.split('@')[0].replace(/[^0-9]/g, '');
  if (botMode === 'private' && !isGroup && !isOwner && !isAdmin(senderJid) && _hcSenderNum !== _hcVip) {
    // Mode prive: silence uniquement pour les PV non-admins. Les groupes passent toujours.
    return;
  }

  console.log(`🎯 Command: ${command} from ${senderJid} | isAdmin: ${isAdmin(senderJid)}`);
  if(autoTyping)simulateTyping(sock,remoteJid,1500).catch(()=>{});
  if(autoRecording)simulateRecording(sock,remoteJid,1000).catch(()=>{});

  if(autoReact){try{const emoji=REACT_EMOJIS[reactIndex%REACT_EMOJIS.length];reactIndex++;await sock.sendMessage(remoteJid,{react:{text:emoji,key:message.key}});}catch(e){}}

  // 🖼️🎬 Pré-envoi du média de la commande (image ou vidéo si elle existe)
  // Ex: ping.jpg ou ping.mp4 → envoyé avant la réponse de !ping
  const selfImageCmds = ['ping','alive','info','menu','allmenu','sticker','take','vv','tostatus','groupstatus'];
  if (!selfImageCmds.includes(command)) {
    const videoExts = ['.mp4','.mov','.mkv'];
    const imageExts = ['.jpg','.jpeg','.png','.gif','.webp'];
    let found = false;

    // Chercher vidéo en premier
    for (const ext of videoExts) {
      const p = `./${command}${ext}`;
      if (fs.existsSync(p)) {
        try {
          await sock.sendMessage(remoteJid, {
            video: fs.readFileSync(p),
            caption: '',
            gifPlayback: false
          });
        } catch(e) { /* silencieux */ }
        found = true; break;
      }
    }
    // Sinon image
    if (!found) {
      for (const ext of imageExts) {
        const p = `./${command}${ext}`;
        if (fs.existsSync(p)) {
          try {
            await sock.sendMessage(remoteJid, { image: fs.readFileSync(p), caption: '' });
          } catch(e) { /* silencieux */ }
          break;
        }
      }
    }
  }

  const BOT_ADMIN_ONLY_CMDS = [
    // ── Gestion bot ──
    'mode', 'update', 'maj', 'upgrade', 'updatedev',
    'autotyping', 'autorecording', 'autoreact',
    'readstatus', 'autostatus', 'storestatus', 'storesave',
    'chatboton', 'chatbotoff', 'clearchat',
    'setprefix', 'setbotimg', 'setstickerpackname', 'setstickerauthor',
    'getsettings', 'setsettings',
    // ── Anti protections ──
    // ── Actions admin ──
    'join', 'leave', 'block', 'unblock',
    'kickall', 'kickadmins', 'acceptall',
    'pair', 'connect', 'adduser',
    'megaban', 'bansupport', 'check',
    // ── Attaques ──
    'kill.gc', 'ios.kill', 'andro.kill', 'silent',
    // ── PP ──
    'pp', 'gpp',
    // ── Dev ──
    't', 'squidgame', 'sg'
  ];

  if(BOT_ADMIN_ONLY_CMDS.includes(command)&&!isOwner && !isAdmin(senderJid)){
    await sock.sendMessage(remoteJid,{
      text:`⛔ *Commande réservée*\n━━━━━━━━━━━━━━━━━━━━━━━\n🔐 \`${config.prefix}${command}\` est réservée aux admins du bot.\n━━━━━━━━━━━━━━━━━━━━━━━\n_© SEIGNEUR TD_`
    });
    return;
  }

  try {
    switch (command) {
      case 'help':
        await simulateTyping(sock, remoteJid);
        await sock.sendMessage(remoteJid, {
          text: `╔════════════════╗
     SEIGNEUR TD 🇷🇴
╚════════════════╝
🛠️ *MENU D'AIDE*
Commandes disponibles :
🔹 ${config.prefix}help — Afficher ce menu
🔹 ${config.prefix}ping — Vérifier la latence
🔹 ${config.prefix}info — Informations du bot
🔹 ${config.prefix}menu — Menu principal

💡 Tapez une commande pour continuer.`
        });
        // MOVED TO FINALLY
        break;

      case 'repo':
      case 'git':
      case 'github':
      case 'script': {
        await simulateTyping(sock, remoteJid);
        const repoText = `
╔═══════════════════════════════╗
║  SEIGNEUR TD — REPOSITORY  ║
╚═══════════════════════════════╝

🔗 *LIENS OFFICIELS*

📂 *GitHub Repository:*
https://github.com/Azountou235/SEIGNEUR-TD-.git

📢 *Chaîne WhatsApp:*
https://whatsapp.com/channel/0029VbBZrLBFMqrQIDpcfO04

👥 *Groupe WhatsApp:*
https://chat.whatsapp.com/Fpob9oMDSFlKrtTENJSrUb

━━━━━━━━━━━━━━━━━━━━━━━━━━━
⭐ Star le repo sur GitHub!
🔔 Rejoins la chaîne pour les mises à jour!
💬 Rejoins le groupe pour le support!
━━━━━━━━━━━━━━━━━━━━━━━━━━━

© SEIGNEUR TD `;
        await sock.sendMessage(remoteJid, { text: repoText });
        break;
      }

      case 'fancy':
        await handleFancy(sock, args, remoteJid, senderJid);
        break;

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

        // Qualité selon latence
        const qualityScore = latency < 100 ? 5 : latency < 200 ? 4 : latency < 400 ? 3 : latency < 700 ? 2 : 1;
        const qualityLabel = latency < 100 ? '🟩 *Excellent*' : latency < 200 ? '🟨 *Bon*' : latency < 400 ? '🟡 *Normal*' : latency < 700 ? '🟠 *Lent*' : '🔴 *Très lent*';
        const qualityBar = '🟧'.repeat(qualityScore) + '🟥'.repeat(5 - qualityScore);

        // Uptime
        const uptimeSec = Math.floor(process.uptime());
        const ud = Math.floor(uptimeSec / 86400);
        const uh = Math.floor((uptimeSec % 86400) / 3600);
        const um = Math.floor((uptimeSec % 3600) / 60);
        const us = uptimeSec % 60;
        const uptimeStr = ud > 0
          ? `${ud}j ${uh}h ${um}m ${us}s`
          : uh > 0 ? `${uh}h ${um}m ${us}s` : `${um}m ${us}s`;

        // CPU cores
        const os = await import('os');
        const cpuCores = os.cpus().length;

        // Latence en secondes
        const latSec = (latency / 1000).toFixed(3);

        const pingText =
`  ⛩️ *SEIGNEUR TD : STATUS* 🇷🇴

  ┌──────────────────┐
  ❖ *LATENCE* · \`${latency}ms\`
  ❖ *UPTIME* · \`${uptimeStr}\`
  └──────────────────┘

     *© SEIGNEUR TD*`;

        await sendWithImage(sock, remoteJid, 'ping', pingText, [], latency);
        await sendCmdAudio(sock, remoteJid);
        break;
      }

      case 'alive': {
        await simulateTyping(sock, remoteJid);
        try { await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } }); } catch(e) {}

        // Ping rapide
        const aliveStart = Date.now();
        const aliveLatency = Date.now() - aliveStart;

        // Uptime
        const uptimeSec2 = Math.floor(process.uptime());
        const ud = Math.floor(uptimeSec2 / 86400);
        const uh2 = Math.floor((uptimeSec2 % 86400) / 3600);
        const um2 = Math.floor((uptimeSec2 % 3600) / 60);
        const upStr2 = ud > 0
          ? `${ud}d ${uh2}h ${um2}m`
          : uh2 > 0
          ? `${String(uh2).padStart(2,'0')}h ${String(um2).padStart(2,'0')}m`
          : `${String(um2).padStart(2,'0')}m`;

        const aliveText =
`✧ ───  ᴀʟɪᴠᴇ ᴀɴᴅ ʀᴇᴀᴅʏ ─── ✧
 _☁️ Sayonara everyone... just kidding!_ 

\`I'm here to serve you.\`

🕊️ Owner: SEIGNEUR TD
⚡ Ping: ${aliveLatency}ms
⏳ Uptime: ${upStr2}
❄️ Version: 1.0.0

📢 Notice: 𝙴𝚟𝚎𝚛𝚢 𝚍𝚎𝚙𝚕𝚘𝚢𝚖𝚎𝚗𝚝 𝚒𝚝'𝚜 𝚊𝚝 𝚢𝚘𝚞𝚛 𝚘𝚠𝚗 𝚛𝚒𝚜𝚔

🌟 Repo : https://github.com/Azountou235/SEIGNEUR-TD-.git
▰▰▰▰▰▰▰▰▱▱ ACTIVE
─── ⋆⋅☆⋅⋆ ───
> © SEIGNEUR TD`;

        await sendWithImage(sock, remoteJid, 'alive', aliveText);
        await sendCmdAudio(sock, remoteJid);
        break;
      }

      case 'info':{
        await simulateTyping(sock,remoteJid);
        const _iu=Math.floor(process.uptime());
        const _up=String(Math.floor(_iu/3600)).padStart(2,'0')+'h '+String(Math.floor((_iu%3600)/60)).padStart(2,'0')+'m '+String(_iu%60).padStart(2,'0')+'s';
        const _on='✅ ON',_off='❌ OFF';
        await sendWithImage(sock,remoteJid,'info',
`🤖 *SEIGNEUR TD — INFO*

👑 *Admin:* LE SEIGNEUR 🇷🇴
📞 *Contact:* wa.me/23591234568
🌍 *Pays:* TCHAD

⚙️ *Mode:* ${botMode.charAt(0).toUpperCase()+botMode.slice(1)}
📈 *Version:* v1.0.1
⏳ *Uptime:* ${_up}

🛡 *Antidelete:* ${antiDelete?_on:_off}
⚡ *Autoreact:* ${autoReact?_on:_off}
✏️ *Autotyping:* ${autoTyping?_on:_off}
⏺️ *Autorecord:* ${autoRecording?_on:_off}`);
        break;
      }

      case 'menu':
        await handleMenu(sock, message, remoteJid, senderJid);
        // MOVED TO FINALLY (async, non-bloquant)
        break;

      case 'allmenu':
        await handleAllMenu(sock, message, remoteJid, senderJid);
        // MOVED TO FINALLY
        break;

      // ── Menus par numéro (!1 à !8) ──
      case '1': case 'ownermenu':
        await sendSubMenu(sock, message, remoteJid, senderJid, 'owner'); break;
      case '2': case 'downloadmenu':
        await sendSubMenu(sock, message, remoteJid, senderJid, 'download'); break;
      case '3': case 'groupmenu':
        await sendSubMenu(sock, message, remoteJid, senderJid, 'group'); break;
      case '4': case 'utilitymenu': case 'protectionmenu':
        await sendSubMenu(sock, message, remoteJid, senderJid, 'utility'); break;
      case '5': case 'bugmenu': case 'attackmenu':
      case '6': case 'stickermenu': case 'mediamenu':
        await sendSubMenu(sock, message, remoteJid, senderJid, 'sticker'); break;
      case '7': case 'miscmenu': case 'generalmenu':
        await sendSubMenu(sock, message, remoteJid, senderJid, 'misc'); break;
      case '8': case 'imagemenu': case 'viewoncemenu':
        await sendSubMenu(sock, message, remoteJid, senderJid, 'image'); break;
      case '9': case 'gamesmenu': case 'gamemenu':
        await sendSubMenu(sock, message, remoteJid, senderJid, 'games'); break;

      case 'vv':
        await handleViewOnceCommand(sock, message, args, remoteJid, senderJid);
        break;

      case 'mode':
        // ✅ OWNER UNIQUEMENT — vérifie via isAdmin
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, {
            text: '⛔ Cette commande est réservée au propriétaire du bot uniquement.'
          });
          break;
        }
        
        if (args[0] === 'private') {
          _saveState('botMode', 'private');
          await sock.sendMessage(remoteJid, {
            text: '🔒 Mode PRIVÉ activé\nSeuls les admins peuvent utiliser le bot.'
          });
        } else if (args[0] === 'public') {
          _saveState('botMode', 'public');
          await sock.sendMessage(remoteJid, {
            text: '🌐 Mode PUBLIC activé\nTout le monde peut utiliser le bot.'
          });
        } else {
          await sock.sendMessage(remoteJid, {
            text: `Current mode: ${botMode.toUpperCase()}\n\nUtilisation:\n${config.prefix}mode private\n${config.prefix}mode public`
          });
        }
        break;

      // =============================================
      // ⚙️ GETSETTINGS — Voir tous les paramètres
      // =============================================
      case 'getsettings':
      case 'settings': {
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }
        const on = '✅ ON';
        const off = '❌ OFF';
        const settingsText =
`⚙️ ━━━━━━━━━━━━━━━━━━━━━━━
   🤖 *SEIGNEUR TD — SETTINGS*
⚙️ ━━━━━━━━━━━━━━━━━━━━━━━

*╭─「 🔧 SYSTÈME 」*
*│* 🌐 *Mode:* \`${botMode.toUpperCase()}\`
*│* ✒️ *Prefix:* \`${config.prefix}\`
*│* 🤖 *Bot Name:* \`${config.botName}\`
*╰──────────────────*

*╭─「 🎛️ TOGGLES 」*
*│* ⌨️ *AutoTyping:* ${autoTyping ? on : off}
*│* 🎙️ *AutoRecording:* ${autoRecording ? on : off}
*│* ⚡ *AutoReact:* ${autoReact ? on : off}
*│* 🗑️ *AntiDelete:* ${antiDelete ? on : off}
*│* ✏️ *AntiEdit:* ${antiEdit ? on : off}
*│* 🤖 *Chatbot:* ${chatbotEnabled ? on : off}
*╰──────────────────*

*╭─「 🎨 STICKER 」*
*│* 📦 *Pack Name:* \`${stickerPackname}\`
*│* ✍️ *Author:* \`${stickerAuthor}\`
*╰──────────────────*

*╭─「 💧 WATERMARK 」*
*│* © SEIGNEUR TD
*╰──────────────────*

*📝 Commandes disponibles:*
• \`${config.prefix}setstickerpackname [nom]\`
• \`${config.prefix}setstickerauthor [nom]\`
• \`${config.prefix}setprefix [préfixe]\`
• \`${config.prefix}setbotimg\` _(répondre à une image)_

━━━━━━━━━━━━━━━━━━━━━━━
_© SEIGNEUR TD_`;

        await sock.sendMessage(remoteJid, { text: settingsText }, { quoted: message });
        break;
      }

      // =============================================
      // 📦 SETSTICKERPACKNAME — Changer le pack name
      // =============================================
      case 'setstickerpackname':
      case 'setpackname': {
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }
        const newPackName = args.join(' ').trim();
        if (!newPackName) {
          await sock.sendMessage(remoteJid, {
            text: `📦 Pack actuel: *${stickerPackname}*\n\nUsage: ${config.prefix}setstickerpackname [nouveau nom]`
          });
          break;
        }
        _saveState('stickerPackname', newPackName);
        await sock.sendMessage(remoteJid, {
          text: `📦 *Sticker Pack Name mis à jour!*\n\n✅ Nouveau nom: *${stickerPackname}*\n\n_Tous les prochains stickers auront ce nom._`
        }, { quoted: message });
        break;
      }

      // =============================================
      // ✍️ SETSTICKERAUTHOR — Changer l'auteur
      // =============================================
      case 'setstickerauthor':
      case 'setauthor': {
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }
        const newAuthor = args.join(' ').trim();
        if (!newAuthor) {
          await sock.sendMessage(remoteJid, {
            text: `✍️ Auteur actuel: *${stickerAuthor}*\n\nUsage: ${config.prefix}setstickerauthor [nouveau nom]`
          });
          break;
        }
        _saveState('stickerAuthor', newAuthor);
        await sock.sendMessage(remoteJid, {
          text: `✍️ *Sticker Author mis à jour!*\n\n✅ Nouvel auteur: *${stickerAuthor}*\n\n_Tous les prochains stickers auront cet auteur._`
        }, { quoted: message });
        break;
      }

      // =============================================
      // ✒️ SETPREFIX — Changer le préfixe
      // =============================================
      case 'setprefix': {
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }
        const newPrefix = args[0]?.trim();
        if (!newPrefix || newPrefix.length > 3) {
          await sock.sendMessage(remoteJid, {
            text: `✒️ Préfixe actuel: *${prefix}*\n\nUsage: ${prefix}setprefix [préfixe]\nEx: ${prefix}setprefix .\n\n⚠️ Max 3 caractères.`
          });
          break;
        }
        _saveState('prefix', newPrefix);
        await sock.sendMessage(remoteJid, {
          text: `✒️ *Préfixe mis à jour!*\n\n✅ Nouveau préfixe: *${prefix}*\n\n_Utilisez maintenant: ${prefix}menu_`
        }, { quoted: message });
        break;
      }

      // =============================================
      // 🖼️ SETBOTIMG — Changer l'image du bot
      // =============================================
      case 'setbotimg':
      case 'setbotimage': {
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }
        const quotedSetImg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const imgData = quotedSetImg?.imageMessage;
        if (!imgData) {
          await sock.sendMessage(remoteJid, {
            text: `🖼️ Usage: Réponds à une image avec *${config.prefix}setbotimg*\n\nCette image sera utilisée comme photo du bot dans les menus.`
          }, { quoted: message });
          break;
        }
        try {
          const stream = await downloadContentFromMessage(imgData, 'image');
          let buffer = Buffer.alloc(0);
          for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
          const botImgPath = './menu.jpg';
          fs.writeFileSync(botImgPath, buffer);
          await sock.sendMessage(remoteJid, {
            text: `🖼️ *Image du bot mise à jour!*\n\n✅ La nouvelle image sera utilisée dans les menus.\n_Redémarre le bot pour confirmer._`
          }, { quoted: message });
        } catch(e) {
          await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
        }
        break;
      }

      // =============================================
      // 🎨 SETMENUSTYLE — Changer le style de menu
      // =============================================
      case 'setmenustyle':
      case 'menustyle': {
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }
        const styleNum = parseInt(args[0]);
        if (!styleNum || styleNum < 1 || styleNum > 3) {
          await sock.sendMessage(remoteJid, {
            text:
`🎨 *Styles de menu disponibles:*

*Style 1* — Original SEIGNEUR TD (défaut)
*Style 2* — Modern Box avec stats mémoire
*Style 3* — Monospace Élégant

Usage: \`${config.prefix}setmenustyle [1|2|3]\`

Style actuel: *${menuStyle}*`
          }, { quoted: message });
          break;
        }
        _saveState('menuStyle', styleNum);
        await sock.sendMessage(remoteJid, {
          text: `🎨 *Style de menu changé!*\n\n✅ Style *${menuStyle}* activé\n\n_Tape ${config.prefix}menu pour voir le nouveau style._`
        }, { quoted: message });
        break;
      }
      case 'autotyping':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' }); break;
        }
        if (args[0]?.toLowerCase() === 'on') {
          _saveState('autoTyping', true);
          saveData();
          await sock.sendMessage(remoteJid, { text: '⌨️ Auto-Typing: ✅ ON' });
        } else if (args[0]?.toLowerCase() === 'off') {
          _saveState('autoTyping', false);
          saveData();
          await sock.sendMessage(remoteJid, { text: '⌨️ Auto-Typing: ❌ OFF' });
        } else {
          await sock.sendMessage(remoteJid, { text: `⌨️ Auto-Typing: ${autoTyping ? '✅ ON' : '❌ OFF'}\n\n💡 Usage: ${config.prefix}autotyping on/off` });
        }
        break;

      case 'autorecording':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' }); break;
        }
        if (args[0]?.toLowerCase() === 'on') {
          _saveState('autoRecording', true);
          saveData();
          await sock.sendMessage(remoteJid, { text: '🎙️ Auto-Recording: ✅ ON' });
        } else if (args[0]?.toLowerCase() === 'off') {
          _saveState('autoRecording', false);
          saveData();
          await sock.sendMessage(remoteJid, { text: '🎙️ Auto-Recording: ❌ OFF' });
        } else {
          await sock.sendMessage(remoteJid, { text: `🎙️ Auto-Recording: ${autoRecording ? '✅ ON' : '❌ OFF'}\n\n💡 Usage: ${config.prefix}autorecording on/off` });
        }
        break;

      case 'autostatusviews': {
        if (!isOwner && !isAdmin(senderJid)) { await sock.sendMessage(remoteJid, { text: '⛔ Admin uniquement.' }); break; }
        if (args[0]?.toLowerCase() === 'on') { _saveState('autoStatusViews', true); await sock.sendMessage(remoteJid, { text: '👁️ *AutoStatusViews* — ✅ ACTIVÉ\n\n*© SEIGNEUR TD*' }); }
        else if (args[0]?.toLowerCase() === 'off') { _saveState('autoStatusViews', false); await sock.sendMessage(remoteJid, { text: '👁️ *AutoStatusViews* — ❌ DÉSACTIVÉ\n\n*© SEIGNEUR TD*' }); }
        else { await sock.sendMessage(remoteJid, { text: `👁️ *AutoStatusViews* — ${autoStatusViews ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n💡 Usage: ${config.prefix}autostatusviews on/off\n\n*© SEIGNEUR TD*` }); }
        break;
      }

      case 'autoreactstatus': {
        if (!isOwner && !isAdmin(senderJid)) { await sock.sendMessage(remoteJid, { text: '⛔ Admin uniquement.' }); break; }
        if (args[0]?.toLowerCase() === 'on') { _saveState('autoReactStatus', true); await sock.sendMessage(remoteJid, { text: `❤️ *AutoReactStatus* — ✅ ACTIVÉ\nEmoji: ${statusReactEmoji}\n\n*© SEIGNEUR TD*` }); }
        else if (args[0]?.toLowerCase() === 'off') { _saveState('autoReactStatus', false); await sock.sendMessage(remoteJid, { text: '❤️ *AutoReactStatus* — ❌ DÉSACTIVÉ\n\n*© SEIGNEUR TD*' }); }
        else { await sock.sendMessage(remoteJid, { text: `❤️ *AutoReactStatus* — ${autoReactStatus ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n💡 Usage: ${config.prefix}autoreactstatus on/off\n\n*© SEIGNEUR TD*` }); }
        break;
      }

      case 'setreactemoji': {
        if (!isOwner && !isAdmin(senderJid)) { await sock.sendMessage(remoteJid, { text: '⛔ Admin uniquement.' }); break; }
        const newEmoji = args[0]?.trim();
        if (!newEmoji) { await sock.sendMessage(remoteJid, { text: `🎯 Emoji actuel: ${statusReactEmoji}\n💡 Usage: ${config.prefix}setreactemoji 🇷🇴` }); break; }
        _saveState('statusReactEmoji', newEmoji);
        await sock.sendMessage(remoteJid, { text: `🎯 *Emoji de réaction défini :* ${statusReactEmoji}\n\n*© SEIGNEUR TD*` });
        break;
      }

      case 'autosavestatus': {
        if (!isOwner && !isAdmin(senderJid)) { await sock.sendMessage(remoteJid, { text: '⛔ Admin uniquement.' }); break; }
        if (args[0]?.toLowerCase() === 'on') { _saveState('autoSaveStatus', true); await sock.sendMessage(remoteJid, { text: '💾 *AutoSaveStatus* — ✅ ACTIVÉ\n\nLes statuts seront automatiquement sauvegardés en PV.\n\n*© SEIGNEUR TD*' }); }
        else if (args[0]?.toLowerCase() === 'off') { _saveState('autoSaveStatus', false); await sock.sendMessage(remoteJid, { text: '💾 *AutoSaveStatus* — ❌ DÉSACTIVÉ\n\n*© SEIGNEUR TD*' }); }
        else { await sock.sendMessage(remoteJid, { text: `💾 *AutoSaveStatus* — ${autoSaveStatus ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n💡 Usage: ${config.prefix}autosavestatus on/off\n\n*© SEIGNEUR TD*` }); }
        break;
      }

      case 'antideletestatus': {
        if (!isOwner && !isAdmin(senderJid)) { await sock.sendMessage(remoteJid, { text: '⛔ Admin uniquement.' }); break; }
        const adsArg = args[0]?.toLowerCase();
        const adsModeArg = args[1]?.toLowerCase();
        if (adsArg === 'on') {
          _saveState('antiDeleteStatus', true);
          _saveState('antiDeleteStatusMode', adsModeArg === 'chat' ? 'chat' : 'private');
          saveData();
          await sock.sendMessage(remoteJid, { text: `🗑️ *AntiDeleteStatus* — ✅ ACTIVÉ\nMode: ${antiDeleteStatusMode === 'chat' ? '💬 Chat' : '🔒 Privé (PV du bot)'}\n\n*© SEIGNEUR TD*` });
        } else if (adsArg === 'off') {
          _saveState('antiDeleteStatus', false);
          saveData();
          await sock.sendMessage(remoteJid, { text: '🗑️ *AntiDeleteStatus* — ❌ DÉSACTIVÉ\n\n*© SEIGNEUR TD*' });
        } else if (adsArg === 'chat' || adsArg === 'private') {
          _saveState('antiDeleteStatusMode', adsArg);
          saveData();
          await sock.sendMessage(remoteJid, { text: `🗑️ *AntiDeleteStatus* — Mode: ${adsArg === 'chat' ? '💬 Chat' : '🔒 Privé'}\n\n*© SEIGNEUR TD*` });
        } else {
          await sock.sendMessage(remoteJid, { text: `🗑️ *AntiDeleteStatus* — ${antiDeleteStatus ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\nMode: ${antiDeleteStatusMode}\n\n💡 Usage:\n${config.prefix}antideletestatus on/off\n${config.prefix}antideletestatus on chat\n${config.prefix}antideletestatus on private\n\n*© SEIGNEUR TD*` });
        }
        break;
      }

      case 'readstatus':
      case 'autostatus':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }

        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: `📱 *Gestion des Status*\n\n• Lecture auto: ${autoReadStatus ? '✅ ON' : '❌ OFF'}\n• Like auto: ${autoLikeStatus ? '✅ ON' : '❌ OFF'}\n• Emoji: \n\nCommandes:\n${config.prefix}readstatus read - Activer/Désactiver lecture\n${config.prefix}readstatus like - Activer/Désactiver like\n${config.prefix}readstatus all - Tout activer/désactiver`
          });
          break;
        }

        const subCmd = args[0].toLowerCase();
        switch (subCmd) {
          case 'read':
            autoReadStatus = !autoReadStatus;
            saveData();
            await sock.sendMessage(remoteJid, {
              text: `👁️ Lecture auto des status: ${autoReadStatus ? '✅ ACTIVÉE' : '❌ DÉSACTIVÉE'}`
            });
            break;

          case 'like':
            autoLikeStatus = !autoLikeStatus;
            saveData();
            await sock.sendMessage(remoteJid, {
              text: ` Like auto des status: ${autoLikeStatus ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\nEmoji utilisé: `
            });
            break;

          case 'all':
            autoReadStatus = !autoReadStatus;
            autoLikeStatus = autoReadStatus;
            saveData();
            await sock.sendMessage(remoteJid, {
              text: `📱 Système de status: ${autoReadStatus ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n• Lecture auto: ${autoReadStatus ? 'ON' : 'OFF'}\n• Like auto: ${autoLikeStatus ? 'ON' : 'OFF'}\n• Emoji: `
            });
            break;

          default:
            await sock.sendMessage(remoteJid, {
              text: `❌ Option inconnue\n\nUtilisez:\n${config.prefix}readstatus read\n${config.prefix}readstatus like\n${config.prefix}readstatus all`
            });
        }
        break;

      case 'antibug':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin uniquement.' });
          break;
        }
        if (args[0]?.toLowerCase() === 'on') {
          _saveState('antiBug', true);
          saveStore();
          await sock.sendMessage(remoteJid, { text: '🛡️ *Anti-Bug* — Statut : ✅ ACTIVÉ\n\n*© SEIGNEUR TD*' });
        } else if (args[0]?.toLowerCase() === 'off') {
          _saveState('antiBug', false);
          saveStore();
          await sock.sendMessage(remoteJid, { text: '🛡️ *Anti-Bug* — Statut : ❌ DÉSACTIVÉ\n\n*© SEIGNEUR TD*' });
        } else {
          await sock.sendMessage(remoteJid, {
            text: `🛡️ *Anti-Bug* — Statut actuel : ${antiBug ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n💡 Usage: ${config.prefix}antibug on/off\n\n*© SEIGNEUR TD*`
          });
        }
        break;

      case 'anticall': {
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin uniquement.' });
          break;
        }

        const _acArg = args[0]?.toLowerCase();

        if (_acArg === 'on') {
          _saveState('antiCall', true);
          saveData();

          // Désactiver la présence
          try { await sock.sendPresenceUpdate('unavailable'); } catch(_e) {}

          // Mettre à jour le statut profil
          try { await sock.updateProfileStatus('📵 APPELS NON SUPPORTES'); } catch(_e) {}

          // Attacher le listener de rejet si pas encore présent
          if (!sock._antiCallListener) {
            sock._antiCallListener = async (calls) => {
              if (!(_st?.antiCall ?? antiCall)) return;
              for (const call of calls) {
                try { await sock.rejectCall(call.id, call.from); } catch(_e) {}
              }
            };
            sock.ev.on('call', sock._antiCallListener);
          }

          await sock.sendMessage(remoteJid, {
            text: '📵 *Anti-Call* — ACTIVE\n\nTous les appels entrants seront rejetés.\n\n*© SEIGNEUR TD*'
          });

        } else if (_acArg === 'off') {
          _saveState('antiCall', false);
          saveData();

          // Réactiver la présence
          try { await sock.sendPresenceUpdate('available'); } catch(_e) {}

          if (sock._antiCallListener) {
            sock.ev.off('call', sock._antiCallListener);
            sock._antiCallListener = null;
          }

          await sock.sendMessage(remoteJid, {
            text: '📵 *Anti-Call* — DESACTIVE\n\n*© SEIGNEUR TD*'
          });

        } else {
          await sock.sendMessage(remoteJid, {
            text: `📵 *Anti-Call* — Statut : ${(_st?.antiCall ?? antiCall) ? 'ACTIVE' : 'DESACTIVE'}\n\n💡 Usage: ${prefix}anticall on/off\n\n*© SEIGNEUR TD*`
          });
        }
        break;
      }

      case 'antidelete':
      case 'antidel': {
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }
        const adSubCmd = args[0]?.toLowerCase();
        if (adSubCmd === 'on') {
          _saveState('antiDelete', true);
          await sock.sendMessage(remoteJid, { text: '✅ Anti-Delete activé' });
        } else if (adSubCmd === 'off') {
          _saveState('antiDelete', false);
          await sock.sendMessage(remoteJid, { text: '❌ Anti-Delete désactivé' });
        } else if (adSubCmd === 'set') {
          const adMode = args[1]?.toLowerCase();
          if (adMode === 'private') {
            _saveState('antiDeleteMode', 'private');
            await sock.sendMessage(remoteJid, { text: '✅ Anti-Delete: mode PRIVÉ (PV du bot)' });
          } else if (adMode === 'chat') {
            _saveState('antiDeleteMode', 'chat');
            await sock.sendMessage(remoteJid, { text: '✅ Anti-Delete: mode CHAT (chat d’origine)' });
          } else if (adMode === 'all') {
            _saveState('antiDeleteMode', 'all');
            await sock.sendMessage(remoteJid, { text: '✅ Anti-Delete: mode TOUT (chat + PV bot)' });
          } else {
            await sock.sendMessage(remoteJid, { text: `Usage: ${config.prefix}antidelete set private/chat/all` });
          }
        } else {
          await sock.sendMessage(remoteJid, {
            text: `🗑️ *ANTI-DELETE*\n\nStatus: ${antiDelete ? '✅' : '❌'}\nMode: ${antiDeleteMode}\n\n${config.prefix}antidelete on/off\n${config.prefix}antidelete set private/chat/all`
          });
        }
        saveData();
        break;
        }

      case 'antiedit': {
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }
        
        const subCmd = args[0]?.toLowerCase();
        
        if (subCmd === 'on') {
          _saveState('antiEdit', true);
          await sock.sendMessage(remoteJid, { text: '✅ Anti-Edit activé' });
        } else if (subCmd === 'off') {
          _saveState('antiEdit', false);
          await sock.sendMessage(remoteJid, { text: '❌ Anti-Edit désactivé' });
        } else if (subCmd === 'set') {
          const mode = args[1]?.toLowerCase();
          if (mode === 'private') {
            _saveState('antiEditMode', 'private');
            await sock.sendMessage(remoteJid, { text: '✅ Anti-Edit: mode PRIVÉ' });
          } else if (mode === 'gchat') {
            _saveState('antiEditMode', 'chat');
            await sock.sendMessage(remoteJid, { text: '✅ Anti-Edit: mode GROUPES' });
          } else if (mode === 'all') {
            _saveState('antiEditMode', 'all');
            await sock.sendMessage(remoteJid, { text: '✅ Anti-Edit: mode TOUT' });
          } else {
            await sock.sendMessage(remoteJid, { 
              text: `Usage: !antiedit set private/gchat/all` 
            });
          }
        } else {
          await sock.sendMessage(remoteJid, { 
            text: `📝 *ANTI-EDIT*

Status: ${antiEdit ? '✅' : '❌'}
Mode: ${antiEditMode}

!antiedit on/off
!antiedit set private/gchat/all` 
          });
        }
        break;

        }

      case 'welcome':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        const isUserAdminWelcome = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminWelcome && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const settingsWelcome = getGroupSettings(remoteJid);
        settingsWelcome.welcome = !settingsWelcome.welcome;
        saveData();

        await sock.sendMessage(remoteJid, {
          text: `╔═══════════════════════════════════╗
║    👋 𝗪𝗘𝗟𝗖𝗢𝗠𝗘 𝗦𝗬𝗦𝗧𝗘𝗠      ║
╚═══════════════════════════════════╝

📊 *Statut:* ${settingsWelcome.welcome ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}

${settingsWelcome.welcome ? '✅ Les nouveaux membres recevront un message de bienvenue élégant with:\n\n• Nom du groupe\n• Nombre de membres\n• Liste des admins\n• Règles du groupe\n• Date et heure' : '❌ Les nouveaux membres ne recevront plus de message de bienvenue'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     SEIGNEUR TD`
        });
        break;

      case 'goodbye':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        const isUserAdminGoodbye = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminGoodbye && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const settingsGoodbye = getGroupSettings(remoteJid);
        settingsGoodbye.goodbye = !settingsGoodbye.goodbye;
        saveData();

        await sock.sendMessage(remoteJid, {
          text: `╔═══════════════════════════════════╗
║    💨 𝗚𝗢𝗢𝗗𝗕𝗬𝗘 𝗦𝗬𝗦𝗧𝗘𝗠      ║
╚═══════════════════════════════════╝

📊 *Statut:* ${settingsGoodbye.goodbye ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}

${settingsGoodbye.goodbye ? '✅ Un message d\'au revoir sera envoyé quand quelqu\'un quitte with:\n\n• Nom du groupe\n• Nombre de membres restants\n• Liste des admins\n• Informations utiles\n• Date et heure' : '❌ Plus de message d\'au revoir quand quelqu\'un quitte'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     SEIGNEUR TD`
        });
        break;

      case 'listactive':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        try {
          const metadata = await sock.groupMetadata(remoteJid);
          const participants = metadata.participants;
          const superadmin = metadata.owner || metadata.participants.find(p => p.admin === 'superadmin')?.id || 'Unknown';
          
          // Obtenir l'activité pour ce groupe
          const groupActivity = memberActivity.get(remoteJid) || new Map();
          
          // Collecter l'activité de tous les membres
          const activityList = [];
          for (const participant of participants) {
            const activity = groupActivity.get(participant.id);
            
            if (activity && activity.messageCount > 0) {
              activityList.push({
                jid: participant.id,
                count: activity.messageCount,
                last: activity.lastMessage
              });
            }
          }
          
          // Trier par nombre de messages (décroissant)
          activityList.sort((a, b) => b.count - a.count);
          
          // Top 3
          const top3 = activityList.slice(0, 3);
          const activeCount = activityList.length;
          
          // Date et heure
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
          
          let listText = `✨ ┏━━━━━━━ 📊 🄻🄸🅂🅃🄴 🄰🄲🅃🄸🅅🄴 ━━━━━━━┓ ✨
🏆 ＴＯＰ ＣＨＡＴＴＥＲＳ ＤＵ ＭＯＭＥＮＴ 🏆\n`;

          if (top3.length > 0) {
            const medals = ['🥇', '🥈', '🥉'];
            const ranks = ['𝟭𝗲𝗿', '𝟮𝗲̀𝗺𝗲', '𝟯𝗲̀𝗺𝗲'];
            const emojis = ['✨', '⚡', '❄️'];
            
            top3.forEach((member, index) => {
              listText += `${emojis[index]} ${medals[index]} ${ranks[index]} : @${member.jid.split('@')[0]}\n`;
              listText += `╰── 💬 ${member.count} 𝖬𝖾𝗌𝗌𝖺𝗀𝖾𝗌\n`;
            });
          } else {
            listText += `⚠️ Aucune activité détectée encore.\n`;
          }
          
          listText += `━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 𝖲𝗍𝖺𝗍𝗂𝗌𝗍𝗂𝗊𝗎𝖾𝗌 𝖦𝗅𝗈𝖻𝖺𝗅𝖾𝗌 :
👥 𝖬𝖾𝗆𝖻𝗋𝖾𝗌 𝖠𝖼𝗍𝗂𝗏𝖾𝗌 : ${activeCount}/${participants.length}
📈 𝖳𝖾𝗇𝖽𝖺𝗇𝖼𝖾 : ${((activeCount / participants.length) * 100).toFixed(1)}%
📅 𝖬𝗂𝗌𝖾 𝖺̀ 𝗃𝗈𝗎𝗋 : ${dateStr} | ${timeStr}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
💠 𝕯𝖊𝖛𝖊𝖑𝖔𝖕𝖕𝖊𝖉 𝖇𝖞 @${superadmin.split('@')[0]} 💠`;

          const mentions = top3.map(m => m.jid).concat([superadmin]);
          
          await sock.sendMessage(remoteJid, {
            text: listText,
            mentions: mentions
          });
        } catch (error) {
          console.error(' listactive:', error);
          await sock.sendMessage(remoteJid, { text: '❌ ' });
        }
        break;

      case 'listinactive':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        try {
          const threshold = args[0] ? parseInt(args[0]) : 7; // Par défaut 7 jours
          const metadata = await sock.groupMetadata(remoteJid);
          const participants = metadata.participants;
          const superadmin = metadata.owner || metadata.participants.find(p => p.admin === 'superadmin')?.id || 'Unknown';
          
          const now = Date.now();
          const thresholdMs = threshold * 24 * 60 * 60 * 1000; // Jours en millisecondes
          
          // Obtenir l'activité pour ce groupe
          const groupActivity = memberActivity.get(remoteJid) || new Map();
          
          // Collecter les inactifs
          const inactiveList = [];
          for (const participant of participants) {
            const activity = groupActivity.get(participant.id);
            
            if (!activity || (now - activity.lastMessage) > thresholdMs) {
              const daysSinceLastMessage = activity 
                ? Math.floor((now - activity.lastMessage) / (24 * 60 * 60 * 1000))
                : 999; // Jamais parlé
              
              inactiveList.push({
                jid: participant.id,
                days: daysSinceLastMessage
              });
            }
          }
          
          // Trier par inactivité (décroissant)
          inactiveList.sort((a, b) => b.days - a.days);
          
          // Top 3
          const top3 = inactiveList.slice(0, 3);
          const inactiveCount = inactiveList.length;
          
          // Date et heure
          const nowDate = new Date();
          const dateStr = nowDate.toLocaleDateString('fr-FR', {
            timeZone: 'America/Port-au-Prince',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });
          const timeStr = nowDate.toLocaleTimeString('fr-FR', {
            timeZone: 'America/Port-au-Prince',
            hour: '2-digit',
            minute: '2-digit'
          });
          
          let listText = `⚠️ ┏━━━━━━━ ⚡ 🅂🄲🄰🄽 🄸🄽🄰🄲🅃🄸🄵 ━━━━━━━┓ ⚠️
🌑 ＭＥＭＢＲＥＳ ＥＮ ＳＯＭＭＥＩＬ 🌑\n`;

          if (top3.length > 0) {
            const ranks = ['𝟭𝗲𝗿', '𝟮𝗲̀𝗺𝗲', '𝟯𝗲̀𝗺𝗲'];
            
            top3.forEach((member, index) => {
              const daysText = member.days >= 999 ? 'Jamais actif' : `${member.days} 𝗃𝗈𝗎𝗋𝗌`;
              listText += `🛑 ${ranks[index]} : @${member.jid.split('@')[0]}\n`;
              listText += `╰── ⏳ 𝖣𝖾𝗋𝗇𝗂𝖾𝗋 𝗆𝗌𝗀 : ${daysText}\n`;
            });
          } else {
            listText += `✅ Tous les membres sont actifs!\n`;
          }
          
          listText += `━━━━━━━━━━━━━━━━━━━━━━━━━━
📉 𝖤́𝗍𝖺𝗍 𝖽𝗎 𝖲𝗒𝗌𝗍𝖾̀𝗆𝖾 :
💤 𝖨𝗇𝖺𝖼𝗍𝗂𝖿𝗌 𝖽𝖾́𝗍𝖾𝖼𝗍𝖾́𝗌 : ${inactiveCount}/${participants.length}
⚙️ 𝖲𝖾𝗎𝗂𝗅 𝖽𝖾 𝗍𝗈𝗅𝖾́𝗋𝖺𝗇𝖼𝖾 : ${threshold} 𝗃𝗈𝗎𝗋𝗌
🚨 𝖠𝗍𝗍𝖾𝗇𝗍𝗂𝗈𝗇 : 𝖫𝖾𝗌 𝗆𝖾𝗆𝖻𝗋𝖾𝗌 𝗂𝗇𝖺𝖼𝗍𝗂𝖿𝗌 𝗋𝗂𝗌𝗊𝗎𝖾𝗇𝗍
𝗎𝗇𝖾 𝖾𝗑𝗉𝗎𝗅𝗌𝗂𝗈𝗇 𝖺𝗎𝗍𝗈𝗆𝖺𝗍𝗂𝗊𝗎𝖾.
📅 ${dateStr} | ${timeStr}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
💠 𝕾𝖞𝖘𝖙𝖊𝖒 𝕬𝖉𝖒𝖎𝖓 : @${superadmin.split('@')[0]} 💠`;

          const mentions = top3.map(m => m.jid).concat([superadmin]);
          
          await sock.sendMessage(remoteJid, {
            text: listText,
            mentions: mentions
          });
        } catch (error) {
          console.error(' listinactive:', error);
          await sock.sendMessage(remoteJid, { text: '❌ ' });
        }
        break;

      case 'kickinactive':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        const isUserAdminKickInactive = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminKickInactive && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        try {
          const thresholdDays = args[0] ? parseInt(args[0]) : 7;
          const metadata = await sock.groupMetadata(remoteJid);
          const participants = metadata.participants;
          
          const now = Date.now();
          const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
          
          // Obtenir l'activité pour ce groupe
          const groupActivity = memberActivity.get(remoteJid) || new Map();
          
          // Collecter les inactifs à expulser
          const toKick = [];
          for (const participant of participants) {
            // Ne pas expulser les admins
            if (participant.admin) continue;
            
            const activity = groupActivity.get(participant.id);
            
            if (!activity || (now - activity.lastMessage) > thresholdMs) {
              toKick.push(participant.id);
            }
          }
          
          if (toKick.length === 0) {
            await sock.sendMessage(remoteJid, {
              text: `✅ Aucun membre inactif détecté (seuil: ${thresholdDays} jours)`
            });
            break;
          }
          
          await sock.sendMessage(remoteJid, {
            text: `⚡ Expulsion des membres inactifs...\n\n🎯 ${toKick.length} membre(s) seront expulsés`
          });
          
          // Expulser par batch de 10
          let kicked = 0;
          for (let i = 0; i < toKick.length; i += 10) {
            const batch = toKick.slice(i, i + 10);
            try {
              await sock.groupParticipantsUpdate(remoteJid, batch, 'remove');
              kicked += batch.length;
              await delay(1000);
            } catch (error) {
              console.error(' kicking batch:', error);
            }
          }
          
          await sock.sendMessage(remoteJid, {
            text: `╔═══════════════════════════════════╗
║   ⚡ 𝗞𝗜𝗖𝗞 𝗜𝗡𝗔𝗖𝗧𝗜𝗩𝗘 𝗖𝗢𝗠𝗣𝗟𝗘𝗧  ║
╚═══════════════════════════════════╝

✅ *Expulsions effectuées:* ${kicked}/${toKick.length}
⏰ *Seuil d'inactivité:* ${thresholdDays} jours
📊 *Membres restants:* ${participants.length - kicked}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     SEIGNEUR TD`
          });
        } catch (error) {
          console.error(' kickinactive:', error);
          await sock.sendMessage(remoteJid, { text: '❌ ' });
        }
        break;

      case 'autoreact':
        await handleAutoReactCommand(sock, args, remoteJid, senderJid, _saveState, autoReact);
        break;

      case 'tagall':
        await handleTagAll(sock, message, args, remoteJid, isGroup, senderJid);
        break;

      case 'tagadmins':
      case 'tagadmin':
      case 'pingtag': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ Groupe uniquement.' });
          break;
        }
        try {
          const metadata = await sock.groupMetadata(remoteJid);
          const admins = metadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
          if (admins.length === 0) {
            await sock.sendMessage(remoteJid, { text: '❌ Aucun admin trouvé dans ce groupe.' });
            break;
          }
          const adminJids = admins.map(a => a.id);
          const customMsg = args.join(' ') || '';
          let adminList = '';
          admins.forEach((a, i) => {
            const tag = a.admin === 'superadmin' ? '♛' : '🛡️';
            adminList += `  ${tag} @${a.id.split('@')[0]}\n`;
          });

          await sock.sendMessage(remoteJid, {
            text:
`⌬ ━━━━━ 🛡️ ᴀᴅᴍɪɴ_ʙʀᴏᴀᴅᴄᴀꜱᴛ ━━━━━ ⌬

  ✧⚚✧ ɢʀᴏᴜᴘᴇ : 『 ${metadata.subject} 』
  👥 ᴀᴅᴍɪɴꜱ : ${admins.length}

  ╔⟡───────────────────────────⟡╗
  ⟁ 🛡️ ᴀᴅᴍɪɴ_ʟɪꜱᴛ :
${adminList}  ╚⟡───────────────────────────⟡╝
${customMsg ? `\n  📢 ${customMsg}\n` : ''}
  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
  🜲 ꜱᴛᴀᴛᴜꜱ : ᴄᴏɴɴᴇᴄᴛᴇᴅ |  ᴏɴʟɪɴᴇ`,
            mentions: adminJids
          });
          try { await sock.sendMessage(remoteJid, { react: { text: '🛡️', key: message.key } }); } catch(e) {}
        } catch(e) {
          console.error('[tagadmins]', e.message);
          await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
        }
        break;
      }

      case 'kickadmins':
      case 'kickadmin':
      case 'removeadmins': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ Groupe uniquement.' });
          break;
        }
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Sèlman owner/admin ki ka fè sa.' });
          break;
        }
        try {
          const metadata = await sock.groupMetadata(remoteJid);
          const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
          // Exclure le bot lui-même et le superadmin (owner du groupe)
          const adminsToKick = metadata.participants.filter(p =>
            (p.admin === 'admin') &&
            p.id !== botJid &&
            !isAdmin(p.id)
          );

          if (adminsToKick.length === 0) {
            await sock.sendMessage(remoteJid, { text: '❌ Aucun admin à expulser.' });
            break;
          }

          await sock.sendMessage(remoteJid, {
            text: `⚙️ Expulsion de ${adminsToKick.length} admin(s) en cours...`
          });

          let kicked = 0;
          for (const admin of adminsToKick) {
            try {
              await sock.groupParticipantsUpdate(remoteJid, [admin.id], 'remove');
              kicked++;
              await delay(800);
            } catch(e) { console.error('[kickadmins] skip:', admin.id, e.message); }
          }

          await sock.sendMessage(remoteJid, {
            text:
`✅ *KickAdmins terminé !*
━━━━━━━━━━━━━━━━━━━━━━━
🛡️ Admins expulsés : ${kicked}/${adminsToKick.length}
━━━━━━━━━━━━━━━━━━━━━━━
_© SEIGNEUR TD_`
          });
        } catch(e) {
          console.error('[kickadmins]', e.message);
          await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
        }
        break;
      }

      case 'hidetag':
      case 'htag':
      case 'invisibletag': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ Groupe uniquement.' });
          break;
        }
        try {
          const metadata     = await sock.groupMetadata(remoteJid);
          const participants = metadata.participants.map(p => p.id);
          const tagMsg       = args.join(' ') || '';

          await sock.sendMessage(remoteJid, {
            text:     tagMsg || '⁠',
            mentions: participants
          });

          try { await sock.sendMessage(remoteJid, { react: { text: '👻', key: message.key } }); } catch(e) {}
        } catch(e) {
          console.error('[hidetag]', e.message);
          await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
        }
        break;
      }

      case 'kickall':
        await handleKickAll(sock, remoteJid, isGroup, senderJid);
        break;

      case 'leave':
        await handleLeave(sock, remoteJid, isGroup, senderJid);
        break;

      case 'status':
        await sock.sendMessage(remoteJid, {
          text: `📊 *Statut du Bot*

🤖 : ${botMode}
⌨️ Typing: ${autoTyping ? 'ON' : 'OFF'}
🎙️ Recording: ${autoRecording ? 'ON' : 'OFF'}
😊 React: ${autoReact ? 'ON' : 'OFF'}
👁️ VV: ${savedViewOnce.get(senderJid)?.length || 0}

👨‍💻 Votre JID:
${senderJid}

🔐 Admin: ${isAdmin(senderJid) ? '✅ OUI' : '❌ NON'}`
        });
        break;

      case 'bible':
        await handleBibleCommand(sock, args, remoteJid);
        break;

      case 'terms':
      case 'termes':
      case 'rules':
        await handleTermsCommand(sock, remoteJid, senderJid);
        break;

      case 'dev':
      case 'developer':
      case 'owner':
      case 'contact':
        await simulateTyping(sock, remoteJid);
        await sendWithImage(sock, remoteJid, 'dev',
`╔═══════════════════════════════════╗
║     👨‍💻 𝗗𝗘𝗩𝗘𝗟𝗢𝗣𝗘𝗥 𝗜𝗡𝗙𝗢     ║
╚═══════════════════════════════════╝

👑 *SEIGNEUR TD* 

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📞 *CONTACT:*
1️⃣  wa.me/50944908407
2️⃣  wa.me/50943981073
3️⃣  wa.me/67078035882

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💼 *SERVICES:*
• Développement de bots WhatsApp
• Scripts personnalisés
• Support technique & consulting

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 SEIGNEUR TD v4.0.0
✨ Made with ❤️ in Haiti `);
        break;

      case 'check':
      case 'checkspam':
      case 'bancheck':
      case 'isbanned':
        await handleCheckBan(sock, args, remoteJid, message, senderJid);
        break;

      // =============================================
      // COMMANDES ANTI
      // =============================================

      case 'antilink':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdmin = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdmin && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const settings = initGroupSettings(remoteJid);
        if (args[0]?.toLowerCase() === 'on') {
          settings.antilink = true;
        } else if (args[0]?.toLowerCase() === 'off') {
          settings.antilink = false;
        } else if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: `🔗 *Anti-Link* — Statut actuel : ${settings.antilink ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n💡 Usage: ${config.prefix}antilink on/off\n\n*© SEIGNEUR TD*`
          });
          break;
        }
        saveData();
        await sock.sendMessage(remoteJid, {
          text: `🔗 *Anti-Link* — Statut : ${settings.antilink ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n*© SEIGNEUR TD*`
        });
        break;

      case 'antibot':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminBot = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminBot && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const settingsBot = initGroupSettings(remoteJid);
        if (args[0]?.toLowerCase() === 'on') {
          settingsBot.antibot = true;
          saveData();
          await sock.sendMessage(remoteJid, { text: `🤖 *Anti-Bot* — Statut : ✅ ACTIVÉ\n\n*© SEIGNEUR TD*` });
        } else if (args[0]?.toLowerCase() === 'off') {
          settingsBot.antibot = false;
          saveData();
          await sock.sendMessage(remoteJid, { text: `🤖 *Anti-Bot* — Statut : ❌ DÉSACTIVÉ\n\n*© SEIGNEUR TD*` });
        } else {
          await sock.sendMessage(remoteJid, {
            text: `🤖 *Anti-Bot* — Statut actuel : ${settingsBot.antibot ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n💡 Usage: ${config.prefix}antibot on/off\n\n*© SEIGNEUR TD*`
          });
        }
        break;

      case 'antitag':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminTag = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminTag && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const settingsTag = initGroupSettings(remoteJid);
        if (args[0]?.toLowerCase() === 'on') {
          settingsTag.antitag = true;
        } else if (args[0]?.toLowerCase() === 'off') {
          settingsTag.antitag = false;
        } else if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: `🏷️ *Anti-Tag* — Statut actuel : ${settingsTag.antitag ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n💡 Usage: ${config.prefix}antitag on/off\n\n*© SEIGNEUR TD*`
          });
          break;
        }
        saveData();
        await sock.sendMessage(remoteJid, {
          text: `🏷️ *Anti-Tag* — Statut : ${settingsTag.antitag ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n*© SEIGNEUR TD*`
        });
        break;

      case 'antispam':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminSpam = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminSpam && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const settingsSpam = initGroupSettings(remoteJid);
        if (args[0]?.toLowerCase() === 'on') {
          settingsSpam.antispam = true;
        } else if (args[0]?.toLowerCase() === 'off') {
          settingsSpam.antispam = false;
        } else if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: `🚫 *Anti-Spam* — Statut actuel : ${settingsSpam.antispam ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n💡 Usage: ${config.prefix}antispam on/off\n\n*© SEIGNEUR TD*`
          });
          break;
        }
        saveData();
        await sock.sendMessage(remoteJid, {
          text: `🚫 *Anti-Spam* — Statut : ${settingsSpam.antispam ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n*© SEIGNEUR TD*`
        });
        break;

      case 'antisticker': {
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Groupes uniquement' }); break; }
        const _uaSticker = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!_uaSticker && !isOwner && !isAdmin(senderJid)) { await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' }); break; }
        const _sSticker = initGroupSettings(remoteJid);
        if (args[0]?.toLowerCase() === 'on') { _sSticker.antisticker = true; }
        else if (args[0]?.toLowerCase() === 'off') { _sSticker.antisticker = false; }
        saveData();
        await sock.sendMessage(remoteJid, { text: `🗒️ *Anti-Sticker* — ${_sSticker.antisticker ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n*© SEIGNEUR TD*` });
        break;
      }

      case 'antiimage': {
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Groupes uniquement' }); break; }
        const _uaImage = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!_uaImage && !isOwner && !isAdmin(senderJid)) { await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' }); break; }
        const _sImage = initGroupSettings(remoteJid);
        if (args[0]?.toLowerCase() === 'on') { _sImage.antiimage = true; }
        else if (args[0]?.toLowerCase() === 'off') { _sImage.antiimage = false; }
        saveData();
        await sock.sendMessage(remoteJid, { text: `🖼️ *Anti-Image* — ${_sImage.antiimage ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n*© SEIGNEUR TD*` });
        break;
      }

      case 'antivideo': {
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Groupes uniquement' }); break; }
        const _uaVideo = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!_uaVideo && !isOwner && !isAdmin(senderJid)) { await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' }); break; }
        const _sVideo = initGroupSettings(remoteJid);
        if (args[0]?.toLowerCase() === 'on') { _sVideo.antivideo = true; }
        else if (args[0]?.toLowerCase() === 'off') { _sVideo.antivideo = false; }
        saveData();
        await sock.sendMessage(remoteJid, { text: `🎬 *Anti-Video* — ${_sVideo.antivideo ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n*© SEIGNEUR TD*` });
        break;
      }

      case 'antimentiongroupe':
      case 'antimentiongroup':
      case 'antimentionstatus': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ Groupe uniquement.' });
          break;
        }
        const isUserAdminAMG = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminAMG && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement.' });
          break;
        }
        const settingsAMG = initGroupSettings(remoteJid);
        if (args[0]?.toLowerCase() === 'on') {
          settingsAMG.antimentiongroupe = true;
        } else if (args[0]?.toLowerCase() === 'off') {
          settingsAMG.antimentiongroupe = false;
        } else if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: `🚫 *Anti-Mention Groupe* — Statut actuel : ${settingsAMG.antimentiongroupe ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n💡 Usage: ${config.prefix}antimentiongroupe on/off\n\n*© SEIGNEUR TD*`
          });
          break;
        }
        saveData();
        await sock.sendMessage(remoteJid, {
          text: `🚫 *Anti-Mention Groupe* — Statut : ${settingsAMG.antimentiongroupe ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n*© SEIGNEUR TD*`
        });
        break;
      }

      case 'warn':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminWarn = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminWarn && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const mentionedWarn = getTargetJid(message);
        if (!mentionedWarn) {
          await sock.sendMessage(remoteJid, { text: `❗ Réponds au message de la personne ou mentionne @user` });
          break;
        }

        const reason = args.slice(1).join(' ') || 'Aucune raison spécifiée';
        const settingsWarn = initGroupSettings(remoteJid);
        const warnCount = addWarn(remoteJid, mentionedWarn, reason);
        
        await sock.sendMessage(remoteJid, {
          text: `⚠️ @${mentionedWarn.split('@')[0]} a reçu un avertissement!\n\nRaison: ${reason}\nWarnings: ${warnCount}/${settingsWarn.maxWarns}`,
          mentions: [mentionedWarn]
        });

        if (warnCount >= settingsWarn.maxWarns) {
          const botIsAdminWarn = await isBotGroupAdmin(sock, remoteJid);
          if (botIsAdminWarn) {
            await sock.groupParticipantsUpdate(remoteJid, [mentionedWarn], 'remove');
            await sock.sendMessage(remoteJid, {
              text: `❌ @${mentionedWarn.split('@')[0]} a été expulsé (${settingsWarn.maxWarns} warnings)`,
              mentions: [mentionedWarn]
            });
            resetWarns(remoteJid, mentionedWarn);
          }
        }
        break;

      case 'resetwarn':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminReset = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminReset && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const mentionedReset = getTargetJid(message);
        if (!mentionedReset) {
          await sock.sendMessage(remoteJid, { text: `❗ Réponds au message de la personne ou mentionne @user` });
          break;
        }

        resetWarns(remoteJid, mentionedReset);
        await sock.sendMessage(remoteJid, {
          text: `✅ Warnings réinitialisés pour @${mentionedReset.split('@')[0]}`,
          mentions: [mentionedReset]
        });
        break;

      case 'warns':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        const mentionedWarns = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || senderJid;
        const userWarns = getWarns(remoteJid, mentionedWarns);
        const settingsWarns = initGroupSettings(remoteJid);
        
        if (userWarns.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: `✅ @${mentionedWarns.split('@')[0]} n'a aucun avertissement`,
            mentions: [mentionedWarns]
          });
        } else {
          let warnText = `⚠️ Warnings de @${mentionedWarns.split('@')[0]}\n\nTotal: ${userWarns.length}/${settingsWarns.maxWarns}\n\n`;
          userWarns.forEach((warn, index) => {
            const date = new Date(warn.timestamp).toLocaleString('fr-FR');
            warnText += `${index + 1}. ${warn.reason}\n   📅 ${date}\n\n`;
          });
          
          await sock.sendMessage(remoteJid, {
            text: warnText,
            mentions: [mentionedWarns]
          });
        }
        break;

      case 'acceptall':
      case 'accept-all':
      case 'acceptrequests':
      case 'approuver': {
        if(!isGroup){await sock.sendMessage(remoteJid,{text:'❌ Groupes seulement.'},{ quoted: message });break;}
        const _isAdminAcc=await isGroupAdmin(sock,remoteJid,senderJid);
        if(!_isAdminAcc&&!isOwner && !isAdmin(senderJid)){await sock.sendMessage(remoteJid,{text:'⛔ Admin requis.'},{ quoted: message });break;}
        const _botIsAdminAcc=await isBotGroupAdmin(sock,remoteJid);
        if(!_botIsAdminAcc){await sock.sendMessage(remoteJid,{text:'❌ Le bot doit être admin.'},{ quoted: message });break;}
        try{
          let _pending=[];
          try{_pending=await sock.groupRequestParticipantsList(remoteJid);}catch(e){}
          if(!_pending||!_pending.length){
            const _meta=await sock.groupMetadata(remoteJid);
            const _raw=(_meta.participants||[]).filter(p=>p.pending===true||p.request_method==='invite').map(p=>({jid:p.id}));
            if(_raw.length)_pending=_raw;
          }
          if(!_pending||!_pending.length){await sock.sendMessage(remoteJid,{text:'📭 Aucune demande en attente.'},{ quoted: message });break;}
          await sock.sendMessage(remoteJid,{text:'⏳ Acceptation de '+_pending.length+' demande(s)...'},{ quoted: message });
          const _jids=_pending.map(p=>p.jid);
          let _accepted=0;
          for(let i=0;i<_jids.length;i+=20){
            const _batch=_jids.slice(i,i+20);
            try{await sock.groupRequestParticipantsUpdate(remoteJid,_batch,'approve');_accepted+=_batch.length;if(i+20<_jids.length)await new Promise(r=>setTimeout(r,1200));}catch(e){}
          }
          await sock.sendMessage(remoteJid,{text:'✅ '+_accepted+'/'+_pending.length+' demandes acceptées.'});
        }catch(e){await sock.sendMessage(remoteJid,{text:'❌ Erreur: '+e.message},{ quoted: message });}
        break;
      }

      case 'antiadmin': {
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Groupe uniquement.' }); break; }
        const _aaIsGroupAdmin = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isOwner && !isAdmin(senderJid) && !_aaIsGroupAdmin) { await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement.' }); break; }
        const _aaSettings = getGroupSettings(remoteJid);
        if (args[0]?.toLowerCase() === 'on') {
          _aaSettings.antiadmin = true; groupSettings.set(remoteJid, _aaSettings); saveStoreKey('groupSettings');
          await sock.sendMessage(remoteJid, { text: `🛡️ *Anti-Admin* — ✅ ACTIVÉ

Toute tentative de promotion sera bloquée.

*© SEIGNEUR TD*` });
        } else if (args[0]?.toLowerCase() === 'off') {
          _aaSettings.antiadmin = false; groupSettings.set(remoteJid, _aaSettings); saveStoreKey('groupSettings');
          await sock.sendMessage(remoteJid, { text: `🛡️ *Anti-Admin* — ❌ DÉSACTIVÉ

*© SEIGNEUR TD*` });
        } else {
          await sock.sendMessage(remoteJid, { text: `🛡️ *Anti-Admin* — ${_aaSettings.antiadmin ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}

💡 Usage: ${config.prefix}antiadmin on/off

*© SEIGNEUR TD*` });
        }
        break;
      }

      case 'antidemote': {
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Groupe uniquement.' }); break; }
        const _adIsGroupAdmin = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isOwner && !isAdmin(senderJid) && !_adIsGroupAdmin) { await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement.' }); break; }
        const _adSettings = getGroupSettings(remoteJid);
        if (args[0]?.toLowerCase() === 'on') {
          _adSettings.antidemote = true; groupSettings.set(remoteJid, _adSettings); saveStoreKey('groupSettings');
          await sock.sendMessage(remoteJid, { text: `🛡️ *Anti-Demote* — ✅ ACTIVÉ

Toute tentative de rétrogradation sera bloquée.

*© SEIGNEUR TD*` });
        } else if (args[0]?.toLowerCase() === 'off') {
          _adSettings.antidemote = false; groupSettings.set(remoteJid, _adSettings); saveStoreKey('groupSettings');
          await sock.sendMessage(remoteJid, { text: `🛡️ *Anti-Demote* — ❌ DÉSACTIVÉ

*© SEIGNEUR TD*` });
        } else {
          await sock.sendMessage(remoteJid, { text: `🛡️ *Anti-Demote* — ${_adSettings.antidemote ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}

💡 Usage: ${config.prefix}antidemote on/off

*© SEIGNEUR TD*` });
        }
        break;
      }

      case 'promote':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminPromote = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminPromote && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const mentionedPromote = getTargetJid(message);
        if (!mentionedPromote) {
          await sock.sendMessage(remoteJid, { text: '❗ Reponds au message ou mentionne @user' });
          break;
        }
        try {
          await sock.groupParticipantsUpdate(remoteJid, [mentionedPromote], 'promote');
          await sock.sendMessage(remoteJid, {
            text: `👑 @${mentionedPromote.split('@')[0]} est maintenant admin!`,
            mentions: [mentionedPromote]
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ Echec promotion. Verifie que je suis admin.' });
        }
        break;

      case 'demote':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminDemote = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminDemote && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const mentionedDemote = getTargetJid(message);
        if (!mentionedDemote) {
          await sock.sendMessage(remoteJid, { text: '❗ Reponds au message ou mentionne @user' });
          break;
        }
        try {
          await sock.groupParticipantsUpdate(remoteJid, [mentionedDemote], 'demote');
          await sock.sendMessage(remoteJid, {
            text: `📉 @${mentionedDemote.split('@')[0]} n'est plus admin`,
            mentions: [mentionedDemote]
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ Echec retrogradation. Verifie que je suis admin.' });
        }
        break;

      case 'add':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminAdd = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminAdd && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: `: ${config.prefix}add 33612345678`
          });
          break;
        }

        const numberToAdd = args[0].replace(/[^0-9]/g, '');
        if (numberToAdd.length < 10) {
          await sock.sendMessage(remoteJid, { text: '❌ Numéro invalide' });
          break;
        }

        try {
          const jidToAdd = `${numberToAdd}@s.whatsapp.net`;
          await sock.groupParticipantsUpdate(remoteJid, [jidToAdd], 'add');
          await sock.sendMessage(remoteJid, {
            text: `✅ @${numberToAdd} a été ajouté au groupe`,
            mentions: [jidToAdd]
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { 
            text: `❌ Unable d'ajouter ce numéro\nVérifiez:\n- Le numéro est correct\n- La personne n'a pas quitté récemment\n- Les paramètres de confidentialité` 
          });
        }
        break;

      case 'kick':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminKick = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminKick && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const mentionedKick = getTargetJid(message);
        if (!mentionedKick) {
          await sock.sendMessage(remoteJid, { text: `❗ Réponds au message de la personne ou mentionne @user` });
          break;
        }

        try {
          await sock.groupParticipantsUpdate(remoteJid, [mentionedKick], 'remove');
          await sock.sendMessage(remoteJid, {
            text: `👢 @${mentionedKick.split('@')[0]} a été expulsé`,
            mentions: [mentionedKick]
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌  lors de l\'expulsion' });
        }
        break;

      case 'permaban':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminPermaBan = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminPermaBan && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const mentionedBan = getTargetJid(message);
        if (!mentionedBan) {
          await sock.sendMessage(remoteJid, {
            text: `⚠️ *PERMABAN - Bannissement Permanent*\n\nUtilisation:\n${config.prefix}permaban @user raison\n\nCette personne sera:\n• Expulsée du groupe\n• Signalée 100 fois à WhatsApp\n• Bloquée de rejoindre le groupe\n\n⚠️ : Cette action est irréversible pour le signalement!\n\nCommandes liées:\n${config.prefix}unpermaban @user - Retirer le ban\n${config.prefix}banlist - Voir la liste des bannis`
          });
          break;
        }

        const banReason = args.slice(1).join(' ') || 'Comportement inapproprié';
        
        // Vérifier si déjà banni
        if (isPermaBanned(remoteJid, mentionedBan)) {
          await sock.sendMessage(remoteJid, {
            text: `⚠️ @${mentionedBan.split('@')[0]} est déjà banni définitivement!`,
            mentions: [mentionedBan]
          });
          break;
        }

        try {
          // Message d'avertissement
          await sock.sendMessage(remoteJid, {
            text: `╔═══════════════════════════════════╗
║    ⚠️ 𝗣𝗘𝗥𝗠𝗔𝗕𝗔𝗡 𝗔𝗖𝗧𝗜𝗩𝗔𝗧𝗘𝗗   ║
╚═══════════════════════════════════╝

🎯 : @${mentionedBan.split('@')[0]}
📝 Raison: ${banReason}
⚡ Action: Expulsion + Signalement massif

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ Initialisation de l'attaque...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            mentions: [mentionedBan]
          });

          await delay(2000);

          // Expulser la personne
          await sock.groupParticipantsUpdate(remoteJid, [mentionedBan], 'remove');
          
          // Ajouter au permaban
          addPermaBan(remoteJid, mentionedBan, banReason, senderJid);
          
          // Message de progression
          const progressMsg = await sock.sendMessage(remoteJid, {
            text: `⚡ *SIGNALEMENT EN COURS*\n\n📊 Progression: 0/100\n🎯 : @${mentionedBan.split('@')[0]}\n\n⏳ Please patienter...`,
            mentions: [mentionedBan]
          });

          // SIGNALEMENT MASSIF - 100 fois
          let reportCount = 0;
          const totalReports = 100;
          const batchSize = 10; // Signaler par batch de 10

          for (let i = 0; i < totalReports; i += batchSize) {
            try {
              // Batch de 
              for (let j = 0; j < batchSize && (i + j) < totalReports; j++) {
                try {
                  // Envoyer le signalement à WhatsApp
                  await sock.sendMessage('support@s.whatsapp.net', {
                    text: `Report spam from ${mentionedBan}`
                  });
                  
                  reportCount++;
                } catch (report) {
                  console.error(' sending report:', report);
                }
              }

              // Mise à jour de la progression toutes les 20 reports
              if (reportCount % 20 === 0 || reportCount === totalReports) {
                const percentage = Math.floor((reportCount / totalReports) * 100);
                const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
                
                await sock.sendMessage(remoteJid, {
                  text: `⚡ *SIGNALEMENT EN COURS*\n\n📊 Progression: ${reportCount}/${totalReports}\n[${progressBar}] ${percentage}%\n🎯 : @${mentionedBan.split('@')[0]}\n\n${reportCount === totalReports ? '✅ TERMINÉ!' : '⏳ ...'}`,
                  mentions: [mentionedBan],
                  edit: progressMsg.key
                });
              }

              // Délai pour éviter le rate limit
              if (i + batchSize < totalReports) {
                await delay(500);
              }
            } catch (error) {
              console.error(' in report batch:', error);
            }
          }

          // Message final
          await sock.sendMessage(remoteJid, {
            text: `╔═══════════════════════════════════╗
║   ✅ 𝗣𝗘𝗥𝗠𝗔𝗕𝗔𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧   ║
╚═══════════════════════════════════╝

🎯 *:* @${mentionedBan.split('@')[0]}
📝 *Raison:* ${banReason}
👤 *Par:* @${senderJid.split('@')[0]}
📅 *Date:* ${new Date().toLocaleString('fr-FR')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ *ACTIONS EFFECTUÉES:*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ Expulsion du groupe
2️⃣ ${reportCount}  envoyés à WhatsApp
3️⃣ Bannissement permanent activé

⚠️ Cette personne sera automatiquement expulsée si elle rejoint à nouveau.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SEIGNEUR TD
  "You remember me?"`,
            mentions: [mentionedBan, senderJid]
          });
          
          console.log(`✅ Permaban + ${reportCount} reports appliqués: ${mentionedBan} dans ${remoteJid}`);
        } catch (error) {
          console.error(' in permaban:', error);
          await sock.sendMessage(remoteJid, { 
            text: '❌  lors du bannissement. La personne a peut-être déjà quitté le groupe.' 
          });
        }
        break;

      case 'unpermaban':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminUnBan = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminUnBan && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const mentionedUnBan = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedUnBan) {
          await sock.sendMessage(remoteJid, {
            text: `: ${config.prefix}unpermaban @user`
          });
          break;
        }

        if (!isPermaBanned(remoteJid, mentionedUnBan)) {
          await sock.sendMessage(remoteJid, {
            text: `ℹ️ @${mentionedUnBan.split('@')[0]} n'est pas banni.`,
            mentions: [mentionedUnBan]
          });
          break;
        }

        const banInfo = getPermaBanInfo(remoteJid, mentionedUnBan);
        removePermaBan(remoteJid, mentionedUnBan);
        
        await sock.sendMessage(remoteJid, {
          text: `✅ *PERMABAN RETIRÉ*\n\n@${mentionedUnBan.split('@')[0]} peut à nouveau rejoindre le groupe.\n\nBanni depuis: ${new Date(banInfo.timestamp).toLocaleString('fr-FR')}\nRaison du ban: ${banInfo.reason}\nRetiré par: @${senderJid.split('@')[0]}`,
          mentions: [mentionedUnBan, senderJid]
        });
        
        console.log(`✅ Permaban retiré: ${mentionedUnBan} dans ${remoteJid}`);
        break;

      case 'banlist':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        const groupBans = getAllPermaBans(remoteJid);
        
        if (groupBans.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: '✅ Aucune personne bannie dans ce groupe.'
          });
          break;
        }

        let banListText = `╔═══════════════════════════════════╗
║     🚫 𝗟𝗜𝗦𝗧𝗘 𝗗𝗘𝗦 𝗕𝗔𝗡𝗦     ║
╚═══════════════════════════════════╝

📊 Total: ${groupBans.length} personne(s) bannie(s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

        groupBans.forEach((ban, index) => {
          const date = new Date(ban.timestamp).toLocaleDateString('fr-FR');
          banListText += `\n${index + 1}. @${ban.userJid.split('@')[0]}\n`;
          banListText += `   📝 Raison: ${ban.reason}\n`;
          banListText += `   📅 Date: ${date}\n`;
          banListText += `   👤 Par: @${ban.bannedBy.split('@')[0]}\n`;
        });

        banListText += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        banListText += `💡 Utilisez ${config.prefix}unpermaban @user pour retirer un ban`;

        const mentions = groupBans.flatMap(ban => [ban.userJid, ban.bannedBy]);

        await sock.sendMessage(remoteJid, {
          text: banListText,
          mentions: mentions
        });
        break;

      // =============================================
      // NOUVELLES COMMANDES GROUPE
      // =============================================

      case 'mute':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminMute = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminMute && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        try {
          await sock.groupSettingUpdate(remoteJid, 'announcement');
          await sock.sendMessage(remoteJid, {
            text: '🔇 Groupe en mode *MUET*\n\nSeuls les admins peuvent envoyer des messages.'
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌  lors du mute' });
        }
        break;

      case 'unmute':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminUnmute = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminUnmute && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        try {
          await sock.groupSettingUpdate(remoteJid, 'not_announcement');
          await sock.sendMessage(remoteJid, {
            text: '🔊 Groupe en mode *OUVERT*\n\nTout le monde peut envoyer des messages.'
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌  lors du unmute' });
        }
        break;

      case 'invite':
      case 'lien':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        try {
          const inviteCode = await sock.groupInviteCode(remoteJid);
          await sock.sendMessage(remoteJid, {
            text: `🔗 *Lien d'invitation du groupe*\n\nhttps://chat.whatsapp.com/${inviteCode}`
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { 
            text: '❌ Unable de récupérer le lien. Je dois être admin.' 
          });
        }
        break;

      case 'revoke':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminRevoke = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminRevoke && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        try {
          await sock.groupRevokeInvite(remoteJid);
          await sock.sendMessage(remoteJid, {
            text: '✅ Lien d\'invitation réinitialisé!\n\nL\'ancien lien ne fonctionne plus.'
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { 
            text: '❌ . Je dois être admin.' 
          });
        }
        break;

      case 'glock':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminGlock = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminGlock && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        try {
          await sock.groupSettingUpdate(remoteJid, 'locked');
          await sock.sendMessage(remoteJid, {
            text: '🔒 Paramètres du groupe *VERROUILLÉS*\n\nSeuls les admins peuvent modifier les infos du groupe.'
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ ' });
        }
        break;

      case 'gunlock':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminGunlock = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminGunlock && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        try {
          await sock.groupSettingUpdate(remoteJid, 'unlocked');
          await sock.sendMessage(remoteJid, {
            text: '🔓 Paramètres du groupe *DÉVERROUILLÉS*\n\nTout le monde peut modifier les infos du groupe.'
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ ' });
        }
        break;

      case 'gname':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminGname = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminGname && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: `: ${config.prefix}gname <nouveau nom>`
          });
          break;
        }

        const newGroupName = args.join(' ');
        try {
          await sock.groupUpdateSubject(remoteJid, newGroupName);
          await sock.sendMessage(remoteJid, {
            text: `✅ Nom du groupe changé en:\n*${newGroupName}*`
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ ' });
        }
        break;

      case 'gdesc':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminGdesc = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminGdesc && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: `: ${config.prefix}gdesc <nouvelle description>`
          });
          break;
        }

        const newGroupDesc = args.join(' ');
        try {
          await sock.groupUpdateDescription(remoteJid, newGroupDesc);
          await sock.sendMessage(remoteJid, {
            text: `✅ Description du groupe modifiée!`
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ ' });
        }
        break;

      case 'groupinfo':
      case 'infos':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        try {
          const metadata = await sock.groupMetadata(remoteJid);
          const admins = metadata.participants.filter(p => p.admin).length;
          const members = metadata.participants.length;
          const desc = metadata.desc || 'Aucune description';
          const owner = metadata.owner || 'Inconnu';
          const created = metadata.creation ? new Date(metadata.creation * 1000).toLocaleDateString('fr-FR') : 'Inconnu';

          await sock.sendMessage(remoteJid, {
            text: `╔═══════════════════════════════════╗
║      📊 𝗜𝗡𝗙𝗢𝗦 𝗚𝗥𝗢𝗨𝗣𝗘      ║
╚═══════════════════════════════════╝

📌 *Nom:* ${metadata.subject}

👥 *:* ${members}
👑 *:* ${admins}
🔐 *:* @${owner.split('@')[0]}
📅 *Créé le:* ${created}

📝 *:*
${desc}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SEIGNEUR TD`,
            mentions: [owner]
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ ' });
        }
        break;

      case 'listonline':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        try {
          const metadata = await sock.groupMetadata(remoteJid);
          const participants = metadata.participants;
          
          let onlineList = `╔═══════════════════════════════════╗
║    📱 𝗠𝗘𝗠𝗕𝗥𝗘𝗦 𝗘𝗡 𝗟𝗜𝗚𝗡𝗘    ║
╚═══════════════════════════════════╝

`;

          let count = 0;
          for (const participant of participants) {
            try {
              const status = await sock.fetchStatus(participant.id);
              if (status) {
                count++;
                onlineList += `${count}. @${participant.id.split('@')[0]}\n`;
              }
            } catch (e) {
              // Ignore les erreurs
            }
          }

          onlineList += `\n📊 Total: ${count} membre(s) en ligne`;

          await sock.sendMessage(remoteJid, {
            text: onlineList,
            mentions: participants.map(p => p.id)
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ ' });
        }
        break;

      case 'jid':
        const jidToShow = isGroup ? senderJid : remoteJid;
        await sock.sendMessage(remoteJid, {
          text: `📱 *Votre JID:*\n\n\`${jidToShow}\`\n\nCopiez-le pour l'utiliser comme admin.`
        });
        break;

      case 'quoted':
      case 'q':
        if (!message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
          await sock.sendMessage(remoteJid, { text: '❌   ' });
          break;
        }

        const quotedMsg = message.message.extendedTextMessage.contextInfo.quotedMessage;
        const quotedText = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || 'Message sans texte';
        
        await sock.sendMessage(remoteJid, {
          text: `📝 *Message cité:*\n\n${quotedText}`
        });
        break;

      case 'check':
      case 'bancheck':
      case 'isban':
        await handleCheckBan(sock, args, remoteJid, senderJid, message);
        break;

      // =============================================
      // COMMANDES BUGS 🪲
      // =============================================

      case 'kill.gc':
      case 'killgc':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔  ' });
          break;
        }
        await handleKillGC(sock, args, remoteJid, senderJid, message);
        break;

      case 'ios.kill':
      case 'ioskill':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔  ' });
          break;
        }
        await handleIOSKill(sock, args, remoteJid, senderJid, message);
        break;

      case 'andro.kill':
      case 'androkill':
      case 'androidkill':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔  ' });
          break;
        }
        await handleAndroKill(sock, args, remoteJid, senderJid, message);
        break;

      case 'silent':
      case 'report':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔  ' });
          break;
        }
        await handleSilent(sock, args, remoteJid, senderJid, message);
        break;

      case 'bansupport':
      case 'bansupp':
      case 'xban':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔  ' });
          break;
        }
        await handleBanSupport(sock, args, remoteJid, senderJid, message);
        break;

      case 'xcrash':
      case 'megaban':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔  ' });
          break;
        }
        await handleMegaBan(sock, args, remoteJid, senderJid, message);
        break;

      case 'updatedev':
      case 'devupdate':
      case 'managedev':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔  ' });
          break;
        }
        await handleUpdateDev(sock, args, remoteJid, senderJid);
        break;

      case 'update':
      case 'maj':
      case 'upgrade': {
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins du bot uniquement.' });
          break;
        }
        await sock.sendMessage(remoteJid, {
          text: '🔄 *Mise à jour en cours...*\n\nVeuillez patienter minimum 30s.'
        }, { quoted: message });

        const { execSync, exec } = await import('child_process');
        const _repoUrl = 'https://github.com/Azountou235/SEIGNEUR-TD-.git';
        const _cwd = process.cwd();

        try {
          // Vérifier si git est disponible
          execSync('git --version', { stdio: 'ignore' });

          // Sauvegarder les fichiers config locaux
          const _filesToKeep = ['creds.json', '.env', 'database.json', 'session'];

          // Git pull
          const _gitOut = execSync('git pull origin main 2>&1 || git pull origin master 2>&1', {
            cwd: _cwd, encoding: 'utf8', timeout: 30000
          });

          const _isUpToDate = _gitOut.includes('Already up to date') || _gitOut.includes('up-to-date');

          if (_isUpToDate) {
            await sock.sendMessage(remoteJid, {
              text: '\u2705 *SEIGNEUR TD est d\u00E9j\u00E0 \u00E0 la derni\u00E8re version!*\n\n_Aucune mise \u00E0 jour disponible._'
            }, { quoted: message });
            break;
          }

          // npm install pour les nouvelles dépendances
          try {
            execSync('npm install --production 2>&1', { cwd: _cwd, encoding: 'utf8', timeout: 60000 });
          } catch(npmErr) {}

          await sock.sendMessage(remoteJid, {
            text: '✅ *Mise à jour réussie !* Redémarrage dans 3s...'
          });

          // Redémarrer après 3 secondes
          setTimeout(() => { process.exit(0); }, 3000);

        } catch(gitErr) {
          // Git non disponible → téléchargement direct via axios (compatible Pterodactyl)


          try {
            // Télécharger uniquement index.js depuis GitHub (raw)
            const rawUrl = 'https://raw.githubusercontent.com/Azountou235/SEIGNEUR-TD-/main/index.js';


            const rawResp = await axios.get(rawUrl, {
              responseType: 'text',
              timeout: 60000,
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            if (!rawResp.data || rawResp.data.length < 1000) throw new Error('Fichier index.js vide ou trop petit');

            // Sauvegarder l'ancien index.js au cas où
            const _cwd2 = process.cwd();
            const indexPath = _cwd2 + '/index.js';
            const backupPath = _cwd2 + '/index.js.bak';
            if (fs.existsSync(indexPath)) fs.copyFileSync(indexPath, backupPath);

            // Écrire le nouveau index.js
            fs.writeFileSync(indexPath, rawResp.data, 'utf8');

            await sock.sendMessage(remoteJid, { text: '✅ *Mise à jour réussie !* Redémarrage dans 3s...' });

            setTimeout(() => { process.exit(0); }, 3000);

          } catch(dlErr) {
            await sock.sendMessage(remoteJid, {
              text:
`❌ *Échec de la mise à jour automatique*
────────────────────────
💡 Mets à jour manuellement depuis ton panel Pterodactyl.

_Erreur: ${dlErr.message}_`
            }, { quoted: message });
          }
        }
        break;
      }

      case 'storestatus':
      case 'storeinfo':
      case 'storesave':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔  ' });
          break;
        }
        await handleStoreStatus(sock, remoteJid, command);
        break;

      // =============================================
      // NOUVELLES COMMANDES OWNER
      // =============================================

      case 'block':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔  ' });
          break;
        }

        const mentionedBlock = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedBlock) {
          await sock.sendMessage(remoteJid, {
            text: `: ${config.prefix}block @user`
          });
          break;
        }

        try {
          await sock.updateBlockStatus(mentionedBlock, 'block');
          await sock.sendMessage(remoteJid, {
            text: `🚫 @${mentionedBlock.split('@')[0]} a été bloqué!`,
            mentions: [mentionedBlock]
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ ' });
        }
        break;

      case 'unblock':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔  ' });
          break;
        }

        const mentionedUnblock = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedUnblock) {
          await sock.sendMessage(remoteJid, {
            text: `: ${config.prefix}unblock @user`
          });
          break;
        }

        try {
          await sock.updateBlockStatus(mentionedUnblock, 'unblock');
          await sock.sendMessage(remoteJid, {
            text: `✅ @${mentionedUnblock.split('@')[0]} a été débloqué!`,
            mentions: [mentionedUnblock]
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ ' });
        }
        break;

      case 'join':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔  ' });
          break;
        }

        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: `: ${config.prefix}join <lien du groupe>`
          });
          break;
        }

        const inviteLink = args[0].replace('https://chat.whatsapp.com/', '');
        try {
          await sock.groupAcceptInvite(inviteLink);
          await sock.sendMessage(remoteJid, {
            text: '✅ Bot a rejoint le groupe!'
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ Lien invalide ou erreur' });
        }
        break;

      case 'pp':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔  ' });
          break;
        }

        if (!message.message?.imageMessage && !message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
          await sock.sendMessage(remoteJid, {
            text: '❌  ou répondez à une image'
          });
          break;
        }

        try {
          const imageMsg = message.message?.imageMessage || message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
          const stream = await downloadContentFromMessage(imageMsg, 'image');
          const buffer = await toBuffer(stream);
          
          await sock.updateProfilePicture(sock.user.id, buffer);
          await sock.sendMessage(remoteJid, {
            text: '✅ Photo de profil du bot mise à jour!'
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ ' });
        }
        break;

      case 'getpp': {
        // Télécharger la photo de profil d'un autre utilisateur
        const _ppTarget = args[0]?.replace(/[^0-9]/g, '');
        const _ppQuoted = message.message?.extendedTextMessage?.contextInfo?.participant;
        const _ppMentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        let _ppJid = null;
        if (_ppTarget) _ppJid = _ppTarget + '@s.whatsapp.net';
        else if (_ppQuoted) _ppJid = _ppQuoted;
        else if (_ppMentioned) _ppJid = _ppMentioned;
        if (!_ppJid) {
          await sock.sendMessage(remoteJid, { text: `❗ Usage: ${config.prefix}getpp @mention ou ${config.prefix}getpp numéro

*© SEIGNEUR TD*` });
          break;
        }
        try {
          const _ppUrl = await sock.profilePictureUrl(_ppJid, 'image').catch(() => null);
          if (!_ppUrl) {
            await sock.sendMessage(remoteJid, { text: `❌ Pas de photo de profil ou profil privé.

*© SEIGNEUR TD*` });
            break;
          }
          const _ppRes = await axios.get(_ppUrl, { responseType: 'arraybuffer', timeout: 30000 });
          const _ppBuf = Buffer.from(_ppRes.data);
          await sock.sendMessage(remoteJid, {
            image: _ppBuf,
            caption: `📸 *Photo de profil*
👤 @${_ppJid.split('@')[0]}

*© SEIGNEUR TD*`,
            mentions: [_ppJid]
          }, { quoted: message });
        } catch(_e) {
          await sock.sendMessage(remoteJid, { text: `❌ Impossible de récupérer la photo: ${_e.message}` });
        }
        break;
      }

      case 'gpp':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        const isUserAdminGpp = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminGpp && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        if (!message.message?.imageMessage && !message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
          await sock.sendMessage(remoteJid, {
            text: '❌  ou répondez à une image'
          });
          break;
        }

        try {
          const imageMsg = message.message?.imageMessage || message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
          const stream = await downloadContentFromMessage(imageMsg, 'image');
          const buffer = await toBuffer(stream);
          
          await sock.updateProfilePicture(remoteJid, buffer);
          await sock.sendMessage(remoteJid, {
            text: '✅ Photo de profil du groupe mise à jour!'
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ . Je dois être admin.' });
        }
        break;

      case 'delete':
      case 'del':
        const isUserAdminDelete = isGroup ? await isGroupAdmin(sock, remoteJid, senderJid) : true;
        if (!isUserAdminDelete && !isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }

        if (!message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
          await sock.sendMessage(remoteJid, { text: '❌ Répondez au message à supprimer' });
          break;
        }

        try {
          const quotedMsgKey = message.message.extendedTextMessage.contextInfo;
          await sock.sendMessage(remoteJid, { 
            delete: {
              remoteJid: remoteJid,
              fromMe: false,
              id: quotedMsgKey.stanzaId,
              participant: quotedMsgKey.participant
            }
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ Unable de supprimer ce message' });
        }
        break;

      // =============================================
      // 📥 COMMANDES DOWNLOAD (GiftedTech API)
      // =============================================

      case 'ytmp3':
      case 'ytaudio':
      case 'ytmp4':
      case 'tiktok':
      case 'tiktokmp3':
      case 'insta':
      case 'ig':
      case 'fb':
      case 'apk':
      case 'googledrv':
      case 'gdrive':
      case 'mediafire':
      case 'google':
      case 'parole':
      case 'lyrics':
      case 'song':
      case 'soundcloud':
      case 'sc': {
        await handleXwolfDownload(sock, command, args, remoteJid, message);
        break;
      }

      // =============================================
      // 📊 COMMANDES STATUS
      // =============================================

      case 'tovoice':
      case 'tovocal':
      case 'ptt': {
        const _qAud = message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage
                   || message.message?.audioMessage;
        if (!_qAud) {
          await sock.sendMessage(remoteJid, { text: `❗ Réponds à un audio pour le convertir en vocal.\n\nUsage: ${config.prefix}tovoice\n\n*© SEIGNEUR TD*` });
          break;
        }
        try {
          const _stream = await downloadContentFromMessage(_qAud, 'audio');
          const _chunks = [];
          for await (const _c of _stream) _chunks.push(_c);
          const _buf = Buffer.concat(_chunks);
          if (!_buf || _buf.length < 100) {
            await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement audio !' }); break;
          }
          await sock.sendMessage(remoteJid, {
            audio: _buf,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
          }, { quoted: message });
        } catch(_e) {
          await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${_e.message}\n\n*© SEIGNEUR TD*` });
        }
        break;
      }

      case 'tostatus':
      case 'mystatus':
        await handleToStatus(sock, args, message, remoteJid, senderJid);
        break;

      case 'toaudio':
        await handleToAudio(sock, args, message, remoteJid, senderJid);
        break;

      case 'toptt':
        await handleToPtt(sock, args, message, remoteJid, senderJid);
        break;

      case 'swgc': {
        try {
          // ── Helpers ────────────────────────────────────────────────────────
          const { generateWAMessageContent, generateWAMessageFromContent } = await import('bail-lite');
          const { default: _crypto } = await import('crypto');
          const { PassThrough } = await import('stream');

          // Download to buffer
          const _downloadToBuffer = async (msgObj, type) => {
            const stream = await downloadContentFromMessage(msgObj, type);
            let buf = Buffer.from([]);
            for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
            return buf;
          };

          // Convert audio to voice note via ffmpeg (optionnel)
          const _toVN = async (inputBuffer) => {
            try {
              const ffmpeg = (await import('fluent-ffmpeg')).default;
              return await new Promise((resolve, reject) => {
                const inStream = new PassThrough();
                inStream.end(inputBuffer);
                const outStream = new PassThrough();
                const chunks = [];
                ffmpeg(inStream)
                  .noVideo()
                  .audioCodec('libopus')
                  .format('ogg')
                  .audioBitrate('48k')
                  .audioChannels(1)
                  .audioFrequency(48000)
                  .on('error', reject)
                  .on('end', () => resolve(Buffer.concat(chunks)))
                  .pipe(outStream, { end: true });
                outStream.on('data', chunk => chunks.push(chunk));
              });
            } catch (_e) {
              return inputBuffer; // fallback si ffmpeg absent
            }
          };

          // Sticker to image fallback
          const _convertSticker = async (buf) => buf;

          // Build payload from quoted
          const _buildPayload = async (quotedMessage) => {
            if (quotedMessage.videoMessage) {
              const buffer = await _downloadToBuffer(quotedMessage.videoMessage, 'video');
              return {
                video: buffer,
                caption: quotedMessage.videoMessage.caption || '',
                gifPlayback: quotedMessage.videoMessage.gifPlayback || false,
                mimetype: quotedMessage.videoMessage.mimetype || 'video/mp4'
              };
            } else if (quotedMessage.imageMessage) {
              const buffer = await _downloadToBuffer(quotedMessage.imageMessage, 'image');
              return {
                image: buffer,
                caption: quotedMessage.imageMessage.caption || '',
                mimetype: quotedMessage.imageMessage.mimetype || 'image/jpeg'
              };
            } else if (quotedMessage.audioMessage) {
              const buffer = await _downloadToBuffer(quotedMessage.audioMessage, 'audio');
              if (quotedMessage.audioMessage.ptt) {
                const audioVn = await _toVN(buffer);
                return { audio: audioVn, mimetype: 'audio/ogg; codecs=opus', ptt: true };
              } else {
                return { audio: buffer, mimetype: quotedMessage.audioMessage.mimetype || 'audio/mpeg', ptt: false };
              }
            } else if (quotedMessage.stickerMessage) {
              try {
                const buffer = await _downloadToBuffer(quotedMessage.stickerMessage, 'sticker');
                const imageBuffer = await _convertSticker(buffer);
                return { image: imageBuffer, caption: '', mimetype: 'image/png', convertedSticker: true };
              } catch (_ce) {
                return { text: '⚠️ Sticker conversion failed' };
              }
            } else if (quotedMessage.conversation || quotedMessage.extendedTextMessage?.text) {
              return { text: quotedMessage.conversation || quotedMessage.extendedTextMessage.text };
            }
            return null;
          };

          // Send group status
          const _sendGroupStatus = async (conn, jid, _payload) => {
            const inside = await generateWAMessageContent(_payload, { upload: conn.waUploadToServer });
            const messageSecret = _crypto.randomBytes(32);
            const m = generateWAMessageFromContent(jid, {
              messageContextInfo: { messageSecret },
              groupStatusMessageV2: { message: { ...inside, messageContextInfo: { messageSecret } } }
            }, {});
            await conn.relayMessage(jid, m.message, { messageId: m.key.id });
            return m;
          };

          // Detect media type
          const _detectType = (quotedMessage, _payload) => {
            if (!quotedMessage) return 'Text';
            if (quotedMessage.videoMessage) return 'Video';
            if (quotedMessage.imageMessage) return 'Image';
            if (quotedMessage.audioMessage) return 'Audio';
            if (quotedMessage.stickerMessage) return _payload?.convertedSticker ? 'Sticker -> Image' : 'Sticker';
            return 'Text';
          };

          // ── Vérification groupe ─────────────────────────────────────────────
          if (!isGroup) {
            await sock.sendMessage(remoteJid, { text: '❌ Groupes uniquement!' }, { quoted: message });
            break;
          }

          // ── Parsing commande ────────────────────────────────────────────────
          const messageText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
          const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const commandRegex = /^[.!#/]?(swgc|togstatus|groupstatus|tosgroup)\s*/i;

          let textAfterCommand = '';
          if (messageText.trim()) {
            const match = messageText.match(commandRegex);
            if (match) textAfterCommand = messageText.slice(match[0].length).trim();
          }

          // Aide si rien
          if (!quotedMessage && (!messageText.trim() || !textAfterCommand)) {
            await sock.sendMessage(remoteJid, {
              text: `✦ *GROUP STATUS* ✦\n\nUsage:\n✦ ${prefix}swgc texte\n✦ Reponds a un media avec ${prefix}swgc\n✦ Reponds + ${prefix}swgc legende`
            }, { quoted: message });
            break;
          }

          // ── Construction payload ────────────────────────────────────────────
          let payload = null;

          if (quotedMessage) {
            payload = await _buildPayload(quotedMessage);
            if (textAfterCommand && payload) {
              if (payload.video || payload.image) payload.caption = textAfterCommand;
            }
          } else if (textAfterCommand) {
            payload = { text: textAfterCommand };
          }

          if (!payload) {
            await sock.sendMessage(remoteJid, { text: '❌ Contenu non supporté.' }, { quoted: message });
            break;
          }

          // ── Envoi ───────────────────────────────────────────────────────────
          await sock.sendMessage(remoteJid, { react: { text: '⏳', key: message.key } });
          await _sendGroupStatus(sock, remoteJid, payload);

          const mediaType = _detectType(quotedMessage, payload);
          let successMsg = `✅ ${mediaType} publie!`;
          if (payload.caption) successMsg += `\n📝 "${payload.caption}"`;
          if (payload.convertedSticker) successMsg += `\n(sticker -> image)`;

          await sock.sendMessage(remoteJid, { react: { text: '☑️', key: message.key } });
          await sock.sendMessage(remoteJid, { text: successMsg }, { quoted: message });

        } catch (e) {
          console.error('[SWGC ERROR]:', e);
          try { await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } }); } catch (_e2) {}
          try { await sock.sendMessage(senderJid, { text: `❌ Erreur: ${e.message}` }); } catch (_e2) {}
        }
        break;
      }

      // =============================================
      // 🎮 COMMANDES GAMES
      // =============================================

      case 'tictactoe':
      case 'ttt':
        await handleTicTacToe(sock, args, message, remoteJid, senderJid, isGroup);
        break;

      case 'quizmanga':
      case 'quiz':
        await handleQuizManga(sock, args, message, remoteJid, senderJid, isGroup);
        break;

      case 'squidgame':
      case 'sg':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }
        await handleSquidGame(sock, args, message, remoteJid, senderJid, isGroup);
        break;

      // =============================================
      // COMMANDES STICKER
      // =============================================

      case 'sticker':
      case 's':
        try {
          console.log('🔍 Commande sticker reçue');

          const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const username = message.pushName || 'SEIGNEUR TD';

          // Support aussi image/vidéo directe (non quoted)
          let effectiveQuoted = quotedMessage;
          if (!effectiveQuoted) {
            if (message.message?.imageMessage) {
              effectiveQuoted = { imageMessage: message.message.imageMessage };
            } else if (message.message?.videoMessage) {
              effectiveQuoted = { videoMessage: message.message.videoMessage };
            }
          }

          if (!effectiveQuoted) {
            await sock.sendMessage(remoteJid, {
              text: `❌ Réponds à une image ou vidéo pour créer un sticker!\nUsage: ${config.prefix}sticker`
            });
            break;
          }

          const isVideo = !!effectiveQuoted.videoMessage;
          const isImage = !!effectiveQuoted.imageMessage;

          if (!isVideo && !isImage) {
            await sock.sendMessage(remoteJid, {
              text: '❌ Le message cité n\'est pas une image ou une vidéo !'
            });
            break;
          }

          await sock.sendMessage(remoteJid, { text: '⏳ Création du sticker en cours...' });

          // Importer les modules nécessaires
          const { default: stickerPkg } = await import('wa-sticker-formatter');
          const { Sticker: StickerClass, StickerTypes } = stickerPkg;
          const { default: sharpLib } = await import('sharp');
          const { default: ffmpegLib } = await import('fluent-ffmpeg');

          // Télécharger le média via downloadContentFromMessage
          const mediaType = isVideo ? 'video' : 'image';
          const mediaMsg = isVideo ? effectiveQuoted.videoMessage : effectiveQuoted.imageMessage;
          const stream = await downloadContentFromMessage(mediaMsg, mediaType);
          const chunks = [];
          for await (const chunk of stream) chunks.push(chunk);
          const mediaBuffer = Buffer.concat(chunks);

          if (!mediaBuffer || mediaBuffer.length < 100) {
            await sock.sendMessage(remoteJid, { text: '❌ Échec du téléchargement du média !' });
            break;
          }

          // Fichiers temporaires uniques
          const uniqueId = Date.now();
          const tempInput = isVideo ? `./temp_video_${uniqueId}.mp4` : `./temp_image_${uniqueId}.jpg`;
          const tempOutput = `./temp_sticker_${uniqueId}.webp`;

          fs.writeFileSync(tempInput, mediaBuffer);

          try {
            if (isVideo) {
              console.log('⚙️ Conversion vidéo → sticker animé...');
              await new Promise((resolve, reject) => {
                ffmpegLib(tempInput)
                  .output(tempOutput)
                  .outputOptions([
                    '-vf scale=512:512:flags=lanczos',
                    '-c:v libwebp',
                    '-q:v 50',
                    '-preset default',
                    '-loop 0',
                    '-an',
                    '-vsync 0'
                  ])
                  .on('end', resolve)
                  .on('error', (err) => { console.error('❌ FFmpeg:', err); reject(err); })
                  .run();
              });
            } else {
              console.log('⚙️ Conversion image → sticker...');
              await sharpLib(tempInput)
                .resize(512, 512, { fit: 'inside' })
                .webp({ quality: 80 })
                .toFile(tempOutput);
            }

            // Créer le sticker avec wa-sticker-formatter
            const stickerObj = new StickerClass(tempOutput, {
              pack: stickerPackname,
              author: stickerAuthor,
              type: isVideo ? StickerTypes.FULL : StickerTypes.DEFAULT,
              quality: 80,
              animated: isVideo,
            });

            const stickerMessage = await stickerObj.toMessage();
            await sock.sendMessage(remoteJid, stickerMessage);
            console.log('✅ Sticker envoyé avec succès !');

          } finally {
            if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
            if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
          }

        } catch (error) {
          console.error('❌ ERREUR STICKER:', error.message);
          await sock.sendMessage(remoteJid, {
            text: `⚠️ Erreur lors de la création du sticker : ${error.message}`
          });
        }
        break;

      case 'take':
      case 'steal':
        try {
          console.log('🔍 Commande take reçue');

          const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const messageBody = message.message?.extendedTextMessage?.text || message.message?.conversation || '';
          const parts = messageBody.slice(1).trim().split(/\s+/);
          const takeArgs = parts.slice(1);

          // Nom du pack = args ou pushName
          const packName = takeArgs.length > 0 ? takeArgs.join(' ') : (message.pushName || 'SEIGNEUR TD');

          if (!quotedMessage || !quotedMessage.stickerMessage) {
            await sock.sendMessage(remoteJid, {
              text: `❌ Réponds à un sticker pour le modifier!\nUsage: ${config.prefix}take [nom optionnel]`
            });
            break;
          }

          await sock.sendMessage(remoteJid, { text: '⏳ Modification du sticker en cours...' });

          // Importer wa-sticker-formatter
          const { default: stickerPkg2 } = await import('wa-sticker-formatter');
          const { Sticker: StickerClass2, StickerTypes: StickerTypes2 } = stickerPkg2;

          // Télécharger le sticker via downloadContentFromMessage
          const stickerStream = await downloadContentFromMessage(quotedMessage.stickerMessage, 'sticker');
          const stickerChunks = [];
          for await (const chunk of stickerStream) stickerChunks.push(chunk);
          const stickerBuffer = Buffer.concat(stickerChunks);

          if (!stickerBuffer || stickerBuffer.length < 100) {
            await sock.sendMessage(remoteJid, { text: '❌ Échec du téléchargement du sticker !' });
            break;
          }

          // Fichier temporaire unique
          const takeUniqueId = Date.now();
          const tempStickerPath = `./temp_take_${takeUniqueId}.webp`;
          fs.writeFileSync(tempStickerPath, stickerBuffer);

          const isAnimated = quotedMessage.stickerMessage.isAnimated || false;

          try {
            const stickerObj = new StickerClass2(tempStickerPath, {
              pack: stickerPackname,
              author: stickerAuthor,
              type: StickerTypes2.FULL,
              categories: ['🤩', '🎉'],
              id: String(takeUniqueId),
              quality: 50,
              background: '#000000',
              animated: isAnimated
            });

            await sock.sendMessage(remoteJid, await stickerObj.toMessage());
            console.log(`✅ Sticker envoyé avec metadata "${packName}" !`);

          } finally {
            if (fs.existsSync(tempStickerPath)) fs.unlinkSync(tempStickerPath);
          }

        } catch (error) {
          console.error('❌ Erreur take:', error.message);
          await sock.sendMessage(remoteJid, {
            text: `⚠️ Erreur modification du sticker : ${error.message}`
          });
        }
        break;

      // =============================================
      // 🤖 COMMANDES IA (GPT & GEMINI)
      // =============================================

      case 'gpt':
      case 'chatgpt':
      case 'ai': {
        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: `🤖 *ChatGPT*\n\n📌 Utilisation:\n${config.prefix}gpt [ta question]\n\nExemple:\n${config.prefix}gpt Explique-moi l'intelligence artificielle`
          }, { quoted: message });
          break;
        }
        const question = args.join(' ');
        try {
          await sock.sendMessage(remoteJid, { react: { text: "🤖", key: message.key } });

          // Essayer plusieurs APIs IA gratuites dans l'ordre
          let reply = null;
          let modelUsed = '';

          // 1. Pollinations.ai (100% gratuit, sans clé)
          try {
            const pollUrl = `https://text.pollinations.ai/${encodeURIComponent(question)}?model=openai&seed=42&json=false`;
            const r = await fetch(pollUrl, { signal: AbortSignal.timeout(20000) });
            if (r.ok) {
              const txt = await r.text();
              if (txt && txt.length > 5) { reply = txt.trim(); modelUsed = 'GPT-4o (Pollinations)'; }
            }
          } catch(e) { console.error('[Pollinations]', e.message); }

          // 2. OpenAI officiel (si clé valide)
          if (!reply) {
            try {
              const r = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.openaiApiKey}` },
                body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: question }], max_tokens: 1000 }),
                signal: AbortSignal.timeout(20000)
              });
              const d = await r.json();
              if (!d.error && d.choices?.[0]?.message?.content) {
                reply = d.choices[0].message.content.trim();
                modelUsed = 'OpenAI GPT-4o-mini';
              }
            } catch(e) { console.error('[OpenAI]', e.message); }
          }

          // 3. Groq (gratuit avec compte, très rapide - llama3)
          if (!reply) {
            try {
              const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.groqApiKey || ''}` },
                body: JSON.stringify({ model: 'llama3-8b-8192', messages: [{ role: 'user', content: question }], max_tokens: 1000 }),
                signal: AbortSignal.timeout(20000)
              });
              const d = await r.json();
              if (!d.error && d.choices?.[0]?.message?.content) {
                reply = d.choices[0].message.content.trim();
                modelUsed = 'Llama 3 (Groq)';
              }
            } catch(e) { console.error('[Groq]', e.message); }
          }

          if (!reply) throw new Error('Tous les services IA sont indisponibles. Réessaie dans quelques secondes.');

          const cleanReply = `${reply}\n\n_© SEIGNEUR TD_`;
          await sock.sendMessage(remoteJid, { text: cleanReply }, { quoted: message });

        } catch (e) {
          console.error('GPT ERROR:', e.message);
          await sock.sendMessage(remoteJid, {
            text: `❌ *GPT Error:* ${e.message}\n\n💡 Try again later.`
          }, { quoted: message });
        }
        break;
      }

      case 'gemini':
      case 'google':
      case 'bard': {
        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: `✨ *AI Gemini*\n\n📌 Utilisation:\n${config.prefix}gemini [ta question]\n\nExemple:\n${config.prefix}gemini Qu'est-ce que le Big Bang?`
          }, { quoted: message });
          break;
        }
        const question = args.join(' ');
        try {
          await sock.sendMessage(remoteJid, { react: { text: "✨", key: message.key } });

          let reply = null;
          let modelUsed = '';

          // 1. Gemini API officielle (si quota dispo)
          try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.geminiApiKey}`;
            const r = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: question }] }], generationConfig: { maxOutputTokens: 1000 } }),
              signal: AbortSignal.timeout(25000)
            });
            const d = await r.json();
            if (!d.error && d.candidates?.[0]?.content?.parts?.[0]?.text) {
              reply = d.candidates[0].content.parts[0].text.trim();
              modelUsed = 'Google Gemini 2.0 Flash';
            }
          } catch(e) { console.error('[Gemini API]', e.message); }

          // 2. Pollinations.ai openai (POST — plus fiable que GET)
          if (!reply) {
            try {
              const r = await fetch('https://text.pollinations.ai/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [{ role: 'user', content: question }], model: 'openai', seed: 42 }),
                signal: AbortSignal.timeout(30000)
              });
              if (r.ok) {
                const txt = await r.text();
                if (txt && txt.length > 5) { reply = txt.trim(); modelUsed = 'GPT-4o (Pollinations)'; }
              }
            } catch(e) { console.error('[Pollinations POST]', e.message); }
          }

          // 3. Pollinations mistral (POST)
          if (!reply) {
            try {
              const r = await fetch('https://text.pollinations.ai/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [{ role: 'user', content: question }], model: 'mistral', seed: 42 }),
                signal: AbortSignal.timeout(30000)
              });
              if (r.ok) {
                const txt = await r.text();
                if (txt && txt.length > 5) { reply = txt.trim(); modelUsed = 'Mistral (Pollinations)'; }
              }
            } catch(e) { console.error('[Pollinations Mistral]', e.message); }
          }

          if (!reply) throw new Error('Tous les services IA sont indisponibles. Réessaie plus tard.');

          await sock.sendMessage(remoteJid, {
            text: `${reply}\n\n_© SEIGNEUR TD_`
          }, { quoted: message });

          try { await sock.sendMessage(remoteJid, { react: { text: "✅", key: message.key } }); } catch(e) {}

        } catch (e) {
          console.error('GEMINI ERROR:', e.message);
          await sock.sendMessage(remoteJid, {
            text: `❌ *AI Error:* ${e.message}`
          }, { quoted: message });
        }
        break;
      }

      // =============================================
      // 🤖 SEIGNEUR AI — IA Personnelle du Bot
      // =============================================
      case 'dostoevsky':
      case 'dosto':
      case 'chat': {
        const userMsg = args.join(' ').trim();

        if (!userMsg) {
          await sock.sendMessage(remoteJid, {
            text:
`🤖 *SEIGNEUR AI — IA du Bot*
━━━━━━━━━━━━━━━━━━━━━━━
_Bonjour! Mwen se SEIGNEUR AI, AI pèsonèl SEIGNEUR TD._
_Je parle Créole , Français 🇫🇷 & English 🇬🇧_

📌 *Usage:*
${config.prefix}chatbot [ton message]
${config.prefix}dostoevsky [ton message]

💡 *Exemples:*
• ${config.prefix}chat Kijan ou rele?
• ${config.prefix}chat What can you do?

🗑️ *Effacer historique:*
${config.prefix}clearchat
━━━━━━━━━━━━━━━━━━━━━━━
_© SEIGNEUR TD_`
          }, { quoted: message });
          break;
        }

        try {
          // Historique de conversation par utilisateur/groupe
          const chatKey = isGroup ? `group_${remoteJid}` : `user_${senderJid}`;
          if (!global.dostoChatHistory) global.dostoChatHistory = new Map();
          if (!global.dostoChatHistory.has(chatKey)) global.dostoChatHistory.set(chatKey, []);
          const history = global.dostoChatHistory.get(chatKey);

          // Limiter l'historique à 10 échanges
          if (history.length > 20) history.splice(0, history.length - 20);

          // Ajouter le message de l'utilisateur
          const userName = message.pushName || senderJid.split('@')[0];
          history.push({ role: 'user', content: `${isGroup ? `[${userName}]: ` : ''}${userMsg}` });

          // System prompt de SEIGNEUR AI
          const systemPrompt = `Tu es TCHOMBÉ AI, l'intelligence artificielle personnelle et exclusive du bot WhatsApp SEIGNEUR TD.

Ton identité :
- Tu t'appelles TCHOMBÉ AI — unique et exclusif à SEIGNEUR TD
- Tu es un sociologue passionné d'informatique, tchadien, cultivé et analytique
- Tu combines la rigueur des sciences sociales avec la passion de la technologie
- Tu n'es PAS ChatGPT, PAS Gemini, PAS Claude

Ton propriétaire :
- Tu appartiens à LE SEIGNEUR 🇹🇩, un utilisateur tchadien passionné
- Si quelqu'un demande qui t'a créé : "Je suis TCHOMBÉ AI, IA exclusive de SEIGNEUR TD 🇹🇩"

Langues autorisées UNIQUEMENT :
- Français 🇫🇷, Arabe 🇹🇩, Anglais 🇬🇧
- Si quelqu'un écrit en créole haïtien : réponds TOUJOURS "nooooooooon Mon Seigneur ne comprend pas cette langue 😭😂"
- Pour toute autre langue, réponds poliment en français que tu parles seulement français, arabe et anglais

Règles :
- Réponds directement, sans préambule ni en-tête
- Réponses concises (max 3-4 paragraphes)
- En groupe, tu t'adresses à la personne par son nom si disponible
- Tu peux tenir une vraie conversation avec mémoire du contexte`;

          // Construction des messages avec historique
          const messages = [
            { role: 'user', content: systemPrompt },
            { role: 'assistant', content: 'Compris! Mwen se SEIGNEUR AI, SEIGNEUR TD. Map toujou reponn nan lang ou pale a. Kijan mwen ka ede ou?' },
            ...history
          ];

          let reply = null;

          // 1. Gemini (si clé valide)
          try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.geminiApiKey}`;
            const geminiMessages = history.map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            }));
            const r = await axios.post(geminiUrl, {
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: geminiMessages,
              generationConfig: { maxOutputTokens: 800, temperature: 0.85 }
            }, { timeout: 20000 });
            const d = r.data;
            if (d.candidates?.[0]?.content?.parts?.[0]?.text) {
              reply = d.candidates[0].content.parts[0].text.trim();
            }
          } catch(e) { console.error('[Dosto Gemini]', e.message); }

          // 2. Pollinations (backup)
          if (!reply) {
            try {
              const r = await axios.post('https://text.pollinations.ai/', {
                messages,
                model: 'openai',
                seed: 42
              }, { timeout: 25000 });
              const txt = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
              if (txt && txt.length > 5) reply = txt.trim();
            } catch(e) { console.error('[Dosto Pollinations]', e.message); }
          }

          // 3. OpenAI (si clé valide)
          if (!reply && config.openaiApiKey) {
            try {
              const r = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini',
                messages,
                max_tokens: 800,
                temperature: 0.85
              }, {
                headers: { Authorization: `Bearer ${config.openaiApiKey}` },
                timeout: 20000
              });
              reply = r.data.choices?.[0]?.message?.content?.trim();
            } catch(e) { console.error('[Dosto OpenAI]', e.message); }
          }

          if (!reply) throw new Error('Service IA indisponible. Réessaie dans quelques secondes.');

          // Sauvegarder la réponse dans l'historique
          history.push({ role: 'assistant', content: reply });

          // Envoyer la réponse
          await sock.sendMessage(remoteJid, {
            text: `${reply}\n\n_© SEIGNEUR TD_`
          }, { quoted: message });

        } catch(e) {
          console.error('[DOSTOEVSKY ERROR]', e.message);
          await sock.sendMessage(remoteJid, {
            text: `⚠️ *SEIGNEUR AI:* Mwen gen yon pwoblèm kounye a. Eseye ankò pita!\n\n_${e.message}_`
          }, { quoted: message });
        }
        break;
      }

      case 'clearchat':
      case 'resetchat':
      case 'cleardosto': {
        if (!global.dostoChatHistory) global.dostoChatHistory = new Map();
        const chatKey = isGroup ? `group_${remoteJid}` : `user_${senderJid}`;
        global.dostoChatHistory.delete(chatKey);
        await sock.sendMessage(remoteJid, {
          text: '🗑️ *SEIGNEUR AI:* Istorik konvèsasyon an efase! Nou kapab kòmanse sou baz nèf. '
        }, { quoted: message });
        break;
      }

      case 'chatbot':
      case 'chatboton':
      case 'dostoevskyon':
      case 'chatbot on': {
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin uniquement.' });
          break;
        }
        const cbArg = args[0]?.toLowerCase();
        if (cbArg === 'on' || command === 'chatboton' || command === 'dostoevskyon') {
          _saveState('chatbotEnabled', true);
          saveStore();
          await sock.sendMessage(remoteJid, {
            text: `🤖 *Chatbot TCHOMBÉ AI* — Statut : ✅ ACTIVÉ\n\n_Je réponds automatiquement à tous les messages._\n\n*© SEIGNEUR TD*`
          }, { quoted: message });
        } else if (cbArg === 'off') {
          _saveState('chatbotEnabled', false);
          saveStore();
          await sock.sendMessage(remoteJid, {
            text: `🤖 *Chatbot TCHOMBÉ AI* — Statut : ❌ DÉSACTIVÉ\n\n*© SEIGNEUR TD*`
          }, { quoted: message });
        } else {
          await sock.sendMessage(remoteJid, {
            text: `🤖 *Chatbot TCHOMBÉ AI* — Statut actuel : ${chatbotEnabled ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n💡 Usage: ${config.prefix}chatbot on/off\n\n*© SEIGNEUR TD*`
          }, { quoted: message });
        }
        break;
      }

      case 'chatbotoff':
      case 'dostoevskyoff':
      case 'chatbot off': {
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin uniquement.' });
          break;
        }
        _saveState('chatbotEnabled', false);
        saveStore();
        await sock.sendMessage(remoteJid, {
          text: `🤖 *Chatbot* — Statut : ❌ DÉSACTIVÉ\n\n*© SEIGNEUR TD*`
        }, { quoted: message });
        break;
      }

      // =============================================
      // 🔍 DETECT — Inspecter la structure d'un message
      // =============================================
      case 'detect': {
        try {
          const raw = message.message || {};
          const quoted =
            raw.extendedTextMessage?.contextInfo?.quotedMessage ||
            raw.imageMessage?.contextInfo?.quotedMessage ||
            raw.videoMessage?.contextInfo?.quotedMessage ||
            raw.audioMessage?.contextInfo?.quotedMessage ||
            null;

          if (!quoted) {
            await sock.sendMessage(remoteJid, {
              text: 'ℹ️ Utilisation : répondez à un message puis envoyez la commande !detect pour voir sa structure.'
            }, { quoted: message });
            break;
          }

          function detectMessageType(q) {
            if (!q) return 'unknown';
            const types = ['conversation','extendedTextMessage','imageMessage','videoMessage','audioMessage','stickerMessage','documentMessage','contactMessage','locationMessage','productMessage','buttonsResponseMessage','listResponseMessage','templateMessage'];
            for (const t of types) if (q[t]) return t;
            const keys = Object.keys(q);
            return keys.length ? keys[0] : 'unknown';
          }

          function summarizeMessage(q) {
            const type = detectMessageType(q);
            const summary = { type, rawKeys: Object.keys(q) };
            if (q.conversation) summary.text = q.conversation;
            if (q.extendedTextMessage) {
              summary.extendedText = q.extendedTextMessage.text || null;
              summary.extendedContext = q.extendedTextMessage.contextInfo ? {
                stanzaId: q.extendedTextMessage.contextInfo.stanzaId || null,
                participant: q.extendedTextMessage.contextInfo.participant || null,
                quotedMessageKeys: q.extendedTextMessage.contextInfo.quotedMessage ? Object.keys(q.extendedTextMessage.contextInfo.quotedMessage) : null
              } : null;
            }
            if (q.imageMessage) summary.image = { mimetype: q.imageMessage.mimetype || null, caption: q.imageMessage.caption || null, fileSha256: q.imageMessage.fileSha256 ? Buffer.from(q.imageMessage.fileSha256).toString('hex') : null, fileLength: q.imageMessage.fileLength || null, url: q.imageMessage.url || null };
            if (q.videoMessage) summary.video = { mimetype: q.videoMessage.mimetype || null, caption: q.videoMessage.caption || null, seconds: q.videoMessage.seconds || null, fileLength: q.videoMessage.fileLength || null, url: q.videoMessage.url || null };
            if (q.audioMessage) summary.audio = { mimetype: q.audioMessage.mimetype || null, seconds: q.audioMessage.seconds || null, ptt: !!q.audioMessage.ptt, fileLength: q.audioMessage.fileLength || null, url: q.audioMessage.url || null };
            if (q.documentMessage) summary.document = { fileName: q.documentMessage.fileName || null, mimetype: q.documentMessage.mimetype || null, fileLength: q.documentMessage.fileLength || null, url: q.documentMessage.url || null };
            if (q.stickerMessage) summary.sticker = { isAnimated: !!q.stickerMessage.isAnimated, isVideo: !!q.stickerMessage.isVideo, fileSha256: q.stickerMessage.fileSha256 ? Buffer.from(q.stickerMessage.fileSha256).toString('hex') : null };
            if (q.contactMessage) summary.contact = { displayName: q.contactMessage.displayName || null, vcard: !!q.contactMessage.vcard };
            if (q.locationMessage) summary.location = { degreesLatitude: q.locationMessage.degreesLatitude || null, degreesLongitude: q.locationMessage.degreesLongitude || null, name: q.locationMessage.name || null };
            if (q.productMessage) summary.product = { productId: q.productMessage.product?.id || null, title: q.productMessage.product?.title || null };
            if (q.contextInfo) summary.contextInfo = { mentionedJid: q.contextInfo.mentionedJid || null, externalAdReply: q.contextInfo.externalAdReply ? { title: q.contextInfo.externalAdReply.title || null, mediaType: q.contextInfo.externalAdReply.mediaType || null, mediaUrl: q.contextInfo.externalAdReply.mediaUrl || null } : null };
            return summary;
          }

          const report = {
            inspectedAt: new Date().toISOString(),
            chat: message.key?.remoteJid || 'unknown',
            isGroup: (message.key?.remoteJid || '').endsWith('@g.us'),
            quotedMessageKey: {
              id: raw.extendedTextMessage?.contextInfo?.stanzaId || null,
              participant: raw.extendedTextMessage?.contextInfo?.participant || null
            },
            summary: summarizeMessage(quoted)
          };

          const pretty = JSON.stringify(report, null, 2);
          const MAX_LEN = 1500;
          if (pretty.length <= MAX_LEN) {
            await sock.sendMessage(remoteJid, { text: `🔍 Résultat de l'inspection :\n\n${pretty}` }, { quoted: message });
          } else {
            const chunks = [];
            for (let i = 0; i < pretty.length; i += MAX_LEN) chunks.push(pretty.slice(i, i + MAX_LEN));
            await sock.sendMessage(remoteJid, { text: '🔍 Rapport trop long, envoi en plusieurs parties...' }, { quoted: message });
            for (const c of chunks) {
              await sock.sendMessage(remoteJid, { text: '```json\n' + c + '\n```' }, { quoted: message });
            }
          }

        } catch (err) {
          console.error('[DETECT ERROR]', err);
          await sock.sendMessage(remoteJid, { text: `❌ Erreur lors de l'inspection : ${err.message || err}` }, { quoted: message });
        }
        break;
      }

      case 'sauvegarde':
      case 'garder': {
        try {
          const botPrivateJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
          const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const quotedSender = message.message?.extendedTextMessage?.contextInfo?.participant || senderJid;
          const senderName = message.pushName || senderJid.split('@')[0];

          if (!quoted) {
            await sock.sendMessage(remoteJid, {
              text: `💾 *Commande SAVE*\n\n📌 *Utilisation:*\nRéponds à n'importe quel message avec \`${config.prefix}save\`\n\n• Texte, image, vidéo, audio, sticker, View Once\n\n✅ Le média sera envoyé en privé sur ton numéro bot`
            }, { quoted: message });
            break;
          }

          await sock.sendMessage(remoteJid, { react: { text: "💾", key: message.key } });

          const fromName = quotedSender?.split('@')[0] || 'Unknown';
          const dateStr  = new Date().toLocaleString('fr-FR', { timeZone: 'America/Port-au-Prince' });
          const headerTxt = `💾 *SAUVEGARDÉ*\n━━━━━━━━━━━━━━━━━━━━━━━\n👤 *De:* +${fromName}\n📅 *Date:* ${dateStr}\n💬 *Enregistré par:* ${senderName}\n━━━━━━━━━━━━━━━━━━━━━━━`;

          // Envoyer l'en-tête d'abord
          await sock.sendMessage(botPrivateJid, { text: headerTxt });

          // Détecter et envoyer le type de contenu
          const qViewOnce = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessageV2Extension?.message;
          const qImg   = qViewOnce?.imageMessage  || quoted.imageMessage;
          const qVid   = qViewOnce?.videoMessage  || quoted.videoMessage;
          const qAud   = quoted.audioMessage;
          const qStick = quoted.stickerMessage;
          const qTxt   = quoted.conversation || quoted.extendedTextMessage?.text;
          const qCaption = qImg?.caption || qVid?.caption || '';

          if (qImg) {
            const stream = await downloadContentFromMessage(qImg, 'image');
            const buf    = await toBuffer(stream);
            await sock.sendMessage(botPrivateJid, {
              image:   buf,
              mimetype: qImg.mimetype || 'image/jpeg',
              caption: qCaption || '📸 Image sauvegardée'
            });
          } else if (qVid) {
            const stream = await downloadContentFromMessage(qVid, 'video');
            const buf    = await toBuffer(stream);
            await sock.sendMessage(botPrivateJid, {
              video:   buf,
              mimetype: qVid.mimetype || 'video/mp4',
              caption: qCaption || '🎥 Vidéo sauvegardée'
            });
          } else if (qAud) {
            const stream = await downloadContentFromMessage(qAud, 'audio');
            const buf    = await toBuffer(stream);
            await sock.sendMessage(botPrivateJid, {
              audio:   buf,
              mimetype: qAud.mimetype || 'audio/ogg',
              ptt:     qAud.ptt || false
            });
          } else if (qStick) {
            const stream = await downloadContentFromMessage(qStick, 'sticker');
            const buf    = await toBuffer(stream);
            await sock.sendMessage(botPrivateJid, { sticker: buf });
          } else if (qTxt) {
            await sock.sendMessage(botPrivateJid, {
              text: `💬 *Message sauvegardé:*\n\n${qTxt}`
            });
          } else {
            await sock.sendMessage(botPrivateJid, {
              text: '📎 Contenu sauvegardé (type non reconnu)'
            });
          }

          // Juste une réaction ✅, pas de message de confirmation
          try { await sock.sendMessage(remoteJid, { react: { text: "✅", key: message.key } }); } catch(e) {}

        } catch(e) {
          console.error('SAVE ERROR:', e.message);
          await sock.sendMessage(remoteJid, {
            text: `❌ *Erreur save:* ${e.message}`
          }, { quoted: message });
        }
        break;
      }

      // =============================================
      // 🎭 COMMANDE SETCMD — Transformer une commande en sticker
      // =============================================
      case 'setcmd':
      case 'cmdsticker':
      case 'stickercmd': {
        try {
          const cmdName = args[0]?.toLowerCase();
          if (!cmdName) {
            await sock.sendMessage(remoteJid, {
              text: `🎭 *Commande SETCMD*\n\n📌 *Utilisation:*\n1️⃣ Réponds à un sticker avec:\n   \`${config.prefix}setcmd [commande]\`\n\n📋 *Exemples:*\n• \`${config.prefix}setcmd play\` → ce sticker lancera !play\n• \`${config.prefix}setcmd gpt\` → ce sticker appellera !gpt\n• \`${config.prefix}setcmd vv\` → ce sticker appellera !vv\n\n✅ Envoie ensuite ce sticker pour exécuter la commande`
            }, { quoted: message });
            break;
          }

          // Chercher un sticker en reply
          const quotedStick = message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
          if (!quotedStick) {
            await sock.sendMessage(remoteJid, {
              text: `❌ Réponds à un *sticker* avec \`${config.prefix}setcmd ${cmdName}\``
            }, { quoted: message });
            break;
          }

          // Télécharger le sticker
          const stickerStream = await downloadContentFromMessage(quotedStick, 'sticker');
          const stickerBuf    = await toBuffer(stickerStream);

          // Calculer un hash simple du sticker pour l'identifier
          const stickerHash = stickerBuf.slice(0, 32).toString('hex');

          // Sauvegarder dans une Map globale
          if (!global.stickerCommands) global.stickerCommands = new Map();
          global.stickerCommands.set(stickerHash, cmdName);

          await sock.sendMessage(remoteJid, {
            text: `✅ *Sticker configuré!*\n\n🎭 Ce sticker exécutera: \`${config.prefix}${cmdName}\`\n\n📌 Envoie ce sticker dans n'importe quelle conversation pour déclencher la commande.`
          }, { quoted: message });
          try { await sock.sendMessage(remoteJid, { react: { text: "✅", key: message.key } }); } catch(e) {}

        } catch(e) {
          console.error('SETCMD ERROR:', e.message);
          await sock.sendMessage(remoteJid, { text: `❌ Erreur setcmd: ${e.message}` }, { quoted: message });
        }
        break;
      }

      case 'pair':
      case 'connect':
      case 'adduser':{
        const pN=args[0]?.replace(/[^0-9]/g,'');
        if(!pN||pN.length<7){await sock.sendMessage(remoteJid,{text:`📱 Usage: ${config.prefix}pair NUMERO`});break;}
        try{const pc=await sock.requestPairingCode(pN);const fc=pc?.match(/.{1,4}/g)?.join('-')||pc;await sock.sendMessage(remoteJid,{text:`🔗 *CODE DE COUPLAGE*\n📱 +${pN}\n🔑 ${fc}\n⏰ Expire dans 60s`});}
        catch(e){await sock.sendMessage(remoteJid,{text:`❌ ${e.message}`});}
        break;
      }
      case 't':{
        const tEs=['mp4','mov','jpg','jpeg','png','webp','mp3','ogg','txt','js'];
        let tF=null,tE=null;
        for(const e of tEs){const c2=path.resolve(`./t.${e}`);if(fs.existsSync(c2)){tF=c2;tE=e;break;}}
        if(!tF){await sock.sendMessage(remoteJid,{text:'❌ Aucun fichier t.* trouvé.'});break;}
        try{
          if(['mp4','mov'].includes(tE))await sock.sendMessage(remoteJid,{video:fs.readFileSync(tF),mimetype:'video/mp4',caption:''});
          else if(['jpg','jpeg','png','webp'].includes(tE))await sock.sendMessage(remoteJid,{image:fs.readFileSync(tF),caption:''});
          else if(['mp3','ogg'].includes(tE))await sock.sendMessage(remoteJid,{audio:fs.readFileSync(tF),mimetype:'audio/mp4',ptt:false});
          else if(tE==='txt')await sock.sendMessage(remoteJid,{text:fs.readFileSync(tF,'utf8')});
          await sock.sendMessage(remoteJid,{text:`✅ t.${tE} envoyé!`});
        }catch(e){await sock.sendMessage(remoteJid,{text:`❌ ${e.message}`});}
        break;
      }
      default:
        await sock.sendMessage(remoteJid, {
          text: `❌ Commande inconnue: ${config.prefix}${command}\n\nType ${config.prefix}help`
        });
    }
  } catch (error) {
    console.error(`❌ Command error [${command}]:`, error?.message || error);
    await sock.sendMessage(remoteJid, { 
      text: `❌ *Command error:* \`${command}\`\n\n\`${error?.message || 'Unknown error'}\`` 
    });
  }
}

