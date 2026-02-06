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

// Render model tags - only show models with configured providers
function renderModelTags() {
    const container = document.getElementById('model-tags');
    if (!container) return;

    container.innerHTML = '';

    // Filter to only show models with configured providers
    const visibleModels = availableModels.filter(model => configuredProviders.has(model.provider));

    if (visibleModels.length === 0) {
        // Show "no models" message
        const noModelsMsg = document.createElement('div');
        noModelsMsg.className = 'no-models-message';
        noModelsMsg.innerHTML = `
            <span style="color: var(--text-secondary); font-size: 0.9rem;">
                No models available. <a href="#" onclick="openSettingsModal(); return false;" style="color: var(--primary-color);">Add an API key</a> to get started.
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
    const visibleModelIds = new Set(visibleModels.map(m => `${m.provider}:${m.id}`));
    selectedModels = selectedModels.filter(m => visibleModelIds.has(`${m.provider}:${m.model_id}`));
    saveSelectedModels();
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
            renderModelTags();
            updateSendButton();
        } catch (e) {
            console.error('Error loading saved models:', e);
        }
    }
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

// Help button - reopen tutorial
document.getElementById('help-btn')?.addEventListener('click', () => {
    showTutorial();
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

        // Restore previously selected models
        loadSelectedModels();

        // Check for subscription success/cancel from URL
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('subscription') === 'success') {
            alert('Subscription activated! You now have unlimited sessions.');
            window.history.replaceState({}, '', '/app');
            loadSubscriptionStatus();
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

// Mobile AI panel toggle
const mobileAiToggle = document.getElementById('mobile-ai-toggle');
const panelOverlay = document.getElementById('panel-overlay');
const aiPanel = document.getElementById('ai-panel');

if (mobileAiToggle && panelOverlay && aiPanel) {
    mobileAiToggle.addEventListener('click', () => {
        // Toggle panel open/closed
        const isOpen = aiPanel.classList.contains('open');
        if (isOpen) {
            aiPanel.classList.remove('open');
            panelOverlay.classList.remove('active');
        } else {
            aiPanel.classList.add('open');
            panelOverlay.classList.add('active');
        }
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

// Setup Wizard functionality
let tutorialStep = 1;
const totalSteps = 4;
let setupComplete = false;

function showTutorial() {
    const modal = document.getElementById('tutorial-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
        tutorialStep = 1;
        updateTutorialStep();
        setupWizardListeners();
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

// Check if setup requirements are met (2+ providers)
function isSetupComplete() {
    return configuredProviders.size >= 2;
}

// Update UI based on setup state
function updateSetupUI() {
    const appOverlay = document.getElementById('app-setup-overlay');
    const skipBtn = document.getElementById('tutorial-skip');
    const nextBtn = document.getElementById('tutorial-next');

    const hasEnoughProviders = isSetupComplete();

    // Show/hide overlay on main app
    if (appOverlay) {
        appOverlay.style.display = hasEnoughProviders || setupComplete ? 'none' : 'block';
    }

    // Enable/disable skip button based on provider count
    if (skipBtn) {
        if (hasEnoughProviders) {
            skipBtn.style.display = 'block';
            skipBtn.title = 'Close setup';
        } else {
            skipBtn.style.display = 'none';
        }
    }

    // Update next button on final step
    if (nextBtn && tutorialStep === totalSteps) {
        nextBtn.disabled = !hasEnoughProviders;
        nextBtn.textContent = hasEnoughProviders ? "Start Chatting" : "Add 2 API Keys to Continue";
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
        if (tutorialStep === totalSteps) {
            const hasEnough = isSetupComplete();
            nextBtn.disabled = !hasEnough;
            nextBtn.textContent = hasEnough ? "Start Chatting" : "Add 2 API Keys to Continue";
        } else {
            nextBtn.disabled = false;
            nextBtn.textContent = 'Next';
        }
    }

    // Update title
    const titles = {
        1: "Quick Start Setup",
        2: "Add Your API Keys",
        3: "Troubleshooting",
        4: "Ready to Go!"
    };
    const titleEl = document.getElementById('tutorial-title');
    if (titleEl) {
        titleEl.textContent = titles[tutorialStep] || '';
    }

    // Update connected count on last step
    if (tutorialStep === 4) {
        updateSetupConnectedCount();
    }

    // Update setup UI state
    updateSetupUI();
}

// Update the connected providers count in setup wizard
async function updateSetupConnectedCount() {
    const countEl = document.getElementById('setup-connected-count');
    const progressEl = document.getElementById('setup-key-progress');
    const count = configuredProviders.size;

    // Update step 2 progress
    if (progressEl) {
        if (count >= 2) {
            progressEl.textContent = `${count} keys added - you're all set!`;
            progressEl.style.color = '#22c55e';
        } else {
            progressEl.textContent = `${count} of 2 required keys added`;
            progressEl.style.color = 'var(--text-secondary)';
        }
    }

    // Update step 4 final status
    if (countEl) {
        if (count === 0) {
            countEl.style.background = '#fef2f2';
            countEl.style.color = '#dc2626';
            countEl.textContent = 'No providers connected yet. Go back to add at least 2 API keys.';
        } else if (count === 1) {
            countEl.style.background = '#fef3c7';
            countEl.style.color = '#d97706';
            countEl.textContent = '1 provider connected. Add 1 more to enable AI discussions.';
        } else {
            countEl.style.background = '#f0fdf4';
            countEl.style.color = '#166534';
            countEl.textContent = `${count} providers connected! You're ready to start.`;
        }
    }
}

