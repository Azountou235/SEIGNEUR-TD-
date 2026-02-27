/*

  !- Credits By PRIME XUU
  Stabilisé par LE SEIGNEUR DES APPAREILS 🇷🇴
  
*/

// ════════════════════════════════════════════════════
//  AUTO-INSTALL — Installe les modules si nécessaire
//  Plus besoin de install.js séparé !
// ════════════════════════════════════════════════════
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
const fetch = require('node-fetch'); // ✅ AJOUTÉ - manquait avant
const readline = require('readline');
const FileType = require('file-type');
const { exec } = require('child_process');
const { say } = require('cfonts')
const { Boom } = require('@hapi/boom');
const { verifyPassword, verifyPhoneNumber, connectPhoneNumber, terkentod } = require('./source/pass');

const { default: WAConnection, generateWAMessageFromContent, 
prepareWAMessageMedia, useMultiFileAuthState, Browsers, DisconnectReason, makeInMemoryStore, makeCacheableSignalKeyStore, fetchLatestWaWebVersion, proto, PHONENUMBER_MCC, getAggregateVotesInPollMessage } = require('@whiskeysockets/baileys');

const pairingCode = true
const rl = readline.createInterface({ input: process.stdin, output: process.stdout }) // ✅ CORRIGÉ : était "url" avant
const question = (text) => new Promise((resolve) => rl.question(text, resolve))

let Keren = `\n\n╭━━━━━━━━━━━━━━━━━━━━━━━╮\n┃  SEIGNEUR TD - BOT WA  ┃\n┃  Par : LE SEIGNEUR DES APPAREILS 🇷🇴  ┃\n╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\nɴᴏᴍ ᴅᴜ ʙᴏᴛ : SEIGNEUR TD\nᴘʀᴏᴘʀɪéᴛᴀɪʀᴇ : LE SEIGNEUR DES APPAREILS 🇷🇴\nᴠᴇʀsɪᴏɴ : V12\n=============================\n`
const DataBase = require('./source/database');
const { randomToken } = require('./library/scraper');
const database = new DataBase();

// ✅ VERSION BAILEYS FIXE - évite les crashs si GitHub est lent
const BAILEYS_VERSION = [2, 3000, 1023561582];

(async () => {
const loadData = await database.read()
if (loadData && Object.keys(loadData).length === 0) {
global.db = {
users: {},
groups: {},
database: {},
settings : {}, 
...(loadData || {}),
}
await database.write(global.db)
} else {
global.db = loadData
}
setInterval(async () => {
if (global.db) await database.write(global.db)
}, 3500)
})()

const { MessagesUpsert, Solving } = require('./source/message')
// Fallback si PRIMEXUU_SEIGNEUR_PREMIUM_FR est absent
let handleDelete = async () => {}, handleEdit = async () => {};
try { ({ handleDelete, handleEdit } = require('./PRIMEXUU_SEIGNEUR_PREMIUM_FR')); } catch(e) { console.log(chalk.yellow('⚠️ PRIMEXUU_SEIGNEUR_PREMIUM_FR introuvable, antidelete/antiedit désactivés')); }
const { isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, await, sleep } = require('./library/function');
const { welcomeBanner, promoteBanner } = require("./library/welcome.js")

// ✅ ANTI-CRASH GLOBAL - le bot ne s'arrête jamais sur une erreur inattendue
process.on('uncaughtException', (err) => {
  console.log(chalk.red('⚠️ Erreur non capturée :'), err.message)
})
process.on('unhandledRejection', (err) => {
  console.log(chalk.red('⚠️ Promesse rejetée :'), err.message)
})

// ✅ Compteur pour éviter les reconnexions infinies
let reconnectCount = 0;
const MAX_RECONNECT = 10;

async function getVersion() {
  // ✅ Version fixe en cas d'échec réseau
  try {
    const { version } = await fetchLatestWaWebVersion();
    reconnectCount = 0;
    return version;
  } catch {
    console.log(chalk.yellow('⚠️ Impossible de récupérer la version WA, utilisation de la version fixe'));
    return BAILEYS_VERSION;
  }
}

async function startingBot() {

if (reconnectCount >= MAX_RECONNECT) {
  console.log(chalk.red('❌ Trop de reconnexions échouées. Nettoyage de la session...'))
  exec('rm -rf ./session/*')
  reconnectCount = 0;
  setTimeout(startingBot, 10000); // Redémarre après 10 secondes
  return;
}

try {
const store = await makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })
const { state, saveCreds } = await useMultiFileAuthState('session');

