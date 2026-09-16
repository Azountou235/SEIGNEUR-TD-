const fs = require('fs');
const path = require('path');
const sessionContext = require('./sessionContext');

const SESSIONS_ROOT = path.join(__dirname, '..', 'sessions');
const USE_DB = !!process.env.DATABASE_URL;

let db = null;
if (USE_DB) {
    db = require('./db');
}

// states.get(sessionId) -> { [groupJid]: { key: value, ... } }
const states = new Map();
const dbLoaded = new Set();

function dataPath(sessionId) {
    return path.join(SESSIONS_ROOT, sessionId, 'groupSettings.json');
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
        console.error(`[groupSettingsStore:${sessionId}] Failed to save to disk:`, err.message);
    }
}

function getState(sessionId) {
    if (!states.has(sessionId)) {
        states.set(sessionId, loadFromDisk(sessionId));

        if (USE_DB && !dbLoaded.has(sessionId)) {
            dbLoaded.add(sessionId);
            db.ensureSchema()
                .then(async () => {
                    // On préfixe le jid stocké en base avec l'ID de session pour
                    // que deux comptes différents ne partagent jamais les
                    // réglages d'un même groupe s'ils sont tous les deux dedans.
                    const { rows } = await db.query(
                        'SELECT jid, key, value FROM group_settings WHERE jid LIKE $1',
                        [`${sessionId}::%`]
                    );
                    const state = states.get(sessionId) || {};
                    for (const row of rows) {
                        const realJid = row.jid.slice(sessionId.length + 2);
                        if (!state[realJid]) state[realJid] = {};
                        state[realJid][row.key] = row.value;
                    }
                    states.set(sessionId, state);
                })
                .catch((err) => {
                    console.error(`[groupSettingsStore:${sessionId}] Failed to load from PostgreSQL:`, err.message);
                });
        }
    }
    return states.get(sessionId);
}

function get(jid, key, fallback = undefined) {
    const sessionId = sessionContext.currentSessionId();
    const state = getState(sessionId);
    return state[jid] && key in state[jid] ? state[jid][key] : fallback;
}

function getAll(jid) {
    const sessionId = sessionContext.currentSessionId();
    const state = getState(sessionId);
    return { ...(state[jid] || {}) };
}

function set(jid, key, value) {
    const sessionId = sessionContext.currentSessionId();
    const state = getState(sessionId);
    if (!state[jid]) state[jid] = {};
    state[jid][key] = value;

    if (USE_DB) {
        db.query(
            `INSERT INTO group_settings (jid, key, value) VALUES ($1, $2, $3)
             ON CONFLICT (jid, key) DO UPDATE SET value = EXCLUDED.value`,
            [`${sessionId}::${jid}`, key, value]
        ).catch((err) => {
            console.error(`[groupSettingsStore:${sessionId}] Failed to persist to PostgreSQL:`, err.message);
        });
    } else {
        saveToDisk(sessionId, state);
    }
}

const ready = Promise.resolve();

module.exports = { get, set, getAll, ready };
