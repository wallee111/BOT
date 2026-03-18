const { Router } = require('express');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { db } = require('../lib/firestore');
const { transformIdea } = require('../lib/transform');

const router = Router();

// GET /api/ideas
// Query params: category, pinned, archived, tags, search, limit
router.get('/', async (req, res) => {
  try {
    const { category, pinned, archived, tags, search, limit } = req.query;
    const userId = process.env.OWNER_USER_ID;

    const snapshot = await db.collection('ideas').where('userId', '==', userId).get();
    let ideas = snapshot.docs.map(transformIdea);

    if (category) {
      ideas = ideas.filter(i => i.categories.includes(category));
    }
    if (pinned !== undefined) {
      ideas = ideas.filter(i => i.pinned === (pinned === 'true'));
    }
    if (archived !== undefined) {
      ideas = ideas.filter(i => i.archived === (archived === 'true'));
    } else {
      ideas = ideas.filter(i => !i.archived); // default: exclude archived
    }
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim());
      ideas = ideas.filter(i => tagList.some(t => i.tags.includes(t)));
    }
    if (search) {
      const term = search.toLowerCase();
      ideas = ideas.filter(i => i.text.toLowerCase().includes(term));
    }
    if (limit) {
      ideas = ideas.slice(0, parseInt(limit, 10));
    }

    res.json({ success: true, data: ideas });
  } catch (err) {
    console.error('GET /ideas error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/ideas/:id
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('ideas').doc(req.params.id).get();
    if (!doc.exists || doc.data().userId !== process.env.OWNER_USER_ID) {
      return res.status(404).json({ success: false, error: 'Idea not found' });
    }
    res.json({ success: true, data: transformIdea(doc) });
  } catch (err) {
    console.error('GET /ideas/:id error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/ideas
// Body: { text, categories?, tags?, priority?, pinned? }
router.post('/', async (req, res) => {
  try {
    const { text, categories, tags, priority, pinned } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    const userId = process.env.OWNER_USER_ID;

    const newIdea = {
      text: text.trim(),
      categories: categories || [],
      tags: tags || [],
      priority: priority ?? 0,
      pinned: pinned ?? false,
      archived: false,
      hidden: false,
      userId,
      createdAt: Timestamp.now(),
    };

    const ref = await db.collection('ideas').add(newIdea);
    const doc = await ref.get();

    res.status(201).json({ success: true, data: transformIdea(doc) });
  } catch (err) {
    console.error('POST /ideas error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PATCH /api/ideas/:id
// Body: any of { text, pinned, archived, priority }
router.patch('/:id', async (req, res) => {
  try {
    const ref = db.collection('ideas').doc(req.params.id);
    const existing = await ref.get();

    if (!existing.exists || existing.data().userId !== process.env.OWNER_USER_ID) {
      return res.status(404).json({ success: false, error: 'Idea not found' });
    }

    const allowed = ['text', 'pinned', 'archived', 'priority'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    await ref.update(updates);
    const updated = await ref.get();
    res.json({ success: true, data: transformIdea(updated) });
  } catch (err) {
    console.error('PATCH /ideas/:id error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/ideas/:id/categories
// Body: { categories: ["Updates", "Design"] }
router.post('/:id/categories', async (req, res) => {
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ success: false, error: 'categories must be a non-empty array' });
    }

    const ref = db.collection('ideas').doc(req.params.id);
    const existing = await ref.get();
    if (!existing.exists || existing.data().userId !== process.env.OWNER_USER_ID) {
      return res.status(404).json({ success: false, error: 'Idea not found' });
    }

    await ref.update({ categories: FieldValue.arrayUnion(...categories) });
    const updated = await ref.get();
    res.json({ success: true, data: transformIdea(updated) });
  } catch (err) {
    console.error('POST /ideas/:id/categories error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/ideas/:id/tags
// Body: { tags: ["ux", "design"] }
router.post('/:id/tags', async (req, res) => {
  try {
    const { tags } = req.body;
    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ success: false, error: 'tags must be a non-empty array' });
    }

    const ref = db.collection('ideas').doc(req.params.id);
    const existing = await ref.get();
    if (!existing.exists || existing.data().userId !== process.env.OWNER_USER_ID) {
      return res.status(404).json({ success: false, error: 'Idea not found' });
    }

    await ref.update({ tags: FieldValue.arrayUnion(...tags) });
    const updated = await ref.get();
    res.json({ success: true, data: transformIdea(updated) });
  } catch (err) {
    console.error('POST /ideas/:id/tags error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
