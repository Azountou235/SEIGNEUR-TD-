// .stop <numéro> — arrête une session du bot SANS supprimer ses fichiers.
// Réservé aux deux super admins, utilisable depuis n'importe quel chat
// (privé ou groupe) sur n'importe laquelle des sessions.
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
  name: 'stop',
  execute: async (sock, msg, args) => {
    if (!isSuperAdmin(sock, msg)) return; // silence total pour les autres
    const chatJid = msg.key.remoteJid;
    const reply = (t) => sock.sendMessage(chatJid, { text: t }, { quoted: msg });

    const target = (args[0] || '').replace(/\D/g, '');
    if (!target) {
      await reply('❌ Usage : .stop <numéro>\nEx : .stop 23591234567');
      return;
    }

    const { listKnownSessions, pauseSession } = require('../utils/sessionManager');
    if (!listKnownSessions().includes(target)) {
      await reply(`❌ Le numéro +${target} ne correspond à aucune session connue du bot.`);
      return;
    }

    pauseSession(target);
    await reply(`🛑 Session +${target} arrêtée.\n\nElle ne sera PAS relancée automatiquement.\nPour la relancer : .open ${target}`);
  },
};
