````markdown
# Voice Browser Assistant — Quickstart Guide

This guide explains how to run the full system:  
**Chrome Extension → Local Dev Server → OpenAI API**  
so you can control the browser with voice commands.

---

## 1. Start the Dev Server

```bash
cd voice-browser-assistant/server
npm install
cp .env.example .env
````

Edit `.env` and add your real key:

```
OPENAI_API_KEY=sk-xxxx...
PORT=3000
```

Start the server:

```bash
npm start
```

If successful, you should see:

```
Voice command server listening on http://localhost:3000
```

---

## 2. Load the Chrome Extension

1. Open **Chrome**
2. Go to: `chrome://extensions`
3. Enable **Developer mode** (top-right)
4. Click **Load unpacked**
5. Select the folder:

```
voice-browser-assistant/extension
```

You should now see **Voice Browser Assistant** installed and active.

---

## 3. Test the Voice Assistant

1. Open a webpage, for example:

```
https://mail.google.com/mail/u/0/#inbox
```

2. Look for the floating **🎙️ microphone button** in the bottom-right
3. Click it and **allow microphone access** when prompted
4. Speak your commands

### Supported demo commands

#### 🗣️ “Hello”

The assistant replies with a friendly spoken response.

#### 🗣️ “Go to my email”

Navigates to Gmail inbox.

#### 🗣️ “Where am I?”

Describes whether you’re in Gmail, in the inbox, or elsewhere.

#### 🗣️ “How many unread emails do I have?”

Counts unread emails in Gmail’s UI and speaks the number.

---

## 4. Debugging Tips

If something doesn’t work, here are the places to look:

### **Server console**

Shows:

* Incoming requests
* OpenAI errors
* JSON parsing errors

### **Extension background console**

1. Go to: `chrome://extensions`
2. Find **Voice Browser Assistant**
3. Click **Service worker → Inspect**

Shows:

* Requests being sent to the dev server
* Any extension-side errors

### **Page console**

Open Chrome DevTools → Console
Look for logs such as:

```
[VoiceAssistant] Transcript: ...
[VoiceAssistant] Sending VOICE_COMMAND ...
[VoiceAssistant] Server data: ...
```

These help verify the content script is working.

---

## 5. Summary

Once the server is running and the extension is loaded:

* 🎙️ Mic button appears on every page
* Voice commands are captured by Web Speech API
* Commands are routed through the background script
* Dev server processes intent using OpenAI
* Extension performs actions + speaks results

You’re ready to demo your voice-controlled browser assistant.
Enjoy hacking! 🚀🎙️🤖

```
```
