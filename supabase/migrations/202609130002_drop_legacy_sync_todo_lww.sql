-- Drop the legacy 6-argument sync_todo_lww overload (audit finding B).
--
-- Migration 202609100001_add_todo_priority.sql replaced the original
-- signature with a priority-aware one, but PostgreSQL kept both overloads
-- installed. The legacy overload performs the same LWW merge WITHOUT the
-- client timestamp bound introduced in the previous migration, so any
-- authenticated client could bypass that protection by omitting p_priority.
-- It also inserts rows with a NULL priority, silently dropping data for
-- stale clients.
--
-- The application always calls the priority-aware signature; stale clients
-- receive a clear RPC error until they reload current assets.
drop function public.sync_todo_lww(
  uuid,
  text,
  boolean,
  timestamptz,
  timestamptz,
  timestamptz
);
