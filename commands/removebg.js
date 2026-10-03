// .removebg — supprime le fond d'une image (réponds à une image)
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const os = require('os');
const path = require('path');

module.exports = {
  name: 'removebg',
  aliases: ['rmbg', 'bgremove', 'nobg'],
  description: "Supprime le fond d'une image citée. Réponds à une image avec .removebg",
  execute: async (sock, msg) => {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    if (!quoted?.imageMessage) {
      await sock.sendMessage(jid, { text: '🖼️ Réponds à une image avec *.removebg* pour supprimer son fond.' }, { quoted: msg });
      return;
    }
    let tmpFile;
    try {
      await sock.sendMessage(jid, { text: '🧼 Suppression du fond...' }, { quoted: msg });
      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant }, message: quoted },
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );
      tmpFile = path.join(os.tmpdir(), `removebg_${Date.now()}.jpg`);
      fs.writeFileSync(tmpFile, buffer);

      const form = new FormData();
      form.append('image_file', fs.createReadStream(tmpFile));
      form.append('turnstile_token', '');
      const create = await axios.post('https://api.ezremove.ai/api/ez-remove/background-remove/create-job-v2', form, {
        headers: { 'product-serial': '07cc2e862644a6a1860194a9f6a6f70f', ...form.getHeaders() },
        timeout: 30000,
      });
      const jobId = create.data?.result?.job_id;
      if (!jobId) {
        await sock.sendMessage(jid, { text: '❌ Échec de la création de la tâche.' }, { quoted: msg });
        return;
      }
      let output;
      for (let i = 0; i < 10; i++) {
        const check = await axios.get(`https://api.ezremove.ai/api/ez-remove/background-remove/get-job/${jobId}`, { timeout: 15000 });
        output = check.data?.result?.output?.[0];
        if (output) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!output) {
        await sock.sendMessage(jid, { text: "⚠️ Le traitement n'est pas encore prêt. Réessaie dans un instant." }, { quoted: msg });
        return;
      }
      await sock.sendMessage(jid, { image: { url: output }, caption: '✅ Fond supprimé' }, { quoted: msg });
    } catch (error) {
      console.error('[REMOVEBG ERROR]', error);
      await sock.sendMessage(jid, { text: '❌ Échec de la suppression du fond. Essaie une autre image.' }, { quoted: msg });
    } finally {
      if (tmpFile && fs.existsSync(tmpFile)) { try { fs.unlinkSync(tmpFile); } catch {} }
    }
  },
};
