// FILE: extension/background.js

console.log("[Background] Service worker started");

// Helper: Count nodes in DOM tree
function countNodes(node) {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, child) => sum + countNodes(child), 0);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Received message type:", message.type);

  if (message.type === "VOICE_COMMAND_INTENT") {
    // Phase 1: Intent Classification (NO DOM)
    const { utterance, url, title } = message.payload || {};

    console.log("[Background] Phase 1: Intent classification");
    console.log("  - Utterance:", utterance);
    console.log("  - URL:", url);
    console.log("  - Title:", title);

    const payloadSize = JSON.stringify(message.payload).length;
    const sizeKB = (payloadSize / 1024).toFixed(2);
    console.log(`[Background] Phase 1 payload size: ${sizeKB}KB`);

    fetch("http://localhost:3000/api/voice-command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "VOICE_COMMAND_INTENT",
        payload: { utterance, url, title }
      })
    })
      .then((res) => {
        console.log("[Background] Phase 1 response status:", res.status, res.statusText);
        return res.json();
      })
      .then((data) => {
        console.log("[Background] Phase 1 response data:", data);
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        console.error("[Background] Phase 1 error:", err);
        sendResponse({
          ok: false,
          error: err && err.message ? err.message : String(err),
        });
      });

    return true; // Keep channel open

  } else if (message.type === "VOICE_COMMAND_DOM") {
    // Phase 2: DOM Analysis (WITH DOM)
    const { actionType, utterance, url, title, dom, domTimestamp } = message.payload || {};

    const payloadSize = JSON.stringify(message.payload).length;
    const sizeKB = (payloadSize / 1024).toFixed(2);

    console.log("[Background] Phase 2: DOM analysis");
    console.log("  - Action type:", actionType);
    console.log("  - Utterance:", utterance);
    console.log("  - DOM nodes:", dom ? countNodes(dom) : 0);
    console.log("  - Payload size:", sizeKB, "KB");

    if (payloadSize > 1024 * 1024) {
      console.warn("[Background] Large payload detected (>1MB), may be slow");
    }

    fetch("http://localhost:3000/api/voice-command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "VOICE_COMMAND_DOM",
        payload: { actionType, utterance, url, title, dom, domTimestamp }
      })
    })
      .then((res) => {
        console.log("[Background] Phase 2 response status:", res.status, res.statusText);
        return res.json();
      })
      .then((data) => {
        console.log("[Background] Phase 2 response data:", data);
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        console.error("[Background] Phase 2 error:", err);
        sendResponse({
          ok: false,
          error: err && err.message ? err.message : String(err),
        });
      });

    return true; // Keep channel open
  }
});
