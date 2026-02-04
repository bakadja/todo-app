# Todo App Design (v1)

Date: 2026-02-04

## Goals
- Build a React + Vite + TypeScript todo list app.
- Core features: add, toggle, edit, delete, filter (all/active/completed).
- Persist state in localStorage.
- Colorful, playful visual style with light motion.

## Non-Goals
- Backend or multi-user sync.
- Advanced features like priorities or due dates.
- Heavy testing frameworks in v1.

## Architecture
- Single-page React app.
- `useReducer` for pure state transitions.
- `useLocalStorageState` hook to hydrate and persist state.
- No external state libraries.

## State Model
```
{
  todos: Array<{ id: string; title: string; completed: boolean; createdAt: number }>;
  filter: "all" | "active" | "completed";
}
```

## Components
- `App`: wires reducer, persistence, and layout.
- `Header`: title and subtitle.
- `TodoInput`: controlled input + add button.
- `TodoList`: renders visible todos.
- `TodoItem`: checkbox, title, edit mode, delete button.
- `Filters`: segmented filter buttons.
- `EmptyState`: shown when filtered list is empty.

## Data Flow
- `App` initializes state from localStorage (key: `todos_app_v1`).
- UI dispatches actions to reducer: `add`, `toggle`, `edit`, `remove`, `setFilter`.
- `useLocalStorageState` syncs updated state back to localStorage.
- Selectors compute `visibleTodos` and (optionally) counts.

## Error Handling / Edge Cases
- Invalid localStorage data: fall back to default state.
- Empty add/edit input: reject and keep prior title.
- ID generation: `crypto.randomUUID()` when available, otherwise timestamp + random.

## UX Details
- Add on Enter or button click.
- Edit on double-click or edit button; commit on Enter, cancel on Escape.
- Light animations for item entry and subtle feedback for invalid input.

## Visual Direction
- Colorful, playful palette with soft gradients.
- Rounded cards and gentle shadows.
- Expressive font (e.g., Poppins or Space Grotesk).

## Testing (v1)
- Manual checks: add/edit/toggle/delete, filters, persistence, and reload behavior.
- Future: add `vitest` for reducer + hook unit tests.
