// FILE: server/index.js

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration for Private Network Access (Chrome security feature)
app.use(cors({
  origin: true,
  credentials: true
}));

// Handle Private Network Access preflight requests
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});

app.use(express.json()); // parse JSON bodies

// Helper: Count DOM nodes
function countDOMNodes(node) {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((sum, c) => sum + countDOMNodes(c), 0);
}

// Helper: Format DOM tree for AI consumption
function formatDOMForAI(node, depth = 0, maxDepth = 8) {
  if (!node || depth > maxDepth) {
    return '';
  }

  const indent = '  '.repeat(depth);
  const tag = node.tag;

  // Format attributes
  let attrStr = '';
  if (node.attrs && Object.keys(node.attrs).length > 0) {
    const relevantAttrs = Object.entries(node.attrs)
      .filter(([k, v]) => v && v.toString().length < 100)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');
    if (relevantAttrs) {
      attrStr = ' ' + relevantAttrs;
    }
  }

  // Format style
  let styleStr = '';
  if (node.style && Object.keys(node.style).length > 0) {
    const styleInfo = Object.entries(node.style)
      .map(([k, v]) => `${k}:${v}`)
      .join(';');
    if (styleInfo) {
      styleStr = ` style="${styleInfo}"`;
    }
  }

  // Format text
  const text = node.text ? ` text="${node.text}"` : '';

  // XPath for identification
  const xpath = node.xpath ? ` xpath="${node.xpath}"` : '';

  let result = `${indent}<${tag}${attrStr}${styleStr}${text}${xpath}>\n`;

  // Process children
  if (node.children && node.children.length > 0) {
    // Limit children to prevent explosion
    const childrenToShow = node.children.slice(0, 20);
    childrenToShow.forEach(child => {
      result += formatDOMForAI(child, depth + 1, maxDepth);
    });
    if (node.children.length > 20) {
      result += `${indent}  ... (${node.children.length - 20} more children)\n`;
    }
  }

  return result;
}

// Generic function to call OpenAI Chat Completions API
async function callOpenAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[Server] OPENAI_API_KEY is missing!");
    throw new Error("Missing OPENAI_API_KEY in environment");
  }

  console.log("[Server] Sending request to OpenAI API...");
  console.log("[Server] Using model: gpt-4o-mini");
  console.log("[Server] System prompt length:", systemPrompt.length);
  console.log("[Server] User prompt length:", userPrompt.length);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
    }),
  });

  console.log("[Server] OpenAI API response status:", response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Server] OpenAI API error:", errorText);
    throw new Error("OpenAI API error: " + errorText);
  }

  const data = await response.json();
  console.log("[Server] OpenAI response received, parsing...");

  const content =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;

  if (!content) {
    console.error("[Server] No content in OpenAI response");
    throw new Error("No content in OpenAI response");
  }

  console.log("[Server] Raw content from OpenAI:", content);

  // Expect content to be pure JSON; parse it safely.
  let parsed;
  try {
    parsed = JSON.parse(content);
    console.log("[Server] Successfully parsed JSON:", parsed);
  } catch (err) {
    console.error("[Server] Failed to parse model JSON content:", content);
    console.error("[Server] Parse error:", err.message);
    // Fallback: safe default
    parsed = {
      type: "command",
      action: "none",
      params: {},
      speakText: "Sorry, I had trouble understanding that.",
    };
    console.log("[Server] Using fallback response:", parsed);
  }

  return parsed;
}

