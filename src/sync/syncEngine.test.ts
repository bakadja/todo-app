import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTodoDb,
  ownerKeyForUser,
  type LocalTodoRecord,
  type TodoDb,
} from "../storage/todoDb";
import { LocalTodoRepository } from "../storage/todoRepository";
import type { RemoteTodoRecord, TodoRemote } from "./types";
import { syncTodos } from "./syncEngine";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OWNER = ownerKeyForUser(USER_ID);

function toRemote(todo: LocalTodoRecord): RemoteTodoRecord {
  return {
    id: todo.id,
    user_id: USER_ID,
    title: todo.title,
    completed: todo.completed,
    created_at: new Date(todo.createdAt).toISOString(),
    updated_at: new Date(todo.updatedAt).toISOString(),
    deleted_at:
      todo.deletedAt === null ? null : new Date(todo.deletedAt).toISOString(),
  };
}

class MemoryRemote implements TodoRemote {
  readonly rows = new Map<string, RemoteTodoRecord>();
  readonly pushCalls: LocalTodoRecord[] = [];
  readonly failIds = new Set<string>();

  async push(todo: LocalTodoRecord): Promise<RemoteTodoRecord> {
    this.pushCalls.push({ ...todo });
    if (this.failIds.has(todo.id)) throw new Error("push failed");

    const incoming = toRemote(todo);
    const existing = this.rows.get(todo.id);
    if (
      !existing ||
      Date.parse(incoming.updated_at) >= Date.parse(existing.updated_at)
    ) {
      this.rows.set(todo.id, incoming);
    }
    return this.rows.get(todo.id)!;
  }

  async list(): Promise<RemoteTodoRecord[]> {
    return [...this.rows.values()].sort(
      (a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at),
    );
  }
}

describe("syncTodos", () => {
  let db: TodoDb;
  let repository: LocalTodoRepository;
  let remote: MemoryRemote;

  beforeEach(() => {
    db = createTodoDb(`sync-engine-${crypto.randomUUID()}`);
    repository = new LocalTodoRepository(db);
    remote = new MemoryRemote();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("claims anonymous rows before authenticated push", async () => {
    const todo = await repository.add("Anonymous", "anonymous", 1000);

    await syncTodos(repository, remote, USER_ID);

    expect(remote.pushCalls).toHaveLength(1);
    expect(remote.pushCalls[0].ownerKey).toBe(OWNER);
    expect((await repository.get(todo.id))?.ownerKey).toBe(OWNER);
  });

  it("pushes a pending row and stores the canonical synced row", async () => {
    const todo = await repository.add("Pending", OWNER, 1000);

    const result = await syncTodos(repository, remote, USER_ID);

    expect(result.pushed).toBe(1);
    expect(await repository.get(todo.id)).toMatchObject({
      title: "Pending",
      syncStatus: "synced",
      lastSyncError: null,
    });
  });

  it("retries a syncing row after a simulated crash", async () => {
    const todo = await repository.add("Crash retry", OWNER, 1000);
    await repository.markSyncing(todo.id);

    await syncTodos(repository, remote, USER_ID);

    expect(remote.pushCalls.map((row) => row.id)).toContain(todo.id);
    expect((await repository.get(todo.id))?.syncStatus).toBe("synced");
  });

  it("retries an error row", async () => {
    const todo = await repository.add("Error retry", OWNER, 1000);
    await repository.markError(todo.id, "old failure");

    await syncTodos(repository, remote, USER_ID);

    expect(remote.pushCalls.map((row) => row.id)).toContain(todo.id);
    expect((await repository.get(todo.id))?.syncStatus).toBe("synced");
  });

  it("preserves a local mutation and records a push error", async () => {
    const todo = await repository.add("Keep local", OWNER, 1000);
    remote.failIds.add(todo.id);

    const result = await syncTodos(repository, remote, USER_ID);

    expect(result.errors).toBe(1);
    expect(await repository.get(todo.id)).toMatchObject({
      title: "Keep local",
      syncStatus: "error",
      lastSyncError: "push failed",
    });
  });

  it("pulls a remote row missing locally", async () => {
    remote.rows.set("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      user_id: USER_ID,
      title: "Remote only",
      completed: false,
      created_at: new Date(1000).toISOString(),
      updated_at: new Date(2000).toISOString(),
      deleted_at: null,
    });

    const result = await syncTodos(repository, remote, USER_ID);

    expect(result.pulled).toBe(1);
    expect((await repository.listVisible(OWNER))[0].title).toBe("Remote only");
  });

  it("stores a remote tombstone but hides it from visible todos", async () => {
    const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    remote.rows.set(id, {
      id,
      user_id: USER_ID,
      title: "Deleted remotely",
      completed: false,
      created_at: new Date(1000).toISOString(),
      updated_at: new Date(3000).toISOString(),
      deleted_at: new Date(3000).toISOString(),
    });

    await syncTodos(repository, remote, USER_ID);

    expect(await repository.listVisible(OWNER)).toEqual([]);
    expect(await repository.get(id)).toMatchObject({
      deletedAt: 3000,
      syncStatus: "synced",
    });
  });

  it("does not let a pull overwrite a retryable local row", async () => {
    const todo = await repository.add("Local wins for now", OWNER, 2000);
    remote.failIds.add(todo.id);
    remote.rows.set(todo.id, {
      ...toRemote(todo),
      title: "Remote copy",
      updated_at: new Date(3000).toISOString(),
    });

    await syncTodos(repository, remote, USER_ID);

    expect(await repository.get(todo.id)).toMatchObject({
      title: "Local wins for now",
      syncStatus: "error",
    });
  });

  it("keeps one local row across duplicate UUID retry", async () => {
    const todo = await repository.add("One row", OWNER, 1000);
    await repository.markSyncing(todo.id);

    await syncTodos(repository, remote, USER_ID);
    await repository.markError(todo.id, "retry once more");
    await syncTodos(repository, remote, USER_ID);

    expect(await db.todos.where("id").equals(todo.id).count()).toBe(1);
  });

  it("stores the newer remote canonical winner after pushing an older local row", async () => {
    const todo = await repository.add("Older local", OWNER, 1000);
    remote.rows.set(todo.id, {
      ...toRemote(todo),
      title: "Newer remote",
      completed: true,
      updated_at: new Date(2000).toISOString(),
    });

    await syncTodos(repository, remote, USER_ID);

    expect(await repository.get(todo.id)).toMatchObject({
      title: "Newer remote",
      completed: true,
      updatedAt: 2000,
      syncStatus: "synced",
    });
  });
});
