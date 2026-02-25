/**
 * Main application logic
 */

// Error labeling based on common API issues
const ERROR_LABELS = {
    '401': {
        label: 'Invalid API Key',
        color: '#dc2626',
        help: 'Double-check you copied the full key. Some providers require creating a new key.'
    },
    '429': {
        label: 'Rate Limited',
        color: '#f59e0b',
        help: 'You\'ve hit usage limits. Wait a minute or check your quota on the provider\'s dashboard.'
    },
    '402': {
        label: 'Payment Required',
        color: '#7c3aed',
        help: 'Your account needs credits. Add a payment method on the provider\'s billing page.'
    },
    '403': {
        label: 'Access Denied',
        color: '#dc2626',
        help: 'Your API key doesn\'t have permission for this model. Check your account settings.'
    },
    '404': {
        label: 'Model Not Found',
        color: '#6b7280',
        help: 'This model may have been retired or renamed. Try a different model.'
    },
    '500': {
        label: 'Provider Error',
        color: '#6b7280',
        help: 'The AI provider is having issues. Try again in a moment.'
    },
    '503': {
        label: 'Service Unavailable',
        color: '#6b7280',
        help: 'The AI provider is temporarily overloaded. Try again shortly.'
    }
};

// Parse error message and return labeled version
function labelError(errorMessage) {
    if (!errorMessage) return { label: 'Error', color: '#dc2626', message: 'Unknown error', help: '' };

    const msg = errorMessage.toString();

    // Check for status codes in error message
    for (const [code, info] of Object.entries(ERROR_LABELS)) {
        if (msg.includes(code) || msg.toLowerCase().includes(info.label.toLowerCase())) {
            return {
                label: info.label,
                color: info.color,
                message: msg,
                help: info.help
            };
        }
    }

    // Check for common error patterns
    if (msg.toLowerCase().includes('invalid') && msg.toLowerCase().includes('key')) {
        return { ...ERROR_LABELS['401'], message: msg };
    }
    if (msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('quota')) {
        return { ...ERROR_LABELS['429'], message: msg };
    }
    if (msg.toLowerCase().includes('credit') || msg.toLowerCase().includes('billing') || msg.toLowerCase().includes('payment')) {
        return { ...ERROR_LABELS['402'], message: msg };
    }
    if (msg.toLowerCase().includes('connection') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('timeout')) {
        return {
            label: 'Connection Failed',
            color: '#6b7280',
            message: msg,
            help: 'Check your internet connection. VPNs or corporate networks may block API calls.'
        };
    }

    // Default
    return { label: 'Error', color: '#dc2626', message: msg, help: '' };
}

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
        const emailEl = document.getElementById('user-email');
        if (emailEl) emailEl.textContent = currentUser.email;
        // Update profile dropdown
        if (typeof updateProfileDisplay === 'function') {
            updateProfileDisplay(currentUser.email, currentUser.subscription_status === 'active');
        }

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

