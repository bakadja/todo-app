# Share to Todo Pop Implementation Plan

> Updated 2026-09-05 after validating the Web Share Target GET semantics. The final contract uses namespaced query parameters instead of an `action` query marker.

**Goal:** Add Android Web Share Target support so an installed Todo Pop PWA can receive shared text/links into a dedicated editable card, then create a normal offline-first Todo through the existing add/sync pipeline.

**Architecture:** The PWA manifest registers a GET `share_target` with `action: "/"` and maps Android share fields to `share_title`, `share_text`, and `share_url`. A pure utility detects those namespaced parameters, normalizes the payload, and removes only consumed share params. `App.tsx` owns the temporary draft and renders `SharedTodoCard`; Add reuses the existing `handleAdd(title)` pipeline.

**Spec:** `docs/superpowers/specs/2026-09-05-share-to-todo-pop-design.md`

## Constraints

- Android/Chromium installed PWA is the target.
- Accept only title, text, and URL; no attachments/files.
- Use one editable multiline confirmation field.
- Use GET `share_target` with `action: "/"`.
- Use namespaced query params: `share_title`, `share_text`, `share_url`.
- Do not add a router, backend endpoint, storage schema, Supabase schema, or sync path.
- Preserve unrelated query parameters and hashes during cleanup.
- Capture must work offline and signed out through the existing local owner path.
- Add reuses `local.add(title)` then `sync.requestSync()`.
- Cancel creates nothing.
- Follow TDD.

## Files

Create:

- `src/utils/sharedTodo.ts`
- `src/utils/sharedTodo.test.ts`
- `src/components/SharedTodoCard.tsx`
- `src/components/SharedTodoCard.css`
- `src/components/SharedTodoCard.test.tsx`
- `src/App.test.tsx`

Modify:

- `src/App.tsx`
- `vite.config.ts`
- `.github/workflows/ci.yml`

Documentation:

- `docs/superpowers/specs/2026-09-05-share-to-todo-pop-design.md`
- this plan

No storage, auth, reducer, sync-engine, Supabase, or migration files should change.

---

## Task 1 — Parse namespaced shared Todo payloads

Implement these pure interfaces:

```ts
isShareTargetSearch(search: string): boolean
normalizeSharedTodo(params: SharedTodoParams): string | null
readSharedTodoFromSearch(search: string): string | null
stripShareTargetParams(url: URL): string
```

Contract:

```ts
export const SHARE_TARGET_PARAMS = {
  title: "share_title",
  text: "share_text",
  url: "share_url",
} as const;
```

Required tests:

- any namespaced param marks a share launch;
- ordinary `title/text/url` params do not;
- title, text, URL combine in order;
- exact URL already present in text is not duplicated;
- blanks are ignored;
- duplicate top-level values collapse;
- URL-only share works;
- empty normalized payload returns null;
- cleanup removes only namespaced params and preserves unrelated query/hash values.

TDD gate:

1. Write/adjust tests for namespaced params.
2. Verify they fail against marker-based implementation.
3. Implement namespaced parser/cleanup.
4. Verify parser tests and lint pass.

---

## Task 2 — Build SharedTodoCard

Component contract:

```ts
initialValue: string
onAdd(value: string): void
onCancel(): void
```

Requirements:

- `Shared todo` heading;
- one editable textarea;
- touch-friendly Cancel/Add actions;
- Add sends trimmed text;
- whitespace-only text cannot be added;
- component imports no storage, auth, Supabase, or sync modules.

TDD gate:

1. Component tests first.
2. Confirm RED because component is absent.
3. Implement component and responsive CSS.
4. Verify component tests and lint.

---

## Task 3 — Integrate temporary share state into App

At App startup:

```text
window.location.search
        ↓
isShareTargetSearch()
        ↓
readSharedTodoFromSearch()
        ↓
temporary sharedTodo state
        ↓
stripShareTargetParams() + history.replaceState()
```

Render `SharedTodoCard` after sync status and before normal Todo input.

Add must reuse the existing handler:

```text
SharedTodoCard Add
      ↓
handleSharedAdd(title)
      ↓
handleAdd(title)
      ↓
local.add(title)
      ↓
sync.requestSync()
```

Required App tests:

- namespaced share renders the card;
- consumed namespaced params are removed;
- unrelated query params are preserved;
- ordinary title/url params are ignored;
- Add calls existing add + sync behavior;
- Cancel calls neither add nor sync;
- remount after cleanup does not recreate the draft;
- root load without namespaced payload shows no card.

No persistence occurs before Add.

---

## Task 4 — Register Todo Pop in Android Share

Generated manifest contract must be exactly:

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

TDD gate:

1. Change the CI manifest assertion first.
2. Confirm tests/lint/build pass but generated-manifest assertion fails against the old marker contract.
3. Change `vite.config.ts` to the namespaced manifest above.
4. Verify generated-manifest assertion passes.

Why the change from the original marker design: a GET Web Share Target sets the target URL query from submitted form data, so an `action` query marker cannot be relied on. Namespaced fields provide the share signal without a router or POST handler.

---

## Task 5 — Full automated verification

Required CI evidence:

```text
[ ] runtime dependency audit passes
[ ] 77/77 Vitest tests pass
[ ] ESLint passes
[ ] TypeScript + Vite build passes
[ ] dist/sw.js exists
[ ] dist/manifest.webmanifest exists
[ ] manifest share_target contract passes
[ ] Supabase server-secret scan passes
[ ] local Supabase starts
[ ] local DB reset passes
[ ] pgTAP database tests pass
[ ] Supabase cleanup passes
```

Repository sanity:

```text
[ ] only feature/docs/CI/PWA files changed
[ ] no storage/auth/sync/schema files changed
[ ] PR remains Draft until Xiaomi acceptance passes
```

---

## Task 6 — Xiaomi acceptance gate

Because Android share-target registration is manifest-driven, test the installed PWA after the updated deployment. If Todo Pop does not appear after the manifest changes, reinstall the PWA before treating that as a code defect.

Acceptance matrix:

```text
[ ] Chrome → Share lists Todo Pop
[ ] sharing a page opens Shared todo card
[ ] textarea contains normalized shared content
[ ] duplicate URL appears only once
[ ] content can be edited
[ ] Add closes the card and creates a normal Todo
[ ] online + signed-in Todo syncs normally
[ ] offline Todo is created locally
[ ] signed-out Todo works and later follows existing anonymous claim/sync
[ ] Cancel creates nothing
[ ] refresh after consumption does not reopen the card
[ ] normal app behavior remains unchanged
```

Do not mark the PR ready for merge until this real-device gate passes.
