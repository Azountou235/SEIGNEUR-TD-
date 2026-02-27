/*

  !- Credits By PRIME XUU
  https://wa.me/6283821190464
  
*/

require('./settings');
const fs = require('fs');
const pino = require('pino');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const readline = require('readline');
const FileType = require('file-type');
const { exec } = require('child_process');
const { say } = require('cfonts')
const { Boom } = require('@hapi/boom');
const { verifyPassword, verifyPhoneNumber, connectPhoneNumber, terkentod } = require('./source/pass');

const { default: WAConnection, generateWAMessageFromContent, 
prepareWAMessageMedia, useMultiFileAuthState, Browsers, DisconnectReason, makeInMemoryStore, makeCacheableSignalKeyStore, fetchLatestWaWebVersion, proto, PHONENUMBER_MCC, getAggregateVotesInPollMessage } = require('@whiskeysockets/baileys');

const pairingCode = true
const url = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text) => new Promise((resolve) => rl.question(text, resolve))

let Keren = `\n\n╭━━━━━━━━━━━━━━━━━━━━━━━╮\n┃  SEIGNEUR TD - BOT WA  ┃\n┃  Par : LE SEIGNEUR DES APPAREILS 🇷🇴  ┃\n╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\nɴᴏᴍ ᴅᴜ ʙᴏᴛ : SEIGNEUR TD\nᴘʀᴏᴘʀɪéᴛᴀɪʀᴇ : LE SEIGNEUR DES APPAREILS 🇷🇴\nᴠᴇʀsɪᴏɴ : V12\n=============================\n`
const DataBase = require('./source/database');
const { randomToken } = require('./library/scraper');
const database = new DataBase();
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
const { isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, await, sleep } = require('./library/function');
const { welcomeBanner, promoteBanner } = require("./library/welcome.js")

async function startingBot() {
//await verifyPassword()
const store = await makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })
const { state, saveCreds } = await useMultiFileAuthState('session');
	
const Xuu = await WAConnection({
version: (await (await fetch('https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json')).json()).version,
browser: ['Ubuntu', 'Safari', '18.1'],
printQRInTerminal: !pairingCode, 
logger: pino({ level: "silent" }),
auth: state,
generateHighQualityLinkPreview: true,     
getMessage: async (key) => {
if (store) {
const msg = await store.loadMessage(key.remoteJid, key.id, undefined)
return msg?.message || undefined
}
/*return {
conversation: 'AXONIC 9.0 By XUUDev'
}*/}})

  if (pairingCode && !Xuu.authState.creds.registered) {
  console.log(chalk.red(Keren))
    const isVerified = await verifyPhoneNumber() //jngn di hps biar g error
    if (isVerified) {
      await connectPhoneNumber(Xuu)
    } else {
      console.log(chalk.red.bold('Gagal memverifikasi nomor, hentikan proses...'))
      return
    }
  }
	
Xuu.ev.on('creds.update', await saveCreds)

Xuu.ev.on('connection.update', async (update) => {
const { connection, lastDisconnect, receivedPendingNotifications } = update
if (connection === 'close') {
const reason = new Boom(lastDisconnect?.error)?.output.statusCode
if (reason === DisconnectReason.connectionLost) {
console.log('Connexion perdue, tentative de reconnexion...');
startingBot()
} else if (reason === DisconnectReason.connectionClosed) {
console.log('Connexion fermée, tentative de reconnexion...');
startingBot()
} else if (reason === DisconnectReason.restartRequired) {
console.log('Redémarrage requis...');
startingBot()
} else if (reason === DisconnectReason.timedOut) {
console.log('Délai dépassé, tentative de reconnexion...');
startingBot()
} else if (reason === DisconnectReason.badSession) {
console.log('Supprimez la session et scannez à nouveau...');
startingBot()
} else if (reason === DisconnectReason.connectionReplaced) {
console.log("Fermez la session actuelle d'abord...");
startingBot()
} else if (reason === DisconnectReason.loggedOut) {
console.log('Scannez à nouveau et relancez...');
exec('rm -rf ./session/*')
process.exit(1)
} else if (reason === DisconnectReason.Multidevicemismatch) {
console.log('Scannez à nouveau...');
exec('rm -rf ./session/*')
process.exit(0)
} else {		
Xuu.end(`Unknown DisconnectReason : ${reason}|${connection}`)
}}
if (connection == 'open') {
terkentod(Xuu)
// Message de connexion désactivé (géré dans PRIMEXUU.js)
console.log(`${chalk.blue.bold('🤖 Bot Name  :')} ${chalk.cyan.bold('SEIGNEUR TD')}
${chalk.blue.bold('👤 Developer   :')} ${chalk.green.bold('LE SEIGNEUR DES APPAREILS')}
${chalk.blue.bold('✅ Status    :')} ${chalk.yellow.bold('On')}`)
randomToken(Xuu)    
} else if (receivedPendingNotifications == 'true') {
console.log('Veuillez patienter environ 1 minute...')
}})

await store.bind(Xuu.ev)	
await Solving(Xuu, store)
	
Xuu.ev.on('messages.upsert', async (message) => {
await MessagesUpsert(Xuu, message, store);
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

}


startingBot()

let file = require.resolve(__filename)
fs.watchFile(file, () => {
	fs.unwatchFile(file)
	console.log(chalk.redBright(`Update ${__filename}`))
	delete require.cache[file]
	require(file)
});