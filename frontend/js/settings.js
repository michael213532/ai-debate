/**
 * Settings modal and API key management
 */

const PROVIDER_INFO = {
    openai: {
        name: 'OpenAI',
        description: 'GPT-5, GPT-4o, o1 models',
        keyUrl: 'https://platform.openai.com/api-keys',
        keyHelp: 'Create account → API Keys → Create new key'
    },
    anthropic: {
        name: 'Anthropic',
        description: 'Claude Sonnet, Claude Opus models',
        keyUrl: 'https://console.anthropic.com/settings/keys',
        keyHelp: 'Create account → API Keys → Create Key'
    },
    google: {
        name: 'Google',
        description: 'Gemini Pro models (Free tier available)',
        keyUrl: 'https://aistudio.google.com/app/apikey',
        keyHelp: 'Sign in with Google → Create API Key'
    },
    deepseek: {
        name: 'Deepseek',
        description: 'Deepseek Chat (Very affordable)',
        keyUrl: 'https://platform.deepseek.com/api_keys',
        keyHelp: 'Create account → API Keys → Create'
    },
    xai: {
        name: 'xAI',
        description: 'Grok models',
        keyUrl: 'https://console.x.ai',
        keyHelp: 'Create account → API Keys → Create'
    }
};

// Keep old format for backwards compatibility
const PROVIDER_NAMES = Object.fromEntries(
    Object.entries(PROVIDER_INFO).map(([k, v]) => [k, v.name])
);

// Open settings modal
function openSettingsModal() {
    // Close any open dropdowns first
    document.querySelectorAll('.mobile-profile-dropdown.open').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.profile-dropdown.open').forEach(d => d.classList.remove('open'));

    const modal = document.getElementById('settings-modal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    loadRoleAssignments();
}

// Close settings modal
function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// Modal done button
document.getElementById('settings-done-btn').addEventListener('click', closeSettingsModal);

// Close on overlay click
document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        closeSettingsModal();
    }
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSettingsModal();
    }
});

// Load provider settings
async function loadProviderSettings() {
    try {
        const response = await fetch(`${API_BASE}/api/keys`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to load settings');

        const providers = await response.json();
        renderProviderList(providers);
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Render provider list
function renderProviderList(providers) {
    const list = document.getElementById('provider-list');

    list.innerHTML = providers.map(provider => {
        const info = PROVIDER_INFO[provider.provider] || { name: provider.provider, description: '', keyUrl: '#', keyHelp: '' };
        return `
        <div class="provider-item" data-provider="${provider.provider}">
            <div class="provider-header">
                <div>
                    <span class="provider-name">${info.name}</span>
                    <div class="provider-description">${info.description}</div>
                </div>
                <span class="provider-status ${provider.configured ? 'configured' : 'not-configured'}">
                    ${provider.configured ? '✓ Connected' : 'Not connected'}
                </span>
            </div>
            <div class="provider-help">
                <a href="${info.keyUrl}" target="_blank" class="get-key-btn">Get Key →</a>
                <span class="key-help-text">${info.keyHelp}</span>
            </div>
            <div class="provider-actions">
                <input type="text" class="form-input api-key-input" placeholder="${provider.configured ? 'Key saved - paste new key to replace' : 'Paste your API key here...'}"
                       value="">
                <button class="btn btn-primary btn-small save-key-btn">Save</button>
                ${provider.configured ? `
                    <button class="btn btn-secondary btn-small test-key-btn">Test</button>
                    <button class="btn btn-danger btn-small delete-key-btn">Delete</button>
                ` : ''}
            </div>
        </div>
    `}).join('');

    // Add event listeners
    list.querySelectorAll('.provider-item').forEach(item => {
        const provider = item.dataset.provider;
        const input = item.querySelector('.api-key-input');
        const saveBtn = item.querySelector('.save-key-btn');
        const testBtn = item.querySelector('.test-key-btn');
        const deleteBtn = item.querySelector('.delete-key-btn');

        // Save key
        saveBtn.addEventListener('click', () => saveApiKey(provider, input.value));

        // Test key
        if (testBtn) {
            testBtn.addEventListener('click', () => testApiKey(provider, testBtn));
        }

        // Delete key
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => deleteApiKey(provider));
        }
    });
}

// Save API key
async function saveApiKey(provider, apiKey) {
    if (!apiKey || !apiKey.trim()) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/keys/${provider}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ api_key: apiKey })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to save API key');
        }

        // Reload settings and models
        await loadProviderSettings();
        await loadConfiguredProviders();

        // Update setup UI in case this affects the 2-key requirement
        if (typeof updateSetupUI === 'function') {
            updateSetupUI();
        }

        // Show success feedback
        const item = document.querySelector(`[data-provider="${provider}"]`);
        const status = item.querySelector('.provider-status');
        status.className = 'provider-status configured';
        status.textContent = 'Saved!';
        setTimeout(() => {
            status.textContent = 'Configured';
        }, 2000);
    } catch (error) {
        console.error('Error saving API key:', error);
        alert('Failed to save API key: ' + error.message);
    }
}

