# Offline-First Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing `todo-app` from whole-state `localStorage` persistence to an offline-first IndexedDB application that preserves current todos, existing reducer/filter behavior, and UI while synchronizing authenticated users through Supabase across devices.

**Architecture:** Keep the existing React 19 UI, reducer, selectors, and components. Introduce a Dexie-backed local repository as the durable source for todos, migrate the current `todos_app_v1` state exactly once, cache the app shell with a service worker, and add a small Supabase Auth + PostgreSQL/RLS push/pull synchronization layer. Cloudflare Worker/ChatGPT agent integration remains a separate later project.

**Tech Stack:** React 19.2, TypeScript 5.9, Vite 7.2, Vitest 4, Dexie.js, IndexedDB, `fake-indexeddb`, `vite-plugin-pwa`, Supabase JS, PostgreSQL, Supabase Auth/RLS, Supabase CLI.

**Spec:** `docs/superpowers/specs/2026-09-04-offline-first-sync-design.md`

## Global Constraints

- Default branch is `master`, not `main`.
- Preserve the existing UI and component structure unless a task explicitly requires a small integration change.
- Preserve filters `all`, `active`, `completed` and selector behavior.
- Preserve all existing todo IDs, titles, completion flags, and `createdAt` values during migration from `localStorage["todos_app_v1"]`.
- Replace whole-state localStorage todo persistence with IndexedDB/Dexie.
- Keep filter preference local-only; it is not synchronized across devices.
- Local CRUD must durably write to IndexedDB before any network synchronization is attempted.
- A previously loaded deployment must be reopenable offline through a service-worker-cached app shell; a first-ever visit with no network is out of scope.
- Anonymous offline use remains possible.
- Supabase Auth uses email/password in v1.
- RLS isolates rows by `auth.uid()`.
- Browser code may use only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never bundle `sb_secret_...` or service-role credentials into Vite.
- Local rows use stable client-generated UUIDs.
- `pending`, `syncing`, and `error` are retryable states after restart.
- Deletes use tombstones; normal app behavior does not hard-delete synchronized rows.
- Conflict handling is deterministic last-write-wins based on `updated_at`.
- A failed cloud write must never discard the local mutation.
- Sync runs on authenticated online startup, after local mutations, on `online`, and on window focus. Overlapping requests must coalesce and preserve one requested rerun.
- Do not add PowerSync, Firebase, Appwrite, CRDTs, priorities, due dates, recurring tasks, collaboration, attachments, push notifications, native apps, or Cloudflare Worker/agent endpoints in this implementation.

---

## File Structure

The implementation should converge on the following focused structure while retaining existing components:

```text
src/
├── auth/
│   ├── AuthContext.tsx
│   └── AuthContext.test.tsx
├── components/
│   ├── AuthPanel.tsx
│   ├── SyncStatus.tsx
│   └── ...existing components
├── hooks/
│   ├── useTodoAppState.ts
│   ├── useTodoAppState.test.tsx
│   ├── useTodoSync.ts
│   └── useTodoSync.test.tsx
├── lib/
│   ├── supabase.ts
│   └── supabase.test.ts
├── state/
│   ├── todosReducer.ts
│   ├── todosReducer.test.ts
│   ├── selectors.ts
│   └── selectors.test.ts
├── storage/
│   ├── todoDb.ts
│   ├── todoRepository.ts
│   ├── todoRepository.test.ts
│   ├── migrateLegacyState.ts
│   ├── migrateLegacyState.test.ts
│   ├── filterPreference.ts
│   ├── filterPreference.test.ts
│   ├── deviceIdentity.ts
│   └── deviceIdentity.test.ts
├── sync/
│   ├── types.ts
│   ├── supabaseTodoRemote.ts
│   ├── supabaseTodoRemote.test.ts
│   ├── syncEngine.ts
│   ├── syncEngine.test.ts
│   └── offlineMultiDevice.test.ts
├── App.tsx
├── App.css
├── main.tsx
└── index.css

supabase/
├── config.toml
├── migrations/
│   └── 202609040001_create_todos_sync.sql
└── tests/
    └── todos_security.sql

.env.example
vite.config.ts
README.md
```

## Shared Types and Contracts

Use these names consistently across tasks:

