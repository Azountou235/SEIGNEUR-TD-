/**
 * commands/device.js
 *
 * .device — détecte l'appareil WhatsApp (Android / iOS / Web / Desktop)
 * utilisé par l'expéditeur du message, ou par la personne mentionnée /
 * dont le message est cité.
 *
 * Technique classique et légitime (utilisée par la plupart des bots
 * Baileys) : chaque client WhatsApp génère ses IDs de message selon un
 * format légèrement différent. On ne devine donc PAS le vrai modèle de
 * téléphone, juste la plateforme du client WhatsApp — à titre indicatif,
 * ce n'est pas garanti à 100%.
 */

function getDevicePlatform(id = '') {
  if (!id) return 'Inconnu';
  if (id.startsWith('3EB0')) return 'iOS';
  if (id.startsWith('3A')) return 'iOS (Business)';
  if (id.length === 18) return 'Desktop (WhatsApp Web app)';
  if (id.length === 20) return 'Web (navigateur)';
  if (id.length === 21) return 'iPad';
  if (id.length > 21) return 'Android';
  return 'Inconnu';
}

module.exports = {
  name: 'device',
  aliases: ['platform', 'appareil'],
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;

    // Priorité : utilisateur mentionné > message cité > l'expéditeur lui-même.
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
    const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

    const targetJid = mentioned || quotedParticipant || msg.key.participant || msg.key.remoteJid;
    const targetMsgId = quotedMsgId || msg.key.id;

    const platform = getDevicePlatform(targetMsgId);
    const targetNumber = targetJid.split('@')[0];

    await sock.sendMessage(
      chatJid,
      {
        text: `📱 *Détection d'appareil*\n\n👤 Utilisateur : @${targetNumber}\n💻 Plateforme probable : *${platform}*\n\n_Basé sur le format de l'ID du message — indicatif, pas garanti._`,
        mentions: [targetJid],
      },
      { quoted: msg }
    );
  },
};
