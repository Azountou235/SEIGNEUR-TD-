// utils/statusLog.js — journal des statuts publiés par le bot (gardé 24 h,
// comme les statuts WhatsApp eux-mêmes). Stocké dans data/statusLog.json,
// donc conservé après un redémarrage.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data/statusLog.json');
const TTL_MS = 24 * 60 * 60 * 1000;

function read() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function write(list) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list));
  fs.renameSync(tmp, FILE);
}

// Statuts encore actifs, du plus ancien (n°1) au plus récent.
function list() {
  const now = Date.now();
  const all = read();
  const active = all.filter((e) => e?.key?.id && now - e.ts < TTL_MS);
  if (active.length !== all.length) write(active);
  return active.sort((a, b) => a.ts - b.ts);
}

// entry = { key, statusJidList, label, preview }
function add(entry) {
  const current = list();
  current.push({ ts: Date.now(), ...entry });
  write(current);
}

function remove(id) {
  write(read().filter((e) => e?.key?.id !== id));
}

module.exports = { list, add, remove };
