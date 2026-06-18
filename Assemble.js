// ─── assemble.js ──────────────────────────────────────────────────────────
// Reconstitue index.js à partir de index.part1.js + index.part2.js.
// Lancé automatiquement par "npm start" (voir package.json) avant "node index.js".
//
// Pourquoi : index.js était devenu trop long pour être édité confortablement.
// Le code a été divisé en deux fichiers sources, dans l'ordre logique suivant :
//   - index.part1.js : config, traductions, store/persistance, bot principal
//                       (connectToWhatsApp), et handleCommand (le routeur de
//                       commandes, utilisé à la fois par le bot principal et
//                       par chaque session web).
//   - index.part2.js : tout ce qui dépend de handleCommand — les menus, les
//                       fonctions de chaque commande (jeux, téléchargeurs,
//                       anti-bug...), la gestion des sessions web
//                       (launchSessionBot, reconnectSession, createUserSession),
//                       le serveur HTTP API, et le watchdog.
//
// assemble.js ne fait QUE les coller dans l'ordre pour produire index.js —
// aucune logique n'est exécutée ici, donc rien ne change dans le comportement
// du bot. C'est une étape de build, pas un module à part.
//
// ⚠️ Ne modifie jamais index.js directement : tes changements seraient écrasés
// au prochain démarrage. Modifie toujours index.part1.js ou index.part2.js.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PARTS = ['index.part1.js', 'index.part2.js'];
const OUTPUT = 'index.js';

try {
  let assembled = '';
  for (const part of PARTS) {
    const fullPath = path.join(__dirname, part);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Fichier manquant : ${part}`);
    }
    assembled += fs.readFileSync(fullPath, 'utf8');
    // S'assure qu'il y a toujours un saut de ligne entre deux parties,
    // même si le fichier précédent ne se termine pas par "\n".
    if (!assembled.endsWith('\n')) assembled += '\n';
  }

  fs.writeFileSync(path.join(__dirname, OUTPUT), assembled, 'utf8');
  console.log(`[ASSEMBLE] ✅ ${OUTPUT} généré à partir de ${PARTS.length} fichier(s) (${assembled.split('\n').length} lignes)`);
} catch (e) {
  console.error('[ASSEMBLE] ❌ Erreur:', e.message);
  process.exit(1);
}
