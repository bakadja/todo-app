import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Filters } from "./Filters";

afterEach(cleanup);

describe("Filters", () => {
  it("renders separate status and priority filter groups", () => {
    const onChange = vi.fn();
    const onPriorityChange = vi.fn();
    const priorityProps = {
      priorityFilter: "all",
      onPriorityChange,
    } as Record<string, unknown>;

    render(
      <Filters
        filter="all"
        counts={{ all: 4, active: 2, completed: 2 }}
        onChange={onChange}
        {...priorityProps}
      />,
    );

    const statusGroup = screen.getByRole("group", { name: "Status filter" });
    expect(within(statusGroup).getByRole("button", { name: /All 4/ })).toBeTruthy();
    expect(within(statusGroup).getByRole("button", { name: /Active 2/ })).toBeTruthy();
    expect(within(statusGroup).getByRole("button", { name: /Done 2/ })).toBeTruthy();

    const priorityGroup = screen.getByRole("group", { name: "Priority filter" });
    expect(
      within(priorityGroup).getByRole("button", { name: "All priorities" }),
    ).toBeTruthy();
    expect(within(priorityGroup).getByRole("button", { name: "High" })).toBeTruthy();
    expect(within(priorityGroup).getByRole("button", { name: "Medium" })).toBeTruthy();
    expect(within(priorityGroup).getByRole("button", { name: "Low" })).toBeTruthy();
    expect(within(priorityGroup).getByRole("button", { name: "None" })).toBeTruthy();
  });

  it("changes priority without changing the status filter", () => {
    const onChange = vi.fn();
    const onPriorityChange = vi.fn();
    const priorityProps = {
      priorityFilter: "all",
      onPriorityChange,
    } as Record<string, unknown>;

    render(
      <Filters
        filter="active"
        counts={{ all: 4, active: 2, completed: 2 }}
        onChange={onChange}
        {...priorityProps}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "High" }));

    expect(onPriorityChange).toHaveBeenCalledWith("high");
    expect(onChange).not.toHaveBeenCalled();
  });
});
