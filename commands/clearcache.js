const messageCache = require('../utils/messageCache');
const { groupCache } = require('../utils/groupCache');

/**
 * Clears in-memory caches so long-running processes don't slowly grow
 * their memory usage. Called automatically every 6 hours from index.js,
 * and can also be wired up to a manual command if desired.
 */
function runClearCache(commands) {
  const messagesCleared = messageCache.clear();

  const groupCacheKeys = groupCache.keys().length;
  groupCache.flushAll();

  return {
    messagesCleared,
    groupCacheCleared: groupCacheKeys,
    commandsLoaded: commands ? commands.size || Object.keys(commands).length : 0,
  };
}

module.exports = { runClearCache };
