/**
 * commands/code.js
 *
 * .code — génère une nouvelle clé d'accès au site web (voir
 * utils/accessKeys.js) et rappelle l'état du stock, directement dans
 * WhatsApp. Sert de raccourci à `node scripts/generateAccessKey.js` pour
 * quelqu'un qui n'a pas un accès confortable à un terminal.
 *
 * Réservée à deux numéros précis, EN DUR ici (pas via isOwner/isSudo/
 * isSuperAdmin, dont la liste peut être modifiée à l'exécution par des
 * commandes comme .addsudo) : générer des clés d'accès au panel est plus
 * sensible qu'une commande de modération classique, donc on ne veut
 * dépendre d'aucun réglage modifiable.
 *
 * Fonctionne peu importe quelle session/numéro fait tourner le bot :
 * même si le message est envoyé par le bot à lui-même (fromMe), on
 * vérifie le VRAI numéro de CETTE session (sock.user) plutôt que de
 * l'autoriser par défaut — sinon n'importe quel numéro lié via le site
 * pourrait s'auto-générer des clés depuis son propre chat "Vous".
 */

const accessKeys = require('../utils/accessKeys');

const AUTHORIZED_NUMBERS = ['23591234567', '23591234568'];

function resolveSenderNumber(sock, msg) {
  if (msg.key.fromMe) {
    // Message envoyé par le bot à lui-même : le "vrai" expéditeur est le
    // numéro qui fait tourner CETTE session précise, pas automatiquement
    // un des deux numéros autorisés (multi-session : chaque numéro lié
    // via le site a sa propre session/bot).
    return sock.user?.id?.split(':')[0]?.split('@')[0] || null;
  }

  const jid =
    msg.key.participantPn ||
    msg.key.participantAlt ||
    msg.key.participant ||
    msg.key.remoteJidAlt ||
    msg.key.remoteJid;

  return jid ? jid.split('@')[0].split(':')[0] : null;
}

function isAuthorized(sock, msg) {
  const number = resolveSenderNumber(sock, msg);
  return !!number && AUTHORIZED_NUMBERS.includes(number);
}

function formatDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

const MAX_GENERATE_AT_ONCE = 20;
const MAX_USED_SHOWN = 25;

module.exports = {
  name: 'code',
  aliases: ['accesskey', 'acceskey'],
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;

    if (!isAuthorized(sock, msg)) {
      await sock.sendMessage(
        chatJid,
        { text: "🚫 Commande réservée aux administrateurs du site (numéros autorisés uniquement)." },
        { quoted: msg }
      );
      return;
    }

    // .code        -> génère 1 clé
    // .code 5      -> génère 5 clés d'un coup (plafonné pour éviter un
    //                 spam accidentel style ".code 99999")
    const requested = parseInt(args[0], 10);
    const count = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), MAX_GENERATE_AT_ONCE)
      : 1;

    let newKeys;
    try {
      newKeys = accessKeys.addKeys(count);
    } catch (error) {
      await sock.sendMessage(chatJid, { text: `❌ Erreur lors de la génération : ${error.message}` }, { quoted: msg });
      return;
    }

    const allKeys = accessKeys.listKeysMeta();
    const usedKeys = allKeys
      .filter((k) => k.used)
      .sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0));
    const unusedCount = allKeys.length - usedKeys.length;

    let text = `🔑 *${newKeys.length > 1 ? `${newKeys.length} nouvelles clés générées` : 'Nouvelle clé générée'}*\n`;
    text += newKeys.map((k) => `➤ \`${k}\``).join('\n');
    text += `\n\n⚠️ Note-la tout de suite dans un endroit sûr — elle ne sera plus jamais réaffichée en clair, et elle n'est valable qu'*une seule fois*.`;

    text += `\n\n📊 *Stock de clés* : ${allKeys.length} au total — ✅ ${unusedCount} disponible(s), ⛔ ${usedKeys.length} déjà utilisée(s).`;

    if (usedKeys.length > 0) {
      const shown = usedKeys.slice(0, MAX_USED_SHOWN);
      text += `\n\n📜 *Clés déjà utilisées* (les plus récentes) :\n`;
      text += shown
        .map((k, i) => `${i + 1}. ${k.id}… — utilisée le ${formatDate(k.usedAt)}`)
        .join('\n');
      if (usedKeys.length > MAX_USED_SHOWN) {
        text += `\n… et ${usedKeys.length - MAX_USED_SHOWN} de plus.`;
      }
      text += `\n\nℹ️ Par sécurité, la valeur en clair d'une clé n'est jamais conservée sur le serveur : seuls un identifiant tronqué (empreinte) et sa date d'utilisation restent visibles.`;
    } else {
      text += `\n\n📜 Aucune clé utilisée pour le moment.`;
    }

    await sock.sendMessage(chatJid, { text }, { quoted: msg });
  },
};
