/**
 * Authentication handling for login and registration
 */

const API_BASE = '';
let isLoginMode = true;

// Toggle between login and register
document.getElementById('auth-toggle-link').addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    updateAuthUI();
    hideAlert();
});

function updateAuthUI() {
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const toggleText = document.getElementById('auth-toggle-text');
    const toggleLink = document.getElementById('auth-toggle-link');

    if (isLoginMode) {
        title.textContent = 'Welcome back';
        subtitle.textContent = 'Sign in to continue to Ensemble AI';
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        toggleText.textContent = "Don't have an account?";
        toggleLink.textContent = 'Sign up';
    } else {
        title.textContent = 'Create an account';
        subtitle.textContent = 'Get started with Ensemble AI';
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        toggleText.textContent = 'Already have an account?';
        toggleLink.textContent = 'Sign in';
    }
}

// Alert functions
function showAlert(message, type = 'error') {
    const alert = document.getElementById('alert');
    alert.textContent = message;
    alert.className = `alert alert-${type}`;
    alert.style.display = 'block';
}

function hideAlert() {
    document.getElementById('alert').style.display = 'none';
}

// Set loading state
function setLoading(form, loading) {
    const btn = form.querySelector('button[type="submit"]');
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.spinner');

    btn.disabled = loading;
    btnText.style.display = loading ? 'none' : 'inline';
    spinner.style.display = loading ? 'inline-block' : 'none';
}

// Login form handler
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const form = e.target;
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    setLoading(form, true);

    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Login failed');
        }

        localStorage.setItem('token', data.access_token);
        window.location.href = '/app';
    } catch (error) {
        showAlert(error.message);
    } finally {
        setLoading(form, false);
    }
});

// Register form handler
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const form = e.target;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    const privacyAccepted = document.getElementById('privacy-checkbox').checked;

    if (password !== confirm) {
        showAlert('Passwords do not match');
        return;
    }

    if (password.length < 6) {
        showAlert('Password must be at least 6 characters');
        return;
    }

    if (!privacyAccepted) {
        showAlert('You must accept the Privacy Policy to create an account');
        return;
    }

    setLoading(form, true);

    try {
        const response = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, privacy_accepted: privacyAccepted })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Registration failed');
        }

        localStorage.setItem('token', data.access_token);
        window.location.href = '/app';
    } catch (error) {
        showAlert(error.message);
    } finally {
        setLoading(form, false);
    }
});
