if (cmd.startsWith(".tostatus")) {
  const statusText = body.replace(/^\.tostatus\s*/i, "").trim()
  const ctxInfo = msg.message?.extendedTextMessage?.contextInfo
  const quotedMsg = ctxInfo?.quotedMessage
  const ownImg = msg.message?.imageMessage
  const ownVideo = msg.message?.videoMessage
  const ownAudio = msg.message?.audioMessage
  const ownVoice = msg.message?.audioMessage?.ptt ? msg.message.audioMessage : null
  
  const quotedImg = quotedMsg?.imageMessage
  const quotedVideo = quotedMsg?.videoMessage
  const quotedAudio = quotedMsg?.audioMessage
  const quotedVoice = quotedMsg?.audioMessage?.ptt ? quotedMsg.audioMessage : null

  const { downloadContentFromMessage } = require("@whiskeysockets/baileys")

  const streamToBuffer = async (mediaObj, type) => {
    const stream = await downloadContentFromMessage(mediaObj, type)
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    return Buffer.concat(chunks)
  }

  // 🖼️ IMAGE STATUS
  if (ownImg || quotedImg) {
    try {
      const buffer = await streamToBuffer(ownImg || quotedImg, "image")
      const statusJidList = await getStatusJidList(sock, msg)
      await sock.sendMessage("status@broadcast", {
        image: buffer,
        caption: statusText || "",
        backgroundColor: "#000000",
        font: 0
      }, { statusJidList })
      return sendStatusConfirmation(sock, jid, msg, "🖼️ Image", statusJidList.length, statusText)
    } catch (e) { return sock.sendMessage(jid, { text: `❌ Status failed: ${e.message}` }, { quoted: msg }) }
  }

  // 🎬 VIDEO STATUS
  if (ownVideo || quotedVideo) {
    try {
      const buffer = await streamToBuffer(ownVideo || quotedVideo, "video")
      const statusJidList = await getStatusJidList(sock, msg)
      await sock.sendMessage("status@broadcast", {
        video: buffer,
        caption: statusText || "",
        mimetype: "video/mp4"
      }, { statusJidList })
      return sendStatusConfirmation(sock, jid, msg, "🎬 Video", statusJidList.length, statusText)
    } catch (e) { return sock.sendMessage(jid, { text: `❌ Status failed: ${e.message}` }, { quoted: msg }) }
  }

  // 🎙️ VOICE NOTE (PTT) STATUS
  if (ownVoice || quotedVoice) {
    try {
      const buffer = await streamToBuffer(ownVoice || quotedVoice, "audio")
      const statusJidList = await getStatusJidList(sock, msg)
      await sock.sendMessage("status@broadcast", {
        audio: buffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true
      }, { statusJidList })
      return sendStatusConfirmation(sock, jid, msg, "🎙️ Voice Note", statusJidList.length, "")
    } catch (e) { return sock.sendMessage(jid, { text: `❌ Status failed: ${e.message}` }, { quoted: msg }) }
  }

  // 🔊 AUDIO FILE STATUS
  if (ownAudio || quotedAudio) {
    // Vérifier que ce n'est pas une note vocale (ptt = false)
    if ((ownAudio && !ownAudio.ptt) || (quotedAudio && !quotedAudio.ptt)) {
      try {
        const audioObj = ownAudio || quotedAudio
        const buffer = await streamToBuffer(audioObj, "audio")
        const statusJidList = await getStatusJidList(sock, msg)
        await sock.sendMessage("status@broadcast", {
          audio: buffer,
          mimetype: audioObj.mimetype || "audio/mpeg"
        }, { statusJidList })
        return sendStatusConfirmation(sock, jid, msg, "🔊 Audio", statusJidList.length, "")
      } catch (e) { return sock.sendMessage(jid, { text: `❌ Status failed: ${e.message}` }, { quoted: msg }) }
    }
  }

  // 📝 TEXT STATUS
  if (!statusText) return sock.sendMessage(jid, { text: `Usage: ${prefix}tostatus <text>\nOr reply to:\n  • 🖼️  Image\n  • 🎬 Video\n  • 🎙️  Voice Note\n  • 🔊 Audio File` }, { quoted: msg })
  try {
    const statusJidList = await getStatusJidList(sock, msg)
    if (statusJidList.length === 0) {
      return sock.sendMessage(jid, { text: `❌ statusJidList is empty — no contacts to broadcast to.` }, { quoted: msg })
    }
    await sock.sendMessage("status@broadcast", {
      text: statusText,
      backgroundColor: "#000000",
      font: 0
    }, { statusJidList })
    return sendStatusConfirmation(sock, jid, msg, "📝 Text", statusJidList.length, statusText)
  } catch (e) { return sock.sendMessage(jid, { text: `❌ Status failed: ${e.message}` }, { quoted: msg }) }
}
