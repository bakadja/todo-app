-- Regression tests for client-supplied LWW timestamps.
--
-- Contract: sync_todo_lww compares mutations using server-bounded timestamps.
-- A client clock far in the future must never let one mutation permanently
-- dominate later legitimate edits (audit finding A), and cross-user pushes
-- must keep failing closed.
begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

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

-- A malformed or compromised client pushes a mutation stamped in year 9999.
select public.sync_todo_lww(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Future stamp',
  false,
  'medium',
  '9999-01-01 00:00:00+00',
  '9999-12-31 23:59:59+00',
  null
);

select ok(
  (
    select updated_at <= now() + interval '5 minutes'
    from public.todos
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  'far-future updated_at is bounded by the server clock horizon'
);

select ok(
  (
    select created_at <= now() + interval '5 minutes'
    from public.todos
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  'far-future created_at is bounded by the server clock horizon'
);

-- The poisoned value must be recoverable: a later mutation whose timestamp
-- lies beyond the horizon clamps to the same bound and wins the comparison.
select public.sync_todo_lww(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Legit later edit',
  true,
  'high',
  '2026-09-13 08:00:00+00',
  now() + interval '10 minutes',
  null
);

select results_eq(
  $$select title from public.todos where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  $$values ('Legit later edit'::text)$$,
  'a later legitimate edit recovers a far-future-stamped todo'
);

-- Equal timestamps stay deterministic: the incoming mutation wins.
select public.sync_todo_lww(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Tie incoming',
  true,
  'high',
  '2026-09-13 08:00:00+00',
  now() + interval '10 minutes',
  null
);

select results_eq(
  $$select title from public.todos where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  $$values ('Tie incoming'::text)$$,
  'equal timestamps resolve deterministically in favor of the incoming mutation'
);

-- Tombstones follow the same bound and cannot be resurrected by older edits.
select public.sync_todo_lww(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Tie incoming',
  true,
  'high',
  '2026-09-13 08:00:00+00',
  '9999-12-31 00:00:00+00',
  '9999-12-31 00:00:00+00'
);

select ok(
  (
    select deleted_at is not null
      and updated_at <= now() + interval '5 minutes'
    from public.todos
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  'a far-future delete keeps the tombstone with a bounded timestamp'
);

select public.sync_todo_lww(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Resurrect attempt',
  false,
  'low',
  '2026-09-13 08:00:00+00',
  now(),
  null
);

select results_eq(
  $$select deleted_at is not null from public.todos where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  $$values (true)$$,
  'an older update cannot resurrect a tombstone'
);

-- Cross-user pushes through the RPC must fail closed without touching the
-- canonical row owned by another user.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.sync_todo_lww(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'B hijack',
    false,
    null,
    '2026-09-13 08:00:00+00',
    '9999-12-31 00:00:00+00',
    null
  )$$,
  NULL,
  'user B cannot push a todo id owned by user A'
);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select results_eq(
  $$select title from public.todos where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  $$values ('Tie incoming'::text)$$,
  'a rejected cross-user push leaves the canonical row untouched'
);

-- The legacy 6-argument overload performed the merge without the timestamp
-- bound; it must be gone so it cannot bypass the clamp.
select ok(
  to_regprocedure('public.sync_todo_lww(uuid, text, boolean, timestamptz, timestamptz, timestamptz)') is null,
  'the legacy unbounded sync_todo_lww overload is dropped'
);

select ok(
  to_regprocedure('public.sync_todo_lww(uuid, text, boolean, text, timestamptz, timestamptz, timestamptz)') is not null,
  'the bounded priority-aware sync_todo_lww remains'
);

select results_eq(
  $$select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sync_todo_lww'$$,
  $$values (1::bigint)$$,
  'exactly one sync_todo_lww signature remains'
);

select throws_ok(
  $$select public.sync_todo_lww(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Null timestamps',
    false,
    null,
    '2026-09-13 08:00:00+00',
    null,
    null
  )$$,
  NULL,
  'null updated_at is rejected instead of coerced to the bound'
);

select * from finish();
rollback;
