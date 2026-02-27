/*

  !- Credits By PRIME XUU
  Stabilisé par LE SEIGNEUR DES APPAREILS 🇷🇴
  Corrigé : Pairing code propre, sans répétition, sans erreur JSON
  
*/

const { execSync } = require('child_process');
const fs = require('fs');

if (!fs.existsSync('./node_modules') || !fs.existsSync('./node_modules/@whiskeysockets')) {
    console.log('📦 Modules manquants — Installation en cours...');
    try {
        execSync('npm install --no-audit --no-fund --ignore-scripts', { stdio: 'inherit' });
        console.log('✅ Installation terminée !');
    } catch(e) {
        console.log('⚠️ Erreur installation:', e.message);
    }
} else {
    console.log('✅ Modules déjà installés — Démarrage direct...');
}

require('./settings');
const pino = require('pino');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const readline = require('readline');
const FileType = require('file-type');
const { exec } = require('child_process');
const { say } = require('cfonts');
const { Boom } = require('@hapi/boom');
const { terkentod } = require('./source/pass');

const {
  default: WAConnection,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  useMultiFileAuthState,
  Browsers,
  DisconnectReason,
  makeInMemoryStore,
  makeCacheableSignalKeyStore,
  fetchLatestWaWebVersion,
  proto,
  PHONENUMBER_MCC,
  getAggregateVotesInPollMessage
} = require('@whiskeysockets/baileys');

const pairingCode = true;

let Keren = `\n\n╭━━━━━━━━━━━━━━━━━━━━━━━╮\n┃  SEIGNEUR TD - BOT WA  ┃\n┃  Par : LE SEIGNEUR DES APPAREILS 🇷🇴  ┃\n╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\nɴᴏᴍ ᴅᴜ ʙᴏᴛ : SEIGNEUR TD\nᴘʀᴏᴘʀɪéᴛᴀɪʀᴇ : LE SEIGNEUR DES APPAREILS 🇷🇴\nᴠᴇʀsɪᴏɴ : V12\n=============================\n`;

const DataBase = require('./source/database');
const { randomToken } = require('./library/scraper');
const database = new DataBase();

(async () => {
  const loadData = await database.read();
  if (loadData && Object.keys(loadData).length === 0) {
    global.db = { users: {}, groups: {}, database: {}, settings: {}, ...(loadData || {}) };
    await database.write(global.db);
  } else {
    global.db = loadData;
  }
  setInterval(async () => {
    if (global.db) await database.write(global.db);
  }, 3500);
})();

const { MessagesUpsert, Solving } = require('./source/message');
let handleDelete = async () => {}, handleEdit = async () => {};
try {
  ({ handleDelete, handleEdit } = require('./PRIMEXUU_SEIGNEUR_PREMIUM_FR'));
} catch(e) {
  console.log(chalk.yellow('⚠️ PRIMEXUU_SEIGNEUR_PREMIUM_FR introuvable, antidelete/antiedit désactivés'));
}
const { isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, await, sleep } = require('./library/function');
const { welcomeBanner, promoteBanner } = require('./library/welcome.js');

process.on('uncaughtException', (err) => {
  console.log(chalk.red('⚠️ Erreur non capturée :'), err.message);
});
process.on('unhandledRejection', (err) => {
  console.log(chalk.red('⚠️ Promesse rejetée :'), err.message);
});

// ✅ Numéro global — demandé UNE SEULE FOIS
let globalPhoneNumber = null;
// ✅ Verrou — empêche les démarrages/reconnexions simultanés
let isStarting = false;

async function askPhoneNumber() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(chalk.cyan.bold('📱 Entre ton numéro WhatsApp (ex: 22507XXXXXXX) : '), (ans) => {
      rl.close();
      resolve(ans.replace(/[^0-9]/g, '').trim());
    });
  });
}

