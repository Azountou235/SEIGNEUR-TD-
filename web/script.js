// Les appels /api/pair/* partent en relatif (même origine que le site,
// donc en https://seigneur-td.vercel.app) — c'est vercel.json qui les
// redirige côté serveur vers le panel Pterodactyl en http://, ce qui
// évite le blocage "contenu mixte" du navigateur (https -> http direct).
const API_BASE = '';

let currentMethod = 'qr';
let pollTimer = null;
let qrTimerInterval = null;
let pairingTimerInterval = null;
let lastSessionId = '';

const selector = document.querySelector('.method-selector');

document.querySelectorAll('.method-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.method-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.auth-section').forEach((s) => s.classList.remove('active'));

        btn.classList.add('active');
        currentMethod = btn.dataset.method;
        selector.classList.toggle('pairing', currentMethod === 'pairing');

        stopPolling();

        const sectionId = currentMethod === 'qr' ? 'qr-section' : 'pairing-section';
        document.getElementById(sectionId).classList.add('active');
    });
});

// ---------- helpers ----------

function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
}

async function apiStart(body) {
    const res = await fetch(`${API_BASE}/api/pair/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');
    return data.id;
}

function pollStatus(id, onUpdate) {
    stopPolling();
    pollTimer = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/pair/status/${id}`);
            if (res.status === 404) {
                stopPolling();
                updateStatus('Session expirée, réessaie', false);
                return;
            }
            const data = await res.json();
            onUpdate(data);
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 2000);
}

// ---------- QR flow ----------

function generateQR() {
    const btn = document.getElementById('qr-generate-btn');
    btn.disabled = true;
    updateStatus('Génération du QR...', false);

    apiStart({ method: 'qr' })
        .then((id) => {
            pollStatus(id, (data) => {
                if (data.status === 'qr' && data.qr) {
                    displayQR(data.qr);
                    document.getElementById('qr-timer-wrap').style.display = 'flex';
                    startQRTimer(60);
                }
                if (data.status === 'connected') {
                    stopPolling();
                    updateStatus('Connecté !', true);
                    showToast('✅ Bot connecté avec succès');
                    document.getElementById('qr-timer-wrap').style.display = 'none';
                    if (data.sessionId) showSessionResult(data.sessionId);
                }
                if (data.status === 'error') {
                    stopPolling();
                    updateStatus(data.message || 'Erreur', false);
                    btn.disabled = false;
                }
            });
        })
        .catch((error) => {
            updateStatus(error.message, false);
            btn.disabled = false;
        });
}

function displayQR(qrDataUrl) {
    const qrcodeDiv = document.getElementById('qrcode');
    qrcodeDiv.innerHTML = `<img src="${qrDataUrl}" alt="QR code" width="220" height="220">`;
}

function startQRTimer(seconds) {
    let remaining = seconds;
    if (qrTimerInterval) clearInterval(qrTimerInterval);

    qrTimerInterval = setInterval(() => {
        document.getElementById('qr-timer').textContent = remaining;
        if (remaining <= 0) {
            clearInterval(qrTimerInterval);
            updateStatus('QR expiré', false);
            document.getElementById('qr-generate-btn').disabled = false;
        }
        remaining--;
    }, 1000);
}

// ---------- Pairing flow ----------

const countrySelect = document.getElementById('country-code');
const phoneInput = document.getElementById('phone-number');
const phonePreview = document.getElementById('phone-preview');
const pairingPhoneWrap = document.getElementById('pairing-phone-wrap');

const qrCountrySelect = document.getElementById('qr-country-code');
const qrPhoneInput = document.getElementById('qr-phone-number');

// Les deux onglets (QR / Pairing) partagent le même numéro : on les
// garde synchronisés dans les deux sens pour ne jamais faire ressaisir.
function syncPhoneFields(source) {
    const isQr = source === qrPhoneInput || source === qrCountrySelect;
    const fromInput = isQr ? qrPhoneInput : phoneInput;
    const fromSelect = isQr ? qrCountrySelect : countrySelect;
    const toInput = isQr ? phoneInput : qrPhoneInput;
    const toSelect = isQr ? countrySelect : qrCountrySelect;

    if (toInput) toInput.value = fromInput.value;
    if (toSelect) toSelect.value = fromSelect.value;
}

function updatePhonePreview() {
    const digits = phoneInput.value.replace(/\D/g, '');
    const full = digits ? `${countrySelect.value}${digits}` : '—';
    phonePreview.textContent = `Numéro envoyé : ${full}`;
    pairingPhoneWrap?.classList.remove('invalid');
}

countrySelect?.addEventListener('change', () => {
    syncPhoneFields(countrySelect);
    updatePhonePreview();
});
phoneInput?.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, '');
    syncPhoneFields(phoneInput);
    updatePhonePreview();
});

qrCountrySelect?.addEventListener('change', () => syncPhoneFields(qrCountrySelect));
qrPhoneInput?.addEventListener('input', () => {
    qrPhoneInput.value = qrPhoneInput.value.replace(/\D/g, '');
    syncPhoneFields(qrPhoneInput);
    updatePhonePreview();
});

