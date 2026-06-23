// =============================================
// FONCTIONS DES COMMANDES - SEIGNEUR TD 🇹🇩
// =============================================

// ═══════════════════════════════════════════════════
// 🗂️  SYSTÈME MENU COMPLET — SEIGNEUR TD 🇹🇩
// ═══════════════════════════════════════════════════

function buildUptime() {
  const s = Math.floor(process.uptime());
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// ─── DONNÉES COMMUNES DES CATÉGORIES ────────────────────────────────────────
function getMenuCategories(p) {
  return [
    { num: '1', key: 'owner',    icon: '🛡️', label: 'OWNER MENU',      cmds: ['getpp','gpp','setpp','mode','update','block','unblock','join','autotyping','autorecording','autoreact','antidelete','antiedit','chatbot','autostatusviews','autoreactstatus','setreactemoji','autosavestatus','getsettings','setstickerpackname','setstickerauthor','setprefix','setbotimg','ping','info','jid'] },
    { num: '2', key: 'download', icon: '📥', label: 'DOWNLOAD MENU',   cmds: ['ytmp3','ytmp4','tiktok','tiktokmp3','ig','fb','mediafire','apk','lyrics','song','usertiktok','threads','snackvideo'] },
    { num: '3', key: 'group',    icon: '👥', label: 'GROUP MENU',      cmds: ['tagall','tagadmins','hidetag','kickall','kickadmins','acceptall','add','kick','promote','demote','mute','unmute','invite','revoke','gname','gdesc','groupinfo','welcome','goodbye','leave','listonline','listactive','listinactive','kickinactive'] },
    { num: '4', key: 'utility',  icon: '🔮', label: 'PROTECTION MENU', cmds: ['antibug','antilink','antibot','antitag','antispam','antisticker','antiimage','antivideo','antimentiongroupe','anticall','warn','resetwarn'] },
    { num: '6', key: 'sticker',  icon: '🎨', label: 'MEDIA MENU',      cmds: ['sticker','take','vv','tostatus','swgc','toaudio','toptt','tosgroup'] },
    { num: '10', key: 'ai',      icon: '🤖', label: 'SEIGNEUR AI',     cmds: ['chat','gpt','gemini','deepseek','nanoimage','ai'] },
  ];
}

// ─── MENU PRINCIPAL (!menu) ──────────────────────────────────────────────────
async function handleMenu(sock, message, remoteJid, senderJid) {
  const userName = message.pushName || senderJid.split('@')[0];
  const p        = config.prefix;
  const uptime   = buildUptime();
  const now      = new Date();
  const cats     = getMenuCategories(p);
  const dateStr  = now.toLocaleDateString('fr-FR', {
    timeZone: 'Africa/Ndjamena', day: '2-digit', month: '2-digit', year: 'numeric'
  });
  const timeStr  = now.toLocaleTimeString('fr-FR', {
    timeZone: 'Africa/Ndjamena', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });

  await simulateTyping(sock, remoteJid);
  try { await sock.sendMessage(remoteJid, { react: { text: '🇹🇩', key: message.key } }); } catch(e) {}
  let infoBlock = '';

  // ══════════════════════════════════════════
  // STYLE 1 — Original SEIGNEUR TD
  // ══════════════════════════════════════════
  if (menuStyle === 1) {
    const catLines = cats.map(c => {
      const cmdText = c.cmds.map(cmd => `│ ➣ ${cmd}`).join('\n');
      return `┌──『 ${c.icon} ${c.label} 』──\n${cmdText}\n└───────────────`;
    }).join('\n');

    infoBlock =
`━━━━━━━━━━━━━━━━━━
SEIGNEUR TD 🇹🇩
━━━━━━━━━━━━━━━━━━
┌───「 STATUTS 」───
❒  Bot : SEIGNEUR TD 🇹🇩
❒  Uptime : ${uptime}
❒  Date : ${dateStr}
❒  Prefix : ${p}
└───────────────┘
${catLines}
© SEIGNEUR TD`;

  // ══════════════════════════════════════════
  // STYLE 2 — Modern Box Style
  // ══════════════════════════════════════════
  } else if (menuStyle === 2) {
    const os = await import('os');
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
    const freeMem  = (os.freemem()  / 1024 / 1024 / 1024).toFixed(2);
    const usedMem  = (totalMem - freeMem).toFixed(2);
    const totalCmds = cats.reduce((acc, c) => acc + c.cmds.length, 0);

    const catBlocks = cats.map(c => {
      const cmdList = c.cmds
        .map(cmd => cmd.replace(p, ''))
        .reduce((rows, cmd, i) => {
          if (i % 2 === 0) rows.push([cmd]);
          else rows[rows.length - 1].push(cmd);
          return rows;
        }, [])
        .map(row => `│ • ${row[0].padEnd(12)}${row[1] ? `• ${row[1]}` : ''}`)
        .join('\n');
      return `│\n│ 📌 *${c.label}*\n│\n${cmdList}`;
    }).join('\n│\n');

    infoBlock =
`╭───『 *SEIGNEUR TD 🇹🇩* 』───
│
│  ⏰ *Date* : ${dateStr}
│  ⏳ *Heure* : ${timeStr}
│
│  ✨ *Prefix* : ${p}
│  👑 *Owner* : SEIGNEUR TD
│  🌐 *Mode* : ${botMode}
│  🎨 *Thème* : SEIGNEUR TD
│  📚 *Commandes* : ${totalCmds}
│  🧠 *Mémoire* : ${usedMem} GB/${totalMem} GB
│  💻 *Plateforme* : linux
│  🕐 *Uptime* : ${uptime}
╰────────────────────

╭───『 *MENU COMMANDES* 』───
${catBlocks}
│
╰────────────────────

🔹 *Utilisation* : \`${p}[commande]\`
🔹 *Exemple* : \`${p}menu\`

📌 *Développeur* :
- SEIGNEUR TD 🇹🇩

✦⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅⋅✦`;

  // ══════════════════════════════════════════
  // STYLE 3 — Monospace Elegant Style
  // ══════════════════════════════════════════
  } else if (menuStyle === 3) {
    const catBlocks3 = cats.map(c => {
      const cmdsFormatted = c.cmds
        .map(cmd => `𐓷  _${cmd.replace(p, '').toUpperCase()}_`)
        .join('\n');
      return `━━━「 ${c.label} 」\n${cmdsFormatted}`;
    }).join('\n\n');

    infoBlock =
`\`𝙲𝚈𝙱𝙴𝚁𝚃𝙾𝙹𝙸 𝚇𝙼𝙳 🇹🇩\`
𝙷𝙴𝚈 *${userName}* 𝙷𝙾𝚆 𝙲𝙰𝙽 𝙸 𝙷𝙴𝙻𝙿 𝚈𝙾𝚄?
       「 𝙱𝙾𝚃 𝙸𝙽𝙵𝙾 」
𐓷  _CREATOR: SEIGNEUR TD_
𐓷  _𝙱𝙾𝚃 𝙽𝙰𝙼𝙴: 𝙿𝚆𝙷𝚃 𝚀𝙼𝙳 𝚃𝙳_
𐓷  _𝚅𝙴𝚁𝚂𝙸𝙾𝙽: 𝟸𝟶𝟸𝟼_
𐓷  _𝚂𝚃𝙰𝚃𝚄𝚃: 𝙰𝙲𝚃𝙸𝙵_
𐓷  _𝚁𝚄𝙽𝚃𝙸𝙼𝙴: ${uptime}_
𐓷  _𝙿𝚁𝙴𝙵𝙸𝚡𝙴: ${p}_

${catBlocks3}

> POWERED BY SEIGNEUR TD 🇹🇩`;
  }

  const menuMsg = await sendWithImage(sock, remoteJid, 'menu', infoBlock, [senderJid]);

  if (menuMsg?.key?.id) {}
}

// ─── ALL MENU (!allmenu / !0) ────────────────────────────────────────────────
async function handleAllMenu(sock, message, remoteJid, senderJid) {
  const p    = config.prefix;
  const cats = getMenuCategories(p);

  await simulateTyping(sock, remoteJid);

  // Construire un seul bloc avec toutes les catégories
  const blocks = cats.map(c => {
    const lines = c.cmds.map(cmd => `│  ➤ ${cmd}`).join('\n');
    return `┌─「 ${c.icon} *${c.label}* 」\n${lines}\n└──────────────────────`;
  }).join('\n\n');

  const text =
`📋 *TOUTES LES COMMANDES — SEIGNEUR TD 🇹🇩*
━━━━━━━━━━━━━━━━━━━━━━━━━━

${blocks}

━━━━━━━━━━━━━━━━━━━━━━━━━━
*© SEIGNEUR TD 🇹🇩*`;

  await sendWithImage(sock, remoteJid, 'menu', text, [senderJid]);
}

// ─── SOUS-MENU PAR CATÉGORIE (!1–!8 / !ownermenu etc.) ──────────────────────
async function sendSubMenu(sock, message, remoteJid, senderJid, type) {
  const p    = config.prefix;
  const cats = getMenuCategories(p);
  const cat  = cats.find(c => c.key === type);

  if (!cat) {
    await sock.sendMessage(remoteJid, { text: `❌ Catégorie *${type}* non trouvée.` });
    return;
  }

  await simulateTyping(sock, remoteJid);

  const lines = cat.cmds.map(cmd => `│  ➤ ${cmd}`).join('\n');

  const text =
`${cat.icon} *${cat.label}*
*╭──────────────────────────*
${lines}
*╰──────────────────────────*

*© SEIGNEUR TD 🇹🇩*`;

  await sendWithImage(sock, remoteJid, 'menu', text, [senderJid]);
}

// =============================================
// GESTION DES PHOTOS DE PROFIL
// =============================================

async function handleGetPP(sock, args, remoteJid, senderJid, message, isGroup) {
  try {
    await sock.sendMessage(remoteJid, { react: { text: '⏳', key: message.key } });
    const loadMsg = await sock.sendMessage(remoteJid, { text: '⏳ *Téléchargement de la photo...*' }, { quoted: message });

    let targetJid = senderJid;
    
    if (args[0]) {
      const mention = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (mention) {
        targetJid = mention;
      } else {
        const num = args[0].replace(/[^0-9]/g, '');
        targetJid = num + '@s.whatsapp.net';
      }
    }

    const ppUrl = await sock.profilePictureUrl(targetJid, 'image');
    if (!ppUrl) {
      return await sock.sendMessage(remoteJid, { 
        text: '❌ Impossible de récupérer la photo de profil', 
        edit: loadMsg.key 
      });
    }

    const response = await axios.get(ppUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buffer = Buffer.from(response.data);
    
    const userNum = targetJid.split('@')[0];
    await sock.sendMessage(remoteJid, {
      image: buffer,
      caption: `📷 Photo de profil: +${userNum}`
    });
    
    await sock.sendMessage(remoteJid, { text: '✅ Photo téléchargée!', edit: loadMsg.key });

  } catch (e) {
    console.error('[GETPP]', e.message);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

async function handleGPP(sock, remoteJid, isGroup) {
  try {
    if (!isGroup) {
      return await sock.sendMessage(remoteJid, { text: '❌ Cette commande est réservée aux groupes uniquement' });
    }

    await sock.sendMessage(remoteJid, { text: '⏳ *Téléchargement de la photo du groupe...*' });

    const ppUrl = await sock.profilePictureUrl(remoteJid, 'image');
    if (!ppUrl) {
      return await sock.sendMessage(remoteJid, { text: '❌ Ce groupe n\'a pas de photo de profil' });
    }

    const response = await axios.get(ppUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buffer = Buffer.from(response.data);
    
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const groupName = groupMetadata.subject || 'Groupe';
    
    await sock.sendMessage(remoteJid, {
      image: buffer,
      caption: `🖼️ Photo du groupe: ${groupName}`
    });

  } catch (e) {
    console.error('[GPP]', e.message);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

async function handleSetPP(sock, remoteJid, message, senderJid) {
  try {
    const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (!quotedMsg?.imageMessage) {
      return await sock.sendMessage(remoteJid, {
        text: `🖼️ *SETPP*\n\nUtilisation: Réponds à une image avec\n${config.prefix}setpp\n\nCette image deviendra votre photo de profil.`,
        quoted: message
      });
    }

    await sock.sendMessage(remoteJid, { react: { text: '⏳', key: message.key } });
    const loadMsg = await sock.sendMessage(remoteJid, { text: '⏳ *Changement de la photo de profil...*' }, { quoted: message });

    const imgStream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
    const imgBuffer = await toBuffer(imgStream);

    await sock.updateProfilePicture(sock.user.id, imgBuffer);
    
    await sock.sendMessage(remoteJid, { 
      text: '✅ Photo de profil changée avec succès!', 
      edit: loadMsg.key 
    });

  } catch (e) {
    console.error('[SETPP]', e.message);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

// =============================================
// APIs TRUSTBIT - TÉLÉCHARGEMENTS
// =============================================

const TRUSTBIT_BASE = 'https://api-trustbit.name.ng/api';

async function downloadViaAPI(command, url, remoteJid, sock, message) {
  const endpoints = {
    // Réseaux sociaux
    'fb': '/download/facebook',
    'facebook': '/download/facebook',
    'ig': '/download/instagram',
    'instagram': '/download/instagram',
    'tiktok': '/download/tiktok',
    'tiktokmp3': '/download/tiktok',
    'twitter': '/download/twitter',
    'tw': '/download/twitter',
    'threads': '/download/threads',
    'snackvideo': '/download/snackvideo',
    
    // Vidéos
    'ytmp3': '/download/youtube-audio',
    'ytmp4': '/download/youtube-video',
    'youtube': '/download/youtube-video',
    
    // Fichiers
    'mediafire': '/download/mediafire',
    'apk': '/tools/fdroidsearch',
    
    // Musique
    'lyrics': '/search/lyrics',
    'song': '/search/lyrics',
    'usertiktok': '/search/tiktoksearch',
    
    // IA
    'ai': '/ai/ai4chat',
    'chat': '/ai/ai4chat',
    'deepseek': '/ai/code-advanced',
    'nanoimage': '/ai/txt2img',
  };

  const endpoint = endpoints[command.toLowerCase()];
  if (!endpoint) {
    await sock.sendMessage(remoteJid, { text: `❌ Commande non reconnue: ${command}` });
    return;
  }

  try {
    await sock.sendMessage(remoteJid, { react: { text: '⏳', key: message.key } });
    const loadMsg = await sock.sendMessage(remoteJid, { text: '⏳ *Traitement en cours...*' }, { quoted: message });

    const apiUrl = `${TRUSTBIT_BASE}${endpoint}`;
    const params = {};
    
    if (command.toLowerCase() === 'apk') {
      params.appName = url;
    } else if (command.toLowerCase() === 'usertiktok') {
      params.username = url;
    } else if (['lyrics', 'song'].includes(command.toLowerCase())) {
      params.query = url;
    } else if (['ai', 'chat'].includes(command.toLowerCase())) {
      params.message = url;
    } else if (command.toLowerCase() === 'deepseek') {
      params.code = url;
    } else if (command.toLowerCase() === 'nanoimage') {
      params.text = url;
    } else {
      params.url = url;
    }

    const { data } = await axios.get(apiUrl, { params, timeout: 60000 });
    
    if (!data.success) {
      await sock.sendMessage(remoteJid, { text: `❌ Erreur API: ${data.message || 'Erreur inconnue'}`, edit: loadMsg.key });
      return;
    }

    // Répondre selon le type de contenu
    const result = data.result || data.data;
    
    if (command.toLowerCase() === 'apk') {
      await sock.sendMessage(remoteJid, { 
        text: `📦 *APK Trouvé*\n\n📱 ${result.name || result.title}\n📏 ${result.size || 'N/A'}\n\n✅ Résultat de la recherche`, 
        edit: loadMsg.key 
      });
    } else if (['lyrics', 'song'].includes(command.toLowerCase())) {
      const lyrics = result.lyrics || result.text || result;
      await sock.sendMessage(remoteJid, { 
        text: `🎵 *Paroles trouvées*\n\n${lyrics}`, 
        edit: loadMsg.key 
      });
    } else if (['ai', 'chat'].includes(command.toLowerCase())) {
      const reply = result.response || result.text || result;
      await sock.sendMessage(remoteJid, { 
        text: `🤖 *Réponse IA*\n\n${reply}`, 
        edit: loadMsg.key 
      });
    } else if (command.toLowerCase() === 'deepseek') {
      const code = result.code || result.response || result;
      await sock.sendMessage(remoteJid, { 
        text: `💻 *Code Deepseek*\n\n\`\`\`\n${code}\n\`\`\``, 
        edit: loadMsg.key 
      });
    } else if (command.toLowerCase() === 'nanoimage') {
      if (result.image || result.url) {
        const imgUrl = result.image || result.url;
        await sock.sendMessage(remoteJid, { 
          image: { url: imgUrl },
          caption: '🎨 Image générée par IA' 
        });
        await sock.sendMessage(remoteJid, { text: '✅ Image envoyée!', edit: loadMsg.key });
      }
    } else if (result.download_url || result.url || result.dl_url) {
      const dlUrl = result.download_url || result.url || result.dl_url;
      const dlRes = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 180000 });
      const buf = Buffer.from(dlRes.data);
      
      // Déterminer le type de fichier
      let mediaOptions = {};
      if (['ytmp3'].includes(command.toLowerCase())) {
        mediaOptions = { audio: buf, mimetype: 'audio/mpeg' };
      } else if (['ytmp4', 'tiktok', 'tiktokmp3', 'ig', 'instagram', 'fb', 'facebook', 'twitter', 'threads', 'snackvideo', 'mediafire'].includes(command.toLowerCase())) {
        mediaOptions = { video: buf, mimetype: 'video/mp4', caption: '✅ Téléchargement réussi!\n\n© SEIGNEUR TD 🇹🇩' };
      }
      
      await sock.sendMessage(remoteJid, mediaOptions);
      await sock.sendMessage(remoteJid, { text: `✅ ${command.toUpperCase()} téléchargé!`, edit: loadMsg.key });
    } else {
      await sock.sendMessage(remoteJid, { 
        text: `✅ Succès!\n\n${JSON.stringify(result)}`, 
        edit: loadMsg.key 
      });
    }

  } catch(e) {
    console.error(`[${command.toUpperCase()}]`, e.message);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

// =============================================
// HANDLERS DE COMMANDES DOWNLOAD
// =============================================

async function handleYouTubeAudio(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🎵 Utilisation: ${config.prefix}ytmp3 <lien YouTube ou titre>` }, { quoted: message });
  const query = args.join(' ');
  await downloadViaAPI('ytmp3', query, remoteJid, sock, message);
}

async function handleYouTubeVideo(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🎬 Utilisation: ${config.prefix}ytmp4 <lien YouTube ou titre>` }, { quoted: message });
  const query = args.join(' ');
  await downloadViaAPI('ytmp4', query, remoteJid, sock, message);
}

async function handleTikTok(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🎵 Utilisation: ${config.prefix}tiktok <lien TikTok>` }, { quoted: message });
  const url = args.join(' ');
  await downloadViaAPI('tiktok', url, remoteJid, sock, message);
}

async function handleInstagram(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `📸 Utilisation: ${config.prefix}ig <lien Instagram>` }, { quoted: message });
  const url = args.join(' ');
  await downloadViaAPI('ig', url, remoteJid, sock, message);
}

async function handleFacebook(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `📱 Utilisation: ${config.prefix}fb <lien Facebook>` }, { quoted: message });
  const url = args.join(' ');
  await downloadViaAPI('fb', url, remoteJid, sock, message);
}

async function handleTwitter(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🐦 Utilisation: ${config.prefix}twitter <lien Twitter/X>` }, { quoted: message });
  const url = args.join(' ');
  await downloadViaAPI('twitter', url, remoteJid, sock, message);
}

async function handleThreads(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `💬 Utilisation: ${config.prefix}threads <lien Threads>` }, { quoted: message });
  const url = args.join(' ');
  await downloadViaAPI('threads', url, remoteJid, sock, message);
}

async function handleSnackVideo(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🎬 Utilisation: ${config.prefix}snackvideo <lien SnackVideo>` }, { quoted: message });
  const url = args.join(' ');
  await downloadViaAPI('snackvideo', url, remoteJid, sock, message);
}

async function handleMediafire(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `📂 Utilisation: ${config.prefix}mediafire <lien Mediafire>` }, { quoted: message });
  const url = args.join(' ');
  await downloadViaAPI('mediafire', url, remoteJid, sock, message);
}

async function handleLyrics(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🎵 Utilisation: ${config.prefix}lyrics <artiste - chanson>` }, { quoted: message });
  const query = args.join(' ');
  await downloadViaAPI('lyrics', query, remoteJid, sock, message);
}

async function handleAPK(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `📦 Utilisation: ${config.prefix}apk <nom application>` }, { quoted: message });
  const appName = args.join(' ');
  await downloadViaAPI('apk', appName, remoteJid, sock, message);
}

