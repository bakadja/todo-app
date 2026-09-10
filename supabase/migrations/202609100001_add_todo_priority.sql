alter table public.todos
  add column priority text null;

alter table public.todos
  add constraint todos_priority_check
  check (priority is null or priority in ('low', 'medium', 'high'));

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
    p_created_at,
    p_updated_at,
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

revoke all on function public.sync_todo_lww(
  uuid,
  text,
  boolean,
  text,
  timestamptz,
  timestamptz,
  timestamptz
) from public;

grant execute on function public.sync_todo_lww(
  uuid,
  text,
  boolean,
  text,
  timestamptz,
  timestamptz,
  timestamptz
) to authenticated;
