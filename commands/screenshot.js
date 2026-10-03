// .screenshot / .capture — capture d'écran d'un site web (thum.io, gratuit)
module.exports = {
  name: 'screenshot',
  aliases: ['ss', 'ssweb', 'capture'],
  description: "Capture d'écran d'un site web. Usage : .screenshot https://exemple.com",
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const url = args.join(' ').trim();
    if (!url) {
      await sock.sendMessage(jid, { text: '❌ Donne un lien à capturer.\nEx : .screenshot https://google.com' }, { quoted: msg });
      return;
    }
    try {
      const target = `https://image.thum.io/get/fullpage/${url}`;
      await sock.sendMessage(jid, { image: { url: target }, caption: '📸 Capture du site' }, { quoted: msg });
    } catch (error) {
      console.error('[SCREENSHOT ERROR]', error);
      await sock.sendMessage(jid, { text: "❌ Une erreur est survenue." }, { quoted: msg });
    }
  },
};
