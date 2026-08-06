module.exports = {
  name: 'up',
  execute: async (sock, msg) => {
    const chatJid = msg.key.remoteJid;
    
    // Récupère le timestamp de démarrage stocké globalement au boot
    const startTime = global.BOT_START_TIME || Date.now();
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

