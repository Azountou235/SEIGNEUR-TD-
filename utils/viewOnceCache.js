const { currentSessionId } = require('./sessionContext');

// Cache des médias à vue unique, capturés dès l'arrivée du message (WhatsApp
// retire le média réel des citations après coup). SÉPARÉ PAR SESSION : une
// session ne peut pas lire ce qu'une autre a capturé.
const CACHE_LIMIT = 300;
const cache = new Map(); // key: `${session}|${messageId}` -> { message, type, senderJid, remoteJid }

const keyOf = (id) => `${currentSessionId()}|${id}`;

function set(id, entry) {
  if (!id) return;
  cache.set(keyOf(id), { ...entry, timestamp: Date.now() });
  if (cache.size > CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
}

function get(id) {
  return id ? (cache.get(keyOf(id)) || null) : null;
}

function clear() {
  const size = cache.size;
  cache.clear();
  return size;
}

module.exports = { set, get, clear };
