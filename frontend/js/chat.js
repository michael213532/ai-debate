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

// Track which bees have made their "big entrance" in this debate session.
// First-appearance gets the @EVERYONE slam; later appearances just pop in normally.
let seenBeesThisSession = new Set();
function resetSessionBeeEntrances() {
    seenBeesThisSession = new Set();
}
window.resetSessionBeeEntrances = resetSessionBeeEntrances;

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
        // Clear any prior debate's roster strip so the next debate rebuilds it
        // with the currently-selected hive.
        if (typeof resetBeeRoster === 'function') resetBeeRoster();
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
            this.bees.push({
                modelName, provider, personalityId, roleName,
                side: '', short: '', long: '', replyTo: '', reactions: [], text: '',
                finished: false, error: null
            });
        }
    },

    addChunk(modelName, text) {
        // Legacy path — backend no longer streams raw chunks for vibed debates,
        // but older models may still stream. Append so we have fallback text.
        const bee = this.bees.find(b => b.modelName === modelName && !b.finished);
        if (bee) bee.text += text;
    },

    setResponse(modelName, short, long, side, replyTo, reactions) {
        const bee = this.bees.find(b => b.modelName === modelName && !b.finished);
        if (bee) {
            bee.short = short || '';
            bee.long = long || '';
            bee.side = side || '';
            bee.replyTo = replyTo || '';
            bee.reactions = Array.isArray(reactions) ? reactions : [];
        }
    },

    finishBee(modelName) {
        const bee = this.bees.find(b => b.modelName === modelName && !b.finished);
        if (bee) {
            bee.finished = true;
            // If no short was received, fall back to the raw chunk buffer.
            if (!bee.short && bee.text) bee.short = bee.text;
        }
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
        let beesToPlay = [...this.bees];
        this.bees = []; // Clear for next round

        // Remove thinking spinner once bees start appearing
        hideBuzzThinking();

        // Apply the active debate vibe to the chat container so CSS picks up
        // the right choreography for bubbles, typing pills, reactions, etc.
        const vibe = window._currentDebateVibe || window.selectedVibeId || 'group-chat';
        const chatC = document.getElementById('chat-messages');
        if (chatC) chatC.dataset.vibe = vibe;

        // Build the persistent bee roster strip above the chat if this is a
        // group-chat vibe. Shows all hive members with idle blink; pulses when
        // it's their turn to speak. Safe to call multiple times — idempotent.
        if (vibe === 'group-chat') ensureBeeRoster();

        // Interleave by side for Group Chat — still used to avoid 3+ same-side
        // bees in a row. Skip during replay so the original bubble order is
        // preserved (otherwise the replay feels like a different debate).
        let classifySide = null;
        if (vibe === 'group-chat') {
            const sideInfo = assignBeeSides(beesToPlay);
            classifySide = sideInfo.classify;
            if (!this._replayMode) {
                beesToPlay = interleaveBeesBySide(beesToPlay);
            }
        }

        for (const bee of beesToPlay) {
            if (this.stopped) break;

            if (bee.error) {
                addAiDiscussionError(bee.modelName, bee.error);
                await this._wait(600);
                continue;
            }

            const isFirstEntrance = !seenBeesThisSession.has(bee.modelName);
            seenBeesThisSession.add(bee.modelName);

            const iconPath = bee.personalityId
                ? getBeeIconPath(bee.personalityId)
                : '/images/bee-icons/default bee icon.png?v=3';

            const sideClass = classifySide ? classifySide(bee.side) : null;

            // Variable typing delay — makes timing feel human, not robotic
            const typingDelay = 900 + Math.floor(Math.random() * 1400); // 900-2300ms

            rosterMarkTyping(bee.modelName);

            if (isFirstEntrance) {
                // Non-blocking Discord-style join toast + small beat, then typing pill
                await this._playEntranceSlam(bee.modelName, iconPath, bee.personalityId);
                if (this.stopped) break;
                const pill = addBeeTypingPill(bee.modelName, bee.personalityId, iconPath, sideClass);
                updateChatStatus(`${bee.modelName} is typing...`);
                await this._wait(typingDelay);
                if (pill) pill.remove();
                if (this.stopped) break;
            } else {
                // Typing pill shows for a variable beat
                const pill = addBeeTypingPill(bee.modelName, bee.personalityId, iconPath, sideClass);
                updateChatStatus(`${bee.modelName} is typing...`);
                await this._wait(typingDelay);
                if (pill) pill.remove();
                if (this.stopped) break;
            }

            // Drop the bubble with the already-buffered short text.
            const shortText = bee.short || bee.text || '';
            const longText = bee.long || '';
            const msgEl = addAiDiscussionMessage(
                bee.modelName,
                bee.provider,
                shortText,
                bee.personalityId,
                bee.roleName,
                longText,
                sideClass,
                bee.replyTo
            );
            finishAiDiscussion(bee.modelName);

            // WhatsApp-style tapback: drop reaction chips UNDER the messages
            // this bee reacted to, with a tiny stagger so they feel "dropped"
            // instead of appearing instantly.
            if (Array.isArray(bee.reactions) && bee.reactions.length) {
                for (const r of bee.reactions) {
                    addReactionChip(r.target, r.emoji, bee.modelName, bee.personalityId);
                }
                // Stash the reactor's reactions on their own bubble so
                // replayDebate can faithfully re-fire them.
                if (msgEl) {
                    try { msgEl.dataset.reactions = JSON.stringify(bee.reactions); } catch (_) {}
                }
            }

            // Mark this bee as "spoken" in the roster strip (no longer idle)
            rosterMarkSpoken(bee.modelName);

            // Read-receipt transition: bubble lands as "unread" (grey), then
            // flips to "read" (light honey) after a beat.
            if (msgEl) {
                msgEl.classList.add('unread');
                setTimeout(() => {
                    msgEl.classList.remove('unread');
                    msgEl.classList.add('read');
                }, 1000);
            }

            // Variable inter-bee pacing — sometimes snappy, sometimes slow beat
            const gap = 700 + Math.floor(Math.random() * 1600);  // 700-2300ms
            await this._wait(gap);
        }
        this.playing = false;
        // Check if more bees arrived while we were playing (next round)
        this._checkAllDone();
        // If no more bees to play, flush pending verdict and debate_end
        this._flushPending();
    },

    _playEntranceSlam(beeName, iconPath, personalityId) {
        // Discord-style bottom-right join toast. Non-blocking: the toast stays
        // on screen for ~3s while the bee's bubble drops in normally.
        const colors = personalityId && window.getPersonalityColor
            ? window.getPersonalityColor(personalityId)
            : null;
        const accent = colors && colors.border ? colors.border : '#fde047';

        let stack = document.getElementById('bee-join-toast-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'bee-join-toast-stack';
            stack.className = 'bee-join-toast-stack';
            document.body.appendChild(stack);
        }

        const toast = document.createElement('div');
        toast.className = 'bee-join-toast';
        toast.style.setProperty('--bee-accent', accent);
        toast.innerHTML = `
            <img class="bee-join-toast-avatar" src="${iconPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png?v=3'">
            <div class="bee-join-toast-text">
                <span class="bee-join-toast-everyone">@everyone</span>
                <div><span class="bee-join-toast-name">${escapeHtml(beeName)}</span><span class="bee-join-toast-action">has joined the chat</span></div>
            </div>
        `;
        stack.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 3100);
        // Brief beat so the toast is visible before the bubble lands
        return new Promise(resolve => setTimeout(resolve, 350));
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
                    summarizer_index: summarizerIndex,
                    vibe: window.selectedVibeId || 'group-chat'
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
                    detail_mode: detailMode,
                    vibe: window.selectedVibeId || 'group-chat'
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
    // Reset which bees have made their big entrance when a fresh debate starts.
    // Continuations keep the same sessionId so only brand-new sessions reset.
    if (!window.continuingDebateId || window.continuingDebateId !== sessionId) {
        resetSessionBeeEntrances();
    }

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
        case 'vibe_info':
            // Backend told us which vibe this debate is in — drive the choreography.
            if (message.vibe && message.vibe.id) {
                window._currentDebateVibe = message.vibe.id;
                const chatC = document.getElementById('chat-messages');
                if (chatC) chatC.dataset.vibe = message.vibe.id;
            }
            break;

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
            // Legacy fallback — vibed debates don't send chunks.
            beeQueue.addChunk(message.model_name, message.content);
            break;

        case 'model_end':
            console.log('[AI Response] Finished:', message.model_name);
            // Vibed responses carry parsed side + short + long + reply_to payloads.
            if (typeof message.short === 'string' || typeof message.long === 'string'
                || typeof message.side === 'string' || typeof message.reply_to === 'string') {
                beeQueue.setResponse(
                    message.model_name,
                    message.short || '',
                    message.long || '',
                    message.side || '',
                    message.reply_to || '',
                    Array.isArray(message.reactions) ? message.reactions : []
                );
            }
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

        const selected = Array.isArray(window.selectedPersonalities) ? window.selectedPersonalities : [];
        const customHive = customs.find(h => h.id === hiveId);
        if (customHive && customHive.bees) {
            const bees = selected.length ? customHive.bees.filter(b => selected.includes(b.id)) : customHive.bees;
            beeIcons = bees.map(b => getBeeIconPath(b.id));
        } else {
            const hive = hives.find(h => h.id === hiveId);
            if (hive && hive.personalities) {
                const bees = selected.length ? hive.personalities.filter(p => selected.includes(p.id)) : hive.personalities;
                beeIcons = bees.map(p => getBeeIconPath(p.id));
            }
        }
        specials.forEach(sid => {
            if (!selected.length || selected.includes(sid)) {
                const sb = specialBees.find(b => b.id === sid);
                if (sb) beeIcons.push(getBeeIconPath(sb.id));
            }
        });
    } catch (e) {
        console.warn('[BuzzThinking] Error getting bee icons:', e);
    }
    if (beeIcons.length === 0) beeIcons = ['/images/bee-icons/default bee icon.png?v=3'];

    const beesHtml = beeIcons.map(src =>
        `<span class="bee-avatar-frame"><img src="${src}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png?v=3'"></span>`
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

// Escape HTML but turn @-mention patterns ("@Sunny", "@everyone") into
// clickable-looking pill spans, COLORED per the referenced bee's personality.
function escapeHtmlWithMentions(text) {
    if (text === null || text === undefined) return '';
    const escaped = escapeHtml(text);
    return escaped.replace(/@([A-Za-z][\w'-]{0,24})/g, (match, name) => {
        let styleAttr = '';
        try {
            // Look up the personality this name maps to
            const pid = typeof getPersonalityFromName === 'function'
                ? getPersonalityFromName(name)
                : null;
            if (pid && window.getPersonalityColor) {
                const colors = window.getPersonalityColor(pid);
                if (colors && colors.text) {
                    const bg = colors.bg || 'rgba(96, 165, 250, 0.18)';
                    styleAttr = ` style="color:${colors.text};background:${bg};border-color:${colors.border || colors.text};"`;
                }
            }
        } catch (e) { /* fallback to default blue mention styling */ }
        return `<span class="gc-mention"${styleAttr}>@${name}</span>`;
    });
}

// Reorder bees so no more than 2 consecutive share the same side. Greedy
// algorithm that preserves the existing order whenever possible but swaps
// a later bee up when needed to break a 3+ streak.
function interleaveBeesBySide(bees) {
    if (!bees || bees.length <= 2) return [...(bees || [])];
    const norm = b => (b.side || '').trim().toLowerCase();
    const result = [];
    const pool = [...bees];
    let lastSide = null;
    let streak = 0;
    while (pool.length > 0) {
        let pickIdx = -1;
        // Prefer the first bee whose side doesn't extend the streak past 2
        for (let i = 0; i < pool.length; i++) {
            const s = norm(pool[i]);
            if (streak >= 2 && s && s === lastSide) continue;
            pickIdx = i;
            break;
        }
        // Fallback: no valid bee found (e.g. all remaining share the streak side) — take first
        if (pickIdx === -1) pickIdx = 0;
        const picked = pool.splice(pickIdx, 1)[0];
        result.push(picked);
        const ps = norm(picked);
        if (ps && ps === lastSide) {
            streak++;
        } else {
            lastSide = ps;
            streak = 1;
        }
    }
    return result;
}

// Cluster bees into at most two "sides" based on their SIDE field so the
// Group Chat layout can place them in left/right columns.
function assignBeeSides(bees) {
    const norm = s => (s || '').trim().toLowerCase();
    const sidesOrder = [];
    const counts = {};
    const original = {};
    bees.forEach(b => {
        const s = norm(b.side);
        if (!s) return;
        if (!(s in counts)) {
            sidesOrder.push(s);
            original[s] = (b.side || '').trim();
        }
        counts[s] = (counts[s] || 0) + 1;
    });
    const sideALc = sidesOrder[0] || '';
    const sideBLc = sidesOrder.find(s => s !== sideALc) || '';
    const labelA = original[sideALc] || '';
    const labelB = original[sideBLc] || '';
    const hasTwoSides = Boolean(sideALc && sideBLc);
    const classify = (rawSide) => {
        const s = norm(rawSide);
        if (!s) return 'a';
        if (s === sideALc) return 'a';
        if (s === sideBLc) return 'b';
        // Unknown 3rd side: collapse into whichever has fewer bees so far
        return (counts[sideALc] || 0) <= (counts[sideBLc] || 0) ? 'a' : 'b';
    };
    return { labelA, labelB, classify, hasTwoSides };
}

// Walk a loaded conversation's bubbles and assign side-a / side-b classes
// based on the stored raw SIDE field, plus re-render the side labels banner.
function applyHistoricalSides(container) {
    if (!container) return;
    const bubbles = [...container.querySelectorAll('.message.ai-individual[data-raw-side]')];
    if (bubbles.length === 0) return;
    const fakeBees = bubbles.map(b => ({ side: b.dataset.rawSide || '' }));
    const info = assignBeeSides(fakeBees);
    // VS sides banner removed — only keep the per-bubble side classes below
    // so interleaving still works on reload.
    bubbles.forEach((b, i) => {
        const cls = info.classify(fakeBees[i].side);
        b.classList.remove('side-a', 'side-b');
        b.classList.add(cls === 'b' ? 'side-b' : 'side-a');
        b.dataset.side = cls;
    });
}

// Render the two-sides banner directly UNDER the most recent question bubble
// so it sticks with the question header as the user scrolls.
function showSideLabels(labelA, labelB) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    // Pick the VISIBLE most-recent question header (old ones are hidden via style)
    const headers = [...container.querySelectorAll('.question-header')];
    const targetHeader = headers.filter(h => h.style.opacity !== '0' && h.style.height !== '0').pop() || headers.pop();

    // Build fresh banner content with bee colors on the two side labels
    const html = `
        <div class="vibe-side-label side-a-label">${escapeHtml(labelA || 'Side A')}</div>
        <div class="vibe-side-vs">vs</div>
        <div class="vibe-side-label side-b-label">${escapeHtml(labelB || 'Side B')}</div>
    `;

    // Remove any existing banner (in any location) so we always end up with one
    container.querySelectorAll('.vibe-sides-banner').forEach(el => el.remove());

    const banner = document.createElement('div');
    banner.id = 'vibe-sides-banner';
    banner.className = 'vibe-sides-banner';
    banner.innerHTML = html;

    if (targetHeader) {
        banner.classList.add('vibe-sides-under-question');
        targetHeader.appendChild(banner);
    } else {
        container.prepend(banner);
    }
    // Force reflow then show
    void banner.offsetWidth;
    banner.classList.add('visible');
}

function hideSideLabels() {
    const banner = document.getElementById('vibe-sides-banner');
    if (banner) banner.remove();
}
window.hideSideLabels = hideSideLabels;

// Show a Group-Chat-style typing pill for a bee that's about to speak.
// Returns the element so the caller can remove it.
function addBeeTypingPill(modelName, personalityId, iconPath, sideClass) {
    if (_swipeEmptyShowing) swipeHideEmpty();
    const container = document.getElementById('chat-messages');
    if (!container) return null;
    const wrap = document.createElement('div');
    wrap.className = 'message ai-individual gc-typing-wrap';
    if (sideClass === 'a') wrap.classList.add('side-a');
    else if (sideClass === 'b') wrap.classList.add('side-b');
    wrap.dataset.model = modelName;
    wrap.dataset.provider = 'xai';
    if (personalityId) wrap.dataset.personality = personalityId;
    const colors = window.getPersonalityColor ? window.getPersonalityColor(personalityId) : null;
    const pillColor = colors ? colors.text : '';
    const pillStyle = colors
        ? `style="color:${colors.text};background:${colors.border ? `${colors.border}22` : 'var(--surface-light)'};border:1px solid ${colors.border || 'transparent'}"`
        : '';
    const iconHtml = iconPath ? `<span class="bee-avatar-frame gc-typing-avatar"><img src="${iconPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png?v=3'"></span>` : '';
    wrap.innerHTML = `
        <div class="gc-typing-pill" ${pillStyle}>
            ${iconHtml}
            <span class="gc-typing-name"${pillColor ? ` style="color:${pillColor}"` : ''}>${escapeHtml(modelName)}</span>
            <span class="gc-typing-label">is typing</span>
            <span class="gc-typing-dots"><span></span><span></span><span></span></span>
        </div>
    `;
    container.appendChild(wrap);
    scrollToBottom(container);
    return wrap;
}

// WhatsApp-style tapback reaction chip. Finds the target bubble by name and
// appends a small emoji pill at the bottom-right. Multiple reactions from
// different bees cluster horizontally. If the same bee reacts twice on the
// same bubble, we skip the duplicate.
function addReactionChip(targetName, emoji, fromName, fromPersonalityId) {
    if (!targetName || !emoji) return;
    const targetBubble = findBeeBubbleByName(targetName);
    if (!targetBubble) return;
    let tray = targetBubble.querySelector(':scope > .gc-reaction-tray');
    if (!tray) {
        tray = document.createElement('div');
        tray.className = 'gc-reaction-tray';
        // Insert right after the message content so the chips sit visually
        // attached to the bubble, not below the reply button.
        const content = targetBubble.querySelector(':scope > .message-content');
        if (content && content.nextSibling) {
            targetBubble.insertBefore(tray, content.nextSibling);
        } else {
            targetBubble.appendChild(tray);
        }
    }
    // Dedupe: same reactor + same emoji
    const existing = tray.querySelector(`.gc-reaction-chip[data-from="${CSS.escape(fromName || '')}"][data-emoji="${CSS.escape(emoji)}"]`);
    if (existing) return;
    const colors = window.getPersonalityColor ? window.getPersonalityColor(fromPersonalityId) : null;
    const borderColor = colors && colors.border ? colors.border : 'rgba(255,255,255,0.18)';
    const chip = document.createElement('span');
    chip.className = 'gc-reaction-chip';
    chip.dataset.from = fromName || '';
    chip.dataset.emoji = emoji;
    chip.title = `${fromName || 'A bee'} reacted`;
    chip.style.borderColor = borderColor;
    chip.textContent = emoji;
    tray.appendChild(chip);
    // Trigger the pop-in after a paint
    requestAnimationFrame(() => chip.classList.add('gc-reaction-in'));
}

// ---- Bee Roster Strip ----
// A persistent row above the chat showing all hive bees. Each bee idles with a
// subtle blink; the currently-typing bee pulses larger in their own color.
// Bees who've already spoken show as "active" (no longer dimmed). Built once
// per session — safe to call repeatedly.

function ensureBeeRoster() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    // Find the latest visible question-header — that's where the roster
    // wants to live so it scrolls with the sticky debate bubble.
    const headers = [...container.querySelectorAll('.question-header')];
    const targetHeader = headers.filter(h => h.style.opacity !== '0' && h.style.height !== '0').pop() || headers.pop();
    const existing = container.querySelector('.gc-roster-strip');
    // If an existing roster is already inside the target header, leave it
    // alone so its typing/spoken state isn't reset between turns.
    if (existing && targetHeader && existing.parentElement === targetHeader) {
        return;
    }
    // If an existing roster is attached elsewhere (older header / loose in
    // chat container), move it to the new header instead of rebuilding, so
    // the per-slot state classes persist across question changes.
    if (existing && targetHeader) {
        existing.classList.add('gc-roster-under-question');
        targetHeader.appendChild(existing);
        return;
    }
    const bees = _rosterPickBees();
    if (!bees.length) return;
    const strip = document.createElement('div');
    strip.className = 'gc-roster-strip';
    strip.setAttribute('role', 'list');
    for (const bee of bees) {
        const iconPath = bee.icon_base64
            ? bee.icon_base64
            : getBeeIconPath(bee.id);
        const colors = window.getPersonalityColor ? window.getPersonalityColor(bee.id) : null;
        const accent = colors && colors.border ? colors.border : '#fdc003';
        const slot = document.createElement('div');
        slot.className = 'gc-roster-slot gc-roster-idle';
        slot.dataset.beeName = bee.human_name || bee.name || '';
        slot.dataset.personality = bee.id || '';
        slot.style.setProperty('--roster-accent', accent);
        slot.setAttribute('role', 'listitem');
        slot.setAttribute('title', bee.human_name || bee.name || '');
        slot.innerHTML = `
            <div class="gc-roster-ring">
                <img class="gc-roster-avatar" src="${iconPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png?v=3'">
                <span class="gc-roster-status-dot"></span>
            </div>
            <span class="gc-roster-name">${escapeHtml((bee.human_name || bee.name || '').split(' ')[0])}</span>
        `;
        strip.appendChild(slot);
    }
    // Attach to the target header captured earlier; fall back to prepending
    // into the chat container if no header exists yet.
    if (targetHeader) {
        strip.classList.add('gc-roster-under-question');
        targetHeader.appendChild(strip);
    } else {
        container.prepend(strip);
    }
}

