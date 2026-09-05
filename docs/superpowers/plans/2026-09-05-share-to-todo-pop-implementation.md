# Share to Todo Pop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Android Web Share Target support so an installed Todo Pop PWA can receive shared text/links into a dedicated editable card, then create a normal offline-first Todo through the existing add/sync pipeline.

**Architecture:** Extend the existing Vite PWA manifest with a GET `share_target` action that opens `/?share-target=1`. A small pure utility parses and normalizes `title`, `text`, and `url`; `App.tsx` owns the temporary draft and renders a focused `SharedTodoCard`, whose `Add` action reuses the existing `handleAdd(title)` path.

**Tech Stack:** React 19.2, TypeScript 5.9, Vite 7.2, vite-plugin-pwa 1.2, Vitest 4, Testing Library, Dexie/IndexedDB, Supabase.

**Spec:** `docs/superpowers/specs/2026-09-05-share-to-todo-pop-design.md`

## Global Constraints

- Target Android/Chromium Web Share Target for the installed PWA; do not promise iOS or desktop parity.
- Accept only shared `title`, `text`, and `url`; do not add images, PDFs, files, attachments, or binary uploads.
- Use one editable textarea in a dedicated `Shared todo` card before creation.
- Use GET share target action `/?share-target=1`; do not add a router or backend endpoint.
- Preserve unrelated query parameters when cleaning consumed share parameters.
- Do not change the Todo model, IndexedDB schema, Supabase schema, auth semantics, or sync semantics.
- Capture must work offline and while signed out by reusing the existing local/anonymous-owner path.
- `Cancel` creates nothing; `Add` closes the card immediately and reuses the existing app-level add path.
- Follow the responsive/touch-friendly visual language already used by PR #4.
- Use TDD and keep commits small enough to review independently.

---

## File Structure

- Create `src/utils/sharedTodo.ts` — pure normalization, marker detection, and share-query cleanup helpers.
- Create `src/utils/sharedTodo.test.ts` — parser and URL-cleanup tests.
- Create `src/components/SharedTodoCard.tsx` — temporary editable share draft UI only.
- Create `src/components/SharedTodoCard.css` — isolated responsive styling for the share card.
- Create `src/components/SharedTodoCard.test.tsx` — card behavior/accessibility tests.
- Create `src/App.test.tsx` — app-level share-target consumption and add-pipeline tests.
- Modify `src/App.tsx` — own the temporary share draft, clean consumed URL parameters, and reuse `handleAdd`.
- Modify `vite.config.ts` — declare the Web Share Target.
- Modify `.github/workflows/ci.yml` — assert the generated manifest contains the exact share-target contract after build.

No storage, auth, reducer, sync-engine, Supabase, or migration files should change.

---

### Task 1: Pure shared-content parsing and URL cleanup

**Files:**
- Create: `src/utils/sharedTodo.ts`
- Create: `src/utils/sharedTodo.test.ts`

**Interfaces:**
- Produces: `normalizeSharedTodo(params: SharedTodoParams): string | null`
- Produces: `readSharedTodoFromSearch(search: string): string | null`
- Produces: `stripShareTargetParams(url: URL): string`
- Produces: `SHARE_TARGET_MARKER = "share-target"`
- Consumes: no app state, React, storage, auth, or sync modules.

- [ ] **Step 1: Write failing parser tests**

