const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'topdf',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      await sock.sendMessage(chatJid, { text: '🚫 Seul le owner peut utiliser cette commande.' }, { quoted: msg });
      return;
    }
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const directText = args.join(' ').trim();
    const quotedImage = quoted?.imageMessage;
    const ownImage = msg.message?.imageMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;

    try {
      if (ownImage || quotedImage) {
        await sock.sendMessage(chatJid, { text: '⏳ Conversion de l’image en PDF...' }, { quoted: msg });
        const image = ownImage || quotedImage;
        const wrapped = ownImage ? msg : { message: { imageMessage: quotedImage } };
        const buffer = await downloadMediaMessage(wrapped, 'buffer', {});

        const pdfDoc = await PDFDocument.create();
        const isPng = (image.mimetype || '').includes('png');
        const embedded = isPng ? await pdfDoc.embedPng(buffer) : await pdfDoc.embedJpg(buffer);
        const page = pdfDoc.addPage([embedded.width, embedded.height]);
        page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
        const pdfBytes = await pdfDoc.save();

        await sock.sendMessage(chatJid, { document: Buffer.from(pdfBytes), mimetype: 'application/pdf', fileName: `image-${Date.now()}.pdf` }, { quoted: msg });
        return;
      }

      const textContent = directText || quotedText;
      if (textContent) {
        await sock.sendMessage(chatJid, { text: '⏳ Conversion du texte en PDF...' }, { quoted: msg });

        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = 12;
        const margin = 50;
        const pageWidth = 595.28;
        const pageHeight = 841.89;
        const maxWidth = pageWidth - margin * 2;

        const words = textContent.split(/\s+/);
        const lines = [];
        let currentLine = '';
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          if (font.widthOfTextAtSize(testLine, fontSize) > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) lines.push(currentLine);

        let page = pdfDoc.addPage([pageWidth, pageHeight]);
        let y = pageHeight - margin;
        const lineHeight = fontSize * 1.4;

        for (const line of lines) {
          if (y < margin) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
          }
          page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
          y -= lineHeight;
        }

        const pdfBytes = await pdfDoc.save();
        await sock.sendMessage(chatJid, { document: Buffer.from(pdfBytes), mimetype: 'application/pdf', fileName: `texte-${Date.now()}.pdf` }, { quoted: msg });
        return;
      }

      await sock.sendMessage(chatJid, {
        text: 'Usage :\n• Répondez à un *texte* avec .topdf\n• Répondez à une *image* avec .topdf\n• .topdf <texte>',
      }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: `❌ Échec de la conversion : ${e.message}` }, { quoted: msg });
    }
  },
};
