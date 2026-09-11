import type { Filter, PriorityFilter } from "../state/todosReducer";
import "./Filters.css";

type FiltersProps = {
  filter: Filter;
  priorityFilter: PriorityFilter;
  counts: { all: number; active: number; completed: number };
  onChange: (filter: Filter) => void;
  onPriorityChange: (filter: PriorityFilter) => void;
};

export function Filters({
  filter,
  priorityFilter,
  counts,
  onChange,
  onPriorityChange,
}: FiltersProps) {
  return (
    <div className="filters-panel">
      <div className="filters filters--status" role="group" aria-label="Status filter">
        <button
          type="button"
          className={filter === "all" ? "is-active" : ""}
          onClick={() => onChange("all")}
        >
          All <span>{counts.all}</span>
        </button>
        <button
          type="button"
          className={filter === "active" ? "is-active" : ""}
          onClick={() => onChange("active")}
        >
          Active <span>{counts.active}</span>
        </button>
        <button
          type="button"
          className={filter === "completed" ? "is-active" : ""}
          onClick={() => onChange("completed")}
        >
          Done <span>{counts.completed}</span>
        </button>
      </div>

      <div
        className="filters filters--priority"
        role="group"
        aria-label="Priority filter"
      >
        <button
          type="button"
          className={priorityFilter === "all" ? "is-active" : ""}
          onClick={() => onPriorityChange("all")}
        >
          All priorities
        </button>
        <button
          type="button"
          className={priorityFilter === "high" ? "is-active" : ""}
          onClick={() => onPriorityChange("high")}
        >
          High
        </button>
        <button
          type="button"
          className={priorityFilter === "medium" ? "is-active" : ""}
          onClick={() => onPriorityChange("medium")}
        >
          Medium
        </button>
        <button
          type="button"
          className={priorityFilter === "low" ? "is-active" : ""}
          onClick={() => onPriorityChange("low")}
        >
          Low
        </button>
        <button
          type="button"
          className={priorityFilter === "none" ? "is-active" : ""}
          onClick={() => onPriorityChange("none")}
        >
          None
        </button>
      </div>
    </div>
  );
}
