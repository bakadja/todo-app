# Share to Todo Pop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Android Web Share Target support so an installed Todo Pop PWA can receive shared text/links into a dedicated editable card, then create a normal offline-first Todo through the existing add/sync pipeline.

**Architecture:** Extend the existing Vite PWA manifest with a GET `share_target` action that opens `/?share-target=1`. A pure utility detects the marker, normalizes `title`, `text`, and `url`, and strips only consumed share parameters; `App.tsx` owns the temporary draft and renders a focused `SharedTodoCard`, whose Add action reuses the existing `handleAdd(title)` path.

**Tech Stack:** React 19.2, TypeScript 5.9, Vite 7.2, vite-plugin-pwa 1.2, Vitest 4, Testing Library, Dexie/IndexedDB, Supabase.

**Spec:** `docs/superpowers/specs/2026-09-05-share-to-todo-pop-design.md`

## Global Constraints

- Target Android/Chromium Web Share Target for the installed PWA; do not promise iOS or desktop parity.
- Accept only shared `title`, `text`, and `url`; no images, PDFs, files, attachments, or binary uploads.
- Use one editable textarea in a dedicated `Shared todo` card before creation.
- Use GET share target action `/?share-target=1`; do not add a router or backend endpoint.
- Preserve unrelated query parameters and hashes when cleaning consumed share parameters.
- Do not change the Todo model, IndexedDB schema, Supabase schema, auth semantics, or sync semantics.
- Capture must work offline and while signed out by reusing the existing local/anonymous-owner path.
- `Cancel` creates nothing; `Add` closes the card immediately and reuses the existing app-level add path.
- Follow the responsive/touch-friendly visual language already used by PR #4.
- Use TDD and small reviewable commits.

## File Structure

- Create `src/utils/sharedTodo.ts` — marker detection, normalization, and URL cleanup.
- Create `src/utils/sharedTodo.test.ts` — pure utility tests.
- Create `src/components/SharedTodoCard.tsx` — UI-only editable share draft.
- Create `src/components/SharedTodoCard.css` — isolated responsive styling.
- Create `src/components/SharedTodoCard.test.tsx` — card behavior tests.
- Create `src/App.test.tsx` — share-target integration and existing add-pipeline tests.
- Modify `src/App.tsx` — temporary share state and URL consumption.
- Modify `vite.config.ts` — Web Share Target declaration.
- Modify `.github/workflows/ci.yml` — generated manifest contract check.

No storage, auth, reducer, sync-engine, Supabase, or migration files should change.

---

### Task 1: Parse and consume share-target query data

**Files:**
- Create: `src/utils/sharedTodo.ts`
- Create: `src/utils/sharedTodo.test.ts`

**Interfaces:**
- Produces: `isShareTargetSearch(search: string): boolean`
- Produces: `normalizeSharedTodo(params: SharedTodoParams): string | null`
- Produces: `readSharedTodoFromSearch(search: string): string | null`
- Produces: `stripShareTargetParams(url: URL): string`
- Produces: `SHARE_TARGET_MARKER = "share-target"`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/sharedTodo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  isShareTargetSearch,
  normalizeSharedTodo,
  readSharedTodoFromSearch,
  stripShareTargetParams,
} from "./sharedTodo";

