import {
  ensureAuthSession,
  getCurrentUserProfile,
  signOutUser
} from '../auth.js';

const userIdDisplay = document.getElementById('userIdDisplay');
const userEmailDisplay = document.getElementById('userEmailDisplay');
const userNameDisplay = document.getElementById('userNameDisplay');
const copyBtn = document.getElementById('copyBtn');
const copyStatus = document.getElementById('copyStatus');
const signOutBtn = document.getElementById('signOutBtn');

let currentProfile = null;

function showCopyStatus(message, type = 'success') {
  if (!copyStatus) return;
  copyStatus.className = `status-message ${type}`;
  copyStatus.textContent = message;
  setTimeout(() => {
    copyStatus.textContent = '';
    copyStatus.className = 'status-message';
  }, 3000);
}

async function loadProfile() {
  try {
    await ensureAuthSession({ requireAuth: true });
  } catch (error) {
    window.location.href = 'signin.html';
    return;
  }

  currentProfile = await getCurrentUserProfile();
  if (!currentProfile) {
    window.location.href = 'signin.html';
    return;
  }

  if (userIdDisplay) {
    userIdDisplay.textContent = currentProfile.uid;
  }
  if (userEmailDisplay) {
    userEmailDisplay.textContent = currentProfile.email || 'No email available';
  }
  if (userNameDisplay) {
    userNameDisplay.textContent = currentProfile.displayName || '—';
  }
  if (copyBtn) {
    copyBtn.disabled = false;
  }
}

if (copyBtn) {
  copyBtn.addEventListener('click', async () => {
    if (!currentProfile?.uid) {
      showCopyStatus('No user ID to copy', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(currentProfile.uid);
      showCopyStatus('✓ User ID copied to clipboard!');
    } catch (error) {
      console.error('[account] Failed to copy user ID', error);
      showCopyStatus('Unable to copy. Copy manually instead.', 'error');
    }
  });
}

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
