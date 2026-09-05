export type RecoveryCallback =
  | { kind: "none" }
  | { kind: "token"; tokenHash: string };

export function readRecoveryCallback(url: URL): RecoveryCallback {
  if (url.searchParams.get("type") !== "recovery") {
    return { kind: "none" };
  }

  const tokenHash = url.searchParams.get("token_hash")?.trim();
  if (!tokenHash) {
    return { kind: "none" };
  }

  return { kind: "token", tokenHash };
}

export function stripRecoveryCallbackParams(url: URL): string {
  const clean = new URL(url.toString());
  clean.searchParams.delete("token_hash");
  clean.searchParams.delete("type");

  return `${clean.pathname}${clean.search}${clean.hash}`;
}
