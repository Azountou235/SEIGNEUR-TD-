const axios = require('axios');

// Nettoie un JID : retire le suffixe d'appareil (":12") mais garde le domaine
// (@s.whatsapp.net, @lid, @g.us...).
function cleanJid(jid) {
  if (!jid || typeof jid !== 'string') return null;
  const [user, server] = jid.split('@');
  return `${user.split(':')[0]}@${server || 's.whatsapp.net'}`;
}

// Essaie de récupérer l'URL de la photo pour un JID donné.
// Ordre : haute résolution ("image"), puis miniature ("preview").
async function tryGetUrl(sock, jid) {
  if (!jid || typeof sock.profilePictureUrl !== 'function') return null;
  for (const type of ['image', 'preview']) {
    try {
      const url = await sock.profilePictureUrl(jid, type);
      if (url) return url;
    } catch (_) {
      // essaie le type / JID suivant
    }
  }
  return null;
}

module.exports = {
  name: 'getpp',
  aliases: ['pp', 'ppget'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const mentioned = ctx?.mentionedJid?.[0];
    const quoted = ctx?.participant;

    // Liste de JID candidats (le premier qui donne une photo gagne).
    // Avec le nouveau socket, les identifiants peuvent être au format @lid :
    // on garde donc aussi les variantes "numéro de téléphone" en secours.
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

    // Par défaut : le groupe lui-même (en groupe) ou l'interlocuteur (en privé)
    if (candidates.length === 0) {
      if (chatJid.endsWith('@g.us')) {
        push(chatJid);
      } else if (msg.key.fromMe) {
        // Message envoyé par le bot lui-même : on cible le chat ouvert
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

    // Variantes supplémentaires : si on a un @lid, tenter aussi la conversion
    // vers le numéro de téléphone quand le socket sait le faire.
    for (const jid of [...candidates]) {
      if (jid.endsWith('@lid')) {
        try {
          const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(jid);
          if (pn) push(pn);
        } catch (_) {}
      }
    }

    let url = null;
    for (const jid of candidates) {
      url = await tryGetUrl(sock, jid);
      if (url) break;
    }

    if (!url) {
      await sock.sendMessage(
        chatJid,
        { text: '❌ Impossible de récupérer la photo de profil (peut-être qu\'aucune n\'est définie, ou que les réglages de confidentialité l\'empêchent).' },
        { quoted: msg }
      );
      return;
    }

    try {
      // Envoi par URL d'abord (comportement d'origine)
      await sock.sendMessage(
        chatJid,
        { image: { url }, caption: '📸 Profile picture' },
        { quoted: msg }
      );
    } catch (e) {
      // Secours : télécharger l'image puis l'envoyer en buffer
      try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(
          chatJid,
          { image: Buffer.from(res.data), caption: '📸 Profile picture' },
          { quoted: msg }
        );
      } catch (e2) {
        await sock.sendMessage(
          chatJid,
          { text: `❌ Photo trouvée mais l'envoi a échoué : ${e2.message}` },
          { quoted: msg }
        );
      }
    }
  },
};
