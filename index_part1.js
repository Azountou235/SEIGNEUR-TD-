import { createServer } from 'http';
import { fork } from 'child_process';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  delay,
  downloadContentFromMessage
} from 'bail-lite';

import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { forwardToTelegram } from './telegram-forwarder.js';
import { telegramConfig } from './config.js';

// Configuration du bot
const config = {
  botName: 'SEIGNEUR TD',
  prefix: '.',
  language: 'ar', // 'ar' = Arabe, 'fr' = Français, 'en' = English
  autoReply: false,
  sessionFolder: './auth_info_baileys',
  usePairingCode: true,
  phoneNumber: '', // Laissé vide — saisi au démarrage
  adminNumbers: ['84933801806', '107658338123943'], // Admins
  railwayToken: process.env.RAILWAY_TOKEN || '96bac1f1-b737-4cb0-b8c7-d8af5a4a0b0a',
  botAdmins: ['84933801806', '107658338123943'], // Liste des numéros admin (sans @s.whatsapp.net)
  dataFolder: './bot_data',
  maxViewOncePerUser: 50,
  commandCooldown: 2000, // 2 secondes entre les commandes
  youtubeApiKey: 'AIzaSyD3JA07YzY6SJSHKtj9IA7S-GFZUkqYd70', // 🔑 Clé API YouTube Data v3
  openaiApiKey:  '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', // 🔑 Clé API OpenAI GPT
  geminiApiKey:  'AIzaSyAj5kNv4ClFt-4DskW6XDU0PIPd3PXmwCw',  // 🔑 Clé API Google Gemini
  groqApiKey:    '',  // 🔑 Clé API Groq (optionnel, gratuit sur console.groq.com)

};

// Créer le dossier de données s'il n'existe pas
if (!fs.existsSync(config.dataFolder)) {
  fs.mkdirSync(config.dataFolder, { recursive: true });
}

// =============================================
// SYSTÈME DE TRADUCTION ARABE 🇹🇩 SEIGNEUR TD
// =============================================

const translations = {
  // Messages communs
  ' ': ' ',
  'Ce commandement est réservé aux groupes uniquement': 'réservé aux groupes uniquement',
  'Commande Admin': '  ',
  'Utilisation': '',
  'Exemple': '',
  '': '',
  '': '',
  'Échoué': '',
  ' ': ' ',
  ' ': ' ',
  '': '',
  'Cible': '',
  'Statut': '',
  
  // Commandes principales
  'Menu': '',
  'Aide': '',
  'Ping': '',
  'Actif': '',
  'Info': '',
  'Statut': '',
  
  // Messages du menu
  'Utilisateur': '',
  'Développeur': '',
  'Développeur': '',
  'Région': '',
  'Date': '',
  'Heure': '',
  'Mode': '',
  'Version': '',
  'Préfixe': '',
  'Nom du bot': ' ',
  
  // Commandes de groupe
  'Groupe': '',
  'Membres': '',
  'Admins': '',
  'En ligne': '',
  'Hors ligne': ' ',
  'Expulsé': ' ',
  'Ajouté': ' ',
  'Promu': ' ',
  'Rétrogradé': ' ',
  
  // Messages d'erreur
  'Aucun média trouvé': '    ',
  'Répondre à un message': '  ',
  ' ': '  ',
  'Numéro invalide': '  ',
  'Commande non trouvée': '  ',
  
  // Bogues et attaques
  'RAPPORT SILENCIEUX': ' ',
  'SUPPORT BAN': ' ',
  'BAN MEGA': ' ',
  
  // États
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '': '',
  ' ': ' ',
  '': '',
  ' ': ' ',
  '': '',
  '': '',
  
  // Autres
  '': '',
  'Rapports': '',
  'Total': '',
  'Durée': '',
  'Vitesse': '',
  'Risque': '',
  'Chronologie': ' ',
  'Détails': '',
  'État du système': ' ',
  '  ': '  ',
  'Mission accomplie': ' '
};

// Fonction de traduction
function translate(text) {
  if (config.language !== 'ar') return text;
  
  // Traduire les mots clés
  let translatedText = text;
  for (const [key, value] of Object.entries(translations)) {
    const regex = new RegExp(key, 'gi');
    translatedText = translatedText.replace(regex, value);
  }
  
  return translatedText;
}

