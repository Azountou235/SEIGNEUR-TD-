# ⚡ SEIGNEUR TD BOT 🇹🇩

Bot WhatsApp Multi-Device — LE SEIGNEUR DES APPAREILS

---

## 🚀 INSTALLATION (Choisis ton système)

### ▶️ Windows (PC)
1. Installe **Node.js** : https://nodejs.org/fr/download (bouton vert)
2. Double-clique sur **INSTALLER.bat**
3. Entre ton numéro WhatsApp quand demandé (ex: 23591234568)
4. Un code à 8 chiffres s'affiche → va dans WhatsApp → **Appareils liés** → **Lier un appareil** → entre le code

### ▶️ Android (Termux)
1. Installe **Termux** depuis F-Droid : https://f-droid.org
2. Ouvre Termux et tape :
```
cd /sdcard/seigneur-td
bash install.sh
```

### ▶️ Linux / VPS
```bash
cd seigneur-td
bash install.sh
```

---

## 📋 COMMANDES

### 🛡️ Owner / Admin
| Commande | Description |
|---|---|
| .menu | Afficher le menu complet |
| .ping | Tester la vitesse |
| .alive | Statut du bot |
| .info | Infos du bot |
| .owner | Contact du propriétaire |
| .mode public/private | Changer le mode |
| .antidelete | Anti suppression |
| .antiedit | Anti modification |
| .antilink | Anti liens |
| .autoreact | Réactions automatiques |
| .block @user | Bloquer un contact |
| .unblock @user | Débloquer |
| .sudo @user | Ajouter un admin |
| .delsudo @user | Retirer un admin |
| .update | Mettre à jour le bot |

### 👥 Groupe
| Commande | Description |
|---|---|
| .kick @user | Expulser un membre |
| .add [numéro] | Ajouter un membre |
| .promote @user | Promouvoir admin |
| .demote @user | Rétrograder |
| .mute | Fermer le groupe |
| .unmute | Ouvrir le groupe |
| .tagall | Mentionner tout le monde |
| .invite | Lien d'invitation |
| .revoke | Réinitialiser le lien |
| .gname [nom] | Changer le nom |
| .gdesc [desc] | Changer la description |
| .setppgc | Changer la photo du groupe |
| .groupinfo | Infos du groupe |
| .listadmin | Liste des admins |
| .rules | Voir les règles |
| .setrules [texte] | Définir les règles |
| .welcome on/off | Message de bienvenue |
| .bye on/off | Message d'au revoir |
| .warn @user | Avertissement (3 = kick) |
| .resetwarn @user | Réinitialiser les warns |
| .listwarn | Voir les avertissements |
| .leave | Quitter le groupe |

### 📥 Téléchargement
| Commande | Description |
|---|---|
| .tt [lien] | TikTok (sans watermark) |
| .ig [lien] | Instagram (photo/vidéo/reels) |
| .fb [lien] | Facebook (vidéo/reels) |
| .pin [lien] | Pinterest |
| .sv [lien] | SnackVideo |
| .cc [lien] | CapCut |
| .ytmp3 [lien] | YouTube → MP3 |
| .ytmp4 [lien] | YouTube → MP4 |
| .yts [titre] | Recherche YouTube |
| .gdrive [lien] | Google Drive |
| .mediafire [lien] | MediaFire |

### 🎨 Média
| Commande | Description |
|---|---|
| .sticker / .s | Image/vidéo → Sticker |
| .toimg | Sticker → Image |
| .vv | Voir les "vu unique" |
| .tostatus | Publier en status |

---

## ⚙️ CONFIGURATION

Ouvre `index.js` et modifie au début :

```js
const config = {
  botName: 'SEIGNEUR TD',   // Nom du bot
  prefix:  '.',              // Préfixe des commandes
};

const EXTRA_OWNER_NUM = ''; // Ton numéro si tu veux être owner fixe
                             // ex: '23591234568'
```

---

## ❓ PROBLÈMES FRÉQUENTS

| Problème | Solution |
|---|---|
| Le bot ne répond plus | Relance avec START.bat |
| Déconnecté (loggedOut) | Supprime le dossier `auth_info_baileys` et relance |
| Erreur "No sessions" | Normal, le bot se reconnecte automatiquement |
| Sticker ne marche pas | Fichier trop grand (max 1MB image, 500KB vidéo) |
| Download échoue | L'API externe est peut-être temporairement down, réessaie |

---

*Powered by SEIGNEUR TD 🇹🇩 — LE SEIGNEUR DES APPAREILS*
