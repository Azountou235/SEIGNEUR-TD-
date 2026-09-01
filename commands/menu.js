const fs = require('fs');
const config = require('../config/config');
const settingsStore = require('../utils/settingsStore');

// Commandes affichées dans chaque section du menu. Tenu à jour à la main
// (plutôt que généré depuis la liste des commandes chargées) pour garder
// exactement la mise en page voulue. Les commandes Fun et .antiviewonce ont
// été supprimées du bot et n'apparaissent plus ici.
const SECTIONS = [
  {
    title: '👑 『 𝗔𝗗𝗠𝗜𝗡 』',
    cmds: ['menu', 'mode', 'update', 'clearcache', 'autoreact', 'autorecord', 'autostatusview', 'autowrite', 'getpp', 'setautoreactemoji', 'setautoviewblock', 'setstatusemoji', 'setprefix', 'setbotname', 'setmenu', 'setmenuimage', 'setprofile', 'settimezone', 'setfont', 'setstatusviewers', 'getsession', 'mygroups', 'savestatus', 'statusreact'],
  },
  {
    title: '🔑 『 𝗦𝗨𝗗𝗢 』',
    cmds: ['addsudo', 'removesudo', 'sudolist', 'setownername', 'setownernumber'],
  },
  {
    title: '🛡️ 『 𝗣𝗥𝗢𝗧𝗘𝗖𝗧𝗜𝗢𝗡 𝗣𝗥𝗜𝗩𝗔𝗧𝗘 』',
    cmds: ['antispamprivate', 'anticall', 'antidelete', 'antiedit', 'original', 'antideletestatus'],
  },
  {
    title: '👥 『 𝗚𝗥𝗢𝗨𝗣𝗘 』',
    cmds: ['add', 'demote', 'hidetag', 'infogroup', 'kick', 'link', 'mute', 'promote', 'resetlink', 'setdesc', 'setname', 'setpp', 'tagall', 'tosgroup', 'unmute', 'unwarn', 'warn', 'antiaudio', 'antibot', 'antideletedest', 'antietranger', 'antilink', 'antiphoto', 'antispamgroup', 'antisticker', 'antivideo', 'antivoice', 'mute-user', 'unmute-user', 'block', 'unblock', 'broadcast', 'addbadword', 'removebadword', 'badwordlist', 'gcstatus'],
  },
  {
    title: '📰 『 𝗖𝗛𝗔𝗜𝗡𝗘 』',
    cmds: ['setnewsletter', 'newsletter', 'channeljid', 'addchannel', 'removechannel'],
  },
  {
    title: '📥 『 𝗧𝗘́𝗟𝗘́𝗖𝗛𝗔𝗥𝗚𝗘𝗠𝗘𝗡𝗧𝗦 』',
    cmds: ['apk', 'facebook', 'instagram', 'mediafire', 'play', 'tiktok', 'ytmp3', 'ytmp4'],
  },
  {
    title: '🛠️ 『 𝗢𝗨𝗧𝗜𝗟𝗦 』',
    cmds: ['sticker', 'toaudio', 'toimage', 'toptt', 'tostatus', 'tovideo', 'trt', 'viewonce', 'topdf', 'totxt', 'adjib'],
  },
  {
    title: '🧠 『 𝗜𝗔 』',
    cmds: ['gpt'],
  },
  {
    title: '⚙️ 『 𝗔𝗨𝗧𝗥𝗘𝗦 』',
    cmds: ['ping'],
  },
];

module.exports = {
  name: 'menu',
  aliases: ['help'],
  execute: async (sock, msg, args, commands) => {
    const chatJid = msg.key.remoteJid;
    const prefix = settingsStore.get('prefix', config.prefix);
    const modeVal = settingsStore.get('mode', config.WORK_TYPE);
    const modeLabel = modeVal === 'private' ? 'PRIVATE' : 'PUBLIC';
    const adminNumber = config.reactNumbers[0] || config.ownerNumber;

    // Réagit avec 🇷🇴 dès qu'on demande le menu, avant de l'envoyer.
    try {
      await sock.sendMessage(chatJid, { react: { text: '🇷🇴', key: msg.key } });
    } catch (e) {
      // silencieux : une réaction ratée ne doit jamais bloquer l'affichage du menu
    }

    let body = '';
    body += '┌──────────────────────────────┐\n';
    body += '│  ❖ 𝗧𝗢𝗨𝗠𝗔𝗜̈ - 𝗠𝗗 🇹🇩 ❖         │\n';
    body += '├──────────────────────────────┤\n';
    body += `│ 👑 𝗔𝗱𝗺𝗶𝗻  : ${adminNumber}\n`;
    body += `│ ⚡ 𝗣𝗿𝗲́𝗳𝗶𝘅𝗲 : [ ${prefix} ]\n`;
    body += `│ 🛡️ 𝗠𝗼𝗱𝗲   : ${modeLabel}\n`;
    body += '└──────────────────────────────┘\n\n';

    for (const section of SECTIONS) {
      const available = section.cmds.filter((n) => commands.has(n));
      if (!available.length) continue;

      body += `┌─── ${section.title}\n`;
      body += available.map((n) => `│ ⚡ ${prefix}${n}`).join('\n') + '\n';
      body += '└──────────────────────────────\n\n';
    }

    // Image de menu par défaut du bot officiel — reste active tant que
    // personne n'utilise .setmenuimage/.setmenu pour la changer (ces
    // commandes écrivent dans settingsStore, qui prend alors le dessus sur
    // cette valeur par défaut).
    const menuStyle = settingsStore.get('menuStyle', 'image');
    const menuImage = settingsStore.get('menuImage', 'https://image.zaw-myo.workers.dev/image/525ac2d9-6983-4510-9279-667b439d0a3d');

    if (menuStyle === 'image' && menuImage) {
      try {
        const imageSource = /^https?:\/\//i.test(menuImage) ? { url: menuImage } : fs.readFileSync(menuImage);
        await sock.sendMessage(chatJid, { image: imageSource, caption: body.trim() }, { quoted: msg });
        return;
      } catch (e) {
        // image manquante/corrompue → on retombe sur le texte simple
      }
    }

    await sock.sendMessage(chatJid, { text: body.trim() }, { quoted: msg });
  },
};
