import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UndoSnackbar } from "./UndoSnackbar";

afterEach(cleanup);

describe("UndoSnackbar", () => {
  it("offers one accessible Undo action for a removed todo", () => {
    const onUndo = vi.fn();

    render(<UndoSnackbar onUndo={onUndo} />);

    expect(screen.getByText("Todo removed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
