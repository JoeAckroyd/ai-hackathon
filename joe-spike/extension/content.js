// FILE: extension/content.js

(function () {
  console.log("[VoiceAssistant] Content script loaded on:", window.location.href);

  // Check for Speech Recognition API support
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn("[VoiceAssistant] Speech Recognition API not supported in this browser");
    return;
  }

  console.log("[VoiceAssistant] Speech Recognition API detected");

  // State
  let listening = false;
  let recognition = null;

  // Create floating microphone button
  const micButton = document.createElement("button");
  micButton.textContent = "🎙️";
  micButton.style.position = "fixed";
  micButton.style.bottom = "20px";
  micButton.style.right = "20px";
  micButton.style.width = "60px";
  micButton.style.height = "60px";
  micButton.style.borderRadius = "50%";
  micButton.style.border = "none";
  micButton.style.backgroundColor = "#007bff";
  micButton.style.color = "white";
  micButton.style.fontSize = "24px";
  micButton.style.cursor = "pointer";
  micButton.style.boxShadow = "0 4px 6px rgba(0,0,0,0.3)";
  micButton.style.zIndex = "999999";
  micButton.style.transition = "all 0.3s ease";

  micButton.addEventListener("mouseenter", () => {
    micButton.style.transform = "scale(1.1)";
  });

  micButton.addEventListener("mouseleave", () => {
    micButton.style.transform = "scale(1)";
  });

  document.body.appendChild(micButton);
  console.log("[VoiceAssistant] Microphone button injected into page");

  // Setup Speech Recognition
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  console.log("[VoiceAssistant] Speech Recognition configured");

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    console.log("[VoiceAssistant] Transcript received:", transcript);
    handleTranscript(transcript);
  };

  recognition.onerror = (event) => {
    console.error("[VoiceAssistant] Speech recognition error:", event.error);
    listening = false;
    micButton.textContent = "🎙️";
    micButton.style.backgroundColor = "#007bff";
  };

  recognition.onend = () => {
    console.log("[VoiceAssistant] Speech recognition ended");
    listening = false;
    micButton.textContent = "🎙️";
    micButton.style.backgroundColor = "#007bff";
  };

  // Button click handler
  micButton.addEventListener("click", () => {
    if (!listening) {
      try {
        console.log("[VoiceAssistant] Starting speech recognition...");
        recognition.start();
        listening = true;
        micButton.textContent = "🔴";
        micButton.style.backgroundColor = "#dc3545";
      } catch (err) {
        console.error("[VoiceAssistant] Error starting recognition:", err);
      }
    } else {
      console.log("[VoiceAssistant] Stopping speech recognition...");
      recognition.stop();
      listening = false;
      micButton.textContent = "🎙️";
      micButton.style.backgroundColor = "#007bff";
    }
  });

  // Text-to-speech function
  function speak(text) {
    console.log("[VoiceAssistant] Speaking:", text);
    if (!window.speechSynthesis) {
      console.warn("[VoiceAssistant] speechSynthesis not supported");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  // Handle transcript from speech recognition
  function handleTranscript(text) {
    console.log("[VoiceAssistant] handleTranscript called with:", text);

    const url = window.location.href;
    const title = document.title || "";
    const pageText =
      document.body && document.body.innerText
        ? document.body.innerText.slice(0, 2000)
        : "";

    console.log("[VoiceAssistant] Collected page context:");
    console.log("  - URL:", url);
    console.log("  - Title:", title);
    console.log("  - Page text length:", pageText.length);

    console.log("[VoiceAssistant] Sending message to background script...");

    chrome.runtime.sendMessage(
      {
        type: "VOICE_COMMAND",
        payload: { utterance: text, url, title, pageText },
      },
      (response) => {
        console.log("[VoiceAssistant] Received response from background:", response);

        if (!response) {
          console.error("[VoiceAssistant] No response from background");
          speak("Sorry, I didn't get a response from the server.");
          return;
        }

        if (!response.ok) {
          console.error(
            "[VoiceAssistant] Error from background/server:",
            response.error
          );
          speak("Sorry, something went wrong talking to the server.");
          return;
        }

        const data = response.data;
        console.log("[VoiceAssistant] Server data:", data);

        if (data && typeof data === "object") {
          const { action, params, speakText } = data;
          console.log("[VoiceAssistant] Extracted from response:");
          console.log("  - action:", action);
          console.log("  - params:", params);
          console.log("  - speakText:", speakText);

          if (speakText) speak(speakText);
          if (action) runCommand(action, params || {});
        }
      }
    );
  }

  // Execute commands
  function runCommand(action, params = {}) {
    console.log("[VoiceAssistant] runCommand called:");
    console.log("  - action:", action);
    console.log("  - params:", params);

    if (action === "navigateEmail") {
      console.log("[VoiceAssistant] Navigating to Gmail inbox...");
      // Navigate to Gmail inbox (demo)
      window.location.href = "https://mail.google.com/mail/u/0/#inbox";
    } else if (action === "describePageContext") {
      console.log("[VoiceAssistant] Describing page context...");
      describePageContext();
    } else if (action === "countUnreadEmails") {
      console.log("[VoiceAssistant] Counting unread emails...");
      countUnreadEmails();
    } else if (action === "none") {
      console.log("[VoiceAssistant] No action needed (small talk)");
      // Do nothing (e.g., small talk only)
    } else {
      console.log("[VoiceAssistant] Unknown action from server:", action, params);
    }
  }

  // Helper functions for Gmail detection
  function isGmail() {
    return window.location.hostname.includes("mail.google.com");
  }

  function isInboxView() {
    if (!isGmail()) return false;
    const hash = window.location.hash || "";
    const looksLikeInbox = hash.includes("#inbox");

    const inboxLabels = Array.from(
      document.querySelectorAll("a[title*='Inbox'], a[aria-label*='Inbox']"),
    );
    const hasInboxLabel = inboxLabels.length > 0;

    return looksLikeInbox || hasInboxLabel;
  }

  // Describe the current page context
  function describePageContext() {
    console.log("[VoiceAssistant] describePageContext called");
    console.log("  - isGmail():", isGmail());
    console.log("  - isInboxView():", isInboxView());

    if (isInboxView()) {
      console.log("[VoiceAssistant] User is in inbox");
      speak("You are in your email inbox.");
    } else if (isGmail()) {
      console.log("[VoiceAssistant] User is in Gmail but not inbox");
      speak("You are in your email, but not in the main inbox.");
    } else {
      console.log("[VoiceAssistant] User is not on Gmail");
      speak("You are not on your email page.");
    }
  }

  // Count unread emails in Gmail
  // NOTE: This uses heuristic selectors that work with many current Gmail layouts.
  // These may need adjustment if Gmail's DOM structure changes significantly.
  function countUnreadEmails() {
    console.log("[VoiceAssistant] countUnreadEmails called");

    if (!isGmail()) {
      console.log("[VoiceAssistant] Not on Gmail, cannot count emails");
      speak("I can only count unread emails when you are on your Gmail page.");
      return;
    }

    // Heuristic for unread rows; this matches many current Gmail layouts.
    let unreadRows = document.querySelectorAll(".zA.zE");
    let unreadCount = unreadRows.length;
    console.log("[VoiceAssistant] Found", unreadCount, "unread rows using .zA.zE selector");

    if (unreadCount === 0) {
      console.log("[VoiceAssistant] No unread found with .zA.zE, trying aria-label fallback...");
      // Fallback heuristic based on aria-label containing 'unread'
      const allRows = document.querySelectorAll(".zA, tr");
      console.log("[VoiceAssistant] Found", allRows.length, "total rows to check");
      unreadCount = Array.from(allRows).filter((row) => {
        const aria = row.getAttribute && row.getAttribute("aria-label");
        if (!aria) return false;
        return aria.toLowerCase().includes("unread");
      }).length;
      console.log("[VoiceAssistant] Found", unreadCount, "unread rows using aria-label fallback");
    }

    console.log("[VoiceAssistant] Final unread count:", unreadCount);

    if (unreadCount === 0) {
      speak("It looks like you have no unread emails in this view.");
    } else if (unreadCount === 1) {
      speak("You have one unread email.");
    } else {
      speak(`You have ${unreadCount} unread emails.`);
    }
  }
})();