function _rosterPickBees() {
    const all = Array.isArray(window.allPersonalities) ? window.allPersonalities : [];
    const selected = Array.isArray(window.selectedPersonalities) ? window.selectedPersonalities : [];
    if (selected.length && all.length) {
        const filtered = all.filter(p => selected.includes(p.id));
        if (filtered.length) return filtered;
    }
    return all;
}

function _rosterSlotByName(name) {
    if (!name) return null;
    const strip = document.querySelector('.gc-roster-strip');
    if (!strip) return null;
    const slots = [...strip.querySelectorAll('.gc-roster-slot')];
    return slots.find(s => (s.dataset.beeName || '').toLowerCase() === name.toLowerCase()) || null;
}

function rosterMarkTyping(name) {
    const strip = document.querySelector('.gc-roster-strip');
    if (!strip) return;
    strip.querySelectorAll('.gc-roster-slot').forEach(s => s.classList.remove('gc-roster-typing'));
    const slot = _rosterSlotByName(name);
    if (slot) {
        slot.classList.add('gc-roster-typing');
        slot.classList.remove('gc-roster-idle');
    }
}

function rosterMarkSpoken(name) {
    const slot = _rosterSlotByName(name);
    if (!slot) return;
    slot.classList.remove('gc-roster-typing', 'gc-roster-idle');
    slot.classList.add('gc-roster-spoken');
}

