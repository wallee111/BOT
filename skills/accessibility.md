# Accessibility Skill

## Overview

WCAG 2.1 compliance ensuring BOT is usable by everyone, including people with disabilities. Keyboard navigation, screen readers, semantic HTML, and high contrast design.

## Features

- ✅ **Keyboard Navigation**: All features accessible via keyboard
- ✅ **Screen Readers**: Semantic HTML + ARIA labels
- ✅ **Skip Links**: Jump over navigation to main content
- ✅ **Focus Indicators**: Visible focus states
- ✅ **Color Contrast**: WCAG AA compliance
- ✅ **Semantic HTML**: Proper heading hierarchy, landmarks
- ✅ **ARIA Labels**: Form inputs properly labeled
- ✅ **Live Regions**: Dynamic content announced to screen readers
- ✅ **Mobile Accessibility**: Touch targets > 44x44px

## Key Files

- All HTML files: Semantic markup
- `src/styles/style.v1.css` — Focus states and skip links
- `src/lib/utils.js` — Accessibility helpers
- `firestore.rules` — Data validation

## Skip Links

Every page includes a skip link to jump to main content:

```html
<a href="#main" class="skip-link">Skip to main content</a>

<main id="main">
    <!-- Page content -->
</main>
```

Styling (show only on focus):

```css
.skip-link {
    position: absolute;
    left: -9999px;
    z-index: 999;
    padding: 1em;
    background: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
}

.skip-link:focus {
    left: 0;
    top: 0;
}
```

## Semantic HTML

### Headings

```html
<h1>Bucket of Thoughts</h1>
<h2>Pinned Ideas</h2>
<h3>Work Category</h3>
```

Proper hierarchy ensures screen readers can navigate by heading level.

### Navigation

```html
<!-- Desktop -->
<aside aria-label="Main Navigation">
    <nav class="sidebar-nav">
        <a href="index.html">Capture</a>
        <a href="review.html">Review</a>
    </nav>
</aside>

<!-- Mobile -->
<nav class="bottom-nav" aria-label="Bottom Navigation">
    <a href="index.html" aria-current="page">Capture</a>
    <a href="review.html">Review</a>
</nav>
```

### Landmarks

```html
<header>
    <!-- Page header -->
</header>

<main id="main">
    <!-- Main content -->
</main>

<aside>
    <!-- Sidebar navigation -->
</aside>

<footer>
    <!-- Footer info -->
</footer>
```

Screen readers can jump to landmarks with shortcuts (H, N, etc.).

## Form Accessibility

### Labels

```html
<!-- Implicit association (wrapping) -->
<label>
    Email
    <input type="email" required>
</label>

<!-- Explicit association (preferred) -->
<label for="emailInput">Email</label>
<input id="emailInput" type="email" required>
```

### Required Fields

```html
<label for="text">What's on your mind? <span aria-label="required">*</span></label>
<textarea id="text" required aria-required="true"></textarea>
```

### Error Messages

```html
<input id="categorySelect" aria-invalid="false" aria-describedby="categoryError">
<div id="categoryError" role="alert">
    Please select a category
</div>
```

Role="alert" announces errors to screen readers immediately.

### Hidden Labels (Visually Hidden)

```html
<label for="text" class="visually-hidden">What's on your mind?</label>
<textarea id="text" placeholder="What's on your mind?"></textarea>

CSS:
.visually-hidden {
    position: absolute;
    left: -10000px;
    width: 1px;
    height: 1px;
    overflow: hidden;
}
```

## ARIA Labels

### Buttons without Text

```html
<!-- Close button with only icon -->
<button aria-label="Close dialog" type="button">×</button>

<!-- Pin button with emoji icon -->
<button class="idea-pin"
        data-id="${idea.id}"
        aria-label="${idea.pinned ? 'Unpin this idea' : 'Pin this idea'}">
    ${idea.pinned ? '📌' : '📍'}
</button>

<!-- Thread button -->
<button class="idea-thread"
        data-id="${idea.id}"
        aria-label="Open comments for this idea">
    💬
</button>
```

### Live Regions

```html
<!-- Toast notifications -->
<div id="toastContainer"
     role="region"
     aria-live="polite"
     aria-label="Notifications">
    <!-- Toasts announced as they appear -->
</div>

<!-- Dynamic list updates -->
<div id="ideaFeed"
     aria-live="polite"
     aria-label="Ideas">
    <!-- New ideas announced as they load -->
</div>
```

aria-live="polite" announces changes without interrupting screen reader.

### Expandable Sections

```html
<button class="dash-section__toggle"
        id="hiddenToggle"
        aria-expanded="false"
        aria-label="Toggle hidden ideas section"
        aria-controls="hiddenFeed">
    Hidden <span class="dash-section__count"></span>
</button>

<div id="hiddenFeed"
     hidden
     aria-hidden="false">
    <!-- Hidden ideas -->
</div>

JavaScript:
hiddenToggle.addEventListener('click', () => {
    const expanded = hiddenToggle.getAttribute('aria-expanded') === 'true'
    hiddenToggle.setAttribute('aria-expanded', !expanded)
    hiddenFeed.hidden = expanded
})
```

## Color Contrast

### Text Contrast (WCAG AA)

All text must have contrast ratio ≥ 4.5:1

```css
/* Good: Dark text on light background */
color: #333333;
background-color: #ffffff;
/* Ratio: 12.6:1 ✓ */

/* Good: Light text on dark background */
color: #ffffff;
background-color: #000000;
/* Ratio: 21:1 ✓ */

/* Bad: Gray text on light background */
color: #888888;
background-color: #ffffff;
/* Ratio: 2.3:1 ✗ */
```

