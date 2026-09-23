/**
 * events/connection.js
 *
 * ⚠️ Multi-session : ce fichier tourne potentiellement pour plusieurs
 * numéros WhatsApp en même temps dans le même process. Toutes les
 * variables d'état (compteur de reconnexion, timer...) doivent donc être
 * propres à CHAQUE appel de registerConnectionHandler et non partagées au
 * niveau du module — sinon les tentatives de reconnexion d'un numéro
 * bloqueraient/perturberaient celles d'un autre. De même, on ne fait plus
 * jamais process.exit() sur une erreur fatale : ça couperait TOUS les
 * bots connectés sur ce serveur, pas juste celui qui a un problème.
 */

const fs = require('fs');
const path = require('path');
const { DisconnectReason, jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config/config');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────
// File d'attente globale de reconnexion — PARTAGÉE par toutes les sessions
// du process (multi-numéros).
//
// Avant ce correctif, chaque session programmait sa reconnexion avec un
// délai purement déterministe (3s, 6s, 12s, 24s...). Ça fonctionne pour 1
// ou 2 numéros, mais dès qu'un incident touche plusieurs sessions en même
// temps (redémarrage du process, coupure réseau côté serveur, hoquet
// WhatsApp...), TOUTES les sessions relancent leur socket EXACTEMENT au
// même instant, depuis la même IP. Vu de WhatsApp, ça ressemble à une
// rafale de connexions coordonnées type "bot farm", et au bout de
// quelques heures ça finit par se traduire par des sessions coupées ou
// bannies en cascade — c'est précisément le symptôme observé à partir de
// 4 sessions simultanées.
//
// La correction : une file d'attente globale qui garantit un espacement
// minimum réel entre deux tentatives de connexion, tous numéros confondus,
// plus un jitter aléatoire (au lieu d'un délai identique pour tout le
// monde). Chaque session garde son propre backoff exponentiel (elle ne
// retente pas plus vite qu'avant), mais l'INSTANT effectif où le socket se
// rouvre est désormais désynchronisé des autres sessions. Ce mécanisme
// scale nativement à 200 sessions : plus il y a de numéros, plus la file
// les étale dans le temps automatiquement.
const MIN_GLOBAL_RECONNECT_GAP_MS = 1500;
let reconnectChainTail = Promise.resolve();

function queueGlobalReconnect(fn) {
  const run = () =>
    new Promise((resolve) => {
      const jitter = Math.random() * 1500; // 0–1.5s de hasard en plus du gap fixe
      setTimeout(resolve, MIN_GLOBAL_RECONNECT_GAP_MS + jitter);
    }).then(fn);

  // On chaîne sur la queue globale existante, en avalant toute erreur
  // précédente pour ne jamais bloquer les sessions suivantes si l'une
  // d'elles échoue à se reconnecter.
  reconnectChainTail = reconnectChainTail.catch(() => {}).then(run);
  return reconnectChainTail;
}

function registerConnectionHandler(sock, startBot, wasAlreadyRegistered, sessionId, onFatal) {
  // État de reconnexion propre à CETTE session (fermé dans la closure de
  // cet appel, donc jamais partagé avec un autre numéro).
  let reconnectAttempts = 0;
  let reconnectTimer = null;

  function scheduleReconnect(reason) {
    if (reconnectTimer) return;

    reconnectAttempts += 1;
    // Passé un certain nombre d'essais consécutifs, on élargit le plafond
    // (2 min au lieu de 60s) : ça évite de marteler WhatsApp toutes les
    // 60s pendant une panne prolongée, et ça réduit franchement la
    // fréquence des tentatives visibles dans les logs.
    const cap = reconnectAttempts > 8 ? 120000 : 60000;
    // Jitter de ±30% sur le backoff exponentiel : même une seule session
    // qui retente plusieurs fois de suite ne tombe plus sur des délais
    // parfaitement ronds et prévisibles, ce qui aide encore à désynchro-
    // niser plusieurs sessions redémarrées au même moment (ex. reboot du
    // serveur avec 200 sessions relancées d'affilée).
    const baseDelay = Math.min(3000 * 2 ** (reconnectAttempts - 1), cap);
    const jitterFactor = 0.7 + Math.random() * 0.6; // entre 0.7x et 1.3x
    const delayMs = Math.round(baseDelay * jitterFactor);

    logger.warn(`[${sessionId}] ${reason} Nouvelle tentative dans ${Math.round(delayMs / 1000)}s (essai n°${reconnectAttempts})...`);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      // On ne rappelle plus startBot() directement ici : on passe par la
      // file d'attente globale (voir plus haut) pour garantir un
      // espacement minimum avec les reconnexions des AUTRES sessions,
      // même si leurs timers respectifs arrivent à échéance au même
      // moment.
      //
      // startBot() est async : sans ce .catch, une erreur pendant CE
      // redémarrage précis (hoquet réseau, fs, Baileys...) ne relançait
      // plus jamais rien — on ne repassait jamais dans
      // registerConnectionHandler avec un scheduleReconnect neuf, donc le
      // bot restait mort en silence. Le process.on('unhandledRejection')
      // global (index.js) se contentait de logguer l'erreur, sans rien
      // reprogrammer. C'est précisément le "le bot s'arrête au
      // redémarrage" observé : on réessaie nous-mêmes avec le même
      // backoff au lieu de laisser cette session mourir définitivement.
      queueGlobalReconnect(() => Promise.resolve(startBot())).catch((error) => {
        logger.error(`[${sessionId}] Échec du redémarrage: ${error.message}`);
        scheduleReconnect('🔄 Nouvelle tentative après échec de redémarrage.');
      });
    }, delayMs);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'connecting') {
      logger.info(`[${sessionId}] Connecting to WhatsApp...`);
    }

    if (connection === 'open') {
      reconnectAttempts = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      logger.info(`[${sessionId}] ✅ Connected to WhatsApp successfully!`);

      try {
        const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;

        if (!selfJid) {
          logger.warn(`[${sessionId}] sock.user not available yet — skipping startup message.`);
        } else {
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

          await sock.sendMessage(selfJid, {
            text: statusBox,
            mentions: [selfJid, ownerJid],
          }).catch((err) => logger.error(`[${sessionId}] Failed to send startup message:`, err));

          if (!wasAlreadyRegistered) {
            // authFolder est maintenant sessions/<sessionId>/auth (voir
            // sessionManager.js), plus le dossier global unique d'avant.
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
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      switch (statusCode) {
        case DisconnectReason.badSession:
          logger.error(`[${sessionId}] ❌ Bad session file. Removing this session — re-pairing required.`);
          onFatal?.('badSession');
          break;

        case DisconnectReason.loggedOut:
          logger.error(`[${sessionId}] ❌ Device logged out. Removing this session — re-pairing required.`);
          onFatal?.('loggedOut');
          break;

        case DisconnectReason.connectionReplaced:
          logger.error(`[${sessionId}] ❌ Connection replaced — another session was opened elsewhere. Not auto-reconnecting.`);
          onFatal?.('connectionReplaced');
          break;

        case DisconnectReason.connectionClosed:
          scheduleReconnect('⚠️ Connection closed.');
          break;

        case DisconnectReason.connectionLost:
          scheduleReconnect('⚠️ Connection lost from server.');
          break;

        case DisconnectReason.restartRequired:
          scheduleReconnect('🔄 Restart required by WhatsApp.');
          break;

        case DisconnectReason.timedOut:
          scheduleReconnect('⚠️ Connection timed out.');
          break;

        default:
          scheduleReconnect(`⚠️ Connection closed (reason: ${statusCode || 'unknown'}).`);
      }
    }
  });
}

module.exports = { registerConnectionHandler };