function resetBeeRoster() {
    const strip = document.querySelector('.gc-roster-strip');
    if (strip) strip.remove();
}

// Find a prior bee bubble by its display name (used to resolve reply_to quotes)
function findBeeBubbleByName(name) {
    if (!name) return null;
    const container = document.getElementById('chat-messages');
    if (!container) return null;
    // "User" / "you" → find the most recent user interject bubble so reactions
    // land on the user's message tray.
    const lower = name.toLowerCase();
    if (lower === 'user' || lower === 'you') {
        const userBubbles = [...container.querySelectorAll('.user-interject-bubble .interject-bubble-inner')];
        if (userBubbles.length) return userBubbles[userBubbles.length - 1];
        return null;
    }
    const bubbles = [...container.querySelectorAll('.message.ai-individual')];
    for (let i = bubbles.length - 1; i >= 0; i--) {
        if (bubbles[i].dataset.model && bubbles[i].dataset.model.toLowerCase() === name.toLowerCase()) {
            return bubbles[i];
        }
    }
    return null;
}

// Add AI discussion message to main chat (inline)
function addAiDiscussionMessage(modelName, provider, content, personalityId, roleName, longText, sideClass, replyTo) {
    // If swipe-empty is showing, restore chat view
    if (_swipeEmptyShowing) swipeHideEmpty();
    const container = document.getElementById('chat-messages');

    const msg = document.createElement('div');
    msg.className = 'message ai-individual streaming';
    if (sideClass === 'a') msg.classList.add('side-a');
    else if (sideClass === 'b') msg.classList.add('side-b');
    msg.dataset.model = modelName;
    msg.dataset.provider = provider;
    if (personalityId) {
        msg.dataset.personality = personalityId;
    }
    // Stash both versions so tap-to-expand can swap between them
    msg.dataset.short = content || '';
    msg.dataset.long = longText || '';
    if (sideClass) msg.dataset.side = sideClass;
    if (replyTo) msg.dataset.replyTo = replyTo;

    // Get personality color
    const colors = window.getPersonalityColor ? window.getPersonalityColor(personalityId) : null;
    if (colors) {
        msg.style.borderLeftColor = colors.border;
    }

    // Use bee icon image from /images/bee-icons/. Wrapped in a frame span
    // whose own background-image mirrors the bee PNG; dark mode uses
    // background-blend-mode to composite the bee onto a cream circle.
    const iconPath = personalityId ? getBeeIconPath(personalityId) : '/images/bee-icons/default bee icon.png?v=3';
    const beeImgHtml = `<span class="bee-avatar-frame"><img class="bee-avatar" src="${iconPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png?v=3'"></span>`;

    const roleNameHtml = roleName ? `<span class="ai-role-name">${escapeHtml(roleName)}</span>` : '';

    // Apply color to header
    const headerStyle = colors ? `color: ${colors.text};` : '';

    let replyQuoteHtml = '';

    msg.innerHTML = `
        <div class="ai-model-header">
            ${beeImgHtml}
            <div class="ai-name-info">
                <span class="ai-model-name" style="${headerStyle}">${escapeHtml(modelName)}</span>
                ${roleNameHtml}
            </div>
            <span class="ai-provider-tag">${escapeHtml(provider)}</span>
        </div>
        ${replyQuoteHtml}
        <div class="message-content">${escapeHtmlWithMentions(content || '')}</div>
        <button class="reply-to-bee-btn" data-bee-name="${escapeHtml(modelName)}" data-personality="${escapeHtml(personalityId || '')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
            Reply
        </button>
    `;
    container.appendChild(msg);

    // Attach reply click handler via event listener (safer than inline onclick)
    const replyBtn = msg.querySelector('.reply-to-bee-btn');
    if (replyBtn) {
        replyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startReplyToBee(replyBtn.dataset.beeName, replyBtn.dataset.personality);
        });
    }

    // Tap-to-expand: if we have a long version that differs from the short,
    // tapping the bubble swaps between them.
    if (longText && longText.trim() && longText.trim() !== (content || '').trim()) {
        msg.classList.add('expandable');
        msg.addEventListener('click', (e) => {
            if (e.target.closest('.reply-to-bee-btn')) return;
            toggleBeeExpand(msg);
        });
    }

    scrollToBottom(container);
    return msg;
}

