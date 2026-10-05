// .open <numéro> — relance une session arrêtée avec .stop
// Réservé aux deux super admins, utilisable depuis n'importe quel chat.
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
  name: 'open',
  execute: async (sock, msg, args, commands) => {
    if (!isSuperAdmin(sock, msg)) return; // silence total pour les autres
    const chatJid = msg.key.remoteJid;
    const reply = (t) => sock.sendMessage(chatJid, { text: t }, { quoted: msg });

    const target = (args[0] || '').replace(/\D/g, '');
    if (!target) {
      await reply('❌ Usage : .open <numéro>\nEx : .open 23591234567');
      return;
    }

    await reply(`🔄 Relance de la session +${target} en cours...`);
    try {
      const { resumeSession } = require('../utils/sessionManager');
      const ok = await resumeSession(target, commands);
      if (!ok) {
        await reply(`❌ Le numéro +${target} ne correspond à aucune session connue du bot (jamais liée ici).`);
        return;
      }
      await reply(`✅ Session +${target} relancée.`);
    } catch (error) {
      await reply(`❌ Échec de la relance : ${error.message}`);
    }
  },
};
