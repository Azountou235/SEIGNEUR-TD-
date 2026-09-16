/**
 * utils/sessionManager.js
 *
 * Remplace l'ancien modèle "un seul numéro, un seul SESSION_ID" par un
 * modèle multi-session : chaque numéro qui se lie via le site (pairing)
 * obtient son propre dossier sous sessions/<numéro>/ et devient un bot
 * indépendant et persistant, avec ses propres réglages (settingsStore /
 * groupSettingsStore sont scoped par session — voir sessionContext.js).
 */

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const logger = require('./logger');
const { groupCache } = require('./groupCache');
const sessionContext = require('./sessionContext');
const { registerConnectionHandler } = require('../events/connection');
const { registerMessageHandler } = require('../events/messages');

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// sessionId -> { sock, intervals: number[] }
const activeSessions = new Map();

// Sessions pour lesquelles un code de pairing a déjà été demandé.
// Contrairement à une variable locale à startSession, ceci persiste
// entre les reconnexions automatiques (restartRequired=515 etc.) pour
// ne JAMAIS redemander un nouveau code après le premier — sinon
// WhatsApp traite ça comme du spam de pairing et logout le compte.
const pairingCodeSent = new Set();

function authDir(sessionId) {
  return path.join(SESSIONS_DIR, sessionId, 'auth');
}

// Attache le contexte de session à TOUT événement enregistré sur ce socket
// après cet appel — connection.update, messages.upsert, groups.update,
// call, etc. Ça évite d'avoir à envelopper manuellement chaque handler
// (dans sessionManager comme dans events/messages.js) avec
// sessionContext.run(...).
function bindSessionContext(sock, sessionId) {
  const originalOn = sock.ev.on.bind(sock.ev);
  sock.ev.on = (event, listener) => originalOn(event, (...args) =>
    sessionContext.run(sessionId, () => listener(...args))
  );
  return sock;
}

/**
 * Retourne la liste des IDs de session (numéros) qui ont déjà des
 * identifiants sauvegardés sur disque, qu'ils soient actuellement
 * connectés ou non — utilisé au démarrage du process pour tout relancer.
 */
function listKnownSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  return fs.readdirSync(SESSIONS_DIR).filter((name) => {
    try {
      return fs.existsSync(path.join(authDir(name), 'creds.json'));
    } catch {
      return false;
    }
  });
}

function stopSession(sessionId) {
  const entry = activeSessions.get(sessionId);
  if (!entry) return;
  entry.intervals.forEach(clearInterval);
  try {
    entry.sock.ev.removeAllListeners();
    entry.sock.end(new Error('stopped'));
  } catch (_) {
    // Le socket est peut-être déjà mort — sans importance.
  }
  activeSessions.delete(sessionId);
}

function removeSession(sessionId) {
  stopSession(sessionId);
  pairingCodeSent.delete(sessionId);
  fs.rm(path.join(SESSIONS_DIR, sessionId), { recursive: true, force: true }, () => {});
}

/**
 * Démarre (ou redémarre) le bot pour une session donnée.
 *
 * @param {string} sessionId - le numéro WhatsApp (sans +), sert d'ID unique
 * @param {Map}    commands  - la Map de commandes déjà chargée (loadCommands)
 * @param {object} [opts]
 * @param {string} [opts.phoneNumber] - fourni uniquement lors d'un premier
 *   pairing ; déclenche la demande de code une fois connecté
 * @param {(code: string) => void} [opts.onPairingCode] - callback appelé
 *   avec le code formaté (ex: pour l'API du site)
 * @param {(sock) => void} [opts.onOpen] - callback appelé une fois la
 *   connexion établie (connection === 'open')
 */
