module.exports = {
  name: 'ping',
  aliases: ['speed'],
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    const start = Date.now();

    const sent = await sock.sendMessage(chatJid, { text: '🇷🇴 pong...' }, { quoted: msg });

    const latency = Date.now() - start;

    await sock.sendMessage(
      chatJid,
      { text: `🇷🇴 pong !\nVitesse : ${latency}ms` },
      { edit: sent.key }
    );
  },
};