```ts
export type OwnerKey = "anonymous" | `user:${string}`;
export type SyncStatus = "pending" | "syncing" | "synced" | "error";

export type LocalTodoRecord = {
  id: string;
  ownerKey: OwnerKey;
  title: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  syncStatus: SyncStatus;
  lastSyncError: string | null;
};

export type RemoteTodoRecord = {
  id: string;
  user_id: string;
  title: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export interface TodoRemote {
  push(todo: LocalTodoRecord): Promise<RemoteTodoRecord>;
  list(): Promise<RemoteTodoRecord[]>;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  errors: number;
}
```

---

### Task 1: Add Dexie Local Database and Preserve Existing `todos_app_v1`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/storage/todoDb.ts`
- Create: `src/storage/todoRepository.ts`
- Create: `src/storage/todoRepository.test.ts`
- Create: `src/storage/migrateLegacyState.ts`
- Create: `src/storage/migrateLegacyState.test.ts`
- Create: `src/storage/filterPreference.ts`
- Create: `src/storage/filterPreference.test.ts`
- Keep: `src/storage/localStorage.ts` during migration compatibility

**Interfaces:**
- Produces: `TodoDb`, `todoDb`, `createTodoDb()`, `ownerKeyForUser()`, `LocalTodoRepository`, `localTodoRepository`, `migrateLegacyState()`, `loadFilterPreference()`, `saveFilterPreference()`.

- [ ] **Step 1: Install Dexie and fake IndexedDB**

```bash
npm install dexie
npm install -D fake-indexeddb
```

Expected: `dexie` is a runtime dependency and `fake-indexeddb` a dev dependency.

- [ ] **Step 2: Write failing repository tests**

Create `src/storage/todoRepository.test.ts`:

```ts
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodoDb, ownerKeyForUser, type TodoDb } from "./todoDb";
import { LocalTodoRepository } from "./todoRepository";

describe("LocalTodoRepository", () => {
  let db: TodoDb;
  let repo: LocalTodoRepository;

  beforeEach(() => {
    db = createTodoDb(`todo-repo-${crypto.randomUUID()}`);
    repo = new LocalTodoRepository(db);
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("creates a durable anonymous pending todo", async () => {
    const row = await repo.add("Write tests", "anonymous", 1000);
    expect(row).toMatchObject({
      title: "Write tests",
      ownerKey: "anonymous",
      completed: false,
      createdAt: 1000,
      updatedAt: 1000,
      deletedAt: null,
      syncStatus: "pending",
    });
    expect((await repo.listVisible("anonymous"))[0].id).toBe(row.id);
  });

  it("keeps delete tombstones", async () => {
    const row = await repo.add("Delete me", "anonymous", 1000);
    await repo.softDelete(row.id, "anonymous", 2000);
    expect(await repo.listVisible("anonymous")).toEqual([]);
    expect((await repo.get(row.id))?.deletedAt).toBe(2000);
  });

  it("retries interrupted syncing rows", async () => {
    const row = await repo.add("Retry me", "anonymous", 1000);
    await repo.markSyncing(row.id);
    expect((await repo.listRetryable("anonymous")).map(t => t.id)).toEqual([row.id]);
  });

  it("rejects writes through another owner", async () => {
    const a = ownerKeyForUser("11111111-1111-1111-1111-111111111111");
    const b = ownerKeyForUser("22222222-2222-2222-2222-222222222222");
    const row = await repo.add("Private", a, 1000);
    await expect(repo.edit(row.id, b, "Intrusion", 2000))
      .rejects.toThrow("Todo not found for owner");
  });
});
```

Run:

```bash
npx vitest run src/storage/todoRepository.test.ts
```

Expected: FAIL because the DB/repository do not exist.

- [ ] **Step 3: Implement the IndexedDB schema**

Create `src/storage/todoDb.ts`:

```ts
import Dexie, { type Table } from "dexie";

export type OwnerKey = "anonymous" | `user:${string}`;
export type SyncStatus = "pending" | "syncing" | "synced" | "error";

export type LocalTodoRecord = {
  id: string;
  ownerKey: OwnerKey;
  title: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  syncStatus: SyncStatus;
  lastSyncError: string | null;
};

export type MetaRecord = { key: string; value: string };

export class TodoDb extends Dexie {
  todos!: Table<LocalTodoRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name = "todo-pop") {
    super(name);
    this.version(1).stores({
      todos: "id, ownerKey, syncStatus, updatedAt, deletedAt",
      meta: "key",
    });
  }
}

export const createTodoDb = (name = "todo-pop") => new TodoDb(name);
export const todoDb = createTodoDb();
export const ownerKeyForUser = (userId: string): OwnerKey => `user:${userId}`;
```

