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

// Open settings modal (Memory only)
function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    modal.classList.add('active');
    loadMemoryFacts();
}

// Close settings modal
function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    modal.classList.remove('active');
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


// ============== MEMORY ==============

// Load memory facts
async function loadMemoryFacts() {
    const list = document.getElementById('memory-list');
    const clearBtn = document.getElementById('clear-all-memory-btn');

    list.innerHTML = '<div class="memory-loading">Loading...</div>';
    clearBtn.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/api/memory`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to load memory');

        const facts = await response.json();

        if (facts.length === 0) {
            list.innerHTML = `
                <div class="memory-empty">
                    <p>No memories yet</p>
                    <p style="font-size: 0.85rem; margin-top: 8px;">
                        Share information about yourself in conversations, and the AI will remember it for next time.
                    </p>
                </div>
            `;
            return;
        }

        // Show clear all button if there are facts
        clearBtn.style.display = 'block';

        // Group facts by type for display
        list.innerHTML = facts.map(fact => {
            const typeLabel = {
                'name': 'Your Name',
                'preference': 'Preference',
                'interest': 'Interest'
            }[fact.fact_type] || fact.fact_type;

            const keyLabel = fact.fact_key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

            return `
                <div class="memory-item" data-fact-id="${fact.id}">
                    <div class="memory-item-content">
                        <div class="memory-item-type">${typeLabel}</div>
                        <div class="memory-item-value">
                            <span class="memory-item-key">${keyLabel}:</span> ${fact.fact_value}
                        </div>
                    </div>
                    <button class="memory-item-delete" onclick="deleteMemoryFact(${fact.id})" title="Delete this fact">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading memory:', error);
        list.innerHTML = '<div class="memory-empty">Failed to load memory</div>';
    }
}

// Delete a single memory fact
async function deleteMemoryFact(factId) {
    if (!confirm('Delete this memory fact?')) return;

    try {
        const response = await fetch(`${API_BASE}/api/memory/${factId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to delete fact');

        // Remove from UI
        const item = document.querySelector(`[data-fact-id="${factId}"]`);
        if (item) {
            item.remove();
        }

        // Check if list is now empty
        const remaining = document.querySelectorAll('.memory-item');
        if (remaining.length === 0) {
            loadMemoryFacts(); // Reload to show empty state
        }
    } catch (error) {
        console.error('Error deleting memory fact:', error);
        alert('Failed to delete memory fact');
    }
}

// Clear all memory
document.getElementById('clear-all-memory-btn')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all AI memory about you? This cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/memory`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('Failed to clear memory');

        // Reload to show empty state
        loadMemoryFacts();
    } catch (error) {
        console.error('Error clearing memory:', error);
        alert('Failed to clear memory');
    }
});
