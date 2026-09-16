const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const SESSIONS_DIR = path.join(__dirname, '..', 'pairing_sessions');
const SESSION_TTL_MS = 3 * 60 * 1000; // 3 min pour scanner/entrer le code avant expiration
// Mets ici (ou dans une variable d'env PAIRING_ALLOWED_ORIGIN sur le panel)
// le domaine exact de ton site Vercel, ex: https://seigneur-td.vercel.app
const ALLOWED_ORIGIN = process.env.PAIRING_ALLOWED_ORIGIN || '*';

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// id -> { status, qr, code, sessionId, message, sock, dir, timeout }
const sessions = new Map();

function cleanupSession(id) {
  const session = sessions.get(id);
  if (!session) return;
  clearTimeout(session.timeout);
  try {
    session.sock?.ev?.removeAllListeners();
    session.sock?.end?.(new Error('cleanup'));
  } catch (_) {}
  fs.rm(session.dir, { recursive: true, force: true }, () => {});
  sessions.delete(id);
}

// Codes après lesquels WhatsApp attend juste une reconnexion avec les
// mêmes creds (déjà sauvegardées sur disque) pour finaliser la liaison —
// ce ne sont PAS des échecs. 515 = "restart required", typiquement envoyé
// juste après l'acceptation d'un pairing code. 428 = connexion perdue
// pendant le handshake, souvent temporaire.
const RECOVERABLE_CODES = new Set([515, 428]);

