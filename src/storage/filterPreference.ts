import type { Filter, PriorityFilter } from "../state/todosReducer";

const FILTER_KEY = "todos_app_filter_v1";
const PRIORITY_FILTER_KEY = "todos_app_priority_filter_v1";

const isFilter = (value: string | null): value is Filter =>
  value === "all" || value === "active" || value === "completed";

const isPriorityFilter = (value: string | null): value is PriorityFilter =>
  value === "all" ||
  value === "high" ||
  value === "medium" ||
  value === "low" ||
  value === "none";

export function loadFilterPreference(): Filter {
  const raw = localStorage.getItem(FILTER_KEY);
  return isFilter(raw) ? raw : "all";
}

export function saveFilterPreference(filter: Filter): void {
  localStorage.setItem(FILTER_KEY, filter);
}

export function loadPriorityFilterPreference(): PriorityFilter {
  const raw = localStorage.getItem(PRIORITY_FILTER_KEY);
  return isPriorityFilter(raw) ? raw : "all";
}

export function savePriorityFilterPreference(filter: PriorityFilter): void {
  localStorage.setItem(PRIORITY_FILTER_KEY, filter);
}