Create `src/utils/sharedTodo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  normalizeSharedTodo,
  readSharedTodoFromSearch,
  stripShareTargetParams,
} from "./sharedTodo";

describe("normalizeSharedTodo", () => {
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

  it("does not repeat a url already present in shared text", () => {
    expect(
      normalizeSharedTodo({
        title: "Video",
        text: "Watch https://youtu.be/abc123 later",
        url: "https://youtu.be/abc123",
      }),
    ).toBe("Video\nWatch https://youtu.be/abc123 later");
  });

  it("trims blanks and collapses identical top-level values", () => {
    expect(
      normalizeSharedTodo({
        title: "  Same text  ",
        text: "Same text",
        url: "   ",
      }),
    ).toBe("Same text");
  });

  it("supports url-only shares", () => {
    expect(
      normalizeSharedTodo({ url: " https://example.com " }),
    ).toBe("https://example.com");
  });

  it("returns null for an empty payload", () => {
    expect(normalizeSharedTodo({ title: " ", text: "", url: null })).toBeNull();
  });
});

describe("readSharedTodoFromSearch", () => {
  it("requires the explicit share-target marker", () => {
    expect(
      readSharedTodoFromSearch("?title=Normal&page=text&url=https%3A%2F%2Fexample.com"),
    ).toBeNull();
  });

  it("reads marked share parameters", () => {
    expect(
      readSharedTodoFromSearch(
        "?share-target=1&title=Guide&url=https%3A%2F%2Fexample.com",
      ),
    ).toBe("Guide\nhttps://example.com");
  });
});

describe("stripShareTargetParams", () => {
  it("removes only share parameters and preserves unrelated query/hash values", () => {
    const url = new URL(
      "https://tasks.kevinngongang.dev/?share-target=1&title=Guide&text=Read&url=https%3A%2F%2Fexample.com&filter=active#top",
    );

    expect(stripShareTargetParams(url)).toBe("/?filter=active#top");
  });
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```bash
npm test -- src/utils/sharedTodo.test.ts
```

Expected: FAIL because `./sharedTodo` does not exist yet.

- [ ] **Step 3: Implement the minimal pure utility**

Create `src/utils/sharedTodo.ts`:

```ts
export const SHARE_TARGET_MARKER = "share-target";

export type SharedTodoParams = {
  title?: string | null;
  text?: string | null;
  url?: string | null;
};

const clean = (value?: string | null) => value?.trim() ?? "";

export function normalizeSharedTodo({
  title,
  text,
  url,
}: SharedTodoParams): string | null {
  const cleanTitle = clean(title);
  const cleanText = clean(text);
  const cleanUrl = clean(url);
  const candidates = [cleanTitle, cleanText];

  if (cleanUrl && !cleanText.includes(cleanUrl)) {
    candidates.push(cleanUrl);
  }

  const unique = candidates.filter(
    (value, index, all) => value && all.indexOf(value) === index,
  );

  return unique.length > 0 ? unique.join("\n") : null;
}

export function readSharedTodoFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get(SHARE_TARGET_MARKER) !== "1") return null;

  return normalizeSharedTodo({
    title: params.get("title"),
    text: params.get("text"),
    url: params.get("url"),
  });
}

export function stripShareTargetParams(url: URL): string {
  const cleanUrl = new URL(url.toString());
  cleanUrl.searchParams.delete(SHARE_TARGET_MARKER);
  cleanUrl.searchParams.delete("title");
  cleanUrl.searchParams.delete("text");
  cleanUrl.searchParams.delete("url");

  const search = cleanUrl.searchParams.toString();
  return `${cleanUrl.pathname}${search ? `?${search}` : ""}${cleanUrl.hash}`;
}
```

- [ ] **Step 4: Run parser tests and verify GREEN**

Run:

```bash
npm test -- src/utils/sharedTodo.test.ts
```

Expected: all tests in `sharedTodo.test.ts` PASS.

- [ ] **Step 5: Run lint on the new utility and tests**

Run:

```bash
npx eslint src/utils/sharedTodo.ts src/utils/sharedTodo.test.ts
```

Expected: PASS with no lint errors.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/utils/sharedTodo.ts src/utils/sharedTodo.test.ts
git commit -m "feat: parse shared todo payloads"
```

---

### Task 2: Dedicated editable Shared Todo card

**Files:**
- Create: `src/components/SharedTodoCard.tsx`
- Create: `src/components/SharedTodoCard.css`
- Create: `src/components/SharedTodoCard.test.tsx`

**Interfaces:**
- Consumes: `initialValue: string`
- Consumes: `onAdd(value: string): void`
- Consumes: `onCancel(): void`
- Produces: a UI-only card with one textarea and `Cancel` / `Add` actions.
- Must not import IndexedDB, Supabase, auth, sync, or Todo repositories.

- [ ] **Step 1: Write failing component tests**

