// Auto-réponses désactivées (hi, hello, hey, salut, thanks...).
// Pour en réactiver une, ajoute-la ici, par exemple :
//   salut: 'Salut ! 👋',
const TRIGGERS = {};

function getAutoReply(text) {
  if (typeof text !== 'string') return null;
  const normalized = text.trim().toLowerCase();
  return TRIGGERS[normalized] || null;
}

module.exports = { getAutoReply };
