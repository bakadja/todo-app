-- Contract tests for the todos table and the sync_todo_lww RPC:
-- - title length is bounded consistently with the application limit;
-- - only the intended authenticated role can execute the sync RPC.
begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'user-a@example.com');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;

-- Boundary: exactly 200 characters is accepted when written directly.
insert into public.todos (id, user_id, title, completed, created_at, updated_at)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-1111-1111-111111111111',
  repeat('a', 200),
  false,
  '2026-09-13 08:00:00+00',
  '2026-09-13 08:00:00+00'
);

select is(
  (select count(*) from public.todos where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  1::bigint,
  'a 200-character title is accepted'
);

select throws_ok(
  $$insert into public.todos (id, user_id, title, completed, created_at, updated_at)
    values (
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '11111111-1111-1111-1111-111111111111',
      repeat('a', 201),
      false,
      '2026-09-13 08:00:00+00',
      '2026-09-13 08:00:00+00'
    )$$,
  '23514',
  NULL,
  'a 201-character title violates the title length constraint'
);

select throws_ok(
  $$insert into public.todos (id, user_id, title, completed, created_at, updated_at)
    values (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      '11111111-1111-1111-1111-111111111111',
      '',
      false,
      '2026-09-13 08:00:00+00',
      '2026-09-13 08:00:00+00'
    )$$,
  '23514',
  NULL,
  'an empty title is still rejected'
);

-- The sync RPC enforces the same bounds.
select public.sync_todo_lww(
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  repeat('b', 200),
  false,
  null,
  '2026-09-13 08:00:00+00',
  '2026-09-13 08:00:00+00',
  null
);

select is(
  (select count(*) from public.todos where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
  1::bigint,
  'the sync RPC accepts a 200-character title'
);

select throws_ok(
  $$select public.sync_todo_lww(
    '99999999-9999-4999-8999-999999999999',
    repeat('b', 201),
    false,
    null,
    '2026-09-13 08:00:00+00',
    '2026-09-13 08:00:00+00',
    null
  )$$,
  '23514',
  NULL,
  'the sync RPC rejects a 201-character title'
);

reset role;

select ok(
  not has_function_privilege(
    'anon',
    'public.sync_todo_lww(uuid,text,boolean,text,timestamptz,timestamptz,timestamptz)',
    'execute'
  ),
  'anonymous callers cannot execute the sync RPC'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.sync_todo_lww(uuid,text,boolean,text,timestamptz,timestamptz,timestamptz)',
    'execute'
  ),
  'authenticated callers can execute the sync RPC'
);

select * from finish();
rollback;
