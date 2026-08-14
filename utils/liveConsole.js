/**
 * utils/liveConsole.js
 *
 * Affiche un encart coloré dans la console (visible en direct dans le
 * terminal Pterodactyl) pour chaque message reçu, façon "dashboard temps
 * réel". Purement cosmétique — n'affecte jamais le traitement du message.
 */

const chalk = require('chalk');
const config = require('../config/config');
const settingsStore = require('../utils/settingsStore');

// Types de contenu WhatsApp les plus courants -> libellé lisible.
const TYPE_LABELS = {
  conversation: 'text',
  extendedTextMessage: 'extendedText',
  imageMessage: 'image',
  videoMessage: 'video',
  audioMessage: 'audio',
  stickerMessage: 'sticker',
  documentMessage: 'document',
  contactMessage: 'contact',
  locationMessage: 'location',
  protocolMessage: 'protocolMessage',
  reactionMessage: 'reaction',
  pollCreationMessage: 'poll',
  viewOnceMessage: 'viewOnce',
  viewOnceMessageV2: 'viewOnce',
};

function getMessageType(message) {
  if (!message) return 'unknown';
  const key = Object.keys(message)[0];
  return TYPE_LABELS[key] || key || 'unknown';
}

function getMessageText(message) {
  if (!message) return 'No Text';
  const text =
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    '';
  return text ? text.trim() : 'No Text';
}

function formatSender(jid) {
  if (!jid) return 'Unknown';
  return jid.split('@')[0];
}

async function getGroupLabel(sock, chatJid) {
  if (!chatJid) return 'Unknown';
  if (chatJid === 'status@broadcast') return 'Status';
  if (!chatJid.endsWith('@g.us')) return 'Private Chat';

  try {
    const { groupCache } = require('./groupCache');
    const cached = groupCache.get(chatJid);
    if (cached?.subject) return cached.subject;

    const metadata = await sock.groupMetadata(chatJid);
    return metadata?.subject || chatJid;
  } catch (_) {
    return chatJid;
  }
}

function line(color, label, value) {
  return chalk[color](`★ ${label}: `) + chalk.white(value);
}

/**
 * Affiche l'encart pour un message entrant. À appeler une fois par message,
 * dès qu'il arrive — avant tout filtrage (préfixe, fromMe, etc.) pour
 * refléter fidèlement ce qui se passe en direct sur le bot.
 */
async function logIncomingMessage(sock, msg) {
  try {
    const chatJid = msg.key.remoteJid;
    const senderJid = msg.key.participant || chatJid;
    const msgType = getMessageType(msg.message);
    const text = getMessageText(msg.message);
    const groupLabel = await getGroupLabel(sock, chatJid);

    const tz = settingsStore.get('timezone', config.timezone);
    const now = new Date();
    const sentTime = now.toLocaleTimeString('fr-FR', { timeZone: tz, hour12: false });
    const dateStr = now.toLocaleDateString('fr-FR', { timeZone: tz });

    const colors = ['magenta', 'blue', 'cyan', 'green', 'yellow', 'red'];
    const barColor = colors[Math.floor(Math.random() * colors.length)];

    const bar = chalk[barColor]('─'.repeat(70));
    const title = chalk[barColor].bold(`⚡ TOUMAÏ-MD ⚡`);

    console.log(bar);
    console.log(`   ${title}`);
    console.log(line('yellow', 'Sent Time', `${sentTime} (${tz})`));
    console.log(line('yellow', 'Date', dateStr));
    console.log(line('cyan', 'Msg Type', msgType));
    console.log(line('green', 'Sender', formatSender(senderJid)));
    console.log(line('magenta', 'Chat ID', chatJid));
    console.log(line('blue', 'Group', groupLabel));
    console.log(line('white', 'Message', text));
    console.log(bar);
  } catch (error) {
    // Purement cosmétique : une erreur ici ne doit jamais casser le
    // traitement réel du message.
    console.error(`[liveConsole] ${error.message}`);
  }
}

module.exports = { logIncomingMessage };
