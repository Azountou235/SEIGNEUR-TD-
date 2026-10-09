// gcstatus.js — publie texte/image/vidéo/audio en STATUT DE GROUPE via
// sock.sendGroupStatus() de @nyxcore/nyxcoresocket.
// Audio -> vidéo stylée "néon" : titre qui glisse puis oscille, sous-titre en
// fondu, tags qui pulsent, waveform cyan, barre magenta + curseur doré + chrono.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadContentFromMessage } = require('@nyxcore/nyxcoresocket');
const { isOwner } = require('../utils/isOwner');

const execFileAsync = promisify(execFile);

// ───────────── Réglages du visuel audio ─────────────
const TITLE = 'LE SEIGNEUR DES APPAREILS';
const SUBTITLE = 'PÈRE FONDATEUR DE TOUMAÏ MD';
const TAGS = "EXPERT EN IA  •  PASSIONNÉ D'INFORMATIQUE";

const BACKGROUND = '0x12002b'; // violet très sombre
const GOLD = '0xFFC83D';       // titre + curseur
const CYAN = '0x00E5FF';       // waveform + tags
const MAGENTA = '0xFF2D95';    // barre de progression + filets
const MUTED = '0xB8A9D9';      // texte secondaire (chrono total)

const FONT_CANDIDATES = [
  path.join(__dirname, '../assets/fonts/Poppins-Bold.ttf'), // idéal : mets ta police ici
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
];

const COLORS = {
  noir: '#000000', blanc: '#FFFFFF', rouge: '#FF0000', vert: '#25D366',
  bleu: '#0000FF', jaune: '#FFFF00', violet: '#800080', orange: '#FFA500',
  rose: '#FF69B4', gris: '#808080',
};

// ───────────── Utilitaires ─────────────

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

// "#rrggbb" -> 0xFFrrggbb (format attendu par sendGroupStatus)
function toArgb(hex) {
  return 0xff000000 + parseInt(hex.replace('#', ''), 16);
}

// Déballe viewOnce / ephemeral / documentWithCaption.
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

// Choisit un ffmpeg qui possède le filtre drawtext (ffmpeg-static
// n'en a pas toujours), sinon retombe sur le ffmpeg système.
let ffmpegCache = null;
async function resolveFfmpeg() {
  if (ffmpegCache) return ffmpegCache;
  const candidates = [];
  try {
    const p = require('ffmpeg-static');
    if (p) candidates.push(p);
  } catch { /* pas de ffmpeg-static */ }
  candidates.push('ffmpeg');

  for (const bin of candidates) {
    try {
      const { stdout } = await execFileAsync(bin, ['-hide_banner', '-filters'], { maxBuffer: 4 * 1024 * 1024 });
      if (/\bdrawtext\b/.test(stdout)) {
        ffmpegCache = bin;
        return bin;
      }
    } catch { /* on essaie le suivant */ }
  }
  throw new Error('ffmpeg avec le filtre drawtext introuvable. Installe ffmpeg système (apt install ffmpeg).');
}

// Lit la durée (ffmpeg -i écrit "Duration: 00:01:23.45" sur stderr).
function getAudioDuration(ffmpegPath, inputPath) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-hide_banner', '-i', inputPath], (_e, _o, stderr) => {
      const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr || '');
      resolve(m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0);
    });
  });
}

// Échappe un chemin pour un filtergraph ffmpeg.
const escPath = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');

const formatTime = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

