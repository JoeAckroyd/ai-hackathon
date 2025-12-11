# Voice Browser Assistant — Quickstart Guide

This guide explains how to run the full system:
**Chrome Extension → Local Dev Server → OpenAI API**
so you can control the browser with voice commands and ask questions about any webpage.

---

## 1. Start the Dev Server

```bash
cd joe-spike/server
npm install
```

Create a `.env` file and add your OpenAI API key:

```bash
echo "OPENAI_API_KEY=sk-xxxx..." > .env
echo "PORT=3000" >> .env
```

Or manually edit `.env`:

```
OPENAI_API_KEY=sk-xxxx...
PORT=3000
```

Start the server:

```bash
node index.js
```

If successful, you should see:

```
========================================
[Server] Voice Browser Assistant Server Started
========================================
[Server] Listening on: http://localhost:3000
[Server] API endpoint: http://localhost:3000/api/voice-command
[Server] OpenAI API Key configured: YES
[Server] Ready to receive voice commands!
========================================
```

---

## 2. Load the Chrome Extension

1. Open **Chrome**
2. Go to: `chrome://extensions`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the folder: `joe-spike/extension`

You should now see **Voice Browser Assistant** installed and active.

---

## 3. Test the Voice Assistant

1. Navigate to any webpage (e.g., https://google.com, https://github.com, https://news.ycombinator.com)
2. Look for the floating **🎙️ microphone button** in the bottom-right corner
3. Click it and **allow microphone access** when prompted
4. The button turns 🔴 red when listening
5. Speak your command clearly
6. The assistant will process your request and respond

---

## 4. What You Can Do

### 🧭 Navigate to Websites

Control navigation with natural language:

- 🗣️ **"Go to Google"** → Opens https://www.google.com
- 🗣️ **"Navigate to YouTube"** → Opens https://www.youtube.com
- 🗣️ **"Open GitHub"** → Opens https://www.github.com
- 🗣️ **"Go to Facebook"** → Opens https://www.facebook.com
- 🗣️ **"Take me to Reddit"** → Opens https://www.reddit.com

**Supported sites:** Google, Facebook, YouTube, Gmail, Twitter, GitHub, Reddit, Amazon, Netflix

---

### 📋 Ask Questions About the Page

The AI analyzes the **full DOM structure** including colors, text, headings, buttons, and links:

#### General Questions
- 🗣️ **"What's on this page?"** → Overview of page content
- 🗣️ **"Describe the page"** → Detailed description
- 🗣️ **"What do you see?"** → Comprehensive summary

#### Specific Content
- 🗣️ **"What are the headlines?"** → Lists all h1, h2, h3 headings
- 🗣️ **"What's the main heading?"** → Finds the h1 element
- 🗣️ **"What links are there?"** → Lists all links with their text
- 🗣️ **"How many buttons are there?"** → Counts button elements

#### Visual Information
- 🗣️ **"What color is the search button?"** → Analyzes computed styles
- 🗣️ **"What's the background color?"** → Describes page colors
- 🗣️ **"Are there any blue links?"** → Searches for colored elements

#### Existence Checks
- 🗣️ **"Is there a login button?"** → Searches for matching elements
- 🗣️ **"Is there a search box?"** → Looks for input elements
- 🗣️ **"What can I click on?"** → Lists interactive elements

---

### 🖱️ Click Elements

Tell the AI what to click in natural language:

- 🗣️ **"Click the login button"** → Finds and clicks
- 🗣️ **"Press the search button"** → Clicks search
- 🗣️ **"Click on about us"** → Finds "About Us" link
- 🗣️ **"Click the first link"** → Clicks first `<a>` element
- 🗣️ **"Press submit"** → Finds submit button

The element will be **highlighted in blue** briefly before clicking for visual feedback.

---

### 💬 Small Talk

- 🗣️ **"Hello"** → Friendly response
- 🗣️ **"How are you?"** → Conversational reply
- 🗣️ **"Thank you"** → Acknowledges gratitude

---

### 📧 Gmail-Specific (Legacy Commands)

When on Gmail:

- 🗣️ **"Go to my email"** → Opens Gmail inbox
- 🗣️ **"Where am I?"** → Describes Gmail location
- 🗣️ **"How many unread emails do I have?"** → Counts unread

---

## 5. How It Works

### Architecture

```
User Voice Input
    ↓
Web Speech API (browser)
    ↓
Content Script (captures voice + DOM snapshot)
    ↓
Background Script (message passing)
    ↓
Express Server (localhost:3000)
    ↓
OpenAI API (gpt-4o-mini)
    ↓
AI Response (JSON with action + speakText)
    ↓
Content Script executes action
    ↓
Speech Synthesis (speaks result)
```

### DOM Capture

On every page load:
1. **Full DOM tree** is serialized to JSON
2. Includes: tags, attributes, text, XPath, computed styles (colors, fonts)
3. Filters out: scripts, styles, hidden elements
4. **MutationObserver** auto-updates on dynamic changes (SPAs, AJAX)
5. Cached in memory for instant queries

### Performance

- **DOM Capture:** 50-200ms (typical pages)
- **Payload Size:** Usually <500KB
- **Total Response:** 600-1800ms (voice → AI → action)

---

## 6. Debugging Tips

### Check Server Console

The server logs show:
- Incoming requests with utterance
- DOM tree size (node count, KB)
- OpenAI API calls and responses
- JSON parsing errors
- Action being returned

Look for:
```
[Server] Processing voice command
  - Utterance: what are the headlines
  - URL: https://example.com
  - DOM nodes: 342
[Server] Payload size: 127.34KB
[Server] Sending request to OpenAI...
[Server] Returning action: describe
```

### Check Extension Background Console

1. Go to: `chrome://extensions`
2. Find **Voice Browser Assistant**
3. Click **Service worker** → **Inspect**

Look for:
```
[Background] Processing VOICE_COMMAND
  - Utterance: click the login button
  - DOM nodes: 256
[Background] Payload size: 89.12KB
```

### Check Page Console

Open **Chrome DevTools** (F12) → **Console** tab

Look for DOM capture logs:
```
[VoiceAssistant] Content script loaded
[VoiceAssistant] DOM captured in 87.23ms
[VoiceAssistant] Serialized size: 143.56KB
[VoiceAssistant] DOM mutation observer active
[VoiceAssistant] Transcript received: what color is the button
[VoiceAssistant] Collected page context:
  - DOM snapshot age: 2341ms
[VoiceAssistant] Executing click action...
[VoiceAssistant] Found element via selector: #login-button
[VoiceAssistant] Clicked element successfully
```

### Common Issues

**"No response from background"**
- Check if server is running on port 3000
- Check CORS settings in browser console

**"Sorry, I couldn't find that element"**
- Element may not exist on page
- Try describing it differently
- Check page console for XPath/selector tried

**Large payload warnings**
- Page has very large DOM (e.g., Reddit, Amazon)
- Still works but may be slower
- Look for `[Background] Large payload detected (>1MB)`

---

## 7. Development Tips

### Reload the Extension

After making changes to extension code:
1. Go to `chrome://extensions`
2. Click the **reload icon** on Voice Browser Assistant
3. Refresh any open pages to reload content script

### Restart the Server

After changing server code:
1. Stop server (Ctrl+C)
2. Run `node index.js` again
3. No need to reload extension

### View DOM Snapshot

In page console, run:
```javascript
// This won't work directly, but logs show the structure
// Look for DOM capture logs in console
```

---

## 8. Example Session

**On Google homepage:**

1. Click 🎙️ → 🔴 (listening)
2. **"What's on this page?"**
   - 🔊 "This is Google's homepage with a search box, Google Doodle, and links to Gmail, Images, and other Google services."

3. **"What color is the search button?"**
   - 🔊 "The search button has a blue background color, RGB 26, 115, 232."

4. **"Click the search box"**
   - 🔊 "Clicking on the search box"
   - ✨ Blue highlight → clicks input field

5. **"Go to GitHub"**
   - 🔊 "Navigating to GitHub"
   - 🌐 Opens https://www.github.com

**On GitHub:**

6. **"What are the headlines?"**
   - 🔊 "The headlines are: 'Let's build from here', 'Productivity', 'Collaboration', 'Security'."

7. **"Is there a sign in button?"**
   - 🔊 "Yes, there is a sign in button in the top navigation."

---

## 9. Summary

### Key Features

✅ **Natural language navigation** to popular websites
✅ **Ask any question** about page content, colors, structure
✅ **Click elements** by describing them naturally
✅ **Full DOM analysis** with colors and styles
✅ **Auto-updates** on dynamic page changes
✅ **Works on any website**

### System Requirements

- Chrome/Chromium browser
- Microphone access
- Node.js installed
- OpenAI API key
- Internet connection

You're ready to control your browser with your voice! 🚀🎙️🤖

---

## 10. Next Steps

- Try on different websites (news sites, social media, etc.)
- Ask complex questions about page content
- Test on dynamic single-page applications
- Monitor console logs to understand DOM capture
- Experiment with element clicking on various sites
