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

// Vision-capable models (all others cannot see images)
const VISION_MODELS = new Set([
    'gpt-5.2', 'gpt-5', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini',  // OpenAI
    'grok-4-1-fast-non-reasoning', 'grok-4-fast-non-reasoning'   // xAI (Grok 4+)
]);
const VISION_PROVIDERS = new Set(['anthropic', 'google']);  // All models from these providers support vision

// Map human names to personality IDs for bee icons
const HUMAN_NAME_TO_PERSONALITY = {
    'alex': 'analyst',
    'sam': 'skeptic',
    'olivia': 'optimist',
    'max': 'expert',
    'riley': 'realist'
};

// Map personality IDs to human names
const PERSONALITY_TO_HUMAN_NAME = {
    'analyst': 'Alex',
    'skeptic': 'Sam',
    'optimist': 'Olivia',
    'expert': 'Max',
    'realist': 'Riley'
};

// Get personality ID from display name (human name or role name)
function getPersonalityFromName(name) {
    const nameLower = name.toLowerCase();
    // Check human names first
    if (HUMAN_NAME_TO_PERSONALITY[nameLower]) {
        return HUMAN_NAME_TO_PERSONALITY[nameLower];
    }
    // Fall back to checking role names (analyst, skeptic, etc.)
    const beeTypes = ['expert', 'optimist', 'analyst', 'skeptic', 'realist'];
    return beeTypes.find(b => nameLower.includes(b)) || null;
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

// Stop the current discussion
function stopDiscussion() {
    if (chatWebSocket && chatWebSocket.readyState === WebSocket.OPEN) {
        chatWebSocket.send(JSON.stringify({ type: 'stop' }));
        chatWebSocket.close();
    }
    updateChatStatus('Discussion stopped');
    setInputLocked(false);
}

// Add image button - opens file picker directly
document.getElementById('add-image-btn').addEventListener('click', () => {
    document.getElementById('image-input').click();
});

// Export PDF button
document.getElementById('export-pdf-btn').addEventListener('click', () => {
    // Check if user is Pro
    if (subscriptionStatus?.status !== 'active') {
        alert('Export to PDF is a Pro feature. Upgrade to Pro for unlimited exports.');
        return;
    }

    // Check if there's a session to export
    if (!currentSessionId) {
        alert('Start a conversation first to export it as PDF.');
        return;
    }

    exportToPdf();
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

    // Clear empty state if present
    const emptyState = document.querySelector('.empty-chat');
    if (emptyState) {
        emptyState.remove();
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

    // Update status
    updateChatStatus('Starting discussion...');

    try {
        const summarizerIndex = getSummarizerIndex(selectedModels);
        let session;

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

            if (!response.ok) throw new Error('Failed to start session');

            session = await response.json();
            currentSessionId = session.id;
        }

        // Connect WebSocket (summary placeholder added when summary_start received)
        connectWebSocket(session.id);

        // Update subscription status
        loadSubscriptionStatus();
    } catch (error) {
        console.error('Error starting session:', error);
        updateChatStatus('');
        setInputLocked(false);
        alert('Failed to start session. Please try again.');
    }
}

// Connect to WebSocket
function connectWebSocket(sessionId) {
    console.log('[WebSocket] Connecting to session:', sessionId);

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
    const wsUrl = `${protocol}//${window.location.host}/ws/debates/${sessionId}?token=${token}`;
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
        // Always unlock input when connection closes to prevent softlock
        if (isProcessing) {
            updateChatStatus('Connection closed');
            setInputLocked(false);
        }
    };
}

// Handle WebSocket messages
function handleWebSocketMessage(message) {
    console.log('[WebSocket]', message.type, message); // Debug logging
    switch (message.type) {
        case 'round_start':
            updateChatStatus('Getting opinions...');
            break;

        case 'model_start':
            console.log('[AI Response] Starting:', message.model_name);
            addAiDiscussionMessage(message.model_name, message.provider, '', message.personality_id, message.role_name);
            updateChatStatus(`${message.model_name} is responding...`);
            break;

        case 'chunk':
            appendToAiDiscussion(message.model_name, message.content);
            break;

        case 'model_end':
            console.log('[AI Response] Finished:', message.model_name);
            finishAiDiscussion(message.model_name);
            break;

        case 'model_error':
            console.log('[AI Error]', message.model_name, message.error);
            addAiDiscussionError(message.model_name, message.error);
            break;

        case 'summary_start':
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
            updateChatStatus('');
            finishFinalResponse();
            showExportButton();
            // Enable continuing this conversation with follow-up messages
            // MUST be set before setInputLocked so updateSendButton sees it
            window.continuingDebateId = currentSessionId;
            setInputLocked(false);
            break;

        case 'error':
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
            renderHiveVerdict(message.verdict);
            break;
    }
}

// Add user message to chat as a big bold question header
function addUserMessage(text, imageDataUrls = []) {
    const container = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = 'question-header';

    let html = `<div class="question-header-text">${escapeHtml(text)}</div>`;
    if (imageDataUrls && imageDataUrls.length > 0) {
        html += '<div class="question-images">';
        for (const dataUrl of imageDataUrls) {
            html += `<img src="${dataUrl}" class="question-image" alt="Attached image">`;
        }
        html += '</div>';
    }

    msg.innerHTML = html;
    container.appendChild(msg);
    scrollToBottom(container);

    conversationHistory.push({ role: 'user', content: text });
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
        html += `<div style="margin-top: 12px; padding: 12px 16px; background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1)); border: 1px solid var(--primary-color); border-radius: 8px;"><strong style="color: var(--primary-color);">Final Answer:</strong> ${escapeHtml(finalAnswer)}</div>`;
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

// Add AI discussion message to main chat (inline)
function addAiDiscussionMessage(modelName, provider, content, personalityId, roleName) {
    const container = document.getElementById('chat-messages');

    const msg = document.createElement('div');
    msg.className = 'message ai-individual streaming';
    msg.dataset.model = modelName;
    msg.dataset.provider = provider;
    if (personalityId) {
        msg.dataset.personality = personalityId;
    }
    const beePersonalities = ['expert', 'optimist', 'analyst', 'skeptic', 'realist'];
    const personalityImgHtml = personalityId && beePersonalities.includes(personalityId)
        ? `<img src="/bee-${personalityId}.png" alt="" style="width: 50px; height: 50px; margin: -15px -2px -15px -8px; image-rendering: -webkit-optimize-contrast;">`
        : '';

    const roleNameHtml = roleName ? `<span class="ai-role-name">${escapeHtml(roleName)}</span>` : '';

    msg.innerHTML = `
        <div class="ai-model-header">
            ${personalityImgHtml}
            <div class="ai-name-info">
                <span class="ai-model-name">${escapeHtml(modelName)}</span>
                ${roleNameHtml}
            </div>
            <span class="ai-provider-tag">${escapeHtml(provider)}</span>
        </div>
        <div class="message-content"></div>
    `;
    container.appendChild(msg);
    scrollToBottom(container);
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
        }
    }
}

