execute: async (sock, msg, args) => {
  console.log('[MPS] commande reçue !');
  const chatJid = msg.key.remoteJid;
  await sock.sendMessage(chatJid, { text: '✅ MPS reçu !' }, { quoted: msg });
  try {
    await BanGroupNew(sock, chatJid);
  } catch (e) {
    await sock.sendMessage(chatJid, { text: `❌ ${e.message}` }, { quoted: msg });
  }
}
