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
    if (btn.classList.contains('stop-mode')) {
        // Stop the discussion
        stopDiscussion();
    } else if (!currentSessionId && typeof handleQuestionSubmit === 'function') {
        // No session yet - trigger question flow
        const input = document.getElementById('chat-input');
        const question = input.value.trim();
        if (question) {
            handleQuestionSubmit(question);
        }
    } else {
        // Normal message send
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

    if (!message || selectedModels.length < 2 || isProcessing) {
        return;
    }

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

            const response = await fetch(`${API_BASE}/api/debates/${window.continuingDebateId}/continue`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(continueBody)
            });

            if (!response.ok) throw new Error('Failed to continue session');

            session = await response.json();
            currentSessionId = session.id;
            // Keep continuingDebateId for future follow-ups in this session
        } else {
            // Create new debate/session
            const requestBody = {
                topic: message,
                config: {
                    models: selectedModels,
                    rounds: 1,
                    summarizer_index: summarizerIndex
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
    // Close any existing connection first to prevent duplicates
    if (chatWebSocket) {
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

    chatWebSocket = new WebSocket(wsUrl);

    chatWebSocket.onopen = () => {
        console.log('WebSocket connected');
        updateChatStatus('Discussing...');
    };

    chatWebSocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
    };

    chatWebSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateChatStatus('Connection error');
        setInputLocked(false);
    };

    chatWebSocket.onclose = () => {
        console.log('WebSocket closed');
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
            addAiDiscussionMessage(message.model_name, message.provider, '', message.personality_id);
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
            setInputLocked(false);
            showExportButton();
            // Enable continuing this conversation with follow-up messages
            window.continuingDebateId = currentSessionId;
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

// Add user message to chat
function addUserMessage(text, imageDataUrls = []) {
    const container = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = 'message user';

    let html = `<div class="message-content">${escapeHtml(text)}</div>`;
    if (imageDataUrls && imageDataUrls.length > 0) {
        html += '<div class="message-images">';
        for (const dataUrl of imageDataUrls) {
            html += `<img src="${dataUrl}" class="message-image" alt="Attached image">`;
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
function addAiDiscussionMessage(modelName, provider, content, personalityId) {
    const container = document.getElementById('chat-messages');

    const msg = document.createElement('div');
    msg.className = 'message ai-individual streaming';
    msg.dataset.model = modelName;
    msg.dataset.provider = provider;
    if (personalityId) {
        msg.dataset.personality = personalityId;
    }
    msg.innerHTML = `
        <div class="ai-model-header">
            <span class="ai-model-name">${escapeHtml(modelName)}</span>
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

// Update chat status indicator (uses placeholder)
function updateChatStatus(text) {
    const input = document.getElementById('chat-input');
    if (input && text) {
        input.placeholder = text;
    }
}

// Lock/unlock input - toggle between send and stop mode
function setInputLocked(locked) {
    isProcessing = locked;
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    if (locked) {
        // Switch to stop mode - circular pause button
        input.placeholder = 'Discussion in progress...';
        sendBtn.classList.add('stop-mode');
        sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        sendBtn.disabled = false;
    } else {
        // Switch to send mode - Start Debate text
        input.placeholder = 'How can I help you today?';
        sendBtn.classList.remove('stop-mode');
        sendBtn.innerHTML = 'Start Debate';
        updateSendButton();
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

// New chat button - reset to question-first flow
document.getElementById('new-chat-btn')?.addEventListener('click', () => {
    // Clear current chat and continuation state
    document.getElementById('chat-messages').innerHTML = '';
    currentSessionId = null;
    window.continuingDebateId = null;
    window.loadedConversationTopic = null;
    conversationHistory = [];
    closeSidebar();

    // Hide chat input area
    const inputArea = document.getElementById('chat-input-area');
    if (inputArea) inputArea.style.display = 'none';

    // Show question-first empty state
    const container = document.getElementById('chat-messages');
    container.innerHTML = `
        <div class="empty-chat" id="empty-state">
            <img src="/logo.png" alt="Beecision" style="width: 80px; height: 80px; margin-bottom: 16px;">

            <!-- Question templates -->
            <div style="margin-bottom: 24px;">
                <span style="color: var(--text-secondary); font-size: 0.85rem;">Try one of these:</span>
                <div class="question-templates" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; justify-content: center;">
                    <button class="question-template" data-question="Should I buy or rent a home?">Should I buy or rent?</button>
                    <button class="question-template" data-question="Best country to move to in 2026?">Best country to move to?</button>
                    <button class="question-template" data-question="Which laptop should I buy?">Which laptop to buy?</button>
                    <button class="question-template" data-question="Should I quit my job and start a business?">Should I quit my job?</button>
                </div>
            </div>
        </div>
    `;

    // Reset chat input placeholder
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.value = '';
        chatInput.placeholder = 'Ask your question';
    }

    // Re-attach event listeners for the new elements
    attachQuestionFlowListeners();
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
            e.stopPropagation();
            if (confirm('Delete this conversation?')) {
                await deleteConversation(btn.dataset.id);
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
            const formattedHtml = formatSummaryAsCards(summary.content);
            if (formattedHtml) {
                contentEl.innerHTML = formattedHtml;
            } else {
                contentEl.textContent = summary.content;
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
    msg.innerHTML = `
        <div class="ai-model-header">
            <span class="ai-model-name">${escapeHtml(modelName)}</span>
            <span class="ai-provider-tag">${escapeHtml(provider)}</span>
        </div>
        <div class="message-content">${escapeHtml(content)}</div>
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

    // Build compact votes HTML
    let votesHtml = '';
    if (verdict.votes && verdict.votes.length > 0) {
        votesHtml = '<div class="verdict-votes">';
        for (const vote of verdict.votes) {
            votesHtml += `
                <div class="verdict-vote">
                    ${vote.emoji ? `<span class="emoji">${escapeHtml(vote.emoji)}</span>` : `<img src="/bee-icon.png" alt="" class="emoji" style="width: 28px; height: 28px;">`}
                    <span class="name">${escapeHtml(vote.name || '')}</span>
                    <span class="arrow">→</span>
                    <span class="choice">${escapeHtml(vote.choice || '-')}</span>
                </div>
            `;
        }
        votesHtml += '</div>';
    }

    verdictEl.innerHTML = `
        <div class="verdict-decision">
            <img src="/bee-icon.png" alt="" class="verdict-bee" style="width: 48px; height: 48px;">
            <div class="verdict-main">
                <div class="verdict-label">Hive Decision</div>
                <div class="verdict-answer">${escapeHtml(verdict.hive_decision || 'No consensus')}</div>
            </div>
            ${verdict.confidence !== undefined ? `<div class="verdict-confidence">${verdict.confidence}%</div>` : ''}
        </div>
        ${votesHtml}
    `;

    container.appendChild(verdictEl);
    scrollToBottom(container);
}
