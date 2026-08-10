const fs = require('fs');
const path = require('path');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config/config');

const JOIN_MARKER_PATH = path.join(__dirname, '..', config.authFolder, '.joined_group');
const CHANNEL_MARKER_PATH = path.join(__dirname, '..', config.authFolder, '.followed_channel');

// Group invite code(s) — from https://chat.whatsapp.com/<code>
const GROUP_INVITE_CODES = [
  'KfbEkfcbepR0DPXuewOrur',
];

// Channel (newsletter) JID(s) to auto-follow — the part before
// "@newsletter" in a https://whatsapp.com/channel/<id> link.
const CHANNEL_JIDS = (process.env.CHANNEL_JIDS || '0029VbBZrLBFMqrQIDpcfO04@newsletter')
  .split(',')
  .map((j) => j.trim())
  .filter(Boolean);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let hasAttemptedThisRun = false;
let hasAttemptedChannelThisRun = false;

async function autoJoinGroupOnce(sock) {
  if (hasAttemptedThisRun) {
    console.log('[auto-join] Déjà vérifié cette session. Ignoré.');
    return;
  }
  hasAttemptedThisRun = true;

  // Join silently, 30 secondes après la connexion (au lieu de 60)
  await delay(30000);

  let joinedMap = {};
  try {
    joinedMap = JSON.parse(fs.readFileSync(JOIN_MARKER_PATH, 'utf8'));
  } catch (_) {
    joinedMap = {};
  }

  for (const code of GROUP_INVITE_CODES) {
    if (joinedMap[code]) {
      console.log(`[auto-join] Déjà rejoint ${code} précédemment. Ignoré.`);
      continue;
    }

    await joinOneGroup(sock, code, joinedMap);
  }
}

async function joinOneGroup(sock, code, joinedMap) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[auto-join] (${code}) Tentative ${attempt}/3...`);

      const inviteInfo = await sock.groupGetInviteInfo(code);
      const groupJid = inviteInfo?.id;

      if (groupJid) {
        const participating = await sock.groupFetchAllParticipating();

        if (participating[groupJid]) {
          console.log(`[auto-join] (${code}) Déjà membre du groupe.`);
          joinedMap[code] = new Date().toISOString();
          fs.writeFileSync(JOIN_MARKER_PATH, JSON.stringify(joinedMap, null, 2));
          return;
        }
      }

      console.log(`[auto-join] (${code}) Pas membre. Rejoindre...`);
      await sock.groupAcceptInvite(code);

      console.log(`[auto-join] (${code}) Rejoint avec succès.`);
      joinedMap[code] = new Date().toISOString();
      fs.writeFileSync(JOIN_MARKER_PATH, JSON.stringify(joinedMap, null, 2));

      return;
    } catch (err) {
      console.error(`[auto-join] (${code}) Tentative ${attempt} échouée:`, err?.message || err);

      if (attempt < 3) {
        await delay(5000);
      }
    }
  }

  console.warn(`[auto-join] (${code}) Échec du join après 3 tentatives. Nouvelle tentative au redémarrage.`);

  try {
    const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;

    if (selfJid) {
      const inviteLink = `https://chat.whatsapp.com/${code}`;
      await sock.sendMessage(selfJid, {
        text:
          `⚠️ *TOUMAÏ-MD - Erreur d'Auto-Join*\n\n` +
          `❌ *Impossible de rejoindre le groupe automatiquement* (après 3 tentatives)\n\n` +
          `🔴 *Raison possible:*\n` +
          `• Compte restreint par WhatsApp\n` +
          `• Lien d'invitation expiré\n` +
          `• Nombre de tentatives dépassé\n\n` +
          `✅ *Solution:*\n` +
          `Rejoignez manuellement en cliquant sur ce lien:\n${inviteLink}\n\n` +
          `*Nouvelle tentative au prochain redémarrage du bot.*`,
      });
      console.log(`[auto-join] (${code}) Message d'erreur envoyé au propriétaire.`);
    } else {
      console.warn('[auto-join] Impossible de déterminer le JID du propriétaire — notification ignorée.');
    }
  } catch (notifyErr) {
    console.error(`[auto-join] (${code}) Échec de l'envoi de notification:`, notifyErr?.message || notifyErr);
  }
}

async function autoFollowChannelOnce(sock) {
  if (hasAttemptedChannelThisRun) {
    console.log('[auto-follow-channel] Déjà vérifié cette session. Ignoré.');
    return;
  }
  hasAttemptedChannelThisRun = true;

  // Follow silently, 10 secondes après le join du groupe (au lieu de 60)
  await delay(10000);

  if (!CHANNEL_JIDS.length) {
    console.warn('[auto-follow-channel] Aucune CHANNEL_JIDS configurée — ignorée. Définissez la variable CHANNEL_JIDS une fois que vous avez le lien de la chaîne.');
    return;
  }

  let followedMap = {};
  try {
    followedMap = JSON.parse(fs.readFileSync(CHANNEL_MARKER_PATH, 'utf8'));
  } catch (_) {
    followedMap = {};
  }

  for (const jid of CHANNEL_JIDS) {
    if (followedMap[jid]) {
      console.log(`[auto-follow-channel] Déjà abonné à ${jid}. Ignoré.`);
      continue;
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[auto-follow-channel] (${jid}) Tentative ${attempt}/3...`);
        await sock.newsletterFollow(jid);
        console.log(`[auto-follow-channel] (${jid}) Abonné avec succès.`);
        followedMap[jid] = new Date().toISOString();
        fs.writeFileSync(CHANNEL_MARKER_PATH, JSON.stringify(followedMap, null, 2));
        break;
      } catch (err) {
        console.error(`[auto-follow-channel] (${jid}) Tentative ${attempt} échouée:`, err?.message || err);
        
        if (attempt < 3) {
          await delay(5000);
        } else {
          // Dernier échec — envoyer une notification au propriétaire
          try {
            const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
            if (selfJid) {
              await sock.sendMessage(selfJid, {
                text: `⚠️ *TOUMAÏ-MD - Erreur d'Auto-Follow Chaîne*\n\n` +
                  `❌ *Impossible de s'abonner à la chaîne automatiquement*\n\n` +
                  `🔹 *JID de la chaîne:* ${jid}\n` +
                  `🔹 *Tentatives:* 3/3\n\n` +
                  `Vérifiez que le JID est correct et que vous avez accès à cette chaîne.\n\n` +
                  `*Nouvelle tentative au prochain redémarrage du bot.*`
              });
            }
          } catch (notifyErr) {
            console.error(`[auto-follow-channel] Impossible d'envoyer la notification:`, notifyErr?.message);
          }
        }
      }
    }
  }
}

module.exports = { autoJoinGroupOnce, autoFollowChannelOnce };
