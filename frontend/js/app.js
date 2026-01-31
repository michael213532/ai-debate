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
        renderModelsGrid();
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
        renderModelsGrid();
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
    const personalitiesSection = document.getElementById('personalities-section');

    if (subscriptionStatus.status === 'active') {
        badge.textContent = 'PRO';
        badge.className = 'subscription-badge pro';
        upgradeBtn.style.display = 'none';
        // Show personalities section for Pro users
        if (personalitiesSection) personalitiesSection.style.display = 'block';
    } else {
        const remaining = subscriptionStatus.debates_limit - subscriptionStatus.debates_used;
        badge.textContent = `${remaining}/${subscriptionStatus.debates_limit} this month`;
        badge.className = 'subscription-badge free';
        upgradeBtn.style.display = 'inline-flex';
        // Hide personalities section for free users
        if (personalitiesSection) personalitiesSection.style.display = 'none';
    }

    // Update personalities list when subscription status loads
    renderPersonalitiesList();
}

// Handle upgrade button - go to pricing page
document.getElementById('upgrade-btn').addEventListener('click', () => {
    window.location.href = '/pricing';
});

// Render models grid
function renderModelsGrid() {
    const grid = document.getElementById('models-grid');
    grid.innerHTML = '';

    availableModels.forEach(model => {
        const isConfigured = configuredProviders.has(model.provider);
        const isSelected = selectedModels.some(m => m.id === model.id && m.provider === model.provider);

        const checkbox = document.createElement('label');
        checkbox.className = `model-checkbox ${isSelected ? 'selected' : ''} ${!isConfigured ? 'disabled' : ''}`;
        checkbox.innerHTML = `
            <input type="checkbox" ${isSelected ? 'checked' : ''} ${!isConfigured ? 'disabled' : ''}>
            <div class="model-info">
                <div class="model-name">${model.name}</div>
                <div class="model-provider">${model.provider_name}${!isConfigured ? ' (no key)' : ''}</div>
            </div>
            <div class="checkmark"></div>
        `;

        if (isConfigured) {
            checkbox.addEventListener('click', () => toggleModel(model));
        }

        grid.appendChild(checkbox);
    });
}

// Toggle model selection
function toggleModel(model) {
    const index = selectedModels.findIndex(m => m.id === model.id && m.provider === model.provider);

    if (index >= 0) {
        selectedModels.splice(index, 1);
    } else if (selectedModels.length < 6) {
        selectedModels.push({
            provider: model.provider,
            model_id: model.id,
            model_name: model.name,
            role: ''  // Custom personality
        });
    }

    renderModelsGrid();
    renderPersonalitiesList();
    updateStartButton();
}

// Render personalities list for Pro users
function renderPersonalitiesList() {
    const list = document.getElementById('personalities-list');
    if (!list) return;

    if (selectedModels.length === 0) {
        list.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">Select models above to assign personalities</p>';
        return;
    }

    list.innerHTML = selectedModels.map((model, index) => `
        <div class="personality-item">
            <span class="personality-model-name">${model.model_name}</span>
            <input type="text"
                   class="form-input personality-input"
                   placeholder="e.g., Devil's advocate, Optimist, Skeptic..."
                   value="${model.role || ''}"
                   data-index="${index}">
        </div>
    `).join('');

    // Add event listeners
    list.querySelectorAll('.personality-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            selectedModels[index].role = e.target.value;
        });
    });
}

// Update start button state
function updateStartButton() {
    const startBtn = document.getElementById('start-btn');
    const topic = document.getElementById('topic').value.trim();
    const canStart = topic && selectedModels.length >= 2 && selectedModels.length <= 6;
    startBtn.disabled = !canStart;
}

// Load debate history
async function loadDebateHistory() {
    try {
        const response = await fetch(`${API_BASE}/api/debates`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to load debates');

        const debates = await response.json();
        renderDebateHistory(debates);
    } catch (error) {
        console.error('Error loading debates:', error);
    }
}

// Render debate history
function renderDebateHistory(debates) {
    const list = document.getElementById('history-list');

    if (debates.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">&#128172;</div>
                <p>No sessions yet. Start one above!</p>
            </div>
        `;
        return;
    }

    list.innerHTML = debates.map(debate => `
        <div class="history-item" data-id="${debate.id}">
            <div class="history-info">
                <div class="history-topic">${escapeHtml(debate.topic)}</div>
                <div class="history-meta">
                    ${debate.config.models?.length || 0} models &bull;
                    ${debate.config.rounds || 3} rounds &bull;
                    ${formatDate(debate.created_at)}
                </div>
            </div>
            <span class="history-status status-${debate.status}">${debate.status}</span>
        </div>
    `).join('');

    // Add click handlers
    list.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => viewDebate(item.dataset.id));
    });
}

// View a completed debate
async function viewDebate(debateId) {
    try {
        const response = await fetch(`${API_BASE}/api/debates/${debateId}`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to load debate');

        const data = await response.json();
        displayCompletedDebate(data);
    } catch (error) {
        console.error('Error viewing debate:', error);
    }
}

// Display a completed debate
function displayCompletedDebate(data) {
    const { debate, messages } = data;

    // Set topic
    document.getElementById('topic').value = debate.topic;
    document.getElementById('rounds').value = debate.config.rounds || 3;

    // Select models
    selectedModels = debate.config.models || [];
    renderModelsGrid();
    updateStartButton();

    // Show arena
    const arena = document.getElementById('debate-arena');
    arena.style.display = 'block';

    // Update status bar
    document.getElementById('current-round').textContent = `${debate.config.rounds}/${debate.config.rounds}`;
    document.getElementById('debate-status').textContent = debate.status;
    document.getElementById('debate-status').className = `status-value status-${debate.status}`;
    document.getElementById('stop-btn').style.display = 'none';

    // Create panels
    createModelPanels(debate.config.models);

    // Populate messages
    messages.forEach(msg => {
        if (msg.round === 0) {
            // Summary
            document.getElementById('summary-section').style.display = 'block';
            document.getElementById('summary-model').textContent = `by ${msg.model_name}`;
            document.getElementById('summary-content').textContent = msg.content;
        } else {
            const panel = document.querySelector(`[data-model="${msg.model_name}"]`);
            if (panel) {
                addResponseToPanel(panel, msg.round, msg.content);
            }
        }
    });

    // Scroll to arena
    arena.scrollIntoView({ behavior: 'smooth' });
}

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = '/';
});

// Topic input handler
document.getElementById('topic').addEventListener('input', updateStartButton);

// Settings button
document.getElementById('settings-btn').addEventListener('click', () => {
    openSettingsModal();
});

// Initialize
(async function init() {
    if (await checkAuth()) {
        await Promise.all([
            loadModels(),
            loadConfiguredProviders(),
            loadDebateHistory(),
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

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
