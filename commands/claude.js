// .claude — IA générique via l'API déjà utilisée par .gpt (PAS le vrai Claude d'Anthropic)
// ⚠️ Honnêteté : cette commande n'est pas reliée à l'API officielle d'Anthropic.
// Elle appelle la même API générique que .gpt, juste étiquetée "Claude" pour
// correspondre au nom demandé. Pour éviter d'induire tes utilisateurs en
// erreur, dis-leur que ce n'est pas le vrai Claude, ou renomme la commande.
const axios = require('axios');
const { KEITH_BASE } = require('../config/apis');

module.exports = {
  name: 'claude',
  description: "IA conversationnelle générique (étiquetée Claude, mais PAS l'API officielle Anthropic). Usage : .claude <question>",
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const question = args.join(' ').trim();
    if (!question) {
      await sock.sendMessage(jid, { text: '🤖 *CLAUDE*\n\nExemple :\n.claude Raconte-moi une blague' }, { quoted: msg });
      return;
    }
    let wait;
    try {
      wait = await sock.sendMessage(jid, { text: '🤖 Réflexion en cours...' }, { quoted: msg });
      const { data } = await axios.get(`${KEITH_BASE}/ai/gpt?q=${encodeURIComponent(question)}`);
      if (!data.status || !data.result) {
        await sock.sendMessage(jid, { text: "❌ Impossible de générer une réponse.", edit: wait.key });
        return;
      }
      const answer = typeof data.result === 'string' ? data.result : data.result.response || data.result.answer || JSON.stringify(data.result, null, 2);
      const CHUNK = 4000;
      if (answer.length <= CHUNK) {
        await sock.sendMessage(jid, { text: `🤖 *CLAUDE*\n\n${answer}`, edit: wait.key });
      } else {
        await sock.sendMessage(jid, { text: `🤖 *CLAUDE*\n\n${answer.slice(0, CHUNK)}`, edit: wait.key });
        for (let i = CHUNK; i < answer.length; i += CHUNK) {
          await sock.sendMessage(jid, { text: answer.slice(i, i + CHUNK) });
        }
      }
    } catch (error) {
      console.error('[CLAUDE ERROR]', error);
      await sock.sendMessage(jid, { text: "❌ Échec de la réponse." }, { quoted: msg });
    }
  },
};
