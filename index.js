import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  delay,
  downloadContentFromMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import readline from 'readline';

// ============================================================
// CONFIGURATION
// ============================================================
const config = {
  botName:       'SEIGNEUR TD',
  prefix:        '.',
  sessionFolder: './auth_info_baileys',
  usePairingCode: true,
  phoneNumber:   ''
};

const SUPER_ADMIN = '23591234568';
const OWNER_JID   = SUPER_ADMIN + '@s.whatsapp.net';
const DEV_NAME    = 'LE SEIGNEUR DES APPAREILS';
const GITHUB      = 'https://github.com/Azountou235/SEIGNEUR-TD-.git';

let botMode   = 'public';
let antiDelete = false;
let antiEdit   = false;
let antiLink   = false;
let autoReact  = false;

const startTime    = Date.now();
const messageCache = new Map();

// ============================================================
// UTILITAIRES
// ============================================================

function isSuperAdmin(jid) {
  if (!jid) return false;
  return jid.split(':')[0].split('@')[0] === SUPER_ADMIN;
}

function isAdmin(jid) {
  if (!jid) return false;
  if (isSuperAdmin(jid)) return true;
  if (global._botJid) {
    const botPhone = global._botJid.split(':')[0].split('@')[0];
    if (jid.split(':')[0].split('@')[0] === botPhone) return true;
  }
  return false;
}

async function isGroupAdmin(sock, groupJid, userJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const p    = meta.participants.find(x => x.id.split(':')[0] === userJid.split(':')[0]);
    return p && (p.admin === 'admin' || p.admin === 'superadmin');
  } catch(e) { return false; }
}