- [ ] **Step 4: Implement the repository**

Create `src/storage/todoRepository.ts` with these required methods:

```ts
export class LocalTodoRepository {
  constructor(private readonly db: TodoDb) {}

  get(id: string): Promise<LocalTodoRecord | undefined>;
  listVisible(ownerKey: OwnerKey): Promise<LocalTodoRecord[]>;
  listRetryable(ownerKey: OwnerKey): Promise<LocalTodoRecord[]>;
  add(title: string, ownerKey: OwnerKey, now?: number): Promise<LocalTodoRecord>;
  edit(id: string, ownerKey: OwnerKey, title: string, now?: number): Promise<LocalTodoRecord>;
  toggle(id: string, ownerKey: OwnerKey, now?: number): Promise<LocalTodoRecord>;
  softDelete(id: string, ownerKey: OwnerKey, now?: number): Promise<LocalTodoRecord>;
  claimAnonymous(ownerKey: Exclude<OwnerKey, "anonymous">): Promise<void>;
  markSyncing(id: string): Promise<void>;
  markError(id: string, message: string): Promise<void>;
  putCanonical(row: LocalTodoRecord): Promise<void>;
  putRemote(row: LocalTodoRecord): Promise<void>;
}
```

Rules:

```ts
// listRetryable includes all crash-safe retry states
return rows.filter(row =>
  row.syncStatus === "pending" ||
  row.syncStatus === "syncing" ||
  row.syncStatus === "error"
);
```

`putRemote()` must refuse to overwrite a local retryable row. `putCanonical()` may overwrite it because the push endpoint returned the conflict-resolved canonical winner.

Run:

```bash
npx vitest run src/storage/todoRepository.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing legacy migration tests**

Create `src/storage/migrateLegacyState.test.ts` and cover the real legacy shape:

```ts
localStorage.setItem("todos_app_v1", JSON.stringify({
  todos: [
    { id: "legacy-1", title: "Real existing task", completed: true, createdAt: 1234 },
  ],
  filter: "active",
}));
```

Assertions after `await migrateLegacyState(db, 9000)`:

```ts
expect(await db.todos.get("legacy-1")).toMatchObject({
  id: "legacy-1",
  title: "Real existing task",
  completed: true,
  createdAt: 1234,
  updatedAt: 9000,
  ownerKey: "anonymous",
  syncStatus: "pending",
});
expect(localStorage.getItem("todos_app_v1")).toBeNull();
expect(localStorage.getItem("todos_app_filter_v1")).toBe("active");
```

Add two more tests:

```ts
it("does not duplicate rows when migration is called twice", async () => { /* assert count === 1 */ });
it("leaves malformed legacy JSON untouched", async () => { /* assert original raw value remains */ });
```

Run:

```bash
npx vitest run src/storage/migrateLegacyState.test.ts
```

Expected: FAIL.

- [ ] **Step 6: Implement migration and filter preference**

Create `src/storage/filterPreference.ts`:

```ts
import type { Filter } from "../state/todosReducer";

const FILTER_KEY = "todos_app_filter_v1";
const isFilter = (value: string | null): value is Filter =>
  value === "all" || value === "active" || value === "completed";

export function loadFilterPreference(): Filter {
  const raw = localStorage.getItem(FILTER_KEY);
  return isFilter(raw) ? raw : "all";
}

export function saveFilterPreference(filter: Filter) {
  localStorage.setItem(FILTER_KEY, filter);
}
```

Create `src/storage/migrateLegacyState.ts` with migration marker `legacy-todos-app-v1-migrated`. Validate every legacy todo before changing either storage. Perform todo inserts + migration marker in one Dexie transaction, then save filter and remove `todos_app_v1` only after that transaction succeeds.

- [ ] **Step 7: Run Task 1 verification and commit**

```bash
npx vitest run src/storage/todoRepository.test.ts src/storage/migrateLegacyState.test.ts src/storage/filterPreference.test.ts
npm run build