async function startSession(sessionId, commands, opts = {}) {
  const { phoneNumber, onPairingCode, onOpen } = opts; // opts.onClose lu plus bas via closure

  // Redémarrage : on ferme proprement l'ancien socket de cette session
  // avant d'en ouvrir un nouveau, sans toucher aux autres sessions actives.
  stopSession(sessionId);

  const dir = authDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const wasAlreadyRegistered = state.creds.registered;
  const { version } = await fetchLatestBaileysVersion();
  const baileysLogger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });

  const sock = makeWASocket({
    version,
    auth: state,
    logger: baileysLogger,
    defaultQueryTimeoutMs: 90000,
    connectTimeoutMs: 90000,
    keepAliveIntervalMs: 15000,
    retryRequestDelayMs: 1000,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    browser: ['Ubuntu', 'Chrome', '120.0.6099.130'],
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
  });

  bindSessionContext(sock, sessionId);

  const intervals = [];
  activeSessions.set(sessionId, { sock, intervals });

  sock.ev.on('creds.update', saveCreds);

  // Rejet automatique des appels si .anticall est actif pour cette session.
  sock.ev.on('call', async (calls) => {
    const settingsStore = require('./settingsStore');
    if (!settingsStore.get('anticall', false)) return;

    for (const call of calls) {
      if (call.status !== 'offer' && call.status !== 'ringing') continue;
      try {
        await sock.rejectCall(call.id, call.from);
        logger.info(`[${sessionId}] [anticall] Rejected incoming call from ${call.from}`);
      } catch (error) {
        logger.error(`[${sessionId}] [anticall] Failed to reject call: ${error.message}`);
        continue;
      }
      try {
        const message = settingsStore.get(
          'anticallMessage',
          "🚫 Anticall activé, je ne peux pas recevoir d'appels pour le moment !"
        );
        await sock.sendMessage(call.from, { text: message });
      } catch (error) {
        logger.error(`[${sessionId}] [anticall] Failed to send message: ${error.message}`);
      }
    }
  });

  sock.ev.on('connection.update', async ({ connection, qr }) => {
    if (qr && !phoneNumber) {
      opts.onQr?.(qr);
    }

    if (connection === 'connecting' && phoneNumber && !pairingCodeSent.has(sessionId)) {
      pairingCodeSent.add(sessionId);
      try {
        await new Promise((r) => setTimeout(r, 500));
        const code = await sock.requestPairingCode(phoneNumber, 'SEIGNEUR').catch((err) => {
          logger.warn(`[${sessionId}] Code custom refusé (${err.message}), fallback code standard.`);
          return sock.requestPairingCode(phoneNumber);
        });
        const formatted = code.match(/.{1,4}/g)?.join('-') || code;
        logger.info(`[${sessionId}] 👑 Code de pairing : ${formatted}`);
        onPairingCode?.(formatted);
      } catch (error) {
        logger.error(`[${sessionId}] [pairing] ${error.message}`);
        pairingCodeSent.delete(sessionId);
      }
    }

    if (connection === 'open') {
      pairingCodeSent.delete(sessionId);
      onOpen?.(sock);
    }
  });

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close' && !wasAlreadyRegistered && !sock.__toumaiOpened) {
      opts.onClose?.(lastDisconnect);
    }
    if (connection === 'open') sock.__toumaiOpened = true;
  });

  // Groupes : cache + welcome/goodbye/antietranger, identiques à l'ancien
  // index.js mais désormais scoped à cette session via groupSettingsStore.
  sock.ev.on('groups.update', async ([event]) => {
    try {
      if (!event?.id) return;
      const metadata = await sock.groupMetadata(event.id);
      groupCache.set(event.id, metadata);
    } catch (error) {
      logger.error(`[${sessionId}] [groupCache] ${error.message}`);
    }
  });

  sock.ev.on('group-participants.update', async (event) => {
    try {
      if (!event?.id) return;
      const metadata = await sock.groupMetadata(event.id);
      groupCache.set(event.id, metadata);

      const settingsStore = require('./settingsStore');
      const groupSettingsStore = require('./groupSettingsStore');

      if (event.action === 'add' && groupSettingsStore.get(event.id, 'antietranger', false)) {
        const allowedCodes = groupSettingsStore.get(event.id, 'antietrangerCodes', ['235']);
        for (const entry of event.participants) {
          const participant = entry.phoneNumber || entry.id || entry;
          const number = String(participant).split('@')[0];
          const matches = allowedCodes.some((code) => number.startsWith(code));
          if (!matches) {
            try {
              await sock.groupParticipantsUpdate(event.id, [participant], 'remove');
              await sock.sendMessage(event.id, {
                text: `🌍🚫 @${number} removed — this group only allows numbers from: ${allowedCodes.join(', ')}`,
                mentions: [participant],
              });
            } catch (e) {
              logger.error(`[${sessionId}] [antietranger] Failed to remove ${number}: ${e.message}`);
            }
          }
        }
      }

      if (settingsStore.get('welcomegoodbye', false)) {
        for (const entry of event.participants) {
          const participant = entry.phoneNumber || entry.id || entry;
          const perGroup = groupSettingsStore.getAll(event.id);

          if (event.action === 'add' && perGroup.welcome) {
            await sock.sendMessage(event.id, {
              text: `👋 Welcome @${participant.split('@')[0]} to *${metadata.subject}*! Glad to have you here.`,
              mentions: [participant],
            });
          } else if (event.action === 'remove' && perGroup.goodbye) {
            await sock.sendMessage(event.id, {
              text: `👋 @${participant.split('@')[0]} has left *${metadata.subject}*. Goodbye!`,
              mentions: [participant],
            });
          }
        }
      }
    } catch (error) {
      logger.error(`[${sessionId}] [groupCache] ${error.message}`);
    }
  });

  // Autobio + wapresence, un intervalle par session (nettoyé par
  // stopSession au redémarrage/déconnexion pour ne jamais s'accumuler).
  const autobioIntervalId = setInterval(async () => {
    try {
      const settingsStore = require('./settingsStore');
      if (!settingsStore.get('autobio', false)) return;

      const config = require('../config/config');
      const quotes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'autobioQuotes.json'), 'utf8'));
      const quoteIndex = Math.floor(Date.now() / (12 * 60 * 60 * 1000)) % quotes.length;
      const quote = quotes[quoteIndex];

      const now = new Date();
      const timeStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: config.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(now);
      const dateStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: config.timezone, day: '2-digit', month: '2-digit', year: 'numeric',
      }).format(now);

      await sock.updateProfileStatus(`TOUMAÏ-MD is alive now\n${dateStr} ${timeStr}\n"${quote}"`);
    } catch (error) {
      logger.error(`[${sessionId}] [autobio] ${error.message}`);
    }
  }, 60 * 1000);
  intervals.push(autobioIntervalId);

  const wapresenceIntervalId = setInterval(async () => {
    try {
      const settingsStore = require('./settingsStore');
      if (settingsStore.get('wapresence', false)) await sock.sendPresenceUpdate('available');
    } catch (error) {
      logger.error(`[${sessionId}] [wapresence] ${error.message}`);
    }
  }, 30 * 1000);
  intervals.push(wapresenceIntervalId);

  // Reconnexion / erreurs fatales : réutilise la même logique que l'ancien
  // bot mono-session, mais onFatal supprime UNIQUEMENT cette session au
  // lieu de faire process.exit() (qui aurait coupé tous les autres numéros
  // connectés sur ce même serveur).
  registerConnectionHandler(sock, () => startSession(sessionId, commands, opts), wasAlreadyRegistered, sessionId, (reason) => {
    logger.error(`[${sessionId}] Session arrêtée définitivement (${reason}).`);
    removeSession(sessionId);
  });

  registerMessageHandler(sock, commands);

  return sock;
}

