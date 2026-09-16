const path = require('path');
const express = require('express');

const { bootCore, printBanner } = require('./index');
const { buildRouter: buildPairingRouter } = require('./pairing/pairingServer');
const logger = require('./utils/logger');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'web')));

const PORT = process.env.PORT || 3022;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

// Fallback SPA : toute autre route sert aussi index.html (sauf /api/pair,
// montée juste après avec ses propres routes).
app.get('/*splat', (req, res, next) => {
  if (req.path.startsWith('/api/pair')) return next();
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

async function start() {
  // Charge les commandes, relance les sessions déjà liées, migre un
  // éventuel ancien SESSION_ID — tout ce que fait index.js en mode
  // autonome, SAUF démarrer sa propre API de pairing sur un autre port
  // (on la monte ici, sur ce même serveur, pour n'avoir qu'un seul port
  // à exposer/rediriger depuis Vercel).
  const commands = await bootCore();

  app.use('/api/pair', buildPairingRouter(commands));

  app.listen(PORT, () => {
    logger.info(`🚀 Serveur démarré sur le port ${PORT}`);
    logger.info(`🌐 Panel web : http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  logger.error(`[server] Échec du démarrage: ${error.message}`);
  process.exit(1);
});

module.exports = app;