git add package.json package-lock.json src/storage
git commit -m "feat: add indexeddb todo persistence"
```

---

### Task 2: Adapt the Existing Reducer/UI to the Local Repository

**Files:**
- Modify: `src/state/todosReducer.ts`
- Modify: `src/state/todosReducer.test.ts`
- Create: `src/hooks/useTodoAppState.ts`
- Create: `src/hooks/useTodoAppState.test.tsx`
- Modify: `src/App.tsx`
- Keep: `src/state/selectors.ts` behavior unchanged
- Keep: existing presentational components unchanged

**Interfaces:**
- Consumes: Task 1 repository/migration/filter preference.
- Produces: `useTodoAppState(ownerKey)` returning `{ state, loading, add, toggle, edit, remove, setFilter, refresh }`.

- [ ] **Step 1: Add React Testing Library for integration-hook tests**

```bash
npm install -D @testing-library/react @testing-library/jest-dom jsdom
```

Configure Vitest `environment: "jsdom"` in `vite.config.ts` test configuration if not already configured.

- [ ] **Step 2: Refocus reducer actions around repository results**

Extend `Action` with exact hydration/upsert actions:

```ts
export type Action =
  | { type: "hydrate"; todos: Todo[] }
  | { type: "upsert"; todo: Todo }
  | { type: "remove"; id: string }
  | { type: "setFilter"; filter: Filter };
```

Implement:

```ts
case "hydrate":
  return { ...state, todos: action.todos };
case "upsert": {
  const exists = state.todos.some(todo => todo.id === action.todo.id);
  return {
    ...state,
    todos: exists
      ? state.todos.map(todo => todo.id === action.todo.id ? action.todo : todo)
      : [action.todo, ...state.todos],
  };
}
```

Update reducer tests to verify hydrate, insert upsert, update upsert, remove, and setFilter. Existing selector tests must continue to pass unchanged.

Run:

```bash
npx vitest run src/state/todosReducer.test.ts src/state/selectors.test.ts
```

Expected: PASS.

- [ ] **Step 3: Create the local app-state hook**

Public signature:

```ts
export function useTodoAppState(
  ownerKey: OwnerKey,
  repository: LocalTodoRepository = localTodoRepository,
  db: TodoDb = todoDb,
) {
  return {
    state,
    loading,
    add,
    toggle,
    edit,
    remove,
    setFilter,
    refresh,
  };
}
```

Required startup order:

```text
migrateLegacyState(db)
-> load local filter
-> repository.listVisible(ownerKey)
-> dispatch hydrate
```

Every todo mutation must follow durable-local-first ordering:

```ts
const add = async (title: string) => {
  const row = await repository.add(title, ownerKey);
  dispatch({ type: "upsert", todo: toUiTodo(row) });
};
```

Use the same pattern for toggle/edit. Delete first calls `repository.softDelete(...)`, then dispatches `remove`.

`setFilter` dispatches locally and calls `saveFilterPreference(filter)`; it does not synchronize to Supabase.

- [ ] **Step 4: Write hook tests with real fake IndexedDB**

Cover:

```text
legacy todo appears after migration
add persists across hook unmount/remount
toggle/edit persist
soft-deleted todo remains in DB but not state.todos
filter preference survives remount
owner changes cause visible todos to refresh
```

Run:

```bash
npx vitest run src/hooks/useTodoAppState.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Simplify `App.tsx` around the hook**

Replace direct `useReducer` + `loadState/saveState` persistence with:

```ts
const local = useTodoAppState("anonymous");
const visibleTodos = selectVisibleTodos(local.state);
const counts = selectCounts(local.state);
```

