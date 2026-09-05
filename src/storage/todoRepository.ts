import {
  todoDb,
  type LocalTodoRecord,
  type OwnerKey,
  type TodoDb,
} from "./todoDb";

const isRetryable = (row: LocalTodoRecord) =>
  row.syncStatus === "pending" ||
  row.syncStatus === "syncing" ||
  row.syncStatus === "error";

export class LocalTodoRepository {
  private readonly db: TodoDb;

  constructor(db: TodoDb) {
    this.db = db;
  }

  get(id: string): Promise<LocalTodoRecord | undefined> {
    return this.db.todos.get(id);
  }

  async listVisible(ownerKey: OwnerKey): Promise<LocalTodoRecord[]> {
    const rows = await this.db.todos.where("ownerKey").equals(ownerKey).toArray();
    return rows
      .filter((row) => row.deletedAt === null)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async listRetryable(ownerKey: OwnerKey): Promise<LocalTodoRecord[]> {
    const rows = await this.db.todos.where("ownerKey").equals(ownerKey).toArray();
    return rows.filter(isRetryable);
  }

  async add(
    title: string,
    ownerKey: OwnerKey,
    now = Date.now(),
  ): Promise<LocalTodoRecord> {
    const row: LocalTodoRecord = {
      id: crypto.randomUUID(),
      ownerKey,
      title,
      completed: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: "pending",
      lastSyncError: null,
    };

    await this.db.todos.add(row);
    return row;
  }

  async edit(
    id: string,
    ownerKey: OwnerKey,
    title: string,
    now = Date.now(),
  ): Promise<LocalTodoRecord> {
    const row = await this.requireForOwner(id, ownerKey);
    const next: LocalTodoRecord = {
      ...row,
      title,
      updatedAt: now,
      syncStatus: "pending",
      lastSyncError: null,
    };
    await this.db.todos.put(next);
    return next;
  }

  async toggle(
    id: string,
    ownerKey: OwnerKey,
    now = Date.now(),
  ): Promise<LocalTodoRecord> {
    const row = await this.requireForOwner(id, ownerKey);
    const next: LocalTodoRecord = {
      ...row,
      completed: !row.completed,
      updatedAt: now,
      syncStatus: "pending",
      lastSyncError: null,
    };
    await this.db.todos.put(next);
    return next;
  }

  async softDelete(
    id: string,
    ownerKey: OwnerKey,
    now = Date.now(),
  ): Promise<LocalTodoRecord> {
    const row = await this.requireForOwner(id, ownerKey);
    const next: LocalTodoRecord = {
      ...row,
      deletedAt: now,
      updatedAt: now,
      syncStatus: "pending",
      lastSyncError: null,
    };
    await this.db.todos.put(next);
    return next;
  }

  async restore(
    id: string,
    ownerKey: OwnerKey,
    now = Date.now(),
  ): Promise<LocalTodoRecord> {
    const row = await this.requireForOwner(id, ownerKey);
    const next: LocalTodoRecord = {
      ...row,
      deletedAt: null,
      updatedAt: now,
      syncStatus: "pending",
      lastSyncError: null,
    };
    await this.db.todos.put(next);
    return next;
  }

  async claimAnonymous(
    ownerKey: Exclude<OwnerKey, "anonymous">,
  ): Promise<void> {
    const rows = await this.db.todos.where("ownerKey").equals("anonymous").toArray();
    if (rows.length === 0) return;

    await this.db.transaction("rw", this.db.todos, async () => {
      await this.db.todos.bulkPut(
        rows.map((row) => ({
          ...row,
          ownerKey,
          syncStatus: "pending" as const,
          lastSyncError: null,
        })),
      );
    });
  }

  async markSyncing(id: string): Promise<void> {
    const row = await this.db.todos.get(id);
    if (!row) return;
    await this.db.todos.put({
      ...row,
      syncStatus: "syncing",
      lastSyncError: null,
    });
  }

  async markError(id: string, message: string): Promise<void> {
    const row = await this.db.todos.get(id);
    if (!row) return;
    await this.db.todos.put({
      ...row,
      syncStatus: "error",
      lastSyncError: message,
    });
  }

  putCanonical(row: LocalTodoRecord): Promise<string> {
    return this.db.todos.put(row);
  }

  async putRemote(row: LocalTodoRecord): Promise<void> {
    const existing = await this.db.todos.get(row.id);
    if (existing && isRetryable(existing)) return;
    await this.db.todos.put(row);
  }

  private async requireForOwner(
    id: string,
    ownerKey: OwnerKey,
  ): Promise<LocalTodoRecord> {
    const row = await this.db.todos.get(id);
    if (!row || row.ownerKey !== ownerKey) {
      throw new Error("Todo not found for owner");
    }
    return row;
  }
}

export const localTodoRepository = new LocalTodoRepository(todoDb);
