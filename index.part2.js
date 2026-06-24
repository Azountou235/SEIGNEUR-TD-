import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import sharp from 'sharp';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = 'https://api-trustbit.name.ng/api';

const activeSessions = new Map();

async function handleMenu(sock, message, remoteJid, senderJid) {
  const uptimeSec = Math.floor(process.uptime());
  const uh = Math.floor(uptimeSec / 3600);
  const um = Math.floor((uptimeSec % 3600) / 60);
  const uptimeStr = uh > 0 ? `${uh}h ${um}m` : `${um}m`;

  const menuText = `
╔════════════════════════════════════════╗
║       🤖 SEIGNEUR TD — MENU 🇷🇴        ║
╚════════════════════════════════════════╝

📱 *BOT WHATSAPP MULTI-SESSION*
⏳ Uptime: ${uptimeStr}

╭─「 💼 GESTION BOT 」
│ .menu — Afficher ce menu
│ .ping — Vérifier la latence
│ .alive — État du bot
│ .info — Infos du bot
│ .update — Mise à jour depuis GitHub
╰─────────────────────────────────

╭─「 ✨ COMMANDES MAGIC 」
│ .magic +235XXXXXX — Récupérer statuts anonymement
│ .silentread — Lire SANS marquer "lu"
│ .getpp +235XXXXXX — Photo de profil
│ .setpp [répondre image] — Changer ta photo
│ .gpp — Photo du groupe
│ .tostatus — Publier en statut de groupe
│ .swgc [texte] — Publier statut de groupe avancé
╰─────────────────────────────────

╭─「 📥 TÉLÉCHARGEMENTS 」
│ .fb [lien] — Facebook
│ .ig [lien] — Instagram
│ .tiktok [lien] — TikTok
│ .twitter [lien] — Twitter
│ .threads [lien] — Threads
│ .snack [lien] — Snackvideo
│ .mediafire [lien] — Mediafire
│ .ytmp3 [lien] — YouTube audio
│ .ytmp4 [lien] — YouTube vidéo
│ .lyrics [chanson] — Paroles
│ .apk [app] — Chercher APK
╰─────────────────────────────────

╭─「 🤖 IA & OUTILS 」
│ .ai [question] — IA Claude/GPT
│ .deepseek [code] — Code avancé
│ .imagine [texte] — Générer image
│ .usertiktok [username] — User TikTok
╰─────────────────────────────────

╭─「 👥 GROUPE 」
│ .antilink on/off — Anti-lien
│ .antisticker on/off — Anti-sticker
│ .antispam on/off — Anti-spam
│ .antitag on/off — Anti-mention
│ .antiimage on/off — Anti-image
│ .antivideo on/off — Anti-vidéo
│ .antibot on/off — Anti-bot
╰─────────────────────────────────

╭─「 ⚠️ SIGNALEMENT 」
│ .report +235XXXXXX — Signaler un numéro (200x)
│ .reportgroup — Signaler le groupe (100x)
╰─────────────────────────────────

*Tapez un numéro pour plus de détails:*
1️⃣ Owner  |  2️⃣ Download  |  3️⃣ Group
4️⃣ Utility  |  5️⃣ Sticker  |  6️⃣ Misc
7️⃣ Image  |  8️⃣ Games

© SEIGNEUR TD 🇷🇴
`;

  await sock.sendMessage(remoteJid, { text: menuText });
}

async function handleAllMenu(sock, message, remoteJid, senderJid) {
  await handleMenu(sock, message, remoteJid, senderJid);
}

async function sendSubMenu(sock, message, remoteJid, senderJid, type) {
  const subMenus = {
    owner: `👑 *MENU OWNER*\n\n.mode private/public\n.update\n.autotyping on/off\n.autorecording on/off`,
    download: `📥 *MENU TÉLÉCHARGEMENTS*\n\n.fb .ig .tiktok .twitter\n.threads .snack .mediafire\n.ytmp3 .ytmp4 .lyrics .apk`,
    group: `👥 *MENU GROUPE*\n\n.antilink .antisticker .antispam\n.antitag .antiimage .antivideo .antibot`,
    utility: `⚙️ *MENU UTILITAIRE*\n\n.magic .silentread .getpp .setpp .gpp`,
    sticker: `🎨 *MENU STICKER*\n\n.take .sticker .stickerpackname`,
    misc: `🎯 *MENU DIVERS*\n\n.tostatus .swgc .report .reportgroup`,
    image: `🖼️ *MENU IMAGE*\n\n.vv .imagine`,
    games: `🎮 *MENU JEUX*\n\n.squidgame .t`
  };

  const text = subMenus[type] || `Menu non trouvé`;
  await sock.sendMessage(remoteJid, { text });
}

