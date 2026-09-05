# Share to Todo Pop — Design

Date: 2026-09-05
Branch: `feat/share-to-todo-pop`

## Goal

Allow Todo Pop, when installed as an Android PWA, to appear in the Android Share menu so text and links from apps such as Chrome or YouTube can be captured as a Todo with minimal friction.

Shared content is never created immediately. Todo Pop first shows a dedicated editable `Shared todo` card. The user can edit the content, cancel, or add it. `Add` must reuse the existing Todo creation path so offline-first storage and sync semantics remain unchanged.

## Approved UX

```text
Chrome / YouTube / another Android app
                ↓
              Share
                ↓
            Todo Pop
                ↓
      dedicated "Shared todo" card
                ↓
        one editable textarea
                ↓
       Cancel            Add
         ↓                ↓
   create nothing     normal Todo
                          ↓
                      IndexedDB
                          ↓
                    existing sync
                          ↓
                       Supabase
```

The card contains one editable multiline field. It may contain a title, shared text, and URL separated by line breaks.

Example:

```text
PostgreSQL Indexing Explained
https://youtu.be/abc123
```

`Add` closes the card immediately and creates the task. There is no second confirmation screen or success screen.

`Cancel` closes the card and creates nothing.

## Scope

### In scope

- Android/Chromium Web Share Target support for the installed PWA.
- Shared `title`, `text`, and `url` values.
- A dedicated `SharedTodoCard` in the existing app UI.
- One editable textarea containing normalized shared content.
- Reuse of the existing `handleAdd(title)` path.
- Capture while offline.
- Capture while signed out.
- URL cleanup after the share payload is consumed so refresh cannot reopen the same draft.
- Automated tests for parsing, card behavior, and app integration.
- Manual validation on the Xiaomi device.

### Out of scope

- Images, PDFs, files, attachments, or binary uploads.
- Multiple shared items in one action.
- New routes or a router solely for this feature.
- New backend endpoints.
- New Supabase schema or migrations.
- New IndexedDB schema.
- Changes to the Todo data model.
- Changes to auth or sync semantics.
- Guaranteed parity on iOS or desktop share sheets.

## Architecture

```text
vite.config.ts manifest
        ↓
   Web Share Target
        ↓
GET /?share-target=1&title=...&text=...&url=...
        ↓
parseSharedTodo()
        ↓
SharedTodoCard
        ↓ Add
App.handleAdd(title)
        ↓
existing local.add(title)
        ↓
IndexedDB
        ↓
existing sync.requestSync()
        ↓
Supabase when available/authenticated
```

The implementation should remain isolated and reuse existing boundaries rather than introducing a share-specific persistence or sync path.

## PWA manifest

Extend the existing `VitePWA` manifest configuration with a Web Share Target declaration.

Recommended shape:

```text
share_target.action = "/?share-target=1"
share_target.method = "GET"
share_target.enctype = "application/x-www-form-urlencoded"
share_target.params = {
  title: "title",
  text: "text",
  url: "url"
}
```

The explicit `share-target=1` marker prevents normal application query parameters from being interpreted as a share payload.

A GET target is preferred because this feature accepts only text and URLs. POST handling and service-worker form/file plumbing are unnecessary for this scope.

The root app remains the entry point; no routing subsystem is added.

## Shared-content parsing

Create a small pure utility such as `src/utils/sharedTodo.ts`.

Inputs:

- `title`
- `text`
- `url`

Normalization rules:

1. Trim leading and trailing whitespace from each supplied value.
2. Ignore empty values.
3. Preserve meaningful line breaks inside supplied text.
4. Do not append the standalone `url` when that exact URL is already present in `text`.
5. Collapse identical duplicate top-level values.
6. Join remaining values with a single newline.
7. If the normalized result is empty, return no shared Todo and render no card.

Example:

```text
title = "PostgreSQL Indexing Explained"
text  = "https://youtu.be/abc123"
url   = "https://youtu.be/abc123"

result:
PostgreSQL Indexing Explained
https://youtu.be/abc123
```

URL-only example:

```text
title = ""
text  = ""
url   = "https://example.com"

result:
https://example.com
```

The parser must not depend on React, auth, IndexedDB, Supabase, or sync.

## Consuming the share payload

On app startup:

1. Check for the `share-target=1` marker.
2. Read `title`, `text`, and `url` from `window.location.search`.
3. Normalize them with `parseSharedTodo()`.
4. If meaningful content exists, initialize temporary shared-card state.
5. Remove the share marker and share parameters from the visible URL using `history.replaceState()` while preserving unrelated query parameters if any.
6. Do not persist anything before the user presses `Add`.

Cleaning the URL immediately after consumption ensures that refresh cannot recreate the same shared draft.

## SharedTodoCard

