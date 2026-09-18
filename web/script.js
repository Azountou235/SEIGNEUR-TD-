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

// ---------- Country data (indicatifs) ----------
// Liste volontairement large (~150 pays) au lieu des ~34 d'origine.
// Le drapeau est calculé depuis le code ISO 3166-1 alpha-2 (pas besoin de
// stocker un emoji par pays, donc pas de risque de faute de frappe).
function isoToFlag(iso) {
    return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}

const COUNTRIES = [
    { name: 'Afghanistan', iso: 'AF', dial: '93' },
    { name: 'Afrique du Sud', iso: 'ZA', dial: '27' },
    { name: 'Albanie', iso: 'AL', dial: '355' },
    { name: 'Algérie', iso: 'DZ', dial: '213' },
    { name: 'Allemagne', iso: 'DE', dial: '49' },
    { name: 'Andorre', iso: 'AD', dial: '376' },
    { name: 'Angola', iso: 'AO', dial: '244' },
    { name: 'Arabie saoudite', iso: 'SA', dial: '966' },
    { name: 'Argentine', iso: 'AR', dial: '54' },
    { name: 'Arménie', iso: 'AM', dial: '374' },
    { name: 'Australie', iso: 'AU', dial: '61' },
    { name: 'Autriche', iso: 'AT', dial: '43' },
    { name: 'Azerbaïdjan', iso: 'AZ', dial: '994' },
    { name: 'Bahreïn', iso: 'BH', dial: '973' },
    { name: 'Bangladesh', iso: 'BD', dial: '880' },
    { name: 'Belgique', iso: 'BE', dial: '32' },
    { name: 'Belize', iso: 'BZ', dial: '501' },
    { name: 'Bénin', iso: 'BJ', dial: '229' },
    { name: 'Bhoutan', iso: 'BT', dial: '975' },
    { name: 'Biélorussie', iso: 'BY', dial: '375' },
    { name: 'Bolivie', iso: 'BO', dial: '591' },
    { name: 'Bosnie-Herzégovine', iso: 'BA', dial: '387' },
    { name: 'Botswana', iso: 'BW', dial: '267' },
    { name: 'Brésil', iso: 'BR', dial: '55' },
    { name: 'Brunei', iso: 'BN', dial: '673' },
    { name: 'Bulgarie', iso: 'BG', dial: '359' },
    { name: 'Burkina Faso', iso: 'BF', dial: '226' },
    { name: 'Burundi', iso: 'BI', dial: '257' },
    { name: 'Cambodge', iso: 'KH', dial: '855' },
    { name: 'Cameroun', iso: 'CM', dial: '237' },
    { name: 'Canada', iso: 'CA', dial: '1' },
    { name: 'Cap-Vert', iso: 'CV', dial: '238' },
    { name: 'Centrafrique', iso: 'CF', dial: '236' },
    { name: 'Chili', iso: 'CL', dial: '56' },
    { name: 'Chine', iso: 'CN', dial: '86' },
    { name: 'Chypre', iso: 'CY', dial: '357' },
    { name: 'Colombie', iso: 'CO', dial: '57' },
    { name: 'Comores', iso: 'KM', dial: '269' },
    { name: 'Congo-Brazzaville', iso: 'CG', dial: '242' },
    { name: 'Corée du Nord', iso: 'KP', dial: '850' },
    { name: 'Corée du Sud', iso: 'KR', dial: '82' },
    { name: 'Costa Rica', iso: 'CR', dial: '506' },
    { name: "Côte d'Ivoire", iso: 'CI', dial: '225' },
    { name: 'Croatie', iso: 'HR', dial: '385' },
    { name: 'Cuba', iso: 'CU', dial: '53' },
    { name: 'Danemark', iso: 'DK', dial: '45' },
    { name: 'Djibouti', iso: 'DJ', dial: '253' },
    { name: 'Égypte', iso: 'EG', dial: '20' },
    { name: 'Émirats arabes unis', iso: 'AE', dial: '971' },
    { name: 'Équateur', iso: 'EC', dial: '593' },
    { name: 'Érythrée', iso: 'ER', dial: '291' },
    { name: 'Espagne', iso: 'ES', dial: '34' },
    { name: 'Estonie', iso: 'EE', dial: '372' },
    { name: 'Eswatini', iso: 'SZ', dial: '268' },
    { name: 'États-Unis', iso: 'US', dial: '1' },
    { name: 'Éthiopie', iso: 'ET', dial: '251' },
    { name: 'Fidji', iso: 'FJ', dial: '679' },
    { name: 'Finlande', iso: 'FI', dial: '358' },
    { name: 'France', iso: 'FR', dial: '33' },
    { name: 'Gabon', iso: 'GA', dial: '241' },
    { name: 'Gambie', iso: 'GM', dial: '220' },
    { name: 'Géorgie', iso: 'GE', dial: '995' },
    { name: 'Ghana', iso: 'GH', dial: '233' },
    { name: 'Grèce', iso: 'GR', dial: '30' },
    { name: 'Guatemala', iso: 'GT', dial: '502' },
    { name: 'Guinée', iso: 'GN', dial: '224' },
    { name: 'Guinée équatoriale', iso: 'GQ', dial: '240' },
    { name: 'Guinée-Bissau', iso: 'GW', dial: '245' },
    { name: 'Guyana', iso: 'GY', dial: '592' },
    { name: 'Haïti', iso: 'HT', dial: '509' },
    { name: 'Honduras', iso: 'HN', dial: '504' },
    { name: 'Hong Kong', iso: 'HK', dial: '852' },
    { name: 'Hongrie', iso: 'HU', dial: '36' },
    { name: 'Inde', iso: 'IN', dial: '91' },
    { name: 'Indonésie', iso: 'ID', dial: '62' },
    { name: 'Irak', iso: 'IQ', dial: '964' },
    { name: 'Iran', iso: 'IR', dial: '98' },
    { name: 'Irlande', iso: 'IE', dial: '353' },
    { name: 'Islande', iso: 'IS', dial: '354' },
    { name: 'Israël', iso: 'IL', dial: '972' },
    { name: 'Italie', iso: 'IT', dial: '39' },
    { name: 'Jamaïque', iso: 'JM', dial: '1' },
    { name: 'Japon', iso: 'JP', dial: '81' },
    { name: 'Jordanie', iso: 'JO', dial: '962' },
    { name: 'Kazakhstan', iso: 'KZ', dial: '7' },
    { name: 'Kenya', iso: 'KE', dial: '254' },
    { name: 'Kirghizistan', iso: 'KG', dial: '996' },
    { name: 'Kiribati', iso: 'KI', dial: '686' },
    { name: 'Kosovo', iso: 'XK', dial: '383' },
    { name: 'Koweït', iso: 'KW', dial: '965' },
    { name: 'Laos', iso: 'LA', dial: '856' },
    { name: 'Lesotho', iso: 'LS', dial: '266' },
    { name: 'Lettonie', iso: 'LV', dial: '371' },
    { name: 'Liban', iso: 'LB', dial: '961' },
    { name: 'Liberia', iso: 'LR', dial: '231' },
    { name: 'Libye', iso: 'LY', dial: '218' },
    { name: 'Liechtenstein', iso: 'LI', dial: '423' },
    { name: 'Lituanie', iso: 'LT', dial: '370' },
    { name: 'Luxembourg', iso: 'LU', dial: '352' },
    { name: 'Macao', iso: 'MO', dial: '853' },
    { name: 'Macédoine du Nord', iso: 'MK', dial: '389' },
    { name: 'Madagascar', iso: 'MG', dial: '261' },
    { name: 'Malaisie', iso: 'MY', dial: '60' },
    { name: 'Malawi', iso: 'MW', dial: '265' },
    { name: 'Maldives', iso: 'MV', dial: '960' },
    { name: 'Mali', iso: 'ML', dial: '223' },
    { name: 'Malte', iso: 'MT', dial: '356' },
    { name: 'Maroc', iso: 'MA', dial: '212' },
    { name: 'Maurice', iso: 'MU', dial: '230' },
    { name: 'Mauritanie', iso: 'MR', dial: '222' },
    { name: 'Mexique', iso: 'MX', dial: '52' },
    { name: 'Micronésie', iso: 'FM', dial: '691' },
    { name: 'Moldavie', iso: 'MD', dial: '373' },
    { name: 'Monaco', iso: 'MC', dial: '377' },
    { name: 'Mongolie', iso: 'MN', dial: '976' },
    { name: 'Monténégro', iso: 'ME', dial: '382' },
    { name: 'Mozambique', iso: 'MZ', dial: '258' },
    { name: 'Myanmar', iso: 'MM', dial: '95' },
    { name: 'Namibie', iso: 'NA', dial: '264' },
    { name: 'Nauru', iso: 'NR', dial: '674' },
    { name: 'Népal', iso: 'NP', dial: '977' },
    { name: 'Nicaragua', iso: 'NI', dial: '505' },
    { name: 'Niger', iso: 'NE', dial: '227' },
    { name: 'Nigeria', iso: 'NG', dial: '234' },
    { name: 'Norvège', iso: 'NO', dial: '47' },
    { name: 'Nouvelle-Zélande', iso: 'NZ', dial: '64' },
    { name: 'Oman', iso: 'OM', dial: '968' },
    { name: 'Ouganda', iso: 'UG', dial: '256' },
    { name: 'Ouzbékistan', iso: 'UZ', dial: '998' },
    { name: 'Pakistan', iso: 'PK', dial: '92' },
    { name: 'Palaos', iso: 'PW', dial: '680' },
    { name: 'Palestine', iso: 'PS', dial: '970' },
    { name: 'Panama', iso: 'PA', dial: '507' },
    { name: 'Papouasie-Nouvelle-Guinée', iso: 'PG', dial: '675' },
    { name: 'Paraguay', iso: 'PY', dial: '595' },
    { name: 'Pays-Bas', iso: 'NL', dial: '31' },
    { name: 'Pérou', iso: 'PE', dial: '51' },
    { name: 'Philippines', iso: 'PH', dial: '63' },
    { name: 'Pologne', iso: 'PL', dial: '48' },
    { name: 'Portugal', iso: 'PT', dial: '351' },
    { name: 'Qatar', iso: 'QA', dial: '974' },
    { name: 'RD Congo', iso: 'CD', dial: '243' },
    { name: 'République dominicaine', iso: 'DO', dial: '1' },
    { name: 'République tchèque', iso: 'CZ', dial: '420' },
    { name: 'Roumanie', iso: 'RO', dial: '40' },
    { name: 'Royaume-Uni', iso: 'GB', dial: '44' },
    { name: 'Russie', iso: 'RU', dial: '7' },
    { name: 'Rwanda', iso: 'RW', dial: '250' },
    { name: 'Saint-Marin', iso: 'SM', dial: '378' },
    { name: 'Salvador', iso: 'SV', dial: '503' },
    { name: 'Samoa', iso: 'WS', dial: '685' },
    { name: 'Sao Tomé-et-Principe', iso: 'ST', dial: '239' },
    { name: 'Sénégal', iso: 'SN', dial: '221' },
    { name: 'Serbie', iso: 'RS', dial: '381' },
    { name: 'Seychelles', iso: 'SC', dial: '248' },
    { name: 'Sierra Leone', iso: 'SL', dial: '232' },
    { name: 'Singapour', iso: 'SG', dial: '65' },
    { name: 'Slovaquie', iso: 'SK', dial: '421' },
    { name: 'Slovénie', iso: 'SI', dial: '386' },
    { name: 'Somalie', iso: 'SO', dial: '252' },
    { name: 'Soudan', iso: 'SD', dial: '249' },
    { name: 'Soudan du Sud', iso: 'SS', dial: '211' },
    { name: 'Sri Lanka', iso: 'LK', dial: '94' },
    { name: 'Suède', iso: 'SE', dial: '46' },
    { name: 'Suisse', iso: 'CH', dial: '41' },
    { name: 'Suriname', iso: 'SR', dial: '597' },
    { name: 'Syrie', iso: 'SY', dial: '963' },
    { name: 'Tadjikistan', iso: 'TJ', dial: '992' },
    { name: 'Taïwan', iso: 'TW', dial: '886' },
    { name: 'Tanzanie', iso: 'TZ', dial: '255' },
    { name: 'Tchad', iso: 'TD', dial: '235' },
    { name: 'Thaïlande', iso: 'TH', dial: '66' },
    { name: 'Timor oriental', iso: 'TL', dial: '670' },
    { name: 'Togo', iso: 'TG', dial: '228' },
    { name: 'Tonga', iso: 'TO', dial: '676' },
    { name: 'Trinité-et-Tobago', iso: 'TT', dial: '1' },
    { name: 'Tunisie', iso: 'TN', dial: '216' },
    { name: 'Turkménistan', iso: 'TM', dial: '993' },
    { name: 'Turquie', iso: 'TR', dial: '90' },
    { name: 'Tuvalu', iso: 'TV', dial: '688' },
    { name: 'Ukraine', iso: 'UA', dial: '380' },
    { name: 'Uruguay', iso: 'UY', dial: '598' },
    { name: 'Vanuatu', iso: 'VU', dial: '678' },
    { name: 'Venezuela', iso: 'VE', dial: '58' },
    { name: 'Vietnam', iso: 'VN', dial: '84' },
    { name: 'Yémen', iso: 'YE', dial: '967' },
    { name: 'Zambie', iso: 'ZM', dial: '260' },
    { name: 'Zimbabwe', iso: 'ZW', dial: '263' },
];