async function handleViewOnceCommand(sock, message, args, remoteJid, senderJid) {
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) {
    await sock.sendMessage(remoteJid, { text: '❌ Réponds à un message vue unique' });
    return;
  }

  const msgKeys = Object.keys(quoted || {});
  const isVo = msgKeys.some(k => k.toLowerCase().includes('viewonce'));
  
  if (isVo) {
    await sock.sendMessage(remoteJid, { text: '✅ C\'est une vue unique' });
  } else {
    await sock.sendMessage(remoteJid, { text: '❌ Pas une vue unique' });
  }
}

async function handleFancy(sock, args, remoteJid, senderJid) {
  const text = args.join(' ');
  if (!text) {
    await sock.sendMessage(remoteJid, { text: '❌ Fournir du texte' });
    return;
  }

  const fancy = text.split('').map(c => {
    const fancyMap = {
      'a': '𝖆', 'b': '𝖇', 'c': '𝖈', 'd': '𝖉', 'e': '𝖊',
      'f': '𝖋', 'g': '𝖌', 'h': '𝖍', 'i': '𝖎', 'j': '𝖏'
    };
    return fancyMap[c.toLowerCase()] || c;
  }).join('');

  await sock.sendMessage(remoteJid, { text: fancy });
}

// ═══════════════════════════════════════════════════════════════
// ✨ COMMANDES MAGIC
// ═══════════════════════════════════════════════════════════════

