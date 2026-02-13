import "../styles/account.css";
import "../styles/main.css";
import "../styles/style.v1.css";
import {
  ensureAuthSession,
  getCurrentUserProfile,
  signOutUser
} from '../lib/auth.js';

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
    const confirmed = confirm('Sign out of your account?');
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