// Upgrade modal (free limit reached)
function showUpgradeModal() {
    const modal = document.getElementById('upgrade-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeUpgradeModal() {
    const modal = document.getElementById('upgrade-modal');
    if (modal) {
        modal.style.display = 'none';
    }
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
    const isPro = subscriptionStatus.status === 'active';

    if (isPro) {
        badge.textContent = 'PRO';
        badge.className = 'subscription-badge pro';
    } else {
        const remaining = subscriptionStatus.debates_limit - subscriptionStatus.debates_used;
        badge.textContent = `${remaining}/${subscriptionStatus.debates_limit} left`;
        badge.className = 'subscription-badge free';
    }

    // Update profile dropdown plan display
    if (currentUser && typeof updateProfileDisplay === 'function') {
        updateProfileDisplay(currentUser.email, isPro);
    }
}

// Handle upgrade button in dropdown - go to pricing page
document.getElementById('dropdown-upgrade-btn')?.addEventListener('click', () => {
    window.location.href = '/pricing';
});

// Render model tags - only show models with configured providers
function renderModelTags() {
    const container = document.getElementById('model-tags');
    if (!container) return;

    // Enable drag scrolling for mobile (only once)
    if (!container.dataset.dragEnabled) {
        enableDragScroll(container);
        container.dataset.dragEnabled = 'true';
    }

    container.innerHTML = '';

    // Filter to only show models with configured providers
    const visibleModels = availableModels.filter(model => configuredProviders.has(model.provider));

    if (visibleModels.length === 0) {
        // Show "no models" message
        const noModelsMsg = document.createElement('div');
        noModelsMsg.className = 'no-models-message';
        noModelsMsg.innerHTML = `
            <span style="color: var(--text-secondary); font-size: 0.9rem;">
                No models available. <a href="#" onclick="openSettingsModal(); return false;" style="color: var(--primary-color);">Add at least 2 API keys</a> to get started.
            </span>
        `;
        container.appendChild(noModelsMsg);
        return;
    }

    visibleModels.forEach((model) => {
        const originalIndex = availableModels.indexOf(model);
        const isSelected = selectedModels.some(m => m.model_id === model.id && m.provider === model.provider);

        const tag = document.createElement('span');
        tag.className = `model-tag ${isSelected ? 'selected' : ''}`;
        tag.dataset.modelIndex = originalIndex;
        tag.textContent = model.name;
        tag.title = model.provider_name;

        container.appendChild(tag);
    });

    // Remove any selected models that are no longer visible (provider key was deleted)
    // But only if we have models loaded (to avoid clearing during init)
    if (visibleModels.length > 0 && selectedModels.length > 0) {
        const visibleModelIds = new Set(visibleModels.map(m => `${m.provider}:${m.id}`));
        const filtered = selectedModels.filter(m => visibleModelIds.has(`${m.provider}:${m.model_id}`));
        if (filtered.length !== selectedModels.length) {
            selectedModels = filtered;
            saveSelectedModels();
        }
    }
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

    // Save selection to localStorage
    saveSelectedModels();

    renderModelTags();
    updateSendButton();
}

// Save selected models to localStorage
function saveSelectedModels() {
    localStorage.setItem('selectedModels', JSON.stringify(selectedModels));
}

// Load selected models from localStorage
function loadSelectedModels() {
    const saved = localStorage.getItem('selectedModels');
    if (saved) {
        try {
            const savedModels = JSON.parse(saved);
            // Only restore models that are still available and have configured API keys
            selectedModels = savedModels.filter(savedModel => {
                const modelExists = availableModels.some(m => m.id === savedModel.model_id && m.provider === savedModel.provider);
                const providerConfigured = configuredProviders.has(savedModel.provider);
                return modelExists && providerConfigured;
            });
            // Save back in case some were filtered out
            saveSelectedModels();
            renderModelTags();
            updateSendButton();
        } catch (e) {
            console.error('Error loading saved models:', e);
        }
    }
}

// Ensure selected models persist - call this after any model-related changes
function syncSelectedModels() {
    saveSelectedModels();
    renderModelTags();
    updateSendButton();
}

// Update send button state
function updateSendButton() {
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('chat-input');
    const hasText = input.value.trim();

    // During active discussion, only need text to intervene
    // Otherwise, need text and at least 2 models
    const isActive = typeof isProcessing !== 'undefined' && isProcessing;
    const canSend = hasText && (isActive || selectedModels.length >= 2);
    sendBtn.disabled = !canSend;
}

// Logout (both old button and new dropdown)
document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = '/';
});
document.getElementById('dropdown-logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = '/';
});

// Settings button (if it exists)
document.getElementById('settings-btn')?.addEventListener('click', () => {
    openSettingsModal();
});

// Help button - reopen tutorial
document.getElementById('help-btn')?.addEventListener('click', () => {
    showTutorial();
});

// Inline settings button
document.getElementById('settings-btn-inline')?.addEventListener('click', () => {
    openSettingsModal();
});

// Profile dropdown toggle
const profileBtn = document.getElementById('profile-btn');
const profileDropdown = document.getElementById('profile-dropdown');

if (profileBtn && profileDropdown) {
    profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('open');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!profileDropdown.contains(e.target) && !profileBtn.contains(e.target)) {
            profileDropdown.classList.remove('open');
        }
    });

    // Close dropdown when clicking an item
    profileDropdown.querySelectorAll('.profile-dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            profileDropdown.classList.remove('open');
        });
    });
}

