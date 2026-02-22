/**
 * auth.js — Google Sign-In integration
 * Verifies credentials server-side, stores nothing in localStorage for auth data.
 */
(function () {
    const GOOGLE_CLIENT_ID = '1065522748619-l0bepamjkq9a69dn3mlealt3t6a5rjeq.apps.googleusercontent.com';

    window.currentUser = null;

    // Called by Google SDK after user picks an account
    window.handleGoogleCredential = async function (response) {
        try {
            const res = await fetch('/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential }),
            });
            if (!res.ok) throw new Error('Auth failed');
            const user = await res.json();
            setUser(user);
        } catch (e) {
            console.error('Google login error:', e);
        }
    };

    async function checkSession() {
        try {
            const res = await fetch('/auth/me');
            const data = await res.json();
            if (data.user) {
                setUser(data.user);
            } else {
                renderLoggedOut();
            }
        } catch {
            renderLoggedOut();
        }
    }

    async function logout() {
        await fetch('/auth/logout', { method: 'POST' });
        window.currentUser = null;
        renderLoggedOut();
        window.dispatchEvent(new CustomEvent('userLoggedOut'));
    }

    function setUser(user) {
        window.currentUser = user;
        renderLoggedIn(user);
        window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: user }));
    }

    function renderLoggedIn(user) {
        const container = document.getElementById('authContainer');
        if (!container) return;
        container.innerHTML = `
            <div class="user-menu">
                <button class="user-avatar-btn" id="userMenuToggle" title="${escHtml(user.name)}">
                    ${user.picture
                ? `<img src="${escHtml(user.picture)}" alt="${escHtml(user.name)}" class="user-avatar-img">`
                : `<span class="user-avatar-placeholder">${escHtml(user.name[0] || '?')}</span>`
            }
                </button>
                <div class="user-menu-dropdown" id="userMenuDropdown">
                    <div class="user-menu-info">
                        <p class="user-menu-name">${escHtml(user.name)}</p>
                        <p class="user-menu-email">${escHtml(user.email)}</p>
                    </div>
                    <button class="user-menu-logout" id="logoutBtn" data-i18n="btn_logout">Вийти</button>
                </div>
            </div>
        `;
        document.getElementById('userMenuToggle').addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById('userMenuDropdown');
            dropdown.classList.toggle('open');
        });
        document.getElementById('logoutBtn').addEventListener('click', logout);
        document.addEventListener('click', () => {
            const dropdown = document.getElementById('userMenuDropdown');
            if (dropdown) dropdown.classList.remove('open');
        });
    }

    function renderLoggedOut() {
        const container = document.getElementById('authContainer');
        if (!container) return;
        container.innerHTML = `
            <div id="g_id_onload"
                data-client_id="${GOOGLE_CLIENT_ID}"
                data-context="signin"
                data-callback="handleGoogleCredential"
                data-auto_prompt="false">
            </div>
            <div class="g_id_signin"
                data-type="standard"
                data-shape="pill"
                data-theme="filled_black"
                data-text="sign_in_with"
                data-size="medium"
                data-locale="uk">
            </div>
        `;
        // Re-initialize Google GIS after rendering
        if (window.google && window.google.accounts) {
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: window.handleGoogleCredential,
            });
            google.accounts.id.renderButton(
                container.querySelector('.g_id_signin'),
                { theme: 'filled_black', size: 'medium', shape: 'pill', text: 'sign_in_with' }
            );
        }
    }

    function escHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    window.addEventListener('DOMContentLoaded', checkSession);

    // Update username field when user logs in/out
    window.addEventListener('userLoggedIn', (e) => {
        const field = document.getElementById('usernameInput');
        if (field) field.value = e.detail.name;

        // Notify the server about the real username on the already-open WS
        function sendSetUsername() {
            if (window._activeWs && window._activeWs.readyState === WebSocket.OPEN) {
                window._activeWs.send(JSON.stringify({ type: 'set_username', username: e.detail.name }));
            }
        }
        // Small delay to let stream.js/start_stream.js assign window._activeWs
        if (window._activeWs && window._activeWs.readyState === WebSocket.OPEN) {
            sendSetUsername();
        } else {
            window.addEventListener('wsReady', sendSetUsername, { once: true });
        }
    });
    window.addEventListener('userLoggedOut', () => {
        const field = document.getElementById('usernameInput');
        if (field) field.value = '';
    });

    // Re-render i18n strings for auth elements after language change
    window.addEventListener('languageChanged', () => {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn && window.t) logoutBtn.textContent = window.t('btn_logout');
    });
})();
