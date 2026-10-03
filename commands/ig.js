// .ig — télécharge une publication ou un reel Instagram (API publique bk9)
module.exports = {
  name: 'ig',
  aliases: ['insta', 'instagram'],
  description: 'Télécharge une publication/reel Instagram. Usage : .ig <lien>',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const url = args[0];
    if (!url || !url.includes('instagram.com')) {
      await sock.sendMessage(jid, { text: '❌ Usage : .ig <lien Instagram>' }, { quoted: msg });
      return;
    }
    await sock.sendMessage(jid, { text: '⏳ Téléchargement du média Instagram...' }, { quoted: msg });
    try {
      const res = await fetch(`https://api.bk9.dev/download/instagram?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!data.status || !data.BK9 || typeof data.BK9 === 'string') {
        throw new Error('Média introuvable. Vérifie que la publication est publique.');
      }
      const items = Array.isArray(data.BK9) ? data.BK9 : [data.BK9];
      for (const item of items) {
        const mediaUrl = item?.url || item?.video || item?.image || (typeof item === 'string' ? item : null);
        if (!mediaUrl) continue;
        const isVideo = item?.type === 'video' || mediaUrl.includes('.mp4');
        await sock.sendMessage(
          jid,
          isVideo ? { video: { url: mediaUrl }, caption: '📸 Instagram' } : { image: { url: mediaUrl }, caption: '📸 Instagram' },
          { quoted: msg }
        );
      }
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Échec du téléchargement Instagram : ${error.message}` }, { quoted: msg });
    }
  },
};
