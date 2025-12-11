// FILE: extension/background.js

console.log("[Background] Service worker started");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Received message:", message);

  if (message.type === "VOICE_COMMAND") {
    const { utterance, url, title, pageText } = message.payload || {};

    console.log("[Background] Processing VOICE_COMMAND:");
    console.log("  - Utterance:", utterance);
    console.log("  - URL:", url);
    console.log("  - Title:", title);
    console.log("  - Page text length:", pageText?.length || 0);

    console.log("[Background] Fetching http://localhost:3000/api/voice-command...");

    fetch("http://localhost:3000/api/voice-command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utterance, url, title, pageText }),
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
