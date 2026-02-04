import { describe, it, expect } from "vitest";
import { selectVisibleTodos, selectCounts } from "./selectors";
import { State } from "./todosReducer";

const state: State = {
  filter: "active",
  todos: [
    { id: "1", title: "A", completed: false, createdAt: 1 },
    { id: "2", title: "B", completed: true, createdAt: 2 },
  ],
};

describe("selectors", () => {
  it("filters active todos", () => {
    const visible = selectVisibleTodos(state);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("1");
  });

  it("computes counts", () => {
    const counts = selectCounts(state);
    expect(counts.all).toBe(2);
    expect(counts.active).toBe(1);
    expect(counts.completed).toBe(1);
  });
});
