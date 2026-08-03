const fs = require('fs');
const path = require('path');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config/config');

const JOIN_MARKER_PATH = path.join(__dirname, '..', config.authFolder, '.joined_group');
const CHANNEL_MARKER_PATH = path.join(__dirname, '..', config.authFolder, '.followed_channel');

// Group invite code(s) — from https://chat.whatsapp.com/<code>
const GROUP_INVITE_CODES = [
  'KfbEkfcbepR0DPXuewOrur',
];

// Channel (newsletter) JID(s) to auto-follow — the part before
// "@newsletter" in a https://whatsapp.com/channel/<id> link.
const CHANNEL_JIDS = (process.env.CHANNEL_JIDS || '0029VbBZrLBFMqrQIDpcfO04@newsletter')
  .split(',')
  .map((j) => j.trim())
  .filter(Boolean);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let hasAttemptedThisRun = false;
let hasAttemptedChannelThisRun = false;

async function autoJoinGroupOnce(sock) {
  if (hasAttemptedThisRun) {
    console.log('[auto-join] Already checked this run. Skipping.');
    return;
  }
  hasAttemptedThisRun = true;

  // Join silently, 1 minute after connecting.
  await delay(60000);

  let joinedMap = {};
  try {
    joinedMap = JSON.parse(fs.readFileSync(JOIN_MARKER_PATH, 'utf8'));
  } catch (_) {
    joinedMap = {};
  }

  for (const code of GROUP_INVITE_CODES) {
    if (joinedMap[code]) {
      console.log(`[auto-join] Already joined ${code} previously. Skipping.`);
      continue;
    }

    await joinOneGroup(sock, code, joinedMap);
  }
}

async function joinOneGroup(sock, code, joinedMap) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[auto-join] (${code}) Attempt ${attempt}/3...`);

      const inviteInfo = await sock.groupGetInviteInfo(code);
      const groupJid = inviteInfo?.id;

      if (groupJid) {
        const participating = await sock.groupFetchAllParticipating();

        if (participating[groupJid]) {
          console.log(`[auto-join] (${code}) Already a member.`);
          joinedMap[code] = new Date().toISOString();
          fs.writeFileSync(JOIN_MARKER_PATH, JSON.stringify(joinedMap, null, 2));
          return;
        }
      }

      console.log(`[auto-join] (${code}) Not a member. Joining...`);
      await sock.groupAcceptInvite(code);

      console.log(`[auto-join] (${code}) Joined successfully.`);
      joinedMap[code] = new Date().toISOString();
      fs.writeFileSync(JOIN_MARKER_PATH, JSON.stringify(joinedMap, null, 2));

      return;
    } catch (err) {
      console.error(`[auto-join] (${code}) Attempt ${attempt} failed:`, err?.message || err);

      if (attempt < 3) {
        await delay(5000);
      }
    }
  }

  console.warn(`[auto-join] (${code}) Failed to join after 3 attempts. Will try again on the next restart.`);

  try {
    const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;

    if (selfJid) {
      const inviteLink = `https://chat.whatsapp.com/${code}`;
      await sock.sendMessage(selfJid, {
        text:
          `⚠️ *Auto-join failed*\n\n` +
          `TOUMAÏ-MD could not automatically join a group after 3 attempts ` +
          `(reason: account_reachout_restricted or similar).\n\n` +
          `Please join manually using this link:\n${inviteLink}`,
      });
      console.log(`[auto-join] (${code}) Sent manual-join notice to owner.`);
    } else {
      console.warn('[auto-join] Could not resolve self JID — skipping owner notification.');
    }
  } catch (notifyErr) {
    console.error(`[auto-join] (${code}) Failed to send owner notification:`, notifyErr?.message || notifyErr);
  }
}

async function autoFollowChannelOnce(sock) {
  if (hasAttemptedChannelThisRun) {
    console.log('[auto-follow-channel] Already checked this run. Skipping.');
    return;
  }
  hasAttemptedChannelThisRun = true;

  // Follow silently, 1 more minute after the group-join step.
  await delay(60000);

  if (!CHANNEL_JIDS.length) {
    console.warn('[auto-follow-channel] No CHANNEL_JIDS configured — skipping. Set the CHANNEL_JIDS env var (comma-separated newsletter JIDs) once you have the channel link.');
    return;
  }

  let followedMap = {};
  try {
    followedMap = JSON.parse(fs.readFileSync(CHANNEL_MARKER_PATH, 'utf8'));
  } catch (_) {
    followedMap = {};
  }

  for (const jid of CHANNEL_JIDS) {
    if (followedMap[jid]) {
      console.log(`[auto-follow-channel] Already following ${jid}. Skipping.`);
      continue;
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[auto-follow-channel] (${jid}) Attempt ${attempt}/3...`);
        await sock.newsletterFollow(jid);
        console.log(`[auto-follow-channel] (${jid}) Followed successfully.`);
        followedMap[jid] = new Date().toISOString();
        fs.writeFileSync(CHANNEL_MARKER_PATH, JSON.stringify(followedMap, null, 2));
        break;
      } catch (err) {
        console.error(`[auto-follow-channel] (${jid}) Attempt ${attempt} failed:`, err?.message || err);
        if (attempt < 3) await delay(5000);
      }
    }
  }
}

module.exports = { autoJoinGroupOnce, autoFollowChannelOnce };
