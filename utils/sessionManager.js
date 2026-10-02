/**
 * utils/sessionManager.js
 *
 * Modèle multi-session : chaque numéro lié via le site (pairing) obtient
 * son propre dossier sous sessions/<numéro>/ et devient un bot
 * indépendant et persistant.
 *
 * CORRECTIFS PAR RAPPORT À L'ANCIENNE VERSION
 * -------------------------------------------
 * 1. Pairing rejoué à chaque reconnexion : `opts.phoneNumber` restait dans
 *    la closure de reconnexion. Après 1 connexion réussie, la moindre
 *    coupure relançait requestPairingCode() sur un compte DÉJÀ lié, ce qui
 *    fait déconnecter/bannir la session par WhatsApp. Maintenant le
 *    pairing n'est demandé que si les creds ne sont pas encore liées, et
 *    les callbacks du pairing sont abandonnés après la 1re ouverture.
 * 2. Sessions détruites à tort : connectionReplaced / badSession
 *    supprimaient le dossier (creds incluses). Maintenant seule une vraie
 *    déconnexion (loggedOut) retire la session, et même là les fichiers
 *    sont ARCHIVÉS (sessions/.removed/) au lieu d'être effacés.
 * 3. Relance au démarrage sans filet : si startSession() échouait au boot
 *    (réseau, fs...), la session n'était JAMAIS retentée jusqu'au prochain
 *    redémarrage. Un superviseur (toutes les 60s) relance désormais toute
 *    session liée qui est absente ou bloquée (connexion/reconnexion qui ne
 *    revient pas), avec backoff.
 * 4. creds.json corrompu (process tué en pleine écriture) : Baileys
 *    repartait silencieusement de creds vides → la session attendait un QR
 *    que personne ne scanne, sans jamais répondre. Maintenant : écriture
 *    des creds sérialisée + copie de secours creds.json.bak validée, et
 *    restauration automatique au démarrage.
 * 5. Arrêt propre (SIGTERM/SIGINT) : on attend la fin des écritures de
 *    creds avant de quitter, pour ne pas laisser de fichier tronqué lors
 *    d'un redémarrage de l'hébergeur.
 * 6. Hébergeur à disque éphemère (Heroku, Render...) : si DATABASE_URL est
 *    défini, les fichiers d'auth sont miroirés dans PostgreSQL et
 *    restaurés au démarrage. Sans DATABASE_URL, rien ne change (disque).
 * 7. Backoff persistant, version WhatsApp mise en cache (plus de dépendance
 *    réseau bloquante à chaque reconnexion), autobio moins agressif
 *    (1 min -> 10 min, un changement de statut chaque minute est un
 *    comportement très suspect pour WhatsApp).
 */

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const NodeCache = require('node-cache');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const logger = require('./logger');
const { groupCache } = require('./groupCache');
const sessionContext = require('./sessionContext');
const {
  registerConnectionHandler,
  cancelReconnect,
  forgetSession,
  isReconnectPending,
} = require('../events/connection');
const { registerMessageHandler } = require('../events/messages');
const { scheduleAutoJoin } = require('./autoJoin');

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
const REMOVED_DIR_NAME = '.removed';
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const USE_DB = !!process.env.DATABASE_URL;
const db = USE_DB ? require('./db') : null;

// sessionId -> { sock, intervals: number[], startedAt }
const activeSessions = new Map();

// Sessions pour lesquelles un code de pairing a déjà été demandé (persiste
// entre les reconnexions automatiques pour ne JAMAIS en redemander un).
const pairingCodeSent = new Set();

// Sessions en cours de (re)démarrage — évite que le superviseur et le
// handler de reconnexion démarrent deux sockets en même temps.
const starting = new Set();

// Sessions mises en pause : sessionId -> timestamp avant lequel on n'y touche pas.
const suspended = new Map();

// Échecs de démarrage consécutifs par session (pour le backoff du superviseur).
const failCounts = new Map();

// Dernière Map de commandes connue (utilisée par le superviseur).
let lastCommands = null;

const SUPERVISOR_INTERVAL_MS = 60 * 1000;
const STALL_MS = 5 * 60 * 1000; // connexion/reconnexion bloquée au-delà => relance forcée
const SUSPEND_MS = 10 * 60 * 1000;
const DB_SYNC_INTERVAL_MS = 30 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────
// Chemins & lecture des creds
// ─────────────────────────────────────────────────────────────────────────