/**
 * À appeler une fois au démarrage du process : relance automatiquement
 * tous les numéros déjà liés précédemment (persistés sous sessions/).
 */
async function loadAllSessions(commands) {
  const ids = listKnownSessions();
  if (ids.length === 0) {
    logger.info('[sessionManager] Aucune session existante à relancer.');
    return;
  }
  logger.info(`[sessionManager] Relance de ${ids.length} session(s) existante(s): ${ids.join(', ')}`);
  for (const sessionId of ids) {
    try {
      await startSession(sessionId, commands);
    } catch (error) {
      logger.error(`[sessionManager] Échec relance de ${sessionId}: ${error.message}`);
    }
  }
}

/**
 * Utilisé uniquement par le flux QR : on ne connaît le numéro qu'une fois
 * connecté (sock.user.id), donc la session démarre sous un ID temporaire
 * puis est "rebaptisée" avec le vrai numéro pour rejoindre le système
 * multi-session permanent.
 */
async function claimSessionId(tempId, newId, commands) {
  stopSession(tempId); // ferme le socket temporaire SANS supprimer ses fichiers
  const oldDir = path.join(SESSIONS_DIR, tempId);
  const newDir = path.join(SESSIONS_DIR, newId);
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  if (fs.existsSync(newDir)) fs.rmSync(newDir, { recursive: true, force: true });
  fs.renameSync(oldDir, newDir);
  return startSession(newId, commands);
}

module.exports = {
  SESSIONS_DIR,
  authDir,
  activeSessions,
  listKnownSessions,
  startSession,
  stopSession,
  removeSession,
  loadAllSessions,
  claimSessionId,
};