const version = await getVersion();

const Xuu = await WAConnection({
version: version,
// ✅ BROWSER STABLE - moins détectable par WhatsApp
browser: Browsers.ubuntu('Chrome'),
printQRInTerminal: !pairingCode, 
logger: pino({ level: "silent" }),
auth: {
  creds: state.creds,
  keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
},
generateHighQualityLinkPreview: true,
// ✅ KEEP-ALIVE - maintient la connexion active longtemps
keepAliveIntervalMs: 30000,
// ✅ Retry automatique des messages
retryRequestDelayMs: 2000,
getMessage: async (key) => {
if (store) {
const msg = await store.loadMessage(key.remoteJid, key.id, undefined)
return msg?.message || undefined
}
}
})

  if (pairingCode && !Xuu.authState.creds.registered) {
  console.log(chalk.red(Keren))
    const isVerified = await verifyPhoneNumber()
    if (isVerified) {
      await connectPhoneNumber(Xuu)
    } else {
      console.log(chalk.red.bold('Échec de vérification du numéro, arrêt...'))
      return
    }
  }
	
Xuu.ev.on('creds.update', await saveCreds)

Xuu.ev.on('connection.update', async (update) => {
const { connection, lastDisconnect, receivedPendingNotifications } = update
if (connection === 'close') {
const reason = new Boom(lastDisconnect?.error)?.output.statusCode
reconnectCount++;
console.log(chalk.yellow(`🔄 Tentative de reconnexion ${reconnectCount}/${MAX_RECONNECT} - Raison: ${reason}`))

if (reason === DisconnectReason.loggedOut) {
  // ✅ Déconnecté par WhatsApp = supprimer session et redemander scan
  console.log(chalk.red('🚫 Déconnecté par WhatsApp. Suppression session...'));
  exec('rm -rf ./session/*')
  setTimeout(startingBot, 5000);
} else if (reason === DisconnectReason.badSession) {
  // ✅ CORRIGÉ : bad session = on nettoie et on redémarre proprement
  console.log(chalk.red('🗑️ Session corrompue. Nettoyage en cours...'));
  exec('rm -rf ./session/*')
  setTimeout(startingBot, 5000);
} else if (reason === DisconnectReason.Multidevicemismatch) {
  console.log(chalk.red('📱 Conflit multi-appareils. Nettoyage...'));
  exec('rm -rf ./session/*')
  setTimeout(startingBot, 5000);
} else if ([
  DisconnectReason.connectionLost,
  DisconnectReason.connectionClosed,
  DisconnectReason.restartRequired,
  DisconnectReason.timedOut,
  DisconnectReason.connectionReplaced
].includes(reason)) {
  // ✅ Reconnexion progressive avec délai croissant
  const delay = Math.min(reconnectCount * 3000, 30000);
  console.log(chalk.yellow(`⏳ Reconnexion dans ${delay/1000}s...`));
  setTimeout(startingBot, delay);
} else {
  console.log(chalk.red(`❓ Raison inconnue: ${reason}. Reconnexion...`));
  setTimeout(startingBot, 5000);
}
}

if (connection == 'open') {
reconnectCount = 0; // ✅ Reset du compteur à chaque connexion réussie
terkentod(Xuu)
console.log(`${chalk.blue.bold('🤖 Bot Name  :')} ${chalk.cyan.bold('SEIGNEUR TD')}
${chalk.blue.bold('👤 Developer   :')} ${chalk.green.bold('LE SEIGNEUR DES APPAREILS')}
${chalk.blue.bold('✅ Status    :')} ${chalk.yellow.bold('On')}`)
randomToken(Xuu)

// ✅ KEEP-ALIVE ACTIF - envoie un ping WhatsApp toutes les 2 minutes
// pour éviter que le panel endorme la connexion
setInterval(() => {
  Xuu.sendPresenceUpdate('available').catch(() => {})
}, 120000)

} else if (receivedPendingNotifications == 'true') {
console.log('Veuillez patienter environ 1 minute...')
}})

await store.bind(Xuu.ev)	
await Solving(Xuu, store)
	
Xuu.ev.on('messages.upsert', async (message) => {
await MessagesUpsert(Xuu, message, store);
})

