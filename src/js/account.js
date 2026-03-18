import "../styles/account.css";
import "../styles/main.css";
import "../styles/style.v1.css";
import {
  ensureAuthSession,
  getCurrentUserProfile,
  signOutUser
} from '../lib/auth.js';
import { showConfirmDialog } from '../lib/confirm-dialog.js';

const userEmailDisplay = document.getElementById('userEmailDisplay');
const signOutBtn = document.getElementById('signOutBtn');

/**
 * Load and display the user's email
 */
async function loadProfile() {
  try {
    const user = await ensureAuthSession({ requireAuth: true });
    if (!user) {
      window.location.href = 'signin.html';
      return;
    }
  } catch (error) {
    console.error('[account] Auth required but failed:', error);
    window.location.href = 'signin.html';
    return;
  }

  const currentProfile = await getCurrentUserProfile();
  if (!currentProfile) {
    console.warn('[account] No user profile found');
    window.location.href = 'signin.html';
    return;
  }

  if (userEmailDisplay) {
    userEmailDisplay.textContent = currentProfile.email || 'No email available';
  }
}

/**
 * Handle sign out
 */
if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    const confirmed = await showConfirmDialog('Sign out of your account?', { confirmLabel: 'Sign Out', tone: 'default' });
    if (!confirmed) return;
    try {
      await signOutUser();
    } finally {
      localStorage.removeItem('ideas_v1_cache');
      localStorage.removeItem('category_settings_v1');
      localStorage.removeItem('category_usage_v1');
      window.location.href = 'signin.html';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadProfile().catch((error) => {
    console.error('[account] Unable to load profile', error);
    window.location.href = 'signin.html';
  });
});

// --- Theme Toggle ---
(function() {
    const THEME_KEY = 'bot_theme_v1';
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', saved);

    function updateToggleState() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const btn = document.getElementById('themeToggleAccount');
        const label = document.getElementById('themeLabel');
        if (btn) {
            btn.setAttribute('aria-checked', isDark ? 'true' : 'false');
        }
        if (label) {
            label.textContent = isDark ? 'Dark mode' : 'Light mode';
        }
    }

    const toggle = () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(THEME_KEY, next);
        updateToggleState();
    };

    // Handle all theme toggles
    document.getElementById('themeToggleSidebar')?.addEventListener('click', toggle);
    document.getElementById('themeToggle')?.addEventListener('click', toggle);
    document.getElementById('themeToggleAccount')?.addEventListener('click', toggle);

    // Initialize state on load (module scripts run after DOMContentLoaded)
    updateToggleState();
})();
