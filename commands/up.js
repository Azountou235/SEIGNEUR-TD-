module.exports = {
  name: 'up',
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;

    // sock.__connectedAt est posé par sessionManager.js à chaque connexion
    // réussie ('open') de CETTE session précise. Comme chaque numéro tourne
    // sur son propre socket (mode multi-session), ça donne la vraie durée
    // de connexion de CE bot — pas un chrono global partagé qui ne bougeait
    // jamais (global.BOT_START_TIME n'était en fait initialisé nulle part,
    // donc uptime tombait toujours proche de 0).
    const startTime = sock.__connectedAt || Date.now();
    const uptime = Date.now() - startTime;

    // Convertir en jours, heures, minutes, secondes
    const seconds = Math.floor((uptime / 1000) % 60);
    const minutes = Math.floor((uptime / (1000 * 60)) % 60);
    const hours = Math.floor((uptime / (1000 * 60 * 60)) % 24);
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));

    let timeString = '';
    if (days > 0) {
      timeString = `${days}jrs ${hours}h :${minutes.toString().padStart(2, '0')}min :${seconds.toString().padStart(2, '0')}s`;
    } else {
      timeString = `${hours}h :${minutes.toString().padStart(2, '0')}min :${seconds.toString().padStart(2, '0')}s`;
    }

    await sock.sendMessage(chatJid, {
      text: `Bot opérationnel 🌴\n${timeString}`,
    }, { quoted: msg });
  },
};