async function startPairing({ method, phone }) {
  const id = crypto.randomUUID();
  const dir = path.join(SESSIONS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });

  const session = {
    status: 'starting',
    qr: null,
    code: null,
    sessionId: null,
    message: null,
    sock: null,
    dir,
    timeout: null,
  };
  sessions.set(id, session);

  let pairingRequested = false;
  let reconnectAttempts = 0;

  console.log(`[pairing:${id}] Session démarrée (method=${method}${phone ? `, phone=${phone}` : ''})`);

  async function connectSocket() {
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const { version } = await fetchLatestBaileysVersion();
    const baileysLogger = pino({ level: 'silent' });

    const sock = makeWASocket({
      version,
      auth: state,
      logger: baileysLogger,
      printQRInTerminal: false,
      // Mêmes réglages que index.js — évitent l'erreur 428 "Connection Closed"
      // pendant la demande de pairing code.
      defaultQueryTimeoutMs: 90000,
      connectTimeoutMs: 90000,
      keepAliveIntervalMs: 15000,
      retryRequestDelayMs: 1000,
      browser: ['Ubuntu', 'Chrome', '120.0.6099.130'],
    });

    session.sock = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update;

      console.log(`[pairing:${id}] connection.update -> connection=${connection}${qr ? ', qr reçu' : ''}`);

      if (qr && method === 'qr') {
        try {
          session.qr = await QRCode.toDataURL(qr, { width: 300, margin: 1 });
          session.status = 'qr';
        } catch (_) {
          session.status = 'error';
          session.message = 'Erreur génération QR';
        }
      }

      if (connection === 'connecting' && method === 'pairing' && phone && !pairingRequested) {
        pairingRequested = true;
        console.log(`[pairing:${id}] Demande du code de pairing pour ${phone}...`);
        try {
          await new Promise((r) => setTimeout(r, 500));
          const code = await sock.requestPairingCode(phone, 'SEIGNEUR').catch((err) => {
            console.log(`[pairing:${id}] Code custom "SEIGNEUR" refusé (${err.message}), fallback code standard.`);
            return sock.requestPairingCode(phone);
          });
          session.code = code.match(/.{1,4}/g)?.join('-') || code;
          session.status = 'pairing_code';
          console.log(`[pairing:${id}] Code généré: ${session.code} — en attente que le téléphone le confirme...`);
        } catch (error) {
          session.status = 'error';
          session.message = 'Numéro invalide ou refusé par WhatsApp';
          console.log(`[pairing:${id}] ÉCHEC demande de code: ${error.message}`);
        }
      }

      if (connection === 'open') {
        console.log(`[pairing:${id}] connection=open — la liaison a réussi côté WhatsApp !`);
        try {
          const raw = fs.readFileSync(path.join(dir, 'creds.json'));
          const sessionString = 'TOUMAÏ-MD:~' + raw.toString('base64');
          session.status = 'connected';
          session.sessionId = sessionString;

          // Envoie aussi le SESSION_ID en message privé au numéro qui vient
          // de se lier, comme filet de sécurité s'il ferme la page trop vite.
          try {
            const jid = sock.user?.id;
            if (jid) {
              await sock.sendMessage(jid, {
                text:
                  `👑 *TOUMAI-MD — Session liée*\n\n` +
                  `Voici ton SESSION_ID, à coller dans la variable d'environnement SESSION_ID de ton déploiement :\n\n` +
                  `${sessionString}\n\n` +
                  `⚠️ Ne le partage avec personne, il donne un accès complet à ce compte WhatsApp.`,
              });
            }
          } catch (_) {
            // Pas grave si l'envoi échoue — le site affiche déjà le SESSION_ID.
          }
        } catch (_) {
          session.status = 'error';
          session.message = 'Connecté mais lecture de la session impossible';
        } finally {
          // On laisse 5s pour que le front récupère bien le sessionId, puis
          // on ferme et supprime le dossier temporaire (le SESSION_ID exporté
          // suffit pour redéployer ailleurs).
          setTimeout(() => cleanupSession(id), 5000);
        }
      }

      if (connection === 'close' && session.status !== 'connected') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`[pairing:${id}] connection=close — statusCode=${statusCode}, raison=${lastDisconnect?.error?.message}`);

        // 515 (restart required) et 428 (connexion perdue) arrivent
        // normalement juste après l'acceptation du code par le téléphone —
        // les creds sont déjà sauvegardées sur disque (creds.update a déjà
        // tourné), donc on reconnecte avec cette même session au lieu de
        // tout annuler. On limite à 3 tentatives pour éviter une boucle
        // infinie si le vrai problème est ailleurs.
        if (RECOVERABLE_CODES.has(statusCode) && reconnectAttempts < 3) {
          reconnectAttempts += 1;
          console.log(`[pairing:${id}] Reconnexion ${reconnectAttempts}/3 suite au code ${statusCode}...`);
          try {
            sock.ev.removeAllListeners();
          } catch (_) {}
          setTimeout(() => connectSocket().catch((err) => {
            session.status = 'error';
            session.message = 'Erreur pendant la reconnexion';
            console.log(`[pairing:${id}] Échec reconnexion: ${err.message}`);
            cleanupSession(id);
          }), 800);
          return;
        }

        session.status = 'error';
        session.message = statusCode === 401 ? 'Code refusé / déconnecté' : 'Connexion fermée';
        cleanupSession(id);
      }
    });
  }

  await connectSocket();

  session.timeout = setTimeout(() => {
    if (session.status !== 'connected') {
      console.log(`[pairing:${id}] Timeout de 3 min atteint sans connexion réussie (dernier statut: ${session.status}).`);
      cleanupSession(id);
    }
  }, SESSION_TTL_MS);

  return id;
}

function buildRouter() {
  const router = express.Router();

  router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  router.use(express.json());

  // body: { method: 'qr' | 'pairing', phone?: '23591234567' }
  router.post('/start', async (req, res) => {
    try {
      const { method, phone } = req.body || {};

      if (method !== 'qr' && method !== 'pairing') {
        return res.status(400).json({ error: 'method doit être "qr" ou "pairing"' });
      }

      if (method === 'pairing') {
        const clean = String(phone || '').replace(/\D/g, '');
        if (!/^\d{8,15}$/.test(clean)) {
          return res.status(400).json({ error: "Numéro invalide (chiffres uniquement, avec l'indicatif pays)" });
        }
        const id = await startPairing({ method, phone: clean });
        return res.json({ id });
      }

      const id = await startPairing({ method });
      return res.json({ id });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/status/:id', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ status: 'expired' });

    res.json({
      status: session.status,
      qr: session.qr || undefined,
      code: session.code || undefined,
      sessionId: session.sessionId || undefined,
      message: session.message || undefined,
    });
  });

  return router;
}

module.exports = { buildRouter };
