/**
 * Chat functionality and WebSocket handling
 * Note: labelError function is defined in app.js which loads first
 */

let chatWebSocket = null;
let imageNoticeShown = false; // Track if we've shown the vision notice this session
let currentSessionId = null;
let isProcessing = false;
let conversationHistory = [];
let selectedImages = []; // Array of { base64: string, media_type: string, dataUrl: string }
let lastSentMessage = null; // Track last message for retry functionality
const MAX_IMAGES = 10;

// Reply-to-bee state
let replyTargetBee = null;       // { name, personalityId }
let debatePausedForReply = false; // Whether debate is paused waiting for reply

// Sequential bee display — bees respond in parallel but we show one at a time
// Simple approach: buffer ALL responses silently, play back one by one with typewriter
const beeQueue = {
    bees: [],              // { modelName, provider, personalityId, roleName, text: '', finished: false, error: null }
    playing: false,        // Currently playing back
    stopped: false,        // User hit stop
    _timer: null,
    _pendingVerdict: null,
    _pendingDebateEnd: false,

    reset() {
        this.stop();
        this.bees = [];
        this.playing = false;
        this.stopped = false;
        this._pendingVerdict = null;
        this._pendingDebateEnd = false;
    },

    stop() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        // Clean up any streaming bubbles
        const c = document.getElementById('chat-messages');
        if (c) c.querySelectorAll('.message.ai-individual.streaming').forEach(m => m.classList.remove('streaming'));
        // Render pending verdict/debate-end immediately if stopping early
        if (this._pendingVerdict) {
            const v = this._pendingVerdict;
            this._pendingVerdict = null;
            renderHiveVerdict(v);
        }
        if (this._pendingDebateEnd) {
            this._pendingDebateEnd = false;
            _handleDebateEnd();
        }
    },

    enqueue(modelName, provider, personalityId, roleName) {
        // Don't add duplicate bee in same round
        if (!this.bees.find(b => b.modelName === modelName && !b.finished)) {
            this.bees.push({ modelName, provider, personalityId, roleName, text: '', finished: false, error: null });
        }
    },

    addChunk(modelName, text) {
        const bee = this.bees.find(b => b.modelName === modelName && !b.finished);
        if (bee) bee.text += text;
    },

    finishBee(modelName) {
        const bee = this.bees.find(b => b.modelName === modelName && !b.finished);
        if (bee) bee.finished = true;
        // Check if all bees in this batch are done — if so, start playback
        this._checkAllDone();
    },

    errorBee(modelName, error) {
        const bee = this.bees.find(b => b.modelName === modelName && !b.finished);
        if (bee) { bee.error = error; bee.finished = true; }
        this._checkAllDone();
    },

    _checkAllDone() {
        if (this.playing || this.stopped) return;
        if (this.bees.length > 0 && this.bees.every(b => b.finished)) {
            this._playAll();
        } else if (this.bees.length === 0) {
            // No bees queued and not playing — flush any pending verdict/debate_end
            this._flushPending();
        }
    },

    async _playAll() {
        this.playing = true;
        const beesToPlay = [...this.bees];
        this.bees = []; // Clear for next round

        // Remove thinking spinner once bees start appearing
        hideBuzzThinking();

        for (const bee of beesToPlay) {
            if (this.stopped) break;

            if (bee.error) {
                addAiDiscussionError(bee.modelName, bee.error);
                await this._wait(300);
                continue;
            }

            // Create bubble with thinking dots
            addAiDiscussionMessage(bee.modelName, bee.provider, '', bee.personalityId, bee.roleName);
            updateChatStatus(`${bee.modelName} is thinking...`);

            // Show thinking dots
            const msgEl = this._getStreamingMsg(bee.modelName);
            if (msgEl) {
                const content = msgEl.querySelector('.message-content');
                if (content) content.innerHTML = '<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';
            }

            await this._wait(700);
            if (this.stopped) break;

            // Remove dots, typewrite the text
            const msgEl2 = this._getStreamingMsg(bee.modelName);
            if (msgEl2) {
                const content = msgEl2.querySelector('.message-content');
                if (content) {
                    content.innerHTML = '';
                    content.textContent = '';
                }
            }

            await this._typewrite(bee.modelName, bee.text);
            if (this.stopped) break;

            // Finish this bee
            finishAiDiscussion(bee.modelName);
            await this._wait(400);
        }
        this.playing = false;
        // Check if more bees arrived while we were playing (next round)
        this._checkAllDone();
        // If no more bees to play, flush pending verdict and debate_end
        this._flushPending();
    },

    _getStreamingMsg(modelName) {
        const c = document.getElementById('chat-messages');
        return c ? c.querySelector(`.message.ai-individual[data-model="${CSS.escape(modelName)}"].streaming`) : null;
    },

    _typewrite(modelName, fullText) {
        return new Promise(resolve => {
            let i = 0;
            const CHARS = 4;
            const MS = 12;
            this._timer = setInterval(() => {
                if (this.stopped || i >= fullText.length) {
                    clearInterval(this._timer);
                    this._timer = null;
                    // If stopped early, dump remaining text
                    if (i < fullText.length) {
                        const msg = this._getStreamingMsg(modelName);
                        if (msg) {
                            const content = msg.querySelector('.message-content');
                            if (content) content.textContent += fullText.slice(i);
                        }
                    }
                    resolve();
                    return;
                }
                const end = Math.min(i + CHARS, fullText.length);
                const msg = this._getStreamingMsg(modelName);
                if (msg) {
                    const content = msg.querySelector('.message-content');
                    if (content) content.textContent += fullText.slice(i, end);
                    scrollToBottom(document.getElementById('chat-messages'));
                }
                i = end;
            }, MS);
        });
    },

    _flushPending() {
        // Only flush if truly idle (not playing, no bees waiting)
        if (this.playing || this.bees.length > 0) return;
        if (this._pendingVerdict) {
            const v = this._pendingVerdict;
            this._pendingVerdict = null;
            renderHiveVerdict(v);
        }
        if (this._pendingDebateEnd) {
            this._pendingDebateEnd = false;
            _handleDebateEnd();
        }
    },

    _wait(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
};

// Vision-capable models (all others cannot see images)
const VISION_MODELS = new Set([
    'gpt-5.2', 'gpt-5', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini',  // OpenAI
    'grok-4-1-fast-non-reasoning', 'grok-4-fast-non-reasoning'   // xAI (Grok 4+)
]);
const VISION_PROVIDERS = new Set(['anthropic', 'google']);  // All models from these providers support vision

// Map human names to personality IDs (for history loading where we only have names)
const HUMAN_NAME_TO_PERSONALITY = {
    'sunny': 'chaos-optimist', 'murphy': 'chaos-pessimist', 'jordan': 'chaos-realist',
    'rebel': 'chaos-contrarian', 'cyndi': 'chaos-cynic',
    'bff': 'friend-bestie', 'truth': 'friend-honest', 'giggles': 'friend-funny',
    'sage': 'friend-wise', 'fixer': 'friend-practical',
    'brick': 'billionaire-builder', 'money': 'billionaire-investor',
    'chess': 'billionaire-strategist', 'blitz': 'billionaire-disruptor',
    'dream': 'billionaire-visionary',
    'anon': 'internet-redditor', 'clout': 'internet-influencer',
    'dev': 'internet-coder', 'pixel': 'internet-gamer', 'flame': 'internet-troll',
    'zoey': 'gen-z', 'avery': 'gen-millennial', 'dale': 'gen-x',
    'walt': 'gen-boomer', 'neo': 'gen-future',
    'honor': 'court-judge', 'blade': 'court-prosecutor', 'haven': 'court-defense',
    'echo': 'court-witness', 'will': 'court-jury',
    'lucifer': 'special-devils-advocate', 'joker': 'special-wild-card',
};

// Get personality ID from display name (human name or role name)
function getPersonalityFromName(name) {
    const nameLower = name.toLowerCase();
    // Check human names
    if (HUMAN_NAME_TO_PERSONALITY[nameLower]) {
        return HUMAN_NAME_TO_PERSONALITY[nameLower];
    }
    // Check if the name contains a known personality keyword
    for (const [key, pid] of Object.entries(PERSONALITY_ICON_MAP)) {
        const shortName = key.split('-').pop();
        if (nameLower.includes(shortName)) return key;
    }
    return null;
}

// Check if a model supports vision
function supportsVision(model) {
    if (VISION_PROVIDERS.has(model.provider)) return true;
    return VISION_MODELS.has(model.model_id);
}

// Get selected models that cannot see images
function getNonVisionSelectedModels() {
    if (typeof selectedModels === 'undefined') return [];
    return selectedModels.filter(m => !supportsVision(m));
}

