import type { Filter, Todo } from "../state/todosReducer";
import { saveFilterPreference } from "./filterPreference";
import type { LocalTodoRecord, TodoDb } from "./todoDb";

const LEGACY_KEY = "todos_app_v1";
const MIGRATION_MARKER = "legacy-todos-app-v1-migrated";

interface LegacyState {
  todos: Todo[];
  filter: Filter;
}

const isFilter = (value: unknown): value is Filter =>
  value === "all" || value === "active" || value === "completed";

const isLegacyTodo = (value: unknown): value is Todo => {
  if (!value || typeof value !== "object") return false;
  const todo = value as Partial<Todo>;
  return (
    typeof todo.id === "string" &&
    todo.id.length > 0 &&
    typeof todo.title === "string" &&
    typeof todo.completed === "boolean" &&
    typeof todo.createdAt === "number" &&
    Number.isFinite(todo.createdAt)
  );
};

const parseLegacyState = (raw: string): LegacyState | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const candidate = parsed as { todos?: unknown; filter?: unknown };
    if (!Array.isArray(candidate.todos) || !candidate.todos.every(isLegacyTodo)) {
      return null;
    }
    if (!isFilter(candidate.filter)) return null;

    return {
      todos: candidate.todos,
      filter: candidate.filter,
    };
  } catch {
    return null;
  }
};

export async function migrateLegacyState(
  db: TodoDb,
  now = Date.now(),
): Promise<void> {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;

  const legacy = parseLegacyState(raw);
  if (!legacy) return;

  const marker = await db.meta.get(MIGRATION_MARKER);
  if (!marker) {
    const rows: LocalTodoRecord[] = legacy.todos.map((todo) => ({
      id: todo.id,
      ownerKey: "anonymous",
      title: todo.title,
      completed: todo.completed,
      createdAt: todo.createdAt,
      updatedAt: now,
      deletedAt: null,
      syncStatus: "pending",
      lastSyncError: null,
    }));

    await db.transaction("rw", db.todos, db.meta, async () => {
      if (rows.length > 0) {
        await db.todos.bulkPut(rows);
      }
      await db.meta.put({ key: MIGRATION_MARKER, value: "1" });
    });
  }

  saveFilterPreference(legacy.filter);
  localStorage.removeItem(LEGACY_KEY);
}
