/**
 * events/connection.js
 *
 * ⚠️ Multi-session : ce fichier tourne pour plusieurs numéros WhatsApp en
 * même temps dans le même process. L'état de reconnexion est donc rangé
 * PAR SESSION (Map ci-dessous), jamais partagé entre numéros.
 *
 * CORRECTIFS PAR RAPPORT À L'ANCIENNE VERSION
 * -------------------------------------------
 * 1. Le compteur de reconnexion vivait dans la closure de
 *    registerConnectionHandler : or startSession() recrée un handler à
 *    chaque reconnexion, donc le compteur repartait TOUJOURS à 0 (backoff
 *    jamais appliqué, retentatives toutes les ~3s). L'état est maintenant
 *    persistant par session, et remis à 0 seulement après 60s de connexion
 *    stable.
 * 2. connectionReplaced (440) et badSession (500) SUPPRIMAIENT tout le
 *    dossier de la session (creds comprises) → après un redémarrage /
 *    déploiement avec deux instances qui se chevauchent, ou un simple 500
 *    transitoire de WhatsApp, la session était détruite définitivement.
 *    Désormais : on réessaie avec délai, et en dernier recours la session
 *    est SUSPENDUE (fichiers conservés), jamais effacée. Seul loggedOut
 *    (401, creds réellement invalides) retire la session.
 * 3. Un timer de reconnexion en attente pouvait relancer une session déjà
 *    arrêtée/supprimée : annulation propre via cancelReconnect().
 * 4. Le message "En ligne" (et surtout le backup de session contenant les
 *    creds en clair) était renvoyé à CHAQUE reconnexion : maintenant une
 *    seule fois par process et par session.
 */