async function handleMagic(sock, args, remoteJid, senderJid) {
  const targetNum = args[0]?.trim();
  if (!targetNum) {
    await sock.sendMessage(remoteJid, { text: `✨ *MAGIC*\n\nUsage: .magic +235912345678` });
    return;
  }

  let targetJid = targetNum.replace(/[^\d]/g, '').replace(/^1/, '');
  if (targetJid.length < 9) {
    await sock.sendMessage(remoteJid, { text: '❌ Numéro invalide' });
    return;
  }

  targetJid = targetJid + '@s.whatsapp.net';
  const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

  try {
    await sock.sendMessage(remoteJid, { text: '✨ *MAGIC* en cours...\n⏳ Récupération des statuts...' });

    let statusCount = 0;
    const statusList = [];

    const magicHandler = async (m) => {
      try {
        if (!m.key || !m.message) return;
        const sender = m.key.participant || m.key.remoteJid;
        if (sender !== targetJid) return;
        if (m.key.remoteJid !== 'status@broadcast') return;

        statusCount++;
        const msg = m.message;

        if (msg?.imageMessage) {
          try {
            const stream = await downloadContentFromMessage(msg.imageMessage, 'image');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            statusList.push({ type: 'image', buffer: Buffer.concat(chunks) });
          } catch(e) {}
        }
        else if (msg?.videoMessage) {
          try {
            const stream = await downloadContentFromMessage(msg.videoMessage, 'video');
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            statusList.push({ type: 'video', buffer: Buffer.concat(chunks) });
          } catch(e) {}
        }
        else if (msg?.conversation || msg?.extendedTextMessage?.text) {
          const txt = msg?.conversation || msg?.extendedTextMessage?.text;
          statusList.push({ type: 'text', text: txt });
        }
      } catch(e) {}
    };

    sock.ev.on('messages.upsert', magicHandler);
    await new Promise(resolve => setTimeout(resolve, 10000));
    sock.ev.removeListener('messages.upsert', magicHandler);

    if (statusCount === 0) {
      await sock.sendMessage(remoteJid, { text: `❌ Aucun status trouvé` });
      return;
    }

    for (let i = 0; i < statusList.length; i++) {
      const status = statusList[i];
      try {
        if (status.type === 'image') {
          await sock.sendMessage(botJid, { image: status.buffer, caption: `📸 Status #${i+1}/${statusCount}` });
        } else if (status.type === 'video') {
          await sock.sendMessage(botJid, { video: status.buffer, caption: `🎥 Status #${i+1}/${statusCount}` });
        } else if (status.type === 'text') {
          await sock.sendMessage(botJid, { text: `📝 #${i+1}:\n${status.text}` });
        }
        await new Promise(r => setTimeout(r, 500));
      } catch(e) {}
    }

    await sock.sendMessage(remoteJid, { text: `✨ *MAGIC RÉUSSI*\n📊 ${statusCount} status(es)\n_Personne ne saura 👻_` });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

async function handleSilentRead(sock, remoteJid, senderJid) {
  if (!global._silentReadChats) global._silentReadChats = new Set();
  global._silentReadChats.add(remoteJid);

  await sock.sendMessage(remoteJid, { text: `🤐 *SILENT READ ACTIVÉ*\n\n✅ Les messages seront lus silencieusement\n❌ Pas de double trait (✓✓)\n👻 Personne ne saura` });
}

async function handleTostatus(sock, message, remoteJid, senderJid, isGroup) {
  try {
    if (!isGroup) {
      await sock.sendMessage(remoteJid, { text: '❌ Commande pour les groupes uniquement' });
      return;
    }

    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const textInput = message.message?.extendedTextMessage?.text || '';

    if (!quoted && !textInput) {
      await sock.sendMessage(remoteJid, { text: `❌ Réponds à un média ou envoie un texte` });
      return;
    }

    await sock.sendMessage(remoteJid, { react: { text: '⏳', key: message.key } });

    if (quoted?.imageMessage) {
      const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      await sock.sendMessage('status@broadcast', {
        image: buffer,
        caption: textInput || ' ',
        statusJidList: [remoteJid]
      });
    }
    else if (quoted?.videoMessage) {
      const stream = await downloadContentFromMessage(quoted.videoMessage, 'video');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      await sock.sendMessage('status@broadcast', {
        video: buffer,
        caption: textInput || ' ',
        statusJidList: [remoteJid]
      });
    }
    else if (quoted?.audioMessage) {
      const stream = await downloadContentFromMessage(quoted.audioMessage, 'audio');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      await sock.sendMessage('status@broadcast', {
        audio: buffer,
        mimetype: 'audio/mp4',
        ptt: true,
        statusJidList: [remoteJid]
      });
    }
    else if (textInput) {
      await sock.sendMessage('status@broadcast', {
        text: textInput,
        statusJidList: [remoteJid]
      });
    }

    await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
    await sock.sendMessage(remoteJid, { text: '✅ Statut publié !' });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

async function handleSwgc(sock, message, remoteJid, senderJid, isGroup) {
  try {
    if (!isGroup) {
      await sock.sendMessage(remoteJid, { text: '❌ Commande pour les groupes uniquement' });
      return;
    }

    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const textInput = message.message?.extendedTextMessage?.text || '';

    await sock.sendMessage(remoteJid, { react: { text: '⏳', key: message.key } });

    if (quoted?.imageMessage) {
      const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      await sock.sendMessage('status@broadcast', {
        image: buffer,
        caption: textInput || ' ',
        statusJidList: [remoteJid]
      });
    }
    else if (quoted?.videoMessage) {
      const stream = await downloadContentFromMessage(quoted.videoMessage, 'video');
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      await sock.sendMessage('status@broadcast', {
        video: buffer,
        caption: textInput || ' ',
        statusJidList: [remoteJid]
      });
    }
    else if (textInput) {
      await sock.sendMessage('status@broadcast', {
        text: textInput,
        statusJidList: [remoteJid]
      });
    }

    await sock.sendMessage(remoteJid, { react: { text: '✅', key: message.key } });
    await sock.sendMessage(remoteJid, { text: '✅ Statut publié via SWGC !' });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Erreur SWGC: ${e.message}` });
  }
}

async function handleReport(sock, args, remoteJid, senderJid) {
  const targetNum = args[0]?.trim();
  if (!targetNum) {
    await sock.sendMessage(remoteJid, { text: `⚠️ *SIGNALER*\n\nUsage: .report +235912345678` });
    return;
  }

  let targetJid = targetNum.replace(/[^\d]/g, '').replace(/^1/, '');
  if (targetJid.length < 9) {
    await sock.sendMessage(remoteJid, { text: '❌ Numéro invalide' });
    return;
  }

  targetJid = targetJid + '@s.whatsapp.net';

  try {
    await sock.sendMessage(remoteJid, { text: `⚠️ *SIGNALEMENT EN COURS*\n⏱️ Signalements: 0/200` });

    let count = 0;
    for (let i = 0; i < 200; i++) {
      await new Promise(r => setTimeout(r, Math.random() * 3000 + 2000));
      try {
        await sock.sendMessage(targetJid, { 
          text: `Report: Abuse/Spam`,
          contextInfo: { isForwarded: true }
        }).catch(() => {});
        count++;
      } catch(e) {}
    }

    await sock.sendMessage(remoteJid, { text: `✅ *SIGNALEMENT TERMINÉ*\n📊 Total: ${count} signalements` });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

async function handleReportGroup(sock, remoteJid, senderJid, isGroup) {
  if (!isGroup) {
    await sock.sendMessage(remoteJid, { text: '❌ Commande pour les groupes uniquement' });
    return;
  }

  try {
    await sock.sendMessage(remoteJid, { text: `⚠️ *SIGNALEMENT DU GROUPE*\n⏱️ Signalements: 0/100` });

    let count = 0;
    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, Math.random() * 3000 + 1000));
      try {
        await sock.sendMessage(remoteJid, { text: `Report: ${i+1}/100` }).catch(() => {});
        count++;
      } catch(e) {}
    }

    await sock.sendMessage(remoteJid, { text: `✅ *SIGNALEMENT TERMINÉ*\n📊 Total: ${count} signalements` });
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

// ═══════════════════════════════════════════════════════════════
// TÉLÉCHARGEMENTS - APIs TRUSTBIT
// ═══════════════════════════════════════════════════════════════

async function downloadFromAPI(sock, remoteJid, url, apiEndpoint, mediaType = 'video') {
  try {
    await sock.sendMessage(remoteJid, { text: '⏳ Téléchargement...' });

    const response = await axios.post(`${API_BASE}${apiEndpoint}`, { url }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    if (!response.data?.result?.download_url && !response.data?.download_url) {
      throw new Error('Lien de téléchargement non trouvé');
    }

    const dlUrl = response.data?.result?.download_url || response.data?.download_url;
    const mediaBuffer = await axios.get(dlUrl, { responseType: 'arraybuffer' });

    if (mediaType === 'video') {
      await sock.sendMessage(remoteJid, { video: mediaBuffer.data, caption: '© SEIGNEUR TD' });
    } else if (mediaType === 'audio') {
      await sock.sendMessage(remoteJid, { audio: mediaBuffer.data, mimetype: 'audio/mpeg' });
    } else if (mediaType === 'image') {
      await sock.sendMessage(remoteJid, { image: mediaBuffer.data, caption: '© SEIGNEUR TD' });
    } else {
      await sock.sendMessage(remoteJid, { document: mediaBuffer.data, fileName: 'download' });
    }
  } catch(e) {
    await sock.sendMessage(remoteJid, { text: `❌ Erreur téléchargement: ${e.message}` });
  }
}

// ═══════════════════════════════════════════════════════════════
// SERVEUR HTTP API (PORT 3005)
// ═══════════════════════════════════════════════════════════════

export function startAPIServer(mainSock) {
  const { createServer } = await import('http');

  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/api/status' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'online', bot: 'SEIGNEUR TD', sessions: activeSessions.size }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    }
  });

  const PORT = 3005;
  server.listen(PORT, () => {
    console.log(`🌐 API serveur lancé sur le port ${PORT}`);
  });
}

// ═══════════════════════════════════════════════════════════════
// WATCHDOG - VÉRIFIER QUE LE BOT EST VIVANT
// ═══════════════════════════════════════════════════════════════

export function startWatchdog(sock, reconnectCallback) {
  setInterval(async () => {
    try {
      const state = sock.ws?.readyState;
      if (state !== 1) {
        console.log('[WATCHDOG] ⚠️ WebSocket morte, envoi probe...');
        await sock.sendPresenceUpdate('available').catch(() => {});
        
        await new Promise(r => setTimeout(r, 8000));
        
        if (sock.ws?.readyState !== 1) {
          console.log('[WATCHDOG] 💀 Pas de réponse, fermeture socket...');
          await sock.ws?.close();
          if (reconnectCallback) reconnectCallback();
        }
      }
    } catch(e) {
      console.error('[WATCHDOG]', e.message);
    }
  }, 30000);
}

// Export final
export async function handleCommand(sock, message, messageText, remoteJid, senderJid, isGroup) {
  const prefix = '.';
  const afterPrefix = messageText.slice(prefix.length).trim();
  const args = afterPrefix.split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    switch(command) {
      case 'magic':
        await handleMagic(sock, args, remoteJid, senderJid);
        break;
      case 'silentread':
        await handleSilentRead(sock, remoteJid, senderJid);
        break;
      case 'tostatus':
        await handleTostatus(sock, message, remoteJid, senderJid, isGroup);
        break;
      case 'swgc':
        await handleSwgc(sock, message, remoteJid, senderJid, isGroup);
        break;
      case 'report':
      case 'signaler':
        await handleReport(sock, args, remoteJid, senderJid);
        break;
      case 'reportgroup':
      case 'signalgroup':
        await handleReportGroup(sock, remoteJid, senderJid, isGroup);
        break;
      case 'menu':
        await handleMenu(sock, message, remoteJid, senderJid);
        break;
      case 'allmenu':
        await handleAllMenu(sock, message, remoteJid, senderJid);
        break;
      case 'fb':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/facebook', 'video');
        break;
      case 'ig':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/instagram', 'video');
        break;
      case 'tiktok':
      case 'tk':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/tiktok', 'video');
        break;
      case 'twitter':
      case 'tw':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/twitter', 'video');
        break;
      case 'threads':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/threads', 'video');
        break;
      case 'snack':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/snackvideo', 'video');
        break;
      case 'mediafire':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/mediafire', 'document');
        break;
      case 'ytmp3':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/youtube-audio', 'audio');
        break;
      case 'ytmp4':
        await downloadFromAPI(sock, remoteJid, args[0], '/download/youtube-video', 'video');
        break;
      case 'lyrics':
        const lyricUrl = args.join(' ');
        await downloadFromAPI(sock, remoteJid, lyricUrl, '/search/lyrics', 'document');
        break;
      case 'apk':
        const appName = args.join(' ');
        await downloadFromAPI(sock, remoteJid, appName, '/tools/fdroidsearch', 'document');
        break;
      case 'ai':
        const aiQuestion = args.join(' ');
        try {
          const aiResponse = await axios.post(`${API_BASE}/ai/ai4chat`, { prompt: aiQuestion });
          await sock.sendMessage(remoteJid, { text: aiResponse.data?.result || 'Pas de réponse' });
        } catch(e) {
          await sock.sendMessage(remoteJid, { text: `❌ Erreur IA: ${e.message}` });
        }
        break;
      case 'deepseek':
        const codeInput = args.join(' ');
        try {
          const dsResponse = await axios.post(`${API_BASE}/ai/code-advanced`, { code: codeInput });
          await sock.sendMessage(remoteJid, { text: dsResponse.data?.result || 'Pas de réponse' });
        } catch(e) {
          await sock.sendMessage(remoteJid, { text: `❌ Erreur Deepseek: ${e.message}` });
        }
        break;
      case 'imagine':
        const imgText = args.join(' ');
        try {
          const imgResponse = await axios.post(`${API_BASE}/ai/txt2img`, { prompt: imgText });
          if (imgResponse.data?.result) {
            const imgBuffer = await axios.get(imgResponse.data.result, { responseType: 'arraybuffer' });
            await sock.sendMessage(remoteJid, { image: imgBuffer.data, caption: '© SEIGNEUR TD' });
          }
        } catch(e) {
          await sock.sendMessage(remoteJid, { text: `❌ Erreur Imagine: ${e.message}` });
        }
        break;
      case 'usertiktok':
        const tkUser = args[0];
        try {
          const tkResponse = await axios.post(`${API_BASE}/search/tiktoksearch`, { query: tkUser });
          await sock.sendMessage(remoteJid, { text: tkResponse.data?.result || 'User non trouvé' });
        } catch(e) {
          await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
        }
        break;
      default:
        await sock.sendMessage(remoteJid, { text: `❌ Commande non trouvée: \`${command}\`` });
    }
  } catch(e) {
    console.error('[CMD ERROR]', e.message);
    await sock.sendMessage(remoteJid, { text: `❌ Erreur: ${e.message}` });
  }
}

export { startAPIServer, startWatchdog, handleMenu, activeSessions };
