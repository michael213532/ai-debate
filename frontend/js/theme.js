/**
 * Theme Management
 * Handles light/dark mode toggle and persistence
 */

const THEME_KEY = 'theme';
const DARK_THEME = 'dark';
const LIGHT_THEME = 'light';

// Initialize theme on page load - runs immediately
(function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === DARK_THEME) {
        document.documentElement.setAttribute('data-theme', DARK_THEME);
    }
})();

// Get current theme
function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || LIGHT_THEME;
}

// Set theme
function setTheme(theme) {
    if (theme === DARK_THEME) {
        document.documentElement.setAttribute('data-theme', DARK_THEME);
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem(THEME_KEY, theme);
    updateThemeToggleUI();
}

// Toggle between themes
function toggleTheme() {
    const currentTheme = getCurrentTheme();
    setTheme(currentTheme === DARK_THEME ? LIGHT_THEME : DARK_THEME);
}

// Update toggle UI to reflect current theme
function updateThemeToggleUI() {
    const isDark = getCurrentTheme() === DARK_THEME;

    // Update all toggle switches on page
    document.querySelectorAll('.theme-switch input').forEach(input => {
        input.checked = isDark;
    });
}

// Initialize toggle listeners after DOM loads
document.addEventListener('DOMContentLoaded', () => {
    updateThemeToggleUI();

    // Add change handlers to all theme toggles
    document.querySelectorAll('.theme-switch input').forEach(input => {
        input.addEventListener('change', () => {
            setTheme(input.checked ? DARK_THEME : LIGHT_THEME);
        });
    });
});
