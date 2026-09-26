#!/usr/bin/env node
/**
 * scripts/generateAccessKey.js
 *
 * Génère une ou plusieurs clés d'accès au site web (format
 * SEIGNEUR + 20 caractères mélangés), à distribuer aux personnes
 * autorisées. Chaque clé n'est utilisable qu'UNE seule fois.
 *
 * Usage :
 *   node scripts/generateAccessKey.js         -> génère 1 clé
 *   node scripts/generateAccessKey.js 5        -> génère 5 clés
 *
 * ⚠️ Les clés générées ici ne sont affichées qu'UNE fois, dans ce
 * terminal. Elles ne sont jamais stockées en clair (seulement leur
 * empreinte, dans data/accessKeys.json) et ne peuvent pas être
 * ré-affichées plus tard. Notez-les immédiatement dans un endroit sûr.
 */

const { addKeys } = require('../utils/accessKeys');

const count = Math.max(1, parseInt(process.argv[2] || '1', 10) || 1);
const keys = addKeys(count);

console.log(`\n✅ ${keys.length} nouvelle(s) clé(s) d'accès générée(s) :\n`);
keys.forEach((k) => console.log('   ' + k));
console.log(
  "\n⚠️  Notez-les tout de suite dans un endroit sûr (gestionnaire de mots\n" +
  "    de passe, etc.). Elles ne seront plus jamais affichées, et chaque\n" +
  "    clé n'est valable qu'UNE seule fois.\n"
);