describe("sharedTodo utilities", () => {
  it("detects only the explicit share marker", () => {
    expect(isShareTargetSearch("?share-target=1&title=Guide")).toBe(true);
    expect(isShareTargetSearch("?title=Guide")).toBe(false);
  });

  it("combines title, text, and url in order", () => {
    expect(
      normalizeSharedTodo({
        title: "PostgreSQL Indexing",
        text: "Read this later",
        url: "https://example.com/indexing",
      }),
    ).toBe(
      "PostgreSQL Indexing\nRead this later\nhttps://example.com/indexing",
    );
  });

  it("does not append a url already present in shared text", () => {
    expect(
      normalizeSharedTodo({
        title: "Video",
        text: "Watch https://youtu.be/abc123 later",
        url: "https://youtu.be/abc123",
      }),
    ).toBe("Video\nWatch https://youtu.be/abc123 later");
  });

  it("trims blanks and collapses duplicate top-level values", () => {
    expect(
      normalizeSharedTodo({ title: "  Same  ", text: "Same", url: "   " }),
    ).toBe("Same");
  });

  it("supports url-only and empty shares", () => {
    expect(normalizeSharedTodo({ url: " https://example.com " })).toBe(
      "https://example.com",
    );
    expect(normalizeSharedTodo({ title: " ", text: "", url: null })).toBeNull();
  });

  it("reads content only when the marker is present", () => {
    expect(
      readSharedTodoFromSearch(
        "?share-target=1&title=Guide&url=https%3A%2F%2Fexample.com",
      ),
    ).toBe("Guide\nhttps://example.com");
    expect(
      readSharedTodoFromSearch("?title=Guide&url=https%3A%2F%2Fexample.com"),
    ).toBeNull();
  });

  it("strips only share params and preserves unrelated query/hash values", () => {
    const url = new URL(
      "https://tasks.kevinngongang.dev/?share-target=1&title=Guide&text=Read&url=https%3A%2F%2Fexample.com&filter=active#top",
    );
    expect(stripShareTargetParams(url)).toBe("/?filter=active#top");
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/utils/sharedTodo.test.ts
```

Expected: FAIL because `src/utils/sharedTodo.ts` does not exist.

- [ ] **Step 3: Implement the utility**

Create `src/utils/sharedTodo.ts`:

```ts
export const SHARE_TARGET_MARKER = "share-target";

export type SharedTodoParams = {
  title?: string | null;
  text?: string | null;
  url?: string | null;
};

const clean = (value?: string | null) => value?.trim() ?? "";

export function isShareTargetSearch(search: string): boolean {
  return new URLSearchParams(search).get(SHARE_TARGET_MARKER) === "1";
}

export function normalizeSharedTodo({
  title,
  text,
  url,
}: SharedTodoParams): string | null {
  const cleanTitle = clean(title);
  const cleanText = clean(text);
  const cleanUrl = clean(url);
  const values = [cleanTitle, cleanText];

  if (cleanUrl && !cleanText.includes(cleanUrl)) values.push(cleanUrl);

  const unique = values.filter(
    (value, index, all) => value.length > 0 && all.indexOf(value) === index,
  );
  return unique.length > 0 ? unique.join("\n") : null;
}

export function readSharedTodoFromSearch(search: string): string | null {
  if (!isShareTargetSearch(search)) return null;
  const params = new URLSearchParams(search);
  return normalizeSharedTodo({
    title: params.get("title"),
    text: params.get("text"),
    url: params.get("url"),
  });
}

export function stripShareTargetParams(url: URL): string {
  const cleanUrl = new URL(url.toString());
  for (const key of [SHARE_TARGET_MARKER, "title", "text", "url"]) {
    cleanUrl.searchParams.delete(key);
  }
  const query = cleanUrl.searchParams.toString();
  return `${cleanUrl.pathname}${query ? `?${query}` : ""}${cleanUrl.hash}`;
}
```

- [ ] **Step 4: Verify GREEN and lint**

```bash
npm test -- src/utils/sharedTodo.test.ts
npx eslint src/utils/sharedTodo.ts src/utils/sharedTodo.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/sharedTodo.ts src/utils/sharedTodo.test.ts
git commit -m "feat: parse shared todo payloads"
```

---

### Task 2: Build the dedicated Shared Todo card

**Files:**
- Create: `src/components/SharedTodoCard.tsx`
- Create: `src/components/SharedTodoCard.css`
- Create: `src/components/SharedTodoCard.test.tsx`

**Interfaces:**
- Consumes: `initialValue: string`
- Consumes: `onAdd(value: string): void`
- Consumes: `onCancel(): void`
- Must not import storage, Supabase, auth, or sync modules.

- [ ] **Step 1: Write failing component tests**

Create `src/components/SharedTodoCard.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SharedTodoCard } from "./SharedTodoCard";

describe("SharedTodoCard", () => {
  it("renders one editable multiline field", () => {
    render(
      <SharedTodoCard
        initialValue={"Guide\nhttps://example.com"}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Shared todo" })).toBeTruthy();
    const editor = screen.getByLabelText("Shared todo content");
    expect(editor.tagName).toBe("TEXTAREA");
    expect((editor as HTMLTextAreaElement).value).toBe(
      "Guide\nhttps://example.com",
    );
  });

  it("adds the edited trimmed value", () => {
    const onAdd = vi.fn();
    render(
      <SharedTodoCard initialValue="Guide" onAdd={onAdd} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Shared todo content"), {
      target: { value: "  Read Guide later  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add shared todo" }));
    expect(onAdd).toHaveBeenCalledWith("Read Guide later");
  });

  it("cancels without adding", () => {
    const onAdd = vi.fn();
    const onCancel = vi.fn();
    render(
      <SharedTodoCard initialValue="Guide" onAdd={onAdd} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel shared todo" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("disables Add for whitespace-only content", () => {
    const onAdd = vi.fn();
    render(
      <SharedTodoCard initialValue="Guide" onAdd={onAdd} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Shared todo content"), {
      target: { value: "   " },
    });
    const button = screen.getByRole("button", { name: "Add shared todo" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/components/SharedTodoCard.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/SharedTodoCard.tsx`:

```tsx
import { useState } from "react";
import "./SharedTodoCard.css";

type SharedTodoCardProps = {
  initialValue: string;
  onAdd: (value: string) => void;
  onCancel: () => void;
};

export function SharedTodoCard({ initialValue, onAdd, onCancel }: SharedTodoCardProps) {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();

  return (
    <section className="shared-todo" aria-labelledby="shared-todo-title">
      <div className="shared-todo__intro">
        <span className="shared-todo__eyebrow">From another app</span>
        <h2 id="shared-todo-title">Shared todo</h2>
        <p>Edit the shared content before adding it to your list.</p>
      </div>
      <label className="shared-todo__field">
        <span>Shared todo content</span>
        <textarea
          value={value}
          rows={4}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Shared todo content"
          autoFocus
        />
      </label>
      <div className="shared-todo__actions">
        <button
          type="button"
          className="shared-todo__button shared-todo__button--secondary"
          onClick={onCancel}
          aria-label="Cancel shared todo"
        >
          Cancel
        </button>
        <button
          type="button"
          className="shared-todo__button shared-todo__button--primary"
          onClick={() => trimmed && onAdd(trimmed)}
          disabled={!trimmed}
          aria-label="Add shared todo"
        >
          Add
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Add responsive styling**

Create `src/components/SharedTodoCard.css`:

```css
.shared-todo {
  display: grid;
  gap: 14px;
  margin-bottom: 18px;
  padding: 16px;
  border: 1px solid rgba(255, 95, 138, 0.18);
  border-radius: 16px;
  background: rgba(255, 250, 252, 0.96);
}
.shared-todo__intro { display: grid; gap: 4px; }
.shared-todo__intro h2,
.shared-todo__intro p { margin: 0; }
.shared-todo__intro h2 { font-size: 1.05rem; }
.shared-todo__intro p { color: var(--muted); font-size: 0.84rem; }
.shared-todo__eyebrow {
  color: #b53661;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.shared-todo__field { display: grid; gap: 6px; }
.shared-todo__field > span { color: #555564; font-size: 0.74rem; font-weight: 600; }
.shared-todo__field textarea {
  width: 100%;
  min-width: 0;
  min-height: 112px;
  padding: 12px 14px;
  border: 1px solid rgba(27, 27, 31, 0.12);
  border-radius: 14px;
  outline: none;
  background: #fff;
  color: var(--ink);
  font: inherit;
  line-height: 1.45;
  resize: vertical;
}
.shared-todo__field textarea:focus {
  border-color: rgba(255, 95, 138, 0.65);
  box-shadow: 0 0 0 3px rgba(255, 95, 138, 0.12);
}
.shared-todo__actions { display: flex; justify-content: flex-end; gap: 8px; }
.shared-todo__button {
  min-height: 42px;
  padding: 10px 16px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
}
.shared-todo__button--primary { border: 1px solid transparent; background: var(--primary); color: #fff; }
.shared-todo__button--secondary { border: 1px solid rgba(27, 27, 31, 0.1); background: #fff; color: #4c4c5a; }
.shared-todo__button:disabled { cursor: not-allowed; opacity: 0.55; }
@media (max-width: 640px) {
  .shared-todo__field textarea { min-height: 128px; resize: none; }
  .shared-todo__actions { display: grid; grid-template-columns: 1fr 1fr; }
  .shared-todo__button { width: 100%; min-height: 48px; }
}
```

- [ ] **Step 5: Verify GREEN, lint, and commit**

```bash
npm test -- src/components/SharedTodoCard.test.tsx
npx eslint src/components/SharedTodoCard.tsx src/components/SharedTodoCard.test.tsx
git add src/components/SharedTodoCard.tsx src/components/SharedTodoCard.css src/components/SharedTodoCard.test.tsx
git commit -m "feat: add shared todo confirmation card"
```

Expected: tests and lint PASS before commit.

---

### Task 3: Integrate the share draft into App without changing persistence

**Files:**
- Create: `src/App.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes Task 1 helpers and Task 2 `SharedTodoCard`.
- Reuses the existing `handleAdd(title)` unchanged: `local.add(title)` then `sync.requestSync()`.
- App owns only `sharedTodo: string | null`; nothing is persisted before Add.

- [ ] **Step 1: Write failing App integration tests**

Create `src/App.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const add = vi.fn(async () => undefined);
const requestSync = vi.fn(async () => undefined);
const refresh = vi.fn(async () => undefined);
const mockUseAuth = vi.fn();
const mockUseTodoAppState = vi.fn();
const mockUseTodoSync = vi.fn();

vi.mock("./auth/AuthContext", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("./hooks/useTodoAppState", () => ({
  useTodoAppState: (...args: unknown[]) => mockUseTodoAppState(...args),
}));
vi.mock("./hooks/useTodoSync", () => ({
  useTodoSync: (...args: unknown[]) => mockUseTodoSync(...args),
}));
vi.mock("./components/AuthPanel", () => ({ AuthPanel: () => <div>Auth panel</div> }));

const baseLocalState = {
  state: { todos: [], filter: "all" as const },
  loading: false,
  add,
  toggle: vi.fn(async () => undefined),
  edit: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
  setFilter: vi.fn(),
  refresh,
};

describe("App share target", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null, localUserId: null });
    mockUseTodoAppState.mockReturnValue(baseLocalState);
    mockUseTodoSync.mockReturnValue({ status: "idle", lastError: null, requestSync });
    window.history.replaceState({}, "", "/");
  });

  it("shows a marked share and consumes only its query params", () => {
    window.history.replaceState(
      {},
      "",
      "/?share-target=1&title=Guide&url=https%3A%2F%2Fexample.com&filter=active",
    );
    render(<App />);
    expect(
      (screen.getByLabelText("Shared todo content") as HTMLTextAreaElement).value,
    ).toBe("Guide\nhttps://example.com");
    expect(window.location.search).toBe("?filter=active");
  });

  it("cleans even an empty marked share without showing a card", () => {
    window.history.replaceState({}, "", "/?share-target=1&filter=active");
    render(<App />);
    expect(screen.queryByLabelText("Shared todo content")).toBeNull();
    expect(window.location.search).toBe("?filter=active");
  });

  it("ignores unmarked title/url parameters", () => {
    window.history.replaceState({}, "", "/?title=Normal&url=https%3A%2F%2Fexample.com");
    render(<App />);
    expect(screen.queryByLabelText("Shared todo content")).toBeNull();
  });

  it("adds shared text through existing add and sync handlers", async () => {
    window.history.replaceState({}, "", "/?share-target=1&title=Guide");
    render(<App />);
    fireEvent.change(screen.getByLabelText("Shared todo content"), {
      target: { value: "Read Guide tonight" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add shared todo" }));
    expect(screen.queryByLabelText("Shared todo content")).toBeNull();
    await waitFor(() => expect(add).toHaveBeenCalledWith("Read Guide tonight"));
    await waitFor(() => expect(requestSync).toHaveBeenCalledTimes(1));
  });

  it("cancels without adding or syncing", () => {
    window.history.replaceState({}, "", "/?share-target=1&title=Guide");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel shared todo" }));
    expect(add).not.toHaveBeenCalled();
    expect(requestSync).not.toHaveBeenCalled();
  });

  it("does not recreate a consumed draft after remount", () => {
    window.history.replaceState({}, "", "/?share-target=1&title=Guide");
    const first = render(<App />);
    expect(screen.getByLabelText("Shared todo content")).toBeTruthy();
    first.unmount();
    render(<App />);
    expect(screen.queryByLabelText("Shared todo content")).toBeNull();
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/App.test.tsx
```

Expected: FAIL because App does not yet consume/render shared drafts.

- [ ] **Step 3: Integrate share state and URL cleanup**

In `src/App.tsx`, add imports:

```tsx
import { useEffect, useMemo, useState } from "react";
import { SharedTodoCard } from "./components/SharedTodoCard";
import {
  isShareTargetSearch,
  readSharedTodoFromSearch,
  stripShareTargetParams,
} from "./utils/sharedTodo";
```

At the start of `App()` add a stable snapshot of the launch URL and temporary state:

```tsx
const initialShare = useMemo(() => {
  const search = window.location.search;
  return {
    marked: isShareTargetSearch(search),
    draft: readSharedTodoFromSearch(search),
  };
}, []);
const [sharedTodo, setSharedTodo] = useState<string | null>(initialShare.draft);

useEffect(() => {
  if (!initialShare.marked) return;
  const cleanPath = stripShareTargetParams(new URL(window.location.href));
  window.history.replaceState(window.history.state, "", cleanPath);
}, [initialShare]);
```

Keep existing `handleAdd` unchanged and add:

```tsx
const handleSharedAdd = (title: string) => {
  setSharedTodo(null);
  void handleAdd(title);
};
```

Render after `SyncStatus` and before `TodoInput`:

```tsx
{sharedTodo ? (
  <SharedTodoCard
    initialValue={sharedTodo}
    onAdd={handleSharedAdd}
    onCancel={() => setSharedTodo(null)}
  />
) : null}
```

- [ ] **Step 4: Verify GREEN and regressions**

```bash
npm test -- src/App.test.tsx
npm test -- src/utils/sharedTodo.test.ts src/components/SharedTodoCard.test.tsx src/App.test.tsx
npm test
npm run lint
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: consume shared todo drafts"
```

---

### Task 4: Register Todo Pop in the Android share sheet

**Files:**
- Modify: `vite.config.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Manifest must produce exactly `action`, `method`, `enctype`, and params matching Task 1 query names.

- [ ] **Step 1: Add a manifest contract assertion to CI before changing Vite config**

Extend `.github/workflows/ci.yml` under `Verify offline app shell artifacts`:

```yaml
      - name: Verify offline app shell artifacts
        run: |
          test -f dist/sw.js
          test -f dist/manifest.webmanifest
          node --input-type=module <<'NODE'
          import { readFileSync } from "node:fs";
          const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));
          const expected = {
            action: "/?share-target=1",
            method: "GET",
            enctype: "application/x-www-form-urlencoded",
            params: { title: "title", text: "text", url: "url" },
          };
          if (JSON.stringify(manifest.share_target) !== JSON.stringify(expected)) {
            console.error("Unexpected share_target:", manifest.share_target);
            process.exit(1);
          }
          NODE
```

- [ ] **Step 2: Verify RED against the current generated manifest**

```bash
npm run build
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));
if (!manifest.share_target) process.exit(1);
NODE
```

Expected: exit code 1 because current manifest has no `share_target`.

- [ ] **Step 3: Add the exact Web Share Target**

In `vite.config.ts`, extend the existing `manifest` object:

```ts
share_target: {
  action: "/?share-target=1",
  method: "GET",
  enctype: "application/x-www-form-urlencoded",
  params: {
    title: "title",
    text: "text",
    url: "url",
  },
},
```

- [ ] **Step 4: Verify GREEN on generated artifacts**

```bash
npm run build
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));
console.log(JSON.stringify(manifest.share_target, null, 2));
NODE
npm run lint
npm test
```

Expected manifest:

```json
{
  "action": "/?share-target=1",
  "method": "GET",
  "enctype": "application/x-www-form-urlencoded",
  "params": {
    "title": "title",
    "text": "text",
    "url": "url"
  }
}
```

All commands must PASS.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts .github/workflows/ci.yml
git commit -m "feat: register todo pop share target"
```

---

### Task 5: Full verification and Xiaomi acceptance gate

**Files:**
- No planned production changes. If verification finds a defect, return to its owning task, write a failing regression test, then fix it.

- [ ] **Step 1: Run complete local verification**

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev --audit-level=critical
```

Expected: all tests PASS, lint PASS, build PASS, runtime critical audit PASS.

- [ ] **Step 2: Verify generated PWA artifacts**

```bash
test -f dist/sw.js
test -f dist/manifest.webmanifest
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));
const t = manifest.share_target;
if (
  t?.action !== "/?share-target=1" ||
  t?.method !== "GET" ||
  t?.enctype !== "application/x-www-form-urlencoded" ||
  t?.params?.title !== "title" ||
  t?.params?.text !== "text" ||
  t?.params?.url !== "url"
) throw new Error(`Invalid share target: ${JSON.stringify(t)}`);
console.log("share_target verified");
NODE
```

Expected: `share_target verified`.

- [ ] **Step 3: Push and open the PR as draft**

```bash
git push -u origin feat/share-to-todo-pop
```

Open against `master` with title:

```text
feat: add share to Todo Pop
```

Keep draft until Xiaomi validation passes.

- [ ] **Step 4: Verify CI and Cloudflare Preview**

Required evidence:
- GitHub Actions test/build is green.
- Generated manifest contract check is green.
- Cloudflare Preview succeeds.
- Existing runtime audit and secret scan remain green.

- [ ] **Step 5: Ensure Xiaomi uses the updated PWA manifest**

If Todo Pop is absent from Android's share sheet after the updated deployment, uninstall the installed PWA and install it again from the updated deployment before treating the absence as an app-code defect. Share-target registration is manifest-driven and Android can retain an older installed manifest.

- [ ] **Step 6: Run the Xiaomi acceptance matrix**

```text
[ ] Chrome → Share shows Todo Pop
[ ] shared page opens dedicated Shared todo card
[ ] one textarea contains normalized title/text/url
[ ] duplicate URL appears once
[ ] content is editable before Add
[ ] Add closes card immediately and creates a normal Todo
[ ] online + signed-in creation syncs normally
[ ] offline creation remains available locally
[ ] signed-out creation works; later sign-in uses existing anonymous claim/sync
[ ] Cancel creates nothing
[ ] refresh after consumption does not recreate the card
[ ] unrelated query parameters survive cleanup
[ ] normal add/edit/toggle/remove behavior is unchanged
```

- [ ] **Step 7: Final repository sanity check**

```bash
git status --short
git log --oneline --decorate -8
```

Expected: clean working tree, small feature commits, and no storage/auth/sync/schema files changed.

- [ ] **Step 8: Record verification in the PR**

Use:

```markdown
## Verification

- parser/component/App share-target tests pass;
- full Vitest suite passes;
- ESLint passes;
- TypeScript + Vite build passes;
- generated `manifest.webmanifest` has the expected GET `share_target`;
- runtime critical dependency audit passes;
- Cloudflare Preview succeeds;
- Xiaomi share-sheet, Add, Cancel, offline, signed-out, duplicate-URL, and refresh checks pass.
```

Do not merge until the real Xiaomi share-sheet test confirms Todo Pop is registered as a share destination.
