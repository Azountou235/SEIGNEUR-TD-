// .calc — calculatrice simple (+ - * / % et parenthèses uniquement)
module.exports = {
  name: 'calc',
  description: 'Calcule une expression mathématique simple. Usage : .calc 2 + 2 * (3 - 1)',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const expr = args.join(' ');
    if (!expr) {
      await sock.sendMessage(jid, { text: '🧮 Usage : .calc 2 + 2 * (3 - 1)' }, { quoted: msg });
      return;
    }
    // Sécurité : seuls les chiffres et opérateurs de base sont autorisés,
    // donc Function() ne peut exécuter que de l'arithmétique.
    if (!/^[0-9+\-*/().%\s]+$/.test(expr)) {
      await sock.sendMessage(jid, { text: '❌ Seuls les chiffres et + - * / ( ) % sont autorisés.' }, { quoted: msg });
      return;
    }
    try {
      const result = Function(`"use strict"; return (${expr});`)();
      if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('invalid');
      await sock.sendMessage(jid, { text: `🧮 ${expr} = ${result}` }, { quoted: msg });
    } catch {
      await sock.sendMessage(jid, { text: "❌ Cette expression n'est pas valide." }, { quoted: msg });
    }
  },
};
