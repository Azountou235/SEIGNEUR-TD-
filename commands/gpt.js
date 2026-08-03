const https = require('https');
const { KEITH_BASE } = require('../config/apis');
const { getIdentityReply, sanitizeReply } = require('../utils/identity');

module.exports = {
  name: 'gpt',
  aliases: ['ai', 'ask'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;
    const question = args.join(' ') || quotedText;

    if (!question) {
      await sock.sendMessage(chatJid, { text: '🤖 Écrivez votre question après *.gpt*.\n\nExemple : .gpt explique-moi la photosynthèse' }, { quoted: msg });
      return;
    }

    const identityReply = getIdentityReply(question);
    if (identityReply) {
      await sock.sendMessage(chatJid, { text: identityReply }, { quoted: msg });
      return;
    }

    try {
      const encoded = encodeURIComponent(question);
      const reply = await new Promise((resolve, reject) => {
        https.get(`${KEITH_BASE}/ai/gpt?q=${encoded}`, (res) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => {
            try {
              const json = JSON.parse(raw);
              if (!json.status) return reject(new Error(json.error || 'Échec de la requête API'));
              resolve(sanitizeReply(json.result));
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });

      await sock.sendMessage(chatJid, { text: reply }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    }
  },
};
