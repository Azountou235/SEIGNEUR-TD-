// gcstatus.js — publie texte/image/vidéo/audio en statut, visible par les
// membres du groupe. Reprend les bonnes idées envoyées par un ami (couleurs
// hex, conversion audio→vidéo, déballage des messages vue unique), MAIS
// sans aucune dépendance externe : pas de "@nyxcore/nyxcoresocket", pas de
// sock.sendGroupStatus() — cette fonction n'existe nulle part dans Baileys
// standard. On utilise l'API officielle et stable de Baileys
// (sock.sendMessage vers 'status@broadcast'), déjà éprouvée sur
// togroupstatus.js.
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');

const COLORS = {
  noir: '#000000', blanc: '#FFFFFF', rouge: '#FF0000', vert: '#25D366',
  bleu: '#0000FF', jaune: '#FFFF00', violet: '#800080', orange: '#FFA500',
  rose: '#FF69B4', gris: '#808080',
};

// Accepte un nom de couleur OU un code hex (#rrggbb / rrggbb).
function parseColor(input) {
  if (!input) return null;
  const key = input.toLowerCase().trim();
  if (COLORS[key]) return COLORS[key];
  const hexMatch = key.match(/^#?([0-9a-f]{6})$/i);
  if (hexMatch) return `#${hexMatch[1]}`;
  return null;
}

function randomColor() {
  return '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
}

// Déballe viewOnce / ephemeral / documentWithCaption pour atteindre le
// vrai contenu cité.
function unwrapMessage(raw) {
  if (!raw) return null;
  let message = raw;
  for (let i = 0; i < 5; i++) {
    const next = message.ephemeralMessage?.message
      || message.viewOnceMessageV2Extension?.message
      || message.viewOnceMessageV2?.message
      || message.viewOnceMessage?.message
      || message.documentWithCaptionMessage?.message;
    if (!next) break;
    message = next;
  }
  return message;
}

async function downloadMediaBuffer(mediaContent, type) {
  const stream = await downloadContentFromMessage(mediaContent, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Convertit un audio en vraie vidéo de statut (fond sombre + waveform),
// via ffmpeg-static — déjà présent dans package.json pour .tts/.shazam.
async function audioToStatusVideo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Aucune donnée audio téléchargée.');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  let FFMPEG_PATH = 'ffmpeg';
  try { FFMPEG_PATH = require('ffmpeg-static') || 'ffmpeg'; } catch { /* binaire système */ }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcstatus-audio-'));
  const inputPath = path.join(tempDir, 'source-audio');
  const outputPath = path.join(tempDir, 'audio-status.mp4');
  try {
    fs.writeFileSync(inputPath, buffer);
    await promisify(execFile)(FFMPEG_PATH, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputPath,
      '-filter_complex',
      '[0:a:0]showwaves=s=640x280:mode=line:rate=25:colors=0x25D366[wave];color=c=0x111827:s=720x1280:r=25[bg];[bg][wave]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]',
      '-map', '[v]', '-map', '0:a:0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage',
      '-pix_fmt', 'yuv420p',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      '-shortest', '-movflags', '+faststart', outputPath,
    ], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const video = fs.readFileSync(outputPath);
    if (!video.length) throw new Error('La conversion audio → vidéo a produit un fichier vide.');
    return video;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// Publie via l'API standard et stable de Baileys : un statut personnel,
// visible uniquement par les membres du groupe ciblé.
async function postScopedStatus(sock, groupId, content, color) {
  const metadata = await sock.groupMetadata(groupId);
  const recipients = metadata.participants
    .map((p) => p.id)
    .filter((id) => id && id.endsWith('@s.whatsapp.net'));
  const me = (sock.user?.id || '').split(':')[0] + '@s.whatsapp.net';
  if (!recipients.includes(me)) recipients.push(me);

  await sock.sendMessage('status@broadcast', content, {
    backgroundColor: color || randomColor(),
    font: 2,
    statusJidList: recipients,
    broadcast: true,
  });
  return recipients.length;
}

module.exports = {
  name: 'gcstatus',
  description: 'Publie texte/image/vidéo/audio en statut, visible par les membres du groupe.',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(jid, { text: '🚫 Seul le owner peut faire ça.' }, { quoted: msg });
      return;
    }

    const quotedMessage = unwrapMessage(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage);
    const fullArgs = args.join(' ').trim();
    let targetGroupId = null;
    let textInput = '';
    let colorInput = '';

    function splitTextAndColor(input) {
      const lastComma = input.lastIndexOf(',');
      if (lastComma === -1) return { text: input, color: '' };
      const candidateText = input.slice(0, lastComma).trim();
      const candidateColor = input.slice(lastComma + 1).trim();
      const isKnownColor = candidateColor && parseColor(candidateColor) !== null;
      if (isKnownColor && candidateText) return { text: candidateText, color: candidateColor };
      return { text: input, color: '' };
    }

    if (jid.endsWith('@g.us')) {
      targetGroupId = jid;
      const split = splitTextAndColor(fullArgs);
      textInput = split.text;
      colorInput = split.color;
    } else if (fullArgs.includes('@g.us')) {
      const firstComma = fullArgs.indexOf(',');
      const groupId = firstComma === -1 ? fullArgs.trim() : fullArgs.slice(0, firstComma).trim();
      const rest = firstComma === -1 ? '' : fullArgs.slice(firstComma + 1).trim();
      const split = splitTextAndColor(rest);
      targetGroupId = groupId;
      textInput = split.text;
      colorInput = split.color;
    } else if (!quotedMessage) {
      await sock.sendMessage(jid, {
        text: `⚠️ Utilise depuis le groupe ou précise le JID.\n\n📋 Usage :\n• Dans le groupe : *.gcstatus Texte*\n• Avec couleur : *.gcstatus Texte, rouge*\n• Depuis DM : *.gcstatus 123@g.us, Texte, rouge*\n• Hex : *.gcstatus Texte, #ff8800*\n\nCouleurs : ${Object.keys(COLORS).join(', ')}`,
      }, { quoted: msg });
      return;
    }

    if (!targetGroupId && quotedMessage && fullArgs.endsWith('@g.us')) {
      targetGroupId = fullArgs;
    }

    if (!targetGroupId || !targetGroupId.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '❌ Le JID du groupe doit se terminer par @g.us (ex : 123456789-123456@g.us)' }, { quoted: msg });
      return;
    }

    if (!textInput && !quotedMessage) {
      await sock.sendMessage(sender, {
        text: `📤 Envoie un texte ou réponds à un média.\n\n📋 Exemples :\n• *.gcstatus Salut le groupe!*\n• *.gcstatus Salut!, noir*\n• *.gcstatus Salut!, #ff8800*\n• Réponds à une image/vidéo/audio\n\nCouleurs : ${Object.keys(COLORS).join(', ')}`,
      }, { quoted: msg });
      return;
    }

    await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

    try {
      let content, label, color = parseColor(colorInput);

      if (quotedMessage?.imageMessage) {
        const buffer = await downloadMediaBuffer(quotedMessage.imageMessage, 'image');
        if (!buffer.length) throw new Error('Média introuvable sur les serveurs WhatsApp — transfère-le à nouveau et réessaie.');
        content = { image: buffer, caption: quotedMessage.imageMessage.caption || '' };
        label = '🖼️ Image';
      } else if (quotedMessage?.videoMessage) {
        const buffer = await downloadMediaBuffer(quotedMessage.videoMessage, 'video');
        if (!buffer.length) throw new Error('Média introuvable sur les serveurs WhatsApp — transfère-le à nouveau et réessaie.');
        content = { video: buffer, caption: quotedMessage.videoMessage.caption || '' };
        label = '🎬 Vidéo';
      } else if (quotedMessage?.audioMessage) {
        const buffer = await downloadMediaBuffer(quotedMessage.audioMessage, 'audio');
        if (!buffer.length) throw new Error('Média introuvable sur les serveurs WhatsApp — transfère-le à nouveau et réessaie.');
        const videoBuffer = await audioToStatusVideo(buffer);
        content = { video: videoBuffer };
        label = quotedMessage.audioMessage.ptt ? '🎙️ Note vocale (convertie en vidéo)' : '🔊 Audio (converti en vidéo)';
      } else {
        content = { text: textInput };
        label = `📝 Texte${color ? ` (couleur : ${colorInput})` : ''}`;
      }

      const count = await postScopedStatus(sock, targetGroupId, content, color);
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
      await sock.sendMessage(sender, { text: `✅ Statut ${label} publié, visible par ${count} membre(s).` });
    } catch (e) {
      console.error('[GCSTATUS ERROR]', e);
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(sender, { text: `❌ Erreur : ${e.message}` });
    }
  },
};
