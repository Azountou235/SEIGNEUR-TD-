const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'setstatusviewers',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut changer ce réglage.' }, { quoted: msg });
      return;
    }
    const arg = args.join(' ').trim();
    if (!arg) {
      const current = settingsStore.get('statusViewers', []);
      await sock.sendMessage(chatJid, { text: `👁️ Visible par : ${current.length ? current.join(', ') : 'tous (par défaut)'}\n\nUsage : .setstatusviewers <num1,num2,...>\n.setstatusviewers all — remet la visibilité par défaut` }, { quoted: msg });
      return;
    }
    if (arg.toLowerCase() === 'all') {
      settingsStore.set('statusViewers', []);
      await sock.sendMessage(chatJid, { text: '✅ Visibilité remise par défaut.' }, { quoted: msg });
      return;
    }
    const nums = arg.split(',').map((n) => n.trim().replace(/\D/g, '')).filter((n) => n.length > 6);
    settingsStore.set('statusViewers', nums);
    await sock.sendMessage(chatJid, { text: `✅ Statut visible uniquement par :\n${nums.map((n) => `• ${n}`).join('\n')}` }, { quoted: msg });
  },
};