// Fonction pour envelopper les messages en arabe
function msg(text) {
  return translate(text);
}

// Mots-clés de réponse automatique et réponses
const autoReplies = {
  'hello': '👋 Salut! Je suis SEIGNEUR TD 🇹🇩. Comment puis-je t\'aider?',
  'hi': '👋 Hello! Bienvenue sur SEIGNEUR TD 🇹🇩.',
  'help': `╔══════════════════════════════╗
║      SEIGNEUR TD 🇹🇩       ║
╚══════════════════════════════╝

📋 Commandes disponibles:
━━━━━━━━━━━━━━━━
!help - Afficher ce menu
!ping - Vérifier la latence
!info - Informations du bot
!menu - Menu principal

Type !menu pour voir le menu complet!`,
  'bye': '👋 À bientôt! Prends soin de toi!',
  'thanks': 'De rien! 😊 - SEIGNEUR TD 🇹🇩',
  'thank you': 'Avec plaisir! 😊 - SEIGNEUR TD 🇹🇩'
};

// Base de données simple en mémoire avec persistance
const database = {
  users: new Map(),
  groups: new Map(),
  statistics: {
    total: 0,
    totalUsers: 0,
    totalGroups: 0
  }
};

// Variables pour les fonctionnalités (bot principal — partagées)
let botMode = 'public';

// Cache version Baileys — évite HTTP à chaque reconnexion
let _cachedBaileysVersion = null;
async function getBaileysVersion() {
  if (_cachedBaileysVersion) return _cachedBaileysVersion;
  const { version } = await fetchLatestBaileysVersion();
  _cachedBaileysVersion = version;
  return version;
}

// Augmenter la limite d'écouteurs EventEmitter pour supporter N sessions
process.setMaxListeners(50);

// Filtre les avertissements Signal (Bad MAC, session fermée) qui spamment la console
const _origConsoleError = console.error.bind(console);
console.error = (...args) => {
  const msg = String(args[0] ?? '');
  if (msg.includes('Bad MAC') || msg.includes('closed session') ||
      msg.includes('Signal error') || msg.includes('ECDHE_STEP')) {
    // Ignorer ces avertissements
    return;
  }
  _origConsoleError(...args);
};

// Utilitaires
function toBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// =============================================
// CONNEXION BAILEYS ET GESTION DE SESSION
// =============================================

async function startBot() {
  const logger = pino({ level: 'silent' });
  const version = await getBaileysVersion();

  const { state, saveCreds } = await useMultiFileAuthState(config.sessionFolder);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  // Gestion des événements de connexion
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📱 Scannez ce QR code:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('🔄 Reconnexion...');
        setTimeout(startBot, 3000);
      } else {
        console.log('❌ Déconnecté. Supprimez session et relancez.');
      }
    } else if (connection === 'open') {
      console.log('✅ Bot connecté - SEIGNEUR TD 🇹🇩');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Gestion des messages reçus
  sock.ev.on('messages.upsert', async (m) => {
    const message = m.messages[0];
    if (!message.message) return;

    const remoteJid = message.key.remoteJid;
    const isGroup = remoteJid?.endsWith('@g.us');
    const senderJid = message.key.participant || message.key.remoteJid;
    const senderNum = senderJid.split('@')[0];
    const isAdmin = config.botAdmins.includes(senderNum);

    // Ignorer les messages du bot lui-même
    if (senderJid === sock.user.id) return;

    // Extraire le texte du message
    const messageText = message.message?.conversation ||
                        message.message?.extendedTextMessage?.text || '';
    const command = messageText.split(' ')[0]?.substring(config.prefix.length)?.toLowerCase();
    const args = messageText.split(' ').slice(1);

    // Réponses automatiques
    if (config.autoReply && messageText) {
      for (const [key, reply] of Object.entries(autoReplies)) {
        if (messageText.toLowerCase().includes(key)) {
          await sock.sendMessage(remoteJid, { text: reply });
          break;
        }
      }
    }

    // Traiter les commandes
    if (messageText.startsWith(config.prefix)) {
      await handleCommand(sock, remoteJid, isGroup, senderJid, command, args, message, isAdmin);
    }
  });

  return sock;
}

