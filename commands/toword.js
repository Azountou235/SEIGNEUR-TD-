// .toword — convertit une image citée ou du texte en document Word (.docx)
const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType } = require('docx');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'toword',
  aliases: ['word', 'makedoc', 'todocx', 'img2word', 'text2word'],
  description: 'Convertit une image citée ou du texte en document Word. Usage : .toword <texte>, ou réponds à une image.',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
    const text = args.join(' ').trim() || quotedText;
    const image = quoted?.imageMessage || null;

    if (!image && !text) {
      await sock.sendMessage(jid, { text: "📝 *Usage :*\n• Réponds à une image : *.toword*\n• Convertir du texte : *.toword Ton texte ici*" }, { quoted: msg });
      return;
    }
    try {
      await sock.sendMessage(jid, { text: '⏳ Création du document Word...' }, { quoted: msg });
      let children = [];
      if (image) {
        const buffer = await downloadMediaMessage(
          { message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } },
          'buffer',
          {}
        );
        const type = (image.mimetype || '').includes('png') ? 'png' : 'jpg';
        children.push(new Paragraph({
          children: [new ImageRun({ data: buffer, transformation: { width: 500, height: 350 }, type })],
          alignment: AlignmentType.CENTER,
        }));
      } else {
        for (const line of text.split('\n')) {
          children.push(
            line.trim()
              ? new Paragraph({ children: [new TextRun({ text: line.trim(), size: 24, font: 'Calibri' })], spacing: { after: 120 } })
              : new Paragraph({})
          );
        }
      }
      const doc = new Document({ sections: [{ properties: {}, children }] });
      const buffer = await Packer.toBuffer(doc);
      await sock.sendMessage(
        jid,
        {
          document: buffer,
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileName: `document_${Date.now()}.docx`,
          caption: '✅ *Document Word créé avec succès !*',
        },
        { quoted: msg }
      );
    } catch (error) {
      console.error('[TOWORD ERROR]', error.message);
      await sock.sendMessage(jid, { text: '❌ Échec de la création du document. Réessaie.' }, { quoted: msg });
    }
  },
};
