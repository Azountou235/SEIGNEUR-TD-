/**
 * utils/identity.js
 * -----------------
 * TOUMAÏ AI's replies come from an external API which knows nothing about
 * this bot's real creator. Rather than hope a find/replace on the API's
 * text lands correctly every time, we detect when someone is asking about
 * the bot's identity/creator and answer with a fixed, accurate bio instead
 * of calling the external API at all.
 */

const BIO = `Je suis TOUMAÏ AI, un assistant créé par LE SEIGNEUR DES APPAREILS (Mahamat Oumar), un jeune sociologue tchadien passionné d'informatique depuis son plus jeune âge. Grâce à cette passion, il m'a mis en place ici pour répondre à vos questions. Comment puis-je vous aider aujourd'hui ?`;

// Questions qui portent sur l'identité du bot ou de son développeur.
const IDENTITY_PATTERNS = [
  /qui\s+(es|est)[-\s]tu/i,
  /qui\s+t'?a\s+cr[eé][eé]/i,
  /qui\s+est\s+ton\s+d[ée]veloppeur/i,
  /qui\s+est\s+ton\s+cr[ée]ateur/i,
  /c'?est\s+qui\s+ton\s+(d[ée]veloppeur|cr[ée]ateur)/i,
  /qui\s+t'?a\s+(fait|fabriqu[ée]|conçu|programm[ée])/i,
  /ton\s+d[ée]veloppeur\s+c'?est\s+qui/i,
  /\bqui\s+es\s+tu\b/i,
];

function getIdentityReply(question) {
  if (!question) return null;
  const text = question.trim();
  if (!text) return null;
  return IDENTITY_PATTERNS.some((re) => re.test(text)) ? BIO : null;
}

// Nettoie une réponse venue de l'API externe : remplace toute mention de
// l'ancien nom/bio (Keith / développeur kenyan) par la véritable identité.
function sanitizeReply(reply) {
  if (!reply) return reply;
  return reply
    .replace(/Keith AI/gi, 'TOUMAÏ AI')
    .replace(/Keithkeizzah/gi, 'TOUMAÏ')
    .replace(/d[ée]veloppeur\s+k[ée]nyan/gi, "développeur tchadien, LE SEIGNEUR DES APPAREILS (Mahamat Oumar), un jeune sociologue passionné d'informatique")
    .replace(/develop(p?)er\s+from\s+kenya/gi, "développeur tchadien, LE SEIGNEUR DES APPAREILS (Mahamat Oumar)")
    .replace(/cr[ée][ée]\s+par\s+TOUMA[ÏI]/gi, 'créé par LE SEIGNEUR DES APPAREILS (Mahamat Oumar)');
}

module.exports = { getIdentityReply, sanitizeReply, BIO };
