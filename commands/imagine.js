// .imagine / .dall / .dalle — génération d'image IA (Pollinations, gratuit, aucune clé)
const config = require('../config/config');

module.exports = {
  name: 'imagine',
  aliases: ['createimage', 'dalle', 'dall'],
  description: 'Génère une image IA à partir d\'un texte. Usage : .imagine <description>',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    let prompt = args.join(' ').trim();
    if (!prompt) {
      await sock.sendMessage(
        jid,
        {
          text:
            `Exemple : ${config.prefix}imagine une fille anime magnifique dans une forêt\n\n` +
            'Options :\n  --wide   → paysage (1024×576)\n  --tall   → portrait (576×1024)\n  --turbo  → plus rapide, moins détaillé\n\n' +
            'Taille par défaut : carré (512×512)',
        },
        { quoted: msg }
      );
      return;
    }
    try {
      await sock.sendMessage(jid, { text: '🎨 Génération de ton image, patiente...' }, { quoted: msg });
      let width = 512, height = 512, model = 'flux';
      if (prompt.includes('--wide')) { width = 1024; height = 576; prompt = prompt.replace('--wide', '').trim(); }
      if (prompt.includes('--tall')) { width = 576; height = 1024; prompt = prompt.replace('--tall', '').trim(); }
      if (prompt.includes('--turbo')) { model = 'turbo'; prompt = prompt.replace('--turbo', '').trim(); }
      const seed = Math.floor(Math.random() * 1000000);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true`;
      const caption = `*Modèle :* ${model === 'turbo' ? 'Flux Turbo ⚡' : 'Flux ✨'}\n*Taille :* ${width}×${height}px`;
      await sock.sendMessage(jid, { image: { url }, caption }, { quoted: msg });
    } catch (error) {
      console.error('[IMAGINE ERROR]', error);
      await sock.sendMessage(jid, { text: "❌ Une erreur est survenue lors de la génération. Réessaie plus tard." }, { quoted: msg });
    }
  },
};
