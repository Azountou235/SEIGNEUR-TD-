// ╔═══════════════════════════════════╗
// ║        SEIGNEUR TD - config.js      ║
// ╚═══════════════════════════════════╝

const config = {
  // ── Bot identity ────────────────────────────────────────────
  botName: 'SEIGNEUR TD',
  version: '2.1.0',
  developer: 'SEIGNEUR TD',

  // ── WhatsApp settings ────────────────────────────────────────
  prefix: '.',
  autoReply: true,
  sessionFolder: './auth_info_baileys',

  // ── Authentication ───────────────────────────────────────────
  // Set usePairingCode to false to use QR code instead
  usePairingCode: true,
  // Leave empty to be prompted at runtime, or set e.g. '33612345678'
  phoneNumber: '',

  // ── Anti-spam ────────────────────────────────────────────────
  // Cooldown in milliseconds between the same command per user
  cooldownTime: 3000,

  // ── Media assets ─────────────────────────────────────────────
  // Used by !menu command when no video is set
  menuImage: 'https://staticg.sportskeeda.com/editor/2023/07/c8f13-16902446067584-1920.jpg',

  // Path or URL to your menu.mp4 file.
  // - Local file example : './assets/menu.mp4'
  // - Remote URL example : 'https://yourserver.com/menu.mp4'
  // Set to null (or '') to use the image fallback instead.
  menuVideo: './assets/menu.mp4',

  // ── Misc ─────────────────────────────────────────────────────
  // Log level: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
  logLevel: 'silent'
};

export default config;