async function handleAI(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🤖 Utilisation: ${config.prefix}ai <votre question>` }, { quoted: message });
  const query = args.join(' ');
  await downloadViaAPI('ai', query, remoteJid, sock, message);
}

async function handleDeepseek(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `💻 Utilisation: ${config.prefix}deepseek <code ou question>` }, { quoted: message });
  const query = args.join(' ');
  await downloadViaAPI('deepseek', query, remoteJid, sock, message);
}

async function handleNanoImage(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🎨 Utilisation: ${config.prefix}nanoimage <description image>` }, { quoted: message });
  const query = args.join(' ');
  await downloadViaAPI('nanoimage', query, remoteJid, sock, message);
}

async function handleUserTikTok(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `👤 Utilisation: ${config.prefix}usertiktok <nom utilisateur TikTok>` }, { quoted: message });
  const username = args[0];
  await downloadViaAPI('usertiktok', username, remoteJid, sock, message);
}

// =============================================
// FONCTION UTILITAIRE POUR SIMULATION TYPING
// =============================================

async function simulateTyping(sock, remoteJid, duration = 2000) {
  try {
    await sock.sendPresenceUpdate('composing', remoteJid);
    await delay(duration);
    await sock.sendPresenceUpdate('paused', remoteJid);
  } catch(e) {}
}

