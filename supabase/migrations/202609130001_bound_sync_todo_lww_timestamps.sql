-- Bound client-supplied LWW timestamps (audit finding A).
--
-- sync_todo_lww resolves conflicts purely on updated_at, which previously was
-- accepted verbatim from the client. A compromised or misconfigured device
-- could push a mutation stamped far in the future (e.g. year 9999) and every
-- later legitimate edit would silently lose forever.
--
-- The RPC now normalizes client timestamps to at most now() + 5 minutes.
-- Clocks within a small positive skew behave exactly as before; anything
-- beyond that horizon is pulled back so a far-future mutation wins only
-- against concurrent edits and is recoverable by any subsequent edit.
--
-- Remaining trade-off (documented in the sync design notes): timestamps in
-- the past are still trusted, because offline devices legitimately submit
-- edits stamped hours or days earlier and that ordering is the core of the
-- offline-first LWW contract.
create or replace function public.sync_todo_lww(
  p_id uuid,
  p_title text,
  p_completed boolean,
  p_priority text,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_deleted_at timestamptz
)
returns public.todos
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.todos;
  v_max_client_timestamp timestamptz := now() + interval '5 minutes';
  v_created_at timestamptz := least(p_created_at, v_max_client_timestamp);
  v_updated_at timestamptz := least(p_updated_at, v_max_client_timestamp);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.todos (
    id,
    user_id,
    title,
    completed,
    priority,
    created_at,
    updated_at,
    deleted_at
  )
  values (
    p_id,
    v_user_id,
    p_title,
    p_completed,
    p_priority,
    v_created_at,
    v_updated_at,
    p_deleted_at
  )
  on conflict (id) do update
  set
    title = excluded.title,
    completed = excluded.completed,
    priority = excluded.priority,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at
  where excluded.updated_at >= public.todos.updated_at
  returning * into v_row;

  if v_row is null then
    select *
    into v_row
    from public.todos
    where id = p_id
      and user_id = v_user_id;
  end if;

  if v_row is null then
    raise exception 'Todo is not accessible';
  end if;

  return v_row;
end;
$$;
