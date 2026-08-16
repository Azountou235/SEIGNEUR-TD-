const config = require('../config/config');

/**
 * Vérifie si l'expéditeur d'un message est un super admin (config.reactNumbers).
 *
 * Utilise la même chaîne de repli que isOwner.js pour contourner le bug LID
 * de Baileys : dans les groupes, msg.key.participant peut renvoyer un
 * identifiant interne "@lid" au lieu du vrai numéro de téléphone, ce qui
 * ferait échouer la comparaison si on ne prenait que "participant".
 */
function isSuperAdmin(msg) {
  if (msg.key.fromMe) return true;

  const senderJid =
    msg.key.participantPn ||
    msg.key.participantAlt ||
    msg.key.participant ||
    msg.key.remoteJidAlt ||
    msg.key.remoteJid;

  const senderNumber = senderJid.split('@')[0].split(':')[0];
  return config.reactNumbers.includes(senderNumber);
}

module.exports = { isSuperAdmin };
