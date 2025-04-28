// const log = (...args) => console.log("%c[offscreen.js]", "color: purple; font-weight: bold;", ...args);
// const warn = (...args) => console.warn("%c[offscreen.js WARNING]", "color: orange; font-weight: bold;", ...args);
// const error = (...args) => console.error("%c[offscreen.js ERROR]", "color: red; font-weight: bold;", ...args);

log("📄 Offscreen.js initialized.");

let audioContext;
let source;
let compressor;
let gainNode;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log("📩 Message received in offscreen.js:", message);

  if (message.type === "process-stream") {
    if (audioContext) {
      warn("⚠️ Audio context already exists. Skipping re-initialization.");
      sendResponse({ success: true });
      return true;
    }

    const { streamId } = message.data;
    log("🎙️ Attempting to access media stream with streamId:", streamId);

    navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    }).then((media) => {
      log("✅ Media stream successfully accessed.");

      audioContext = new AudioContext();
      source = audioContext.createMediaStreamSource(media);
      compressor = audioContext.createDynamicsCompressor();
      gainNode = audioContext.createGain();

      source.connect(compressor).connect(gainNode).connect(audioContext.destination);

      log("🎚️ Audio nodes connected. Compression ready.");
      sendResponse({ success: true });
    }).catch((err) => {
      error("❌ getUserMedia threw error:", err);
      sendResponse({ success: false, error: err.message });
    });

    return true;
  }

  log("🎚️ Audio nodes connected. Compression ready.");
  sendResponse({ success: true });
  
  // Start sending reduction data periodically
  setInterval(() => {
    if (compressor) {
      const reduction = compressor.reduction;
      chrome.runtime.sendMessage({
        type: "gain-reduction-update",
        data: { reduction }
      });
    }
  }, 100);
  
  if (message.type === "update-compressor-settings") {
    if (!compressor || !gainNode) {
      error("⚠️ Compressor not initialized yet. Cannot apply settings.");
      sendResponse({ success: false, error: "Compressor not initialized" });
      return true;
    }

    log("🔄 Updating compressor settings:", message.data);
    compressor.threshold.value = message.data.threshold;
    compressor.ratio.value = message.data.ratio;
    compressor.attack.value = message.data.attack;
    compressor.release.value = message.data.release;
    gainNode.gain.value = message.data.gain;
    log("✅ Compressor settings applied successfully.");
    sendResponse({ success: true });
    return true;
  }

  warn("⚠️ Unknown message type received in offscreen.js:", message.type);
  sendResponse({ success: false, error: "Unknown message type" });
  return true;
});

chrome.runtime.sendMessage({ type: "offscreen-ready" });
log("🚀 Offscreen.js fully loaded and reported ready.");
