const config = require('../config/config');
const settingsStore = require('../utils/settingsStore');

// Commandes affichées dans chaque section du menu. Tenu à jour à la main
// (plutôt que généré depuis la liste des commandes chargées) pour garder
// exactement la mise en page voulue. Les commandes Fun et .antiviewonce ont
// été supprimées du bot et n'apparaissent plus ici.
const SECTIONS = [
  {
    title: '👑 *ADMIN*',
    cmds: ['menu', 'mode', 'update', 'autoreact', 'autorecord', 'autostatusview', 'autowrite', 'getpp', 'setautoreactemoji', 'setautoviewblock', 'setstatusemoji'],
  },
  {
    title: '🛡️ *PROTECTION PRIVATE*',
    cmds: ['antispamprivate', 'anticall', 'antidelete', 'antiedit', 'antideletestatus'],
  },
  {
    title: '👥 *GROUPE*',
    cmds: ['add', 'demote', 'hidetag', 'infogroup', 'kick', 'link', 'mute', 'promote', 'resetlink', 'setdesc', 'setname', 'setpp', 'tagall', 'tosgroup', 'unmute', 'unwarn', 'warn', 'antiaudio', 'antibot', 'antideletedest', 'antietranger', 'antilink', 'antiphoto', 'antispamgroup', 'antisticker', 'antivideo', 'antivoice'],
  },
  {
    title: '⬇️ *TÉLÉCHARGEMENTS*',
    cmds: ['apk', 'facebook', 'instagram', 'mediafire', 'play', 'tiktok', 'ytmp3', 'ytmp4'],
  },
  {
    title: '🛠️ *OUTILS*',
    cmds: ['sticker', 'toaudio', 'toimage', 'toptt', 'tostatus', 'tovideo', 'trt'],
  },
  {
    title: '🧠 *AI*',
    cmds: ['gpt'],
  },
  {
    title: '⚙️ *AUTRES*',
    cmds: ['ping'],
  },
];

module.exports = {
  name: 'menu',
  aliases: ['help'],
  execute: async (sock, msg, args, commands) => {
    const chatJid = msg.key.remoteJid;
    const prefix = settingsStore.get('prefix', config.prefix);

    // Réagit avec 🇷🇴 dès qu'on demande le menu, avant de l'envoyer.
    try {
      await sock.sendMessage(chatJid, { react: { text: '🇷🇴', key: msg.key } });
    } catch (e) {
      // silencieux : une réaction ratée ne doit jamais bloquer l'affichage du menu
    }

    let body = '';
    body += '╭─────────────⚡─────────────╮\n';
    body += `│       *${config.botName}*  🇷🇴      │\n`;
    body += `│        Préfixe : *${prefix}*        │\n`;
    body += '╰─────────────⚡─────────────╯\n';

    for (const section of SECTIONS) {
      const available = section.cmds.filter((n) => commands.has(n));
      if (!available.length) continue;

      body += `📋━━━ ${section.title} ━━━━━━━━━━━━━━\n`;
      body += available.map((n) => `│ ┆ ${prefix}${n}`).join('\n') + '\n';
      body += '└─────────────────────────────\n';
    }

    await sock.sendMessage(chatJid, { text: body.trim() }, { quoted: msg });
  },
};
