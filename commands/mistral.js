// .mistral — IA conversationnelle générique étiquetée "Mistral" (même remarque que claude.js)
const axios = require('axios');
const { KEITH_BASE } = require('../config/apis');
const sessions = new Map();

function getHistory(jid) { return sessions.get(jid) || []; }
function pushHistory(jid, role, content) {
  const h = getHistory(jid);
  h.push({ role, content });
  if (h.length > 20) h.shift();
  sessions.set(jid, h);
}
function buildPrompt(history, question) {
  let prompt = '';
  for (const m of history) prompt += `${m.role === 'user' ? 'Utilisateur' : 'IA'}: ${m.content}\n`;
  return prompt + 'Utilisateur: ' + question;
}

module.exports = {
  name: 'mistral',
  aliases: ['mi'],
  description: 'IA conversationnelle avec mémoire (étiquetée Mistral). Usage : .mistral <question> | .mistral reset',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const text = args.join(' ').trim();
    if (!text) {
      await sock.sendMessage(jid, { text: '🌀 *MISTRAL*\n\nExemple : .mistral <question>\n.mistral reset pour effacer la mémoire' }, { quoted: msg });
      return;
    }
    if (text === 'reset') {
      sessions.delete(jid);
      await sock.sendMessage(jid, { text: '🌀 Mémoire Mistral réinitialisée pour ce chat.' }, { quoted: msg });
      return;
    }
    const wait = await sock.sendMessage(jid, { text: '🌀 Réflexion...' }, { quoted: msg });
    try {
      const prompt = buildPrompt(getHistory(jid), text);
      const { data } = await axios.get(`${KEITH_BASE}/ai/gpt?q=${encodeURIComponent(prompt)}`);
      if (!data.status || !data.result) throw new Error('Pas de réponse.');
      const answer = (typeof data.result === 'string' ? data.result : data.result.response || '').trim();
      pushHistory(jid, 'user', text);
      pushHistory(jid, 'assistant', answer);
      await sock.sendMessage(jid, { text: `🌀 *MISTRAL*\n\n${answer}`, edit: wait.key });
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ ${error.message}`, edit: wait.key });
    }
  },
};