// Toggle a bee bubble between its short and long reasoning.
function toggleBeeExpand(msg) {
    if (!msg) return;
    const content = msg.querySelector('.message-content');
    if (!content) return;
    const expanded = msg.classList.contains('expanded');
    if (expanded) {
        content.innerHTML = escapeHtmlWithMentions(msg.dataset.short || content.textContent);
        msg.classList.remove('expanded');
    } else {
        content.innerHTML = escapeHtmlWithMentions(msg.dataset.long || msg.dataset.short || content.textContent);
        msg.classList.add('expanded');
    }
}
window.toggleBeeExpand = toggleBeeExpand;

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
        const content = msg.querySelector('.message-content');
        if (content) {
            // Strip any stray `**` markdown by replacing text nodes only —
            // NEVER touch textContent on the whole element, which would destroy
            // child elements like the .gc-mention spans we render inline.
            if (content.innerHTML.indexOf('**') !== -1) {
                const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null);
                const nodes = [];
                let n;
                while ((n = walker.nextNode())) nodes.push(n);
                nodes.forEach(tn => { tn.nodeValue = tn.nodeValue.replace(/\*\*/g, ''); });
            }

            // In vibed debates (Group Chat, etc) we never want the legacy
            // "Show more" clamp button — tap-to-expand handles it instead.
            const chatC = document.getElementById('chat-messages');
            const inVibe = chatC && chatC.dataset && chatC.dataset.vibe;
            if (inVibe) return;

            // Legacy: clamp to 3 lines with "Show more" toggle (non-vibed only)
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
        if (window._showInterjectBar) window._showInterjectBar();
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
        if (window._hideInterjectBar) window._hideInterjectBar();
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

    // Update send button — keep the same arrow icon as the normal send so
    // the button shape doesn't morph into a text label mid-flow. Add a
    // `reply-mode` class in case we want to tint it differently.
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
        sendBtn.classList.remove('stop-mode');
        sendBtn.classList.add('reply-mode');
        sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
        sendBtn.setAttribute('aria-label', 'Send reply');
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

    // Restore normal send button
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.classList.remove('reply-mode');

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