Create a focused component such as `src/components/SharedTodoCard.tsx`.

Responsibilities:

- Show a clear `Shared todo` heading.
- Render one multiline textarea initialized with normalized content.
- Allow editing before save.
- Provide `Cancel` and `Add` actions.
- Keep buttons touch-friendly and visually consistent with PR #4.
- Prevent creation when the edited value contains only whitespace.

The component receives callbacks such as:

```text
onAdd(value)
onCancel()
```

It must not know about IndexedDB, Supabase, auth, or sync.

## App integration

`App.tsx` owns the temporary shared-card state because it already owns the central Todo handlers.

On `Add`:

1. Trim the edited shared text.
2. Clear the temporary shared-card state immediately.
3. Call the existing `handleAdd(title)` path.

Existing pipeline:

```text
handleAdd(title)
  → local.add(title)
  → sync.requestSync()
```

No share-specific storage path is introduced.

On `Cancel`:

- clear only the temporary card state;
- do not call `local.add`;
- do not trigger sync for the discarded share.

## Offline and signed-out behavior

The feature must not require authentication or network access.

When signed out, the existing app uses the `anonymous` local owner. A shared Todo added in that state is stored through the same local repository as any other anonymous Todo.

When a user later signs in, the existing `useTodoAppState` flow calls `claimAnonymous(ownerKey)`, which reassigns anonymous local Todos to the authenticated owner and marks them pending for the normal sync engine. The share feature therefore does not need its own migration or reconciliation behavior.

```text
signed out / offline
      ↓
Share → Add
      ↓
anonymous IndexedDB Todo
      ↓
later sign-in
      ↓
existing claimAnonymous()
      ↓
existing sync
      ↓
Supabase
```

This design relies only on behavior that already exists in the application.

## Error and edge-case handling

- Empty payload: render no card.
- Whitespace-only edited value: create nothing.
- Malformed/non-URL content in the `url` parameter: treat it as text rather than rejecting the full payload.
- Duplicate URL values: keep one copy.
- Refresh after payload consumption: do not reopen the card.
- Storage/sync errors after `Add`: use existing Todo add/sync error behavior rather than adding a share-specific error model.
- Regular app URLs that happen to contain `title`, `text`, or `url` but no `share-target=1`: ignore them for share capture.

## Testing

Implementation must follow TDD.

### Parser tests

At minimum:

- combines title + text + URL in order;
- removes an exact duplicate URL already present in text;
- ignores blank fields;
- collapses identical duplicate top-level values;
- handles URL-only shares;
- returns no value for an empty payload.

### Component tests

At minimum:

- renders content in a textarea;
- allows editing before add;
- `Cancel` invokes only `onCancel`;
- `Add` sends the edited value to `onAdd`;
- whitespace-only content cannot be added.

### App/integration tests

At minimum:

- `share-target=1` + share parameters render the dedicated card;
- consumed share parameters are removed from the URL;
- unrelated query parameters are preserved during cleanup;
- a regular app load without the marker does not show the card;
- Add passes the shared text through the same app-level add path as a normal Todo;
- refresh after cleanup does not recreate the card.

## Manual acceptance test

On the Xiaomi device with Todo Pop installed as a PWA:

1. Open a Chrome page and use Android `Share`.
2. Confirm Todo Pop appears as a share destination.
3. Share a page with title + URL.
4. Confirm the dedicated card appears with one editable textarea.
5. Edit the content and press `Add`.
6. Confirm the card disappears immediately and the Todo appears in the list.
7. Confirm normal sync when online and signed in.
8. Repeat offline and confirm local creation still works.
9. Repeat while signed out, then sign in and confirm the existing anonymous-claim/sync behavior carries the Todo into the account.
10. Share again, press `Cancel`, and confirm no Todo is created.
11. Refresh after consuming a share and confirm the card does not return.
12. Test a source where the URL is present in both `text` and `url` and confirm it appears once.

## Acceptance criteria

The feature is complete when:

- Todo Pop appears in the Android Share menu when installed as a supported PWA.
- Shared title/text/URL are combined into one editable field.
- Exact duplicate URLs are not repeated.
- The user can edit before saving.
- `Cancel` creates nothing.
- `Add` creates a normal Todo through the existing add/storage/sync path.
- Capture works offline.
- Capture works while signed out and follows the existing anonymous-claim behavior on later sign-in.
- Refresh does not recreate an already-consumed draft.
- Existing auth, IndexedDB, Supabase, and sync semantics remain unchanged.
- Automated CI passes.
- Manual Xiaomi validation passes.

## Non-functional constraints

- Keep the implementation small and isolated.
- Do not add a router solely for this feature.
- Do not add a backend endpoint.
- Do not modify the Todo schema.
- Do not widen scope to attachments during implementation.
- Follow the current responsive visual language.
