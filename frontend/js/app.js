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

// Built-in hive themes: gradient + accent color
const HIVE_THEMES = {
    'chaos':        { gradient: 'linear-gradient(135deg, #ff6b35 0%, #f7c948 100%)', accent: '#ff6b35', text: '#fff' },
    'friend-group': { gradient: 'linear-gradient(135deg, #f472b6 0%, #c084fc 100%)', accent: '#f472b6', text: '#fff' },
    'billionaire':  { gradient: 'linear-gradient(135deg, #fbbf24 0%, #a78bfa 100%)', accent: '#fbbf24', text: '#fff' },
    'internet':     { gradient: 'linear-gradient(135deg, #34d399 0%, #22d3ee 100%)', accent: '#34d399', text: '#fff' },
    'generations':  { gradient: 'linear-gradient(135deg, #60a5fa 0%, #818cf8 100%)', accent: '#60a5fa', text: '#fff' },
    'courtroom':    { gradient: 'linear-gradient(135deg, #6b7280 0%, #374151 100%)', accent: '#9ca3af', text: '#fff' },
};

// Preset colors for custom hives
const HIVE_COLOR_PRESETS = [
    '#ef4444', '#f97316', '#facc15', '#84cc16', '#22c55e',
    '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
    '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#78716c',
];

function getHiveStyle(hiveId, customColor) {
    if (HIVE_THEMES[hiveId]) return HIVE_THEMES[hiveId];
    if (customColor) return { gradient: `linear-gradient(135deg, ${customColor} 0%, ${customColor}88 100%)`, accent: customColor, text: '#fff' };
    return null;
}

function hiveCardStyleAttr(hiveId, customColor) {
    const theme = getHiveStyle(hiveId, customColor);
    if (!theme) return '';
    return `style="background:${theme.gradient};border-color:${theme.accent}44;"`;
}

function hiveCardTextClass(hiveId, customColor) {
    const theme = getHiveStyle(hiveId, customColor);
    return theme ? 'hive-themed' : '';
}

// Reverse lookup: hive display name → hive ID for built-in themes
const HIVE_NAME_TO_ID = {
    'Chaos': 'chaos', 'Friend Group': 'friend-group', 'Billionaire': 'billionaire',
    'Internet': 'internet', 'Generations': 'generations', 'Courtroom': 'courtroom',
};

function getHiveBadgeStyle(hiveName) {
    const hiveId = HIVE_NAME_TO_ID[hiveName];
    const theme = hiveId ? HIVE_THEMES[hiveId] : null;
    if (theme) return `style="background:${theme.gradient};"`;
    return '';
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
        color: '#facc15',
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
    // Hide sidebar toggle for guests (no debate history)
    const desktopToggle = document.getElementById('desktop-sidebar-toggle');
    const mobileToggle = document.getElementById('sidebar-toggle');
    if (desktopToggle) desktopToggle.style.display = 'none';
    if (mobileToggle) mobileToggle.style.display = 'none';

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
            <a href="/login#register" style="display: flex; align-items: center; justify-content: center; width: 100%; padding: 6px 12px; background: var(--primary-color); color: #ffffff; border-radius: 6px; font-weight: 500; font-size: 0.85rem; text-decoration: none;">
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

// Initialize guest menu - uses full-screen overlay approach
function initGuestMenu() {
    const overlay = document.getElementById('guest-menu-overlay');
    const backdrop = document.getElementById('guest-menu-backdrop');
    const themeToggle = document.getElementById('guest-theme-toggle');

    if (!overlay) return;

    const panel = document.getElementById('guest-menu-panel');

    function toggleOverlay(fromRight) {
        if (overlay.style.display === 'none' || !overlay.style.display) {
            if (panel) {
                if (fromRight) {
                    panel.style.left = 'auto';
                    panel.style.right = '8px';
                } else {
                    panel.style.left = '8px';
                    panel.style.right = 'auto';
                }
            }
            overlay.style.display = 'block';
        } else {
            overlay.style.display = 'none';
        }
    }

    // Desktop three dots (left side)
    const desktopBtn = document.getElementById('guest-menu-btn');
    if (desktopBtn) {
        desktopBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleOverlay(false);
        });
    }

    // Mobile three dots (right side)
    const mobileBtn = document.getElementById('mobile-profile-btn');
    if (mobileBtn) {
        // Remove old listeners by cloning
        const newBtn = mobileBtn.cloneNode(true);
        mobileBtn.parentNode.replaceChild(newBtn, mobileBtn);
        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleOverlay(true);
        });
    }

    // Close on backdrop click
    if (backdrop) {
        backdrop.addEventListener('click', () => {
            overlay.style.display = 'none';
        });
    }

    // Theme toggle
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
    // Show sidebar toggle (hamburger)
    const desktopToggle = document.getElementById('desktop-sidebar-toggle');
    const mobileToggle = document.getElementById('sidebar-toggle');
    if (desktopToggle) desktopToggle.style.display = 'flex';
    if (mobileToggle) mobileToggle.style.display = 'flex';

    // Hide guest menu
    const guestMenuWrapper = document.getElementById('guest-menu-wrapper');
    if (guestMenuWrapper) guestMenuWrapper.style.display = 'none';

    // Show desktop three-dots menu
    const desktopProfileWrapper = document.getElementById('desktop-profile-wrapper');
    if (desktopProfileWrapper) desktopProfileWrapper.style.display = 'block';

    // Wire up desktop three-dots to open the mobile profile dropdown (reuse same dropdown)
    const desktopProfileBtn = document.getElementById('desktop-profile-btn');
    if (desktopProfileBtn && !desktopProfileBtn._bound) {
        desktopProfileBtn._bound = true;
        desktopProfileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById('mobile-profile-dropdown');
            if (dropdown) dropdown.classList.toggle('open');
        });
    }

    // Show admin buttons if admin (run here too to catch all elements)
    const isAdmin = currentUser && currentUser.email && currentUser.email.toLowerCase() === 'michael24011@icloud.com';
    ['desktop-admin-btn', 'mobile-admin-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isAdmin ? 'flex' : 'none';
    });
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

// Session-based guest buzz tracking (resets every new tab/session)
const GUEST_SESSION_LIMIT = 3;

function getGuestBuzzesUsed() {
    return parseInt(sessionStorage.getItem('guestBuzzes') || '0', 10);
}

function incrementGuestBuzzes() {
    const used = getGuestBuzzesUsed() + 1;
    sessionStorage.setItem('guestBuzzes', String(used));
    return used;
}

function checkGuestSessionLimit() {
    if (localStorage.getItem('token')) return true; // logged in, skip
    return getGuestBuzzesUsed() < GUEST_SESSION_LIMIT;
}

function showLimitNotification(detail) {
    const overlay = document.getElementById('limit-notification');
    const title = document.getElementById('limit-title');
    const message = document.getElementById('limit-message');
    const buttons = document.getElementById('limit-buttons');
    if (!overlay) return;

    const isGuest = !localStorage.getItem('token');

    if (isGuest) {
        title.textContent = 'Want More Buzzes?';
        message.textContent = 'You\'ve used your free buzzes for this session. Create a free account to get 20 buzzes per month!';
        buttons.innerHTML = `
            <button class="btn btn-secondary" onclick="document.getElementById('limit-notification').style.display='none'">Maybe Later</button>
            <button class="btn btn-primary" onclick="window.location.href='/login#register'">Sign Up Free</button>
        `;
    } else {
        title.textContent = 'Monthly Limit Reached';
        message.textContent = 'You\'ve used all 20 buzzes this month. Upgrade to Pro for unlimited buzzes!';
        buttons.innerHTML = `
            <button class="btn btn-secondary" onclick="document.getElementById('limit-notification').style.display='none'">Maybe Later</button>
            <button class="btn btn-primary" onclick="window.location.href='/pricing'">Upgrade to Pro</button>
        `;
    }

    overlay.style.display = 'flex';
}
window.showLimitNotification = showLimitNotification;

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
    // All models use app-level xAI key
    configuredProviders = new Set(['xai']);
    window.configuredProviders = configuredProviders;
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

