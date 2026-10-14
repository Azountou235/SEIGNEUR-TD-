const axios = require('axios');

const STEP_TIMEOUT_MS = 20000; // limite par tentative

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} : pas de réponse après ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Retire le suffixe d'appareil (":12") mais garde le domaine.
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
    const react = async (emoji) => {
      try { await sock.sendMessage(chatJid, { react: { text: emoji, key: msg.key } }); } catch (_) {}
    };

    if (typeof sock.profilePictureUrl !== 'function') {
      await send('❌ getpp : profilePictureUrl() est introuvable sur ce socket. Vérifie que @nyxcore/nyxcoresocket@0.3.1 est bien installé, puis redémarre le bot.');
      return;
    }

    await react('⏳');

    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid?.[0];
      const quoted = ctx?.participant;

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

      // Complète avec la variante manquante : @lid <-> numéro de téléphone.
      const lidMap = sock.signalRepository?.lidMapping;
      for (const jid of [...candidates]) {
        try {
          if (jid.endsWith('@lid') && lidMap?.getPNForLID) {
            const pn = await withTimeout(Promise.resolve(lidMap.getPNForLID(jid)), 5000, 'LID->numéro');
            if (pn) push(pn);
          } else if (jid.endsWith('@s.whatsapp.net')) {
            if (lidMap?.getLIDForPN) {
              const lid = await withTimeout(Promise.resolve(lidMap.getLIDForPN(jid)), 5000, 'numéro->LID');
              if (lid) push(lid);
            }
            if (typeof sock.onWhatsApp === 'function') {
              const r = await withTimeout(Promise.resolve(sock.onWhatsApp(jid)), 8000, 'onWhatsApp');
              if (r?.[0]?.lid) push(r[0].lid);
              if (r?.[0]?.jid) push(r[0].jid);
            }
          }
        } catch (_) {}
      }

      // Toutes les combinaisons (JID x résolution) en parallèle :
      // la première qui répond gagne.
      const attempts = [];
      for (const jid of candidates) {
        for (const type of ['image', 'preview']) {
          attempts.push(
            withTimeout(
              sock.profilePictureUrl(jid, type, STEP_TIMEOUT_MS),
              STEP_TIMEOUT_MS + 2000,
              'profilePictureUrl'
            )
              .then((u) => {
                if (!u) throw new Error('URL vide');
                return u;
              })
              .catch((e) => {
                throw new Error(`${jid} (${type}) : ${e.message}`);
              })
          );
        }
      }

      let url = null;
      let errors = [];
      try {
        url = await Promise.any(attempts);
      } catch (agg) {
        errors = (agg.errors || []).map((e) => e.message);
      }

      if (!url) {
        console.error('[GETPP] Aucune photo. Détails :', errors);
        await react('❌');
        const detail = errors.length ? `\n\n🔎 Détail technique :\n${errors.slice(0, 4).join('\n')}` : '';
        await send(`❌ Impossible de récupérer la photo de profil (aucune photo définie, ou confidentialité).${detail}`);
        return;
      }

      try {
        await sock.sendMessage(chatJid, { image: { url }, caption: '📸 Profile picture' }, { quoted: msg });
      } catch (e) {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(chatJid, { image: Buffer.from(res.data), caption: '📸 Profile picture' }, { quoted: msg });
      }

      await react('✅');
    } catch (e) {
      console.error('[GETPP ERROR]', e);
      await react('❌');
      await send(`❌ Erreur : ${e.message}`);
    }
  },
};
