#!/bin/bash
echo ""
echo "⚡ SEIGNEUR TD — Installation automatique 🇹🇩"
echo "============================================="
echo ""

# Vérifier Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js non trouvé. Installation..."
    # Pour Termux (Android)
    if command -v pkg &> /dev/null; then
        pkg update -y
        pkg install nodejs -y
    # Pour Ubuntu/Debian
    elif command -v apt &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    else
        echo "❌ Impossible d'installer Node.js automatiquement."
        echo "   Installe Node.js manuellement: https://nodejs.org"
        exit 1
    fi
fi

echo "✅ Node.js: $(node -v)"
echo ""

# Installer les dépendances
echo "📦 Installation des dépendances..."
npm install
echo ""

if [ $? -ne 0 ]; then
    echo "❌ Erreur lors de l'installation."
    exit 1
fi

echo "✅ Installation terminée!"
echo ""
echo "🚀 Démarrage du bot..."
echo "(Entre ton numéro WhatsApp quand demandé)"
echo ""
node index.js
