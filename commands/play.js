const yts = require('yt-search');
const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = {
  name: 'play',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const query = args.join(' ');

    if (!query) {
      await sock.sendMessage(chatJid, { text: '🎵 Écrivez le nom de la chanson/vidéo après *.play*.\n\nExemple : .play Tiakola Georgio' }, { quoted: msg });
      return;
    }

    let tmpFile;
    try {
      const search = await yts(query);
      const video = search.videos[0];

      if (!video) {
        await sock.sendMessage(chatJid, { text: '❌ Aucun résultat trouvé.' }, { quoted: msg });
        return;
      }

      tmpFile = path.join(os.tmpdir(), `play_${Date.now()}.mp3`);
      await youtubedl(video.url, {
        extractAudio: true,
        audioFormat: 'mp3',
        output: tmpFile,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
      });

      const buffer = fs.readFileSync(tmpFile);
      await sock.sendMessage(chatJid, {
        audio: buffer,
        mimetype: 'audio/mpeg',
        fileName: `${video.title}.mp3`,
      }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec : ${e.message}` }, { quoted: msg });
    } finally {
      if (tmpFile) { try { fs.unlinkSync(tmpFile); } catch (_) {} }
    }
  },
};