// Get summarizer index based on user preference
function getSummarizerIndex(models) {
    const pref = localStorage.getItem('summarizerPreference') || 'first';

    if (pref === 'first') {
        return 0;
    }

    if (pref === 'last') {
        return models.length - 1;
    }

    // Bee-specific preference (e.g., "bee:analyst")
    if (pref.startsWith('bee:')) {
        const beeId = pref.replace('bee:', '');
        // Find the model that has this personality assigned
        const beeIndex = models.findIndex(m => m.personality_id === beeId);
        if (beeIndex >= 0) {
            return beeIndex;
        }
    }

    // Legacy: Provider-specific preference - find first model from that provider
    const providerIndex = models.findIndex(m => m.provider === pref);
    if (providerIndex >= 0) {
        return providerIndex;
    }

    // Fallback to first bee
    return 0;
}

// Send button click - send message or stop discussion
document.getElementById('send-btn').addEventListener('click', () => {
    const btn = document.getElementById('send-btn');
    const input = document.getElementById('chat-input');
    const question = input.value.trim();

    console.log('[send-btn click] stopMode:', btn.classList.contains('stop-mode'), 'currentSessionId:', currentSessionId, 'question:', question, 'continuingDebateId:', window.continuingDebateId, 'btn.disabled:', btn.disabled);

    // Reply-to-bee mode takes priority
    if (debatePausedForReply && replyTargetBee) {
        if (question) sendReplyToBee();
        return;
    }

    if (btn.classList.contains('stop-mode')) {
        // Stop the discussion
        stopDiscussion();
    } else if (!question) {
        // No question typed - highlight input
        input.focus();
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 500);
        return;
    } else if (!currentSessionId && typeof handleQuestionSubmit === 'function') {
        // No session yet - trigger question flow
        console.log('[send-btn] triggering handleQuestionSubmit');
        handleQuestionSubmit(question);
    } else {
        // Normal message send (continuation)
        console.log('[send-btn] calling sendMessage');
        sendMessage();
    }
});

// Stop the current discussion — stops playback, keeps what's shown, unlocks input
function stopDiscussion() {
    if (chatWebSocket && chatWebSocket.readyState === WebSocket.OPEN) {
        chatWebSocket.send(JSON.stringify({ type: 'stop' }));
        chatWebSocket.close();
    }
    chatWebSocket = null;
    beeQueue.stopped = true;
    beeQueue.stop();
    isProcessing = false;
    updateChatStatus('');
    setInputLocked(false);

    // Allow continuing from this point
    window.continuingDebateId = currentSessionId;

    // Hide the stop button
    const stopBtn = document.getElementById('floating-stop-btn');
    if (stopBtn) stopBtn.classList.remove('visible');
}

// Add image button - opens file picker directly (Pro only)
document.getElementById('add-image-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (subscriptionStatus?.status !== 'active') {
        alert('Image attachments are a Pro feature. Upgrade to Pro to attach images.');
        return;
    }
    document.getElementById('image-input').click();
});

// Image file selected
document.getElementById('image-input').addEventListener('change', handleImageSelect);

// Dummy functions for compatibility
function toggleAttachmentMenu() {}
function closeAttachmentMenu() {}

// Retry the last sent message (for overloaded/server errors)
function retryLastMessage() {
    if (!lastSentMessage || isProcessing) {
        return;
    }

    // Remove error messages from failed models
    const container = document.getElementById('chat-messages');
    const errorMessages = container.querySelectorAll('.message.ai-individual .error-labeled');
    errorMessages.forEach(err => {
        const msg = err.closest('.message.ai-individual');
        if (msg) msg.remove();
    });

    // Put message back in input and send
    const input = document.getElementById('chat-input');
    input.value = lastSentMessage;
    sendMessage();
}

// Send a message
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    console.log('[sendMessage] message:', message, 'selectedModels:', typeof selectedModels, selectedModels?.length, 'isProcessing:', isProcessing, 'continuingDebateId:', window.continuingDebateId);

    if (!message) {
        console.log('[sendMessage] BLOCKED - no message');
        input.focus();
        return;
    }

    if (selectedModels.length < 2) {
        // Try to reload from localStorage if we're continuing a debate
        if (window.continuingDebateId) {
            console.log('[sendMessage] Attempting to reload models from localStorage');
            const saved = localStorage.getItem('selectedModels');
            if (saved) {
                try {
                    selectedModels = JSON.parse(saved);
                    console.log('[sendMessage] Reloaded models:', selectedModels.length);
                } catch (e) {
                    console.error('[sendMessage] Failed to reload models:', e);
                }
            }
        }

        // Check again after potential reload
        if (selectedModels.length < 2) {
            console.log('[sendMessage] BLOCKED - not enough models');
            showToast('Please select at least 2 AI voices first', 4000, 'warning');
            return;
        }
    }

    if (isProcessing) {
        console.log('[sendMessage] BLOCKED - already processing');
        return;
    }

    console.log('[sendMessage] Starting - continuingDebateId:', window.continuingDebateId, 'currentSessionId:', currentSessionId);

    // Store for retry functionality
    lastSentMessage = message;

    // Lock input
    setInputLocked(true);

    // Hide export button for new session
    hideExportButton();

    // Hide empty state if present
    const emptyState = document.querySelector('.empty-chat');
    if (emptyState) {
        emptyState.style.display = 'none';
        emptyState._hiddenForChat = true;
    }

    // Add user message to chat (with images if present)
    const imageDataUrls = selectedImages.map(img => img.dataUrl);
    addUserMessage(message, imageDataUrls);

    // Store images for API call, then clear preview
    const imagesToSend = selectedImages.length > 0
        ? selectedImages.map(img => ({ base64: img.base64, media_type: img.media_type }))
        : null;
    clearAllImages();

    // Clear input
    input.value = '';
    input.style.height = 'auto';

    // Show thinking spinner under question bubble
    showBuzzThinking();

    // Update status
    updateChatStatus('Starting discussion...');

    try {
        // Free users: force all models to grok-3-mini
        if (subscriptionStatus?.status !== 'active') {
            selectedModels = selectedModels.map(m => ({
                ...m,
                provider: 'xai',
                model_id: 'grok-3-mini',
                model_name: 'Grok 3 Mini'
            }));
        }

        const summarizerIndex = getSummarizerIndex(selectedModels);
        let session;
        let retried = false;

        // Check if we're continuing an existing conversation
        if (window.continuingDebateId) {
            // Continue existing debate
            console.log('[sendMessage] Continuing debate:', window.continuingDebateId);
            updateChatStatus('Continuing discussion...');

            const continueBody = {
                topic: message,
                config: {
                    models: selectedModels,
                    rounds: 1,
                    summarizer_index: summarizerIndex
                }
            };

            if (imagesToSend) {
                continueBody.images = imagesToSend;
            }

            console.log('[sendMessage] Continue body:', JSON.stringify(continueBody));

            const response = await fetch(`${API_BASE}/api/debates/${window.continuingDebateId}/continue`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(continueBody)
            });

            console.log('[sendMessage] Continue response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[sendMessage] Continue failed:', errorText);
                throw new Error('Failed to continue session');
            }

            session = await response.json();
            console.log('[sendMessage] Continue session:', session);
            currentSessionId = session.id;
            // Keep continuingDebateId for future follow-ups in this session
        } else {
            // Create new debate/session
            const detailMode = localStorage.getItem('detailMode') || 'normal';
            const requestBody = {
                topic: message,
                config: {
                    models: selectedModels,
                    rounds: 1,
                    summarizer_index: summarizerIndex,
                    detail_mode: detailMode
                }
            };

            if (imagesToSend) {
                requestBody.images = imagesToSend;
            }

            const response = await fetch(`${API_BASE}/api/debates`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(requestBody)
            });

            if (response.status === 402) {
                setInputLocked(false);
                showUpgradeModal();
                return;
            }

            if (!response.ok) {
                // Auto-retry once on server errors (503, 500, etc.)
                if (response.status >= 500 && !retried) {
                    console.log('[sendMessage] Server error, retrying...');
                    retried = true;
                    await new Promise(r => setTimeout(r, 1000));
                    const retryResponse = await fetch(`${API_BASE}/api/debates`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify(requestBody)
                    });
                    if (!retryResponse.ok) {
                        const errData = await retryResponse.json().catch(() => ({}));
                        throw new Error(errData.detail || 'Failed to start session');
                    }
                    session = await retryResponse.json();
                    currentSessionId = session.id;
                } else {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.detail || 'Failed to start session');
                }
            } else {
                session = await response.json();
                currentSessionId = session.id;
            }
        }

        // Connect WebSocket (summary placeholder added when summary_start received)
        connectWebSocket(session.id);

        // Update subscription status
        loadSubscriptionStatus();
    } catch (error) {
        console.error('Error starting session:', error);
        updateChatStatus('');
        setInputLocked(false);
        alert(error.message || 'Failed to start session. Please try again.');
    }
}

