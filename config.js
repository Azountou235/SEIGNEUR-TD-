// config.js - Configuration globale du bot SEIGNEUR TD

// ════════════════════════════════════════════════════════════════
// 🤖 CONFIGURATION BOT WHATSAPP
// ════════════════════════════════════════════════════════════════

export const config = {
  botName: 'SEIGNEUR TD',
  prefix: '.',
  language: 'ar', // 'ar' = Arabe, 'fr' = Français, 'en' = English
  autoReply: false,
  sessionFolder: './auth_info_baileys',
  usePairingCode: true,
  phoneNumber: '', // Laissé vide — saisi au démarrage
  adminNumbers: ['84933801806', '107658338123943'], // Admins
  botAdmins: ['84933801806', '107658338123943'], // Liste des numéros admin
  dataFolder: './bot_data',
  maxViewOncePerUser: 50,
  commandCooldown: 2000, // 2 secondes entre les commandes
  
  // 🔑 CLÉS API (À GARDER PRIVÉES!)
  youtubeApiKey: 'AIzaSyD3JA07YzY6SJSHKtj9IA7S-GFZUkqYd70',
  openaiApiKey: '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',
  geminiApiKey: 'AIzaSyAj5kNv4ClFt-4DskW6XDU0PIPd3PXmwCw',
  groqApiKey: '', // Optionnel
};

// ════════════════════════════════════════════════════════════════
// 📱 CONFIGURATION TELEGRAM (FORWARDER)
// ════════════════════════════════════════════════════════════════

export const telegramConfig = {
  // 🔑 Token du bot Telegram (obtenu via @BotFather)
  botToken: '8907354720:AAECoeewcRXMHQxtqb8suMQbXF9XLxxtxL4',
  
  // 🆔 Ton ID Telegram (obtenu via @userinfobot)
  chatId: '6815008409',
  
  // Activer/désactiver le transfert automatique de messages
  enabled: false
};

// ════════════════════════════════════════════════════════════════
// 📁 VÉRIFIER/CRÉER DOSSIERS
// ════════════════════════════════════════════════════════════════

import fs from 'fs';

if (!fs.existsSync(config.dataFolder)) {
  fs.mkdirSync(config.dataFolder, { recursive: true });
}