// Update profile display
function updateProfileDisplay(email, isPro) {
    const initial = email ? email.charAt(0).toUpperCase() : 'U';

    // Update avatars
    const avatar = document.getElementById('profile-avatar');
    const avatarLarge = document.getElementById('profile-avatar-large');
    if (avatar) avatar.textContent = initial;
    if (avatarLarge) avatarLarge.textContent = initial;

    // Update inline name in sidebar profile button
    const profileNameInline = document.getElementById('profile-name-inline');
    if (profileNameInline) profileNameInline.textContent = email || 'Account';

    // Update email
    const profileEmail = document.getElementById('profile-email');
    if (profileEmail) profileEmail.textContent = email || 'User';

    // Update plan
    const profilePlan = document.getElementById('profile-plan');
    if (profilePlan) {
        if (isPro) {
            profilePlan.textContent = 'Pro Plan';
            profilePlan.classList.add('pro');
        } else {
            profilePlan.textContent = 'Free Plan';
            profilePlan.classList.remove('pro');
        }
    }

    // Show/hide upgrade button in dropdown
    const dropdownUpgrade = document.getElementById('dropdown-upgrade-btn');
    if (dropdownUpgrade) {
        dropdownUpgrade.style.display = isPro ? 'none' : 'flex';
    }
}

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
            // Check if we're in a discussion (intervention) or starting new
            if (typeof isProcessing !== 'undefined' && isProcessing && chatWebSocket && chatWebSocket.readyState === WebSocket.OPEN) {
                sendIntervention();
            } else if (!document.getElementById('send-btn').disabled) {
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

        // Restore previously selected models
        loadSelectedModels();

        // Load chat history (sidebar is always visible)
        if (typeof loadChatHistory === 'function') {
            loadChatHistory();
        }

        // Check for subscription success/cancel from URL
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('subscription') === 'success') {
            alert('Subscription activated! You now have unlimited sessions.');
            window.history.replaceState({}, '', '/app');
            loadSubscriptionStatus();
        }

        // Check if we should open setup wizard (from settings page)
        if (urlParams.get('openSetup') === 'true') {
            window.history.replaceState({}, '', '/app');
            // Small delay to ensure DOM is fully ready
            setTimeout(() => showTutorial(), 100);
            return;
        }

        // Show tutorial for new users
        checkShowTutorial();
    }
})();

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Setup Wizard functionality
let tutorialStep = 1;
const totalSteps = 2;
let setupComplete = false;
let currentSetupProvider = 'google'; // Track which provider is being set up

function showTutorial() {
    const modal = document.getElementById('tutorial-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
        tutorialStep = 1;

        // Reset provider selection - no provider selected initially
        currentSetupProvider = null;

        // Hide provider details section initially
        const detailsSection = document.getElementById('provider-details-section');
        if (detailsSection) {
            detailsSection.style.display = 'none';
        }

        // Collapse modal to initial size
        const modalInner = document.getElementById('setup-modal-inner');
        if (modalInner) {
            modalInner.classList.remove('expanded');
        }

        // Remove active class from all provider bubbles
        document.querySelectorAll('.provider-bubble').forEach(b => b.classList.remove('active'));

        updateTutorialStep();
        updateSetupUI();
    }
}

function hideTutorial() {
    const modal = document.getElementById('tutorial-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
        localStorage.setItem('tutorialCompleted', 'true');
        setupComplete = true;
        updateSetupUI();
    }
}

// Check if setup requirements are met (2+ models selected)
function isSetupComplete() {
    return selectedModels.length >= 2;
}

// Update UI based on setup state
function updateSetupUI() {
    const appOverlay = document.getElementById('app-setup-overlay');
    const nextBtn = document.getElementById('tutorial-next');

    const hasEnoughModels = selectedModels.length >= 2;

    // Show/hide overlay on main app
    if (appOverlay) {
        appOverlay.style.display = hasEnoughModels || setupComplete ? 'none' : 'block';
    }

    // Update next button based on current step
    if (nextBtn && tutorialStep === 1) {
        nextBtn.disabled = !hasEnoughModels;
        if (!hasEnoughModels) {
            nextBtn.textContent = 'Select 2+ Models';
        } else {
            nextBtn.textContent = 'Next';
        }
    }

    // Update provider bubbles to show connected state
    updateProviderBubbles();

    // Also refresh model selection when providers change
    if (tutorialStep === 1) {
        populateSetupModels();
    }
}