const COUNTRIES_SORTED = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

function normalizeSearch(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// ---------- Country picker (widget avec recherche) ----------
function initCountryPicker({ triggerId, panelId, searchId, listId, defaultDial }) {
    const trigger = document.getElementById(triggerId);
    const panel = document.getElementById(panelId);
    const searchInput = document.getElementById(searchId);
    const list = document.getElementById(listId);
    if (!trigger || !panel || !searchInput || !list) return null;

    const flagEl = trigger.querySelector('.country-picker-flag');
    const dialEl = trigger.querySelector('.country-picker-dial');
    let selected = COUNTRIES_SORTED.find((c) => c.dial === defaultDial) || COUNTRIES_SORTED[0];
    let onChangeCb = null;

    function renderList(filter) {
        const term = filter ? normalizeSearch(filter) : '';
        const matches = term
            ? COUNTRIES_SORTED.filter((c) => normalizeSearch(c.name).includes(term) || c.dial.includes(term))
            : COUNTRIES_SORTED;

        list.innerHTML = '';

        if (matches.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'country-picker-empty';
            empty.textContent = 'Aucun pays trouvé';
            list.appendChild(empty);
            return;
        }

        for (const c of matches) {
            const li = document.createElement('li');
            li.className = 'country-picker-item' + (selected && c.iso === selected.iso ? ' active' : '');
            li.setAttribute('role', 'option');
            li.innerHTML = `<span class="country-picker-item-flag">${isoToFlag(c.iso)}</span><span class="country-picker-item-name">${c.name}</span><span class="country-picker-item-dial">+${c.dial}</span>`;
            li.addEventListener('click', () => selectCountry(c));
            list.appendChild(li);
        }
    }

    function updateTrigger() {
        flagEl.textContent = isoToFlag(selected.iso);
        dialEl.textContent = `+${selected.dial}`;
        trigger.setAttribute('aria-label', `Indicatif : ${selected.name} +${selected.dial}`);
    }

    function selectCountry(c, silent) {
        selected = c;
        updateTrigger();
        closePanel();
        if (!silent) onChangeCb?.(c);
    }

    function openPanel() {
        document.querySelectorAll('.country-picker-panel.open').forEach((p) => {
            if (p === panel) return;
            p.classList.remove('open');
            p.previousElementSibling?.setAttribute?.('aria-expanded', 'false');
        });
        searchInput.value = '';
        renderList('');
        panel.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        setTimeout(() => searchInput.focus(), 30);
    }

    function closePanel() {
        panel.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.contains('open') ? closePanel() : openPanel();
    });
    searchInput.addEventListener('input', () => renderList(searchInput.value));
    searchInput.addEventListener('click', (e) => e.stopPropagation());
    panel.addEventListener('click', (e) => e.stopPropagation());

    updateTrigger();

    return {
        get value() { return selected.dial; },
        set(dial) {
            const c = COUNTRIES_SORTED.find((x) => x.dial === dial);
            if (c) selectCountry(c, true);
        },
        onChange(fn) { onChangeCb = fn; },
    };
}

