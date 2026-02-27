/*

  !- Credits By PRIME XUU
  https://wa.me/6281388691442
  
*/

const canvafy = require("canvafy")

async function welcomeBanner(avatar, name, subject, type) {
    const title = name
    const desc = (type == "welcome" ? "Bienvenue dans " : "A quitté le groupe ") + subject
    const background = "https://img101.pixhost.to/images/642/557922982_skyzopedia.jpg"
    const welcome = await new canvafy.WelcomeLeave()
    .setAvatar(avatar)
    .setBackground("image", background)
    .setTitle(title.length > 20 ? (title.substring(0, 16) + "..") : title)
    .setDescription(desc.length > 70 ? (desc.substring(0, 65) + "..") : desc)
    .setBorder("#2a2e35")
    .setAvatarBorder("#2a2e35")
    .setOverlayOpacity(0.1)
    .build()
    return welcome
}

async function promoteBanner(avatar, name, type) {
    const title = name
    const desc = type == "promote" ? "Est devenu administrateur" : "N'est plus administrateur"
    const background = "https://img101.pixhost.to/images/642/557922982_skyzopedia.jpg"
    const welcome = await new canvafy.WelcomeLeave()
    .setAvatar(avatar)
    .setBackground("image", background)
    .setTitle(title.length > 20 ? (title.substring(0, 16) + "..") : title)
    .setDescription(desc.length > 70 ? (desc.substring(0, 65) + "..") : desc)
    .setBorder("#2a2e35")
    .setAvatarBorder("#2a2e35")
    .setOverlayOpacity(0.1)
    .build()
    return welcome
}

module.exports = { welcomeBanner, promoteBanner }
      
