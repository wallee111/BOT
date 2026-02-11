# Comprehensive React Migration Plan
## "Bucket of Thoughts" → Modern React Application

**Migration Strategy**: Full modernization with best practices
**Target Architecture**: Single-Page Application (SPA)
**UI Framework**: React 18 + TypeScript + Shadcn UI + Tailwind CSS
**Timeline**: 8-12 weeks (3 phases)

---

## 📋 Table of Contents
1. [Executive Summary](#executive-summary)
2. [Technology Stack](#technology-stack)
3. [Architecture Overview](#architecture-overview)
4. [Migration Phases](#migration-phases)
5. [Detailed Implementation Plan](#detailed-implementation-plan)
6. [File Structure](#file-structure)
7. [Data Migration Strategy](#data-migration-strategy)
8. [Testing Strategy](#testing-strategy)
9. [Deployment Strategy](#deployment-strategy)
10. [Risk Mitigation](#risk-mitigation)

---

## 🎯 Executive Summary

### Current State
- **Tech**: Vanilla JavaScript + Vite multi-page app (5 entry points)
- **State**: LocalStorage + Firestore with custom mutation queue
- **Styling**: Tailwind CSS with custom components
- **Architecture**: Offline-first with real-time sync

### Target State
- **Framework**: React 18 + TypeScript (type safety)
- **Routing**: TanStack Router v1 (type-safe routing)
- **State**: Zustand (global) + TanStack Query (server state)
- **UI**: Shadcn UI + Radix primitives (accessibility)
- **Styling**: Tailwind CSS (preserved) + CSS-in-JS animations
- **Build**: Vite 5 (preserved) + TypeScript + ESLint + Prettier

### Key Benefits
✅ **Type Safety**: TypeScript prevents runtime errors
✅ **Better DX**: Hot reload, auto-complete, refactoring tools
✅ **Scalability**: Component reusability, easier testing
✅ **Performance**: Code splitting, lazy loading, optimized bundles
✅ **Accessibility**: Shadcn/Radix components are WCAG compliant
✅ **Maintainability**: Clear separation of concerns, modern patterns

---

## 🛠 Technology Stack

### Core Framework
```json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "typescript": "^5.6.0"
}
```

### Routing & Navigation
```json
{
  "@tanstack/react-router": "^1.91.0",
  "@tanstack/router-devtools": "^1.91.0"
}
```
**Why TanStack Router?**
- Type-safe routing with automatic TypeScript inference
- Built-in search params validation (Zod integration)
- Loaders/actions pattern (like Remix/Next.js)
- Better DevTools than React Router
- First-class support for parallel data loading

### State Management
```json
{
  "zustand": "^5.0.2",
  "@tanstack/react-query": "^5.62.0",
  "immer": "^10.1.1"
}
```
**Why Zustand?**
- Minimal boilerplate (vs Redux)
- Supports middleware (persist, devtools, immer)
- Works great with React Query for server state
- 1.4kb gzipped

**Why TanStack Query?**
- Perfect for Firestore real-time subscriptions
- Automatic caching, refetching, background updates
- Optimistic updates built-in
- Offline mutation queue (replaces custom solution)

### UI Components
```json
{
  "@radix-ui/react-dialog": "^1.1.4",
  "@radix-ui/react-dropdown-menu": "^2.1.4",
  "@radix-ui/react-toast": "^1.2.4",
  "@radix-ui/react-select": "^2.1.4",
  "@radix-ui/react-tabs": "^1.1.1",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "tailwind-merge": "^2.6.0",
  "lucide-react": "^0.468.0"
}
```
**Shadcn UI Strategy**: Copy component source to `/src/components/ui/` (not NPM package)

### Forms & Validation
```json
{
  "react-hook-form": "^7.54.2",
  "zod": "^3.24.1",
  "@hookform/resolvers": "^3.9.1"
}
```
**Why React Hook Form?**
- Minimal re-renders (uncontrolled forms)
- Built-in validation with Zod schemas
- Excellent TypeScript support

### Gestures & Animations
```json
{
  "@use-gesture/react": "^10.3.1",
  "framer-motion": "^11.15.0"
}
```
**Why Framer Motion?**
- Declarative animations (vs manual CSS)
- Layout animations (shared element transitions)
- Gesture support (swipe, drag)

### Firebase & Offline Support
```json
{
  "firebase": "^12.6.0",
  "idb-keyval": "^6.2.1"
}
```
**Why IndexedDB (idb-keyval)?**
- Replaces LocalStorage (10MB+ limit vs 5MB)
- Async API (non-blocking)
- Better structured data support
- TanStack Query persistence plugin support

### Developer Experience
```json
{
  "@vitejs/plugin-react-swc": "^4.0.2",
  "eslint": "^9.18.0",
  "prettier": "^3.4.2",
  "@typescript-eslint/parser": "^8.19.1",
  "vite-tsconfig-paths": "^5.1.4"
}
```

### PWA (Progressive Web App)
```json
{
  "vite-plugin-pwa": "^0.21.1",
  "workbox-window": "^7.3.0"
}
```

---

## 🏗 Architecture Overview

### Component Architecture (Atomic Design)

```
/src
  /components
    /ui/                    (Shadcn primitives - copied source)
      button.tsx
      dialog.tsx
      dropdown-menu.tsx
      toast.tsx
      select.tsx
      tabs.tsx
      ...
    /atoms/                 (Smallest components)
      PriorityDot.tsx       (🔴🟠🟡⚪ clickable emoji)
      CategoryChip.tsx      (Colored category badge)
      SyncIndicator.tsx     (Offline/online status)
      CharacterCounter.tsx  (500/500 text)
    /molecules/             (Combinations of atoms)
      IdeaBubble.tsx        (Idea card with actions)
      SearchBar.tsx         (Input + filters)
      CategoryPicker.tsx    (Dropdown + create new)
      ThreadNoteItem.tsx    (Single note in thread)
    /organisms/             (Complex components)
      IdeaFeed.tsx          (Virtualized list)
      ThreadNotesPanel.tsx  (Full thread UI)
      CategoryManagement.tsx (Category settings)
      FilterSidebar.tsx     (Multi-select filters)
    /templates/             (Page layouts)
      AppLayout.tsx         (Sidebar + main + detail pane)
      AuthLayout.tsx        (Sign-in wrapper)
```

### State Management Architecture

```typescript
// Global UI State (Zustand)
interface AppStore {
  // UI State
  activeTab: 'focus' | 'main' | 'hidden'
  focusCategory: string | null
  activeTagFilter: string | null
  isSidebarOpen: boolean
  detailPaneIdeaId: string | null

  // User Preferences
  theme: 'light' | 'dark' | 'system'
  shortcuts: KeyboardShortcuts

  // Actions
  setActiveTab: (tab: string) => void
  setFocusCategory: (category: string | null) => void
  toggleSidebar: () => void
  openDetailPane: (ideaId: string) => void
  closeDetailPane: () => void
}

// Server State (TanStack Query)
useIdeas(filters: IdeaFilters)         // Real-time Firestore subscription
useCategories()                         // Category settings
useThreadNotes(ideaId: string)         // Notes for specific idea
useUserSettings()                       // Keyboard shortcuts

// Mutations (TanStack Query)
useSaveIdea()                          // Create/update
useArchiveIdea()                       // Archive/restore
useDeleteIdea()                        // Delete with cleanup
useUpdateIdeaText()                    // Edit text
useUpdateIdeaPriority()                // Cycle priority
useSaveCategorySettings()              // Color/visibility
useSaveThreadNote()                    // Add note
```

### Routing Architecture (TanStack Router)

```typescript
const routeTree = {
  '/': IndexRoute,                    // Capture page
  '/review': ReviewRoute,             // List view
  '/categories': CategoriesRoute,     // Category management
  '/account': AccountRoute,           // Settings
  '/signin': SignInRoute              // Auth
}

// Route with loader (data preloading)
const reviewRoute = createRoute({
  path: '/review',
  component: ReviewPage,
  loader: async ({ context }) => {
    // Parallel data loading
    const [ideas, categories, settings] = await Promise.all([
      context.queryClient.ensureQueryData(ideasQuery()),
      context.queryClient.ensureQueryData(categoriesQuery()),
      context.queryClient.ensureQueryData(userSettingsQuery())
    ])
    return { ideas, categories, settings }
  }
})
```

### Data Flow (Modern React Pattern)

```
User Action (e.g., "Save Idea")
    ↓
React Component calls mutation hook
    ↓
useSaveIdea() mutation (TanStack Query)
    ↓
Optimistic Update (immediate UI change)
    ↓
Firestore Write (async)
    ↓
Firestore Snapshot Listener (real-time)
    ↓
TanStack Query cache invalidation
    ↓
Component re-renders with new data
```

**Offline Handling** (TanStack Query Persist Plugin):
```
Mutation while offline
    ↓
TanStack Query queues mutation
    ↓
Persisted to IndexedDB (idb-keyval)
    ↓
User goes online
    ↓
Auto-retry from queue
    ↓
Firestore write completes
```

---

## 🚀 Migration Phases

### **Phase 1: Foundation & Core Features** (Weeks 1-4)
**Goal**: Working SPA with capture + review features

#### Week 1: Project Setup
- [ ] Initialize React + TypeScript + Vite project
- [ ] Configure TanStack Router with route tree
- [ ] Set up Shadcn UI (copy base components)
- [ ] Configure Zustand store structure
- [ ] Set up TanStack Query with Firestore integration
- [ ] Configure ESLint + Prettier + TypeScript strict mode
- [ ] Set up path aliases (`@/components`, `@/lib`, etc.)
- [ ] Create AppLayout template (sidebar + main + detail)

#### Week 2: Authentication & Firebase Integration
- [ ] Build SignIn page with Shadcn Dialog
- [ ] Create auth hooks (`useAuth`, `useCurrentUser`)
- [ ] Set up protected route wrapper
- [ ] Migrate Firebase config + auth.js → TypeScript
- [ ] Create auth context with TanStack Query
- [ ] Build AuthLayout template

#### Week 3: Capture Feature (Index Page)
- [ ] Build IdeaBubble molecule (card component)
- [ ] Create IdeaForm organism with React Hook Form
- [ ] Implement CategoryPicker with autocomplete
- [ ] Add PriorityDot atom with cycling logic
- [ ] Create useSaveIdea mutation hook
- [ ] Build CharacterCounter atom (500 max)
- [ ] Implement auto-resizing textarea
- [ ] Add toast notifications (Shadcn Toast)
- [ ] Create IdeaFeed organism (tabs: focus/main/hidden)

#### Week 4: Review Feature (List Page)
- [ ] Build SearchBar molecule with filters
- [ ] Create FilterSidebar organism (status, categories)
- [ ] Implement virtualized list (react-window or TanStack Virtual)
- [ ] Add swipe gestures (@use-gesture/react)
- [ ] Build inline text editor with save/cancel
- [ ] Create useArchiveIdea, useDeleteIdea, useHideIdea mutations
- [ ] Add sorting controls (date, priority)
- [ ] Implement search functionality (client-side)

**Deliverable**: Working app with capture + review features

---

### **Phase 2: Advanced Features** (Weeks 5-8)
**Goal**: Feature parity with vanilla JS version

#### Week 5: Thread Notes System
- [ ] Build ThreadNotesPanel organism
- [ ] Create ThreadNoteItem molecule
- [ ] Implement detail pane layout (desktop right panel)
- [ ] Add mobile inline expansion (Framer Motion)
- [ ] Create useThreadNotes query hook (real-time)
- [ ] Build useSaveThreadNote mutation
- [ ] Add thread icon to IdeaBubble
- [ ] Implement auto-open detail pane on note click

#### Week 6: Category Management
- [ ] Build CategoriesPage template
- [ ] Create CategorySummaryCards organism (totals)
- [ ] Build CategoryList organism with sorting
- [ ] Implement color picker (Shadcn Popover + hex input)
- [ ] Create pie chart component (recharts or custom SVG)
- [ ] Build useUpdateCategorySettings mutation
- [ ] Add rename category with bulk update
- [ ] Implement visibility toggle

#### Week 7: Account Settings & Keyboard Shortcuts
- [ ] Build AccountPage template
- [ ] Create user profile display component
- [ ] Build ShortcutRecorder molecule (key capture)
- [ ] Implement global keyboard shortcut listener (useHotkeys)
- [ ] Add copy UID functionality (Clipboard API)
- [ ] Create useUpdateUserSettings mutation
- [ ] Add sign-out with cleanup
- [ ] Build legacy user migration instructions UI

#### Week 8: Advanced Interactions
- [ ] Implement pin/unpin with single-pin constraint
- [ ] Add tag extraction from text (regex)
- [ ] Build tag filter click handler
- [ ] Create focus mode (category tab)
- [ ] Add priority cycling (click emoji)
- [ ] Implement multi-category support
- [ ] Build category rename with cascading update
- [ ] Add sync status indicator

**Deliverable**: Full feature parity with vanilla JS version

---

### **Phase 3: Optimization & Polish** (Weeks 9-12)
**Goal**: Production-ready with performance optimizations

#### Week 9: Performance Optimization
- [ ] Implement code splitting (lazy loading routes)
- [ ] Add React.memo to expensive components
- [ ] Optimize re-renders (useMemo, useCallback)
- [ ] Add virtualization to long lists (TanStack Virtual)
- [ ] Implement image lazy loading (if applicable)
- [ ] Add bundle analysis (vite-bundle-visualizer)
- [ ] Optimize Firestore queries (composite indexes)
- [ ] Add request deduplication (TanStack Query)

#### Week 10: Testing
- [ ] Set up Vitest + React Testing Library
- [ ] Write unit tests for utility functions (60% coverage)
- [ ] Write component tests for atoms/molecules (40% coverage)
- [ ] Add integration tests for critical flows (capture, review, edit)
- [ ] Set up Playwright for E2E tests
- [ ] Write E2E tests (sign in, create idea, archive, delete)
- [ ] Add CI/CD pipeline (GitHub Actions)
- [ ] Configure test coverage reporting

#### Week 11: Accessibility & UX Polish
- [ ] Run Lighthouse accessibility audit (target: 95+)
- [ ] Add ARIA labels to interactive elements
- [ ] Implement focus management (keyboard navigation)
- [ ] Add loading skeletons (React Suspense)
- [ ] Create error boundaries for graceful failures
- [ ] Implement optimistic UI for all mutations
- [ ] Add confirmation dialogs (destructive actions)
- [ ] Polish animations (Framer Motion transitions)
- [ ] Add empty states (no ideas, no categories)
- [ ] Implement responsive design refinements

#### Week 12: Migration & Deployment
- [ ] Create data migration script (if schema changes)
- [ ] Set up Firebase hosting config
- [ ] Configure PWA manifest + service worker
- [ ] Add offline fallback page
- [ ] Implement background sync for mutations
- [ ] Set up error tracking (Sentry or similar)
- [ ] Add analytics (Firebase Analytics or PostHog)
- [ ] Create deployment documentation
- [ ] Perform user acceptance testing (UAT)
- [ ] Deploy to production (Firebase Hosting)

**Deliverable**: Production-ready React application

---

## 📦 Detailed Implementation Plan

### 1. Project Initialization

```bash
# Create new Vite + React + TypeScript project
npm create vite@latest bucket-of-thoughts-react -- --template react-swc-ts
cd bucket-of-thoughts-react

# Install dependencies
npm install

# Install routing
npm install @tanstack/react-router @tanstack/router-devtools

# Install state management
npm install zustand @tanstack/react-query immer

# Install Firebase
npm install firebase

# Install forms & validation
npm install react-hook-form zod @hookform/resolvers

# Install UI dependencies
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  @radix-ui/react-toast @radix-ui/react-select @radix-ui/react-tabs \
  class-variance-authority clsx tailwind-merge lucide-react

# Install Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Install gestures & animations
npm install @use-gesture/react framer-motion

# Install offline support
npm install idb-keyval

# Install PWA plugin
npm install -D vite-plugin-pwa

# Install dev tools
npm install -D @typescript-eslint/parser @typescript-eslint/eslint-plugin \
  eslint-plugin-react-hooks prettier vite-tsconfig-paths

# Install testing (later in Phase 3)
npm install -D vitest @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event jsdom @playwright/test
```

### 2. TypeScript Configuration

**tsconfig.json**:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting - STRICT MODE */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,

    /* Path aliases */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/types/*": ["./src/types/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### 3. Vite Configuration

**vite.config.ts**:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Bucket of Thoughts',
        short_name: 'Thoughts',
        theme_color: '#ffca28',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firestore-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/firestore', 'firebase/auth'],
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-toast'
          ]
        }
      }
    }
  }
})
```

### 4. Core Type Definitions

**src/types/idea.ts**:
```typescript
export type Priority = '' | 'urgent' | 'high' | 'medium' | 'low'

export interface Idea {
  id: string
  text: string
  category: string
  categories: string[]
  tags: string[]
  priority: Priority
  createdAt: number
  archived: boolean
  hidden: boolean
  pinned: boolean
  userId: string
  pinnedAt?: number
}

export interface ThreadNote {
  id: string
  text: string
  userId: string
  createdAt: number
}

export interface CategorySettings {
  userId: string
  name: string
  color: string
  visible: boolean
}

export interface UserSettings {
  userId: string
  shortcuts: KeyboardShortcuts
}

export interface KeyboardShortcuts {
  save: string
  focusInput: string
  search: string
  nextIdea: string
  prevIdea: string
  hideUnhide: string
}

export type IdeaStatus = 'all' | 'active' | 'archived'

export interface IdeaFilters {
  status: IdeaStatus
  categories: string[]
  searchQuery: string
  tags: string[]
  sortBy: 'date' | 'priority'
}
```

### 5. Zustand Store Setup

**src/stores/appStore.ts**:
```typescript
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

interface AppState {
  // UI State
  activeTab: 'focus' | 'main' | 'hidden'
  focusCategory: string | null
  activeTagFilter: string | null
  isSidebarOpen: boolean
  detailPaneIdeaId: string | null
  theme: 'light' | 'dark' | 'system'

  // Actions
  setActiveTab: (tab: 'focus' | 'main' | 'hidden') => void
  setFocusCategory: (category: string | null) => void
  setActiveTagFilter: (tag: string | null) => void
  toggleSidebar: () => void
  openDetailPane: (ideaId: string) => void
  closeDetailPane: () => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
}

export const useAppStore = create<AppState>()(
  persist(
    immer((set) => ({
      // Initial state
      activeTab: 'main',
      focusCategory: null,
      activeTagFilter: null,
      isSidebarOpen: true,
      detailPaneIdeaId: null,
      theme: 'system',

      // Actions
      setActiveTab: (tab) => set({ activeTab: tab }),
      setFocusCategory: (category) => set({ focusCategory: category }),
      setActiveTagFilter: (tag) => set({ activeTagFilter: tag }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      openDetailPane: (ideaId) => set({ detailPaneIdeaId: ideaId }),
      closeDetailPane: () => set({ detailPaneIdeaId: null }),
      setTheme: (theme) => set({ theme })
    })),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeTab: state.activeTab,
        focusCategory: state.focusCategory,
        theme: state.theme
      })
    }
  )
)
```

### 6. TanStack Query Setup

**src/lib/queryClient.ts**:
```typescript
import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      retry: 3,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true
    },
    mutations: {
      retry: 3,
      networkMode: 'offlineFirst' // Queue mutations when offline
    }
  }
})

export const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'REACT_QUERY_OFFLINE_CACHE'
})
```

**src/hooks/useIdeas.ts** (Example query hook):
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, query, where, onSnapshot, writeBatch, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import type { Idea, IdeaFilters } from '@/types/idea'

export const ideasKeys = {
  all: ['ideas'] as const,
  lists: () => [...ideasKeys.all, 'list'] as const,
  list: (filters: IdeaFilters) => [...ideasKeys.lists(), filters] as const,
  detail: (id: string) => [...ideasKeys.all, 'detail', id] as const
}

export function useIdeas(filters: IdeaFilters) {
  const { currentUser } = useAuth()

  return useQuery({
    queryKey: ideasKeys.list(filters),
    queryFn: () => {
      return new Promise<Idea[]>((resolve) => {
        if (!currentUser) {
          resolve([])
          return
        }

        const q = query(
          collection(db, 'ideas'),
          where('userId', '==', currentUser.uid)
        )

        const unsubscribe = onSnapshot(q, (snapshot) => {
          const ideas = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Idea))

          // Apply filters in memory (same as vanilla JS version)
          const filtered = applyFilters(ideas, filters)
          resolve(filtered)
        })

        // Clean up subscription on unmount
        return () => unsubscribe()
      })
    },
    enabled: !!currentUser,
    staleTime: Infinity // Real-time subscription never stale
  })
}

export function useSaveIdea() {
  const queryClient = useQueryClient()
  const { currentUser } = useAuth()

  return useMutation({
    mutationFn: async (idea: Partial<Idea>) => {
      // Save to Firestore
      const docRef = doc(collection(db, 'ideas'))
      await setDoc(docRef, {
        ...idea,
        userId: currentUser?.uid,
        createdAt: Date.now()
      })
      return docRef.id
    },
    onMutate: async (newIdea) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ideasKeys.lists() })

      const previousIdeas = queryClient.getQueryData(ideasKeys.lists())

      queryClient.setQueryData(ideasKeys.lists(), (old: Idea[] = []) => [
        { id: 'temp-' + Date.now(), ...newIdea } as Idea,
        ...old
      ])

      return { previousIdeas }
    },
    onError: (err, newIdea, context) => {
      // Rollback on error
      queryClient.setQueryData(ideasKeys.lists(), context?.previousIdeas)
    },
    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: ideasKeys.lists() })
    }
  })
}

function applyFilters(ideas: Idea[], filters: IdeaFilters): Idea[] {
  let filtered = ideas

  // Status filter
  if (filters.status === 'active') {
    filtered = filtered.filter(idea => !idea.archived)
  } else if (filters.status === 'archived') {
    filtered = filtered.filter(idea => idea.archived)
  }

  // Category filter
  if (filters.categories.length > 0) {
    filtered = filtered.filter(idea =>
      idea.categories.some(cat => filters.categories.includes(cat))
    )
  }

  // Tag filter
  if (filters.tags.length > 0) {
    filtered = filtered.filter(idea =>
      idea.tags.some(tag => filters.tags.includes(tag))
    )
  }

  // Search query
  if (filters.searchQuery) {
    const query = filters.searchQuery.toLowerCase()
    filtered = filtered.filter(idea =>
      idea.text.toLowerCase().includes(query)
    )
  }

  // Sort
  if (filters.sortBy === 'date') {
    filtered.sort((a, b) => b.createdAt - a.createdAt)
  } else if (filters.sortBy === 'priority') {
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3, '': 4 }
    filtered.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
  }

  return filtered
}
```

### 7. TanStack Router Setup

**src/routes/__root.tsx**:
```typescript
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { QueryClient } from '@tanstack/react-query'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent
})

function RootComponent() {
  return (
    <>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  )
}
```

**src/routes/index.tsx**:
```typescript
import { createFileRoute } from '@tanstack/react-router'
import { CapturePage } from '@/pages/CapturePage'
import { ideasKeys } from '@/hooks/useIdeas'

export const Route = createFileRoute('/')({
  component: CapturePage,
  loader: async ({ context }) => {
    // Preload ideas for capture page
    await context.queryClient.ensureQueryData({
      queryKey: ideasKeys.lists(),
      queryFn: () => [] // Will be populated by real-time subscription
    })
  }
})
```

**src/router.ts**:
```typescript
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { queryClient } from './lib/queryClient'

export const router = createRouter({
  routeTree,
  context: {
    queryClient
  },
  defaultPreload: 'intent', // Preload on hover/focus
  defaultPreloadStaleTime: 0
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

### 8. Example Component: IdeaBubble

**src/components/organisms/IdeaBubble.tsx**:
```typescript
import { useState } from 'react'
import { useDrag } from '@use-gesture/react'
import { motion } from 'framer-motion'
import { Trash2, Edit, Archive, Pin, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CategoryChip } from '@/components/atoms/CategoryChip'
import { PriorityDot } from '@/components/atoms/PriorityDot'
import type { Idea } from '@/types/idea'
import { useArchiveIdea, useDeleteIdea, usePinIdea, useHideIdea } from '@/hooks/useIdeas'

interface IdeaBubbleProps {
  idea: Idea
  onEdit?: () => void
  onOpenThread?: () => void
}

export function IdeaBubble({ idea, onEdit, onOpenThread }: IdeaBubbleProps) {
  const [swipeOffset, setSwipeOffset] = useState(0)

  const archiveMutation = useArchiveIdea()
  const deleteMutation = useDeleteIdea()
  const pinMutation = usePinIdea()
  const hideMutation = useHideIdea()

  const bind = useDrag(({ down, movement: [mx], direction: [xDir], cancel }) => {
    // Only allow horizontal swipe
    if (down && Math.abs(mx) > 10) {
      setSwipeOffset(mx)
    } else {
      // Snap to closest action
      if (xDir < 0 && mx < -100) {
        // Left swipe - reveal edit/delete
        setSwipeOffset(-120)
      } else if (xDir > 0 && mx > 100) {
        // Right swipe - reveal archive
        setSwipeOffset(120)
      } else {
        setSwipeOffset(0)
      }
    }
  }, {
    axis: 'x',
    bounds: { left: -200, right: 200 }
  })

  return (
    <div className="relative overflow-hidden rounded-lg border bg-card">
      {/* Background actions (revealed by swipe) */}
      <div className="absolute inset-0 flex items-center justify-between px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => archiveMutation.mutate(idea.id)}
        >
          <Archive className="h-5 w-5" />
        </Button>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
          >
            <Edit className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteMutation.mutate(idea.id)}
          >
            <Trash2 className="h-5 w-5 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Main content (swipeable) */}
      <motion.div
        {...bind()}
        animate={{ x: swipeOffset }}
        className="relative bg-card p-4 touch-pan-y"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm whitespace-pre-wrap">{idea.text}</p>

            {/* Categories */}
            <div className="flex flex-wrap gap-1 mt-2">
              {idea.categories.map(cat => (
                <CategoryChip key={cat} category={cat} />
              ))}
            </div>

            {/* Tags */}
            {idea.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {idea.tags.map(tag => (
                  <span
                    key={tag}
                    className="text-xs text-muted-foreground hover:text-primary cursor-pointer"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1">
            <PriorityDot
              priority={idea.priority}
              onChange={(newPriority) => {
                // Handle priority change
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => pinMutation.mutate(idea.id)}
            >
              <Pin className={`h-4 w-4 ${idea.pinned ? 'fill-current' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => hideMutation.mutate(idea.id)}
            >
              {idea.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Thread notes indicator */}
        <button
          onClick={onOpenThread}
          className="mt-2 text-xs text-muted-foreground hover:text-primary"
        >
          💬 Thread notes
        </button>
      </motion.div>
    </div>
  )
}
```

### 9. Shadcn UI Setup

```bash
# Initialize Shadcn UI
npx shadcn@latest init

# Install core components
npx shadcn@latest add button
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu
npx shadcn@latest add toast
npx shadcn@latest add select
npx shadcn@latest add tabs
npx shadcn@latest add input
npx shadcn@latest add textarea
npx shadcn@latest add popover
npx shadcn@latest add checkbox
npx shadcn@latest add label
npx shadcn@latest add separator
npx shadcn@latest add skeleton
```

### 10. File Structure (Final)

```
bucket-of-thoughts-react/
├── src/
│   ├── components/
│   │   ├── ui/                      (Shadcn components)
│   │   │   ├── button.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── toast.tsx
│   │   │   └── ...
│   │   ├── atoms/
│   │   │   ├── PriorityDot.tsx
│   │   │   ├── CategoryChip.tsx
│   │   │   ├── SyncIndicator.tsx
│   │   │   └── CharacterCounter.tsx
│   │   ├── molecules/
│   │   │   ├── IdeaBubble.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   ├── CategoryPicker.tsx
│   │   │   └── ThreadNoteItem.tsx
│   │   ├── organisms/
│   │   │   ├── IdeaFeed.tsx
│   │   │   ├── ThreadNotesPanel.tsx
│   │   │   ├── CategoryManagement.tsx
│   │   │   └── FilterSidebar.tsx
│   │   └── templates/
│   │       ├── AppLayout.tsx
│   │       └── AuthLayout.tsx
│   ├── hooks/
│   │   ├── useIdeas.ts
│   │   ├── useCategories.ts
│   │   ├── useThreadNotes.ts
│   │   ├── useAuth.ts
│   │   ├── useKeyboardShortcuts.ts
│   │   └── useOfflineSync.ts
│   ├── lib/
│   │   ├── firebase.ts
│   │   ├── queryClient.ts
│   │   ├── utils.ts
│   │   └── constants.ts
│   ├── pages/
│   │   ├── CapturePage.tsx
│   │   ├── ReviewPage.tsx
│   │   ├── CategoriesPage.tsx
│   │   ├── AccountPage.tsx
│   │   └── SignInPage.tsx
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   ├── review.tsx
│   │   ├── categories.tsx
│   │   ├── account.tsx
│   │   └── signin.tsx
│   ├── stores/
│   │   └── appStore.ts
│   ├── types/
│   │   ├── idea.ts
│   │   ├── category.ts
│   │   └── user.ts
│   ├── styles/
│   │   └── globals.css
│   ├── App.tsx
│   ├── main.tsx
│   └── router.ts
├── public/
│   ├── icons/
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── manifest.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── package.json
└── README.md
```

---

## 🔄 Data Migration Strategy

### No Breaking Changes Required
**Good news**: The Firebase data structure remains identical, so no migration script needed!

### Compatibility Layer
```typescript
// src/lib/legacyCompat.ts

/**
 * Ensure backward compatibility with vanilla JS version
 * Both apps can coexist and share the same Firestore database
 */

export function ensureBackwardCompatibility() {
  // LocalStorage keys remain the same
  // Firebase collections remain the same
  // Data structure remains the same

  // Only difference: React app uses IndexedDB for caching
  // Vanilla app uses LocalStorage
  // Both sync to same Firestore collections
}
```

### Migration Checklist
- [ ] Keep Firestore collection names unchanged (`ideas`, `categorySettings`, `userSettings`)
- [ ] Preserve data structure (all fields identical)
- [ ] Maintain LocalStorage keys for gradual migration
- [ ] Support both apps accessing same data during transition
- [ ] Add IndexedDB as optional performance enhancement
- [ ] Deprecate vanilla app after 100% React migration

---

## 🧪 Testing Strategy

### Test Pyramid
```
E2E Tests (10%)           ← Critical user flows
    ↑
Integration Tests (30%)   ← Feature interactions
    ↑
Unit Tests (60%)          ← Components, hooks, utils
```

### Testing Stack
```json
{
  "vitest": "^2.1.8",
  "@testing-library/react": "^16.1.0",
  "@testing-library/jest-dom": "^6.6.3",
  "@testing-library/user-event": "^14.5.2",
  "@playwright/test": "^1.49.1"
}
```

### Example Tests

**Unit Test** (src/components/atoms/PriorityDot.test.tsx):
```typescript
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { PriorityDot } from './PriorityDot'

describe('PriorityDot', () => {
  it('cycles through priorities on click', async () => {
    const onChange = vi.fn()
    render(<PriorityDot priority="" onChange={onChange} />)

    const button = screen.getByRole('button')
    await userEvent.click(button)

    expect(onChange).toHaveBeenCalledWith('urgent')
  })

  it('renders correct emoji for each priority', () => {
    const { rerender } = render(<PriorityDot priority="urgent" onChange={() => {}} />)
    expect(screen.getByText('🔴')).toBeInTheDocument()

    rerender(<PriorityDot priority="high" onChange={() => {}} />)
    expect(screen.getByText('🟠')).toBeInTheDocument()
  })
})
```

**Integration Test** (src/pages/CapturePage.test.tsx):
```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { CapturePage } from './CapturePage'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'

describe('CapturePage', () => {
  it('saves idea when form is submitted', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CapturePage />
      </QueryClientProvider>
    )

    const textarea = screen.getByPlaceholderText(/capture your thought/i)
    await userEvent.type(textarea, 'New idea #test')

    const saveButton = screen.getByRole('button', { name: /save/i })
    await userEvent.click(saveButton)

    await waitFor(() => {
      expect(screen.getByText(/idea saved/i)).toBeInTheDocument()
    })
  })
})
```

**E2E Test** (e2e/capture-flow.spec.ts):
```typescript
import { test, expect } from '@playwright/test'

test('complete capture flow', async ({ page }) => {
  await page.goto('http://localhost:5173')

  // Sign in (mock auth in test environment)
  await page.click('text=Sign In')
  await page.click('text=Sign in with Google')

  // Capture idea
  await page.fill('textarea', 'E2E test idea #automated')
  await page.click('button:has-text("Save")')

  // Verify idea appears in feed
  await expect(page.locator('text=E2E test idea')).toBeVisible()

  // Navigate to review page
  await page.click('text=Review')
  await expect(page).toHaveURL(/\/review/)

  // Find and archive idea
  await page.click('text=E2E test idea')
  await page.click('button[aria-label="Archive"]')

  // Verify toast notification
  await expect(page.locator('text=Archived')).toBeVisible()
})
```

---

## 🚀 Deployment Strategy

### Build Configuration

**package.json scripts**:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit",
    "analyze": "vite-bundle-visualizer"
  }
}
```

### Firebase Hosting Setup

**firebase.json**:
```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "max-age=31536000"
          }
        ]
      },
      {
        "source": "index.html",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "no-cache"
          }
        ]
      }
    ]
  }
}
```

### CI/CD Pipeline (GitHub Actions)

**.github/workflows/deploy.yml**:
```yaml
name: Deploy to Firebase Hosting

on:
  push:
    branches:
      - main

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run type check
        run: npm run typecheck

      - name: Run linter
        run: npm run lint

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}

      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: your-project-id
```

### Environment Variables

**.env.example**:
```bash
# Firebase Configuration
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-app.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

# Optional: Analytics
VITE_ENABLE_ANALYTICS=true
```

---

## ⚠️ Risk Mitigation

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Data loss during migration** | Low | Critical | Keep vanilla JS app live during transition; both apps use same Firestore |
| **Bundle size regression** | Medium | Medium | Code splitting, tree shaking, bundle analysis in CI |
| **TypeScript learning curve** | Medium | Low | Gradual typing, start with `any`, refine later |
| **Real-time subscription memory leaks** | Medium | High | Strict cleanup in useEffect, test with React DevTools Profiler |
| **Offline sync edge cases** | Medium | High | Comprehensive E2E tests, offline simulator testing |
| **Performance degradation** | Low | Medium | Lighthouse CI checks, virtualization for long lists |
| **Breaking changes in dependencies** | Low | Medium | Lock file, renovate bot for controlled updates |
| **User resistance to new UI** | Medium | Low | Beta testing, gradual rollout, feedback collection |

### Rollback Plan
1. Keep vanilla JS app deployed at `app-legacy.example.com`
2. Deploy React app at `app.example.com`
3. Monitor error rates for 2 weeks
4. If critical issues: revert DNS to vanilla app
5. If successful: deprecate vanilla app after 1 month

### Monitoring & Observability
```typescript
// src/lib/errorTracking.ts
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay()
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0
})
```

---

## 📊 Success Metrics

### Performance
- [ ] First Contentful Paint < 1.5s
- [ ] Largest Contentful Paint < 2.5s
- [ ] Time to Interactive < 3.5s
- [ ] Lighthouse Performance Score > 90

### Quality
- [ ] Test coverage > 70%
- [ ] TypeScript strict mode enabled
- [ ] Zero ESLint errors/warnings
- [ ] Accessibility score > 95

### User Experience
- [ ] 100% feature parity with vanilla JS version
- [ ] Offline mode works reliably
- [ ] Real-time sync < 500ms latency
- [ ] Mobile responsive (320px - 2560px)

---

## 🎓 Learning Resources

### Required Reading
1. [React 18 Documentation](https://react.dev) - Official docs
2. [TanStack Query Guide](https://tanstack.com/query/latest) - Server state management
3. [TanStack Router Guide](https://tanstack.com/router/latest) - Type-safe routing
4. [Zustand Documentation](https://docs.pmnd.rs/zustand) - Client state management
5. [Shadcn UI Components](https://ui.shadcn.com) - Component library

### Recommended Tools
- **VS Code Extensions**: ESLint, Prettier, Tailwind IntelliSense, Error Lens
- **Browser Extensions**: React DevTools, TanStack Query DevTools
- **CLI Tools**: Firebase CLI, Vite DevTools

---

## 📅 Timeline Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| **Phase 1** | 4 weeks | Working SPA with capture + review |
| **Phase 2** | 4 weeks | Full feature parity |
| **Phase 3** | 4 weeks | Production-ready with tests |
| **Total** | **12 weeks** | **Modern React app deployed** |

---

## 🎯 Next Steps

### Immediate Actions (This Week)
1. [ ] Review this plan with stakeholders
2. [ ] Set up new Git repository (or branch)
3. [ ] Initialize React + TypeScript project
4. [ ] Configure development environment
5. [ ] Create project board (GitHub Projects or Jira)

### Week 1 Kickoff
1. [ ] Install all dependencies
2. [ ] Configure Tailwind + Shadcn UI
3. [ ] Set up Firebase connection
4. [ ] Create basic routing structure
5. [ ] Build AppLayout template
6. [ ] First commit! 🎉

---

## 📝 Appendix

### A. Glossary
- **SPA**: Single-Page Application
- **SSR**: Server-Side Rendering (not used in this project)
- **CSR**: Client-Side Rendering (React default)
- **PWA**: Progressive Web App
- **Optimistic UI**: Update UI before server confirms
- **Code Splitting**: Load JavaScript on demand
- **Tree Shaking**: Remove unused code from bundles

### B. Alternative Approaches Considered

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **Next.js (App Router)** | SSR, better SEO, file-based routing | Overkill for this app, heavier bundle | ❌ Not selected |
| **Remix** | Great data loading, nested routes | Requires server, less community support | ❌ Not selected |
| **Vite + React Router** | Simpler than TanStack Router | Less type-safe, weaker DevTools | ❌ Not selected |
| **Vite + TanStack Router** | Type-safe, modern, great DX | Newer library, smaller community | ✅ **Selected** |

### C. Migration Checklist (Summary)

**Phase 1**:
- [ ] Project setup (Vite + React + TS)
- [ ] Authentication
- [ ] Capture feature
- [ ] Review feature

**Phase 2**:
- [ ] Thread notes
- [ ] Category management
- [ ] Account settings
- [ ] Advanced interactions

**Phase 3**:
- [ ] Performance optimization
- [ ] Testing (unit, integration, E2E)
- [ ] Accessibility audit
- [ ] Deployment + monitoring

---

**Document Version**: 1.0
**Last Updated**: 2026-01-30
**Author**: Claude Code (AI Assistant)
**Status**: Ready for Review

---

## 🚀 Ready to Start?

This plan is comprehensive, but remember: **the best plan is one you actually execute**. Start with Phase 1, Week 1, and iterate from there. Don't aim for perfection—aim for progress!

**Let's build something amazing!** 💪
