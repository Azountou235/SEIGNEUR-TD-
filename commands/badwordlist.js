const fs = require('fs');
const path = require('path');
const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

const listPath = path.join(__dirname, '../config/badwords.json');
function loadList() { return fs.existsSync(listPath) ? JSON.parse(fs.readFileSync(listPath, 'utf8')) : []; }

module.exports = {
  name: 'badwordlist',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const choice = (args[0] || '').toLowerCase();

    if (choice === 'on' || choice === 'off') {
      if (!isOwner(msg)) {
        await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
        return;
      }
      settingsStore.set('badword', choice === 'on');
      await sock.sendMessage(chatJid, { text: `✅ Protection anti-mots interdits : *${choice}*` }, { quoted: msg });
      return;
    }

    const list = loadList();
    const status = settingsStore.get('badword', false) ? 'activée ✅' : 'désactivée ❌';
    const body = list.length ? list.map((w, i) => `${i + 1}. ${w}`).join('\n') : 'Aucun mot enregistré.';
    await sock.sendMessage(chatJid, {
      text: `🤬 *Mots interdits* (protection : ${status})\n\n${body}\n\n.addbadword <mot>\n.removebadword <mot>\n.badwordlist on|off`,
    }, { quoted: msg });
  },
};
