/**
 * Main application logic
 */

const API_BASE = '';
let currentUser = null;
let availableModels = [];
let selectedModels = [];
let configuredProviders = new Set();
let subscriptionStatus = null;

// Auth helper
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// Check authentication
async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return false;
    }

    try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error('Not authenticated');
        }

        currentUser = await response.json();
        document.getElementById('user-email').textContent = currentUser.email;

        // Check if user has accepted privacy policy
        if (!currentUser.privacy_accepted) {
            showPrivacyModal();
        }

        return true;
    } catch (error) {
        localStorage.removeItem('token');
        window.location.href = '/';
        return false;
    }
}

// Show privacy policy modal for existing users
function showPrivacyModal() {
    const modal = document.getElementById('privacy-modal');
    const checkbox = document.getElementById('privacy-modal-checkbox');
    const acceptBtn = document.getElementById('privacy-accept-btn');

    modal.style.display = 'flex';

    // Enable/disable accept button based on checkbox
    checkbox.addEventListener('change', () => {
        acceptBtn.disabled = !checkbox.checked;
    });

    // Handle accept button click
    acceptBtn.addEventListener('click', async () => {
        if (!checkbox.checked) return;

        acceptBtn.disabled = true;
        acceptBtn.textContent = 'Accepting...';

        try {
            const response = await fetch(`${API_BASE}/api/auth/accept-privacy`, {
                method: 'POST',
                headers: getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error('Failed to accept privacy policy');
            }

            currentUser.privacy_accepted = true;
            modal.style.display = 'none';
        } catch (error) {
            alert('Failed to save privacy acceptance. Please try again.');
            acceptBtn.disabled = false;
            acceptBtn.textContent = 'Accept and Continue';
        }
    });
}

// Load available models
async function loadModels() {
    try {
        const response = await fetch(`${API_BASE}/api/models`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to load models');

        availableModels = await response.json();
        renderModelTags();
    } catch (error) {
        console.error('Error loading models:', error);
    }
}

// Load configured providers
async function loadConfiguredProviders() {
    try {
        const response = await fetch(`${API_BASE}/api/keys`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to load providers');

        const providers = await response.json();
        configuredProviders = new Set(
            providers.filter(p => p.configured).map(p => p.provider)
        );
        renderModelTags();
    } catch (error) {
        console.error('Error loading providers:', error);
    }
}

// Load subscription status
async function loadSubscriptionStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/billing/status`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to load subscription');

        subscriptionStatus = await response.json();
        renderSubscriptionStatus();
    } catch (error) {
        console.error('Error loading subscription:', error);
    }
}

// Render subscription status in header
function renderSubscriptionStatus() {
    const badge = document.getElementById('subscription-status');
    const upgradeBtn = document.getElementById('upgrade-btn');

    if (subscriptionStatus.status === 'active') {
        badge.textContent = 'PRO';
        badge.className = 'subscription-badge pro';
        upgradeBtn.style.display = 'none';
    } else {
        const remaining = subscriptionStatus.debates_limit - subscriptionStatus.debates_used;
        badge.textContent = `${remaining}/${subscriptionStatus.debates_limit} left`;
        badge.className = 'subscription-badge free';
        upgradeBtn.style.display = 'inline-flex';
    }
}

// Handle upgrade button - go to pricing page
document.getElementById('upgrade-btn').addEventListener('click', () => {
    window.location.href = '/pricing';
});

// Render model tags
function renderModelTags() {
    const container = document.getElementById('model-tags');
    if (!container) return;

    container.innerHTML = '';

    availableModels.forEach((model, index) => {
        const isConfigured = configuredProviders.has(model.provider);
        const isSelected = selectedModels.some(m => m.model_id === model.id && m.provider === model.provider);

        const tag = document.createElement('span');
        tag.className = `model-tag ${isSelected ? 'selected' : ''} ${!isConfigured ? 'disabled' : ''}`;
        tag.dataset.modelIndex = index;
        tag.textContent = model.name;
        tag.title = `${model.provider_name}${!isConfigured ? ' (no API key)' : ''}`;

        container.appendChild(tag);
    });
}

// Handle model tag clicks
document.getElementById('model-tags')?.addEventListener('click', function(e) {
    const tag = e.target.closest('.model-tag');
    if (!tag || tag.classList.contains('disabled')) return;

    const index = parseInt(tag.dataset.modelIndex);
    if (!isNaN(index) && availableModels[index]) {
        toggleModel(availableModels[index]);
    }
});

// Toggle model selection
function toggleModel(model) {
    const index = selectedModels.findIndex(m => m.model_id === model.id && m.provider === model.provider);

    if (index >= 0) {
        selectedModels.splice(index, 1);
    } else if (selectedModels.length < 6) {
        selectedModels.push({
            provider: model.provider,
            model_id: model.id,
            model_name: model.name,
            role: ''
        });
    }

    renderModelTags();
    updateSendButton();
}

// Update send button state
function updateSendButton() {
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('chat-input');
    const canSend = input.value.trim() && selectedModels.length >= 2;
    sendBtn.disabled = !canSend;
}

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = '/';
});

// Settings button
document.getElementById('settings-btn').addEventListener('click', () => {
    openSettingsModal();
});

// Inline settings button
document.getElementById('settings-btn-inline')?.addEventListener('click', () => {
    openSettingsModal();
});

// Toggle AI panel
document.getElementById('toggle-panel')?.addEventListener('click', () => {
    const panel = document.getElementById('ai-panel');
    const btn = document.getElementById('toggle-panel');
    panel.classList.toggle('collapsed');
    btn.textContent = panel.classList.contains('collapsed') ? '▶' : '◀';
});

// Chat input handlers
const chatInput = document.getElementById('chat-input');
if (chatInput) {
    chatInput.addEventListener('input', () => {
        updateSendButton();
        // Auto-resize
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!document.getElementById('send-btn').disabled) {
                sendMessage();
            }
        }
    });
}

// Initialize
(async function init() {
    if (await checkAuth()) {
        await Promise.all([
            loadModels(),
            loadConfiguredProviders(),
            loadSubscriptionStatus()
        ]);

        // Check for subscription success/cancel from URL
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('subscription') === 'success') {
            alert('Subscription activated! You now have unlimited sessions.');
            window.history.replaceState({}, '', '/app');
            loadSubscriptionStatus();
        }
    }
})();

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Mobile AI panel toggle
const mobileAiToggle = document.getElementById('mobile-ai-toggle');
const panelOverlay = document.getElementById('panel-overlay');
const aiPanel = document.getElementById('ai-panel');

if (mobileAiToggle && panelOverlay && aiPanel) {
    mobileAiToggle.addEventListener('click', () => {
        aiPanel.classList.add('open');
        panelOverlay.classList.add('active');
    });

    panelOverlay.addEventListener('click', () => {
        aiPanel.classList.remove('open');
        panelOverlay.classList.remove('active');
    });

    // Close panel when clicking the toggle button inside panel
    document.getElementById('toggle-panel')?.addEventListener('click', () => {
        if (window.innerWidth <= 900) {
            aiPanel.classList.remove('open');
            panelOverlay.classList.remove('active');
        }
    });
}
