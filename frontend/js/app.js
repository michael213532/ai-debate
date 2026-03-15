/**
 * Main application logic
 */

// Bee icon mapping - personality IDs to icon filenames in /images/bee-icons/
const PERSONALITY_ICON_MAP = {
    // Chaos Hive
    'chaos-optimist': 'optimist bee icon', 'chaos-pessimist': 'pessimist bee icon',
    'chaos-realist': 'Realist bee icon', 'chaos-contrarian': 'contrarion bee icon',
    'chaos-cynic': 'cynic bee icon',
    // Friend Group Hive
    'friend-bestie': 'bestie bee icon', 'friend-honest': 'honest friend bee icon',
    'friend-funny': 'funny friend bee icon', 'friend-wise': 'wise friend bee icon',
    'friend-practical': 'practical friend bee icon',
    // Billionaire Hive
    'billionaire-builder': 'builder bee icon', 'billionaire-investor': 'investor bee icon',
    'billionaire-strategist': 'stratagist bee icon', 'billionaire-disruptor': 'disrupter bee icon',
    'billionaire-visionary': 'optimist bee icon',
    // Internet Hive
    'internet-redditor': 'redditor bee icon', 'internet-influencer': 'Influencer bee icon',
    'internet-coder': 'coder bee icon', 'internet-gamer': 'gamer bee icon',
    'internet-troll': 'troll bee icon',
    // Generations Hive
    'gen-z': 'gen z bee icon', 'gen-millennial': 'millenial bee icon',
    'gen-x': 'gen x bee icon', 'gen-boomer': 'boomer bee icon',
    'gen-future': 'future kid bee icon',
    // Courtroom Hive
    'court-judge': 'Judge bee icon', 'court-prosecutor': 'prosecuter bee icon',
    'court-defense': 'honest friend bee icon', 'court-witness': 'Realist bee icon',
    'court-jury': 'wise friend bee icon',
    // Special Bees
    'special-devils-advocate': 'devils advocate bee icon', 'special-wild-card': 'wild card bee icon',
};

function getBeeIconPath(personalityId) {
    const iconName = PERSONALITY_ICON_MAP[personalityId] || 'default bee icon';
    return `/images/bee-icons/${iconName}.png?v=2`;
}

// Provider billing URLs
const PROVIDER_BILLING_URLS = {
    'openai': 'https://platform.openai.com/account/billing',
    'anthropic': 'https://console.anthropic.com/settings/billing',
    'google': 'https://console.cloud.google.com/billing',
    'deepseek': 'https://platform.deepseek.com/usage',
    'xai': 'https://console.x.ai/team/billing'
};

// Provider API key pages
const PROVIDER_KEY_URLS = {
    'openai': 'https://platform.openai.com/api-keys',
    'anthropic': 'https://console.anthropic.com/settings/keys',
    'google': 'https://aistudio.google.com/app/apikey',
    'deepseek': 'https://platform.deepseek.com/api_keys',
    'xai': 'https://console.x.ai/team/api-keys'
};

// Error labeling based on common API issues
const ERROR_LABELS = {
    '401': {
        label: 'Invalid API Key',
        color: '#dc2626',
        help: 'The API key is invalid or expired. Create a new one from your provider dashboard.',
        actionType: 'key'
    },
    '429': {
        label: 'Rate Limited',
        color: '#f59e0b',
        help: 'Too many requests. Wait a minute or upgrade your plan for higher limits.',
        actionType: 'billing'
    },
    '402': {
        label: 'No Credits',
        color: '#7c3aed',
        help: 'Your account has no credits. Add funds to continue using this AI.',
        actionType: 'billing'
    },
    '403': {
        label: 'Access Denied',
        color: '#dc2626',
        help: 'Your API key doesn\'t have access to this model. Check your plan or permissions.',
        actionType: 'billing'
    },
    '404': {
        label: 'Model Not Found',
        color: '#6b7280',
        help: 'This model was retired or renamed. Try selecting a different model.',
        actionType: null
    },
    '500': {
        label: 'Provider Error',
        color: '#6b7280',
        help: 'The AI provider is having technical issues.',
        actionType: 'retry'
    },
    '503': {
        label: 'Overloaded',
        color: '#6b7280',
        help: 'The AI service is temporarily overloaded.',
        actionType: 'retry'
    },
    'insufficient_quota': {
        label: 'No Credits',
        color: '#7c3aed',
        help: 'You\'ve run out of API credits. Add funds to your account.',
        actionType: 'billing'
    }
};

// Parse error message and return labeled version with action info
function labelError(errorMessage, provider = null) {
    if (!errorMessage) return { label: 'Error', color: '#dc2626', message: 'Unknown error', help: '', actionType: null, provider: null };

    const msg = errorMessage.toString().toLowerCase();

    // Check for insufficient_quota specifically (OpenAI)
    if (msg.includes('insufficient_quota') || msg.includes('exceeded your current quota')) {
        return {
            ...ERROR_LABELS['insufficient_quota'],
            message: errorMessage,
            provider,
            billingUrl: provider ? PROVIDER_BILLING_URLS[provider] : null
        };
    }

    // Check for status codes in error message
    for (const [code, info] of Object.entries(ERROR_LABELS)) {
        if (msg.includes(code) || msg.includes(info.label.toLowerCase())) {
            return {
                ...info,
                message: errorMessage,
                provider,
                billingUrl: info.actionType === 'billing' && provider ? PROVIDER_BILLING_URLS[provider] : null,
                keyUrl: info.actionType === 'key' && provider ? PROVIDER_KEY_URLS[provider] : null
            };
        }
    }

    // Check for common error patterns
    if (msg.includes('invalid') && msg.includes('key')) {
        return {
            ...ERROR_LABELS['401'],
            message: errorMessage,
            provider,
            keyUrl: provider ? PROVIDER_KEY_URLS[provider] : null
        };
    }
    if (msg.includes('rate') || msg.includes('quota') || msg.includes('limit')) {
        return {
            ...ERROR_LABELS['429'],
            message: errorMessage,
            provider,
            billingUrl: provider ? PROVIDER_BILLING_URLS[provider] : null
        };
    }
    if (msg.includes('credit') || msg.includes('billing') || msg.includes('payment') || msg.includes('balance')) {
        return {
            ...ERROR_LABELS['402'],
            message: errorMessage,
            provider,
            billingUrl: provider ? PROVIDER_BILLING_URLS[provider] : null
        };
    }
    if (msg.includes('connection') || msg.includes('network') || msg.includes('timeout') || msg.includes('econnrefused')) {
        return {
            label: 'Connection Failed',
            color: '#6b7280',
            message: errorMessage,
            help: 'Check your internet connection. The AI provider may also be down.',
            actionType: null,
            provider
        };
    }

    // Default - show the actual error message
    return {
        label: 'Error',
        color: '#dc2626',
        message: errorMessage,
        help: 'Something went wrong. Try again or check your API key settings.',
        actionType: null,
        provider
    };
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
        // Not logged in - show guest UI
        showGuestUI();
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

        // Show logged-in UI elements
        showLoggedInUI();

        // Check if user has accepted privacy policy
        if (!currentUser.privacy_accepted) {
            showPrivacyModal();
        }

        return true;
    } catch (error) {
        localStorage.removeItem('token');
        showGuestUI();
        return false;
    }
}

// Show UI for guests (not logged in)
function showGuestUI() {
    // Hide sidebar and toggle
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebar) sidebar.style.display = 'none';
    if (sidebarToggle) sidebarToggle.style.display = 'none';

    // Remove sidebar margin from layout
    const chatLayout = document.querySelector('.chat-layout');
    if (chatLayout) chatLayout.style.marginLeft = '0';

    // Remove sidebar margin from header and voices
    const mainHeader = document.querySelector('.main-logo-header');
    const voicesBar = document.querySelector('.voices-bar');
    if (mainHeader) mainHeader.style.marginLeft = '0';
    if (voicesBar) voicesBar.style.marginLeft = '0';

    // Remove sidebar offset from input area
    const inputArea = document.querySelector('.chat-input-area');
    if (inputArea) inputArea.style.left = '0';

    // Center the empty state (remove sidebar offset)
    const emptyChat = document.querySelector('.empty-chat');
    if (emptyChat) emptyChat.style.marginLeft = '0';

    // Show the guest menu in the header
    const guestMenuWrapper = document.getElementById('guest-menu-wrapper');
    if (guestMenuWrapper) guestMenuWrapper.style.display = 'block';

    // Update mobile dropdown to show Sign Up/Sign In
    updateGuestDropdown('mobile-profile-dropdown');

    // Initialize guest menu toggle
    initGuestMenu();
}

