import { useState } from "react";
import "./TodoItem.css";
import type { Todo } from "../state/todosReducer";
import type { TodoPriority } from "../types/todoPriority";
import { todoPriorityLabel } from "../types/todoPriority";
import { MAX_TODO_TITLE_LENGTH } from "../types/todoTitle";
import { PrioritySelect } from "./PrioritySelect";

type TodoItemProps = {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, title: string, priority: TodoPriority) => void;
};

export function TodoItem({ todo, onToggle, onRemove, onEdit }: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [draftPriority, setDraftPriority] = useState<TodoPriority>(todo.priority);
  const [draftError, setDraftError] = useState<string | null>(null);

  const startEdit = () => {
    setDraft(todo.title);
    setDraftPriority(todo.priority);
    setDraftError(null);
    setIsEditing(true);
  };

  const commit = () => {
    const next = draft.trim();
    if (!next) {
      // Committing an emptied editor cancels the edit, as before.
      cancel();
      return;
    }
    // Legacy todos may exceed the title bound; refuse the commit with visible
    // feedback instead of failing silently in the repository.
    if (draft.length > MAX_TODO_TITLE_LENGTH) {
      setDraftError(
        `Todo title must be at most ${MAX_TODO_TITLE_LENGTH} characters`,
      );
      return;
    }
    onEdit(todo.id, next, draftPriority);
    setIsEditing(false);
  };

  const cancel = () => {
    setDraft(todo.title);
    setDraftPriority(todo.priority);
    setDraftError(null);
    setIsEditing(false);
  };

  return (
    <li className={todo.completed ? "todo-item is-complete" : "todo-item"}>
      {isEditing ? (
        <div className="todo-item__edit">
          <textarea
            value={draft}
            rows={3}
            maxLength={MAX_TODO_TITLE_LENGTH}
            onChange={(event) => {
              setDraft(event.target.value);
              setDraftError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") cancel();
            }}
            aria-label="Edit todo"
            autoFocus
          />
          {draftError ? (
            <p className="todo-item__edit-error" role="alert">
              {draftError}
            </p>
          ) : null}
          <PrioritySelect
            value={draftPriority}
            onChange={setDraftPriority}
            ariaLabel="Edit todo priority"
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
            <span className="todo-item__body">
              <span className="todo-item__title" onDoubleClick={startEdit}>
                {todo.title}
              </span>
              {todo.priority ? (
                <span
                  className={`todo-item__priority todo-item__priority--${todo.priority}`}
                >
                  {todoPriorityLabel(todo.priority)}
                </span>
              ) : null}
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
