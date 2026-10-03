// .ytsearch / .yts — recherche de vidéos YouTube (API publique, aucune clé)
module.exports = {
  name: 'ytsearch',
  aliases: ['yts'],
  description: 'Recherche des vidéos YouTube. Usage : .ytsearch <recherche>',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const query = args.join(' ').trim();
    if (!query) {
      await sock.sendMessage(jid, { text: '❌ Usage : .ytsearch <recherche>' }, { quoted: msg });
      return;
    }
    try {
      const res = await fetch(`https://yt.lemnoslife.com/noKey/search?q=${encodeURIComponent(query)}&part=snippet&type=video&maxResults=5`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = data?.items;
      if (!items || items.length === 0) {
        await sock.sendMessage(jid, { text: `❌ Aucun résultat pour *${query}*.` }, { quoted: msg });
        return;
      }
      const list = items.slice(0, 5).map((it, i) => {
        const title = it.snippet?.title || 'Inconnu';
        const channel = it.snippet?.channelTitle || 'Inconnu';
        const videoId = it.id?.videoId;
        const url = videoId ? `https://youtu.be/${videoId}` : 'N/A';
        return `${i + 1}. *${title}*\n   📺 ${channel}\n   🔗 ${url}`;
      }).join('\n\n');
      await sock.sendMessage(jid, { text: `🔍 *YouTube : ${query}*\n\n${list}` }, { quoted: msg });
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Recherche YouTube échouée : ${error.message}` }, { quoted: msg });
    }
  },
};
