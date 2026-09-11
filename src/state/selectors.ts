import type { State } from "./todosReducer";

export function selectVisibleTodos(state: State) {
  const statusFiltered = (() => {
    switch (state.filter) {
      case "active":
        return state.todos.filter((todo) => !todo.completed);
      case "completed":
        return state.todos.filter((todo) => todo.completed);
      default:
        return state.todos;
    }
  })();

  switch (state.priorityFilter) {
    case "high":
    case "medium":
    case "low":
      return statusFiltered.filter(
        (todo) => todo.priority === state.priorityFilter,
      );
    case "none":
      return statusFiltered.filter((todo) => todo.priority === null);
    default:
      return statusFiltered;
  }
}

export function selectCounts(state: State) {
  const all = state.todos.length;
  const completed = state.todos.filter((todo) => todo.completed).length;
  return { all, completed, active: all - completed };
}