function authDir(sessionId) {
  return path.join(SESSIONS_DIR, sessionId, 'auth');
}

function bindSessionContext(sock, sessionId) {
  const originalOn = sock.ev.on.bind(sock.ev);
  sock.ev.on = (event, listener) =>
    originalOn(event, (...args) => sessionContext.run(sessionId, () => listener(...args)));
  return sock;
}

function isIgnoredDirName(name) {
  return name.startsWith('.') || name.startsWith('qr-temp-');
}

function readJsonFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Lit les creds (fichier principal, sinon copie de secours). */
function readCreds(dir) {
  return readJsonFile(path.join(dir, 'creds.json')) || readJsonFile(path.join(dir, 'creds.json.bak'));
}

const warnedCorrupt = new Set();

/**
 * Une session "connue" = déjà liée (creds.me présent). Les dossiers de
 * pairing inachevés ne sont plus relancés au boot (ils attendaient un QR
 * que personne ne scannait, sans jamais répondre).
 */
function listKnownSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  return fs.readdirSync(SESSIONS_DIR).filter((name) => {
    if (isIgnoredDirName(name)) return false;
    try {
      const dir = authDir(name);
      if (!fs.existsSync(path.join(dir, 'creds.json')) && !fs.existsSync(path.join(dir, 'creds.json.bak'))) {
        return false;
      }
      const creds = readCreds(dir);
      if (!creds) {
        if (!warnedCorrupt.has(name)) {
          warnedCorrupt.add(name);
          logger.error(`[${name}] creds.json illisible et aucune sauvegarde valide — re-pairing nécessaire.`);
        }
        return false;
      }
      return !!creds.me?.id;
    } catch {
      return false;
    }
  });
}

/**
 * Restaure creds.json depuis creds.json.bak si le principal est corrompu.
 * Retourne false si la session est irrécupérable (elle est alors archivée).
 */
function repairCreds(sessionId, dir) {
  const main = path.join(dir, 'creds.json');
  const bak = path.join(dir, 'creds.json.bak');

  const mainOk = !!readJsonFile(main);
  if (mainOk) return true;

  if (readJsonFile(bak)) {
    fs.copyFileSync(bak, main);
    logger.warn(`[${sessionId}] creds.json corrompu/absent — restauré depuis creds.json.bak.`);
    return true;
  }

  if (fs.existsSync(main)) {
    logger.error(`[${sessionId}] creds.json corrompu et aucune sauvegarde valide — session archivée, re-pairing nécessaire.`);
    archiveSession(sessionId);
    return false;
  }

  return true; // pas de creds du tout : nouvelle session (pairing / QR)
}

// ─────────────────────────────────────────────────────────────────────────
// Écriture sûre des creds (sérialisée + copie de secours)
// ─────────────────────────────────────────────────────────────────────────

const saveChains = new Map(); // sessionId -> dernière promesse d'écriture

function backupCreds(dir) {
  try {
    const main = path.join(dir, 'creds.json');
    const raw = fs.readFileSync(main, 'utf8');
    JSON.parse(raw); // on ne sauvegarde jamais un fichier invalide
    const tmp = path.join(dir, 'creds.json.bak.tmp');
    fs.writeFileSync(tmp, raw);
    fs.renameSync(tmp, path.join(dir, 'creds.json.bak'));
  } catch (error) {
    logger.warn(`[creds] Sauvegarde de secours impossible: ${error.message}`);
  }
}

function makeSafeSaveCreds(sessionId, dir, saveCreds) {
  return () => {
    const previous = saveChains.get(sessionId) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        await saveCreds();
        backupCreds(dir);
        scheduleDbSync(sessionId);
      })
      .catch((error) => {
        logger.error(`[${sessionId}] [creds] Échec de sauvegarde: ${error.message}`);
      });
    saveChains.set(sessionId, next);
    return next;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Miroir PostgreSQL optionnel (hébergeurs à disque éphémère)
// ─────────────────────────────────────────────────────────────────────────

const dbSynced = new Map(); // `${sessionId}/${fichier}` -> mtimeMs déjà envoyé
let authTableReady = null;
let dbSyncRunning = false;
const dbSyncTimers = new Map();