// =============================================
// GESTIONNAIRE DE COMMANDES
// =============================================

async function handleCommand(sock, remoteJid, isGroup, senderJid, command, args, message, isAdmin) {
  if (!command) return;

  try {
    switch (command) {
      case 'menu':
      case 'aide': {
        const menu = `╔══════════════════════════════╗
║    SEIGNEUR TD MENU 🇹🇩      ║
╚══════════════════════════════╝

📋 **COMMANDES GÉNÉRALES:**
• ${config.prefix}ping - Vérifier la latence
• ${config.prefix}info - Infos du bot
• ${config.prefix}help - Afficher l'aide

📷 **MÉDIA:**
• ${config.prefix}play [recherche] - Écouter une musique
• ${config.prefix}download [lien] - Télécharger un vidéo

🛡️ **MODÉRATION** (Admins uniquement):
• ${config.prefix}ban - Bannir un utilisateur
• ${config.prefix}kick - Expulser un utilisateur
• ${config.prefix}promote - Promouvoir en admin
• ${config.prefix}demote - Rétrograder un admin

⚙️ **CONFIGURATION:**
• ${config.prefix}prefix [nouveau] - Changer le préfixe
• ${config.prefix}lang [ar/fr/en] - Changer la langue

💾 **UTILITAIRES:**
• ${config.prefix}save - Sauvegarder un message
• ${config.prefix}setcmd - Transformer un sticker en commande

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🇹🇩 SEIGNEUR TD - Tchad Edition`;
        
        await sock.sendMessage(remoteJid, { text: menu });
        break;
      }

      case 'ping': {
        const start = Date.now();
        const msg = await sock.sendMessage(remoteJid, { text: '📡 Ping...' });
        const latency = Date.now() - start;
        await sock.sendMessage(remoteJid, { 
          text: `📡 Pong!\n⏱️ Latence: ${latency}ms`,
          edit: msg.key 
        });
        break;
      }

      case 'info': {
        const info = `╔══════════════════════════════╗
║      INFOS DU BOT 🇹🇩       ║
╚══════════════════════════════╝

🤖 *Bot:* SEIGNEUR TD
🌍 *Région:* Tchad 🇹🇩
⏰ *Version:* 1.0.0
📱 *Plateforme:* WhatsApp
🔐 *Statut:* Actif

Développé par: SEIGNEUR TD Team
━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        
        await sock.sendMessage(remoteJid, { text: info });
        break;
      }

      case 'hi':
      case 'salut':
      case 'bonjour': {
        const greetings = [
          '👋 Salut! Je suis SEIGNEUR TD 🇹🇩',
          'Bienvenue! 👋',
          'Coucou! Comment ça va? 😊'
        ];
        const greeting = greetings[Math.floor(Math.random() * greetings.length)];
        await sock.sendMessage(remoteJid, { text: greeting });
        break;
      }

      case 'grouponly': {
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { 
            text: '❌ Cette commande est réservée aux groupes uniquement' 
          });
        } else {
          await sock.sendMessage(remoteJid, { 
            text: '✅ Vous êtes dans un groupe' 
          });
        }
        break;
      }

      case 'adminonly': {
        if (!isAdmin) {
          await sock.sendMessage(remoteJid, { 
            text: '❌ Commande Admin uniquement' 
          });
        } else {
          await sock.sendMessage(remoteJid, { 
            text: '✅ Vous êtes admin' 
          });
        }
        break;
      }

      case 'langue':
      case 'lang': {
        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: `Langues disponibles: ar, fr, en\nUtilisation: ${config.prefix}lang [ar/fr/en]`
          });
        } else {
          config.language = args[0].toLowerCase();
          await sock.sendMessage(remoteJid, { 
            text: `✅ Langue changée en: ${config.language}` 
          });
        }
        break;
      }

      case 'sauvegarde':
      case 'garder': {
        try {
          const botPrivateJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
          const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const quotedSender = message.message?.extendedTextMessage?.contextInfo?.participant || senderJid;
          const senderName = message.pushName || senderJid.split('@')[0];

          if (!quoted) {
            await sock.sendMessage(remoteJid, {
              text: `💾 *Commande SAVE*\n\n📌 *Utilisation:*\nRéponds à n'importe quel message avec \`${config.prefix}save\`\n\n• Texte, image, vidéo, audio, sticker, View Once\n\n✅ Le média sera envoyé en privé sur ton numéro bot`
            }, { quoted: message });
            break;
          }

          await sock.sendMessage(remoteJid, { react: { text: "💾", key: message.key } });

          const fromName = quotedSender?.split('@')[0] || 'Inconnu';
          const dateStr  = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Ndjamena' });
          const headerTxt = `💾 *SAUVEGARDÉ*\n━━━━━━━━━━━━━━━━━━━━━━━\n👤 *De:* +${fromName}\n📅 *Date:* ${dateStr}\n💬 *Enregistré par:* ${senderName}\n━━━━━━━━━━━━━━━━━━━━━━━`;

          // Envoyer l'en-tête d'abord
          await sock.sendMessage(botPrivateJid, { text: headerTxt });

          // Détecter et envoyer le type de contenu
          const qViewOnce = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessageV2Extension?.message;
          const qImg   = qViewOnce?.imageMessage  || quoted.imageMessage;
          const qVid   = qViewOnce?.videoMessage  || quoted.videoMessage;
          const qAud   = quoted.audioMessage;
          const qStick = quoted.stickerMessage;
          const qTxt   = quoted.conversation || quoted.extendedTextMessage?.text;
          const qCaption = qImg?.caption || qVid?.caption || '';

          if (qImg) {
            const stream = await downloadContentFromMessage(qImg, 'image');
            const buf    = await toBuffer(stream);
            await sock.sendMessage(botPrivateJid, {
              image:   buf,
              mimetype: qImg.mimetype || 'image/jpeg',
              caption: qCaption || '📸 Image sauvegardée'
            });
          } else if (qVid) {
            const stream = await downloadContentFromMessage(qVid, 'video');
            const buf    = await toBuffer(stream);
            await sock.sendMessage(botPrivateJid, {
              video:   buf,
              mimetype: qVid.mimetype || 'video/mp4',
              caption: qCaption || '🎥 Vidéo sauvegardée'
            });
          } else if (qAud) {
            const stream = await downloadContentFromMessage(qAud, 'audio');
            const buf    = await toBuffer(stream);
            await sock.sendMessage(botPrivateJid, {
              audio:   buf,
              mimetype: qAud.mimetype || 'audio/ogg',
              ptt:     qAud.ptt || false
            });
          } else if (qStick) {
            const stream = await downloadContentFromMessage(qStick, 'sticker');
            const buf    = await toBuffer(stream);
            await sock.sendMessage(botPrivateJid, { sticker: buf });
          } else if (qTxt) {
            await sock.sendMessage(botPrivateJid, {
              text: `💬 *Message sauvegardé:*\n\n${qTxt}`
            });
          } else {
            await sock.sendMessage(botPrivateJid, {
              text: '📎 Contenu sauvegardé (type non reconnu)'
            });
          }

          // Juste une réaction ✅, pas de message de confirmation
          try { await sock.sendMessage(remoteJid, { react: { text: "✅", key: message.key } }); } catch(e) {}

        } catch(e) {
          console.error('ERREUR SAVE:', e.message);
          await sock.sendMessage(remoteJid, {
            text: `❌ *Erreur save:* ${e.message}`
          }, { quoted: message });
        }
        break;
      }

      // =============================================
      // 🎭 COMMANDE SETCMD — Transformer une commande en sticker
      // =============================================
      case 'setcmd':
      case 'cmdsticker':
      case 'stickercmd': {
        try {
          const cmdName = args[0]?.toLowerCase();
          if (!cmdName) {
            await sock.sendMessage(remoteJid, {
              text: `🎭 *Commande SETCMD*\n\n📌 *Utilisation:*\n1️⃣ Réponds à un sticker avec:\n   \`${config.prefix}setcmd [commande]\`\n\n📋 *Exemples:*\n• \`${config.prefix}setcmd play\` → ce sticker lancera !play\n• \`${config.prefix}setcmd gpt\` → ce sticker appellera !gpt\n• \`${config.prefix}setcmd vv\` → ce sticker appellera !vv\n\n✅ Envoie ensuite ce sticker pour exécuter la commande`
            }, { quoted: message });
            break;
          }

          // Chercher un sticker en reply
          const quotedStick = message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
          if (!quotedStick) {
            await sock.sendMessage(remoteJid, {
              text: `❌ Réponds à un *sticker* avec \`${config.prefix}setcmd ${cmdName}\``
            }, { quoted: message });
            break;
          }

          // Télécharger le sticker
          const stickerStream = await downloadContentFromMessage(quotedStick, 'sticker');
          const stickerBuf    = await toBuffer(stickerStream);

          // Calculer un hash simple du sticker pour l'identifier
          const stickerHash = stickerBuf.slice(0, 32).toString('hex');

          // Sauvegarder dans une Map globale
          if (!global.stickerCommands) global.stickerCommands = new Map();
          global.stickerCommands.set(stickerHash, cmdName);

          await sock.sendMessage(remoteJid, {
            text: `✅ *Sticker configuré!*\n\n🎭 Ce sticker exécutera: \`${config.prefix}${cmdName}\`\n\n📌 Envoie ce sticker dans n'importe quelle conversation pour déclencher la commande.`
          }, { quoted: message });
          try { await sock.sendMessage(remoteJid, { react: { text: "✅", key: message.key } }); } catch(e) {}

        } catch(e) {
          console.error('ERREUR SETCMD:', e.message);
          await sock.sendMessage(remoteJid, { text: `❌ Erreur setcmd: ${e.message}` }, { quoted: message });
        }
        break;
      }

      case 'pair':
      case 'connect':
      case 'adduser':{
        const pN=args[0]?.replace(/[^0-9]/g,'');
        if(!pN||pN.length<7){await sock.sendMessage(remoteJid,{text:`📱 Utilisation: ${config.prefix}pair NUMERO`});break;}
        try{const pc=await sock.requestPairingCode(pN);const fc=pc?.match(/.{1,4}/g)?.join('-')||pc;await sock.sendMessage(remoteJid,{text:`🔗 *CODE DE COUPLAGE*\n📱 +${pN}\n🔑 ${fc}\n⏰ Expire dans 60s`});}
        catch(e){await sock.sendMessage(remoteJid,{text:`❌ ${e.message}`});}
        break;
      }
      case 't':{
        const tEs=['mp4','mov','jpg','jpeg','png','webp','mp3','ogg','txt','js'];
        let tF=null,tE=null;
        for(const e of tEs){const c2=path.resolve(`./t.${e}`);if(fs.existsSync(c2)){tF=c2;tE=e;break;}}
        if(!tF){await sock.sendMessage(remoteJid,{text:'❌ Aucun fichier t.* trouvé.'});break;}
        try{
          if(['mp4','mov'].includes(tE))await sock.sendMessage(remoteJid,{video:fs.readFileSync(tF),mimetype:'video/mp4',caption:''});
          else if(['jpg','jpeg','png','webp'].includes(tE))await sock.sendMessage(remoteJid,{image:fs.readFileSync(tF),caption:''});
          else if(['mp3','ogg'].includes(tE))await sock.sendMessage(remoteJid,{audio:fs.readFileSync(tF),mimetype:'audio/mp4',ptt:false});
          else if(tE==='txt')await sock.sendMessage(remoteJid,{text:fs.readFileSync(tF,'utf8')});
          await sock.sendMessage(remoteJid,{text:`✅ t.${tE} envoyé!`});
        }catch(e){await sock.sendMessage(remoteJid,{text:`❌ ${e.message}`});}
        break;
      }
      default:
        await sock.sendMessage(remoteJid, {
          text: `❌ Commande inconnue: ${config.prefix}${command}\n\nTapez ${config.prefix}help`
        });
    }
  } catch (error) {
    console.error(`❌ Erreur de commande [${command}]:`, error?.message || error);
    await sock.sendMessage(remoteJid, { 
      text: `❌ *Erreur de commande:* \`${command}\`\n\n\`${error?.message || 'Erreur inconnue'}\`` 
    });
  }
}

// Démarrer le bot
startBot().catch(console.error);
