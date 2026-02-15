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
const MAX_IMAGES = 10;

// Send button click - detect intervention vs new conversation
document.getElementById('send-btn').addEventListener('click', () => {
    if (isProcessing && chatWebSocket && chatWebSocket.readyState === WebSocket.OPEN) {
        // During active discussion - send as intervention
        sendIntervention();
    } else {
        // Normal message send
        sendMessage();
    }
});

// Attachment menu toggle
document.getElementById('attachment-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleAttachmentMenu();
});

// Add image button in dropdown
document.getElementById('add-image-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    closeAttachmentMenu();
    document.getElementById('image-input').click();
});

// Export PDF button in dropdown
document.getElementById('export-pdf-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    closeAttachmentMenu();

    // Check if user is Pro
    if (subscriptionStatus?.status !== 'active') {
        if (confirm('Export to PDF is a Pro feature. Upgrade now for unlimited sessions and PDF exports?')) {
            window.location.href = '/pricing';
        }
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

// Close dropdown when clicking outside
document.addEventListener('click', () => {
    closeAttachmentMenu();
});

// Toggle attachment dropdown
function toggleAttachmentMenu() {
    const dropdown = document.getElementById('attachment-dropdown');
    dropdown.classList.toggle('open');
}

// Close attachment dropdown
function closeAttachmentMenu() {
    const dropdown = document.getElementById('attachment-dropdown');
    dropdown.classList.remove('open');
}

// Send a message
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message || selectedModels.length < 2 || isProcessing) {
        return;
    }

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

    // Show stop button and update status
    showStopButton();
    updateChatStatus('Starting discussion...');

    try {
        // Create a new debate/session
        const requestBody = {
            topic: message,
            config: {
                models: selectedModels,
                rounds: 1, // Each AI gives one opinion
                summarizer_index: 0
            }
        };

        // Add images if present
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
            if (confirm('You\'ve used all your free sessions. Upgrade to Pro for unlimited sessions?')) {
                window.location.href = '/pricing';
            }
            return;
        }

        if (!response.ok) throw new Error('Failed to start session');

        const session = await response.json();
        currentSessionId = session.id;

        // Connect WebSocket (summary placeholder added when summary_start received)
        connectWebSocket(session.id);

        // Update subscription status
        loadSubscriptionStatus();
    } catch (error) {
        console.error('Error starting session:', error);
        updateChatStatus('');
        hideStopButton();
        setInputLocked(false);
        alert('Failed to start session. Please try again.');
    }
}

// Connect to WebSocket
function connectWebSocket(sessionId) {
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
        hideStopButton();
        setInputLocked(false);
    };

    chatWebSocket.onclose = () => {
        console.log('WebSocket closed');
        chatWebSocket = null;
    };
}

// Handle WebSocket messages
function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'round_start':
            updateChatStatus('Getting opinions...');
            break;

        case 'model_start':
            addAiDiscussionMessage(message.model_name, message.provider, '');
            updateChatStatus(`${message.model_name} is responding...`);
            break;

        case 'chunk':
            appendToAiDiscussion(message.model_name, message.content);
            break;

        case 'model_end':
            finishAiDiscussion(message.model_name);
            break;

        case 'model_error':
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
            // Summary complete
            break;

        case 'debate_end':
            updateChatStatus('');
            finishFinalResponse();
            setInputLocked(false);
            hideStopButton();
            showExportButton();
            break;

        case 'error':
            updateChatStatus('');
            hideStopButton();
            setInputLocked(false);
            console.error('Session error:', message.message);
            break;

        case 'ping':
            // Keep-alive, ignore
            break;

        case 'intervention_received':
            updateChatStatus('Your message was received. AIs will respond...');
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

