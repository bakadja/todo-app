import Dexie, { type Table } from "dexie";
import type { TodoPriority } from "../types/todoPriority";

export type OwnerKey = "anonymous" | `user:${string}`;
export type SyncStatus = "pending" | "syncing" | "synced" | "error";

export type LocalTodoRecord = {
  id: string;
  ownerKey: OwnerKey;
  title: string;
  completed: boolean;
  priority: TodoPriority;
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

const todoStores = {
  todos: "id, ownerKey, syncStatus, updatedAt, deletedAt",
  meta: "key",
};

export class TodoDb extends Dexie {
  todos!: Table<LocalTodoRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name = "todo-pop") {
    super(name);
    this.version(1).stores(todoStores);
    this.version(2)
      .stores(todoStores)
      .upgrade(async (transaction) => {
        await transaction
          .table<LocalTodoRecord, string>("todos")
          .toCollection()
          .modify((todo) => {
            const legacyTodo = todo as LocalTodoRecord & {
              priority?: TodoPriority;
            };
            if (legacyTodo.priority === undefined) {
              legacyTodo.priority = null;
            }
          });
      });
  }
}

export const createTodoDb = (name = "todo-pop") => new TodoDb(name);
export const todoDb = createTodoDb();
export const ownerKeyForUser = (
  userId: string,
): Exclude<OwnerKey, "anonymous"> => `user:${userId}`;