// Convertit un audio en vraie vidéo de statut (durée illimitée).
async function audioToStatusVideo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Aucune donnée audio téléchargée.');

  const FFMPEG_PATH = await resolveFfmpeg();
  const FONT = FONT_CANDIDATES.find((f) => fs.existsSync(f));
  if (!FONT) throw new Error('Police introuvable : ajoute assets/fonts/Poppins-Bold.ttf');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcstatus-audio-'));
  const inputPath = path.join(tempDir, 'source-audio');
  const outputPath = path.join(tempDir, 'audio-status.mp4');

  try {
    fs.writeFileSync(inputPath, buffer);

    const D = Math.max(1, (await getAudioDuration(FFMPEG_PATH, inputPath)) || 60);
    const Dstr = D.toFixed(2);

    // Les textes passent par des fichiers : pas de souci d'accents/apostrophes.
    const txt = (name, content) => {
      const p = path.join(tempDir, name);
      fs.writeFileSync(p, content, 'utf8');
      return escPath(p);
    };
    const tTitle = txt('t1.txt', TITLE);
    const tSub = txt('t2.txt', SUBTITLE);
    const tTags = txt('t3.txt', TAGS);
    const tNow = txt('t4.txt', D >= 3600 ? '%{pts:gmtime:0:%H\\:%M\\:%S}' : '%{pts:gmtime:0:%M\\:%S}');
    const tTotal = txt('t5.txt', `/ ${formatTime(D)}`);

    const fontEsc = escPath(FONT);
    // extra = options supplémentaires (ex : alpha animé)
    const dt = (file, size, color, x, y, extra = '') =>
      `drawtext=fontfile=${fontEsc}:textfile=${file}:fontsize=${size}:fontcolor=${color}`
      + `:x=${x}:y=${y}:shadowcolor=black@0.7:shadowx=2:shadowy=2${extra ? `:${extra}` : ''}`;

    // Animations (t = temps en secondes) :
    //  - titre : glisse depuis la gauche (1er sec) puis oscille doucement
    //  - sous-titre : monte du bas avec un fondu
    //  - tags : pulsation de l'opacité
    const titleX = '(w-text_w)/2-700*exp(-3.5*t)+14*sin(2*PI*t/4)*(1-exp(-3*t))';
    const subY = '262+70*exp(-4*t)';
    const subAlpha = "alpha='min(1,max(0,(t-0.4)/0.8))'";
    const tagsAlpha = "alpha='0.65+0.35*sin(2*PI*t/2)'";

    const graph = [
      // Fond violet + filets magenta en haut et en bas
      `color=c=${BACKGROUND}:s=720x1280:r=25,`
        + `drawbox=x=0:y=0:w=720:h=8:color=${MAGENTA}:t=fill,`
        + `drawbox=x=0:y=1272:w=720:h=8:color=${MAGENTA}:t=fill[bg]`,
      // Waveform cyan transparente
      `[0:a:0]showwaves=s=640x300:mode=cline:rate=25:colors=${CYAN},format=rgba,colorkey=0x000000:0.15:0.1[wave]`,
      '[bg][wave]overlay=40:520[b1]',
      // Titres animés + piste de la barre
      `[b1]${dt(tTitle, 38, GOLD, titleX, '180')},`
        + `${dt(tSub, 28, 'white', '(w-text_w)/2', subY, subAlpha)},`
        + `${dt(tTags, 22, CYAN, '(w-text_w)/2', '312', tagsAlpha)},`
        + 'drawbox=x=60:y=900:w=600:h=12:color=0x2a1650:t=fill[b2]',
      // Barre magenta qui avance + masque à gauche de la piste
      `color=c=${MAGENTA}:s=600x12:r=25[bar]`,
      `[b2][bar]overlay=x='60-600+600*t/${Dstr}':y=900,`
        + `drawbox=x=0:y=890:w=60:h=32:color=${BACKGROUND}:t=fill[b3]`,
      // Curseur doré
      `color=c=${GOLD}:s=18x30:r=25[knob]`,
      `[b3][knob]overlay=x='51+600*t/${Dstr}':y=891[b4]`,
      // Chrono : temps écoulé à gauche, durée totale à droite
      `[b4]${dt(tNow, 30, 'white', '60', '935')},`
        + `${dt(tTotal, 30, MUTED, '660-text_w', '935')},format=yuv420p[v]`,
    ].join(';');

    await execFileAsync(FFMPEG_PATH, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputPath,
      '-filter_complex', graph,
      '-map', '[v]', '-map', '0:a:0',
      '-t', Dstr,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      '-shortest', '-movflags', '+faststart', outputPath,
    ], { timeout: Math.ceil(D * 2000) + 60000, maxBuffer: 8 * 1024 * 1024 });

    const video = fs.readFileSync(outputPath);
    if (!video.length) throw new Error('La conversion audio → vidéo a produit un fichier vide.');
    return video;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  name: 'gcstatus',
  description: 'Publie texte/image/vidéo/audio en statut de groupe.',
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

    if (typeof sock.sendGroupStatus !== 'function') {
      await sock.sendMessage(jid, {
        text: '❌ gcstatus : sendGroupStatus() est introuvable. Vérifie que @nyxcore/nyxcoresocket@0.3.1 est bien installé, puis redémarre le bot.',
      }, { quoted: msg });
      return;
    }

    await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

    try {
      let content, label, options;
      const color = parseColor(colorInput);

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

        const secs = Number(quotedMessage.audioMessage.seconds) || 0;
        if (secs > 120) {
          await sock.sendMessage(jid, {
            text: `🎞️ Conversion en cours (audio de ${formatTime(secs)})… cela peut prendre quelques minutes.`,
          }, { quoted: msg });
        }

        const videoBuffer = await audioToStatusVideo(buffer);
        content = { video: videoBuffer, mimetype: 'video/mp4', caption: quotedMessage.audioMessage.caption || '' };
        label = quotedMessage.audioMessage.ptt ? '🎙️ Note vocale (convertie en vidéo)' : '🔊 Audio (converti en vidéo)';
      } else {
        content = { text: textInput };
        options = { backgroundColor: toArgb(color || randomColor()), font: 2 };
        label = `📝 Texte${color ? ` (couleur : ${colorInput})` : ''}`;
      }

      const sent = options
        ? await sock.sendGroupStatus(targetGroupId, content, options)
        : await sock.sendGroupStatus(targetGroupId, content);
      console.log('[gcstatus] sendGroupStatus id:', sent?.key?.id || 'aucun');

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
      await sock.sendMessage(sender, { text: `✅ Statut de groupe ${label} publié.` });
    } catch (e) {
      console.error('[GCSTATUS ERROR]', e);
      await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
      await sock.sendMessage(sender, { text: `❌ Erreur : ${e.message}` });
    }
  },
};
