export type InviteCallback =
  | { kind: "none" }
  | { kind: "token"; tokenHash: string };

export function readInviteCallback(url: URL): InviteCallback {
  if (url.searchParams.get("type") !== "invite") {
    return { kind: "none" };
  }

  const tokenHash = url.searchParams.get("token_hash")?.trim() ?? "";
  if (!tokenHash) {
    return { kind: "none" };
  }

  return { kind: "token", tokenHash };
}

export function stripInviteCallbackParams(url: URL): string {
  const clean = new URL(url);
  clean.searchParams.delete("token_hash");
  clean.searchParams.delete("type");

  const search = clean.searchParams.toString();
  return `${clean.pathname}${search ? `?${search}` : ""}${clean.hash}`;
}
