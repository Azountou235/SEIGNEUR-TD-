/**
 * .gcstatus — publie un statut natif dans un groupe WhatsApp.
 * Le socket doit être créé par @nyxcore/nyxcoresocket, qui ajoute
 * sock.sendGroupStatus() à l'API Baileys.
 */
const { downloadContentFromMessage } = require('@nyxcore/nyxcoresocket');
const { isOwner } = require('../utils/isOwner');

const COLORS = {
  noir: '#000000',
  blanc: '#FFFFFF',
  rouge: '#FF0000',
  vert: '#25D366',
  bleu: '#0000FF',
  jaune: '#FFFF00',
  violet: '#800080',
  orange: '#FFA500',
  rose: '#FF69B4',
  gris: '#808080',
};

function parseColor(input) {
  if (!input) return null;
  const key = input.toLowerCase().trim();
  if (COLORS[key]) return COLORS[key];
  const match = key.match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1]}` : null;
}

function randomColor() {
  return `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`;
}

function unwrapMessage(raw) {
  if (!raw) return null;
  let message = raw;

  for (let i = 0; i < 5; i++) {
    const next =
      message.ephemeralMessage?.message ||
      message.viewOnceMessageV2Extension?.message ||
      message.viewOnceMessageV2?.message ||
      message.viewOnceMessage?.message ||
      message.documentWithCaptionMessage?.message;
    if (!next) break;
    message = next;
  }

  return message;
}

function getMediaType(message) {
  if (message?.imageMessage) return 'imageMessage';
  if (message?.videoMessage) return 'videoMessage';
  if (message?.audioMessage) return 'audioMessage';
  return null;
}

async function downloadMediaBuffer(mediaContent, type) {
  const stream = await downloadContentFromMessage(mediaContent, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function audioToStatusVideo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Aucune donnée audio téléchargée.');
  }

  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execFile } = require('child_process');
  const { promisify } = require('util');

  let ffmpegPath = 'ffmpeg';
  try {
    ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
  } catch {
    // Utilise ffmpeg du système si le paquet n'est pas disponible.
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcstatus-audio-'));
  const inputPath = path.join(tempDir, 'source-audio');
  const outputPath = path.join(tempDir, 'audio-status.mp4');

  try {
    fs.writeFileSync(inputPath, buffer);
    await promisify(execFile)(
      ffmpegPath,
      [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', inputPath,
        '-filter_complex',
        '[0:a:0]showwaves=s=640x280:mode=line:rate=25:colors=0x25D366[wave];color=c=0x111827:s=720x1280:r=25[bg];[bg][wave]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]',
        '-map', '[v]', '-map', '0:a:0',
        '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage',
        '-pix_fmt', 'yuv420p',
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '128k',
        '-ar', '48000', '-ac', '2',
        '-shortest', '-movflags', '+faststart', outputPath,
      ],
      { timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
    );

    const video = fs.readFileSync(outputPath);
    if (!video.length) {
      throw new Error('La conversion audio → vidéo a produit un fichier vide.');
    }
    return video;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Utilise la méthode native fournie par le fork Nyx.
 * Elle gère elle-même l'upload du média et l'enveloppe groupStatusMessageV2.
 */
async function postNativeGroupStatus(sock, groupJid, content, color) {
  if (typeof sock.sendGroupStatus !== 'function') {
    throw new Error(
      "sendGroupStatus() est absent du socket. Vérifie que package.json utilise Nyx et que le bot a été redémarré.",
    );
  }

  if (content.text) {
    return sock.sendGroupStatus(
      groupJid,
      { text: content.text },
      { backgroundColor: color || randomColor(), font: 2 },
    );
  }

  const mediaContent = {};
  if (content.image) mediaContent.image = content.image;
  if (content.video) mediaContent.video = content.video;
  if (content.caption) mediaContent.caption = content.caption;

  if (!mediaContent.image && !mediaContent.video) {
    throw new Error('Aucun type de média valide fourni.');
  }

  return sock.sendGroupStatus(groupJid, mediaContent);
}

module.exports = {
  name: 'gcstatus',
  description: 'Publie un statut natif dans un groupe (texte, image, vidéo ou audio).',

  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const senderJid = msg.key.participant || msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(
        chatJid,
        { text: '🚫 Seul le owner peut utiliser cette commande.' },
        { quoted: msg },
      );
      return;
    }

    const quotedContext =
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.imageMessage?.contextInfo ||
      msg.message?.videoMessage?.contextInfo;
    const quotedMessage = unwrapMessage(quotedContext?.quotedMessage);
    const directMessage = unwrapMessage(msg.message);
    const directMediaType = getMediaType(directMessage);
    const quotedMediaType = getMediaType(quotedMessage);
    const sourceMessage = directMediaType ? directMessage : quotedMessage;
    const sourceMediaType = directMediaType || quotedMediaType;
    const fullArgs = args.join(' ').trim();

    let targetGroupId = null;
    let textInput = '';
    let colorInput = '';

    function splitTextAndColor(input) {
      const lastComma = input.lastIndexOf(',');
      if (lastComma === -1) return { text: input, color: '' };

      const candidateText = input.slice(0, lastComma).trim();
      const candidateColor = input.slice(lastComma + 1).trim();
      if (candidateText && parseColor(candidateColor)) {
        return { text: candidateText, color: candidateColor };
      }
      return { text: input, color: '' };
    }

    if (chatJid.endsWith('@g.us')) {
      targetGroupId = chatJid;
      const split = splitTextAndColor(fullArgs);
      textInput = split.text;
      colorInput = split.color;
    } else if (fullArgs.includes('@g.us')) {
      const firstComma = fullArgs.indexOf(',');
      targetGroupId =
        firstComma === -1
          ? fullArgs.trim()
          : fullArgs.slice(0, firstComma).trim();
      const rest = firstComma === -1 ? '' : fullArgs.slice(firstComma + 1).trim();
      const split = splitTextAndColor(rest);
      textInput = split.text;
      colorInput = split.color;
    } else if (!sourceMediaType) {
      await sock.sendMessage(
        chatJid,
        {
          text:
            '⚠️ Utilise la commande depuis le groupe ou précise son JID.\n\n' +
            '• Dans le groupe : .gcstatus Texte\n' +
            '• Couleur : .gcstatus Texte, rouge\n' +
            '• Depuis un DM : .gcstatus 123@g.us, Texte, rouge\n' +
            '• Réponds à une image/vidéo/audio avec .gcstatus',
        },
        { quoted: msg },
      );
      return;
    }

    if (!targetGroupId && sourceMediaType && fullArgs.endsWith('@g.us')) {
      targetGroupId = fullArgs;
    }

    if (!targetGroupId || !targetGroupId.endsWith('@g.us')) {
      await sock.sendMessage(
        chatJid,
        { text: '❌ Le JID du groupe doit se terminer par @g.us (ex. 123456789-123456@g.us).' },
        { quoted: msg },
      );
      return;
    }

    if (!textInput && !sourceMediaType) {
      await sock.sendMessage(
        chatJid,
        {
          text:
            '📤 Envoie un texte, joins un média avec .gcstatus en légende, ' +
            'ou réponds à une image/vidéo/audio.\n\n' +
            `Couleurs texte : ${Object.keys(COLORS).join(', ')} ou #RRGGBB`,
        },
        { quoted: msg },
      );
      return;
    }

    await sock.sendMessage(chatJid, { react: { text: '⏳', key: msg.key } });

    try {
      let content;
      let label;

      if (sourceMediaType === 'imageMessage') {
        const media = sourceMessage.imageMessage;
        const buffer = await downloadMediaBuffer(media, 'image');
        if (!buffer.length) throw new Error('Image vide ou indisponible; transfère-la à nouveau.');
        content = { image: buffer, caption: textInput || media.caption || '' };
        label = '🖼️ Image';
      } else if (sourceMediaType === 'videoMessage') {
        const media = sourceMessage.videoMessage;
        const buffer = await downloadMediaBuffer(media, 'video');
        if (!buffer.length) throw new Error('Vidéo vide ou indisponible; transfère-la à nouveau.');
        content = { video: buffer, caption: textInput || media.caption || '' };
        label = '🎬 Vidéo';
      } else if (sourceMediaType === 'audioMessage') {
        const media = sourceMessage.audioMessage;
        const buffer = await downloadMediaBuffer(media, 'audio');
        if (!buffer.length) throw new Error('Audio vide ou indisponible; transfère-le à nouveau.');
        const video = await audioToStatusVideo(buffer);
        content = { video, caption: textInput || '' };
        label = media.ptt
          ? '🎙️ Note vocale convertie en vidéo'
          : '🔊 Audio converti en vidéo';
      } else {
        content = { text: textInput };
        label = '📝 Texte';
      }

      await postNativeGroupStatus(
        sock,
        targetGroupId,
        content,
        parseColor(colorInput),
      );

      await sock.sendMessage(chatJid, { react: { text: '✅', key: msg.key } });
      await sock.sendMessage(senderJid, {
        text: `✅ Statut natif ${label} envoyé au groupe.`,
      });
    } catch (error) {
      console.error('[GCSTATUS ERROR]', error);
      await sock.sendMessage(chatJid, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(senderJid, {
        text: `❌ Échec de publication : ${error.message}`,
      });
    }
  },
};
