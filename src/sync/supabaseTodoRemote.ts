import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalTodoRecord, OwnerKey } from "../storage/todoDb";
import type { RemoteTodoRecord, TodoRemote } from "./types";

export type { RemoteTodoRecord } from "./types";

const TODO_COLUMNS =
  "id,user_id,title,completed,created_at,updated_at,deleted_at";

export function remoteToLocal(
  row: RemoteTodoRecord,
  ownerKey: OwnerKey,
): LocalTodoRecord {
  return {
    id: row.id,
    ownerKey,
    title: row.title,
    completed: row.completed,
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
    const { data, error } = await this.client.rpc("sync_todo_lww", {
      p_id: todo.id,
      p_title: todo.title,
      p_completed: todo.completed,
      p_created_at: new Date(todo.createdAt).toISOString(),
      p_updated_at: new Date(todo.updatedAt).toISOString(),
      p_deleted_at:
        todo.deletedAt === null ? null : new Date(todo.deletedAt).toISOString(),
    });

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Supabase sync returned no canonical todo");
    return data as RemoteTodoRecord;
  }

  async list(): Promise<RemoteTodoRecord[]> {
    const { data, error } = await this.client
      .from("todos")
      .select(TODO_COLUMNS)
      .order("updated_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as RemoteTodoRecord[];
  }
}
