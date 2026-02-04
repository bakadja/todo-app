import { describe, it, expect } from "vitest";
import { reducer, defaultState } from "./todosReducer";

describe("todosReducer", () => {
  it("adds a todo", () => {
    const next = reducer(defaultState, { type: "add", title: "Write plan" });
    expect(next.todos).toHaveLength(1);
    expect(next.todos[0].title).toBe("Write plan");
  });

  it("toggles a todo", () => {
    const withOne = reducer(defaultState, { type: "add", title: "Toggle me" });
    const id = withOne.todos[0].id;
    const toggled = reducer(withOne, { type: "toggle", id });
    expect(toggled.todos[0].completed).toBe(true);
  });
});
