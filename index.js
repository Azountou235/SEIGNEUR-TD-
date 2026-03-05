import { handleSuperAdmin, isSuperAdminJid } from './superadmin.js';
import { handleNewCommands, getNewCommandsMenu } from './commands.js';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  delay,
  downloadContentFromMessage,
  downloadMediaMessage,
  normalizeMessageContent,
  jidNormalizedUser
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { createServer } from 'http';
import { spawn, execSync } from 'child_process';

// =============================================
// API EXPRESS - MULTI-SESSION MANAGER
// =============================================

// Map des sessions actives: phoneNumber -> { sock, status, pairingCode, createdAt }
const activeSessions = new Map();

// Port de l'API (Pterodactyl expose ce port)
const API_PORT = process.env.API_PORT || 2007;
// Clé secrète pour sécuriser l'API (à changer dans ton .env ou config)
const API_SECRET = process.env.API_SECRET || 'SEIGNEUR_SECRET_KEY';

// =============================================
// TUNNEL HTTPS — NGROK
// =============================================
async function startTunnel(port) {
  try {
    console.log('[TUNNEL] Démarrage ngrok...');
    const { default: ngrok } = await import('@ngrok/ngrok');
    const listener = await ngrok.forward({
      addr: port,
      authtoken: '3AQymrJPjfGHKEQOHwwMLY4pQfQ_78Q46r1bNM9kqhBMZq1Vg'
    });
    const url = listener.url();
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  🌐 TUNNEL HTTPS ACTIF                     ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log(`\n  URL HTTPS: ${url}\n`);
    console.log(`  → Mets cette URL dans ton site Lovable !\n`);
    return url;
  } catch (e) {
    console.log('[TUNNEL] Erreur ngrok:', e.message);
    return null;
  }
}

// Mini serveur HTTP sans dépendance Express
async function startApiServer() {
  const server = createServer(async (req, res) => {
    // CORS pour Lovable
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Vérification clé API
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== API_SECRET) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Clé API invalide' }));
      return;
    }

    // Parser le body JSON
    let body = {};
    if (req.method === 'POST') {
      body = await new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve({}); }
        });
      });
    }

    const url = req.url?.split('?')[0];

    // ── POST /api/connect ──────────────────────────────
    // Body: { phone: "33612345678" }
    // Crée une session Baileys et retourne le pairing code
    if (req.method === 'POST' && url === '/api/connect') {
      const phone = body.phone?.replace(/\D/g, '');
      if (!phone || phone.length < 8) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Numéro invalide' }));
        return;
      }

      // Si session existante → on la supprime et on recrée (nouveau code à chaque fois)
      if (activeSessions.has(phone)) {
        const oldSession = activeSessions.get(phone);
        // Si déjà connecté, on informe
        if (oldSession.status === 'connected') {
          res.writeHead(200);
          res.end(JSON.stringify({ status: 'already_connected', phone }));
          return;
        }
        // Session en cours mais pas encore connectée → fermer proprement
        try { oldSession.sock?.ws?.close(); } catch {}
        activeSessions.delete(phone);
        // ✅ Ne supprimer le dossier que si PAS de credentials valides
        if (!sessionHasCredentials(phone)) {
          const sessionFolder = `./sessions/${phone}`;
          try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch {}
          console.log(`[SESSION] 🔄 Ancienne session ${phone} sans credentials — supprimée`);
        } else {
          console.log(`[SESSION] 🔄 Session ${phone} — credentials conservés`);
        }
      }

      // Créer nouvelle session
      try {
        const pairingCode = await createUserSession(phone);
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'pending', pairingCode, phone }));
      } catch (e) {
        console.error('[API] Erreur création session:', e.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // ── GET /api/status?phone=33612345678 ──────────────
    // Retourne le statut de connexion d'un numéro
    if (req.method === 'GET' && url === '/api/status') {
      const phone = req.url?.split('phone=')[1]?.replace(/\D/g, '');
      if (!phone) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Paramètre phone manquant' }));
        return;
      }

      const session = activeSessions.get(phone);
      if (!session) {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'not_found', phone }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        status: session.status,
        phone,
        pairingCode: session.pairingCode || null,
        connectedAt: session.connectedAt || null
      }));
      return;
    }

    // ── GET /api/sessions ──────────────────────────────
    // Liste toutes les sessions (admin)
    if (req.method === 'GET' && url === '/api/sessions') {
      const list = [];
      for (const [phone, session] of activeSessions) {
        list.push({ phone, status: session.status, connectedAt: session.connectedAt || null });
      }
      res.writeHead(200);
      res.end(JSON.stringify({ sessions: list, count: list.length }));
      return;
    }

    // ── POST /api/disconnect ───────────────────────────
    // Body: { phone: "33612345678" }
    if (req.method === 'POST' && url === '/api/disconnect') {
      const phone = body.phone?.replace(/\D/g, '');
      const session = activeSessions.get(phone);
      if (session?.sock) {
        try { await session.sock.logout(); } catch {}
        activeSessions.delete(phone);
      }
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'disconnected', phone }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Route non trouvée' }));
  });

  server.listen(API_PORT, () => {
    console.log(`\n🌐 API Server démarrée sur le port ${API_PORT}`);
    console.log(`🔑 Clé API: ${API_SECRET}\n`);
  });
}

// ══════════════════════════════════════════════════════════════════════
// GESTION DES SESSIONS — Règles strictes :
//   createUserSession  → NOUVELLE connexion (efface et recrée les credentials)
//   reconnectSession   → RECONNEXION silencieuse (garde les credentials existants)
// ══════════════════════════════════════════════════════════════════════

// Vérifie si une session a des credentials valides (déjà authentifiée)
function sessionHasCredentials(phone) {
  const sessionFolder = `./sessions/${phone}`;
  const credsFile = `${sessionFolder}/creds.json`;
  try {
    if (!fs.existsSync(credsFile)) return false;
    const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
    return !!(creds?.me?.id || creds?.registered);
  } catch(e) { return false; }
}

// ── RECONNEXION SILENCIEUSE — NE SUPPRIME JAMAIS LES CREDENTIALS ─────
// Utilisée lors d'un restart, update git, déconnexion temporaire
async function reconnectSession(phone, retryCount = 0) {
  const sessionFolder = `./sessions/${phone}`;
  if (!fs.existsSync(sessionFolder)) {
    console.log(`[RECONNECT] ${phone} — dossier session introuvable, ignoré`);
    return false;
  }
  try {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    // Vérifier que les credentials sont bien présents
    if (!state.creds?.me && !state.creds?.registered) {
      console.log(`[RECONNECT] ${phone} — credentials vides, reconnexion impossible sans pairing`);
      return false;
    }
    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      keepAliveIntervalMs: 30000,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
      getMessage: async () => ({ conversation: '' })
    });
    activeSessions.set(phone, { sock, status: 'reconnecting', pairingCode: null, createdAt: Date.now() });
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const session = activeSessions.get(phone);
      if (connection === 'open') {
        if (session) { session.status = 'connected'; session.connectedAt = Date.now(); }
        console.log(`[RECONNECT] ✅ ${phone} reconnecté silencieusement`);
        launchSessionBot(sock, phone, sessionFolder, saveCreds);
      } else if (connection === 'close') {
        if (loggedOut) {
          // Déconnexion volontaire de WhatsApp → supprimer la session
          activeSessions.delete(phone);
          try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch {}
          console.log(`[RECONNECT] 🗑️ ${phone} déconnecté définitivement (loggedOut)`);
          return;
        }
        // Déconnexion réseau temporaire → réessayer (max 5 fois)
        activeSessions.delete(phone);
        if (retryCount < 5) {
          const waitMs = Math.min(5000 * (retryCount + 1), 30000);
          console.log(`[RECONNECT] 🔄 ${phone} — tentative ${retryCount + 1}/5 dans ${waitMs/1000}s...`);
          await delay(waitMs);
          await reconnectSession(phone, retryCount + 1);
        } else {
          console.log(`[RECONNECT] ❌ ${phone} — 5 tentatives échouées, abandon`);
        }
      }
    });
    sock.ev.on('creds.update', saveCreds);
    console.log(`[RECONNECT] 🔄 ${phone} reconnexion en cours...`);
    return true;
  } catch(e) {
    console.log(`[RECONNECT] ❌ ${phone} erreur: ${e.message}`);
    return false;
  }
}

