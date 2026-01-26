import { signInWithGoogle, getCurrentUser } from '../auth.js';

const signInButton = document.getElementById('googleSignInBtn');
const statusMessage = document.getElementById('statusMessage');
const signInLabel = signInButton?.querySelector('.btn-google__label');

// Simple toast utility for transient alerts
function ensureToastContainer() {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, { tone = 'error', timeout = 4200 } = {}) {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${tone === 'error' ? 'toast--error' : ''}`;

  const icon = document.createElement('span');
  icon.className = 'toast__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = tone === 'error'
    ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

  const msg = document.createElement('div');
  msg.className = 'toast__message';
  msg.textContent = message;

  const close = document.createElement('button');
  close.className = 'toast__close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss');
  close.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  const remove = () => {
    toast.style.animation = 'toast-out 160ms ease-in forwards';
    window.setTimeout(() => {
      toast.remove();
      if (!container.children.length) {
        container.remove();
      }
    }, 170);
  };
  close.addEventListener('click', remove);

  toast.append(icon, msg, close);
  container.appendChild(toast);

  if (timeout > 0) {
    window.setTimeout(remove, timeout);
  }
}

function showStatus(message, type = 'info') {
  if (!statusMessage) return;
  statusMessage.className = `status-message ${type}`;
  statusMessage.textContent = message;
  statusMessage.hidden = false;
}

function clearStatus() {
  if (!statusMessage) return;
  statusMessage.hidden = true;
  statusMessage.textContent = '';
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy-failed'));
    } catch (e) {
      reject(e);
    }
  });
}

function showUnauthorizedDomainHelp(hostname, message) {
  showStatus(message, 'error');
  try {
    if (!statusMessage) return;
    const details = document.createElement('div');
    details.style.marginTop = '8px';
    const label = document.createElement('div');
    label.style.marginBottom = '6px';
    label.textContent = 'Add this domain in Firebase Console → Authentication → Settings → Authorized domains:';
    const code = document.createElement('code');
    code.textContent = hostname;
    code.style.padding = '2px 6px';
    code.style.background = '#f1f3f5';
    code.style.borderRadius = '4px';
    code.style.marginRight = '8px';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Copy domain';
    btn.style.marginLeft = '6px';
    btn.style.padding = '4px 8px';
    btn.style.borderRadius = '6px';
    btn.style.border = '1px solid #ddd';
    btn.style.background = '#fff';
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', async () => {
      try {
        await copyToClipboard(hostname);
        showToast('Domain copied to clipboard');
      } catch (_e) {
        showToast('Unable to copy. Please copy manually.', { tone: 'error' });
      }
    });
    const row = document.createElement('div');
    row.append(code, btn);
    details.append(label, row);
    statusMessage.appendChild(details);
  } catch {
    // no-op
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await getCurrentUser();
  if (user) {
    window.location.href = 'index.html';
  }
});

if (signInButton) {
  signInButton.addEventListener('click', async () => {
    clearStatus();
    signInButton.disabled = true;
    if (signInLabel) {
      signInLabel.textContent = 'Signing in...';
    } else {
      signInButton.textContent = 'Signing in...';
    }
    try {
      await signInWithGoogle();
      window.location.href = 'index.html';
    } catch (error) {
      console.error('[signin] Google sign-in failed', error);
      let message = 'Unable to sign in. Please try again.';
      const code = error?.code || '';
      switch (code) {
        case 'auth/popup-closed-by-user':
          message = 'Popup closed before completing sign in. Please try again.';
          break;
        case 'auth/cancelled-popup-request':
          message = 'Another sign-in attempt is in progress. Please try again.';
          break;
        case 'auth/popup-blocked':
          message = 'Pop-up blocked. Allow pop-ups for this site and try again.';
          break;
        case 'auth/network-request-failed':
          message = 'Network error. Check your connection and try again.';
          break;
        case 'auth/unauthorized-domain':
          message = 'This domain isn’t authorized for sign-in.';
          break;
        case 'auth/operation-not-allowed':
          message = 'Google sign-in isn’t enabled for this project.';
          break;
        case 'auth/internal-error':
        case 'auth/cookie-policy-rejected':
          message = 'Sign-in failed. If this persists, allow third-party cookies for accounts.google.com and try again.';
          break;
        case 'auth/invalid-api-key':
        case 'auth/invalid-credential':
          message = 'Configuration error. Please refresh and try again.';
          break;
      }
      if (code === 'auth/unauthorized-domain') {
        const hostname = window.location.hostname;
        showUnauthorizedDomainHelp(hostname, message);
      } else {
        showStatus(message, 'error');
      }
      showToast(message, { tone: 'error' });
      signInButton.disabled = false;
      if (signInLabel) {
        signInLabel.textContent = 'Continue with Google';
      } else {
        signInButton.textContent = 'Continue with Google';
      }
    }
  });
}