// Connect to WebSocket
function connectWebSocket(sessionId) {
    console.log('[WebSocket] Connecting to session:', sessionId);
    beeQueue.reset();

    // Close any existing connection first to prevent duplicates
    if (chatWebSocket) {
        console.log('[WebSocket] Closing existing connection');
        try {
            chatWebSocket.onclose = null; // Prevent cleanup handler from running
            chatWebSocket.close();
        } catch (e) {
            // Ignore errors when closing
        }
        chatWebSocket = null;
    }

    const token = localStorage.getItem('token');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/debates/${sessionId}${token ? '?token=' + token : ''}`;
    console.log('[WebSocket] URL:', wsUrl);

    chatWebSocket = new WebSocket(wsUrl);

    chatWebSocket.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        updateChatStatus('Discussing...');
    };

    chatWebSocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
    };

    chatWebSocket.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        updateChatStatus('Connection error');
        setInputLocked(false);
    };

    chatWebSocket.onclose = (event) => {
        console.log('[WebSocket] Closed - code:', event.code, 'reason:', event.reason);
        chatWebSocket = null;
        // Clean up reply state if active
        if (debatePausedForReply) {
            replyTargetBee = null;
            debatePausedForReply = false;
            const indicator = document.getElementById('reply-indicator');
            if (indicator) indicator.classList.remove('visible');
            const inputArea = document.getElementById('chat-input-area');
            if (inputArea) inputArea.classList.remove('replying');
        }
        // Always unlock input when connection closes to prevent softlock
        if (isProcessing) {
            updateChatStatus('Connection closed');
            setInputLocked(false);
        }
    };
}

// Handle WebSocket messages
function _handleDebateEnd() {
    hideBuzzThinking();
    updateChatStatus('');
    finishFinalResponse();
    showExportButton();
    if (debatePausedForReply) {
        replyTargetBee = null;
        debatePausedForReply = false;
        const indicator = document.getElementById('reply-indicator');
        if (indicator) indicator.classList.remove('visible');
        const inputArea = document.getElementById('chat-input-area');
        if (inputArea) inputArea.classList.remove('replying');
    }
    window.continuingDebateId = currentSessionId;
    setInputLocked(false);
    if (window._tryingHive && typeof showTryItBanner === 'function') {
        showTryItBanner();
    }
}

function handleWebSocketMessage(message) {
    console.log('[WebSocket]', message.type, message); // Debug logging
    switch (message.type) {
        case 'round_start':
            updateChatStatus('Getting opinions...');
            updateBuzzProgress('debate');
            break;

        case 'model_start':
            console.log('[AI Response] Starting:', message.model_name);
            beeQueue.enqueue(message.model_name, message.provider, message.personality_id, message.role_name);
            updateBuzzProgress('debate');
            break;

        case 'chunk':
            beeQueue.addChunk(message.model_name, message.content);
            break;

        case 'model_end':
            console.log('[AI Response] Finished:', message.model_name);
            beeQueue.finishBee(message.model_name);
            break;

        case 'model_error':
            console.log('[AI Error]', message.model_name, message.error);
            beeQueue.errorBee(message.model_name, message.error);
            break;

        case 'summary_start':
            updateBuzzProgress('verdict');
            addAiMessagePlaceholder();
            updateChatStatus('Synthesizing summary...');
            break;

        case 'summary_chunk':
            appendToFinalResponse(message.content);
            break;

        case 'summary_end':
            // Summary complete - show jump button if user scrolled up
            const container = document.getElementById('chat-messages');
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
            if (!isNearBottom) {
                showJumpToSummary();
            }
            break;

        case 'summary_error':
            // Summary failed but debate can still end
            updateChatStatus('Summary generation failed');
            break;

        case 'debate_end':
            // Queue until beeQueue finishes typing all bees
            beeQueue._pendingDebateEnd = true;
            beeQueue._flushPending();
            break;

        case 'error':
            hideBuzzThinking();
            updateChatStatus('');
            setInputLocked(false);
            console.error('Session error:', message.message);
            break;

        case 'ping':
            // Keep-alive, ignore
            break;

        case 'intervention_received':
            updateChatStatus('Your message was received. AIs will respond...');
            break;

        case 'verdict_start':
            updateChatStatus('Generating Hive Verdict...');
            break;

        case 'verdict':
            console.log('[Hive Verdict] Received:', message.verdict);
            // Queue verdict until beeQueue finishes playing all bees
            beeQueue._pendingVerdict = message.verdict;
            beeQueue._flushPending();
            break;
    }
}

// Add user message to chat as a big bold question header
function addUserMessage(text, imageDataUrls = []) {
    const container = document.getElementById('chat-messages');

    // Hide and collapse previous headers — scroll handler will manage visibility
    container.querySelectorAll('.question-header').forEach(el => {
        el.style.position = 'relative';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        el.style.height = '0';
        el.style.padding = '0';
        el.style.overflow = 'hidden';
    });

    const msg = document.createElement('div');
    msg.className = 'question-header';

    let html = `<div class="question-header-text"><span class="q-text">${escapeHtml(text)}</span><button id="floating-stop-btn" class="q-pause-btn" onclick="event.stopPropagation(); stopDiscussion()"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button></div>`;
    if (imageDataUrls && imageDataUrls.length > 0) {
        html += '<div class="question-images">';
        for (const dataUrl of imageDataUrls) {
            html += `<img src="${dataUrl}" class="question-image" alt="Attached image">`;
        }
        html += '</div>';
    }

    msg.innerHTML = html;
    // Ensure new header is explicitly visible and sticky
    msg.style.position = 'sticky';
    msg.style.opacity = '1';
    msg.style.pointerEvents = '';
    container.appendChild(msg);
    scrollToBottom(container);

    conversationHistory.push({ role: 'user', content: text });

    // Set up scroll handler to manage which header is active
    setupHeaderScrollHandler();
}

// Manage which question header is sticky based on scroll position
let _headerScrollSetup = false;
function setupHeaderScrollHandler() {
    if (_headerScrollSetup) return;
    _headerScrollSetup = true;

    const container = document.getElementById('chat-messages');
    let lastActiveIndex = -1;
    let scrollRaf = null;

    container.addEventListener('scroll', () => {
        if (scrollRaf) return;
        scrollRaf = requestAnimationFrame(() => {
            scrollRaf = null;
            const headers = Array.from(container.querySelectorAll('.question-header'));
            if (headers.length <= 1) {
                if (headers[0] && lastActiveIndex !== 0) {
                    headers[0].style.position = 'sticky';
                    headers[0].style.opacity = '1';
                    headers[0].style.pointerEvents = '';
                    headers[0].style.height = '';
                    headers[0].style.padding = '';
                    headers[0].style.overflow = '';
                    lastActiveIndex = 0;
                }
                return;
            }

            const scrollTop = container.scrollTop;
            let activeIndex = 0;
            for (let i = 0; i < headers.length; i++) {
                if (headers[i].offsetTop <= scrollTop + 60) {
                    activeIndex = i;
                }
            }

            if (activeIndex === lastActiveIndex) return;
            lastActiveIndex = activeIndex;

            headers.forEach((h, i) => {
                if (i === activeIndex) {
                    h.style.position = 'sticky';
                    h.style.opacity = '1';
                    h.style.pointerEvents = '';
                    h.style.height = '';
                    h.style.padding = '';
                    h.style.overflow = '';
                } else {
                    h.style.position = 'relative';
                    h.style.opacity = '0';
                    h.style.pointerEvents = 'none';
                    h.style.height = '0';
                    h.style.padding = '0';
                    h.style.overflow = 'hidden';
                }
            });
        }); // end RAF
    }); // end scroll
}

// Add AI response placeholder
function addAiMessagePlaceholder() {
    const container = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = 'message ai streaming';
    msg.id = 'current-ai-response';
    msg.innerHTML = `
        <div class="message-header">
            <span class="ensemble-badge">Ensemble</span>
            <span>Combined response from ${selectedModels.length} AIs</span>
        </div>
        <div class="message-content"></div>
    `;
    container.appendChild(msg);
    scrollToBottom(container);
}

// Append to final response
function appendToFinalResponse(text) {
    const msg = document.getElementById('current-ai-response');
    if (msg) {
        const content = msg.querySelector('.message-content');
        content.textContent += text;
        scrollToBottom(document.getElementById('chat-messages'));
    }
}

// Finish final response
function finishFinalResponse() {
    const msg = document.getElementById('current-ai-response');
    if (msg) {
        msg.classList.remove('streaming');
        msg.removeAttribute('id');

        const contentEl = msg.querySelector('.message-content');
        const rawContent = contentEl.textContent;
        conversationHistory.push({ role: 'assistant', content: rawContent });

        // Parse and render as styled cards
        const formattedHtml = formatSummaryAsCards(rawContent);
        if (formattedHtml) {
            contentEl.innerHTML = formattedHtml;
        }
    }
}

// Format summary text with chat-style lines (like AI messages)
function formatSummaryAsCards(text) {
    const lines = text.split('\n').filter(line => line.trim());
    let entries = [];
    let bottomLine = '';
    let inShort = '';
    let finalAnswer = '';

    // Skip section headers
    const skipNames = ['key positions', 'points of agreement', 'points of disagreement', 'the bottom line', 'summary', 'overview'];

    for (const line of lines) {
        // Skip markdown headers
        if (line.startsWith('#')) continue;

        // Match **Name**: content
        const match = line.match(/\*\*([^*]+)\*\*[:\s]*(.+)/);
        if (match) {
            const name = match[1].trim().toLowerCase();
            const content = match[2].trim();

            // Skip section headers
            if (skipNames.includes(name)) continue;

            if (name === 'bottom line' || name === 'verdict') {
                bottomLine = content;
            } else if (name === 'in short') {
                inShort = content;
            } else if (name === 'final answer' || name === 'final version') {
                finalAnswer = content;
            } else {
                entries.push({ name: match[1].trim(), content });
            }
        }
    }

    // If we couldn't parse anything, return null to keep original
    if (entries.length === 0 && !bottomLine && !inShort && !finalAnswer) {
        return null;
    }

    // Build HTML with chat-style formatting (matches AI response styling)
    let html = '<div class="summary-formatted" style="font-size: 0.95rem; line-height: 1.7;">';

    for (const entry of entries) {
        const borderColor = getProviderColor(entry.name);
        html += `<div style="border-left: 2px solid ${borderColor}; padding-left: 12px; margin-bottom: 16px;"><span style="font-weight: 600; color: ${borderColor};">${escapeHtml(entry.name)}</span> <span style="color: var(--text-primary);">${escapeHtml(entry.content)}</span></div>`;
    }

    if (bottomLine) {
        html += `<div style="margin-top: 12px; padding: 12px 16px; background: var(--surface-light); border-radius: 8px;"><strong>Bottom line:</strong> ${escapeHtml(bottomLine)}</div>`;
    }

    if (inShort) {
        html += `<div style="margin-top: 12px; padding: 12px 16px; background: var(--surface-light); border-radius: 8px;"><strong>In short:</strong> ${escapeHtml(inShort)}</div>`;
    }

    if (finalAnswer) {
        html += `<div style="margin-top: 12px; padding: 12px 16px; background: linear-gradient(135deg, rgba(250, 204, 21, 0.1), rgba(234, 179, 8, 0.1)); border: 1px solid var(--primary-color); border-radius: 8px;"><strong style="color: var(--primary-color);">Final Answer:</strong> ${escapeHtml(finalAnswer)}</div>`;
    }

    html += '</div>';
    return html;
}

// Get provider color from AI model name
function getProviderColor(name) {
    const n = name.toLowerCase();
    if (n.includes('gpt') || n.includes('openai')) return '#3b82f6';
    if (n.includes('claude') || n.includes('anthropic')) return '#f97316';
    if (n.includes('gemini') || n.includes('google')) return '#eab308';
    if (n.includes('deepseek')) return '#a855f7';
    if (n.includes('grok') || n.includes('xai')) return '#6b7280';
    return 'var(--primary-color)';
}

// Get provider class from AI model name
function getProviderClassFromName(name) {
    const n = name.toLowerCase();
    if (n.includes('gpt') || n.includes('openai')) return 'provider-openai';
    if (n.includes('claude') || n.includes('anthropic')) return 'provider-anthropic';
    if (n.includes('gemini') || n.includes('google')) return 'provider-google';
    if (n.includes('deepseek')) return 'provider-deepseek';
    if (n.includes('grok') || n.includes('xai')) return 'provider-xai';
    return '';
}

// Show bouncing bee avatars + progress bar under question bubble
function showBuzzThinking() {
    const container = document.getElementById('chat-messages');
    console.log('[BuzzThinking] showBuzzThinking called, container:', !!container);
    hideBuzzThinking();

    // Get current hive bee icons via window globals
    let beeIcons = [];
    try {
        const hives = window.allHives || [];
        const customs = window.customHives || [];
        const hiveId = window.selectedHiveId || localStorage.getItem('selectedHive') || 'chaos';
        const specials = window.selectedSpecialBees || [];
        const specialBees = window.allSpecialBees || [];

        const customHive = customs.find(h => h.id === hiveId);
        if (customHive && customHive.bees) {
            beeIcons = customHive.bees.map(b => getBeeIconPath(b.id));
        } else {
            const hive = hives.find(h => h.id === hiveId);
            if (hive && hive.personalities) {
                beeIcons = hive.personalities.map(p => getBeeIconPath(p.id));
            }
        }
        // Add special bees
        specials.forEach(sid => {
            const sb = specialBees.find(b => b.id === sid);
            if (sb) beeIcons.push(getBeeIconPath(sb.id));
        });
    } catch (e) {
        console.warn('[BuzzThinking] Error getting bee icons:', e);
    }
    if (beeIcons.length === 0) beeIcons = ['/images/bee-icons/default bee icon.png'];

    const beesHtml = beeIcons.map(src =>
        `<img src="${src}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png'">`
    ).join('');

    const el = document.createElement('div');
    el.className = 'buzz-thinking';
    el.id = 'buzz-thinking-indicator';
    el.innerHTML = `<div class="buzz-thinking-bees">${beesHtml}</div>`;
    container.appendChild(el);
    console.log('[BuzzThinking] Element appended, beeIcons:', beeIcons.length, 'innerHTML length:', el.innerHTML.length);
    scrollToBottom(container);
}

// Update the progress step in the buzz thinking indicator
function updateBuzzProgress(step) {
    const indicator = document.getElementById('buzz-thinking-indicator');
    if (!indicator) return;
    const steps = indicator.querySelectorAll('.buzz-progress-step');
    const order = ['gather', 'debate', 'verdict'];
    const idx = order.indexOf(step);
    steps.forEach((el, i) => {
        el.classList.remove('active', 'done');
        if (i < idx) el.classList.add('done');
        else if (i === idx) el.classList.add('active');
    });
    const container = document.getElementById('chat-messages');
    if (container) scrollToBottom(container);
}

// Hide thinking indicator
function hideBuzzThinking() {
    const el = document.getElementById('buzz-thinking-indicator');
    if (el) el.remove();
}

// Add AI discussion message to main chat (inline)
function addAiDiscussionMessage(modelName, provider, content, personalityId, roleName) {
    // If swipe-empty is showing, restore chat view
    if (_swipeEmptyShowing) swipeHideEmpty();
    const container = document.getElementById('chat-messages');

    const msg = document.createElement('div');
    msg.className = 'message ai-individual streaming';
    msg.dataset.model = modelName;
    msg.dataset.provider = provider;
    if (personalityId) {
        msg.dataset.personality = personalityId;
    }

    // Get personality color
    const colors = window.getPersonalityColor ? window.getPersonalityColor(personalityId) : null;
    if (colors) {
        msg.style.borderLeftColor = colors.border;
    }

    // Use bee icon image from /images/bee-icons/
    const iconPath = personalityId ? getBeeIconPath(personalityId) : '/images/bee-icons/default bee icon.png';
    const beeImgHtml = `<img class="bee-avatar" src="${iconPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png'">`;

    const roleNameHtml = roleName ? `<span class="ai-role-name">${escapeHtml(roleName)}</span>` : '';

    // Apply color to header
    const headerStyle = colors ? `color: ${colors.text};` : '';

    msg.innerHTML = `
        <div class="ai-model-header">
            ${beeImgHtml}
            <div class="ai-name-info">
                <span class="ai-model-name" style="${headerStyle}">${escapeHtml(modelName)}</span>
                ${roleNameHtml}
            </div>
            <span class="ai-provider-tag">${escapeHtml(provider)}</span>
        </div>
        <div class="message-content"></div>
        <button class="reply-to-bee-btn" data-bee-name="${escapeHtml(modelName)}" data-personality="${escapeHtml(personalityId || '')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
            Reply
        </button>
    `;
    container.appendChild(msg);
    // Attach reply click handler via event listener (safer than inline onclick)
    const replyBtn = msg.querySelector('.reply-to-bee-btn');
    if (replyBtn) {
        replyBtn.addEventListener('click', () => {
            startReplyToBee(replyBtn.dataset.beeName, replyBtn.dataset.personality);
        });
    }
    scrollToBottom(container);
}

// Get emoji for a personality
function getPersonalityEmoji(personalityId) {
    const personalities = window.allPersonalities || [];
    const p = personalities.find(p => p.id === personalityId);
    return p ? p.emoji : '🐝';
}

// Append to AI message in main chat
function appendToAiDiscussion(modelName, text) {
    const container = document.getElementById('chat-messages');
    const msg = container.querySelector(`.message.ai-individual[data-model="${modelName}"].streaming`);
    if (msg) {
        const content = msg.querySelector('.message-content');
        content.textContent += text;
        scrollToBottom(container);
    }
}

// Finish AI discussion message
function finishAiDiscussion(modelName) {
    const container = document.getElementById('chat-messages');
    const msg = container.querySelector(`.message.ai-individual[data-model="${modelName}"].streaming`);
    if (msg) {
        msg.classList.remove('streaming');
        // Remove markdown ** characters
        const content = msg.querySelector('.message-content');
        if (content) {
            content.textContent = content.textContent.replace(/\*\*/g, '');

            // Clamp to 3 lines with "Show more" toggle
            content.classList.add('clamped');
            requestAnimationFrame(() => {
                if (content.scrollHeight > content.clientHeight + 1) {
                    const btn = document.createElement('button');
                    btn.className = 'show-more-btn';
                    btn.textContent = 'Show more';
                    btn.onclick = () => {
                        if (content.classList.contains('clamped')) {
                            content.classList.remove('clamped');
                            btn.textContent = 'Show less';
                        } else {
                            content.classList.add('clamped');
                            btn.textContent = 'Show more';
                        }
                    };
                    msg.appendChild(btn);
                }
            });
        }
    }
}

// Add AI discussion error - simple message, no fix suggestions
function addAiDiscussionError(modelName, error) {
    const container = document.getElementById('chat-messages');
    const msg = container.querySelector(`.message.ai-individual[data-model="${modelName}"]`);
    if (msg) {
        msg.classList.remove('streaming');
        const content = msg.querySelector('.message-content');
        content.innerHTML = `
            <div style="color: var(--text-secondary); font-size: 0.9rem; font-style: italic;">
                This bee couldn't respond. Please try again.
            </div>
        `;
    }
}

// Update chat status indicator - shows in the input placeholder
function updateChatStatus(text) {
    const input = document.getElementById('chat-input');
    if (!input) return;

    if (text) {
        input.placeholder = text;
    } else {
        input.placeholder = 'Ask the hive...';
    }
}

// Lock/unlock input - toggle between send and stop mode
function setInputLocked(locked) {
    console.log('[setInputLocked] locked:', locked, 'continuingDebateId:', window.continuingDebateId);
    isProcessing = locked;
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const voicesBar = document.querySelector('.voices-bar');
    const inputArea = document.getElementById('chat-input-area');
    const quickTemplates = document.getElementById('quick-templates');
    const chatInputContainer = document.querySelector('.chat-input-container');
    const chatButtonsRow = document.querySelector('.chat-buttons-row');

    const floatingStopBtn = document.getElementById('floating-stop-btn');
    const chatMessages = document.getElementById('chat-messages');

    if (locked) {
        // Hide entire input area and show pause button inside question bubble
        sendBtn.classList.add('stop-mode');
        if (inputArea) inputArea.classList.add('debate-active');
        if (floatingStopBtn) floatingStopBtn.classList.add('visible');
        // Add debate-running class to the question header text
        const qHeader = chatMessages ? chatMessages.querySelector('.question-header:last-of-type .question-header-text') : null;
        if (qHeader) qHeader.classList.add('debate-running');
        if (qHeader) qHeader.onclick = () => stopDiscussion();
        if (chatMessages) chatMessages.style.paddingBottom = '80px';
        // Hide voices bar during debate
        if (voicesBar) { voicesBar.style.visibility = 'hidden'; voicesBar.style.opacity = '0'; }
    } else {
        // Show input area and hide pause button
        sendBtn.classList.remove('stop-mode');
        sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
        input.placeholder = 'Ask the hive...';
        if (inputArea) inputArea.classList.remove('debate-active');
        if (floatingStopBtn) floatingStopBtn.classList.remove('visible');
        // Remove debate-running class from all question headers
        if (chatMessages) {
            chatMessages.querySelectorAll('.question-header-text.debate-running').forEach(el => {
                el.classList.remove('debate-running');
                el.onclick = null;
            });
        }
        if (chatMessages) chatMessages.style.paddingBottom = '';
        // Show voices bar again
        if (voicesBar) { voicesBar.style.visibility = ''; voicesBar.style.opacity = ''; }

        updateSendButton();
        console.log('[setInputLocked] after updateSendButton, btn.disabled:', sendBtn.disabled);
    }
}

// Expose setInputLocked globally for app.js
window.setInputLocked = setInputLocked;

// --- Reply-to-bee feature ---

function startReplyToBee(beeName, personalityId) {
    if (debatePausedForReply) return; // Already in reply mode
    replyTargetBee = { name: beeName, personalityId: personalityId };
    debatePausedForReply = true;

    // Pause the debate
    if (chatWebSocket && chatWebSocket.readyState === WebSocket.OPEN) {
        chatWebSocket.send(JSON.stringify({ type: 'pause' }));
    }

    // Show reply indicator
    const indicator = document.getElementById('reply-indicator');
    const indicatorText = document.getElementById('reply-indicator-text');
    if (indicator) indicator.classList.add('visible');
    if (indicatorText) indicatorText.textContent = `Replying to ${beeName}`;

    // Show input area even during debate
    const inputArea = document.getElementById('chat-input-area');
    if (inputArea) inputArea.classList.add('replying');

    // Hide floating stop button while replying
    const floatingStopBtn = document.getElementById('floating-stop-btn');
    if (floatingStopBtn) floatingStopBtn.classList.remove('visible');

    // Focus input and update placeholder
    const input = document.getElementById('chat-input');
    if (input) {
        input.placeholder = `Reply to ${beeName}...`;
        input.focus();
        // Scroll input into view on mobile (keyboard may cover it)
        setTimeout(() => input.scrollIntoView({ behavior: 'smooth', block: 'end' }), 300);
    }

    // Update send button
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
        sendBtn.classList.remove('stop-mode');
        sendBtn.innerHTML = 'Reply';
        sendBtn.disabled = false;
    }
}

function cancelReplyToBee() {
    if (!debatePausedForReply) return;

    replyTargetBee = null;
    debatePausedForReply = false;

    // Hide reply indicator
    const indicator = document.getElementById('reply-indicator');
    if (indicator) indicator.classList.remove('visible');

    // Remove replying class so debate-active hides input again
    const inputArea = document.getElementById('chat-input-area');
    if (inputArea) inputArea.classList.remove('replying');

    // Show floating stop button again
    const floatingStopBtn = document.getElementById('floating-stop-btn');
    if (floatingStopBtn && isProcessing) floatingStopBtn.classList.add('visible');

    // Clear input
    const input = document.getElementById('chat-input');
    if (input) {
        input.value = '';
        input.placeholder = 'Ask the hive...';
    }

    // Resume the debate
    if (chatWebSocket && chatWebSocket.readyState === WebSocket.OPEN) {
        chatWebSocket.send(JSON.stringify({ type: 'resume' }));
    }
}

function sendReplyToBee() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message || !replyTargetBee || !chatWebSocket || chatWebSocket.readyState !== WebSocket.OPEN) {
        return;
    }

    const beeName = replyTargetBee.name;
    const personalityId = replyTargetBee.personalityId;

    // Add reply bubble to chat (smaller, under topic)
    addUserReplyBubble(message, beeName);

    // Clear input
    input.value = '';
    input.style.height = 'auto';

    // Send targeted reply via WebSocket
    chatWebSocket.send(JSON.stringify({
        type: 'reply_to_bee',
        content: message,
        target_bee: beeName,
        target_personality_id: personalityId
    }));

    // Clean up reply state
    replyTargetBee = null;
    debatePausedForReply = false;

    // Hide reply indicator
    const indicator = document.getElementById('reply-indicator');
    if (indicator) indicator.classList.remove('visible');

    // Remove replying class
    const inputArea = document.getElementById('chat-input-area');
    if (inputArea) inputArea.classList.remove('replying');

    // Show floating stop button again (only if debate is still running)
    const floatingStopBtn = document.getElementById('floating-stop-btn');
    if (floatingStopBtn && isProcessing) floatingStopBtn.classList.add('visible');

    updateChatStatus(`${beeName} is reading your reply...`);
}

function addUserReplyBubble(text, beeName) {
    const container = document.getElementById('chat-messages');
    const bubble = document.createElement('div');
    bubble.className = 'user-reply-bubble';
    bubble.innerHTML = `<div class="user-reply-bubble-inner">
        <span class="user-reply-bubble-target">↩ To ${escapeHtml(beeName)}:</span> ${escapeHtml(text)}
    </div>`;
    // Append inside the sticky question-header so it scrolls with it
    const questionHeader = container.querySelector('.question-header');
    if (questionHeader) {
        questionHeader.appendChild(bubble);
    } else {
        container.appendChild(bubble);
    }
    scrollToBottom(container);
}

// Wire up cancel button and Escape key
document.getElementById('reply-cancel-btn')?.addEventListener('click', cancelReplyToBee);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && debatePausedForReply) {
        cancelReplyToBee();
    }
});

// Send an intervention message during discussion
async function sendIntervention() {
    // If we're in reply-to-bee mode, use that instead
    if (debatePausedForReply && replyTargetBee) {
        sendReplyToBee();
        return;
    }

    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message || !chatWebSocket || chatWebSocket.readyState !== WebSocket.OPEN) {
        return;
    }

    // Add user message to chat
    addUserMessage(message);

    // Clear input
    input.value = '';
    input.style.height = 'auto';

    // Send intervention via WebSocket
    chatWebSocket.send(JSON.stringify({
        type: 'intervention',
        content: message
    }));

    updateChatStatus('Processing your input...');
}

// Scroll to bottom (only when user is already near bottom or forced)
let autoScrollEnabled = true;

function scrollToBottom(element, force = false) {
    if (force || autoScrollEnabled) {
        // Check if user is near the bottom (within 100px)
        const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
        if (force || isNearBottom) {
            element.scrollTop = element.scrollHeight;
        }
    }
}

// Jump to summary button
function showJumpToSummary() {
    let btn = document.getElementById('jump-to-summary-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'jump-to-summary-btn';
        btn.className = 'jump-to-summary-btn';
        btn.innerHTML = '↓ Jump to Summary';
        btn.onclick = () => {
            const container = document.getElementById('chat-messages');
            container.scrollTop = container.scrollHeight;
            hideJumpToSummary();
        };
        document.querySelector('.chat-input-area').prepend(btn);
    }
    btn.style.display = 'block';
}

function hideJumpToSummary() {
    const btn = document.getElementById('jump-to-summary-btn');
    if (btn) btn.style.display = 'none';
}

// Track scroll position to show/hide jump button
document.getElementById('chat-messages')?.addEventListener('scroll', function() {
    const isNearBottom = this.scrollHeight - this.scrollTop - this.clientHeight < 150;
    if (isNearBottom) {
        hideJumpToSummary();
    }
});

// Swipe up/down: show empty state honeycomb when no responses, hide on swipe down
let _swipeEmptyShowing = false;

function swipeShowEmpty() {
    const container = document.getElementById('chat-messages');
    const emptyState = container?.querySelector('.empty-chat');
    if (!emptyState || !emptyState._hiddenForChat) return;
    // Hide question and spinner
    container.querySelectorAll('.question-header').forEach(h => h.style.display = 'none');
    const spinner = document.getElementById('buzz-thinking-indicator');
    if (spinner) spinner.style.display = 'none';
    emptyState.style.display = '';
    _swipeEmptyShowing = true;
}

function swipeHideEmpty() {
    const container = document.getElementById('chat-messages');
    const emptyState = container?.querySelector('.empty-chat');
    if (!emptyState) return;
    emptyState.style.display = 'none';
    container.querySelectorAll('.question-header').forEach(h => {
        h.style.display = '';
        h.style.position = 'sticky';
        h.style.opacity = '1';
        h.style.pointerEvents = '';
        h.style.height = '';
        h.style.padding = '';
        h.style.overflow = '';
    });
    const spinner = document.getElementById('buzz-thinking-indicator');
    if (spinner) spinner.style.display = '';
    _swipeEmptyShowing = false;
}

(function setupSwipeEmptyState() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    let touchStartY = 0;

    function hasAiResponses() {
        return container.querySelectorAll('.message.ai-individual, .summary-formatted').length > 0;
    }

    container.addEventListener('touchstart', function(e) {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    container.addEventListener('touchend', function(e) {
        const deltaY = touchStartY - e.changedTouches[0].clientY;
        if (Math.abs(deltaY) < 50) return;
        if (deltaY > 0 && !_swipeEmptyShowing && !hasAiResponses()) {
            swipeShowEmpty();
        } else if (deltaY < 0 && _swipeEmptyShowing) {
            swipeHideEmpty();
        }
    }, { passive: true });

    container.addEventListener('wheel', function(e) {
        if (e.deltaY > 0 && !_swipeEmptyShowing && !hasAiResponses() && container.scrollTop <= 5) {
            swipeShowEmpty();
        } else if (e.deltaY < 0 && _swipeEmptyShowing) {
            swipeHideEmpty();
        }
    }, { passive: true });
})();

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (chatWebSocket) {
        chatWebSocket.close();
    }
});

// Show/hide export button functions (kept for compatibility, button always visible now)
function showExportButton() {
    // Button is always visible, Pro check happens on click
}

function hideExportButton() {
    // Button is always visible, Pro check happens on click
}

// Show toast notification
function showToast(message, duration = 5000, type = 'info') {
    // Remove existing toast if any
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto-remove after duration
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Handle image file selection
function handleImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Show one-time notice about vision models only if a non-vision model is selected
    if (!imageNoticeShown && selectedImages.length === 0) {
        const nonVisionModels = getNonVisionSelectedModels();
        if (nonVisionModels.length > 0) {
            const names = nonVisionModels.map(m => m.model_name).join(', ');
            showToast(`⚠️ ${names} cannot view images and will respond to text only.`, 8000, 'warning');
            imageNoticeShown = true;
        }
    }

    // Check max images limit
    if (selectedImages.length >= MAX_IMAGES) {
        alert(`Maximum ${MAX_IMAGES} images allowed`);
        return;
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        alert('Only images are supported (JPG, PNG, GIF, WebP).\n\nPDFs and other files cannot be sent to the AIs.');
        event.target.value = '';
        return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('Image must be smaller than 5MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        // Extract base64 data (remove "data:image/xxx;base64," prefix)
        const base64 = dataUrl.split(',')[1];

        const imageData = {
            base64: base64,
            media_type: file.type,
            dataUrl: dataUrl
        };

        selectedImages.push(imageData);

        // Add preview
        addImagePreview(imageData, selectedImages.length - 1);
        updateSendButton();
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    event.target.value = '';
}

// Add image preview to container
function addImagePreview(imageData, index) {
    const container = document.getElementById('images-preview-container');

    const item = document.createElement('div');
    item.className = 'image-preview-item';
    item.dataset.index = index;

    const img = document.createElement('img');
    img.src = imageData.dataUrl;
    img.alt = 'Preview';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-image-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove image';
    removeBtn.onclick = () => removeImage(index);

    item.appendChild(img);
    item.appendChild(removeBtn);
    container.appendChild(item);
}

// Remove single image by index
function removeImage(index) {
    selectedImages.splice(index, 1);
    renderImagePreviews();
    updateSendButton();
}

// Re-render all image previews
function renderImagePreviews() {
    const container = document.getElementById('images-preview-container');
    container.innerHTML = '';
    selectedImages.forEach((img, i) => addImagePreview(img, i));
}

// Clear all selected images
function clearAllImages() {
    selectedImages = [];
    const container = document.getElementById('images-preview-container');
    container.innerHTML = '';
}

// Export conversation to PDF
async function exportToPdf() {
    if (!currentSessionId) {
        alert('No conversation to export');
        return;
    }

    const btn = document.getElementById('export-pdf-btn');
    const originalText = btn.textContent;
    btn.textContent = '...';
    btn.disabled = true;

    try {
        // Fetch the HTML export (without auto-print)
        const response = await fetch(`${API_BASE}/api/debates/${currentSessionId}/export?auto_print=false`, {
            headers: getAuthHeaders()
        });

        if (response.status === 402) {
            alert('Export to PDF is a Pro feature. Please upgrade to access.');
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to fetch export');
        }

        const html = await response.text();

        // Create a temporary container
        const container = document.createElement('div');
        container.innerHTML = html;

        // Extract just the body content
        const bodyContent = container.querySelector('body');
        if (bodyContent) {
            // Remove the script tag if present
            const script = bodyContent.querySelector('script');
            if (script) script.remove();
        }

        // Generate PDF using html2pdf
        const opt = {
            margin: [10, 10, 10, 10],
            filename: 'ensemble-ai-conversation.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        await html2pdf().set(opt).from(bodyContent || container).save();

    } catch (error) {
        console.error('Error exporting PDF:', error);
        alert('Failed to export PDF. Please try again.');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// ============ CHAT HISTORY SIDEBAR ============

// Toggle sidebar
function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('active');
    loadChatHistory();
    dismissSidebarHint();
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
}

// Dismiss the sidebar hint (pulse + tooltip)
function dismissSidebarHint() {
    const toggle = document.getElementById('sidebar-toggle');
    const tooltip = document.getElementById('sidebar-tooltip');
    if (toggle) toggle.classList.remove('pulse');
    if (tooltip) tooltip.classList.remove('show');
    localStorage.setItem('sidebarHintSeen', 'true');
}

// Show sidebar hint for first-time users
function showSidebarHint() {
    if (localStorage.getItem('sidebarHintSeen')) return;

    const toggle = document.getElementById('sidebar-toggle');
    const tooltip = document.getElementById('sidebar-tooltip');

    if (toggle && tooltip) {
        // Start pulse animation
        toggle.classList.add('pulse');

        // Show tooltip after a short delay
        setTimeout(() => {
            tooltip.classList.add('show');
        }, 500);

        // Auto-hide tooltip after 5 seconds (but keep pulse until clicked)
        setTimeout(() => {
            tooltip.classList.remove('show');
        }, 5500);
    }
}

// Initialize sidebar hint after page load
setTimeout(showSidebarHint, 1000);

// Sidebar toggle buttons (mobile + desktop)
document.getElementById('sidebar-toggle')?.addEventListener('click', openSidebar);
document.getElementById('desktop-sidebar-toggle')?.addEventListener('click', openSidebar);

// Close sidebar button
document.getElementById('sidebar-close')?.addEventListener('click', closeSidebar);

// Close on overlay click
document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

// New debate button - just reload the page for fresh state
document.getElementById('new-chat-btn')?.addEventListener('click', () => {
    window.location.href = '/';
});

// Store loaded debates for search filtering
let loadedDebates = [];

// Load chat history from API
async function loadChatHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;

    // Don't attempt to load if user isn't logged in
    const token = localStorage.getItem('token');
    if (!token) {
        list.innerHTML = '';
        return;
    }

    list.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Loading...</p>';

    try {
        const response = await fetch(`${API_BASE}/api/debates`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`${response.status}: ${text}`);
        }

        loadedDebates = await response.json();
        renderHistoryList(loadedDebates);

    } catch (error) {
        console.error('Error loading history:', error);
        list.innerHTML = '<div class="history-empty"><div class="history-empty-icon">⚠️</div><div class="history-empty-text">Failed to load history.<br><small style="color:var(--text-secondary)">' + error.message + '</small></div></div>';
    }
}

// Group debates by date category
function groupDebatesByDate(debates) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastMonth = new Date(today);
    lastMonth.setDate(lastMonth.getDate() - 30);

    const groups = {
        'Today': [],
        'Yesterday': [],
        'Previous 7 Days': [],
        'Previous 30 Days': [],
        'Older': []
    };

    debates.forEach(debate => {
        const date = new Date(debate.created_at);
        if (date >= today) {
            groups['Today'].push(debate);
        } else if (date >= yesterday) {
            groups['Yesterday'].push(debate);
        } else if (date >= lastWeek) {
            groups['Previous 7 Days'].push(debate);
        } else if (date >= lastMonth) {
            groups['Previous 30 Days'].push(debate);
        } else {
            groups['Older'].push(debate);
        }
    });

    return groups;
}

// Format time for display
function formatHistoryTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (date >= today) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
}

// Render the history list with grouping
function renderHistoryList(debates) {
    const list = document.getElementById('history-list');

    if (debates.length === 0) {
        list.innerHTML = `<div class="history-empty">No conversations yet</div>`;
        return;
    }

    const groups = groupDebatesByDate(debates);
    let html = '';

    for (const [groupName, groupDebates] of Object.entries(groups)) {
        if (groupDebates.length === 0) continue;

        html += `<div class="history-group">`;
        html += `<div class="history-group-title">${groupName}</div>`;

        groupDebates.forEach(debate => {
            const topic = debate.topic.length > 30 ? debate.topic.substring(0, 30) + '...' : debate.topic;
            html += `
                <div class="history-item" data-id="${debate.id}">
                    <svg class="history-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <div class="history-item-content">
                        <div class="history-item-topic">${escapeHtml(topic)}</div>
                    </div>
                    <button class="history-item-delete" title="Delete" data-id="${debate.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            `;
        });

        html += `</div>`;
    }

    list.innerHTML = html;

    // Add click handlers for loading conversations
    list.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.history-item-delete')) {
                loadConversation(item.dataset.id);
            }
        });
    });

    // Add click handlers for delete buttons
    list.querySelectorAll('.history-item-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const debateId = btn.dataset.id;
            if (debateId && confirm('Delete this conversation?')) {
                await deleteConversation(debateId);
            }
        });
    });
}

