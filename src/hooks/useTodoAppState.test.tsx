import "fake-indexeddb/auto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTodoDb,
  ownerKeyForUser,
  type OwnerKey,
  type TodoDb,
} from "../storage/todoDb";
import { LocalTodoRepository } from "../storage/todoRepository";
import { useTodoAppState } from "./useTodoAppState";

describe("useTodoAppState", () => {
  let db: TodoDb;
  let repository: LocalTodoRepository;

  beforeEach(() => {
    localStorage.clear();
    db = createTodoDb(`todo-hook-${crypto.randomUUID()}`);
    repository = new LocalTodoRepository(db);
  });

  afterEach(async () => {
    db.close();
    await db.delete();
    localStorage.clear();
  });

  it("hydrates a legacy todo after migration", async () => {
    localStorage.setItem(
      "todos_app_v1",
      JSON.stringify({
        todos: [
          {
            id: "legacy-1",
            title: "Existing task",
            completed: true,
            createdAt: 1234,
          },
        ],
        filter: "active",
      }),
    );

    const { result } = renderHook(() =>
      useTodoAppState("anonymous", repository, db),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.state.todos).toEqual([
      {
        id: "legacy-1",
        title: "Existing task",
        completed: true,
        createdAt: 1234,
      },
    ]);
    expect(result.current.state.filter).toBe("active");
  });

  it("persists an added todo across unmount and remount", async () => {
    const first = renderHook(() =>
      useTodoAppState("anonymous", repository, db),
    );
    await waitFor(() => expect(first.result.current.loading).toBe(false));

    await act(async () => {
      await first.result.current.add("Persist me");
    });
    const id = first.result.current.state.todos[0].id;
    first.unmount();

    const second = renderHook(() =>
      useTodoAppState("anonymous", repository, db),
    );
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(second.result.current.state.todos[0]).toMatchObject({
      id,
      title: "Persist me",
      completed: false,
    });
  });

  it("persists toggle and edit changes", async () => {
    const { result } = renderHook(() =>
      useTodoAppState("anonymous", repository, db),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add("Before");
    });
    const id = result.current.state.todos[0].id;

    await act(async () => {
      await result.current.toggle(id);
      await result.current.edit(id, "After");
    });

    expect(await repository.get(id)).toMatchObject({
      title: "After",
      completed: true,
      syncStatus: "pending",
    });
    expect(result.current.state.todos[0]).toMatchObject({
      title: "After",
      completed: true,
    });
  });

  it("soft deletes locally while retaining the tombstone in IndexedDB", async () => {
    const { result } = renderHook(() =>
      useTodoAppState("anonymous", repository, db),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add("Delete me");
    });
    const id = result.current.state.todos[0].id;

    await act(async () => {
      await result.current.remove(id);
    });

    expect(result.current.state.todos).toEqual([]);
    expect((await repository.get(id))?.deletedAt).not.toBeNull();
  });

  it("keeps filter preference across remount", async () => {
    const first = renderHook(() =>
      useTodoAppState("anonymous", repository, db),
    );
    await waitFor(() => expect(first.result.current.loading).toBe(false));

    act(() => {
      first.result.current.setFilter("completed");
    });
    first.unmount();

    const second = renderHook(() =>
      useTodoAppState("anonymous", repository, db),
    );
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(second.result.current.state.filter).toBe("completed");
  });

  it("refreshes visible todos when the owner changes", async () => {
    const userOwner = ownerKeyForUser("11111111-1111-1111-1111-111111111111");
    await repository.add("Anonymous task", "anonymous", 1000);
    await repository.add("User task", userOwner, 2000);

    const { result, rerender } = renderHook(
      ({ owner }: { owner: OwnerKey }) =>
        useTodoAppState(owner, repository, db),
      { initialProps: { owner: "anonymous" as OwnerKey } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.state.todos.map((todo) => todo.title)).toEqual([
      "Anonymous task",
    ]);

    rerender({ owner: userOwner });

    await waitFor(() =>
      expect(result.current.state.todos.map((todo) => todo.title)).toEqual([
        "User task",
      ]),
    );
  });
});
