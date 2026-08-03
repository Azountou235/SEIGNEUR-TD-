'use strict';

const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

const REPO   = 'Azountou235/SEIGNEUR-TD-';
const BRANCH = 'main';
const headers = { Accept: 'application/vnd.github.v3+json' };

const SHA_MARKER_PATH = path.join(__dirname, '..', 'config', '.last_update_sha');
const SYNCED_FOLDERS = ['commands', 'utils', 'events'];

async function fetchFolder(repoFolder, localFolder) {
  try {
    const files = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${repoFolder}?ref=${BRANCH}`,
      { headers }
    ).then(r => r.json());

    if (!Array.isArray(files)) {
      console.warn(`⚠️ ${repoFolder}: unexpected response, skipping`);
      return;
    }
    if (!fs.existsSync(localFolder)) fs.mkdirSync(localFolder, { recursive: true });

    for (const file of files) {
      if (!file.name.endsWith('.js') && !file.name.endsWith('.json')) continue;
      if (!file.download_url) continue;
      const code = await fetch(file.download_url).then(r => r.text());
      fs.writeFileSync(path.join(localFolder, file.name), code, 'utf8');
      console.log(`  ↳ updated ${repoFolder}/${file.name}`);
    }
  } catch (err) {
    console.warn(`⚠️ Failed to fetch ${repoFolder}:`, err.message);
  }
}

async function fetchCore() {
  console.log('🔄 Fetching latest commands from GitHub...');
  await fetchFolder('commands', path.join(__dirname, '..', 'commands'));
  console.log('✅ Commands fetched and updated successfully');
}

/** Returns the latest commit SHA on BRANCH, or null on failure. */
async function getLatestRemoteSha() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/commits/${BRANCH}`,
      { headers }
    ).then(r => r.json());
    return res?.sha || null;
  } catch (err) {
    console.warn('⚠️ Failed to check latest commit:', err.message);
    return null;
  }
}

function getLocalSha() {
  try {
    return fs.readFileSync(SHA_MARKER_PATH, 'utf8').trim();
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
 * Checks GitHub for a newer commit than the last one we synced.
 * Returns { hasUpdate, remoteSha, localSha }.
 */
async function checkForUpdate() {
  const remoteSha = await getLatestRemoteSha();
  const localSha = getLocalSha();
  return { hasUpdate: !!remoteSha && remoteSha !== localSha, remoteSha, localSha };
}

/** Pulls every synced folder from GitHub and records the new commit SHA. */
async function applyUpdate(remoteSha) {
  for (const folder of SYNCED_FOLDERS) {
    await fetchFolder(folder, path.join(__dirname, '..', folder));
  }
  if (remoteSha) setLocalSha(remoteSha);
}

module.exports = { fetchCore, checkForUpdate, applyUpdate, getLatestRemoteSha };
