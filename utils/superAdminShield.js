/**
 * utils/superAdminShield.js
 * -------------------------
 * Protège le numéro super admin 23591234568 (config.protectedNumbers) contre TOUTES
 * les autres sessions : une session d'un autre numéro ne doit pas pouvoir
 *   - récupérer un message supprimé / modifié d'un super admin (antidelete, antiedit),
 *   - ouvrir / récupérer une vue unique envoyée par un super admin
 *     (.cool, .adjib, .auto, réponse emoji/texte sur une vue unique).
 *
 * Seule la session du numéro protégé garde toutes ses fonctions.
 */
const config = require('../config/config');
const { currentSessionId } = require('./sessionContext');

const MARK_LIMIT = 3000;
const marked = new Set();   // `${sessionId}:${messageId}` des messages protégés
const markedVO = new Set(); // idem, uniquement les VUES UNIQUES protégées

// Message prêt à envoyer quand quelqu'un essaie d'ouvrir une vue unique protégée.
const PROTECTED_VIEW_ONCE_TEXT = "🔒 Cette vue unique est protégée : impossible de l'ouvrir ou de la récupérer.";

// Numéros protégés (ne plante jamais, même si config.js n'a pas été mis à jour).
const protectedList = () => (Array.isArray(config.protectedNumbers) && config.protectedNumbers.length
  ? config.protectedNumbers
  : ['23591234568']);

const numberOf = (jid) => (jid ? String(jid).split('@')[0].split(':')[0] : '');
const isSuperNumber = (n) => !!n && protectedList().includes(n); // numéro protégé (23591234568)

// Cette session (le numéro connecté) appartient-elle à un super admin ?
function sessionIsSuperAdmin(sock) {
  return isSuperNumber(numberOf(sock?.user?.id)) || isSuperNumber(numberOf(currentSessionId()));
}

// Le message a-t-il été envoyé par un super admin (≠ cette session) ?
function isFromSuperAdmin(msg) {
  const k = msg?.key || {};
  if (k.fromMe) return false;
  return [k.participantPn, k.participantAlt, k.participant, k.remoteJidAlt, k.remoteJid]
    .some((j) => isSuperNumber(numberOf(j)));
}

// true = cette session n'a PAS le droit de garder / récupérer ce message.
function shouldShield(sock, msg) {
  return isFromSuperAdmin(msg) && !sessionIsSuperAdmin(sock);
}

function markShielded(id, viewOnce = false) {
  if (!id) return;
  marked.add(`${currentSessionId()}:${id}`);
  if (marked.size > MARK_LIMIT) marked.delete(marked.values().next().value);
  if (viewOnce) {
    markedVO.add(`${currentSessionId()}:${id}`);
    if (markedVO.size > MARK_LIMIT) markedVO.delete(markedVO.values().next().value);
  }
}

function isMarkedViewOnce(id) {
  return !!id && markedVO.has(`${currentSessionId()}:${id}`);
}

function isMarkedShielded(id) {
  return !!id && marked.has(`${currentSessionId()}:${id}`);
}

// Pour une réponse (.cool, .adjib, emoji…) : le message CITÉ vient-il d'un
// super admin ? (couvre aussi les JID @lid grâce aux ids marqués à l'arrivée)
function isQuotedShielded(sock, msg) {
  if (sessionIsSuperAdmin(sock)) return false;
  const ctx = msg?.message?.extendedTextMessage?.contextInfo;
  if (!ctx) return false;
  if (isMarkedShielded(ctx.stanzaId)) return true;
  const isGroup = String(msg.key?.remoteJid || '').endsWith('@g.us');
  const who = ctx.participant ? [ctx.participant] : (isGroup ? [] : [msg.key?.remoteJid]);
  return who.some((j) => isSuperNumber(numberOf(j)));
}

module.exports = {
  PROTECTED_VIEW_ONCE_TEXT,
  isMarkedViewOnce,
  shouldShield,
  isFromSuperAdmin,
  sessionIsSuperAdmin,
  markShielded,
  isMarkedShielded,
  isQuotedShielded,
};