### Check Contrast

Use tools like:
- [WCAG Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Accessible Colors](https://accessible-colors.com/)
- Firefox DevTools: Accessibility Inspector

### Dark Theme

BOT uses dark theme (#18182d background) with golden primary (#ffca28):

```css
--md-sys-color-background: #18182d;
--md-sys-color-primary: #ffca28;
--md-sys-color-on-primary: #000000; /* High contrast */
```

## Focus Indicators

### Default Focus (visible)

```css
/* Show focus outline */
button:focus,
input:focus,
a:focus {
    outline: 3px solid var(--md-sys-color-primary);
    outline-offset: 2px;
}

/* Remove default outline only if replacing it */
button:focus-visible {
    outline: 3px solid var(--md-sys-color-primary);
    outline-offset: 2px;
}
```

Never hide focus without replacing it.

### Focus Visible (Modern)

```css
/* Show outline only on keyboard focus, not mouse */
button:focus-visible {
    outline: 3px solid var(--md-sys-color-primary);
}

button:focus:not(:focus-visible) {
    outline: none;
}
```

## Keyboard Navigation

### Tab Order

HTML document order determines tab order:

```html
<!-- Tab will navigate: Button 1 → Input → Button 2 -->
<button>Button 1</button>
<input type="text">
<button>Button 2</button>
```

If needed, use tabindex (sparingly):

```html
<input tabindex="1"> <!-- Tab first -->
<button tabindex="2"></button>
<div tabindex="-1">Not tabbable</div>
```

### Keyboard Events

```javascript
// Allow form submission with Enter
textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        ideaForm.dispatchEvent(new Event('submit'))
    }
})

// Close with Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeDialog()
    }
})
```

### Menu Navigation (Arrow Keys)

```javascript
// Arrow keys navigate menu items
menu.addEventListener('keydown', (e) => {
    const items = menu.querySelectorAll('.md3-menu__item')
    const currentIndex = Array.from(items).indexOf(
        document.activeElement
    )

    if (e.key === 'ArrowDown') {
        e.preventDefault()
        items[(currentIndex + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const newIndex = currentIndex - 1
        items[newIndex < 0 ? items.length - 1 : newIndex]?.focus()
    }
})
```

## Touch Targets

All interactive elements must be ≥ 44x44 CSS pixels:

```css
button {
    min-width: 44px;
    min-height: 44px;
    padding: 8px 12px;
}

input[type="checkbox"] {
    min-width: 44px;
    min-height: 44px;
}

.idea-pin {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
}
```

## Mobile Accessibility

### Viewport Meta Tag

```html
<meta name="viewport"
      content="width=device-width,
               initial-scale=1.0,
               viewport-fit=cover">
```

Allows zoom (never use `user-scalable=no`).

### Input Font Size

Font < 16px on iOS triggers zoom on input focus. Always use:

```html
<input type="text" style="font-size: 16px;">
```

## Testing

### Screen Reader Testing

1. **NVDA (Windows)**
   - Free, open-source
   - Download: https://www.nvaccess.org/

2. **JAWS (Windows)**
   - Industry standard
   - Paid

3. **VoiceOver (Mac/iOS)**
   - Built-in
   - Cmd+F5 to enable

### Keyboard Testing

1. Tab through entire page without mouse
2. Verify focus is visible
3. Verify all functionality works
4. Test Escape, Enter, Arrow keys

### Automated Testing

```javascript
// Using axe DevTools
axe.run((error, results) => {
    if (results.violations.length > 0) {
        console.error('Accessibility violations:', results.violations)
    }
})
```

Browser extension: [axe DevTools](https://www.deque.com/axe/devtools/)

### Manual Checklist

- [ ] Keyboard-only navigation works
- [ ] Focus indicators visible
- [ ] Skip link works
- [ ] Heading hierarchy correct
- [ ] Forms properly labeled
- [ ] Color contrast ≥ 4.5:1
- [ ] Touch targets ≥ 44x44px
- [ ] Images have alt text (if applicable)
- [ ] Links have descriptive text
- [ ] Buttons have accessible names
- [ ] No keyboard traps
- [ ] Page resizable to 200% without horizontal scroll
- [ ] No flashing content (≥3/second)

## WCAG 2.1 Levels

### Level A (Minimum)

- Alternative text for images
- Keyboard accessible
- Focus visible
- Color not sole means of conveying info

### Level AA (Target)

- 4.5:1 contrast for text
- 3:1 contrast for graphics
- Reflow at 200%
- Resize text to 200%
- No keyboard traps
- Headings and labels

### Level AAA (Enhanced)

- 7:1 contrast for text
- Enhanced zoom support
- Sign language for video
- Transcripts for audio

**BOT targets Level AA** across all pages.

## Accessibility Statement

Consider adding to footer:

```html
<footer>
    <p>
        <a href="/accessibility.html">Accessibility Statement</a>
    </p>
</footer>
```

## Resources

- [WebAIM](https://webaim.org/)
- [MDN Web Docs - Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [A11y Project](https://www.a11yproject.com/)

## Known Limitations

- [ ] Transcripts for future audio content
- [ ] Captions for future video content
- [ ] High contrast mode not fully tested
- [ ] Dyslexia-friendly font option not available
- [ ] Text-to-speech integration not available

## Related Skills

- [Idea Capture](./capture.md)
- [Authentication](./authentication.md)
- All other skills should follow a11y guidelines
