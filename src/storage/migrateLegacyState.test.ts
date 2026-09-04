import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodoDb, type TodoDb } from "./todoDb";
import { migrateLegacyState } from "./migrateLegacyState";

type MockStorage = Storage & { _data: Map<string, string> };

const createMockStorage = (): MockStorage => {
  const store = new Map<string, string>();
  return {
    _data: store,
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  } as MockStorage;
};

describe("migrateLegacyState", () => {
  let db: TodoDb;

  beforeEach(() => {
    globalThis.localStorage = createMockStorage();
    db = createTodoDb(`legacy-migration-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("preserves real todos and filter while moving them to IndexedDB", async () => {
    localStorage.setItem(
      "todos_app_v1",
      JSON.stringify({
        todos: [
          {
            id: "legacy-1",
            title: "Real existing task",
            completed: true,
            createdAt: 1234,
          },
        ],
        filter: "active",
      }),
    );

    await migrateLegacyState(db, 9000);

    expect(await db.todos.get("legacy-1")).toMatchObject({
      id: "legacy-1",
      title: "Real existing task",
      completed: true,
      createdAt: 1234,
      updatedAt: 9000,
      deletedAt: null,
      ownerKey: "anonymous",
      syncStatus: "pending",
      lastSyncError: null,
    });
    expect(localStorage.getItem("todos_app_v1")).toBeNull();
    expect(localStorage.getItem("todos_app_filter_v1")).toBe("active");
  });

  it("does not duplicate rows when migration is called twice", async () => {
    localStorage.setItem(
      "todos_app_v1",
      JSON.stringify({
        todos: [
          {
            id: "legacy-1",
            title: "Keep once",
            completed: false,
            createdAt: 1234,
          },
        ],
        filter: "all",
      }),
    );

    await migrateLegacyState(db, 9000);
    await migrateLegacyState(db, 10000);

    expect(await db.todos.count()).toBe(1);
    expect((await db.todos.get("legacy-1"))?.updatedAt).toBe(9000);
  });

  it("leaves malformed legacy JSON untouched", async () => {
    const malformed = "{not-valid-json";
    localStorage.setItem("todos_app_v1", malformed);

    await migrateLegacyState(db, 9000);

    expect(await db.todos.count()).toBe(0);
    expect(localStorage.getItem("todos_app_v1")).toBe(malformed);
  });
});
