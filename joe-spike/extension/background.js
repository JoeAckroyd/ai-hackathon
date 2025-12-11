// FILE: extension/background.js

console.log("[Background] Service worker started");

// Helper: Count nodes in DOM tree
function countNodes(node) {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, child) => sum + countNodes(child), 0);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Received message:", message);

  if (message.type === "VOICE_COMMAND") {
    const { utterance, url, title, pageText, dom, domTimestamp } = message.payload || {};

    console.log("[Background] Processing VOICE_COMMAND:");
    console.log("  - Utterance:", utterance);
    console.log("  - URL:", url);
    console.log("  - Title:", title);
    console.log("  - Page text length:", pageText?.length || 0);
    console.log("  - DOM nodes:", dom ? countNodes(dom) : 0);

    // Check payload size
    const payloadSize = JSON.stringify(message.payload).length;
    const sizeKB = (payloadSize / 1024).toFixed(2);
    console.log(`[Background] Payload size: ${sizeKB}KB`);

    if (payloadSize > 1024 * 1024) {
      console.warn("[Background] Large payload detected (>1MB), may be slow");
    }

    console.log("[Background] Fetching http://localhost:3000/api/voice-command...");

    fetch("http://localhost:3000/api/voice-command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utterance, url, title, pageText, dom, domTimestamp }),
    })
      .then((res) => {
        console.log("[Background] Fetch response status:", res.status, res.statusText);
        return res.json();
      })
      .then((data) => {
        console.log("[Background] Parsed response data:", data);
        console.log("[Background] Sending success response to content script");
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        console.error("[Background] Error calling dev server:", err);
        console.error("[Background] Error details:", {
          message: err.message,
          stack: err.stack,
        });
        sendResponse({
          ok: false,
          error: err && err.message ? err.message : String(err),
        });
      });

    return true; // keep message channel open
  }
});
