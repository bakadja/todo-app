# Offline-First Sync Design

Date: 2026-09-04
Repository: `bakadja/todo-app`
Default branch: `master`
Status: Approved architecture adapted to the current codebase; pending implementation

## 1. Goal

Evolve the existing React todo application from browser-local `localStorage` persistence into an offline-first, multi-device application while preserving the current UI, reducer-driven behavior, filters, and tests.

The target experience is:

- existing todos currently stored under `localStorage["todos_app_v1"]` are preserved during migration;
- the app can reopen offline after it has been loaded online at least once;
- create, edit, toggle, delete, and filter continue to work without network access;
- todos are persisted locally in IndexedDB immediately;
- authenticated users synchronize their todos through Supabase when connectivity is available;
- the same account sees the synchronized canonical state on other devices;
- the architecture remains ready for a later ChatGPT/agent API without exposing privileged Supabase credentials to the browser.

## 2. Current Codebase to Preserve

The current application already has useful boundaries and they should be retained rather than rebuilt.

### Existing frontend stack

- React 19.2
- TypeScript 5.9
- Vite 7.2
- Vitest 4
- CSS-based UI

### Existing behavior

- add todo;
- toggle completed state;
- edit title;
- remove todo;
- filters: `all`, `active`, `completed`;
- local persistence under key `todos_app_v1`.

### Existing architecture

- `src/App.tsx` composes the UI and currently wires persistence;
- `src/state/todosReducer.ts` owns pure todo/filter transitions;
- `src/state/selectors.ts` derives filtered todos and counts;
- `src/storage/localStorage.ts` owns current serialization;
- `src/components/*` provide the current UI;
- reducer/selectors/storage already have Vitest coverage.

These boundaries are assets. The offline-first work should replace and extend persistence/synchronization without redesigning the user interface or replacing the reducer with an unrelated state library.

## 3. Chosen Architecture

```text
Cloudflare/static hosting
        |
        v
Service Worker / cached app shell
        |
        v
React UI + existing reducer/selectors
        |
        v
Local todo repository
        |
        v
Dexie.js -> IndexedDB
        |
        | custom push/pull synchronization
        v
Supabase Auth + PostgreSQL + RLS
        ^
        |
Cloudflare Worker (later, privileged agent API only)
        ^
        |
ChatGPT / external agents
```

### Frontend

Keep the existing React/TypeScript/Vite application and visual components.

### Local persistence

Replace `localStorage` as the authoritative todo store with IndexedDB through Dexie.js.

IndexedDB becomes the durable local database for todos and synchronization metadata. Each browser/device has its own local database.

### UI state

Keep the reducer/selectors model for UI behavior. The reducer remains responsible for pure state transitions and filtering semantics; persistence becomes an explicit repository responsibility rather than being serialized wholesale by `App.tsx` after every render change.

### Cloud backend

Use Supabase for:

- PostgreSQL cloud storage;
- Supabase Auth;
- Row Level Security;
- browser-safe publishable key usage;
- HTTPS/RPC access from the frontend.

The browser communicates directly with Supabase for ordinary authenticated synchronization. A Cloudflare Worker is not required to hide the publishable Supabase key.

### Future agent integration

A Cloudflare Worker is reserved for a later phase where ChatGPT or another external agent can create/update todos through a narrow authenticated API. Server-only Supabase credentials must never be included in Vite/browser code.

## 4. State and Data Model

### Existing UI Todo

The current domain shape is:

```ts
export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
};
```

This user-facing shape should remain recognizable so existing components/selectors require minimal change.

### Local persisted Todo

