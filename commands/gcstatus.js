// gcstatus.js — publie texte/image/vidéo/audio en STATUT DE GROUPE via
// sock.sendGroupStatus() de @nyxcore/nyxcoresocket.
// Audio -> vidéo au style "officiel" WhatsApp : fond coloré, carte arrondie
// translucide, photo de profil + micro, bouton lecture, vraie forme d'onde
// qui se remplit pendant la lecture, point de progression et chrono.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadContentFromMessage } = require('@nyxcore/nyxcoresocket');
const { isOwner } = require('../utils/isOwner');

const execFileAsync = promisify(execFile);

// ───────────── Réglages du visuel audio ─────────────
const SHOW_BRANDING = false; // true = affiche le titre + sous-titre en haut de la vidéo
const TITLE = 'LE SEIGNEUR DES APPAREILS';
const SUBTITLE = 'PÈRE FONDATEUR DE TOUMAÏ MD';

// Couleurs de fond utilisées quand tu n'en précises pas (ambiance WhatsApp).
const STATUS_PALETTE = [
  '#A52C71', '#6C3F8E', '#128C7E', '#0B6E4F', '#C0392B',
  '#1E6FA8', '#8E5A2B', '#2C3E50', '#B5338A', '#4A5ACB',
];

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

// Choisit un ffmpeg qui possède drawtext et geq (ffmpeg-static n'en a pas
// toujours), sinon retombe sur le ffmpeg système.
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
      if (/\bdrawtext\b/.test(stdout) && /\bgeq\b/.test(stdout)) {
        ffmpegCache = bin;
        return bin;
      }
    } catch { /* on essaie le suivant */ }
  }
  throw new Error('ffmpeg avec drawtext/geq introuvable. Installe ffmpeg système (apt install ffmpeg).');
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

// ───────────── Visuel style WhatsApp ─────────────

const hexToRgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToFf = ([r, g, b]) => '0x' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const shade = (rgb, f) => rgb.map((v) => v * f);
const luminance = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

// Carte de 640x100, barres de 5 px tous les 8 px.
const CARD = { x: 40, y: 590, w: 640, h: 100 };
const BARS = { count: 56, x0: 163, pitch: 8, width: 5, maxH: 64, minH: 4 };
const DOT = { size: 18, startX: 152, travel: 459 }; // positions dans la carte

// Forme d'onde réelle : une amplitude (0..1) par barre.
async function getWaveform(ffmpegPath, inputPath, duration) {
  const { count } = BARS;
  const { stdout } = await execFileAsync(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-i', inputPath,
    '-ac', '1', '-ar', '8000', '-f', 's16le', '-',
  ], {
    encoding: 'buffer',
    maxBuffer: Math.ceil(duration * 16000) + 8 * 1024 * 1024,
    timeout: Math.ceil(duration * 500) + 60000,
  });

  const samples = Math.floor(stdout.length / 2);
  if (!samples) return new Array(count).fill(0.2);

  const per = samples / count;
  const rms = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * per);
    const end = Math.min(samples, Math.max(start + 1, Math.floor((i + 1) * per)));
    let sum = 0;
    for (let j = start; j < end; j++) {
      const v = stdout.readInt16LE(j * 2) / 32768;
      sum += v * v;
    }
    rms.push(Math.sqrt(sum / (end - start)));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const ref = sorted[Math.floor(count * 0.95)] || sorted[count - 1] || 1;
  return rms.map((v) => Math.min(1, v / ref) ** 0.8);
}

// Couche ffmpeg : source + masque alpha calculé pixel par pixel (geq).
const layer = (src, alphaExpr, name) =>
  `${src},format=yuva444p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='${alphaExpr}',format=rgba[${name}]`;

// Rectangle arrondi (alpha = opacity 0..255)
function roundedRectAlpha(w, h, r, opacity) {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  return `if(gt(abs(X-${cx}),${hw})*gt(abs(Y-${cy}),${hh}),`
    + `if(lte(hypot(abs(X-${cx})-${hw},abs(Y-${cy})-${hh}),${r}),${opacity},0),${opacity})`;
}

// Récupère la photo de profil du compte (si disponible).
async function fetchAvatar(sock, dir) {
  try {
    if (!sock?.profilePictureUrl || !sock?.user?.id) return null;
    const jid = sock.user.id.replace(/:\d+@/, '@');
    const url = await sock.profilePictureUrl(jid, 'image');
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const file = path.join(dir, 'avatar.img');
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return file;
  } catch {
    return null; // pas de photo : on dessine un rond neutre
  }
}

