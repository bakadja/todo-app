import { beforeEach, describe, expect, it } from "vitest";
import {
  loadFilterPreference,
  saveFilterPreference,
} from "./filterPreference";

type MockStorage = Storage & { _data: Map<string, string> };

const createMockStorage = (): MockStorage => {
  const store = new Map<string, string>();
  return {
    _data: store,
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  } as MockStorage;
};

describe("filterPreference", () => {
  beforeEach(() => {
    globalThis.localStorage = createMockStorage();
  });

  it("stores and reloads a valid filter", () => {
    saveFilterPreference("completed");
    expect(loadFilterPreference()).toBe("completed");
  });

  it("falls back to all when no valid preference exists", () => {
    localStorage.setItem("todos_app_filter_v1", "unexpected");
    expect(loadFilterPreference()).toBe("all");
  });
});