const fs = require('fs');
const path = require('path');
const { DisconnectReason, jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config/config');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────
// File d'attente globale de reconnexion — PARTAGÉE par toutes les sessions.
// Garantit un espacement minimum réel (+ jitter) entre deux connexions,
// tous numéros confondus, pour ne pas ressembler à une "bot farm".
// ─────────────────────────────────────────────────────────────────────────
const MIN_GLOBAL_RECONNECT_GAP_MS = 1500;
let reconnectChainTail = Promise.resolve();

function queueGlobalReconnect(fn) {
  const run = () =>
    new Promise((resolve) => {
      const jitter = Math.random() * 1500;
      setTimeout(resolve, MIN_GLOBAL_RECONNECT_GAP_MS + jitter);
    }).then(fn);

  reconnectChainTail = reconnectChainTail.catch(() => {}).then(run);
  return reconnectChainTail;
}

// ─────────────────────────────────────────────────────────────────────────
// État de reconnexion PERSISTANT par session
// ─────────────────────────────────────────────────────────────────────────
// sessionId -> { attempts, timer, stableTimer, generation, replacedCount, badSessionCount }
const sessionStates = new Map();

// Messages à n'envoyer qu'une fois par process et par session.
const startupNotified = new Set();
const backupSent = new Set();

const STABLE_AFTER_MS = 60 * 1000;
const REPLACED_RETRY_DELAY_MS = 90 * 1000;
const MAX_REPLACED_RETRIES = 3;
const MAX_BAD_SESSION_RETRIES = 5;

function getState(sessionId) {
  let st = sessionStates.get(sessionId);
  if (!st) {
    st = {
      attempts: 0,
      timer: null,
      stableTimer: null,
      generation: 0,
      replacedCount: 0,
      badSessionCount: 0,
    };
    sessionStates.set(sessionId, st);
  }
  return st;
}

/** Annule toute reconnexion programmée (timer + tâche déjà en file). */
function cancelReconnect(sessionId) {
  const st = sessionStates.get(sessionId);
  if (!st) return;
  if (st.timer) {
    clearTimeout(st.timer);
    st.timer = null;
  }
  if (st.stableTimer) {
    clearTimeout(st.stableTimer);
    st.stableTimer = null;
  }
  // Invalide aussi une éventuelle tâche déjà placée dans la file globale.
  st.generation += 1;
}

/** Oublie complètement une session (suppression / logout). */
function forgetSession(sessionId) {
  cancelReconnect(sessionId);
  sessionStates.delete(sessionId);
}

function isReconnectPending(sessionId) {
  return !!sessionStates.get(sessionId)?.timer;
}

function scheduleReconnect(sessionId, startBot, reason, { fixedDelayMs } = {}) {
  const st = getState(sessionId);
  if (st.timer) return;

  let delayMs;
  if (typeof fixedDelayMs === 'number') {
    delayMs = fixedDelayMs;
  } else {
    st.attempts += 1;
    const cap = st.attempts > 8 ? 120000 : 60000;
    const baseDelay = Math.min(3000 * 2 ** (st.attempts - 1), cap);
    const jitterFactor = 0.7 + Math.random() * 0.6; // 0.7x à 1.3x
    delayMs = Math.round(baseDelay * jitterFactor);
  }

  const generation = st.generation;

  logger.warn(
    `[${sessionId}] ${reason} Nouvelle tentative dans ${Math.round(delayMs / 1000)}s (essai n°${st.attempts})...`
  );

  st.timer = setTimeout(() => {
    st.timer = null;

    queueGlobalReconnect(async () => {
      // La session a été arrêtée / relancée / supprimée entre-temps.
      if (st.generation !== generation) return;
      await startBot();
    }).catch((error) => {
      // startBot() est async : sans ce catch, une erreur pendant CE
      // redémarrage laissait la session morte en silence.
      logger.error(`[${sessionId}] Échec du redémarrage: ${error.message}`);
      scheduleReconnect(sessionId, startBot, '🔄 Nouvelle tentative après échec de redémarrage.');
    });
  }, delayMs);
}

function registerConnectionHandler(sock, startBot, wasAlreadyRegistered, sessionId, onFatal) {
  const st = getState(sessionId);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'connecting') {
      logger.info(`[${sessionId}] Connecting to WhatsApp...`);
    }

    if (connection === 'open') {
      if (st.timer) {
        clearTimeout(st.timer);
        st.timer = null;
      }
      if (st.stableTimer) clearTimeout(st.stableTimer);
      // On ne remet les compteurs à 0 qu'après une connexion STABLE : une
      // session qui s'ouvre puis retombe aussitôt garde son backoff.
      st.stableTimer = setTimeout(() => {
        st.attempts = 0;
        st.replacedCount = 0;
        st.badSessionCount = 0;
        st.stableTimer = null;
      }, STABLE_AFTER_MS);

      logger.info(`[${sessionId}] ✅ Connected to WhatsApp successfully!`);

      try {
        const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;

        if (!selfJid) {
          logger.warn(`[${sessionId}] sock.user not available yet — skipping startup message.`);
        } else {
          // Message de statut : UNE SEULE FOIS par process et par session
          // (avant : renvoyé à chaque reconnexion, donc spam + trafic
          // inutile vers WhatsApp quand le réseau est instable).
          if (!startupNotified.has(sessionId)) {
            startupNotified.add(sessionId);

            const settingsStore = require('../utils/settingsStore');
            const modeVal = settingsStore.get('mode', config.WORK_TYPE);
            const modeLabel = modeVal === 'private' ? 'Private' : 'Public';
            const prefixVal = settingsStore.get('prefix', config.prefix);

            const ownerNumber = config.reactNumbers[0] || config.ownerNumber || sessionId;
            const ownerJid = ownerNumber.includes('@') ? ownerNumber : `${ownerNumber}@s.whatsapp.net`;

            const selfNumber = selfJid.split('@')[0];

            const statusBox = `╭━━━ ⚡ 𝗧𝗢𝗨𝗠𝗔𝗜̈ - 𝗠𝗗 🇹🇩 ━━━╮
│   👨‍💼𝗨𝘁𝗶𝗹𝗶𝘀𝗮𝘁𝗲𝘂𝗿 : @${selfNumber}
│  💎 𝗩𝗲𝗿𝘀𝗶𝗼𝗻  : 1.0.0
│  🟢 𝗦𝘁𝗮𝘁𝘂𝘁   : En ligne
│  🌐 𝗠𝗼𝗱𝗲     : ${modeLabel}
│  🎯 𝗣𝗿𝗲́𝗳𝗶𝘅𝗲   : [ ${prefixVal} ]
│  👑 𝗦𝘂𝗽𝗲𝗿 𝗔𝗱𝗺𝗶𝗻 : ${ownerNumber}
│  
╰━━━ ⚙️ 𝗦𝘆𝘀𝘁𝗲̀𝗺𝗲 𝗢𝗽𝗲́𝗿𝗮𝘁𝗶𝗼𝗻𝗻𝗲𝗹 ━━━╯`;

            await sock
              .sendMessage(selfJid, {
                text: statusBox,
                mentions: [selfJid, ownerJid],
              })
              .catch((err) => logger.error(`[${sessionId}] Failed to send startup message: ${err?.message || err}`));
          }

          if (!wasAlreadyRegistered && !backupSent.has(sessionId)) {
            backupSent.add(sessionId);

            const credsPath = path.join(__dirname, '..', 'sessions', sessionId, 'auth', 'creds.json');

            if (fs.existsSync(credsPath)) {
              const credsBuffer = fs.readFileSync(credsPath);
              const sessionBackup = `TOUMAÏ-MD:~${credsBuffer.toString('base64')}`;

              await sock.sendMessage(selfJid, {
                text: `✅ *TOUMAÏ-MD linked successfully!*\n\n🔐 *Session Backup*\nSave this somewhere safe. If this server's storage is ever wiped, it lets you restore this exact session.\n\n⚠️ Treat this like a password — anyone with it can fully control this WhatsApp account. Never share it publicly.\n\n${sessionBackup}`,
              });

              logger.info(`[${sessionId}] ✅ Session backup sent to your own WhatsApp number.`);
            } else {
              logger.warn(`[${sessionId}] creds.json not found yet — skipping session backup message.`);
            }
          }
        }
      } catch (error) {
        logger.error(`[${sessionId}] [connection open] Failed during post-connect steps: ${error.message}`);
      }
    }

    if (connection === 'close') {
      if (st.stableTimer) {
        clearTimeout(st.stableTimer);
        st.stableTimer = null;
      }

      const statusCode = lastDisconnect?.error?.output?.statusCode;

      switch (statusCode) {
        case DisconnectReason.loggedOut:
          // Seul cas où les creds sont réellement invalides côté WhatsApp.
          logger.error(`[${sessionId}] ❌ Device logged out. Session retirée — re-pairing nécessaire.`);
          onFatal?.('loggedOut');
          break;

        case DisconnectReason.connectionReplaced:
          // Une AUTRE instance utilise les mêmes creds (ex. ancien process
          // pas encore arrêté pendant un redéploiement). On ne détruit
          // plus rien : on laisse l'autre instance se terminer puis on
          // réessaie, quelques fois seulement pour éviter un duel infini.
          st.replacedCount += 1;
          if (st.replacedCount > MAX_REPLACED_RETRIES) {
            logger.error(`[${sessionId}] ❌ Connexion remplacée ${st.replacedCount} fois de suite — session suspendue (fichiers conservés).`);
            onFatal?.('connectionReplaced');
          } else {
            scheduleReconnect(sessionId, startBot, '⚠️ Connection replaced (autre instance active ?).', {
              fixedDelayMs: REPLACED_RETRY_DELAY_MS,
            });
          }
          break;

        case DisconnectReason.badSession:
          // Un 500 peut être transitoire côté WhatsApp : on ne supprime
          // plus la session au premier coup.
          st.badSessionCount += 1;
          if (st.badSessionCount > MAX_BAD_SESSION_RETRIES) {
            logger.error(`[${sessionId}] ❌ badSession ${st.badSessionCount} fois de suite — session suspendue (fichiers conservés).`);
            onFatal?.('badSession');
          } else {
            scheduleReconnect(sessionId, startBot, '⚠️ Bad session / erreur serveur (500).');
          }
          break;

        case DisconnectReason.restartRequired:
          // Normal juste après un pairing (515) : reconnexion rapide, sans
          // compter comme un échec.
          scheduleReconnect(sessionId, startBot, '🔄 Restart required by WhatsApp.', { fixedDelayMs: 1000 });
          break;

        case DisconnectReason.connectionClosed:
          scheduleReconnect(sessionId, startBot, '⚠️ Connection closed.');
          break;

        case DisconnectReason.connectionLost:
          scheduleReconnect(sessionId, startBot, '⚠️ Connection lost from server.');
          break;

        case DisconnectReason.timedOut:
          scheduleReconnect(sessionId, startBot, '⚠️ Connection timed out.');
          break;

        default:
          scheduleReconnect(sessionId, startBot, `⚠️ Connection closed (reason: ${statusCode || 'unknown'}).`);
      }
    }
  });
}

module.exports = {
  registerConnectionHandler,
  cancelReconnect,
  forgetSession,
  isReconnectPending,
};