function ensureAuthTable() {
  if (!authTableReady) {
    authTableReady = db
      .query(
        `CREATE TABLE IF NOT EXISTS wa_auth_files (
           session_id TEXT NOT NULL,
           file_name  TEXT NOT NULL,
           data       TEXT NOT NULL,
           updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           PRIMARY KEY (session_id, file_name)
         )`
      )
      .catch((error) => {
        authTableReady = null;
        throw error;
      });
  }
  return authTableReady;
}

async function syncSessionToDb(sessionId) {
  if (!USE_DB) return;
  const dir = authDir(sessionId);
  if (!fs.existsSync(dir)) return;

  await ensureAuthTable();

  const present = new Set();
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.tmp') || file.endsWith('.bak')) continue;

    const full = path.join(dir, file);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    present.add(file);
    const key = `${sessionId}/${file}`;
    if (dbSynced.get(key) === stat.mtimeMs) continue;

    let data;
    try {
      data = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    // On ne copie jamais des creds corrompues vers la base.
    if (file === 'creds.json') {
      try {
        JSON.parse(data);
      } catch {
        continue;
      }
    }

    await db.query(
      `INSERT INTO wa_auth_files (session_id, file_name, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id, file_name)
       DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [sessionId, file, data]
    );
    dbSynced.set(key, stat.mtimeMs);
  }

  // Fichiers supprimés localement (Baileys consomme des pre-keys...).
  const prefix = `${sessionId}/`;
  for (const key of [...dbSynced.keys()]) {
    if (!key.startsWith(prefix)) continue;
    const file = key.slice(prefix.length);
    if (present.has(file)) continue;
    await db.query('DELETE FROM wa_auth_files WHERE session_id = $1 AND file_name = $2', [sessionId, file]);
    dbSynced.delete(key);
  }
}

function scheduleDbSync(sessionId, delayMs = 3000) {
  if (!USE_DB) return;
  if (dbSyncTimers.has(sessionId)) return;
  const t = setTimeout(() => {
    dbSyncTimers.delete(sessionId);
    syncSessionToDb(sessionId).catch((error) =>
      logger.warn(`[${sessionId}] [db-sync] ${error.message}`)
    );
  }, delayMs);
  dbSyncTimers.set(sessionId, t);
}

async function syncAllToDb() {
  if (!USE_DB || dbSyncRunning) return;
  dbSyncRunning = true;
  try {
    for (const sessionId of listKnownSessions()) {
      try {
        await syncSessionToDb(sessionId);
      } catch (error) {
        logger.warn(`[${sessionId}] [db-sync] ${error.message}`);
      }
    }
  } finally {
    dbSyncRunning = false;
  }
}

async function deleteSessionFromDb(sessionId) {
  if (!USE_DB) return;
  const prefix = `${sessionId}/`;
  for (const key of [...dbSynced.keys()]) if (key.startsWith(prefix)) dbSynced.delete(key);
  try {
    await ensureAuthTable();
    await db.query('DELETE FROM wa_auth_files WHERE session_id = $1', [sessionId]);
  } catch (error) {
    logger.warn(`[${sessionId}] [db-sync] Suppression en base impossible: ${error.message}`);
  }
}

/** Au boot : recrée sur disque les sessions présentes en base mais absentes localement. */
async function restoreSessionsFromDb() {
  if (!USE_DB) return;
  try {
    await ensureAuthTable();
    const { rows: ids } = await db.query('SELECT DISTINCT session_id FROM wa_auth_files');

    for (const { session_id: sessionId } of ids) {
      if (isIgnoredDirName(sessionId)) continue;
      const dir = authDir(sessionId);
      if (fs.existsSync(path.join(dir, 'creds.json'))) continue; // le disque local fait foi

      const { rows } = await db.query(
        'SELECT file_name, data FROM wa_auth_files WHERE session_id = $1',
        [sessionId]
      );
      if (!rows.some((r) => r.file_name === 'creds.json')) continue;

      fs.mkdirSync(dir, { recursive: true });
      for (const row of rows) {
        // Protection contre un nom de fichier malveillant (../).
        if (path.basename(row.file_name) !== row.file_name) continue;
        const full = path.join(dir, row.file_name);
        fs.writeFileSync(full, row.data);
        dbSynced.set(`${sessionId}/${row.file_name}`, fs.statSync(full).mtimeMs);
      }
      logger.info(`[${sessionId}] Session restaurée depuis PostgreSQL (${rows.length} fichier(s)).`);
    }
  } catch (error) {
    logger.error(`[sessionManager] Restauration depuis PostgreSQL impossible: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Arrêt / archivage
// ─────────────────────────────────────────────────────────────────────────

function stopSession(sessionId) {
  cancelReconnect(sessionId);
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

/**
 * Retire une session (logout réel). Les fichiers sont déplacés dans
 * sessions/.removed/ au lieu d'être supprimés : rien n'est perdu
 * définitivement par erreur.
 */
function archiveSession(sessionId) {
  stopSession(sessionId);
  forgetSession(sessionId);
  pairingCodeSent.delete(sessionId);
  suspended.delete(sessionId);
  failCounts.delete(sessionId);

  const src = path.join(SESSIONS_DIR, sessionId);
  try {
    if (fs.existsSync(src)) {
      const destRoot = path.join(SESSIONS_DIR, REMOVED_DIR_NAME);
      fs.mkdirSync(destRoot, { recursive: true });
      fs.renameSync(src, path.join(destRoot, `${sessionId}-${Date.now()}`));
    }
  } catch (error) {
    logger.warn(`[${sessionId}] Archivage impossible (${error.message}) — suppression.`);
    fs.rm(src, { recursive: true, force: true }, () => {});
  }

  deleteSessionFromDb(sessionId);
}

// Conservé pour compatibilité avec l'ancien code.
function removeSession(sessionId) {
  archiveSession(sessionId);
}

/** Appelé par connection.js quand une session ne doit plus être relancée automatiquement. */
function handleFatal(sessionId, reason) {
  if (reason === 'loggedOut') {
    logger.error(`[${sessionId}] Session arrêtée définitivement (loggedOut) — archivée.`);
    archiveSession(sessionId);
    return;
  }
  // connectionReplaced / badSession : on conserve les fichiers et on retente plus tard.
  logger.error(`[${sessionId}] Session suspendue ${SUSPEND_MS / 60000} min (${reason}) — fichiers conservés.`);
  stopSession(sessionId);
  suspended.set(sessionId, Date.now() + SUSPEND_MS);
}

// ─────────────────────────────────────────────────────────────────────────
// Version WhatsApp en cache
// ─────────────────────────────────────────────────────────────────────────

let cachedVersion = null;
let cachedVersionAt = 0;

async function getWaVersion() {
  if (cachedVersion && Date.now() - cachedVersionAt < 60 * 60 * 1000) return cachedVersion;
  try {
    const result = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);
    if (result?.version) {
      cachedVersion = result.version;
      cachedVersionAt = Date.now();
      return cachedVersion;
    }
  } catch (error) {
    logger.warn(`[sessionManager] fetchLatestBaileysVersion indisponible (${error.message}) — version par défaut.`);
  }
  return cachedVersion || undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// Démarrage d'une session
// ─────────────────────────────────────────────────────────────────────────

/**
 * Démarre (ou redémarre) le bot pour une session donnée.
 *
 * @param {string} sessionId - le numéro WhatsApp (sans +), sert d'ID unique
 * @param {Map}    commands  - la Map de commandes déjà chargée
 * @param {object} [opts]
 * @param {string} [opts.phoneNumber]   - premier pairing uniquement
 * @param {(code: string) => void} [opts.onPairingCode]
 * @param {(sock) => void} [opts.onOpen]
 */
async function startSession(sessionId, commands, opts = {}) {
  if (commands) lastCommands = commands;
  starting.add(sessionId);
  try {
    const sock = await startSessionInternal(sessionId, commands, opts);
    if (sock) failCounts.delete(sessionId);
    return sock;
  } finally {
    starting.delete(sessionId);
  }
}

async function startSessionInternal(sessionId, commands, opts = {}) {
  const { phoneNumber, onPairingCode, onOpen } = opts;

  // Ferme proprement l'ancien socket de CETTE session uniquement.
  stopSession(sessionId);

  const dir = authDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });

  // Restaure les creds depuis la copie de secours si besoin (sinon Baileys
  // repartirait silencieusement de creds vides).
  if (!repairCreds(sessionId, dir)) return null;

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const safeSaveCreds = makeSafeSaveCreds(sessionId, dir, saveCreds);

  const wasAlreadyRegistered = state.creds.registered;
  // Déjà lié => on ne redemande JAMAIS de code de pairing, même si
  // opts.phoneNumber est encore présent dans la closure de reconnexion.
  const alreadyPaired = !!(wasAlreadyRegistered || state.creds.me?.id);
  const pairingPhone = alreadyPaired ? undefined : phoneNumber;

  const version = await getWaVersion();
  const baileysLogger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });

  const sock = makeWASocket({
    ...(version ? { version } : {}),
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
    msgRetryCounterCache: new NodeCache({ stdTTL: 10 * 60, useClones: false }),
  });

  bindSessionContext(sock, sessionId);

  const intervals = [];
  activeSessions.set(sessionId, { sock, intervals, startedAt: Date.now() });

  sock.__state = 'connecting';
  sock.__stateSince = Date.now();

  sock.ev.on('creds.update', safeSaveCreds);

  // Suivi d'état utilisé par le superviseur.
  sock.ev.on('connection.update', ({ connection }) => {
    if (connection) {
      sock.__state = connection;
      sock.__stateSince = Date.now();
    }
  });

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

    if (connection === 'connecting' && pairingPhone && !pairingCodeSent.has(sessionId)) {
      pairingCodeSent.add(sessionId);
      try {
        await sleep(3000);
        const code = await sock.requestPairingCode(pairingPhone);
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
      try {
        await Promise.resolve(onOpen?.(sock));
      } catch (error) {
        logger.error(`[${sessionId}] [onOpen] ${error.message}`);
      }
      // Les callbacks de pairing ne servent qu'à la 1re ouverture : on les
      // abandonne pour que les reconnexions suivantes ne les rejouent pas.
      opts = {};
      scheduleAutoJoin(sock);
      scheduleDbSync(sessionId, 1000);
    }
  });

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close' && !wasAlreadyRegistered && !sock.__toumaiOpened) {
      opts.onClose?.(lastDisconnect);
    }
    if (connection === 'open') {
      sock.__toumaiOpened = true;
      // Horodatage propre à CE socket (voir commands/up.js).
      sock.__connectedAt = Date.now();
    }
  });

  // Groupes : cache + welcome/goodbye/antietranger.
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

  // Autobio : toutes les 10 min (avant : 1 min — changer le statut du
  // profil chaque minute est un signal d'abus très net pour WhatsApp).
  const autobioIntervalId = setInterval(async () => {
    try {
      if (sock.__state !== 'open') return;
      const settingsStore = require('./settingsStore');
      if (!settingsStore.get('autobio', false)) return;

      const config = require('../config/config');
      const quotes = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'config', 'autobioQuotes.json'), 'utf8')
      );
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
  }, 10 * 60 * 1000);
  intervals.push(autobioIntervalId);

  const wapresenceIntervalId = setInterval(async () => {
    try {
      if (sock.__state !== 'open') return;
      const settingsStore = require('./settingsStore');
      if (settingsStore.get('wapresence', false)) await sock.sendPresenceUpdate('available');
    } catch (error) {
      logger.error(`[${sessionId}] [wapresence] ${error.message}`);
    }
  }, 30 * 1000);
  intervals.push(wapresenceIntervalId);

  // Reconnexion / erreurs fatales. onFatal ne fait JAMAIS de process.exit()
  // (ça couperait tous les autres numéros) et ne supprime plus les creds
  // sauf en cas de vrai loggedOut.
  registerConnectionHandler(
    sock,
    () => startSession(sessionId, commands, opts),
    wasAlreadyRegistered,
    sessionId,
    (reason) => handleFatal(sessionId, reason)
  );

  registerMessageHandler(sock, commands);

  return sock;
}