// Update dropdown header for guests - replace email/icon with Sign Up button
function updateGuestDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    // Find and replace just the header section
    const header = dropdown.querySelector('.profile-dropdown-header');
    if (header) {
        header.innerHTML = `
            <a href="/login" style="display: flex; align-items: center; justify-content: center; width: 100%; padding: 6px 12px; background: var(--primary-color); color: white; border-radius: 6px; font-weight: 500; font-size: 0.85rem; text-decoration: none;">
                Sign Up
            </a>
        `;
        header.style.padding = '6px 8px';
    }

    // Hide logout button for guests
    const logoutBtn = dropdown.querySelector('.logout');
    if (logoutBtn) logoutBtn.style.display = 'none';

    // Hide upgrade button for guests
    const upgradeBtn = dropdown.querySelector('[id$="upgrade-btn"]');
    if (upgradeBtn) upgradeBtn.style.display = 'none';

    // Initialize theme toggle if needed
    const themeToggle = dropdown.querySelector('input[type="checkbox"]');
    if (themeToggle) {
        themeToggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';
        themeToggle.addEventListener('change', () => {
            const newTheme = themeToggle.checked ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }
}

// Initialize guest menu dropdown
function initGuestMenu() {
    const btn = document.getElementById('guest-menu-btn');
    const dropdown = document.getElementById('guest-menu-dropdown');
    const themeToggle = document.getElementById('theme-toggle-guest');

    if (btn && dropdown) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        document.addEventListener('click', () => {
            dropdown.classList.remove('open');
        });
    }

    if (themeToggle) {
        themeToggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';
        themeToggle.addEventListener('change', () => {
            const newTheme = themeToggle.checked ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }
}

// Show UI for logged-in users
function showLoggedInUI() {
    // Show sidebar and toggle
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebar) sidebar.style.display = '';
    if (sidebarToggle) sidebarToggle.style.display = '';

    // Hide guest menu
    const guestMenuWrapper = document.getElementById('guest-menu-wrapper');
    if (guestMenuWrapper) guestMenuWrapper.style.display = 'none';
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
        window.availableModels = availableModels;
        // Don't render yet - wait until selectedModels are loaded
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
        window.configuredProviders = configuredProviders;
        // Don't render yet - wait until selectedModels are loaded
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
document.getElementById('mobile-dropdown-upgrade-btn')?.addEventListener('click', () => {
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

    // Update header count display
    if (typeof window.updateHeaderModelsCount === 'function') {
        window.updateHeaderModelsCount();
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
    // On empty state (no session), only need text to start question flow
    // After a completed session (continuingDebateId set), only need text to continue
    // Otherwise, need text and at least 2 models
    const isActive = typeof isProcessing !== 'undefined' && isProcessing;
    const noSession = typeof currentSessionId !== 'undefined' && !currentSessionId;
    const hasModels = selectedModels.length >= 2;
    const canContinue = typeof window.continuingDebateId !== 'undefined' && window.continuingDebateId;
    const canSend = hasText && (isActive || noSession || hasModels || canContinue);
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
document.getElementById('mobile-dropdown-logout-btn')?.addEventListener('click', () => {
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

// Profile dropdown toggle (desktop - in sidebar)
const profileBtn = document.getElementById('profile-btn');
const profileDropdown = document.getElementById('profile-dropdown');

if (profileBtn && profileDropdown) {
    profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('open');
    });

    // Close dropdown when clicking an item (except theme toggle)
    profileDropdown.querySelectorAll('.profile-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Don't close if clicking theme switch
            if (item.querySelector('.theme-switch') && !e.target.closest('a')) {
                return;
            }
            profileDropdown.classList.remove('open');
        });
    });
}

// Mobile profile dropdown toggle (in header)
const mobileProfileBtn = document.getElementById('mobile-profile-btn');
const mobileProfileDropdown = document.getElementById('mobile-profile-dropdown');

if (mobileProfileBtn && mobileProfileDropdown) {
    mobileProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mobileProfileDropdown.classList.toggle('open');
    });

    // Close dropdown when clicking an item (except theme toggle)
    mobileProfileDropdown.querySelectorAll('.profile-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Don't close if clicking theme switch
            if (item.querySelector('.theme-switch') && !e.target.closest('a')) {
                return;
            }
            mobileProfileDropdown.classList.remove('open');
        });
    });
}

// Close all dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (profileDropdown && !profileDropdown.contains(e.target) && !profileBtn?.contains(e.target)) {
        profileDropdown.classList.remove('open');
    }
    if (mobileProfileDropdown && !mobileProfileDropdown.contains(e.target) && !mobileProfileBtn?.contains(e.target)) {
        mobileProfileDropdown.classList.remove('open');
    }
});

// Update profile display
function updateProfileDisplay(email, isPro) {
    // Update global Pro status for toggle handlers
    userIsPro = isPro;

    const initial = email ? email.charAt(0).toUpperCase() : 'U';

    // Update avatars (desktop + mobile)
    ['profile-avatar', 'profile-avatar-large', 'mobile-profile-avatar', 'mobile-profile-avatar-large'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = initial;
    });

    // Update inline name in sidebar profile button
    const profileNameInline = document.getElementById('profile-name-inline');
    if (profileNameInline) profileNameInline.textContent = email || 'Account';

    // Update email (desktop + mobile)
    ['profile-email', 'mobile-profile-email'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = email || 'User';
    });

    // Update plan (desktop + mobile)
    ['profile-plan', 'mobile-profile-plan'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (isPro) {
                el.textContent = 'Pro Plan';
                el.classList.add('pro');
            } else {
                el.textContent = 'Free Plan';
                el.classList.remove('pro');
            }
        }
    });

    // Show/hide upgrade button in dropdown (desktop + mobile)
    ['dropdown-upgrade-btn', 'mobile-dropdown-upgrade-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isPro ? 'none' : 'flex';
    });

    // Always show detail mode toggle (but with PRO badge for free users)
    ['desktop-mode-toggle', 'mobile-mode-toggle'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'flex';
    });

    // Show/hide PRO badge based on subscription (show for free users)
    ['desktop-mode-pro-badge', 'mobile-mode-pro-badge'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isPro ? 'none' : 'inline';
    });

    // For free users, disable the toggle and show it as off
    ['detail-mode-toggle-desktop', 'detail-mode-toggle-mobile'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (isPro) {
                // Pro users can toggle freely
                const currentMode = localStorage.getItem('detailMode') || 'normal';
                el.checked = currentMode === 'detailed';
                el.disabled = false;
                el.parentElement.style.opacity = '1';
            } else {
                // Free users see it as off and slightly dimmed
                el.checked = false;
                el.disabled = false; // Keep enabled so click handler fires
                el.parentElement.style.opacity = '0.7';
            }
        }
    });

    // Update mode selector bubble in chat input
    if (typeof updateModeSelectorBubble === 'function') {
        updateModeSelectorBubble();
    }
}

// Track if user is Pro for toggle handlers
let userIsPro = false;

// Detail mode toggle event listeners
['detail-mode-toggle-desktop', 'detail-mode-toggle-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', (e) => {
            // Check if user is Pro
            if (!userIsPro) {
                // Revert the toggle and show upgrade modal
                e.target.checked = false;
                showUpgradeModal();
                return;
            }

            const newMode = e.target.checked ? 'detailed' : 'normal';
            localStorage.setItem('detailMode', newMode);
            // Sync both toggles and mode selector
            ['detail-mode-toggle-desktop', 'detail-mode-toggle-mobile'].forEach(otherId => {
                const otherEl = document.getElementById(otherId);
                if (otherEl && otherEl !== e.target) {
                    otherEl.checked = e.target.checked;
                }
            });
            updateModeSelectorBubble();
        });
    }
});

// Mode selector bubble in chat input area
function updateModeSelectorBubble() {
    const btn = document.getElementById('mode-selector-btn');
    const text = document.getElementById('mode-selector-text');
    const checkFast = document.getElementById('check-fast');
    const checkDetailed = document.getElementById('check-detailed');
    if (!btn || !text) return;

    const currentMode = localStorage.getItem('detailMode') || 'normal';
    const isDetailed = currentMode === 'detailed';

    text.textContent = isDetailed ? 'Detailed' : 'Fast';
    btn.classList.toggle('detailed', isDetailed);

    // Update checkmarks
    if (checkFast) checkFast.textContent = isDetailed ? '' : '✓';
    if (checkDetailed) checkDetailed.textContent = isDetailed ? '✓' : '';
}

// Initialize mode selector on load
document.addEventListener('DOMContentLoaded', () => {
    updateModeSelectorBubble();
});

// Mode selector dropdown toggle
document.getElementById('mode-selector-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const wrapper = document.getElementById('mode-selector-wrapper');
    if (wrapper) {
        wrapper.classList.toggle('open');
    }
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('mode-selector-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        wrapper.classList.remove('open');
    }
});

