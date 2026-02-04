import { Todo } from "../state/todosReducer";

type TodoItemProps = {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
};

export function TodoItem({ todo, onToggle, onRemove }: TodoItemProps) {
  return (
    <li className={todo.completed ? "todo-item is-complete" : "todo-item"}>
      <label className="todo-item__check">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id)}
        />
        <span className="todo-item__title">{todo.title}</span>
      </label>
      <button
        type="button"
        className="todo-item__remove"
        onClick={() => onRemove(todo.id)}
        aria-label={`Remove ${todo.title}`}
      >
        Remove
      </button>
    </li>
  );
}
