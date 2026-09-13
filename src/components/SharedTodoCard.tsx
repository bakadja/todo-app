import { useState } from "react";
import type { TodoPriority } from "../types/todoPriority";
import { MAX_TODO_TITLE_LENGTH } from "../types/todoTitle";
import { PrioritySelect } from "./PrioritySelect";
import "./SharedTodoCard.css";

type SharedTodoCardProps = {
  initialValue: string;
  onAdd: (value: string, priority: TodoPriority) => void;
  onCancel: () => void;
};

export function SharedTodoCard({
  initialValue,
  onAdd,
  onCancel,
}: SharedTodoCardProps) {
  const [value, setValue] = useState(initialValue);
  const [priority, setPriority] = useState<TodoPriority>(null);
  const trimmed = value.trim();
  // Shared content arrives pre-filled, so it can exceed the limit; report it
  // instead of truncating, and let the user shorten it themselves.
  const tooLong = trimmed.length > MAX_TODO_TITLE_LENGTH;

  return (
    <section className="shared-todo" aria-labelledby="shared-todo-title">
      <div className="shared-todo__intro">
        <span className="shared-todo__eyebrow">From another app</span>
        <h2 id="shared-todo-title">Shared todo</h2>
        <p>Edit the shared content before adding it to your list.</p>
      </div>

      <label className="shared-todo__field">
        <span>Shared todo content</span>
        <textarea
          value={value}
          rows={4}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Shared todo content"
          autoFocus
        />
      </label>

      {tooLong ? (
        <p className="shared-todo__error" role="alert">
          Shared todo content is too long ({trimmed.length} characters; the
          maximum is {MAX_TODO_TITLE_LENGTH}). Shorten it before adding.
        </p>
      ) : null}

      <PrioritySelect
        value={priority}
        onChange={setPriority}
        ariaLabel="Shared todo priority"
      />

      <div className="shared-todo__actions">
        <button
          type="button"
          className="shared-todo__button shared-todo__button--secondary"
          onClick={onCancel}
          aria-label="Cancel shared todo"
        >
          Cancel
        </button>
        <button
          type="button"
          className="shared-todo__button shared-todo__button--primary"
          onClick={() => trimmed && !tooLong && onAdd(trimmed, priority)}
          disabled={!trimmed || tooLong}
          aria-label="Add shared todo"
        >
          Add
        </button>
      </div>
    </section>
  );
}