// ── Floating interject bar ──────────────────────────────────────
(function initInterjectBar() {
    const bar = document.getElementById('debate-interject-bar');
    const inp = document.getElementById('interject-input');
    const btn = document.getElementById('interject-send');
    const dropdown = document.getElementById('interject-mention-dropdown');
    if (!bar || !inp || !btn) return;

    let mentionStart = -1;
    let selectedIdx = 0;

    function getActiveBees() {
        const all = Array.isArray(window.allPersonalities) ? window.allPersonalities : [];
        const sel = Array.isArray(window.selectedPersonalities) ? window.selectedPersonalities : [];
        if (sel.length && all.length) {
            const filtered = all.filter(p => sel.includes(p.id));
            if (filtered.length) return filtered;
        }
        return all;
    }

    function showDropdown(query) {
        const bees = getActiveBees();
        const q = query.toLowerCase();
        const matches = bees.filter(b => b.human_name.toLowerCase().startsWith(q) || b.name.toLowerCase().startsWith(q));
        if (!matches.length) { dropdown.classList.remove('open'); return; }
        selectedIdx = 0;
        dropdown.innerHTML = matches.map((b, i) => {
            const icon = typeof getBeeIconPath === 'function' ? getBeeIconPath(b.id) : '/images/bee-icons/default bee icon.png?v=3';
            return `<div class="interject-mention-item${i === 0 ? ' selected' : ''}" data-name="${b.human_name}" data-idx="${i}">
                <img src="${icon}" alt=""><span>${b.human_name}</span>
            </div>`;
        }).join('');
        dropdown.classList.add('open');
        dropdown.querySelectorAll('.interject-mention-item').forEach(el => {
            el.addEventListener('click', () => completeMention(el.dataset.name));
        });
    }

    const highlight = document.getElementById('interject-highlight');

    function updateHighlight() {
        if (!highlight) return;
        const val = inp.value;
        if (!val) { highlight.innerHTML = ''; return; }
        const escaped = val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        highlight.innerHTML = escaped.replace(/@([A-Za-z][\w'-]{0,24})/g, (match, name) => {
            let style = '';
            try {
                const pid = typeof getPersonalityFromName === 'function' ? getPersonalityFromName(name) : null;
                if (pid && window.getPersonalityColor) {
                    const c = window.getPersonalityColor(pid);
                    if (c && c.border) style = `color:#fff;background:${c.border};`;
                }
            } catch (_) {}
            return `<span class="mention-color" style="${style}">@${name}</span>`;
        });
    }

    function completeMention(name) {
        const val = inp.value;
        const before = val.slice(0, mentionStart);
        inp.value = before + '@' + name + ' ';
        mentionStart = -1;
        dropdown.classList.remove('open');
        inp.focus();
        btn.disabled = !inp.value.trim();
        updateHighlight();
    }

    inp.addEventListener('input', () => {
        btn.disabled = !inp.value.trim();
        updateHighlight();
        const val = inp.value;
        const cursor = inp.selectionStart;
        const textBefore = val.slice(0, cursor);
        const atIdx = textBefore.lastIndexOf('@');
        if (atIdx >= 0 && (atIdx === 0 || textBefore[atIdx - 1] === ' ')) {
            mentionStart = atIdx;
            const query = textBefore.slice(atIdx + 1);
            showDropdown(query);
        } else {
            mentionStart = -1;
            dropdown.classList.remove('open');
        }
    });

    inp.addEventListener('keydown', (e) => {
        if (dropdown.classList.contains('open')) {
            const items = dropdown.querySelectorAll('.interject-mention-item');
            if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, items.length - 1); updateSelection(items); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); updateSelection(items); }
            else if (e.key === 'Enter' || e.key === 'Tab') {
                if (items[selectedIdx]) { e.preventDefault(); completeMention(items[selectedIdx].dataset.name); return; }
            }
            else if (e.key === 'Escape') { dropdown.classList.remove('open'); return; }
        }
        if (e.key === 'Enter' && !e.shiftKey && !dropdown.classList.contains('open')) {
            e.preventDefault();
            sendInterject();
        }
    });

    function updateSelection(items) {
        items.forEach((el, i) => el.classList.toggle('selected', i === selectedIdx));
    }

    btn.addEventListener('click', sendInterject);

    function sendInterject() {
        const msg = inp.value.trim();
        if (!msg || !chatWebSocket || chatWebSocket.readyState !== WebSocket.OPEN) return;

        const mentionMatch = msg.match(/@(\S+)/);
        const bees = getActiveBees();
        let targetBee = null;
        if (mentionMatch) {
            const mName = mentionMatch[1].toLowerCase();
            const found = bees.find(b => b.human_name.toLowerCase() === mName || b.human_name.toLowerCase().startsWith(mName));
            if (found) targetBee = found.human_name;
        }

        // Show as a right-aligned chat bubble (not a sticky question header)
        const container = document.getElementById('chat-messages');
        if (container) {
            const bubble = document.createElement('div');
            bubble.className = 'user-interject-bubble';
            const escaped = msg.replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/@([A-Za-z][\w'-]{0,24})/g, (match, name) => {
                    let style = '';
                    try {
                        const pid = typeof getPersonalityFromName === 'function' ? getPersonalityFromName(name) : null;
                        if (pid && window.getPersonalityColor) {
                            const c = window.getPersonalityColor(pid);
                            if (c && c.text) style = ` style="color:#fff;background:${c.border || c.text};border-color:${c.border || c.text};"`;
                        }
                    } catch (_) {}
                    return `<span class="gc-mention"${style}>@${name}</span>`;
                });
            bubble.innerHTML = `<div class="interject-bubble-inner">${escaped}</div>`;
            container.appendChild(bubble);
            scrollToBottom(container, true);
        }
        inp.value = '';
        btn.disabled = true;
        dropdown.classList.remove('open');
        if (highlight) highlight.innerHTML = '';

        if (targetBee) {
            chatWebSocket.send(JSON.stringify({
                type: 'reply_to_bee',
                content: msg,
                target_bee: targetBee
            }));
        } else {
            chatWebSocket.send(JSON.stringify({
                type: 'intervention',
                content: msg
            }));
        }

        bar.classList.add('interject-bar-reacting');
        setTimeout(() => bar.classList.remove('interject-bar-reacting'), 1200);
    }

    window._showInterjectBar = function() { bar.classList.add('visible'); };
    window._hideInterjectBar = function() { bar.classList.remove('visible'); dropdown.classList.remove('open'); };
})();

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

        // Restore vibe from debate config so replay + Beecisions feed use the
        // same choreography this debate was originally recorded in.
        if (debate.config && debate.config.vibe) {
            window._currentDebateVibe = debate.config.vibe;
            if (container) container.dataset.vibe = debate.config.vibe;
            if (debate.config.vibe === 'group-chat') {
                applyHistoricalSides(container);
                // Build the roster strip for this historical debate. All bees
                // have already spoken, so mark each as "spoken" so none pulse.
                resetBeeRoster();
                ensureBeeRoster();
                const spokenNames = new Set();
                container.querySelectorAll('.message.ai-individual[data-model]').forEach(el => {
                    spokenNames.add(el.dataset.model);
                });
                spokenNames.forEach(n => rosterMarkSpoken(n));
            }
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
        if (window._hideInterjectBar) window._hideInterjectBar();
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

// Parse a stored message content field which may be JSON ({side, short, long, reply_to})
// from a vibed debate, or plain text from a legacy debate.
function parseStoredBeeContent(content) {
    if (!content) return { side: '', short: '', long: '', reply_to: '', reactions: [] };
    const trimmed = String(content).trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const data = JSON.parse(trimmed);
            if (data && typeof data === 'object' && 'short' in data) {
                return {
                    side: data.side || '',
                    short: data.short || '',
                    long: data.long || '',
                    reply_to: data.reply_to || '',
                    reactions: Array.isArray(data.reactions) ? data.reactions : []
                };
            }
        } catch (e) { /* fall through */ }
    }
    return { side: '', short: trimmed, long: '', reply_to: '', reactions: [] };
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

    // Use bee icon image (wrapped in frame span for cream-circle backdrop)
    const iconPath = personalityId ? getBeeIconPath(personalityId) : '/images/bee-icons/default bee icon.png?v=3';
    const beeImg = `<span class="bee-avatar-frame"><img class="bee-avatar" src="${iconPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png?v=3'"></span>`;

    // Get role name for personality
    const roleName = personalityId ? personalityId.split('-').pop().charAt(0).toUpperCase() + personalityId.split('-').pop().slice(1) : null;
    const roleNameHtml = roleName ? `<span class="ai-role-name">${escapeHtml(roleName)}</span>` : '';

    // Apply color to header (same as live stream)
    const headerStyle = colors ? `color: ${colors.text};` : '';

    // History messages may be JSON ({side, short, long, reply_to}) for vibed debates.
    const parsed = parseStoredBeeContent(content);
    const cleanShort = (parsed.short || '').replace(/\*\*/g, '');
    const cleanLong = (parsed.long || '').replace(/\*\*/g, '');
    msg.dataset.short = cleanShort;
    msg.dataset.long = cleanLong;
    if (parsed.side) msg.dataset.rawSide = parsed.side;
    if (parsed.reply_to) msg.dataset.replyTo = parsed.reply_to;
    // Mark as already-read so the historical bubbles use the read color
    msg.classList.add('read');

    let replyQuoteHtml = '';

    msg.innerHTML = `
        <div class="ai-model-header">
            ${beeImg}
            <div class="ai-name-info">
                <span class="ai-model-name" style="${headerStyle}">${escapeHtml(modelName)}</span>
                ${roleNameHtml}
            </div>
            <span class="ai-provider-tag">${escapeHtml(provider)}</span>
        </div>
        ${replyQuoteHtml}
        <div class="message-content">${escapeHtmlWithMentions(cleanShort)}</div>
        <button class="reply-to-bee-btn" data-bee-name="${escapeHtml(modelName)}" data-personality="${escapeHtml(personalityId || '')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
            Reply
        </button>
    `;
    container.appendChild(msg);

    // Attach reply click handler
    const replyBtn = msg.querySelector('.reply-to-bee-btn');
    if (replyBtn) {
        replyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startReplyToBee(replyBtn.dataset.beeName, replyBtn.dataset.personality);
        });
    }

    // Tap-to-expand for historical bubbles too
    if (cleanLong && cleanLong.trim() && cleanLong.trim() !== cleanShort.trim()) {
        msg.classList.add('expandable');
        msg.addEventListener('click', (e) => {
            if (e.target.closest('.reply-to-bee-btn')) return;
            toggleBeeExpand(msg);
        });
    }

    // Historical reactions: render chips on the target bubbles that were
    // already loaded above this one in the history.
    if (Array.isArray(parsed.reactions) && parsed.reactions.length) {
        for (const r of parsed.reactions) {
            addReactionChip(r.target, r.emoji, modelName, personalityId);
        }
        try { msg.dataset.reactions = JSON.stringify(parsed.reactions); } catch (_) {}
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
    window._lastVerdict = verdict;

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
        const iconPath = pid ? getBeeIconPath(pid) : '/images/bee-icons/default bee icon.png?v=3';
        const colors = pid ? getPersonalityColor(pid) : { text: 'var(--text-secondary)' };
        const isLeft = i % 2 === 0;
        const delay = (chatStart + i * chatStep).toFixed(2);
        return `<div class="bc-chat-msg ${isLeft ? 'bc-left' : 'bc-right'}" style="animation-delay:${delay}s">
            <img class="bc-chat-avi" src="${iconPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png?v=3'">
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
            <div class="bc-hook bc-hook-bubble">
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
                <button class="verdict-replay-btn" onclick="replayDebate()" title="Replay the debate">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                    Replay
                </button>
            </div>
            ${followUpHint}
        </div>
    `;

    // Hide the question bubble when verdict is shown (class-based so we
    // can reveal it on scroll-up without fighting inline styles).
    container.querySelectorAll('.question-header').forEach(h => {
        h.classList.add('verdict-hidden');
    });

    container.appendChild(verdictEl);
    scrollToBottom(container);

    // Scroll-up reveal: once the verdict is offscreen (user scrolling up to
    // re-read the debate), show the question header + bee roster again and
    // hide the text input. Mark all roster bees as "offline" to reinforce
    // that this is post-debate context. Flip back when verdict re-enters.
    _setupVerdictScrollReveal(verdictEl, container);
}

