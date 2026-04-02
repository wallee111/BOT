// src/lib/demo/seed-data.js

const now = Date.now();
const DAY = 86_400_000;

// Helper: date N days ago
const daysAgo = (n) => now - n * DAY;

// ── Ideas ──────────────────────────────────────────────────────

export const SEED_IDEAS = [
  {
    id: 'demo-idea-1',
    text: 'Build a personal portfolio website',
    category: 'Projects',
    categories: ['Projects'],
    tags: ['web', 'portfolio'],
    priority: 5,
    createdAt: daysAgo(14),
    archived: false,
    hidden: false,
    pinned: true,
    userId: 'demo-user',
  },
  {
    id: 'demo-idea-2',
    text: 'Create a habit tracking app with streaks and reminders',
    category: 'Projects',
    categories: ['Projects', 'Learning'],
    tags: ['mobile', 'productivity'],
    priority: 4,
    createdAt: daysAgo(12),
    archived: false,
    hidden: false,
    pinned: false,
    userId: 'demo-user',
  },
  {
    id: 'demo-idea-3',
    text: 'Design a reading list dashboard',
    category: 'Projects',
    categories: ['Projects', 'Creative'],
    tags: ['design', 'books'],
    priority: 3,
    createdAt: daysAgo(11),
    archived: false,
    hidden: false,
    pinned: false,
    userId: 'demo-user',
  },
  {
    id: 'demo-idea-4',
    text: 'Write a short story about time travel',
    category: 'Creative',
    categories: ['Creative'],
    tags: ['writing', 'fiction'],
    priority: 3,
    createdAt: daysAgo(10),
    archived: false,
    hidden: false,
    pinned: true,
    userId: 'demo-user',
  },
  {
    id: 'demo-idea-5',
    text: 'Learn watercolor painting basics',
    category: 'Creative',
    categories: ['Creative'],
    tags: ['art', 'hobby'],
    priority: 2,
    createdAt: daysAgo(9),
    archived: false,
    hidden: false,
    pinned: false,
    userId: 'demo-user',
  },
  {
    id: 'demo-idea-6',
    text: 'Start a photo-a-day challenge for 30 days',
    category: 'Creative',
    categories: ['Creative', 'Life'],
    tags: ['photography', 'challenge'],
    priority: 2,
    createdAt: daysAgo(8),
    archived: false,
    hidden: false,
    pinned: false,
    userId: 'demo-user',
  },
  {
    id: 'demo-idea-7',
    text: 'Deep dive into WebSocket protocols',
    category: 'Learning',
    categories: ['Learning'],
    tags: ['networking', 'backend'],
    priority: 4,
    createdAt: daysAgo(7),
    archived: false,
    hidden: false,
    pinned: false,
    userId: 'demo-user',
  },
  {
    id: 'demo-idea-8',
    text: "Read 'Designing Data-Intensive Applications'",
    category: 'Learning',
    categories: ['Learning'],
    tags: ['books', 'systems'],
    priority: 5,
    createdAt: daysAgo(6),
    archived: false,
    hidden: false,
    pinned: false,
    userId: 'demo-user',
  },
  {
    id: 'demo-idea-9',
    text: 'Take an online course on system design',
    category: 'Learning',
    categories: ['Learning'],
    tags: ['career', 'architecture'],
    priority: 3,
    createdAt: daysAgo(5),
    archived: true,
    hidden: false,
    pinned: false,
    userId: 'demo-user',
  },
  {
    id: 'demo-idea-10',
    text: 'Plan a weekend hiking trip to the mountains',
    category: 'Life',
    categories: ['Life'],
    tags: ['outdoors', 'travel'],
    priority: 4,
    createdAt: daysAgo(4),
    archived: false,
    hidden: false,
    pinned: false,
    userId: 'demo-user',
  },
  {
    id: 'demo-idea-11',
    text: 'Try a new recipe every week this month',
    category: 'Life',
    categories: ['Life'],
    tags: ['cooking', 'challenge'],
    priority: 2,
    createdAt: daysAgo(3),
    archived: false,
    hidden: false,
    pinned: false,
    userId: 'demo-user',
  },
  {
    id: 'demo-idea-12',
    text: 'Organize the garage — donate old gear',
    category: 'Life',
    categories: ['Life'],
    tags: ['home', 'declutter'],
    priority: 1,
    createdAt: daysAgo(2),
    archived: false,
    hidden: true,
    pinned: false,
    userId: 'demo-user',
  },
  {
    id: 'demo-idea-13',
    text: 'Sketch out a logo for the side project',
    category: 'Random',
    categories: ['Random', 'Creative'],
    tags: ['design'],
    priority: 2,
    createdAt: daysAgo(1),
    archived: false,
    hidden: false,
    pinned: false,
    userId: 'demo-user',
  },
];