function buildUptime() {
  const s   = Math.floor((Date.now() - startTime) / 1000);
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

async function simulateTyping(sock, jid) {
  try { await sock.sendPresenceUpdate('composing', jid); await delay(800); } catch(e) {}
}

async function toBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function sendWithImage(sock, jid, text, mentions = []) {
  try {
    if (fs.existsSync('./menu.jpg')) {
      return await sock.sendMessage(jid, {
        image:    fs.readFileSync('./menu.jpg'),
        caption:  text,
        mentions
      });
    }
  } catch(e) {}
  return await sock.sendMessage(jid, { text, mentions });
}

function getDate() {
  return new Date().toLocaleDateString('fr-FR', {
    timeZone: 'Africa/Ndjamena',
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function getDateTime() {
  return new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Ndjamena' });
}

// ============================================================
// CONNEXION WHATSAPP
// ============================================================
async function connectToWhatsApp() {
  const { version }           = await fetchLatestBaileysVersion();
  const { state, saveCreds }  = await useMultiFileAuthState(config.sessionFolder);

  const sock = makeWASocket({
    version,
    logger:                     pino({ level: 'silent' }),
    auth:                       state,
    printQRInTerminal:          false,
    browser:                    ['SEIGNEUR TD', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: false
  });

  // Pairing code
  if (!state.creds.registered) {
    await delay(2000);
    let phone = config.phoneNumber;
    if (!phone) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      phone = await new Promise(resolve =>
        rl.question('Entrez votre numero (ex: 23591234568): ', ans => {
          rl.close();
          resolve(ans.trim().replace(/\D/g, ''));
        })
      );
    }
    try {
      const code = await sock.requestPairingCode(phone);
      console.log('\n==============================');
      console.log('  CODE PAIRING: ' + code);
      console.log('==============================\n');
    } catch(e) {
      setTimeout(async () => {
        const code = await sock.requestPairingCode(phone);
        console.log('\n  CODE: ' + code + '\n');
      }, 3000);
    }
  }

  sock.ev.on('creds.update', saveCreds);

  // Connexion
  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        await delay(code === 408 ? 10000 : 5000);
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      global._botJid = sock.user.id;
      console.log('SEIGNEUR TD connecte!');
      try {
        await delay(2000);
        await sock.sendMessage(OWNER_JID, {
          text:
`━━━━━━━━━━━━━━━━━━━━━━
       CONNECTED
━━━━━━━━━━━━━━━━━━━━━━
  Prefix   : [ ${config.prefix} ]
  Mode     : ${botMode}
  Platform : Panel
  Bot      : SEIGNEUR TD
  Status   : Active
  Time     : ${getDateTime()}
━━━━━━━━━━━━━━━━━━━━━━

*SEIGNEUR TD EST CONNECTE AVEC SUCCES !*

Pour voir les menus tape *${config.prefix}menu*`
        });
      } catch(e) {}
    }
  });

  // ============================================================
  // RECEPTION DES MESSAGES
  // ============================================================
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;

      const jid    = msg.key.remoteJid;
      if (!jid) continue;

      // Ignorer status broadcast sauf vue auto
      if (jid === 'status@broadcast') {
        try { await sock.readMessages([msg.key]); } catch(e) {}
        continue;
      }

      const isGroup = jid.endsWith('@g.us');
      const sender  = isGroup ? (msg.key.participant || '') : jid;
      const fromMe  = msg.key.fromMe;
      const text    = msg.message?.conversation ||
                      msg.message?.extendedTextMessage?.text ||
                      msg.message?.imageMessage?.caption ||
                      msg.message?.videoMessage?.caption || '';

      // Mise en cache pour anti-delete/edit
      if (!fromMe) {
        messageCache.set(msg.key.id, {
          key: msg.key, message: msg.message,
          sender, text, jid, isGroup,
          name: msg.pushName || sender.split('@')[0],
          time: Date.now()
        });
        if (messageCache.size > 500) {
          messageCache.delete(messageCache.keys().next().value);
        }
      }

      // Bloquer si mode prive et pas admin
      if (botMode === 'private' && !isAdmin(sender) && !fromMe) continue;

      // Commande hello - sauvegarder status
      if (text.trim().toLowerCase() === 'hello' && (isAdmin(sender) || fromMe)) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted) {
          const media = quoted.imageMessage || quoted.videoMessage;
          if (media) {
            try {
              const t      = quoted.imageMessage ? 'image' : 'video';
              const stream = await downloadContentFromMessage(media, t);
              const buf    = await toBuffer(stream);
              if (t === 'image') {
                await sock.sendMessage(OWNER_JID, { image: buf, caption: 'Status sauvegarde' });
              } else {
                await sock.sendMessage(OWNER_JID, { video: buf, caption: 'Status sauvegarde' });
              }
            } catch(e) {}
          }
        }
        continue;
      }

      // Anti-link
      if (isGroup && antiLink && !fromMe) {
        const isUA = await isGroupAdmin(sock, jid, sender);
        if (!isUA && !isAdmin(sender)) {
          const hasLink = /(https?:\/\/|wa\.me|chat\.whatsapp\.com)/i.test(text);
          if (hasLink) {
            try {
              await sock.sendMessage(jid, { delete: msg.key });
              await sock.sendMessage(jid, {
                text:     `@${sender.split('@')[0]} les liens sont interdits ici!`,
                mentions: [sender]
              });
            } catch(e) {}
          }
        }
      }

      // Auto react
      if (autoReact && text) {
        try {
          const emojis = ['✅', '👍', '🔥', '💯', '⚡'];
          await sock.sendMessage(jid, {
            react: { text: emojis[Math.floor(Math.random() * emojis.length)], key: msg.key }
          });
        } catch(e) {}
      }

      // Traitement commandes
      if (text.startsWith(config.prefix)) {
        await handleCommand(sock, msg, text, jid, sender, isGroup, fromMe);
      }
    }
  });

  // Anti-delete
  sock.ev.on('messages.delete', async (item) => {
    if (!antiDelete) return;
    for (const key of (item.keys || [])) {
      if (key.fromMe) continue;
      const cached = messageCache.get(key.id);
      if (!cached) continue;
      try {
        await sock.sendMessage(OWNER_JID, {
          text: `*[ANTI-DELETE]*\nDe: ${cached.name}\nSalon: ${cached.isGroup ? cached.jid : 'Prive'}\n\n${cached.text || '[Media]'}`
        });
      } catch(e) {}
    }
  });

  // Anti-edit
  sock.ev.on('messages.update', async (updates) => {
    if (!antiEdit) return;
    for (const update of updates) {
      if (!update.update?.editedMessage || update.key.fromMe) continue;
      const cached = messageCache.get(update.key.id);
      if (!cached) continue;
      try {
        await sock.sendMessage(OWNER_JID, {
          text: `*[ANTI-EDIT]*\nDe: ${cached.name}\nMessage original: ${cached.text || '[Media]'}`
        });
      } catch(e) {}
    }
  });

  // Anti-call
  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (call.status === 'offer') {
        try {
          await sock.rejectCall(call.id, call.from);
          await sock.sendMessage(call.from, {
            text: "Impossible d'appeler ce numero. Envoyez un message."
          });
        } catch(e) {}
      }
    }
  });

  // Bienvenue / Au revoir
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    for (const p of participants) {
      try {
        if (action === 'add') {
          await sock.sendMessage(id, {
            text:     `Bienvenue @${p.split('@')[0]} dans le groupe!`,
            mentions: [p]
          });
        } else if (action === 'remove') {
          await sock.sendMessage(id, {
            text:     `Au revoir @${p.split('@')[0]}!`,
            mentions: [p]
          });
        }
      } catch(e) {}
    }
  });
}