function updateTutorialStep() {
    // Hide all steps
    document.querySelectorAll('.tutorial-step').forEach(step => {
        step.style.display = 'none';
    });

    // Show current step
    const currentStep = document.querySelector(`.tutorial-step[data-step="${tutorialStep}"]`);
    if (currentStep) {
        currentStep.style.display = 'block';
    }

    // Update dots
    document.querySelectorAll('.tutorial-dot').forEach(dot => {
        dot.classList.remove('active');
        if (parseInt(dot.dataset.step) === tutorialStep) {
            dot.classList.add('active');
        }
    });

    // Update buttons
    const prevBtn = document.getElementById('tutorial-prev');
    const nextBtn = document.getElementById('tutorial-next');

    if (prevBtn) {
        prevBtn.style.visibility = tutorialStep === 1 ? 'hidden' : 'visible';
    }

    if (nextBtn) {
        if (tutorialStep === 1) {
            // Model selection step - need 2+ models
            const hasEnoughModels = selectedModels.length >= 2;
            nextBtn.disabled = !hasEnoughModels;
            if (!hasEnoughModels) {
                nextBtn.textContent = 'Select 2+ Models';
            } else {
                nextBtn.textContent = 'Next';
            }
        } else if (tutorialStep === totalSteps) {
            // Final step
            nextBtn.disabled = false;
            nextBtn.textContent = "Start Chatting";
        } else {
            nextBtn.disabled = false;
            nextBtn.textContent = 'Next';
        }
    }

    // Update title
    const titles = {
        1: "Setup",
        2: "Ready to Go!"
    };
    const titleEl = document.getElementById('tutorial-title');
    if (titleEl) {
        titleEl.textContent = titles[tutorialStep] || '';
    }

    // Setup API key + models step
    if (tutorialStep === 1) {
        setupApiKeyStep();
        populateSetupModels();
    }

    // Update connected count on last step
    if (tutorialStep === 2) {
        updateSetupConnectedCount();
    }

    // Update setup UI state
    updateSetupUI();
}

// Update the connected providers count in setup wizard
async function updateSetupConnectedCount() {
    const countEl = document.getElementById('setup-connected-count');
    const count = configuredProviders.size;

    // Update final step status
    if (countEl) {
        if (count >= 2) {
            countEl.style.background = '#f0fdf4';
            countEl.style.color = '#166534';
            countEl.textContent = `${count} providers connected! You're ready to start.`;
        }
    }
}

