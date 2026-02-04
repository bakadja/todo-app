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