The IndexedDB representation adds synchronization metadata:

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
```

`createdAt` stays numeric to preserve the current model without needless conversion inside UI code. The Supabase adapter converts millisecond timestamps to/from PostgreSQL `timestamptz` values.

### Filter state

The filter is local UI preference and is not synchronized across devices.

It may remain in lightweight browser storage under a dedicated key such as `todos_app_filter_v1`, independent of the IndexedDB todo database.

## 5. Migration of Existing Todos

Preserving current real user data is a hard requirement.

The current key `todos_app_v1` stores a `State` object containing both `todos` and `filter`.

Migration rules:

1. read and validate `todos_app_v1`;
2. if the payload is valid, copy every existing todo into IndexedDB with the same `id`, `title`, `completed`, and `createdAt`;
3. set `updatedAt` to the migration timestamp because the legacy format did not record last-edit time;
4. set `deletedAt = null`;
5. assign `ownerKey = "anonymous"` until the first authenticated claim;
6. set `syncStatus = "pending"` so migrated todos can be uploaded later;
7. preserve the previous filter under the new local filter preference key;
8. mark migration complete in IndexedDB metadata;
9. only remove `todos_app_v1` after the IndexedDB transaction succeeds;
10. malformed/unrecognized legacy data must remain untouched rather than being deleted.

Running the migration twice must not duplicate todos.

## 6. Authentication and Offline Ownership

Version 1 uses Supabase email/password authentication.

The app remains usable anonymously/offline before sign-in.

When a user signs in on a browser that contains anonymous todos, those todos are claimed locally by that user and then synchronized.

Each authenticated todo belongs to exactly one Supabase `user_id`.

RLS policies must ensure authenticated users can only select/insert/update/delete their own rows.

An explicit sign-out must not delete locally stored todos. The app should keep a small local active-owner pointer so an already-known user's local todos remain available when the network is unavailable or token refresh cannot complete. Explicit sign-out clears the active-owner pointer.

## 7. Offline App Shell

IndexedDB stores data, but it does not guarantee that the JavaScript application itself can launch without Internet access.

Use a Vite-compatible service worker/PWA layer to cache the built application shell and static assets.

Expected behavior:

- first-ever visit still requires network access;
- after a successful online load, the deployed app can reopen offline;
- offline startup reads todos from IndexedDB;
- a failed network request must not prevent local CRUD.

The service worker is responsible for application availability, not todo synchronization.

## 8. Synchronization Strategy

Keep synchronization intentionally simple and deterministic.

### Push

Local rows with `pending`, `syncing`, or `error` status are retryable.

For each retryable row:

1. mark it `syncing`;
2. send it to an authenticated Supabase RPC;
3. use the returned canonical row as the local winner;
4. mark the canonical local row `synced`;
5. if the request fails, keep the local mutation and mark it `error`.

Rows left in `syncing` because of a crash/reload are retried on the next run.

### Pull

After push, fetch the authenticated user's cloud todos and reconcile them locally.

Remote rows may replace local `synced` rows. A remote pull must not overwrite a local row that is still `pending`, `syncing`, or `error`; that local mutation must first go through push/conflict resolution.

### Conflict resolution

Version 1 uses deterministic last-write-wins based on `updated_at`.

A PostgreSQL RPC performs the upsert atomically and only applies an incoming write when its update timestamp is not older than the stored row. It returns the canonical winner in either case.

Client clock skew is an accepted v1 trade-off. CRDTs/version vectors are out of scope.

### Deletes

Deletes use tombstones via `deleted_at` rather than immediate hard deletion.

A deleted todo disappears from visible selectors/UI but remains locally/remotely long enough to synchronize across devices and prevent resurrection.

## 9. Synchronization Triggers

Synchronization should run on:

- authenticated app startup while online;
- successful local todo mutation;
- browser `online` event;
- window/tab focus after the app returns to foreground.

Overlapping sync requests must be coalesced. If a new sync is requested while one is running, one follow-up run must occur after the current run completes.

Local CRUD must never await network success.

## 10. Security

Browser code may contain only:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY`.

Never expose:

- `sb_secret_...` keys;
- legacy `service_role` credentials;
- privileged server credentials through a `VITE_` variable.

RLS is mandatory and is the authorization boundary for browser-originated requests.

The later agent/Worker API must expose narrow todo operations rather than generic database access.

## 11. Error Handling

Required behavior:

- IndexedDB write fails: show a local persistence error and do not pretend the change was saved;
- network unavailable: local CRUD continues and rows remain retryable;
- Supabase write fails: preserve local mutation and expose non-destructive sync error state;
- auth refresh unavailable: preserve local data and pause protected cloud sync;
- malformed legacy localStorage: leave the legacy value untouched;
- duplicate retry: stable UUID + RPC upsert must remain idempotent;
- crash during `syncing`: retry on next synchronization cycle.

## 12. Testing Strategy

Preserve all current reducer/selectors/storage behavior tests that remain relevant.

Add tests for:

- IndexedDB CRUD and tombstones;
- migration of `todos_app_v1` without changing existing IDs/timestamps;
- malformed legacy data preservation;
- migration idempotency;
- local filter preference preservation;
- anonymous todo claim after sign-in;
- local CRUD while offline;
- retry of `pending`, `syncing`, and `error` rows;
- failed cloud writes preserving local data;
- canonical LWW conflict resolution;
- RLS isolation between two users;
- two independent IndexedDB databases representing two devices;
- deletion propagation without resurrection;
- service-worker/PWA build output;
- full production build and lint/test suite.

## 13. Scope Boundaries

Out of scope for this implementation:

- redesigning the existing UI;
- replacing reducer/selectors with Redux/Zustand or another state library;
- priorities, due dates, recurring tasks, attachments, collaboration, or shared lists;
- push notifications;
- CRDTs/version vectors;
- native mobile apps;
- PowerSync/Firebase/Appwrite;
- Cloudflare Worker/ChatGPT agent endpoint implementation.

The agent API is a separate follow-up project after user synchronization is stable.

## 14. Final Architecture Summary

```text
Existing Todo Pop UI/components
          |
          v
Existing reducer + selectors
          |
          v
Local repository
          |
          v
Dexie / IndexedDB
          |             service worker
          |             caches app shell
          v
Custom sync engine
          |
          v
Supabase Auth + PostgreSQL + RLS

Later:
ChatGPT -> Cloudflare Worker -> Supabase
```

The primary architectural change is therefore not a rewrite of `todo-app`; it is the replacement of whole-state `localStorage` persistence with a durable local database and a synchronization boundary while preserving the existing application behavior.