// ── Category Palette ───────────────────────────────────────────

export const SEED_CATEGORY_PALETTE = {
  Projects:  { color: '#42a5f5', visible: true },
  Creative:  { color: '#ab47bc', visible: true },
  Learning:  { color: '#66bb6a', visible: true },
  Life:      { color: '#ef5350', visible: true },
  Random:    { color: '#ffa726', visible: true },
};

// ── Canvas Layout ──────────────────────────────────────────────

export const SEED_CANVAS_LAYOUT = {
  cards: [
    { categoryName: 'Projects', x: 80,  y: 80  },
    { categoryName: 'Creative', x: 400, y: 80  },
    { categoryName: 'Learning', x: 720, y: 80  },
    { categoryName: 'Life',     x: 80,  y: 380 },
    { categoryName: 'Random',   x: 400, y: 380 },
  ],
  headers: [],
  viewport: { panX: 0, panY: 0, zoom: 1 },
};

// ── Page Notes ─────────────────────────────────────────────────

export const SEED_NOTE_FOLDERS = [
  {
    id: 'demo-folder-1',
    name: 'Weekend Plans',
    sortOrder: 0,
    createdAt: daysAgo(7),
    updatedAt: daysAgo(7),
    userId: 'demo-user',
  },
];

export const SEED_PAGE_NOTES = [
  {
    id: 'demo-note-1',
    title: 'Ideas for the weekend',
    content: '<p>Things to check out this Saturday:</p><ul><li>Farmers market downtown</li><li>New trail at the state park</li><li>Try that ramen place on 5th</li></ul>',
    folderId: 'demo-folder-1',
    createdAt: daysAgo(5),
    updatedAt: daysAgo(2),
    userId: 'demo-user',
  },
  {
    id: 'demo-note-2',
    title: 'Book recommendations',
    content: '<p>From the team chat:</p><ul><li>Designing Data-Intensive Applications</li><li>The Pragmatic Programmer</li><li>Staff Engineer by Will Larson</li></ul>',
    folderId: null,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(10),
    userId: 'demo-user',
  },
  {
    id: 'demo-note-3',
    title: 'Project kickoff notes',
    content: '<p>Key decisions from the kickoff:</p><p>Stack: Vite + vanilla JS for speed. Firebase for auth and data. Mobile via Capacitor.</p><p>MVP scope: capture, review, canvas.</p>',
    folderId: null,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(8),
    userId: 'demo-user',
  },
];

// ── Thread Notes (comments on ideas) ───────────────────────────

export const SEED_THREAD_NOTES = {
  'demo-idea-1': [
    {
      id: 'demo-thread-1',
      text: 'Should use a dark theme to match the app aesthetic',
      createdAt: daysAgo(13),
      userId: 'demo-user',
    },
    {
      id: 'demo-thread-2',
      text: 'Check out Astro or plain HTML — keep it simple',
      createdAt: daysAgo(12),
      userId: 'demo-user',
    },
  ],
  'demo-idea-4': [
    {
      id: 'demo-thread-3',
      text: 'Maybe a paradox where the character meets their future self?',
      createdAt: daysAgo(9),
      userId: 'demo-user',
    },
  ],
};