// Phase 1: Intent Classification Handler (NO DOM)
async function handleIntentClassification(payload) {
  const { utterance, url, title } = payload;

  console.log("[Server] Phase 1: Intent Classification");
  console.log("  - Utterance:", utterance);
  console.log("  - URL:", url);
  console.log("  - Title:", title);

  const systemPrompt = `
You are a browser voice assistant intent classifier.

Analyze the user's utterance and determine:
1. What action they want (navigate, describe, click, or none)
2. Whether you need the DOM to complete the action

Return JSON:
{
  "actionType": "navigate" | "describe" | "click" | "none",
  "needsDOM": boolean,

  // If needsDOM = false, include complete response:
  "action": "navigate",
  "params": { "url": "https://..." },
  "speakText": "..."
}

RULES:

1. "navigate" - User wants to go to a different URL
   * needsDOM: false
   * Include full response with URL mapping
   * Examples: "go to google", "open youtube", "navigate to facebook"
   * Navigation mapping:
     - "google" → https://www.google.com
     - "facebook" → https://www.facebook.com
     - "youtube" → https://www.youtube.com
     - "gmail", "email" → https://mail.google.com
     - "twitter" → https://www.twitter.com
     - "github" → https://www.github.com
     - "reddit" → https://www.reddit.com
     - "amazon" → https://www.amazon.com
     - "netflix" → https://www.netflix.com
   * Response format:
     {
       "actionType": "navigate",
       "needsDOM": false,
       "action": "navigate",
       "params": { "url": "https://www.google.com" },
       "speakText": "Navigating to Google"
     }

2. "describe" - User asks ANY question about the page
   * needsDOM: true
   * Examples: "what's on this page", "what are the headlines", "what color is the button"
   * Response format:
     {
       "actionType": "describe",
       "needsDOM": true
     }

3. "click" - User wants to interact with an element
   * needsDOM: true
   * Examples: "click the login button", "press submit", "click on about us"
   * Response format:
     {
       "actionType": "click",
       "needsDOM": true
     }

4. "none" - Small talk, no action needed
   * needsDOM: false
   * Examples: "hello", "thank you", "how are you"
   * Response format:
     {
       "actionType": "none",
       "needsDOM": false,
       "action": "none",
       "params": {},
       "speakText": "<friendly response>"
     }

Return ONLY the JSON object. No markdown, no explanation.
`.trim();

  const userPrompt = `
User utterance: "${utterance}"
Current page URL: ${url}
Current page title: ${title}
`.trim();

  const result = await callOpenAI(systemPrompt, userPrompt);
  return result;
}

// Phase 2: DOM Analysis Handler (WITH DOM)
async function handleDOMAnalysis(payload) {
  const { actionType, utterance, url, title, dom, domTimestamp } = payload;

  console.log("[Server] Phase 2: DOM Analysis");
  console.log("  - Action type:", actionType);
  console.log("  - Utterance:", utterance);
  console.log("  - DOM nodes:", dom ? countDOMNodes(dom) : 0);

  // Format DOM for AI
  const domDescription = dom ? formatDOMForAI(dom) : "No DOM available";

  let systemPrompt = '';

  if (actionType === 'describe') {
    systemPrompt = `
You are a browser voice assistant answering questions about the page.

Analyze the DOM and answer the user's question.

You have access to:
- All element tags, text content, attributes
- Color information (style.color, style.backgroundColor)
- Font sizes (style.fontSize)
- All semantic structure (headings, links, buttons, etc.)

Return JSON:
{
  "action": "describe",
  "params": {},
  "speakText": "<answer based on DOM analysis>"
}

Be specific and accurate. Answer the exact question asked.

DOM STRUCTURE:
- tag: HTML tag name
- attrs: {id, class, href, aria-label, etc.}
- style: {color, backgroundColor, fontSize} for key elements
- text: visible text content
- xpath: unique XPath identifier
- children: array of child nodes

Return ONLY the JSON object. No markdown, no explanation.
`.trim();

  } else if (actionType === 'click') {
    systemPrompt = `
You are a browser voice assistant finding elements to click.

Find the element the user wants to click in the DOM.

Return JSON:
{
  "action": "click",
  "params": {
    "xpath": "<xpath_to_element>",
    "selector": "<css_selector>",
    "description": "<what_user_wanted>"
  },
  "speakText": "Clicking on <description>"
}

Element matching strategy:
- Match by text content: "login button" → find button with text "Login"
- Match by attributes: "search box" → find input with type="search"
- Match by aria-label: use aria-label attribute
- Match by position: "first link" → use DOM order
- For ambiguous matches, prefer first occurrence
- If no clear match found, return helpful speakText explaining the issue

DOM STRUCTURE:
- tag: HTML tag name
- attrs: {id, class, href, aria-label, etc.}
- style: {color, backgroundColor, fontSize} for key elements
- text: visible text content
- xpath: unique XPath identifier (use this for params.xpath)
- children: array of child nodes

Return ONLY the JSON object. No markdown, no explanation.
`.trim();
  } else {
    throw new Error(`Unknown actionType: ${actionType}`);
  }

  const userPrompt = `
User utterance: "${utterance}"
Page URL: ${url}
Page title: ${title}

DOM Structure:
${domDescription}
`.trim();

  const result = await callOpenAI(systemPrompt, userPrompt);
  return result;
}

