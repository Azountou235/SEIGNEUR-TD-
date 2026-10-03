// .ocr / .scan — extrait le texte d'une image (OCR.space, clé gratuite par défaut)
// Pour un meilleur quota, crée ta propre clé gratuite sur https://ocr.space/ocrapi
// et mets-la dans la variable d'environnement OCR_API_KEY.
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const os = require('os');
const path = require('path');

const OCR_API_KEY = process.env.OCR_API_KEY || 'helloworld';

module.exports = {
  name: 'ocr',
  aliases: ['readtext', 'extract', 'imgtotext', 'scan'],
  description: "Extrait le texte d'une image citée. Réponds à une image avec .ocr (ou .scan)",
  execute: async (sock, msg) => {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    if (!quoted?.imageMessage) {
      await sock.sendMessage(jid, { text: '🖼️ Réponds à une image avec *.ocr* (ou *.scan*) pour en lire le texte.' }, { quoted: msg });
      return;
    }
    let tmpFile;
    try {
      await sock.sendMessage(jid, { text: "🔍 Scan de l'image en cours..." }, { quoted: msg });
      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant }, message: quoted },
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );
      tmpFile = path.join(os.tmpdir(), `ocr_${Date.now()}.jpg`);
      fs.writeFileSync(tmpFile, buffer);

      const form = new FormData();
      form.append('file', fs.createReadStream(tmpFile));
      form.append('language', 'fre');
      form.append('isOverlayRequired', 'false');
      form.append('detectOrientation', 'true');
      form.append('scale', 'true');
      form.append('OCREngine', '2');

      const { data } = await axios.post('https://api.ocr.space/parse/image', form, {
        headers: { ...form.getHeaders(), apikey: OCR_API_KEY },
        timeout: 30000,
      });
      if (data?.IsErroredOnProcessing) {
        await sock.sendMessage(jid, { text: `❌ Erreur OCR : ${data.ErrorMessage?.[0] || 'erreur inconnue'}` }, { quoted: msg });
        return;
      }
      const text = data?.ParsedResults?.[0]?.ParsedText?.trim();
      if (!text) {
        await sock.sendMessage(jid, { text: '🤷 Aucun texte trouvé dans cette image. Essaie une photo plus nette.' }, { quoted: msg });
        return;
      }
      await sock.sendMessage(jid, { text }, { quoted: msg });
    } catch (error) {
      console.error('[OCR ERROR]', error);
      await sock.sendMessage(jid, { text: '❌ Échec de la lecture. Essaie une photo plus nette et bien éclairée.' }, { quoted: msg });
    } finally {
      if (tmpFile && fs.existsSync(tmpFile)) { try { fs.unlinkSync(tmpFile); } catch {} }
    }
  },
};
