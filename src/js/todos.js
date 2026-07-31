import { TODO_SLOTS } from '../lib/storage/domains/todos.js';

const SLOT_LABELS = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

let todosStore = null;
let unsubscribe = null;
let currentItems = [];
let editingId = null;

export function initTodos(store, container) {
  if (!container) return () => {};
  todosStore = store;

  container.classList.add('todo-list');
  container.innerHTML = `
    <div class="todo-list__header">
      <h2 class="todo-list__title">To-do</h2>
    </div>
    <div class="todo-list__sections">
      ${TODO_SLOTS.map((slot) => `
        <section class="todo-section" data-slot="${slot}">
          <header class="todo-section__header">
            <h3 class="todo-section__title">${SLOT_LABELS[slot]}</h3>
          </header>
          <ul class="todo-section__list" data-todo-list="${slot}"></ul>
        </section>
      `).join('')}
    </div>
  `;

  unsubscribe = todosStore.subscribe((items) => {
    currentItems = items || [];
    render(container);
  });

  // Render immediately with cached
  currentItems = todosStore.getCached() || [];
  render(container);

  return () => {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  };
}

function render(container) {
  for (const slot of TODO_SLOTS) {
    const list = container.querySelector(`[data-todo-list="${slot}"]`);
    if (!list) continue;

    const slotItems = currentItems
      .filter((t) => t.slot === slot)
      .sort((a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt));

    list.innerHTML = '';

    for (const todo of slotItems) {
      list.appendChild(buildTodoRow(todo));
    }

    // Append a blank "ready to type" row at end of every slot
    list.appendChild(buildBlankRow(slot));
  }

  // If we entered an editing state for a row that just rendered, focus its input.
  if (editingId) {
    const input = container.querySelector(`[data-todo-edit="${editingId}"]`);
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
}

function buildTodoRow(todo) {
  const li = document.createElement('li');
  li.className = 'todo-row' + (todo.completed ? ' is-completed' : '');
  li.dataset.id = todo.id;

  const checkbox = document.createElement('button');
  checkbox.type = 'button';
  checkbox.className = 'todo-row__checkbox';
  checkbox.setAttribute('aria-label', todo.completed ? 'Mark as not done' : 'Mark as done');
  checkbox.setAttribute('aria-pressed', String(todo.completed));
  checkbox.innerHTML = todo.completed
    ? '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '';
  checkbox.addEventListener('click', async (e) => {
    e.stopPropagation();
    await todosStore.setCompleted(todo.id, !todo.completed);
  });
  li.appendChild(checkbox);

  const isEditing = editingId === todo.id;
  if (isEditing) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'todo-row__input';
    input.value = todo.text;
    input.dataset.todoEdit = todo.id;
    input.maxLength = 1000;
    bindEditInput(input, todo);
    li.appendChild(input);
  } else {
    const textEl = document.createElement('span');
    textEl.className = 'todo-row__text';
    textEl.textContent = todo.text || '(empty)';
    if (!todo.text) textEl.classList.add('is-placeholder');
    textEl.tabIndex = 0;
    textEl.setAttribute('role', 'button');
    textEl.addEventListener('click', () => beginEdit(todo.id, li));
    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        beginEdit(todo.id, li);
      }
    });
    li.appendChild(textEl);
  }

  return li;
}

function buildBlankRow(slot) {
  const li = document.createElement('li');
  li.className = 'todo-row todo-row--blank';
  li.dataset.slot = slot;

  const checkbox = document.createElement('span');
  checkbox.className = 'todo-row__checkbox is-placeholder';
  checkbox.setAttribute('aria-hidden', 'true');
  li.appendChild(checkbox);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-row__input';
  input.placeholder = 'Add a to-do';
  input.maxLength = 1000;
  input.dataset.todoBlank = slot;

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      input.value = '';
      try {
        await todosStore.add({ slot, text: value });
        // After the cache updates and re-renders, refocus the blank input
        queueMicrotask(() => {
          const fresh = document.querySelector(`[data-todo-blank="${slot}"]`);
          fresh?.focus();
        });
      } catch (err) {
        console.error('[todos] add failed', err);
      }
    } else if (e.key === 'Escape') {
      input.value = '';
      input.blur();
    }
  });

  li.appendChild(input);
  return li;
}

function beginEdit(id, rowEl) {
  editingId = id;
  // Re-render whole list so the row swaps to input mode
  const container = rowEl.closest('.todo-list');
  if (container) render(container);
}

function bindEditInput(input, todo) {
  const commit = async () => {
    const value = input.value.trim();
    editingId = null;
    if (value === todo.text) {
      // Nothing changed; just re-render to swap back to span
      const container = input.closest('.todo-list');
      if (container) render(container);
      return;
    }
    if (!value) {
      // Empty → delete the todo
      try { await todosStore.delete(todo.id); } catch (err) { console.error(err); }
      return;
    }
    try { await todosStore.updateText(todo.id, value); } catch (err) { console.error(err); }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editingId = null;
      const container = input.closest('.todo-list');
      if (container) render(container);
    }
  });
  input.addEventListener('blur', commit);
}
