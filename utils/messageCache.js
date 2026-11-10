const { currentSessionId } = require('./sessionContext');

const CACHE_LIMIT = 500;
// Le cache est séparé PAR SESSION : une session ne peut pas lire les messages
// mis en cache par une autre (sinon elle pourrait récupérer un message supprimé
// ou modifié qu'elle n'avait pas le droit de garder).
const cache = new Map(); // key: `${session}|${remoteJid}:${id}` -> { type, text, rawMessage, senderJid, timestamp }

const keyOf = (remoteJid, id) => `${currentSessionId()}|${remoteJid}:${id}`;

function set(remoteJid, id, data) {
  cache.set(keyOf(remoteJid, id), { ...data, timestamp: Date.now() });

  if (cache.size > CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

function get(remoteJid, id) {
  return cache.get(keyOf(remoteJid, id)) || null;
}

function clear() {
  const size = cache.size;
  cache.clear();
  return size;
}

module.exports = { set, get, clear };
