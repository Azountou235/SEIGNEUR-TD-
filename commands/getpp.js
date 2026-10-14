const axios = require('axios');

const STEP_TIMEOUT_MS = 10000; // chaque appel réseau est limité à 10s

// Empêche un appel du socket de rester bloqué indéfiniment.
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} : pas de réponse après ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Retire le suffixe d'appareil (":12") mais garde le domaine (@s.whatsapp.net, @lid, @g.us).
function cleanJid(jid) {
  if (!jid || typeof jid !== 'string') return null;
  const [user, server] = jid.split('@');
  return `${user.split(':')[0]}@${server || 's.whatsapp.net'}`;
}

module.exports = {
  name: 'getpp',
  aliases: ['pp', 'ppget'],
  description: 'Récupère la photo de profil (personne, mention, réponse, numéro ou groupe).',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const send = (text) => sock.sendMessage(chatJid, { text }, { quoted: msg });

    // Même vérification que gcstatus : on prévient clairement si la fonction
    // n'existe pas sur le socket au lieu de rester muet.
    if (typeof sock.profilePictureUrl !== 'function') {
      await send('❌ getpp : profilePictureUrl() est introuvable sur ce socket. Vérifie que @nyxcore/nyxcoresocket@0.3.1 est bien installé, puis redémarre le bot.');
      return;
    }

    try { await sock.sendMessage(chatJid, { react: { text: '⏳', key: msg.key } }); } catch (_) {}

    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid?.[0];
      const quoted = ctx?.participant;

      // JID candidats : le premier qui donne une photo gagne. Avec le nouveau
      // socket les identifiants peuvent être en @lid, on garde donc aussi les
      // variantes "numéro de téléphone".
      const candidates = [];
      const push = (j) => {
        const c = cleanJid(j);
        if (c && !candidates.includes(c)) candidates.push(c);
      };

      if (mentioned) push(mentioned);
      else if (quoted) push(quoted);
      else if (args[0]) {
        const digits = args[0].replace(/[^0-9]/g, '');
        if (digits) push(`${digits}@s.whatsapp.net`);
      }

      if (candidates.length === 0) {
        if (chatJid.endsWith('@g.us')) {
          push(chatJid);
        } else if (msg.key.fromMe) {
          push(msg.key.remoteJidAlt);
          push(chatJid);
        } else {
          push(msg.key.participantPn);
          push(msg.key.participantAlt);
          push(msg.key.remoteJidAlt);
          push(msg.key.participant);
          push(chatJid);
        }
      }

      // @lid -> numéro de téléphone, si le socket sait le faire
      for (const jid of [...candidates]) {
        if (jid.endsWith('@lid')) {
          try {
            const pn = await withTimeout(
              Promise.resolve(sock.signalRepository?.lidMapping?.getPNForLID?.(jid)),
              5000,
              'conversion LID'
            );
            if (pn) push(pn);
          } catch (_) {}
        }
      }

      let url = null;
      const errors = [];
      for (const jid of candidates) {
        for (const type of ['image', 'preview']) {
          try {
            const found = await withTimeout(
              sock.profilePictureUrl(jid, type, STEP_TIMEOUT_MS),
              STEP_TIMEOUT_MS + 2000,
              'profilePictureUrl'
            );
            if (found) { url = found; break; }
          } catch (e) {
            errors.push(`${jid} (${type}) : ${e.message}`);
          }
        }
        if (url) break;
      }

      if (!url) {
        console.error('[GETPP] Aucune photo. Détails :', errors);
        try { await sock.sendMessage(chatJid, { react: { text: '❌', key: msg.key } }); } catch (_) {}
        const detail = errors.length ? `\n\n🔎 Détail technique : ${errors[0]}` : '';
        await send(`❌ Impossible de récupérer la photo de profil (aucune photo définie, ou confidentialité).${detail}`);
        return;
      }

      try {
        await sock.sendMessage(chatJid, { image: { url }, caption: '📸 Profile picture' }, { quoted: msg });
      } catch (e) {
        // Secours : télécharger l'image puis l'envoyer en buffer
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(chatJid, { image: Buffer.from(res.data), caption: '📸 Profile picture' }, { quoted: msg });
      }

      try { await sock.sendMessage(chatJid, { react: { text: '✅', key: msg.key } }); } catch (_) {}
    } catch (e) {
      console.error('[GETPP ERROR]', e);
      try { await sock.sendMessage(chatJid, { react: { text: '❌', key: msg.key } }); } catch (_) {}
      await send(`❌ Erreur : ${e.message}`);
    }
  },
};