// =============================================
// FONCTIONS D'AIDE
// =============================================

function isAdmin(jid) {
  return config.botAdmins.includes(jid.split('@')[0]);
}

async function sendWithImage(sock, remoteJid, type, text, mentions = []) {
  try {
    return await sock.sendMessage(remoteJid, { 
      text: text,
      mentions: mentions || []
    });
  } catch(e) {
    console.error('[SEND WITH IMAGE]', e.message);
    return await sock.sendMessage(remoteJid, { text: text });
  }
}

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// =============================================
// ANTI-COMMANDES AMÉLIORÉES - SEIGNEUR TD 🇹🇩
// =============================================

// ─── SYSTÈME DE PROTECTION ANTIDELETE ────────────────────────────────────────

const antiDeleteStore = new Map();

async function handleAntiDelete(sock, message, remoteJid, senderJid, isGroup) {
  if (!isGroup || !antiDeleteStore.get(remoteJid)) return;

  const msg = message.message;
  if (!msg) return;

  if (senderJid === sock.user.id) return;

  const senderNum = senderJid.split('@')[0];
  const isAdminSender = config.botAdmins.includes(senderNum);
  
  const groupMetadata = await sock.groupMetadata(remoteJid);
  const groupAdmins = groupMetadata.participants
    .filter(p => p.admin)
    .map(p => p.id.split('@')[0]);

  if (isAdminSender && groupAdmins.includes(senderNum)) {
    return;
  }

  try {
    const senderName = message.pushName || senderNum;
    let contentText = '';

    if (msg.conversation) {
      contentText = msg.conversation;
    } else if (msg.extendedTextMessage?.text) {
      contentText = msg.extendedTextMessage.text;
    } else if (msg.imageMessage) {
      contentText = `[📸 Image${msg.imageMessage.caption ? ': ' + msg.imageMessage.caption : ''}]`;
    } else if (msg.videoMessage) {
      contentText = `[🎥 Vidéo${msg.videoMessage.caption ? ': ' + msg.videoMessage.caption : ''}]`;
    } else if (msg.audioMessage) {
      contentText = '[🔊 Audio]';
    } else if (msg.stickerMessage) {
      contentText = '[🎨 Sticker]';
    } else if (msg.documentMessage) {
      contentText = `[📄 Document: ${msg.documentMessage.fileName || 'Sans nom'}]`;
    } else if (msg.contactMessage) {
      contentText = `[👤 Contact: ${msg.contactMessage.displayName}]`;
    } else if (msg.locationMessage) {
      contentText = '[📍 Localisation]';
    } else {
      contentText = '[Message supprimé - Type inconnu]';
    }

    const deleteAlert = `╔════════════════════════════╗
║  🗑️ MESSAGE SUPPRIMÉ       ║
╚════════════════════════════╝

👤 *Utilisateur:* +${senderNum} (${senderName})
⏰ *Heure:* ${new Date().toLocaleTimeString('fr-FR')}

📝 *Contenu supprimé:*
${contentText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ Anti-Delete SEIGNEUR TD 🇹🇩`;

    await sock.sendMessage(remoteJid, { 
      text: deleteAlert,
      mentions: [senderJid]
    });

  } catch (e) {
    console.error('[ANTIDELETE]', e.message);
  }
}

