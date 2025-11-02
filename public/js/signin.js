import { signInWithGoogle, getCurrentUser } from '../auth.js';

const signInButton = document.getElementById('googleSignInBtn');
const statusMessage = document.getElementById('statusMessage');

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
    signInButton.textContent = 'Signing in...';
    try {
      await signInWithGoogle();
      window.location.href = 'index.html';
    } catch (error) {
      console.error('[signin] Google sign-in failed', error);
      let message = 'Unable to sign in. Please try again.';
      if (error?.code === 'auth/popup-blocked') {
        message = 'Pop-up blocked. Please allow pop-ups for this site and try again.';
      } else if (error?.code === 'auth/network-request-failed') {
        message = 'Network error. Check your connection and try again.';
      }
      showStatus(message, 'error');
      signInButton.disabled = false;
      signInButton.textContent = 'Continue with Google';
    }
  });
}
