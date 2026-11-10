// utils/ffmpeg.js — localise un ffmpeg RÉELLEMENT utilisable.
//
// Pourquoi ce fichier ? `require('ffmpeg-static')` renvoie toujours un chemin,
// même si le binaire n'a jamais été téléchargé (script postinstall bloqué sur
// l'hébergeur) → erreur « spawn .../ffmpeg-static/ffmpeg ENOENT ».
// Ici on VÉRIFIE chaque candidat avant de l'utiliser, et si aucun ne marche on
// tente de télécharger le binaire de ffmpeg-static automatiquement (une fois).
//
// Ordre de recherche :
//   1. variable d'environnement FFMPEG_PATH
//   2. ffmpeg-static (si le binaire existe vraiment)
//   3. @ffmpeg-installer/ffmpeg (binaire embarqué dans le paquet npm)
//   4. ffmpeg installé sur le système (PATH)
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const cache = new Map(); // clé: filtre exigé ('' si aucun) -> chemin validé
let installAttempted = false;

function candidates() {
  const list = [];
  if (process.env.FFMPEG_PATH) list.push(process.env.FFMPEG_PATH);
  try {
    const p = require('ffmpeg-static');
    if (p && fs.existsSync(p)) list.push(p);
  } catch { /* paquet absent */ }
  try {
    const p = require('@ffmpeg-installer/ffmpeg').path;
    if (p && fs.existsSync(p)) list.push(p);
  } catch { /* paquet absent */ }
  list.push('ffmpeg');
  return [...new Set(list)];
}

function run(bin, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function works(bin, filter) {
  // Un chemin absolu doit exister et être exécutable.
  if (path.isAbsolute(bin)) {
    if (!fs.existsSync(bin)) return false;
    try { fs.chmodSync(bin, 0o755); } catch { /* lecture seule : on tente quand même */ }
  }
  const v = await run(bin, ['-version']);
  if (!v.ok) return false;
  if (!filter) return true;
  const f = await run(bin, ['-hide_banner', '-filters']);
  return f.ok && new RegExp(`\\b${filter}\\b`).test(f.stdout);
}

// Télécharge le binaire de ffmpeg-static si le postinstall n'a pas tourné.
async function tryInstallFfmpegStatic() {
  if (installAttempted) return;
  installAttempted = true;
  try {
    const dir = path.dirname(require.resolve('ffmpeg-static'));
    const script = path.join(dir, 'install.js');
    if (!fs.existsSync(script)) return;
    console.log('[ffmpeg] Binaire absent : téléchargement de ffmpeg-static…');
    await run(process.execPath, [script], 3 * 60 * 1000);
  } catch (e) {
    console.error('[ffmpeg] Téléchargement automatique impossible :', e.message);
  }
}

// Renvoie le chemin d'un ffmpeg qui fonctionne (et qui possède `filter` si demandé).
async function ensureFfmpeg({ filter = '' } = {}) {
  if (cache.has(filter)) return cache.get(filter);

  for (let attempt = 0; attempt < 2; attempt++) {
    for (const bin of candidates()) {
      if (await works(bin, filter)) {
        cache.set(filter, bin);
        return bin;
      }
    }
    if (attempt === 0) await tryInstallFfmpegStatic();
  }

  throw new Error(
    filter
      ? `ffmpeg avec le filtre « ${filter} » introuvable. Ajoute la dépendance @ffmpeg-installer/ffmpeg (ou installe ffmpeg système) puis redémarre le bot.`
      : 'ffmpeg introuvable. Ajoute la dépendance @ffmpeg-installer/ffmpeg (ou installe ffmpeg système, ou définis FFMPEG_PATH) puis redémarre le bot.'
  );
}

// Exécute ffmpeg ; rejette avec la dernière ligne utile de stderr.
async function runFfmpeg(args, { timeout = 120000, maxBuffer = 8 * 1024 * 1024 } = {}) {
  const bin = await ensureFfmpeg();
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer }, (error, stdout, stderr) => {
      if (error) {
        const last = String(stderr || '').trim().split('\n').filter(Boolean).pop();
        return reject(new Error(last || error.message));
      }
      resolve();
    });
  });
}

module.exports = { ensureFfmpeg, runFfmpeg, candidates };
