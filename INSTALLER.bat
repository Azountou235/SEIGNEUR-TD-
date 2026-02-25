@echo off
chcp 65001 >nul
echo.
echo  ⚡ SEIGNEUR TD — Installation automatique 🇹🇩
echo  =============================================
echo.

:: Vérifier Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo  ❌ Node.js n'est pas installé!
    echo.
    echo  👉 Télécharge et installe Node.js ici:
    echo     https://nodejs.org/fr/download
    echo.
    echo  Relance ce script après l'installation.
    pause
    exit
)

echo  ✅ Node.js détecté: 
node -v
echo.

:: Installer les dépendances
echo  📦 Installation des dépendances...
npm install
echo.

if %errorlevel% neq 0 (
    echo  ❌ Erreur lors de l'installation.
    echo  Essaie de relancer ce script en administrateur.
    pause
    exit
)

echo  ✅ Installation terminée!
echo.
echo  🚀 Démarrage du bot...
echo  (Entre ton numéro WhatsApp quand demandé)
echo.
node index.js
pause
