/**
 * Authentication handling for login and registration
 */

const API_BASE = '';

// Check if already logged in
(function checkAuth() {
    const token = localStorage.getItem('token');
    if (token) {
        window.location.href = '/app';
    }
})();

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;

        // Update active tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Show/hide forms
        document.getElementById('login-form').style.display = tabName === 'login' ? 'block' : 'none';
        document.getElementById('register-form').style.display = tabName === 'register' ? 'block' : 'none';

        // Clear alert
        hideAlert();
    });
});

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

    if (password !== confirm) {
        showAlert('Passwords do not match');
        return;
    }

    if (password.length < 6) {
        showAlert('Password must be at least 6 characters');
        return;
    }

    setLoading(form, true);

    try {
        const response = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
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
