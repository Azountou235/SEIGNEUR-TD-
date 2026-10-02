const path = require('path');
const { isOwner } = require('../utils/isOwner');
const { isDev } = require('../utils/isDev');
const { checkForUpdate, applyUpdate, REPO, BRANCH } = require('../utils/fetchCore');
const { reloadCommands } = require('../utils/commandLoader');
const logger = require('../utils/logger');

// Toutes les sessions partagent ce verrou : une seule mise à jour à la fois,
// même si deux numéros tapent .update en même temps.
let updating = false;

module.exports = {
  name: 'update',
  execute: async (sock, msg, args, commands) => {
    const chatJid = msg.key.remoteJid;
    const reply = (text) => sock.sendMessage(chatJid, { text }, { quoted: msg });

    // Le owner de la session OU un super admin (utilisable depuis n'importe
    // quelle session).
    if (!isOwner(msg) && !isDev(msg)) {
      await reply('🚫 Seul le owner peut lancer une mise à jour.');
      return;
    }

    if (updating) {
      await reply('⏳ Une mise à jour est déjà en cours, patiente quelques secondes.');
      return;
    }
    updating = true;

    try {
      const force = (args[0] || '').toLowerCase() === 'force';

      await reply(`🔎 Vérification des nouveautés sur GitHub (${REPO}@${BRANCH})...`);

      const { hasUpdate, remoteSha, localSha, error } = await checkForUpdate();

      if (!remoteSha) {
        await reply(`❌ Impossible de lire GitHub.\n${error || 'Cause inconnue.'}`);
        return;
      }

      if (!hasUpdate && !force) {
        await reply(`✅ Le bot est déjà à jour.\n📌 Commit : ${remoteSha.slice(0, 7)}\n\n💡 .update force pour retélécharger quand même.`);
        return;
      }

      await reply(
        `⚡ ${force && !hasUpdate ? 'MISE À JOUR FORCÉE' : 'NOUVELLE VERSION DÉTECTÉE'}, application en cours...\n📌 ${localSha ? localSha.slice(0, 7) : 'inconnu'} → ${remoteSha.slice(0, 7)}`
      );

      const { changed, failed, backupDir } = await applyUpdate(remoteSha);

      // Recharge à chaud UNIQUEMENT commands/ dans la Map partagée par toutes
      // les sessions (passée par référence : la muter suffit, chaque bot la
      // relit à chaque message). Aucun process.exit(), aucune session coupée.
      const freshCommands = reloadCommands(path.join(__dirname));
      commands.clear();
      for (const [key, cmd] of freshCommands) commands.set(key, cmd);

      let sessionCount = 0;
      try {
        sessionCount = require('../utils/sessionManager').activeSessions.size;
      } catch (_) {
        // sans importance
      }

      const needsRestart = changed.filter((f) => f.startsWith('utils/') || f.startsWith('events/'));
      const changedCommands = changed.filter((f) => f.startsWith('commands/'));

      let text = failed.length
        ? `⚠️ MISE À JOUR PARTIELLE (commit ${remoteSha.slice(0, 7)})`
        : `✅ MISE À JOUR APPLIQUÉE (commit ${remoteSha.slice(0, 7)})`;

      text += `\n📝 ${changed.length} fichier(s) modifié(s) — ${changedCommands.length} commande(s)`;
      text += `\n♻️ Commandes rechargées à chaud pour ${sessionCount || 'toutes les'} session(s) active(s), sans redémarrage.`;

      if (needsRestart.length) {
        text += `\n\n🔁 *Redémarrage nécessaire* pour activer :\n${needsRestart.map((f) => `• ${f}`).join('\n')}`;
        text += `\n(Les sessions sont sauvegardées et reviennent toutes seules après redémarrage.)`;
      }

      if (failed.length) {
        text += `\n\n❌ *Non appliqués* (l'ancienne version est conservée) :\n${failed
          .slice(0, 8)
          .map((f) => `• ${f.file} — ${f.reason}`)
          .join('\n')}`;
        if (failed.length > 8) text += `\n• ... et ${failed.length - 8} autre(s)`;
        text += `\n\nRelance .update après correction sur GitHub.`;
      }

      if (backupDir) {
        text += `\n\n🗂️ Anciennes versions sauvegardées dans data/update-backup/`;
      }

      await reply(text);
      logger.info(
        `[update] ${changed.length} fichier(s) modifié(s), ${failed.length} échec(s), commit ${remoteSha.slice(0, 7)} — commandes rechargées à chaud.`
      );
    } catch (e) {
      logger.error(`[update] Failed to apply update: ${e.message}`);
      await reply(`❌ Échec de la mise à jour : ${e.message}`);
    } finally {
      updating = false;
    }
  },
};
