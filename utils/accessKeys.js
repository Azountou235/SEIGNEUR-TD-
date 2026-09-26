/**
 * utils/accessKeys.js
 *
 * Verrou d'accès au site web (panel), par clés du type
 * SEIGNEUR + 20 caractères mélangés (ex: SEIGNEURA7K92MZQ4X8B1C6D3E5F).
 *
 * Principes :
 *  - Les clés sont stockées "loin" du site : dans data/accessKeys.json,
 *    un dossier qui n'est JAMAIS servi par express.static (seul web/ est
 *    exposé publiquement — voir server.js). Impossible d'y accéder via une
 *    URL du site.
 *  - On ne stocke jamais la clé en clair, seulement son empreinte SHA-256.
 *    Même un accès direct au fichier ne permet donc pas de retrouver les
 *    clés valides.
 *  - Chaque clé n'est utilisable qu'UNE seule fois. Trois résultats
 *    possibles à la vérification : 'ok' (bonne clé, jamais utilisée),
 *    'used' (clé correcte mais déjà consommée), 'invalid' (clé inconnue /
 *    mal formée).
 *  - Une fois une clé acceptée, on ouvre une session (token aléatoire,
 *    posé en cookie httpOnly par server.js) valable 24h, pour ne pas
 *    redemander la clé à chaque page vue.
 *  - Anti-bruteforce basique : trop d'essais échoués depuis une même IP
 *    déclenche un blocage temporaire.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Dossier "loin du site" : sibling de web/ et public/, jamais monté par
// express.static (voir server.js — seul path.join(__dirname, 'web') l'est).
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'accessKeys.json');

const KEY_PREFIX = 'SEIGNEUR';
const KEY_RANDOM_LENGTH = 20;
// Alphabet sans caractères ambigus (pas de 0/O ni 1/I) pour que les clés
// notées à la main restent lisibles sans confusion possible.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h de session après une clé validée

const MAX_FAILED_ATTEMPTS = 10;
const FAILED_WINDOW_MS = 5 * 60 * 1000; // 5 min
const LOCKOUT_MS = 15 * 60 * 1000; // 15 min de blocage après trop d'échecs

function emptyStore() {
  return { keys: {}, sessions: {} };
}

function loadStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return emptyStore();
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return { keys: raw.keys || {}, sessions: raw.sessions || {} };
  } catch (error) {
    console.error('[accessKeys] Lecture du store impossible, on repart de zéro:', error.message);
    return emptyStore();
  }
}

function saveStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function normalize(rawKey) {
  return String(rawKey || '').trim().toUpperCase();
}

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(normalize(rawKey)).digest('hex');
}

function generateKeyString() {
  const bytes = crypto.randomBytes(KEY_RANDOM_LENGTH);
  let random = '';
  for (let i = 0; i < KEY_RANDOM_LENGTH; i += 1) {
    random += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${KEY_PREFIX}${random}`;
}

/**
 * Génère `count` nouvelle(s) clé(s) d'accès, les enregistre (sous forme de
 * hash) dans le store, et renvoie les clés EN CLAIR — c'est la seule fois
 * où elles seront visibles. À noter immédiatement dans un endroit sûr
 * (gestionnaire de mots de passe, etc.) : elles ne sont jamais ré-affichées
 * ensuite, ni récupérables depuis data/accessKeys.json.
 */
function addKeys(count = 1) {
  const store = loadStore();
  const plainKeys = [];

  for (let i = 0; i < count; i += 1) {
    const plain = generateKeyString();
    const h = hashKey(plain);
    store.keys[h] = { createdAt: Date.now(), used: false, usedAt: null, usedByIp: null };
    plainKeys.push(plain);
  }

  saveStore(store);
  return plainKeys;
}

function isLockedOut(store, ip) {
  const entry = store.failedAttempts?.[ip];
  if (!entry) return false;
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) return true;
  return false;
}

function registerFailedAttempt(store, ip) {
  if (!ip) return;
  store.failedAttempts = store.failedAttempts || {};
  const now = Date.now();
  const entry = store.failedAttempts[ip] || { attempts: [], lockedUntil: 0 };

  entry.attempts = entry.attempts.filter((t) => now - t < FAILED_WINDOW_MS);
  entry.attempts.push(now);

  if (entry.attempts.length >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
    entry.attempts = [];
  }

  store.failedAttempts[ip] = entry;
}

function clearFailedAttempts(store, ip) {
  if (store.failedAttempts?.[ip]) delete store.failedAttempts[ip];
}

/**
 * Vérifie une clé saisie par un visiteur du site.
 * Retourne { status: 'ok', token, expiresAt } | { status: 'used' } |
 * { status: 'invalid' } | { status: 'locked', retryAfterMs }.
 */
function verifyKey(rawKey, meta = {}) {
  const store = loadStore();
  const ip = meta.ip || 'unknown';

  if (isLockedOut(store, ip)) {
    const retryAfterMs = store.failedAttempts[ip].lockedUntil - Date.now();
    return { status: 'locked', retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  const normalized = normalize(rawKey);
  if (!normalized.startsWith(KEY_PREFIX) || normalized.length !== KEY_PREFIX.length + KEY_RANDOM_LENGTH) {
    registerFailedAttempt(store, ip);
    saveStore(store);
    return { status: 'invalid' };
  }

  const h = hashKey(normalized);
  const entry = store.keys[h];

  if (!entry) {
    registerFailedAttempt(store, ip);
    saveStore(store);
    return { status: 'invalid' };
  }

  if (entry.used) {
    // Une clé déjà utilisée n'est PAS traitée comme un échec de
    // bruteforce (elle est correcte, juste consommée) : pas de
    // registerFailedAttempt ici.
    return { status: 'used' };
  }

  entry.used = true;
  entry.usedAt = Date.now();
  entry.usedByIp = ip;

  const token = crypto.randomBytes(32).toString('hex');
  store.sessions[token] = {
    keyHash: h,
    issuedAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    ip,
  };

  clearFailedAttempts(store, ip);
  saveStore(store);

  return { status: 'ok', token, expiresAt: store.sessions[token].expiresAt };
}

/**
 * Vérifie un token de session (cookie posé après une clé validée).
 */
function verifySessionToken(token) {
  if (!token) return false;

  const store = loadStore();
  const session = store.sessions[token];
  if (!session) return false;

  if (Date.now() > session.expiresAt) {
    delete store.sessions[token];
    saveStore(store);
    return false;
  }

  return true;
}

function revokeSession(token) {
  if (!token) return;
  const store = loadStore();
  if (store.sessions[token]) {
    delete store.sessions[token];
    saveStore(store);
  }
}

/**
 * Utile pour un futur panneau d'administration : métadonnées uniquement
 * (jamais la clé en clair, jamais le hash complet).
 */
function listKeysMeta() {
  const store = loadStore();
  return Object.entries(store.keys).map(([h, meta]) => ({
    id: h.slice(0, 10),
    createdAt: meta.createdAt,
    used: meta.used,
    usedAt: meta.usedAt,
  }));
}

module.exports = {
  KEY_PREFIX,
  KEY_RANDOM_LENGTH,
  addKeys,
  verifyKey,
  verifySessionToken,
  revokeSession,
  listKeysMeta,
};
