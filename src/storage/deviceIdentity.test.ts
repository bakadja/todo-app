import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodoDb, type TodoDb } from "./todoDb";
import { LocalTodoRepository } from "./todoRepository";
import {
  clearActiveUserId,
  getActiveUserId,
  setActiveUserId,
} from "./deviceIdentity";

describe("deviceIdentity", () => {
  let db: TodoDb;

  beforeEach(() => {
    db = createTodoDb(`device-identity-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("sets, gets, and clears the active user id", async () => {
    await setActiveUserId("user-1", db);
    expect(await getActiveUserId(db)).toBe("user-1");

    await clearActiveUserId(db);
    expect(await getActiveUserId(db)).toBeNull();
  });

  it("does not delete todo rows when the active pointer is cleared", async () => {
    const repository = new LocalTodoRepository(db);
    await repository.add("Keep me", "anonymous", 1000);
    await setActiveUserId("user-1", db);

    await clearActiveUserId(db);

    expect(await db.todos.count()).toBe(1);
  });
});
