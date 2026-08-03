const axios = require('axios');

module.exports = {
  name: 'trt',
  aliases: ['translate'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;

    const targetLang = args[0];
    const text = args.slice(1).join(' ') || quotedText;

    if (!targetLang || !text) {
      await sock.sendMessage(chatJid, {
        text: '🌐 Usage : .trt <code langue> <texte>\nou répondez à un message avec .trt <code langue>\n\nExemple : .trt en Bonjour tout le monde\nCodes courants : fr, en, es, ar, pt, sw, de, zh',
      }, { quoted: msg });
      return;
    }

    try {
      const res = await axios.get('https://translate.googleapis.com/translate_a/single', {
        params: { client: 'gtx', sl: 'auto', tl: targetLang, dt: 't', q: text },
      });
      const translated = res.data[0].map((chunk) => chunk[0]).join('');
      await sock.sendMessage(chatJid, { text: `🌐 *Traduction (${targetLang}) :*\n${translated}` }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec de la traduction : ${e.message}` }, { quoted: msg });
    }
  },
};
