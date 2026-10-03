// .vcf — exporte les membres du groupe en fichier de contacts .vcf
module.exports = {
  name: 'vcf',
  description: 'Exporte les membres du groupe dans un fichier de contacts .vcf.',
  execute: async (sock, msg) => {
    const jid = msg.key.remoteJid;
    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '❌ Cette commande ne fonctionne que dans un groupe.' }, { quoted: msg });
      return;
    }
    try {
      const metadata = await sock.groupMetadata(jid);
      const cards = metadata.participants.map((p, i) => {
        const number = (p.phoneNumber || p.id).split('@')[0];
        return `BEGIN:VCARD\nVERSION:3.0\nFN:Contact ${i + 1}\nTEL;TYPE=CELL:+${number}\nEND:VCARD`;
      });
      const vcf = cards.join('\n');
      await sock.sendMessage(
        jid,
        {
          document: Buffer.from(vcf, 'utf8'),
          mimetype: 'text/vcard',
          fileName: `${metadata.subject.replace(/[^\w\s-]/g, '')}.vcf`,
          caption: `📇 ${metadata.participants.length} contacts exportés.`,
        },
        { quoted: msg }
      );
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Erreur : ${error.message}` }, { quoted: msg });
    }
  },
};