// ─────────────────────────────────────────────────────────────────────────
// Superviseur : filet de sécurité contre les sessions mortes
// ─────────────────────────────────────────────────────────────────────────

function noteStartFailure(sessionId) {
  const fails = (failCounts.get(sessionId) || 0) + 1;
  failCounts.set(sessionId, fails);
  const waitMs = Math.min(30000 * 2 ** (fails - 1), 30 * 60 * 1000);
  suspended.set(sessionId, Date.now() + waitMs);
  logger.warn(`[${sessionId}] Échec de démarrage n°${fails} — prochaine tentative dans ${Math.round(waitMs / 1000)}s.`);
}

async function superviseSessions() {
  if (!lastCommands) return;
  const now = Date.now();

  for (const sessionId of listKnownSessions()) {
    if (starting.has(sessionId)) continue;

    const until = suspended.get(sessionId);
    if (until && now < until) continue;

    const entry = activeSessions.get(sessionId);

    let reason = null;
    if (!entry) {
      reason = 'session absente (arrêtée ou échec de démarrage)';
    } else if (!isReconnectPending(sessionId)) {
      const sock = entry.sock;
      const state = sock.__state;
      const since = sock.__stateSince || entry.startedAt;
      if (state !== 'open' && now - since > STALL_MS) {
        reason = `bloquée en "${state}" depuis ${Math.round((now - since) / 1000)}s`;
      } else if (state === 'open' && sock.ws?.isOpen === false && now - since > 60 * 1000) {
        reason = 'socket fermé alors que la session se croit connectée';
      }
    }

    if (!reason) continue;

    suspended.delete(sessionId);
    logger.warn(`[${sessionId}] [superviseur] ${reason} → relance.`);
    try {
      await startSession(sessionId, lastCommands);
    } catch (error) {
      logger.error(`[${sessionId}] [superviseur] Échec de relance: ${error.message}`);
      noteStartFailure(sessionId);
    }
    await sleep(2000 + Math.random() * 2000); // étale les relances
  }
}

