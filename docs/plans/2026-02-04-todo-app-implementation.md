# Todo App v1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a colorful, playful React + Vite + TypeScript todo app with add/toggle/edit/delete/filter and localStorage persistence.

**Architecture:** Use `useReducer` for pure state transitions and a `useLocalStorageState` hook to hydrate/persist the full state. UI is split into small components and wired in `App`.

**Tech Stack:** React 18, Vite, TypeScript, CSS, Vitest (unit tests for reducer and storage utils).

---

### Task 1: Scaffold Vite React + TS app

**Files:**
- Create: project scaffold in repository root

**Step 1: Scaffold the project**

Run: `npm create vite@latest . -- --template react-ts`
Expected: Vite project files created in repo root

**Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created with no errors

**Step 3: Verify baseline build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit scaffold**

```bash
git add .
git commit -m "chore: scaffold vite react app"
```

---

### Task 2: Establish base styles and layout shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/index.css`

**Step 1: Create the layout shell in App**

```tsx
export default function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>Todo Pop</h1>
        <p>Keep it light. Get it done.</p>
      </header>
      <main className="app__main">
        <section className="card">UI will go here</section>
      </main>
    </div>
  );
}
```

**Step 2: Set up playful base styles**

```css
:root {
  --bg: #fff6f0;
  --bg-accent: #ffe6f2;
  --card: #ffffff;
  --ink: #1b1b1f;
  --muted: #6b6b75;
  --primary: #ff5f8a;
  --secondary: #22c1c3;
  --accent: #f7b731;
  --shadow: 0 10px 30px rgba(0,0,0,0.08);
  --radius: 18px;
}

body {
  margin: 0;
  font-family: "Poppins", system-ui, sans-serif;
  background: radial-gradient(circle at top left, var(--bg-accent), var(--bg));
  color: var(--ink);
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/App.tsx src/App.css src/index.css
git commit -m "style: add playful base layout"
```

---

### Task 3: Add reducer + types with tests (TDD)

**Files:**
- Create: `src/state/todosReducer.ts`
- Create: `src/state/todosReducer.test.ts`
- Modify: `vite.config.ts`
- Modify: `package.json`

**Step 1: Add Vitest**

Run: `npm install -D vitest`
Expected: `vitest` in devDependencies

**Step 2: Add test scripts and config**

`package.json`:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
  },
});
```

**Step 3: Write failing reducer tests**

```ts
import { describe, it, expect } from "vitest";
import { reducer, defaultState } from "./todosReducer";

describe("todosReducer", () => {
  it("adds a todo", () => {
    const next = reducer(defaultState, { type: "add", title: "Write plan" });
    expect(next.todos).toHaveLength(1);
    expect(next.todos[0].title).toBe("Write plan");
  });

  it("toggles a todo", () => {
    const withOne = reducer(defaultState, { type: "add", title: "Toggle me" });
    const id = withOne.todos[0].id;
    const toggled = reducer(withOne, { type: "toggle", id });
    expect(toggled.todos[0].completed).toBe(true);
  });
});
```

**Step 4: Run tests (expect fail)**

Run: `npm test`
Expected: FAIL (reducer not implemented)

**Step 5: Implement reducer + types**

```ts
export type Filter = "all" | "active" | "completed";
export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
};
export type State = { todos: Todo[]; filter: Filter };

export type Action =
  | { type: "add"; title: string }
  | { type: "toggle"; id: string }
  | { type: "edit"; id: string; title: string }
  | { type: "remove"; id: string }
  | { type: "setFilter"; filter: Filter };

export const defaultState: State = { todos: [], filter: "all" };

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "add": {
      const title = action.title.trim();
      if (!title) return state;
      const next = {
        id: makeId(),
        title,
        completed: false,
        createdAt: Date.now(),
      };
      return { ...state, todos: [next, ...state.todos] };
    }
    case "toggle":
      return {
        ...state,
        todos: state.todos.map((t) =>
          t.id === action.id ? { ...t, completed: !t.completed } : t
        ),
      };
    case "edit": {
      const title = action.title.trim();
      if (!title) return state;
      return {
        ...state,
        todos: state.todos.map((t) =>
          t.id === action.id ? { ...t, title } : t
        ),
      };
    }
    case "remove":
      return { ...state, todos: state.todos.filter((t) => t.id !== action.id) };
    case "setFilter":
      return { ...state, filter: action.filter };
    default:
      return state;
  }
}
```

**Step 6: Run tests (expect pass)**

Run: `npm test`
Expected: PASS

**Step 7: Commit**

```bash
git add vite.config.ts package.json src/state/todosReducer.ts src/state/todosReducer.test.ts
git commit -m "feat: add todos reducer with tests"
```

---

### Task 4: Add selectors and counts (TDD)

**Files:**
- Create: `src/state/selectors.ts`
- Create: `src/state/selectors.test.ts`

**Step 1: Write failing selector tests**

```ts
import { describe, it, expect } from "vitest";
import { selectVisibleTodos, selectCounts } from "./selectors";
import { State } from "./todosReducer";

const state: State = {
  filter: "active",
  todos: [
    { id: "1", title: "A", completed: false, createdAt: 1 },
    { id: "2", title: "B", completed: true, createdAt: 2 },
  ],
};

