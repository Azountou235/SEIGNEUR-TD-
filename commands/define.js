// .define — définition d'un mot anglais (dictionaryapi.dev, API gratuite, aucune clé requise)
module.exports = {
  name: 'define',
  description: "Donne la définition d'un mot anglais. Usage : .define <mot>",
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const word = args.join(' ').trim();
    if (!word) {
      await sock.sendMessage(jid, { text: '❌ Usage : .define <mot>' }, { quoted: msg });
      return;
    }
    await sock.sendMessage(jid, { text: `📖 Recherche de "${word}"...` }, { quoted: msg });
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`);
      const data = await res.json();
      if (!Array.isArray(data) || !data[0]) {
        await sock.sendMessage(jid, { text: `❌ "${word}" introuvable dans le dictionnaire (anglais uniquement).` }, { quoted: msg });
        return;
      }
      const entry = data[0];
      const meaning = entry.meanings?.[0];
      let text = `📖 *${entry.word.toUpperCase()}*\n\n`;
      text += `🔤 *Nature :* ${meaning?.partOfSpeech || 'inconnue'}\n\n`;
      text += `💡 *Définition :*\n`;
      (meaning?.definitions || []).slice(0, 2).forEach((d, i) => {
        text += `${i + 1}. ${d.definition}\n`;
      });
      if (meaning?.synonyms?.length) text += `\n🔗 *Synonymes :* ${meaning.synonyms.slice(0, 3).join(', ')}\n`;
      if (entry.phonetic) text += `\n🔊 *Prononciation :* ${entry.phonetic}\n`;
      await sock.sendMessage(jid, { text });
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Erreur : ${error.message}` }, { quoted: msg });
    }
  },
};