// Model selection hidden - all bees use Grok
function renderModelTags() {
    const section = document.getElementById('setup-section');
    if (section) section.style.display = 'none';
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

// Help button - reopen tutorial
document.getElementById('help-btn')?.addEventListener('click', () => {
    showTutorial();
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
    const desktopProfileBtn = document.getElementById('desktop-profile-btn');
    if (profileDropdown && !profileDropdown.contains(e.target) && !profileBtn?.contains(e.target) && !desktopProfileBtn?.contains(e.target)) {
        profileDropdown.classList.remove('open');
    }
    const deskProfileBtn = document.getElementById('desktop-profile-btn');
    if (mobileProfileDropdown && !mobileProfileDropdown.contains(e.target) && !mobileProfileBtn?.contains(e.target) && !deskProfileBtn?.contains(e.target)) {
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

    // Show admin button only for admin email
    const isAdmin = email && email.toLowerCase() === 'michael24011@icloud.com';
    ['desktop-admin-btn', 'mobile-admin-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isAdmin ? 'flex' : 'none';
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
    // Initialize the main tab indicator position
    requestAnimationFrame(() => requestAnimationFrame(() => updateMainTabIndicator()));
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
        // Hide quick template chips when typing
        const quickTemplates = document.getElementById('quick-templates');
        if (quickTemplates) {
            quickTemplates.style.display = chatInput.value.trim() ? 'none' : '';
        }
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
        // chat.js may not have loaded yet, so retry after a delay
        function tryLoadHistory() {
            if (typeof loadChatHistory === 'function') {
                loadChatHistory();
            } else {
                setTimeout(tryLoadHistory, 200);
            }
        }
        tryLoadHistory();

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

        // Check if this is a shared decision deep link
        const pathMatch = window.location.pathname.match(/^\/decision\/([a-zA-Z0-9-]+)/);
        if (pathMatch) {
            const decisionId = pathMatch[1];
            // Open decisions feed and scroll to this specific decision
            setTimeout(() => openSharedDecision(decisionId), 300);
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

    // Hide overlay - no longer needed (app uses server-side API keys)
    if (appOverlay) {
        appOverlay.style.display = 'none';
    }

    // Next button is always enabled (just a welcome screen now)
    if (nextBtn) {
        nextBtn.disabled = false;
    }
}

function updateTutorialStep() {
    // Show the single welcome step
    const currentStep = document.querySelector('.tutorial-step[data-step="1"]');
    if (currentStep) currentStep.style.display = 'block';

    const titleEl = document.getElementById('tutorial-title');
    if (titleEl) titleEl.textContent = 'Welcome';

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
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            hideTutorial();
        });
    }
}

// Check if should show setup wizard
function checkShowTutorial() {
    // Setup listeners first
    setupTutorialListeners();

    const completed = localStorage.getItem('tutorialCompleted');

    if (!completed) {
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
    'billionaire-builder': { bg: 'rgba(250, 204, 21, 0.15)', border: '#facc15', text: '#eab308' }, // Amber
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
    'gen-millennial': { bg: 'rgba(250, 204, 21, 0.15)', border: '#facc15', text: '#eab308' },     // Amber
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
    'billionaire': { bg: 'rgba(250, 204, 21, 0.15)', border: '#facc15', text: '#eab308' },
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

// Expose hive state to window for cross-script access (chat.js)
window.selectedHiveId = selectedHiveId;
window.customHives = customHives;
window.selectedSpecialBees = selectedSpecialBees;

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
    window.selectedHiveId = hiveId;
    saveSelectedHive();
    updateAllPersonalities();

    // Use stored per-hive selections if available, otherwise all bees
    const storedSelections = window._hiveBeeSelections && window._hiveBeeSelections[hiveId];
    if (storedSelections && storedSelections.length > 0) {
        selectedPersonalities = [...storedSelections];
    } else {
        const customHive = customHives.find(h => h.id === hiveId);
        if (customHive) {
            selectedPersonalities = customHive.bees.map(p => p.id);
        } else {
            const hive = allHives.find(h => h.id === hiveId);
            if (hive) {
                selectedPersonalities = hive.personalities.map(p => p.id);
            }
        }
    }
    // Add any selected special bees
    selectedSpecialBees.forEach(specialId => {
        if (!selectedPersonalities.includes(specialId)) {
            selectedPersonalities.push(specialId);
        }
    });
    saveSelectedBees();

    // Clear stored selections for this hive since it's now the active one
    if (window._hiveBeeSelections) delete window._hiveBeeSelections[hiveId];

    // Update UI
    renderVoicesBar();
    updateCurrentHiveDisplay();
    closeHivesModal();
}

// Select hive from within modal (doesn't close modal, shows bee toggles)
function selectHiveInModal(hiveId) {
    if (hiveId === selectedHiveId) return; // Already selected
    selectedHiveId = hiveId;
    window.selectedHiveId = hiveId;
    saveSelectedHive();
    updateAllPersonalities();

    // Use stored per-hive selections if available, otherwise all bees
    const storedSelections = window._hiveBeeSelections && window._hiveBeeSelections[hiveId];
    if (storedSelections && storedSelections.length > 0) {
        selectedPersonalities = [...storedSelections];
    } else {
        const customHive = customHives.find(h => h.id === hiveId);
        if (customHive) {
            selectedPersonalities = customHive.bees.map(p => p.id);
        } else {
            const hive = allHives.find(h => h.id === hiveId);
            if (hive) {
                selectedPersonalities = hive.personalities.map(p => p.id);
            }
        }
    }
    // Add any selected special bees
    selectedSpecialBees.forEach(specialId => {
        if (!selectedPersonalities.includes(specialId)) {
            selectedPersonalities.push(specialId);
        }
    });
    saveSelectedBees();

    // Clear stored selections for this hive since it's now the active one
    if (window._hiveBeeSelections) delete window._hiveBeeSelections[hiveId];

    updateCurrentHiveDisplay();
    renderVoicesBar();
    renderHivesModal();
}

// Toggle special bee from within hive modal
function toggleSpecialBeeInModal(beeId) {
    toggleSpecialBee(beeId);
    renderHivesModal();
    updateEmptyStateHiveCard();
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

    // Update empty state hive card
    updateEmptyStateHiveCard();

    // Update hive chip in input area
    updateHiveChip();
}

function updateHiveChip() {
    const chipBar = document.getElementById('hive-chip-bar');
    const chipName = document.getElementById('hive-chip-name');
    const chipIcon = document.getElementById('hive-chip-icon');
    if (!chipBar || !chipName) return;

    let hiveName = 'Choose Hive';
    let iconSrc = '/bee-icon.png';

    const customHive = customHives.find(h => h.id === selectedHiveId);
    if (customHive) {
        hiveName = customHive.name;
    } else {
        const hive = allHives.find(h => h.id === selectedHiveId);
        if (hive) {
            hiveName = hive.name;
            // Use first bee's icon as hive icon
            if (hive.personalities && hive.personalities.length > 0) {
                const pid = hive.personalities[0].id;
                if (typeof getBeeIconPath === 'function') {
                    iconSrc = getBeeIconPath(pid);
                }
            }
        }
    }

    chipName.textContent = hiveName;
    if (chipIcon) chipIcon.src = iconSrc;
}

function updateEmptyStateHiveCard() {
    const card = document.getElementById('empty-state-hive-card');
    if (!card) return;

    const nameEl = document.getElementById('empty-hive-name');
    const descEl = document.getElementById('empty-hive-desc');
    const beesEl = document.getElementById('empty-hive-bees');

    // Find current hive data
    const customHive = customHives.find(h => h.id === selectedHiveId);
    let hiveName = 'Choose Hive';
    let hiveDesc = 'Tap to select a hive';
    let bees = [];
    let isCustom = false;

    if (customHive) {
        hiveName = customHive.name;
        hiveDesc = customHive.description || 'Your custom hive';
        bees = customHive.bees || [];
        isCustom = true;
    } else {
        const hive = allHives.find(h => h.id === selectedHiveId);
        if (hive) {
            hiveName = hive.name;
            hiveDesc = hive.description || '';
            bees = hive.personalities || [];
        }
    }

    // Add special bees
    const specialBees = [];
    selectedSpecialBees.forEach(specialId => {
        const sb = allSpecialBees.find(b => b.id === specialId);
        if (sb) specialBees.push(sb);
    });

    if (nameEl) nameEl.innerHTML = hiveName + ' <svg class="hive-name-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
    if (descEl) descEl.textContent = hiveDesc;
    if (beesEl) beesEl.innerHTML = renderHoneycombHex(bees, specialBees, isCustom);

    // Apply hive accent color to name
    const theme = getHiveStyle(isCustom ? null : selectedHiveId, isCustom ? (customHive && customHive.color) : null);
    if (nameEl) {
        nameEl.style.color = theme ? theme.accent : 'var(--text-primary)';
    }
}

// Open hives modal
async function openHivesModal() {
    const modal = document.getElementById('hives-modal');
    if (modal) {
        pendingHiveId = null;
        window._expandedHiveId = selectedHiveId; // Auto-expand current hive
        modal.classList.add('active');
        // Clear search
        const searchInput = document.getElementById('hives-search-input');
        if (searchInput) searchInput.value = '';
        window._hivesSearchQuery = '';
        // Load favorites + community hives in parallel
        const token = localStorage.getItem('token');
        const promises = [];
        if (token) {
            promises.push(
                fetch(`${API_BASE}/api/custom-hives/favorites`, { headers: getAuthHeaders() })
                    .then(r => r.ok ? r.json() : []).catch(() => [])
                    .then(data => { window._favoritedHives = data; })
            );
        }
        // Fetch community hives
        const communityHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};
        promises.push(
            fetch(`${API_BASE}/api/custom-hives/explore?sort=popular`, { headers: communityHeaders })
                .then(r => r.ok ? r.json() : []).catch(() => [])
                .then(data => { window._communityHives = data; })
        );
        await Promise.all(promises);
        renderHivesModal();
        renderCommunityHives();
    }
}

// Close hives modal
function closeHivesModal() {
    const modal = document.getElementById('hives-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    // If retry flag was set (from "Try Another Hive" button), auto-send
    if (window._retryAfterHiveSelect && typeof retryWithNewHive === 'function') {
        setTimeout(() => retryWithNewHive(), 100);
    }
}

// Track which hive card is expanded
window._expandedHiveId = null;

// Expand a hive card to show bee toggles
function expandHiveCard(hiveId) {
    if (window._expandedHiveId === hiveId) {
        window._expandedHiveId = null;
    } else {
        window._expandedHiveId = hiveId;
    }
    renderHivesModal();
}

// Render honeycomb hexagon grid (7 slots: rows of 2-3-2)
function renderHoneycombHex(hiveBees, specialBees, isCustom) {
    // Build list of all bees with active status (only include active/selected ones)
    const allBeeSlots = [];
    hiveBees.forEach(p => {
        const active = selectedPersonalities.includes(p.id);
        allBeeSlots.push({ bee: p, active, isCustom });
    });
    specialBees.forEach(p => {
        const active = selectedPersonalities.includes(p.id);
        allBeeSlots.push({ bee: p, active, isCustom: false });
    });

    // Pad to 7 slots
    while (allBeeSlots.length < 7) {
        allBeeSlots.push({ bee: null, active: false, isCustom: false });
    }

    function renderHexSlot(slot) {
        if (!slot.bee || !slot.active) {
            return `<div class="hex-slot"><div class="hex-shape hex-empty"></div></div>`;
        }
        const p = slot.bee;
        let iconHtml;
        if (slot.isCustom) {
            iconHtml = p.icon_base64
                ? `<img class="hex-bee-icon" src="data:image/png;base64,${p.icon_base64}" alt="">`
                : `<span class="hex-bee-emoji">${p.emoji || '🐝'}</span>`;
        } else {
            const iPath = getBeeIconPath(p.id);
            iconHtml = `<img class="hex-bee-icon" src="${iPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png'">`;
        }
        return `<div class="hex-slot" title="${p.human_name || p.name}"><div class="hex-shape hex-filled">${iconHtml}</div></div>`;
    }

    // Rows: 2 - 3 - 2
    const row1 = allBeeSlots.slice(0, 2).map(renderHexSlot).join('');
    const row2 = allBeeSlots.slice(2, 5).map(renderHexSlot).join('');
    const row3 = allBeeSlots.slice(5, 7).map(renderHexSlot).join('');

    return `<div class="hex-row">${row1}</div><div class="hex-row">${row2}</div><div class="hex-row">${row3}</div>`;
}

// Render small bee icon previews (used in hive modal collapsed state)
function renderBeePreviewIcons(bees, isCustom) {
    function beeIcon(p) {
        if (isCustom) {
            return p.icon_base64
                ? `<img class="bee-preview-icon" src="data:image/png;base64,${p.icon_base64}" alt="">`
                : `<span class="bee-preview-emoji">${p.emoji || '🐝'}</span>`;
        }
        const iPath = getBeeIconPath(p.id);
        return `<img class="bee-preview-icon" src="${iPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png'">`;
    }
    function hexItem(p) {
        return `<div class="bee-preview-item" title="${p.human_name || p.name}">${beeIcon(p)}</div>`;
    }
    // Arrange in honeycomb rows: 2-3-2 for 5+, 1-2-1 for 4, 1-2 for 3, etc.
    const items = bees.slice(0, 7);
    let rows;
    if (items.length >= 5) {
        rows = [items.slice(0, 2), items.slice(2, 5), items.slice(5, 7)];
    } else if (items.length === 4) {
        rows = [items.slice(0, 1), items.slice(1, 3), items.slice(3, 4)];
    } else if (items.length === 3) {
        rows = [items.slice(0, 1), items.slice(1, 3)];
    } else {
        rows = [items];
    }
    return `<div class="mini-honeycomb">${rows.filter(r => r.length).map(row =>
        `<div class="mini-hex-row">${row.map(p => hexItem(p)).join('')}</div>`
    ).join('')}</div>`;
}

// Per-hive bee selections (tracks toggled bees for non-selected hives)
if (!window._hiveBeeSelections) window._hiveBeeSelections = {};

function getHiveBeeSelections(hiveId) {
    if (hiveId === selectedHiveId) {
        // For selected hive, use the actual selectedPersonalities (filter to this hive's bees)
        const hiveBeeIds = getHiveBeeIds(hiveId);
        return hiveBeeIds.filter(id => selectedPersonalities.includes(id));
    }
    if (window._hiveBeeSelections[hiveId]) return window._hiveBeeSelections[hiveId];
    // Default: all bees selected
    return getHiveBeeIds(hiveId);
}

// Render clickable bees for a hive card (expanded state)
function renderHiveBeeToggles(bees, hiveId, isCustom) {
    const activeBees = getHiveBeeSelections(hiveId);
    return bees.map(p => {
        const isActive = activeBees.includes(p.id);
        let iconHtml;
        if (isCustom) {
            iconHtml = p.icon_base64
                ? `<img class="bee-toggle-icon" src="data:image/png;base64,${p.icon_base64}" alt="">`
                : `<span style="font-size:1.5rem;">${p.emoji || '🐝'}</span>`;
        } else {
            const iPath = getBeeIconPath(p.id);
            iconHtml = `<img class="bee-toggle-icon" src="${iPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png'">`;
        }
        const desc = p.description ? `<div class="bee-toggle-desc">${p.description}</div>` : '';
        return `<div class="hive-bee-toggle ${isActive ? 'active' : ''}" onclick="event.stopPropagation(); toggleBeeInModal('${p.id}', '${hiveId}')">
            ${iconHtml}
            <div>
                <div class="bee-toggle-name">${p.human_name || p.name}</div>
                ${desc}
            </div>
        </div>`;
    }).join('');
}

// Toggle a bee on/off from within the hive modal
function toggleBeeInModal(personalityId, hiveId) {
    if (hiveId === selectedHiveId) {
        // Toggle on the selected hive - directly update selectedPersonalities
        const index = selectedPersonalities.indexOf(personalityId);
        if (index >= 0) {
            const hiveBeeIds = getHiveBeeIds(selectedHiveId);
            const activeHiveBees = hiveBeeIds.filter(id => selectedPersonalities.includes(id));
            if (activeHiveBees.length <= 1 && hiveBeeIds.includes(personalityId)) {
                return; // Keep at least 1 bee selected
            }
            selectedPersonalities.splice(index, 1);
        } else {
            if (selectedPersonalities.length < 7) {
                selectedPersonalities.push(personalityId);
            }
        }
        saveSelectedBees();
        updateAllPersonalities();
        renderVoicesBar();
    } else {
        // Toggle on a non-selected hive - track separately
        let selections = window._hiveBeeSelections[hiveId];
        if (!selections) {
            selections = getHiveBeeIds(hiveId); // start with all selected
            window._hiveBeeSelections[hiveId] = selections;
        }
        const idx = selections.indexOf(personalityId);
        if (idx >= 0) {
            if (selections.length <= 1) return; // Keep at least 1
            selections.splice(idx, 1);
        } else {
            if (selections.length < 7) selections.push(personalityId);
        }
    }
    renderHivesModal();
    updateEmptyStateHiveCard();
}

// Get bee IDs for a hive
function getHiveBeeIds(hiveId) {
    const customHive = customHives.find(h => h.id === hiveId);
    if (customHive) return customHive.bees.map(p => p.id);
    const builtIn = allHives.find(h => h.id === hiveId);
    if (builtIn) return builtIn.personalities.map(p => p.id);
    return [];
}

// Render hives modal content
function renderHivesModal() {
    const hivesGrid = document.getElementById('hives-grid');

    if (hivesGrid) {
        // Helper: render add-on bees inside a hive card (only for selected hive)
        function renderAddonBeesForCard() {
            if (!allSpecialBees.length) return '';
            const addonBeesHtml = allSpecialBees.map(bee => {
                const isActive = selectedSpecialBees.includes(bee.id);
                const iconPath = getBeeIconPath(bee.id);
                return `<div class="addon-bee-toggle ${isActive ? 'active' : ''}" data-bee="${bee.id}" onclick="event.stopPropagation(); toggleSpecialBeeInModal('${bee.id}')">
                    <img class="bee-toggle-icon" src="${iconPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png'">
                    <div>
                        <div class="bee-toggle-name">${bee.human_name}</div>
                        <div class="bee-toggle-desc">${bee.description}</div>
                    </div>
                </div>`;
            }).join('');
            return `<div class="hive-card-addon-section">
                <div class="hive-modal-addon-title">+ Add-on Bees</div>
                <div class="hive-modal-addon-bees">${addonBeesHtml}</div>
            </div>`;
        }

        // Helper: render a hive card (works for custom, fav, and built-in)
        function renderHiveCard(hive, opts = {}) {
            const { isCustom = false, isFav = false, badgeText = '', badgeStyle = '' } = opts;
            const isSelected = hive.id === selectedHiveId;
            const isExpanded = window._expandedHiveId === hive.id;
            const bees = isCustom || isFav ? (hive.bees || []) : (hive.personalities || []);
            const themed = hiveCardTextClass((!isCustom && !isFav) ? hive.id : null, (isCustom || isFav) ? hive.color : null);
            const styleAttr = hiveCardStyleAttr((!isCustom && !isFav) ? hive.id : null, (isCustom || isFav) ? hive.color : null);

            // Badge HTML
            let badgeHtml = '';
            if (badgeText) {
                badgeHtml = `<span class="custom-badge" ${badgeStyle ? `style="${badgeStyle}"` : ''}>${badgeText}</span>`;
            }

            const hiveName = isCustom || isFav ? escapeHtml(hive.name) : hive.name;
            const hiveDesc = isCustom || isFav ? escapeHtml(hive.description || (isCustom ? 'Your custom hive' : '')) : hive.description;

            if (isExpanded) {
                // Expanded: stacked layout with full bee toggles
                const beesHtml = renderHiveBeeToggles(bees, hive.id, isCustom || isFav);

                let customButtons = '';
                if (isCustom) {
                    customButtons = `<div style="display: flex; gap: 8px; margin-top: 4px;">
                        <button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); openHiveCreator('${hive.id}')" style="font-size: 0.7rem; padding: 4px 8px;">Edit Hive</button>
                        <button class="btn btn-secondary btn-small" onclick="deleteCustomHive('${hive.id}', event)" style="font-size: 0.7rem; padding: 4px 8px; color: var(--error-color);">Delete</button>
                    </div>`;
                }

                return `
                <div class="hive-card expanded ${isSelected ? 'selected' : ''} ${themed}" ${styleAttr}>
                    <div class="hive-card-header">
                        <span class="hive-card-name">${hiveName}</span>
                        ${badgeHtml}
                        <button class="hive-card-collapse" onclick="event.stopPropagation(); expandHiveCard('${hive.id}')">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
                        </button>
                    </div>
                    <div class="hive-card-desc">${hiveDesc}</div>
                    <div class="hive-card-bees-expanded">
                        ${beesHtml}
                    </div>
                    ${renderAddonBeesForCard()}
                    ${customButtons}
                    <button class="hive-card-choose hive-card-select" onclick="event.stopPropagation(); selectHive('${hive.id}')">
                        ${isSelected ? 'Selected' : 'Select'}
                    </button>
                </div>`;
            } else {
                // Collapsed: horizontal row - [info] [previews] [button]
                const previewHtml = renderBeePreviewIcons(bees, isCustom || isFav);

                return `
                <div class="hive-card ${isSelected ? 'selected' : ''} ${themed}" ${styleAttr} onclick="expandHiveCard('${hive.id}')">
                    <div class="hive-card-info">
                        <div class="hive-card-header">
                            <span class="hive-card-name">${hiveName}</span>
                            ${badgeHtml}
                        </div>
                        <div class="hive-card-desc">${hiveDesc}</div>
                    </div>
                    <div class="hive-card-bees-preview">
                        ${previewHtml}
                    </div>
                </div>`;
            }
        }

        const query = (window._hivesSearchQuery || '').toLowerCase();

        // Filter helper - searches hive name, description, and bee names
        function matchesSearch(hive, isCustomOrFav) {
            if (!query) return true;
            const name = (hive.name || '').toLowerCase();
            const desc = (hive.description || '').toLowerCase();
            if (name.includes(query) || desc.includes(query)) return true;
            // Search bee names
            const bees = isCustomOrFav ? (hive.bees || []) : (hive.personalities || []);
            return bees.some(b => {
                const beeName = (b.human_name || b.name || '').toLowerCase();
                const beeDesc = (b.description || '').toLowerCase();
                return beeName.includes(query) || beeDesc.includes(query);
            });
        }

        // Built-in hives first
        const filteredBuiltIn = allHives.filter(h => matchesSearch(h, false));
        const builtInHtml = filteredBuiltIn.map(hive => renderHiveCard(hive)).join('');

        // Render custom hives
        let customHtml = '';
        if (customHives && customHives.length > 0) {
            const filteredCustom = customHives.filter(h => matchesSearch(h, true));
            if (filteredCustom.length > 0) {
                customHtml = '<div class="hive-section-label">Your Hives</div>';
                customHtml += filteredCustom.map(hive => renderHiveCard(hive, { isCustom: true, badgeText: 'Custom' })).join('');
            }
        }

        // Render favorited hives
        let favHtml = '';
        if (window._favoritedHives && window._favoritedHives.length > 0) {
            const filteredFav = window._favoritedHives.filter(h => matchesSearch(h, true));
            if (filteredFav.length > 0) {
                favHtml = '<div class="hive-section-label">Favorites</div>';
                favHtml += filteredFav.map(hive => renderHiveCard(hive, { isFav: true, badgeText: 'Fav', badgeStyle: 'background:rgba(239,68,68,0.1);color:#ef4444;' })).join('');
            }
        }

        // Show empty state if no results
        if (!filteredBuiltIn.length && !customHtml && !favHtml && query) {
            hivesGrid.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:0.9rem;">No hives found for "' + escapeHtml(query) + '"</div>';
        } else {
            hivesGrid.innerHTML = builtInHtml + customHtml + favHtml;
        }
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
    updateEmptyStateHiveCard();
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

// Search hives in modal
let _hivesSearchTimeout;
function searchHivesModal() {
    clearTimeout(_hivesSearchTimeout);
    _hivesSearchTimeout = setTimeout(() => {
        const q = document.getElementById('hives-search-input')?.value.trim() || '';
        window._hivesSearchQuery = q;
        // Collapse expanded cards when searching to show more results
        if (q) window._expandedHiveId = null;
        renderHivesModal();
        renderCommunityHives();
    }, 150);
}
window.searchHivesModal = searchHivesModal;

// Render community hives in hive modal
function renderCommunityHives() {
    const grid = document.getElementById('community-hives-grid');
    const section = document.getElementById('community-hives-section');
    if (!grid || !section) return;

    const hives = window._communityHives || [];
    const query = (window._hivesSearchQuery || '').toLowerCase();
    const filtered = query ? hives.filter(h =>
        (h.name || '').toLowerCase().includes(query) ||
        (h.description || '').toLowerCase().includes(query) ||
        (h.tags || '').toLowerCase().includes(query) ||
        (h.bees || []).some(b =>
            (b.human_name || b.name || '').toLowerCase().includes(query) ||
            (b.description || '').toLowerCase().includes(query)
        )
    ) : hives;

    if (!filtered.length) {
        section.style.display = query ? 'none' : 'block';
        grid.innerHTML = '<div class="explore-empty" style="font-size:0.85rem;">No community hives yet.</div>';
        return;
    }
    section.style.display = 'block';

    grid.innerHTML = filtered.map(hive => {
        const beesHtml = (hive.bees || []).slice(0, 5).map(bee => {
            const iconSrc = bee.icon_base64
                ? `data:image/png;base64,${bee.icon_base64}`
                : '/images/bee-icons/default bee icon.png';
            return `<div class="explore-card-bee" style="gap:4px;">
                <img src="${iconSrc}" alt="" style="width:24px;height:24px;border-radius:50%;" onerror="this.src='/images/bee-icons/default bee icon.png'">
                <span style="font-size:0.7rem;">${bee.human_name || bee.name}</span>
            </div>`;
        }).join('');

        const heartClass = hive.is_favorited ? 'hearted' : '';
        const favCount = hive.favorite_count || 0;
        const ehStyle = hive.color ? `style="background:linear-gradient(135deg, ${hive.color}22 0%, ${hive.color}11 100%);border-color:${hive.color}44;"` : '';

        return `<div class="explore-hive-card" ${ehStyle} onclick="openHiveDetail('${hive.id}')">
            <div class="explore-card-header" style="margin-bottom:6px;">
                <span class="explore-card-name" style="font-size:0.85rem;font-weight:600;">${escapeHtml(hive.name)}</span>
                <button class="explore-heart-btn ${heartClass}" onclick="event.stopPropagation(); toggleFavorite('${hive.id}', this)" style="padding:2px;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="${hive.is_favorited ? '#ef4444' : 'none'}" stroke="${hive.is_favorited ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    <span class="fav-count" style="font-size:0.7rem;">${favCount}</span>
                </button>
            </div>
            <div style="font-size:0.7rem;color:var(--text-secondary);margin-bottom:4px;">by ${escapeHtml(hive.creator_name || 'Anonymous')}</div>
            ${hive.description ? `<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px;">${escapeHtml(hive.description)}</div>` : ''}
            <div style="display:flex;flex-wrap:wrap;gap:4px;">${beesHtml}</div>
        </div>`;
    }).join('');
}
window.renderCommunityHives = renderCommunityHives;
window.toggleSpecialBeeFromDropdown = toggleSpecialBeeFromDropdown;

// Make functions globally available
window.openHivesModal = openHivesModal;
window.closeHivesModal = closeHivesModal;
window.selectHive = selectHive;
window.handleQuestionSubmit = handleQuestionSubmit;
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

    // Check guest session limit before starting
    if (!checkGuestSessionLimit()) {
        showLimitNotification('Session limit reached.');
        return;
    }

    // All bees use Grok 4
    const modelsConfig = selectedPersonalities.map(personalityId => ({
        provider: 'xai',
        model_id: 'grok-4-fast-reasoning',
        model_name: 'Grok 4',
        personality_id: personalityId,
        role: ''
    }));

    // Update selectedModels global (used by chat.js)
    selectedModels = modelsConfig;
    saveSelectedModels();

    // Hide empty state
    const emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.style.display = 'none';

    // Show chat input area
    const inputArea = document.getElementById('chat-input-area');
    if (inputArea) inputArea.style.display = 'block';

    // Show and update hive chip
    const hiveChipBar = document.getElementById('hive-chip-bar');
    if (hiveChipBar) hiveChipBar.style.display = '';
    updateHiveChip();

    // Add user message as big bold header
    const container = document.getElementById('chat-messages');
    const userMsg = document.createElement('div');
    userMsg.className = 'question-header';
    userMsg.innerHTML = `<div class="question-header-text debate-running" onclick="stopDiscussion()"><span class="q-text">${escapeHtml(currentQuestion)}</span><button id="floating-stop-btn" class="q-pause-btn visible" onclick="event.stopPropagation(); stopDiscussion()"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button></div>`;
    container.appendChild(userMsg);

    // Show buzz thinking indicator
    if (typeof showBuzzThinking === 'function') {
        showBuzzThinking();
    }

    // Store question and start debate
    const questionToSend = currentQuestion;

    // Save for "Try Another Hive" retry
    if (typeof lastSentMessage !== 'undefined') {
        lastSentMessage = questionToSend;
    }

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
            const errorData = await response.json().catch(() => ({}));
            showLimitNotification(errorData.detail || 'Buzz limit reached.');
            return;
        }

        if (!response.ok) {
            // Auto-retry once on server errors
            if (response.status >= 500) {
                console.log('[debate] Server error, retrying...');
                await new Promise(r => setTimeout(r, 1000));
                const retryResponse = await fetch(`${API_BASE}/api/debates`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(requestBody)
                });
                if (!retryResponse.ok) {
                    const errData = await retryResponse.json().catch(() => ({}));
                    throw new Error(errData.detail || 'Failed to start session');
                }
                var session = await retryResponse.json();
            } else {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || 'Failed to start session');
            }
        } else {
            var session = await response.json();
        }
        currentSessionId = session.id;

        // Track guest session buzzes
        if (!localStorage.getItem('token')) {
            incrementGuestBuzzes();
        }

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
        alert(error.message || 'Failed to start debate. Please try again.');
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
                // Hide chips immediately
                const quickTemplates = document.getElementById('quick-templates');
                if (quickTemplates) quickTemplates.style.display = 'none';
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

// Set up looping marquee for quick-template chips: measure one set, then duplicate for seamless loop
function setupQuickTemplatesMarquee() {
    const strip = document.getElementById('quick-templates');
    if (!strip) return;
    const track = strip.querySelector('.quick-templates-track');
    if (!track || track.dataset.marqueeReady === '1') return;

    const build = () => {
        if (track.dataset.marqueeReady === '1') return;
        if (!track.getBoundingClientRect().width) {
            requestAnimationFrame(build);
            return;
        }
        // Pause animation while we mutate so the loop doesn't visibly skip
        track.style.animation = 'none';
        const firstOriginal = track.children[0];
        const originals = Array.from(track.children);
        originals.forEach(el => {
            const clone = el.cloneNode(true);
            clone.setAttribute('aria-hidden', 'true');
            clone.setAttribute('tabindex', '-1');
            clone.addEventListener('click', () => {
                const question = clone.dataset.question;
                const chatInput = document.getElementById('chat-input');
                if (chatInput) {
                    chatInput.value = question;
                    chatInput.focus();
                    strip.style.display = 'none';
                    chatInput.dispatchEvent(new Event('input'));
                }
            });
            track.appendChild(clone);
        });
        // Measure the EXACT distance from the first original to the first clone
        // (this includes the inter-chip gap so the loop is seamless)
        const firstClone = track.children[originals.length];
        const distance = firstClone.offsetLeft - firstOriginal.offsetLeft;
        strip.style.setProperty('--marquee-distance', distance + 'px');
        track.dataset.marqueeReady = '1';
        // Force reflow then restart the animation cleanly
        void track.offsetWidth;
        track.style.animation = '';
        // Touch pause: holding/dragging a finger over the strip pauses the marquee
        const pause = () => strip.classList.add('paused');
        const resume = () => strip.classList.remove('paused');
        strip.addEventListener('touchstart', pause, { passive: true });
        strip.addEventListener('touchend', resume, { passive: true });
        strip.addEventListener('touchcancel', resume, { passive: true });
    };

    const start = () => requestAnimationFrame(() => requestAnimationFrame(build));
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(start);
    } else {
        start();
    }
}
setupQuickTemplatesMarquee();

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
            window.customHives = customHives;
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
let selectedHiveColor = '';

function initColorPicker() {
    const picker = document.getElementById('hive-color-picker');
    if (!picker) return;
    // Keep the "no color" option, add preset colors
    const noColorBtn = picker.querySelector('.hive-color-option');
    picker.innerHTML = '';
    picker.appendChild(noColorBtn);
    HIVE_COLOR_PRESETS.forEach(color => {
        const opt = document.createElement('div');
        opt.className = 'hive-color-option';
        opt.dataset.color = color;
        opt.style.background = color;
        opt.onclick = function() { selectHiveColor(this, color); };
        picker.appendChild(opt);
    });
}

function selectHiveColor(el, color) {
    selectedHiveColor = color;
    document.querySelectorAll('.hive-color-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
}
window.selectHiveColor = selectHiveColor;

function openHiveCreator(hiveId) {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Please log in to create custom hives.');
        return;
    }

    editingHiveId = hiveId || null;
    currentEditingBees = [];
    selectedHiveColor = '';

    const modal = document.getElementById('hive-creator-modal');
    const titleEl = document.getElementById('hive-creator-title');
    const nameInput = document.getElementById('hive-name-input');
    const descInput = document.getElementById('hive-desc-input');
    const saveBtn = document.getElementById('save-hive-btn');

    initColorPicker();

    if (hiveId) {
        // Editing existing hive
        const hive = customHives.find(h => h.id === hiveId);
        if (hive) {
            titleEl.textContent = 'Edit Custom Hive';
            nameInput.value = hive.name;
            descInput.value = hive.description || '';
            currentEditingBees = hive.bees.map(b => ({ ...b }));
            saveBtn.textContent = 'Save Changes';
            // Restore color selection
            if (hive.color) {
                selectedHiveColor = hive.color;
                const match = document.querySelector(`.hive-color-option[data-color="${hive.color}"]`);
                if (match) {
                    document.querySelectorAll('.hive-color-option').forEach(o => o.classList.remove('selected'));
                    match.classList.add('selected');
                }
            }
        }
    } else {
        // Creating new hive
        titleEl.textContent = 'Create Hive';
        nameInput.value = '';
        descInput.value = '';
        currentEditingBees = [];
        saveBtn.textContent = 'Create Hive';
    }

    // Reset visibility fields
    const visSelect = document.getElementById('hive-visibility-select');
    const tagsGroup = document.getElementById('hive-tags-group');
    const tagsInput = document.getElementById('hive-tags-input');
    if (visSelect) visSelect.value = 'private';
    if (tagsGroup) tagsGroup.style.display = 'none';
    if (tagsInput) tagsInput.value = '';
    document.querySelectorAll('.preset-tag.selected').forEach(t => t.classList.remove('selected'));

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
// Open bee designer and pass the result back to the bee preview
function openBeeDesignerForCurrentBee() {
    openBeeDesigner((base64Icon) => {
        // Store the designed icon for the current bee being edited
        window._designedBeeIcon = base64Icon;
        // Update preview
        const previewEl = document.getElementById('bee-preview-icon');
        if (previewEl) {
            previewEl.innerHTML = `<img src="data:image/png;base64,${base64Icon}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        }
        const statusEl = document.getElementById('bee-preview-status');
        if (statusEl) statusEl.textContent = 'Custom design saved!';
    });
}
window.openBeeDesignerForCurrentBee = openBeeDesignerForCurrentBee;

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
        icon_base64: window._designedBeeIcon || generatedIconBase64 || existingBee?.icon_base64 || null,
        icon_generation_status: (window._designedBeeIcon || generatedIconBase64) ? 'completed' : 'pending'
    };

    currentEditingBees[editingBeeIndex] = bee;
    generatedIconBase64 = null;
    window._designedBeeIcon = null; // Reset

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
                body: JSON.stringify({ name, description, color: selectedHiveColor || null })
            });

            // TODO: Handle bee updates separately if needed
        } else {
            // Create new hive
            const visibility = document.getElementById('hive-visibility-select')?.value || 'private';
            const tags = document.getElementById('hive-tags-input')?.value?.trim() || null;
            response = await fetch(`${API_BASE}/api/custom-hives`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ name, description, bees, visibility, tags, color: selectedHiveColor || null })
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

// ============================================
// Display Name
// ============================================

async function loadDisplayName() {
    try {
        const res = await fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const inputs = [document.getElementById('display-name-input'), document.getElementById('mobile-display-name-input')];
        inputs.forEach(inp => { if (inp && data.display_name) inp.value = data.display_name; });
    } catch (e) {}
}

async function saveDisplayName(prefix = '') {
    const input = document.getElementById(prefix ? `${prefix}-display-name-input` : 'display-name-input');
    const status = document.getElementById(prefix ? `${prefix}-display-name-status` : 'display-name-status');
    if (!input) return;
    const name = input.value.trim();
    if (name.length < 2) { if (status) status.textContent = 'Min 2 characters'; return; }

    try {
        const res = await fetch(`${API_BASE}/api/auth/display-name`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ display_name: name })
        });
        const data = await res.json();
        if (!res.ok) { if (status) status.textContent = data.detail || 'Failed'; return; }
        if (status) status.textContent = 'Saved!';
        // Sync both inputs
        const inputs = [document.getElementById('display-name-input'), document.getElementById('mobile-display-name-input')];
        inputs.forEach(inp => { if (inp) inp.value = name; });
        setTimeout(() => { if (status) status.textContent = ''; }, 3000);
    } catch (e) { if (status) status.textContent = 'Failed to save'; }
}
window.saveDisplayName = saveDisplayName;