// Setup the API key step (step 1)
function setupApiKeyStep() {
    const input = document.getElementById('setup-key-input');
    const saveBtn = document.getElementById('setup-save-btn');
    const getKeyBtn = document.getElementById('setup-get-key-btn');
    const statusEl = document.getElementById('setup-status');
    const detailsSection = document.getElementById('provider-details-section');

    // Always set up provider bubble clicks first
    document.querySelectorAll('.provider-bubble').forEach(bubble => {
        bubble.onclick = () => {
            currentSetupProvider = bubble.dataset.provider;
            document.querySelectorAll('.provider-bubble').forEach(b => b.classList.remove('active'));
            bubble.classList.add('active');
            setupApiKeyStep(); // Refresh the UI for new provider
        };
    });

    // Update bubbles
    updateProviderBubbles();

    // Get the modal element for expansion
    const modalInner = document.getElementById('setup-modal-inner');

    // If no provider selected, hide details and collapse modal
    if (!currentSetupProvider) {
        if (detailsSection) {
            detailsSection.style.display = 'none';
        }
        if (modalInner) {
            modalInner.classList.remove('expanded');
        }
        return;
    }

    // Show details section and expand modal when a provider is selected
    if (detailsSection) {
        detailsSection.style.display = 'block';
    }
    if (modalInner) {
        modalInner.classList.add('expanded');
    }

    // Update model selection for current provider
    populateSetupModels();

    // Check if current provider is already configured
    const isConfigured = configuredProviders.has(currentSetupProvider);

    if (isConfigured) {
        input.value = '';
        input.placeholder = 'Key saved securely — paste new key to replace';
        input.disabled = false;
        getKeyBtn.style.display = 'none';
        saveBtn.style.display = 'block';
        saveBtn.textContent = 'Connected ✓';
        saveBtn.disabled = true;
        saveBtn.classList.remove('btn-primary');
        saveBtn.classList.add('btn-secondary');
        statusEl.innerHTML = '<span style="color: #22c55e;">Connected</span> - <a href="#" onclick="deleteCurrentProviderKey(); return false;" style="color: var(--text-secondary);">Delete key</a>';
    } else {
        input.value = '';
        input.disabled = false;
        getKeyBtn.style.display = 'block';
        saveBtn.style.display = 'none';
        statusEl.textContent = '';
    }

    // Update Get Key button text and URL
    const bubble = document.querySelector(`.provider-bubble[data-provider="${currentSetupProvider}"]`);
    if (bubble) {
        getKeyBtn.href = bubble.dataset.url;
        getKeyBtn.textContent = `Get ${bubble.dataset.name} API Key`;
    }

    // Input listener - show/hide buttons based on input
    input.oninput = () => {
        const hasValue = input.value.trim().length > 0;
        if (hasValue) {
            getKeyBtn.style.display = 'none';
            saveBtn.style.display = 'block';
            saveBtn.textContent = 'Save & Test';
            saveBtn.disabled = false;
            saveBtn.classList.remove('btn-secondary');
            saveBtn.classList.add('btn-primary');
            statusEl.textContent = '';
        } else if (!configuredProviders.has(currentSetupProvider)) {
            getKeyBtn.style.display = 'block';
            saveBtn.style.display = 'none';
        } else {
            // Provider is configured but input is empty - show connected state
            saveBtn.style.display = 'block';
            saveBtn.textContent = 'Connected ✓';
            saveBtn.disabled = true;
            saveBtn.classList.remove('btn-primary');
            saveBtn.classList.add('btn-secondary');
            statusEl.innerHTML = '<span style="color: #22c55e;">Connected</span> - <a href="#" onclick="deleteCurrentProviderKey(); return false;" style="color: var(--text-secondary);">Delete key</a>';
        }
    };

    // Save button click
    saveBtn.onclick = async () => {
        const apiKey = input.value.trim();
        if (!apiKey || apiKey.startsWith('••')) return;

        saveBtn.disabled = true;
        saveBtn.textContent = 'Testing...';
        statusEl.innerHTML = '<span style="color: var(--text-secondary);">Saving and testing...</span>';

        try {
            // Save the key
            const saveResponse = await fetch(`${API_BASE}/api/keys/${currentSetupProvider}`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ api_key: apiKey })
            });

            if (!saveResponse.ok) throw new Error('Failed to save key');

            // Test the key
            const testResponse = await fetch(`${API_BASE}/api/keys/${currentSetupProvider}/test`, {
                method: 'POST',
                headers: getAuthHeaders()
            });

            const testData = await testResponse.json();

            if (testData.valid) {
                statusEl.innerHTML = '<span style="color: #22c55e;">Connected successfully!</span>';
                input.value = '••••••••••••••••';
                input.disabled = true;
                saveBtn.textContent = 'Connected ✓';
                saveBtn.disabled = true;
                saveBtn.classList.remove('btn-primary');
                saveBtn.classList.add('btn-secondary');

                // Refresh and update UI
                await loadConfiguredProviders();
                updateSetupConnectedCount();
                updateProviderBubbles();
                updateSetupUI();
                updateTutorialStep();
            } else {
                // Delete invalid key
                await fetch(`${API_BASE}/api/keys/${currentSetupProvider}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders()
                });

                const errorInfo = labelError(testData.error || 'Invalid API key');
                statusEl.innerHTML = `<span style="color: #dc2626;">${errorInfo.label}</span>${errorInfo.help ? `<br><span style="font-size: 0.8rem; color: var(--text-secondary);">${errorInfo.help}</span>` : ''}`;
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save & Test';
            }
        } catch (error) {
            statusEl.innerHTML = '<span style="color: #dc2626;">Connection failed. Check your internet.</span>';
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save & Test';
        }
    };
}

// Delete current provider's API key
async function deleteCurrentProviderKey() {
    if (!confirm(`Delete the ${currentSetupProvider} API key?`)) return;

    try {
        await fetch(`${API_BASE}/api/keys/${currentSetupProvider}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        await loadConfiguredProviders();
        setupApiKeyStep();
        updateSetupConnectedCount();
        updateProviderBubbles();
        updateSetupUI();
        updateTutorialStep();
    } catch (error) {
        console.error('Error deleting key:', error);
    }
}

// Update provider bubbles to show connected state
function updateProviderBubbles() {
    document.querySelectorAll('.provider-bubble').forEach(bubble => {
        const provider = bubble.dataset.provider;
        if (configuredProviders.has(provider)) {
            bubble.classList.add('connected');
        } else {
            bubble.classList.remove('connected');
        }
    });
}