it("filters active todos", () => {
  const visible = selectVisibleTodos(state);
  expect(visible).toHaveLength(1);
  expect(visible[0].id).toBe("1");
});

it("computes counts", () => {
  const counts = selectCounts(state);
  expect(counts.all).toBe(2);
  expect(counts.active).toBe(1);
  expect(counts.completed).toBe(1);
});
```

**Step 2: Run tests (expect fail)**

Run: `npm test`
Expected: FAIL (selectors missing)

**Step 3: Implement selectors**

```ts
import { State } from "./todosReducer";

export function selectVisibleTodos(state: State) {
  switch (state.filter) {
    case "active":
      return state.todos.filter((t) => !t.completed);
    case "completed":
      return state.todos.filter((t) => t.completed);
    default:
      return state.todos;
  }
}

export function selectCounts(state: State) {
  const all = state.todos.length;
  const completed = state.todos.filter((t) => t.completed).length;
  return { all, completed, active: all - completed };
}
```

**Step 4: Run tests (expect pass)**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/state/selectors.ts src/state/selectors.test.ts
git commit -m "feat: add selectors with tests"
```

---

### Task 5: Add localStorage utilities and hook

**Files:**
- Create: `src/storage/localStorage.ts`
- Create: `src/storage/localStorage.test.ts`
- Create: `src/hooks/useLocalStorageState.ts`

**Step 1: Write failing storage tests**

```ts
import { describe, it, expect } from "vitest";
import { loadState, saveState } from "./localStorage";

const key = "test_key";

globalThis.localStorage = {
  _data: new Map<string, string>(),
  getItem(k) { return this._data.get(k) ?? null; },
  setItem(k, v) { this._data.set(k, v); },
  removeItem(k) { this._data.delete(k); },
  clear() { this._data.clear(); },
  key() { return null; },
  length: 0,
};

it("saves and loads state", () => {
  saveState(key, { ok: true });
  const loaded = loadState<{ ok: boolean }>(key, { ok: false });
  expect(loaded.ok).toBe(true);
});
```

**Step 2: Run tests (expect fail)**

Run: `npm test`
Expected: FAIL (storage utils missing)

**Step 3: Implement storage utils**

```ts
export function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveState<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore write errors
  }
}
```

**Step 4: Implement persistence hook**

```ts
import { useEffect, useMemo, useState } from "react";
import { loadState, saveState } from "../storage/localStorage";

export function useLocalStorageState<T>(key: string, fallback: T) {
  const [state, setState] = useState<T>(() => loadState(key, fallback));

  useEffect(() => {
    saveState(key, state);
  }, [key, state]);

  return [state, setState] as const;
}
```

**Step 5: Run tests (expect pass)**

Run: `npm test`
Expected: PASS

**Step 6: Commit**

```bash
git add src/storage/localStorage.ts src/storage/localStorage.test.ts src/hooks/useLocalStorageState.ts
git commit -m "feat: add localStorage utilities and hook"
```

---

### Task 6: Build core components (header, input, list)

**Files:**
- Create: `src/components/Header.tsx`
- Create: `src/components/TodoInput.tsx`
- Create: `src/components/TodoList.tsx`
- Create: `src/components/TodoItem.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Step 1: Add components**

`Header.tsx`:
```tsx
export function Header() {
  return (
    <header className="app__header">
      <h1>Todo Pop</h1>
      <p>Keep it light. Get it done.</p>
    </header>
  );
}
```

`TodoInput.tsx`:
```tsx
import { useState } from "react";

export function TodoInput({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState("");
  const submit = () => {
    const next = title.trim();
    if (!next) return;
    onAdd(next);
    setTitle("");
  };
  return (
    <div className="todo-input">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Add a task"
      />
      <button onClick={submit}>Add</button>
    </div>
  );
}
```

`TodoList.tsx` and `TodoItem.tsx` handle toggle + remove.

**Step 2: Wire components in App**

`App.tsx` uses `useReducer` + `selectVisibleTodos` and passes handlers.

**Step 3: Manual check**

Run: `npm run dev`
Expected: Add/toggle/remove works in browser

**Step 4: Commit**

```bash
git add src/components src/App.tsx src/App.css
git commit -m "feat: add core todo components"
```

---

### Task 7: Add edit mode + filters + empty state

**Files:**
- Modify: `src/components/TodoItem.tsx`
- Create: `src/components/Filters.tsx`
- Create: `src/components/EmptyState.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Step 1: Add edit mode**

Support double-click or edit button, Enter to save, Escape to cancel.

**Step 2: Add Filters + EmptyState**

`Filters` dispatches `setFilter`, `EmptyState` shows when list is empty.

**Step 3: Manual check**

Run: `npm run dev`
Expected: Edit + filter + empty state work

**Step 4: Commit**

```bash
git add src/components/Filters.tsx src/components/EmptyState.tsx src/components/TodoItem.tsx src/App.tsx src/App.css
git commit -m "feat: add edit mode and filters"
```

---

### Task 8: Wire persistence + polish

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Step 1: Integrate `useLocalStorageState`**

Hydrate initial state and persist updates on every change.

**Step 2: Add small motion**

Add CSS transitions for list items and buttons.

**Step 3: Manual check**

Run: `npm run dev`
Expected: Reload preserves todos and filter

**Step 4: Commit**

```bash
git add src/App.tsx src/App.css
git commit -m "feat: add persistence and polish"
```
