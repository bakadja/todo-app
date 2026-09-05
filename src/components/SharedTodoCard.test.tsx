import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SharedTodoCard } from "./SharedTodoCard";

describe("SharedTodoCard", () => {
  it("renders shared content in one editable textarea", () => {
    render(
      <SharedTodoCard
        initialValue={"Guide\nhttps://example.com"}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Shared todo" })).toBeTruthy();
    const editor = screen.getByLabelText("Shared todo content");
    expect(editor.tagName).toBe("TEXTAREA");
    expect((editor as HTMLTextAreaElement).value).toBe(
      "Guide\nhttps://example.com",
    );
  });

  it("sends the edited trimmed value to onAdd", () => {
    const onAdd = vi.fn();
    render(
      <SharedTodoCard
        initialValue="Guide"
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Shared todo content"), {
      target: { value: "  Read Guide later  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add shared todo" }));

    expect(onAdd).toHaveBeenCalledWith("Read Guide later");
  });

  it("cancels without adding", () => {
    const onAdd = vi.fn();
    const onCancel = vi.fn();
    render(
      <SharedTodoCard
        initialValue="Guide"
        onAdd={onAdd}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel shared todo" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("does not add whitespace-only content", () => {
    const onAdd = vi.fn();
    render(
      <SharedTodoCard initialValue="Guide" onAdd={onAdd} onCancel={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("Shared todo content"), {
      target: { value: "   " },
    });

    const addButton = screen.getByRole("button", { name: "Add shared todo" });
    expect((addButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(addButton);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
