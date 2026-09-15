let ws = null;
let currentSessionId = null;
let currentMethod = 'qr';
let qrInstance = null;
let qrTimer = null;
let pairingTimer = null;

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
        console.log('WebSocket connecté');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };

    ws.onerror = (error) => {
        console.error('Erreur WebSocket:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket fermé');
        setTimeout(connectWebSocket, 3000);
    };
}

function handleMessage(data) {
    if (data.type === 'qr_generated') {
        displayQR(data.qr);
        startQRTimer(data.expiresIn);
    }

    if (data.type === 'pairing_generated') {
        displayPairingCode(data.code);
        startPairingTimer(data.expiresIn);
    }

    if (data.type === 'connected') {
        updateStatus('Connecté!', true);
        showToast('✅ Bot connecté avec succès');
    }

    if (data.type === 'connection_failed') {
        updateStatus('Connexion échouée', false);
    }

    if (data.type === 'session_status') {
        updateStatus(data.message, data.connected);
    }
}

const selector = document.querySelector('.method-selector');

document.querySelectorAll('.method-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.auth-section').forEach(s => s.classList.remove('active'));

        btn.classList.add('active');
        currentMethod = btn.dataset.method;

        selector.classList.toggle('pairing', currentMethod === 'pairing');

        const sectionId = currentMethod === 'qr' ? 'qr-section' : 'pairing-section';
        document.getElementById(sectionId).classList.add('active');

        if (currentMethod === 'qr') {
            generateQR();
        } else {
            generatePairingCode();
        }
    });
});

function generateQR() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        return;
    }

    currentSessionId = Date.now().toString();

    ws.send(JSON.stringify({
        type: 'generate_qr',
        sessionId: currentSessionId
    }));

    updateStatus('Génération du QR...', false);
}

function displayQR(qrData) {
    const qrcodeDiv = document.getElementById('qrcode');
    qrcodeDiv.innerHTML = '';

    if (qrInstance) {
        qrInstance = null;
    }

    qrInstance = new QRCode(qrcodeDiv, {
        text: qrData,
        width: 220,
        height: 220,
        colorDark: '#ffd700',
        colorLight: '#0d0f1c',
        correctLevel: QRCode.CorrectLevel.H
    });
}

function startQRTimer(seconds) {
    let remaining = seconds;

    if (qrTimer) clearInterval(qrTimer);

    qrTimer = setInterval(() => {
        document.getElementById('qr-timer').textContent = remaining;

        if (remaining <= 0) {
            clearInterval(qrTimer);
            updateStatus('QR expiré', false);
        }
        remaining--;
    }, 1000);
}

function generatePairingCode() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectWebSocket();
        return;
    }

    currentSessionId = Date.now().toString();

    ws.send(JSON.stringify({
        type: 'generate_pairing',
        sessionId: currentSessionId
    }));

    updateStatus('Génération du code...', false);
}

function displayPairingCode(code) {
    const el = document.getElementById('pairing-code');
    el.innerHTML = '';
    el.classList.add('filled');

    code.split('').forEach((char, i) => {
        const span = document.createElement('span');
        span.className = 'ph';
        span.textContent = char;
        span.style.animation = `fadeSlide 0.35s ease ${i * 0.05}s both`;
        el.appendChild(span);
    });
}

function copyPairingCode() {
    const code = document.getElementById('pairing-code').textContent.trim();

    if (!code || code === '------') {
        showToast('⚠️ Génère un code d\'abord');
        return;
    }

    navigator.clipboard.writeText(code).then(() => {
        showToast('📋 Code copié !');
    });
}

function startPairingTimer(seconds) {
    let remaining = seconds;

    if (pairingTimer) clearInterval(pairingTimer);

    pairingTimer = setInterval(() => {
        document.getElementById('pairing-timer').textContent = remaining;

        if (remaining <= 0) {
            clearInterval(pairingTimer);
            updateStatus('Code expiré', false);
        }
        remaining--;
    }, 1000);
}

function updateStatus(message, connected) {
    document.getElementById('status-text').textContent = message;
    const indicator = document.getElementById('status-indicator');

    if (connected) {
        indicator.classList.add('connected');
    } else {
        indicator.classList.remove('connected');
    }
}

let toastTimeout = null;
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

window.addEventListener('load', () => {
    connectWebSocket();
    generateQR();
});
