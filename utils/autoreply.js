const TRIGGERS = {
  hi: '...',
  hello: '...',
  hey: '...',
  salut: '...',
  'good morning': '...',
  'good night': '...',
  thanks: "You're welcome! 🙌",
  'thank you': "You're welcome! 🙌",
};

function getAutoReply(text) {
  const normalized = text.trim().toLowerCase();
  return TRIGGERS[normalized] || null;
}

module.exports = { getAutoReply };
