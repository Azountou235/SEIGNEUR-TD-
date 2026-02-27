/*

  !- Bot SEIGNEUR TD
  Personnalisé pour LE SEIGNEUR DES APPAREILS 🇷🇴
  
*/

const fs = require('fs');
const chalk = require('chalk');
const { version } = require("./package.json")

//~~~~~~~~ [Paramètres du Bot] ~~~~~~~~~//
global.owner = '23591234568'
global.versi = "V12"
global.namaOwner = "LE SEIGNEUR DES APPAREILS 🇷🇴"
global.packname = 'BOT WHATSAPP'
global.botname = 'SEIGNEUR TD'
global.botname2 = 'SEIGNEUR TD'

//~~~~~~~~~~~ [Liens] ~~~~~~~~~~//
global.linkOwner = "https://wa.me/23591234568"
global.linkWebsite = "https://wa.me/23591234568"
global.linkGrup = "https://chat.whatsapp.com/KfbEkfcbepR0DPXuewOrur"
global.linkTelegram = "https://t.me/seigneur_235"

//~~~~~~~~~~~ Délais ~~~~~~~~~~//
global.delayJpm = 10000
global.delayPushkontak = 10000

//~~~~~~~~ [Paramètres Chaîne WA] ~~~~~~~~//
global.linkSaluran = "https://whatsapp.com/channel/0029VbBZrLBFMqrQIDpcfO04"
global.idSaluran = "120363404981805393@newsletter"
global.namaSaluran = "SEIGNEUR TD"

//~~~~~~~ [Paramètres Paiement] ~~~~~~~~//
global.dana = ""
global.ovo = ""
global.gopay = ""

//~~~~~~~~ [Paramètres API] ~~~~~~~~~//
global.apiSimpleBot = "primexuu"

//~~~~~~~~ [Paramètres Événements] ~~~~~~~~//
global.owneroff = false
global.owneron = true
global.anticall = false
global.welcome = true
global.autopromosi = false
global.autoreadsw = false

//~~~~~~~~ [Images du Bot] ~~~~~~~~//
global.image = {
menu: "https://files.catbox.moe/1c7j4s.jpg",
menu2: "https://files.catbox.moe/1c7j4s.jpg",
menu3: "https://files.catbox.moe/1c7j4s.jpg",
reply: "https://files.catbox.moe/1c7j4s.jpg",
logo: "https://files.catbox.moe/1c7j4s.jpg",
qris: "https://files.catbox.moe/1c7j4s.jpg"
}

//~~~~~~ Messages d'erreur ~~~~~~//
global.mess = {
	owner: "*[ Erreur 403 ]*\nCette fonctionnalité est réservée au propriétaire du bot !",
	admin: "*[ Erreur 403 ]*\nCette fonctionnalité est réservée aux administrateurs du groupe !",
	botAdmin: "*[ Erreur 403 ]*\nCette fonctionnalité nécessite que le bot soit administrateur !",
	group: "*[ Erreur 403 ]*\nCette fonctionnalité est uniquement disponible dans les groupes !",
	private: "*[ Erreur 403 ]*\nCette fonctionnalité est uniquement disponible en message privé !",
	prem: "*[ Erreur 403 ]*\nCette fonctionnalité est réservée aux utilisateurs premium !",
	wait: 'Chargement en cours...',
	error: 'Erreur !',
	done: 'Terminé ✅'
}

let file = require.resolve(__filename)
fs.watchFile(file, () => {
	fs.unwatchFile(file)
	console.log(chalk.redBright(`Mise à jour ${__filename}`))
	delete require.cache[file]
	require(file)
})