// Génère card.png (carte + avatar + micro + play) et dot.png (point de progression).
async function buildCardImages(ffmpegPath, dir, style, avatarPath) {
  const { w, h } = CARD;
  const full = (color, alpha, name) => layer(`color=c=${color}:s=${w}x${h}`, alpha, name);
  const avatarAlpha = '255*lte(hypot(X-33.5,Y-33.5),34)';

  const makeCard = async (withAvatar) => {
    const avatarSrc = withAvatar
      ? '[0:v]scale=68:68:force_original_aspect_ratio=increase,crop=68:68'
      : 'color=c=0xC9B79A:s=68x68';

    const graph = [
      layer(`color=c=${style.cardColor}:s=${w}x${h}`, roundedRectAlpha(w, h, 30, style.cardOpacity), 'card'),
      layer(avatarSrc, avatarAlpha, 'avatar'),
      full(style.badge, '255*lte(hypot(X-74,Y-72),15)', 'badge'),
      full('0xFFFFFF', '255*lte(hypot(X-74,Y-min(max(Y,62),68)),5)', 'micbody'),
      full('0xFFFFFF', '255*between(X,73,75)*between(Y,73,80)', 'micstem'),
      full('0xFFFFFF', '255*between(X,70,78)*between(Y,80,82)', 'micbase'),
      full(style.ink, '255*gte(X,106)*lte(X,130)*lte(abs(Y-50),15*(130-X)/24)', 'play'),
      '[card][avatar]overlay=13:16[c1]',
      '[c1][badge]overlay=0:0[c2]',
      '[c2][micbody]overlay=0:0[c3]',
      '[c3][micstem]overlay=0:0[c4]',
      '[c4][micbase]overlay=0:0[c5]',
      '[c5][play]overlay=0:0,format=rgba[out]',
    ].join(';');

    const args = ['-hide_banner', '-loglevel', 'error', '-y'];
    if (withAvatar) args.push('-i', avatarPath);
    args.push('-filter_complex', graph, '-map', '[out]', '-frames:v', '1', path.join(dir, 'card.png'));
    await execFileAsync(ffmpegPath, args, { timeout: 60000 });
  };

  try {
    await makeCard(Boolean(avatarPath));
  } catch (e) {
    if (!avatarPath) throw e;
    await makeCard(false); // photo illisible : on retombe sur le rond neutre
  }

  const dotGraph = layer(
    `color=c=${style.ink}:s=${DOT.size}x${DOT.size}`,
    `255*lte(hypot(X-${(DOT.size - 1) / 2},Y-${(DOT.size - 1) / 2}),${DOT.size / 2})`,
    'out',
  );
  await execFileAsync(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-filter_complex', dotGraph, '-map', '[out]', '-frames:v', '1', path.join(dir, 'dot.png'),
  ], { timeout: 60000 });
}

