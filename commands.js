// =============================================
// 📦 NOUVELLES COMMANDES — SEIGNEUR TD 🇷🇴
// =============================================

import axios from 'axios';
import fs from 'fs';
import path from 'path';

const GIFTED_KEY = 'gifted';
const BASE = 'https://api.giftedtech.co.ke/api';

// ─── APIs ────────────────────────────────────────────────────────────────────

async function apiGPT(q) {
  const r = await axios.get(`${BASE}/ai/gpt4o`, { params: { apikey: GIFTED_KEY, q }, timeout: 30000 });
  return r.data?.result || r.data?.message || '❌ Pas de réponse';
}

async function apiGemini(q) {
  const r = await axios.get(`${BASE}/ai/gemini`, { params: { apikey: GIFTED_KEY, q }, timeout: 30000 });
  return r.data?.result || r.data?.message || '❌ Pas de réponse';
}

async function apiSora(prompt) {
  const r = await axios.get(`${BASE}/ai/txt2img`, { params: { apikey: GIFTED_KEY, prompt }, timeout: 60000 });
  return r.data?.result || r.data?.url || null;
}

async function apiHD(url) {
  const r = await axios.get(`${BASE}/tools/imageenhancer`, { params: { apikey: GIFTED_KEY, url }, timeout: 30000 });
  return r.data?.result || null;
}

async function apiMagicEraser(url) {
  const r = await axios.get(`${BASE}/tools/magiceraser`, { params: { apikey: GIFTED_KEY, url }, timeout: 30000 });
  return r.data?.result || null;
}

async function apiWatermarkRemover(url) {
  const r = await axios.get(`${BASE}/tools/watermarkremover`, { params: { apikey: GIFTED_KEY, url }, timeout: 30000 });
  return r.data?.result || null;
}

async function apiVocalRemover(url) {
  const r = await axios.get(`${BASE}/tools/vocalremover`, { params: { apikey: GIFTED_KEY, url }, timeout: 60000 });
  return r.data?.result || r.data?.vocal || null;
}

async function apiRemini(url) {
  const r = await axios.get(`${BASE}/tools/remini`, { params: { apikey: GIFTED_KEY, url }, timeout: 30000 });
  return r.data?.result || null;
}

async function apiQRRead(url) {
  const r = await axios.get(`${BASE}/tools/readqr`, { params: { apikey: GIFTED_KEY, url }, timeout: 15000 });
  return r.data?.result || '❌ QR illisible';
}

async function apiQRCreate(query) {
  const r = await axios.get(`${BASE}/tools/createqr`, { params: { apikey: GIFTED_KEY, query }, timeout: 15000 });
  return r.data?.result || null;
}

async function apiPDF(query) {
  const r = await axios.get(`${BASE}/tools/topdf`, { params: { apikey: GIFTED_KEY, query }, timeout: 30000 });
  return r.data?.result || null;
}

async function apiCanvas(title, type = 'spotify', text = '', watermark = 'SEIGNEUR TD') {
  const r = await axios.get(`${BASE}/tools/canvas`, { params: { apikey: GIFTED_KEY, title, type, text, watermark }, timeout: 15000 });
  return r.data?.result || null;
}

async function apiDictionnaire(word) {
  const r = await axios.get(`${BASE}/search/dictionary`, { params: { apikey: GIFTED_KEY, word }, timeout: 15000 });
  return r.data?.result || r.data;
}

async function apiGoogle(query) {
  const r = await axios.get(`${BASE}/search/google`, { params: { apikey: GIFTED_KEY, query }, timeout: 15000 });
  return r.data?.result || [];
}

async function apiVermouil(text) {
  const r = await axios.get(`${BASE}/ephoto360/writetext`, { params: { apikey: GIFTED_KEY, text }, timeout: 30000 });
  return r.data?.result || null;
}

async function apiYtAudio(url) {
  const r = await axios.get(`${BASE}/download/ytaudio`, { params: { apikey: GIFTED_KEY, url }, timeout: 60000 });
  return r.data?.result || r.data;
}

