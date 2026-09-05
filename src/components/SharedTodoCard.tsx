import { useState } from "react";
import "./SharedTodoCard.css";

type SharedTodoCardProps = {
  initialValue: string;
  onAdd: (value: string) => void;
  onCancel: () => void;
};

export function SharedTodoCard({
  initialValue,
  onAdd,
  onCancel,
}: SharedTodoCardProps) {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();

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
          onClick={() => trimmed && onAdd(trimmed)}
          disabled={!trimmed}
          aria-label="Add shared todo"
        >
          Add
        </button>
      </div>
    </section>
  );
}
