import { escapeHtml, formatTime } from '../lib/utils.js';
import { addComment, subscribeToComments } from '../lib/storage.js';
import { showToast } from '../lib/toast.js';

export class ThreadManager {
    constructor(options = {}) {
        this.activeIdeaId = null;
        this.unsubscribe = null;
        this.mode = options.mode || 'overlay'; // 'overlay' or 'embedded'
        this.container = options.container || null;

        // If overlay mode, create global elements once
        if (this.mode === 'overlay') {
            this.elements = this.createOverlayElements();
            document.body.appendChild(this.elements.overlay);
            this.bindOverlayEvents();
        } else {
            // For embedded mode, we'll create elements on mount
            this.elements = null;
        }
    }

    createOverlayElements() {
        const overlay = document.createElement('div');
        overlay.className = 'thread-overlay';
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="thread-modal" role="dialog" aria-modal="true" aria-labelledby="threadTitle">
                <header class="thread-header">
                    <h2 id="threadTitle" class="thread-title">Thread</h2>
                    <button type="button" class="thread-close" aria-label="Close thread">
                        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </header>
                <div class="thread-content" id="threadContent"></div>
                <form class="thread-input-area" id="threadForm">
                    <textarea class="thread-input" placeholder="Add to thread..." rows="1" required></textarea>
                    <button type="submit" class="thread-send" aria-label="Send comment">
                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </form>
            </div>
        `;

        return {
            overlay,
            modal: overlay.querySelector('.thread-modal'),
            content: overlay.querySelector('.thread-content'),
            form: overlay.querySelector('#threadForm'),
            input: overlay.querySelector('.thread-input'),
            closeBtn: overlay.querySelector('.thread-close'),
            title: overlay.querySelector('.thread-title') // Added for updating title if needed
        };
    }

    createEmbeddedElements(container) {
        container.innerHTML = `
            <div class="thread-embedded">
                <div class="thread-content" id="threadContentEmbedded"></div>
                <form class="thread-input-area" id="threadFormEmbedded">
                    <textarea class="thread-input" placeholder="Add a comment..." rows="1" required></textarea>
                    <button type="submit" class="thread-send" aria-label="Send comment">
                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </form>
            </div>
        `;

        return {
            container,
            content: container.querySelector('.thread-content'),
            form: container.querySelector('.thread-input-area'),
            input: container.querySelector('.thread-input')
        };
    }

    bindOverlayEvents() {
        this.elements.closeBtn.addEventListener('click', () => this.close());
        this.elements.overlay.addEventListener('click', (e) => {
            if (e.target === this.elements.overlay) this.close();
        });
        this.bindInputEvents(this.elements);
    }

    bindInputEvents(elements) {
        elements.input.addEventListener('input', () => {
            elements.input.style.height = 'auto';
            elements.input.style.height = elements.input.scrollHeight + 'px';
        });

        elements.form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = elements.input.value.trim();
            if (!text || !this.activeIdeaId) return;

            try {
                // Optimistic UI could go here
                await addComment(this.activeIdeaId, text);
                elements.input.value = '';
                elements.input.style.height = 'auto';
                elements.input.focus();
            } catch (err) {
                console.error("Failed to send comment", err);
                showToast("Failed to send comment. Please try again.");
            }
        });
    }

    open(ideaId) {
        if (this.mode !== 'overlay') return;
        if (this.activeIdeaId === ideaId) return;

        this.cleanupSubscription();
        this.activeIdeaId = ideaId;

        this.elements.overlay.hidden = false;
        this.elements.overlay.setAttribute('aria-hidden', 'false');
        this.elements.input.focus();
        document.body.style.overflow = 'hidden';

        this.renderLoading(this.elements.content);

        this.unsubscribe = subscribeToComments(ideaId, (comments) => {
            this.renderComments(comments, this.elements.content);
        });
    }

    mount(container, ideaId) {
        if (this.mode === 'overlay') return; // Should not use mount on overlay mode manager

        // If we are already mounted on this container with this idea, do nothing
        if (this.container === container && this.activeIdeaId === ideaId) return;

        this.cleanupSubscription();
        this.activeIdeaId = ideaId;
        this.container = container;

        // Re-create elements for this container
        this.elements = this.createEmbeddedElements(container);
        this.bindInputEvents(this.elements);

        this.renderLoading(this.elements.content);

        this.unsubscribe = subscribeToComments(ideaId, (comments) => {
            this.renderComments(comments, this.elements.content);
        });
    }

    close() {
        if (this.mode !== 'overlay') return;
        this.cleanupSubscription();
        this.activeIdeaId = null;
        this.elements.overlay.hidden = true;
        this.elements.overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        this.elements.content.innerHTML = '';
    }

    cleanupSubscription() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    renderLoading(contentEl) {
        contentEl.innerHTML = '<div class="thread-loading">Loading comments...</div>';
    }

    renderComments(comments, contentEl) {
        if (!comments || comments.length === 0) {
            contentEl.innerHTML = '<div class="thread-empty">No comments yet.</div>';
            return;
        }

        contentEl.innerHTML = comments.map(comment => `
            <div class="thread-message">
                <div class="thread-message-text">${escapeHtml(comment.text)}</div>
                <div class="thread-message-meta">${formatTime(comment.createdAt)}</div>
            </div>
        `).join('');

        // Scroll to bottom
        contentEl.scrollTop = contentEl.scrollHeight;
    }
}
