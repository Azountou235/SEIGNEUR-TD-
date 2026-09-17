const path = require('path');
const { isOwner } = require('../utils/isOwner');
const { checkForUpdate, applyUpdate } = require('../utils/fetchCore');
const { reloadCommands } = require('../utils/commandLoader');
const logger = require('../utils/logger');

module.exports = {
  name: 'update',
  execute: async (sock, msg, args, commands) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut lancer une mise à jour.' }, { quoted: msg });
      return;
    }

    await sock.sendMessage(chatJid, { text: '🔎 Vérification des nouveautés sur le dépôt GitHub...' }, { quoted: msg });

    const { hasUpdate, remoteSha, localSha } = await checkForUpdate();

    if (!remoteSha) {
      await sock.sendMessage(chatJid, { text: '❌ Impossible de contacter GitHub pour vérifier les mises à jour.' }, { quoted: msg });
      return;
    }

    if (!hasUpdate) {
      await sock.sendMessage(chatJid, { text: `✅ Le bot est déjà à jour.\n📌 Commit : ${remoteSha.slice(0, 7)}` }, { quoted: msg });
      return;
    }

    await sock.sendMessage(chatJid, {
      text: `⚡ UNE NOUVELLE VERSION DÉTECTÉE, APPLICATION EN COURS, VEUILLEZ PATIENTER...\n📌 ${localSha ? localSha.slice(0, 7) : 'inconnu'} → ${remoteSha.slice(0, 7)}`,
    }, { quoted: msg });

    try {
      await applyUpdate(remoteSha);

      // Recharge à chaud UNIQUEMENT commands/ dans la Map déjà partagée par
      // toutes les sessions actives (elle est passée par référence, donc la
      // muter ici suffit — chaque bot connecté la relit à chaque message).
      // Aucun process.exit(), aucune session redémarrée : ce numéro comme
      // tous les autres restent connectés pendant l'opération.
      const commandsPath = path.join(__dirname);
      const freshCommands = reloadCommands(commandsPath);
      commands.clear();
      for (const [key, cmd] of freshCommands) commands.set(key, cmd);

      await sock.sendMessage(chatJid, {
        text: `✅ MISE À JOUR APPLIQUÉE (commit ${remoteSha.slice(0, 7)}).\n♻️ Commandes rechargées à chaud, sans redémarrage — cette session et toutes les autres restent connectées.\n\nℹ️ Un changement dans utils/ ou events/ (logique interne, pas une commande) ne sera actif qu'après un redémarrage complet du process.`,
      }, { quoted: msg });
      logger.info(`[update] Commands rechargées à chaud (commit ${remoteSha.slice(0, 7)}) — aucun redémarrage de process.`);
    } catch (e) {
      logger.error(`[update] Failed to apply update: ${e.message}`);
      await sock.sendMessage(chatJid, { text: `❌ Échec de la mise à jour : ${e.message}` }, { quoted: msg });
    }
  },
};