// ── NOUVELLE SESSION — Efface et crée des credentials frais ───────────
// Utilisée UNIQUEMENT quand l'utilisateur connecte un nouveau numéro
async function createUserSession(phone) {
  const sessionFolder = `./sessions/${phone}`;
  // ✅ Supprimer seulement pour une VRAIE nouvelle connexion
  try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(sessionFolder, { recursive: true });

  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 250,
    maxMsgRetryCount: 5,
    getMessage: async () => ({ conversation: '' })
  });

  activeSessions.set(phone, { sock, status: 'pending', pairingCode: null, createdAt: Date.now() });

  // Auto-cleanup si pas connecté en 10 minutes
  const cleanupTimer = setTimeout(() => {
    const s = activeSessions.get(phone);
    if (s && s.status !== 'connected') {
      console.log(`[${phone}] ⏱️ Timeout — session supprimée`);
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
    console.log(`[${phone}] 🔑 Code: ${formatted}`);
  } catch(e) {
    throw new Error(`requestPairingCode échoué: ${e.message}`);
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
      console.log(`[${phone}] ✅ Connecté! Démarrage bot complet...`);
      if (session) { session.status = 'connected'; session.connectedAt = Date.now(); }
      launchSessionBot(sock, phone, sessionFolder, saveCreds);

    } else if (connection === 'close') {
      clearTimeout(cleanupTimer);
      console.log(`[${phone}] 📴 Déconnecté. Code: ${statusCode}, Status: ${currentStatus}`);

      // Pendant pending + pas loggedOut → garder la session, l'utilisateur n'a pas encore entré le code
      if (currentStatus === 'pending' && !loggedOut) {
        console.log(`[${phone}] ⏳ Code en attente, reconnexion WS silencieuse...`);
        await delay(2000);
        try {
          const { version: v2 } = await fetchLatestBaileysVersion();
          const { state: s2, saveCreds: sc2 } = await useMultiFileAuthState(sessionFolder);
          const sock2 = makeWASocket({ version: v2, logger: pino({ level: 'silent' }), printQRInTerminal: false, auth: s2, browser: ['Ubuntu', 'Chrome', '20.0.04'], getMessage: async () => ({ conversation: '' }) });
          const sess = activeSessions.get(phone);
          if (sess) sess.sock = sock2;
          sock2.ev.on('connection.update', async (u2) => {
            if (u2.connection === 'open') {
              console.log(`[${phone}] ✅ Reconnecté!`);
              const s = activeSessions.get(phone);
              if (s) { s.status = 'connected'; s.connectedAt = Date.now(); }
              launchSessionBot(sock2, phone, sessionFolder, sc2);
            }
          });
          sock2.ev.on('creds.update', sc2);
        } catch(e) { console.log(`[${phone}] ❌ Reconnexion WS échouée: ${e.message}`); }
        return;
      }

      if (loggedOut) {
        // Déconnexion WhatsApp volontaire → supprimer
        activeSessions.delete(phone);
        try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch {}
        console.log(`[${phone}] 🗑️ Session supprimée (loggedOut)`);
      } else if (currentStatus === 'connected') {
        // Déconnexion réseau → reconnexion silencieuse SANS pairing code
        activeSessions.delete(phone);
        console.log(`[${phone}] 🔄 Déconnexion réseau — reconnexion silencieuse...`);
        await delay(5000);
        await reconnectSession(phone);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
  return formatted;
}


// =============================================
// 🤖 LAUNCH SESSION BOT — bot complet indépendant par session
// =============================================
function launchSessionBot(sock, phone, sessionFolder, saveCreds) {
  console.log(`[${phone}] 🚀 Bot indépendant démarré!`);
  // ✅ Stocker le phone dans le sock pour accès dans handleCommand
  sock._sessionPhone = phone;
  // ✅ Charger l'état sauvegardé de cette session si existe
  try {
    const sessFile = `./store_${phone}/session_state.json`;
    if (fs.existsSync(sessFile)) {
      const saved = JSON.parse(fs.readFileSync(sessFile, 'utf8'));
      const state = getSessionState(phone);
      if (saved.prefix) state.prefix = saved.prefix;
      if (saved.botMode) state.botMode = saved.botMode;
    }
  } catch(e) {}

  // ✅ Patch sendMessage : ajoute le bouton "Voir la chaîne" sur chaque message
  const _origSend = sock.sendMessage.bind(sock);
  sock.sendMessage = async function(jid, content, options = {}) {
    try {
      if (!content || typeof content !== 'object') return null;
      if (!jid || typeof jid !== 'string') return null;

      if (content.text !== undefined && (content.text === null || (typeof content.text === 'string' && content.text.trim() === ''))) return null;

      const isSpecial = content.react !== undefined || content.delete !== undefined ||
                        content.groupStatusMessage !== undefined || content.edit !== undefined ||
                        jid === 'status@broadcast';

      const hasVisibleContent = content.text || content.image || content.video ||
                                content.audio || content.sticker || content.document ||
                                content.location || content.poll || content.forward;

      if (!isSpecial && hasVisibleContent) {
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
    return _origSend(jid, content, options);
  };

  // ✅ Message de bienvenue identique au bot principal
  setTimeout(async () => {
    try {
      const botJid = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
      const welcomeMsg =
`┏━━━━ ⚙️ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 TD 🇷🇴━━━━
┃
┃ ᴘʀᴇғɪx  ⪧ [ ${config.prefix} ]
┃ ᴍᴏᴅᴇ    ⪧ ᴘᴜʙʟɪᴄ
┃ sᴛᴀᴛᴜs  ⪧ ᴏɴʟɪɴᴇ
┃ ᴘᴀɴᴇʟ   ⪧ ᴘʀᴇᴍɪᴜᴍ
┃ ᴀᴅᴍɪɴ   ⪧ +${config.botAdmins?.[0] || phone}
┃
┃
┗━━━━━━━━━━━━━━━━━━━━━━━━

📢 *Pour ne rater aucune mise à jour future, rejoins :*
🔗 Chaîne : https://whatsapp.com/channel/0029VbBZrLBFMqrQIDpcfO04
👥 Groupe  : https://chat.whatsapp.com/KfbEkfcbepR0DPXuewOrur`;

      await sock.sendMessage(botJid, { text: welcomeMsg });
      console.log(`[${phone}] 📨 Message de bienvenue envoyé!`);
    } catch(e) {
      console.log(`[${phone}] ⚠️ Bienvenue échoué: ${e.message}`);
    }
  }, 3000);

  // ✅ Handler messages — appelle directement handleCommand comme le bot principal
  const _sessionProcessedIds = new Set();
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      try {
        // Filtre âge (60s) — idem bot principal
        const msgAge = Date.now() - ((message.messageTimestamp || 0) * 1000);
        if (msgAge > 60000) continue;

        const msgId = message.key?.id;
        if (!msgId || _sessionProcessedIds.has(msgId)) continue;
        _sessionProcessedIds.add(msgId);
        if (_sessionProcessedIds.size > 2000) _sessionProcessedIds.delete(_sessionProcessedIds.values().next().value);

        const remoteJid = message.key.remoteJid;
        if (!remoteJid || remoteJid === 'status@broadcast') continue;

        const isGroup = remoteJid.endsWith('@g.us');
        let senderJid;
        if (message.key.fromMe) {
          senderJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        } else if (isGroup) {
          senderJid = message.key.participant || message.participant || remoteJid;
        } else {
          senderJid = message.key.participant || remoteJid;
        }
        if (senderJid && senderJid.includes(':')) {
          senderJid = senderJid.split(':')[0] + '@s.whatsapp.net';
        }

        // Extraire le texte (idem bot principal)
        const _rawMsg = message.message;
        const messageText = _rawMsg?.conversation ||
                            _rawMsg?.extendedTextMessage?.text ||
                            _rawMsg?.imageMessage?.caption ||
                            _rawMsg?.videoMessage?.caption ||
                            _rawMsg?.documentMessage?.caption ||
                            _rawMsg?.ephemeralMessage?.message?.conversation ||
                            _rawMsg?.viewOnceMessage?.message?.imageMessage?.caption ||
                            _rawMsg?.viewOnceMessage?.message?.videoMessage?.caption || '';

        // ✅ PREFIX ET BOTMODE PAR SESSION
        const _sess = getSessionState(phone);
        const _sessPrefix = _sess.prefix || config.prefix;
        const _sessBotMode = _sess.botMode || 'public';

        // Mode privé par session : ignorer si pas owner/admin
        const _isOwner = message.key.fromMe === true || isAdmin(senderJid) || isSuperAdminJid(senderJid);
        if (_sessBotMode === 'private' && !_isOwner) continue;

        if (!messageText.startsWith(_sessPrefix)) continue;

        // Injecter le prefix de session temporairement pour handleCommand
        const _savedPrefix = config.prefix;
        config.prefix = _sessPrefix;
        console.log(`[${phone}] 📨 Commande: ${messageText.substring(0, 60)} de ${senderJid}`);
        try {
          await handleCommand(sock, message, messageText, remoteJid, senderJid, isGroup, _isOwner);
        } finally {
          config.prefix = _savedPrefix;
        }

      } catch(e) {
        console.error(`[${phone}] ❌ Erreur commande:`, e.message);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
  console.log(`[${phone}] 👂 Bot complet actif — handleCommand branché directement`);
}

// Bot configuration
const config = {
  botName: 'SEIGNEUR TD 🇷🇴',
  prefix: '!',
  language: 'ar', // 'ar' = Arabe, 'fr' = Français, 'en' = English
  autoReply: false,
  sessionFolder: './auth_info_baileys',
  usePairingCode: false,
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
let autoReadStatus   = true;   // autoviewstatus — voit les statuts automatiquement
let autoLikeStatus   = true;   // autoreactstatus — réagit ❤️ aux statuts
let autoSaveStatus   = false;  // autosavestatus — enregistre les médias statuts dans PV
let antiDeleteStatus = false;  // antideletestatus — garde statuts supprimés dans PV
// Cache statuts pour antideletestatus: { id -> { sender, media, text, mimetype, type } }
const statusCache    = new Map();
let antiDelete = true;
let antiEdit = true;
let antiDeleteMode = 'all'; // 'private' | 'gchat' | 'all'
let antiEditMode = 'all';   // 'private' | 'gchat' | 'all'
let antiBug = true; // ✅ Anti-Bug activé par défaut
let antiCallEnabled = true;
let antiStickerEnabled = false;
let antiImageEnabled = false;
let antiVideoEnabled = false;
let antiVoiceEnabled = false;
let chatbotEnabled = false; // 🤖 Chatbot SEIGNEUR TD OFF par défaut
let stickerPackname = 'SEIGNEUR TD 🇷🇴'; // 📦 Nom du pack sticker
let stickerAuthor = 'SEIGNEUR TD 🇷🇴'; // ✍️ Auteur du sticker
let menuStyle = 1; // 🎨 Style de menu (1, 2, 3)
let savedViewOnce = new Map();
let messageCache = new Map();
let groupSettings = new Map();
let memberActivity = new Map();

// =============================================
// NOUVEAU SYSTÈME ANTIDELETE — État global
// =============================================
const _AD_CACHE_CLEAN_INTERVAL = 2 * 60 * 60 * 1000;
const _AD_MAX_MESSAGE_CACHE    = 500;

const _adState = {
  messageCache: new Map(),
  mediaCache:   new Map(),
  groupCache:   new Map(),
  cleanupInterval: null,
  settings: {
    autoCleanEnabled:   true,
    maxAgeHours:        6,
    maxStorageMB:       50,
    autoCleanRetrieved: true,
    showGroupNames:     true
  },
  stats: {
    totalMessages: 0, deletedDetected: 0, retrieved: 0,
    mediaCaptured: 0, sentToDm: 0, sentToChat: 0, cacheCleans: 0
  }
};

function _adGetNumber(jid) {
  if (!jid) return 'Unknown';
  try {
    const n = jid.split('@')[0].split(':')[0].replace(/[^\d]/g, '');
    return n.length >= 10 ? `+${n}` : jid.split('@')[0];
  } catch { return 'Unknown'; }
}

function _adGetGroupName(chatJid) {
  if (!chatJid || !chatJid.includes('@g.us')) return 'Chat privé';
  if (_adState.groupCache.has(chatJid)) return _adState.groupCache.get(chatJid).name || 'Groupe';
  const gmd = globalThis.groupMetadataCache?.get(chatJid);
  if (gmd?.data?.subject) {
    _adState.groupCache.set(chatJid, { name: gmd.data.subject });
    return gmd.data.subject;
  }
  return chatJid.split('@')[0];
}

async function _adAutoClean() {
  if (!_adState.settings.autoCleanEnabled) return;
  const now = Date.now();
  const maxAge = _adState.settings.maxAgeHours * 3600000;
  for (const [k, v] of _adState.messageCache) if (now - v.timestamp > maxAge) _adState.messageCache.delete(k);
  for (const [k, v] of _adState.mediaCache)   if (now - v.savedAt  > maxAge) _adState.mediaCache.delete(k);
  _adState.stats.cacheCleans++;
}

function _adStartAutoClean() {
  if (_adState.cleanupInterval) clearInterval(_adState.cleanupInterval);
  _adState.cleanupInterval = setInterval(_adAutoClean, _AD_CACHE_CLEAN_INTERVAL);
}

// Stocker chaque message entrant pour antidelete avancé
async function _adStoreMessage(sock, message) {
  try {
    if (!antiDelete) return;
    const msgKey = message.key;
    if (!msgKey?.id || msgKey.fromMe) return;
    const msgId     = msgKey.id;
    const chatJid   = msgKey.remoteJid;
    const senderJid = msgKey.participant || chatJid;
    if (chatJid === 'status@broadcast') return;
    if (chatJid?.endsWith('@lid') && !chatJid?.endsWith('@g.us')) return;

    const msgContent = normalizeMessageContent(message.message);
    let type = 'text', text = '', hasMedia = false, mimetype = '', mediaInfo = null;

    if (msgContent?.conversation) {
      text = msgContent.conversation;
    } else if (msgContent?.extendedTextMessage?.text) {
      text = msgContent.extendedTextMessage.text;
    } else if (msgContent?.imageMessage) {
      type = 'image'; text = msgContent.imageMessage.caption || ''; hasMedia = true;
      mimetype = msgContent.imageMessage.mimetype || 'image/jpeg';
      mediaInfo = { message: { key: message.key, message: { imageMessage: msgContent.imageMessage } }, type, mimetype };
    } else if (msgContent?.videoMessage) {
      type = 'video'; text = msgContent.videoMessage.caption || ''; hasMedia = true;
      mimetype = msgContent.videoMessage.mimetype || 'video/mp4';
      mediaInfo = { message: { key: message.key, message: { videoMessage: msgContent.videoMessage } }, type, mimetype };
    } else if (msgContent?.audioMessage) {
      type = msgContent.audioMessage.ptt ? 'voice' : 'audio'; hasMedia = true;
      mimetype = msgContent.audioMessage.mimetype || 'audio/mpeg';
      mediaInfo = { message: { key: message.key, message: { audioMessage: msgContent.audioMessage } }, type: 'audio', mimetype };
    } else if (msgContent?.documentMessage) {
      type = 'document'; text = msgContent.documentMessage.fileName || 'Document'; hasMedia = true;
      mimetype = msgContent.documentMessage.mimetype || 'application/octet-stream';
      mediaInfo = { message: { key: message.key, message: { documentMessage: msgContent.documentMessage } }, type, mimetype };
    } else if (msgContent?.stickerMessage) {
      type = 'sticker'; hasMedia = true;
      mimetype = msgContent.stickerMessage.mimetype || 'image/webp';
      mediaInfo = { message: { key: message.key, message: { stickerMessage: msgContent.stickerMessage } }, type, mimetype };
    }

    if (!text && !hasMedia) return;

    const chatName = chatJid.includes('@g.us') ? _adGetGroupName(chatJid) : _adGetNumber(chatJid);
    _adState.messageCache.set(msgId, {
      id: msgId, chatJid, chatName, senderJid,
      realNumber: _adGetNumber(senderJid),
      pushName: message.pushName || 'Unknown',
      timestamp: (message.messageTimestamp * 1000) || Date.now(),
      type, text, hasMedia, mimetype, isGroup: chatJid.includes('@g.us')
    });
    _adState.stats.totalMessages++;

    if (_adState.messageCache.size > _AD_MAX_MESSAGE_CACHE) {
      _adState.messageCache.delete(_adState.messageCache.keys().next().value);
    }

    // Pré-télécharger le média en arrière-plan
    if (hasMedia && mediaInfo) {
      setTimeout(async () => {
        try {
          const buffer = await downloadMediaMessage(mediaInfo.message, 'buffer', {}, {
            logger: { level: 'silent' },
            reuploadRequest: sock?.updateMediaMessage
          });
          if (buffer && buffer.length > 0 && buffer.length <= 10 * 1024 * 1024) {
            _adState.mediaCache.set(msgId, { type, mimetype, buffer, size: buffer.length, savedAt: Date.now() });
            if (_adState.mediaCache.size > 200) _adState.mediaCache.delete(_adState.mediaCache.keys().next().value);
            _adState.stats.mediaCaptured++;
          }
        } catch {}
      }, Math.random() * 2000 + 1000);
    }
  } catch (e) {
    console.error('❌ _adStoreMessage:', e.message);
  }
}

// Démarrer le nettoyage automatique au lancement
_adStartAutoClean();

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

// ✅ État par session (prefix, botMode, etc. indépendants)
const sessionStates = new Map();
function getSessionState(phone) {
  if (!sessionStates.has(phone)) {
    sessionStates.set(phone, {
      prefix: '!',
      botMode: 'public',
    });
  }
  return sessionStates.get(phone);
}
function getSessionStoreDir(phone) {
  const dir = `./store_${phone}`;
  if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
  return dir;
}
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
    botMode        = savedConfig.botMode ?? 'public'; // ✅ Restaurer le mode sauvegardé
    autoTyping     = savedConfig.autoTyping     ?? false;
    autoRecording  = savedConfig.autoRecording  ?? true;
    autoReact      = savedConfig.autoReact      ?? true;
    autoReadStatus   = savedConfig.autoReadStatus   ?? true;
    autoLikeStatus   = savedConfig.autoLikeStatus   ?? true;
    autoSaveStatus   = savedConfig.autoSaveStatus   ?? false;
    antiDeleteStatus = savedConfig.antiDeleteStatus ?? false;
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
    // ✅ FIX PREFIX: restaurer le prefix sauvegardé (sinon revient toujours à '!')
    if (savedConfig.prefix) config.prefix = savedConfig.prefix;
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
    autoReadStatus, autoLikeStatus, autoSaveStatus, antiDeleteStatus, antiDelete, antiEdit, antiDeleteMode, antiEditMode, antiBug, chatbotEnabled, autoreactWords,
    stickerPackname, stickerAuthor, menuStyle,
    prefix: config.prefix,
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
        prefix: config.prefix,
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
let _currentIsGroupAdmin = false; // ✅ admin WhatsApp du groupe courant
let _origSendMessageGlobal = null; // stocké globalement pour swgrup et autres
let _botFirstConnect = true; // auto-restart à la première connexion
let _botOwnNumber = ''; // numéro du bot, défini après connexion

function isBotOwner() {
  return _currentFromMe;
}

// isAdminOrOwner() = true si :
//   - message.key.fromMe (numéro connecté au bot)
//   - OU senderJid est dans adminNumbers/botAdmins
//   - OU senderJid est le super admin
function isAdminOrOwner() {
  if (_currentFromMe) return true;
  // Comparer senderJid avec le numéro du bot connecté
  if (_botOwnNumber) {
    const _n = (_currentSenderJid||'').replace(/@.*/,'').replace(/:[0-9]+$/,'').replace(/[^0-9]/g,'');
    if (_n === _botOwnNumber) return true;
  }
  // ✅ Admin WhatsApp du groupe courant
  if (_currentIsGroupAdmin) return true;
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

// =============================================
// 📵 ANTI-CALL — Refuser les appels entrants
// =============================================
async function handleIncomingCall(sock, call) {
  try {
    if (!antiCallEnabled) return;
    // Baileys: l'objet call peut avoir .from ou .chatId selon version
    const callerJid = call.from || call.chatId;
    const callId    = call.id;
    const isVideo   = call.isVideo || false;
    console.log(`📞 [ANTI-CALL] Appel ${isVideo ? 'vidéo' : 'audio'} de ${callerJid} id=${callId}`);

    // rejectCall est la méthode officielle @whiskeysockets/baileys
    try {
      await sock.rejectCall(callId, callerJid);
      console.log('[ANTI-CALL] ✅ Appel rejeté via rejectCall');
    } catch(e1) {
      // Fallback pour certaines versions : sendMessage call-related
      console.log('[ANTI-CALL] rejectCall échoué:', e1.message, '— fallback terminateCall');
      try {
        await sock.sendMessage(callerJid, { text: '' }); // ouvre le chat
      } catch(e2) {}
    }

    // Notifier l'appelant
    await sock.sendMessage(callerJid, {
      text: `📵 *Anti-Call Actif*\n\nLes appels sont désactivés sur ce bot.\n_© SEIGNEUR TD 🇷🇴_`
    }).catch(() => {});

  } catch (error) {
    console.error('[ANTI-CALL] Erreur:', error.message);
  }
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
  const defaults = {
    antilink: false, antibot: false, antitag: false, antispam: false,
    antisticker: false, antiimage: false, antivideo: false, antivoice: false,
    antidelete: false, antiedit: false, anticall: false,
    antimentiongroupe: false,
    welcome: false, goodbye: false,
    welcomeMsg: '', goodbyeMsg: '',
    maxWarns: 3
  };
  if (!groupSettings.has(groupJid)) {
    groupSettings.set(groupJid, { ...defaults });
    saveStoreKey('groupSettings');
  } else {
    // Merger les nouveaux champs manquants sans écraser les existants
    const existing = groupSettings.get(groupJid);
    let changed = false;
    for (const [k, v] of Object.entries(defaults)) {
      if (!(k in existing)) { existing[k] = v; changed = true; }
    }
    if (changed) saveStoreKey('groupSettings');
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
  return initGroupSettings(groupJid); // utilise initGroupSettings complet
}

// ✅ Suppression message compatible toutes versions Baileys
async function deleteMessage(sock, remoteJid, msgKey) {
  try {
    // Méthode 1 : sendMessage delete (Baileys récent)
    await sock.sendMessage(remoteJid, { delete: msgKey });
  } catch(e1) {
    try {
      // Méthode 2 : chatModify (anciennes versions)
      await sock.chatModify({ delete: true, lastMessages: [{ key: msgKey, messageTimestamp: Date.now() }] }, remoteJid);
    } catch(e2) {
      console.error('[deleteMessage] Les deux méthodes ont échoué:', e2.message);
    }
  }
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
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 250,
    maxMsgRetryCount: 5,
    getMessage: async (key) => {
      return { conversation: '' };
    }
  });

  // Handle pairing code — DÉSACTIVÉ pour le bot principal
  // Le pairing se fait uniquement via le site web (/api/connect)
  // Ne pas générer de code automatiquement pour ne pas déranger avec des notifications
  if (false && config.usePairingCode && !sock.authState.creds.registered) {
    // Désactivé intentionnellement
  }

  // Anti-Call handler
  sock.ev.on('call', async (calls) => {
    for (const call of calls) await handleIncomingCall(sock, call);
  });

  // Connection update handler
  // Connection update handler
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !config.usePairingCode) {
      // QR ignoré — utiliser le site web pour se connecter
      console.log('[BOT PRINCIPAL] QR généré — ignoré (utiliser /api/connect)');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed. Code: ${statusCode}, reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        // Délai adaptatif selon le code d'erreur
        const retryDelay = (statusCode === 408 || statusCode === 503 || statusCode === 515) ? 3000 : 5000;
        await delay(retryDelay);
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
      _botSock = sock; // ✅ Enregistrer pour le watchdog

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
      if (!content || typeof content !== 'object') return null;
      if (!jid || typeof jid !== 'string') return null;

      // ✅ Bloquer text vide
      if (content.text !== undefined && (content.text === null || (typeof content.text === 'string' && content.text.trim() === ''))) return null;

      // ✅ Types spéciaux qui ne reçoivent PAS le contexte chaîne
      const isSpecial = content.react !== undefined || content.delete !== undefined ||
                        content.groupStatusMessage !== undefined || content.edit !== undefined ||
                        jid === 'status@broadcast';

      // ✅ Vérifier que le message a un contenu visible avant d'injecter le contexte
      const hasVisibleContent = content.text || content.image || content.video ||
                                content.audio || content.sticker || content.document ||
                                content.location || content.poll || content.forward;

      if (!isSpecial && hasVisibleContent) {
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
  // ANTI-DELETE — Nouveau système avancé avec cache média
  // =============================================

  const _adRecentlyProcessed = new Map();
  const _adPublicCooldowns   = new Map();

  async function _adRetrySend(sendFn, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try { await sendFn(); return true; }
      catch (err) {
        const m = (err.message || '').toLowerCase();
        if ((m.includes('connection') || m.includes('timed out') || m.includes('not open')) && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, attempt * 3000));
          continue;
        }
        throw err;
      }
    }
    return false;
  }

  async function _sendDeletedMedia(notifyJid, msgData, detailsText, mediaBuffer, mediaMime, mediaType) {
    if (mediaType === 'sticker') {
      await _adRetrySend(async () => {
        const stkMsg = await sock.sendMessage(notifyJid, { sticker: mediaBuffer, mimetype: mediaMime });
        await sock.sendMessage(notifyJid, { text: detailsText }, { quoted: stkMsg });
      });
    } else if (mediaType === 'image') {
      await _adRetrySend(() => sock.sendMessage(notifyJid, { image: mediaBuffer, caption: detailsText, mimetype: mediaMime }));
    } else if (mediaType === 'video') {
      await _adRetrySend(() => sock.sendMessage(notifyJid, { video: mediaBuffer, caption: detailsText, mimetype: mediaMime }));
    } else if (mediaType === 'audio' || mediaType === 'voice') {
      await _adRetrySend(async () => {
        await sock.sendMessage(notifyJid, { audio: mediaBuffer, mimetype: mediaMime, ptt: mediaType === 'voice' });
        await sock.sendMessage(notifyJid, { text: detailsText });
      });
    } else if (mediaType === 'document') {
      await _adRetrySend(() => sock.sendMessage(notifyJid, { document: mediaBuffer, mimetype: mediaMime, fileName: msgData.text || 'fichier', caption: detailsText }));
    } else {
      await _adRetrySend(() => sock.sendMessage(notifyJid, { text: detailsText }));
    }
  }

  async function _handleAntiDelete(cachedMsg, fromMe) {
    if (!antiDelete || !cachedMsg || fromMe) return;

    const _botPvJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

    // Anti-doublon
    const msgId = cachedMsg.key?.id || cachedMsg.id;
    if (msgId) {
      if (_adRecentlyProcessed.has(msgId)) return;
      _adRecentlyProcessed.set(msgId, Date.now());
      setTimeout(() => _adRecentlyProcessed.delete(msgId), 30000);
    }

    // Chercher d'abord dans le nouveau cache avancé
    const adCached = msgId ? _adState.messageCache.get(msgId) : null;

    // Données finales du message (nouveau cache prioritaire, fallback ancien)
    const senderJid    = adCached?.senderJid || cachedMsg.sender || cachedMsg.senderJid;
    const senderNumber = adCached?.realNumber || _adGetNumber(senderJid);
    const senderName   = adCached?.pushName || cachedMsg.senderName || senderNumber;
    const chatName     = adCached?.chatName || (cachedMsg.isGroup ? _adGetGroupName(cachedMsg.remoteJid) : 'Chat privé');
    const msgType      = adCached?.type?.toUpperCase() || (cachedMsg.text === '[Media]' ? 'MÉDIA' : 'TEXTE');
    const msgText      = adCached?.text || (cachedMsg.text !== '[Media]' ? cachedMsg.text : '');
    const chatJid      = adCached?.chatJid || cachedMsg.remoteJid;
    const time         = new Date(adCached?.timestamp || cachedMsg.timestamp || Date.now()).toLocaleString();

    // Ignorer les messages de l'owner
    const ownerNum = _botPvJid.split('@')[0];
    if (senderJid?.split('@')[0]?.split(':')[0] === ownerNum) return;

    // Mode public cooldown (5s par chat)
    const now = Date.now();
    if (antiDeleteMode === 'public') {
      const last = _adPublicCooldowns.get(chatJid) || 0;
      if (now - last < 5000) return;
      _adPublicCooldowns.set(chatJid, now);
    }

    let notifyJid = antiDeleteMode === 'public' ? chatJid : _botPvJid;

    let detailsText = `\n\n✧ SEIGNEUR TD antidelete🐺\n`;
    detailsText += `✧ 𝙳𝚎𝚕𝚎𝚝𝚎𝚍 𝙱𝚢 : ${senderNumber}\n`;
    detailsText += `✧ 𝚂𝚎𝚗𝚝 𝚋𝚢 : ${senderNumber} (${senderName})\n`;
    detailsText += `✧ 𝙲𝚑𝚊𝚝 : ${chatName}\n`;
    detailsText += `✧ 𝚃𝚒𝚖𝚎 : ${time}\n`;
    detailsText += `✧ 𝚃𝚢𝚙𝚎 : ${msgType}\n`;
    if (msgText) detailsText += `\n✧ 𝗠𝗲𝘀𝘀𝗮𝗴𝗲:\n${msgText}`;

    try {
      // 1. Essayer le nouveau cache média (pré-téléchargé)
      const adMedia = msgId ? _adState.mediaCache.get(msgId) : null;
      let mediaBuffer = adMedia?.buffer || null;
      let mediaMime   = adMedia?.mimetype || adCached?.mimetype || '';
      let mediaType   = adMedia?.type || adCached?.type || 'text';

      // 2. Fallback: télécharger via downloadContentFromMessage (ancien système)
      if (!mediaBuffer) {
        const _m = cachedMsg.message;
        if (_m) {
          const _vv  = _m.viewOnceMessageV2?.message || _m.viewOnceMessageV2Extension?.message;
          const _img = _vv?.imageMessage || _m.imageMessage;
          const _vid = _vv?.videoMessage || _m.videoMessage;
          const _aud = _m.audioMessage;
          const _stk = _m.stickerMessage;
          const _doc = _m.documentMessage;

          try {
            if (_img)      { mediaBuffer = await toBuffer(await downloadContentFromMessage(_img, 'image'));    mediaMime = _img.mimetype || 'image/jpeg'; mediaType = 'image'; }
            else if (_vid) { mediaBuffer = await toBuffer(await downloadContentFromMessage(_vid, 'video'));    mediaMime = _vid.mimetype || 'video/mp4';  mediaType = 'video'; }
            else if (_aud) { mediaBuffer = await toBuffer(await downloadContentFromMessage(_aud, 'audio'));    mediaMime = _aud.mimetype || 'audio/ogg';  mediaType = _aud.ptt ? 'voice' : 'audio'; }
            else if (_stk) { mediaBuffer = await toBuffer(await downloadContentFromMessage(_stk, 'sticker')); mediaMime = _stk.mimetype || 'image/webp'; mediaType = 'sticker'; }
            else if (_doc) { mediaBuffer = await toBuffer(await downloadContentFromMessage(_doc, 'document'));mediaMime = _doc.mimetype || 'application/octet-stream'; mediaType = 'document'; }
          } catch {}
        }
      }

      if (mediaBuffer && mediaBuffer.length > 0) {
        await _sendDeletedMedia(notifyJid, adCached || cachedMsg, detailsText, mediaBuffer, mediaMime, mediaType);
        // Nettoyer le cache après envoi
        if (msgId) { _adState.messageCache.delete(msgId); _adState.mediaCache.delete(msgId); }
      } else {
        await _adRetrySend(() => sock.sendMessage(notifyJid, { text: detailsText }));
      }

    } catch (_e) {
      console.error('[ANTIDEL MEDIA]', _e.message);
      try { await sock.sendMessage(notifyJid, { text: detailsText + '\n\n❌ Média non récupérable' }); } catch {}
    }

    // En mode public, envoyer aussi en DM
    if (antiDeleteMode === 'public' && notifyJid !== _botPvJid) {
      sock.sendMessage(_botPvJid, { text: detailsText }).catch(() => {});
    }

    _adState.stats.deletedDetected++;
    _adState.stats.retrieved++;
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

  // ✅ Attacher handler messages aux nouvelles sessions connectées via le site
  setInterval(() => {
    const pending = global.pendingSessionSocks || [];
    while (pending.length > 0) {
      const { sock: sSock, phone: sPhone } = pending.shift();
      console.log(`[BOT] 🔗 Handler messages activé pour ${sPhone}`);
      sSock.ev.on('messages.upsert', async ({ messages: m2, type: t2 }) => {
        if (t2 !== 'notify') return;
        for (const msg2 of m2) {
          try { sock.ev.emit('messages.upsert', { messages: [msg2], type: 'notify' }); } catch(e) {}
        }
      });
    }
  }, 1000);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if(type!=='notify')return;
    for(const message of messages){
      const _msgJid = message.key?.remoteJid || '';

      // ── ANTI-DELETE : protocolMessage REVOKE ──
      // Géré EN PREMIER, avant tout filtre d'âge
      const _proto = message.message?.protocolMessage;
      if (_proto) {
        // Type 0 ou REVOKE = suppression
        if (_proto.type === 0 || _proto.type === 'REVOKE') {
          if (antiDelete && _msgJid !== 'status@broadcast') {
            const _deletedId = _proto.key?.id;
            const _cached = _deletedId ? messageCache.get(_deletedId) : null;
            if (_cached) {
              _handleAntiDelete(_cached, _proto.key?.fromMe === true).catch(e => console.error('[ANTIDEL]', e.message));
            } else {
              console.log('[ANTIDEL] ID', _deletedId, 'pas en cache (message trop ancien?)');
            }
          }
          continue;
        }
        // Type EDIT (type=14) dans protocolMessage
        const _editedMsg = _proto.editedMessage;
        if (_editedMsg) {
          if (antiEdit && _msgJid !== 'status@broadcast') {
            const _origId = _proto.key?.id;
            const _newTxt = _editedMsg.message?.conversation ||
                            _editedMsg.message?.extendedTextMessage?.text;
            const _cached = _origId ? messageCache.get(_origId) : null;
            if (_cached && _newTxt) {
              _handleAntiEdit(_cached, _newTxt).catch(e => console.error('[ANTIEDIT]', e.message));
            }
          }
          continue;
        }
      }

      // ── ANTI-EDIT : editedMessage direct ──
      const _editedDirect = message.message?.editedMessage;
      if (_editedDirect) {
        if (antiEdit && _msgJid !== 'status@broadcast') {
          const _origId = _editedDirect.key?.id;
          const _newTxt = _editedDirect.message?.conversation ||
                          _editedDirect.message?.extendedTextMessage?.text;
          const _cached = _origId ? messageCache.get(_origId) : null;
          if (_cached && _newTxt) {
            _handleAntiEdit(_cached, _newTxt).catch(e => console.error('[ANTIEDIT DIRECT]', e.message));
          }
        }
        continue;
      }

      const msgAge=Date.now()-((message.messageTimestamp||0)*1000);
      if(msgAge>60000)continue;
      _lastMsgTime = Date.now(); // ✅ Watchdog: màj activité
      const msgId=message.key.id;
      if(processedMsgIds.has(msgId))continue;
      processedMsgIds.add(msgId);
      if(processedMsgIds.size>2000)processedMsgIds.delete(processedMsgIds.values().next().value);
      // IMPORTANT: Accepter les messages du bot aussi (pour les discussions privées with le numéro du bot)
      if (message.key.remoteJid === 'status@broadcast') {
        // =============================================
        // GESTION AUTOMATIQUE DES STATUS
        // autoviewstatus / autoreactstatus / autosavestatus / antideletestatus
        // =============================================
        try {
          const statusSender = message.key.participant || message.key.remoteJid;
          const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
          const _sMsg  = message.message || {};
          const _sMsgType = Object.keys(_sMsg)[0] || '';

          // Ignorer les protocolMessage (suppress, revoke de statut)
          if (_sMsgType === 'protocolMessage') {
            // ANTI-DELETE STATUS : si c'est un REVOKE de statut
            if (antiDeleteStatus && _sMsg.protocolMessage?.type === 0) {
              const _delId = _sMsg.protocolMessage?.key?.id;
              const _cached = _delId ? statusCache.get(_delId) : null;
              if (_cached && _cached.sender !== botJid) {
                const _pvJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const _info = `🗑️ *Status supprimé de @${_cached.sender.split('@')[0]}*\n⏰ ${new Date(_cached.ts).toLocaleTimeString('fr-FR')}`;
                try {
                  if (_cached.buffer && _cached.mimetype) {
                    if (_cached.type === 'image') {
                      await sock.sendMessage(_pvJid, { image: _cached.buffer, caption: _info, mimetype: _cached.mimetype });
                    } else if (_cached.type === 'video') {
                      await sock.sendMessage(_pvJid, { video: _cached.buffer, caption: _info, mimetype: _cached.mimetype });
                    } else {
                      await sock.sendMessage(_pvJid, { text: _info });
                    }
                  } else {
                    await sock.sendMessage(_pvJid, { text: _info + (_cached.text ? `\n📝 ${_cached.text}` : '') });
                  }
                } catch(e) { console.error('[ANTIDEL STATUS]', e.message); }
              }
            }
            continue;
          }

          console.log(`📱 Status de: ${statusSender} type=${_sMsgType}`);

          // ── 1. AUTO-VIEW STATUS (autoviewstatus) ──
          if (autoReadStatus) {
            // Baileys: readMessages marque le statut comme vu
            await sock.readMessages([message.key]).catch(e => console.log('[AUTOVIEW]', e.message));
            console.log('✅ Status vu automatiquement');
          }

          // ── 2. AUTO-REACT STATUS ❤️ (autoreactstatus) ──
          if (autoLikeStatus && statusSender !== botJid) {
            // statusJidList est obligatoire pour réagir à un statut dans Baileys
            await sock.sendMessage('status@broadcast', {
              react: { text: '❤️', key: message.key }
            }, { statusJidList: [statusSender, botJid] }).catch(e => console.log('[AUTOREACT]', e.message));
            console.log('❤️ Status liké');
          }

          // ── 3. CACHE STATUT pour antideletestatus ──
          // Stocker le statut avec son média (image/vidéo/texte)
          if (antiDeleteStatus || autoSaveStatus) {
            const _stId = message.key.id;
            let _stBuffer = null, _stMime = '', _stType = '', _stText = '';
            try {
              if (_sMsg.imageMessage) {
                _stBuffer = await toBuffer(await downloadContentFromMessage(_sMsg.imageMessage, 'image'));
                _stMime = _sMsg.imageMessage.mimetype || 'image/jpeg';
                _stType = 'image';
                _stText = _sMsg.imageMessage.caption || '';
              } else if (_sMsg.videoMessage) {
                _stBuffer = await toBuffer(await downloadContentFromMessage(_sMsg.videoMessage, 'video'));
                _stMime = _sMsg.videoMessage.mimetype || 'video/mp4';
                _stType = 'video';
                _stText = _sMsg.videoMessage.caption || '';
              } else if (_sMsg.conversation) {
                _stType = 'text';
                _stText = _sMsg.conversation;
              } else if (_sMsg.extendedTextMessage) {
                _stType = 'text';
                _stText = _sMsg.extendedTextMessage.text || '';
              }
            } catch(e) { console.log('[STATUS CACHE DL]', e.message); }

            statusCache.set(_stId, {
              sender: statusSender, buffer: _stBuffer, mimetype: _stMime,
              type: _stType, text: _stText, ts: Date.now()
            });
            // Nettoyer (garder 200 statuts max)
            if (statusCache.size > 200) statusCache.delete(statusCache.keys().next().value);
          }

          // ── 4. AUTO-SAVE STATUS (autosavestatus) ──
          // Envoie automatiquement le statut dans le PV du bot
          if (autoSaveStatus && statusSender !== botJid) {
            const _pvJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const _stId  = message.key.id;
            const _cache = statusCache.get(_stId);
            const _caption = `📥 *Status de @${statusSender.split('@')[0]}*\n⏰ ${new Date().toLocaleTimeString('fr-FR')}`;
            try {
              if (_cache?.buffer && _cache.type === 'image') {
                await sock.sendMessage(_pvJid, { image: _cache.buffer, caption: _caption, mimetype: _cache.mimetype });
              } else if (_cache?.buffer && _cache.type === 'video') {
                await sock.sendMessage(_pvJid, { video: _cache.buffer, caption: _caption, mimetype: _cache.mimetype });
              } else if (_cache?.text) {
                await sock.sendMessage(_pvJid, { text: `${_caption}\n📝 ${_cache.text}` });
              }
              console.log(`💾 Status de ${statusSender} sauvegardé`);
            } catch(e) { console.log('[AUTOSAVE STATUS]', e.message); }
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
      // ✅ Mettre à jour _botOwnNumber depuis sock.user si pas encore fait
      if (!_botOwnNumber && sock.user?.id) {
        _botOwnNumber = sock.user.id.split(':')[0].split('@')[0].replace(/[^0-9]/g,'');
      }
      // ✅ AWAIT isGroupAdmin — doit être résolu AVANT handleCommand pour que isAdminOrOwner() soit correct
      _currentIsGroupAdmin = false;
      if (isGroup && !_currentFromMe) {
        try { _currentIsGroupAdmin = await isGroupAdmin(sock, remoteJid, senderJid); } catch(e) {}
      }

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
      // Stocker TOUS messages (texte + média) pour récupération rapide
      // =============================================
      if (antiDelete || antiEdit) {
        const messageId = message.key.id;
        const _rawM = message.message || {};
        const messageData = {
          key: message.key,
          message: _rawM,
          sender: senderJid,
          senderName: message.pushName || senderJid.split('@')[0],
          remoteJid: remoteJid,
          isGroup: isGroup,
          timestamp: Date.now(),
          text: _rawM.conversation ||
                _rawM.extendedTextMessage?.text ||
                _rawM.imageMessage?.caption ||
                _rawM.videoMessage?.caption ||
                _rawM.documentMessage?.fileName ||
                _rawM.audioMessage ? '[Audio]' :
                _rawM.stickerMessage ? '[Sticker]' :
                _rawM.imageMessage ? '[Image]' :
                _rawM.videoMessage ? '[Vidéo]' :
                '[Media]'
        };
        messageCache.set(messageId, messageData);
        // Garder les 5000 derniers messages
        if (messageCache.size > 5000) {
          messageCache.delete(messageCache.keys().next().value);
        }
        // Nouveau cache avancé (avec pré-téléchargement média)
        _adStoreMessage(sock, message).catch(() => {});
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
        message.message?.audioMessage?.viewOnce === true ||
        message.message?.ptvMessage?.viewOnce === true ||
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
                await deleteMessage(sock, remoteJid, message.key);
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
                await deleteMessage(sock, remoteJid, message.key);
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
                await deleteMessage(sock, remoteJid, message.key);
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
        // ✅ FIX MODE PRIVÉ : bloquer toutes les commandes sauf admins
        if (botMode === 'private' && !isAdminOrOwner()) {
          continue; // Silence total — pas de réponse
        }
        if(!isAdminOrOwner()&&!checkCooldown(senderJid,'any')){
          continue; // cooldown silencieux
        }
        await handleCommand(sock,message,messageText,remoteJid,senderJid,isGroup,_currentFromMe);continue;
      }

      // ══════════════════════════════════════════════════════════
      // 🛡️ DÉTECTION ANTI-MEDIA dans flux principal
      // Fonctionne avec TOUTES les versions de Baileys
      // ══════════════════════════════════════════════════════════
      if (isGroup) {
        try {
          const _s = initGroupSettings(remoteJid);
          const _uIsAdmin = await isGroupAdmin(sock, remoteJid, senderJid);
          const _botIsAdmin = await isBotGroupAdmin(sock, remoteJid);
          const _msg = message.message || {};
          const _userNum = senderJid.split('@')[0];

          if (!_uIsAdmin && !isAdminOrOwner()) {

            // Fonction helper kick+warn
            const _warnAndKick = async (reason, emoji) => {
              const wc = addWarn(remoteJid, senderJid, reason);
              saveStoreKey('groupSettings');
              await sock.sendMessage(remoteJid, {
                text: `${emoji} *@${_userNum}* — ${reason}\n⚠️ Avertissement *${wc}/3*`,
                mentions: [senderJid]
              });
              if (wc >= 3 && _botIsAdmin) {
                try {
                  await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove');
                  await sock.sendMessage(remoteJid, {
                    text: `🚨 *@${_userNum}* expulsé — trop d'avertissements (${reason})`,
                    mentions: [senderJid]
                  });
                  resetWarns(remoteJid, senderJid);
                } catch(ek) { console.error('[KICK]', ek.message); }
              }
            };

            // Fonction suppression compatible Baileys
            const _tryDelete = async () => {
              if (!_botIsAdmin) return;
              try {
                // Construire la clé correcte pour la suppression
                const deleteKey = {
                  remoteJid: remoteJid,
                  id: message.key.id,
                  fromMe: false,
                  participant: senderJid
                };
                await sock.sendMessage(remoteJid, { delete: deleteKey });
              } catch(ed) {
                // Fallback: essai avec la clé originale
                try { await sock.sendMessage(remoteJid, { delete: message.key }); } catch(ed2) {}
              }
            };

            // ANTI-STICKER
            if (_s.antisticker && _msg.stickerMessage) {
              await _tryDelete();
              await _warnAndKick('Sticker interdit', '🛡️');
              continue;
            }
            // ANTI-IMAGE
            if (_s.antiimage && (_msg.imageMessage || _msg.viewOnceMessageV2?.message?.imageMessage)) {
              await _tryDelete();
              await _warnAndKick('Image interdite', '📸');
              continue;
            }
            // ANTI-VIDÉO
            if (_s.antivideo && (_msg.videoMessage || _msg.viewOnceMessageV2?.message?.videoMessage)) {
              await _tryDelete();
              await _warnAndKick('Vidéo interdite', '🎥');
              continue;
            }
            // ANTI-VOCAL (ptt = message vocal uniquement, pas audio normal)
            if (_s.antivoice && _msg.audioMessage?.ptt === true) {
              await _tryDelete();
              await _warnAndKick('Vocal interdit', '🎤');
              continue;
            }
            // ANTI-MENTION GROUPE
            if (_s.antimentiongroupe && messageText && messageText.includes('@everyone')) {
              await _tryDelete();
              await _warnAndKick('Mention groupe interdite', '📢');
              continue;
            }
          }
        } catch(e) { console.error('[ANTI-MEDIA]', e.message); }
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
                        message.message?.viewOnceMessageV2Extension ||
                        message.message?.viewOnceMessage;
    
    // Récupérer l'imageMessage/videoMessage peu importe la structure
    const imgMsg   = viewOnceMsg?.message?.imageMessage  || message.message?.imageMessage;
    const vidMsg   = viewOnceMsg?.message?.videoMessage  || message.message?.videoMessage;
    // ✅ FIX VOCAL VV: chercher l'audio dans toutes les structures possibles
    const audioMsg = viewOnceMsg?.message?.audioMessage  || 
                     viewOnceMsg?.message?.ptvMessage    ||
                     message.message?.audioMessage       ||
                     message.message?.ptvMessage;

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
  // Extraire le prefix utilisé (peut être différent du config.prefix global pour les sessions)
  const _usedPrefix = (() => {
    for (const p of ['!', '.', '/', '#', '$', '%', '?', '+', '-', '*']) {
      if (messageText.startsWith(p)) return p;
    }
    return config.prefix;
  })();
  const args = messageText.slice(_usedPrefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;

  // ✅ Sauvegarder et verrouiller les globals pour cette commande (évite race conditions)
  const _origFromMe = _currentFromMe;
  const _origSenderJid = _currentSenderJid;
  const _origIsGroupAdmin = _currentIsGroupAdmin;
  const _cmdIsOwner = _isOwner || isSuperAdminJid(senderJid) || isAdmin(senderJid);
  _currentFromMe = _cmdIsOwner;
  _currentSenderJid = senderJid;
  // Mettre à jour _botOwnNumber si besoin
  if (!_botOwnNumber && sock.user?.id) {
    _botOwnNumber = sock.user.id.split(':')[0].split('@')[0].replace(/[^0-9]/g,'');
  }

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

  const BOT_ADMIN_ONLY_CMDS=['mode','update','maj','upgrade','autorecording','autoreact','readstatus','autoviewstatus','autoreactstatus','autosavestatus','antideletestatus','antibug','anti-bug','antidelete','antidel','antiedit','leave','kickall','acceptall','join','block','unblock','megaban'];
  if(BOT_ADMIN_ONLY_CMDS.includes(command)&&!isAdminOrOwner()){
    await sock.sendMessage(remoteJid,{text:'⛔ Commande réservée aux admins du bot.'});
    return;
  }

  // 🛡️ Anti-Media (sticker/image/video/voice) — détection inline
  if (isGroup) {
    try {
      const _amSettings = initGroupSettings(remoteJid);
      const _amUserAdmin = await isGroupAdmin(sock, remoteJid, senderJid);
      const _amBotAdmin = await isBotGroupAdmin(sock, remoteJid);
      if (!_amUserAdmin && _amBotAdmin) {
        // ANTI-STICKER
        if (_amSettings.antisticker && message.message?.stickerMessage) {
          await deleteMessage(sock, remoteJid, message.key);
          const wc = addWarn(remoteJid, senderJid, 'Envoi de sticker interdit');
          await sock.sendMessage(remoteJid, { text: `⚠️ ᴀʟᴇʀᴛᴇ ➔ @${senderJid.split('@')[0]}\n↳ ʟᴇs sᴛɪᴄᴋᴇʀs sᴏɴᴛ ɪɴᴛᴇʀᴅɪᴛs ɪᴄɪ.\n\n⚠️ Avertissement ${wc}/3`, mentions: [senderJid] });
          if (wc >= 3) { try { await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove'); await sock.sendMessage(remoteJid, { text: `🚨 ᴇxᴘᴜʟsɪᴏɴ ➔ @${senderJid.split('@')[0]}\n↳ ᴛʀᴏᴘ ᴅ'ᴀᴠᴇʀᴛɪssᴇᴍᴇɴᴛs (sᴛɪᴄᴋᴇʀs)`, mentions: [senderJid] }); } catch(e){} resetWarns(remoteJid, senderJid); }
          return;
        }
        // ANTI-IMAGE
        if (_amSettings.antiimage && message.message?.imageMessage) {
          await deleteMessage(sock, remoteJid, message.key);
          const wc = addWarn(remoteJid, senderJid, "Envoi d'image interdit");
          await sock.sendMessage(remoteJid, { text: `🚨 ʀèɢʟᴇᴍᴇɴᴛ ➔ @${senderJid.split('@')[0]}\n↳ ʟᴇs ɪᴍᴀɢᴇs sᴏɴᴛ ɪɴᴛᴇʀᴅɪᴛᴇs ɪᴄɪ.\n\n⚠️ Avertissement ${wc}/3`, mentions: [senderJid] });
          if (wc >= 3) { try { await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove'); await sock.sendMessage(remoteJid, { text: `🚨 ᴇxᴘᴜʟsɪᴏɴ ➔ @${senderJid.split('@')[0]}\n↳ ᴛʀᴏᴘ ᴅ'ᴀᴠᴇʀᴛɪssᴇᴍᴇɴᴛs (ɪᴍᴀɢᴇs)`, mentions: [senderJid] }); } catch(e){} resetWarns(remoteJid, senderJid); }
          return;
        }
        // ANTI-VIDÉO
        if (_amSettings.antivideo && message.message?.videoMessage) {
          await deleteMessage(sock, remoteJid, message.key);
          const wc = addWarn(remoteJid, senderJid, 'Envoi de vidéo interdit');
          await sock.sendMessage(remoteJid, { text: `🚫 ɪɴᴛᴇʀᴅɪᴛ ➔ @${senderJid.split('@')[0]}\n↳ ʟᴇs ᴠɪᴅéᴏs sᴏɴᴛ ʙʟᴏǫᴜéᴇs ᴅᴀɴs ᴄᴇ ɢʀᴏᴜᴘᴇ.\n\n⚠️ Avertissement ${wc}/3`, mentions: [senderJid] });
          if (wc >= 3) { try { await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove'); await sock.sendMessage(remoteJid, { text: `🚨 ᴇxᴘᴜʟsɪᴏɴ ➔ @${senderJid.split('@')[0]}\n↳ ᴛʀᴏᴘ ᴅ'ᴀᴠᴇʀᴛɪssᴇᴍᴇɴᴛs (ᴠɪᴅéᴏs)`, mentions: [senderJid] }); } catch(e){} resetWarns(remoteJid, senderJid); }
          return;
        }
        // ANTI-VOICE
        if (_amSettings.antivoice && message.message?.audioMessage?.ptt === true) {
          await deleteMessage(sock, remoteJid, message.key);
          const wc = addWarn(remoteJid, senderJid, 'Envoi de vocal interdit');
          await sock.sendMessage(remoteJid, { text: `🔇 ᴍᴜᴇᴛ ➔ @${senderJid.split('@')[0]}\n↳ ᴘᴀs ᴅᴇ ᴠᴏᴄᴀᴜx ! ᴍᴇʀᴄɪ ᴅ'éᴄʀɪʀᴇ ᴠᴏᴛʀᴇ ᴍᴇssᴀɢᴇ.\n\n⚠️ Avertissement ${wc}/3`, mentions: [senderJid] });
          if (wc >= 3) { try { await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove'); await sock.sendMessage(remoteJid, { text: `🚨 ᴇxᴘᴜʟsɪᴏɴ ➔ @${senderJid.split('@')[0]}\n↳ ᴛʀᴏᴘ ᴅ'ᴀᴠᴇʀᴛɪssᴇᴍᴇɴᴛs (ᴠᴏᴄᴀᴜx)`, mentions: [senderJid] }); } catch(e){} resetWarns(remoteJid, senderJid); }
          return;
        }
      }
    } catch(e) { console.error('[ANTI-MEDIA]', e.message); }
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

      // ══════════════════════
      // ⚡ PING — rapidité bot
      // ══════════════════════
      case 'p':
      case 'ping': {
        const _t1 = Date.now();
        await simulateTyping(sock, remoteJid);
        const _t2 = Date.now();
        const _latency = _t2 - _t1;
        const _bar = _latency < 200 ? '🟢' : _latency < 600 ? '🟡' : '🔴';
        await sock.sendMessage(remoteJid, {
          text: `${_bar} *PONG !*\n\n⚡ Latence : *${_latency} ms*\n🤖 Bot : *EN LIGNE*`
        }, { quoted: message });
        break;
      }

      // ══════════════════════
      // ⏱️ UP — durée connecté
      // ══════════════════════
      case 'up':
      case 'uptime': {
        await simulateTyping(sock, remoteJid);
        const _us = Math.floor(process.uptime());
        const _ud = Math.floor(_us / 86400);
        const _uh = Math.floor((_us % 86400) / 3600);
        const _um = Math.floor((_us % 3600) / 60);
        const _usec = _us % 60;
        const _upStr = _ud > 0
          ? `${_ud}j ${_uh}h ${_um}m ${_usec}s`
          : _uh > 0
            ? `${_uh}h ${_um}m ${_usec}s`
            : `${_um}m ${_usec}s`;
        await sock.sendMessage(remoteJid, {
          text: `⏱️ *UPTIME BOT*\n\n🕐 Connecté depuis : *${_upStr}*\n🤖 Statut : *EN LIGNE* ✅`
        }, { quoted: message });
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
      case '5': case 'stickermenu': case 'mediamenu':
        await sendSubMenu(sock, message, remoteJid, senderJid, 'sticker'); break;
      case '6': case 'miscmenu': case 'generalmenu':
        await sendSubMenu(sock, message, remoteJid, senderJid, 'misc'); break;
      case '7': case 'imagemenu': case 'viewoncemenu':
        await sendSubMenu(sock, message, remoteJid, senderJid, 'image'); break;
      case '8': case 'gamesmenu': case 'gamemenu':
        await sendSubMenu(sock, message, remoteJid, senderJid, 'games'); break;

      case 'vv':
        await handleViewOnceCommand(sock, message, args, remoteJid, senderJid);
        break;

      case 'mode':
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Bot admin only command' });
          break;
        }
        {
          // ✅ Mode par session
          const _sPhone = sock._sessionPhone || 'main';
          const _sState = getSessionState(_sPhone);
          const _saveSessionState = () => {
            try {
              const dir = `./store_${_sPhone}`;
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(`${dir}/session_state.json`, JSON.stringify({ prefix: _sState.prefix, botMode: _sState.botMode }));
            } catch(e) {}
          };
          if (args[0] === 'private') {
            _sState.botMode = 'private';
            _saveSessionState();
            await sock.sendMessage(remoteJid, { text: '🔒 *Mode PRIVÉ activé*\nSeuls les admins peuvent utiliser le bot.' });
          } else if (args[0] === 'public') {
            _sState.botMode = 'public';
            _saveSessionState();
            await sock.sendMessage(remoteJid, { text: '🌐 *Mode PUBLIC activé*\nTout le monde peut utiliser le bot.' });
          } else {
            await sock.sendMessage(remoteJid, {
              text: `⚙️ Mode actuel: *${_sState.botMode.toUpperCase()}*\n\n${config.prefix}mode private\n${config.prefix}mode public`
            });
          }
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
        const _spPhone = sock._sessionPhone || 'main';
        const _spState = getSessionState(_spPhone);
        if (!newPrefix || newPrefix.length > 3) {
          await sock.sendMessage(remoteJid, {
            text: `✒️ Préfixe actuel: *${_spState.prefix}*\n\nUsage: ${_spState.prefix}setprefix [préfixe]\nEx: ${_spState.prefix}setprefix .\n\n⚠️ Max 3 caractères.`
          });
          break;
        }
        _spState.prefix = newPrefix;
        config.prefix = newPrefix; // sync pour la commande en cours
        try {
          const dir = `./store_${_spPhone}`;
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(`${dir}/session_state.json`, JSON.stringify({ prefix: _spState.prefix, botMode: _spState.botMode }));
        } catch(e) {}
        await sock.sendMessage(remoteJid, {
          text: `✒️ *Préfixe mis à jour!*\n\n✅ Nouveau préfixe: *${newPrefix}*\n\n_Utilisez maintenant: ${newPrefix}menu_`
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
      case 'autoviewstatus': {
        if (!isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' }, { quoted: message }); break; }
        autoReadStatus = args[0] === 'on' ? true : args[0] === 'off' ? false : !autoReadStatus;
        saveStoreKey('config');
        await sock.sendMessage(remoteJid, { text: `👁️ *AUTOVIEW STATUS* : ${autoReadStatus ? '✅ ACTIVÉ — Les statuts seront vus automatiquement' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'autoreactstatus':
      case 'likestatus': {
        if (!isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' }, { quoted: message }); break; }
        autoLikeStatus = args[0] === 'on' ? true : args[0] === 'off' ? false : !autoLikeStatus;
        saveStoreKey('config');
        await sock.sendMessage(remoteJid, { text: `❤️ *AUTOREACT STATUS* : ${autoLikeStatus ? '✅ ACTIVÉ — Réaction ❤️ auto sur les statuts' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'autosavestatus':
      case 'savestatus': {
        if (!isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' }, { quoted: message }); break; }
        autoSaveStatus = args[0] === 'on' ? true : args[0] === 'off' ? false : !autoSaveStatus;
        saveStoreKey('config');
        await sock.sendMessage(remoteJid, { text: `💾 *AUTOSAVE STATUS* : ${autoSaveStatus ? '✅ ACTIVÉ — Les statuts seront sauvegardés dans votre PV' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'antideletestatus': {
        if (!isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Admins seulement' }, { quoted: message }); break; }
        antiDeleteStatus = args[0] === 'on' ? true : args[0] === 'off' ? false : !antiDeleteStatus;
        saveStoreKey('config');
        await sock.sendMessage(remoteJid, { text: `🗑️ *ANTIDELETE STATUS* : ${antiDeleteStatus ? '✅ ACTIVÉ — Les statuts supprimés seront gardés dans votre PV' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
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

      // ══════════════════════════════════════════════════════════

      // ══════════════════════════════════════════════════════════
      // 🛡️ COMMANDES ANTI — Compatibles toutes versions Baileys
      // Groupe: admin WA OU admin bot | Global: admin bot
      // ══════════════════════════════════════════════════════════

      case 'antibug':
      case 'anti-bug': {
        if (!isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Réservé aux admins bot' }, { quoted: message }); break; }
        antiBug = args[0] === 'on' ? true : args[0] === 'off' ? false : !antiBug;
        saveStoreKey('config');
        await sock.sendMessage(remoteJid, { text: `🪲 *ANTI-BUG* : ${antiBug ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'anticall':
      case 'antiappel': {
        if (!isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Réservé aux admins bot' }, { quoted: message }); break; }
        antiCallEnabled = args[0] === 'on' ? true : args[0] === 'off' ? false : !antiCallEnabled;
        saveStoreKey('config');
        await sock.sendMessage(remoteJid, { text: `📵 *ANTI-CALL* : ${antiCallEnabled ? '✅ ACTIVÉ — Les appels seront refusés' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'antisticker':
      case 'antistick': {
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Commande groupe uniquement' }, { quoted: message }); break; }
        if (!_currentIsGroupAdmin && !isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Admins du groupe uniquement' }, { quoted: message }); break; }
        const _asS = initGroupSettings(remoteJid);
        _asS.antisticker = args[0] === 'on' ? true : args[0] === 'off' ? false : !_asS.antisticker;
        saveStoreKey('groupSettings');
        await sock.sendMessage(remoteJid, { text: `🛡️ *ANTI-STICKER* : ${_asS.antisticker ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'antiimage':
      case 'antiphoto': {
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Commande groupe uniquement' }, { quoted: message }); break; }
        if (!_currentIsGroupAdmin && !isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Admins du groupe uniquement' }, { quoted: message }); break; }
        const _aiS = initGroupSettings(remoteJid);
        _aiS.antiimage = args[0] === 'on' ? true : args[0] === 'off' ? false : !_aiS.antiimage;
        saveStoreKey('groupSettings');
        await sock.sendMessage(remoteJid, { text: `📸 *ANTI-IMAGE* : ${_aiS.antiimage ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'antivideo':
      case 'antivid': {
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Commande groupe uniquement' }, { quoted: message }); break; }
        if (!_currentIsGroupAdmin && !isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Admins du groupe uniquement' }, { quoted: message }); break; }
        const _avS = initGroupSettings(remoteJid);
        _avS.antivideo = args[0] === 'on' ? true : args[0] === 'off' ? false : !_avS.antivideo;
        saveStoreKey('groupSettings');
        await sock.sendMessage(remoteJid, { text: `🎥 *ANTI-VIDÉO* : ${_avS.antivideo ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'antivoice':
      case 'antivocal':
      case 'antiaudio': {
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Commande groupe uniquement' }, { quoted: message }); break; }
        if (!_currentIsGroupAdmin && !isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Admins du groupe uniquement' }, { quoted: message }); break; }
        const _avoS = initGroupSettings(remoteJid);
        _avoS.antivoice = args[0] === 'on' ? true : args[0] === 'off' ? false : !_avoS.antivoice;
        saveStoreKey('groupSettings');
        await sock.sendMessage(remoteJid, { text: `🎤 *ANTI-VOCAL* : ${_avoS.antivoice ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'antidelete':
      case 'antidel': {
        if (!isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Réservé aux admins bot' }, { quoted: message }); break; }
        antiDelete = args[0] === 'on' ? true : args[0] === 'off' ? false : !antiDelete;
        saveStoreKey('config');
        await sock.sendMessage(remoteJid, { text: `🗑️ *ANTI-DELETE* : ${antiDelete ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'antiedit': {
        if (!isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Réservé aux admins bot' }, { quoted: message }); break; }
        antiEdit = args[0] === 'on' ? true : args[0] === 'off' ? false : !antiEdit;
        saveStoreKey('config');
        await sock.sendMessage(remoteJid, { text: `✏️ *ANTI-EDIT* : ${antiEdit ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'antilink': {
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Commande groupe uniquement' }, { quoted: message }); break; }
        if (!_currentIsGroupAdmin && !isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Admins du groupe uniquement' }, { quoted: message }); break; }
        const _alS = initGroupSettings(remoteJid);
        _alS.antilink = args[0] === 'on' ? true : args[0] === 'off' ? false : !_alS.antilink;
        saveStoreKey('groupSettings');
        await sock.sendMessage(remoteJid, { text: `🔗 *ANTI-LIEN* : ${_alS.antilink ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'antibot': {
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Commande groupe uniquement' }, { quoted: message }); break; }
        if (!_currentIsGroupAdmin && !isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Admins du groupe uniquement' }, { quoted: message }); break; }
        const _abS = initGroupSettings(remoteJid);
        _abS.antibot = args[0] === 'on' ? true : args[0] === 'off' ? false : !_abS.antibot;
        saveStoreKey('groupSettings');
        await sock.sendMessage(remoteJid, { text: `🤖 *ANTI-BOT* : ${_abS.antibot ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'antitag': {
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Commande groupe uniquement' }, { quoted: message }); break; }
        if (!_currentIsGroupAdmin && !isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Admins du groupe uniquement' }, { quoted: message }); break; }
        const _atS = initGroupSettings(remoteJid);
        _atS.antitag = args[0] === 'on' ? true : args[0] === 'off' ? false : !_atS.antitag;
        saveStoreKey('groupSettings');
        await sock.sendMessage(remoteJid, { text: `🏷️ *ANTI-TAG* : ${_atS.antitag ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'antispam': {
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Commande groupe uniquement' }, { quoted: message }); break; }
        if (!_currentIsGroupAdmin && !isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Admins du groupe uniquement' }, { quoted: message }); break; }
        const _aspS = initGroupSettings(remoteJid);
        _aspS.antispam = args[0] === 'on' ? true : args[0] === 'off' ? false : !_aspS.antispam;
        saveStoreKey('groupSettings');
        await sock.sendMessage(remoteJid, { text: `🚫 *ANTI-SPAM* : ${_aspS.antispam ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

      case 'antimentiongroupe':
      case 'antimentiongroup': {
        if (!isGroup) { await sock.sendMessage(remoteJid, { text: '❌ Commande groupe uniquement' }, { quoted: message }); break; }
        if (!_currentIsGroupAdmin && !isAdminOrOwner()) { await sock.sendMessage(remoteJid, { text: '⛔ Admins du groupe uniquement' }, { quoted: message }); break; }
        const _amgS = initGroupSettings(remoteJid);
        _amgS.antimentiongroupe = args[0] === 'on' ? true : args[0] === 'off' ? false : !_amgS.antimentiongroupe;
        saveStoreKey('groupSettings');
        await sock.sendMessage(remoteJid, { text: `📢 *ANTI-MENTION GROUPE* : ${_amgS.antimentiongroupe ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}` }, { quoted: message });
        break;
      }

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

      case 'update':
      case 'maj':
      case 'upgrade': {
        if (!isAdminOrOwner()) {
          await sock.sendMessage(remoteJid, { text: '⛔ Admins du bot uniquement.' });
          break;
        }

        await sock.sendMessage(remoteJid, {
          text: '[ 🛰️ SYSTEM CHECK ]\n📡 Connexion à GitHub en cours...'
        }, { quoted: message });

        try {
          const { execSync } = await import('child_process');
          const _cwd = process.cwd();

          // Initialiser git si nécessaire
          try { execSync('git status', { cwd: _cwd, stdio: 'ignore' }); }
          catch(e) {
            try {
              execSync('git init', { cwd: _cwd, stdio: 'ignore' });
              execSync('git remote add origin https://github.com/Azountou235/SEIGNEUR-TD-.git', { cwd: _cwd, stdio: 'ignore' });
            } catch(e2) {
              execSync('git remote set-url origin https://github.com/Azountou235/SEIGNEUR-TD-.git', { cwd: _cwd, stdio: 'ignore' });
            }
          }

          await sock.sendMessage(remoteJid, {
            text: '📥 Téléchargement des fichiers depuis GitHub...'
          }, { quoted: message });

          // Pull depuis GitHub
          try {
            execSync('git pull origin main --rebase 2>&1 || git pull origin master --rebase 2>&1', {
              cwd: _cwd, shell: true, encoding: 'utf8', timeout: 60000
            });
          } catch(e) {
            // Force reset si conflit
            execSync('git fetch origin main 2>&1 || git fetch origin master 2>&1', { cwd: _cwd, shell: true, timeout: 15000 });
            execSync('git reset --hard origin/main 2>&1 || git reset --hard origin/master 2>&1', { cwd: _cwd, shell: true, timeout: 15000 });
          }

          // npm install
          try { execSync('npm install --production --silent 2>&1', { cwd: _cwd, encoding: 'utf8', timeout: 60000 }); } catch(e) {}

          await sock.sendMessage(remoteJid, {
            text: '✅ *MISE À JOUR RÉUSSIE !*\n\n📦 Fichiers synchronisés depuis GitHub\n🔄 Redémarrage dans 3s...\n🇷🇴 SEIGNEUR TD'
          }, { quoted: message });

          setTimeout(async () => {
            // ✅ Détecter si c'est une session web ou le bot principal
            const _sessionPhone = [...activeSessions.entries()].find(([p, s]) => s.sock === sock)?.[0];
            if (_sessionPhone) {
              // Session web — reconnecter uniquement ce numéro
              console.log(`[UPDATE] Session web ${_sessionPhone} — reconnexion individuelle`);
              const _sf = `./sessions/${_sessionPhone}`;
              activeSessions.delete(_sessionPhone);
              try { await sock.end(); } catch(e) {}
              await delay(1000);
              try { await reconnectSession(_sessionPhone); } catch(e) {
                console.log(`[UPDATE] ❌ Reconnexion ${_sessionPhone} échouée:`, e.message);
              }
            } else {
              // Bot principal — reconnecter tout
              console.log(`[UPDATE] Bot principal — reconnexion complète`);
              try { await sock.end(); } catch(e) {}
              await delay(1000);
              await connectToWhatsApp().catch(e => console.error('[UPDATE]', e.message));
              await delay(3000);
              await restoreWebSessions().catch(e => console.log('[UPDATE] Sessions restore:', e.message));
            }
          }, 3000);

        } catch(e) {
          console.error('[UPDATE]', e.message);
          await sock.sendMessage(remoteJid, {
            text: `❌ Erreur lors de la mise à jour.\n\n💡 ${e.message}\n\n⚠️ Contactez l'administrateur : +235 91234568`
          }, { quoted: message });
        }
        break;
      }

            case 'storestatus':
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

      // ─── YTB : télécharger audio OU vidéo YouTube ───────────────────────
      case 'ytb':
      case 'youtube': {
        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text:
`╔══════════════════════════╗
║   📥 YOUTUBE DL          ║
╚══════════════════════════╝

📌 *Utilisation :*
• ${config.prefix}ytb [lien YouTube] mp3
• ${config.prefix}ytb [lien YouTube] mp4

💡 *Exemples :*
• ${config.prefix}ytb https://youtu.be/xxx mp3
• ${config.prefix}ytb https://youtu.be/xxx mp4`
          }, { quoted: message });
          break;
        }

        const ytbUrl  = args[0]?.trim();
        const ytbFmt  = (args[1] || 'mp3').toLowerCase();
        const isVideo = ytbFmt === 'mp4';

        if (!ytbUrl.includes('youtube.com') && !ytbUrl.includes('youtu.be')) {
          await sock.sendMessage(remoteJid, {
            text: `❌ Lien YouTube invalide.\n\n💡 Utilise un lien comme :\nhttps://youtu.be/xxx`
          }, { quoted: message });
          break;
        }

        try {
          await sock.sendMessage(remoteJid, { react: { text: isVideo ? '🎬' : '🎵', key: message.key } });
        } catch {}

        await sock.sendMessage(remoteJid, {
          text: `${isVideo ? '🎬' : '🎵'} Téléchargement ${isVideo ? 'vidéo' : 'audio'} en cours...\n⏳ Patiente quelques secondes...`
        }, { quoted: message });

        try {
          const apiUrl = `https://apis.xwolf.space/api/download/youtube?url=${encodeURIComponent(ytbUrl)}`;
          const res = await axios.get(apiUrl, { timeout: 40000 });
          const data = res.data;

          if (!data || (!data.audio_url && !data.video_url && !data.download_url)) {
            throw new Error('Aucun lien de téléchargement trouvé');
          }

          const dlUrl  = isVideo ? (data.video_url || data.download_url) : (data.audio_url || data.download_url);
          const title  = data.title || ytbUrl;
          const thumb  = data.thumbnail || data.thumb || null;

          const mediaResp = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000, headers: { 'User-Agent': 'Mozilla/5.0' } });
          const mediaBuffer = Buffer.from(mediaResp.data);

          if (isVideo) {
            if (mediaBuffer.length > 100 * 1024 * 1024) {
              await sock.sendMessage(remoteJid, {
                text: `⚠️ Vidéo trop grande (${(mediaBuffer.length/1024/1024).toFixed(1)} MB)\n🚫 Limite WhatsApp : 100 MB\n\n💡 Essaie : ${config.prefix}ytb [lien] mp3`
              }, { quoted: message });
              break;
            }
            await sock.sendMessage(remoteJid, {
              video: mediaBuffer,
              mimetype: 'video/mp4',
              caption:
`╔══════════════════════════╗
║   🎬 YOUTUBE MP4         ║
╚══════════════════════════╝

🎬 *Titre :* ${title}
📏 *Taille :* ${(mediaBuffer.length/1024/1024).toFixed(2)} MB

_SEIGNEUR TD 🇷🇴_`
            }, { quoted: message });
          } else {
            await sock.sendMessage(remoteJid, {
              audio: mediaBuffer,
              mimetype: 'audio/mpeg',
              fileName: `${title}.mp3`
            }, { quoted: message });

            const caption =
`╔══════════════════════════╗
║   🎵 YOUTUBE MP3         ║
╚══════════════════════════╝

🎵 *Titre :* ${title}
📏 *Taille :* ${(mediaBuffer.length/1024/1024).toFixed(2)} MB

_SEIGNEUR TD 🇷🇴_`;

            if (thumb) {
              await sock.sendMessage(remoteJid, { image: { url: thumb }, caption }, { quoted: message });
            } else {
              await sock.sendMessage(remoteJid, { text: caption }, { quoted: message });
            }
          }

          try { await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } }); } catch {}

        } catch (e) {
          console.error('[YTB ERROR]', e.message);
          await sock.sendMessage(remoteJid, {
            text: `❌ Erreur de téléchargement.\n\n💡 ${e.message}`
          }, { quoted: message });
        }
        break;
      }


      // ─── SHAZAM : identifier une chanson depuis un audio ─────────────────
      case 'shazam': {
        const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const hasAudio  = quotedMsg?.audioMessage || quotedMsg?.videoMessage;

        if (!args[0] && !hasAudio) {
          await sock.sendMessage(remoteJid, {
            text:
`╔══════════════════════════╗
║   🎵 SHAZAM              ║
╚══════════════════════════╝

📌 *Utilisation :*
• ${config.prefix}shazam [nom de la chanson]
• Réponds à un audio/vidéo avec ${config.prefix}shazam

💡 *Exemples :*
• ${config.prefix}shazam Blinding Lights
• ${config.prefix}shazam The Weeknd`
          }, { quoted: message });
          break;
        }

        const shazamQuery = args.join(' ') || 'unknown';
        try { await sock.sendMessage(remoteJid, { react: { text: '🎵', key: message.key } }); } catch {}
        await sock.sendMessage(remoteJid, {
          text: `🎵 Identification Shazam en cours...\n⏳ Patiente...`
        }, { quoted: message });

        try {
          const shazRes = await axios.get(`https://apis.xwolf.space/api/shazam/search?q=${encodeURIComponent(shazamQuery)}`, { timeout: 20000 });
          const shazData = shazRes.data;

          const track = shazData?.track || shazData?.result || shazData?.data || shazData;

          if (!track || (!track.title && !track.name)) {
            await sock.sendMessage(remoteJid, {
              text: `❌ Chanson non identifiée pour *${shazamQuery}*.\n\n💡 Essaie un autre titre ou artiste.`
            }, { quoted: message });
            break;
          }

          const title   = track.title || track.name || 'Inconnu';
          const artist  = track.subtitle || track.artist || track.artistName || 'Inconnu';
          const album   = track.sections?.[0]?.metadata?.find(m => m.title === 'Album')?.text || track.album || '';
          const year    = track.sections?.[0]?.metadata?.find(m => m.title === 'Released')?.text || track.year || '';
          const thumb   = track.images?.coverarthq || track.images?.coverart || track.image || track.thumbnail || null;
          const ytUrl   = track.hub?.actions?.find(a => a.type === 'uri' && a.uri?.includes('youtube'))?.uri || '';
          const lyrics  = track.sections?.find(s => s.type === 'LYRICS')?.text?.join('\n').slice(0, 300) || '';

          let shazText =
`╔══════════════════════════╗
║   🎵 SHAZAM RÉSULTAT     ║
╚══════════════════════════╝

🎵 *Titre :* ${title}
👤 *Artiste :* ${artist}`;
          if (album) shazText += `\n💿 *Album :* ${album}`;
          if (year)  shazText += `\n📅 *Année :* ${year}`;
          if (ytUrl) shazText += `\n🔗 *YouTube :* ${ytUrl}`;
          if (lyrics) shazText += `\n\n📝 *Paroles :*\n${lyrics}...`;
          shazText += `\n\n_💡 Utilise ${config.prefix}ytb [lien] mp3 pour télécharger_\n\n_SEIGNEUR TD 🇷🇴_`;

          if (thumb) {
            await sock.sendMessage(remoteJid, { image: { url: thumb }, caption: shazText }, { quoted: message });
          } else {
            await sock.sendMessage(remoteJid, { text: shazText }, { quoted: message });
          }

          try { await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } }); } catch {}

        } catch (e) {
          console.error('[SHAZAM ERROR]', e.message);
          await sock.sendMessage(remoteJid, {
            text: `❌ Erreur Shazam.\n\n💡 ${e.message}`
          }, { quoted: message });
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

      case 'apk':
        await handleApkDownload(sock, args, remoteJid, senderJid, message);
        break;

      case 'fb':
      case 'facebook':
        await handleFacebook(sock, args, remoteJid, senderJid, message);
        break;

      case 'gdrive':
      case 'gd':
        await handleGdrive(sock, args, remoteJid, senderJid, message);
        break;

      case 'mediafire':
      case 'mf':
        await handleMediafire(sock, args, remoteJid, senderJid, message);
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

      case 'tosgroup':
      case 'togstatus':
      case 'swgc':
      case 'gs':
        await handleTosGroup(sock, message, args, remoteJid, senderJid, isGroup);
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

        await sock.sendMessage(remoteJid, {
          text: '🔄 *Redémarrage du bot...*\n⏳ Synchronisation GitHub en cours...'
        }, { quoted: message });

        // Git pull silencieux avant redémarrage
        try {
          const { execSync } = await import('child_process');
          const _cwd = process.cwd();

          // Initialiser git si nécessaire
          try { execSync('git status', { cwd: _cwd, stdio: 'ignore' }); }
          catch(e) {
            try {
              execSync('git init', { cwd: _cwd, stdio: 'ignore' });
              execSync('git remote add origin https://github.com/Azountou235/SEIGNEUR-TD-.git', { cwd: _cwd, stdio: 'ignore' });
            } catch(e2) {
              execSync('git remote set-url origin https://github.com/Azountou235/SEIGNEUR-TD-.git', { cwd: _cwd, stdio: 'ignore' });
            }
          }

          // Pull silencieux
          try {
            execSync('git pull origin main --rebase 2>&1 || git pull origin master --rebase 2>&1', {
              cwd: _cwd, shell: true, encoding: 'utf8', timeout: 30000
            });
          } catch(e) {
            // Force reset si conflit
            try {
              execSync('git fetch origin main 2>&1 || git fetch origin master 2>&1', { cwd: _cwd, shell: true, timeout: 15000 });
              execSync('git reset --hard origin/main 2>&1 || git reset --hard origin/master 2>&1', { cwd: _cwd, shell: true, timeout: 15000 });
            } catch(e2) {}
          }

          // npm install silencieux
          try { execSync('npm install --production --silent 2>&1', { cwd: _cwd, encoding: 'utf8', timeout: 60000 }); } catch(e) {}

        } catch(e) {
          console.error('[RESTART GIT PULL]', e.message);
          // On redémarre quand même même si git échoue
        }

        await sock.sendMessage(remoteJid, {
          text: '✅ *Synchronisation terminée !*\n🔄 Redémarrage dans 2s...\n🇷🇴 SEIGNEUR TD'
        }, { quoted: message });

        // ✅ Détecter si c'est une session web ou le bot principal
        setTimeout(async () => {
          const _sessionPhone = [...activeSessions.entries()].find(([p, s]) => s.sock === sock)?.[0];
          if (_sessionPhone) {
            // Session web — redémarrer uniquement ce numéro
            console.log(`[RESTART] Session web ${_sessionPhone} — redémarrage individuel`);
            activeSessions.delete(_sessionPhone);
            try { await sock.end(); } catch(e) {}
            await delay(1000);
            try { await reconnectSession(_sessionPhone); } catch(e) {
              console.log(`[RESTART] ❌ Reconnexion ${_sessionPhone} échouée:`, e.message);
            }
          } else {
            // Bot principal — redémarrer tout
            console.log(`[RESTART] Bot principal — redémarrage complet`);
            try { await sock.end(); } catch(e) {}
            await delay(1000);
            await connectToWhatsApp().catch(e => console.error('[RESTART]', e.message));
            await delay(3000);
            await restoreWebSessions().catch(e => console.log('[RESTART] Sessions restore:', e.message));
          }
        }, 2000);
        break;
      }

      default: {
        // Essayer les nouvelles commandes (commands.js)
        const handled = await handleNewCommands({
          sock, message, remoteJid, senderJid, command, args,
          isGroup, isAdminOrOwner, isGroupAdmin, isBotGroupAdmin,
          initGroupSettings, saveStoreKey, addWarn, resetWarns,
          config, quoted
        });
        if (!handled) {
          // Commande inconnue — silencieux
        }
        break;
      }
    }
  } catch (error) {
    console.error(`❌ Command error [${command}]:`, error?.message || error);
    await sock.sendMessage(remoteJid, { 
      text: `❌ *Command error:* \`${command}\`\n\n\`${error?.message || 'Unknown error'}\`` 
    });
  } finally {
    // ✅ Restaurer les globals après la commande
    _currentFromMe = _origFromMe;
    _currentSenderJid = _origSenderJid;
    _currentIsGroupAdmin = _origIsGroupAdmin;
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
    { num: '1', key: 'owner',    icon: '🛡️', label: 'OWNER MENU',      cmds: [`${p}restart`,`${p}mode`,`${p}update`,`${p}pp`,`${p}gpp`,`${p}block`,`${p}unblock`,`${p}join`,`${p}autorecording`,`${p}autoreact`,`${p}antidelete`,`${p}antiedit`,`${p}autoviewstatus`,`${p}autoreactstatus`,`${p}autosavestatus`,`${p}antideletestatus`,`${p}chatboton`,`${p}chatbotoff`,`${p}getsettings`,`${p}setstickerpackname`,`${p}setstickerauthor`,`${p}setprefix`,`${p}setbotimg`] },
    { num: '2', key: 'download', icon: '\uD83D\uDCE5', label: 'DOWNLOAD MENU',   cmds: [`${p}ytb`,`${p}shazam`,`${p}tiktok`,`${p}ig`,`${p}apk`,`${p}fb`,`${p}gdrive`,`${p}mf`] },
    { num: '3', key: 'group',    icon: '\uD83D\uDC65', label: 'GROUP MENU',      cmds: [`${p}tagall`,`${p}tagadmins`,`${p}hidetag`,`${p}kickall`,`${p}kickadmins`,`${p}acceptall`,`${p}add`,`${p}kick`,`${p}promote`,`${p}demote`,`${p}mute`,`${p}unmute`,`${p}invite`,`${p}revoke`,`${p}gname`,`${p}gdesc`,`${p}groupinfo`,`${p}welcome`,`${p}goodbye`,`${p}leave`,`${p}listonline`,`${p}listactive`,`${p}listinactive`,`${p}kickinactive`,`${p}groupstatus`,`${p}tosgroup`] },
    { num: '4', key: 'utility',  icon: '🔮', label: 'PROTECTION MENU', cmds: [`${p}antibug`,`${p}antilink`,`${p}antibot`,`${p}antitag`,`${p}antispam`,`${p}antimentiongroupe`,`${p}anticall`,`${p}antisticker`,`${p}antiimage`,`${p}antivideo`,`${p}antivoice`,`${p}warn`,`${p}warns`,`${p}resetwarn`,`${p}permaban`,`${p}unpermaban`,`${p}banlist`] },

    { num: '5', key: 'sticker',  icon: '🎨', label: 'MEDIA MENU',      cmds: [`${p}sticker`,`${p}vv`,`${p}vv list`,`${p}vv get`,`${p}vv del`,`${p}vv clear`,`${p}tostatus`,`${p}tourl`,`${p}cz1`] },
    { num: '6', key: 'misc',     icon: '📂', label: 'GENERAL MENU',    cmds: [`${p}info`,`${p}menu`,`${p}allmenu`,`${p}help`,`${p}repo`,`${p}dev`,`${p}fancy`,`${p}gpt`,`${p}gemini`,`${p}google`] },
    { num: '7', key: 'image',    icon: '👁️', label: 'VIEW ONCE MENU',  cmds: [`${p}vv`,`${p}vv list`,`${p}vv get`,`${p}vv del`,`${p}vv clear`,`${p}vv last`] },
    { num: '9', key: 'games',    icon: '🎮', label: 'GAMES MENU',      cmds: [`${p}tictactoe`,`${p}ttt`,`${p}quizmanga`,`${p}quiz`,`${p}squidgame`,`${p}sg`] },
    { num: '10', key: 'ai',      icon: '🤖', label: 'SEIGNEUR TD AI',   cmds: [`${p}chatbot`,`${p}seigneur`,`${p}td`,`${p}chat`,`${p}chatboton`,`${p}chatbotoff`,`${p}clearchat`,`${p}gpt`,`${p}gemini`] },
  ];
}

// ─── MENU PRINCIPAL (!menu) ──────────────────────────────────────────────────
async function handleMenu(sock, message, remoteJid, senderJid) {
  const p = config.prefix;

  try { await sock.sendMessage(remoteJid, { react: { text: '👑', key: message.key } }); } catch(e) {}

  // Étape 1 — Envoyer le verset seul
  const versetMsg = await sock.sendMessage(remoteJid, {
    text: `🇷🇴  يَا أَيُّهَا الَّذِينَ آمَنُوا لِمَ تَقُولُونَ مَا لَا تَفْعَلُونَ`
  });

  // Étape 2 — Attendre puis éditer ce message → menu complet
  await delay(1500);

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
├ autorecording
├ autoreact
├ autoviewstatus
├ autoreactstatus
├ autosavestatus
├ antideletestatus
├ chatboton
├ chatbotoff
├ getsettings
├ setstickerpackname
├ setstickerauthor
├ setprefix
╰───────────────

╭──〔 📥 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 〕
├ ytb
├ shazam
├ tiktok
├ ig
├ apk
├ fb
├ gdrive
├ mf
╰───────────────

╭──〔 👥 𝗚𝗥𝗢𝗨𝗣𝗘 〕
├ tagall
├ tagadmins
├ hidetag
├ kickall
├ add
├ kick
├ tosgroup
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
╰───────────────

╭──〔 🛡️ 𝗣𝗥𝗢𝗧𝗘𝗖𝗧𝗜𝗢𝗡 〕
├ anticall
├ antisticker
├ antiimage
├ antivideo
├ antivoice
├ antibug
├ antilink
├ antibot
├ antitag
├ antispam
├ antidelete
├ antiedit
├ antimentiongroupe
╰───────────────

╭──〔 📱 𝗦𝗧𝗔𝗧𝗨𝗦 〕
├ autoviewstatus
├ autoreactstatus
├ autosavestatus
├ antideletestatus
╰───────────────

╭──〔 🖼 𝗜𝗠𝗔𝗚𝗘 & 𝗧𝗢𝗢𝗟𝗦 〕
├ sticker
├ vv
├ tostatus
├ tourl
├ cz1
├ info
├ fancy
├ gpt
├ gemini
├ google
├ p
├ up
╰───────────────

  © 2026 | 𝗟𝗘 𝗦𝗘𝗜𝗚𝗡𝗘𝗨𝗥`;

  // Étape 3 — Éditer le message verset pour afficher le menu complet
  if (versetMsg?.key) {
    try {
      await sock.sendMessage(remoteJid, {
        text: menuText,
        edit: versetMsg.key
      });
    } catch(e) {
      // Fallback si edit échoue : envoyer normal
      await sendWithImage(sock, remoteJid, 'menu', menuText, [senderJid]);
    }
  } else {
    await sendWithImage(sock, remoteJid, 'menu', menuText, [senderJid]);
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
        const qAudio    = qViewOnce?.message?.audioMessage || qViewOnce?.message?.ptvMessage
                        || quoted.audioMessage || quoted.ptvMessage;

        if (qImage) {
          mediaType = 'image'; mimetype = qImage.mimetype || 'image/jpeg';
          const stream = await downloadContentFromMessage(qImage, 'image');
          mediaData = await toBuffer(stream);
        } else if (qVideo) {
          mediaType = 'video'; mimetype = qVideo.mimetype || 'video/mp4';
          isGif = qVideo.gifPlayback || false;
          const stream = await downloadContentFromMessage(qVideo, 'video');
          mediaData = await toBuffer(stream);
        } else if (qAudio) {
          mediaType = 'audio'; mimetype = qAudio.mimetype || 'audio/ogg';
          const stream = await downloadContentFromMessage(qAudio, 'audio');
          mediaData = await toBuffer(stream);
        }

        if (mediaData && mediaData.length > 100) {
          await sendVVMedia(sock, remoteJid, {
            type: mediaType, buffer: mediaData, mimetype, isGif,
            ptt: qAudio?.ptt || false,
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
      // Pas de caption texte pour les vocaux
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

// ─── MEDIAFIRE DOWNLOAD ──────────────────────────────────────────────────────
async function handleMediafire(sock, args, remoteJid, senderJid, message) {
  try {
    const url = args[0]?.trim();
    if (!url || !url.includes('mediafire.com')) {
      await sock.sendMessage(remoteJid, {
        text: `╔══════════════════════════╗
║   🔥 MEDIAFIRE DOWNLOAD  ║
╚══════════════════════════╝

⚠️ *Utilisation :* ${config.prefix}mediafire [lien Mediafire]

📌 *Exemple :*
• ${config.prefix}mf https://www.mediafire.com/file/xxx/file`
      }, { quoted: message });
      return;
    }

    await sock.sendMessage(remoteJid, {
      text: `🔥 Récupération du fichier Mediafire...\n⏳ Veuillez patienter...`
    }, { quoted: message });

    const apiUrl = `https://api.giftedtech.co.ke/api/download/mediafire?apikey=gifted&url=${encodeURIComponent(url)}`;
    const res = await axios.get(apiUrl, { timeout: 30000 });
    const data = res.data;

    if (!data.success || !data.result?.downloadUrl) {
      await sock.sendMessage(remoteJid, {
        text: `❌ Impossible de récupérer ce fichier Mediafire.\n\n💡 Vérifie que le lien est valide.`
      }, { quoted: message });
      return;
    }

    const { fileName, fileSize, fileType, mimeType, uploadedOn, uploadedFrom, downloadUrl } = data.result;

    // Télécharger le fichier
    const fileResp = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 120000 });
    const fileBuffer = Buffer.from(fileResp.data);
    const mime = mimeType || 'application/octet-stream';

    const caption =
`╔══════════════════════════╗
║   🔥 MEDIAFIRE DOWNLOAD  ║
╚══════════════════════════╝

📄 *Fichier :* ${fileName}
📦 *Type :* ${fileType}
📏 *Taille :* ${fileSize}
📅 *Uploadé le :* ${uploadedOn}
🌍 *Depuis :* ${uploadedFrom}

_Téléchargé via SEIGNEUR TD 🇷🇴_`;

    // Envoyer selon le type MIME
    if (mime.includes('video')) {
      await sock.sendMessage(remoteJid, { video: fileBuffer, mimetype: mime, caption }, { quoted: message });
    } else if (mime.includes('image')) {
      await sock.sendMessage(remoteJid, { image: fileBuffer, caption }, { quoted: message });
    } else if (mime.includes('audio')) {
      await sock.sendMessage(remoteJid, { audio: fileBuffer, mimetype: mime, ptt: false }, { quoted: message });
      await sock.sendMessage(remoteJid, { text: caption }, { quoted: message });
    } else {
      await sock.sendMessage(remoteJid, {
        document: fileBuffer,
        mimetype: mime,
        fileName: fileName || 'fichier_mediafire',
        caption
      }, { quoted: message });
    }

  } catch (e) {
    console.error('[MEDIAFIRE] Erreur:', e.message);
    await sock.sendMessage(remoteJid, {
      text: `❌ Erreur lors du téléchargement Mediafire.\n\n💡 ${e.message}`
    }, { quoted: message });
  }
}

// ─── GOOGLE DRIVE DOWNLOAD ───────────────────────────────────────────────────
async function handleGdrive(sock, args, remoteJid, senderJid, message) {
  try {
    const url = args[0]?.trim();
    if (!url || !url.includes('drive.google.com')) {
      await sock.sendMessage(remoteJid, {
        text: `╔══════════════════════════╗
║   ☁️ GOOGLE DRIVE DL     ║
╚══════════════════════════╝

⚠️ *Utilisation :* ${config.prefix}gdrive [lien Google Drive]

📌 *Exemple :*
• ${config.prefix}gdrive https://drive.google.com/file/d/xxx/view`
      }, { quoted: message });
      return;
    }

    await sock.sendMessage(remoteJid, {
      text: `☁️ Récupération du fichier Google Drive...\n⏳ Veuillez patienter...`
    }, { quoted: message });

    const apiUrl = `https://api.giftedtech.co.ke/api/download/gdrivedl?apikey=gifted&url=${encodeURIComponent(url)}`;
    const res = await axios.get(apiUrl, { timeout: 30000 });
    const data = res.data;

    if (!data.success || !data.result?.download_url) {
      await sock.sendMessage(remoteJid, {
        text: `❌ Impossible de récupérer ce fichier Google Drive.\n\n💡 Vérifie que le lien est public.`
      }, { quoted: message });
      return;
    }

    const { name, download_url } = data.result;

    // Télécharger le fichier
    const fileResp = await axios.get(download_url, { responseType: 'arraybuffer', timeout: 120000 });
    const fileBuffer = Buffer.from(fileResp.data);
    const sizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);

    // Détecter le type de fichier via content-type
    const contentType = fileResp.headers['content-type'] || 'application/octet-stream';

    // Envoyer selon le type
    if (contentType.includes('video')) {
      await sock.sendMessage(remoteJid, {
        video: fileBuffer,
        mimetype: contentType,
        caption: `╔══════════════════════════╗\n║   ☁️ GOOGLE DRIVE DL     ║\n╚══════════════════════════╝\n\n📄 *Fichier :* ${name}\n📏 *Taille :* ${sizeMB} MB\n\n_Téléchargé via SEIGNEUR TD 🇷🇴_`
      }, { quoted: message });
    } else if (contentType.includes('image')) {
      await sock.sendMessage(remoteJid, {
        image: fileBuffer,
        caption: `╔══════════════════════════╗\n║   ☁️ GOOGLE DRIVE DL     ║\n╚══════════════════════════╝\n\n📄 *Fichier :* ${name}\n📏 *Taille :* ${sizeMB} MB\n\n_Téléchargé via SEIGNEUR TD 🇷🇴_`
      }, { quoted: message });
    } else if (contentType.includes('audio')) {
      await sock.sendMessage(remoteJid, {
        audio: fileBuffer,
        mimetype: contentType,
        ptt: false
      }, { quoted: message });
      await sock.sendMessage(remoteJid, {
        text: `╔══════════════════════════╗\n║   ☁️ GOOGLE DRIVE DL     ║\n╚══════════════════════════╝\n\n📄 *Fichier :* ${name}\n📏 *Taille :* ${sizeMB} MB\n\n_Téléchargé via SEIGNEUR TD 🇷🇴_`
      }, { quoted: message });
    } else {
      await sock.sendMessage(remoteJid, {
        document: fileBuffer,
        mimetype: contentType,
        fileName: name || 'fichier_gdrive',
        caption: `╔══════════════════════════╗\n║   ☁️ GOOGLE DRIVE DL     ║\n╚══════════════════════════╝\n\n📄 *Fichier :* ${name}\n📏 *Taille :* ${sizeMB} MB\n\n_Téléchargé via SEIGNEUR TD 🇷🇴_`
      }, { quoted: message });
    }

  } catch (e) {
    console.error('[GDRIVE] Erreur:', e.message);
    await sock.sendMessage(remoteJid, {
      text: `❌ Erreur lors du téléchargement Google Drive.\n\n💡 ${e.message}`
    }, { quoted: message });
  }
}

// ─── FACEBOOK DOWNLOAD ───────────────────────────────────────────────────────
async function handleFacebook(sock, args, remoteJid, senderJid, message) {
  try {
    const url = args[0]?.trim();
    if (!url || !url.includes('facebook.com')) {
      await sock.sendMessage(remoteJid, {
        text: `╔══════════════════════════╗
║   📘 FACEBOOK DOWNLOAD   ║
╚══════════════════════════╝

⚠️ *Utilisation :* ${config.prefix}fb [lien Facebook]

📌 *Exemples :*
• ${config.prefix}fb https://www.facebook.com/reel/xxxxx
• ${config.prefix}fb https://www.facebook.com/watch?v=xxxxx`
      }, { quoted: message });
      return;
    }

    await sock.sendMessage(remoteJid, {
      text: `📘 Téléchargement Facebook en cours...\n⏳ Veuillez patienter...`
    }, { quoted: message });

    const apiUrl = `https://api.giftedtech.co.ke/api/download/facebook?apikey=gifted&url=${encodeURIComponent(url)}`;
    const res = await axios.get(apiUrl, { timeout: 30000 });
    const data = res.data;

    if (!data.success || !data.result) {
      await sock.sendMessage(remoteJid, {
        text: `❌ Impossible de télécharger cette vidéo Facebook.\n\n💡 Vérifie que le lien est valide et public.`
      }, { quoted: message });
      return;
    }

    const { title, duration, hd_video, sd_video } = data.result;

    // Envoyer la vidéo HD en priorité, sinon SD
    const videoUrl = hd_video || sd_video;

    await sock.sendMessage(remoteJid, {
      video: { url: videoUrl },
      caption:
`╔══════════════════════════╗
║   📘 FACEBOOK DOWNLOAD   ║
╚══════════════════════════╝

📌 *Titre :* ${title || 'Sans titre'}
⏱️ *Durée :* ${duration || 'N/A'}
🎬 *Qualité :* ${hd_video ? 'HD' : 'SD'}

_Téléchargé via SEIGNEUR TD 🇷🇴_`
    }, { quoted: message });

  } catch (e) {
    console.error('[FACEBOOK] Erreur:', e.message);
    await sock.sendMessage(remoteJid, {
      text: `❌ Erreur lors du téléchargement Facebook.\n\n💡 ${e.message}`
    }, { quoted: message });
  }
}

// ─── APK DOWNLOAD ────────────────────────────────────────────────────────────
async function handleApkDownload(sock, args, remoteJid, senderJid, message) {
  try {
    const appName = args.join(' ').trim();
    if (!appName) {
      await sock.sendMessage(remoteJid, {
        text: `╔══════════════════════════╗
║     📦 APK DOWNLOAD      ║
╚══════════════════════════╝

⚠️ *Utilisation :* ${config.prefix}apk [nom de l'application]

📌 *Exemples :*
• ${config.prefix}apk WhatsApp
• ${config.prefix}apk TikTok
• ${config.prefix}apk Instagram
• ${config.prefix}apk Spotify`
      }, { quoted: message });
      return;
    }

    await sock.sendMessage(remoteJid, {
      text: `🔍 Recherche de *${appName}* en cours...\n⏳ Veuillez patienter...`
    }, { quoted: message });

    const url = `https://api.giftedtech.co.ke/api/download/apkdl?apikey=gifted&appName=${encodeURIComponent(appName)}`;
    const res = await axios.get(url, { timeout: 20000 });
    const data = res.data;

    if (!data.success || !data.result) {
      await sock.sendMessage(remoteJid, {
        text: `❌ Application *${appName}* introuvable.\n\n💡 Vérifie le nom et réessaie.`
      }, { quoted: message });
      return;
    }

    const { appname, appicon, developer, download_url } = data.result;

    // Envoyer les infos avec l'icône
    await sock.sendMessage(remoteJid, {
      image: { url: appicon },
      caption:
`╔══════════════════════════╗
║     📦 APK DOWNLOAD      ║
╚══════════════════════════╝

📱 *App :* ${appname}
👨‍💻 *Développeur :* ${developer}
🔗 *Lien :* ${download_url}

_Clique sur le lien pour télécharger l'APK_ ✅`
    }, { quoted: message });

  } catch (e) {
    console.error('[APK] Erreur:', e.message);
    await sock.sendMessage(remoteJid, {
      text: `❌ Erreur lors de la recherche APK.\n\n💡 ${e.message}`
    }, { quoted: message });
  }
}

// ─── TIKTOK ──────────────────────────────────────────────────────────────────
async function handleTikTok(sock, args, remoteJid, senderJid, message) {
  try {
    const url = (args[0] || '').trim();
    if (!url || !url.includes('tiktok.com')) {
      await sock.sendMessage(remoteJid, {
        text: `╔══════════════════════════╗
║   🎵 TIKTOK DOWNLOAD     ║
╚══════════════════════════╝

⚠️ *Utilisation :* ${config.prefix}tiktok [lien TikTok]

📌 *Exemples :*
• ${config.prefix}tiktok https://vm.tiktok.com/xxx
• ${config.prefix}tiktok https://www.tiktok.com/@user/video/xxx`
      }, { quoted: message });
      return;
    }

    await sock.sendMessage(remoteJid, {
      text:
`✨ ᴛᴛ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ
───────────────────
🎥 Recherche en cours...
📥 ▰▰▰▱▱▱▱ 30%
───────────────────
⚡ 𝘗𝘢𝘵𝘪𝘦𝘯𝘵𝘦𝘻...`
    }, { quoted: message });

    const apiUrl = `https://api.giftedtech.co.ke/api/download/tiktok?apikey=gifted&url=${encodeURIComponent(url)}`;
    const res = await axios.get(apiUrl, { timeout: 30000 });
    const data = res.data;

    if (!data.success || !data.result?.video) {
      await sock.sendMessage(remoteJid, {
        text: `❌ Impossible de télécharger cette vidéo TikTok.\n\n💡 Vérifie que le lien est valide.`
      }, { quoted: message });
      return;
    }

    const { title, duration, cover, video, music, author } = data.result;

    // Télécharger la vidéo (sans watermark)
    const videoResp = await axios.get(video, { responseType: 'arraybuffer', timeout: 60000 });
    const videoBuffer = Buffer.from(videoResp.data);

    await sock.sendMessage(remoteJid, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      caption:
`📥 ᴛɪᴋᴛᴏᴋ ꜱᴀᴠᴇᴅ !
───────────────────
🎬 *${title || 'TikTok Video'}*
👤 *Auteur :* ${author?.name || 'inconnu'}
⏱️ *Durée :* ${duration}s
📏 *Taille :* ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB
✅ *Sans watermark*
───────────────────
© 𝑝𝑜𝑤𝑒𝑟𝑒𝑑 𝑏𝑦 SEIGNEUR TD 🇷🇴`
    }, { quoted: message });

  } catch (err) {
    console.error('[TIKTOK ERROR]', err.message);
    await sock.sendMessage(remoteJid, {
      text: `❌ Erreur lors du téléchargement TikTok.\n\n💡 ${err.message}`
    }, { quoted: message });
  }
}

// ─── INSTAGRAM ───────────────────────────────────────────────────────────────

// ═══ Instagram Scraper (ANCIEN — remplacé par GiftedTech API) ════════════════
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
    if (!url || !url.includes('instagram.com')) {
      return await sock.sendMessage(remoteJid, {
        text: `╔══════════════════════════╗
║   📸 INSTAGRAM DOWNLOAD  ║
╚══════════════════════════╝

⚠️ *Utilisation :* ${config.prefix}ig [lien Instagram]

📌 *Exemples :*
• ${config.prefix}ig https://www.instagram.com/reel/xxx
• ${config.prefix}ig https://www.instagram.com/p/xxx`
      }, { quoted: message });
    }

    await sock.sendMessage(remoteJid, {
      text: `📸 Téléchargement Instagram en cours...\n⏳ Veuillez patienter...`
    }, { quoted: message });

    const apiUrl = `https://api.giftedtech.co.ke/api/download/instadl?apikey=gifted&url=${encodeURIComponent(url)}`;
    const res = await axios.get(apiUrl, { timeout: 30000 });
    const data = res.data;

    if (!data.success || !data.result?.download_url) {
      return await sock.sendMessage(remoteJid, {
        text: `❌ Impossible de télécharger ce contenu Instagram.\n\n💡 Vérifie que le lien est public et valide.`
      }, { quoted: message });
    }

    const { thumbnail, download_url } = data.result;

    // Télécharger la vidéo
    const videoResp = await axios.get(download_url, { responseType: 'arraybuffer', timeout: 60000 });
    const videoBuffer = Buffer.from(videoResp.data);

    await sock.sendMessage(remoteJid, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      caption:
`╔══════════════════════════╗
║   📸 INSTAGRAM DOWNLOAD  ║
╚══════════════════════════╝

📏 *Taille :* ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB

_Téléchargé via SEIGNEUR TD 🇷🇴_`
    }, { quoted: message });

  } catch (err) {
    console.error('[IG ERROR]', err.message);
    await sock.sendMessage(remoteJid, {
      text: `❌ Erreur lors du téléchargement Instagram.\n\n💡 ${err.message}`
    }, { quoted: message });
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
// ─── TOSGROUP — Group Status via generateWAMessageFromContent ─────────────────

async function handleTosGroup(sock, message, args, remoteJid, senderJid, isGroup) {

  // ── Vérifications ────────────────────────────────────────────────────────────
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { text: '❌ Commande réservée aux groupes !' }, { quoted: message });
    return;
  }

  try {
    const meta    = await sock.groupMetadata(remoteJid);
    const p       = meta.participants.find(x => x.id === senderJid);
    const isAdmin = p && (p.admin === 'admin' || p.admin === 'superadmin');
    if (!isAdmin) {
      await sock.sendMessage(remoteJid, { text: '❌ Admins du groupe uniquement !' }, { quoted: message });
      return;
    }
  } catch {
    await sock.sendMessage(remoteJid, { text: '❌ Impossible de vérifier le statut admin.' }, { quoted: message });
    return;
  }

  const { generateWAMessageContent, generateWAMessageFromContent } = await import('@whiskeysockets/baileys');
  const { default: crypto } = await import('crypto');

  async function groupStatus(jid, content) {
    const inside = await generateWAMessageContent(content, { upload: sock.waUploadToServer });
    const messageSecret = crypto.randomBytes(32);
    const m = generateWAMessageFromContent(jid, {
      messageContextInfo: { messageSecret },
      groupStatusMessageV2: { message: { ...inside, messageContextInfo: { messageSecret } } }
    }, {});
    await sock.relayMessage(jid, m.message, { messageId: m.key.id });
    return m;
  }

  function randomColor() {
    return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
  }

  async function dlBuf(msgObj, type) {
    const stream = await downloadContentFromMessage(msgObj, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  const msgText   = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
  const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const textInput = msgText.replace(/^[^a-zA-Z0-9]?(togstatus|swgc|tosgroup|gs|gstatus|togroupstatus)\s*/i, '').trim();

  if (!quotedMsg && !textInput) {
    await sock.sendMessage(remoteJid, {
      text: `╭─⌈ 📢 *GROUP STATUS* ⌋\n│\n├─⊷ *${config.prefix}tosgroup* (reply à un média)\n│  └⊷ Reply à une image/vidéo/audio\n├─⊷ *${config.prefix}tosgroup Ton texte*\n│  └⊷ Poster un statut texte\n╰───`
    }, { quoted: message });
    return;
  }

  await sock.sendMessage(remoteJid, { react: { text: '⏳', key: message.key } });

  try {
    let sent = false;

    if (quotedMsg) {
      if (quotedMsg.videoMessage) {
        const buffer = await dlBuf(quotedMsg.videoMessage, 'video');
        await groupStatus(remoteJid, { video: buffer, caption: textInput || quotedMsg.videoMessage.caption || '', mimetype: quotedMsg.videoMessage.mimetype || 'video/mp4', backgroundColor: randomColor() });
        sent = true;
      } else if (quotedMsg.imageMessage) {
        const buffer = await dlBuf(quotedMsg.imageMessage, 'image');
        await groupStatus(remoteJid, { image: buffer, caption: textInput || quotedMsg.imageMessage.caption || '', backgroundColor: randomColor() });
        sent = true;
      } else if (quotedMsg.audioMessage) {
        const buffer = await dlBuf(quotedMsg.audioMessage, 'audio');
        await groupStatus(remoteJid, { audio: buffer, mimetype: quotedMsg.audioMessage.mimetype || 'audio/mp4', backgroundColor: randomColor() });
        sent = true;
      } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage?.text) {
        const text = textInput || quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';
        if (text) { await groupStatus(remoteJid, { text, backgroundColor: randomColor() }); sent = true; }
      }
    } else if (textInput) {
      await groupStatus(remoteJid, { text: textInput, backgroundColor: randomColor() });
      sent = true;
    }

    await sock.sendMessage(remoteJid, { react: { text: sent ? '☑️' : '❌', key: message.key } });
    if (sent) {
      await sock.sendMessage(remoteJid, { text: '✅ Statut du groupe publié !' }, { quoted: message });
    } else {
      await sock.sendMessage(remoteJid, { text: '❌ Envoie un texte ou réponds à un média.' }, { quoted: message });
    }

  } catch (e) {
    console.error('[TOSGROUP]', e.message);
    await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` }, { quoted: message });
  }
}

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

// ── Auto-pull GitHub silencieux au démarrage (une seule fois) ────────────
async function autoPullOnStart() {
  try {
    const { execSync } = await import('child_process');
    const _cwd = process.cwd();

    // Vérifier si git est initialisé
    try { execSync('git status', { cwd: _cwd, stdio: 'ignore' }); }
    catch(e) {
      // Initialiser git si pas encore fait
      try {
        execSync('git init', { cwd: _cwd, stdio: 'ignore' });
        execSync('git remote add origin https://github.com/Azountou235/SEIGNEUR-TD-.git', { cwd: _cwd, stdio: 'ignore' });
      } catch(e2) {
        try { execSync('git remote set-url origin https://github.com/Azountou235/SEIGNEUR-TD-.git', { cwd: _cwd, stdio: 'ignore' }); } catch(e3) {}
      }
    }

    // Pull avec détection de changement → restart automatique si nouveau code
    try {
      const beforeHash = (() => { try { return execSync('git rev-parse HEAD', { cwd: _cwd }).toString().trim(); } catch(e) { return ''; } })();
      try {
        execSync('git pull origin main --rebase 2>&1 || git pull origin master --rebase 2>&1', {
          cwd: _cwd, shell: true, encoding: 'utf8', timeout: 30000
        });
      } catch(e) {
        // Force reset si conflit
        try {
          execSync('git fetch origin 2>&1', { cwd: _cwd, shell: true, timeout: 15000 });
          execSync('git reset --hard origin/main 2>&1 || git reset --hard origin/master 2>&1', { cwd: _cwd, shell: true, timeout: 15000 });
        } catch(e2) {
          console.log('[AUTO-UPDATE] Impossible de contacter GitHub (mode hors ligne)');
          return;
        }
      }
      const afterHash = (() => { try { return execSync('git rev-parse HEAD', { cwd: _cwd }).toString().trim(); } catch(e) { return ''; } })();
      if (beforeHash && afterHash && beforeHash !== afterHash) {
        console.log('✅ [AUTO-UPDATE] Nouveau code détecté → sauvegarde + restart dans 5s...');
        try { saveData(); } catch(se) {}
        // ✅ Sauvegarder la liste des sessions actives pour que restoreWebSessions les retrouve
        // Les dossiers ./sessions/<phone>/creds.json restent intacts → pas de pairing code demandé
        try {
          const sessDir = './sessions';
          if (fs.existsSync(sessDir)) {
            const phones = fs.readdirSync(sessDir).filter(f => fs.statSync(`${sessDir}/${f}`).isDirectory());
            console.log(`[AUTO-UPDATE] ${phones.length} session(s) seront restaurées automatiquement après restart`);
          }
        } catch(e) {}
        setTimeout(() => process.exit(0), 5000); // PM2/forever relance → restoreWebSessions() reconnecte tout
      } else {
        console.log('✅ [AUTO-UPDATE] Déjà à jour');
      }
    } catch(e) {
      console.log('[AUTO-UPDATE] Ignoré:', e.message);
    }

    // npm install silencieux si package.json a changé
    try {
      execSync('npm install --production --silent 2>&1', { cwd: _cwd, encoding: 'utf8', timeout: 60000 });
    } catch(e) {}

  } catch(e) {
    console.log('[AUTO-UPDATE] Ignoré:', e.message);
  }
}

// =============================================
// ♻️ RESTORE SESSIONS WEB — recharge toutes les sessions connectées via le site
// =============================================
async function restoreWebSessions() {
  // ✅ Utilise reconnectSession — NE supprime JAMAIS les credentials existants
  const sessionsDir = './sessions';
  if (!fs.existsSync(sessionsDir)) return;
  const phones = fs.readdirSync(sessionsDir).filter(f => {
    try { return fs.statSync(`${sessionsDir}/${f}`).isDirectory(); } catch { return false; }
  });
  if (phones.length === 0) {
    console.log('[RESTORE] Aucune session trouvée');
    return;
  }
  console.log(`[RESTORE] ${phones.length} session(s) détectée(s) — reconnexion silencieuse...`);
  for (const phone of phones) {
    try {
      // Vérifier credentials avant de tenter reconnexion
      if (!sessionHasCredentials(phone)) {
        console.log(`[RESTORE] ${phone} — pas de credentials valides, ignoré`);
        continue;
      }
      // Charger l'état sauvegardé (prefix, botMode) de cette session
      try {
        const stateFile = `./store_${phone}/session_state.json`;
        if (fs.existsSync(stateFile)) {
          const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
          const sess = getSessionState(phone);
          if (saved.prefix) sess.prefix = saved.prefix;
          if (saved.botMode) sess.botMode = saved.botMode;
          console.log(`[RESTORE] ${phone} — réglages restaurés (prefix: ${sess.prefix}, mode: ${sess.botMode})`);
        }
      } catch(e) {}
      await delay(1500); // Éviter de tout connecter simultanément
      await reconnectSession(phone);
    } catch(e) {
      console.log(`[RESTORE] ❌ Erreur ${phone}:`, e.message);
    }
  }
}

// ✅ WATCHDOG — relance automatique si le bot ne répond plus
let _lastMsgTime = Date.now();
let _botSock = null;
let _lastPingSuccess = Date.now();
let _reconnectAttempts = 0;

// ══════════════════════════════════════════════════════════════
// 🔁 WATCHDOG — Anti-zombie : détecte bot connecté mais sourd
// Toutes les 5 minutes : ping WA, si échec 2x → force reconnexion
// ══════════════════════════════════════════════════════════════
setInterval(async () => {
  if (!_botSock) return;
  try {
    // Ping WhatsApp pour tester la connexion réelle
    await _botSock.sendPresenceUpdate('available');
    _lastPingSuccess = Date.now();
    _reconnectAttempts = 0;
    console.log('[WATCHDOG] ✅ Connexion active');
  } catch(e) {
    _reconnectAttempts++;
    console.log(`[WATCHDOG] ⚠️ Ping échoué (tentative ${_reconnectAttempts}): ${e.message}`);
    if (_reconnectAttempts >= 2) {
      console.log('[WATCHDOG] 🔄 Bot zombie détecté — forçage reconnexion...');
      _reconnectAttempts = 0;
      _botSock = null;
      try { saveData(); } catch(se) {}
      // Reconnexion forcée
      setTimeout(() => connectToWhatsApp().catch(err => console.error('[WATCHDOG] Reconnexion échouée:', err)), 2000);
    }
  }
}, 5 * 60 * 1000); // toutes les 5 minutes

// ══════════════════════════════════════════════════════════════
// 💾 SAUVEGARDE AUTOMATIQUE toutes les 3 minutes
// ══════════════════════════════════════════════════════════════
setInterval(() => {
  try { saveData(); console.log('[AUTO-SAVE] ✅ Données sauvegardées'); } catch(e) {}
}, 3 * 60 * 1000);

// Lancer l'API server + tunnel HTTPS + auto-pull puis démarrer le bot principal
startApiServer().then(() => {
  startTunnel(API_PORT).catch(e => console.log('[TUNNEL] Non disponible:', e.message));
}).catch(err => console.error('[API] Erreur démarrage:', err));

autoPullOnStart().finally(() => {
  connectToWhatsApp().catch(err => {
    console.error('Failed to start bot:', err);
    saveData();
    process.exit(1);
  });
  // Restaurer les sessions web après 5s (laisser le bot principal se connecter d'abord)
  setTimeout(() => {
    restoreWebSessions().catch(e => console.log('[RESTORE] Erreur globale:', e.message));
  }, 5000);
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
