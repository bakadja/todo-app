import type { TodoPriority } from "../types/todoPriority";

export type Filter = "all" | "active" | "completed";
export type PriorityFilter = "all" | "high" | "medium" | "low" | "none";

export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  priority: TodoPriority;
  createdAt: number;
};

export type State = {
  todos: Todo[];
  filter: Filter;
  priorityFilter: PriorityFilter;
};

export type Action =
  | { type: "hydrate"; todos: Todo[] }
  | { type: "upsert"; todo: Todo }
  | { type: "remove"; id: string }
  | { type: "setFilter"; filter: Filter }
  | { type: "setPriorityFilter"; priorityFilter: PriorityFilter };

export const defaultState: State = {
  todos: [],
  filter: "all",
  priorityFilter: "all",
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return { ...state, todos: action.todos };
    case "upsert": {
      const exists = state.todos.some((todo) => todo.id === action.todo.id);
      return {
        ...state,
        todos: exists
          ? state.todos.map((todo) =>
              todo.id === action.todo.id ? action.todo : todo,
            )
          : [action.todo, ...state.todos],
      };
    }
    case "remove":
      return {
        ...state,
        todos: state.todos.filter((todo) => todo.id !== action.id),
      };
    case "setFilter":
      return { ...state, filter: action.filter };
    case "setPriorityFilter":
      return { ...state, priorityFilter: action.priorityFilter };
    default:
      return state;
  }
}
