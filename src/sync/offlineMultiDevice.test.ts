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
const AT_10 = Date.parse("2026-09-04T10:00:00.000Z");
const AT_11 = Date.parse("2026-09-04T11:00:00.000Z");
const AT_12 = Date.parse("2026-09-04T12:00:00.000Z");
const AT_13 = Date.parse("2026-09-04T13:00:00.000Z");

function toRemote(todo: LocalTodoRecord): RemoteTodoRecord {
  return {
    id: todo.id,
    user_id: USER_ID,
    title: todo.title,
    completed: todo.completed,
    created_at: new Date(todo.createdAt).toISOString(),
    updated_at: new Date(todo.updatedAt).toISOString(),
    deleted_at: todo.deletedAt === null ? null : new Date(todo.deletedAt).toISOString(),
  };
}

class InMemoryLwwRemote implements TodoRemote {
  private readonly rows = new Map<string, RemoteTodoRecord>();

  async push(todo: LocalTodoRecord): Promise<RemoteTodoRecord> {
    const incoming = toRemote(todo);
    const existing = this.rows.get(incoming.id);

    if (!existing || Date.parse(incoming.updated_at) >= Date.parse(existing.updated_at)) {
      this.rows.set(incoming.id, incoming);
    }

    return this.rows.get(incoming.id)!;
  }

  async list(): Promise<RemoteTodoRecord[]> {
    return [...this.rows.values()].sort(
      (a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at),
    );
  }
}

describe("offline multi-device synchronization", () => {
  let dbA: TodoDb;
  let dbB: TodoDb;
  let repoA: LocalTodoRepository;
  let repoB: LocalTodoRepository;
  let remote: InMemoryLwwRemote;

  beforeEach(() => {
    dbA = createTodoDb(`device-a-${crypto.randomUUID()}`);
    dbB = createTodoDb(`device-b-${crypto.randomUUID()}`);
    repoA = new LocalTodoRepository(dbA);
    repoB = new LocalTodoRepository(dbB);
    remote = new InMemoryLwwRemote();
  });

  afterEach(async () => {
    dbA.close();
    dbB.close();
    await dbA.delete();
    await dbB.delete();
  });

  it("converges two offline devices on the newest edit and propagates a tombstone without duplicating the todo", async () => {
    const ownerKey = ownerKeyForUser(USER_ID);

    const createdOnA = await repoA.add("X at 10", ownerKey, AT_10);
    await syncTodos(repoA, remote, USER_ID);

    await syncTodos(repoB, remote, USER_ID);
    expect(await repoB.listVisible(ownerKey)).toHaveLength(1);
    expect((await repoB.listVisible(ownerKey))[0].id).toBe(createdOnA.id);

    await repoA.edit(createdOnA.id, ownerKey, "A edit at 11", AT_11);
    await repoB.edit(createdOnA.id, ownerKey, "B edit at 12", AT_12);

    await syncTodos(repoB, remote, USER_ID);
    await syncTodos(repoA, remote, USER_ID);
    await syncTodos(repoB, remote, USER_ID);

    const visibleA = await repoA.listVisible(ownerKey);
    const visibleB = await repoB.listVisible(ownerKey);

    expect(visibleA).toHaveLength(1);
    expect(visibleB).toHaveLength(1);
    expect(visibleA[0]).toMatchObject({ id: createdOnA.id, title: "B edit at 12" });
    expect(visibleB[0]).toMatchObject({ id: createdOnA.id, title: "B edit at 12" });
    expect(await dbA.todos.count()).toBe(1);
    expect(await dbB.todos.count()).toBe(1);

    await repoA.softDelete(createdOnA.id, ownerKey, AT_13);
    await syncTodos(repoA, remote, USER_ID);
    await syncTodos(repoB, remote, USER_ID);

    expect(await repoA.listVisible(ownerKey)).toEqual([]);
    expect(await repoB.listVisible(ownerKey)).toEqual([]);
    expect((await repoA.get(createdOnA.id))?.deletedAt).toBe(AT_13);
    expect((await repoB.get(createdOnA.id))?.deletedAt).toBe(AT_13);
    expect(await dbA.todos.count()).toBe(1);
    expect(await dbB.todos.count()).toBe(1);
  });
});
