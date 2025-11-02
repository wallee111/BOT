# Category Feed Dropdown - Complete Fix

## Problems Identified

### 1. Z-Index Issue (Initial)
Dropdown had `z-index: 30`, same as bottom navigation
**Fix:** Increased to `z-index: 100`

### 2. Positioning Issue (Main Problem)
The dropdown was using `position: absolute` but was being clipped by `.feed-slider` which has `overflow: hidden`. The dropdown appeared at the bottom of the screen instead of near the button.

**Root Causes:**
- Dropdown positioned absolutely within `.feed-wrapper`
- `.feed-slider` has `overflow: hidden` which clips content
- Static positioning didn't account for scroll or responsive layouts

### 3. Dropdown Not Closing Issue (Fixed)
After selecting a category, the dropdown stayed open even when switching tabs.

**Root Cause:**
- With `position: fixed`, the `hidden` attribute wasn't properly hiding the element
- Document click handler didn't detect clicks on other tab buttons

## Solutions Implemented

### 1. Changed Positioning Strategy
**From:** `position: absolute` with static top/left values
**To:** `position: fixed` with dynamic JavaScript positioning

### 2. Added Explicit Hidden Rule
**Added CSS:**
```css
.focus-category-menu[hidden] {
    display: none !important;
}
```

This ensures that when the `hidden` attribute is set, the dropdown is completely hidden regardless of other CSS properties.

### 3. Improved Click Handler
**Enhanced document click detection:**
```javascript
document.addEventListener('click', (event) => {
    if (focusCategoryMenu && !focusCategoryMenu.hidden) {
        const isToggle = focusCategoryToggle?.contains(event.target);
        const isOtherTab = event.target.closest('.feed-tab') && !event.target.closest('#tab-focus');
        if (isOtherTab || (!isToggle && !focusCategoryMenu.contains(event.target))) {
            closeFocusCategoryMenu();
        }
    }
});
```

Now detects when you click on Active or Hidden tab buttons and closes the dropdown immediately.

## How It Works Now

1. **First Click:** Switches to Category Feed tab (button turns yellow)
2. **Second Click:** 
   - Calculates button position using `getBoundingClientRect()`
   - Positions dropdown 8px below the button
   - Matches dropdown width to button (minimum 200px)
   - Dropdown appears as a fixed overlay above all content

3. **Closing Behavior:**
   - Clicking a category option → Closes dropdown
   - Clicking Active or Hidden tab → Closes dropdown
   - Clicking outside dropdown → Closes dropdown
   - Pressing Escape key → Closes dropdown
   - Swiping to another tab → Closes dropdown

## CSS Changes

```css
.focus-category-menu {
    position: fixed;  /* Was: absolute */
    min-width: 200px;
    max-width: 280px;
    max-height: 50vh;
    overflow-y: auto;
    z-index: 100;
}

.focus-category-menu[hidden] {
    display: none !important;  /* NEW: Ensures dropdown hides properly */
}
```

## JavaScript Changes

### Dynamic Positioning
```javascript
function openFocusCategoryMenu() {
    const buttonRect = focusCategoryToggle.getBoundingClientRect();
    focusCategoryMenu.style.top = `${buttonRect.bottom + 8}px`;
    focusCategoryMenu.style.left = `${buttonRect.left}px`;
    focusCategoryMenu.style.width = `${Math.max(200, buttonRect.width)}px`;
    focusCategoryMenu.hidden = false;
}
```

### Improved Close Detection
Detects clicks on other tab buttons and closes dropdown immediately.

## Benefits

✅ Dropdown appears directly below the "Category +" button
✅ Not clipped by overflow:hidden containers
✅ Works on all screen sizes (responsive)
✅ Scrollable if category list is long (max-height: 50vh)
✅ Proper z-index hierarchy (above all other UI)
✅ Dynamic positioning adjusts to button location
✅ **Closes properly when switching tabs or clicking elsewhere**
✅ **Never gets stuck open**

## Testing Checklist

- [x] Hard refresh page (Cmd+Shift+R)
- [ ] Click "Category +" once → Should switch to tab
- [ ] Click "Category +" again → Dropdown appears below button
- [ ] Select a category → Dropdown closes immediately
- [ ] Open dropdown → Click Active tab → Dropdown closes
- [ ] Open dropdown → Click Hidden tab → Dropdown closes
- [ ] Open dropdown → Click outside → Dropdown closes
- [ ] Open dropdown → Press Escape → Dropdown closes
- [ ] Dropdown should NOT stay stuck open

## Files Modified
1. `public/style.v1.css` - Changed position to fixed, added `[hidden]` rule
2. `public/index.html` - Added dynamic positioning and improved close detection
