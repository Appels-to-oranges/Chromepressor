const log = (...args) => console.log("%c[popup.js]", "color: blue; font-weight: bold;", ...args);
const error = (...args) => console.error("%c[popup.js ERROR]", "color: red; font-weight: bold;", ...args);

document.addEventListener("DOMContentLoaded", async () => {
  log("📄 Popup loaded.");

  const applyButton = document.getElementById("apply");
  if (!applyButton) {
    error("❌ Apply button not found.");
    return;
  }

  let streamSent = false;

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (!activeTab?.id) {
    error("❌ No valid active tab found.");
    return;
  }
  log("🟢 Active tab detected:", activeTab);

  // ✅ Establish persistent port to background.js
  const controlPort = chrome.runtime.connect({ name: "popup-control" });

  function sendCompressorSettings(settings) {
    controlPort.postMessage({
      type: "update-compressor-settings",
      data: settings
    });
  }

  applyButton.addEventListener("click", async () => {
    try {
      log("🎛️ Apply button clicked.");

      const compressorSettings = {
        threshold: parseFloat(document.getElementById("threshold").value),
        ratio: parseFloat(document.getElementById("ratio").value),
        attack: parseFloat(document.getElementById("attack").value),
        release: parseFloat(document.getElementById("release").value),
        gain: parseFloat(document.getElementById("gain").value),
      };

      if (!streamSent) {
        log("🎥 Capturing media stream...");
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: activeTab.id });
        log("✅ Stream ID captured:", streamId);

        const response = await chrome.runtime.sendMessage({
          type: "start-streaming",
          data: { streamId },
        });

        log("🔙 Response from start-streaming:", response);

        if (response?.success) {
          log("✅ Streaming started successfully.");
          streamSent = true;
        } else {
          error("❌ Failed to start streaming:", response?.error || "No response received.");
          return;
        }
      }

      log("🔄 Sending updated compressor settings.");
      sendCompressorSettings(compressorSettings);

    } catch (err) {
      error("🚨 Error in apply button click handler:", err);
    }
  });

  // Optional: Handle background sending gain reduction or status updates
  controlPort.onMessage.addListener((msg) => {
    log("📡 Message from background:", msg);
    if (msg.type === "gain-reduction-update") {
      const reductionValue = document.getElementById("reductionValue");
      if (reductionValue) {
        reductionValue.textContent = `${msg.data.reduction.toFixed(1)} dB`;
      }
    }    
    // You could update gain reduction meter here in future
  });
});