// ============================================================
// COMMANDES
// ============================================================
async function handleCommand(sock, msg, text, jid, sender, isGroup, fromMe) {
  const args    = text.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const p       = config.prefix;
  const isOwner = isAdmin(sender) || fromMe;
  const name    = msg.pushName || sender.split('@')[0];

  // Reaction sur commande
  try {
    await sock.sendMessage(jid, { react: { text: '⚡', key: msg.key } });
  } catch(e) {}

  await simulateTyping(sock, jid);

  try {
    switch(command) {

      // ════════════════════════════════════════════
      // GENERAL
      // ════════════════════════════════════════════

      case 'menu': {
        const menuText =
`*Bienvenue ${name}* 🇹🇩
*SEIGNEUR TD*

*╭─ DETAILS ─────────────*
*│* Bot    = SEIGNEUR TD
*│* Dev    = ${DEV_NAME}
*│* Owner  = +235 91 23 45 68
*│* Uptime = ${buildUptime()}
*│* Date   = ${getDate()}
*│* Prefix = ${p}
*╰────────────────────────*

┌─[ OWNER ]──────────────
  ${p}mode       - Mode prive/public
  ${p}antidelete - Activer anti-delete
  ${p}antiedit   - Activer anti-edit
  ${p}antilink   - Activer anti-link
  ${p}autoreact  - Reactions auto
  ${p}block      - Bloquer un contact
  ${p}unblock    - Debloquer un contact
└────────────────────────

┌─[ GROUPE ]─────────────
  ${p}kick       - Expulser un membre
  ${p}add        - Ajouter un membre
  ${p}promote    - Promouvoir admin
  ${p}demote     - Retirer admin
  ${p}tagall     - Mentionner tout le monde
  ${p}mute       - Fermer le groupe
  ${p}unmute     - Ouvrir le groupe
  ${p}invite     - Lien d invitation
  ${p}gname      - Changer le nom
  ${p}gdesc      - Changer la description
  ${p}groupinfo  - Infos du groupe
  ${p}leave      - Bot quitte le groupe
└────────────────────────

┌─[ MEDIA ]──────────────
  ${p}sticker    - Creer un sticker
  ${p}vv         - Voir un view once
  ${p}tostatus   - Publier en status
  hello          - Sauvegarder un status
└────────────────────────

┌─[ GENERAL ]────────────
  ${p}ping       - Vitesse du bot
  ${p}alive      - Etat du bot
  ${p}info       - Informations
  ${p}repo       - Lien GitHub
└────────────────────────

*POWERED BY ${DEV_NAME}* 🇹🇩`;

        await sendWithImage(sock, jid, menuText, [sender]);
        break;
      }

      case 'ping': {
        const t = Date.now();
        await sock.sendMessage(jid, { text: '...' });
        await sock.sendMessage(jid, {
          text: `*SEIGNEUR TD - PING*\nLatence : ${Date.now() - t}ms\nUptime  : ${buildUptime()}`
        });
        break;
      }

      case 'alive': {
        await sendWithImage(sock, jid,
`*SEIGNEUR TD EST EN VIE!*

Uptime  : ${buildUptime()}
Mode    : ${botMode}
Dev     : ${DEV_NAME}
Prefix  : ${p}

*POWERED BY ${DEV_NAME}* 🇹🇩`
        );
        break;
      }

      case 'info': {
        await sock.sendMessage(jid, {
          text:
`*INFORMATIONS - SEIGNEUR TD*

Bot          : SEIGNEUR TD
Dev          : ${DEV_NAME}
Owner        : +235 91 23 45 68
Prefix       : ${p}
Mode         : ${botMode}
Anti-Delete  : ${antiDelete ? 'ON' : 'OFF'}
Anti-Edit    : ${antiEdit  ? 'ON' : 'OFF'}
Anti-Link    : ${antiLink  ? 'ON' : 'OFF'}
Auto-React   : ${autoReact ? 'ON' : 'OFF'}
Date         : ${getDateTime()}
GitHub       : ${GITHUB}`
        });
        break;
      }

      case 'repo':
      case 'git':
      case 'github': {
        await sock.sendMessage(jid, {
          text: `*SEIGNEUR TD - GITHUB*\n\n${GITHUB}\n\n*POWERED BY ${DEV_NAME}* 🇹🇩`
        });
        break;
      }

      // ════════════════════════════════════════════
      // OWNER
      // ════════════════════════════════════════════

      case 'mode': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        if (args[0] === 'private') {
          botMode = 'private';
          await sock.sendMessage(jid, { text: 'Mode PRIVE active. Seul le owner peut utiliser le bot.' });
        } else if (args[0] === 'public') {
          botMode = 'public';
          await sock.sendMessage(jid, { text: 'Mode PUBLIC active.' });
        } else {
          await sock.sendMessage(jid, { text: `Mode actuel: ${botMode}\nUsage: ${p}mode private / ${p}mode public` });
        }
        break;
      }

      case 'antidelete':
      case 'antidel': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        antiDelete = !antiDelete;
        await sock.sendMessage(jid, { text: `Anti-Delete: ${antiDelete ? 'ACTIVE' : 'DESACTIVE'}` });
        break;
      }

      case 'antiedit': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        antiEdit = !antiEdit;
        await sock.sendMessage(jid, { text: `Anti-Edit: ${antiEdit ? 'ACTIVE' : 'DESACTIVE'}` });
        break;
      }

      case 'antilink': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        antiLink = !antiLink;
        await sock.sendMessage(jid, { text: `Anti-Link: ${antiLink ? 'ACTIVE' : 'DESACTIVE'}` });
        break;
      }

      case 'autoreact': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        autoReact = !autoReact;
        await sock.sendMessage(jid, { text: `Auto-React: ${autoReact ? 'ACTIVE' : 'DESACTIVE'}` });
        break;
      }

      case 'block': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        const toBlock = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toBlock) { await sock.sendMessage(jid, { text: `Usage: ${p}block @user` }); break; }
        await sock.updateBlockStatus(toBlock, 'block');
        await sock.sendMessage(jid, { text: `@${toBlock.split('@')[0]} bloque.`, mentions: [toBlock] });
        break;
      }

      case 'unblock': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        const toUnblock = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!toUnblock) { await sock.sendMessage(jid, { text: `Usage: ${p}unblock @user` }); break; }
        await sock.updateBlockStatus(toUnblock, 'unblock');
        await sock.sendMessage(jid, { text: `@${toUnblock.split('@')[0]} debloque.`, mentions: [toUnblock] });
        break;
      }

      // ════════════════════════════════════════════
      // GROUPE
      // ════════════════════════════════════════════

      case 'kick': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUA = await isGroupAdmin(sock, jid, sender);
        if (!isUA && !isOwner) { await sock.sendMessage(jid, { text: 'Seuls les admins peuvent utiliser cette commande.' }); break; }
        const toKick = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (!toKick.length) { await sock.sendMessage(jid, { text: `Usage: ${p}kick @user` }); break; }
        await sock.groupParticipantsUpdate(jid, toKick, 'remove');
        await sock.sendMessage(jid, { text: `@${toKick[0].split('@')[0]} expulse.`, mentions: toKick });
        break;
      }

      case 'add': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUA2 = await isGroupAdmin(sock, jid, sender);
        if (!isUA2 && !isOwner) { await sock.sendMessage(jid, { text: 'Seuls les admins peuvent utiliser cette commande.' }); break; }
        if (!args[0]) { await sock.sendMessage(jid, { text: `Usage: ${p}add 23591234568` }); break; }
        const toAdd = args[0].replace(/\D/g, '') + '@s.whatsapp.net';
        await sock.groupParticipantsUpdate(jid, [toAdd], 'add');
        await sock.sendMessage(jid, { text: `@${toAdd.split('@')[0]} ajoute.`, mentions: [toAdd] });
        break;
      }

      case 'promote': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUP = await isGroupAdmin(sock, jid, sender);
        if (!isUP && !isOwner) { await sock.sendMessage(jid, { text: 'Seuls les admins peuvent utiliser cette commande.' }); break; }
        const toPro = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (!toPro.length) { await sock.sendMessage(jid, { text: `Usage: ${p}promote @user` }); break; }
        await sock.groupParticipantsUpdate(jid, toPro, 'promote');
        await sock.sendMessage(jid, { text: `@${toPro[0].split('@')[0]} est maintenant admin.`, mentions: toPro });
        break;
      }

      case 'demote': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUD = await isGroupAdmin(sock, jid, sender);
        if (!isUD && !isOwner) { await sock.sendMessage(jid, { text: 'Seuls les admins peuvent utiliser cette commande.' }); break; }
        const toDem = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (!toDem.length) { await sock.sendMessage(jid, { text: `Usage: ${p}demote @user` }); break; }
        await sock.groupParticipantsUpdate(jid, toDem, 'demote');
        await sock.sendMessage(jid, { text: `@${toDem[0].split('@')[0]} n est plus admin.`, mentions: toDem });
        break;
      }

      case 'tagall':
      case 'hidetag': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUT = await isGroupAdmin(sock, jid, sender);
        if (!isUT && !isOwner) { await sock.sendMessage(jid, { text: 'Seuls les admins peuvent utiliser cette commande.' }); break; }
        const meta = await sock.groupMetadata(jid);
        const all  = meta.participants.map(x => x.id);
        await sock.sendMessage(jid, {
          text:     args.join(' ') || 'Attention tout le monde!',
          mentions: all
        });
        break;
      }

      case 'mute': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUM = await isGroupAdmin(sock, jid, sender);
        if (!isUM && !isOwner) { await sock.sendMessage(jid, { text: 'Seuls les admins peuvent utiliser cette commande.' }); break; }
        await sock.groupSettingUpdate(jid, 'announcement');
        await sock.sendMessage(jid, { text: 'Groupe mute. Seuls les admins peuvent ecrire.' });
        break;
      }

      case 'unmute': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUUM = await isGroupAdmin(sock, jid, sender);
        if (!isUUM && !isOwner) { await sock.sendMessage(jid, { text: 'Seuls les admins peuvent utiliser cette commande.' }); break; }
        await sock.groupSettingUpdate(jid, 'not_announcement');
        await sock.sendMessage(jid, { text: 'Groupe ouvert. Tout le monde peut ecrire.' });
        break;
      }

      case 'invite': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const code = await sock.groupInviteCode(jid);
        await sock.sendMessage(jid, { text: `Lien invitation:\nhttps://chat.whatsapp.com/${code}` });
        break;
      }

      case 'gname': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUGN = await isGroupAdmin(sock, jid, sender);
        if (!isUGN && !isOwner) { await sock.sendMessage(jid, { text: 'Seuls les admins peuvent utiliser cette commande.' }); break; }
        if (!args.length) { await sock.sendMessage(jid, { text: `Usage: ${p}gname Nouveau nom` }); break; }
        await sock.groupUpdateSubject(jid, args.join(' '));
        await sock.sendMessage(jid, { text: 'Nom du groupe change.' });
        break;
      }

      case 'gdesc': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const isUGD = await isGroupAdmin(sock, jid, sender);
        if (!isUGD && !isOwner) { await sock.sendMessage(jid, { text: 'Seuls les admins peuvent utiliser cette commande.' }); break; }
        if (!args.length) { await sock.sendMessage(jid, { text: `Usage: ${p}gdesc Nouvelle description` }); break; }
        await sock.groupUpdateDescription(jid, args.join(' '));
        await sock.sendMessage(jid, { text: 'Description changee.' });
        break;
      }

      case 'groupinfo': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        const meta2  = await sock.groupMetadata(jid);
        const admins = meta2.participants
          .filter(x => x.admin)
          .map(x => `+${x.id.split('@')[0]}`)
          .join('\n');
        await sock.sendMessage(jid, {
          text:
`*INFO GROUPE*

Nom      : ${meta2.subject}
Membres  : ${meta2.participants.length}
Desc     : ${meta2.desc || 'Aucune'}
Admins   :
${admins}`
        });
        break;
      }

      case 'leave': {
        if (!isGroup) { await sock.sendMessage(jid, { text: 'Commande reservee aux groupes.' }); break; }
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        await sock.sendMessage(jid, { text: 'Au revoir!' });
        await sock.groupLeave(jid);
        break;
      }

      // ════════════════════════════════════════════
      // MEDIA
      // ════════════════════════════════════════════

      case 'sticker':
      case 'take': {
        const quotedM = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const imgM    = msg.message?.imageMessage || msg.message?.videoMessage ||
                        quotedM?.imageMessage || quotedM?.videoMessage;
        if (!imgM) { await sock.sendMessage(jid, { text: `Reponds a une image/video avec ${p}sticker` }); break; }
        try {
          const t2      = imgM.mimetype?.startsWith('video') ? 'video' : 'image';
          const stream2 = await downloadContentFromMessage(imgM, t2);
          const buf2    = await toBuffer(stream2);
          await sock.sendMessage(jid, { sticker: buf2 });
        } catch(e) {
          await sock.sendMessage(jid, { text: 'Erreur sticker.' });
        }
        break;
      }

      case 'vv': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        const quotedVV = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedVV) { await sock.sendMessage(jid, { text: `Reponds a un view once avec ${p}vv` }); break; }
        const voMsg = quotedVV.viewOnceMessage?.message ||
                      quotedVV.viewOnceMessageV2?.message ||
                      quotedVV.viewOnceMessageV2Extension?.message;
        const voMedia = voMsg?.imageMessage || voMsg?.videoMessage;
        if (!voMedia) { await sock.sendMessage(jid, { text: 'Aucun view once detecte.' }); break; }
        try {
          const t3      = voMsg.imageMessage ? 'image' : 'video';
          const stream3 = await downloadContentFromMessage(voMedia, t3);
          const buf3    = await toBuffer(stream3);
          if (t3 === 'image') {
            await sock.sendMessage(OWNER_JID, { image: buf3, caption: 'View once recupere' });
          } else {
            await sock.sendMessage(OWNER_JID, { video: buf3, caption: 'View once recupere' });
          }
          await sock.sendMessage(jid, { text: 'View once envoye en prive.' });
        } catch(e) {
          await sock.sendMessage(jid, { text: 'Erreur view once.' });
        }
        break;
      }

      case 'tostatus': {
        if (!isOwner) { await sock.sendMessage(jid, { text: 'Commande reservee au owner.' }); break; }
        const quotedTS = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const mediaTS  = msg.message?.imageMessage || msg.message?.videoMessage ||
                         quotedTS?.imageMessage || quotedTS?.videoMessage;
        if (!mediaTS) { await sock.sendMessage(jid, { text: `Reponds a une image/video avec ${p}tostatus` }); break; }
        try {
          const t4      = mediaTS.mimetype?.startsWith('video') ? 'video' : 'image';
          const stream4 = await downloadContentFromMessage(mediaTS, t4);
          const buf4    = await toBuffer(stream4);
          if (t4 === 'image') {
            await sock.sendMessage('status@broadcast', { image: buf4, caption: '' });
          } else {
            await sock.sendMessage('status@broadcast', { video: buf4, caption: '' });
          }
          await sock.sendMessage(jid, { text: 'Publie en status.' });
        } catch(e) {
          await sock.sendMessage(jid, { text: 'Erreur publication status.' });
        }
        break;
      }

      // ════════════════════════════════════════════
      // DEFAUT
      // ════════════════════════════════════════════
      default:
        await sock.sendMessage(jid, {
          text: `Commande inconnue. Tape *${p}menu* pour voir les commandes disponibles.`
        });
        break;
    }
  } catch(e) {
    console.error(`Erreur commande [${command}]:`, e.message);
  }
}

// ============================================================
// LANCEMENT
// ============================================================
console.log('');
console.log('  SEIGNEUR TD');
console.log('  LE SEIGNEUR DES APPAREILS');
console.log('');

connectToWhatsApp().catch(err => {
  console.error('Erreur demarrage:', err);
  process.exit(1);
});

process.on('uncaughtException',  err => console.error('Erreur:', err.message));
process.on('unhandledRejection', err => console.error('Rejet:',  err));
