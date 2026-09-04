import { describe, expect, it } from "vitest";
import { createBrowserSupabaseClient } from "./supabase";

describe("createBrowserSupabaseClient", () => {
  it("rejects a missing url", () => {
    expect(() => createBrowserSupabaseClient("", "sb_publishable_test")).toThrow(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY",
    );
  });

  it("rejects a missing publishable key", () => {
    expect(() => createBrowserSupabaseClient("https://example.supabase.co", "")).toThrow(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY",
    );
  });

  it("creates a browser client when both values are present", () => {
    const client = createBrowserSupabaseClient(
      "https://example.supabase.co",
      "sb_publishable_test",
    );
    expect(client.auth).toBeDefined();
  });
});
