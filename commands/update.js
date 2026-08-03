const { isOwner } = require('../utils/isOwner');
const { checkForUpdate, applyUpdate } = require('../utils/fetchCore');
const logger = require('../utils/logger');

module.exports = {
  name: 'update',
  execute: async (sock, msg, args) => {
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
      text: `⬇️ Nouvelle mise à jour trouvée !\n📌 ${localSha ? localSha.slice(0, 7) : 'inconnu'} → ${remoteSha.slice(0, 7)}\n\nApplication en cours...`,
    }, { quoted: msg });

    try {
      await applyUpdate(remoteSha);
      await sock.sendMessage(chatJid, { text: '✅ Mise à jour appliquée avec succès. Redémarrage du bot...' }, { quoted: msg });
      logger.info('[update] Update applied, restarting process.');
      setTimeout(() => process.exit(0), 1500);
    } catch (e) {
      logger.error(`[update] Failed to apply update: ${e.message}`);
      await sock.sendMessage(chatJid, { text: `❌ Échec de la mise à jour : ${e.message}` }, { quoted: msg });
    }
  },
};