function _setupVerdictScrollReveal(verdictEl, container) {
    if (!verdictEl || !container) return;
    if (!('IntersectionObserver' in window)) return;
    const inputArea = document.getElementById('chat-input-area');
    const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
            const visible = e.isIntersecting && e.intersectionRatio > 0.02;
            if (!visible) {
                // User scrolled up away from the verdict — reveal the
                // question bubble + roster, hide the input, mark bees offline
                container.querySelectorAll('.question-header.verdict-hidden').forEach(h => {
                    h.classList.add('scrolled-reveal');
                });
                if (inputArea) inputArea.classList.add('verdict-scroll-hidden');
                _rosterMarkAllOffline(true);
            } else {
                container.querySelectorAll('.question-header.verdict-hidden').forEach(h => {
                    h.classList.remove('scrolled-reveal');
                });
                if (inputArea) inputArea.classList.remove('verdict-scroll-hidden');
                _rosterMarkAllOffline(false);
            }
        }
    }, { root: container, threshold: [0, 0.02, 0.1] });
    io.observe(verdictEl);
    // Stash so it can be torn down when reset
    window._verdictScrollIO = io;
}

function _rosterMarkAllOffline(offline) {
    const strip = document.querySelector('.gc-roster-strip');
    if (!strip) return;
    strip.classList.toggle('gc-roster-all-offline', !!offline);
}

