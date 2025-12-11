/**
 * Gmail Voice Agent - Content Script
 * 
 * This script runs on Gmail pages and provides a hands-free voice interface.
 * 
 * Features:
 * - Toggle with Shift+Space
 * - Listens to voice commands using Web Speech API
 * - Reads Gmail DOM to understand emails
 * - Responds using speechSynthesis
 * - Continuous listening loop (hands-free)
 * 
 * @author AI Hackathon Project
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  
  const CONFIG = {
    // Keyboard shortcut to toggle agent (Shift + Space)
    toggleKey: ' ',        // Space key
    toggleModifier: 'shift', // Requires Shift
    
    // Speech recognition settings
    language: 'en-US',
    continuous: false,     // We manually restart after each result
    interimResults: false, // Only final results
    
    // Speech synthesis settings
    voiceRate: 1.0,
    voicePitch: 1.0,
    
    // Debug mode - shows transcript overlay
    debug: true
  };

  // ============================================
  // STATE
  // ============================================
  
  let state = {
    isActive: false,       // Is the agent currently on?
    isListening: false,    // Is speech recognition active?
    isSpeaking: false,     // Is the agent currently speaking?
    recognition: null,     // SpeechRecognition instance
    synthesis: window.speechSynthesis
  };

  // ============================================
  // UI ELEMENTS
  // ============================================
  
  /**
   * Creates the floating indicator UI
   */
  function createIndicator() {
    // Remove existing indicator if any
    const existing = document.getElementById('gmail-voice-agent-indicator');
    if (existing) existing.remove();

    const indicator = document.createElement('div');
    indicator.id = 'gmail-voice-agent-indicator';
    indicator.innerHTML = `
      <div class="voice-agent-orb"></div>
      <span class="voice-agent-status">Voice Agent Ready</span>
      <span class="voice-agent-hint">Shift+Space</span>
    `;
    
    document.body.appendChild(indicator);
    return indicator;
  }

  /**
   * Creates the transcript overlay (debug mode)
   */
  function createTranscript() {
    const existing = document.getElementById('gmail-voice-agent-transcript');
    if (existing) existing.remove();

    const transcript = document.createElement('div');
    transcript.id = 'gmail-voice-agent-transcript';
    transcript.innerHTML = `
      <div class="transcript-label">Last heard</div>
      <div class="transcript-text">...</div>
    `;
    
    document.body.appendChild(transcript);
    return transcript;
  }

  /**
   * Updates the indicator UI based on current state
   */
  function updateUI(status, message) {
    const indicator = document.getElementById('gmail-voice-agent-indicator');
    if (!indicator) return;

    // Update visibility
    indicator.classList.toggle('visible', state.isActive);
    
    // Update state classes
    indicator.classList.remove('listening', 'speaking');
    if (status) indicator.classList.add(status);
    
    // Update status text
    const statusEl = indicator.querySelector('.voice-agent-status');
    if (statusEl && message) {
      statusEl.textContent = message;
    }
  }

  /**
   * Shows the transcript overlay with the given text
   */
  function showTranscript(text) {
    if (!CONFIG.debug) return;
    
    const transcript = document.getElementById('gmail-voice-agent-transcript');
    if (!transcript) return;
    
    const textEl = transcript.querySelector('.transcript-text');
    if (textEl) textEl.textContent = text;
    
    transcript.classList.add('visible');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      transcript.classList.remove('visible');
    }, 5000);
  }

  // ============================================
  // GMAIL DOM READING
  // ============================================
  
  /**
   * Extracts information about visible emails in the inbox list
   * @returns {Array} Array of email objects with sender, subject, snippet
   */
  function getEmailList() {
    const emails = [];
    
    // Gmail uses table rows for emails in the list view
    // Each row has specific data attributes and structure
    const rows = document.querySelectorAll('tr.zA');
    
    rows.forEach((row, index) => {
      try {
        // Sender - usually in a span with email attribute or specific class
        const senderEl = row.querySelector('.yW .bA4 span[email]') || 
                         row.querySelector('.yW span[email]') ||
                         row.querySelector('.yP, .zF');
        
        // Subject - in a span with specific classes
        const subjectEl = row.querySelector('.bog') ||
                          row.querySelector('.y6 span:first-child');
        
        // Snippet/preview - usually follows subject
        const snippetEl = row.querySelector('.y2');
        
        // Date
        const dateEl = row.querySelector('.xW span') ||
                       row.querySelector('.apt span');
        
        // Is unread?
        const isUnread = row.classList.contains('zE');
        
        emails.push({
          index: index + 1,
          sender: senderEl?.textContent?.trim() || senderEl?.getAttribute('email') || 'Unknown',
          subject: subjectEl?.textContent?.trim() || 'No subject',
          snippet: snippetEl?.textContent?.trim() || '',
          date: dateEl?.textContent?.trim() || '',
          isUnread: isUnread
        });
      } catch (e) {
        console.error('Error parsing email row:', e);
      }
    });
    
    return emails.slice(0, 10); // Return first 10 for brevity
  }

  /**
   * Extracts information about the currently open email (if any)
   * @returns {Object|null} Email details or null if no email is open
   */
  function getOpenEmail() {
    // Check if an email is currently open/expanded
    // Gmail shows open emails in a specific container
    const emailContainer = document.querySelector('.adn.ads') || // Full view
                          document.querySelector('.h7');         // Conversation view
    
    if (!emailContainer) return null;

    try {
      // Subject - in the header area
      const subjectEl = document.querySelector('.hP') ||
                        document.querySelector('h2.hP');
      
      // Sender information
      const senderEl = document.querySelector('.gD') ||
                       document.querySelector('.go');
      const senderEmail = senderEl?.getAttribute('email') || '';
      const senderName = senderEl?.textContent?.trim() || '';
      
      // Date/time
      const dateEl = document.querySelector('.g3') ||
                     document.querySelector('.g6');
      
      // Email body - the main content
      const bodyEl = document.querySelector('.a3s.aiL') ||
                     document.querySelector('.ii.gt');
      
      // To recipients
      const toEl = document.querySelector('.g2');
      
      return {
        subject: subjectEl?.textContent?.trim() || 'No subject',
        sender: senderName || senderEmail || 'Unknown sender',
        senderEmail: senderEmail,
        date: dateEl?.textContent?.trim() || '',
        to: toEl?.textContent?.trim() || '',
        body: bodyEl?.innerText?.trim()?.slice(0, 1000) || '' // Limit body length
      };
    } catch (e) {
      console.error('Error parsing open email:', e);
      return null;
    }
  }

  /**
   * Gets a summary of the current Gmail view
   * @returns {Object} Context about what's visible
   */
  function getGmailContext() {
    const openEmail = getOpenEmail();
    const emailList = getEmailList();
    const unreadCount = emailList.filter(e => e.isUnread).length;
    
    return {
      hasOpenEmail: !!openEmail,
      openEmail: openEmail,
      emailList: emailList,
      totalVisible: emailList.length,
      unreadCount: unreadCount,
      currentView: detectCurrentView()
    };
  }

  /**
   * Detects which Gmail view we're in (inbox, sent, etc.)
   * @returns {string} View name
   */
  function detectCurrentView() {
    const url = window.location.hash;
    
    if (url.includes('#inbox')) return 'inbox';
    if (url.includes('#sent')) return 'sent';
    if (url.includes('#drafts')) return 'drafts';
    if (url.includes('#starred')) return 'starred';
    if (url.includes('#search')) return 'search';
    if (url.includes('#label')) return 'label';
    
    return 'inbox'; // Default
  }

  // ============================================
  // COMMAND PROCESSING
  // ============================================
  
  /**
   * Processes a voice command and returns a response
   * @param {string} command - The recognized speech text
   * @returns {string} Response to speak back
   */
  function processCommand(command) {
    const cmd = command.toLowerCase().trim();
    const context = getGmailContext();
    
    console.log('[Voice Agent] Processing command:', cmd);
    console.log('[Voice Agent] Gmail context:', context);

    // ----- EMAIL READING COMMANDS -----
    
    // "Read my emails" / "What emails do I have"
    if (cmd.includes('read') && (cmd.includes('email') || cmd.includes('mail')) ||
        cmd.includes('what') && cmd.includes('email')) {
      return summarizeEmailList(context);
    }
    
    // "How many unread" / "Unread emails"
    if (cmd.includes('unread') || cmd.includes('how many')) {
      const count = context.unreadCount;
      if (count === 0) {
        return "You have no unread emails in your current view.";
      } else if (count === 1) {
        return `You have 1 unread email.`;
      } else {
        return `You have ${count} unread emails.`;
      }
    }
    
    // "Read this email" / "What does this say" (for open email)
    if ((cmd.includes('read this') || cmd.includes('what does') || cmd.includes('read the email')) && 
        context.hasOpenEmail) {
      return readOpenEmail(context.openEmail);
    }
    
    // "Who is this from" / "Who sent this"
    if ((cmd.includes('who') && (cmd.includes('from') || cmd.includes('sent'))) && 
        context.hasOpenEmail) {
      return `This email is from ${context.openEmail.sender}.`;
    }
    
    // "What's the subject"
    if (cmd.includes('subject') && context.hasOpenEmail) {
      return `The subject is: ${context.openEmail.subject}`;
    }
    
    // "Read email number X" / "Open email X"
    const numberMatch = cmd.match(/(?:email|number)\s*(\d+)/i) ||
                        cmd.match(/(\d+)(?:st|nd|rd|th)?\s*email/i);
    if (numberMatch) {
      const index = parseInt(numberMatch[1], 10);
      if (index > 0 && index <= context.emailList.length) {
        const email = context.emailList[index - 1];
        return `Email ${index}: From ${email.sender}. Subject: ${email.subject}. ${email.snippet}`;
      } else {
        return `I can only see emails 1 through ${context.emailList.length}.`;
      }
    }

    // ----- STATUS COMMANDS -----
    
    // "Where am I" / "What view"
    if (cmd.includes('where') || cmd.includes('what view') || cmd.includes('which folder')) {
      return `You are in your ${context.currentView}.`;
    }
    
    // "Help" / "What can you do"
    if (cmd.includes('help') || cmd.includes('what can you')) {
      return "I can read your emails, tell you about unread messages, read an open email, or tell you which email is from whom. Try saying: read my emails, how many unread, or read this email.";
    }
    
    // "Stop" / "Goodbye" / "Turn off"
    if (cmd.includes('stop') || cmd.includes('goodbye') || cmd.includes('turn off') || 
        cmd.includes('shut up')) {
      // This will be handled specially - turn off the agent
      setTimeout(() => toggleAgent(false), 500);
      return "Goodbye! Turning off voice agent.";
    }

    // ----- DEFAULT RESPONSE -----
    
    // If we have an open email, default to reading it
    if (context.hasOpenEmail) {
      return `I heard: "${command}". I'm not sure what you'd like me to do. You can say "read this email" or "help" for options.`;
    }
    
    // Default fallback
    return `I heard: "${command}". Try saying "read my emails" or "help" for available commands.`;
  }

  /**
   * Summarizes the visible email list
   */
  function summarizeEmailList(context) {
    if (context.emailList.length === 0) {
      return "I don't see any emails in the current view.";
    }
    
    let response = `You have ${context.totalVisible} emails visible. `;
    
    if (context.unreadCount > 0) {
      response += `${context.unreadCount} are unread. `;
    }
    
    // Read top 3 emails
    const topEmails = context.emailList.slice(0, 3);
    response += "Here are the top emails: ";
    
    topEmails.forEach((email, i) => {
      response += `${i + 1}: From ${email.sender}, ${email.subject}. `;
    });
    
    return response;
  }

  /**
   * Reads the currently open email
   */
  function readOpenEmail(email) {
    if (!email) {
      return "No email is currently open.";
    }
    
    let response = `Email from ${email.sender}. `;
    response += `Subject: ${email.subject}. `;
    
    if (email.date) {
      response += `Received ${email.date}. `;
    }
    
    if (email.body) {
      // Truncate body for speech
      const truncatedBody = email.body.slice(0, 500);
      response += `The email says: ${truncatedBody}`;
      
      if (email.body.length > 500) {
        response += "... The email continues.";
      }
    }
    
    return response;
  }

  // ============================================
  // SPEECH RECOGNITION (Listening)
  // ============================================
  
  /**
   * Initializes the speech recognition system
   */
  function initSpeechRecognition() {
    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.error('[Voice Agent] Speech recognition not supported in this browser');
      speak("Sorry, speech recognition is not supported in your browser.");
      return null;
    }

    const recognition = new SpeechRecognition();
    
    // Configure
    recognition.lang = CONFIG.language;
    recognition.continuous = CONFIG.continuous;
    recognition.interimResults = CONFIG.interimResults;
    recognition.maxAlternatives = 1;

    // Event handlers
    recognition.onstart = () => {
      console.log('[Voice Agent] Listening started');
      state.isListening = true;
      updateUI('listening', 'Listening...');
    };

    recognition.onresult = (event) => {
      const result = event.results[0][0];
      const transcript = result.transcript;
      const confidence = result.confidence;
      
      console.log(`[Voice Agent] Heard: "${transcript}" (confidence: ${confidence.toFixed(2)})`);
      
      // Show transcript in debug mode
      showTranscript(transcript);
      
      // Process the command and respond
      const response = processCommand(transcript);
      speak(response);
    };

    recognition.onerror = (event) => {
      console.error('[Voice Agent] Recognition error:', event.error);
      
      // Handle specific errors
      if (event.error === 'no-speech') {
        // No speech detected - just restart listening
        if (state.isActive) {
          updateUI('listening', 'No speech detected. Listening...');
          startListening();
        }
      } else if (event.error === 'aborted') {
        // Recognition was aborted - don't restart automatically
        state.isListening = false;
      } else {
        // Other errors - try to recover
        updateUI(null, `Error: ${event.error}`);
        if (state.isActive) {
          setTimeout(startListening, 1000);
        }
      }
    };

    recognition.onend = () => {
      console.log('[Voice Agent] Listening ended');
      state.isListening = false;
      
      // If agent is still active and not speaking, restart listening
      // This creates the continuous loop
      if (state.isActive && !state.isSpeaking) {
        setTimeout(startListening, 100);
      }
    };

    return recognition;
  }

  /**
   * Starts listening for voice input
   */
  function startListening() {
    if (!state.recognition) {
      state.recognition = initSpeechRecognition();
    }
    
    if (!state.recognition) return;
    
    // Don't start if already listening or speaking
    if (state.isListening || state.isSpeaking) return;
    
    try {
      state.recognition.start();
    } catch (e) {
      // Recognition may already be started
      console.log('[Voice Agent] Recognition start error (may be already running):', e.message);
    }
  }

  /**
   * Stops listening
   */
  function stopListening() {
    if (state.recognition && state.isListening) {
      try {
        state.recognition.abort();
      } catch (e) {
        console.log('[Voice Agent] Recognition stop error:', e.message);
      }
    }
    state.isListening = false;
  }

  // ============================================
  // SPEECH SYNTHESIS (Speaking)
  // ============================================
  
  /**
   * Speaks the given text using browser speechSynthesis
   * @param {string} text - Text to speak
   */
  function speak(text) {
    if (!state.synthesis) {
      console.error('[Voice Agent] Speech synthesis not available');
      return;
    }

    // IMPORTANT: Stop listening BEFORE speaking to prevent feedback loop
    // (the agent hearing its own voice)
    stopListening();
    state.isSpeaking = true; // Set flag immediately to prevent race conditions
    
    // Cancel any ongoing speech
    state.synthesis.cancel();
    
    // Create utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = CONFIG.language;
    utterance.rate = CONFIG.voiceRate;
    utterance.pitch = CONFIG.voicePitch;
    
    // Try to find a good voice
    const voices = state.synthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                          voices.find(v => v.lang.startsWith('en'));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    // Event handlers
    utterance.onstart = () => {
      console.log('[Voice Agent] Speaking:', text);
      state.isSpeaking = true;
      updateUI('speaking', 'Speaking...');
    };

    utterance.onend = () => {
      console.log('[Voice Agent] Done speaking');
      state.isSpeaking = false;
      
      // Resume listening if agent is still active
      // Add a small delay to avoid catching any audio echo
      if (state.isActive) {
        updateUI('listening', 'Listening...');
        setTimeout(() => {
          if (state.isActive && !state.isSpeaking) {
            startListening();
          }
        }, 300); // 300ms delay to let audio settle
      }
    };

    utterance.onerror = (event) => {
      console.error('[Voice Agent] Speech error:', event.error);
      state.isSpeaking = false;
      
      // Try to resume listening after a delay
      if (state.isActive) {
        setTimeout(() => {
          if (state.isActive && !state.isSpeaking) {
            startListening();
          }
        }, 300);
      }
    };

    // Speak!
    state.synthesis.speak(utterance);
  }

  // ============================================
  // AGENT CONTROL
  // ============================================
  
  /**
   * Toggles the voice agent on/off
   * @param {boolean} [forceState] - Optional: force on (true) or off (false)
   */
  function toggleAgent(forceState) {
    const newState = forceState !== undefined ? forceState : !state.isActive;
    
    console.log(`[Voice Agent] Toggling agent: ${state.isActive} -> ${newState}`);
    
    state.isActive = newState;
    
    if (state.isActive) {
      // Turning ON
      updateUI('listening', 'Voice Agent Active');
      speak("Voice agent activated. How can I help you with your emails?");
    } else {
      // Turning OFF
      stopListening();
      state.synthesis.cancel();
      state.isSpeaking = false;
      updateUI(null, 'Voice Agent Off');
      
      // Hide indicator after a moment
      setTimeout(() => {
        const indicator = document.getElementById('gmail-voice-agent-indicator');
        if (indicator && !state.isActive) {
          indicator.classList.remove('visible');
        }
      }, 1000);
    }
  }

  // ============================================
  // KEYBOARD SHORTCUT HANDLER
  // ============================================
  
  /**
   * Handles keyboard events to detect the toggle shortcut
   */
  function handleKeydown(event) {
    // Check for Shift + Space
    const isToggleKey = event.key === CONFIG.toggleKey && 
                        event.shiftKey && 
                        !event.ctrlKey && 
                        !event.altKey && 
                        !event.metaKey;
    
    if (isToggleKey) {
      // Prevent default space behavior (scrolling)
      event.preventDefault();
      event.stopPropagation();
      
      toggleAgent();
    }
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  
  /**
   * Initializes the voice agent
   */
  function init() {
    console.log('[Voice Agent] Initializing Gmail Voice Agent...');
    
    // Create UI elements
    createIndicator();
    if (CONFIG.debug) {
      createTranscript();
    }
    
    // Set up keyboard listener
    document.addEventListener('keydown', handleKeydown, true);
    
    // Pre-load voices (they may not be available immediately)
    if (state.synthesis) {
      state.synthesis.getVoices();
      // Voices load asynchronously in some browsers
      state.synthesis.onvoiceschanged = () => {
        console.log('[Voice Agent] Voices loaded:', state.synthesis.getVoices().length);
      };
    }
    
    console.log('[Voice Agent] Ready! Press Shift+Space to activate.');
  }

  // Run initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

