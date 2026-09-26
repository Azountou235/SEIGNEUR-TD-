const path = require('path');
const express = require('express');

const { bootCore, printBanner } = require('./index');
const { buildRouter: buildPairingRouter } = require('./pairing/pairingServer');
const accessKeys = require('./utils/accessKeys');
const logger = require('./utils/logger');

const app = express();
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────
// Verrou d'accès au site — clés du type SEIGNEUR + 20 caractères mélangés.
//
// Les clés elles-mêmes sont générées et stockées "loin" du site (voir
// utils/accessKeys.js : data/accessKeys.json, un dossier jamais servi par
// express.static — seul web/ l'est, juste en dessous). Pour créer de
// nouvelles clés à distribuer :
//
//   node scripts/generateAccessKey.js         (1 clé)
//   node scripts/generateAccessKey.js 10      (10 clés)
//
// Tant qu'aucune clé valide n'a été saisie (cookie de session absent ou
// expiré), toute requête vers le site ou vers l'API de pairing tombe sur
// l'écran de verrouillage (web/lock.html) au lieu du panel réel.
// ─────────────────────────────────────────────────────────────────────────

const ACCESS_COOKIE = 'toumai_access';
// Seules ces deux routes doivent rester joignables SANS clé valide :
// l'écran de verrouillage lui-même, et l'endpoint qui vérifie la clé saisie.
const PUBLIC_PATHS = new Set(['/lock.html', '/api/access/verify']);

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;

  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  });

  return out;
}

app.get('/lock.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'lock.html'));
});

app.post('/api/access/verify', (req, res) => {
  const { key } = req.body || {};
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  const result = accessKeys.verifyKey(key, { ip });

  if (result.status === 'ok') {
    const maxAgeSec = Math.max(1, Math.floor((result.expiresAt - Date.now()) / 1000));
    res.setHeader(
      'Set-Cookie',
      `${ACCESS_COOKIE}=${result.token}; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}; Path=/`
    );
    logger.info(`[access] Nouvelle session ouverte depuis ${ip}.`);
    return res.json({ status: 'ok' });
  }

  if (result.status === 'used') {
    logger.warn(`[access] Tentative avec une clé déjà utilisée depuis ${ip}.`);
    return res.status(403).json({ status: 'used', error: 'Cette clé a déjà été utilisée.' });
  }

  if (result.status === 'locked') {
    return res.status(429).json({ status: 'locked', retryAfterMs: result.retryAfterMs });
  }

  logger.warn(`[access] Tentative avec une clé invalide depuis ${ip}.`);
  return res.status(403).json({ status: 'invalid', error: 'Clé invalide.' });
});

// Verrou effectif : tout ce qui est déclaré APRÈS ce middleware (le site
// statique, la page d'accueil, le fallback SPA, l'API de pairing) exige
// une session valide obtenue via une clé correcte.
app.use((req, res, next) => {
  if (PUBLIC_PATHS.has(req.path)) return next();

  const cookies = parseCookies(req);
  const token = cookies[ACCESS_COOKIE];

  if (accessKeys.verifySessionToken(token)) return next();

  // Requêtes API (fetch/JSON) -> réponse JSON propre plutôt qu'une page HTML.
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: "Accès verrouillé — clé d'accès requise." });
  }

  // Toute autre requête (page, asset...) tombe sur l'écran de verrouillage.
  return res.status(401).sendFile(path.join(__dirname, 'web', 'lock.html'));
});

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
