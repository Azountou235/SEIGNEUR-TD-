/**
 * utils/botDetector.js
 * --------------------
 * Lightweight in-memory behaviour tracker used by the .antibot feature.
 *
 * Instead of only checking for a command prefix, this studies a sender's
 * behaviour inside a group and accumulates "strikes" for patterns that are
 * typical of automated accounts / bots rather than real humans:
 *
 *  - Sending messages back-to-back in under FAST_THRESHOLD_MS (default 3s).
 *  - Using a foreign bot prefix (!, /, #, etc.) followed by a common
 *    English bot-command keyword (help, start, menu, ping, ...) — a strong
 *    sign the account is itself running another bot / automation.
 *  - Editing a message it just sent in under FAST_THRESHOLD_MS — real
 *    people rarely notice and fix a typo that fast, repeatedly.
 *
 * Super admins / the owner are never scored (that check happens in the
 * caller, events/messages.js, before these functions are used).
 */

const FAST_THRESHOLD_MS = 3000;
const STRIKES_TO_KICK = 3;

// Common English command keywords used by generic WhatsApp bots. Seeing
// one of these behind a prefix that ISN'T our own bot's prefix is a strong
// automation signal (a human typing to another bot in the same group would
// normally not also hammer through commands at bot speed).
const ENGLISH_BOT_KEYWORDS = new Set([
  'help', 'start', 'menu', 'ping', 'info', 'settings', 'enable', 'disable',
  'on', 'off', 'admin', 'owner', 'bot', 'alive', 'status', 'update',
]);

// key: `${groupJid}:${senderJid}` -> { lastMsgTime, strikes }
const activity = new Map();

function keyFor(groupJid, senderJid) {
  return `${groupJid}:${senderJid}`;
}

function getEntry(groupJid, senderJid) {
  const key = keyFor(groupJid, senderJid);
  let entry = activity.get(key);
  if (!entry) {
    entry = { lastMsgTime: 0, strikes: 0 };
    activity.set(key, entry);
  }
  return entry;
}

/**
 * Call once per incoming text message from a sender in a group.
 * Returns the updated strike count and whether this particular message
 * was flagged as suspiciously fast.
 */
function registerMessage(groupJid, senderJid, text, ownPrefix) {
  const entry = getEntry(groupJid, senderJid);
  const now = Date.now();
  const gap = entry.lastMsgTime ? now - entry.lastMsgTime : Infinity;
  entry.lastMsgTime = now;

  let flaggedFast = false;
  if (gap < FAST_THRESHOLD_MS) {
    entry.strikes += 1;
    flaggedFast = true;
  }

  let flaggedForeignPrefix = false;
  const foreignPrefixMatch = /^([!/#$%^&*~])(\w+)/.exec(text.trim());
  if (foreignPrefixMatch && foreignPrefixMatch[1] !== ownPrefix) {
    const word = foreignPrefixMatch[2].toLowerCase();
    if (ENGLISH_BOT_KEYWORDS.has(word)) {
      entry.strikes += 1;
      flaggedForeignPrefix = true;
    }
  }

  return { strikes: entry.strikes, flaggedFast, flaggedForeignPrefix };
}

/**
 * Call when a cached message from this sender gets edited. `editDelayMs`
 * is the time between the original send and the edit.
 */
function registerEdit(groupJid, senderJid, editDelayMs) {
  const entry = getEntry(groupJid, senderJid);
  let flaggedFast = false;
  if (editDelayMs < FAST_THRESHOLD_MS) {
    entry.strikes += 1;
    flaggedFast = true;
  }
  return { strikes: entry.strikes, flaggedFast };
}

function reset(groupJid, senderJid) {
  activity.delete(keyFor(groupJid, senderJid));
}

module.exports = {
  registerMessage,
  registerEdit,
  reset,
  FAST_THRESHOLD_MS,
  STRIKES_TO_KICK,
};
