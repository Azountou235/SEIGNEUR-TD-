// commands/gcstatus.js
async function handleGcStatus(sock, msg, cmd, body, jid, prefix) {
  if (!cmd.startsWith(".gcstatus")) return;

  try {
    const COLORS = {
      green:  0xFF25D366, red: 0xFFFF0000, blue: 0xFF0000FF, yellow: 0xFFFFFF00,
      purple: 0xFF800080, black: 0xFF000000, white: 0xFFFFFFFF, orange: 0xFFFFA500
    };

    const quotedMsg = require("../statusEvents").unwrapStatusMessage(
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    );
    const quotedImg   = quotedMsg?.imageMessage;
    const quotedVideo = quotedMsg?.videoMessage;
    const quotedAudio = quotedMsg?.audioMessage;
    const hasQuotedMedia = !!(quotedImg || quotedVideo || quotedAudio);

    const raw = (body || "").replace(/^\.gcstatus\s*/i, "").trim();
    const isGroupChat = jid.endsWith("@g.us");

    let groupId, messageText, chosenColor = null;

    if (!isGroupChat) {
      if (hasQuotedMedia) {
        if (!raw) return sock.sendMessage(jid, { text: `Provide the group JID.\nUsage: ${prefix}gcstatus <groupJid>  (reply to media)` }, { quoted: msg });
        groupId = raw;
      } else {
        if (!raw) return sock.sendMessage(jid, { text: `Usage: ${prefix}gcstatus <groupJid>,<text>[,color]\nColors: ${Object.keys(COLORS).join(", ")}` }, { quoted: msg });
        const parts = raw.split(",").map(p => p.trim());
        if (parts.length < 2) return sock.sendMessage(jid, { text: `Provide at least group JID and text.` }, { quoted: msg });
        groupId     = parts[0];
        messageText = parts[1];
        if (parts[2] && COLORS[parts[2].toLowerCase()]) chosenColor = COLORS[parts[2].toLowerCase()];
      }
      if (!groupId.endsWith("@g.us")) return sock.sendMessage(jid, { text: "❌ Invalid group JID." }, { quoted: msg });
    } else {
      groupId = jid;
      messageText = raw;
    }

    if (!hasQuotedMedia && !messageText) {
      return sock.sendMessage(jid, { text: `Reply to media or provide text.` }, { quoted: msg });
    }

    if (typeof sock.sendGroupStatus !== "function") {
      return sock.sendMessage(jid, { text: "❌ sendGroupStatus() manquant. Installe @nyxcore/nyxcoresocket@0.3.1." }, { quoted: msg });
    }

    if (hasQuotedMedia) {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const bufferFromMedia = async (content, type) => {
        const stream = await downloadContentFromMessage(content, type);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks);
      };

      let buffer;
      if (quotedImg)        buffer = await bufferFromMedia(quotedImg, "image");
      else if (quotedVideo) buffer = await bufferFromMedia(quotedVideo, "video");
      else if (quotedAudio) buffer = await bufferFromMedia(quotedAudio, "audio");

      if (!buffer || buffer.length === 0) {
        return sock.sendMessage(jid, { text: "❌ Media buffer vide." }, { quoted: msg });
      }

      let mediaOptions = {};
      if (quotedImg)        mediaOptions = { image: buffer, caption: quotedImg.caption || "" };
      else if (quotedVideo) mediaOptions = { video: buffer, caption: quotedVideo.caption || "" };
      else if (quotedAudio) {
        const videoBuffer = await require("../statusEvents").audioToStatusVideo(buffer);
        mediaOptions = { video: videoBuffer, mimetype: "video/mp4", caption: quotedAudio.caption || "" };
      }

      await sock.sendGroupStatus(groupId, mediaOptions);
      return sock.sendMessage(jid, { text: "✅ Group status send request sent (media)." }, { quoted: msg });
    } else {
      if (isGroupChat && messageText.includes(",")) {
        const parts = messageText.split(",").map(p => p.trim());
        messageText = parts[0];
        if (parts[1] && COLORS[parts[1].toLowerCase()]) chosenColor = COLORS[parts[1].toLowerCase()];
      }

      const bgColor = chosenColor ?? (() => {
        const randomHex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
        return 0xff000000 + parseInt(randomHex, 16);
      })();

      await sock.sendGroupStatus(groupId, { text: messageText }, { backgroundColor: bgColor, font: 2 });
      return sock.sendMessage(jid, { text: "✅ Group status send request sent (text)." }, { quoted: msg });
    }

  } catch (e) {
    console.error("[gcstatus] error:", e);
    return sock.sendMessage(jid, { text: `❌ gcstatus failed: ${e.message}` }, { quoted: msg });
  }
}

module.exports = { handleGcStatus };
