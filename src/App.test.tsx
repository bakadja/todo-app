import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const add = vi.fn(async () => undefined);
const toggle = vi.fn(async () => undefined);
const edit = vi.fn(async () => undefined);
const remove = vi.fn(async () => undefined);
const restore = vi.fn(async () => undefined);
const setFilter = vi.fn();
const requestSync = vi.fn(async () => undefined);
const refresh = vi.fn(async () => undefined);
const mockUseAuth = vi.fn();
const mockUseTodoAppState = vi.fn();
const mockUseTodoSync = vi.fn();

vi.mock("./auth/AuthContext", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("./hooks/useTodoAppState", () => ({
  useTodoAppState: (...args: unknown[]) => mockUseTodoAppState(...args),
}));
vi.mock("./hooks/useTodoSync", () => ({
  useTodoSync: (...args: unknown[]) => mockUseTodoSync(...args),
}));
vi.mock("./components/AuthPanel", () => ({
  AuthPanel: () => <div>Auth panel</div>,
}));

const baseLocalState = {
  state: { todos: [], filter: "all" as const },
  loading: false,
  add,
  toggle,
  edit,
  remove,
  restore,
  setFilter,
  refresh,
};

const undoTodos = [
  {
    id: "todo-a",
    title: "Todo A",
    completed: false,
    createdAt: 2000,
  },
  {
    id: "todo-b",
    title: "Todo B",
    completed: false,
    createdAt: 1000,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: null, localUserId: null });
  mockUseTodoAppState.mockReturnValue(baseLocalState);
  mockUseTodoSync.mockReturnValue({
    status: "idle",
    lastError: null,
    requestSync,
  });
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("App share target", () => {
  it("shows a namespaced share and consumes only its query params", () => {
    window.history.replaceState(
      {},
      "",
      "/?share_title=Guide&share_url=https%3A%2F%2Fexample.com&filter=active",
    );

    render(<App />);

    expect(
      (screen.getByLabelText("Shared todo content") as HTMLTextAreaElement).value,
    ).toBe("Guide\nhttps://example.com");
    expect(window.location.search).toBe("?filter=active");
  });

  it("does not show a share card when no namespaced share params exist", () => {
    window.history.replaceState({}, "", "/?filter=active");

    render(<App />);

    expect(screen.queryByLabelText("Shared todo content")).toBeNull();
    expect(window.location.search).toBe("?filter=active");
  });

  it("ignores ordinary title/url parameters", () => {
    window.history.replaceState(
      {},
      "",
      "/?title=Normal&url=https%3A%2F%2Fexample.com",
    );

    render(<App />);

    expect(screen.queryByLabelText("Shared todo content")).toBeNull();
  });

  it("adds shared text through existing add and sync handlers", async () => {
    window.history.replaceState({}, "", "/?share_title=Guide");

    render(<App />);
    fireEvent.change(screen.getByLabelText("Shared todo content"), {
      target: { value: "Read Guide tonight" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add shared todo" }));

    expect(screen.queryByLabelText("Shared todo content")).toBeNull();
    await waitFor(() => expect(add).toHaveBeenCalledWith("Read Guide tonight"));
    await waitFor(() => expect(requestSync).toHaveBeenCalledTimes(1));
  });

  it("cancels without adding or syncing", () => {
    window.history.replaceState({}, "", "/?share_title=Guide");

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel shared todo" }));

    expect(add).not.toHaveBeenCalled();
    expect(requestSync).not.toHaveBeenCalled();
  });

  it("does not recreate a consumed draft after remount", () => {
    window.history.replaceState({}, "", "/?share_title=Guide");

    const first = render(<App />);
    expect(screen.getByLabelText("Shared todo content")).toBeTruthy();
    first.unmount();

    render(<App />);
    expect(screen.queryByLabelText("Shared todo content")).toBeNull();
  });
});

describe("App undo delete", () => {
  beforeEach(() => {
    mockUseTodoAppState.mockReturnValue({
      ...baseLocalState,
      state: { todos: undoTodos, filter: "all" as const },
    });
  });

  it("syncs a delete immediately and restores the same todo on Undo", async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Todo A" }));
      await Promise.resolve();
    });

    expect(remove).toHaveBeenCalledWith("todo-a");
    expect(requestSync).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Todo removed")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      await Promise.resolve();
    });

    expect(restore).toHaveBeenCalledWith("todo-a");
    expect(requestSync).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("expires the Undo action after 5 seconds", async () => {
    vi.useFakeTimers();
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Todo A" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();

    act(() => vi.advanceTimersByTime(4999));
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("lets only the latest deletion be undone and restarts the timer", async () => {
    vi.useFakeTimers();
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Todo A" }));
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(4000));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Todo B" }));
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(1001));

    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      await Promise.resolve();
    });

    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith("todo-b");
  });
});
