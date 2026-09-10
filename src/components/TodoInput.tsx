import { useState } from "react";
import type { TodoPriority } from "../types/todoPriority";
import { PrioritySelect } from "./PrioritySelect";

type TodoInputProps = {
  onAdd: (title: string, priority: TodoPriority) => void;
};

export function TodoInput({ onAdd }: TodoInputProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TodoPriority>(null);

  const submit = () => {
    const next = title.trim();
    if (!next) return;
    onAdd(next, priority);
    setTitle("");
    setPriority(null);
  };

  return (
    <div className="todo-input">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && submit()}
        placeholder="Add a task"
        aria-label="Add a task"
      />
      <PrioritySelect
        value={priority}
        onChange={setPriority}
        ariaLabel="New todo priority"
      />
      <button type="button" onClick={submit}>
        Add
      </button>
    </div>
  );
}
