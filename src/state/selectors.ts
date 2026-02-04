import type { State } from "./todosReducer";

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
