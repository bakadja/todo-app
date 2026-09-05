# Share to Todo Pop — Design

Date: 2026-09-05
Branch: `feat/share-to-todo-pop`

## Goal

Allow an installed Android PWA to appear in the system Share menu so text and links from apps such as Chrome or YouTube can be captured as a Todo Pop task with minimal friction.

The shared content must be shown in a dedicated editable card before creation. The user can either cancel or add it. Adding must reuse the existing Todo creation pipeline so offline-first storage and sync behavior remain unchanged.

## Approved UX

Primary flow:

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

The card uses a single editable text field. It may contain a title, shared text, and URL separated by line breaks.

Example:

```text
PostgreSQL Indexing Explained
https://youtu.be/abc123
```

`Add` immediately closes the card and creates the task through the normal Todo add flow. No intermediate success screen or extra confirmation is shown.

`Cancel` closes the card and creates nothing.

## Scope

### In scope

- Android / Chromium PWA Web Share Target support.
- Shared `title`, `text`, and `url` values.
- A dedicated `SharedTodoCard` shown inside the existing app UI.
- One editable textarea containing normalized shared content.
- Reuse of the existing `handleAdd(title)` path.
- Capture while offline.
- Capture while signed out, using the app's existing local-owner behavior.
- URL cleanup after the share payload is consumed so refresh does not reopen the card.
- Unit/component coverage for parsing and card behavior.
- Manual validation on the Xiaomi device with the installed production/preview PWA.

### Out of scope

- Images.
- PDFs.
- File attachments.
- Binary uploads.
- Multiple shared items in one action.
- New Supabase schema or migrations.
- New IndexedDB schema.
- Changes to the Todo data model.
- Changes to authentication or sync semantics.
- Guaranteed parity on iOS or desktop share sheets.

## Architecture

The implementation should stay intentionally small and reuse existing boundaries.

```text
vite.config.ts manifest
        ↓
   Web Share Target
        ↓
query parameters on app launch
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

### PWA manifest

Add a Web Share Target declaration to the existing `VitePWA` manifest configuration.

Recommended shape:

```text
share_target.action = "/"
share_target.method = "GET"
share_target.enctype = "application/x-www-form-urlencoded"
share_target.params = {
  title: "title",
  text: "text",
  url: "url"
}
```

A GET-based target is preferred because this feature only accepts text and URLs. It avoids the extra service-worker handling required for POST-based file/form payloads.

The root route remains the application entry point; no new routing subsystem is required.

## Shared-content parsing

Create a small pure utility, for example `src/utils/sharedTodo.ts`, responsible for reading and normalizing the share payload.

Inputs:

- `title`
- `text`
- `url`

Normalization rules:

1. Trim leading/trailing whitespace from every supplied value.
2. Ignore empty values.
3. Preserve meaningful line breaks inside supplied text.
4. Avoid adding the standalone `url` if that exact URL is already present in `text`.
5. Avoid duplicate identical top-level values.
6. Join the remaining values using a single newline.
7. If the final normalized string is empty, return no shared Todo and do not render the card.

Examples:

```text
title = "PostgreSQL Indexing Explained"
text  = "https://youtu.be/abc123"
url   = "https://youtu.be/abc123"

result:
PostgreSQL Indexing Explained
https://youtu.be/abc123
```

```text
title = ""
text  = ""
url   = "https://example.com"

result:
https://example.com
```

The parser must remain independent from storage, React state, auth, and sync so it is easy to test.

## Consuming the share payload

When the app starts with share-target parameters:

1. Read the share-target values from `window.location.search`.
2. Normalize them with `parseSharedTodo()`.
3. If meaningful content exists, initialize the temporary shared-card state.
4. Remove only the share-target parameters from the visible URL with `history.replaceState()`.
5. Do not persist the draft share payload to IndexedDB or Supabase before the user presses `Add`.

The URL cleanup is important because reloading the page must not recreate the same shared card.

The share URL should include a marker such as `share-target=1` so regular app query parameters are not accidentally interpreted as shared data.

## SharedTodoCard

Create a focused component, for example `src/components/SharedTodoCard.tsx`.

Responsibilities:

- Show a clear `Shared todo` heading.
- Render one multiline textarea initialized with the normalized content.
- Allow the user to edit the content before saving.
- Provide `Cancel` and `Add` actions.
- Keep controls touch-friendly and consistent with the current mobile design.
- Disable or reject `Add` when the edited value contains only whitespace.

The component should not know about IndexedDB, Supabase, or sync. It receives callbacks such as:

```text
onAdd(value)
onCancel()
```

## App integration

`App.tsx` owns the temporary shared-card state because it already owns the central Todo handlers.

On `Add`:

1. Trim the edited shared text.
2. Call the existing `handleAdd(title)` function.
3. Clear the temporary shared-card state immediately.

This deliberately reuses the current pipeline:

```text
handleAdd(title)
  → local.add(title)
  → sync.requestSync()
