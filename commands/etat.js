// .etat — liste les chats privés qui ont écrit au bot depuis sa connexion
// Réservé aux deux super admins. Invisible pour tout le monde d'autre.
const SUPER_ADMINS = ['23591234567', '23591234568'];

function toNumber(jid) {
  if (!jid || typeof jid !== 'string') return null;
  return jid.split('@')[0].split(':')[0];
}

function isSuperAdmin(sock, msg) {
  if (msg.key.fromMe) return SUPER_ADMINS.includes(toNumber(sock.user?.id));
  const candidates = [msg.key.participantPn, msg.key.participantAlt, msg.key.participant, msg.key.remoteJidAlt, msg.key.remoteJid]
    .map(toNumber)
    .filter(Boolean);
  return candidates.some((n) => SUPER_ADMINS.includes(n));
}

module.exports = {
  name: 'etat',
  aliases: ['newchats', 'etatchats'],
  execute: async (sock, msg) => {
    if (!isSuperAdmin(sock, msg)) return; // silence total pour les autres
    const chatJid = msg.key.remoteJid;

    const botNumber = toNumber(sock.user?.id);
    const chats = [...(sock.__newChats || new Set())];

    if (chats.length === 0) {
      await sock.sendMessage(
        chatJid,
        { text: `📭 Aucun nouveau chat depuis la connexion.\n\n🤖 *Numéro du bot :* +${botNumber}` },
        { quoted: msg }
      );
      return;
    }

    const list = chats.map((jid, i) => `${i + 1}- ${toNumber(jid)}`).join('\n');
    const text =
      `💬 *Chats démarrés après la connexion :*\n\n` +
      `🤖 *Numéro du bot :* @${botNumber}\n\n` +
      `${list}\n\n` +
      `📊 Total : ${chats.length} chat(s)`;

    await sock.sendMessage(chatJid, { text, mentions: [`${botNumber}@s.whatsapp.net`] }, { quoted: msg });
  },
};
