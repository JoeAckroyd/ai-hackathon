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

  // DOM Capture State
  let cachedDOM = null;
  let domCaptureTimestamp = null;

  // Helper: Generate XPath for an element
  function generateXPath(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    // If element has an ID, use it for shorter XPath
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const parts = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName.toLowerCase() !== 'html') {
      let index = 1;
      let sibling = current.previousSibling;

      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }

      const tagName = current.tagName.toLowerCase();
      const part = index > 1 ? `${tagName}[${index}]` : tagName;
      parts.unshift(part);

      current = current.parentNode;
    }

    return '/' + parts.join('/');
  }

  // Helper: Serialize element to JSON tree
  function serializeElement(element, depth, maxDepth = 10) {
    // Base case: too deep
    if (depth > maxDepth) {
      return null;
    }

    // Skip non-element nodes
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const tagName = element.tagName.toLowerCase();

    // Filter out unwanted elements
    if (['script', 'style', 'noscript', 'svg', 'iframe'].includes(tagName)) {
      return null;
    }

    // Check if element is visible and capture style info
    let computedStyle = null;
    try {
      computedStyle = window.getComputedStyle(element);
      if (computedStyle.display === 'none' ||
          computedStyle.visibility === 'hidden' ||
          parseFloat(computedStyle.opacity) === 0 ||
          element.getAttribute('aria-hidden') === 'true') {
        return null;
      }
    } catch (e) {
      // Some elements may not have computed style, skip them
      return null;
    }

    // Build element representation
    const node = {
      tag: tagName,
      attrs: {},
      text: '',
      xpath: generateXPath(element),
      style: {},
      children: []
    };

    // Capture relevant computed styles for important elements
    // Only capture for interactive or semantic elements to reduce size
    const captureStyleFor = ['a', 'button', 'input', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'nav', 'header', 'footer'];
    if (computedStyle && captureStyleFor.includes(tagName)) {
      // Capture color information
      const color = computedStyle.color;
      const bgColor = computedStyle.backgroundColor;
      const fontSize = computedStyle.fontSize;

      if (color && color !== 'rgb(0, 0, 0)') { // Skip default black
        node.style.color = color;
      }
      if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') { // Skip transparent
        node.style.backgroundColor = bgColor;
      }
      if (fontSize) {
        node.style.fontSize = fontSize;
      }
    }

    // Capture relevant attributes
    const relevantAttrs = ['id', 'class', 'href', 'src', 'alt', 'title',
                           'type', 'value', 'placeholder', 'aria-label',
                           'role', 'name', 'data-testid'];
    relevantAttrs.forEach(attr => {
      const val = element.getAttribute(attr);
      if (val && val.length < 200) { // Skip very long attribute values
        node.attrs[attr] = val;
      }
    });

    // Capture immediate text content (not from children)
    const immediateText = Array.from(element.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent.trim())
      .filter(t => t.length > 0)
      .join(' ')
      .slice(0, 100); // Truncate long text

    if (immediateText) {
      node.text = immediateText;
    }

    // Recursively process children
    const children = Array.from(element.children);
    for (let i = 0; i < children.length; i++) {
      const serialized = serializeElement(children[i], depth + 1, maxDepth);
      if (serialized) {
        node.children.push(serialized);
      }
    }

    return node;
  }

  // Capture and cache DOM tree
  function captureDOM() {
    console.log("[VoiceAssistant] Capturing DOM tree...");
    const startTime = performance.now();

    const domTree = serializeElement(document.body, 0);
    const serialized = JSON.stringify(domTree);
    const sizeKB = (serialized.length / 1024).toFixed(2);

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);

    console.log(`[VoiceAssistant] DOM captured in ${duration}ms`);
    console.log(`[VoiceAssistant] Serialized size: ${sizeKB}KB`);

    cachedDOM = domTree;
    domCaptureTimestamp = Date.now();

    return domTree;
  }

  // Setup DOM watcher for dynamic content (SPAs, AJAX)
  function setupDOMWatcher() {
    console.log("[VoiceAssistant] Setting up DOM mutation observer...");

    const observer = new MutationObserver((mutations) => {
      // Debounce: only recapture after 500ms of no changes
      clearTimeout(window.domCaptureTimeout);
      window.domCaptureTimeout = setTimeout(() => {
        console.log("[VoiceAssistant] DOM changed, recapturing...");
        captureDOM();
      }, 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false // Don't track attribute changes to reduce noise
    });

    console.log("[VoiceAssistant] DOM mutation observer active");
    return observer;
  }

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

  // Action: Navigate to URL
  function handleNavigate(params) {
    const { url } = params;

    if (!url) {
      console.error("[VoiceAssistant] No URL provided for navigation");
      speak("Sorry, I couldn't determine where to navigate.");
      return;
    }

    console.log("[VoiceAssistant] Navigating to:", url);
    window.location.href = url;
  }

  // Action: Click on element
  function handleClick(params) {
    const { xpath, selector, description } = params;

    console.log("[VoiceAssistant] Attempting to click element:");
    console.log("  - XPath:", xpath);
    console.log("  - Selector:", selector);
    console.log("  - Description:", description);

    let element = null;

    // Try CSS selector first (more reliable)
    if (selector) {
      try {
        element = document.querySelector(selector);
        if (element) {
          console.log("[VoiceAssistant] Found element via selector:", selector);
        }
      } catch (e) {
        console.warn("[VoiceAssistant] Invalid selector:", selector, e);
      }
    }

    // Fallback to XPath
    if (!element && xpath) {
      try {
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        element = result.singleNodeValue;
        if (element) {
          console.log("[VoiceAssistant] Found element via XPath:", xpath);
        }
      } catch (e) {
        console.warn("[VoiceAssistant] Invalid XPath:", xpath, e);
      }
    }

    if (element) {
      console.log("[VoiceAssistant] Found element, preparing to click:", element);

      // Scroll into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Highlight element for visual feedback
      const originalOutline = element.style.outline;
      element.style.outline = '3px solid #007bff';

      setTimeout(() => {
        // Restore original outline
        element.style.outline = originalOutline;

        // Click the element
        element.click();
        console.log("[VoiceAssistant] Clicked element successfully");

        const desc = description || 'the element';
        speak(`Clicked on ${desc}`);
      }, 300);
    } else {
      console.error("[VoiceAssistant] Could not find element to click");
      console.error("  - Tried XPath:", xpath);
      console.error("  - Tried selector:", selector);
      speak("Sorry, I couldn't find that element on the page.");
    }
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

    // Include cached DOM tree
    const domTree = cachedDOM || captureDOM();
    const domAge = domCaptureTimestamp ? Date.now() - domCaptureTimestamp : 0;

    console.log("[VoiceAssistant] Collected page context:");
    console.log("  - URL:", url);
    console.log("  - Title:", title);
    console.log("  - Page text length:", pageText.length);
    console.log(`  - DOM snapshot age: ${domAge}ms`);

    console.log("[VoiceAssistant] Sending message to background script...");

    chrome.runtime.sendMessage(
      {
        type: "VOICE_COMMAND",
        payload: {
          utterance: text,
          url,
          title,
          pageText,
          dom: domTree,
          domTimestamp: domCaptureTimestamp
        },
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

    if (action === "navigate") {
      console.log("[VoiceAssistant] Executing navigate action...");
      handleNavigate(params);
    } else if (action === "describe") {
      console.log("[VoiceAssistant] Executing describe action (AI-generated description)");
      // Description is in speakText, no client-side action needed
    } else if (action === "click") {
      console.log("[VoiceAssistant] Executing click action...");
      handleClick(params);
    } else if (action === "navigateEmail") {
      console.log("[VoiceAssistant] Navigating to Gmail inbox...");
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

  // Initialize DOM capture on page load
  console.log("[VoiceAssistant] Setting up DOM capture listeners...");

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log("[VoiceAssistant] DOMContentLoaded event fired");
      captureDOM();
      setupDOMWatcher();
    });
  } else {
    // DOM already loaded
    console.log("[VoiceAssistant] DOM already loaded, capturing immediately");
    captureDOM();
    setupDOMWatcher();
  }

  // Also capture on window load for fully loaded resources
  window.addEventListener('load', () => {
    console.log("[VoiceAssistant] Window load event fired");
    captureDOM();
  });
})();
