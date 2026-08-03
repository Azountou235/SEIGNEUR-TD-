const fs = require('fs');
const path = require('path');
const { isOwner } = require('../utils/isOwner');

const listPath = path.join(__dirname, '../config/badwords.json');
function loadList() { return fs.existsSync(listPath) ? JSON.parse(fs.readFileSync(listPath, 'utf8')) : []; }
function saveList(list) { fs.writeFileSync(listPath, JSON.stringify(list, null, 2)); }

module.exports = {
  name: 'addbadword',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
      return;
    }
    const word = (args.join(' ') || '').toLowerCase().trim();
    if (!word) {
      await sock.sendMessage(chatJid, { text: '⚠️ Usage : .addbadword <mot>' }, { quoted: msg });
      return;
    }
    const list = loadList();
    if (list.includes(word)) {
      await sock.sendMessage(chatJid, { text: `⚠️ « ${word} » est déjà dans la liste.` }, { quoted: msg });
      return;
    }
    list.push(word);
    saveList(list);
    await sock.sendMessage(chatJid, { text: `✅ Mot ajouté à la liste noire.\n\n💡 Pensez à activer la protection avec *.badwordlist on*.` }, { quoted: msg });
  },
};