// Setup tutorial event listeners
function setupTutorialListeners() {
    const nextBtn = document.getElementById('tutorial-next');
    const prevBtn = document.getElementById('tutorial-prev');

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (tutorialStep < totalSteps) {
                tutorialStep++;
                updateTutorialStep();
            } else {
                hideTutorial();
            }
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (tutorialStep > 1) {
                tutorialStep--;
                updateTutorialStep();
            }
        });
    }

    document.querySelectorAll('.tutorial-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            tutorialStep = parseInt(dot.dataset.step);
            updateTutorialStep();
        });
    });
}

// Check if should show setup wizard
function checkShowTutorial() {
    // Setup listeners first
    setupTutorialListeners();

    const completed = localStorage.getItem('tutorialCompleted');
    const hasEnoughModels = isSetupComplete();

    // Show setup wizard if:
    // 1. Tutorial was never completed, OR
    // 2. User doesn't have at least 2 models selected
    if (!completed || !hasEnoughModels) {
        setupComplete = false;
        showTutorial();
    } else {
        setupComplete = true;
        updateSetupUI();
    }
}

// Enable mouse drag scrolling for a container
function enableDragScroll(container) {
    let isDown = false;
    let startX;
    let scrollLeft;

    container.addEventListener('mousedown', (e) => {
        // Don't start drag if clicking on interactive items
        if (e.target.classList.contains('setup-model-item') || e.target.classList.contains('model-tag')) return;
        isDown = true;
        container.classList.add('dragging');
        startX = e.pageX - container.offsetLeft;
        scrollLeft = container.scrollLeft;
    });

    container.addEventListener('mouseleave', () => {
        isDown = false;
        container.classList.remove('dragging');
    });

    container.addEventListener('mouseup', () => {
        isDown = false;
        container.classList.remove('dragging');
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const walk = (x - startX) * 2;
        container.scrollLeft = scrollLeft - walk;
    });
}

// Populate model selection in setup wizard - shows ONLY models for current provider
function populateSetupModels() {
    const container = document.getElementById('setup-model-scroll');
    if (!container) {
        console.error('Setup model scroll container not found');
        return;
    }

    // Enable drag scrolling (only once)
    if (!container.dataset.dragEnabled) {
        enableDragScroll(container);
        container.dataset.dragEnabled = 'true';
    }

    container.innerHTML = '';

    // If no provider selected, show nothing
    if (!currentSetupProvider) {
        updateSetupModelCount();
        return;
    }

    const isCurrentProviderConfigured = configuredProviders.has(currentSetupProvider);

    // Get models ONLY for current provider
    const currentProviderModels = availableModels.filter(model => model.provider === currentSetupProvider);

    // Show current provider models (greyed out if not configured)
    currentProviderModels.forEach((model) => {
        const isSelected = selectedModels.some(m => m.model_id === model.id && m.provider === model.provider);
        const isDisabled = !isCurrentProviderConfigured;

        const item = document.createElement('span');
        item.className = `setup-model-item ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`;
        item.dataset.provider = model.provider;
        item.dataset.modelId = model.id;
        item.textContent = model.name;
        item.title = isDisabled ? 'Add API key first' : model.provider_name;

        if (!isDisabled) {
            item.addEventListener('click', () => {
                toggleSetupModel(model, item);
            });
        }

        container.appendChild(item);
    });

    updateSetupModelCount();
}

// Toggle model selection in setup wizard
function toggleSetupModel(model, element) {
    const index = selectedModels.findIndex(m => m.model_id === model.id && m.provider === model.provider);

    if (index >= 0) {
        selectedModels.splice(index, 1);
        element.classList.remove('selected');
    } else if (selectedModels.length < 6) {
        selectedModels.push({
            provider: model.provider,
            model_id: model.id,
            model_name: model.name,
            role: ''
        });
        element.classList.add('selected');
    }

    saveSelectedModels();
    updateSetupModelCount();
    updateTutorialStep(); // Update button state
    renderModelTags(); // Keep main UI in sync
}

// Update model count display in setup wizard
function updateSetupModelCount() {
    const countEl = document.getElementById('setup-model-count');
    if (!countEl) return;

    // Show total selected across all providers
    const count = selectedModels.length;

    if (count < 2) {
        countEl.style.color = 'var(--text-secondary)';
        countEl.textContent = `Select at least 2 models to continue`;
    } else {
        countEl.style.color = '#22c55e';
        countEl.textContent = `${count} models selected ✓`;
    }
}

// Allow manually showing tutorial (for testing or help)
window.showTutorial = showTutorial;
