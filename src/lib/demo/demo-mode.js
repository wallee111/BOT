// src/lib/demo/demo-mode.js

const DEMO_KEY = 'bot_demo_mode';

/** Check if current session is in demo mode */
export function isDemo() {
  return sessionStorage.getItem(DEMO_KEY) === 'true';
}

/** Enter demo mode and navigate to capture page */
export function startDemo() {
  sessionStorage.setItem(DEMO_KEY, 'true');
  window.location.href = '/index.html';
}

/** Exit demo mode (called before real sign-in) */
export function exitDemo() {
  sessionStorage.removeItem(DEMO_KEY);
}

/** Inject a "Demo Mode" banner at the top of the page */
export function injectDemoBanner() {
  if (!isDemo()) return;
  if (document.getElementById('demo-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'demo-banner';
  banner.innerHTML = `
    <span>Demo Mode</span>
    <a href="/signin.html">Sign up for full experience &rarr;</a>
  `;
  banner.setAttribute('style', [
    'position: fixed',
    'top: 0',
    'left: 0',
    'right: 0',
    'z-index: 9999',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'gap: 12px',
    'padding: 6px 16px',
    'background: #ffca28',
    'color: #18182d',
    'font-size: 13px',
    'font-weight: 600',
    'font-family: inherit',
  ].join(';'));

  const link = banner.querySelector('a');
  link.setAttribute('style', [
    'color: #18182d',
    'text-decoration: underline',
    'font-weight: 500',
  ].join(';'));

  document.body.prepend(banner);

  // Push page content down so nothing hides behind the banner
  document.body.style.paddingTop = banner.offsetHeight + 'px';
}
