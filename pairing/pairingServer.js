/**
 * pairing/pairingServer.js
 *
 * API HTTP utilisée par le site (web/script.js) pour lier un numéro.
 *
 * Multi-session : contrairement à l'ancienne version, une liaison réussie
 * ICI EST directement le vrai bot qui tourne en continu — pas une session
 * jetable qu'on ferme 5s après pour en extraire un SESSION_ID à recopier
 * ailleurs. Chaque numéro devient sa propre session persistante, gérée par
 * utils/sessionManager.js, avec ses propres réglages.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');

const sessionManager = require('../utils/sessionManager');
const logger = require('../utils/logger');

const REQUEST_TTL_MS = 3 * 60 * 1000; // 3 min pour scanner/entrer le code avant expiration côté site
const ALLOWED_ORIGIN = process.env.PAIRING_ALLOWED_ORIGIN || '*';

// id (uuid, juste pour le polling du site) -> { status, qr, code, sessionId, message }
const pendingRequests = new Map();

function cleanupPending(id) {
  const pending = pendingRequests.get(id);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingRequests.delete(id);
}

function readSessionBackup(sessionId) {
  const credsPath = path.join(sessionManager.authDir(sessionId), 'creds.json');
  if (!fs.existsSync(credsPath)) return null;
  const raw = fs.readFileSync(credsPath);
  return 'TOUMAÏ-MD:~' + raw.toString('base64');
}

async function startPairingFlow({ method, phone }, commands) {
  const id = crypto.randomUUID();
  const pending = { status: 'starting', qr: null, code: null, sessionId: null, message: null, timeout: null };
  pendingRequests.set(id, pending);

  pending.timeout = setTimeout(() => {
    if (pending.status !== 'connected') {
      logger.warn(`[pairingApi:${id}] Timeout de 3 min sans connexion (dernier statut: ${pending.status}).`);
      cleanupPending(id);
    }
  }, REQUEST_TTL_MS);

  if (method === 'pairing') {
    // Le numéro EST l'ID de session dès le départ, pas besoin de dossier
    // temporaire ni de renommage plus tard.
    sessionManager.startSession(phone, commands, {
      phoneNumber: phone,
      onPairingCode: (code) => {
        pending.code = code;
        pending.status = 'pairing_code';
        logger.info(`[pairingApi:${id}] Code généré pour ${phone}: ${code}`);
      },
      onOpen: () => {
        pending.status = 'connected';
        pending.sessionId = readSessionBackup(phone);
        logger.info(`[pairingApi:${id}] ✅ Session ${phone} connectée et active en continu.`);
        // On ne ferme plus rien : le socket reste vivant en tant que bot réel.
        setTimeout(() => cleanupPending(id), 5000);
      },
      onClose: (lastDisconnect) => {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (pending.status === 'connected') return;
        logger.warn(`[pairingApi:${id}] Échec liaison ${phone} — statusCode=${statusCode}`);
        pending.status = 'error';
        pending.message = statusCode === 401 ? 'Code refusé / déconnecté' : 'Connexion fermée';
      },
    }).catch((error) => {
      pending.status = 'error';
      pending.message = 'Numéro invalide ou refusé par WhatsApp';
      logger.error(`[pairingApi:${id}] ${error.message}`);
    });

    return id;
  }

  // Méthode QR : ID temporaire tant qu'on ne connaît pas le numéro, puis
  // "réclamé" (claimSessionId) sous le vrai numéro une fois connecté.
  const tempId = `qr-temp-${id}`;
  sessionManager.startSession(tempId, commands, {
    onQr: async (qr) => {
      try {
        pending.qr = await QRCode.toDataURL(qr, { width: 300, margin: 1 });
        pending.status = 'qr';
      } catch (_) {
        pending.status = 'error';
        pending.message = 'Erreur génération QR';
      }
    },
    onOpen: async (sock) => {
      try {
        const realNumber = sock.user?.id?.split(':')[0]?.split('@')[0];
        if (!realNumber) throw new Error('Numéro introuvable après connexion');

        await sessionManager.claimSessionId(tempId, realNumber, commands);

        pending.status = 'connected';
        pending.sessionId = readSessionBackup(realNumber);
        logger.info(`[pairingApi:${id}] ✅ Session ${realNumber} (QR) connectée et active en continu.`);
      } catch (error) {
        pending.status = 'error';
        pending.message = 'Connecté mais bascule vers la session permanente impossible';
        logger.error(`[pairingApi:${id}] ${error.message}`);
      } finally {
        setTimeout(() => cleanupPending(id), 5000);
      }
    },
    onClose: (lastDisconnect) => {
      if (pending.status === 'connected') return;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      pending.status = 'error';
      pending.message = statusCode === 401 ? 'QR refusé / expiré' : 'Connexion fermée';
    },
  }).catch((error) => {
    pending.status = 'error';
    pending.message = error.message;
  });

  return id;
}

function buildRouter(commands) {
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
        const id = await startPairingFlow({ method, phone: clean }, commands);
        return res.json({ id });
      }

      const id = await startPairingFlow({ method }, commands);
      return res.json({ id });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/status/:id', (req, res) => {
    const pending = pendingRequests.get(req.params.id);
    if (!pending) return res.status(404).json({ status: 'expired' });

    res.json({
      status: pending.status,
      qr: pending.qr || undefined,
      code: pending.code || undefined,
      sessionId: pending.sessionId || undefined,
      message: pending.message || undefined,
    });
  });

  return router;
}

module.exports = { buildRouter };
