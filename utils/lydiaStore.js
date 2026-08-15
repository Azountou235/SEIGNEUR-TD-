const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/lydia.json');

function load() {
  try {
    if (!fs.existsSync(DATA_PATH)) return {};
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function save(state) {
  try {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[lydiaStore] Failed to save state:', err.message);
  }
}

let state = load();

function enable(chatJid) {
  state[chatJid] = true;
  save(state);
}

function disable(chatJid) {
  delete state[chatJid];
  save(state);
}

function isEnabled(chatJid) {
  return !!state[chatJid];
}

module.exports = { enable, disable, isEnabled };
