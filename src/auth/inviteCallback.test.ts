import { describe, expect, it } from "vitest";
import {
  readInviteCallback,
  stripInviteCallbackParams,
} from "./inviteCallback";

describe("inviteCallback", () => {
  it("reads a token-hash invite callback", () => {
    const url = new URL(
      "https://tasks.kevinngongang.dev/?token_hash=abc123&type=invite",
    );

    expect(readInviteCallback(url)).toEqual({
      kind: "token",
      tokenHash: "abc123",
    });
  });

  it("ignores non-invite auth callback types", () => {
    const url = new URL(
      "https://tasks.kevinngongang.dev/?token_hash=abc123&type=recovery",
    );

    expect(readInviteCallback(url)).toEqual({ kind: "none" });
  });

  it("requires a non-empty token hash", () => {
    const url = new URL(
      "https://tasks.kevinngongang.dev/?token_hash=&type=invite",
    );

    expect(readInviteCallback(url)).toEqual({ kind: "none" });
  });

  it("strips only invite callback params and preserves unrelated params", () => {
    const url = new URL(
      "https://tasks.kevinngongang.dev/?token_hash=abc123&type=invite&share_text=Keep+me",
    );

    expect(stripInviteCallbackParams(url)).toBe("/?share_text=Keep+me");
  });
});
