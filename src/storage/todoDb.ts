import Dexie, { type Table } from "dexie";

export type OwnerKey = "anonymous" | `user:${string}`;
export type SyncStatus = "pending" | "syncing" | "synced" | "error";

export type LocalTodoRecord = {
  id: string;
  ownerKey: OwnerKey;
  title: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  syncStatus: SyncStatus;
  lastSyncError: string | null;
};

export type MetaRecord = {
  key: string;
  value: string;
};

export class TodoDb extends Dexie {
  todos!: Table<LocalTodoRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name = "todo-pop") {
    super(name);
    this.version(1).stores({
      todos: "id, ownerKey, syncStatus, updatedAt, deletedAt",
      meta: "key",
    });
  }
}

export const createTodoDb = (name = "todo-pop") => new TodoDb(name);
export const todoDb = createTodoDb();
export const ownerKeyForUser = (userId: string): OwnerKey => `user:${userId}`;
