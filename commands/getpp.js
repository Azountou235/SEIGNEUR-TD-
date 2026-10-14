const axios = require('axios');

const STEP_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} : pas de réponse après ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function cleanJid(jid) {
  if (!jid || typeof jid !== 'string') return null;
  const [user, server] = jid.split('@');
  return `${user.split(':')[0]}@${server || 's.whatsapp.net'}`;
}

// Méthode 1 : fonction du socket.
async function viaSocketFn(sock, jid, type) {
  return withTimeout(
    sock.profilePictureUrl(jid, type, STEP_TIMEOUT_MS),
    STEP_TIMEOUT_MS + 2000,
    'profilePictureUrl'
  );
}

// Méthode 2 : même requête WhatsApp envoyée à la main (sans passer par
// profilePictureUrl), au cas où la fonction du paquet serait défaillante.
async function viaRawQuery(sock, jid, type) {
  if (typeof sock.query !== 'function') throw new Error('sock.query indisponible');
  const result = await withTimeout(
    sock.query(
      {
        tag: 'iq',
        attrs: { target: jid, to: 's.whatsapp.net', type: 'get', xmlns: 'w:profile:picture' },
        content: [{ tag: 'picture', attrs: { type, query: 'url' } }],
      },
      STEP_TIMEOUT_MS
    ),
    STEP_TIMEOUT_MS + 2000,
    'query brute'
  );
  const children = Array.isArray(result?.content) ? result.content : [];
  const pic = children.find((c) => c?.tag === 'picture');
  const url = pic?.attrs?.url;
  if (!url) throw new Error('réponse sans photo');
  return url;
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
          } else if (jid.endsWith('@s.whatsapp.net') && lidMap?.getLIDForPN) {
            const lid = await withTimeout(Promise.resolve(lidMap.getLIDForPN(jid)), 5000, 'numéro->LID');
            if (lid) push(lid);
          }
        } catch (_) {}
      }

      // Toutes les combinaisons (JID x résolution x méthode) en parallèle.
      const attempts = [];
      for (const jid of candidates) {
        for (const type of ['image', 'preview']) {
          if (typeof sock.profilePictureUrl === 'function') {
            attempts.push(
              viaSocketFn(sock, jid, type)
                .then((u) => { if (!u) throw new Error('URL vide'); return u; })
                .catch((e) => { throw new Error(`[fn] ${jid} (${type}) : ${e.message}`); })
            );
          }
          attempts.push(
            viaRawQuery(sock, jid, type).catch((e) => {
              throw new Error(`[raw] ${jid} (${type}) : ${e.message}`);
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
        const wsOpen = sock.ws?.isOpen;
        const state = sock.__state;
        const methods = Object.keys(sock).filter((k) => /profile|picture|query|fetch/i.test(k));
        console.error('[GETPP] Aucune photo.', { errors, wsOpen, state, methods });
        await react('❌');
        await send(
          `❌ Impossible de récupérer la photo de profil.\n\n` +
          `🔎 Détail technique :\n${errors.slice(0, 6).join('\n')}\n\n` +
          `🔌 État : ${state ?? '?'} | ws ouvert : ${wsOpen ?? '?'}\n` +
          `🧩 Méthodes du socket : ${methods.join(', ') || 'aucune'}`
        );
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
