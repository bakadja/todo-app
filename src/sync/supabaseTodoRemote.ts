import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalTodoRecord, OwnerKey } from "../storage/todoDb";
import type { RemoteTodoRecord, TodoRemote } from "./types";

export type { RemoteTodoRecord } from "./types";

const TODO_COLUMNS =
  "id,user_id,title,completed,priority,created_at,updated_at,deleted_at";

const PRIORITIES = ["low", "medium", "high"] as const;

const isDateLike = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

const isRemoteTodoRecord = (value: unknown): value is RemoteTodoRecord => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;

  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.user_id === "string" &&
    row.user_id.length > 0 &&
    typeof row.title === "string" &&
    typeof row.completed === "boolean" &&
    (row.priority === null ||
      (PRIORITIES as readonly string[]).includes(row.priority as string)) &&
    isDateLike(row.created_at) &&
    isDateLike(row.updated_at) &&
    (row.deleted_at === null || isDateLike(row.deleted_at))
  );
};

export function remoteToLocal(
  row: RemoteTodoRecord,
  ownerKey: OwnerKey,
): LocalTodoRecord {
  return {
    id: row.id,
    ownerKey,
    title: row.title,
    completed: row.completed,
    priority: row.priority,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    deletedAt: row.deleted_at ? Date.parse(row.deleted_at) : null,
    syncStatus: "synced",
    lastSyncError: null,
  };
}

export class SupabaseTodoRemote implements TodoRemote {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async push(todo: LocalTodoRecord): Promise<RemoteTodoRecord> {
    const { data, error } = await this.client
      .rpc("sync_todo_lww", {
        p_id: todo.id,
        p_title: todo.title,
        p_completed: todo.completed,
        p_priority: todo.priority,
        p_created_at: new Date(todo.createdAt).toISOString(),
        p_updated_at: new Date(todo.updatedAt).toISOString(),
        p_deleted_at:
          todo.deletedAt === null ? null : new Date(todo.deletedAt).toISOString(),
      })
      .single();

    if (error) throw new Error(error.message);
    if (!isRemoteTodoRecord(data)) {
      throw new Error("Supabase sync returned an invalid canonical todo");
    }
    return data;
  }

  async list(): Promise<RemoteTodoRecord[]> {
    const { data, error } = await this.client
      .from("todos")
      .select(TODO_COLUMNS)
      .order("updated_at", { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row, index) => {
      if (!isRemoteTodoRecord(row)) {
        throw new Error(
          `Supabase sync returned an invalid remote todo at index ${index}`,
        );
      }
      return row;
    });
  }
}
