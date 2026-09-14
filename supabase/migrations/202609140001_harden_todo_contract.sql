-- Harden the todo database contract (audit findings B and C).
--
-- 1. Title length bound: the table only rejected empty titles, so the
--    database accepted arbitrarily large titles. The application now
--    enforces the same limit (MAX_TODO_TITLE_LENGTH = 2000 in
--    src/types/todoTitle.ts); oversized input fails predictably instead of
--    being truncated. If production rows already exceed the limit this
--    migration fails loudly without destroying any data, and the limit
--    should be revisited with the owner rather than relaxed silently.
--  Detection query for pre-existing oversized rows:
--    select id from public.todos where char_length(title) > 2000;
-- 2. RPC privileges: Supabase default privileges grant EXECUTE on new
--    functions to anon, authenticated, and the server-only service role.
--    The earlier revoke from
--    PUBLIC does not remove those explicit grants, so anonymous callers
--    could still invoke the sync RPC (it raises "Authentication required",
--    but the grant violates least privilege). Revoke it for anon; keep the
--    authenticated grant required by sync, and leave the server-only service
--    role grant
--    alone as a Supabase-managed server-side default that cannot be used
--    without a user context.
alter table public.todos
  add constraint todos_title_length_check
  check (char_length(title) <= 2000);

revoke execute on function public.sync_todo_lww(
  uuid,
  text,
  boolean,
  text,
  timestamptz,
  timestamptz,
  timestamptz
) from anon;
