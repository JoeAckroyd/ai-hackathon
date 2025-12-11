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

  // Format text
  const text = node.text ? ` text="${node.text}"` : '';

  // XPath for identification
  const xpath = node.xpath ? ` xpath="${node.xpath}"` : '';

  let result = `${indent}<${tag}${attrStr}${text}${xpath}>\n`;

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

// Function to call OpenAI Chat Completions API
async function callOpenAI(payload) {
  console.log("[Server] callOpenAI invoked with payload:");
  console.log("  - utterance:", payload.utterance);
  console.log("  - url:", payload.url);
  console.log("  - title:", payload.title);
  console.log("  - pageText length:", payload.pageText?.length || 0);
  console.log("  - DOM nodes:", payload.dom ? countDOMNodes(payload.dom) : 0);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[Server] OPENAI_API_KEY is missing!");
    throw new Error("Missing OPENAI_API_KEY in environment");
  }
  console.log("[Server] API key found:", apiKey.substring(0, 10) + "...");

  const { utterance, url, title, pageText, dom, domTimestamp } = payload;

  // Convert DOM tree to readable format for AI
  const domDescription = dom ? formatDOMForAI(dom) : "No DOM available";

  const systemPrompt = `
You are a browser voice assistant that interprets user commands and controls the page.

You receive:
1. User's voice command (utterance)
2. Current page URL and title
3. Full DOM tree structure with all interactive elements

You MUST respond with a single JSON object (no markdown, no extra text):
{
  "type": "command",
  "action": "<action_name>",
  "params": {<action_specific_params>},
  "speakText": "<what to say to user>"
}

AVAILABLE ACTIONS:

1. "navigate" - Navigate to a URL based on natural language
   - User says: "go to google", "navigate to facebook", "open youtube"
   - You determine the appropriate URL
   - params: { "url": "https://www.google.com" }
   - speakText: "Navigating to Google"
   - Navigation mapping:
     * "google" → https://www.google.com
     * "facebook" → https://www.facebook.com
     * "youtube" → https://www.youtube.com
     * "gmail", "email" → https://mail.google.com
     * "twitter" → https://www.twitter.com
     * "github" → https://www.github.com
     * "reddit" → https://www.reddit.com
     * "amazon" → https://www.amazon.com
     * "netflix" → https://www.netflix.com
     * For others, use your best judgment

2. "describe" - Describe page content at varying levels of detail
   - User says: "what's on this page", "describe the page", "what do you see"
   - Analyze the DOM tree to provide relevant description
   - params: {} (no params needed)
   - speakText: "<detailed description based on DOM>"
   - Granularity examples:
     * General: "This is Google's homepage with a search box and navigation links"
     * Specific: "I see a search button, Google logo, and links to Gmail and Images"
     * Very specific: "There are 15 interactive elements including buttons and links"

3. "click" - Click on an element based on natural language description
   - User says: "click the login button", "press submit", "click on about us"
   - Search DOM for matching element
   - params: { "xpath": "<xpath_to_element>", "selector": "<css_selector>", "description": "<what_user_wanted>" }
   - speakText: "Clicking on <description>"
   - Element matching strategy:
     * Match by text content: "login button" → find button with text "Login"
     * Match by attributes: "search box" → find input with type="search"
     * Match by aria-label: use aria-label attribute
     * Match by position: "first link" → use DOM order
     * For ambiguous matches, prefer first occurrence
     * If no clear match found, return helpful speakText explaining the issue

4. "navigateEmail" - Navigate to Gmail inbox (legacy action)
   - params: {}
   - speakText: "Opening your email inbox"

5. "describePageContext" - Legacy Gmail context description
6. "countUnreadEmails" - Legacy Gmail unread counting

7. "none" - No action needed (small talk, unclear command)
   - params: {}
   - speakText: "<friendly response>"

DOM STRUCTURE:
The DOM is provided as a pseudo-HTML tree where each node has:
- tag: HTML tag name
- attrs: {id, class, href, aria-label, etc.}
- text: visible text content
- xpath: unique XPath identifier
- children: array of child nodes

ELEMENT IDENTIFICATION RULES:
1. Prioritize exact text matches
2. Consider semantic HTML (button, a, input types)
3. Use aria-label and title attributes
4. For ambiguous matches, prefer first occurrence
5. If no clear match, explain in speakText

Return ONLY the JSON object. No markdown, no explanation.
`.trim();

  const userPrompt = `
User utterance: "${utterance}"

Page URL: ${url}
Page title: ${title}

DOM Structure:
${domDescription}
`.trim();

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

// Handle preflight requests explicitly
app.options("/api/voice-command", (req, res) => {
  console.log("[Server] OPTIONS /api/voice-command - Preflight request received");
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  console.log("[Server] Sending 200 OK for preflight");
  res.sendStatus(200);
});

// POST endpoint for voice commands
app.post("/api/voice-command", async (req, res) => {
  console.log("\n[Server] ========================================");
  console.log("[Server] POST /api/voice-command - Request received");
  console.log("[Server] Request body keys:", Object.keys(req.body || {}));

  try {
    const { utterance, url, title, pageText, dom, domTimestamp } = req.body || {};

    if (!utterance || typeof utterance !== "string") {
      console.error("[Server] Missing or invalid 'utterance' in request body");
      return res
        .status(400)
        .json({ error: "Missing 'utterance' in request body" });
    }

    console.log("[Server] Calling OpenAI with utterance:", utterance);
    const result = await callOpenAI({ utterance, url, title, pageText, dom, domTimestamp });

    // Ensure we always send a sane object
    if (!result || typeof result !== "object") {
      console.error("[Server] Invalid result from OpenAI, sending fallback");
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
