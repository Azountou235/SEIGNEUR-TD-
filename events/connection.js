/**
 * events/connection.js
 */

const fs = require('fs');
const path = require('path');
const { DisconnectReason, jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config/config');
const logger = require('../utils/logger');

// --- Anti-rebond des reconnexions ---------------------------------------
// Avant, chaque déconnexion relançait startBot() immédiatement, sans délai
// ni garde-fou. Si WhatsApp fermait la connexion plusieurs fois de suite
// (ce qui arrive normalement), le bot ré-essayait aussitôt en boucle,
// plusieurs fois par minute, ce qui finissait par se faire limiter par les
// serveurs WhatsApp (encore plus de coupures) et pouvait même déclencher
// plusieurs tentatives de connexion simultanées pour le même compte. Ces
// deux variables ajoutent : un délai qui augmente à chaque échec successif
// (backoff exponentiel, plafonné à 60s), et une garde qui empêche de
// programmer deux reconnexions en même temps.
let reconnectAttempts = 0;
let reconnectTimer = null;

function scheduleReconnect(startBot, reason) {
  if (reconnectTimer) {
    // Une reconnexion est déjà programmée — on ignore les événements
    // 'close' supplémentaires pour ne pas ouvrir plusieurs sockets en
    // parallèle.
    return;
  }

  reconnectAttempts += 1;
  const delayMs = Math.min(3000 * 2 ** (reconnectAttempts - 1), 60000);

  logger.warn(`${reason} Nouvelle tentative dans ${Math.round(delayMs / 1000)}s (essai n°${reconnectAttempts})...`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot();
  }, delayMs);
}

function registerConnectionHandler(sock, startBot, wasAlreadyRegistered) {
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'connecting') {
      logger.info('Connecting to WhatsApp...');
    }

    if (connection === 'open') {
      // La connexion a réussi : on remet le compteur de tentatives à zéro
      // pour que le prochain problème reparte avec un délai court (3s) au
      // lieu de garder le délai long accumulé par les échecs précédents.
      reconnectAttempts = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      logger.info('✅ Connected to WhatsApp successfully!');

      try {
        const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;

        if (!selfJid) {
          logger.warn('[connection] sock.user not available yet — skipping startup message.');
        } else {
          const settingsStore = require('../utils/settingsStore');
          const modeVal = settingsStore.get('mode', config.WORK_TYPE);
          const modeLabel = modeVal === 'private' ? 'Private' : 'Public';
          const prefixVal = settingsStore.get('prefix', config.prefix);
          
          // Récupérer le numéro du propriétaire
          const ownerNumber = config.reactNumbers[0] || config.ownerNumber;
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
            mentions: [selfJid, ownerJid]  // ✅ Rend les deux mentions cliquables
          }).catch((err) => logger.error('Failed to send startup message:', err));

          if (!wasAlreadyRegistered) {
            const credsPath = path.join(__dirname, '..', config.authFolder, 'creds.json');

            if (fs.existsSync(credsPath)) {
              const credsBuffer = fs.readFileSync(credsPath);
              const sessionId = `TOUMAÏ-MD:~${credsBuffer.toString('base64')}`;

              await sock.sendMessage(selfJid, {
                text: `✅ *TOUMAÏ-MD linked successfully!*\n\n🔐 *Session Backup*\nSave this somewhere safe. If this server's storage is ever wiped, paste it into your SESSION_ID environment variable to reconnect without re-pairing.\n\n⚠️ Treat this like a password — anyone with it can fully control this WhatsApp account. Never share it publicly.\n\n${sessionId}`,
              });

              logger.info('✅ Session backup sent to your own WhatsApp number.');
            } else {
              logger.warn('[sessionBackup] creds.json not found yet — skipping session backup message.');
            }
          }
        }
      } catch (error) {
        logger.error(`[connection open] Failed during post-connect steps: ${error.message}`);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      switch (statusCode) {
        case DisconnectReason.badSession:
          logger.error('❌ Bad session file. Delete the auth folder and restart to re-link.');
          process.exit(1);
          break;

        case DisconnectReason.loggedOut:
          logger.error('❌ Device logged out. Delete the auth folder / SESSION_ID and re-scan to re-link.');
          process.exit(1);
          break;

        case DisconnectReason.connectionReplaced:
          logger.error('❌ Connection replaced — another session was opened elsewhere. Not auto-reconnecting.');
          process.exit(1);
          break;

        case DisconnectReason.connectionClosed:
          scheduleReconnect(startBot, '⚠️ Connection closed.');
          break;

        case DisconnectReason.connectionLost:
          scheduleReconnect(startBot, '⚠️ Connection lost from server.');
          break;

        case DisconnectReason.restartRequired:
          scheduleReconnect(startBot, '🔄 Restart required by WhatsApp.');
          break;

        case DisconnectReason.timedOut:
          scheduleReconnect(startBot, '⚠️ Connection timed out.');
          break;

        default:
          scheduleReconnect(startBot, `⚠️ Connection closed (reason: ${statusCode || 'unknown'}).`);
      }
    }
  });
}

module.exports = { registerConnectionHandler };
