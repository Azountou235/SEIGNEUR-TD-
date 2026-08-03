/**
 * utils/viewOnceCache.js
 * ----------------------
 * WhatsApp does NOT include the actual media (mediaKey, url, etc.) inside
 * `contextInfo.quotedMessage` when a view-once photo/video/voice note is
 * quoted/replied to — by design, to prevent exactly the kind of "reply to
 * grab it" trick the .adjib feature relies on. Replying to it only gives
 * you an empty/placeholder shell, which is why Adjib never actually sent
 * anything.
 *
 * The fix: cache the real, fully-keyed message the moment the view-once
 * message first arrives (before it's ever opened/expired), keyed by its
 * WhatsApp message id. When "adjib" is used as a reply, we look the
 * original up by id here instead of trying to read it out of the quote.
 */

const CACHE_LIMIT = 200;
const TTL_MS = 20 * 60 * 1000; // 20 minutes is plenty to reply "adjib"

const cache = new Map(); // key: message id -> { message, senderJid, timestamp }

function set(id, data) {
  cache.set(id, { ...data, timestamp: Date.now() });

  if (cache.size > CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

function get(id) {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(id);
    return null;
  }
  return entry;
}

module.exports = { set, get };
