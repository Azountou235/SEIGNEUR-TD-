// Bot Configuration File
export const botConfig = {
  // Bot identity
  botName: '𝐂𝐲𝐛𝐞𝐫𝐓𝐎𝐉𝐈 𝐕𝟏',
  botVersion: '1.0.0',
  
  // Command settings
  prefix: '!',
  
  // Feature toggles
  autoReply: true,
  commandsEnabled: true,
  groupSupport: true,
  mediaSupport: true,
  
  // Session settings
  sessionFolder: './auth_info_baileys',
  
  // Logging
  logLevel: 'silent', // Options: 'trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'
  
  // Response settings
  typingSimulation: true, // Simulate typing before sending response
  typingDuration: 1000, // Milliseconds to simulate typing
  
  // Anti-spam settings
  maxMessagesPerMinute: 20,
  cooldownSeconds: 3,
  
  // Group settings
  respondInGroups: true,
  requireMentionInGroups: false, // Only respond if bot is mentioned in groups
  
  // Database settings (for future expansion)
  database: {
    enabled: true,
    type: 'memory', // Options: 'memory', 'sqlite', 'mongodb'
  }
};

// Auto-reply configurations
export const autoReplyConfig = {
  keywords: {
    'hello': 'Hi there! 👋 How can I help you today?',
    'hi': 'Hello! 👋 Welcome to our bot service.',
    'hey': 'Hey! 👋 What can I do for you?',
    'help': 'Type !help to see all available commands.',
    'bye': 'Goodbye! 👋 Have a great day!',
    'goodbye': 'See you later! 👋',
    'thanks': 'You\'re welcome! 😊',
    'thank you': 'You\'re welcome! Happy to help! 😊',
    'thx': 'No problem! 😊'
  },
  
  // Case sensitivity for keyword matching
  caseSensitive: false,
  
  // Match whole words only or partial matches
  exactMatch: false
};

// Command configurations
export const commandsConfig = {
  help: {
    description: 'Show help menu',
    usage: '!help',
    category: 'general'
  },
  ping: {
    description: 'Check bot latency',
    usage: '!ping',
    category: 'general'
  },
  info: {
    description: 'Get bot information',
    usage: '!info',
    category: 'general'
  },
  echo: {
    description: 'Echo back your message',
    usage: '!echo [text]',
    category: 'fun'
  },
  menu: {
    description: 'Show menu options',
    usage: '!menu',
    category: 'general'
  },
  stats: {
    description: 'Show your statistics',
    usage: '!stats',
    category: 'general'
  },
  sticker: {
    description: 'Convert image to sticker',
    usage: '!sticker (reply to image)',
    category: 'media'
  }
};

// Admin configurations (for future use)
export const adminConfig = {
  admins: ['50943981073@s.whatsapp.net']
    // Add admin phone numbers here (with country code, no + sign)
    // Example: '1234567890@s.whatsapp.net'
  ],
  
  adminCommands: ['broadcast', 'ban', 'unban', 'reload'],
  
  enableAdminFeatures: false
};
