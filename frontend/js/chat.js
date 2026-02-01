/**
 * Chat functionality and WebSocket handling
 */

let chatWebSocket = null;
let currentSessionId = null;
let isProcessing = false;
let conversationHistory = [];
let selectedImage = null; // { base64: string, media_type: string, dataUrl: string }

// Send button click
document.getElementById('send-btn').addEventListener('click', sendMessage);

// Export PDF button click
document.getElementById('export-pdf-btn').addEventListener('click', exportToPdf);

// Image upload button click
document.getElementById('upload-image-btn').addEventListener('click', () => {
    document.getElementById('image-input').click();
});

// Image file selected
document.getElementById('image-input').addEventListener('change', handleImageSelect);

// Remove image button
document.getElementById('remove-image-btn').addEventListener('click', clearSelectedImage);

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

    // Add user message to chat (with image if present)
    addUserMessage(message, selectedImage?.dataUrl);

    // Store image for API call, then clear preview
    const imageToSend = selectedImage ? { base64: selectedImage.base64, media_type: selectedImage.media_type } : null;
    clearSelectedImage();

    // Clear input
    input.value = '';
    input.style.height = 'auto';

    // Clear AI panel
    clearAiPanel();
    setAiStatus('Starting...', true);

    try {
        // Create a new debate/session
        const requestBody = {
            topic: message,
            config: {
                models: selectedModels,
                rounds: 2, // Quick discussion rounds
                summarizer_index: 0
            }
        };

        // Add image if present
        if (imageToSend) {
            requestBody.image = imageToSend;
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
            showExportButton();
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
function addUserMessage(text, imageDataUrl = null) {
    const container = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = 'message user';

    let html = `<div class="message-content">${escapeHtml(text)}</div>`;
    if (imageDataUrl) {
        html += `<img src="${imageDataUrl}" class="message-image" alt="Attached image">`;
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

// Show export PDF button
function showExportButton() {
    const btn = document.getElementById('export-pdf-btn');
    if (btn && currentSessionId) {
        btn.style.display = 'flex';
    }
}

// Hide export PDF button
function hideExportButton() {
    const btn = document.getElementById('export-pdf-btn');
    if (btn) {
        btn.style.display = 'none';
    }
}

// Handle image file selection
function handleImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

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

        selectedImage = {
            base64: base64,
            media_type: file.type,
            dataUrl: dataUrl
        };

        // Show preview
        showImagePreview(dataUrl);
        updateSendButton();
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    event.target.value = '';
}

// Show image preview
function showImagePreview(dataUrl) {
    const container = document.getElementById('image-preview-container');
    const preview = document.getElementById('image-preview');
    preview.src = dataUrl;
    container.style.display = 'inline-block';
}

// Clear selected image
function clearSelectedImage() {
    selectedImage = null;
    const container = document.getElementById('image-preview-container');
    const preview = document.getElementById('image-preview');
    preview.src = '';
    container.style.display = 'none';
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
