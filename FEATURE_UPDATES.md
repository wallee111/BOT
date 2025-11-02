# Feature Updates Summary

## Recent Updates

### 1. Feed Scrolling Fix ✅
**Location:** New tab page (index.html)
**What was fixed:** Vertical scrolling now works properly in all feed tabs
**Technical changes:**
- Added `overflow-y: auto` to `.feed-panel .ideas-feed` in style.v1.css
- Added `-webkit-overflow-scrolling: touch` for smooth iOS scrolling
- Added `padding-bottom: 2rem` for better bottom spacing

**How to test:**
1. Add several ideas to create a long list
2. Try scrolling vertically in the Active Feed tab
3. Scrolling should work smoothly

---

### 2. Most Recently Used Category Sorting ✅
**Location:** Active feed category dropdown (index.html)
**What changed:** Category dropdown now sorts by most recently used
**Technical changes:**
- Added `LOCAL_CATEGORY_USAGE_KEY` constant in storage.js
- Added `trackCategoryUsage(category)` function to record timestamps
- Added `getCategoriesByRecentUsage(categories)` function to sort by MRU
- Modified `updateCategoryList()` in index.html to use MRU sorting
- Automatically tracks usage when saving an idea with a category

**How to test:**
1. Create several categories (A, B, C)
2. Save an idea with category C
3. Save an idea with category A
4. Open the category dropdown - should show: A, C, B (most recent first)

---

### 3. Category Visibility Toggle ✅
**Location:** Categories page (categories.html)
**What's new:** Hide/show categories from the active feed
**Technical changes:**
- Added `setCategoryVisibility(category, visible)` function in storage.js
- Added visibility toggle button (eye icon) to each category item
- Added CSS styling for `.category-visibility-btn`
- Updated `getCategoryDisplay()` to include `visible` property
- Existing `isCategoryHiddenOnActive()` function filters hidden categories

**How to test:**
1. Go to Categories page
2. Click the eye icon next to a category (it will toggle between visible/hidden)
3. Go back to the main page
4. Hidden categories should not appear in the Active Feed
5. Hidden categories WILL still appear in:
   - Review page (shows all ideas)
   - Hidden feed (if ideas are manually hidden)
   - Focus category view (can still filter by hidden categories)

**Visual indicators:**
- 👁️ Eye icon = Category is visible in active feed
- 👁️‍🗨️ Crossed eye icon = Category is hidden from active feed

---

### 4. Category Feed Tab Dropdown (No changes needed) ✅
**Location:** Focus category view on new tab page
**What it does:** The category dropdown already exists and works as requested
**How to use:**
1. Click the "Focus category" tab (first tab on new page)
2. Click the dropdown button to see all categories
3. Select a category to filter ideas by that category only

---

## Technical Notes

### Category Visibility Behavior
- **Active Feed:** Filters out ideas with hidden categories
- **Review Page:** Shows ALL ideas regardless of visibility
- **Focus View:** Can still filter by hidden categories
- **Hidden Feed:** Shows manually hidden ideas, regardless of category visibility

### Category Usage Tracking
- Uses localStorage key: `category_usage_v1`
- Stores timestamps for each category usage
- Sorts categories by most recent usage in dropdowns
- Persists across sessions

### Data Synchronization
- Category settings (color, visibility) sync to Firestore
- Changes are immediately reflected across all pages
- Real-time updates via Firestore listeners

---

## Files Modified

1. **public/style.v1.css**
   - Added feed scrolling styles
   - Added visibility button styles

2. **public/storage.js**
   - Added category usage tracking
   - Added MRU sorting function
   - Added visibility toggle function

3. **public/index.html**
   - Imported new storage functions
   - Updated category dropdown to use MRU sorting
   - Added usage tracking on idea save

4. **public/categories.html**
   - Imported setCategoryVisibility
   - Added visibility toggle button UI
   - Added visibility toggle click handler
   - Updated getCategoryDisplay to include visibility

---

## Testing Checklist

- [ ] Vertical scrolling works in feed panels
- [ ] Category dropdown sorts by most recently used
- [ ] Visibility toggle button appears on categories page
- [ ] Clicking visibility toggle updates icon
- [ ] Hidden categories don't show in active feed
- [ ] Hidden categories still show in review page
- [ ] Category usage persists across page refreshes
- [ ] All changes sync to Firestore

---

## Known Behavior

- Uncategorized ideas are never filtered from active feed
- Visibility setting only affects the active feed display
- Category usage tracking is local (not synced across devices)
- Visibility settings ARE synced across devices (stored in Firestore)
