// Shared toast notification utility

function ensureToastContainer() {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    // WCAG 4.1.3: Status messages must be programmatically determinable
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, { tone = 'error', timeout = 4200, action = null } = {}) {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${tone === 'error' ? 'toast--error' : ''}`;
  // Ensure each toast is announced by screen readers
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');

  const content = document.createElement('div');
  content.className = 'toast__content';

  const icon = document.createElement('span');
  icon.className = 'toast__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = tone === 'error'
    ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

  const msg = document.createElement('div');
  msg.className = 'toast__message';
  msg.textContent = message;

  content.append(icon, msg);
  toast.appendChild(content);

  // Add action button if provided
  if (action && action.label && typeof action.onClick === 'function') {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'toast__action';
    actionBtn.type = 'button';
    actionBtn.textContent = action.label;
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      action.onClick();
      remove();
    });
    toast.appendChild(actionBtn);
  }

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

  toast.appendChild(close);
  container.appendChild(toast);

  if (timeout > 0) {
    window.setTimeout(remove, timeout);
  }
}