// Convertit un audio en vraie vidéo de statut (durée illimitée).
// opts = { sock, background: '#rrggbb' }
async function audioToStatusVideo(buffer, opts = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Aucune donnée audio téléchargée.');

  const FFMPEG_PATH = await resolveFfmpeg();
  const FONT = FONT_CANDIDATES.find((f) => fs.existsSync(f));
  if (!FONT) throw new Error('Police introuvable : ajoute assets/fonts/Poppins-Bold.ttf');

  const bgRgb = hexToRgb(opts.background || STATUS_PALETTE[0]);
  const lum = luminance(bgRgb);
  const light = lum > 0.6;
  const veryDark = lum < 0.12;
  const style = {
    ink: light ? '0x1B1B1B' : '0xFFFFFF',
    cardColor: veryDark ? '0xFFFFFF' : '0x000000',
    cardOpacity: light ? 30 : veryDark ? 38 : 97,
    badge: veryDark ? '0x333333' : rgbToFf(shade(bgRgb, 0.55)),
  };

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcstatus-audio-'));
  const inputPath = path.join(tempDir, 'source-audio');
  const outputPath = path.join(tempDir, 'audio-status.mp4');

  try {
    fs.writeFileSync(inputPath, buffer);

    const D = Math.max(1, (await getAudioDuration(FFMPEG_PATH, inputPath)) || 60);
    const Dstr = D.toFixed(2);

    const [amps, avatarPath] = await Promise.all([
      getWaveform(FFMPEG_PATH, inputPath, D),
      fetchAvatar(opts.sock, tempDir),
    ]);
    await buildCardImages(FFMPEG_PATH, tempDir, style, avatarPath);

    // Textes via fichiers : pas de souci d'accents/apostrophes.
    const txt = (name, content) => {
      const p = path.join(tempDir, name);
      fs.writeFileSync(p, content, 'utf8');
      return escPath(p);
    };
    const tNow = txt('now.txt', D >= 3600 ? '%{pts:gmtime:0:%H\\:%M\\:%S}' : '%{pts:gmtime:0:%M\\:%S}');
    const tTotal = txt('total.txt', formatTime(D));
    const fontEsc = escPath(FONT);
    const dt = (file, size, color, x, y, extra = '') =>
      `drawtext=fontfile=${fontEsc}:textfile=${file}:fontsize=${size}:fontcolor=${color}`
      + `:x=${x}:y=${y}${extra ? `:${extra}` : ''}`;

    // Barres : version "pas encore lue" (translucide) + version "lue" (pleine)
    // qui s'allume quand le point de progression passe dessus.
    const cy = CARD.y + CARD.h / 2;
    const dim = [];
    const lit = [];
    amps.forEach((a, i) => {
      let bh = Math.max(BARS.minH, Math.round(a * BARS.maxH));
      bh -= bh % 2;
      const x = CARD.x + BARS.x0 + i * BARS.pitch;
      const y = cy - bh / 2;
      const box = `x=${x}:y=${y}:w=${BARS.width}:h=${bh}`;
      const tk = (((BARS.x0 + i * BARS.pitch + BARS.width / 2) - DOT.startX) / DOT.travel * D).toFixed(2);
      dim.push(`drawbox=${box}:color=${style.ink}@0.38:t=fill`);
      lit.push(`drawbox=${box}:color=${style.ink}:t=fill:enable='gte(t,${tk})'`);
    });

    const dotX = `'${CARD.x + DOT.startX - DOT.size / 2}+${DOT.travel}*t/${Dstr}'`;
    const dotY = cy - DOT.size / 2;
    const barsLeft = CARD.x + BARS.x0;
    const barsRight = CARD.x + BARS.x0 + (BARS.count - 1) * BARS.pitch + BARS.width;

    const brand = SHOW_BRANDING
      ? (() => {
        const tTitle = txt('title.txt', TITLE);
        const tSub = txt('sub.txt', SUBTITLE);
        return `,${dt(tTitle, 36, 'white', '(w-text_w)/2', '170', "alpha='min(1,max(0,t/0.8))'")},`
          + `${dt(tSub, 26, 'white@0.85', '(w-text_w)/2', '224', "alpha='min(1,max(0,(t-0.4)/0.8))'")}`;
      })()
      : '';

    const graph = [
      `color=c=${rgbToFf(bgRgb)}:s=720x1280:r=25[bg]`,
      `[bg][1:v]overlay=${CARD.x}:${CARD.y}[b0]`,
      `[b0]${dim.join(',')},${lit.join(',')}[b1]`,
      `[b1][2:v]overlay=x=${dotX}:y=${dotY}[b2]`,
      `[b2]${dt(tNow, 24, `${style.ink}@0.9`, String(barsLeft), String(CARD.y + CARD.h + 14))},`
        + `${dt(tTotal, 24, `${style.ink}@0.9`, `${barsRight}-text_w`, String(CARD.y + CARD.h + 14))}`
        + `${brand},format=yuv420p[v]`,
    ].join(';');

    await execFileAsync(FFMPEG_PATH, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputPath,
      '-loop', '1', '-framerate', '25', '-i', path.join(tempDir, 'card.png'),
      '-loop', '1', '-framerate', '25', '-i', path.join(tempDir, 'dot.png'),
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
        text: `⚠️ Utilise depuis le groupe ou précise le JID.\n\n📋 Usage :\n• Dans le groupe : *.gcstatus Texte*\n• Avec couleur : *.gcstatus Texte, rouge*\n• Depuis DM : *.gcstatus 123@g.us, Texte, rouge*\n• Hex : *.gcstatus Texte, #ff8800*\n• Audio : réponds à un audio avec *.gcstatus rouge* ou *.gcstatus 123@g.us, rouge*\n\nCouleurs : ${Object.keys(COLORS).join(', ')}`,
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

    // Sur un média, "rouge" tout seul (ou "123@g.us, rouge") veut dire : couleur de fond.
    if (quotedMessage && !colorInput && textInput && parseColor(textInput)) {
      colorInput = textInput;
      textInput = '';
    }

    if (!textInput && !quotedMessage) {
      await sock.sendMessage(sender, {
        text: `📤 Envoie un texte ou réponds à un média.\n\n📋 Exemples :\n• *.gcstatus Salut le groupe!*\n• *.gcstatus Salut!, noir*\n• *.gcstatus Salut!, #ff8800*\n• Réponds à une image/vidéo/audio\n• Audio coloré : *.gcstatus rouge*\n\nCouleurs : ${Object.keys(COLORS).join(', ')}`,
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

        const background = color || STATUS_PALETTE[Math.floor(Math.random() * STATUS_PALETTE.length)];
        const videoBuffer = await audioToStatusVideo(buffer, { sock, background });
        content = { video: videoBuffer, mimetype: 'video/mp4', caption: quotedMessage.audioMessage.caption || '' };
        label = `${quotedMessage.audioMessage.ptt ? '🎙️ Note vocale (convertie en vidéo)' : '🔊 Audio (converti en vidéo)'}${color ? ` (couleur : ${colorInput})` : ''}`;
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
