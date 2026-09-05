import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodoDb, ownerKeyForUser, type TodoDb } from "./todoDb";
import { LocalTodoRepository } from "./todoRepository";

describe("LocalTodoRepository", () => {
  let db: TodoDb;
  let repo: LocalTodoRepository;

  beforeEach(() => {
    db = createTodoDb(`todo-repo-${crypto.randomUUID()}`);
    repo = new LocalTodoRepository(db);
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("creates a durable anonymous pending todo", async () => {
    const row = await repo.add("Write tests", "anonymous", 1000);
    expect(row).toMatchObject({
      title: "Write tests",
      ownerKey: "anonymous",
      completed: false,
      createdAt: 1000,
      updatedAt: 1000,
      deletedAt: null,
      syncStatus: "pending",
    });
    expect((await repo.listVisible("anonymous"))[0].id).toBe(row.id);
  });

  it("keeps delete tombstones", async () => {
    const row = await repo.add("Delete me", "anonymous", 1000);
    await repo.softDelete(row.id, "anonymous", 2000);
    expect(await repo.listVisible("anonymous")).toEqual([]);
    expect((await repo.get(row.id))?.deletedAt).toBe(2000);
  });

  it("restores a deleted todo as a newer pending version", async () => {
    const row = await repo.add("Restore me", "anonymous", 1000);
    await repo.softDelete(row.id, "anonymous", 2000);

    const restored = await repo.restore(row.id, "anonymous", 3000);

    expect(restored).toMatchObject({
      id: row.id,
      title: "Restore me",
      completed: false,
      createdAt: 1000,
      updatedAt: 3000,
      deletedAt: null,
      syncStatus: "pending",
      lastSyncError: null,
    });
    expect((await repo.listVisible("anonymous")).map((todo) => todo.id)).toEqual([
      row.id,
    ]);
  });

  it("retries interrupted syncing rows", async () => {
    const row = await repo.add("Retry me", "anonymous", 1000);
    await repo.markSyncing(row.id);
    expect((await repo.listRetryable("anonymous")).map((todo) => todo.id)).toEqual([
      row.id,
    ]);
  });

  it("rejects writes through another owner", async () => {
    const a = ownerKeyForUser("11111111-1111-1111-1111-111111111111");
    const b = ownerKeyForUser("22222222-2222-2222-2222-222222222222");
    const row = await repo.add("Private", a, 1000);

    await expect(repo.edit(row.id, b, "Intrusion", 2000)).rejects.toThrow(
      "Todo not found for owner",
    );
  });
});
