const CACHE_LIMIT = 500;
const store = new Map(); // key: `${remoteJid}:${id}` -> { original, edited, senderJid, timestamp }

function set(remoteJid, id, data) {
  const key = `${remoteJid}:${id}`;
  store.set(key, { ...data, timestamp: data.timestamp || Date.now() });

  if (store.size > CACHE_LIMIT) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }
}

function get(remoteJid, id) {
  return store.get(`${remoteJid}:${id}`) || null;
}

function clear() {
  const size = store.size;
  store.clear();
  return size;
}

module.exports = { set, get, clear };