// Ferme n'importe quel panneau ouvert au clic ailleurs ou à Échap — un seul
// listener global plutôt qu'un par picker.
document.addEventListener('click', () => {
    document.querySelectorAll('.country-picker-panel.open').forEach((p) => {
        p.classList.remove('open');
        p.previousElementSibling?.setAttribute?.('aria-expanded', 'false');
    });
});
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.country-picker-panel.open').forEach((p) => {
        p.classList.remove('open');
        p.previousElementSibling?.setAttribute?.('aria-expanded', 'false');
    });
});

// ---------- Pairing flow ----------

const phoneInput = document.getElementById('phone-number');
const phonePreview = document.getElementById('phone-preview');
const pairingPhoneWrap = document.getElementById('pairing-phone-wrap');
const qrPhoneInput = document.getElementById('qr-phone-number');

const pairingPicker = initCountryPicker({
    triggerId: 'country-trigger',
    panelId: 'country-panel',
    searchId: 'country-search',
    listId: 'country-list',
    defaultDial: '235',
});

const qrPicker = initCountryPicker({
    triggerId: 'qr-country-trigger',
    panelId: 'qr-country-panel',
    searchId: 'qr-country-search',
    listId: 'qr-country-list',
    defaultDial: '235',
});

// Les deux onglets (QR / Pairing) partagent le même numéro et le même
// indicatif : on les garde synchronisés dans les deux sens pour ne jamais
// faire ressaisir en changeant d'onglet.
pairingPicker?.onChange((c) => {
    qrPicker?.set(c.dial);
    updatePhonePreview();
});
qrPicker?.onChange((c) => {
    pairingPicker?.set(c.dial);
    updatePhonePreview();
});

function syncPhoneDigits(source) {
    const target = source === qrPhoneInput ? phoneInput : qrPhoneInput;
    if (target) target.value = source.value;
}

function updatePhonePreview() {
    const digits = phoneInput.value.replace(/\D/g, '');
    const dial = pairingPicker ? pairingPicker.value : '235';
    const full = digits ? `${dial}${digits}` : '—';
    phonePreview.textContent = `Numéro envoyé : ${full}`;
    pairingPhoneWrap?.classList.remove('invalid');
}

phoneInput?.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, '');
    syncPhoneDigits(phoneInput);
    updatePhonePreview();
});
qrPhoneInput?.addEventListener('input', () => {
    qrPhoneInput.value = qrPhoneInput.value.replace(/\D/g, '');
    syncPhoneDigits(qrPhoneInput);
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

    const dial = pairingPicker ? pairingPicker.value : '235';
    const fullNumber = `${dial}${digits}`; // ex: 23591234567
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
