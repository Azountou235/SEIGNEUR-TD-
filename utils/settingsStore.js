const fs = require('fs');
const path = require('path');
const sessionContext = require('./sessionContext');

const SESSIONS_ROOT = path.join(__dirname, '..', 'sessions');
const USE_DB = !!process.env.DATABASE_URL;

let db = null;
if (USE_DB) {
    db = require('./db');
}

// Un état en mémoire par session (au lieu d'un seul objet global comme
// avant) : states.get('23591234567') -> { prefix: '.', mode: 'public', ... }
const states = new Map();
const dbLoaded = new Set(); // sessions déjà chargées depuis Postgres

function dataPath(sessionId) {
    return path.join(SESSIONS_ROOT, sessionId, 'settings.json');
}

function loadFromDisk(sessionId) {
    try {
        const p = dataPath(sessionId);
        if (!fs.existsSync(p)) return {};
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
        return {};
    }
}

function saveToDisk(sessionId, currentState) {
    try {
        const p = dataPath(sessionId);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(currentState, null, 2));
    } catch (err) {
        console.error(`[settingsStore:${sessionId}] Failed to save to disk:`, err.message);
    }
}

function getState(sessionId) {
    if (!states.has(sessionId)) {
        states.set(sessionId, loadFromDisk(sessionId));

        // Chargement Postgres paresseux : la première fois qu'une session
        // est touchée, on va chercher ses réglages en base (clé préfixée
        // par la session pour ne pas mélanger les comptes dans la même
        // table). Les appels get()/set() suivants restent synchrones et
        // utilisent le cache mémoire, à jour dès que la promesse résout.
        if (USE_DB && !dbLoaded.has(sessionId)) {
            dbLoaded.add(sessionId);
            db.query(`
                CREATE TABLE IF NOT EXISTS bot_settings (
                    key   TEXT NOT NULL PRIMARY KEY,
                    value JSONB NOT NULL
                );
            `)
                .then(async () => {
                    const { rows } = await db.query(
                        'SELECT key, value FROM bot_settings WHERE key LIKE $1',
                        [`${sessionId}::%`]
                    );
                    const state = states.get(sessionId) || {};
                    for (const row of rows) {
                        const realKey = row.key.slice(sessionId.length + 2);
                        state[realKey] = row.value;
                    }
                    states.set(sessionId, state);
                })
                .catch((err) => {
                    console.error(`[settingsStore:${sessionId}] Failed to load from PostgreSQL:`, err.message);
                });
        }
    }
    return states.get(sessionId);
}

function get(key, fallback = undefined) {
    const sessionId = sessionContext.currentSessionId();
    const state = getState(sessionId);
    return key in state ? state[key] : fallback;
}

function set(key, value) {
    const sessionId = sessionContext.currentSessionId();
    const state = getState(sessionId);
    state[key] = value;

    if (USE_DB) {
        db.query(
            `INSERT INTO bot_settings (key, value)
             VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [`${sessionId}::${key}`, JSON.stringify(value)]
        ).catch((err) => {
            console.error(`[settingsStore:${sessionId}] Failed to persist to PostgreSQL:`, err.message);
        });
    } else {
        saveToDisk(sessionId, state);
    }
}

function getAll() {
    const sessionId = sessionContext.currentSessionId();
    return { ...getState(sessionId) };
}

// Utile pour sessionManager.js (pas besoin de passer par le contexte async
// quand on connaît déjà l'ID de session, ex. au chargement au démarrage).
function getAllFor(sessionId) {
    return { ...getState(sessionId) };
}

const ready = Promise.resolve();

module.exports = { get, set, getAll, getAllFor, ready };
