export const TODO_PRIORITIES = ["low", "medium", "high"] as const;

export type TodoPriority = (typeof TODO_PRIORITIES)[number] | null;

export function todoPriorityFromValue(value: string): TodoPriority {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : null;
}

export function todoPriorityLabel(
  priority: Exclude<TodoPriority, null>,
): "Low" | "Medium" | "High" {
  if (priority === "low") return "Low";
  if (priority === "medium") return "Medium";
  return "High";
}