Wire existing components to `local.add`, `local.toggle`, `local.remove`, `local.edit`, and `local.setFilter`. Do not redesign `Header`, `TodoInput`, `TodoList`, `TodoItem`, `Filters`, or `EmptyState`.

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add package.json package-lock.json vite.config.ts src/state src/hooks/useTodoAppState.ts src/hooks/useTodoAppState.test.tsx src/App.tsx
git commit -m "refactor: drive todo ui from indexeddb"
```

---

### Task 3: Make the Existing Vite App Reopen Offline

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Modify: `src/main.tsx`
- Add PWA manifest assets only if required by the plugin configuration

**Interfaces:**
- Produces: registered service worker and cached application shell.

- [ ] **Step 1: Install Vite PWA integration**

```bash
npm install -D vite-plugin-pwa
```

- [ ] **Step 2: Configure `VitePWA`**

Add to `vite.config.ts`:

```ts
VitePWA({
  registerType: "autoUpdate",
  strategies: "generateSW",
  manifest: {
    name: "Todo Pop",
    short_name: "Todo Pop",
    display: "standalone",
    start_url: "/",
    theme_color: "#ffffff",
    background_color: "#ffffff",
  },
  workbox: {
    navigateFallback: "/index.html",
  },
})
```

Do not add runtime caching for Supabase API responses; todo data belongs in IndexedDB, not the service-worker cache.

- [ ] **Step 3: Register the service worker**

In `src/main.tsx`:

```ts
import { registerSW } from "virtual:pwa-register";
registerSW({ immediate: true });
```

- [ ] **Step 4: Verify production artifacts**

```bash
npm run build
find dist -maxdepth 2 -type f | sort
```

Expected: the build succeeds and contains generated service-worker/manifest assets in addition to the normal Vite bundle.

- [ ] **Step 5: Commit Task 3**

```bash
git add package.json package-lock.json vite.config.ts src/main.tsx public
 git commit -m "feat: cache todo app shell for offline use"
```

---

### Task 4: Add Supabase Browser Client, Auth, and Offline Owner Identity

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `.env.example`
- Create: `src/lib/supabase.ts`
- Create: `src/lib/supabase.test.ts`
- Create: `src/storage/deviceIdentity.ts`
- Create: `src/storage/deviceIdentity.test.ts`
- Create: `src/auth/AuthContext.tsx`
- Create: `src/auth/AuthContext.test.tsx`
- Create: `src/components/AuthPanel.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: `AuthProvider`, `useAuth()`, `getActiveUserId()`, `setActiveUserId()`, `clearActiveUserId()`.

- [ ] **Step 1: Install Supabase JS**

```bash
npm install @supabase/supabase-js
```

Create `.env.example`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

- [ ] **Step 2: Implement a validated Supabase factory**

```ts
export function createBrowserSupabaseClient(url: string, publishableKey: string) {
  if (!url || !publishableKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
  }
  return createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}
```

Test missing URL/key and successful factory creation in `src/lib/supabase.test.ts`.

- [ ] **Step 3: Persist only the active local owner pointer in IndexedDB metadata**

Implement:

```ts
export async function getActiveUserId(db: TodoDb = todoDb): Promise<string | null>;
export async function setActiveUserId(userId: string, db: TodoDb = todoDb): Promise<void>;
export async function clearActiveUserId(db: TodoDb = todoDb): Promise<void>;
```

Use metadata key `active-user-id`.

Tests must prove set/get/clear and that no todo rows are deleted by clear.

- [ ] **Step 4: Implement AuthProvider**

Public context:

```ts
interface AuthContextValue {
  user: User | null;
  localUserId: string | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
}
```

Behavior:

```text
startup -> load active-user-id + Supabase cached session
valid signed-in user -> persist active-user-id
refresh/network auth failure -> retain localUserId for offline local access
explicit signOut -> Supabase signOut + clear active-user-id
```

`signIn`/`signUp` return `null` on success or an error message on failure.

- [ ] **Step 5: Add minimal AuthPanel and provider wiring**

Keep the app's visual style. `AuthPanel` needs only email/password, sign-in, create-account, signed-in email, sign-out, and inline error text.

Wrap `<App />` in `<AuthProvider>` inside `src/main.tsx`.

Run:

```bash
npx vitest run src/lib/supabase.test.ts src/storage/deviceIdentity.test.ts src/auth/AuthContext.test.tsx
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add package.json package-lock.json .env.example src/lib src/storage/deviceIdentity* src/auth src/components/AuthPanel.tsx src/main.tsx
git commit -m "feat: add supabase authentication"
```

---

