import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const add = vi.fn(async () => undefined);
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
  toggle: vi.fn(async () => undefined),
  edit: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
  setFilter: vi.fn(),
  refresh,
};

afterEach(cleanup);

describe("App share target", () => {
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

  it("shows a marked share and consumes only its query params", () => {
    window.history.replaceState(
      {},
      "",
      "/?share-target=1&title=Guide&url=https%3A%2F%2Fexample.com&filter=active",
    );

    render(<App />);

    expect(
      (screen.getByLabelText("Shared todo content") as HTMLTextAreaElement).value,
    ).toBe("Guide\nhttps://example.com");
    expect(window.location.search).toBe("?filter=active");
  });

  it("cleans even an empty marked share without showing a card", () => {
    window.history.replaceState({}, "", "/?share-target=1&filter=active");

    render(<App />);

    expect(screen.queryByLabelText("Shared todo content")).toBeNull();
    expect(window.location.search).toBe("?filter=active");
  });

  it("ignores unmarked title/url parameters", () => {
    window.history.replaceState(
      {},
      "",
      "/?title=Normal&url=https%3A%2F%2Fexample.com",
    );

    render(<App />);

    expect(screen.queryByLabelText("Shared todo content")).toBeNull();
  });

  it("adds shared text through existing add and sync handlers", async () => {
    window.history.replaceState({}, "", "/?share-target=1&title=Guide");

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
    window.history.replaceState({}, "", "/?share-target=1&title=Guide");

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel shared todo" }));

    expect(add).not.toHaveBeenCalled();
    expect(requestSync).not.toHaveBeenCalled();
  });

  it("does not recreate a consumed draft after remount", () => {
    window.history.replaceState({}, "", "/?share-target=1&title=Guide");

    const first = render(<App />);
    expect(screen.getByLabelText("Shared todo content")).toBeTruthy();
    first.unmount();

    render(<App />);
    expect(screen.queryByLabelText("Shared todo content")).toBeNull();
  });
});
