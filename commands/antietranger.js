const { isOwner } = require('../utils/isOwner');
const { isSenderAdmin } = require('../utils/isAdmin');
const groupSettingsStore = require('../utils/groupSettingsStore');

module.exports = {
  name: 'antietranger',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!chatJid.endsWith('@g.us')) {
      await sock.sendMessage(chatJid, { text: '⚠️ Cette commande ne fonctionne que dans un groupe.' }, { quoted: msg });
      return;
    }

    const senderJid = msg.key.participant || chatJid;
    const metadata = await sock.groupMetadata(chatJid);

    if (!isOwner(msg) && !isSenderAdmin(metadata, senderJid)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul un admin du groupe peut changer ce réglage.' }, { quoted: msg });
      return;
    }

    const sub = (args[0] || '').toLowerCase();

    if (sub === 'on' || sub === 'off') {
      groupSettingsStore.set(chatJid, 'antietranger', sub === 'on');
      await sock.sendMessage(chatJid, { text: `✅ Anti-étranger réglé sur *${sub}*.\nCodes pays autorisés : ${groupSettingsStore.get(chatJid, 'antietrangerCodes', ['235']).join(', ')}\nUtilisez .antietranger codes 235,33,1 pour les changer.` }, { quoted: msg });
      return;
    }

    if (sub === 'codes') {
      const codes = (args[1] || '').split(',').map((c) => c.trim().replace(/[^0-9]/g, '')).filter(Boolean);
      if (!codes.length) {
        await sock.sendMessage(chatJid, { text: '⚠️ Usage : .antietranger codes 235,33 (codes pays séparés par des virgules, sans +)' }, { quoted: msg });
        return;
      }
      groupSettingsStore.set(chatJid, 'antietrangerCodes', codes);
      await sock.sendMessage(chatJid, { text: `✅ Codes pays autorisés réglés sur : ${codes.join(', ')}` }, { quoted: msg });
      return;
    }

    const current = groupSettingsStore.get(chatJid, 'antietranger', false);
    const codes = groupSettingsStore.get(chatJid, 'antietrangerCodes', ['235']);
    await sock.sendMessage(chatJid, {
      text: `🌍 Anti-étranger est actuellement *${current ? 'on' : 'off'}*.\nCodes pays autorisés : ${codes.join(', ')}\n\nUsage :\n.antietranger on | off\n.antietranger codes 235,33`,
    }, { quoted: msg });
  },
};
