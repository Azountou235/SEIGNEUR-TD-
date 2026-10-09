// tostatus.js — publie texte/image/vidéo/audio sur TON statut WhatsApp.
// Le statut est envoyé avec une statusJidList (sans elle, WhatsApp ne
// l'affiche à personne).
// Audio -> vidéo stylée : titre animé, waveform, barre de progression + chrono.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadContentFromMessage } = require('@nyxcore/nyxcoresocket');
const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');
const statusLog = require('../utils/statusLog');

const execFileAsync = promisify(execFile);

// ───────────── Réglages du visuel audio ─────────────
const TITLE = 'LE SEIGNEUR DES APPAREILS';
const SUBTITLE = 'PÈRE FONDATEUR DE TOUMAÏ MD';
const TAGS = "EXPERT EN IA  •  PASSIONNÉ D'INFORMATIQUE";
const ACCENT = '0x25D366';
const BACKGROUND = '0x0b1020';

const FONT_CANDIDATES = [
  path.join(__dirname, '../assets/fonts/Poppins-Bold.ttf'), // idéal : mets ta police ici
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
];

// ───────────── Utilitaires ─────────────

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

async function streamToBuffer(mediaObj, type) {
  const stream = await downloadContentFromMessage(mediaObj, type);
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

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tostatus-audio-'));
  const inputPath = path.join(tempDir, 'source-audio');
  const outputPath = path.join(tempDir, 'audio-status.mp4');

  try {
    fs.writeFileSync(inputPath, buffer);

    // Durée illimitée (aucun plafond).
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
    const dt = (file, size, color, x, y) =>
      `drawtext=fontfile=${fontEsc}:textfile=${file}:fontsize=${size}:fontcolor=${color}`
      + `:x=${x}:y=${y}:shadowcolor=black@0.6:shadowx=2:shadowy=2`;

    const graph = [
      // Fond + filets verts en haut et en bas
      `color=c=${BACKGROUND}:s=720x1280:r=25,`
        + `drawbox=x=0:y=0:w=720:h=8:color=${ACCENT}:t=fill,`
        + `drawbox=x=0:y=1272:w=720:h=8:color=${ACCENT}:t=fill[bg]`,
      // Waveform transparente
      `[0:a:0]showwaves=s=640x300:mode=cline:rate=25:colors=${ACCENT},format=rgba,colorkey=0x000000:0.15:0.1[wave]`,
      '[bg][wave]overlay=40:520[b1]',
      // Titres (le titre flotte doucement) + piste de la barre
      `[b1]${dt(tTitle, 38, ACCENT, '(w-text_w)/2', '180+6*sin(2*PI*t/3)')},`
        + `${dt(tSub, 28, 'white', '(w-text_w)/2', '250')},`
        + `${dt(tTags, 22, '0x9CA3AF', '(w-text_w)/2', '300')},`
        + 'drawbox=x=60:y=900:w=600:h=12:color=0x1f2937:t=fill[b2]',
      // Barre verte qui avance + masque à gauche de la piste
      `color=c=${ACCENT}:s=600x12:r=25[bar]`,
      `[b2][bar]overlay=x='60-600+600*t/${Dstr}':y=900,`
        + `drawbox=x=0:y=890:w=60:h=32:color=${BACKGROUND}:t=fill[b3]`,
      // Curseur
      'color=c=white:s=18x30:r=25[knob]',
      `[b3][knob]overlay=x='51+600*t/${Dstr}':y=891[b4]`,
      // Chrono : temps écoulé à gauche, durée totale à droite
      `[b4]${dt(tNow, 30, 'white', '60', '935')},`
        + `${dt(tTotal, 30, '0x9CA3AF', '660-text_w', '935')},format=yuv420p[v]`,
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

// Liste des destinataires du statut :
// 1) les numéros définis avec .setstatusviewers (s'il y en a) ;
// 2) sinon les contacts connus du socket (sock.store) ;
// 3) sinon tous les membres des groupes où le bot est présent.
// Le numéro du bot est toujours ajouté.
async function getStatusJidList(sock) {
  const set = new Set();
  const add = (id) => {
    if (!id || typeof id !== 'string') return;
    if (id.endsWith('@s.whatsapp.net')) set.add(id.replace(/:\d+@/, '@'));
  };

  const viewers = settingsStore.get('statusViewers', []);
  if (viewers.length) {
    viewers.forEach((n) => add(`${String(n).replace(/\D/g, '')}@s.whatsapp.net`));
  } else {
    const contacts = sock.store?.contacts;
    if (contacts) {
      Object.values(contacts).forEach((c) => add(c?.phoneNumber || c?.id));
    }
    if (set.size === 0) {
      try {
        const groups = await sock.groupFetchAllParticipating();
        Object.values(groups || {}).forEach((g) => {
          (g.participants || []).forEach((p) => add(p.phoneNumber || p.id));
        });
      } catch { /* on retombe sur le numéro du bot seul */ }
    }
  }

  add(sock.user?.id);
  return [...set];
}

module.exports = {
  name: 'tostatus',
  description: 'Publie texte/image/vidéo/audio sur ton statut.',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const reply = (text) => sock.sendMessage(chatJid, { text }, { quoted: msg });

    if (!isOwner(msg)) return reply('🚫 Seul le owner peut publier sur le statut.');

    const statusText = args.join(' ').trim();
    const own = unwrapMessage(msg.message);
    const quoted = unwrapMessage(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage);

    const image = own?.imageMessage || quoted?.imageMessage;
    const video = own?.videoMessage || quoted?.videoMessage;
    const audio = own?.audioMessage || quoted?.audioMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;

    if (!image && !video && !audio && !statusText && !quotedText) {
      return reply(
        '📤 Utilisation de *.tostatus* :\n\n' +
        '📝 Texte : *.tostatus Mon texte*\n' +
        '🖼️ Image : réponds à une image\n' +
        '🎬 Vidéo : réponds à une vidéo\n' +
        '🎙️ Audio / vocal : réponds à un audio (converti en vidéo)'
      );
    }

    await sock.sendMessage(chatJid, { react: { text: '⏳', key: msg.key } });

    try {
      const statusJidList = await getStatusJidList(sock);
      if (statusJidList.length === 0) {
        throw new Error('Aucun destinataire trouvé. Ajoutes-en avec .setstatusviewers <numéros>.');
      }

      let content, label;

      if (image) {
        const buffer = await streamToBuffer(image, 'image');
        if (!buffer.length) throw new Error('Média introuvable — transfère-le à nouveau et réessaie.');
        content = { image: buffer, caption: statusText || image.caption || '' };
        label = '🖼️ Image';
      } else if (video) {
        const buffer = await streamToBuffer(video, 'video');
        if (!buffer.length) throw new Error('Média introuvable — transfère-le à nouveau et réessaie.');
        content = { video: buffer, mimetype: 'video/mp4', caption: statusText || video.caption || '' };
        label = '🎬 Vidéo';
      } else if (audio) {
        const audioBuffer = await streamToBuffer(audio, 'audio');
        if (!audioBuffer.length) throw new Error('Média introuvable — transfère-le à nouveau et réessaie.');

        const secs = Number(audio.seconds) || 0;
        if (secs > 120) {
          await reply(`🎞️ Conversion en cours (audio de ${formatTime(secs)})… cela peut prendre quelques minutes.`);
        }

        const videoBuffer = await audioToStatusVideo(audioBuffer);
        content = {
          video: videoBuffer,
          mimetype: 'video/mp4',
          caption: statusText || audio.caption || '',
        };
        label = audio.ptt ? '🎙️ Note vocale (convertie en vidéo)' : '🔊 Audio (converti en vidéo)';
      } else {
        content = { text: statusText || quotedText, backgroundColor: '#000000', font: 0 };
        label = '📝 Texte';
      }

      const sent = await sock.sendMessage('status@broadcast', content, { statusJidList });

      // On garde la clé du statut pour pouvoir le supprimer avec .delstatus.
      if (sent?.key?.id) {
        const preview = String(content.caption || content.text || '').replace(/\s+/g, ' ').trim().slice(0, 30);
        statusLog.add({
          key: { remoteJid: 'status@broadcast', fromMe: true, id: sent.key.id },
          statusJidList,
          label,
          preview,
        });
      } else {
        console.warn('[TOSTATUS] Clé du statut introuvable : suppression impossible avec .delstatus');
      }

      await sock.sendMessage(chatJid, { react: { text: '✅', key: msg.key } });
      await reply(`✅ Statut ${label} publié, visible par ${statusJidList.length} contact(s).`);
    } catch (e) {
      console.error('[TOSTATUS ERROR]', e);
      await sock.sendMessage(chatJid, { react: { text: '❌', key: msg.key } });
      await reply(`❌ Erreur : ${e.message}`);
    }
  },
};
