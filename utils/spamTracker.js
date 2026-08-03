// In-memory tracker: more than THRESHOLD messages from the same sender
// within a 60-second window in a given group counts as spam. Data is
// kept in memory only (no need to persist across restarts).

const WINDOW_MS = 60 * 1000;
const THRESHOLD = 10; // more than 10 messages in under a minute

const store = new Map(); // key: `${groupJid}::${senderJid}` -> array of timestamps

function key(groupJid, senderJid) {
  return `${groupJid}::${senderJid}`;
}

/**
 * Registers a new message from senderJid in groupJid, and returns true
 * if the sender has now crossed the spam threshold (>10 msgs / 60s).
 */
function registerMessage(groupJid, senderJid) {
  const k = key(groupJid, senderJid);
  const now = Date.now();

  const timestamps = (store.get(k) || []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  store.set(k, timestamps);

  return timestamps.length > THRESHOLD;
}

function reset(groupJid, senderJid) {
  store.delete(key(groupJid, senderJid));
}

module.exports = { registerMessage, reset, THRESHOLD, WINDOW_MS };
