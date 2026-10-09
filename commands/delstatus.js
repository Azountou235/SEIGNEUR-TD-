// delstatus.js — supprime des statuts publiés par .tostatus, selon leur
// ordre de publication (n°1 = le plus ancien encore actif).
//   .delstatus          -> affiche la liste numérotée
//   .delstatus 4        -> supprime le 4ème
//   .delstatus 2 5 7    -> supprime plusieurs
//   .delstatus 3-6      -> supprime une plage
//   .delstatus all      -> supprime tout
const { isOwner } = require('../utils/isOwner');
const statusLog = require('../utils/statusLog');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const timeOf = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function formatList(entries) {
  const lines = entries.map((e, i) => {
    const preview = e.preview ? ` — ${e.preview}` : '';
    return `*${i + 1}.* ${timeOf(e.ts)} • ${e.label}${preview}`;
  });
  return `📋 *Statuts actifs (${entries.length})*\n(1 = le plus ancien)\n\n${lines.join('\n')}\n\n🗑️ *.delstatus 4* · *.delstatus 2 5* · *.delstatus 3-6* · *.delstatus all*`;
}

// "2 5, 7 3-6" -> [2,5,7,3,4,5,6] (ou null si invalide)
function parseNumbers(arg) {
  const out = [];
  for (const part of arg.split(/[\s,]+/).filter(Boolean)) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      let a = +range[1];
      let b = +range[2];
      if (a > b) [a, b] = [b, a];
      if (b - a > 200) return null;
      for (let n = a; n <= b; n++) out.push(n);
    } else if (/^\d+$/.test(part)) {
      out.push(+part);
    } else {
      return null;
    }
  }
  return out.length ? [...new Set(out)] : null;
}

module.exports = {
  name: 'delstatus',
  description: 'Supprime un ou plusieurs statuts publiés par .tostatus (par numéro).',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const reply = (text) => sock.sendMessage(chatJid, { text }, { quoted: msg });

    if (!isOwner(msg)) return reply('🚫 Seul le owner peut supprimer des statuts.');

    const entries = statusLog.list();
    if (entries.length === 0) {
      return reply('ℹ️ Aucun statut enregistré (ou ils ont tous plus de 24 h). Seuls les statuts publiés avec la nouvelle version de *.tostatus* sont suivis.');
    }

    const arg = args.join(' ').trim().toLowerCase();
    if (!arg || arg === 'list' || arg === 'liste') return reply(formatList(entries));

    let targets;
    if (['all', 'tout', 'tous'].includes(arg)) {
      targets = entries;
    } else {
      const nums = parseNumbers(arg);
      if (!nums) return reply('❌ Numéro invalide. Exemples : *.delstatus 4* · *.delstatus 2 5* · *.delstatus 3-6* · *.delstatus all*');
      const bad = nums.filter((n) => n < 1 || n > entries.length);
      if (bad.length) return reply(`❌ Numéro(s) hors liste : ${bad.join(', ')}. Tu as ${entries.length} statut(s) actif(s). Tape *.delstatus* pour voir la liste.`);
      targets = nums.sort((a, b) => a - b).map((n) => entries[n - 1]);
    }

    await sock.sendMessage(chatJid, { react: { text: '⏳', key: msg.key } });

    const done = [];
    const failed = [];
    for (const entry of targets) {
      try {
        await sock.sendMessage(
          'status@broadcast',
          { delete: entry.key },
          { statusJidList: entry.statusJidList },
        );
        statusLog.remove(entry.key.id);
        done.push(entry);
      } catch (e) {
        console.error('[DELSTATUS ERROR]', e);
        failed.push({ entry, error: e.message });
      }
      if (targets.length > 1) await sleep(800);
    }

    await sock.sendMessage(chatJid, { react: { text: failed.length ? '⚠️' : '✅', key: msg.key } });

    const remaining = statusLog.list().length;
    let text = `🗑️ ${done.length} statut(s) supprimé(s).`;
    if (failed.length) text += `\n❌ ${failed.length} échec(s) : ${failed[0].error}`;
    text += `\n\nIl reste ${remaining} statut(s) actif(s). La numérotation est mise à jour : tape *.delstatus* pour revoir la liste.`;
    return reply(text);
  },
};
