// telegram-forwarder.js
// Transfère TOUS les messages WhatsApp vers Telegram avec le numéro d'origine

import axios from 'axios';
import { telegramConfig } from './config.js';

const TELEGRAM_API = `https://api.telegram.org/bot${telegramConfig.botToken}`;
const TELEGRAM_CHAT_ID = telegramConfig.chatId;

// Extraire le numéro WhatsApp (enlever le @s.whatsapp.net et les tirets)
function extractPhoneNumber(jid) {
  return jid.split('@')[0].replace(/[^\d]/g, '').replace(/^(\d{3})(\d{2})(\d{6})$/, '+$1 $2$3');
}

// ═══════════════════════════════════════════════════════════════
// ENVOYER VERS TELEGRAM
// ═══════════════════════════════════════════════════════════════

// Message texte simple
async function sendTextToTelegram(phoneNumber, text) {
  try {
    const message = `<b>numéro</b> ${phoneNumber}\n<b>messages :</b> ${text}`;
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    });
    console.log(`[Telegram] ✅ Message texte de ${phoneNumber} transféré`);
  } catch (error) {
    console.error('[Telegram] ❌ Erreur envoi texte:', error.message);
  }
}

// Photo avec légende
async function sendPhotoToTelegram(phoneNumber, photoBuffer, caption = '') {
  try {
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('photo', new Blob([photoBuffer]), 'photo.jpg');
    
    const text = caption 
      ? `<b>numéro</b> ${phoneNumber}\n<b>image :</b> ${caption}`
      : `<b>numéro</b> ${phoneNumber}\n<b>image :</b>`;
    formData.append('caption', text);
    formData.append('parse_mode', 'HTML');

    await axios.post(`${TELEGRAM_API}/sendPhoto`, formData);
    console.log(`[Telegram] ✅ Photo de ${phoneNumber} transférée`);
  } catch (error) {
    console.error('[Telegram] ❌ Erreur envoi photo:', error.message);
  }
}

// Vidéo avec légende
async function sendVideoToTelegram(phoneNumber, videoBuffer, caption = '') {
  try {
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('video', new Blob([videoBuffer]), 'video.mp4');
    
    const text = caption 
      ? `<b>numéro</b> ${phoneNumber}\n<b>vidéo :</b> ${caption}`
      : `<b>numéro</b> ${phoneNumber}\n<b>vidéo :</b>`;
    formData.append('caption', text);
    formData.append('parse_mode', 'HTML');

    await axios.post(`${TELEGRAM_API}/sendVideo`, formData);
    console.log(`[Telegram] ✅ Vidéo de ${phoneNumber} transférée`);
  } catch (error) {
    console.error('[Telegram] ❌ Erreur envoi vidéo:', error.message);
  }
}

// Audio/Voix
async function sendAudioToTelegram(phoneNumber, audioBuffer) {
  try {
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('audio', new Blob([audioBuffer]), 'audio.ogg');
    
    const text = `<b>numéro</b> ${phoneNumber}\n<b>audio :</b>`;
    formData.append('caption', text);
    formData.append('parse_mode', 'HTML');

    await axios.post(`${TELEGRAM_API}/sendAudio`, formData);
    console.log(`[Telegram] ✅ Audio de ${phoneNumber} transféré`);
  } catch (error) {
    console.error('[Telegram] ❌ Erreur envoi audio:', error.message);
  }
}

// Document
async function sendDocumentToTelegram(phoneNumber, documentBuffer, fileName = 'document') {
  try {
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('document', new Blob([documentBuffer]), fileName);
    
    const text = `<b>numéro</b> ${phoneNumber}\n<b>document :</b> ${fileName}`;
    formData.append('caption', text);
    formData.append('parse_mode', 'HTML');

    await axios.post(`${TELEGRAM_API}/sendDocument`, formData);
    console.log(`[Telegram] ✅ Document de ${phoneNumber} transféré`);
  } catch (error) {
    console.error('[Telegram] ❌ Erreur envoi document:', error.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// TÉLÉCHARGER UN MÉDIA DEPUIS WHATSAPP
// ═══════════════════════════════════════════════════════════════

async function downloadMedia(sock, message) {
  try {
    const mediaBuffer = await sock.downloadMediaMessage(message);
    return mediaBuffer;
  } catch (error) {
    console.error('[Telegram] ❌ Erreur téléchargement média:', error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// FONCTION PRINCIPALE : TRANSFÉRER N'IMPORTE QUEL MESSAGE
// ═══════════════════════════════════════════════════════════════

export async function forwardToTelegram(sock, message) {
  try {
    // Vérifier que le transfert est activé
    if (!telegramConfig.enabled) return;

    const senderJid = message.key.remoteJid;
    const phoneNumber = extractPhoneNumber(senderJid);
    const msgBody = message.message;

    // Ignorer les messages qu'on envoie soi-même
    if (message.key.fromMe) return;

    console.log(`[Telegram] 📤 Traitement message de ${phoneNumber}`);

    // ✅ MESSAGE TEXTE SIMPLE
    if (msgBody?.conversation) {
      await sendTextToTelegram(phoneNumber, msgBody.conversation);
    }

    // ✅ TEXTE AVEC CITATION/ÉDITION
    else if (msgBody?.extendedTextMessage) {
      const text = msgBody.extendedTextMessage.text;
      await sendTextToTelegram(phoneNumber, text);
    }

    // ✅ IMAGE
    else if (msgBody?.imageMessage) {
      const caption = msgBody.imageMessage.caption || '';
      const photoBuffer = await downloadMedia(sock, message);
      if (photoBuffer) {
        await sendPhotoToTelegram(phoneNumber, photoBuffer, caption);
      }
    }

    // ✅ VIDÉO
    else if (msgBody?.videoMessage) {
      const caption = msgBody.videoMessage.caption || '';
      const videoBuffer = await downloadMedia(sock, message);
      if (videoBuffer) {
        await sendVideoToTelegram(phoneNumber, videoBuffer, caption);
      }
    }

    // ✅ AUDIO / VOIX
    else if (msgBody?.audioMessage) {
      const audioBuffer = await downloadMedia(sock, message);
      if (audioBuffer) {
        await sendAudioToTelegram(phoneNumber, audioBuffer);
      }
    }

    // ✅ DOCUMENT
    else if (msgBody?.documentMessage) {
      const fileName = msgBody.documentMessage.fileName || 'document';
      const docBuffer = await downloadMedia(sock, message);
      if (docBuffer) {
        await sendDocumentToTelegram(phoneNumber, docBuffer, fileName);
      }
    }

    // ✅ STICKER
    else if (msgBody?.stickerMessage) {
      const stickerBuffer = await downloadMedia(sock, message);
      if (stickerBuffer) {
        const text = `<b>numéro</b> ${phoneNumber}\n<b>sticker :</b>`;
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHAT_ID);
        formData.append('sticker', new Blob([stickerBuffer]), 'sticker.webp');
        await axios.post(`${TELEGRAM_API}/sendSticker`, formData);
        console.log(`[Telegram] ✅ Sticker de ${phoneNumber} transféré`);
      }
    }

    // Type de message non reconnu (ignoré silencieusement)
    else {
      console.log(`[Telegram] ⏭️ Type de message ignoré de ${phoneNumber}`);
    }

  } catch (error) {
    console.error('[Telegram] ❌ Erreur générale:', error.message);
  }
}
