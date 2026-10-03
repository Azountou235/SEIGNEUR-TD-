// .toexcel — convertit du texte séparé par des virgules en fichier Excel
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');

module.exports = {
  name: 'toexcel',
  aliases: ['excel', 'makeexcel', 'toxlsx', 'text2excel'],
  description: 'Convertit du texte en tableau Excel. Usage : .toexcel Nom,Age,Ville\\nJean,25,Paris',
  execute: async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
    const input = args.join(' ').trim() || quotedText;
    if (!input?.trim()) {
      await sock.sendMessage(
        jid,
        { text: '📊 *Usage :*\n*.toexcel Nom,Age,Ville\\nJean,25,Paris\\nMarie,30,Lyon*\n\n_Colonnes = virgules, Lignes = retours à la ligne_\n_Ou réponds à un message texte au format CSV_' },
        { quoted: msg }
      );
      return;
    }
    const outFile = path.join(os.tmpdir(), `excel_${Date.now()}.xlsx`);
    try {
      await sock.sendMessage(jid, { text: '⏳ Création du fichier Excel...' }, { quoted: msg });
      const lines = input.trim().split(/\n|\\n/).filter((l) => l.trim());
      const rows = lines.map((line) => line.split(',').map((cell) => {
        const trimmed = cell.trim();
        const num = Number(trimmed);
        return !isNaN(num) && trimmed !== '' ? num : trimmed;
      }));
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      const book = XLSX.utils.book_new();
      const widths = rows.reduce((acc, row) => {
        row.forEach((cell, i) => { acc[i] = Math.max(acc[i] || 10, String(cell).length + 4); });
        return acc;
      }, []);
      sheet['!cols'] = widths.map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(book, sheet, 'Feuille1');
      XLSX.writeFile(book, outFile);
      await sock.sendMessage(
        jid,
        {
          document: fs.readFileSync(outFile),
          mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileName: `tableau_${Date.now()}.xlsx`,
          caption: `✅ *Excel créé !*\n📊 ${rows.length} lignes × ${rows[0]?.length || 0} colonnes`,
        },
        { quoted: msg }
      );
    } catch (error) {
      console.error('[TOEXCEL ERROR]', error.message);
      await sock.sendMessage(jid, { text: '❌ Échec de la création. Vérifie que les données sont séparées par des virgules.' }, { quoted: msg });
    } finally {
      if (fs.existsSync(outFile)) { try { fs.unlinkSync(outFile); } catch {} }
    }
  },
};