async function handleAntiDeleteCommand(sock, remoteJid, isGroup, senderJid) {
  if (!isGroup) {
    return await sock.sendMessage(remoteJid, { 
      text: '❌ Cette commande est réservée aux groupes uniquement' 
    });
  }

  const senderNum = senderJid.split('@')[0];
  if (!config.botAdmins.includes(senderNum)) {
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const isGroupAdmin = groupMetadata.participants.find(p => p.id === senderJid)?.admin;
    
    if (!isGroupAdmin) {
      return await sock.sendMessage(remoteJid, { 
        text: '⛔ Admin du groupe ou du bot requis' 
      });
    }
  }

  const isActive = antiDeleteStore.get(remoteJid);
  
  if (isActive) {
    antiDeleteStore.delete(remoteJid);
    await sock.sendMessage(remoteJid, {
      text: `🛑 *Anti-Delete désactivé*`
    });
  } else {
    antiDeleteStore.set(remoteJid, true);
    await sock.sendMessage(remoteJid, {
      text: `✅ *Anti-Delete activé*\n\nTous les messages supprimés seront enregistrés.`
    });
  }
}

// ─── ANTILINK ────────────────────────────────────────────────────────────────

const antiLinkStore = new Map();

async function handleAntiLink(sock, message, remoteJid, senderJid, isGroup) {
  if (!isGroup || !antiLinkStore.get(remoteJid)) return;

  const msg = message.message?.conversation || 
              message.message?.extendedTextMessage?.text || '';

  const urlRegex = /(?:https?:\/\/|www\.)[^\s]+/gi;
  if (!urlRegex.test(msg)) return;

  const senderNum = senderJid.split('@')[0];
  const isAdminSender = config.botAdmins.includes(senderNum);
  
  if (isAdminSender) return;

  const groupMetadata = await sock.groupMetadata(remoteJid);
  const groupAdmins = groupMetadata.participants
    .filter(p => p.admin)
    .map(p => p.id.split('@')[0]);

  if (groupAdmins.includes(senderNum)) return;

  try {
    await sock.sendMessage(remoteJid, { delete: message.key });
    
    const senderName = message.pushName || senderNum;
    await sock.sendMessage(remoteJid, {
      text: `⛔ *Lien supprimé*\n\n👤 ${senderName} (+${senderNum})\n📝 Les liens ne sont pas autorisés ici.`,
      mentions: [senderJid]
    });

  } catch (e) {
    console.error('[ANTILINK]', e.message);
  }
}