// ============================================
// Explore Hives
// ============================================

let exploreHivesData = [];
let activeExploreTag = '';
let exploreSortMode = 'popular';

let currentDiscoverTab = 'explore';

function openDiscover(tab) {
    const hivesModal = document.querySelector('.hives-modal');
    if (hivesModal) hivesModal.classList.remove('active');
    const page = document.getElementById('discover-page');
    if (page) page.classList.add('active');
    switchDiscoverTab(tab || 'explore');
}

function closeDiscover() {
    const page = document.getElementById('discover-page');
    if (page) page.classList.remove('active');
}

function switchDiscoverTab(tab) {
    currentDiscoverTab = tab;
    // Update tab active states
    document.getElementById('tab-explore').classList.toggle('active', tab === 'explore');
    document.getElementById('tab-decisions').classList.toggle('active', tab === 'decisions');
    // Switch panels
    document.getElementById('panel-explore').classList.toggle('active', tab === 'explore');
    document.getElementById('panel-decisions').classList.toggle('active', tab === 'decisions');
    // Show/hide create button (visibility keeps layout stable)
    const createBtn = document.getElementById('discover-create-btn');
    if (createBtn) createBtn.style.visibility = tab === 'explore' ? 'visible' : 'hidden';
    // Move indicator after layout
    requestAnimationFrame(() => requestAnimationFrame(() => updateTabIndicator()));
    // Load data
    if (tab === 'explore') fetchExploreHives();
    else fetchDecisions();
}