// Add AI discussion error with helpful labeling and action buttons
function addAiDiscussionError(modelName, error) {
    const container = document.getElementById('chat-messages');
    const msg = container.querySelector(`.message.ai-individual[data-model="${modelName}"]`);
    if (msg) {
        msg.classList.remove('streaming');
        const content = msg.querySelector('.message-content');
        const provider = msg.dataset.provider;

        // Get labeled error info with provider context
        const errorInfo = labelError(error, provider);

        // Determine fix link based on error type
        let fixLink = '';
        if (errorInfo.actionType === 'key') {
            // API key issues - open setup wizard
            fixLink = `<a href="#" onclick="showTutorial(); return false;" style="color: var(--primary-color); margin-left: 4px;">Fix this</a>`;
        } else if (errorInfo.actionType === 'billing' && errorInfo.billingUrl) {
            // Billing issues - link to provider
            fixLink = `<a href="${errorInfo.billingUrl}" target="_blank" rel="noopener" style="color: var(--primary-color); margin-left: 4px;">Fix this</a>`;
        } else if (errorInfo.actionType === 'retry') {
            // Temporary errors - offer retry button
            fixLink = `<button onclick="retryLastMessage()" style="color: var(--primary-color); background: none; border: 1px solid var(--primary-color); padding: 4px 12px; border-radius: 4px; cursor: pointer; margin-left: 8px; font-size: 0.85rem;">Try Again</button>`;
        } else if (errorInfo.label === 'Model Not Found') {
            // Model issues - open setup wizard
            fixLink = `<a href="#" onclick="showTutorial(); return false;" style="color: var(--primary-color); margin-left: 4px;">Fix this</a>`;
        }

        content.innerHTML = `
            <div class="error-labeled">
                <div style="display: flex; align-items: center; gap: 8px; color: ${errorInfo.color}; font-weight: 600; margin-bottom: 6px;">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    ${errorInfo.label}
                </div>
                <div style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">${errorInfo.help}${fixLink}</div>
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
        input.placeholder = 'Ask your question';
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

    if (locked) {
        // Switch to stop mode - hide everything except pause button
        sendBtn.classList.add('stop-mode');
        sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        sendBtn.disabled = false;

        // Hide voices bar and input elements during debate
        if (voicesBar) voicesBar.style.display = 'none';
        if (quickTemplates) quickTemplates.style.display = 'none';
        if (input) input.style.display = 'none';
        if (chatButtonsRow) {
            // Hide everything in buttons row except the send/stop button
            chatButtonsRow.querySelectorAll(':scope > *:not(#send-btn)').forEach(el => {
                el.style.display = 'none';
            });
        }
        // Simplify the input container during debate
        if (chatInputContainer) {
            chatInputContainer.style.padding = '8px';
            chatInputContainer.style.justifyContent = 'center';
        }
    } else {
        // Switch to send mode - show everything again
        sendBtn.classList.remove('stop-mode');
        sendBtn.innerHTML = 'Start Debate';
        input.placeholder = 'Ask your question';

        // Show voices bar and input elements after debate
        if (voicesBar) voicesBar.style.display = '';
        if (quickTemplates) quickTemplates.style.display = '';
        if (input) input.style.display = '';
        if (chatButtonsRow) {
            // Show everything in buttons row EXCEPT the hidden file input
            chatButtonsRow.querySelectorAll(':scope > *').forEach(el => {
                if (el.id !== 'image-input') {
                    el.style.display = '';
                }
            });
        }
        // Restore input container styling
        if (chatInputContainer) {
            chatInputContainer.style.padding = '';
            chatInputContainer.style.justifyContent = '';
        }

        updateSendButton();
        console.log('[setInputLocked] after updateSendButton, btn.disabled:', sendBtn.disabled);
    }
}

// Expose setInputLocked globally for app.js
window.setInputLocked = setInputLocked;

// Send an intervention message during discussion
async function sendIntervention() {
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

// Sidebar toggle button
document.getElementById('sidebar-toggle')?.addEventListener('click', openSidebar);

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
    list.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Loading...</p>';

    try {
        const response = await fetch(`${API_BASE}/api/debates`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to load history');

        loadedDebates = await response.json();
        renderHistoryList(loadedDebates);

    } catch (error) {
        console.error('Error loading history:', error);
        list.innerHTML = '<div class="history-empty"><div class="history-empty-icon">⚠️</div><div class="history-empty-text">Failed to load history.</div></div>';
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

        // Remove empty state if present
        const emptyState = document.querySelector('.empty-chat');
        if (emptyState) emptyState.remove();

        // Extract images from config if present and convert to dataUrls
        let imageDataUrls = [];
        if (debate.config && debate.config.images && debate.config.images.length > 0) {
            imageDataUrls = debate.config.images.map(img =>
                `data:${img.media_type};base64,${img.base64}`
            );
        }

        // Get original topic (first part before any "---" for old data compatibility)
        const originalTopic = debate.topic.split(/\s*---\s*/)[0].trim();

        // Separate summary from other messages
        let summary = null;
        const chatMessages = [];
        messages.forEach(msg => {
            if (msg.round === 0) {
                summary = msg;
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
        // First: original topic as user message
        addUserMessage(originalTopic, imageDataUrls);

        // Then: all other messages in chronological order
        for (const msg of chatMessages) {
            if (msg.provider === 'user') {
                addUserMessage(msg.content);
            } else {
                addHistoryAiMessage(msg.model_name, msg.provider, msg.content);
            }
        }

        // Add summary if exists
        if (summary) {
            const summaryMsg = document.createElement('div');
            summaryMsg.className = 'message ai';
            summaryMsg.innerHTML = `
                <div class="message-header">
                    <span class="ensemble-badge">Ensemble</span>
                    <span>Summary</span>
                </div>
                <div class="message-content"></div>
            `;
            container.appendChild(summaryMsg);

            const contentEl = summaryMsg.querySelector('.message-content');
            const cleanContent = summary.content.replace(/\*\*/g, '');
            const formattedHtml = formatSummaryAsCards(cleanContent);
            if (formattedHtml) {
                contentEl.innerHTML = formattedHtml;
            } else {
                contentEl.textContent = cleanContent;
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
        if (summary) {
            conversationHistory.push({ role: 'assistant', content: summary.content });
        }

        // Store for continuing conversation
        window.loadedConversationTopic = debate.topic;
        window.continuingDebateId = debateId;  // Track which debate we're continuing

        // Show chat input area
        const inputArea = document.getElementById('chat-input-area');
        if (inputArea) inputArea.style.display = 'block';

        // Enable continuing the conversation
        setInputLocked(false);
        updateSendButton();

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

    // Check if this is a personality name and add bee icon
    const beeType = getPersonalityFromName(modelName);

    // Set data-personality for CSS colors (colored border + name)
    if (beeType) {
        msg.dataset.personality = beeType;
    }

    const beeImg = beeType
        ? `<img src="/bee-${beeType}.png" alt="" style="width: 50px; height: 50px; margin: -15px -2px -15px -8px; image-rendering: -webkit-optimize-contrast;">`
        : '';

    // Get role name for personality (capitalize first letter)
    const roleName = beeType ? beeType.charAt(0).toUpperCase() + beeType.slice(1) : null;
    const roleNameHtml = roleName ? `<span class="ai-role-name">${escapeHtml(roleName)}</span>` : '';

    // Clean content of markdown
    const cleanContent = content.replace(/\*\*/g, '');

    msg.innerHTML = `
        <div class="ai-model-header">
            ${beeImg}
            <div class="ai-name-info">
                <span class="ai-model-name">${escapeHtml(modelName)}</span>
                ${roleNameHtml}
            </div>
            <span class="ai-provider-tag">${escapeHtml(provider)}</span>
        </div>
        <div class="message-content">${escapeHtml(cleanContent)}</div>
    `;
    container.appendChild(msg);
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
function renderHiveVerdict(verdict) {
    if (!verdict) return;

    const container = document.getElementById('chat-messages');
    const verdictEl = document.createElement('div');
    verdictEl.className = 'hive-verdict';

    // Build compact votes HTML with bee images
    let votesHtml = '';
    if (verdict.votes && verdict.votes.length > 0) {
        votesHtml = '<div class="verdict-votes">';
        for (const vote of verdict.votes) {
            const beeType = getPersonalityFromName(vote.name || '');
            const beeImg = beeType
                ? `<img src="/bee-${beeType}.png" alt="" style="width: 24px; height: 24px; vertical-align: middle; margin-right: -4px; image-rendering: -webkit-optimize-contrast;">`
                : '';
            votesHtml += `<div class="verdict-vote">${beeImg}<span class="name">${escapeHtml(vote.name || '')}</span><span class="arrow">→</span><span class="choice">${escapeHtml(vote.choice || '-')}</span></div>`;
        }
        votesHtml += '</div>';
    }

    // Check if the decision indicates more info is needed
    const needsMoreInfo = verdict.hive_decision &&
        (verdict.hive_decision.toLowerCase().includes('options needed') ||
         verdict.hive_decision.toLowerCase().includes('more info') ||
         verdict.hive_decision.toLowerCase().includes('need more'));

    const followUpHint = needsMoreInfo
        ? `<div class="verdict-hint">Type your follow-up question below to continue the discussion</div>`
        : '';

    verdictEl.innerHTML = `
        <div class="verdict-decision">
            <img src="/bee-icon.png" alt="" class="verdict-bee" style="width: 36px; height: 36px; image-rendering: -webkit-optimize-contrast;">
            <div class="verdict-main">
                <div class="verdict-label">Hive Decision</div>
                <div class="verdict-answer">${escapeHtml(verdict.hive_decision || 'No consensus')}</div>
            </div>
            ${verdict.confidence !== undefined ? `<div class="verdict-confidence">${verdict.confidence}% confidence</div>` : ''}
        </div>
        ${votesHtml}
        <div class="verdict-actions">
            <button class="verdict-action-btn try-another-hive" onclick="openHivesModalForRetry()">
                <span>🐝</span> Try Another Hive
            </button>
        </div>
        ${followUpHint}
    `;

    container.appendChild(verdictEl);
    scrollToBottom(container);
}

// Open hives modal for retry - allows choosing a different hive to re-ask the question
function openHivesModalForRetry() {
    if (typeof window.openHivesModal === 'function') {
        window.openHivesModal();
    }
}
