if (cmd.startsWith(".gcstatus")) {
  try {
    const {
      generateWAMessageFromContent,
      prepareWAMessageMedia,
      proto
    } = require("@whiskeysockets/baileys")

    const COLORS = {
      green:  0xFF25D366, red: 0xFFFF0000, blue: 0xFF0000FF, yellow: 0xFFFFFF00,
      purple: 0xFF800080, black: 0xFF000000, white: 0xFFFFFFFF, orange: 0xFFFFA500
    }

    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    const quotedImg = quotedMsg?.imageMessage
    const quotedVideo = quotedMsg?.videoMessage
    const quotedAudio = quotedMsg?.audioMessage
    const quotedVoice = quotedMsg?.audioMessage?.ptt ? quotedMsg.audioMessage : null
    const hasQuotedMedia = !!(quotedImg || quotedVideo || quotedAudio || quotedVoice)

    const raw = body.replace(/^\.gcstatus\s*/i, "").trim()
    const isGroupChat = jid.endsWith("@g.us")

    let groupId, messageText, chosenColor = null

    if (!isGroupChat) {
      // DM usage — format: .gcstatus 123@g.us, texte, couleur
      if (hasQuotedMedia) {
        if (!raw) return sock.sendMessage(jid, { text: `Usage (reply to media):\n${prefix}gcstatus <groupJid>\n\nExample:\n${prefix}gcstatus 123456789-123456@g.us` }, { quoted: msg })
        groupId = raw.split(",")[0].trim()
      } else {
        if (!raw) return sock.sendMessage(jid, { text: `Usage (text status):\n${prefix}gcstatus <groupJid>, <texte>, [couleur]\n\nExample:\n${prefix}gcstatus 123456789-123456@g.us, Bonjour!, noir\n\nCouleurs: ${Object.keys(COLORS).join(", ")}` }, { quoted: msg })
        const parts = raw.split(",").map(p => p.trim())
        if (parts.length < 2) return sock.sendMessage(jid, { text: `Fournissez au moins le JID du groupe et le texte.\n\nExample:\n${prefix}gcstatus 123456789-123456@g.us, Bonjour!` }, { quoted: msg })
        groupId = parts[0]
        messageText = parts[1]
        if (parts[2] && COLORS[parts[2].toLowerCase()]) chosenColor = COLORS[parts[2].toLowerCase()]
      }
      if (!groupId.endsWith("@g.us")) return sock.sendMessage(jid, { text: "❌ Le JID doit se terminer par @g.us\n\nFormat: 123456789-123456@g.us" }, { quoted: msg })
    } else {
      // Utilisé DANS le groupe
      groupId = jid
      messageText = raw
      
      // Format avec couleur: "Texte, couleur"
      if (messageText.includes(",")) {
        const parts = messageText.split(",").map(p => p.trim())
        messageText = parts[0]
        if (parts[1] && COLORS[parts[1].toLowerCase()]) chosenColor = COLORS[parts[1].toLowerCase()]
      }
    }

    if (!hasQuotedMedia && !messageText) {
      return sock.sendMessage(jid, { text: `Usage:\n\n📝 Texte: ${prefix}gcstatus Bonjour!\n📝 Texte + couleur: ${prefix}gcstatus Bonjour!, rouge\n\n📷 Média: Répondez avec ${prefix}gcstatus\n\nCouleurs: ${Object.keys(COLORS).join(", ")}` }, { quoted: msg })
    }

    let messagePayload = {}

    // MEDIA STATUS (Image, Vidéo, Audio, Voice)
    if (hasQuotedMedia) {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys")

      const bufferFromMedia = async (content, type) => {
        const stream = await downloadContentFromMessage(content, type)
        const chunks = []
        for await (const chunk of stream) chunks.push(chunk)
        return Buffer.concat(chunks)
      }

      let buffer
      let mediaType = null
      if (quotedImg) { 
        buffer = await bufferFromMedia(quotedImg, "image")
        mediaType = "image"
      } else if (quotedVideo) { 
        buffer = await bufferFromMedia(quotedVideo, "video")
        mediaType = "video"
      } else if (quotedAudio || quotedVoice) { 
        buffer = await bufferFromMedia(quotedAudio || quotedVoice, "audio")
        mediaType = "audio"
      }

      if (!buffer || buffer.length === 0) {
        return sock.sendMessage(jid, { text: "❌ Erreur: Le média n'a pas pu être téléchargé. Essayez de transférer le média et de le citer à nouveau." }, { quoted: msg })
      }

      if (typeof sock.waUploadToServer !== "function") {
        return sock.sendMessage(jid, { text: "❌ Erreur: sock.waUploadToServer n'est pas disponible. Version de Baileys incompatible." }, { quoted: msg })
      }

      let mediaOptions = {}
      if (quotedImg) mediaOptions = { image: buffer, caption: quotedImg.caption || "" }
      else if (quotedVideo) mediaOptions = { video: buffer, caption: quotedVideo.caption || "" }
      else if (quotedAudio) {
        mediaOptions = { 
          audio: buffer, 
          mimetype: quotedAudio.mimetype || "audio/mpeg",
          ptt: quotedAudio.ptt || false,
          seconds: quotedAudio.seconds
        }
      }

      const preparedMedia = await prepareWAMessageMedia(mediaOptions, { upload: sock.waUploadToServer })

      let mediaMessage = {}
      if (quotedImg) mediaMessage = { imageMessage: preparedMedia.imageMessage }
      else if (quotedVideo) mediaMessage = { videoMessage: preparedMedia.videoMessage }
      else if (quotedAudio) mediaMessage = { audioMessage: preparedMedia.audioMessage }

      const uploaded = mediaMessage.imageMessage || mediaMessage.videoMessage || mediaMessage.audioMessage
      console.log(`[gcstatus] Type: ${mediaType} | Buffer: ${buffer.length} bytes | URL: ${uploaded?.url || "none"} | Path: ${uploaded?.directPath || "none"}`)

      if (!uploaded?.url && !uploaded?.directPath) {
        return sock.sendMessage(jid, {
          text: `❌ Erreur: Upload échoué. Le média n'a pas atteint les serveurs WhatsApp.`
        }, { quoted: msg })
      }

      messagePayload = { groupStatusMessageV2: { message: mediaMessage } }
    } else {
      // TEXT STATUS
      const bgColor = chosenColor ?? (() => {
        const randomHex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")
        return 0xff000000 + parseInt(randomHex, 16)
      })()

      messagePayload = {
        groupStatusMessageV2: {
          message: {
            extendedTextMessage: { text: messageText, backgroundArgb: bgColor, font: 2 }
          }
        }
      }
    }

    const waMsg = generateWAMessageFromContent(groupId, proto.Message.fromObject(messagePayload), { userJid: sock.user.id })
    let mediaTypeAttr = null
    if (hasQuotedMedia) {
      if (quotedImg) mediaTypeAttr = "image"
      else if (quotedVideo) mediaTypeAttr = "video"
      else if (quotedAudio || quotedVoice) mediaTypeAttr = "audio"
    }

    await sock.relayMessage(groupId, waMsg.message, {
      messageId: waMsg.key.id,
      ...(mediaTypeAttr ? { additionalAttributes: { mediatype: mediaTypeAttr } } : {})
    })

    const mediaLabel = hasQuotedMedia ? (quotedImg ? "📷 Image" : quotedVideo ? "🎬 Vidéo" : "🔊 Audio") : "📝 Texte"
    return sock.sendMessage(jid, { text: `✅ Statut de groupe posté! (${mediaLabel})` }, { quoted: msg })

  } catch (e) {
    console.error("[gcstatus] Erreur:", e)
    return sock.sendMessage(jid, { text: `❌ Erreur: ${e.message}` }, { quoted: msg })
  }
}
