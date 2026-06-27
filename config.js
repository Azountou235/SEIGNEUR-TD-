// config.js - Configuration globale du bot SEIGNEUR TD
// BOT MULTI-SESSIONS - Chaque session est admin chez elle!

// ════════════════════════════════════════════════════════════════
// 🤖 CONFIGURATION BOT WHATSAPP MULTI-SESSIONS
// ════════════════════════════════════════════════════════════════

export const config = {
  botName: 'SEIGNEUR TD',
  prefix: '.',
  language: 'fr',
  autoReply: false,
  
  // 📁 DOSSIERS DES SESSIONS (MULTI-SESSIONS)
  sessionFolder: './auth_info_baileys',
  sessionsDir: './sessions',  // Dossier des sessions
  usePairingCode: true,
  
  // 💾 DONNÉES
  dataFolder: './bot_data',
  maxViewOncePerUser: 50,
  commandCooldown: 2000,
  
  // 🔑 GITHUB AUTO-UPDATE (TES INFOS)
  github: {
    owner: 'Azountou235',           // Ton username GitHub
    repo: 'SEIGNEUR-TD-',            // Ton repo exact
    branch: 'main',
    url: 'https://github.com/Azountou235/SEIGNEUR-TD-',
    enabled: true
  },
  
  // 📥 API TRUSTBIT (Téléchargements)
  apiBase: 'https://api-trustbit.name.ng/api',
  
  // 👑 SYSTÈME ADMIN (MULTI-SESSIONS)
  // NOTE: Chaque session connectée est admin CHEZ ELLE
  // Pas besoin de liste globale - chaque session gère ses groupes
  adminSystem: {
    type: 'session',  // Admin = la session elle-même dans ses groupes
    globalAdmins: []  // Vide - chaque session est indépendante
  }
};

// ════════════════════════════════════════════════════════════════
// 📁 VÉRIFIER/CRÉER DOSSIERS
// ════════════════════════════════════════════════════════════════

import fs from 'fs';

if (!fs.existsSync(config.dataFolder)) {
  fs.mkdirSync(config.dataFolder, { recursive: true });
}

if (!fs.existsSync(config.sessionsDir)) {
  fs.mkdirSync(config.sessionsDir, { recursive: true });
}

export default config;