// Mode option click handlers
document.querySelectorAll('.mode-option').forEach(option => {
    option.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = option.dataset.mode;
        const wrapper = document.getElementById('mode-selector-wrapper');

        // If clicking detailed and not Pro, show upgrade modal
        if (mode === 'detailed' && !userIsPro) {
            wrapper?.classList.remove('open');
            showUpgradeModal();
            return;
        }

        // Set the mode
        const newMode = mode === 'detailed' ? 'detailed' : 'normal';
        localStorage.setItem('detailMode', newMode);

        // Sync toggles in profile dropdown
        const isDetailed = newMode === 'detailed';
        ['detail-mode-toggle-desktop', 'detail-mode-toggle-mobile'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = isDetailed;
        });

        updateModeSelectorBubble();

        // Close dropdown
        wrapper?.classList.remove('open');
    });
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
            // On mobile (width <= 768px), Enter creates a new line instead of sending
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                // Let the default behavior happen (insert newline)
                return;
            }

            e.preventDefault();
            const question = chatInput.value.trim();
            if (!question) return;

            // If no session yet, trigger question flow
            if (typeof currentSessionId !== 'undefined' && !currentSessionId) {
                handleQuestionSubmit(question);
                return;
            }

            // Check if we're in a discussion (intervention) or starting new
            if (typeof isProcessing !== 'undefined' && isProcessing && typeof chatWebSocket !== 'undefined' && chatWebSocket && chatWebSocket.readyState === WebSocket.OPEN) {
                sendIntervention();
            } else if (typeof sendMessage === 'function') {
                // Try to send message for follow-up questions
                sendMessage();
            }
        }
    });
}

// Initialize
(async function init() {
    // Always load voices (personalities) for everyone
    await initVoicesBar();

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
            window.history.replaceState({}, '', '/');
            loadSubscriptionStatus();
        }

        // Check if we should open setup wizard (from settings page)
        if (urlParams.get('openSetup') === 'true') {
            window.history.replaceState({}, '', '/');
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
        countEl.textContent = `Select at least 2 voices to continue`;
    } else {
        countEl.style.color = '#22c55e';
        countEl.textContent = `${count} voices selected ✓`;
    }
}

// Allow manually showing tutorial (for testing or help)
window.showTutorial = showTutorial;

// ============ HIVES & PERSONALITY BEES SYSTEM ============

