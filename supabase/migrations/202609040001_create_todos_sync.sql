create table public.todos (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) > 0),
  completed boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz null
);

create index todos_user_updated_idx
  on public.todos (user_id, updated_at desc);

alter table public.todos enable row level security;

grant select, insert, update, delete on public.todos to authenticated;

create policy "users select own todos"
on public.todos
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users insert own todos"
on public.todos
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users update own todos"
on public.todos
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users delete own todos"
on public.todos
for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.sync_todo_lww(
  p_id uuid,
  p_title text,
  p_completed boolean,
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
    created_at,
    updated_at,
    deleted_at
  )
  values (
    p_id,
    v_user_id,
    p_title,
    p_completed,
    p_created_at,
    p_updated_at,
    p_deleted_at
  )
  on conflict (id) do update
  set
    title = excluded.title,
    completed = excluded.completed,
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
  timestamptz,
  timestamptz,
  timestamptz
) from public;

grant execute on function public.sync_todo_lww(
  uuid,
  text,
  boolean,
  timestamptz,
  timestamptz,
  timestamptz
) to authenticated;
