import "../styles/account.css";
import "../styles/main.css";
import "../styles/style.v1.css";
import {
  ensureAuthSession,
  getCurrentUserProfile,
  signOutUser
} from '../lib/auth.js';
import {
  getUserSettings,
  updateUserSettings
} from '../lib/storage.js';

const shortcutsList = document.getElementById('shortcutsList');
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

  await loadShortcuts();
}

/**
 * Shortcuts Logic
 */

let recordingKey = null;

async function loadShortcuts() {
  if (!shortcutsList) return;
  const settings = await getUserSettings();
  renderShortcuts(settings.shortcuts || {});
}

function renderShortcuts(shortcuts) {
  shortcutsList.innerHTML = '';
  const labels = {
    save: 'Save Idea',
    focusInput: 'Focus Input',
    search: 'Open Search',
    nextIdea: 'Next Idea',
    prevIdea: 'Previous Idea',
    hideUnhide: 'Hide/Unhide'
  };

  Object.entries(labels).forEach(([key, label]) => {
    const value = shortcuts[key] || '—';
    const item = document.createElement('div');
    item.className = 'shortcut-item';
    item.dataset.key = key;

    item.innerHTML = `
      <span class="shortcut-label">${label}</span>
      <kbd class="shortcut-key" role="button" tabindex="0">${value.replace('meta', '⌘').replace('ctrl', '⌃').replace('shift', '⇧').replace('alt', '⌥')}</kbd>
    `;

    const keyEl = item.querySelector('.shortcut-key');
    keyEl.addEventListener('click', () => startRecording(key, item));

    shortcutsList.appendChild(item);
  });
}

function startRecording(key, itemEl) {
  if (recordingKey) return; // Already recording something

  recordingKey = key;
  itemEl.classList.add('is-recording');
  const keyEl = itemEl.querySelector('.shortcut-key');
  const originalValue = keyEl.textContent;
  keyEl.textContent = 'Recording…';

  const handleKeyDown = async (e) => {
    if (e.key === 'Escape') {
      stopRecordingStyle();
      keyEl.textContent = originalValue;
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Ignore modifier-only keydowns
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

    const parts = [];
    if (e.metaKey || e.ctrlKey) parts.push('meta');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    parts.push(e.key.toLowerCase());

    const newShortcut = parts.join('+');

    stopRecordingStyle();

    try {
      const settings = await getUserSettings();
      const updatedShortcuts = { ...settings.shortcuts, [recordingKey]: newShortcut };
      await updateUserSettings({ ...settings, shortcuts: updatedShortcuts });
      renderShortcuts(updatedShortcuts);
      showCopyStatus('Shortcut updated!', 'success');
    } catch (err) {
      console.error('Failed to update shortcut', err);
      showCopyStatus('Failed to save shortcut', 'error');
      keyEl.textContent = originalValue;
    }
  };

  const stopRecordingStyle = () => {
    recordingKey = null;
    itemEl.classList.remove('is-recording');
    window.removeEventListener('keydown', handleKeyDown, true);
  };

  window.addEventListener('keydown', handleKeyDown, true);
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
