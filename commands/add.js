const { isOwner } = require('../utils/isOwner');
const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');

module.exports = {
  name: 'add',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!chatJid.endsWith('@g.us')) {
      await sock.sendMessage(chatJid, { text: '⚠️ Cette commande ne fonctionne que dans un groupe.' }, { quoted: msg });
      return;
    }

    const senderJid = msg.key.participant || chatJid;
    const metadata = await sock.groupMetadata(chatJid);

    if (!isOwner(msg) && !isSenderAdmin(metadata, senderJid)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul un admin du groupe peut utiliser cette commande.' }, { quoted: msg });
      return;
    }

    if (!isBotAdmin(sock, metadata)) {
      await sock.sendMessage(chatJid, { text: '🚫 Je dois être admin du groupe pour ajouter quelqu\'un.' }, { quoted: msg });
      return;
    }

    const digits = (args[0] || '').replace(/[^0-9]/g, '');

    if (!digits || digits.length < 8) {
      await sock.sendMessage(chatJid, {
        text: '⚠️ Écrivez le numéro (avec l\'indicatif du pays, sans le +) que vous voulez ajouter devant *.add*.\n\nExemple : .add 23591234567',
      }, { quoted: msg });
      return;
    }

    const targetJid = `${digits}@s.whatsapp.net`;

    try {
      const result = await sock.groupParticipantsUpdate(chatJid, [targetJid], 'add');
      const status = result?.[0]?.status;

      if (status === '403') {
        await sock.sendMessage(chatJid, {
          text: `⚠️ Impossible d'ajouter @${digits} directement (paramètres de confidentialité). Une invitation privée lui a peut-être été envoyée.`,
          mentions: [targetJid],
        }, { quoted: msg });
      } else {
        await sock.sendMessage(chatJid, { text: `✅ @${digits} ajouté au groupe.`, mentions: [targetJid] }, { quoted: msg });
      }
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