async function handleAntiLinkCommand(sock, remoteJid, isGroup, senderJid) {
  if (!isGroup) {
    return await sock.sendMessage(remoteJid, { 
      text: '❌ Commande réservée aux groupes' 
    });
  }

  const senderNum = senderJid.split('@')[0];
  if (!config.botAdmins.includes(senderNum)) {
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const isGroupAdmin = groupMetadata.participants.find(p => p.id === senderJid)?.admin;
    
    if (!isGroupAdmin) {
      return await sock.sendMessage(remoteJid, { text: '⛔ Admin requis' });
    }
  }

  const isActive = antiLinkStore.get(remoteJid);
  
  if (isActive) {
    antiLinkStore.delete(remoteJid);
    await sock.sendMessage(remoteJid, { text: '🛑 Anti-Link désactivé' });
  } else {
    antiLinkStore.set(remoteJid, true);
    await sock.sendMessage(remoteJid, { text: '✅ Anti-Link activé' });
  }
}

// ─── ANTISTICKER ────────────────────────────────────────────────────────────

const antiStickerStore = new Map();

async function handleAntiSticker(sock, message, remoteJid, senderJid, isGroup) {
  if (!isGroup || !antiStickerStore.get(remoteJid)) return;
  if (!message.message?.stickerMessage) return;

  const senderNum = senderJid.split('@')[0];
  const isAdminSender = config.botAdmins.includes(senderNum);
  
  if (isAdminSender) return;

  const groupMetadata = await sock.groupMetadata(remoteJid);
  const groupAdmins = groupMetadata.participants
    .filter(p => p.admin)
    .map(p => p.id.split('@')[0]);

  if (groupAdmins.includes(senderNum)) return;

  try {
    await sock.sendMessage(remoteJid, { delete: message.key });
    
    const senderName = message.pushName || senderNum;
    await sock.sendMessage(remoteJid, {
      text: `⛔ *Sticker supprimé*\n\n👤 ${senderName}\n📝 Les stickers ne sont pas autorisés ici.`,
      mentions: [senderJid]
    });

  } catch (e) {
    console.error('[ANTISTICKER]', e.message);
  }
}

