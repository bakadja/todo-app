import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { createTodoDb, type TodoDb } from "./todoDb";

const databaseNames: string[] = [];

afterEach(async () => {
  for (const name of databaseNames.splice(0)) {
    await Dexie.delete(name);
  }
});

describe("TodoDb migrations", () => {
  it("upgrades a Dexie v1 todo with no priority to priority null", async () => {
    const name = `todo-db-migration-${crypto.randomUUID()}`;
    databaseNames.push(name);

    const legacy = new Dexie(name);
    legacy.version(1).stores({
      todos: "id, ownerKey, syncStatus, updatedAt, deletedAt",
      meta: "key",
    });

    await legacy.table("todos").add({
      id: "legacy-v1",
      ownerKey: "anonymous",
      title: "Existing IndexedDB todo",
      completed: false,
      createdAt: 1000,
      updatedAt: 1000,
      deletedAt: null,
      syncStatus: "synced",
      lastSyncError: null,
    });
    legacy.close();

    const upgraded: TodoDb = createTodoDb(name);
    const row = await upgraded.todos.get("legacy-v1");

    expect(row).toMatchObject({
      id: "legacy-v1",
      title: "Existing IndexedDB todo",
      priority: null,
    });
    upgraded.close();
  });
});