// Test API key
async function testApiKey(provider, button) {
    const originalText = button.textContent;
    button.textContent = 'Testing...';
    button.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/keys/${provider}/test`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (data.valid) {
            button.textContent = 'Valid!';
            button.classList.remove('btn-secondary');
            button.classList.add('btn-primary');
        } else {
            button.textContent = 'Invalid';
            button.classList.remove('btn-secondary');
            button.classList.add('btn-danger');
        }

        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('btn-primary', 'btn-danger');
            button.classList.add('btn-secondary');
            button.disabled = false;
        }, 2000);
    } catch (error) {
        console.error('Error testing API key:', error);
        button.textContent = 'Error';
        setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
        }, 2000);
    }
}

// Delete API key
async function deleteApiKey(provider) {
    if (!confirm(`Are you sure you want to delete the ${PROVIDER_NAMES[provider]} API key?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/keys/${provider}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to delete API key');

        // Reload settings and models
        await loadProviderSettings();
        await loadConfiguredProviders();

        // Update setup UI state
        if (typeof updateSetupUI === 'function') {
            updateSetupUI();
        }
    } catch (error) {
        console.error('Error deleting API key:', error);
        alert('Failed to delete API key');
    }
}


// ============== ROLE ASSIGNMENTS ==============

// Load and render role assignments
function loadRoleAssignments() {
    const container = document.getElementById('role-assignments');
    if (!container) return;

    // Get all personalities (from global loaded in app.js)
    const personalities = window.allPersonalities || [];
    if (personalities.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">Loading personalities...</p>';
        return;
    }

    // Get configured models (from global in app.js)
    const models = (window.availableModels || []).filter(m =>
        window.configuredProviders && window.configuredProviders.has(m.provider)
    );

    // Get saved role assignments
    const savedRoles = getRoleAssignments();

    container.innerHTML = personalities.map(p => {
        const savedModelId = savedRoles[p.id];
        return `
            <div class="role-assignment-card" data-role="${p.id}">
                <div class="role-emoji">${['expert', 'optimist', 'analyst', 'skeptic', 'realist'].includes(p.id) ? `<img src="/bee-${p.id}.png" alt="" style="width: 50px; height: 50px; image-rendering: -webkit-optimize-contrast;">` : p.emoji}</div>
                <div class="role-info">
                    <div class="role-name">${p.name}</div>
                    <div class="role-description">${p.description}</div>
                </div>
                <select class="role-model-select" data-role="${p.id}">
                    <option value="">Auto-assign</option>
                    ${models.map(m => `
                        <option value="${m.provider}:${m.id}" ${savedModelId === `${m.provider}:${m.id}` ? 'selected' : ''}>
                            ${m.name}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;
    }).join('');

    // Add change listeners to save immediately
    container.querySelectorAll('.role-model-select').forEach(select => {
        select.addEventListener('change', () => {
            saveRoleAssignment(select.dataset.role, select.value);
        });
    });
}

// Get role assignments from localStorage
function getRoleAssignments() {
    try {
        const saved = localStorage.getItem('roleAssignments');
        return saved ? JSON.parse(saved) : {};
    } catch {
        return {};
    }
}

// Save a single role assignment
function saveRoleAssignment(roleId, modelKey) {
    const assignments = getRoleAssignments();
    if (modelKey) {
        assignments[roleId] = modelKey;
    } else {
        delete assignments[roleId];
    }
    localStorage.setItem('roleAssignments', JSON.stringify(assignments));
}

// Reset all role assignments
document.getElementById('reset-roles-btn')?.addEventListener('click', () => {
    if (confirm('Reset all role assignments to auto-assign?')) {
        localStorage.removeItem('roleAssignments');
        loadRoleAssignments();
    }
});

// Get the model for a specific personality (used by startDebateWithPersonalities)
function getModelForPersonality(personalityId, fallbackModels) {
    const assignments = getRoleAssignments();
    const savedModelKey = assignments[personalityId];

    if (savedModelKey) {
        const [provider, ...idParts] = savedModelKey.split(':');
        const modelId = idParts.join(':');
        const model = (window.availableModels || []).find(m =>
            m.provider === provider && m.id === modelId
        );
        if (model && window.configuredProviders && window.configuredProviders.has(model.provider)) {
            return model;
        }
    }

    // Fallback: return first available model not already used
    return fallbackModels.length > 0 ? fallbackModels[0] : null;
}

// Make functions globally available
window.getRoleAssignments = getRoleAssignments;
window.getModelForPersonality = getModelForPersonality;
window.loadRoleAssignments = loadRoleAssignments;