// Individual bee colors - each bee has its own unique color
const BEE_COLORS = {
    // Chaos Hive - warm reds/oranges
    'chaos-optimist': { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e', text: '#16a34a' },      // Green
    'chaos-pessimist': { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#dc2626' },     // Red
    'chaos-realist': { bg: 'rgba(107, 114, 128, 0.15)', border: '#6b7280', text: '#4b5563' },     // Gray
    'chaos-contrarian': { bg: 'rgba(249, 115, 22, 0.15)', border: '#f97316', text: '#ea580c' },   // Orange
    'chaos-cynic': { bg: 'rgba(162, 28, 175, 0.15)', border: '#a21caf', text: '#86198f' },        // Fuchsia

    // Friend Group Hive - pinks/warm tones
    'friend-bestie': { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', text: '#db2777' },      // Pink
    'friend-honest': { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#2563eb' },      // Blue
    'friend-funny': { bg: 'rgba(250, 204, 21, 0.15)', border: '#facc15', text: '#ca8a04' },       // Yellow
    'friend-wise': { bg: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6', text: '#7c3aed' },        // Violet
    'friend-practical': { bg: 'rgba(20, 184, 166, 0.15)', border: '#14b8a6', text: '#0d9488' },   // Teal

    // Billionaire Hive - golds/greens
    'billionaire-builder': { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#d97706' }, // Amber
    'billionaire-investor': { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#059669' }, // Emerald
    'billionaire-strategist': { bg: 'rgba(99, 102, 241, 0.15)', border: '#6366f1', text: '#4f46e5' }, // Indigo
    'billionaire-disruptor': { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#dc2626' }, // Red
    'billionaire-visionary': { bg: 'rgba(168, 85, 247, 0.15)', border: '#a855f7', text: '#9333ea' }, // Purple

    // Internet Hive - cyans/blues
    'internet-redditor': { bg: 'rgba(249, 115, 22, 0.15)', border: '#f97316', text: '#ea580c' },  // Orange (Reddit)
    'internet-influencer': { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', text: '#db2777' }, // Pink
    'internet-coder': { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e', text: '#16a34a' },       // Green
    'internet-gamer': { bg: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6', text: '#7c3aed' },      // Violet
    'internet-troll': { bg: 'rgba(6, 182, 212, 0.15)', border: '#06b6d4', text: '#0891b2' },       // Cyan

    // Generations Hive - varied
    'gen-z': { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', text: '#db2777' },              // Pink
    'gen-millennial': { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#d97706' },     // Amber
    'gen-x': { bg: 'rgba(107, 114, 128, 0.15)', border: '#6b7280', text: '#4b5563' },             // Gray
    'gen-boomer': { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#2563eb' },         // Blue
    'gen-future': { bg: 'rgba(6, 182, 212, 0.15)', border: '#06b6d4', text: '#0891b2' },          // Cyan

    // Courtroom Hive - formal colors
    'court-judge': { bg: 'rgba(30, 41, 59, 0.15)', border: '#1e293b', text: '#0f172a' },          // Slate
    'court-prosecutor': { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#dc2626' },    // Red
    'court-defense': { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#2563eb' },      // Blue
    'court-witness': { bg: 'rgba(250, 204, 21, 0.15)', border: '#facc15', text: '#ca8a04' },      // Yellow
    'court-jury': { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#059669' },         // Emerald

    // Special Bees
    'special-devils-advocate': { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#dc2626' }, // Red
    'special-wild-card': { bg: 'rgba(168, 85, 247, 0.15)', border: '#a855f7', text: '#9333ea' }       // Purple
};

// Fallback hive colors (for unknown bees)
const HIVE_COLORS = {
    'chaos': { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#dc2626' },
    'friend-group': { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', text: '#db2777' },
    'billionaire': { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#d97706' },
    'internet': { bg: 'rgba(6, 182, 212, 0.15)', border: '#06b6d4', text: '#0891b2' },
    'generations': { bg: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6', text: '#7c3aed' },
    'courtroom': { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#059669' },
    'special': { bg: 'rgba(99, 102, 241, 0.15)', border: '#6366f1', text: '#4f46e5' }
};

// Get color for a personality ID
function getPersonalityColor(personalityId) {
    if (!personalityId) return HIVE_COLORS['chaos'];

    // Check for individual bee color first
    if (BEE_COLORS[personalityId]) {
        return BEE_COLORS[personalityId];
    }

    // Fallback to hive colors for unknown bees
    if (personalityId.startsWith('special-')) return HIVE_COLORS['special'];
    const hivePrefix = personalityId.split('-')[0];
    if (hivePrefix === 'chaos') return HIVE_COLORS['chaos'];
    if (hivePrefix === 'friend') return HIVE_COLORS['friend-group'];
    if (hivePrefix === 'billionaire') return HIVE_COLORS['billionaire'];
    if (hivePrefix === 'internet') return HIVE_COLORS['internet'];
    if (hivePrefix === 'gen') return HIVE_COLORS['generations'];
    if (hivePrefix === 'court') return HIVE_COLORS['courtroom'];

    return HIVE_COLORS['chaos'];
}

// Make it globally available
window.getPersonalityColor = getPersonalityColor;
window.BEE_COLORS = BEE_COLORS;
window.HIVE_COLORS = HIVE_COLORS;

let allHives = [];
let allSpecialBees = [];
let allPersonalities = [];  // All personalities from current hive + selected special bees
let selectedHiveId = loadSelectedHive();

// Custom hives state
let customHives = [];
let customHiveLimits = null;
let currentEditingBees = [];  // Temp array for bees being created/edited
let editingHiveId = null;  // null for new hive, ID for editing
let editingBeeIndex = null;  // Index in currentEditingBees being edited
let selectedSpecialBees = loadSelectedSpecialBees();
let selectedPersonalities = loadSelectedBees();
let currentQuestion = '';

// Load selected hive from localStorage
function loadSelectedHive() {
    try {
        return localStorage.getItem('selectedHive') || 'chaos';
    } catch (e) {
        return 'chaos';
    }
}

// Save selected hive to localStorage
function saveSelectedHive() {
    try {
        localStorage.setItem('selectedHive', selectedHiveId);
    } catch (e) {
        console.error('Error saving hive:', e);
    }
}

// Load selected special bees from localStorage
function loadSelectedSpecialBees() {
    try {
        const saved = localStorage.getItem('selectedSpecialBees');
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
}

// Save selected special bees to localStorage
function saveSelectedSpecialBees() {
    try {
        localStorage.setItem('selectedSpecialBees', JSON.stringify(selectedSpecialBees));
    } catch (e) {
        console.error('Error saving special bees:', e);
    }
}

// Load selected bees from localStorage
function loadSelectedBees() {
    try {
        const saved = localStorage.getItem('selectedBees');
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
}

// Save selected bees to localStorage
function saveSelectedBees() {
    try {
        localStorage.setItem('selectedBees', JSON.stringify(selectedPersonalities));
    } catch (e) {
        console.error('Error saving bees:', e);
    }
}

// Fetch all hives from API
async function fetchHives() {
    try {
        const response = await fetch(`${API_BASE}/api/hives`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            allHives = await response.json();
            window.allHives = allHives;
        }
    } catch (error) {
        console.error('Error fetching hives:', error);
    }
}

// Fallback special bees data in case API fails
const FALLBACK_SPECIAL_BEES = [
    { id: "special-devils-advocate", name: "Devil's Advocate", human_name: "Lucifer", emoji: "😈", description: "Challenges consensus, prevents echo chambers", is_special: true },
    { id: "special-wild-card", name: "Wild Card", human_name: "Joker", emoji: "🃏", description: "Random unexpected perspectives, creative chaos", is_special: true }
];

// Fetch special bees from API
async function fetchSpecialBees() {
    try {
        const response = await fetch(`${API_BASE}/api/special-bees`);
        if (response.ok) {
            allSpecialBees = await response.json();
            window.allSpecialBees = allSpecialBees;
        } else {
            console.warn('Special bees API failed, using fallback');
            allSpecialBees = FALLBACK_SPECIAL_BEES;
            window.allSpecialBees = allSpecialBees;
        }
    } catch (error) {
        console.error('Error fetching special bees:', error);
        allSpecialBees = FALLBACK_SPECIAL_BEES;
        window.allSpecialBees = allSpecialBees;
    }
}

// Fetch all personalities from API (legacy, now uses hive personalities)
async function fetchPersonalities() {
    await fetchHives();
    await fetchSpecialBees();
    await fetchCustomHives();
    updateAllPersonalities();
}

// Update allPersonalities based on selected hive + special bees
function updateAllPersonalities() {
    // First check if it's a custom hive
    const customHive = customHives.find(h => h.id === selectedHiveId);
    if (customHive) {
        // Convert custom bees to personality format
        allPersonalities = customHive.bees.map(bee => ({
            id: bee.id,
            name: bee.name,
            human_name: bee.human_name,
            emoji: bee.emoji || '🐝',
            description: bee.description,
            is_special: false,
            is_custom: true,
            icon_base64: bee.icon_base64
        }));
        // Add selected special bees
        selectedSpecialBees.forEach(specialId => {
            const specialBee = allSpecialBees.find(b => b.id === specialId);
            if (specialBee && !allPersonalities.find(p => p.id === specialBee.id)) {
                allPersonalities.push(specialBee);
            }
        });
        window.allPersonalities = allPersonalities;
        return;
    }

    // Built-in hive
    const hive = allHives.find(h => h.id === selectedHiveId);
    if (hive) {
        // Start with hive personalities
        allPersonalities = [...hive.personalities];
        // Add selected special bees
        selectedSpecialBees.forEach(specialId => {
            const specialBee = allSpecialBees.find(b => b.id === specialId);
            if (specialBee && !allPersonalities.find(p => p.id === specialBee.id)) {
                allPersonalities.push(specialBee);
            }
        });
        window.allPersonalities = allPersonalities;
    }
}

// Get personality suggestions for a question (now returns hive defaults)
async function fetchPersonalitySuggestions(question) {
    // Return first 3 bees from current hive
    const hive = allHives.find(h => h.id === selectedHiveId);
    if (hive && hive.personalities.length >= 3) {
        return hive.personalities.slice(0, 3).map(p => p.id);
    }
    return [];
}

// Select a hive
// Track pending hive selection in modal (not yet confirmed)
let pendingHiveId = null;

function previewHive(hiveId) {
    pendingHiveId = hiveId;
    renderHivesModal();
}

function confirmHiveSelection() {
    if (pendingHiveId) {
        selectHive(pendingHiveId);
        pendingHiveId = null;
    }
}

function selectHive(hiveId) {
    selectedHiveId = hiveId;
    saveSelectedHive();
    updateAllPersonalities();

    // Reset selected personalities to all bees in the hive
    // First check if it's a custom hive
    const customHive = customHives.find(h => h.id === hiveId);
    if (customHive) {
        selectedPersonalities = customHive.bees.map(p => p.id);
        // Add any selected special bees
        selectedSpecialBees.forEach(specialId => {
            if (!selectedPersonalities.includes(specialId)) {
                selectedPersonalities.push(specialId);
            }
        });
        saveSelectedBees();
    } else {
        // Built-in hive
        const hive = allHives.find(h => h.id === hiveId);
        if (hive) {
            selectedPersonalities = hive.personalities.map(p => p.id);
            // Add any selected special bees
            selectedSpecialBees.forEach(specialId => {
                if (!selectedPersonalities.includes(specialId)) {
                    selectedPersonalities.push(specialId);
                }
            });
            saveSelectedBees();
        }
    }

    // Update UI
    renderVoicesBar();
    renderHivesModal();
    updateCurrentHiveDisplay();
    closeHivesModal();
}

// Toggle special bee selection
function toggleSpecialBee(beeId) {
    const index = selectedSpecialBees.indexOf(beeId);
    if (index >= 0) {
        // Remove
        selectedSpecialBees.splice(index, 1);
        // Also remove from selected personalities
        const pIndex = selectedPersonalities.indexOf(beeId);
        if (pIndex >= 0) {
            selectedPersonalities.splice(pIndex, 1);
        }
    } else {
        // Add
        selectedSpecialBees.push(beeId);
        selectedPersonalities.push(beeId);
    }
    saveSelectedSpecialBees();
    saveSelectedBees();
    updateAllPersonalities();
    renderVoicesBar();
    renderHivesModal();
}

// Update the current hive display in header
function updateCurrentHiveDisplay() {
    const nameEl = document.getElementById('current-hive-name');
    const mobileNameEl = document.getElementById('mobile-hive-name');
    let hiveName = 'Choose Hive';

    // Check custom hives first
    const customHive = customHives.find(h => h.id === selectedHiveId);
    if (customHive) {
        hiveName = customHive.name;
    } else {
        // Then built-in hives
        const hive = allHives.find(h => h.id === selectedHiveId);
        if (hive) hiveName = hive.name;
    }

    if (nameEl) nameEl.textContent = hiveName;
    if (mobileNameEl) mobileNameEl.textContent = hiveName;
}

// Open hives modal
function openHivesModal() {
    const modal = document.getElementById('hives-modal');
    if (modal) {
        pendingHiveId = null;
        modal.classList.add('active');
        renderHivesModal();
    }
}

// Close hives modal
function closeHivesModal() {
    const modal = document.getElementById('hives-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Render hives modal content
function renderHivesModal() {
    const hivesGrid = document.getElementById('hives-grid');

    // Update create hive button state
    updateCreateHiveButton();

    if (hivesGrid) {
        // Render custom hives first (if any)
        let customHtml = '';
        if (customHives && customHives.length > 0) {
            customHtml = customHives.map(hive => {
                const isSelected = hive.id === selectedHiveId;
                return `
                <div class="hive-card ${hive.id === (pendingHiveId || selectedHiveId) ? 'selected' : ''}" onclick="previewHive('${hive.id}')">
                    <div class="hive-card-header">
                        <span class="hive-card-name">${hive.name}</span>
                        <span class="custom-badge">Custom</span>
                    </div>
                    <div class="hive-card-desc">${hive.description || 'Your custom hive'}</div>
                    <div class="hive-card-bees">
                        ${hive.bees.map(p => `
                            <span class="hive-bee-preview">
                                ${p.icon_base64 ? `<img src="data:image/png;base64,${p.icon_base64}" style="width: 16px; height: 16px; border-radius: 50%;">` : `<span class="bee-emoji">${p.emoji || '🐝'}</span>`}
                                <span>${p.human_name}</span>
                            </span>
                        `).join('')}
                    </div>
                    <div style="margin-top: 8px; display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); openHiveCreator('${hive.id}')" style="font-size: 0.7rem; padding: 4px 8px;">Edit</button>
                        <button class="btn btn-secondary btn-small" onclick="deleteCustomHive('${hive.id}', event)" style="font-size: 0.7rem; padding: 4px 8px; color: var(--error-color);">Delete</button>
                    </div>
                    <button class="hive-card-choose" onclick="event.stopPropagation(); selectHive('${hive.id}')">${isSelected ? 'Selected' : 'Choose Hive'}</button>
                </div>
            `}).join('');
        }

        // Render built-in hives
        const builtInHtml = allHives.map(hive => {
            const isSelected = hive.id === selectedHiveId;
            return `
            <div class="hive-card ${hive.id === (pendingHiveId || selectedHiveId) ? 'selected' : ''}" onclick="previewHive('${hive.id}')">
                <div class="hive-card-header">
                    <span class="hive-card-name">${hive.name}</span>
                </div>
                <div class="hive-card-desc">${hive.description}</div>
                <div class="hive-card-bees">
                    ${hive.personalities.map(p => {
                        const iPath = getBeeIconPath(p.id);
                        return `<span class="hive-bee-preview">
                            <img src="${iPath}" alt="" style="width: 60px; height: 60px; border-radius: 8px; object-fit: contain;" onerror="this.src='/images/bee-icons/default bee icon.png'">
                            <span>${p.human_name}</span>
                        </span>`;
                    }).join('')}
                </div>
                <button class="hive-card-choose" onclick="event.stopPropagation(); selectHive('${hive.id}')">${isSelected ? 'Selected' : 'Choose Hive'}</button>
            </div>
        `}).join('');

        hivesGrid.innerHTML = customHtml + builtInHtml;
    }
}

// Render special bees dropdown content
function renderSpecialBeesDropdown() {
    const dropdown = document.getElementById('special-bees-dropdown');
    if (!dropdown) return;

    const optionsHtml = allSpecialBees.map(bee => {
        const iPath = getBeeIconPath(bee.id);
        return `<button class="special-bee-option ${selectedSpecialBees.includes(bee.id) ? 'selected' : ''}" onclick="toggleSpecialBeeFromDropdown('${bee.id}')">
            <img src="${iPath}" alt="" style="width: 60px; height: 60px; border-radius: 8px; object-fit: contain;" onerror="this.src='/images/bee-icons/default bee icon.png'">
            <div class="bee-info">
                <div class="bee-name">${bee.human_name}</div>
                <div class="bee-desc">${bee.description}</div>
            </div>
            <span class="bee-check">${selectedSpecialBees.includes(bee.id) ? '✓' : ''}</span>
        </button>`;
    }).join('');

    dropdown.innerHTML = `
        <div class="special-bees-dropdown-title">Add-on Bees</div>
        ${optionsHtml}
    `;
}

// Toggle special bee from dropdown
function toggleSpecialBeeFromDropdown(beeId) {
    toggleSpecialBee(beeId);
    renderSpecialBeesDropdown();
}

// Toggle special bees dropdown
function toggleSpecialBeesDropdown(e) {
    e.stopPropagation();
    const dropdown = document.getElementById('special-bees-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('open');
        if (dropdown.classList.contains('open')) {
            renderSpecialBeesDropdown();
        }
    }
}

// Close special bees dropdown when clicking outside (with delay to prevent race condition)
let specialBeesJustOpened = false;
document.addEventListener('click', (e) => {
    if (specialBeesJustOpened) return;
    const dropdown = document.getElementById('special-bees-dropdown');
    const wrapper = document.querySelector('.add-special-wrapper');
    // Check if click is inside wrapper OR inside dropdown (since dropdown is now in body)
    if (dropdown && wrapper && !wrapper.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
    }
});
window.setSpecialBeesJustOpened = (val) => { specialBeesJustOpened = val; };

window.toggleSpecialBeesDropdown = toggleSpecialBeesDropdown;
window.toggleSpecialBeeFromDropdown = toggleSpecialBeeFromDropdown;

// Make functions globally available
window.openHivesModal = openHivesModal;
window.closeHivesModal = closeHivesModal;
window.selectHive = selectHive;
window.previewHive = previewHive;
window.confirmHiveSelection = confirmHiveSelection;
window.toggleSpecialBee = toggleSpecialBee;

// Render personality selector cards
function renderPersonalitySelector(suggestedIds = []) {
    const container = document.getElementById('personality-cards');
    if (!container) return;

    container.innerHTML = '';

    // Pre-select suggested personalities
    if (suggestedIds.length > 0 && selectedPersonalities.length === 0) {
        selectedPersonalities = suggestedIds.slice(0, 3);
    }

    allPersonalities.forEach(personality => {
        const isSelected = selectedPersonalities.includes(personality.id);
        const assignedModel = getAssignedModelForPersonality(personality.id);

        const card = document.createElement('div');
        card.className = `personality-card ${isSelected ? 'selected' : ''}`;
        card.dataset.personalityId = personality.id;
        card.style.position = 'relative';

        const iconPath = getBeeIconPath(personality.id);

        card.innerHTML = `
            <span class="checkmark">✓</span>
            <img src="${iconPath}" alt="" class="emoji" style="width: 60px; height: 60px; border-radius: 8px; object-fit: contain;" onerror="this.src='/images/bee-icons/default bee icon.png'">
            <span class="name">${personality.human_name || personality.name}</span>
            <span class="role-subtitle">${personality.name}</span>
            ${assignedModel ? `<span class="model">powered by ${assignedModel}</span>` : ''}
        `;

        card.addEventListener('click', () => togglePersonality(personality.id));
        container.appendChild(card);
    });

    updateStartButton();
}

// Toggle personality selection
function togglePersonality(personalityId) {
    const index = selectedPersonalities.indexOf(personalityId);
    if (index >= 0) {
        selectedPersonalities.splice(index, 1);
    } else if (selectedPersonalities.length < 5) {
        selectedPersonalities.push(personalityId);
    }
    renderPersonalitySelector();
}

// Get assigned model name for a personality
function getAssignedModelForPersonality(personalityId) {
    // First check if user has a saved role assignment
    const savedRoles = window.getRoleAssignments ? window.getRoleAssignments() : {};
    const savedModelKey = savedRoles[personalityId];

    if (savedModelKey) {
        const [provider, ...idParts] = savedModelKey.split(':');
        const modelId = idParts.join(':');
        const model = availableModels.find(m => m.provider === provider && m.id === modelId);
        if (model && configuredProviders.has(model.provider)) {
            return model.name;
        }
    }

    // Fall back to auto-assign based on selection order
    const index = selectedPersonalities.indexOf(personalityId);
    if (index < 0) return null;

    const configuredModels = availableModels.filter(m => configuredProviders.has(m.provider));
    if (index >= configuredModels.length) return null;

    return configuredModels[index]?.name || null;
}

// Update the start button text
function updateStartButton() {
    const btn = document.getElementById('start-hive-btn');
    const countSpan = document.getElementById('selected-voices-count');
    if (btn && countSpan) {
        countSpan.textContent = selectedPersonalities.length;
        btn.disabled = selectedPersonalities.length < 2;
    }
}

// Handle question submit
async function handleQuestionSubmit(question) {
    if (!question || question.trim().length === 0) return;

    currentQuestion = question.trim();

    // Clear the input
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.value = '';
    }

    // If no personalities selected yet, auto-select defaults
    if (selectedPersonalities.length < 2) {
        const suggested = await fetchPersonalitySuggestions(currentQuestion);
        selectedPersonalities = suggested.slice(0, 3);
        saveSelectedBees();
        renderVoicesBar();
    }

    // Start debate directly (skip personality selector)
    startDebateWithPersonalities();
}

// Get summarizer index based on bee preference
function getSummarizerIndexByBee(models) {
    const pref = localStorage.getItem('summarizerPreference') || 'first';

    if (pref === 'first') {
        return 0;
    }

    if (pref === 'last') {
        return models.length - 1;
    }

    // Bee-specific preference (e.g., "bee:analyst")
    if (pref.startsWith('bee:')) {
        const beeId = pref.replace('bee:', '');
        const beeIndex = models.findIndex(m => m.personality_id === beeId);
        if (beeIndex >= 0) {
            return beeIndex;
        }
    }

    // Fallback to first bee
    return 0;
}

// Start debate with selected personalities
async function startDebateWithPersonalities() {
    if (selectedPersonalities.length < 2 || !currentQuestion) {
        alert('Please select at least 2 personalities');
        return;
    }

    // Get configured models
    const configuredModels = availableModels.filter(m => configuredProviders.has(m.provider));
    if (configuredModels.length < selectedPersonalities.length) {
        alert(`You need ${selectedPersonalities.length} API keys configured. Please add more in Settings.`);
        showTutorial();
        return;
    }

    // Build models config with personality IDs, using saved role assignments
    const usedModels = new Set();
    const modelsConfig = selectedPersonalities.map((personalityId) => {
        // Get model from settings, or fall back to next available
        const remainingModels = configuredModels.filter(m => !usedModels.has(`${m.provider}:${m.id}`));
        const model = window.getModelForPersonality ?
            window.getModelForPersonality(personalityId, remainingModels) :
            remainingModels[0];

        if (model) {
            usedModels.add(`${model.provider}:${model.id}`);
        }

        return {
            provider: model?.provider || remainingModels[0]?.provider,
            model_id: model?.id || remainingModels[0]?.id,
            model_name: model?.name || remainingModels[0]?.name,
            personality_id: personalityId,
            role: ''
        };
    });

    // Update selectedModels global (used by chat.js)
    selectedModels = modelsConfig;
    saveSelectedModels();

    // Clear empty state
    const emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.remove();

    // Show chat input area
    const inputArea = document.getElementById('chat-input-area');
    if (inputArea) inputArea.style.display = 'block';

    // Add user message as big bold header
    const container = document.getElementById('chat-messages');
    const userMsg = document.createElement('div');
    userMsg.className = 'question-header';
    userMsg.innerHTML = `<div class="question-header-text">${escapeHtml(currentQuestion)}</div>`;
    container.appendChild(userMsg);

    // Store question and start debate
    const questionToSend = currentQuestion;

    // Reset question (but keep selected personalities)
    currentQuestion = '';

    // Start the debate directly via API
    try {
        // Get summarizer index based on bee preference
        const summarizerIndex = getSummarizerIndexByBee(modelsConfig);
        // Get detail mode from localStorage (Pro users can toggle)
        const detailMode = localStorage.getItem('detailMode') || 'normal';
        const requestBody = {
            topic: questionToSend,
            config: {
                models: modelsConfig,
                rounds: 1,
                summarizer_index: summarizerIndex,
                detail_mode: detailMode
            }
        };

        const response = await fetch(`${API_BASE}/api/debates`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(requestBody)
        });

        if (response.status === 402) {
            showUpgradeModal();
            return;
        }

        if (!response.ok) throw new Error('Failed to start session');

        const session = await response.json();
        currentSessionId = session.id;

        // Switch to pause button mode
        if (typeof setInputLocked === 'function') {
            setInputLocked(true);
        }

        // Connect WebSocket
        connectWebSocket(session.id);

        // Update subscription status
        loadSubscriptionStatus();
    } catch (error) {
        console.error('Error starting debate:', error);
        alert('Failed to start debate. Please try again.');
    }
}

// Attach event listeners for question-first flow
function attachQuestionFlowListeners() {
    document.getElementById('start-hive-btn')?.addEventListener('click', startDebateWithPersonalities);

    // Question template clicks - put text in chat-input (don't auto-send)
    document.querySelectorAll('.question-template').forEach(btn => {
        btn.addEventListener('click', () => {
            const question = btn.dataset.question;
            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                chatInput.value = question;
                chatInput.focus();
                // Trigger input event to enable send button
                chatInput.dispatchEvent(new Event('input'));
            }
        });
    });
}

// Make it globally available for chat.js
window.attachQuestionFlowListeners = attachQuestionFlowListeners;

// Initial attachment
attachQuestionFlowListeners();

// ============================================
// Voices Horizontal Bar (Personality Chips)
// ============================================

function renderVoicesBar() {
    const container = document.getElementById('voices-chips');
    if (!container) return;

    container.innerHTML = '';

    // Check if it's a custom hive
    const customHive = customHives.find(h => h.id === selectedHiveId);
    if (customHive) {
        // Render custom hive bees
        customHive.bees.forEach(personality => {
            const isSelected = selectedPersonalities.includes(personality.id);
            const chip = document.createElement('div');
            chip.className = `voice-chip ${isSelected ? 'selected' : ''}`;
            chip.dataset.personalityId = personality.id;

            // Use custom golden color for custom bees
            if (isSelected) {
                chip.style.background = 'rgba(245, 166, 35, 0.1)';
                chip.style.borderColor = '#F5A623';
                chip.style.color = '#92400e';
            }

            // Show AI-generated icon if available
            const iconHtml = personality.icon_base64
                ? `<img src="data:image/png;base64,${personality.icon_base64}" style="width: 24px; height: 24px; border-radius: 50%;" alt="">`
                : `<span class="voice-emoji">${personality.emoji || '🐝'}</span>`;

            chip.innerHTML = `
                ${iconHtml}
                <div class="voice-info">
                    <span class="voice-name">${personality.human_name || personality.name}</span>
                    <span class="voice-role">${personality.name}</span>
                </div>
            `;
            chip.addEventListener('click', () => {
                toggleVoiceChip(personality.id);
            });
            container.appendChild(chip);
        });
    } else {
        // Wait for hives to load
        if (!allHives.length) return;

        // Get current built-in hive personalities
        const hive = allHives.find(h => h.id === selectedHiveId);
        if (!hive) return;

        // Render hive bees first
        hive.personalities.forEach(personality => {
            const isSelected = selectedPersonalities.includes(personality.id);
            const colors = getPersonalityColor(personality.id);
            const chip = document.createElement('div');
            chip.className = `voice-chip ${isSelected ? 'selected' : ''}`;
            chip.dataset.personalityId = personality.id;

            // Apply hive color
            if (isSelected) {
                chip.style.background = colors.bg;
                chip.style.borderColor = colors.border;
                chip.style.color = colors.text;
            }

            const iconPath = getBeeIconPath(personality.id);
            chip.innerHTML = `
                <img class="voice-bee-icon" src="${iconPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png'">
                <div class="voice-info">
                    <span class="voice-name">${personality.human_name || personality.name}</span>
                    <span class="voice-role">${personality.name}</span>
                </div>
            `;
            chip.addEventListener('click', () => {
                toggleVoiceChip(personality.id);
            });
            container.appendChild(chip);
        });
    }

    // Render selected special bees
    selectedSpecialBees.forEach(specialId => {
        const specialBee = allSpecialBees.find(b => b.id === specialId);
        if (!specialBee) return;

        const isSelected = selectedPersonalities.includes(specialBee.id);
        const colors = getPersonalityColor(specialBee.id);
        const chip = document.createElement('div');
        chip.className = `voice-chip special ${isSelected ? 'selected' : ''}`;
        chip.dataset.personalityId = specialBee.id;

        // Apply special bee color
        if (isSelected) {
            chip.style.background = colors.bg;
            chip.style.borderColor = colors.border;
            chip.style.color = colors.text;
        }

        const specialIconPath = getBeeIconPath(specialBee.id);
        chip.innerHTML = `
            <img class="voice-bee-icon" src="${specialIconPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png'">
            <div class="voice-info">
                <span class="voice-name">${specialBee.human_name || specialBee.name}</span>
                <span class="voice-role">${specialBee.name}</span>
            </div>
        `;
        chip.addEventListener('click', () => {
            toggleVoiceChip(specialBee.id);
        });
        container.appendChild(chip);
    });

    // Add "+" button with dropdown for special bees (only if not all selected)
    const unselectedSpecialBees = allSpecialBees.filter(b => !selectedSpecialBees.includes(b.id));
    if (unselectedSpecialBees.length > 0) {
        const wrapper = document.createElement('div');
        wrapper.className = 'add-special-wrapper';

        // Create button
        const addBtn = document.createElement('button');
        addBtn.className = 'add-special-btn';
        addBtn.title = 'Add special bee';
        addBtn.textContent = '+';

        // Create dropdown
        const dropdown = document.createElement('div');
        dropdown.id = 'special-bees-dropdown';
        dropdown.className = 'special-bees-dropdown';

        // Pre-populate dropdown content
        const optionsHtml = unselectedSpecialBees.map(bee => {
            const iconPath = getBeeIconPath(bee.id);
            return `<button class="special-bee-option" data-bee-id="${bee.id}">
                <img src="${iconPath}" alt="" style="width: 36px; height: 36px; border-radius: 6px; object-fit: contain;" onerror="this.src='/images/bee-icons/default bee icon.png'">
                <div class="bee-info">
                    <div class="bee-name">${bee.human_name}</div>
                    <div class="bee-desc">${bee.description}</div>
                </div>
            </button>`;
        }).join('');
        dropdown.innerHTML = `<div class="special-bees-dropdown-title">Add-on Bees</div>${optionsHtml}`;

        // Add click handler for button
        addBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setTimeout(() => {
                const wasOpen = dropdown.classList.contains('open');

                // Position dropdown using fixed positioning relative to button
                if (!wasOpen) {
                    const rect = addBtn.getBoundingClientRect();
                    dropdown.style.position = 'fixed';
                    dropdown.style.top = (rect.bottom + 8) + 'px';
                    dropdown.style.right = (window.innerWidth - rect.right) + 'px';
                    dropdown.style.left = 'auto';
                }

                dropdown.classList.toggle('open');
                if (!wasOpen) {
                    window.setSpecialBeesJustOpened(true);
                    setTimeout(() => window.setSpecialBeesJustOpened(false), 200);
                }
            }, 0);
        });

        // Add click handlers for options
        wrapper.appendChild(addBtn);
        // Append dropdown to body to escape stacking context issues
        document.body.appendChild(dropdown);

        // Add click handlers to options after adding to DOM
        dropdown.querySelectorAll('.special-bee-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const beeId = option.dataset.beeId;
                toggleSpecialBee(beeId);
                dropdown.classList.remove('open');
            });
        });

        container.appendChild(wrapper);
    }
}

function toggleVoiceChip(personalityId) {
    const index = selectedPersonalities.indexOf(personalityId);

    // Check if this is a special bee
    const isSpecial = selectedSpecialBees.includes(personalityId);

    if (index >= 0) {
        selectedPersonalities.splice(index, 1);
        // If it's a special bee, also remove from selectedSpecialBees
        if (isSpecial) {
            const specialIndex = selectedSpecialBees.indexOf(personalityId);
            if (specialIndex >= 0) {
                selectedSpecialBees.splice(specialIndex, 1);
                saveSelectedSpecialBees();
            }
        }
    } else {
        // Limit total selection (hive has 5, plus up to 2 special = 7 max)
        if (selectedPersonalities.length < 7) {
            selectedPersonalities.push(personalityId);
        }
    }
    saveSelectedBees();
    updateAllPersonalities();
    renderVoicesBar();
    // Also update the personality selector in the empty state if visible
    renderPersonalitySelector();
}


// Load hives and personalities on init and render voices bar
async function initVoicesBar() {
    await fetchPersonalities();

    // Check if selected hive still exists
    const customHive = customHives.find(h => h.id === selectedHiveId);
    const builtInHive = allHives.find(h => h.id === selectedHiveId);

    if (customHive) {
        // Validate custom hive selection
        const validIds = new Set(customHive.bees.map(p => p.id));
        allSpecialBees.forEach(b => validIds.add(b.id));

        const hasInvalidIds = selectedPersonalities.some(id => !validIds.has(id));
        if (hasInvalidIds || selectedPersonalities.length === 0) {
            selectedPersonalities = customHive.bees.map(p => p.id);
            selectedSpecialBees = [];
            saveSelectedBees();
            saveSelectedSpecialBees();
        }
    } else if (builtInHive) {
        // Validate built-in hive selection
        const validIds = new Set(builtInHive.personalities.map(p => p.id));
        allSpecialBees.forEach(b => validIds.add(b.id));

        const hasInvalidIds = selectedPersonalities.some(id => !validIds.has(id));
        if (hasInvalidIds || selectedPersonalities.length === 0) {
            selectedPersonalities = builtInHive.personalities.map(p => p.id);
            selectedSpecialBees = [];
            saveSelectedBees();
            saveSelectedSpecialBees();
        }
    } else {
        // Selected hive doesn't exist, reset to default
        selectedHiveId = 'chaos';
        saveSelectedHive();
        const defaultHive = allHives.find(h => h.id === 'chaos');
        if (defaultHive) {
            selectedPersonalities = defaultHive.personalities.map(p => p.id);
            selectedSpecialBees = [];
            saveSelectedBees();
            saveSelectedSpecialBees();
        }
    }

    updateCurrentHiveDisplay();
    renderVoicesBar();
}

// Add hives button click listeners (desktop + mobile)
document.getElementById('hives-btn')?.addEventListener('click', openHivesModal);
document.getElementById('mobile-hives-btn')?.addEventListener('click', openHivesModal);

// Hives modal - only close via X button or selecting a hive

// ============================================
// CUSTOM HIVES FUNCTIONS
// ============================================

// Fetch custom hives from API
async function fetchCustomHives() {
    const token = localStorage.getItem('token');
    if (!token) {
        customHives = [];
        customHiveLimits = { max_hives: 0, current_count: 0, can_create: false, subscription_status: 'none' };
        return;
    }

    try {
        // Fetch hives and limits in parallel
        const [hivesRes, limitsRes] = await Promise.all([
            fetch(`${API_BASE}/api/custom-hives`, { headers: getAuthHeaders() }),
            fetch(`${API_BASE}/api/custom-hives/limits`, { headers: getAuthHeaders() })
        ]);

        if (hivesRes.ok) {
            customHives = await hivesRes.json();
            console.log('Loaded custom hives:', customHives.length);
        } else {
            console.log('Failed to load custom hives:', hivesRes.status);
            customHives = [];
        }
        if (limitsRes.ok) {
            customHiveLimits = await limitsRes.json();
            console.log('Custom hive limits:', customHiveLimits);
        } else {
            console.log('Failed to load limits:', limitsRes.status);
            // Default to allowing creation so user can try
            customHiveLimits = { max_hives: 1, current_count: 0, can_create: true, subscription_status: 'free' };
        }
    } catch (error) {
        console.error('Error fetching custom hives:', error);
        customHives = [];
        customHiveLimits = { max_hives: 1, current_count: 0, can_create: true, subscription_status: 'free' };
    }
}

// Check if user can create a new hive
function canCreateCustomHive() {
    if (!customHiveLimits) {
        console.log('customHiveLimits not loaded yet');
        return true; // Allow attempt, backend will enforce
    }
    return customHiveLimits.can_create;
}

// Update create hive button state
function updateCreateHiveButton() {
    const btn = document.getElementById('create-hive-btn');
    const limitText = document.getElementById('create-hive-limit');
    const token = localStorage.getItem('token');

    if (!btn) return;

    if (!token) {
        // Not logged in
        btn.disabled = true;
        if (limitText) limitText.textContent = 'Log in to create custom hives';
    } else if (!customHiveLimits) {
        btn.disabled = true;
        if (limitText) limitText.textContent = '';
    } else if (customHiveLimits.can_create) {
        btn.disabled = false;
        if (customHiveLimits.max_hives === -1) {
            if (limitText) limitText.textContent = 'Pro: Unlimited custom hives';
        } else {
            if (limitText) limitText.textContent = `${customHiveLimits.current_count}/${customHiveLimits.max_hives} custom hive used`;
        }
    } else {
        btn.disabled = true;
        if (limitText) {
            limitText.innerHTML = `Limit reached (${customHiveLimits.current_count}/${customHiveLimits.max_hives}). <a href="/pricing" style="color: var(--primary-color);">Upgrade to Pro</a> for unlimited.`;
        }
    }
}

// Open the hive creator modal
function openHiveCreator(hiveId) {
    console.log('openHiveCreator called', hiveId);

    const token = localStorage.getItem('token');
    if (!token) {
        alert('Please log in to create custom hives.');
        return;
    }

    editingHiveId = hiveId || null;
    currentEditingBees = [];

    const modal = document.getElementById('hive-creator-modal');
    const titleEl = document.getElementById('hive-creator-title');
    const nameInput = document.getElementById('hive-name-input');
    const descInput = document.getElementById('hive-desc-input');
    const saveBtn = document.getElementById('save-hive-btn');

    console.log('Modal element:', modal);

    if (hiveId) {
        // Editing existing hive
        const hive = customHives.find(h => h.id === hiveId);
        if (hive) {
            titleEl.textContent = 'Edit Custom Hive';
            nameInput.value = hive.name;
            descInput.value = hive.description || '';
            currentEditingBees = hive.bees.map(b => ({ ...b }));
            saveBtn.textContent = 'Save Changes';
        }
    } else {
        // Creating new hive
        titleEl.textContent = 'Create Custom Hive';
        nameInput.value = '';
        descInput.value = '';
        currentEditingBees = [];
        saveBtn.textContent = 'Create Hive';
    }

    renderBeeSlots();
    updateSaveHiveButton();

    if (modal) {
        modal.classList.add('active');
        console.log('Modal activated');
    } else {
        console.error('Modal not found!');
    }
}

// Close hive creator modal
function closeHiveCreator() {
    const modal = document.getElementById('hive-creator-modal');
    modal.classList.remove('active');
    editingHiveId = null;
    currentEditingBees = [];
}

// Render bee slots in hive creator
function renderBeeSlots() {
    const container = document.getElementById('bee-slots');
    const countEl = document.getElementById('bee-slots-count');
    if (!container) return;

    countEl.textContent = `${currentEditingBees.length}/5`;

    let html = '';
    for (let i = 0; i < 5; i++) {
        const bee = currentEditingBees[i];
        if (bee) {
            // Filled slot
            const iconContent = bee.icon_base64
                ? `<img src="data:image/png;base64,${bee.icon_base64}" class="bee-slot-icon" alt="">`
                : `<span class="bee-slot-emoji">${bee.emoji || '🐝'}</span>`;
            html += `
                <div class="bee-slot filled" onclick="openBeeCreator(${i})">
                    ${iconContent}
                    <span class="bee-slot-name">${bee.human_name || bee.name}</span>
                    <button class="bee-slot-remove" onclick="event.stopPropagation(); removeBeeSlot(${i})">×</button>
                </div>
            `;
        } else {
            // Empty slot
            const required = i < 2 ? ' (required)' : '';
            html += `
                <div class="bee-slot" onclick="openBeeCreator(${i})">
                    <span class="bee-slot-add">+</span>
                    <span class="bee-slot-label">Add bee${required}</span>
                </div>
            `;
        }
    }
    container.innerHTML = html;
}

// Remove bee from slot
function removeBeeSlot(index) {
    currentEditingBees.splice(index, 1);
    renderBeeSlots();
    updateSaveHiveButton();
}

// Update save hive button state
function updateSaveHiveButton() {
    const btn = document.getElementById('save-hive-btn');
    const nameInput = document.getElementById('hive-name-input');

    if (!btn) return;

    const hasName = nameInput.value.trim().length > 0;
    const hasEnoughBees = currentEditingBees.length >= 2;

    btn.disabled = !hasName || !hasEnoughBees;
}

// Open bee creator modal
function openBeeCreator(index) {
    editingBeeIndex = index;
    generatedIconBase64 = null; // Reset

    const modal = document.getElementById('bee-creator-modal');
    const titleEl = document.getElementById('bee-creator-title');
    const generateBtn = document.getElementById('generate-icon-btn');
    const saveBtn = document.getElementById('save-bee-btn');
    const regenerateBtn = document.getElementById('regenerate-icon-btn');

    const humanNameInput = document.getElementById('bee-human-name-input');
    const nameInput = document.getElementById('bee-name-input');
    const descInput = document.getElementById('bee-desc-input');
    const roleInput = document.getElementById('bee-role-input');
    const previewIcon = document.getElementById('bee-preview-icon');
    const previewStatus = document.getElementById('bee-preview-status');

    const existingBee = currentEditingBees[index];
    if (existingBee) {
        titleEl.textContent = 'Edit Bee';
        humanNameInput.value = existingBee.human_name || '';
        nameInput.value = existingBee.name || '';
        descInput.value = existingBee.description || '';
        roleInput.value = existingBee.role || '';

        if (existingBee.icon_base64) {
            previewIcon.innerHTML = `<img src="data:image/png;base64,${existingBee.icon_base64}" alt="">`;
            previewStatus.textContent = 'Current icon';
            generatedIconBase64 = existingBee.icon_base64;
            // Show regenerate and confirm for editing
            generateBtn.style.display = 'none';
            regenerateBtn.style.display = 'inline-block';
            saveBtn.style.display = 'inline-block';
            saveBtn.textContent = 'Save Changes';
        } else {
            previewIcon.innerHTML = existingBee.emoji || '🐝';
            previewStatus.textContent = 'Click Generate Icon to create';
            generateBtn.style.display = 'inline-block';
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate Icon';
            regenerateBtn.style.display = 'none';
            saveBtn.style.display = 'none';
        }
    } else {
        titleEl.textContent = 'Add Bee';
        humanNameInput.value = '';
        nameInput.value = '';
        descInput.value = '';
        roleInput.value = '';
        previewIcon.innerHTML = '🐝';
        previewStatus.textContent = 'Fill in details, then generate icon';

        // Reset buttons
        generateBtn.style.display = 'inline-block';
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate Icon';
        regenerateBtn.style.display = 'none';
        saveBtn.style.display = 'none';
    }

    modal.classList.add('active');
}

// Close bee creator modal
function closeBeeCreator() {
    const modal = document.getElementById('bee-creator-modal');
    modal.classList.remove('active');
    editingBeeIndex = null;
}

// Temporary storage for generated icon
let generatedIconBase64 = null;

// Generate bee icon via API
async function generateBeeIcon() {
    const humanName = document.getElementById('bee-human-name-input').value.trim();
    const name = document.getElementById('bee-name-input').value.trim();
    const description = document.getElementById('bee-desc-input').value.trim();
    const role = document.getElementById('bee-role-input').value.trim();

    if (!humanName || !name || !description || !role) {
        alert('Please fill in all fields first.');
        return;
    }

    if (role.length < 10) {
        alert('Personality prompt must be at least 10 characters.');
        return;
    }

    const generateBtn = document.getElementById('generate-icon-btn');
    const previewIcon = document.getElementById('bee-preview-icon');
    const previewStatus = document.getElementById('bee-preview-status');
    const regenerateBtn = document.getElementById('regenerate-icon-btn');
    const saveBtn = document.getElementById('save-bee-btn');

    // Show loading state
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';
    previewIcon.innerHTML = '<div class="loading-spinner"></div>';
    previewStatus.textContent = 'Creating your bee icon with AI...';

    try {
        const response = await fetch(`${API_BASE}/api/custom-hives/generate-icon`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                bee_name: name,
                description: description
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to generate icon');
        }

        const result = await response.json();
        generatedIconBase64 = result.icon_base64;

        // Show the generated icon
        previewIcon.innerHTML = `<img src="data:image/png;base64,${generatedIconBase64}" alt="">`;
        previewStatus.textContent = 'Icon generated! Click Confirm to add bee.';

        // Show regenerate and confirm buttons
        regenerateBtn.style.display = 'inline-block';
        saveBtn.style.display = 'inline-block';
        generateBtn.style.display = 'none';

    } catch (error) {
        console.error('Icon generation failed:', error);
        previewIcon.innerHTML = '🐝';
        previewStatus.textContent = error.message || 'Icon generation failed. You can still add the bee.';

        // Allow adding without icon
        generatedIconBase64 = null;
        saveBtn.style.display = 'inline-block';
        saveBtn.textContent = 'Add Without Icon';
        generateBtn.textContent = 'Retry Generate';
        generateBtn.disabled = false;
    }
}

// Regenerate icon
async function regeneratePreviewIcon() {
    const regenerateBtn = document.getElementById('regenerate-icon-btn');
    const saveBtn = document.getElementById('save-bee-btn');
    const generateBtn = document.getElementById('generate-icon-btn');

    // Hide confirm, show generate
    regenerateBtn.style.display = 'none';
    saveBtn.style.display = 'none';
    generateBtn.style.display = 'inline-block';
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate Icon';

    // Generate new icon
    await generateBeeIcon();
}

// Save bee to slot
function saveBeeToSlot() {
    const humanName = document.getElementById('bee-human-name-input').value.trim();
    const name = document.getElementById('bee-name-input').value.trim();
    const description = document.getElementById('bee-desc-input').value.trim();
    const role = document.getElementById('bee-role-input').value.trim();

    if (!humanName || !name || !description || !role) {
        alert('Please fill in all fields.');
        return;
    }

    if (role.length < 10) {
        alert('Personality prompt must be at least 10 characters.');
        return;
    }

    const existingBee = currentEditingBees[editingBeeIndex];
    const bee = {
        ...(existingBee || {}),
        human_name: humanName,
        name: name,
        description: description,
        role: role,
        emoji: existingBee?.emoji || '🐝',
        display_order: editingBeeIndex,
        icon_base64: generatedIconBase64 || existingBee?.icon_base64 || null,
        icon_generation_status: generatedIconBase64 ? 'completed' : 'pending'
    };

    currentEditingBees[editingBeeIndex] = bee;
    generatedIconBase64 = null; // Reset

    closeBeeCreator();
    renderBeeSlots();
    updateSaveHiveButton();
}

// Save custom hive to backend
async function saveCustomHive() {
    const name = document.getElementById('hive-name-input').value.trim();
    const description = document.getElementById('hive-desc-input').value.trim();

    if (!name) {
        alert('Please enter a hive name.');
        return;
    }

    if (currentEditingBees.length < 2) {
        alert('A hive needs at least 2 bees to work.');
        return;
    }

    const saveBtn = document.getElementById('save-hive-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        const bees = currentEditingBees.map((bee, i) => ({
            name: bee.name,
            human_name: bee.human_name,
            emoji: bee.emoji || '🐝',
            description: bee.description,
            role: bee.role,
            display_order: i
        }));

        let response;
        if (editingHiveId) {
            // Update existing hive
            response = await fetch(`${API_BASE}/api/custom-hives/${editingHiveId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ name, description })
            });

            // TODO: Handle bee updates separately if needed
        } else {
            // Create new hive
            response = await fetch(`${API_BASE}/api/custom-hives`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ name, description, bees })
            });
        }

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to save hive');
        }

        const savedHive = await response.json();

        // Refresh custom hives
        await fetchCustomHives();

        // Close modal and refresh display
        closeHiveCreator();
        renderHivesModal();

        // Auto-select the new hive
        if (!editingHiveId) {
            selectHive(savedHive.id);
        }

    } catch (error) {
        console.error('Error saving custom hive:', error);
        alert(error.message || 'Failed to save hive. Please try again.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = editingHiveId ? 'Save Changes' : 'Create Hive';
    }
}

// Delete custom hive
async function deleteCustomHive(hiveId, event) {
    event.stopPropagation();

    if (!confirm('Are you sure you want to delete this custom hive? This cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/custom-hives/${hiveId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error('Failed to delete hive');
        }

        // If this was the selected hive, switch to default
        if (selectedHiveId === hiveId) {
            selectHive('chaos');
        }

        // Refresh custom hives
        await fetchCustomHives();
        renderHivesModal();

    } catch (error) {
        console.error('Error deleting custom hive:', error);
        alert('Failed to delete hive. Please try again.');
    }
}

// Make functions globally available
window.openHiveCreator = openHiveCreator;
window.closeHiveCreator = closeHiveCreator;
window.openBeeCreator = openBeeCreator;
window.closeBeeCreator = closeBeeCreator;
window.saveBeeToSlot = saveBeeToSlot;
window.saveCustomHive = saveCustomHive;
window.deleteCustomHive = deleteCustomHive;
window.removeBeeSlot = removeBeeSlot;
window.generateBeeIcon = generateBeeIcon;
window.regeneratePreviewIcon = regeneratePreviewIcon;

// Modals only close via X button or Cancel - no click outside

// Update save button when name input changes
document.getElementById('hive-name-input')?.addEventListener('input', updateSaveHiveButton);

// Create hive button click handler
document.getElementById('create-hive-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    console.log('Create hive button clicked');
    openHiveCreator();
});