### Task 5: Add PostgreSQL Schema, RLS, and Atomic LWW RPC

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202609040001_create_todos_sync.sql`
- Create: `supabase/tests/todos_security.sql`

**Interfaces:**
- Produces: `public.todos` and `public.sync_todo_lww(...)`.

- [ ] **Step 1: Add Supabase CLI and initialize**

```bash
npm install -D supabase
npx supabase init
```

- [ ] **Step 2: Create failing pgTAP security tests**

Use fixed IDs:

```sql
-- user A: 11111111-1111-1111-1111-111111111111
-- user B: 22222222-2222-2222-2222-222222222222
-- todo:   aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
```

Tests must prove:

```text
table exists
user A sees own row
user B cannot see A row
user B cannot update A row
same UUID retry produces one row
newer updated_at wins
a later-arriving older updated_at cannot overwrite it
```

- [ ] **Step 3: Create migration**

```sql
create table public.todos (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) > 0),
  completed boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz null
);

create index todos_user_updated_idx on public.todos (user_id, updated_at desc);
alter table public.todos enable row level security;

grant select, insert, update, delete on public.todos to authenticated;

create policy "users select own todos" on public.todos
for select to authenticated using ((select auth.uid()) = user_id);

create policy "users insert own todos" on public.todos
for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "users update own todos" on public.todos
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users delete own todos" on public.todos
for delete to authenticated using ((select auth.uid()) = user_id);
```

Add `public.sync_todo_lww(p_id uuid, p_title text, p_completed boolean, p_created_at timestamptz, p_updated_at timestamptz, p_deleted_at timestamptz)` as `security invoker`. It must insert with `user_id = auth.uid()` and on conflict update only when `excluded.updated_at >= public.todos.updated_at`; return the accessible canonical row even when the incoming row loses.

- [ ] **Step 4: Run database verification**

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add package.json package-lock.json supabase
git commit -m "feat: add supabase todo schema and rls"
```

---

### Task 6: Add the Supabase Remote Adapter and Custom Sync Engine

**Files:**
- Create: `src/sync/types.ts`
- Create: `src/sync/supabaseTodoRemote.ts`
- Create: `src/sync/supabaseTodoRemote.test.ts`
- Modify: `src/storage/todoRepository.ts`
- Modify: `src/storage/todoRepository.test.ts`
- Create: `src/sync/syncEngine.ts`
- Create: `src/sync/syncEngine.test.ts`

**Interfaces:**
- Produces: `SupabaseTodoRemote`, `remoteToLocal()`, `syncTodos()`.

- [ ] **Step 1: Define remote mapping**

```ts
export function remoteToLocal(row: RemoteTodoRecord, ownerKey: OwnerKey): LocalTodoRecord {
  return {
    id: row.id,
    ownerKey,
    title: row.title,
    completed: row.completed,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    deletedAt: row.deleted_at ? Date.parse(row.deleted_at) : null,
    syncStatus: "synced",
    lastSyncError: null,
  };
}
```

- [ ] **Step 2: Write adapter tests**

`push()` must call RPC with:

```ts
{
  p_id: todo.id,
  p_title: todo.title,
  p_completed: todo.completed,
  p_created_at: new Date(todo.createdAt).toISOString(),
  p_updated_at: new Date(todo.updatedAt).toISOString(),
  p_deleted_at: todo.deletedAt === null ? null : new Date(todo.deletedAt).toISOString(),
}
```

`list()` must select:

```text
id,user_id,title,completed,created_at,updated_at,deleted_at
```

and order by `updated_at` ascending. Do not send an arbitrary `user_id`; RLS/auth determines ownership.

- [ ] **Step 3: Write sync engine tests**

Cover exactly:

```text
anonymous rows claimed before authenticated push
pending row pushed and canonical row stored
syncing row retried after simulated crash
error row retried
push error preserves local mutation and records error
remote missing row pulled locally
remote tombstone hidden from listVisible
local retryable row not overwritten by pull
duplicate UUID retry remains one local row
canonical newer remote winner replaces pushed local loser
```

- [ ] **Step 4: Implement `syncTodos()`**

```ts
export async function syncTodos(
  repository: LocalTodoRepository,
  remote: TodoRemote,
  userId: string,
): Promise<SyncResult> {
  const ownerKey = ownerKeyForUser(userId);
  await repository.claimAnonymous(ownerKey);

  let pushed = 0;
  let pulled = 0;
  let errors = 0;

  for (const todo of await repository.listRetryable(ownerKey)) {
    try {
      await repository.markSyncing(todo.id);
      const canonical = await remote.push(todo);
      await repository.putCanonical(remoteToLocal(canonical, ownerKey));
      pushed += 1;
    } catch (error) {
      await repository.markError(
        todo.id,
        error instanceof Error ? error.message : "Unknown sync error",
      );
      errors += 1;
    }
  }

  try {
    for (const row of await remote.list()) {
      await repository.putRemote(remoteToLocal(row, ownerKey));
      pulled += 1;
    }
  } catch {
    errors += 1;
  }

  return { pushed, pulled, errors };
}
```