function updateTabIndicator() {
    const indicator = document.getElementById('discover-tab-indicator');
    const activeTab = document.getElementById(currentDiscoverTab === 'explore' ? 'tab-explore' : 'tab-decisions');
    const tabsContainer = document.querySelector('.discover-tabs');
    if (indicator && activeTab && tabsContainer) {
        const containerRect = tabsContainer.getBoundingClientRect();
        const tabRect = activeTab.getBoundingClientRect();
        indicator.style.left = (tabRect.left - containerRect.left) + 'px';
        indicator.style.width = tabRect.width + 'px';
    }
}

window.addEventListener('resize', updateTabIndicator);

// Legacy compat
function openExploreHives() { openDiscover('explore'); }
function closeExploreHives() { closeDiscover(); }

async function fetchExploreHives(query = '', tag = '') {
    const grid = document.getElementById('explore-grid');
    grid.innerHTML = '<div class="explore-empty">Loading...</div>';

    try {
        let url = `${API_BASE}/api/custom-hives/explore`;
        const params = [`sort=${exploreSortMode}`];
        if (query) params.push(`q=${encodeURIComponent(query)}`);
        if (tag) params.push(`tag=${encodeURIComponent(tag)}`);
        url += '?' + params.join('&');

        // Send auth token if available for is_favorited
        const headers = {};
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error('Failed to load');

        exploreHivesData = await response.json();
        renderExploreHives(exploreHivesData);
        renderExploreTags(exploreHivesData);
    } catch (e) {
        console.error('Error loading explore hives:', e);
        grid.innerHTML = '<div class="explore-empty">Failed to load hives. Try again later.</div>';
    }
}