// ✅ ANTIDELETE — Écoute les suppressions de messages
Xuu.ev.on('messages.delete', async (update) => {
    try {
        // Baileys peut envoyer soit update.keys soit un tableau direct
        const keys = update?.keys || (Array.isArray(update) ? update : [])
        if (keys.length > 0) await handleDelete(Xuu, keys)
    } catch(e) { console.log('[DELETE LISTENER]', e.message) }
})

// ✅ ANTIEDIT — Écoute les modifications de messages
Xuu.ev.on('messages.update', async (updates) => {
    try {
        if (updates?.length > 0) await handleEdit(Xuu, updates)
    } catch(e) { console.log('[EDIT LISTENER]', e.message) }
})


Xuu.ev.on('contacts.update', (update) => {
for (let contact of update) {
let id = 
Xuu.decodeJid(contact.id)
if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
}})
	
Xuu.ev.on('group-participants.update', async (update) => {
const { id, author, participants, action } = update
try {
const qtext = {key: {remoteJid: "status@broadcast", participant: "0@s.whatsapp.net"}, message: { "extendedTextMessage": {"text": "[ 𝗚𝗿𝗼𝘂𝗽 𝗡𝗼𝘁𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻 ]"}}}

if (global.db.groups[id] && global.db.groups[id].welcome == true) {
const metadata = await Xuu.groupMetadata(id)
let teks
for(let n of participants) {
let profile;
try {
profile = await Xuu.profilePictureUrl(n, 'image');
} catch {
profile = 'https://telegra.ph/file/95670d63378f7f4210f03.png';
}
if (action == 'add') {
teks = author.split("").length < 1 ? `@${n.split('@')[0]} a rejoint via *lien de groupe*` : author !== n ? `@${author.split("@")[0]} a *ajouté* @${n.split('@')[0]} dans le groupe` : ``
let img = await welcomeBanner(profile, n.split("@")[0], metadata.subject, "welcome")
await Xuu.sendMessage(id, {text: teks, contextInfo: {
mentionedJid: [author, n], 
externalAdReply: {
thumbnail: img, 
title: "B I E N V E N U E 👋", 
body: "", 
sourceUrl: global.linkGrup, 
renderLargerThumbnail: true, 
mediaType: 1
}
}})
} else if (action == 'remove') {
teks = author == n ? `@${n.split('@')[0]} a *quitté* le groupe` : author !== n ? `@${author.split("@")[0]} a *expulsé* @${n.split('@')[0]} du groupe` : ""
let img = await welcomeBanner(profile, n.split("@")[0], metadata.subject, "remove")
await Xuu.sendMessage(id, {text: teks, contextInfo: {
mentionedJid: [author, n], 
externalAdReply: {
thumbnail: img, 
title: "A U   R E V O I R 👋", 
body: "", 
sourceUrl: global.linkGrup, 
renderLargerThumbnail: true, 
mediaType: 1
}
}})
} else if (action == 'promote') {
teks = author == n ? `@${n.split('@')[0]} est devenu *administrateur* du groupe ` : author !== n ? `@${author.split("@")[0]} a *promu* @${n.split('@')[0]} comme *administrateur* du groupe` : ""
let img = await promoteBanner(profile, n.split("@")[0], "promote")
await Xuu.sendMessage(id, {text: teks, contextInfo: {
mentionedJid: [author, n], 
externalAdReply: {
thumbnail: img, 
title: "P R O M O T I O N 📍", 
body: "", 
sourceUrl: global.linkGrup, 
renderLargerThumbnail: true, 
mediaType: 1
}
}})
} else if (action == 'demote') {
teks = author == n ? `@${n.split('@')[0]} n'est plus *administrateur*` : author !== n ? `@${author.split("@")[0]} a *rétrogradé* @${n.split('@')[0]} comme *administrateur* du groupe` : ""
let img = await promoteBanner(profile, n.split("@")[0], "demote")
await Xuu.sendMessage(id, {text: teks, contextInfo: {
mentionedJid: [author, n], 
externalAdReply: {
thumbnail: img, 
title: "R É T R O G R A D E 📍", 
body: "", 
sourceUrl: global.linkGrup, 
renderLargerThumbnail: true, 
mediaType: 1
}
}})
}}}
} catch (e) {
}
})

return Xuu

} catch(err) {
  console.log(chalk.red('❌ Erreur au démarrage:'), err.message)
  setTimeout(startingBot, 5000)
}

}


startingBot()

let file = require.resolve(__filename)
fs.watchFile(file, () => {
	fs.unwatchFile(file)
	console.log(chalk.redBright(`Update ${__filename}`))
	delete require.cache[file]
	require(file)
});
