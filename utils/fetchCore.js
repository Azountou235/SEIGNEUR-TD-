'use strict';

/**
 * utils/fetchCore.js — mise à jour du bot depuis GitHub.
 *
 * Toutes les sessions tournent dans le MÊME process et partagent les mêmes
 * fichiers : une seule mise à jour (.update) les met donc à jour toutes.
 *
 * CONFIGURATION (variables d'environnement, aucun secret dans le code) :
 *   GITHUB_REPO    "utilisateur/depot" ou URL complète GitHub
 *                  (défaut : Azountou235/SEIGNEUR-TD-)
 *   GITHUB_BRANCH  branche à suivre (défaut : main)
 *   GITHUB_TOKEN   OBLIGATOIRE si le dépôt est privé (Personal Access Token,
 *                  accès lecture au contenu du dépôt). Aussi lu : GH_TOKEN.
 *
 * CORRECTIFS PAR RAPPORT À L'ANCIENNE VERSION
 *  - Une erreur GitHub (404, jeton refusé, limite d'API...) était avalée :
 *    le bot croyait être à jour alors que rien n'avait été téléchargé.
 *    Maintenant l'erreur est remontée avec une explication claire.
 *  - Le contenu téléchargé était écrit tel quel : une page d'erreur
 *    ("404: Not Found") pouvait remplacer un fichier .js et casser le bot
 *    pour TOUTES les sessions. Maintenant : statut HTTP vérifié, syntaxe
 *    JS / JSON validée AVANT d'écrire, écriture atomique.
 *  - Le commit n'était mémorisé même si des fichiers avaient échoué.
 *    Maintenant il ne l'est que si TOUT s'est bien passé.
 *  - Sauvegarde des fichiers écrasés dans data/update-backup/ (3 dernières
 *    mises à jour conservées) : si un push contient une erreur, on peut
 *    revenir en arrière.
 *  - Timeout sur chaque requête (plus de mise à jour suspendue à l'infini).
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function normalizeRepo(value) {
  const raw = (value || '').trim();
  if (!raw) return 'Azountou235/SEIGNEUR-TD-';
  return raw
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
}

const REPO = normalizeRepo(process.env.GITHUB_REPO);
const BRANCH = (process.env.GITHUB_BRANCH || 'main').trim();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const headers = {
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'toumai-md-updater',
  ...(GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {}),
};

const ROOT = path.join(__dirname, '..');
const SHA_MARKER_PATH = path.join(ROOT, 'config', '.last_update_sha');
const BACKUP_ROOT = path.join(ROOT, 'data', 'update-backup');
const SYNCED_FOLDERS = ['commands', 'utils', 'events'];
const REQUEST_TIMEOUT_MS = 30000;
const KEEP_BACKUPS = 3;

/** Message lisible pour un statut HTTP GitHub. */
function explainHttpError(status) {
  if (status === 404) {
    return GITHUB_TOKEN
      ? `Dépôt "${REPO}" ou branche "${BRANCH}" introuvable (ou le jeton n'a pas accès à ce dépôt).`
      : `Dépôt "${REPO}" introuvable. S'il est PRIVÉ, définis la variable GITHUB_TOKEN sur ton hébergeur.`;
  }
  if (status === 401) return 'GITHUB_TOKEN refusé par GitHub (expiré ou invalide).';
  if (status === 403) return 'GitHub refuse la requête (limite d\'API atteinte ou jeton sans les bons droits).';
  return `GitHub a répondu HTTP ${status}.`;
}

async function ghGet(url) {
  const res = await fetch(url, { headers, timeout: REQUEST_TIMEOUT_MS });
  if (!res.ok) {
    const err = new Error(explainHttpError(res.status));
    err.status = res.status;
    throw err;
  }
  return res;
}

// ─────────────────────────────────────────────────────────────────────────
// Validation avant écriture
// ─────────────────────────────────────────────────────────────────────────

function validateContent(fileName, code) {
  if (!code || !code.trim()) throw new Error('fichier vide');
  if (fileName.endsWith('.json')) {
    JSON.parse(code);
  } else if (fileName.endsWith('.js')) {
    // Compile seulement (n'exécute rien) : détecte une erreur de syntaxe.
    new vm.Script(code, { filename: fileName });
  }
}