function renderExploreHives(hives) {
    const grid = document.getElementById('explore-grid');
    if (!hives.length) {
        grid.innerHTML = '<div class="explore-empty">No public hives yet. Be the first to create one!</div>';
        return;
    }

    grid.innerHTML = hives.map(hive => {
        const beesHtml = (hive.bees || []).slice(0, 5).map(bee => {
            const iconSrc = bee.icon_base64
                ? `data:image/png;base64,${bee.icon_base64}`
                : '/images/bee-icons/default bee icon.png';
            return `<div class="explore-card-bee">
                <img src="${iconSrc}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png'">
                <span>${bee.human_name || bee.name}</span>
            </div>`;
        }).join('');

        const tagsHtml = hive.tags ? hive.tags.split(',').map(t => t.trim()).filter(Boolean)
            .map(t => `<span class="explore-card-tag">#${t}</span>`).join('') : '';
        const builtInTag = hive.is_built_in ? '<span class="explore-card-tag built-in">Built-in</span>' : '';

        const heartClass = hive.is_favorited ? 'hearted' : '';
        const favCount = hive.favorite_count || 0;

        const ehThemed = hive.color ? 'hive-themed' : '';
        const ehStyle = hive.color ? `style="background:linear-gradient(135deg, ${hive.color} 0%, ${hive.color}88 100%);border-color:${hive.color}44;"` : '';
        return `<div class="explore-hive-card ${ehThemed}" ${ehStyle} onclick="openHiveDetail('${hive.id}')">
            <div class="explore-card-header">
                <span class="explore-card-name">${escapeHtml(hive.name)}</span>
                <button class="explore-heart-btn ${heartClass}" onclick="event.stopPropagation(); toggleFavorite('${hive.id}', this)">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="${hive.is_favorited ? '#ef4444' : 'none'}" stroke="${hive.is_favorited ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    <span class="fav-count">${favCount}</span>
                </button>
            </div>
            <div class="explore-card-creator">by ${escapeHtml(hive.creator_name || 'Anonymous')}</div>
            ${hive.description ? `<div class="explore-card-desc">${escapeHtml(hive.description)}</div>` : ''}
            <div class="explore-card-bees">${beesHtml}</div>
            <div class="explore-card-tags">${builtInTag}${tagsHtml}</div>
        </div>`;
    }).join('');
}

function renderExploreTags(hives) {
    const container = document.getElementById('explore-tags');
    const tagSet = new Set();
    hives.forEach(h => {
        if (h.tags) h.tags.split(',').forEach(t => { const tag = t.trim().toLowerCase(); if (tag) tagSet.add(tag); });
    });
    if (tagSet.size === 0) { container.innerHTML = ''; return; }
    container.innerHTML = Array.from(tagSet).sort().map(tag =>
        `<span class="explore-tag ${activeExploreTag === tag ? 'active' : ''}" onclick="filterByTag('${tag}')">#${tag}</span>`
    ).join('');
}

function filterByTag(tag) {
    if (activeExploreTag === tag) { activeExploreTag = ''; fetchExploreHives(); }
    else { activeExploreTag = tag; fetchExploreHives('', tag); }
}

let _searchTimeout;
function searchExploreHives() {
    clearTimeout(_searchTimeout);
    _searchTimeout = setTimeout(() => {
        const q = document.getElementById('explore-search-input').value.trim();
        activeExploreTag = '';
        fetchExploreHives(q);
    }, 300);
}

async function toggleFavorite(hiveId, btn) {
    const token = localStorage.getItem('token');
    if (!token) { alert('Please log in to favorite hives.'); return; }
    if (btn.dataset.loading === 'true') return;
    btn.dataset.loading = 'true';

    try {
        const res = await fetch(`${API_BASE}/api/custom-hives/${hiveId}/favorite`, {
            method: 'POST', headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();

        // Update button
        const svg = btn.querySelector('svg');
        const countEl = btn.querySelector('.fav-count');
        const hive = exploreHivesData.find(h => h.id === hiveId);

        if (data.favorited) {
            btn.classList.add('hearted');
            svg.setAttribute('fill', '#ef4444');
            svg.setAttribute('stroke', '#ef4444');
            if (hive) hive.favorite_count = (hive.favorite_count || 0) + 1;
            if (hive) hive.is_favorited = true;
        } else {
            btn.classList.remove('hearted');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            if (hive) hive.favorite_count = Math.max(0, (hive.favorite_count || 0) - 1);
            if (hive) hive.is_favorited = false;
        }
        if (countEl && hive) countEl.textContent = hive.favorite_count;
    } catch (e) {
        console.error('Favorite toggle failed:', e);
    } finally {
        btn.dataset.loading = 'false';
    }
}

// Visibility toggle in hive creator
function onVisibilityChange() {
    const vis = document.getElementById('hive-visibility-select').value;
    const tagsGroup = document.getElementById('hive-tags-group');
    const saveBtn = document.getElementById('save-hive-btn');
    if (vis === 'public') {
        tagsGroup.style.display = '';
        if (saveBtn && !editingHiveId) saveBtn.textContent = 'Create & Publish';
    } else {
        tagsGroup.style.display = 'none';
        if (saveBtn && !editingHiveId) saveBtn.textContent = 'Create Hive';
    }
}

// Load display name on page load if logged in
if (localStorage.getItem('token')) setTimeout(loadDisplayName, 1000);

function togglePresetTag(el) {
    el.classList.toggle('selected');
    // Sync selected preset tags with hidden input (strip # prefix)
    const selected = Array.from(document.querySelectorAll('.preset-tag.selected'))
        .map(t => t.textContent.replace('#', ''));
    const customInput = document.getElementById('hive-tags-input');
    customInput.value = selected.join(', ');
}
window.togglePresetTag = togglePresetTag;

window.onVisibilityChange = onVisibilityChange;
window.openExploreHives = openExploreHives;
window.closeExploreHives = closeExploreHives;
window.searchExploreHives = searchExploreHives;
window.filterByTag = filterByTag;
window.toggleFavorite = toggleFavorite;
window.saveDisplayName = saveDisplayName;

// ============================================
// Hive Detail Modal
// ============================================

let _currentUserId = null;
// Load current user ID
(async function() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await fetch(`${API_BASE}/api/auth/me`, { headers: getAuthHeaders() });
        if (res.ok) { const d = await res.json(); _currentUserId = d.id; }
    } catch(e) {}
})();

