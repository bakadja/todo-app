import { describe, expect, it } from "vitest";
import {
  isShareTargetSearch,
  normalizeSharedTodo,
  readSharedTodoFromSearch,
  stripShareTargetParams,
} from "./sharedTodo";

describe("isShareTargetSearch", () => {
  it("detects only namespaced share target params", () => {
    expect(isShareTargetSearch("?share_title=Guide")).toBe(true);
    expect(isShareTargetSearch("?share_text=Read%20later")).toBe(true);
    expect(isShareTargetSearch("?share_url=https%3A%2F%2Fexample.com")).toBe(true);
    expect(isShareTargetSearch("?title=Guide&url=https%3A%2F%2Fexample.com")).toBe(false);
    expect(isShareTargetSearch("?filter=active")).toBe(false);
  });
});

describe("normalizeSharedTodo", () => {
  it("combines title, text, and url in order", () => {
    expect(
      normalizeSharedTodo({
        title: "PostgreSQL Indexing",
        text: "Read this later",
        url: "https://example.com/indexing",
      }),
    ).toBe(
      "PostgreSQL Indexing\nRead this later\nhttps://example.com/indexing",
    );
  });

  it("does not repeat a url already present in shared text", () => {
    expect(
      normalizeSharedTodo({
        title: "Video",
        text: "Watch https://youtu.be/abc123 later",
        url: "https://youtu.be/abc123",
      }),
    ).toBe("Video\nWatch https://youtu.be/abc123 later");
  });

  it("trims blanks and collapses identical top-level values", () => {
    expect(
      normalizeSharedTodo({
        title: "  Same text  ",
        text: "Same text",
        url: "   ",
      }),
    ).toBe("Same text");
  });

  it("supports url-only shares", () => {
    expect(normalizeSharedTodo({ url: " https://example.com " })).toBe(
      "https://example.com",
    );
  });

  it("returns null for an empty payload", () => {
    expect(normalizeSharedTodo({ title: " ", text: "", url: null })).toBeNull();
  });
});

describe("readSharedTodoFromSearch", () => {
  it("ignores ordinary title/text/url query params", () => {
    expect(
      readSharedTodoFromSearch(
        "?title=Normal&text=Page&url=https%3A%2F%2Fexample.com",
      ),
    ).toBeNull();
  });

  it("reads namespaced share parameters", () => {
    expect(
      readSharedTodoFromSearch(
        "?share_title=Guide&share_url=https%3A%2F%2Fexample.com",
      ),
    ).toBe("Guide\nhttps://example.com");
  });
});

describe("stripShareTargetParams", () => {
  it("removes only namespaced share params and preserves unrelated query/hash values", () => {
    const url = new URL(
      "https://tasks.kevinngongang.dev/?share_title=Guide&share_text=Read&share_url=https%3A%2F%2Fexample.com&filter=active#top",
    );

    expect(stripShareTargetParams(url)).toBe("/?filter=active#top");
  });
});
