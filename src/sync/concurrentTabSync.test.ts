import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTodoDb,
  ownerKeyForUser,
  type LocalTodoRecord,
  type TodoDb,
} from "../storage/todoDb";
import { LocalTodoRepository } from "../storage/todoRepository";
import { syncTodos } from "./syncEngine";
import type { RemoteTodoRecord, TodoRemote } from "./types";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const AT_12 = Date.parse("2026-09-13T12:00:00.000Z");
const AT_13 = Date.parse("2026-09-13T13:00:00.000Z");
const AT_13_30 = Date.parse("2026-09-13T13:00:30.000Z");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class PushGate {
  private resolve!: () => void;
  readonly promise = new Promise<void>((resolve) => {
    this.resolve = resolve;
  });

  open() {
    this.resolve();
  }
}

function toRemote(todo: LocalTodoRecord): RemoteTodoRecord {
  return {
    id: todo.id,
    user_id: USER_ID,
    title: todo.title,
    completed: todo.completed,
    priority: todo.priority,
    created_at: new Date(todo.createdAt).toISOString(),
    updated_at: new Date(todo.updatedAt).toISOString(),
    deleted_at:
      todo.deletedAt === null ? null : new Date(todo.deletedAt).toISOString(),
  };
}

class DelayedLwwRemote implements TodoRemote {
  private readonly rows = new Map<string, RemoteTodoRecord>();
  private pushGate: PushGate | null = null;
  private readonly delayMs: number;

  constructor(delayMs: number) {
    this.delayMs = delayMs;
  }

  holdPushes(gate: PushGate) {
    this.pushGate = gate;
  }

  async push(todo: LocalTodoRecord): Promise<RemoteTodoRecord> {
    await sleep(this.delayMs);
    await this.pushGate?.promise;
    const incoming = toRemote(todo);
    const existing = this.rows.get(incoming.id);

    if (
      !existing ||
      Date.parse(incoming.updated_at) >= Date.parse(existing.updated_at)
    ) {
      this.rows.set(incoming.id, incoming);
    }

    return structuredClone(this.rows.get(incoming.id)!);
  }

  async list(): Promise<RemoteTodoRecord[]> {
    await sleep(this.delayMs);
    return [...this.rows.values()]
      .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
      .map((row) => structuredClone(row));
  }
}

describe("concurrent tab synchronization", () => {
  let dbTab1: TodoDb;
  let dbTab2: TodoDb;
  let repoTab1: LocalTodoRepository;
  let repoTab2: LocalTodoRepository;
  let remote: DelayedLwwRemote;
  let ownerKey: ReturnType<typeof ownerKeyForUser>;

  beforeEach(() => {
    // Two tabs share one IndexedDB database but hold independent Dexie and
    // repository instances, exactly like two browser tabs of Todo Pop.
    const dbName = `shared-tabs-${crypto.randomUUID()}`;
    dbTab1 = createTodoDb(dbName);
    dbTab2 = createTodoDb(dbName);
    repoTab1 = new LocalTodoRepository(dbTab1);
    repoTab2 = new LocalTodoRepository(dbTab2);
    remote = new DelayedLwwRemote(1);
    ownerKey = ownerKeyForUser(USER_ID);
  });

  afterEach(async () => {
    dbTab1.close();
    dbTab2.close();
    await dbTab1.delete();
  });

  it("converges two tabs pushing different todos at the same time without duplicates", async () => {
    await repoTab1.add("From tab 1", ownerKey, AT_12);
    await repoTab2.add("From tab 2", ownerKey, AT_12);

    await Promise.all([
      syncTodos(repoTab1, remote, USER_ID),
      syncTodos(repoTab2, remote, USER_ID),
    ]);

    const remoteRows = await remote.list();
    expect(remoteRows.map((row) => row.title).sort()).toEqual([
      "From tab 1",
      "From tab 2",
    ]);

    for (const db of [dbTab1, dbTab2]) {
      const rows = await db.todos.toArray();
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((row) => row.id)).size).toBe(2);
      for (const row of rows) {
        expect(row.syncStatus).toBe("synced");
      }
    }

    await Promise.all([
      syncTodos(repoTab1, remote, USER_ID),
      syncTodos(repoTab2, remote, USER_ID),
    ]);

    for (const db of [dbTab1, dbTab2]) {
      const rows = await db.todos.toArray();
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.syncStatus).toBe("synced");
      }
    }
  });

  it("preserves an edit made in another tab while a push of the same todo is in flight", async () => {
    const gate = new PushGate();

    const todo = await repoTab1.add("Original", ownerKey, AT_12);
    await syncTodos(repoTab1, remote, USER_ID);

    await repoTab1.edit(todo.id, ownerKey, "Tab 1 edit at 13", AT_13);

    // Tab 1's push is in flight and held on the gate...
    remote.holdPushes(gate);
    const syncInFlight = syncTodos(repoTab1, remote, USER_ID);
    // ...while the user edits the same todo from tab 2 (shared IndexedDB).
    await repoTab2.edit(todo.id, ownerKey, "Tab 2 edit during push", AT_13_30);
    gate.open();
    await syncInFlight;

    const duringPush = await dbTab2.todos.get(todo.id);
    expect(duringPush?.title).toBe("Tab 2 edit during push");
    expect(duringPush?.syncStatus).toBe("pending");

    // The preserved edit must win the next sync round and converge everywhere.
    await Promise.all([
      syncTodos(repoTab1, remote, USER_ID),
      syncTodos(repoTab2, remote, USER_ID),
    ]);

    expect((await remote.list())[0].title).toBe("Tab 2 edit during push");
    expect((await dbTab1.todos.get(todo.id))?.title).toBe(
      "Tab 2 edit during push",
    );
    expect((await dbTab2.todos.get(todo.id))?.syncStatus).toBe("synced");
  });

  it("resolves a concurrent delete against an edit by LWW and reconverges both tabs", async () => {
    const todo = await repoTab1.add("Contested", ownerKey, AT_12);

    await repoTab1.softDelete(todo.id, ownerKey, AT_13);
    await repoTab2.edit(todo.id, ownerKey, "Tab 2 edit at 12", AT_12);

    await Promise.all([
      syncTodos(repoTab1, remote, USER_ID),
      syncTodos(repoTab2, remote, USER_ID),
    ]);
    await Promise.all([
      syncTodos(repoTab1, remote, USER_ID),
      syncTodos(repoTab2, remote, USER_ID),
    ]);

    const [remoteRows, rows1, rows2] = await Promise.all([
      remote.list(),
      dbTab1.todos.toArray(),
      dbTab2.todos.toArray(),
    ]);

    // The delete at 13:00 wins over the edit at 12:00; both tabs and the
    // remote must agree on the tombstone.
    expect(remoteRows[0].deleted_at).not.toBeNull();
    expect(rows1[0].deletedAt).not.toBeNull();
    expect(rows2[0].deletedAt).not.toBeNull();
    expect(rows1[0].syncStatus).toBe("synced");
    expect(rows2[0].syncStatus).toBe("synced");
  });
});
