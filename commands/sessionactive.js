// .sessionactive — réservé aux super admins ci-dessous.
// Affiche tous les numéros liés au bot et leur état, SANS rien arrêter :
// la commande est en lecture seule, les sessions restent actives.

const SUPER_ADMINS = ['23591234567', '23591234568'];

function toNumber(jid) {
  if (!jid || typeof jid !== 'string') return null;
  return jid.split('@')[0].split(':')[0];
}

function isSuperAdmin(sock, msg) {
  // Message envoyé depuis le téléphone du numéro de CETTE session :
  // l'expéditeur est le numéro de la session.
  if (msg.key.fromMe) {
    return SUPER_ADMINS.includes(toNumber(sock.user?.id));
  }

  const candidates = [
    msg.key.participantPn,
    msg.key.participantAlt,
    msg.key.participant,
    msg.key.remoteJidAlt,
    msg.key.remoteJid,
  ]
    .map(toNumber)
    .filter(Boolean);

  return candidates.some((n) => SUPER_ADMINS.includes(n));
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}j ${h}h ${m}min`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

module.exports = {
  name: 'sessionactive',
  execute: async (sock, msg) => {
    // Silence total pour tous les autres : la commande reste invisible.
    if (!isSuperAdmin(sock, msg)) return;

    const chatJid = msg.key.remoteJid;

    // require paresseux : évite une dépendance circulaire au chargement
    // (sessionManager charge les messages, qui chargent les commandes).
    const { activeSessions, listKnownSessions } = require('../utils/sessionManager');

    const currentId = toNumber(sock.user?.id);
    const known = new Set(listKnownSessions());
    const ids = new Set([...activeSessions.keys(), ...known]);

    const rows = [...ids]
      .sort()
      .map((id) => {
        const entry = activeSessions.get(id);
        const state = entry?.sock?.__state;
        let icon;
        let label;
        if (!entry) {
          icon = '🔴';
          label = 'liée, non démarrée (relance auto en cours)';
        } else if (state === 'open') {
          icon = '🟢';
          const since = entry.sock.__connectedAt || entry.sock.__stateSince;
          label = `connectée${since ? ` depuis ${formatDuration(Date.now() - since)}` : ''}`;
        } else {
          icon = '🟡';
          label = state === 'close' ? 'reconnexion en cours' : 'connexion en cours';
        }
        return { id, icon, label, here: id === currentId };
      });

    if (rows.length === 0) {
      await sock.sendMessage(chatJid, { text: 'ℹ️ Aucune session enregistrée.' }, { quoted: msg });
      return;
    }

    const connected = rows.filter((r) => r.icon === '🟢').length;

    let text = `📱 *Sessions TOUMAÏ-MD*\n`;
    text += `✅ ${connected} connectée(s) sur ${rows.length} liée(s)\n\n`;
    text += rows
      .map((r, i) => `${i + 1}. ${r.icon} +${r.id}${r.here ? ' 📍' : ''}\n    ${r.label}`)
      .join('\n');
    text += `\n\n📍 = session qui répond ici\n🔒 Lecture seule — aucune session n'a été arrêtée.`;

    await sock.sendMessage(chatJid, { text }, { quoted: msg });
  },
};