// Format summary text as styled cards
function formatSummaryAsCards(text) {
    const lines = text.split('\n').filter(line => line.trim());
    let cards = [];
    let bottomLine = '';

    for (const line of lines) {
        // Match **Name**: content or **Bottom line**: content
        const match = line.match(/\*\*([^*]+)\*\*[:\s]*(.+)/);
        if (match) {
            const name = match[1].trim();
            const content = match[2].trim();

            if (name.toLowerCase() === 'bottom line' || name.toLowerCase() === 'verdict') {
                bottomLine = content;
            } else {
                cards.push({ name, content });
            }
        }
    }

    // If we couldn't parse anything, return null to keep original
    if (cards.length === 0 && !bottomLine) {
        return null;
    }

    // Build HTML
    let html = '<div class="summary-cards">';

    for (const card of cards) {
        const providerClass = getProviderClassFromName(card.name);
        html += `
            <div class="summary-card ${providerClass}">
                <span class="summary-card-name">${escapeHtml(card.name)}</span>
                <span class="summary-card-content">${escapeHtml(card.content)}</span>
            </div>
        `;
    }

    if (bottomLine) {
        html += `
            <div class="summary-verdict">
                <span class="verdict-label">Bottom line</span>
                <span class="verdict-content">${escapeHtml(bottomLine)}</span>
            </div>
        `;
    }

    html += '</div>';
    return html;
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
function addAiDiscussionMessage(modelName, provider, content) {
    const container = document.getElementById('chat-messages');

    const msg = document.createElement('div');
    msg.className = 'message ai-individual streaming';
    msg.dataset.model = modelName;
    msg.dataset.provider = provider;
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

// Add AI discussion error with helpful labeling
function addAiDiscussionError(modelName, error) {
    const container = document.getElementById('chat-messages');
    const msg = container.querySelector(`.message.ai-individual[data-model="${modelName}"]`);
    if (msg) {
        msg.classList.remove('streaming');
        const content = msg.querySelector('.message-content');

        // Get labeled error info
        const errorInfo = labelError(error);

        content.innerHTML = `
            <div class="error-labeled" style="color: ${errorInfo.color};">
                <div style="font-weight: 600; margin-bottom: 4px;">${errorInfo.label}</div>
                ${errorInfo.help ? `<div style="font-size: 0.85rem; opacity: 0.9;">${errorInfo.help}</div>` : ''}
            </div>
        `;
    }
}

// Update chat status indicator
function updateChatStatus(text) {
    const statusEl = document.getElementById('chat-status');
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.classList.toggle('active', !!text);
    }
}

// Show stop button
function showStopButton() {
    const stopBtn = document.getElementById('stop-btn');
    if (stopBtn) {
        stopBtn.classList.add('visible');
    }
}

// Hide stop button
function hideStopButton() {
    const stopBtn = document.getElementById('stop-btn');
    if (stopBtn) {
        stopBtn.classList.remove('visible');
    }
}

// Stop the conversation
function stopConversation() {
    if (chatWebSocket && chatWebSocket.readyState === WebSocket.OPEN) {
        chatWebSocket.send(JSON.stringify({ type: 'stop' }));
    }

    // Also call the REST endpoint as backup
    if (currentSessionId) {
        fetch(`${API_BASE}/api/debates/${currentSessionId}/stop`, {
            method: 'POST',
            headers: getAuthHeaders()
        }).catch(console.error);
    }

    updateChatStatus('Stopping...');
    hideStopButton();
}

// Stop button click handler
document.getElementById('stop-btn')?.addEventListener('click', stopConversation);

// Lock/unlock input - allows intervention during processing
function setInputLocked(locked) {
    isProcessing = locked;
    const input = document.getElementById('chat-input');

    // Don't disable input - allow intervention during discussion
    if (locked) {
        input.placeholder = 'Type to intervene in the discussion...';
    } else {
        input.placeholder = 'Type your message...';
    }
    updateSendButton();
}

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

// Scroll to bottom
function scrollToBottom(element) {
    element.scrollTop = element.scrollHeight;
}

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

    // Show one-time notice about vision models
    if (!imageNoticeShown && selectedImages.length === 0) {
        showToast('⚠️ Some AI models (GPT-4, GPT-4 Turbo, Deepseek, Grok 3 Mini) cannot view images. They will respond to the text conversation only.', 8000, 'warning');
        imageNoticeShown = true;
    }

    // Check max images limit
    if (selectedImages.length >= MAX_IMAGES) {
        alert(`Maximum ${MAX_IMAGES} images allowed`);
        return;
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        alert('Please select a valid image file (JPG, PNG, GIF, or WebP)');
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

// ============ CHAT HISTORY ============

// Open history modal
document.getElementById('history-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('history-modal');
    modal.classList.add('active');
    loadChatHistory();
});

// Close history modal
document.getElementById('history-close-btn')?.addEventListener('click', () => {
    document.getElementById('history-modal').classList.remove('active');
});

// Close on overlay click
document.getElementById('history-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        e.currentTarget.classList.remove('active');
    }
});

// Load chat history from API
async function loadChatHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Loading...</p>';

    try {
        const response = await fetch(`${API_BASE}/api/debates`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to load history');

        const debates = await response.json();

        if (debates.length === 0) {
            list.innerHTML = '<div class="history-empty">No conversations yet.<br>Start chatting to see your history here.</div>';
            return;
        }

        list.innerHTML = debates.map(debate => {
            const date = debate.created_at ? new Date(debate.created_at).toLocaleDateString() : '';
            const topic = debate.topic.length > 60 ? debate.topic.substring(0, 60) + '...' : debate.topic;
            return `
                <div class="history-item" data-id="${debate.id}">
                    <div class="history-item-topic">${escapeHtml(topic)}</div>
                    <div class="history-item-meta">${date} • ${debate.status}</div>
                </div>
            `;
        }).join('');

        // Add click handlers
        list.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                loadConversation(item.dataset.id);
            });
        });

    } catch (error) {
        console.error('Error loading history:', error);
        list.innerHTML = '<div class="history-empty">Failed to load history.</div>';
    }
}

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

        // Close modal
        document.getElementById('history-modal').classList.remove('active');

        // Clear current chat
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';

        // Remove empty state if present
        const emptyState = document.querySelector('.empty-chat');
        if (emptyState) emptyState.remove();

        // Add user message (the topic)
        addUserMessage(debate.topic);

        // Group messages by round
        const rounds = {};
        let summary = null;

        messages.forEach(msg => {
            if (msg.round === 0) {
                summary = msg;
            } else {
                if (!rounds[msg.round]) rounds[msg.round] = [];
                rounds[msg.round].push(msg);
            }
        });

        // Add AI messages from each round
        for (const round of Object.keys(rounds).sort((a, b) => a - b)) {
            for (const msg of rounds[round]) {
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

        scrollToBottom(container);

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