// ─── ANTI-CALL ───────────────────────────────────────────────────────────────

export let antiCallEnabled = true;

export async function handleIncomingCall(sock, call) {
  try {
    if (!antiCallEnabled) return;
    await sock.rejectCall(call.id, call.from);
    await sock.sendMessage(call.from, {
      text: `╔═══『 ᴀɴᴛɪ-ᴄᴀʟʟ 』═══╗\n║ 📵 ᴀᴘᴘᴇʟ ʀᴇғᴜsé\n║ ⚡ Mode : ᴀᴄᴛɪᴠé ✅\n╚══════════════════╝\n\n_© SEIGNEUR TD 🇷🇴_`
    });
  } catch (e) { console.error('[ANTI-CALL]', e.message); }
}

// ─── ANTI-MEDIA ──────────────────────────────────────────────────────────────

export async function handleAntiMedia({ sock, message, remoteJid, senderJid, isGroup, isGroupAdmin, isBotGroupAdmin, initGroupSettings, saveStoreKey, addWarn, resetWarns }) {
  if (!isGroup) return false;
  const settings = initGroupSettings(remoteJid);
  const userIsAdmin = await isGroupAdmin(sock, remoteJid, senderJid);
  const botIsAdmin = await isBotGroupAdmin(sock, remoteJid);
  if (userIsAdmin || !botIsAdmin) return false;
  const mc = message.message;

  const doWarn = async (type, label) => {
    try {
      await sock.sendMessage(remoteJid, { delete: message.key });
      const w = addWarn(remoteJid, senderJid, label);
      await sock.sendMessage(remoteJid, { text: `⚠️ @${senderJid.split('@')[0]} — ${label} interdit(e)! Avert. ${w}/3`, mentions: [senderJid] });
      if (w >= 3) { await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove'); resetWarns(remoteJid, senderJid); }
      return true;
    } catch (e) { console.error(`[ANTI-${type}]`, e.message); return false; }
  };

  if (settings.antisticker && mc?.stickerMessage) return await doWarn('STICKER', 'Sticker');
  if (settings.antiimage && mc?.imageMessage) return await doWarn('IMAGE', 'Image');
  if (settings.antivideo && mc?.videoMessage) return await doWarn('VIDEO', 'Vidéo');
  if (settings.antivoice && mc?.audioMessage?.ptt === true) return await doWarn('VOICE', 'Vocal');
  return false;
}

// ─── MENU DES NOUVELLES COMMANDES ────────────────────────────────────────────

export function getNewCommandsMenu(prefix) {
  const p = prefix;
  return `╔═══『 🤖 ɪɴᴛᴇʟʟɪɢᴇɴᴄᴇ ᴀʀᴛɪғɪᴄɪᴇʟʟᴇ 』═══╗
║ ${p}gpt [question] — GPT-4o
║ ${p}gemini [question] — Google Gemini  
║ ${p}sora [description] — Génération image
╠═══『 🖼️ ᴏᴜᴛɪʟs ɪᴍᴀɢᴇ 』═══╣
║ ${p}hd — Améliorer qualité image
║ ${p}remini — Améliorer photo
║ ${p}magic — Magic Eraser
║ ${p}delwm — Supprimer watermark
║ ${p}vermouil [texte] — Texte stylisé
╠═══『 🔲 QR ᴄᴏᴅᴇ 』═══╣
║ ${p}qr [texte] — Créer QR code
║ ${p}lireqr — Lire QR code (répondre image)
╠═══『 🎵 ᴍᴜsɪǫᴜᴇ & ᴏᴜᴛɪʟs 』═══╣
║ ${p}ytmp3 [lien] — YouTube → MP3
║ ${p}vocalremov — Supprimer voix audio
║ ${p}spotify [titre] — Carte Spotify
║ ${p}pdf [texte] — Convertir en PDF
╠═══『 🔍 ʀᴇᴄʜᴇʀᴄʜᴇ 』═══╣
║ ${p}google [recherche] — Google Search
║ ${p}dict [mot] — Dictionnaire
╠═══『 🛡️ ᴀɴᴛɪ-sᴘᴀᴍ 』═══╣
║ ${p}anticall on/off — Anti appels
║ ${p}antisticker on/off — Anti stickers
║ ${p}antiimage on/off — Anti images
║ ${p}antivideo on/off — Anti vidéos
║ ${p}antivoice on/off — Anti vocaux
╚══════════════════════════════════╝
_© SEIGNEUR TD 🇷🇴_`;
}

// ─── HANDLER PRINCIPAL ───────────────────────────────────────────────────────

export async function handleNewCommands({ sock, message, remoteJid, senderJid, command, args, isGroup, isAdminOrOwner, isGroupAdmin, isBotGroupAdmin, initGroupSettings, saveStoreKey, addWarn, resetWarns, config, quoted }) {

  const send = (text) => sock.sendMessage(remoteJid, { text }, { quoted: message });

  switch (command) {

    // ── GPT-4o ────────────────────────────────
    case 'gpt': case 'chatgpt': case 'ai': {
      const q = args.join(' ') || quoted?.body;
      if (!q) { await send(`❓ Usage: ${config.prefix}gpt [question]`); break; }
      await send('🤖 GPT-4o réfléchit...');
      try {
        const rep = await apiGPT(q);
        await send(`╔═══『 ɢᴘᴛ-4ᴏ 』═══╗\n\n${rep}\n\n╚══════════════════╝\n_© SEIGNEUR TD 🇷🇴_`);
      } catch (e) { await send(`❌ Erreur GPT: ${e.message}`); }
      break;
    }

    // ── GEMINI ────────────────────────────────
    case 'gemini': {
      const q = args.join(' ') || quoted?.body;
      if (!q) { await send(`❓ Usage: ${config.prefix}gemini [question]`); break; }
      await send('🔮 Gemini réfléchit...');
      try {
        const rep = await apiGemini(q);
        await send(`╔═══『 ɢᴇᴍɪɴɪ 』═══╗\n\n${rep}\n\n╚══════════════════╝\n_© SEIGNEUR TD 🇷🇴_`);
      } catch (e) { await send(`❌ Erreur Gemini: ${e.message}`); }
      break;
    }

    // ── SORA (Génération image) ───────────────
    case 'sora': case 'imagine': case 'genimage': {
      const prompt = args.join(' ');
      if (!prompt) { await send(`❓ Usage: ${config.prefix}sora [description]`); break; }
      await send('🎨 Génération image en cours...');
      try {
        const url = await apiSora(prompt);
        if (!url) throw new Error('Aucune image générée');
        await sock.sendMessage(remoteJid, { image: { url }, caption: `🎨 *Image générée*\n📝 ${prompt}\n\n_© SEIGNEUR TD 🇷🇴_` }, { quoted: message });
      } catch (e) { await send(`❌ Erreur: ${e.message}`); }
      break;
    }

    // ── HD (Améliorer image) ──────────────────
    case 'hd': case 'enhanceimage': {
      const imgMsg = message.message?.imageMessage || message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
      const imgUrl = imgMsg?.url;
      if (!imgUrl) { await send(`❓ Réponds à une image avec ${config.prefix}hd`); break; }
      await send('📈 Amélioration HD...');
      try {
        const result = await apiHD(imgUrl);
        if (!result) throw new Error('Échec amélioration');
        await sock.sendMessage(remoteJid, { image: { url: result }, caption: `📈 *Image HD améliorée*\n_© SEIGNEUR TD 🇷🇴_` }, { quoted: message });
      } catch (e) { await send(`❌ Erreur: ${e.message}`); }
      break;
    }

    // ── REMINI ────────────────────────────────
    case 'remini': {
      const imgMsg2 = message.message?.imageMessage || message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
      const imgUrl2 = imgMsg2?.url;
      if (!imgUrl2) { await send(`❓ Réponds à une image avec ${config.prefix}remini`); break; }
      await send('✨ Amélioration Remini...');
      try {
        const result = await apiRemini(imgUrl2);
        if (!result) throw new Error('Échec Remini');
        await sock.sendMessage(remoteJid, { image: { url: result }, caption: `✨ *Photo améliorée (Remini)*\n_© SEIGNEUR TD 🇷🇴_` }, { quoted: message });
      } catch (e) { await send(`❌ Erreur: ${e.message}`); }
      break;
    }

    // ── MAGIC ERASER ──────────────────────────
    case 'magic': case 'magiceraser': {
      const imgM = message.message?.imageMessage || message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
      if (!imgM?.url) { await send(`❓ Réponds à une image avec ${config.prefix}magic`); break; }
      await send('🪄 Suppression magique...');
      try {
        const result = await apiMagicEraser(imgM.url);
        if (!result) throw new Error('Échec');
        await sock.sendMessage(remoteJid, { image: { url: result }, caption: `🪄 *Magic Eraser*\n_© SEIGNEUR TD 🇷🇴_` }, { quoted: message });
      } catch (e) { await send(`❌ Erreur: ${e.message}`); }
      break;
    }

    // ── WATERMARK REMOVER ─────────────────────
    case 'delwm': case 'removewm': case 'delfrig': {
      const imgW = message.message?.imageMessage || message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
      if (!imgW?.url) { await send(`❓ Réponds à une image avec ${config.prefix}delwm`); break; }
      await send('💧 Suppression watermark...');
      try {
        const result = await apiWatermarkRemover(imgW.url);
        if (!result) throw new Error('Échec');
        await sock.sendMessage(remoteJid, { image: { url: result }, caption: `💧 *Watermark supprimé*\n_© SEIGNEUR TD 🇷🇴_` }, { quoted: message });
      } catch (e) { await send(`❌ Erreur: ${e.message}`); }
      break;
    }

    // ── VOCAL REMOVER ─────────────────────────
    case 'vocalremov': case 'removevocal': {
      const audioMsg = message.message?.audioMessage || message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage;
      if (!audioMsg?.url) { await send(`❓ Réponds à un audio avec ${config.prefix}vocalremov`); break; }
      await send('🎵 Suppression vocale...');
      try {
        const result = await apiVocalRemover(audioMsg.url);
        if (!result) throw new Error('Échec');
        await sock.sendMessage(remoteJid, { audio: { url: result }, mimetype: 'audio/mp4' }, { quoted: message });
        await send(`🎵 *Vocal supprimé avec succès*\n_© SEIGNEUR TD 🇷🇴_`);
      } catch (e) { await send(`❌ Erreur: ${e.message}`); }
      break;
    }

    // ── LIRE QR CODE ──────────────────────────
    case 'lireqr': case 'readqr': {
      const imgQR = message.message?.imageMessage || message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
      if (!imgQR?.url) { await send(`❓ Réponds à une image QR avec ${config.prefix}lireqr`); break; }
      await send('📷 Lecture QR...');
      try {
        const result = await apiQRRead(imgQR.url);
        await send(`📷 *QR Code lu :*\n\n${result}\n\n_© SEIGNEUR TD 🇷🇴_`);
      } catch (e) { await send(`❌ Erreur: ${e.message}`); }
      break;
    }

    // ── CRÉER QR CODE ─────────────────────────
    case 'getqr': case 'createqr': case 'qr': {
      const qrText = args.join(' ');
      if (!qrText) { await send(`❓ Usage: ${config.prefix}qr [texte/lien]`); break; }
      await send('🔲 Génération QR...');
      try {
        const result = await apiQRCreate(qrText);
        if (!result) throw new Error('Échec');
        await sock.sendMessage(remoteJid, { image: { url: result }, caption: `🔲 *QR Code généré*\n📝 ${qrText}\n\n_© SEIGNEUR TD 🇷🇴_` }, { quoted: message });
      } catch (e) { await send(`❌ Erreur: ${e.message}`); }
      break;
    }

    // ── PDF ───────────────────────────────────
    case 'pdf': case 'topdf': {
      const pdfText = args.join(' ') || quoted?.body;
      if (!pdfText) { await send(`❓ Usage: ${config.prefix}pdf [texte]`); break; }
      await send('📄 Conversion PDF...');
      try {
        const result = await apiPDF(pdfText);
        if (!result) throw new Error('Échec');
        await sock.sendMessage(remoteJid, { document: { url: result }, mimetype: 'application/pdf', fileName: 'document.pdf', caption: `📄 *PDF généré*\n_© SEIGNEUR TD 🇷🇴_` }, { quoted: message });
      } catch (e) { await send(`❌ Erreur: ${e.message}`); }
      break;
    }

    // ── SPOTIFY CARD ──────────────────────────
    case 'spotify': case 'cartecanva': case 'canvas': {
      const title = args.join(' ');
      if (!title) { await send(`❓ Usage: ${config.prefix}spotify [titre chanson]`); break; }
      await send('🎵 Création carte Spotify...');
      try {
        const result = await apiCanvas(title, 'spotify', 'Top Hit 2024', 'SEIGNEUR TD');
        if (!result) throw new Error('Échec');
        await sock.sendMessage(remoteJid, { image: { url: result }, caption: `🎵 *Carte Spotify*\n🎶 ${title}\n\n_© SEIGNEUR TD 🇷🇴_` }, { quoted: message });
      } catch (e) { await send(`❌ Erreur: ${e.message}`); }
      break;
    }

    // ── DICTIONNAIRE ──────────────────────────
    case 'dict': case 'define': case 'dico': {
      const word = args[0];
      if (!word) { await send(`❓ Usage: ${config.prefix}dict [mot]`); break; }
      await send('📖 Recherche dictionnaire...');
      try {
        const result = await apiDictionnaire(word);
        const def = result?.definition || result?.result || result?.meaning || JSON.stringify(result).slice(0, 500);
        await send(`📖 *Dictionnaire : ${word}*\n\n${def}\n\n_© SEIGNEUR TD 🇷🇴_`);
      } catch (e) { await send(`❌ Erreur: ${e.message}`); }
      break;
    }

    // ── GOOGLE SEARCH ─────────────────────────
    case 'google': case 'search': {
      const query = args.join(' ');
      if (!query) { await send(`❓ Usage: ${config.prefix}google [recherche]`); break; }
      await send('🔍 Recherche Google...');
      try {
        const results = await apiGoogle(query);
        const list = Array.isArray(results)
          ? results.slice(0, 5).map((r, i) => `*${i + 1}.* ${r.title || r}\n${r.link || r.url || ''}`).join('\n\n')
          : String(results).slice(0, 1000);
        await send(`🔍 *Google : "${query}"*\n\n${list}\n\n_© SEIGNEUR TD 🇷🇴_`);
      } catch (e) { await send(`❌ Erreur: ${e.message}`); }
      break;
    }

    // ── VERMOUIL (Texte stylisé) ───────────────
    case 'vermouil': case 'writetext': {
      const txt = args.join(' ');
      if (!txt) { await send(`❓ Usage: ${config.prefix}vermouil [texte]`); break; }
      await send('✏️ Création image texte...');
      try {
        const result = await apiVermouil(txt);
        if (!result) throw new Error('Échec');
        await sock.sendMessage(remoteJid, { image: { url: result }, caption: `✏️ *Texte stylisé*\n📝 ${txt}\n\n_© SEIGNEUR TD 🇷🇴_` }, { quoted: message });
      } catch (e) { await send(`❌ Erreur: ${e.message}`); }
      break;
    }

    // ── YOUTUBE MP3 ───────────────────────────
    case 'ytmp3': case 'ytaudio': case 'song2': {
      const ytUrl = args[0];
      if (!ytUrl || !ytUrl.includes('youtu')) { await send(`❓ Usage: ${config.prefix}ytmp3 [lien YouTube]`); break; }
      await send('🎵 Téléchargement audio YouTube...');
      try {
        const result = await apiYtAudio(ytUrl);
        const audioUrl = result?.download_url || result?.url || result?.audio || result;
        const titleYt = result?.title || 'Audio YouTube';
        if (!audioUrl || typeof audioUrl !== 'string') throw new Error('Pas de lien audio');
        await sock.sendMessage(remoteJid, { audio: { url: audioUrl }, mimetype: 'audio/mp4', fileName: `${titleYt}.mp4` }, { quoted: message });
        await send(`🎵 *${titleYt}*\n_© SEIGNEUR TD 🇷🇴_`);
      } catch (e) { await send(`❌ Erreur: ${e.message}`); }
      break;
    }

    // ── ANTI-CALL ─────────────────────────────
    case 'anticall': case 'antiappel': {
      if (!isAdminOrOwner()) { await send('⛔ Admins seulement'); break; }
      const sub = args[0]?.toLowerCase();
      if (sub === 'on') {
        antiCallEnabled = true;
        await send(`╔═══『 ᴀɴᴛɪ-ᴄᴀʟʟ 』═══╗\n║ ⚡ Status : ᴀᴄᴛɪᴠé ✅\n╚══════════════════╝\n\n📵 Appels refusés automatiquement.`);
      } else if (sub === 'off') {
        antiCallEnabled = false;
        await send(`╔═══『 ᴀɴᴛɪ-ᴄᴀʟʟ 』═══╗\n║ 🔓 Status : ᴅésᴀᴄᴛɪᴠé ❌\n╚══════════════════╝`);
      } else {
        await send(`╔═══『 ᴀɴᴛɪ-ᴄᴀʟʟ 』═══╗\n║ 📊 Status : ${antiCallEnabled ? 'ᴀᴄᴛɪᴠé ✅' : 'ᴅésᴀᴄᴛɪᴠé ❌'}\n╚══════════════════╝\n\n• ${config.prefix}anticall on\n• ${config.prefix}anticall off`);
      }
      break;
    }

    // ── ANTI-STICKER ──────────────────────────
    case 'antisticker': case 'antistick': {
      if (!isGroup) { await send('❌ Groupe uniquement'); break; }
      const isUA = await isGroupAdmin(sock, remoteJid, senderJid);
      if (!isUA && !isAdminOrOwner()) { await send('⛔ Admins du groupe uniquement'); break; }
      const settings = initGroupSettings(remoteJid);
      const sub2 = args[0]?.toLowerCase();
      if (sub2 === 'on') { settings.antisticker = true; saveStoreKey('groupSettings'); await send(`╔═══『 ᴀɴᴛɪ-sᴛɪᴄᴋᴇʀ 』═══╗\n║ ⚡ ᴀᴄᴛɪᴠé ✅\n╚══════════════════╝`); }
      else if (sub2 === 'off') { settings.antisticker = false; saveStoreKey('groupSettings'); await send(`╔═══『 ᴀɴᴛɪ-sᴛɪᴄᴋᴇʀ 』═══╗\n║ 🔓 ᴅésᴀᴄᴛɪᴠé ❌\n╚══════════════════╝`); }
      else { await send(`╔═══『 ᴀɴᴛɪ-sᴛɪᴄᴋᴇʀ 』═══╗\n║ ${settings.antisticker ? 'ᴀᴄᴛɪᴠé ✅' : 'ᴅésᴀᴄᴛɪᴠé ❌'}\n╚══════════════════╝\n\n• ${config.prefix}antisticker on/off`); }
      break;
    }

    // ── ANTI-IMAGE ────────────────────────────
    case 'antiimage': case 'antiphoto': {
      if (!isGroup) { await send('❌ Groupe uniquement'); break; }
      const isUA2 = await isGroupAdmin(sock, remoteJid, senderJid);
      if (!isUA2 && !isAdminOrOwner()) { await send('⛔ Admins du groupe uniquement'); break; }
      const settings2 = initGroupSettings(remoteJid);
      const sub3 = args[0]?.toLowerCase();
      if (sub3 === 'on') { settings2.antiimage = true; saveStoreKey('groupSettings'); await send(`╔═══『 ᴀɴᴛɪ-ɪᴍᴀɢᴇ 』═══╗\n║ ⚡ ᴀᴄᴛɪᴠé ✅\n╚══════════════════╝`); }
      else if (sub3 === 'off') { settings2.antiimage = false; saveStoreKey('groupSettings'); await send(`╔═══『 ᴀɴᴛɪ-ɪᴍᴀɢᴇ 』═══╗\n║ 🔓 ᴅésᴀᴄᴛɪᴠé ❌\n╚══════════════════╝`); }
      else { await send(`╔═══『 ᴀɴᴛɪ-ɪᴍᴀɢᴇ 』═══╗\n║ ${settings2.antiimage ? 'ᴀᴄᴛɪᴠé ✅' : 'ᴅésᴀᴄᴛɪᴠé ❌'}\n╚══════════════════╝\n\n• ${config.prefix}antiimage on/off`); }
      break;
    }

    // ── ANTI-VIDEO ────────────────────────────
    case 'antivideo': case 'antivid': {
      if (!isGroup) { await send('❌ Groupe uniquement'); break; }
      const isUA3 = await isGroupAdmin(sock, remoteJid, senderJid);
      if (!isUA3 && !isAdminOrOwner()) { await send('⛔ Admins du groupe uniquement'); break; }
      const settings3 = initGroupSettings(remoteJid);
      const sub4 = args[0]?.toLowerCase();
      if (sub4 === 'on') { settings3.antivideo = true; saveStoreKey('groupSettings'); await send(`╔═══『 ᴀɴᴛɪ-ᴠɪᴅéᴏ 』═══╗\n║ ⚡ ᴀᴄᴛɪᴠé ✅\n╚══════════════════╝`); }
      else if (sub4 === 'off') { settings3.antivideo = false; saveStoreKey('groupSettings'); await send(`╔═══『 ᴀɴᴛɪ-ᴠɪᴅéᴏ 』═══╗\n║ 🔓 ᴅésᴀᴄᴛɪᴠé ❌\n╚══════════════════╝`); }
      else { await send(`╔═══『 ᴀɴᴛɪ-ᴠɪᴅéᴏ 』═══╗\n║ ${settings3.antivideo ? 'ᴀᴄᴛɪᴠé ✅' : 'ᴅésᴀᴄᴛɪᴠé ❌'}\n╚══════════════════╝\n\n• ${config.prefix}antivideo on/off`); }
      break;
    }

    // ── ANTI-VOICE ────────────────────────────
    case 'antivoice': case 'antivocal': case 'antiaudio': {
      if (!isGroup) { await send('❌ Groupe uniquement'); break; }
      const isUA4 = await isGroupAdmin(sock, remoteJid, senderJid);
      if (!isUA4 && !isAdminOrOwner()) { await send('⛔ Admins du groupe uniquement'); break; }
      const settings4 = initGroupSettings(remoteJid);
      const sub5 = args[0]?.toLowerCase();
      if (sub5 === 'on') { settings4.antivoice = true; saveStoreKey('groupSettings'); await send(`╔═══『 ᴀɴᴛɪ-ᴠᴏɪᴄᴇ 』═══╗\n║ ⚡ ᴀᴄᴛɪᴠé ✅\n╚══════════════════╝`); }
      else if (sub5 === 'off') { settings4.antivoice = false; saveStoreKey('groupSettings'); await send(`╔═══『 ᴀɴᴛɪ-ᴠᴏɪᴄᴇ 』═══╗\n║ 🔓 ᴅésᴀᴄᴛɪᴠé ❌\n╚══════════════════╝`); }
      else { await send(`╔═══『 ᴀɴᴛɪ-ᴠᴏɪᴄᴇ 』═══╗\n║ ${settings4.antivoice ? 'ᴀᴄᴛɪᴠé ✅' : 'ᴅésᴀᴄᴛɪᴠé ❌'}\n╚══════════════════╝\n\n• ${config.prefix}antivoice on/off`); }
      break;
    }

    default:
      return false;
  }
  return true;
}