async function handleAntiStickerCommand(sock, remoteJid, isGroup, senderJid) {
  if (!isGroup) {
    return await sock.sendMessage(remoteJid, { text: '❌ Commande réservée aux groupes' });
  }

  const senderNum = senderJid.split('@')[0];
  if (!config.botAdmins.includes(senderNum)) {
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const isGroupAdmin = groupMetadata.participants.find(p => p.id === senderJid)?.admin;
    
    if (!isGroupAdmin) {
      return await sock.sendMessage(remoteJid, { text: '⛔ Admin requis' });
    }
  }

  const isActive = antiStickerStore.get(remoteJid);
  
  if (isActive) {
    antiStickerStore.delete(remoteJid);
    await sock.sendMessage(remoteJid, { text: '🛑 Anti-Sticker désactivé' });
  } else {
    antiStickerStore.set(remoteJid, true);
    await sock.sendMessage(remoteJid, { text: '✅ Anti-Sticker activé' });
  }
}

// ─── ANTIIMAGE ───────────────────────────────────────────────────────────────

const antiImageStore = new Map();

async function handleAntiImage(sock, message, remoteJid, senderJid, isGroup) {
  if (!isGroup || !antiImageStore.get(remoteJid)) return;
  if (!message.message?.imageMessage) return;

  const senderNum = senderJid.split('@')[0];
  const isAdminSender = config.botAdmins.includes(senderNum);
  
  if (isAdminSender) return;

  const groupMetadata = await sock.groupMetadata(remoteJid);
  const groupAdmins = groupMetadata.participants
    .filter(p => p.admin)
    .map(p => p.id.split('@')[0]);

  if (groupAdmins.includes(senderNum)) return;

  try {
    await sock.sendMessage(remoteJid, { delete: message.key });
    
    const senderName = message.pushName || senderNum;
    await sock.sendMessage(remoteJid, {
      text: `⛔ *Image supprimée*\n\n👤 ${senderName}\n📝 Les images ne sont pas autorisées ici.`,
      mentions: [senderJid]
    });

  } catch (e) {
    console.error('[ANTIIMAGE]', e.message);
  }
}

async function handleAntiImageCommand(sock, remoteJid, isGroup, senderJid) {
  if (!isGroup) {
    return await sock.sendMessage(remoteJid, { text: '❌ Commande réservée aux groupes' });
  }

  const senderNum = senderJid.split('@')[0];
  if (!config.botAdmins.includes(senderNum)) {
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const isGroupAdmin = groupMetadata.participants.find(p => p.id === senderJid)?.admin;
    
    if (!isGroupAdmin) {
      return await sock.sendMessage(remoteJid, { text: '⛔ Admin requis' });
    }
  }

  const isActive = antiImageStore.get(remoteJid);
  
  if (isActive) {
    antiImageStore.delete(remoteJid);
    await sock.sendMessage(remoteJid, { text: '🛑 Anti-Image désactivé' });
  } else {
    antiImageStore.set(remoteJid, true);
    await sock.sendMessage(remoteJid, { text: '✅ Anti-Image activé' });
  }
}

// ─── ANTIVIDEO ───────────────────────────────────────────────────────────────

const antiVideoStore = new Map();

async function handleAntiVideo(sock, message, remoteJid, senderJid, isGroup) {
  if (!isGroup || !antiVideoStore.get(remoteJid)) return;
  if (!message.message?.videoMessage) return;

  const senderNum = senderJid.split('@')[0];
  const isAdminSender = config.botAdmins.includes(senderNum);
  
  if (isAdminSender) return;

  const groupMetadata = await sock.groupMetadata(remoteJid);
  const groupAdmins = groupMetadata.participants
    .filter(p => p.admin)
    .map(p => p.id.split('@')[0]);

  if (groupAdmins.includes(senderNum)) return;

  try {
    await sock.sendMessage(remoteJid, { delete: message.key });
    
    const senderName = message.pushName || senderNum;
    await sock.sendMessage(remoteJid, {
      text: `⛔ *Vidéo supprimée*\n\n👤 ${senderName}\n📝 Les vidéos ne sont pas autorisées ici.`,
      mentions: [senderJid]
    });

  } catch (e) {
    console.error('[ANTIVIDEO]', e.message);
  }
}

async function handleAntiVideoCommand(sock, remoteJid, isGroup, senderJid) {
  if (!isGroup) {
    return await sock.sendMessage(remoteJid, { text: '❌ Commande réservée aux groupes' });
  }

  const senderNum = senderJid.split('@')[0];
  if (!config.botAdmins.includes(senderNum)) {
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const isGroupAdmin = groupMetadata.participants.find(p => p.id === senderJid)?.admin;
    
    if (!isGroupAdmin) {
      return await sock.sendMessage(remoteJid, { text: '⛔ Admin requis' });
    }
  }

  const isActive = antiVideoStore.get(remoteJid);
  
  if (isActive) {
    antiVideoStore.delete(remoteJid);
    await sock.sendMessage(remoteJid, { text: '🛑 Anti-Video désactivé' });
  } else {
    antiVideoStore.set(remoteJid, true);
    await sock.sendMessage(remoteJid, { text: '✅ Anti-Video activé' });
  }
}

