// .askweb — recherche web + réponse IA (nécessite TAVILY_API_KEY et AI_API_KEY)
// Crée un compte gratuit sur https://tavily.com pour TAVILY_API_KEY.
// AI_API_KEY = n'importe quelle API compatible OpenAI (OpenAI, Groq, etc.).
// Sans ces variables d'environnement, la commande répond avec une erreur claire.
const axios = require('axios');

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const AI_API_KEY = process.env.AI_API_KEY;
const AI_API_URL = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const DEFAULT_SYSTEM = 'Tu es un assistant utile. Réponds de façon claire et concise.';

async function callAI(prompt, system) {
  const { data } = await axios.post(
    AI_API_URL,
    { model: AI_MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] },
    { headers: { Authorization: `Bearer ${AI_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 }
  );
  return data?.choices?.[0]?.message?.content || '';
}

async function answer(query, { context = '', search = true, system = DEFAULT_SYSTEM } = {}) {
  let sources = [];
  let tavilyAnswer = '';
  if (search) {
    if (!TAVILY_API_KEY) throw new Error('TAVILY_API_KEY non configurée.');
    const { data } = await axios.post(
      'https://api.tavily.com/search',
      { query: query.slice(0, 400), search_depth: 'basic', max_results: 5, include_answer: true },
      { headers: { Authorization: `Bearer ${TAVILY_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    sources = data?.results || [];
    tavilyAnswer = data?.answer || '';
  }
  let aiAnswer = '';
  if (AI_API_KEY) {
    const parts = [`Date actuelle : ${new Date().toDateString()}`];
    if (context) parts.push(`Contexte :\n${context.slice(0, 6000)}\n`);
    if (sources.length) {
      parts.push('Résultats de recherche :\n' + sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.content}`).join('\n\n'));
    }
    parts.push('Question : ' + query);
    try {
      aiAnswer = await callAI(parts.join('\n\n'), system);
    } catch (error) {
      console.error('[ASKWEB] Échec IA :', error.response?.status, error.response?.data || error.message);
    }
  } else if (!search) {
    throw new Error('Ni AI_API_KEY ni recherche activée : rien à répondre.');
  }
  const text = aiAnswer || tavilyAnswer || sources[0]?.content || '';
  const sourcesList = sources.slice(0, 3).map((s) => `• ${s.title}\n${s.url}`);
  return { text, sources: sourcesList };
}

module.exports = {
  name: 'askweb',
  aliases: ['websearch', 'searchai', 'ask'],
  description: 'Cherche sur le web puis répond avec une IA. Usage : .askweb <question>',
  answer, // exporté pour être réutilisé par d'autres commandes (ex. ocrai)
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const question = args.join(' ').trim();
    if (!question) {
      await sock.sendMessage(jid, { text: '🌐 Usage : *.askweb <question>*\nExemple : .askweb qui a gagné la Ligue des champions 2026 ?' }, { quoted: msg });
      return;
    }
    const wait = await sock.sendMessage(jid, { text: '🔎 Recherche en cours...' }, { quoted: msg });
    try {
      const { text } = await answer(question, { search: true });
      if (!text) {
        await sock.sendMessage(jid, { text: "❌ Aucune réponse trouvée.", edit: wait.key });
        return;
      }
      await sock.sendMessage(jid, { text, edit: wait.key });
    } catch (error) {
      console.error('[ASKWEB ERROR]', error.response?.data, error.message);
      await sock.sendMessage(jid, { text: `❌ ${error.message.includes('non configurée') ? error.message : 'Erreur lors de la recherche.'}`, edit: wait.key });
    }
  },
};
