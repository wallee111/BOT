const { Router } = require('express');
const { Timestamp } = require('firebase-admin/firestore');
const { db } = require('../lib/firestore');
const { transformCategory } = require('../lib/transform');

const router = Router();

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const userId = process.env.OWNER_USER_ID;
    const snapshot = await db.collection('categorySettings')
      .where('userId', '==', userId)
      .get();

    const categories = snapshot.docs.map(transformCategory);
    res.json({ success: true, data: categories });
  } catch (err) {
    console.error('GET /categories error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/categories
// Body: { name, color? }
router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const userId = process.env.OWNER_USER_ID;
    const newCategory = {
      name: name.trim(),
      userId,
      createdAt: Timestamp.now(),
    };
    if (color) newCategory.color = color;

    const ref = await db.collection('categorySettings').add(newCategory);
    const doc = await ref.get();

    res.status(201).json({ success: true, data: transformCategory(doc) });
  } catch (err) {
    console.error('POST /categories error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
