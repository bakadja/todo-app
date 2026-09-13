# Database Contract Hardening

Date: 2026-09-13
Status: Implemented in the hardening campaign, integrated on `agent/staging`

This note documents the database-side hardening of the todos table and the
`sync_todo_lww` RPC (audit findings B and C). It complements the
[sync integrity hardening](2026-09-13-sync-integrity-hardening.md) note, which
covers the timestamp bound and the drop of the legacy RPC overload.

## Finding C — bounded todo titles

The table previously rejected only empty titles
(`check (char_length(title) > 0)`), so the database accepted arbitrarily
large titles.

### Change

- Migration `202609140001_harden_todo_contract.sql` adds
  `todos_title_length_check` bounding `title` to at most 200 characters.
- `src/types/todoTitle.ts` exports the shared `MAX_TODO_TITLE_LENGTH = 200`
  and `isValidTodoTitle`.
- `LocalTodoRepository.add/edit` validate the title and throw a descriptive
  error; the browser inputs (`TodoInput`, `TodoItem` editor) enforce
  `maxLength` so typed input cannot exceed the bound.
- Shared content (Web Share Target) can arrive pre-filled above the limit;
  `SharedTodoCard` shows an explicit error and disables Add rather than
  truncating user content.

### Compatibility notes

- Nothing is silently truncated: typed input is bounded at the field level,
  over-limit shared drafts fail visibly, and the repository rejects invalid
  writes outright.
- Legacy local records longer than 200 characters are not destroyed; they
  keep working locally and surface a sync error if ever pushed, since the
  server rejects them. New writes cannot create them.
- If production rows already exceed 200 characters, the migration fails
  loudly without touching data; the limit should then be revisited with the
  owner instead of being relaxed silently.

## Finding B — RPC privileges

`sync_todo_lww` is created with Supabase default privileges, which grant
`EXECUTE` to `anon`, `authenticated`, and `service_role` even after the
migrations' `revoke ... from public` (public is a separate grantee).

### Change

- `202609140001_harden_todo_contract.sql` revokes `EXECUTE` from `anon`.
  Anonymous callers could never get data out of it (the function raises
  `Authentication required`), but least privilege says the grant should not
  exist.
- `authenticated` keeps `EXECUTE` — that is the sync path.
- The `service_role` grant is left as a Supabase-managed server-side default;
  the function still requires a user context and raises without one.
- Combined with `202609130002_drop_legacy_sync_todo_lww.sql`, exactly one
  bounded, priority-aware signature remains executable by the intended role.

## Verification

- `supabase/tests/todos_contract.sql` — pgTAP: 200-char boundary accepted,
  201 rejected (direct insert and via RPC), empty title still rejected,
  `anon` cannot execute the RPC, `authenticated` can.
- Full migration chain from a clean local database passes
  (`supabase db reset` + `supabase test db`).