let backgroundStarted = false;
function startBackgroundTasks() {
  if (backgroundStarted) return;
  backgroundStarted = true;

  setInterval(() => {
    superviseSessions().catch((error) => logger.error(`[superviseur] ${error.message}`));
  }, SUPERVISOR_INTERVAL_MS);

  if (USE_DB) {
    setInterval(() => {
      syncAllToDb().catch((error) => logger.warn(`[db-sync] ${error.message}`));
    }, DB_SYNC_INTERVAL_MS);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Arrêt propre du process (redémarrage de l'hébergeur)
// ─────────────────────────────────────────────────────────────────────────

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn(`[sessionManager] ${signal} reçu — sauvegarde des sessions avant arrêt...`);

  const hardStop = setTimeout(() => process.exit(0), 8000);
  try {
    await Promise.allSettled([...saveChains.values()]);
    if (USE_DB) {
      await Promise.race([syncAllToDb(), sleep(5000)]);
    }
  } catch (_) {
    // on quitte quoi qu'il arrive
  }
  clearTimeout(hardStop);
  process.exit(0);
}

if (!global.__sessionShutdownHooks) {
  global.__sessionShutdownHooks = true;
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ─────────────────────────────────────────────────────────────────────────
// Démarrage de toutes les sessions
// ─────────────────────────────────────────────────────────────────────────

/**
 * À appeler une fois au démarrage du process : relance automatiquement
 * tous les numéros déjà liés (disque, ou PostgreSQL si DATABASE_URL).
 */
async function loadAllSessions(commands) {
  lastCommands = commands;

  await restoreSessionsFromDb();

  const ids = listKnownSessions();
  if (ids.length === 0) {
    logger.info('[sessionManager] Aucune session existante à relancer.');
  } else {
    logger.info(`[sessionManager] Relance de ${ids.length} session(s) existante(s): ${ids.join(', ')}`);
  }

  for (let i = 0; i < ids.length; i += 1) {
    const sessionId = ids[i];
    try {
      await startSession(sessionId, commands);
    } catch (error) {
      // Plus d'abandon définitif : le superviseur retentera avec backoff.
      logger.error(`[sessionManager] Échec relance de ${sessionId}: ${error.message}`);
      noteStartFailure(sessionId);
    }
    // Étale les connexions pour ne pas ressembler à une rafale suspecte.
    if (i < ids.length - 1) {
      await sleep(4000 + Math.random() * 3000);
    }
  }

  startBackgroundTasks();
}

/**
 * Utilisé uniquement par le flux QR : la session démarre sous un ID
 * temporaire puis est "rebaptisée" avec le vrai numéro.
 */
async function claimSessionId(tempId, newId, commands) {
  stopSession(tempId); // ferme le socket temporaire SANS supprimer ses fichiers
  forgetSession(tempId);
  stopSession(newId); // si ce numéro tournait déjà, on coupe avant d'écraser ses fichiers

  const oldDir = path.join(SESSIONS_DIR, tempId);
  const newDir = path.join(SESSIONS_DIR, newId);
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  if (fs.existsSync(newDir)) fs.rmSync(newDir, { recursive: true, force: true });
  fs.renameSync(oldDir, newDir);

  const sock = await startSession(newId, commands);
  scheduleDbSync(newId, 2000);
  return sock;
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
