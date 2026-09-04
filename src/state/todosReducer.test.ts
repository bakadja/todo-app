import { describe, expect, it } from "vitest";
import { defaultState, reducer, type Todo } from "./todosReducer";

const todoA: Todo = {
  id: "todo-a",
  title: "First",
  completed: false,
  createdAt: 1000,
};

const todoB: Todo = {
  id: "todo-b",
  title: "Second",
  completed: true,
  createdAt: 2000,
};

describe("todosReducer", () => {
  it("hydrates todos returned by the repository", () => {
    const next = reducer(defaultState, { type: "hydrate", todos: [todoA, todoB] });
    expect(next.todos).toEqual([todoA, todoB]);
  });

  it("inserts an upserted todo that is not present", () => {
    const next = reducer(defaultState, { type: "upsert", todo: todoA });
    expect(next.todos).toEqual([todoA]);
  });

  it("updates an upserted todo that is already present", () => {
    const hydrated = reducer(defaultState, { type: "hydrate", todos: [todoA] });
    const edited = { ...todoA, title: "Edited" };
    const next = reducer(hydrated, { type: "upsert", todo: edited });
    expect(next.todos).toEqual([edited]);
  });

  it("removes a todo", () => {
    const hydrated = reducer(defaultState, { type: "hydrate", todos: [todoA, todoB] });
    const next = reducer(hydrated, { type: "remove", id: todoA.id });
    expect(next.todos).toEqual([todoB]);
  });

  it("changes the local filter", () => {
    const next = reducer(defaultState, { type: "setFilter", filter: "completed" });
    expect(next.filter).toBe("completed");
  });
});
