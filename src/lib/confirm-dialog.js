import { escapeHtml } from './utils.js';

export function showConfirmDialog(message, { confirmLabel = 'Delete', cancelLabel = 'Cancel', tone = 'danger' } = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-msg">
                <p class="confirm-dialog__message" id="confirm-msg">${escapeHtml(message)}</p>
                <div class="confirm-dialog__actions">
                    <button type="button" class="confirm-dialog__btn confirm-dialog__btn--cancel">${escapeHtml(cancelLabel)}</button>
                    <button type="button" class="confirm-dialog__btn confirm-dialog__btn--confirm ${tone === 'danger' ? 'confirm-dialog__btn--danger' : ''}">${escapeHtml(confirmLabel)}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Focus the cancel button (safer default)
        const cancelBtn = overlay.querySelector('.confirm-dialog__btn--cancel');
        const confirmBtn = overlay.querySelector('.confirm-dialog__btn--confirm');
        requestAnimationFrame(() => cancelBtn.focus());

        const cleanup = (result) => {
            overlay.remove();
            resolve(result);
        };

        cancelBtn.addEventListener('click', () => cleanup(false));
        confirmBtn.addEventListener('click', () => cleanup(true));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup(false);
        });
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') cleanup(false);
            // Focus trap
            if (e.key === 'Tab') {
                const focusable = [cancelBtn, confirmBtn];
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        });
    });
}