// Handle preflight requests explicitly
app.options("/api/voice-command", (req, res) => {
  console.log("[Server] OPTIONS /api/voice-command - Preflight request received");
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  console.log("[Server] Sending 200 OK for preflight");
  res.sendStatus(200);
});

// POST endpoint for voice commands (handles both phases)
app.post("/api/voice-command", async (req, res) => {
  console.log("\n[Server] ========================================");
  console.log("[Server] POST /api/voice-command - Request received");

  try {
    const { type, payload } = req.body || {};

    console.log("[Server] Request type:", type);
    console.log("[Server] Payload keys:", Object.keys(payload || {}));

    let result;

    if (type === "VOICE_COMMAND_INTENT") {
      // Phase 1: Intent Classification (NO DOM)
      const { utterance } = payload || {};
      if (!utterance || typeof utterance !== "string") {
        console.error("[Server] Missing or invalid 'utterance' in Phase 1 request");
        return res.status(400).json({ error: "Missing 'utterance' in request body" });
      }

      result = await handleIntentClassification(payload);

    } else if (type === "VOICE_COMMAND_DOM") {
      // Phase 2: DOM Analysis (WITH DOM)
      const { actionType, utterance } = payload || {};
      if (!actionType || !utterance) {
        console.error("[Server] Missing actionType or utterance in Phase 2 request");
        return res.status(400).json({ error: "Missing required fields for Phase 2" });
      }

      result = await handleDOMAnalysis(payload);

    } else {
      console.error("[Server] Unknown request type:", type);
      return res.status(400).json({ error: "Unknown request type. Expected VOICE_COMMAND_INTENT or VOICE_COMMAND_DOM" });
    }

    // Ensure we always send a sane object
    if (!result || typeof result !== "object") {
      console.error("[Server] Invalid result from handler, sending fallback");
      return res.json({
        type: "command",
        action: "none",
        params: {},
        speakText: "Sorry, I did not get a valid response from the AI.",
      });
    }

    console.log("[Server] Sending successful response:", result);
    console.log("[Server] ========================================\n");
    return res.json(result);

  } catch (err) {
    console.error("[Server] Error in /api/voice-command:", err);
    console.error("[Server] Error stack:", err.stack);
    console.log("[Server] ========================================\n");
    return res.status(500).json({
      type: "command",
      action: "none",
      params: {},
      speakText: "Sorry, something went wrong on the server.",
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log("\n========================================");
  console.log("[Server] Voice Browser Assistant Server Started");
  console.log("========================================");
  console.log(`[Server] Listening on: http://localhost:${PORT}`);
  console.log(`[Server] API endpoint: http://localhost:${PORT}/api/voice-command`);
  console.log(`[Server] OpenAI API Key configured: ${process.env.OPENAI_API_KEY ? 'YES' : 'NO'}`);
  console.log("[Server] Ready to receive voice commands!");
  console.log("========================================\n");
});
