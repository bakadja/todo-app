import { describe, it, expect, beforeEach } from "vitest";
import { loadState, saveState } from "./localStorage";

const key = "test_key";

type MockStorage = Storage & { _data: Map<string, string> };

const createMockStorage = (): MockStorage => {
  const store = new Map<string, string>();
  return {
    _data: store,
    getItem(k) {
      return store.get(k) ?? null;
    },
    setItem(k, v) {
      store.set(k, v);
    },
    removeItem(k) {
      store.delete(k);
    },
    clear() {
      store.clear();
    },
    key() {
      return null;
    },
    get length() {
      return store.size;
    },
  } as MockStorage;
};

describe("localStorage utils", () => {
  beforeEach(() => {
    globalThis.localStorage = createMockStorage();
  });

  it("saves and loads state", () => {
    saveState(key, { ok: true });
    const loaded = loadState<{ ok: boolean }>(key, { ok: false });
    expect(loaded.ok).toBe(true);
  });
});
