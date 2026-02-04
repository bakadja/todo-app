import { useState } from "react";

type TodoInputProps = {
  onAdd: (title: string) => void;
};

export function TodoInput({ onAdd }: TodoInputProps) {
  const [title, setTitle] = useState("");

  const submit = () => {
    const next = title.trim();
    if (!next) return;
    onAdd(next);
    setTitle("");
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
      <button type="button" onClick={submit}>
        Add
      </button>
    </div>
  );
}