// Delete a conversation
async function deleteConversation(debateId) {
    try {
        const response = await fetch(`${API_BASE}/api/debates/${debateId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            loadedDebates = loadedDebates.filter(d => d.id !== debateId);
            renderHistoryList(loadedDebates);
        } else {
            alert('Failed to delete conversation');
        }
    } catch (error) {
        console.error('Error deleting conversation:', error);
    }
}

// Search history
document.getElementById('history-search-input')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
        renderHistoryList(loadedDebates);
        return;
    }
    const filtered = loadedDebates.filter(d =>
        d.topic.toLowerCase().includes(query)
    );
    renderHistoryList(filtered);
});

// Load a specific conversation
async function loadConversation(debateId) {
    try {
        const response = await fetch(`${API_BASE}/api/debates/${debateId}`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to load conversation');

        const data = await response.json();
        const debate = data.debate;
        const messages = data.messages;

        // Close sidebar
        closeSidebar();

        // Clear current chat
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';

        // Hide empty state if present
        const emptyState = document.querySelector('.empty-chat');
        if (emptyState) emptyState.style.display = 'none';

        // Extract images from config if present and convert to dataUrls
        let imageDataUrls = [];
        if (debate.config && debate.config.images && debate.config.images.length > 0) {
            imageDataUrls = debate.config.images.map(img =>
                `data:${img.media_type};base64,${img.base64}`
            );
        }

        // Get original topic (first part before any "---" for old data compatibility)
        const originalTopic = debate.topic.split(/\s*---\s*/)[0].trim();

        // Separate verdict and regular messages
        let verdictMsg = null;
        const chatMessages = [];
        messages.forEach(msg => {
            if (msg.round === 0 && msg.model_name === 'verdict' && msg.provider === 'system') {
                verdictMsg = msg;
            } else if (msg.round === 0) {
                // Old summary format — skip (replaced by verdict)
            } else {
                chatMessages.push(msg);
            }
        });

        // Sort messages by round and created_at
        chatMessages.sort((a, b) => {
            if (a.round !== b.round) return a.round - b.round;
            return new Date(a.created_at) - new Date(b.created_at);
        });

        // Display messages in order
        // First: original topic as question header bubble
        addUserMessage(originalTopic, imageDataUrls);

        // Then: all other messages in chronological order
        for (const msg of chatMessages) {
            if (msg.provider === 'user') {
                addUserMessage(msg.content);
            } else {
                addHistoryAiMessage(msg.model_name, msg.provider, msg.content);
            }
        }

        // Add verdict if exists
        if (verdictMsg) {
            try {
                const verdict = JSON.parse(verdictMsg.content);
                renderHiveVerdict(verdict, true);
            } catch (e) {
                console.error('Failed to parse verdict:', e);
            }
        }

        // Update current session ID
        currentSessionId = debateId;

        // Store conversation context for continuing
        conversationHistory = [];
        conversationHistory.push({ role: 'user', content: debate.topic });
        messages.forEach(msg => {
            if (msg.round > 0) {
                conversationHistory.push({
                    role: 'assistant',
                    content: `${msg.model_name}: ${msg.content}`
                });
            }
        });
        if (verdictMsg) {
            conversationHistory.push({ role: 'assistant', content: verdictMsg.content });
        }

        // Restore models from debate config so continuations use the same bees
        if (debate.config && debate.config.models && debate.config.models.length > 0) {
            selectedModels = debate.config.models;
        }

        // Store for continuing conversation
        window.loadedConversationTopic = debate.topic;
        window.continuingDebateId = debateId;  // Track which debate we're continuing

        // Show chat input area, voices bar, and hive chip
        const inputArea = document.getElementById('chat-input-area');
        if (inputArea) {
            inputArea.style.display = 'block';
            inputArea.classList.remove('debate-active');
        }
        const hiveChipBar = document.getElementById('hive-chip-bar');
        if (hiveChipBar) hiveChipBar.style.display = '';
        if (typeof updateHiveChip === 'function') updateHiveChip();
        const voicesBarRestore = document.querySelector('.voices-bar');
        if (voicesBarRestore) {
            voicesBarRestore.style.visibility = '';
            voicesBarRestore.style.opacity = '';
        }

        // Enable continuing the conversation
        setInputLocked(false);
        updateSendButton();
        setupHeaderScrollHandler();

        scrollToBottom(container, true);

    } catch (error) {
        console.error('Error loading conversation:', error);
        alert('Failed to load conversation.');
    }
}

// Add AI message from history (already complete, no streaming)
function addHistoryAiMessage(modelName, provider, content) {
    const container = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = 'message ai-individual';
    msg.dataset.model = modelName;
    msg.dataset.provider = provider;

    // Check if this is a personality name and get the icon
    const personalityId = getPersonalityFromName(modelName);

    // Set data-personality for CSS colors
    if (personalityId) {
        msg.dataset.personality = personalityId;
    }

    // Get personality color (same as live stream)
    const colors = window.getPersonalityColor ? window.getPersonalityColor(personalityId) : null;
    if (colors) {
        msg.style.borderLeftColor = colors.border;
    }

    // Use bee icon image
    const iconPath = personalityId ? getBeeIconPath(personalityId) : '/images/bee-icons/default bee icon.png';
    const beeImg = `<img class="bee-avatar" src="${iconPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png'">`;

    // Get role name for personality
    const roleName = personalityId ? personalityId.split('-').pop().charAt(0).toUpperCase() + personalityId.split('-').pop().slice(1) : null;
    const roleNameHtml = roleName ? `<span class="ai-role-name">${escapeHtml(roleName)}</span>` : '';

    // Apply color to header (same as live stream)
    const headerStyle = colors ? `color: ${colors.text};` : '';

    // Clean content of markdown
    const cleanContent = content.replace(/\*\*/g, '');

    msg.innerHTML = `
        <div class="ai-model-header">
            ${beeImg}
            <div class="ai-name-info">
                <span class="ai-model-name" style="${headerStyle}">${escapeHtml(modelName)}</span>
                ${roleNameHtml}
            </div>
            <span class="ai-provider-tag">${escapeHtml(provider)}</span>
        </div>
        <div class="message-content">${escapeHtml(cleanContent)}</div>
        <button class="reply-to-bee-btn" data-bee-name="${escapeHtml(modelName)}" data-personality="${escapeHtml(personalityId || '')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
            Reply
        </button>
    `;
    container.appendChild(msg);

    // Attach reply click handler
    const replyBtn = msg.querySelector('.reply-to-bee-btn');
    if (replyBtn) {
        replyBtn.addEventListener('click', () => {
            startReplyToBee(replyBtn.dataset.beeName, replyBtn.dataset.personality);
        });
    }
}

// ============ HIVE VERDICT RENDERING ============

/**
 * Render the Hive Verdict card after debate completes
 * @param {Object} verdict - The verdict object from backend
 * @param {Array} verdict.votes - Array of { name, emoji, choice, reason }
 * @param {string} verdict.hive_decision - The consensus decision
 * @param {number} verdict.confidence - 0-100 confidence percentage
 * @param {Array} verdict.key_reasons - Array of reason strings
 */
function renderHiveVerdict(verdict, fromHistory = false) {
    if (!verdict) return;

    const container = document.getElementById('chat-messages');
    const verdictEl = document.createElement('div');
    verdictEl.className = 'hive-verdict hive-verdict-viral';

    const beeNameToId = {
        'Sunny': 'chaos-optimist', 'Murphy': 'chaos-pessimist', 'Jordan': 'chaos-realist', 'Rebel': 'chaos-contrarian', 'Cyndi': 'chaos-cynic',
        'BFF': 'friend-bestie', 'Truth': 'friend-honest', 'Giggles': 'friend-funny', 'Sage': 'friend-wise', 'Fixer': 'friend-practical',
        'Brick': 'billionaire-builder', 'Money': 'billionaire-investor', 'Chess': 'billionaire-strategist', 'Blitz': 'billionaire-disruptor', 'Dream': 'billionaire-visionary',
        'Anon': 'internet-redditor', 'Clout': 'internet-influencer', 'Dev': 'internet-coder', 'Pixel': 'internet-gamer', 'Flame': 'internet-troll',
        'Zoey': 'gen-z', 'Avery': 'gen-millennial', 'Dale': 'gen-x', 'Walt': 'gen-boomer', 'Neo': 'gen-future',
        'Honor': 'court-judge', 'Blade': 'court-prosecutor', 'Haven': 'court-defense', 'Echo': 'court-witness', 'Will': 'court-jury',
        'Lucifer': 'special-devils-advocate', 'Joker': 'special-wild-card'
    };
    const splitColors = ['#facc15', '#8b5cf6', '#3b82f6', '#10b981', '#ef4444', '#ec4899', '#06b6d4'];

    const votes = verdict.votes || [];
    const totalVotes = votes.length || 1;

    // Count votes per choice
    const choiceCounts = {};
    votes.forEach(vote => {
        const c = vote.choice || 'Unknown';
        choiceCounts[c] = (choiceCounts[c] || 0) + 1;
    });
    const choices = Object.keys(choiceCounts);

    // Winner
    const winnerChoice = verdict.hive_decision || choices[0] || 'No consensus';
    let winnerPct = verdict.confidence || 0;
    if (!winnerPct && choices.length > 0) {
        const maxCount = Math.max(...Object.values(choiceCounts));
        winnerPct = Math.round((maxCount / totalVotes) * 100);
    }

    // Get current hive name
    let hiveName = '';
    const hiveId = window.selectedHiveId || localStorage.getItem('selectedHive') || 'chaos';
    if (window.allHives) {
        const hive = window.allHives.find(h => h.id === hiveId);
        if (hive) hiveName = hive.name;
    }

    const titleText = verdict.title || '';

    // Timing for animations
    const speedFactor = fromHistory ? 0.3 : 1;
    const chatStart = 0.3 * speedFactor;
    const chatDuration = 3.0 * speedFactor;
    const chatStep = votes.length > 1 ? chatDuration / (votes.length - 1) : 0;

    // Build mini group-chat
    const chatHtml = votes.map((vote, i) => {
        const pid = beeNameToId[vote.name] || getPersonalityFromName(vote.name || '') || '';
        const iconPath = pid ? getBeeIconPath(pid) : '/images/bee-icons/default bee icon.png';
        const colors = pid ? getPersonalityColor(pid) : { text: 'var(--text-secondary)' };
        const isLeft = i % 2 === 0;
        const delay = (chatStart + i * chatStep).toFixed(2);
        return `<div class="bc-chat-msg ${isLeft ? 'bc-left' : 'bc-right'}" style="animation-delay:${delay}s">
            <img class="bc-chat-avi" src="${iconPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png'">
            <div class="bc-chat-bubble">
                <span class="bc-chat-name" style="color:${colors.text}">${escapeHtml(vote.name || '')}</span>
                <span class="bc-chat-text">${escapeHtml(vote.reason || vote.choice || '')}</span>
            </div>
        </div>`;
    }).join('');

    // Vote bars
    const barStart = (chatStart + chatDuration + 0.8) * speedFactor;
    const barStep = choices.length > 1 ? (1.0 * speedFactor) / (choices.length - 1) : 0;
    const barHtml = choices.map((c, i) => {
        const pct = Math.round((choiceCounts[c] / totalVotes) * 100);
        const color = splitColors[i % splitColors.length];
        const barDelay = (barStart + i * barStep).toFixed(2);
        return `<div class="bc-bar-row" style="animation-delay:${barDelay}s">
            <span class="bc-bar-label">${escapeHtml(c)}</span>
            <div class="bc-bar-track"><div class="bc-bar-fill" style="--bar-pct:${pct}%;background:${color};animation-delay:${barDelay}s"></div></div>
            <span class="bc-bar-pct">${pct}%</span>
        </div>`;
    }).join('');

    // Reveal timing
    const revealDelay = (barStart + 1.5 * speedFactor).toFixed(2);
    const actionsDelay = (parseFloat(revealDelay) + 0.8 * speedFactor).toFixed(2);

    // Check if needs more info
    const needsMoreInfo = verdict.hive_decision &&
        (verdict.hive_decision.toLowerCase().includes('options needed') ||
         verdict.hive_decision.toLowerCase().includes('more info') ||
         verdict.hive_decision.toLowerCase().includes('need more'));

    const followUpHint = needsMoreInfo
        ? `<div class="verdict-hint">Type your follow-up question below to continue the discussion</div>`
        : '';

    verdictEl.innerHTML = `
        <div class="bc-card bc-playing">
            <div class="bc-hook">
                ${hiveName ? `<span class="decision-hive-badge" ${typeof getHiveBadgeStyle === 'function' ? getHiveBadgeStyle(hiveName) : ''}>${escapeHtml(hiveName)}</span>` : ''}
                ${titleText ? `<div class="bc-hook-title">${escapeHtml(titleText)}</div>` : ''}
            </div>
            <div class="bc-chat">${chatHtml}</div>
            <div class="bc-bars">${barHtml}</div>
            <div class="bc-reveal" style="animation-delay:${revealDelay}s">
                <div class="bc-winner">${escapeHtml(winnerChoice)}</div>
                <div class="bc-winner-pct">${winnerPct}%</div>
            </div>
            <div class="verdict-actions bc-verdict-actions" style="opacity:0;animation:bcSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${actionsDelay}s both;">
                <button class="verdict-action-btn try-another-hive" onclick="openHivesModalForRetry()">
                    <img src="/images/bee-icons/default bee icon.png" alt="" style="width: 42px; height: 42px; vertical-align: middle; margin-right: 6px; border-radius: 50%;"> Try Another Hive
                </button>
            </div>
            ${followUpHint}
        </div>
    `;

    // Hide the question bubble when verdict is shown
    container.querySelectorAll('.question-header').forEach(h => {
        h.style.position = 'relative';
        h.style.opacity = '0';
        h.style.pointerEvents = 'none';
        h.style.height = '0';
        h.style.padding = '0';
        h.style.overflow = 'hidden';
    });

    container.appendChild(verdictEl);
    scrollToBottom(container);
}

// Open hives modal for retry - after selecting a new hive, auto-send the same question
function openHivesModalForRetry() {
    if (typeof window.openHivesModal === 'function') {
        // Set flag so that when hive is selected + modal closed, it auto-sends
        window._retryAfterHiveSelect = true;
        window.openHivesModal();
    }
}

// Called after hive modal closes (if retry flag is set) - auto re-sends last question
function retryWithNewHive() {
    if (!window._retryAfterHiveSelect || !lastSentMessage) return;
    window._retryAfterHiveSelect = false;

    // Reset conversation for fresh start
    window.continuingDebateId = null;
    currentSessionId = null;

    // Use the proper question flow (handleQuestionSubmit in app.js)
    if (typeof handleQuestionSubmit === 'function') {
        handleQuestionSubmit(lastSentMessage);
    }
}
