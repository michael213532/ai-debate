/**
 * Chat functionality and WebSocket handling
 */

let chatWebSocket = null;
let imageNoticeShown = false; // Track if we've shown the vision notice this session
let currentSessionId = null;
let isProcessing = false;
let conversationHistory = [];
let selectedImages = []; // Array of { base64: string, media_type: string, dataUrl: string }
const MAX_IMAGES = 10;

// Send button click
document.getElementById('send-btn').addEventListener('click', sendMessage);

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

    // Clear AI panel
    clearAiPanel();
    setAiStatus('Starting...', true);

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
            setAiStatus('Getting opinions...', true);
            break;

        case 'model_start':
            addAiDiscussionMessage(message.model_name, message.provider, '');
            // Auto-open AI panel on mobile when responses start
            if (window.innerWidth <= 900) {
                document.getElementById('ai-panel')?.classList.add('open');
                document.getElementById('panel-overlay')?.classList.add('active');
            }
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
