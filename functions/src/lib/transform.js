function transformIdea(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    text: data.text,
    categories: data.categories || [],
    tags: data.tags || [],
    priority: data.priority || 0,
    pinned: data.pinned || false,
    archived: data.archived || false,
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
  };
}

function transformCategory(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    name: data.name,
    color: data.color || null,
  };
}

module.exports = { transformIdea, transformCategory };
