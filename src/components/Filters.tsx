import type { Filter } from "../state/todosReducer";

type FiltersProps = {
  filter: Filter;
  counts: { all: number; active: number; completed: number };
  onChange: (filter: Filter) => void;
};

export function Filters({ filter, counts, onChange }: FiltersProps) {
  return (
    <div className="filters">
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
  );
}