// =============================================
// STATUTS - SWGC ET TOSTATUS
// =============================================

// ─── SWGC - ENVOYER UN STATUT AU GROUPE ──────────────────────────────────────

async function handleSWGC(sock, args, remoteJid, message, senderJid, isGroup) {
  try {
    const crypto = require('crypto');
    const { generateWAMessageContent, generateWAMessageFromContent, downloadContentFromMessage } = require('@rexxhayanasi/elaina-baileys');

    async function groupStatus(client, jid, content) {
      try {
        const inside = await generateWAMessageContent(content, {
          upload: client.waUploadToServer
        });
        const messageSecret = crypto.randomBytes(32);
        const m = generateWAMessageFromContent(
          jid,
          {
            messageContextInfo: { messageSecret },
            groupStatusMessageV2: {
              message: { ...inside, messageContextInfo: { messageSecret } }
            }
          },
          {}
        );
        await client.relayMessage(jid, m.message, { messageId: m.key.id });
      } catch (e) {
        throw new Error('Erreur lors de l\'envoi du statut groupe: ' + e.message);
      }
    }

    function randomColor() {
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
      return colors[Math.floor(Math.random() * colors.length)];
    }

    if (!isGroup) {
      return await sock.sendMessage(remoteJid, { 
        text: '❌ Cette commande fonctionne seulement dans les groupes' 
      });
    }

    const senderNum = senderJid.split('@')[0];
    const isAdminSender = config.botAdmins.includes(senderNum);
    
    if (!isAdminSender) {
      const groupMetadata = await sock.groupMetadata(remoteJid);
      const isGroupAdmin = groupMetadata.participants.find(p => p.id === senderJid)?.admin;
      
      if (!isGroupAdmin) {
        return await sock.sendMessage(remoteJid, { 
          text: '⛔ Admin du groupe requis pour utiliser SWGC' 
        });
      }
    }

    await sock.sendMessage(remoteJid, { react: { text: '⏳', key: message.key } });
    const loadMsg = await sock.sendMessage(remoteJid, { text: '⏳ *Traitement en cours...*' }, { quoted: message });

    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const textInput = args.join(' ').trim();

    // Si c'est une réponse à un message
    if (quoted) {
      if (quoted.videoMessage) {
        const videoMsg = quoted.videoMessage;
        const stream = await downloadContentFromMessage(videoMsg, 'video');
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        const payload = {
          video: buffer,
          caption: textInput || '',
          mimetype: videoMsg.mimetype || 'video/mp4',
          backgroundColor: randomColor()
        };
        
        await groupStatus(sock, remoteJid, payload);
        await sock.sendMessage(remoteJid, { text: '✅ Status vidéo publié au groupe!', edit: loadMsg.key });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
        
      } else if (quoted.imageMessage) {
        const imgMsg = quoted.imageMessage;
        const stream = await downloadContentFromMessage(imgMsg, 'image');
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        const payload = {
          image: buffer,
          caption: textInput || '',
          backgroundColor: randomColor()
        };
        
        await groupStatus(sock, remoteJid, payload);
        await sock.sendMessage(remoteJid, { text: '✅ Status image publié au groupe!', edit: loadMsg.key });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
        
      } else if (quoted.audioMessage) {
        const audioMsg = quoted.audioMessage;
        const stream = await downloadContentFromMessage(audioMsg, 'audio');
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        const payload = {
          audio: buffer,
          mimetype: audioMsg.mimetype || 'audio/mp4',
          backgroundColor: randomColor()
        };
        
        await groupStatus(sock, remoteJid, payload);
        await sock.sendMessage(remoteJid, { text: '✅ Status audio publié au groupe!', edit: loadMsg.key });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
        
      } else {
        let quotedText = '';
        if (quoted.conversation) {
          quotedText = quoted.conversation;
        } else if (quoted.extendedTextMessage?.text) {
          quotedText = quoted.extendedTextMessage.text;
        }
        
        const textToUse = textInput || quotedText;
        
        if (!textToUse) {
          return await sock.sendMessage(remoteJid, { 
            text: '❌ Aucun contenu à publier',
            edit: loadMsg.key 
          });
        }
        
        const payload = {
          text: textToUse,
          backgroundColor: randomColor()
        };
        
        await groupStatus(sock, remoteJid, payload);
        await sock.sendMessage(remoteJid, { text: '✅ Status texte publié au groupe!', edit: loadMsg.key });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
      }
    } else if (textInput) {
      const payload = {
        text: textInput,
        backgroundColor: randomColor()
      };
      
      await groupStatus(sock, remoteJid, payload);
      await sock.sendMessage(remoteJid, { text: '✅ Status texte publié au groupe!', edit: loadMsg.key });
      await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
    } else {
      await sock.sendMessage(remoteJid, { 
        text: `❌ Utilisation:\n• Texte: ${config.prefix}swgc Votre texte\n• Média: Répondez à une image/vidéo/audio avec ${config.prefix}swgc`,
        edit: loadMsg.key 
      });
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
    }

  } catch (e) {
    console.error('[SWGC]', e.message);
    await sock.sendMessage(remoteJid, { 
      text: `❌ Erreur SWGC: ${e.message}` 
    });
    await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
  }
}

// ─── TOSTATUS - ENVOYER UN STATUT AVEC MENTION ───────────────────────────────

