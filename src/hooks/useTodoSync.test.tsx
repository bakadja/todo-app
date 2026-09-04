import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTodoSync, type TodoSyncRunner } from "./useTodoSync";

const USER_ID = "11111111-1111-1111-1111-111111111111";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("useTodoSync", () => {
  beforeEach(() => setOnline(true));
  afterEach(() => vi.restoreAllMocks());

  it("does not contact cloud without a signed-in user", async () => {
    const runner = vi.fn<TodoSyncRunner>();
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useTodoSync(null, refresh, runner));

    await act(async () => result.current.requestSync());
    expect(runner).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("syncs on signed-in online startup and refreshes local state", async () => {
    const runner = vi.fn<TodoSyncRunner>().mockResolvedValue({
      pushed: 1,
      pulled: 0,
      errors: 0,
    });
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useTodoSync(USER_ID, refresh, runner),
    );

    await waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe("idle");
  });

  it("stays offline and skips cloud when startup has no network", async () => {
    setOnline(false);
    const runner = vi.fn<TodoSyncRunner>();
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useTodoSync(USER_ID, refresh, runner),
    );

    await waitFor(() => expect(result.current.status).toBe("offline"));
    expect(runner).not.toHaveBeenCalled();
  });

  it("syncs when the browser comes back online", async () => {
    setOnline(false);
    const runner = vi.fn<TodoSyncRunner>().mockResolvedValue({
      pushed: 0,
      pulled: 1,
      errors: 0,
    });
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useTodoSync(USER_ID, refresh, runner));

    setOnline(true);
    act(() => window.dispatchEvent(new Event("online")));

    await waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
  });

  it("syncs when the window regains focus", async () => {
    const runner = vi.fn<TodoSyncRunner>().mockResolvedValue({
      pushed: 0,
      pulled: 0,
      errors: 0,
    });
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useTodoSync(USER_ID, refresh, runner));
    await waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
    runner.mockClear();

    act(() => window.dispatchEvent(new Event("focus")));

    await waitFor(() => expect(runner).toHaveBeenCalledTimes(1));
  });

  it("shows error status when sync reports errors", async () => {
    const runner = vi.fn<TodoSyncRunner>().mockResolvedValue({
      pushed: 0,
      pulled: 0,
      errors: 1,
    });
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useTodoSync(USER_ID, refresh, runner),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.lastError).toBeTruthy();
  });

  it("coalesces requests during an in-flight sync into one follow-up run", async () => {
    const first = deferred<{ pushed: number; pulled: number; errors: number }>();
    const runner = vi
      .fn<TodoSyncRunner>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue({ pushed: 0, pulled: 0, errors: 0 });
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useTodoSync(USER_ID, refresh, runner),
    );
    await waitFor(() => expect(runner).toHaveBeenCalledTimes(1));

    await act(async () => {
      void result.current.requestSync();
      void result.current.requestSync();
    });
    expect(runner).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve({ pushed: 1, pulled: 0, errors: 0 });
      await first.promise;
    });

    await waitFor(() => expect(runner).toHaveBeenCalledTimes(2));
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("does not refresh a signed-out owner's local state when an older sync finishes", async () => {
    const first = deferred<{ pushed: number; pulled: number; errors: number }>();
    const runner = vi.fn<TodoSyncRunner>().mockImplementation(() => first.promise);
    const signedInRefresh = vi.fn().mockResolvedValue(undefined);
    const signedOutRefresh = vi.fn().mockResolvedValue(undefined);

    const { rerender } = renderHook(
      ({ userId, refresh }: { userId: string | null; refresh: () => Promise<void> }) =>
        useTodoSync(userId, refresh, runner),
      {
        initialProps: { userId: USER_ID, refresh: signedInRefresh },
      },
    );

    await waitFor(() => expect(runner).toHaveBeenCalledTimes(1));

    rerender({ userId: null, refresh: signedOutRefresh });

    await act(async () => {
      first.resolve({ pushed: 1, pulled: 0, errors: 0 });
      await first.promise;
    });

    expect(signedInRefresh).not.toHaveBeenCalled();
    expect(signedOutRefresh).not.toHaveBeenCalled();
  });
});