# Gmail Voice Agent

A hands-free voice assistant Chrome extension for Gmail. Control your inbox with voice commands!

## Features

- **Voice Activation**: Press `Shift + Space` to toggle the voice agent on/off
- **Email Reading**: Ask the agent to read your emails, check unread count, or read the currently open email
- **Hands-Free Loop**: After the agent responds, it automatically starts listening again
- **Visual Indicator**: A floating UI shows the current agent state (listening, speaking, idle)

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `gmail-voice-agent` folder
5. Navigate to [Gmail](https://mail.google.com)
6. Press `Shift + Space` to activate!

## Voice Commands

| Command | What it does |
|---------|--------------|
| "Read my emails" | Summarizes the visible emails in your inbox |
| "How many unread" | Tells you the unread email count |
| "Read this email" | Reads the currently open email |
| "Who is this from" | Tells you the sender of the open email |
| "What's the subject" | Reads the subject line |
| "Read email 2" | Reads the 2nd email in the list |
| "Where am I" | Tells you which Gmail view you're in |
| "Help" | Lists available commands |
| "Stop" / "Goodbye" | Turns off the voice agent |

## Files

```
gmail-voice-agent/
├── manifest.json   # Chrome extension manifest (V3)
├── content.js      # Main voice agent logic
├── styles.css      # UI styling for the indicator
├── icons/          # Extension icons (optional)
└── README.md       # This file
```

## Technical Details

- **Manifest V3** Chrome extension
- **Web Speech API** for speech recognition (`webkitSpeechRecognition`)
- **SpeechSynthesis API** for text-to-speech responses
- No external dependencies or backend required
- Runs only on `https://mail.google.com/*`

## Browser Compatibility

Requires Chrome (or Chromium-based browsers) with Web Speech API support.

## Future Improvements

- [ ] ElevenLabs integration for higher quality voice
- [ ] LLM backend for smarter responses
- [ ] Email composition via voice
- [ ] Navigation commands (go to inbox, go to sent, etc.)
- [ ] Custom keyboard shortcut configuration

## Troubleshooting

**Voice recognition not working?**
- Make sure you've granted microphone permissions to mail.google.com
- Check that no other app is using the microphone
- Try refreshing the Gmail page

**Can't hear responses?**
- Check your system volume
- Ensure Chrome is allowed to play audio
- Some voices may take a moment to load on first use

## License

MIT - Feel free to modify and extend!

