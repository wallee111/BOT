import { escapeHtml } from './utils.js';

export function showPromptDialog(message, { defaultValue = '', placeholder = '', confirmLabel = 'OK', cancelLabel = 'Cancel' } = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="prompt-msg">
                <p class="confirm-dialog__message" id="prompt-msg">${escapeHtml(message)}</p>
                <input type="text" class="confirm-dialog__input" placeholder="${escapeHtml(placeholder)}" />
                <div class="confirm-dialog__actions">
                    <button type="button" class="confirm-dialog__btn confirm-dialog__btn--cancel">${escapeHtml(cancelLabel)}</button>
                    <button type="button" class="confirm-dialog__btn confirm-dialog__btn--confirm">${escapeHtml(confirmLabel)}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('.confirm-dialog__input');
        const cancelBtn = overlay.querySelector('.confirm-dialog__btn--cancel');
        const confirmBtn = overlay.querySelector('.confirm-dialog__btn--confirm');

        input.value = defaultValue;
        requestAnimationFrame(() => {
            input.focus();
            input.select();
        });

        const cleanup = (result) => {
            overlay.remove();
            resolve(result);
        };

        const submit = () => {
            const value = input.value.trim();
            cleanup(value || null);
        };

        cancelBtn.addEventListener('click', () => cleanup(null));
        confirmBtn.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submit();
            }
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup(null);
        });
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') cleanup(null);
            // Focus trap
            if (e.key === 'Tab') {
                const focusable = [input, cancelBtn, confirmBtn];
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