async function startingBot() {
  // ✅ Empêcher les démarrages simultanés
  if (isStarting) return;
  isStarting = true;

  try {
    const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
    const { state, saveCreds } = await useMultiFileAuthState('session');

    // ✅ Demander le numéro UNE SEULE FOIS
    if (pairingCode && !state.creds.registered) {
      console.log(chalk.red(Keren));
      if (!globalPhoneNumber) {
        globalPhoneNumber = await askPhoneNumber();
        if (!globalPhoneNumber || globalPhoneNumber.length < 7) {
          console.log(chalk.red.bold('❌ Numéro invalide, arrêt...'));
          isStarting = false;
          return;
        }
      }
      console.log(chalk.yellow(`\n✅ Numéro : +${globalPhoneNumber} — Connexion à WhatsApp en cours...\n`));
    }

    // ✅ Config propre — identique à AXONIC qui fonctionne
    const Xuu = await WAConnection({
      version: [2, 3000, 1023561582],
      browser: ['Ubuntu', 'Safari', '18.1'],
      printQRInTerminal: !pairingCode,
      logger: pino({ level: 'silent' }),
      auth: state,
      generateHighQualityLinkPreview: true,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 2000,
      getMessage: async (key) => {
        if (store) {
          const msg = await store.loadMessage(key.remoteJid, key.id, undefined);
          return msg?.message || undefined;
        }
      }
    });

    // ✅ PAIRING : synchrone, AVANT les event listeners, UNE SEULE FOIS
    if (pairingCode && !Xuu.authState.creds.registered && globalPhoneNumber) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const code = await Xuu.requestPairingCode(globalPhoneNumber);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
        console.log(chalk.green.bold('\n╔══════════════════════════════╗'));
        console.log(chalk.green.bold('║   🔑 TON CODE PAIRING :      ║'));
        console.log(chalk.white.bold(`║        ${formattedCode}         ║`));
        console.log(chalk.green.bold('╚══════════════════════════════╝'));
        console.log(chalk.yellow('➡️  WhatsApp → Appareils reliés → Relier avec numéro'));
        console.log(chalk.yellow('   Entre ce code dans les 60 secondes.\n'));
      } catch(e) {
        console.log(chalk.red('❌ Erreur pairing :'), e.message);
        // Nettoyer et réessayer proprement — NE PAS boucler indéfiniment
        exec('rm -rf ./session/*');
        globalPhoneNumber = null;
        isStarting = false;
        setTimeout(startingBot, 8000);
        return;
      }
    }

    // ✅ Event listeners APRÈS le pairing
    Xuu.ev.on('creds.update', saveCreds);

    Xuu.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, receivedPendingNotifications } = update;

      if (connection === 'close') {
        isStarting = false; // Libérer le verrou pour la reconnexion
        const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
        console.log(chalk.yellow(`🔄 Connexion fermée — Raison: ${reason}`));

        if (reason === DisconnectReason.loggedOut) {
          console.log(chalk.red('🚫 Déconnecté. Suppression session...'));
          exec('rm -rf ./session/*');
          globalPhoneNumber = null;
          setTimeout(startingBot, 5000);
        } else if (reason === DisconnectReason.badSession || reason === 405) {
          console.log(chalk.red('🗑️ Session invalide. Nettoyage...'));
          exec('rm -rf ./session/*');
          globalPhoneNumber = null;
          setTimeout(startingBot, 5000);
        } else if (reason === DisconnectReason.Multidevicemismatch) {
          console.log(chalk.red('📱 Conflit appareils. Nettoyage...'));
          exec('rm -rf ./session/*');
          globalPhoneNumber = null;
          setTimeout(startingBot, 5000);
        } else if ([
          DisconnectReason.connectionLost,
          DisconnectReason.connectionClosed,
          DisconnectReason.restartRequired,
          DisconnectReason.timedOut,
          DisconnectReason.connectionReplaced
        ].includes(reason)) {
          console.log(chalk.yellow('⏳ Reconnexion dans 5s...'));
          setTimeout(startingBot, 5000);
        } else {
          console.log(chalk.red(`❓ Raison inconnue: ${reason}. Reconnexion...`));
          setTimeout(startingBot, 5000);
        }
      }

      if (connection === 'open') {
        isStarting = false;
        terkentod(Xuu);
        console.log(`${chalk.blue.bold('🤖 Bot Name  :')} ${chalk.cyan.bold('SEIGNEUR TD')}
${chalk.blue.bold('👤 Developer   :')} ${chalk.green.bold('LE SEIGNEUR DES APPAREILS')}
${chalk.blue.bold('✅ Status    :')} ${chalk.yellow.bold('On')}`);
        randomToken(Xuu);
        setInterval(() => {
          Xuu.sendPresenceUpdate('available').catch(() => {});
        }, 120000);
      } else if (receivedPendingNotifications === 'true') {
        console.log('Veuillez patienter environ 1 minute...');
      }
    });

    await store.bind(Xuu.ev);
    await Solving(Xuu, store);

    Xuu.ev.on('messages.upsert', async (message) => {
      await MessagesUpsert(Xuu, message, store);
    });

    Xuu.ev.on('messages.delete', async (update) => {
      try {
        const keys = update?.keys || (Array.isArray(update) ? update : []);
        if (keys.length > 0) await handleDelete(Xuu, keys);
      } catch(e) { console.log('[DELETE]', e.message); }
    });

    Xuu.ev.on('messages.update', async (updates) => {
      try {
        if (updates?.length > 0) await handleEdit(Xuu, updates);
      } catch(e) { console.log('[EDIT]', e.message); }
    });

    Xuu.ev.on('contacts.update', (update) => {
      for (let contact of update) {
        let id = Xuu.decodeJid(contact.id);
        if (store && store.contacts) store.contacts[id] = { id, name: contact.notify };
      }
    });

    Xuu.ev.on('group-participants.update', async (update) => {
      const { id, author, participants, action } = update;
      try {
        if (global.db.groups[id] && global.db.groups[id].welcome == true) {
          const metadata = await Xuu.groupMetadata(id);
          let teks;
          for (let n of participants) {
            let profile;
            try {
              profile = await Xuu.profilePictureUrl(n, 'image');
            } catch {
              profile = 'https://telegra.ph/file/95670d63378f7f4210f03.png';
            }
            if (action == 'add') {
              teks = author.split('').length < 1 ? `@${n.split('@')[0]} a rejoint via *lien de groupe*` : author !== n ? `@${author.split('@')[0]} a *ajouté* @${n.split('@')[0]} dans le groupe` : '';
              let img = await welcomeBanner(profile, n.split('@')[0], metadata.subject, 'welcome');
              await Xuu.sendMessage(id, { text: teks, contextInfo: { mentionedJid: [author, n], externalAdReply: { thumbnail: img, title: 'B I E N V E N U E 👋', body: '', sourceUrl: global.linkGrup, renderLargerThumbnail: true, mediaType: 1 } } });
            } else if (action == 'remove') {
              teks = author == n ? `@${n.split('@')[0]} a *quitté* le groupe` : author !== n ? `@${author.split('@')[0]} a *expulsé* @${n.split('@')[0]} du groupe` : '';
              let img = await welcomeBanner(profile, n.split('@')[0], metadata.subject, 'remove');
              await Xuu.sendMessage(id, { text: teks, contextInfo: { mentionedJid: [author, n], externalAdReply: { thumbnail: img, title: 'A U   R E V O I R 👋', body: '', sourceUrl: global.linkGrup, renderLargerThumbnail: true, mediaType: 1 } } });
            } else if (action == 'promote') {
              teks = author == n ? `@${n.split('@')[0]} est devenu *administrateur* du groupe` : author !== n ? `@${author.split('@')[0]} a *promu* @${n.split('@')[0]} comme *administrateur*` : '';
              let img = await promoteBanner(profile, n.split('@')[0], 'promote');
              await Xuu.sendMessage(id, { text: teks, contextInfo: { mentionedJid: [author, n], externalAdReply: { thumbnail: img, title: 'P R O M O T I O N 📍', body: '', sourceUrl: global.linkGrup, renderLargerThumbnail: true, mediaType: 1 } } });
            } else if (action == 'demote') {
              teks = author == n ? `@${n.split('@')[0]} n'est plus *administrateur*` : author !== n ? `@${author.split('@')[0]} a *rétrogradé* @${n.split('@')[0]}` : '';
              let img = await promoteBanner(profile, n.split('@')[0], 'demote');
              await Xuu.sendMessage(id, { text: teks, contextInfo: { mentionedJid: [author, n], externalAdReply: { thumbnail: img, title: 'R É T R O G R A D E 📍', body: '', sourceUrl: global.linkGrup, renderLargerThumbnail: true, mediaType: 1 } } });
            }
          }
        }
      } catch(e) {}
    });

    return Xuu;

  } catch(err) {
    console.log(chalk.red('❌ Erreur démarrage:'), err.message);
    isStarting = false;
    setTimeout(startingBot, 5000);
  }
}

startingBot();

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(chalk.redBright(`Update ${__filename}`));
  delete require.cache[file];
  require(file);
});
