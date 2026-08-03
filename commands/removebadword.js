const fs = require('fs');
const path = require('path');
const { isOwner } = require('../utils/isOwner');

const listPath = path.join(__dirname, '../config/badwords.json');
function loadList() { return fs.existsSync(listPath) ? JSON.parse(fs.readFileSync(listPath, 'utf8')) : []; }
function saveList(list) { fs.writeFileSync(listPath, JSON.stringify(list, null, 2)); }

module.exports = {
  name: 'removebadword',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
      return;
    }
    const word = (args.join(' ') || '').toLowerCase().trim();
    if (!word) {
      await sock.sendMessage(chatJid, { text: '⚠️ Usage : .removebadword <mot>' }, { quoted: msg });
      return;
    }
    const list = loadList().filter((w) => w !== word);
    saveList(list);
    await sock.sendMessage(chatJid, { text: `✅ Mot retiré : ${word}` }, { quoted: msg });
  },
};
