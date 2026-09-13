import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodoItem } from "./TodoItem";

const longTitle =
  "brainstormmer avec gpt quel est le meilleure hardware au cas ou je vais reprendre les etudes et surtout je veux un systeme automatise";

const todo = {
  id: "todo-1",
  title: longTitle,
  completed: false,
  priority: "high" as const,
  createdAt: 1,
};

afterEach(cleanup);

describe("TodoItem", () => {
  it("bounds the edit textarea to the maximum todo title length", () => {
    render(
      <TodoItem
        todo={{ id: "t1", title: "Task", completed: false, priority: null, createdAt: 1000 }}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getByLabelText("Edit todo") as HTMLTextAreaElement;
    expect(editor.maxLength).toBe(200);
  });

it("keeps the editor open with an error when committing an oversized legacy title", () => {
    const onEdit = vi.fn();
    render(
      <TodoItem
        todo={{ id: "t1", title: "x".repeat(250), completed: false, priority: null, createdAt: 1000 }}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onEdit={onEdit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert").textContent).toMatch(
      /must be at most 200/,
    );
    expect(screen.getByLabelText("Edit todo")).toBeTruthy();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("uses a multiline editor for long todo titles", () => {
    render(
      <TodoItem
        todo={todo}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const editor = screen.getByLabelText("Edit todo");
    expect(editor.tagName).toBe("TEXTAREA");
    expect((editor as HTMLTextAreaElement).value).toBe(longTitle);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("shows the priority badge and allows removing priority while editing", () => {
    const onEdit = vi.fn();
    render(
      <TodoItem
        todo={todo}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onEdit={onEdit}
      />,
    );

    expect(screen.getByText("High")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const priority = screen.getByLabelText("Edit todo priority");
    expect((priority as HTMLSelectElement).value).toBe("high");
    fireEvent.change(priority, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onEdit).toHaveBeenCalledWith("todo-1", longTitle, null);
  });
});
