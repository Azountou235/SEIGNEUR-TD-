# 🤖 SEIGNEUR TD — WhatsApp Bot Multi-Session

> **Bot WhatsApp avancé avec support multi-session, commandes puissantes et gestion web intégrée**

![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=flat-square&logo=node.js)
![License](https://img.shields.io/badge/License-ISC-blue?style=flat-square)
![Version](https://img.shields.io/badge/Version-4.0.0-orange?style=flat-square)

---

## ⚠️ **AVERTISSEMENT LÉGAL — DROITS D'AUTEUR**

```
╔════════════════════════════════════════════════════════════════╗
║                    ⚖️ NOTICE DE PROPRIÉTÉ                     ║
╚════════════════════════════════════════════════════════════════╝

❌ **STRICTEMENT INTERDIT** :
   • Utiliser ce code sans autorisation écrite de l'auteur
   • Copier, modifier ou distribuer ce projet
   • Utiliser ce code à titre commercial ou privé
   • Reverser le code avec ou sans modifications
   • Prétendre être l'auteur de ce projet

✅ **AUTORISÉ** :
   • Consulter le code à titre informatif uniquement
   • Demander une autorisation explicite à l'auteur

⚖️ Tout contrevenant s'expose à des poursuites légales.
   Ce code est protégé par droit d'auteur © 2024-2026
   Auteur : SEIGNEUR (Mahamat Oumar Moussa)
```

---

## 📖 À Propos

**SEIGNEUR TD** est un bot WhatsApp professionnel conçu pour :

- ✅ **Multi-session** : Lancer plusieurs bots simultanément sur un seul serveur
- ✅ **Couplage Web** : Connecter des numéros WhatsApp via une interface web
- ✅ **Commandes avancées** : +100 commandes intégrées (jeux, téléchargement, modération)
- ✅ **Gestion de groupes** : Anti-spam, anti-sticker, anti-lien, auto-modération
- ✅ **Architecture modulaire** : Code divisé en parties réutilisables
- ✅ **Watchdog temps-réel** : Détection automatique des sessions "zombies"

---

## 🚀 Démarrage Rapide

### Prérequis
- **Node.js** ≥ 18.0.0
- **npm** ou **yarn**
- Un serveur (Pterodactyl, VPS, etc.)

### Installation

```bash
# Clone le dépôt
git clone https://github.com/Azountou235/SEIGNEUR-TD-.git
cd SEIGNEUR-TD-

# Installe les dépendances
npm run install:setup

# Lance le bot
npm start
```

Le bot va :
1. Reconstituer `index.js` à partir de `index.part1.js` + `index.part2.js`
2. Se connecter à WhatsApp
3. Afficher un QR code pour scanner
4. Attendre les connexions web via l'API

---

## 📁 Structure du Projet

```
SEIGNEUR-TD-/
├── 📄 package.json              # Dépendances et scripts
├── 📄 config.js                 # Configuration du bot
├── 📄 assemble.js               # Script de reconstitution (build)
│
├── 📦 Sources (à modifier)
│   ├── 📄 index.part1.js        # Config, bot principal, handleCommand
│   └── 📄 index.part2.js        # Commandes, sessions, API HTTP
│
├── 🔨 Généré automatiquement
│   └── 📄 index.js              # ⚠️ Ne pas modifier (régénéré à chaque démarrage)
│
└── 📁 Répertoires de persistance (créés à l'exécution)
    ├── 📁 auth_info_baileys/    # Tokens WhatsApp
    ├── 📁 bot_data/             # Données du bot
    └── 📁 store/                # Cache et état
```

---

## 🔧 Architecture : Comment Ça Marche ?

### Le Processus de Démarrage

```
npm start
    ↓
node assemble.js                    ← Lit part1 + part2
    ↓
index.js généré en RAM/disque       ← 11 270 lignes complètes
    ↓
node index.js                       ← Lance le bot
    ↓
[INFO] Connecté à WhatsApp
[ASSEMBLE] ✅ index.js généré...
```

### Où Modifier le Code ?

| Modification | Fichier |
|---|---|
| Config, logs, bot principal | `index.part1.js` |
| Commandes, menus, API | `index.part2.js` |
| Dépendances npm | `package.json` |
| Clés API, préfixe | `config.js` |

**⚠️ JAMAIS `index.js` directement** — il est régénéré à chaque démarrage !

---

## 📝 Commandes Principales

```
.help              → Affiche l'aide
.menu              → Menu interactif
.play [commande]   → Jeux (dice, coin, number...)
.ytmp3 [url]       → Télécharge MP3 YouTube
.ig [url]          → Télécharge vidéo Instagram
.fb [url]          → Télécharge vidéo Facebook
.antibot on/off    → Active/désactive le mode anti-bot
.autoview on/off   → Voit les statuts automatiquement
.update            → Met à jour le bot
```

---

## 🌐 Connexion Web (Pairing API)

Les utilisateurs peuvent connecter leurs numéros WhatsApp via l'API web :

```bash
# Générer un code de pairing
POST /api/get-pairing-code
Body: { "phone": "+235912345678" }
Response: { "code": "ABC-123-XYZ" }

# Créer une session
POST /api/create-session
Body: { "phone": "+235912345678", "code": "ABC-123-XYZ" }
Response: { "status": "pending", "qrCode": "..." }
```

---

## 🐛 Problèmes Connus & Corrections (v4.0.0)

### ✅ RÉSOLU : Bots connectés mais muets
**Symptôme** : Les bots restaient connectés mais ne répondaient pas aux messages.

**Cause** : Le watchdog ne vérifiait que l'état du WebSocket, pas si WhatsApp envoyait réellement les messages.

**Solution** (v4.0.0) : Ajout d'une sonde active `sock.sendPresenceUpdate()` avec timeout 8s. Les sessions "zombies" sont maintenant détectées et reconnectées automatiquement.

```javascript
// Avant : passif
if (sock.ws.readyState !== 1) reconnect();

// Après : actif + timeout
try {
  await Promise.race([
    sock.sendPresenceUpdate('available'),
    new Promise((_, rej) => setTimeout(() => rej(), 8000))
  ]);
} catch (e) {
  // Session zombie → reconnect
  await reconnectSession(phone);
}
```

---

## 📞 Contacts & Réseaux Sociaux

Pour toute question, autorisation, ou demande commerciale, contacte **SEIGNEUR** :

### WhatsApp 📱

<a href="https://wa.me/235912345567" target="_blank">
  <img src="https://img.shields.io/badge/WhatsApp-+235--91234567-25D366?style=flat-square&logo=whatsapp&logoColor=white" alt="WhatsApp 1" />
</a>

<a href="https://wa.me/235912345568" target="_blank">
  <img src="https://img.shields.io/badge/WhatsApp-+235--91234568-25D366?style=flat-square&logo=whatsapp&logoColor=white" alt="WhatsApp 2" />
</a>

### Facebook 👥

<a href="https://www.facebook.com/mahamat.oumar.moussa.2025" target="_blank">
  <img src="https://img.shields.io/badge/Facebook-Mahamat%20Oumar%20Moussa-1877F2?style=flat-square&logo=facebook&logoColor=white" alt="Facebook" />
</a>

### Telegram 📢

<a href="https://t.me/Seigneur_235" target="_blank">
  <img src="https://img.shields.io/badge/Telegram-@Seigneur__235-0088cc?style=flat-square&logo=telegram&logoColor=white" alt="Telegram" />
</a>

### TikTok 🎵

<a href="https://www.tiktok.com/@dogordami_1" target="_blank">
  <img src="https://img.shields.io/badge/TikTok-@dogordami__1-000000?style=flat-square&logo=tiktok&logoColor=white" alt="TikTok" />
</a>

### Email 📧

<a href="mailto:leseigneur235@gmail.com">
  <img src="https://img.shields.io/badge/Email-leseigneur235%40gmail.com-EA4335?style=flat-square&logo=gmail&logoColor=white" alt="Email" />
</a>

---

## 🎯 Cas d'Usage

- ✅ Communauté Discord/Telegram ↔ WhatsApp
- ✅ Support client automatisé
- ✅ Notifications en masse
- ✅ Téléchargement de médias
- ✅ Jeux interactifs en groupe
- ✅ Modération de groupes WhatsApp

---

## 📊 Performance & Limitations

| Métrique | Valeur |
|---|---|
| Sessions simultanées | Illimitées* |
| Mémoire par session | ~50-80 MB |
| Temps de reconnexion | <5 secondes |
| Latence réponse | <500ms (local) |

*Dépend de la RAM du serveur

---

## 🔐 Sécurité

- ✅ Les tokens WhatsApp sont stockés localement (`auth_info_baileys/`)
- ✅ Les credentials ne sont **jamais** uploadés
- ✅ L'API web supporte CORS limité
- ❌ **NE PARTAGE JAMAIS** tes fichiers `auth_info_baileys/`

---

## 📜 License

**ISC** — Mais : ⚠️ **AUCUNE UTILISATION SANS AUTORISATION**

Voir la [notice légale](#-avertissement-légal--droits-dauteur) au début de ce fichier.

---

## 🙌 Crédits

- **Auteur** : SEIGNEUR (Mahamat Oumar Moussa)
- **Basé sur** : [Baileys](https://github.com/WhiskeySockets/Baileys)
- **Hébergé sur** : Pterodactyl / VPS

---

## 💬 Support

Pour les **bugs**, les **questions**, ou les **demandes d'autorisation** :

1. 📧 Email : `leseigneur235@gmail.com`
2. 💬 Telegram : `@Seigneur_235`
3. 📱 WhatsApp : `+235 91234567`

---

<div align="center">

**Made with ❤️ in Chad 🇹🇩**

© 2024-2026 SEIGNEUR. Tous droits réservés.

</div>
