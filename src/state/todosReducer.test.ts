import { describe, expect, it } from "vitest";
import { defaultState, reducer, type State, type Todo } from "./todosReducer";

const todoA: Todo = {
  id: "todo-a",
  title: "First",
  completed: false,
  priority: "high",
  createdAt: 1000,
};

const todoB: Todo = {
  id: "todo-b",
  title: "Second",
  completed: true,
  priority: null,
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
    const edited = { ...todoA, title: "Edited", priority: "medium" as const };
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

  it("defaults the priority filter to all", () => {
    expect((defaultState as State & { priorityFilter?: string }).priorityFilter).toBe(
      "all",
    );
  });

  it("changes the local priority filter", () => {
    const next = reducer(
      defaultState,
      { type: "setPriorityFilter", priorityFilter: "high" } as never,
    );
    expect((next as State & { priorityFilter?: string }).priorityFilter).toBe(
      "high",
    );
  });
});
