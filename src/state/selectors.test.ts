import { describe, it, expect } from "vitest";
import { selectVisibleTodos, selectCounts } from "./selectors";
import type { State } from "./todosReducer";

type TestPriorityFilter = "all" | "high" | "medium" | "low" | "none";

const state: State & { priorityFilter: TestPriorityFilter } = {
  filter: "active",
  priorityFilter: "all",
  todos: [
    { id: "1", title: "A", completed: false, priority: "high", createdAt: 1 },
    { id: "2", title: "B", completed: true, priority: null, createdAt: 2 },
    { id: "3", title: "C", completed: false, priority: "medium", createdAt: 3 },
    { id: "4", title: "D", completed: true, priority: "high", createdAt: 4 },
    { id: "5", title: "E", completed: false, priority: "low", createdAt: 5 },
  ],
};

describe("selectors", () => {
  it("filters active todos when all priorities are selected", () => {
    const visible = selectVisibleTodos(state);
    expect(visible.map((todo) => todo.id)).toEqual(["1", "3", "5"]);
  });

  it("combines the active status filter with high priority", () => {
    const visible = selectVisibleTodos({ ...state, priorityFilter: "high" });
    expect(visible.map((todo) => todo.id)).toEqual(["1"]);
  });

  it("combines the completed status filter with high priority", () => {
    const visible = selectVisibleTodos({
      ...state,
      filter: "completed",
      priorityFilter: "high",
    });
    expect(visible.map((todo) => todo.id)).toEqual(["4"]);
  });

  it("filters medium priority todos", () => {
    const visible = selectVisibleTodos({
      ...state,
      filter: "all",
      priorityFilter: "medium",
    });
    expect(visible.map((todo) => todo.id)).toEqual(["3"]);
  });

  it("filters low priority todos", () => {
    const visible = selectVisibleTodos({
      ...state,
      filter: "all",
      priorityFilter: "low",
    });
    expect(visible.map((todo) => todo.id)).toEqual(["5"]);
  });

  it("filters todos with no priority", () => {
    const visible = selectVisibleTodos({
      ...state,
      filter: "all",
      priorityFilter: "none",
    });
    expect(visible.map((todo) => todo.id)).toEqual(["2"]);
  });

  it("computes status counts without considering priority", () => {
    const counts = selectCounts({ ...state, priorityFilter: "high" });
    expect(counts.all).toBe(5);
    expect(counts.active).toBe(3);
    expect(counts.completed).toBe(2);
  });
});
