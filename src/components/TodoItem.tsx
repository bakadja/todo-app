import { useState } from "react";
import type { Todo } from "../state/todosReducer";

type TodoItemProps = {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, title: string) => void;
};

export function TodoItem({ todo, onToggle, onRemove, onEdit }: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);

  const startEdit = () => {
    setDraft(todo.title);
    setIsEditing(true);
  };

  const commit = () => {
    const next = draft.trim();
    if (!next) {
      setDraft(todo.title);
      setIsEditing(false);
      return;
    }
    onEdit(todo.id, next);
    setIsEditing(false);
  };

  const cancel = () => {
    setDraft(todo.title);
    setIsEditing(false);
  };

  return (
    <li className={todo.completed ? "todo-item is-complete" : "todo-item"}>
      {isEditing ? (
        <div className="todo-item__edit">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") cancel();
            }}
            aria-label="Edit todo"
            autoFocus
          />
          <div className="todo-item__actions">
            <button type="button" onClick={commit}>
              Save
            </button>
            <button type="button" onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <label className="todo-item__check">
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => onToggle(todo.id)}
            />
            <span className="todo-item__title" onDoubleClick={startEdit}>
              {todo.title}
            </span>
          </label>
          <div className="todo-item__actions">
            <button type="button" onClick={startEdit}>
              Edit
            </button>
            <button
              type="button"
              className="todo-item__remove"
              onClick={() => onRemove(todo.id)}
              aria-label={`Remove ${todo.title}`}
            >
              Remove
            </button>
          </div>
        </>
      )}
    </li>
  );
}
