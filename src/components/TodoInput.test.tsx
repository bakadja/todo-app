import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodoInput } from "./TodoInput";

afterEach(cleanup);

describe("TodoInput priority", () => {
  it("adds a todo with no priority by default", () => {
    const onAdd = vi.fn();
    render(<TodoInput onAdd={onAdd} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Add a task" }), {
      target: { value: "Buy milk" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onAdd).toHaveBeenCalledWith("Buy milk", null);
  });

  it("adds the selected priority and resets it after submit", () => {
    const onAdd = vi.fn();
    render(<TodoInput onAdd={onAdd} />);

    const priority = screen.getByLabelText("New todo priority");
    fireEvent.change(priority, { target: { value: "high" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Add a task" }), {
      target: { value: "Prepare interview" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onAdd).toHaveBeenCalledWith("Prepare interview", "high");
    expect((priority as HTMLSelectElement).value).toBe("");
  });
});
