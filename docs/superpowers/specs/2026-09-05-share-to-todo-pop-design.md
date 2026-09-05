# Share to Todo Pop — Design

Date: 2026-09-05
Branch: `feat/share-to-todo-pop`

## Goal

Allow Todo Pop, when installed as an Android PWA, to appear in the Android Share menu so text and links from apps such as Chrome or YouTube can be captured as a Todo with minimal friction.

Shared content is never created immediately. Todo Pop first shows a dedicated editable `Shared todo` card. The user can edit the content, cancel, or add it. `Add` reuses the existing Todo creation path so offline-first storage and sync semantics remain unchanged.

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

The textarea can contain a title, shared text, and URL separated by line breaks. `Add` closes the card immediately and creates the task. `Cancel` closes the card and creates nothing.

## Scope

In scope:

- Android/Chromium Web Share Target support for the installed PWA.
- Shared title, text, and URL values.
- A dedicated responsive `SharedTodoCard`.
- One editable textarea containing normalized shared content.
- Reuse of the existing `handleAdd(title)` path.
- Capture while offline and while signed out.
- URL cleanup after the payload is consumed.
- Automated parser, component, App integration, and manifest-contract tests.
- Manual validation on the Xiaomi device.

Out of scope:

- Images, PDFs, files, attachments, or binary uploads.
- Multiple shared items in one action.
- A new router or backend endpoint.
- Supabase, IndexedDB, Todo-model, auth, or sync changes.
- Guaranteed iOS or desktop share-sheet parity.

## Architecture

```text
vite.config.ts manifest
        ↓
Android Web Share Target
        ↓
GET /?share_title=...&share_text=...&share_url=...
        ↓
sharedTodo utility
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

The share feature has no separate persistence or synchronization path.

## Web Share Target contract

The manifest uses a GET target:

```text
share_target.action = "/"
share_target.method = "GET"
share_target.enctype = "application/x-www-form-urlencoded"
share_target.params = {
  title: "share_title",
  text: "share_text",
  url: "share_url"
}
```

The namespaced query names are intentional. A GET Web Share Target sets the target URL query from the submitted form data, so a marker embedded in the `action` query cannot be relied on. Namespaced parameters provide an unambiguous signal without adding a route or POST/service-worker form handler.

Normal application URLs such as `?title=...&url=...` must not be interpreted as shares.

An empty share produces no namespaced payload and therefore behaves like a normal root load; no card is shown and no cleanup is needed.

## Shared-content parsing

`src/utils/sharedTodo.ts` is a pure utility with no React, auth, storage, Supabase, or sync dependency.

The share is considered present when at least one of these query parameters exists:

- `share_title`
- `share_text`
- `share_url`

Normalization rules:

1. Trim leading and trailing whitespace from each supplied value.
2. Ignore empty values.
3. Preserve meaningful line breaks inside supplied text.
4. Do not append the standalone URL when that exact URL is already present in shared text.
5. Collapse identical duplicate top-level values.
6. Join remaining values with a single newline.
7. Return no draft when the normalized result is empty.

Example:

```text
share_title = "PostgreSQL Indexing Explained"
share_text  = "https://youtu.be/abc123"
share_url   = "https://youtu.be/abc123"

result:
PostgreSQL Indexing Explained
https://youtu.be/abc123
```

## Consuming the share payload

On app startup:

1. Detect whether any namespaced share parameter exists.
2. Read `share_title`, `share_text`, and `share_url` from `window.location.search`.
3. Normalize the values.
4. Initialize temporary shared-card state only when meaningful content exists.
5. Remove only the namespaced share parameters with `history.replaceState()`, preserving unrelated query parameters and the hash.
6. Persist nothing before `Add`.

Immediate URL cleanup prevents refresh from recreating an already-consumed draft.

## SharedTodoCard

Responsibilities:

- Show a clear `Shared todo` heading.
- Render one multiline textarea initialized with normalized content.
- Allow editing before save.
- Provide touch-friendly `Cancel` and `Add` actions.
- Prevent creation for whitespace-only edited content.
- Remain unaware of IndexedDB, Supabase, auth, and sync.

## App integration

`App.tsx` owns only the temporary shared-card state.

On `Add`:

```text
clear shared-card state
        ↓
handleAdd(title)
        ↓
local.add(title)
        ↓
sync.requestSync()
```

On `Cancel`, only the temporary card state is cleared. No Todo is created and no share-specific sync is triggered.

## Offline and signed-out behavior

The feature requires neither authentication nor network access. Signed-out shares use the same anonymous local owner as normal Todos. Later sign-in continues to rely on the existing anonymous-claim and sync behavior.

No schema, migration, or reconciliation logic is introduced for sharing.

## Edge cases

- Empty or whitespace-only payload: no card.
- Whitespace-only edited value: cannot be added.
- Malformed/non-URL content in `share_url`: keep it as text rather than rejecting the payload.
- Duplicate URL in shared text and URL field: keep one copy.
- Refresh after consumption: do not reopen the card.
- Ordinary `title`, `text`, or `url` query params: ignore them for share capture.
- Unrelated query parameters/hash: preserve them during cleanup.
- Storage/sync errors after Add: use existing Todo behavior.

## Automated testing

Parser tests cover:

- namespaced share detection;
- ordinary query params being ignored;
- title/text/URL normalization;
- duplicate URL suppression;
- blank and URL-only cases;
- cleanup that preserves unrelated query/hash values.

Component tests cover textarea rendering, editing, Add, Cancel, and whitespace-only prevention.

App tests cover namespaced launch consumption, URL cleanup, ordinary query-param isolation, existing add/sync reuse, Cancel, and no draft recreation after remount.

CI builds the PWA and asserts the generated `manifest.webmanifest` contains exactly:

```json
{
  "action": "/",
  "method": "GET",
  "enctype": "application/x-www-form-urlencoded",
  "params": {
    "title": "share_title",
    "text": "share_text",
    "url": "share_url"
  }
}
```

## Xiaomi acceptance gate

With Todo Pop installed from the updated deployment:

1. Confirm Todo Pop appears in Android Share from Chrome.
2. Share a page and confirm the dedicated card opens.
3. Confirm title/text/URL normalization and duplicate URL suppression.
4. Edit and press Add; confirm a normal Todo is created.
5. Confirm online signed-in sync.
6. Repeat offline and confirm local creation.
7. Repeat signed out, then sign in and confirm existing anonymous claim/sync behavior.
8. Press Cancel on another share and confirm no Todo is created.
9. Refresh after consumption and confirm the card does not return.
10. Confirm normal add/edit/toggle/remove behavior is unchanged.

If Android does not expose Todo Pop after the updated manifest is deployed, reinstall the PWA before treating that as an application defect because share-target registration is install-manifest driven.

## Acceptance criteria

The feature is complete when:

- Todo Pop appears in Android Share on a supported installed PWA.
- Shared title/text/URL are combined into one editable field.
- Exact duplicate URLs are not repeated.
- Add creates a normal Todo through the existing offline-first pipeline.
- Cancel creates nothing.
- Offline and signed-out capture work through existing behavior.
- Refresh does not recreate a consumed draft.
- Existing auth, IndexedDB, Supabase, and sync semantics remain unchanged.
- Full CI passes.
- Manual Xiaomi validation passes.