function atomicWrite(filePath, content) {
  const tmp = `${filePath}.update-tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

function pruneBackups() {
  try {
    const dirs = fs.readdirSync(BACKUP_ROOT).sort();
    for (const d of dirs.slice(0, Math.max(0, dirs.length - KEEP_BACKUPS))) {
      fs.rmSync(path.join(BACKUP_ROOT, d), { recursive: true, force: true });
    }
  } catch {
    // sans importance
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Téléchargement d'un dossier
// ─────────────────────────────────────────────────────────────────────────

/**
 * Télécharge un dossier du dépôt.
 * @returns {{ changed: string[], failed: {file:string, reason:string}[] }}
 */
async function fetchFolder(repoFolder, localFolder, backupDir) {
  const result = { changed: [], failed: [] };

  let files;
  try {
    files = await ghGet(
      `https://api.github.com/repos/${REPO}/contents/${repoFolder}?ref=${encodeURIComponent(BRANCH)}`
    ).then((r) => r.json());
  } catch (err) {
    result.failed.push({ file: `${repoFolder}/`, reason: err.message });
    return result;
  }

  if (!Array.isArray(files)) {
    result.failed.push({ file: `${repoFolder}/`, reason: 'réponse GitHub inattendue' });
    return result;
  }

  if (!fs.existsSync(localFolder)) fs.mkdirSync(localFolder, { recursive: true });

  for (const file of files) {
    if (file.type !== 'file') continue;
    if (!file.name.endsWith('.js') && !file.name.endsWith('.json')) continue;
    if (!file.download_url) continue;

    const label = `${repoFolder}/${file.name}`;
    try {
      const code = await ghGet(file.download_url).then((r) => r.text());
      validateContent(file.name, code);

      const target = path.join(localFolder, file.name);
      const previous = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
      if (previous === code) continue; // inchangé

      if (previous !== null && backupDir) {
        const backupTarget = path.join(backupDir, repoFolder);
        fs.mkdirSync(backupTarget, { recursive: true });
        fs.writeFileSync(path.join(backupTarget, file.name), previous, 'utf8');
      }

      atomicWrite(target, code);
      result.changed.push(label);
    } catch (err) {
      // Un fichier invalide n'est JAMAIS écrit : l'ancien reste en place.
      result.failed.push({ file: label, reason: err.message });
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// Suivi de version
// ─────────────────────────────────────────────────────────────────────────

/** @returns {{ sha: string|null, error: string|null }} */
async function getLatestRemoteInfo() {
  try {
    const res = await ghGet(
      `https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(BRANCH)}`
    ).then((r) => r.json());
    return { sha: res?.sha || null, error: res?.sha ? null : 'réponse GitHub inattendue' };
  } catch (err) {
    return { sha: null, error: err.name === 'FetchError' ? `Réseau : ${err.message}` : err.message };
  }
}

/** Compatibilité : renvoie seulement le SHA (ou null). */
async function getLatestRemoteSha() {
  return (await getLatestRemoteInfo()).sha;
}

function getLocalSha() {
  try {
    return fs.readFileSync(SHA_MARKER_PATH, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function setLocalSha(sha) {
  try {
    fs.mkdirSync(path.dirname(SHA_MARKER_PATH), { recursive: true });
    fs.writeFileSync(SHA_MARKER_PATH, sha);
  } catch (err) {
    console.warn('⚠️ Failed to save update marker:', err.message);
  }
}

/**
 * Compare le dernier commit GitHub avec celui déjà appliqué.
 * @returns {{ hasUpdate: boolean, remoteSha: string|null, localSha: string|null, error: string|null }}
 */
async function checkForUpdate() {
  const { sha: remoteSha, error } = await getLatestRemoteInfo();
  const localSha = getLocalSha();
  return { hasUpdate: !!remoteSha && remoteSha !== localSha, remoteSha, localSha, error };
}

/**
 * Télécharge commands/, utils/ et events/ depuis GitHub.
 * Le commit n'est mémorisé que si TOUS les fichiers ont réussi.
 * @returns {{ changed: string[], failed: {file:string, reason:string}[], backupDir: string|null }}
 */
async function applyUpdate(remoteSha) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(BACKUP_ROOT, stamp);

  const changed = [];
  const failed = [];

  for (const folder of SYNCED_FOLDERS) {
    const r = await fetchFolder(folder, path.join(ROOT, folder), backupDir);
    changed.push(...r.changed);
    failed.push(...r.failed);
  }

  const hasBackup = fs.existsSync(backupDir);
  if (hasBackup) pruneBackups();

  if (remoteSha && failed.length === 0) setLocalSha(remoteSha);

  return { changed, failed, backupDir: hasBackup ? backupDir : null };
}

/** Mise à jour des commandes seules au démarrage (AUTO_UPDATE_COMMANDS=true). */
async function fetchCore() {
  console.log(`🔄 Fetching latest commands from GitHub (${REPO}@${BRANCH})...`);
  const backupDir = path.join(BACKUP_ROOT, new Date().toISOString().replace(/[:.]/g, '-'));
  const r = await fetchFolder('commands', path.join(ROOT, 'commands'), backupDir);
  if (r.failed.length) {
    for (const f of r.failed) console.warn(`⚠️ ${f.file}: ${f.reason}`);
    console.warn('⚠️ Mise à jour des commandes incomplète — fichiers locaux conservés.');
  } else {
    console.log(`✅ Commands fetched (${r.changed.length} fichier(s) modifié(s))`);
  }
  if (fs.existsSync(backupDir)) pruneBackups();
}

module.exports = {
  fetchCore,
  checkForUpdate,
  applyUpdate,
  getLatestRemoteSha,
  getLatestRemoteInfo,
  REPO,
  BRANCH,
  HAS_TOKEN: !!GITHUB_TOKEN,
};