function requestPairingCode() {
    const digits = phoneInput.value.replace(/\D/g, '');
    if (digits.length < 6) {
        pairingPhoneWrap?.classList.add('invalid');
        showToast('⚠️ Entre un numéro valide');
        return;
    }
    pairingPhoneWrap?.classList.remove('invalid');

    const fullNumber = `${countrySelect.value}${digits}`; // ex: 23591234567
    const btn = document.getElementById('request-code-btn');
    btn.disabled = true;
    btn.textContent = 'Envoi en cours…';
    updateStatus('Génération du code...', false);

    apiStart({ method: 'pairing', phone: fullNumber })
        .then((id) => {
            pollStatus(id, (data) => {
                if (data.status === 'pairing_code' && data.code) {
                    document.getElementById('phone-form').style.display = 'none';
                    document.getElementById('pairing-result').style.display = 'block';
                    document.getElementById('pairing-code').textContent = data.code;
                    startPairingTimer(180);
                }
                if (data.status === 'connected') {
                    stopPolling();
                    updateStatus('Connecté !', true);
                    showToast('✅ Bot connecté avec succès');
                    if (data.sessionId) showSessionResult(data.sessionId);
                }
                if (data.status === 'error') {
                    stopPolling();
                    updateStatus(data.message || 'Erreur', false);
                    resetPairingForm();
                }
            });
        })
        .catch((error) => {
            updateStatus(error.message, false);
            btn.disabled = false;
            btn.innerHTML = '<span class="btn-icon">🔐</span> Demander le code';
        });
}

function startPairingTimer(seconds) {
    let remaining = seconds;
    if (pairingTimerInterval) clearInterval(pairingTimerInterval);

    pairingTimerInterval = setInterval(() => {
        document.getElementById('pairing-timer').textContent = remaining;
        if (remaining <= 0) {
            clearInterval(pairingTimerInterval);
            updateStatus('Code expiré', false);
        }
        remaining--;
    }, 1000);
}

function resetPairingForm() {
    stopPolling();
    document.getElementById('phone-form').style.display = 'flex';
    document.getElementById('pairing-result').style.display = 'none';
    document.getElementById('session-result').style.display = 'none';
    const btn = document.getElementById('request-code-btn');
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">🔐</span> Demander le code';
    updateStatus('Attente de connexion...', false);
}

function copyPairingCode() {
    const code = document.getElementById('pairing-code').textContent.trim();
    if (!code || code === '------') {
        showToast("⚠️ Génère un code d'abord");
        return;
    }
    navigator.clipboard.writeText(code).then(() => showToast('📋 Code copié !'));
}

// ---------- Session result (both flows) ----------

function showSessionResult(sessionId) {
    lastSessionId = sessionId;
    document.getElementById('phone-form').style.display = 'none';
    document.getElementById('pairing-result').style.display = 'none';
    const box = document.getElementById('session-result');
    box.style.display = 'block';
    document.getElementById('session-id-box').textContent = sessionId;
}

function copySessionId() {
    if (!lastSessionId) return;
    navigator.clipboard.writeText(lastSessionId).then(() => showToast('📋 SESSION_ID copié !'));
}

// ---------- shared status/toast ----------

function updateStatus(message, connected) {
    document.getElementById('status-text').textContent = message;
    const indicator = document.getElementById('status-indicator');
    indicator.classList.toggle('connected', !!connected);
}

let toastTimeout = null;
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

updatePhonePreview();

// ---------- Conditions d'utilisation (modale trilingue) ----------

const TERMS_I18N = {
    fr: { title: "Conditions d'utilisation", accept: "J'ai lu et j'accepte les conditions d'utilisation", acceptBtn: "J'accepte", close: 'Fermer' },
    en: { title: 'Terms of Use', accept: 'I have read and accept the terms of use', acceptBtn: 'I accept', close: 'Close' },
    ar: { title: 'شروط الاستخدام', accept: 'لقد قرأت ووافقت على شروط الاستخدام', acceptBtn: 'أوافق', close: 'إغلاق' },
};

const termsOverlay = document.getElementById('terms-overlay');
const termsCheckbox = document.getElementById('terms-checkbox');
const termsAcceptBtn = document.getElementById('terms-accept-btn');

function setTermsLang(lang) {
    const t = TERMS_I18N[lang] || TERMS_I18N.fr;

    document.querySelectorAll('.lang-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.lang === lang);
    });
    document.querySelectorAll('.terms-lang').forEach((el) => {
        el.classList.toggle('active', el.dataset.lang === lang);
    });

    const titleEl = document.getElementById('terms-title');
    const acceptLabelEl = document.getElementById('terms-accept-label');
    const acceptBtnLabelEl = document.getElementById('terms-accept-btn-label');
    const closeBtn = document.getElementById('terms-close');

    if (titleEl) titleEl.textContent = t.title;
    if (acceptLabelEl) acceptLabelEl.textContent = t.accept;
    if (acceptBtnLabelEl) acceptBtnLabelEl.textContent = t.acceptBtn;
    if (closeBtn) closeBtn.setAttribute('aria-label', t.close);
}

document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => setTermsLang(btn.dataset.lang));
});

function openTerms() {
    termsOverlay?.classList.add('open');
}

function closeTerms() {
    termsOverlay?.classList.remove('open');
}

document.getElementById('terms-trigger')?.addEventListener('click', openTerms);
document.getElementById('terms-close')?.addEventListener('click', closeTerms);

termsCheckbox?.addEventListener('change', () => {
    if (termsAcceptBtn) termsAcceptBtn.disabled = !termsCheckbox.checked;
});

termsAcceptBtn?.addEventListener('click', () => {
    try {
        localStorage.setItem('toumai_terms_accepted', '1');
    } catch (_) {
        // Stockage indisponible (navigation privée, etc.) — pas grave, on
        // ferme quand même la modale.
    }
    closeTerms();
});

// Affiche automatiquement les CGU au tout premier passage sur le site.
// Une fois acceptées (case cochée + bouton "J'accepte"), elles ne se
// rouvrent plus toutes seules — la croix en haut permet de les refermer
// à tout moment sans que ça compte comme une acceptation.
try {
    if (!localStorage.getItem('toumai_terms_accepted')) openTerms();
} catch (_) {
    openTerms();
}