```

No special share-specific persistence path should be introduced.

On `Cancel`:

- Clear only the temporary shared-card state.
- Do not call `local.add`.
- Do not trigger sync for the discarded share.

## Offline and signed-out behavior

The share feature must not require authentication or network access.

If the user is signed out or offline:

```text
Share → Todo Pop → Add → existing local IndexedDB owner
```

The task follows the app's existing offline/local behavior. When normal sync later becomes possible under the application's current auth/ownership rules, the existing sync system handles it. The share feature must not add a new synchronization mechanism.

## Error handling

- Empty payload: do not render the card.
- Whitespace-only edited value: do not create a Todo.
- Malformed/non-URL text in the `url` parameter: treat it as text rather than rejecting the whole payload; Android share sources are not assumed to be perfectly consistent.
- Duplicate URL values: keep one copy.
- Repeated page refresh after share consumption: the card must not reappear.
- Storage/sync failure after `Add`: rely on the existing Todo add/sync error behavior rather than creating a separate share-specific error model.

## Testing

Use TDD for implementation.

### Parser tests

At minimum:

- combines title + text + URL in the expected order;
- removes an exact duplicate URL already present in text;
- ignores blank fields;
- collapses duplicate identical top-level values;
- handles URL-only shares;
- returns no value for an empty payload.

### Component tests

At minimum:

- renders the normalized content in a textarea;
- allows editing before add;
- `Cancel` invokes only `onCancel`;
- `Add` sends the edited value to `onAdd`;
- whitespace-only content cannot be added.

### App/integration tests

At minimum:

- share-target query parameters cause the dedicated card to appear;
- consumed share parameters are removed from the URL;
- regular app loads without a share marker do not show the card;
- Add passes the shared text through the same app-level add handler used by normal Todo creation;
- refresh after URL cleanup does not recreate the card.

## Manual acceptance test

On the Xiaomi device with Todo Pop installed as a PWA:

1. Open a Chrome page and use Android `Share`.
2. Confirm Todo Pop appears as a share destination.
3. Share a normal page with title + URL.
4. Confirm the dedicated card appears with one editable textarea.
5. Edit the content and press `Add`.
6. Confirm the card disappears immediately and the Todo appears in the list.
7. Confirm the task follows normal sync behavior when online and signed in.
8. Repeat while offline and confirm the task is still created locally.
9. Share again, press `Cancel`, and confirm no Todo is created.
10. Refresh after consuming a share and confirm the card does not return.
11. Test a source where the URL is present both as `text` and `url` and confirm it appears only once.

## Acceptance criteria

The feature is complete when all of the following are true:

- Todo Pop appears in the Android Share menu when installed as a supported PWA.
- Shared title/text/URL are combined into one editable field.
- Exact duplicate URLs are not repeated.
- The user can edit before saving.
- `Cancel` creates nothing.
- `Add` creates a normal Todo using the existing add/storage/sync path.
- The feature works without a network connection.
- The feature does not require the user to be signed in before capture.
- Refresh does not recreate an already-consumed shared draft.
- Existing auth, IndexedDB, Supabase, and sync behavior remain unchanged.
- Automated CI passes.
- Manual Xiaomi validation passes.

## Non-functional constraints

- Keep the implementation small and isolated.
- Do not add a router solely for this feature.
- Do not add a new backend endpoint.
- Do not modify the Todo schema.
- Do not widen the feature to attachments during implementation.
- Follow the existing responsive visual language introduced in PR #4.
