/**
 * utils/sessionContext.js
 *
 * Le bot est multi-session : plusieurs numéros WhatsApp peuvent tourner en
 * même temps dans le même process Node. Beaucoup de fichiers existants
 * (settingsStore, groupSettingsStore, commandes...) font simplement
 * `require('../utils/settingsStore').get('prefix')` sans savoir "pour quel
 * numéro" — il faut donc un moyen de répondre à cette question sans
 * réécrire tous les fichiers de commandes.
 *
 * AsyncLocalStorage permet de "taguer" une chaîne d'exécution asynchrone
 * (un événement Baileys et tout ce qu'il déclenche en cascade) avec l'ID de
 * session courant, sans avoir à le passer explicitement en paramètre à
 * chaque fonction. Tant que le code reste dans le même flux async (mêmes
 * promesses/await, pas de setTimeout non "rebindé"), currentSessionId()
 * retourne le bon numéro.
 */

const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

// 'default' sert de session par défaut si jamais du code tourne en dehors
// de tout contexte de session (scripts CLI, tests, etc.).
const DEFAULT_SESSION = 'default';

function run(sessionId, fn) {
  return als.run({ sessionId: sessionId || DEFAULT_SESSION }, fn);
}

function currentSessionId() {
  const store = als.getStore();
  return store?.sessionId || DEFAULT_SESSION;
}

module.exports = { run, currentSessionId, DEFAULT_SESSION };