Create `src/components/SharedTodoCard.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SharedTodoCard } from "./SharedTodoCard";

describe("SharedTodoCard", () => {
  it("renders shared content in one editable textarea", () => {
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

  it("sends the edited trimmed value to onAdd", () => {
    const onAdd = vi.fn();
    render(
      <SharedTodoCard
        initialValue="Guide"
        onAdd={onAdd}
        onCancel={vi.fn()}
      />,
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
      <SharedTodoCard
        initialValue="Guide"
        onAdd={onAdd}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel shared todo" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("does not add whitespace-only content", () => {
    const onAdd = vi.fn();
    render(
      <SharedTodoCard initialValue="Guide" onAdd={onAdd} onCancel={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("Shared todo content"), {
      target: { value: "   " },
    });

    const addButton = screen.getByRole("button", { name: "Add shared todo" });
    expect((addButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(addButton);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run component tests and verify RED**

Run:

```bash
npm test -- src/components/SharedTodoCard.test.tsx
```

Expected: FAIL because `SharedTodoCard` does not exist yet.

- [ ] **Step 3: Implement the minimal component**

Create `src/components/SharedTodoCard.tsx`:

```tsx
import { useState } from "react";
import "./SharedTodoCard.css";

type SharedTodoCardProps = {
  initialValue: string;
  onAdd: (value: string) => void;
  onCancel: () => void;
};

export function SharedTodoCard({
  initialValue,
  onAdd,
  onCancel,
}: SharedTodoCardProps) {
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

- [ ] **Step 4: Add isolated responsive styling**

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

.shared-todo__intro {
  display: grid;
  gap: 4px;
}

.shared-todo__intro h2,
.shared-todo__intro p {
  margin: 0;
}

.shared-todo__intro h2 {
  font-size: 1.05rem;
}

.shared-todo__intro p {
  color: var(--muted);
  font-size: 0.84rem;
}

.shared-todo__eyebrow {
  color: #b53661;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.shared-todo__field {
  display: grid;
  gap: 6px;
}

.shared-todo__field > span {
  color: #555564;
  font-size: 0.74rem;
  font-weight: 600;
}

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

.shared-todo__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.shared-todo__button {
  min-height: 42px;
  padding: 10px 16px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
}

.shared-todo__button--primary {
  border: 1px solid transparent;
  background: var(--primary);
  color: #fff;
}

.shared-todo__button--secondary {
  border: 1px solid rgba(27, 27, 31, 0.1);
  background: #fff;
  color: #4c4c5a;
}

.shared-todo__button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 640px) {
  .shared-todo__field textarea {
    min-height: 128px;
    resize: none;
  }

  .shared-todo__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .shared-todo__button {
    width: 100%;
    min-height: 48px;
  }
}
```

- [ ] **Step 5: Run component tests and verify GREEN**

Run:

```bash
npm test -- src/components/SharedTodoCard.test.tsx
```

Expected: all `SharedTodoCard` tests PASS.

- [ ] **Step 6: Run lint on the component slice**

Run:

```bash
npx eslint src/components/SharedTodoCard.tsx src/components/SharedTodoCard.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/components/SharedTodoCard.tsx src/components/SharedTodoCard.css src/components/SharedTodoCard.test.tsx
git commit -m "feat: add shared todo confirmation card"
```

---

### Task 3: Consume share-target URL in App and reuse the normal add pipeline

**Files:**
- Create: `src/App.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes from Task 1: `readSharedTodoFromSearch(search)` and `stripShareTargetParams(url)`.
- Consumes from Task 2: `<SharedTodoCard initialValue onAdd onCancel />`.
- Reuses existing `handleAdd(title)` exactly so persistence remains `local.add(title)` followed by `sync.requestSync()`.
- App owns `sharedTodo: string | null` temporary state only; the draft is not persisted before `Add`.

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

vi.mock("./auth/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("./hooks/useTodoAppState", () => ({
  useTodoAppState: (...args: unknown[]) => mockUseTodoAppState(...args),
}));

vi.mock("./hooks/useTodoSync", () => ({
  useTodoSync: (...args: unknown[]) => mockUseTodoSync(...args),
}));

