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

// Function to call OpenAI Chat Completions API
async function callOpenAI(payload) {
  console.log("[Server] callOpenAI invoked with payload:");
  console.log("  - utterance:", payload.utterance);
  console.log("  - url:", payload.url);
  console.log("  - title:", payload.title);
  console.log("  - pageText length:", payload.pageText?.length || 0);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[Server] OPENAI_API_KEY is missing!");
    throw new Error("Missing OPENAI_API_KEY in environment");
  }
  console.log("[Server] API key found:", apiKey.substring(0, 10) + "...");

  const { utterance, url, title, pageText } = payload;

  const systemPrompt = `
You are a browser voice assistant that controls the page via a content script.
You MUST respond with a single JSON object, no extra text, no markdown.
Shape:
{
  "type": "command",
  "action": "<string>",
  "params": {},
  "speakText": "<string the extension should say aloud>"
}

Valid actions:

* "navigateEmail"       // navigate to Gmail inbox page
* "describePageContext" // ask the content script to verbally describe whether the user is in their inbox
* "countUnreadEmails"   // ask the content script to count unread emails in the current view
* "none"                // for small talk or when no browser action is needed

Rules:

* If user says something like "go to my email", "open my inbox", "go to gmail":
  * action: "navigateEmail", params: {}, speakText: "Opening your email inbox."
* If user says something like "where am I", "am I in my inbox":
  * action: "describePageContext", params: {}, speakText: "Let me check where you are."
* If user asks about unread emails, e.g. "how many unread emails do I have":
  * action: "countUnreadEmails", params: {}, speakText: "I'll count your unread emails."
* For casual chat or anything else that does not clearly match the above:
  * action: "none"
  * params: {}
  * speakText: a short, friendly spoken reply.

Do NOT wrap the JSON in backticks or markdown.
Return ONLY the JSON object.
`.trim();

  const userPrompt = `
User utterance: "${utterance}"

Page URL: ${url}
Page title: ${title}

Page text (truncated):
"""${pageText || ""}"""
`.trim();

  console.log("[Server] Sending request to OpenAI API...");
  console.log("[Server] Using model: gpt-4o-mini");

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
  console.log("[Server] Request body:", req.body);

  try {
    const { utterance, url, title, pageText } = req.body || {};

    if (!utterance || typeof utterance !== "string") {
      console.error("[Server] Missing or invalid 'utterance' in request body");
      return res
        .status(400)
        .json({ error: "Missing 'utterance' in request body" });
    }

    console.log("[Server] Calling OpenAI with utterance:", utterance);
    const result = await callOpenAI({ utterance, url, title, pageText });

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
