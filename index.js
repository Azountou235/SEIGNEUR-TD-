globalThis.crypto = require('node:crypto').webcrypto;
const path = require('path');
const fs = require('fs');
const figlet = require('figlet');
const chalk = require('chalk');

const config = require('./config/config');
const logger = require('./utils/logger');
const { loadCommands } = require('./utils/commandLoader');
const { fetchCore } = require('./utils/fetchCore');
const sessionManager = require('./utils/sessionManager');
const { buildRouter: buildPairingRouter } = require('./pairing/pairingServer');

const commandsPath = path.join(__dirname, 'commands');
let commands = {};

function printBanner() {
  console.log(
    chalk.green(
      figlet.textSync('TOUMAI-MD', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default',
      })
    )
  );
  console.log(chalk.cyan('🤖 TOUMAÏ-MD is starting up (mode multi-session)...'));
}

/**
 * Compatibilité avec l'ancien flux mono-session : si un SESSION_ID (env
 * var de l'ancienne version) est fourni et qu'aucune session multi ne
 * correspond encore, on le décode pour en extraire le numéro et on le
 * range sous sessions/<numéro>/auth/creds.json, comme s'il avait été lié
 * via le site. Purement une passerelle pour ne pas perdre un ancien lien
 * — le SESSION_ID n'est plus utilisé après ce premier démarrage.
 */
function migrateLegacySessionId() {
  if (!config.sessionId) return;

  try {
    const raw = config.sessionId.replace(/^TOUMAÏ-MD:~/, '');
    const buffer = Buffer.from(raw, 'base64');
    const creds = JSON.parse(buffer.toString('utf8'));
    const meId = creds?.me?.id;
    const sessionId = meId ? String(meId).split(':')[0].split('@')[0] : null;

    if (!sessionId) {
      logger.warn('[migrateLegacySessionId] Impossible de déterminer le numéro depuis SESSION_ID — ignoré.');
      return;
    }

    const credsPath = path.join(sessionManager.authDir(sessionId), 'creds.json');
    if (fs.existsSync(credsPath)) return; // déjà migré

    fs.mkdirSync(path.dirname(credsPath), { recursive: true });
    fs.writeFileSync(credsPath, buffer);
    logger.info(`✅ Ancien SESSION_ID migré vers la session multi ${sessionId}.`);
  } catch (error) {
    logger.error(`[migrateLegacySessionId] Échec: ${error.message}`);
  }
}

// Serveur HTTP séparé, exposant l'API de pairing par numéro (utilisée par
// le site web) — c'est désormais le SEUL moyen de faire apparaître un
// nouveau bot : plus de prompt de numéro en console, plus de mono-session.
function startPairingApi() {
  if (global.__pairingApiStarted) return;
  global.__pairingApiStarted = true;

  const express = require('express');
  const pairingApp = express();
  pairingApp.get('/', (req, res) => res.send('TOUMAI-MD pairing API is running'));
  pairingApp.use('/api/pair', buildPairingRouter(commands));

  const port = process.env.PAIRING_PORT || process.env.PORT || 3022;
  pairingApp.listen(port, () => {
    logger.info(`🌐 Pairing API en écoute sur le port ${port}`);
  });
}

process.on('uncaughtException', (error) => {
  logger.error(`[uncaughtException] ${error.stack || error.message}`);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`[unhandledRejection] ${reason}`);
});

async function bootCore() {
  printBanner();

  if (process.env.AUTO_UPDATE_COMMANDS === 'true') {
    await fetchCore();
  }

  commands = loadCommands(commandsPath);
  const { runClearCache } = require('./commands/clearcache');
  global.runClearCache = runClearCache;

  setInterval(() => {
    const results = global.runClearCache(commands);
    logger.info(`[clearcache] Automatic cache clear: ${JSON.stringify(results)}`);
  }, 6 * 60 * 60 * 1000);

  migrateLegacySessionId();
  await sessionManager.loadAllSessions(commands);

  return commands;
}

async function boot() {
  await bootCore();
  startPairingApi();
}

module.exports = { boot, bootCore, printBanner, commands: () => commands };

if (require.main === module) {
  const startupDelay = parseInt(process.env.TOUMAI_RESTART_DELAY_MS || '0', 10);
  setTimeout(boot, startupDelay);
}
