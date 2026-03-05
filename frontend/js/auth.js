/**
 * Authentication handling for login and registration
 */

const API_BASE = '';

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
function setLoading(btn, loading) {
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.spinner');

    if (btnText && spinner) {
        btn.disabled = loading;
        btnText.style.display = loading ? 'none' : 'inline';
        spinner.style.display = loading ? 'inline-block' : 'none';
    }
}

// Login form handler
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const form = e.target;
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = form.querySelector('button[type="submit"]');

    setLoading(btn, true);

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
        window.location.href = '/';
    } catch (error) {
        showAlert(error.message);
    } finally {
        setLoading(btn, false);
    }
});
