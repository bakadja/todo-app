import type { Filter } from "../state/todosReducer";

const FILTER_KEY = "todos_app_filter_v1";

const isFilter = (value: string | null): value is Filter =>
  value === "all" || value === "active" || value === "completed";

export function loadFilterPreference(): Filter {
  const raw = localStorage.getItem(FILTER_KEY);
  return isFilter(raw) ? raw : "all";
}

export function saveFilterPreference(filter: Filter): void {
  localStorage.setItem(FILTER_KEY, filter);
}
