const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const { startBot, printBanner } = require('./index');
const { buildRouter: buildPairingRouter } = require('./pairing/pairingServer');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'web')));

// Route réelle utilisée par web/script.js (POST /api/pair/start,
// GET /api/pair/status/:id) pour générer un vrai QR/code Baileys.
// Montée ici car c'est server.js, et non index.js, qui est le point
// d'entrée du process — startPairingApi() dans index.js ne s'exécute
// que quand index.js est lancé directement, donc jamais dans ce mode.
app.use('/api/pair', buildPairingRouter());

const activeSessions = {};
const sessionTimers = {};

function generatePairingCode() {
  return Math.random().toString(36).substring(2, 11).toUpperCase();
}

async function generateQRData(sessionId) {
  const qrData = {
    sessionId,
    timestamp: Date.now(),
    endpoint: process.env.BOT_ENDPOINT || 'https://toumai-md.vercel.app'
  };
  return JSON.stringify(qrData);
}

wss.on('connection', (ws) => {
  console.log('🟢 Client WebSocket connecté');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'generate_qr') {
        const { sessionId } = data;
        try {
          const qrData = await generateQRData(sessionId);
          const qrImage = await QRCode.toDataURL(qrData, {
            width: 250,
            color: { dark: '#ffd700', light: '#1a1a2e' }
          });

          activeSessions[sessionId] = {
            type: 'qr',
            status: 'waiting',
            createdAt: Date.now(),
            expiresAt: Date.now() + 60000
          };

          if (sessionTimers[sessionId]) clearTimeout(sessionTimers[sessionId]);
          sessionTimers[sessionId] = setTimeout(() => {
            delete activeSessions[sessionId];
            delete sessionTimers[sessionId];
          }, 60000);

          ws.send(JSON.stringify({
            type: 'qr_generated',
            qr: qrImage,
            sessionId,
            expiresIn: 60
          }));
        } catch (error) {
          console.error('Erreur QR:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Erreur génération QR'
          }));
        }
      }

      if (data.type === 'generate_pairing') {
        const { sessionId } = data;
        const pairingCode = generatePairingCode();

        activeSessions[sessionId] = {
          type: 'pairing',
          code: pairingCode,
          status: 'waiting',
          createdAt: Date.now(),
          expiresAt: Date.now() + 300000
        };

        if (sessionTimers[sessionId]) clearTimeout(sessionTimers[sessionId]);
        sessionTimers[sessionId] = setTimeout(() => {
          delete activeSessions[sessionId];
          delete sessionTimers[sessionId];
        }, 300000);

        ws.send(JSON.stringify({
          type: 'pairing_generated',
          code: pairingCode,
          sessionId,
          expiresIn: 300
        }));
      }
    } catch (error) {
      console.error('Erreur WebSocket:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  ws.on('close', () => {
    console.log('🔴 Client WebSocket déconnecté');
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    sessionId,
    type: session.type,
    status: session.status,
    expiresAt: session.expiresAt
  });
});

app.post('/api/session/:sessionId/connect', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.status = 'connected';
  session.connectedAt = Date.now();

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'connected',
        sessionId,
        message: 'Bot connecté!'
      }));
    }
  });

  res.json({ status: 'connected' });
});

app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

const PORT = process.env.PORT || 3022;

server.listen(PORT, () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`🌐 Web panel: http://localhost:${PORT}`);
  console.log(`${'='.repeat(50)}\n`);

  setTimeout(async () => {
    printBanner();
    
    const commandsPath = path.join(__dirname, 'commands');
    const { loadCommands } = require('./utils/commandLoader');
    const { fetchCore } = require('./utils/fetchCore');

    if (process.env.AUTO_UPDATE_COMMANDS === 'true') {
      await fetchCore();
    }

    const commands = loadCommands(commandsPath);
    global.commands = commands;

    const { runClearCache } = require('./commands/clearcache');
    global.runClearCache = runClearCache;

    startBot();
  }, 1000);
});

module.exports = server;