Run:

```bash
npx vitest run src/sync/supabaseTodoRemote.test.ts src/storage/todoRepository.test.ts src/sync/syncEngine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/sync src/storage/todoRepository.ts src/storage/todoRepository.test.ts
git commit -m "feat: add offline todo sync engine"
```

---

### Task 7: Integrate Auth Ownership, Sync Lifecycle, and Status Without Redesigning the UI

**Files:**
- Create: `src/hooks/useTodoSync.ts`
- Create: `src/hooks/useTodoSync.test.tsx`
- Create: `src/components/SyncStatus.tsx`
- Modify: `src/hooks/useTodoAppState.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.css` only for minimal auth/sync-status layout

**Interfaces:**
- Produces: `useTodoSync(userId, refresh)` with `{ status, lastError, requestSync }`.

```ts
export type UiSyncStatus = "offline" | "idle" | "syncing" | "error";
```

- [ ] **Step 1: Write lifecycle tests**

Assert:

```text
no signed-in user -> no cloud sync
signed-in + online startup -> sync runs
offline startup -> status offline, no cloud call
online event -> sync runs
window focus -> sync runs
sync errors -> status error
successful sync -> refresh called
second request during in-flight sync -> exactly one follow-up run occurs
```

- [ ] **Step 2: Implement coalescing `useTodoSync`**

Use refs:

```ts
const inFlightRef = useRef(false);
const rerunRequestedRef = useRef(false);
```

If `requestSync()` is called while in flight, set `rerunRequestedRef.current = true` and return. After the active run finishes, run once more if that flag was set.

- [ ] **Step 3: Integrate effective owner selection**

In `App.tsx` use:

```ts
const { user, localUserId } = useAuth();
const effectiveUserId = user?.id ?? localUserId;
const ownerKey = effectiveUserId ? ownerKeyForUser(effectiveUserId) : "anonymous";
const local = useTodoAppState(ownerKey);
const sync = useTodoSync(user?.id ?? null, local.refresh);
```

Important distinction:

```text
effectiveUserId -> local IndexedDB visibility
user?.id        -> authorization to contact Supabase
```

A remembered offline owner may access local rows but must not perform cloud sync without a valid authenticated Supabase user.

- [ ] **Step 4: Trigger best-effort sync after durable local mutations**

Wrap App handlers:

```ts
const handleAdd = async (title: string) => {
  await local.add(title);
  void sync.requestSync();
};
```

Apply the same sequence to toggle/edit/delete. Network failure must not reverse the local operation.

- [ ] **Step 5: Render auth and sync status minimally**

Add `AuthPanel` and `SyncStatus` without changing Todo Pop's core layout.

Required accessible status strings:

```text
Offline — changes saved on this device
Syncing…
Synced
Sync issue — local changes are safe
```

- [ ] **Step 6: Run integration verification and commit**

```bash
npx vitest run src/hooks/useTodoSync.test.tsx src/hooks/useTodoAppState.test.tsx
npm test
npm run lint
npm run build

git add src/hooks/useTodoSync* src/hooks/useTodoAppState.ts src/components/SyncStatus.tsx src/App.tsx src/App.css
git commit -m "feat: integrate offline sync lifecycle"
```

---

### Task 8: Two-Device Regression, Documentation, and Deployment Readiness

**Files:**
- Create: `src/sync/offlineMultiDevice.test.ts`
- Modify: `README.md`
- Verify: `.gitignore`
- Verify: `.env.example`

**Interfaces:**
- Consumes: complete local repository + sync engine + remote contract.
- Produces: regression proof for two independent browser databases and production setup instructions.

- [ ] **Step 1: Add two-device integration regression test**

Create two independent Dexie DBs and one in-memory LWW remote. Use the same authenticated UUID on both devices.

Exact flow:

```text
A offline: create X at 10:00
A syncs: cloud gets X
B syncs: B gets X
A offline: edit X at 11:00
B offline: edit X at 12:00
B syncs first: cloud winner is 12:00
A syncs later: remote returns 12:00 canonical winner
A and B sync: both show B's 12:00 text
A deletes X at 13:00 and syncs
B syncs: X no longer visible, tombstone remains
```

Assert one stable UUID and no duplicate rows on either device.

- [ ] **Step 2: Run complete automated suite**

```bash
npm test
npm run lint
npm run build
npx supabase db reset
npx supabase test db
```

Expected: PASS.

- [ ] **Step 3: Update README for the real architecture**

Document:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Explain:

```text
IndexedDB/Dexie = durable local todo store
localStorage = legacy migration + local filter only
Service Worker = offline app shell
Supabase = authenticated cloud source of truth
RLS = browser authorization boundary
Cloudflare Worker/ChatGPT = future separate phase
```

State explicitly that publishable keys are intentionally browser-visible and server/service-role secrets must never use `VITE_` variables.

- [ ] **Step 4: Configure Supabase development project**

Apply the migration, enable email/password Auth, create two test users, and manually verify RLS isolation. Never use a service-role key in the browser.

- [ ] **Step 5: Configure frontend deployment variables**

Set:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

in the actual hosting provider's build environment. If the project is on Cloudflare Pages, set them in both Preview and Production environments. Do not assume Cloudflare-specific configuration if deployment has moved elsewhere.

- [ ] **Step 6: Perform real-browser migration and offline smoke test before broad use**

On the browser/device that currently contains real `todos_app_v1` data:

```text
1. Before deploying, make a manual JSON backup from localStorage if possible.
2. Deploy the migration build.
3. Open the app online once.
4. Verify every old todo still exists with the same title/completed state.
5. Verify `todos_app_v1` is removed only after successful IndexedDB migration.
6. Reload and verify persistence.
7. Turn networking off and reload; verify app shell + todos still open.
8. Create/edit/toggle/delete test todos offline.
9. Reconnect and verify sync reaches Synced.
10. Sign in on a second browser/device and verify canonical todos arrive.
```

- [ ] **Step 7: Secret scan**

```bash
git grep -nE 'sb_secret_|service_role|SUPABASE_SERVICE_ROLE' -- ':!docs/**'
git status --short
```

Expected: no source/frontend secret matches.

- [ ] **Step 8: Commit Task 8**

```bash
git add README.md src/sync/offlineMultiDevice.test.ts .env.example .gitignore
git commit -m "test: verify multi-device offline sync"
```

---

## Plan Self-Review

### Existing-code preservation

- Existing React/Vite/TypeScript stack retained: all tasks.
- Existing presentational components retained: Tasks 2 and 7.
- Existing filter semantics and selectors retained: Task 2.
- Existing reducer remains the pure UI state transition boundary, adapted for repository-returned records: Task 2.
- Existing real `todos_app_v1` data preserved: Task 1 and Task 8.

### Spec coverage

- IndexedDB/Dexie: Task 1.
- Legacy data migration with stable IDs/createdAt: Task 1.
- Filter preference local-only: Tasks 1-2.
- Durable local-first CRUD: Tasks 1-2 and 7.
- Offline app reopening: Task 3.
- Supabase Auth and offline owner identity: Task 4.
- PostgreSQL + RLS: Task 5.
- Browser publishable key only: Tasks 4 and 8.
- Tombstones/idempotency/LWW: Tasks 1, 5, 6, 8.
- Retry after crash/failure: Tasks 1, 6, 7.
- Sync on startup/mutation/reconnect/focus: Task 7.
- Two-device reconciliation: Task 8.
- Agent/Worker API: deliberately excluded per spec.

### Type consistency

- UI Todo keeps `id`, `title`, `completed`, `createdAt`.
- Local persistence adds `ownerKey`, `updatedAt`, `deletedAt`, `syncStatus`, `lastSyncError`.
- Local timestamps are numeric milliseconds.
- Remote PostgreSQL timestamps are ISO `timestamptz` strings.
- Adapter is the only timestamp conversion boundary.
- `TodoRemote.push()` and `TodoRemote.list()` are the only sync-engine cloud interfaces.

### Known v1 trade-off

LWW depends on client clocks. Material clock skew can select the wrong winner. This is accepted for v1 because the approved architecture explicitly favors a simple deterministic sync model over CRDT/version-vector complexity.
