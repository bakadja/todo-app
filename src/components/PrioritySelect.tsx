import type { TodoPriority } from "../types/todoPriority";
import { todoPriorityFromValue } from "../types/todoPriority";
import "./PrioritySelect.css";

type PrioritySelectProps = {
  value: TodoPriority;
  onChange: (priority: TodoPriority) => void;
  ariaLabel: string;
};

export function PrioritySelect({
  value,
  onChange,
  ariaLabel,
}: PrioritySelectProps) {
  return (
    <label className="priority-select">
      <span>Priority</span>
      <select
        aria-label={ariaLabel}
        value={value ?? ""}
        onChange={(event) => onChange(todoPriorityFromValue(event.target.value))}
      >
        <option value="">None</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
    </label>
  );
}
