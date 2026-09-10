import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

describe("TodoItem", () => {
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