async function handleToStatus(sock, args, remoteJid, message, senderJid) {
  try {
    await sock.sendMessage(remoteJid, { react: { text: '⏳', key: message.key } });
    const loadMsg = await sock.sendMessage(remoteJid, { text: '⏳ *Publication du statut...*' }, { quoted: message });

    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const textInput = args.join(' ').trim();
    const senderNum = senderJid.split('@')[0];

    // Fonction pour envoyer le statut
    async function sendStatusWithMention(content) {
      try {
        // Envoyer au statut personnel avec mention
        const botJid = sock.user.id;
        await sock.sendMessage(botJid, content);
      } catch (e) {
        throw new Error('Impossible d\'envoyer au statut: ' + e.message);
      }
    }

    if (!quoted && !textInput) {
      return await sock.sendMessage(remoteJid, { 
        text: `❌ Utilisation:\n• Texte: ${config.prefix}tostatus Votre texte\n• Média: Répondez à un média avec ${config.prefix}tostatus`,
        edit: loadMsg.key 
      });
    }

    // Si c'est une réponse à un message
    if (quoted) {
      if (quoted.audioMessage) {
        const audioMsg = quoted.audioMessage;
        const stream = await downloadContentFromMessage(audioMsg, 'audio');
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        await sendStatusWithMention({
          audio: buffer,
          mimetype: 'audio/mp4',
          ptt: true,
          caption: textInput || `Status de +${senderNum}`
        });

        await sock.sendMessage(remoteJid, { 
          text: '✅ Status audio publié avec succès!', 
          edit: loadMsg.key 
        });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });

      } else if (quoted.imageMessage) {
        const imgMsg = quoted.imageMessage;
        const stream = await downloadContentFromMessage(imgMsg, 'image');
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        await sendStatusWithMention({
          image: buffer,
          caption: textInput || `Status de +${senderNum}`
        });

        await sock.sendMessage(remoteJid, { 
          text: '✅ Status image publié avec succès!', 
          edit: loadMsg.key 
        });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });

      } else if (quoted.videoMessage) {
        const videoMsg = quoted.videoMessage;
        const stream = await downloadContentFromMessage(videoMsg, 'video');
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        
        await sendStatusWithMention({
          video: buffer,
          mimetype: 'video/mp4',
          caption: textInput || `Status de +${senderNum}`
        });

        await sock.sendMessage(remoteJid, { 
          text: '✅ Status vidéo publié avec succès!', 
          edit: loadMsg.key 
        });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });

      } else {
        let quotedText = '';
        if (quoted.conversation) {
          quotedText = quoted.conversation;
        } else if (quoted.extendedTextMessage?.text) {
          quotedText = quoted.extendedTextMessage.text;
        }
        
        const textToUse = textInput || quotedText;
        
        if (!textToUse) {
          return await sock.sendMessage(remoteJid, { 
            text: '❌ Aucun texte à publier',
            edit: loadMsg.key 
          });
        }
        
        await sendStatusWithMention({
          text: textToUse
        });

        await sock.sendMessage(remoteJid, { 
          text: '✅ Status texte publié avec succès!', 
          edit: loadMsg.key 
        });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
      }

    } else if (textInput) {
      await sendStatusWithMention({
        text: textInput
      });

      await sock.sendMessage(remoteJid, { 
        text: '✅ Status texte publié avec succès!', 
        edit: loadMsg.key 
      });
      await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
    }

  } catch (e) {
    console.error('[TOSTATUS]', e.message);
    await sock.sendMessage(remoteJid, { 
      text: `❌ Erreur: ${e.message}` 
    });
    await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
  }
}

// ─── ANTIBOT ────────────────────────────────────────────────────────────────

const antiBotStore = new Map();

async function handleAntiBot(sock, message, remoteJid, senderJid, isGroup) {
  if (!isGroup || !antiBotStore.get(remoteJid)) return;

  const senderNum = senderJid.split('@')[0];
  const isBotLike = senderNum.length > 15 || senderNum.startsWith('6');

  if (!isBotLike) return;

  try {
    await sock.sendMessage(remoteJid, { delete: message.key });
    
    await sock.sendMessage(remoteJid, {
      text: `🤖 *Bot bloqué*\n\nLes bots ne sont pas autorisés ici.`,
      mentions: [senderJid]
    });

  } catch (e) {
    console.error('[ANTIBOT]', e.message);
  }
}

async function handleAntiBotCommand(sock, remoteJid, isGroup, senderJid) {
  if (!isGroup) {
    return await sock.sendMessage(remoteJid, { text: '❌ Commande réservée aux groupes' });
  }

  const senderNum = senderJid.split('@')[0];
  if (!config.botAdmins.includes(senderNum)) {
    const groupMetadata = await sock.groupMetadata(remoteJid);
    const isGroupAdmin = groupMetadata.participants.find(p => p.id === senderJid)?.admin;
    
    if (!isGroupAdmin) {
      return await sock.sendMessage(remoteJid, { text: '⛔ Admin requis' });
    }
  }

  const isActive = antiBotStore.get(remoteJid);
  
  if (isActive) {
    antiBotStore.delete(remoteJid);
    await sock.sendMessage(remoteJid, { text: '🛑 Anti-Bot désactivé' });
  } else {
    antiBotStore.set(remoteJid, true);
    await sock.sendMessage(remoteJid, { text: '✅ Anti-Bot activé' });
  }
}

// =============================================
// EXPORT DES HANDLERS
// =============================================

module.exports = {
  handleMenu,
  handleAllMenu,
  sendSubMenu,
  buildUptime,
  getMenuCategories,
  handleGetPP,
  handleGPP,
  handleSetPP,
  handleYouTubeAudio,
  handleYouTubeVideo,
  handleTikTok,
  handleInstagram,
  handleFacebook,
  handleTwitter,
  handleThreads,
  handleSnackVideo,
  handleMediafire,
  handleLyrics,
  handleAPK,
  handleAI,
  handleDeepseek,
  handleNanoImage,
  handleUserTikTok,
  downloadViaAPI,
  simulateTyping,
  isAdmin,
  sendWithImage,
  delay,
  handleSWGC,
  handleToStatus,
  handleAntiDelete,
  handleAntiDeleteCommand,
  handleAntiLink,
  handleAntiLinkCommand,
  handleAntiSticker,
  handleAntiStickerCommand,
  handleAntiImage,
  handleAntiImageCommand,
  handleAntiVideo,
  handleAntiVideoCommand,
  handleAntiBot,
  handleAntiBotCommand,
  antiDeleteStore,
  antiLinkStore,
  antiStickerStore,
  antiImageStore,
  antiVideoStore,
  antiBotStore
};