function openHiveDetail(hiveId) {
    const hive = exploreHivesData.find(h => h.id === hiveId);
    if (!hive) return;

    const modal = document.getElementById('hive-detail-modal');
    const isOwner = _currentUserId && _currentUserId === hive.user_id;

    const beesHtml = (hive.bees || []).map(bee => {
        const iconSrc = bee.icon_base64
            ? `data:image/png;base64,${bee.icon_base64}`
            : '/images/bee-icons/default bee icon.png';
        return `<div class="hive-detail-bee">
            <img src="${iconSrc}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png'">
            <div class="hive-detail-bee-info">
                <div class="hive-detail-bee-name">${escapeHtml(bee.human_name || bee.name)}</div>
                <div class="hive-detail-bee-role">${escapeHtml(bee.name)}</div>
                ${bee.description ? `<div class="hive-detail-bee-desc">${escapeHtml(bee.description)}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    const tagsHtml = hive.tags ? hive.tags.split(',').map(t => t.trim()).filter(Boolean)
        .map(t => `<span class="explore-card-tag">#${t}</span>`).join('') : '';

    const favClass = hive.is_favorited ? 'hearted' : '';
    const favText = hive.is_favorited ? 'Favorited' : 'Favorite';

    let ownerHtml = '';
    if (isOwner) {
        ownerHtml = `
            <button class="hive-detail-edit" onclick="event.stopPropagation(); makeHivePrivate('${hive.id}')">Make Private</button>
            <button class="hive-detail-delete" onclick="event.stopPropagation(); deletePublicHive('${hive.id}')">Delete</button>
        `;
    }

    modal.innerHTML = `
        <div class="hive-detail-content">
            <button class="hive-detail-close" onclick="closeHiveDetail()">&times;</button>
            <div class="hive-detail-name">${escapeHtml(hive.name)}</div>
            <div class="hive-detail-meta">
                <span>by ${escapeHtml(hive.creator_name || 'Anonymous')}</span>
                <span class="fav-count-inline">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="#ef4444" stroke="#ef4444" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    ${hive.favorite_count || 0}
                </span>
            </div>
            ${hive.description ? `<div class="hive-detail-desc">${escapeHtml(hive.description)}</div>` : ''}
            ${tagsHtml ? `<div class="hive-detail-tags">${tagsHtml}</div>` : ''}
            <div class="hive-detail-bees">${beesHtml}</div>
            <div class="hive-detail-actions">
                <button class="hive-detail-try" onclick="tryHive('${hive.id}')">Try It</button>
                <button class="hive-detail-fav ${favClass}" id="detail-fav-btn" onclick="toggleFavoriteFromDetail('${hive.id}')">${favText}</button>
                ${ownerHtml}
            </div>
        </div>
    `;
    modal.classList.add('active');
}

function closeHiveDetail() {
    const modal = document.getElementById('hive-detail-modal');
    modal.classList.remove('active');
    modal.innerHTML = '';
}

let _favDetailLoading = false;
async function toggleFavoriteFromDetail(hiveId) {
    const token = localStorage.getItem('token');
    if (!token) { alert('Please log in to favorite hives.'); return; }
    if (_favDetailLoading) return;
    _favDetailLoading = true;
    try {
        const res = await fetch(`${API_BASE}/api/custom-hives/${hiveId}/favorite`, {
            method: 'POST', headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        const hive = exploreHivesData.find(h => h.id === hiveId);
        if (hive) {
            hive.is_favorited = data.favorited;
            hive.favorite_count = data.favorited ? (hive.favorite_count || 0) + 1 : Math.max(0, (hive.favorite_count || 0) - 1);
        }
        // Re-render detail
        openHiveDetail(hiveId);
        // Re-render explore grid
        renderExploreHives(exploreHivesData);
    } catch(e) { console.error(e); } finally { _favDetailLoading = false; }
}

async function makeHivePrivate(hiveId) {
    if (!confirm('Make this hive private? It will be removed from Explore Hives.')) return;
    try {
        const res = await fetch(`${API_BASE}/api/custom-hives/${hiveId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ name: null, description: null, visibility: 'private' })
        });
        if (res.ok) {
            closeHiveDetail();
            fetchExploreHives();
        }
    } catch(e) { alert('Failed to update hive.'); }
}

async function deletePublicHive(hiveId) {
    if (!confirm('Delete this hive permanently?')) return;
    try {
        const res = await fetch(`${API_BASE}/api/custom-hives/${hiveId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (res.ok) {
            closeHiveDetail();
            fetchExploreHives();
            await fetchCustomHives();
            renderHivesModal();
        }
    } catch(e) { alert('Failed to delete hive.'); }
}

// Try a hive - temporarily use it for a debate
function tryHive(hiveId) {
    const hive = exploreHivesData.find(h => h.id === hiveId);
    if (!hive || !hive.bees || hive.bees.length < 2) { alert('This hive needs at least 2 bees.'); return; }

    const token = localStorage.getItem('token');
    if (!token) { alert('Please log in to try hives.'); return; }

    // Save current state
    window._tryingHive = hive;
    window._savedHiveId = selectedHiveId;
    window._savedPersonalities = [...selectedPersonalities];

    // Inject hive temporarily into customHives
    const tempHive = {
        id: hive.id,
        name: hive.name,
        description: hive.description,
        bees: hive.bees.map(b => ({
            id: b.id,
            name: b.name,
            human_name: b.human_name,
            emoji: b.emoji,
            description: b.description,
            role: b.role,
            icon_base64: b.icon_base64,
            display_order: b.display_order
        })),
        is_custom: true
    };
    if (!customHives.find(h => h.id === hive.id)) {
        customHives.push(tempHive);
    }

    // Select this hive
    selectHive(hive.id);

    // Close modals
    closeHiveDetail();
    closeExploreHives();

    // Focus chat
    const chatInput = document.getElementById('chat-input');
    if (chatInput) chatInput.focus();
}

// Called after a debate ends when trying a hive
function showTryItBanner() {
    if (!window._tryingHive) return;
    const hive = window._tryingHive;
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const banner = document.createElement('div');
    banner.className = 'try-it-banner';
    banner.innerHTML = `
        <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary);margin-bottom:8px;">You tried "${escapeHtml(hive.name)}"!</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="favoriteAndEndTry('${hive.id}')" style="padding:8px 20px;">Favorite This Hive</button>
            <button class="btn btn-secondary" onclick="endTryIt(true)" style="padding:8px 20px;">Back to Explore</button>
            <button class="btn btn-secondary" onclick="endTryIt(false)" style="padding:8px 20px;">Continue Chatting</button>
        </div>
    `;
    container.appendChild(banner);
    scrollToBottom(container);
}

async function favoriteAndEndTry(hiveId) {
    try {
        await fetch(`${API_BASE}/api/custom-hives/${hiveId}/favorite`, {
            method: 'POST', headers: getAuthHeaders()
        });
    } catch(e) {}
    endTryIt(true);
}

function endTryIt(returnToExplore) {
    // Remove temp hive from customHives
    if (window._tryingHive) {
        const idx = customHives.findIndex(h => h.id === window._tryingHive.id);
        if (idx !== -1 && window._savedHiveId !== window._tryingHive.id) {
            customHives.splice(idx, 1);
        }
    }

    // Restore state
    if (window._savedHiveId) selectHive(window._savedHiveId);
    if (window._savedPersonalities) {
        selectedPersonalities = window._savedPersonalities;
        saveSelectedBees();
    }

    window._tryingHive = null;
    window._savedHiveId = null;
    window._savedPersonalities = null;

    if (returnToExplore) openHivesModal();
}

window.openHiveDetail = openHiveDetail;
window.closeHiveDetail = closeHiveDetail;
window.toggleFavoriteFromDetail = toggleFavoriteFromDetail;
window.makeHivePrivate = makeHivePrivate;
window.deletePublicHive = deletePublicHive;
window.tryHive = tryHive;
window.showTryItBanner = showTryItBanner;
window.favoriteAndEndTry = favoriteAndEndTry;
window.endTryIt = endTryIt;

// ============================================
// Decisions Feed
// ============================================

let decisionsData = [];
let decisionsSortMode = 'newest';

function openDecisionsFeed() { openDiscover('decisions'); }
function closeDecisionsFeed() { closeDiscover(); }

function sortDecisions(mode) {
    decisionsSortMode = mode;
    document.getElementById('sort-newest-btn')?.classList.toggle('active', mode === 'newest');
    document.getElementById('sort-popular-btn')?.classList.toggle('active', mode === 'popular');
    fetchDecisions();
}

async function fetchDecisions() {
    const feed = document.getElementById('decisions-feed');
    feed.innerHTML = '<div class="explore-empty">Loading...</div>';

    try {
        const headers = {};
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}/api/decisions?sort=${decisionsSortMode}`, { headers });
        if (!res.ok) throw new Error('Failed');

        decisionsData = await res.json();
        renderDecisions(decisionsData);
    } catch (e) {
        console.error('Failed to load decisions:', e);
        feed.innerHTML = '<div class="explore-empty">Failed to load decisions.</div>';
    }
}

function renderDecisions(decisions) {
    const feed = document.getElementById('decisions-feed');
    if (!decisions.length) {
        feed.innerHTML = '<div class="explore-empty">No decisions yet. Start a debate to see the first one here!</div>';
        return;
    }

    const beeNameToId = {
        'Sunny': 'chaos-optimist', 'Murphy': 'chaos-pessimist', 'Jordan': 'chaos-realist', 'Rebel': 'chaos-contrarian', 'Cyndi': 'chaos-cynic',
        'BFF': 'friend-bestie', 'Truth': 'friend-honest', 'Giggles': 'friend-funny', 'Sage': 'friend-wise', 'Fixer': 'friend-practical',
        'Brick': 'billionaire-builder', 'Money': 'billionaire-investor', 'Chess': 'billionaire-strategist', 'Blitz': 'billionaire-disruptor', 'Dream': 'billionaire-visionary',
        'Anon': 'internet-redditor', 'Clout': 'internet-influencer', 'Dev': 'internet-coder', 'Pixel': 'internet-gamer', 'Flame': 'internet-troll',
        'Zoey': 'gen-z', 'Avery': 'gen-millennial', 'Dale': 'gen-x', 'Walt': 'gen-boomer', 'Neo': 'gen-future',
        'Honor': 'court-judge', 'Blade': 'court-prosecutor', 'Haven': 'court-defense', 'Echo': 'court-witness', 'Will': 'court-jury',
        'Lucifer': 'special-devils-advocate', 'Joker': 'special-wild-card'
    };
    const splitColors = ['#facc15', '#8b5cf6', '#3b82f6', '#10b981', '#ef4444', '#ec4899', '#06b6d4'];

    feed.innerHTML = decisions.map(d => {
        const v = d.verdict || {};
        const votes = v.votes || [];

        // Build vote split bar data
        const choiceCounts = {};
        votes.forEach(vote => {
            const c = vote.choice || 'Unknown';
            choiceCounts[c] = (choiceCounts[c] || 0) + 1;
        });
        const choices = Object.keys(choiceCounts);
        const totalVotes = votes.length || 1;

        const splitBarHtml = choices.length >= 1 ? `
            <div class="decision-split-bar">
                ${choices.map((c, i) => `<div class="decision-split-segment" style="width:${(choiceCounts[c] / totalVotes) * 100}%;background:${splitColors[i % splitColors.length]}"></div>`).join('')}
            </div>
            <div class="decision-split-legend">
                ${choices.map((c, i) => `<span class="decision-split-label"><span class="decision-split-dot" style="background:${splitColors[i % splitColors.length]}"></span>${escapeHtml(c)} (${choiceCounts[c]})</span>`).join('')}
            </div>` : '';

        const votesHtml = votes.map(vote => {
            const pid = beeNameToId[vote.name] || '';
            const iconPath = pid ? getBeeIconPath(pid) : '/images/bee-icons/default bee icon.png';
            return `<div class="decision-vote">
                <div class="decision-vote-header"><img class="decision-vote-avatar" src="${iconPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png'"><span class="name">${escapeHtml(vote.name || '')}</span><span class="arrow">→</span><span class="choice">${escapeHtml(vote.choice || '')}</span></div>
                ${vote.reason ? `<div class="vote-reason">${escapeHtml(vote.reason)}</div>` : ''}
            </div>`;
        }).join('');

        const titleText = v.title || d.topic;
        const likedClass = d.is_liked ? 'liked' : '';
        const timeAgo = d.created_at ? getTimeAgo(d.created_at) : '';

        return `<div class="decision-card">
            <div class="decision-card-content">
                <div class="decision-title">${escapeHtml(titleText)}</div>
                <div class="decision-meta">
                    ${d.hive_name ? `<span class="decision-hive-badge" ${getHiveBadgeStyle(d.hive_name)}>${escapeHtml(d.hive_name)} Hive</span>` : ''}
                    <span>${timeAgo}</span>
                </div>
                <div class="decision-answer">${escapeHtml(v.hive_decision || 'No consensus')}</div>
                ${v.confidence !== undefined ? `<div class="decision-confidence">${v.confidence}% confidence</div>` : ''}
                ${splitBarHtml}
                <div class="decision-votes">${votesHtml}</div>
                <div class="decision-side-actions">
                    <div class="decision-side-group">
                        <button class="decision-side-btn ${likedClass}" onclick="toggleDecisionLike('${d.id}', this)">
                            <svg viewBox="0 0 24 24" fill="${d.is_liked ? '#ef4444' : 'none'}" stroke="${d.is_liked ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                        </button>
                        <span class="decision-side-label like-count">${d.likes || 0}</span>
                    </div>
                    <div class="decision-side-group">
                        <button class="decision-side-btn" onclick="shareDecision('${d.id}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        </button>
                        <span class="decision-side-label">Share</span>
                    </div>
                    <div class="decision-side-group">
                        <button class="decision-side-btn" onclick="tryDecision('${d.id}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                        </button>
                        <span class="decision-side-label">Try</span>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

function getTimeAgo(dateStr) {
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
        return date.toLocaleDateString();
    } catch (e) { return ''; }
}

async function toggleDecisionLike(decisionId, btn) {
    const token = localStorage.getItem('token');
    if (!token) { alert('Please log in to like decisions.'); return; }
    if (btn.dataset.loading === 'true') return;
    btn.dataset.loading = 'true';

    try {
        const res = await fetch(`${API_BASE}/api/decisions/${decisionId}/like`, {
            method: 'POST', headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();

        const svg = btn.querySelector('svg');
        const countEl = btn.parentElement.querySelector('.like-count');
        const d = decisionsData.find(x => x.id === decisionId);

        if (data.liked) {
            btn.classList.add('liked');
            svg.setAttribute('fill', '#ef4444');
            svg.setAttribute('stroke', '#ef4444');
            if (d) d.likes = (d.likes || 0) + 1;
        } else {
            btn.classList.remove('liked');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            if (d) d.likes = Math.max(0, (d.likes || 0) - 1);
        }
        if (countEl && d) countEl.textContent = d.likes;
    } catch (e) { console.error(e); } finally { btn.dataset.loading = 'false'; }
}

function tryDecision(decisionId) {
    const d = decisionsData.find(x => x.id === decisionId);
    if (!d) return;

    closeDecisionsFeed();
    switchMainView('debates');

    // Put the question in the chat input and let user send it
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.value = d.topic;
        chatInput.focus();
        chatInput.dispatchEvent(new Event('input'));
    }
}

function shareDecision(decisionId) {
    const d = decisionsData.find(x => x.id === decisionId);
    if (!d) return;

    const url = `https://www.beecision.com/decision/${decisionId}`;
    const v = d.verdict || {};
    const title = v.title || d.topic;
    const text = `${title}\n\nHive Decision: ${v.hive_decision || 'No consensus'}${v.confidence ? ` (${v.confidence}% confidence)` : ''}`;

    if (navigator.share) {
        navigator.share({ title: 'Beecision - Hive Decision', text, url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(url).then(() => {
            alert('Link copied to clipboard!');
        }).catch(() => {
            prompt('Copy this link:', url);
        });
    }
}

async function openSharedDecision(decisionId) {
    switchMainView('beecisions');
    const feed = document.getElementById('beecisions-feed');
    if (feed) feed.innerHTML = '<div class="explore-empty">Loading...</div>';

    try {
        const headers = {};
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}/api/decisions/${decisionId}`, { headers });
        if (!res.ok) throw new Error('Decision not found');

        const decision = await res.json();
        renderBeecisions([decision]);
    } catch (e) {
        console.error('Failed to load shared decision:', e);
        if (feed) feed.innerHTML = '<div class="explore-empty">Decision not found.</div>';
    }
}

window.openDiscover = openDiscover;
window.closeDiscover = closeDiscover;
window.switchDiscoverTab = switchDiscoverTab;
window.openDecisionsFeed = openDecisionsFeed;
window.closeDecisionsFeed = closeDecisionsFeed;
window.sortDecisions = sortDecisions;
window.toggleDecisionLike = toggleDecisionLike;
window.tryDecision = tryDecision;
window.shareDecision = shareDecision;

// ============================================
// Main View Switching (Debates / Beecisions)
// ============================================

let currentMainView = 'debates';

function updateMainTabIndicator() {
    // Use a fixed indicator width so it doesn't change size between tabs
    function positionIndicator(tabsId, indicatorId, activeId) {
        const tabs = document.getElementById(tabsId);
        const indicator = document.getElementById(indicatorId);
        const active = document.getElementById(activeId);
        if (!tabs || !indicator || !active) return;
        const containerRect = tabs.getBoundingClientRect();
        const tabRect = active.getBoundingClientRect();
        const tabCenter = tabRect.left - containerRect.left + tabRect.width / 2;
        const fixedWidth = 48;
        indicator.style.width = fixedWidth + 'px';
        indicator.style.left = (tabCenter - fixedWidth / 2) + 'px';
    }
    positionIndicator('desktop-main-tabs', 'desktop-tab-indicator',
        currentMainView === 'debates' ? 'tab-debates' : 'tab-beecisions');
    positionIndicator('mobile-main-tabs', 'mobile-tab-indicator',
        currentMainView === 'debates' ? 'mobile-tab-debates' : 'mobile-tab-beecisions');
}

window.addEventListener('resize', updateMainTabIndicator);

function switchMainView(view) {
    currentMainView = view;

    // Update desktop tabs
    document.getElementById('tab-debates')?.classList.toggle('active', view === 'debates');
    document.getElementById('tab-beecisions')?.classList.toggle('active', view === 'beecisions');

    // Update mobile tabs
    document.getElementById('mobile-tab-debates')?.classList.toggle('active', view === 'debates');
    document.getElementById('mobile-tab-beecisions')?.classList.toggle('active', view === 'beecisions');

    // Slide the tab indicator
    requestAnimationFrame(() => updateMainTabIndicator());

    // Toggle views with smooth crossfade
    const chatLayout = document.querySelector('.chat-layout');
    const voicesBar = document.querySelector('.voices-bar');
    const beecisionsView = document.getElementById('beecisions-view');
    const chatInputArea = document.getElementById('chat-input-area');
    const desktopHeader = document.getElementById('main-logo-header');
    const mobileHeader = document.querySelector('.header');

    // Toggle beecisions-active class on headers for 3-dots repositioning
    if (desktopHeader) desktopHeader.classList.toggle('beecisions-active', view === 'beecisions');
    if (mobileHeader) mobileHeader.classList.toggle('beecisions-active', view === 'beecisions');

    // Hide hive button on beecisions view
    const mobileHiveBtn = document.getElementById('mobile-hives-btn');
    const desktopHiveBtn = document.getElementById('hives-btn');
    if (mobileHiveBtn) mobileHiveBtn.style.display = view === 'beecisions' ? 'none' : '';
    if (desktopHiveBtn) desktopHiveBtn.style.display = view === 'beecisions' ? 'none' : '';

    // Hide hamburger (sidebar-toggle) on beecisions view or if not logged in
    const isLoggedIn = !!localStorage.getItem('token');
    document.querySelectorAll('.sidebar-toggle').forEach(btn => {
        btn.style.display = (view === 'beecisions' || !isLoggedIn) ? 'none' : 'flex';
    });

    if (view === 'debates') {
        if (chatLayout) { chatLayout.classList.remove('view-hidden'); chatLayout.classList.add('view-active'); }
        if (beecisionsView) { beecisionsView.classList.remove('view-active'); beecisionsView.classList.add('view-hidden'); }
        if (voicesBar) voicesBar.style.display = '';
        if (chatInputArea) chatInputArea.style.display = '';
        // Reload debate history when switching to debates tab
        if (typeof loadChatHistory === 'function' && localStorage.getItem('token')) loadChatHistory();
    } else {
        if (chatLayout) { chatLayout.classList.remove('view-active'); chatLayout.classList.add('view-hidden'); }
        if (beecisionsView) { beecisionsView.classList.remove('view-hidden'); beecisionsView.classList.add('view-active'); }
        if (voicesBar) voicesBar.style.display = 'none';
        if (chatInputArea) chatInputArea.style.display = 'none';
        fetchBeecisions();
    }
}

let beecisionsSortMode = 'newest';

function sortBeecisions(mode) {
    beecisionsSortMode = mode;
    document.getElementById('bee-sort-newest-btn')?.classList.toggle('active', mode === 'newest');
    document.getElementById('bee-sort-popular-btn')?.classList.toggle('active', mode === 'popular');
    fetchBeecisions();
}

async function fetchBeecisions() {
    const feed = document.getElementById('beecisions-feed');
    if (!feed) return;
    feed.innerHTML = '<div class="explore-empty">Loading...</div>';

    try {
        const headers = {};
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}/api/decisions?sort=${beecisionsSortMode}`, { headers });
        if (!res.ok) throw new Error('Failed');

        const decisions = await res.json();
        renderBeecisions(decisions);
    } catch (e) {
        console.error('Failed to load beecisions:', e);
        feed.innerHTML = '<div class="explore-empty">Failed to load beecisions.</div>';
    }
}

function renderBeecisions(decisions) {
    const feed = document.getElementById('beecisions-feed');
    if (!feed) return;
    if (!decisions.length) {
        feed.innerHTML = '<div class="explore-empty">No beecisions yet. Start a debate to see the first one here!</div>';
        return;
    }

    const beeNameToId = {
        'Sunny': 'chaos-optimist', 'Murphy': 'chaos-pessimist', 'Jordan': 'chaos-realist', 'Rebel': 'chaos-contrarian', 'Cyndi': 'chaos-cynic',
        'BFF': 'friend-bestie', 'Truth': 'friend-honest', 'Giggles': 'friend-funny', 'Sage': 'friend-wise', 'Fixer': 'friend-practical',
        'Brick': 'billionaire-builder', 'Money': 'billionaire-investor', 'Chess': 'billionaire-strategist', 'Blitz': 'billionaire-disruptor', 'Dream': 'billionaire-visionary',
        'Anon': 'internet-redditor', 'Clout': 'internet-influencer', 'Dev': 'internet-coder', 'Pixel': 'internet-gamer', 'Flame': 'internet-troll',
        'Zoey': 'gen-z', 'Avery': 'gen-millennial', 'Dale': 'gen-x', 'Walt': 'gen-boomer', 'Neo': 'gen-future',
        'Honor': 'court-judge', 'Blade': 'court-prosecutor', 'Haven': 'court-defense', 'Echo': 'court-witness', 'Will': 'court-jury',
        'Lucifer': 'special-devils-advocate', 'Joker': 'special-wild-card'
    };
    const splitColors = ['#facc15', '#8b5cf6', '#3b82f6', '#10b981', '#ef4444', '#ec4899', '#06b6d4'];

    feed.innerHTML = decisions.map((d, cardIdx) => {
        const v = d.verdict || {};
        const votes = v.votes || [];

        // Count votes per choice
        const choiceCounts = {};
        votes.forEach(vote => {
            const c = vote.choice || 'Unknown';
            choiceCounts[c] = (choiceCounts[c] || 0) + 1;
        });
        const choices = Object.keys(choiceCounts);
        const totalVotes = votes.length || 1;

        // Find winner
        let winnerChoice = v.hive_decision || choices[0] || 'No consensus';
        let winnerPct = v.confidence || 0;
        if (!winnerPct && choices.length > 0) {
            const maxCount = Math.max(...Object.values(choiceCounts));
            winnerPct = Math.round((maxCount / totalVotes) * 100);
        }

        const titleText = v.title || d.topic;
        const likedClass = d.is_liked ? 'liked' : '';

        // Timing: spread over 8 seconds
        // Chat: 0.5s – 4.5s (each bee ~0.6-0.8s apart)
        const chatDuration = 4.0;
        const chatStart = 0.5;
        const chatStep = votes.length > 1 ? chatDuration / (votes.length - 1) : 0;

        // Build mini group-chat debate — one punchy line per bee
        const chatHtml = votes.map((vote, i) => {
            const pid = beeNameToId[vote.name] || '';
            const iconPath = pid ? getBeeIconPath(pid) : '/images/bee-icons/default bee icon.png';
            const colors = pid ? getPersonalityColor(pid) : { text: 'var(--text-secondary)' };
            const isLeft = i % 2 === 0;
            const delay = (chatStart + i * chatStep).toFixed(2);
            return `<div class="bc-chat-msg ${isLeft ? 'bc-left' : 'bc-right'}" style="animation-delay:${delay}s">
                <img class="bc-chat-avi" src="${iconPath}" alt="" onerror="this.src='/images/bee-icons/default bee icon.png'">
                <div class="bc-chat-bubble">
                    <span class="bc-chat-name" style="color:${colors.text}">${escapeHtml(vote.name || '')}</span>
                    <span class="bc-chat-text">${escapeHtml(vote.reason || vote.choice || '')}</span>
                </div>
            </div>`;
        }).join('');

        // Vote bars: 5.0s – 6.0s
        const barStart = 5.0;
        const barStep = choices.length > 1 ? 1.0 / (choices.length - 1) : 0;
        const barHtml = choices.length >= 1 ? choices.map((c, i) => {
            const pct = Math.round((choiceCounts[c] / totalVotes) * 100);
            const color = splitColors[i % splitColors.length];
            const barDelay = (barStart + i * barStep).toFixed(2);
            return `<div class="bc-bar-row" style="animation-delay:${barDelay}s">
                <span class="bc-bar-label">${escapeHtml(c)}</span>
                <div class="bc-bar-track"><div class="bc-bar-fill" style="--bar-pct:${pct}%;background:${color};animation-delay:${barDelay}s"></div></div>
                <span class="bc-bar-pct">${pct}%</span>
            </div>`;
        }).join('') : '';

        // Winner: 6.5s, Poll: 7.5s
        const revealDelay = '6.50';
        const pollDelay = '7.50';

        // Poll data
        const pollYes = d.poll_yes || 0;
        const pollNo = d.poll_no || 0;
        const pollTotal = pollYes + pollNo;
        const pollYesPct = pollTotal > 0 ? Math.round((pollYes / pollTotal) * 100) : 50;
        const pollNoPct = pollTotal > 0 ? Math.round((pollNo / pollTotal) * 100) : 50;
        const userVote = d.poll_vote || '';
        const hasVoted = pollTotal > 0;

        return `<div class="decision-card">
            <div class="decision-card-content bc-card">
                <div class="bc-hook">
                    ${d.hive_name ? `<span class="decision-hive-badge" ${getHiveBadgeStyle(d.hive_name)}>${escapeHtml(d.hive_name)} Hive</span>` : ''}
                    <div class="bc-hook-title">${escapeHtml(titleText)}</div>
                </div>
                <div class="bc-chat">${chatHtml}</div>
                <div class="bc-bars">${barHtml}</div>
                <div class="bc-reveal" style="animation-delay:${revealDelay}s">
                    <div class="bc-winner">${escapeHtml(winnerChoice)}</div>
                    <div class="bc-winner-pct">${winnerPct}%</div>
                </div>
                <div class="bc-poll" style="animation-delay:${pollDelay}s" data-decision="${d.id}">
                    <div class="bc-poll-question">Do you agree?</div>
                    <div class="bc-poll-btns">
                        <button class="bc-poll-btn bc-poll-yes ${userVote === 'yes' ? 'bc-poll-voted' : ''}" onclick="votePoll('${d.id}','yes',this)">
                            <span class="bc-poll-emoji">&#128077;</span> Yes
                            <span class="bc-poll-bar-bg"><span class="bc-poll-bar-fill" style="width:${hasVoted ? pollYesPct : 0}%;background:#22c55e"></span></span>
                            <span class="bc-poll-count">${hasVoted ? pollYesPct + '%' : ''}</span>
                        </button>
                        <button class="bc-poll-btn bc-poll-no ${userVote === 'no' ? 'bc-poll-voted' : ''}" onclick="votePoll('${d.id}','no',this)">
                            <span class="bc-poll-emoji">&#128078;</span> No
                            <span class="bc-poll-bar-bg"><span class="bc-poll-bar-fill" style="width:${hasVoted ? pollNoPct : 0}%;background:#ef4444"></span></span>
                            <span class="bc-poll-count">${hasVoted ? pollNoPct + '%' : ''}</span>
                        </button>
                    </div>
                </div>
            </div>
            <div class="decision-side-actions">
                <div class="decision-side-group">
                    <button class="decision-side-btn ${likedClass}" onclick="toggleBeecisionLike('${d.id}', this)">
                        <svg viewBox="0 0 24 24" fill="${d.is_liked ? '#ef4444' : 'none'}" stroke="${d.is_liked ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    </button>
                    <span class="decision-side-label like-count">${d.likes || 0}</span>
                </div>
                <div class="decision-side-group">
                    <button class="decision-side-btn" onclick="shareDecision('${d.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                    <span class="decision-side-label">Share</span>
                </div>
                <div class="decision-side-group">
                    <button class="decision-side-btn" onclick="tryBeecision('${d.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                    </button>
                    <span class="decision-side-label">Try</span>
                </div>
            </div>
        </div>`;
    }).join('');

    // Trigger animations when card scrolls into view — replay every time
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const card = entry.target.querySelector('.bc-card');
            if (!card) return;
            if (entry.isIntersecting) {
                // Force restart all animations by cloning
                card.classList.remove('bc-playing');
                // Reset animations: remove and re-add animated elements' classes
                card.querySelectorAll('.bc-chat-msg, .bc-bar-row, .bc-bar-fill, .bc-reveal, .bc-poll').forEach(el => {
                    el.getAnimations().forEach(a => { a.cancel(); a.play(); });
                });
                // Small delay to ensure cancel takes effect
                requestAnimationFrame(() => {
                    card.classList.add('bc-playing');
                });
            } else {
                card.classList.remove('bc-playing');
            }
        });
    }, { threshold: 0.4 });
    feed.querySelectorAll('.decision-card').forEach(card => observer.observe(card));
}

let _beecisionsData = [];
async function toggleBeecisionLike(decisionId, btn) {
    const token = localStorage.getItem('token');
    if (!token) { alert('Please log in to like beecisions.'); return; }
    if (btn.dataset.loading === 'true') return;
    btn.dataset.loading = 'true';

    try {
        const res = await fetch(`${API_BASE}/api/decisions/${decisionId}/like`, {
            method: 'POST', headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();

        const svg = btn.querySelector('svg');
        const countEl = btn.parentElement.querySelector('.like-count');

        if (data.liked) {
            btn.classList.add('liked');
            svg.setAttribute('fill', '#ef4444');
            svg.setAttribute('stroke', '#ef4444');
        } else {
            btn.classList.remove('liked');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
        }
        if (countEl) countEl.textContent = data.likes || 0;
    } catch (e) { console.error(e); } finally { btn.dataset.loading = 'false'; }
}

function tryBeecision(decisionId) {
    // Switch to debates view and put the question in chat
    switchMainView('debates');
    // Need to find the decision - refetch if needed
    fetch(`${API_BASE}/api/decisions/${decisionId}`, {
        headers: localStorage.getItem('token') ? { 'Authorization': `Bearer ${localStorage.getItem('token')}` } : {}
    }).then(r => r.json()).then(d => {
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.value = d.topic;
            chatInput.focus();
            chatInput.dispatchEvent(new Event('input'));
        }
    }).catch(() => {});
}

window.switchMainView = switchMainView;
window.sortBeecisions = sortBeecisions;
window.toggleBeecisionLike = toggleBeecisionLike;
window.tryBeecision = tryBeecision;

async function votePoll(decisionId, vote, btn) {
    const token = localStorage.getItem('token');
    if (!token) { alert('Please log in to vote.'); return; }
    try {
        const res = await fetch(`${API_BASE}/api/decisions/${decisionId}/poll`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ vote })
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        const total = data.yes + data.no;
        const yesPct = total > 0 ? Math.round((data.yes / total) * 100) : 0;
        const noPct = total > 0 ? Math.round((data.no / total) * 100) : 0;

        // Update the poll UI
        const pollEl = btn.closest('.bc-poll');
        if (!pollEl) return;
        const yesBtn = pollEl.querySelector('.bc-poll-yes');
        const noBtn = pollEl.querySelector('.bc-poll-no');
        [yesBtn, noBtn].forEach(b => b.classList.remove('bc-poll-voted'));
        if (data.user_vote === 'yes') yesBtn.classList.add('bc-poll-voted');
        if (data.user_vote === 'no') noBtn.classList.add('bc-poll-voted');

        yesBtn.querySelector('.bc-poll-bar-fill').style.width = yesPct + '%';
        noBtn.querySelector('.bc-poll-bar-fill').style.width = noPct + '%';
        yesBtn.querySelector('.bc-poll-count').textContent = yesPct + '%';
        noBtn.querySelector('.bc-poll-count').textContent = noPct + '%';
    } catch (e) { console.error('Poll vote error:', e); }
}
window.votePoll = votePoll;

// ============================================
// Admin Panel
// ============================================

async function openAdminPanel() {
    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    modal.classList.add('active');
    // Close profile dropdowns
    document.getElementById('profile-dropdown')?.classList.remove('open');
    document.getElementById('mobile-profile-dropdown')?.classList.remove('open');
    await loadAdminUsers();
}

function closeAdminPanel() {
    const modal = document.getElementById('admin-modal');
    if (modal) modal.classList.remove('active');
}

let _adminUsersCache = [];

async function loadAdminUsers() {
    const list = document.getElementById('admin-users-list');
    if (!list) return;
    list.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Loading...</p>';
    const searchInput = document.getElementById('admin-search');
    if (searchInput) searchInput.value = '';
    try {
        const res = await fetch(`${API_BASE}/api/admin/users`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('Not authorized');
        const data = await res.json();
        _adminUsersCache = data.users || [];
        renderAdminUsers(_adminUsersCache);
    } catch (e) {
        list.innerHTML = `<p style="color: #ef4444; text-align: center;">Error: ${e.message}</p>`;
    }
}

function renderAdminUsers(users) {
    const list = document.getElementById('admin-users-list');
    if (!list) return;
    if (!users || users.length === 0) {
        list.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No users found.</p>';
        return;
    }
    list.innerHTML = users.map(u => {
        const month = u.debates_reset_month || '-';
        const isCurrentMonth = month === new Date().toISOString().slice(0, 7);
        const buzzes = isCurrentMonth ? (u.debates_used || 0) : 0;
        const plan = u.subscription_status === 'active' ? '<span style="color: #22c55e; font-weight: 600;">PRO</span>' : '<span style="color: var(--text-secondary);">Free</span>';
        return `<div style="background: var(--surface-light); border-radius: 12px; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
            <div style="min-width: 0; flex: 1;">
                <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${u.display_name || u.email}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">${u.email} &middot; ${plan} &middot; ${buzzes} buzzes</div>
            </div>
            <div style="display: flex; gap: 6px; flex-shrink: 0;">
                <button onclick="adminResetBuzzes('${u.id}')" style="padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--surface); color: var(--text-primary); cursor: pointer; font-size: 0.8rem;">Reset Buzzes</button>
                <button onclick="adminTogglePro('${u.id}', '${u.subscription_status}')" style="padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--surface); color: var(--text-primary); cursor: pointer; font-size: 0.8rem;">${u.subscription_status === 'active' ? 'Remove Pro' : 'Give Pro'}</button>
            </div>
        </div>`;
    }).join('');
}

function filterAdminUsers(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
        renderAdminUsers(_adminUsersCache);
        return;
    }
    const filtered = _adminUsersCache.filter(u =>
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.display_name && u.display_name.toLowerCase().includes(q))
    );
    renderAdminUsers(filtered);
}

async function adminResetBuzzes(userId) {
    try {
        const res = await fetch(`${API_BASE}/api/admin/reset-buzzes`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        alert(`Buzzes reset for ${data.email}`);
        loadAdminUsers();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

async function adminTogglePro(userId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'free' : 'active';
    try {
        const res = await fetch(`${API_BASE}/api/admin/set-subscription`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, status: newStatus })
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        alert(`${data.email} set to ${data.status}`);
        loadAdminUsers();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

window.openAdminPanel = openAdminPanel;
window.closeAdminPanel = closeAdminPanel;
window.adminResetBuzzes = adminResetBuzzes;
window.adminTogglePro = adminTogglePro;
window.filterAdminUsers = filterAdminUsers;
