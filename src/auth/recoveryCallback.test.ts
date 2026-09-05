import { describe, expect, it } from "vitest";
import {
  readRecoveryCallback,
  stripRecoveryCallbackParams,
} from "./recoveryCallback";

describe("recoveryCallback", () => {
  it("reads a token-hash recovery callback", () => {
    const url = new URL(
      "https://tasks.kevinngongang.dev/?token_hash=abc123&type=recovery",
    );

    expect(readRecoveryCallback(url)).toEqual({
      kind: "token",
      tokenHash: "abc123",
    });
  });

  it("ignores non-recovery auth callback types", () => {
    const url = new URL(
      "https://tasks.kevinngongang.dev/?token_hash=abc123&type=invite",
    );

    expect(readRecoveryCallback(url)).toEqual({ kind: "none" });
  });

  it("requires a non-empty token hash", () => {
    const url = new URL(
      "https://tasks.kevinngongang.dev/?token_hash=&type=recovery",
    );

    expect(readRecoveryCallback(url)).toEqual({ kind: "none" });
  });

  it("strips only recovery callback params and preserves unrelated params", () => {
    const url = new URL(
      "https://tasks.kevinngongang.dev/?token_hash=abc123&type=recovery&share_text=Keep+me",
    );

    expect(stripRecoveryCallbackParams(url)).toBe("/?share_text=Keep+me");
  });
});