vi.mock("./components/AuthPanel", () => ({
  AuthPanel: () => <div>Auth panel</div>,
}));

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
    mockUseTodoSync.mockReturnValue({
      status: "idle",
      lastError: null,
      requestSync,
    });
    window.history.replaceState({}, "", "/");
  });

  it("shows a marked share payload and consumes its URL parameters", () => {
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

  it("ignores unmarked title/text/url query parameters", () => {
    window.history.replaceState({}, "", "/?title=Normal&url=https%3A%2F%2Fexample.com");
    render(<App />);
    expect(screen.queryByLabelText("Shared todo content")).toBeNull();
  });

  it("adds shared text through the normal add and sync path", async () => {
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

  it("cancels without creating or syncing", () => {
    window.history.replaceState({}, "", "/?share-target=1&title=Guide");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel shared todo" }));

    expect(screen.queryByLabelText("Shared todo content")).toBeNull();
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

- [ ] **Step 2: Run App tests and verify RED**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: FAIL because `App` does not yet consume share-target parameters or render `SharedTodoCard`.

- [ ] **Step 3: Add temporary share state and URL consumption to App**

Modify the imports at the top of `src/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { SharedTodoCard } from "./components/SharedTodoCard";
import {
  readSharedTodoFromSearch,
  stripShareTargetParams,
} from "./utils/sharedTodo";
```

Inside `App()`, before the existing owner/local/sync derivation, initialize the share draft once:

```tsx
const [sharedTodo, setSharedTodo] = useState<string | null>(() =>
  readSharedTodoFromSearch(window.location.search),
);

useEffect(() => {
  if (!sharedTodo) return;

  const cleanPath = stripShareTargetParams(new URL(window.location.href));
  window.history.replaceState(window.history.state, "", cleanPath);
}, []);
```

Keep the existing `handleAdd(title)` unchanged. Add a share-specific UI handler that delegates to it:

```tsx
const handleSharedAdd = (title: string) => {
  setSharedTodo(null);
  void handleAdd(title);
};
```

Render the card after `SyncStatus` and before the normal `TodoInput`:

```tsx
{sharedTodo ? (
  <SharedTodoCard
    initialValue={sharedTodo}
    onAdd={handleSharedAdd}
    onCancel={() => setSharedTodo(null)}
  />
) : null}
```

The final pipeline must remain:

```text
SharedTodoCard.onAdd
  → App.handleSharedAdd
  → existing App.handleAdd
  → local.add
  → sync.requestSync
```

- [ ] **Step 4: Run App tests and verify GREEN**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: all App share-target tests PASS.

- [ ] **Step 5: Run all share-specific tests together**

Run:

```bash
npm test -- src/utils/sharedTodo.test.ts src/components/SharedTodoCard.test.tsx src/App.test.tsx
```

Expected: all share-specific tests PASS.

- [ ] **Step 6: Run full unit suite to catch regressions**

Run:

```bash
npm test
```

Expected: all existing tests plus the new share tests PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: consume shared todo drafts"
```

---

### Task 4: Register Todo Pop as an Android Web Share Target

**Files:**
- Modify: `vite.config.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces manifest contract:
  - `share_target.action = "/?share-target=1"`
  - `share_target.method = "GET"`
  - `share_target.enctype = "application/x-www-form-urlencoded"`
  - params `title`, `text`, `url` map to the same query names consumed by Task 1.
- Consumes the existing `VitePWA({ manifest: ... })` configuration.

- [ ] **Step 1: Strengthen CI with a failing manifest contract check**

In `.github/workflows/ci.yml`, extend `Verify offline app shell artifacts` to:

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

- [ ] **Step 2: Build before changing the manifest and verify the new contract check would fail**

Run:

```bash
npm run build
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));
if (!manifest.share_target) process.exit(1);
NODE
```

Expected: exit code 1 because the current manifest has no `share_target`.

- [ ] **Step 3: Add the exact share target to Vite PWA configuration**

Modify the `manifest` object in `vite.config.ts`:

```ts
manifest: {
  name: "Todo Pop",
  short_name: "Todo Pop",
  display: "standalone",
  start_url: "/",
  theme_color: "#ffffff",
  background_color: "#ffffff",
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
},
```

- [ ] **Step 4: Build and inspect the generated manifest**

Run:

```bash
npm run build
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));
console.log(JSON.stringify(manifest.share_target, null, 2));
NODE
```

Expected output:

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

- [ ] **Step 5: Run lint and full tests**

Run:

```bash
npm run lint
npm test
```

Expected: both PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add vite.config.ts .github/workflows/ci.yml
git commit -m "feat: register todo pop share target"
```

---

### Task 5: Full verification and Android/Xiaomi acceptance gate

**Files:**
- No production files should be added in this task unless verification exposes a defect.
- If a defect is found, return to the task whose boundary owns it, add a failing regression test there first, then fix it.

**Interfaces:**
- Consumes the complete implementation from Tasks 1–4.
- Produces evidence that automated checks pass and the actual Android share sheet works.

- [ ] **Step 1: Run the complete local verification suite**

Run:

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev --audit-level=critical
```

Expected:
- all Vitest tests PASS;
- ESLint PASS;
- TypeScript/Vite build PASS;
- runtime critical audit PASS.

- [ ] **Step 2: Verify generated PWA artifacts and share target again**

Run:

```bash
test -f dist/sw.js
test -f dist/manifest.webmanifest
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));
const target = manifest.share_target;
if (
  target?.action !== "/?share-target=1" ||
  target?.method !== "GET" ||
  target?.enctype !== "application/x-www-form-urlencoded" ||
  target?.params?.title !== "title" ||
  target?.params?.text !== "text" ||
  target?.params?.url !== "url"
) {
  throw new Error(`Invalid share target: ${JSON.stringify(target)}`);
}
console.log("share_target verified");
NODE
```

Expected: `share_target verified`.

- [ ] **Step 3: Push the branch and open/update the PR for preview CI**

Run:

```bash
git push -u origin feat/share-to-todo-pop
```

If the PR does not yet exist, open it against `master` with title:

```text
feat: add share to Todo Pop
```

Keep it in draft until Xiaomi manual validation is complete.

- [ ] **Step 4: Verify GitHub Actions and Cloudflare Preview**

Acceptance before phone testing:
- GitHub Actions test/build job is green.
- Generated PWA manifest check is green.
- Cloudflare Preview deployment succeeds for the branch/PR.
- No Supabase server-secret check regresses.

- [ ] **Step 5: Refresh/reinstall the Todo Pop PWA on Xiaomi if Android has cached the old manifest**

Because share-target registration is manifest-driven, Android may keep the previously installed manifest. If `Todo Pop` does not appear in the share sheet after the Preview/Production manifest is updated, uninstall the installed Todo Pop PWA and install it again from the updated deployment before diagnosing app code.

- [ ] **Step 6: Run the Xiaomi manual acceptance matrix**

Verify each item explicitly:

```text
[ ] Chrome page → Share → Todo Pop appears as destination
[ ] shared page opens Todo Pop with the dedicated Shared todo card
[ ] one textarea contains normalized title/text/url
[ ] duplicate URL is shown once
[ ] editing the textarea before Add works
[ ] Add closes the card immediately
[ ] created item appears as a normal Todo
[ ] online + signed-in item syncs through the existing pipeline
[ ] offline Add still creates the Todo locally
[ ] signed-out Add creates locally; later sign-in claims/syncs it via existing behavior
[ ] Cancel closes the card and creates no Todo
[ ] refresh after share consumption does not reopen the card
[ ] unrelated query parameters survive share-query cleanup
[ ] normal Todo creation/edit/toggle/remove behavior still works
```

- [ ] **Step 7: Final branch sanity check**

Run:

```bash
git status --short
git log --oneline --decorate -8
```

Expected:
- clean working tree;
- small sequence of feature commits for parser, card, app integration, manifest registration;
- no unrelated storage/auth/sync/schema changes.

- [ ] **Step 8: Record the final verification result in the PR description**

Use a concise verification section such as:

```markdown
## Verification

- parser/component/app share-target tests pass;
- full Vitest suite passes;
- ESLint passes;
- TypeScript + Vite build passes;
- generated `manifest.webmanifest` contains the expected GET `share_target`;
- runtime critical dependency audit passes;
- Cloudflare Preview succeeds;
- Xiaomi manual share-sheet, Add, Cancel, offline, signed-out, duplicate-URL, and refresh tests pass.
```

Do not merge until the Xiaomi share-sheet test confirms Todo Pop is actually registered as a share destination.
