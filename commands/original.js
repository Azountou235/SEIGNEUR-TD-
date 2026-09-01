const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');
const editHistory = require('../utils/editHistory');

module.exports = {
  name: 'original',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut utiliser cette commande.' }, { quoted: msg });
      return;
    }

    const first = (args[0] || '').toLowerCase();

    // .original on | off — active/désactive l'enregistrement des messages modifiés
    if (first === 'on' || first === 'off') {
      settingsStore.set('original', first === 'on');
      await sock.sendMessage(chatJid, {
        text: `✅ Enregistrement des messages modifiés réglé sur *${first}*.`,
      }, { quoted: msg });
      return;
    }

    // .original (en réponse à un message modifié) — affiche l'avant/après
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const stanzaId = ctx?.stanzaId;

    if (!stanzaId) {
      const current = settingsStore.get('original', false);
      await sock.sendMessage(chatJid, {
        text: `Enregistrement des messages modifiés : *${current ? 'on' : 'off'}*\n\nUsage :\n.original on | off — active/désactive l'enregistrement\nRépondez à un message modifié avec .original — affiche le texte avant/après modification`,
      }, { quoted: msg });
      return;
    }

    const entry = editHistory.get(chatJid, stanzaId);
    if (!entry) {
      await sock.sendMessage(chatJid, {
        text: '❌ Aucune modification enregistrée pour ce message.',
      }, { quoted: msg });
      return;
    }

    const senderJid = entry.senderJid || ctx?.participant;
    const senderTag = senderJid ? `@${senderJid.split('@')[0]}` : 'Inconnu';
    const timeStr = new Date(entry.timestamp).toLocaleTimeString('fr-FR', {
      timeZone: 'Africa/Ndjamena',
      hour12: false,
    });

    const banner = `◈─────────── 🌐 *TOUMAÏ MD* 🇹🇩 ───────────◈
│ 👤 *User :* ${senderTag}
│ 💬 *Original :* ${entry.original || '(vide)'}
│ ✏️ *Modifié :* ${entry.edited || '(vide)'}
│ ⏰ *Horodatage :* ${timeStr}
◈───────────────────────────────────────◈`;

    await sock.sendMessage(chatJid, {
      text: banner,
      mentions: senderJid ? [senderJid] : [],
    }, { quoted: msg });
  },
};
