begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select has_table('public', 'todos', 'todos table exists');

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'user-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@example.com');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;

select public.sync_todo_lww(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Initial',
  false,
  '2026-09-04 08:00:00+00',
  '2026-09-04 08:00:00+00',
  null
);

select results_eq(
  $$select count(*) from public.todos where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid$$,
  $$values (1::bigint)$$,
  'user A can read own todo'
);

reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);
set local role authenticated;

select results_eq(
  $$select count(*) from public.todos where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid$$,
  $$values (0::bigint)$$,
  'user B cannot read user A todo'
);

select results_eq(
  $$
    with changed as (
      update public.todos
      set title = 'Hacked'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
      returning id
    )
    select count(*) from changed
  $$,
  $$values (0::bigint)$$,
  'user B cannot update user A todo'
);

reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;

select public.sync_todo_lww(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Initial retry',
  false,
  '2026-09-04 08:00:00+00',
  '2026-09-04 08:00:00+00',
  null
);

select results_eq(
  $$select count(*) from public.todos where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid$$,
  $$values (1::bigint)$$,
  'retrying the same UUID keeps one row'
);

select public.sync_todo_lww(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Newer',
  true,
  '2026-09-04 08:00:00+00',
  '2026-09-04 10:00:00+00',
  null
);

select results_eq(
  $$select title from public.todos where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid$$,
  $$values ('Newer'::text)$$,
  'newer updated_at wins'
);

select public.sync_todo_lww(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Older',
  false,
  '2026-09-04 08:00:00+00',
  '2026-09-04 09:00:00+00',
  null
);

select results_eq(
  $$select title from public.todos where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid$$,
  $$values ('Newer'::text)$$,
  'later-arriving older update cannot overwrite canonical row'
);

select * from finish();
rollback;
