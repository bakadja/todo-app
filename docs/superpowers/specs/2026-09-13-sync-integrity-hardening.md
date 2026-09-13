# Sync Integrity Hardening

Date: 2026-09-13
Status: Implemented in the hardening campaign, integrated on `agent/staging`

This note documents the changes made to the offline-first sync contract in
response to the 2026-09 hardening audit (findings A, B, G, I). It extends, and
does not replace, the [offline-first sync design](2026-09-04-offline-first-sync-design.md).

## Finding A — client-controlled LWW timestamps

`sync_todo_lww` resolves conflicts purely on `updated_at`. Previously the
timestamp was accepted verbatim from the client, so a malformed or compromised
device could push a mutation stamped far in the future (e.g. year 9999) and
every later legitimate edit would silently lose forever. This was reproduced
against the local Supabase stack before fixing.

### Change

A dedicated migration (`202609130001_bound_sync_todo_lww_timestamps.sql`)
normalizes client-supplied `created_at` and `updated_at` inside the RPC to at
most `now() + 5 minutes`. NULL timestamps are rejected explicitly (they would
otherwise be coerced to the maximum by `least`). Tombstones (`deleted_at`)
follow the same bound via their `updated_at` comparison; `deleted_at` itself
is not a decision input.

- Clocks within a small positive skew (< 5 minutes ahead) behave exactly as
  before.
- A far-future mutation still applies immediately (no new failure mode for the
  pushing client) but is recoverable: any subsequent edit stamped beyond the
  horizon wins the comparison.
- Past timestamps remain trusted; offline devices legitimately submit edits
  stamped hours or days earlier, and that ordering is the core of the
  offline-first LWW contract.
- The legacy 6-argument overload (installed alongside the priority-aware
  signature since the priority migration) is dropped by
  `202609130002_drop_legacy_sync_todo_lww.sql`; it performed the merge without
  the bound and would have bypassed this protection. Stale clients receive a
  clear RPC error until they reload current assets.

### Remaining trade-offs

- Within the 5-minute skew window, ordering still follows client clocks. Two
  devices editing the same todo within the window resolve by arrival order and
  timestamp; this is inherent to timestamp-based LWW and unchanged.
- A poisoned value can dominate concurrent edits for at most the skew horizon;
  it can no longer dominate permanently.
- `created_at` clamping affects display sort order only.
- A device whose clock runs more than 5 minutes fast re-pushes its edits on
  every sync round until wall time reaches its own stamp: the server clamps
  the stamp down, the putCanonical guard keeps the local (newer-stamped) row
  pending, and the next push re-normalizes. Convergence is monotonic and
  bounded, but such a device stays in a re-push cycle instead of settling.
  Fixing this would mean adopting the server-clamped timestamp when the
  pushed content is unchanged; deferred as a follow-up.
- The RPC validates timestamps and ownership, not title shape; see the
  database contract hardening for title constraints.

## Finding G — concurrent tab synchronization

Two tabs share one IndexedDB database but run independent sync loops. An
investigation (see `src/sync/concurrentTabSync.test.ts`) proved:

- Concurrent `syncTodos` runs from two tabs converge without duplicates,
  lost todos, or stuck states; server-side LWW is the serialization point.
- A genuine data-loss race existed: an edit made while a push of the same
  todo was in flight (from another tab, or the same tab via a focus/online
  triggered sync) was silently overwritten when the stale canonical row was
  adopted locally.

The fix is a write guard in `LocalTodoRepository.putCanonical`: never adopt a
canonical row whose `updatedAt` is older than the local row. A newer local
edit stays `pending` and wins the next push through normal LWW. No cross-tab
mutex (`navigator.locks`, `BroadcastChannel`) is needed; the guard also
covers the single-tab race that a mutex would not fix.

Known limitation: `markSyncing` performs a non-transactional read-modify-write,
so an edit landing inside that microsecond window from another tab can still
be clobbered by the sync-status transition itself. Pre-existing, untested
interleavings narrower than the gated push race; deferred.

## Finding I — runtime validation of remote data

`SupabaseTodoRemote` previously cast responses with `data as RemoteTodoRecord`.
Both the push response and every pulled row are now validated at runtime
(non-empty id/user_id strings, boolean completed, known or null priority,
date-parseable timestamp strings). Invalid remote data raises a descriptive
sync error instead of being written into IndexedDB, so the UI shows an error
state and nothing is silently corrupted.
