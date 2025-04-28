const log = (...args) => console.log("%c[background.js]", "color: green; font-weight: bold;", ...args);
const warn = (...args) => console.warn("%c[background.js WARNING]", "color: orange; font-weight: bold;", ...args);
const error = (...args) => console.error("%c[background.js ERROR]", "color: red; font-weight: bold;", ...args);

let streamInitialized = false;
let offscreenReady = false;
let popupPort = null;


async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument();
  log("Checking offscreen document status:", existing);

  if (!existing) {
    try {
      log("Creating offscreen document...");
      log("Offscreen doc URL:", chrome.runtime.getURL("offscreen.html"));
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL("offscreen.html"),
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Required for audio compression.",
      });
      log("📄 Offscreen document created. Waiting for it to report readiness...");
      await waitForOffscreenReadySignal();
      log("✅ Offscreen document is fully ready.");
    } catch (err) {
      error("❌ Failed to create offscreen document:", err);
    }
  } else {
    if (!offscreenReady) {
      log("Offscreen exists but not marked ready yet. Waiting...");
      await waitForOffscreenReadySignal();
    } else {
      log("ℹ️ Offscreen document already exists and is ready.");
    }
  }
}

function waitForOffscreenReadySignal() {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (offscreenReady) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "popup-control") {
    popupPort = port;
    log("📡 Popup connected for control.");

    port.onMessage.addListener((msg) => {
      if (msg.type === "update-compressor-settings") {
        log("➡️ Forwarding compressor settings from popup to offscreen:", msg.data);
        chrome.runtime.sendMessage(msg); // Forward to offscreen.js
      }
    });

    port.onDisconnect.addListener(() => {
      log("🔌 Popup control disconnected.");
      popupPort = null;
    });
  }
});



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log("📩 Message received in background.js:", message);

  // Offscreen signals it's ready
  if (message.type === "offscreen-ready") {
    log("✅ Offscreen document reports READY.");
    offscreenReady = true;
    return;
  }

  // Popup checking if offscreen exists (IMPORTANT FIX!)
  if (message.type === "check-offscreen") {
    chrome.offscreen.hasDocument((exists) => {
      log("Popup check-offscreen request → Exists:", exists, "Ready flag:", offscreenReady);
      sendResponse({ ready: exists });
    });
    return true; // CRUCIAL to keep port open!
  }

  if (message.type === "gain-reduction-update") {
    if (popupPort) {
      popupPort.postMessage({
        type: "gain-reduction-update",
        data: message.data
      });
    }
    return; // no need to sendResponse
  }
  // Start streaming
  if (message.type === "start-streaming") {
    if (streamInitialized) {
      warn("⚠️ Stream already initialized. Ignoring duplicate request.");
      sendResponse({ success: true });
      return true;
    }

    (async () => {
      try {
        await ensureOffscreen();
        log("Ensure offscreen document completed.");

        log("➡️ Forwarding process-stream to offscreen.js:", message.data.streamId);

        chrome.runtime.sendMessage(
          { type: "process-stream", data: { streamId: message.data.streamId } },
          (response) => {
            log("🔙 Received response from offscreen.js:", response);
            if (response?.success) {
              log("✅ Streaming successfully started.");
              streamInitialized = true;
              sendResponse({ success: true });
            } else {
              error("❌ Offscreen document failed to process stream.");
              sendResponse({ success: false, error: "Failed in offscreen document." });
            }
          }
        );
      } catch (err) {
        error("Error initializing stream:", err);
        sendResponse({ success: false, error: err });
      }
    })();

    return true; // Important async port hold
  }

  // Forward compressor settings
  if (message.type === "update-compressor-settings") {
    log("➡️ Forwarding compressor settings to offscreen.js:", message.data);
    chrome.runtime.sendMessage(message);
    sendResponse({ success: true });
    return true;
  }
});