// Open hives modal for retry - after selecting a new hive, auto-send the same question
// (Legacy entry point — now delegates to the Remix modal.)
function openHivesModalForRetry() {
    openRemixModal();
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

// ============ REMIX MODAL (hive + vibe picker for same question) ============
let _remixTempVibeId = null;

function openRemixModal() {
    const modal = document.getElementById('remix-modal');
    if (!modal) return;
    // Seed with currently selected hive + vibe
    _remixTempVibeId = window.selectedVibeId || 'group-chat';
    updateRemixHiveButton();
    if (typeof renderVibeOptions === 'function') {
        renderVibeOptions('remix-vibe-grid', (vibeId) => {
            _remixTempVibeId = vibeId;
        }, _remixTempVibeId);
    }
    modal.classList.add('active');
}

function closeRemixModal() {
    const modal = document.getElementById('remix-modal');
    if (modal) modal.classList.remove('active');
}

function updateRemixHiveButton() {
    const nameEl = document.getElementById('remix-hive-name');
    const iconEl = document.getElementById('remix-hive-icon');
    if (!nameEl) return;
    const hiveId = window.selectedHiveId || 'chaos';
    const hive = (window.allHives || []).find(h => h.id === hiveId) ||
                 (window.customHives || []).find(h => h.id === hiveId);
    if (hive) {
        nameEl.textContent = hive.name || 'Hive';
    }
}

function setLastSentMessage(msg) { lastSentMessage = msg; }
window.setLastSentMessage = setLastSentMessage;

function submitRemix() {
    closeRemixModal();
    if (window.lastSentMessage) lastSentMessage = window.lastSentMessage;
    if (!lastSentMessage) return;
    // Apply the picked vibe
    if (_remixTempVibeId && typeof selectVibe === 'function') {
        selectVibe(_remixTempVibeId);
    }
    // Fresh session — no continuation context
    window.continuingDebateId = null;
    currentSessionId = null;
    resetSessionBeeEntrances();
    // Re-fire the same question through the normal flow
    if (typeof handleQuestionSubmit === 'function') {
        handleQuestionSubmit(lastSentMessage);
    }
}

window.openRemixModal = openRemixModal;
window.closeRemixModal = closeRemixModal;
window.submitRemix = submitRemix;
window.updateRemixHiveButton = updateRemixHiveButton;

// ============ REPLAY DEBATE ============
// Rewind the current debate's bubbles + verdict and replay them from scratch,
// using the same stored short/long text so the replay is identical to the original.
function replayDebate() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    // Collect the current debate's bubbles in chat order. Filter out any
    // leftover typing-pill wrappers — those have .gc-typing-wrap but no
    // stored short text, and would replay as empty bubbles.
    const bubbles = [...container.querySelectorAll('.message.ai-individual')]
        .filter(b => !b.classList.contains('gc-typing-wrap'));
    if (bubbles.length === 0) return;

    // Extract full replay script from the DOM — preserve side, replyTo,
    // and any reactions that were dropped by this bee, so the replay
    // faithfully reproduces the original conversation instead of playing
    // back a stripped-down version.
    const script = bubbles.map(b => {
        const contentEl = b.querySelector('.message-content');
        let reactions = [];
        try {
            if (b.dataset.reactions) reactions = JSON.parse(b.dataset.reactions);
        } catch (_) { /* ignore */ }
        return {
            modelName: b.dataset.model || '',
            provider: b.dataset.provider || 'xai',
            personalityId: b.dataset.personality || '',
            roleName: '',
            short: b.dataset.short || (contentEl ? contentEl.textContent : ''),
            long: b.dataset.long || '',
            side: b.dataset.rawSide || b.dataset.side || '',
            replyTo: b.dataset.replyTo || '',
            reactions: Array.isArray(reactions) ? reactions : [],
            finished: true,
            error: null,
            text: ''
        };
    });

    // Remember the verdict to re-render after the replay finishes
    const verdictToRerender = window._lastVerdict || null;

    // Wipe the bubbles and verdict card (keep question-header + roster intact)
    bubbles.forEach(b => b.remove());
    const existingVerdict = container.querySelector('.hive-verdict');
    if (existingVerdict) existingVerdict.remove();

    // Reset entrances so every bee gets the slam again
    resetSessionBeeEntrances();

    // Queue the script and play it back. Set the replay flag so _playAll
    // skips the interleaveBeesBySide reorder — the script is ALREADY in
    // the exact order the bees originally spoke, and reordering would
    // turn the replay into a shuffled conversation.
    beeQueue.reset();
    beeQueue._replayMode = true;
    script.forEach(s => beeQueue.bees.push(s));
    beeQueue._playAll().then(() => {
        beeQueue._replayMode = false;
        if (verdictToRerender) {
            renderHiveVerdict(verdictToRerender, false);
        }
    });
}
window.replayDebate = replayDebate;
