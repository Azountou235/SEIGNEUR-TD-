// .robot / .chipmunk / .fast / .reverseaudio / .slow / .nightcore / .earrape
// Effets audio appliqués via ffmpeg. Réponds à une note vocale ou un audio.
// Une seule commande gère tous les effets grâce à l'option "name" choisie.
//
// Remarque : SEIGNEUR-TD a déjà une commande nommée ".reverse" pour la
// recherche d'image inversée (reverse.js). L'effet audio "reverse" est donc
// disponible ici sous l'alias *.reverseaudio* pour éviter le conflit.
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let FFMPEG_PATH = 'ffmpeg';
try { FFMPEG_PATH = require('ffmpeg-static') || 'ffmpeg'; } catch { /* binaire système */ }

function execAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { env: process.env }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

async function applyAudioEffect(sock, msg, filter, label) {
  const jid = msg.key.remoteJid;
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (!quoted || (!quoted.audioMessage && !quoted.videoMessage)) {
    await sock.sendMessage(jid, { text: `❌ Réponds à une note vocale ou un audio pour appliquer l'effet *${label}*.` }, { quoted: msg });
    return;
  }
  await sock.sendMessage(jid, { text: `⏳ Application de l'effet *${label}*...` }, { quoted: msg });
  const inFile = path.join(os.tmpdir(), `effect_in_${Date.now()}.mp3`);
  const outFile = path.join(os.tmpdir(), `effect_out_${Date.now()}.mp3`);
  try {
    const buffer = await downloadMediaMessage(
      { message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } },
      'buffer',
      {}
    );
    fs.writeFileSync(inFile, buffer);
    await execAsync(`"${FFMPEG_PATH}" -y -i "${inFile}" -af "${filter}" "${outFile}"`);
    const result = fs.readFileSync(outFile);
    await sock.sendMessage(jid, { audio: result, mimetype: 'audio/mpeg', ptt: !!quoted.audioMessage?.ptt }, { quoted: msg });
  } catch (error) {
    console.error(`[audioeffect:${label}]`, error.message);
    await sock.sendMessage(jid, { text: `❌ Échec de l'effet *${label}* : ${error.message}` }, { quoted: msg });
  } finally {
    for (const f of [inFile, outFile]) { if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch {} } }
  }
}

// On exporte PLUSIEURS commandes à partir du même fichier (le chargeur de
// SEIGNEUR-TD accepte un tableau, comme déjà utilisé pour whatsapp.js).
module.exports = [
  { name: 'robot', description: 'Effet voix robot. Réponds à un audio avec .robot', execute: (s, m) => applyAudioEffect(s, m, 'aecho=0.8:0.88:60:0.4', 'Robot') },
  { name: 'chipmunk', description: 'Effet voix suraiguë (tamia). Réponds à un audio avec .chipmunk', execute: (s, m) => applyAudioEffect(s, m, 'asetrate=44100*1.6,aresample=44100', 'Chipmunk') },
  { name: 'nightcore', description: 'Effet nightcore (plus rapide et aigu). Réponds à un audio avec .nightcore', execute: (s, m) => applyAudioEffect(s, m, 'asetrate=44100*1.25,aresample=44100,bass=g=3', 'Nightcore') },
  { name: 'reverseaudio', aliases: ['audioreverse'], description: "Inverse un audio (joué à l'envers). Réponds à un audio avec .reverseaudio", execute: (s, m) => applyAudioEffect(s, m, 'areverse', 'Reverse') },
  { name: 'slow', description: "Ralentit l'audio à 75% de sa vitesse. Réponds à un audio avec .slow", execute: (s, m) => applyAudioEffect(s, m, 'atempo=0.75', 'Slow') },
  { name: 'fast', description: "Accélère l'audio à 1.5x. Réponds à un audio avec .fast", execute: (s, m) => applyAudioEffect(s, m, 'atempo=1.5', 'Fast') },
  { name: 'earrape', description: "Effet volume extrême (déconseillé au casque). Réponds à un audio avec .earrape", execute: (s, m) => applyAudioEffect(s, m, 'volume=20', 'Earrape') },
];
