/**
 * Chat functionality and WebSocket handling
 */

let chatWebSocket = null;
let currentSessionId = null;
let isProcessing = false;
let conversationHistory = [];

// Send button click
document.getElementById('send-btn').addEventListener('click', sendMessage);

// Send a message
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message || selectedModels.length < 2 || isProcessing) {
        return;
    }

    // Lock input
    setInputLocked(true);

    // Clear empty state if present
    const emptyState = document.querySelector('.empty-chat');
    if (emptyState) {
        emptyState.remove();
    }

    // Add user message to chat
    addUserMessage(message);

    // Clear input
    input.value = '';
    input.style.height = 'auto';

    // Clear AI panel
    clearAiPanel();
    setAiStatus('Starting...', true);

    try {
        // Create a new debate/session
        const response = await fetch(`${API_BASE}/api/debates`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                topic: message,
                config: {
                    models: selectedModels,
                    rounds: 2, // Quick discussion rounds
                    summarizer_index: 0
                }
            })
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

        // Add placeholder for AI response
        addAiMessagePlaceholder();

        // Connect WebSocket
        connectWebSocket(session.id);

        // Update subscription status
        loadSubscriptionStatus();
    } catch (error) {
        console.error('Error starting session:', error);
        setAiStatus('Error', false);
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
        setAiStatus('Discussing...', true);
    };

    chatWebSocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
    };

    chatWebSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setAiStatus('Connection error', false);
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
            setAiStatus(`Round ${message.round}/${message.total_rounds}`, true);
            break;

        case 'model_start':
            addAiDiscussionMessage(message.model_name, message.provider, '');
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
            setAiStatus('Synthesizing...', true);
            break;

        case 'summary_chunk':
            appendToFinalResponse(message.content);
            break;

        case 'summary_end':
            // Summary complete
            break;

        case 'debate_end':
            setAiStatus('Done', false);
            finishFinalResponse();
            setInputLocked(false);
            break;

        case 'error':
            setAiStatus('Error', false);
            setInputLocked(false);
            console.error('Session error:', message.message);
            break;

        case 'ping':
            // Keep-alive, ignore
            break;
    }
}

// Add user message to chat
function addUserMessage(text) {
    const container = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.innerHTML = `<div class="message-content">${escapeHtml(text)}</div>`;
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

        const content = msg.querySelector('.message-content').textContent;
        conversationHistory.push({ role: 'assistant', content: content });
    }
}

// Clear AI panel
function clearAiPanel() {
    const panel = document.getElementById('ai-panel-content');
    panel.innerHTML = '';
}

// Add AI discussion message
function addAiDiscussionMessage(modelName, provider, content) {
    const panel = document.getElementById('ai-panel-content');

    const msg = document.createElement('div');
    msg.className = 'ai-message streaming';
    msg.dataset.model = modelName;
    msg.dataset.provider = provider;
    msg.innerHTML = `
        <div class="ai-message-header">
            <span class="ai-message-model">${escapeHtml(modelName)}</span>
            <span class="ai-message-provider">${escapeHtml(provider)}</span>
        </div>
        <div class="ai-message-content">${escapeHtml(content)}</div>
    `;
    panel.appendChild(msg);
    panel.scrollTop = panel.scrollHeight;
}

// Append to AI discussion
function appendToAiDiscussion(modelName, text) {
    const panel = document.getElementById('ai-panel-content');
    const msg = panel.querySelector(`[data-model="${modelName}"].streaming`);
    if (msg) {
        const content = msg.querySelector('.ai-message-content');
        content.textContent += text;
        panel.scrollTop = panel.scrollHeight;
    }
}

// Finish AI discussion message
function finishAiDiscussion(modelName) {
    const panel = document.getElementById('ai-panel-content');
    const msg = panel.querySelector(`[data-model="${modelName}"].streaming`);
    if (msg) {
        msg.classList.remove('streaming');
    }
}

// Add AI discussion error
function addAiDiscussionError(modelName, error) {
    const panel = document.getElementById('ai-panel-content');
    const msg = panel.querySelector(`[data-model="${modelName}"]`);
    if (msg) {
        msg.classList.remove('streaming');
        const content = msg.querySelector('.ai-message-content');
        content.innerHTML = `<span style="color: var(--error-color);">Error: ${escapeHtml(error)}</span>`;
    }
}

// Set AI status
function setAiStatus(text, active) {
    const status = document.getElementById('ai-status');
    status.textContent = text;
    status.className = `ai-status ${active ? 'active' : ''}`;
}

// Lock/unlock input
function setInputLocked(locked) {
    isProcessing = locked;
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    input.disabled = locked;
    sendBtn.disabled = locked;

    if (locked) {
        input.placeholder = 'Waiting for AI response...';
    } else {
        input.placeholder = 'Type your message...';
        updateSendButton();
    }
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