// Setup wizard API key save & test functionality
function setupWizardListeners() {
    // Update progress indicator on wizard open
    updateSetupConnectedCount();

    document.querySelectorAll('.setup-provider').forEach(providerEl => {
        const provider = providerEl.dataset.provider;
        const input = providerEl.querySelector('.setup-key-input');
        const saveBtn = providerEl.querySelector('.setup-save-btn');
        const statusEl = providerEl.querySelector('.setup-status');

        // Remove old listeners by cloning
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

        newSaveBtn.addEventListener('click', async () => {
            const apiKey = input.value.trim();
            if (!apiKey) {
                statusEl.className = 'setup-status error';
                statusEl.textContent = 'Please enter an API key';
                return;
            }

            // Show testing state
            newSaveBtn.disabled = true;
            newSaveBtn.textContent = 'Testing...';
            statusEl.className = 'setup-status testing';
            statusEl.textContent = 'Saving and testing connection...';

            try {
                // Save the key
                const saveResponse = await fetch(`${API_BASE}/api/keys/${provider}`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ api_key: apiKey })
                });

                if (!saveResponse.ok) {
                    throw new Error('Failed to save key');
                }

                // Test the key
                const testResponse = await fetch(`${API_BASE}/api/keys/${provider}/test`, {
                    method: 'POST',
                    headers: getAuthHeaders()
                });

                const testData = await testResponse.json();

                if (testData.valid) {
                    statusEl.className = 'setup-status success';
                    statusEl.textContent = 'Connected successfully!';
                    input.value = '••••••••••••••••';
                    input.disabled = true;
                    newSaveBtn.textContent = 'Connected';
                    newSaveBtn.disabled = true;
                    newSaveBtn.classList.remove('btn-primary');
                    newSaveBtn.classList.add('btn-secondary');

                    // Refresh configured providers and models
                    await loadConfiguredProviders();

                    // Update setup wizard UI (enable finish button if 2+ providers)
                    updateSetupConnectedCount();
                    updateSetupUI();
                    updateTutorialStep();
                } else {
                    // Delete the invalid key
                    await fetch(`${API_BASE}/api/keys/${provider}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders()
                    });

                    statusEl.className = 'setup-status error';
                    statusEl.textContent = testData.error || 'Invalid API key. Please check and try again.';
                    newSaveBtn.disabled = false;
                    newSaveBtn.textContent = 'Save & Test';
                }
            } catch (error) {
                statusEl.className = 'setup-status error';
                statusEl.textContent = 'Connection failed. Check your internet and try again.';
                newSaveBtn.disabled = false;
                newSaveBtn.textContent = 'Save & Test';
            }
        });
    });
}

// Setup tutorial event listeners
function setupTutorialListeners() {
    const nextBtn = document.getElementById('tutorial-next');
    const prevBtn = document.getElementById('tutorial-prev');
    const skipBtn = document.getElementById('tutorial-skip');

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

    if (skipBtn) {
        skipBtn.addEventListener('click', hideTutorial);
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
    const hasEnoughProviders = isSetupComplete();

    // Show setup wizard if:
    // 1. Tutorial was never completed, OR
    // 2. User doesn't have at least 2 API keys configured
    if (!completed || !hasEnoughProviders) {
        setupComplete = false;
        showTutorial();
    } else {
        setupComplete = true;
        updateSetupUI();
    }
}

// Allow manually showing tutorial (for testing or help)
window.showTutorial = showTutorial;
