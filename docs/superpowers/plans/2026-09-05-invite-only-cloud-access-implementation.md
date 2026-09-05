# Invite-only Cloud Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Restrict Todo Pop cloud access to manually invited Supabase users while preserving anonymous/offline local usage and the existing anonymous-claim sync behavior.

**Architecture:** Remove public signup from the React auth surface and Supabase Auth configuration. Handle deterministic invite token-hash callbacks in the client, exchange them with `verifyOtp`, let invited users set a password with `updateUser`, and reuse the existing `claimAnonymous` + sync pipeline.

**Tech Stack:** React 19.2, TypeScript 5.9, Vite 7, Vitest 4, Supabase JS, Dexie, existing offline-first/LWW sync engine.

**Spec:** `docs/superpowers/specs/2026-09-05-invite-only-cloud-access-design.md`

## Global constraints

- Default branch is `master`.
- Feature branch: `feat/invite-only-cloud-access`.
- PR title: `feat: restrict cloud access to invited users`.
- No React Router dependency.
- No new database table, migration, RLS policy, Edge Function, service-role key, or browser secret.
- No changes to Todo schema, IndexedDB schema, repository semantics, LWW resolution, or sync semantics.
- Anonymous/local Todo use remains available.
- Existing authenticated users continue using email/password.
- Existing anonymous claim behavior is reused, not reimplemented.
- Use TDD: failing test first → minimal implementation → green test → commit.
- Do not touch unrelated worktrees.

## File map

**Create**
- `src/auth/inviteCallback.ts`
- `src/auth/inviteCallback.test.ts`
- `src/components/InviteOnboarding.tsx`
- `src/components/InviteOnboarding.test.tsx`
- `supabase/templates/invite.html`

**Modify**
- `src/auth/AuthContext.tsx`
- `src/auth/AuthContext.test.tsx`
- `src/components/AuthPanel.tsx`
- `src/components/AuthPanel.test.tsx`
- `src/App.tsx`
- `src/App.test.tsx`
- `src/App.css`
- `supabase/config.toml`

**Explicitly unchanged**
- `src/storage/todoDb.ts`
- `src/storage/todoRepository.ts`
- `src/sync/syncEngine.ts`
- `src/hooks/useTodoAppState.ts`
- `src/hooks/useTodoSync.ts`
- existing Todo migrations and RLS SQL

---

## Task 1 — Add deterministic invite callback parsing

Create `src/auth/inviteCallback.test.ts` first with tests that prove:
- `type=invite` + a non-empty `token_hash` is accepted;
- other auth callback types are ignored;
- empty token hashes are ignored;
- cleanup removes only `token_hash` and `type`;
- unrelated query params such as share-target params survive cleanup.

Run the test and confirm RED because `inviteCallback.ts` does not exist. Then add the minimal helper:

```ts
export type InviteCallback =
  | { kind: "none" }
  | { kind: "token"; tokenHash: string };

export function readInviteCallback(url: URL): InviteCallback {
  if (url.searchParams.get("type") !== "invite") {
    return { kind: "none" };
  }

  const tokenHash = url.searchParams.get("token_hash")?.trim() ?? "";
  return tokenHash ? { kind: "token", tokenHash } : { kind: "none" };
}

export function stripInviteCallbackParams(url: URL): string {
  const clean = new URL(url);
  clean.searchParams.delete("token_hash");
  clean.searchParams.delete("type");
  const search = clean.searchParams.toString();
  return `${clean.pathname}${search ? `?${search}` : ""}${clean.hash}`;
}
```

Run focused tests again and commit green behavior.

---

## Task 2 — Remove public signup from browser auth

Update `AuthPanel.test.tsx` first to require:
- Email;
- Password;
- Sign in;
- no `Create account` button;
- `Cloud access is invite-only.`;
- `You can still use Todo Pop locally without an account.`

Run RED. Then:
- remove `signUp` from `AuthContextValue`;
- delete the `signUp` callback and memo value;
- remove signup mocks/tests from `AuthContext.test.tsx`;
- simplify `AuthPanel` to a single `signIn` submit path;
- delete the `Create account` action;
- add the invite-only helper copy.

Run focused Auth tests and commit.

---

## Task 3 — Handle invitation exchange and password setup in AuthContext

Add:

```ts
export type InviteOnboardingState =
  | { status: "idle" }
  | { status: "needs-password" }
  | { status: "error"; message: string };
```

Expose:

```ts
inviteOnboarding: InviteOnboardingState;
setPassword(password: string): Promise<string | null>;
dismissInviteError(): void;
```

Extend the fake Supabase client in `AuthContext.test.tsx` with `verifyOtp` and `updateUser` call recording.

Write RED tests for:
- valid `/?token_hash=...&type=invite` callback exchanges exactly once;
- valid invite persists invited user id and sets `needs-password`;
- callback params are removed after processing;
- invalid/expired invite preserves remembered local owner and local rows;
- invalid/expired invite produces a stable generic message;
- `setPassword()` calls `updateUser({ password })` once and completes onboarding.

Then implement the invite branch before ordinary cached-session restore:

```ts
const invite = readInviteCallback(new URL(window.location.href));

if (invite.kind === "token") {
  const { data, error } = await client.auth.verifyOtp({
    token_hash: invite.tokenHash,
    type: "invite",
  });

  window.history.replaceState(
    window.history.state,
    "",
    stripInviteCallbackParams(new URL(window.location.href)),
  );

  if (cancelled) return;

  if (error || !data.session?.user) {
    setInviteOnboarding({
      status: "error",
      message: "This invitation is invalid or has expired.",
    });
    setLoading(false);
    return;
  }

  const invitedUser = data.session.user;
  await setActiveUserId(invitedUser.id, db);
  if (cancelled) return;

  setUser(invitedUser);
  setLocalUserId(invitedUser.id);
  setInviteOnboarding({ status: "needs-password" });
  setLoading(false);
  return;
}
```

Implement password update with `client.auth.updateUser({ password })`, error propagation, and completion to `idle`.

Run green and commit.

---

## Task 4 — Add InviteOnboarding UI

Create component tests first for:
- `idle` renders nothing;
- `needs-password` shows heading/fields/button;
- password mismatch stops before Supabase call;
- matching passwords call `setPassword` once;
- Supabase password errors render inline;
- invalid invite state renders local-data-safe guidance.

Run RED, then create `InviteOnboarding.tsx` with `idle`, `error`, and `needs-password` branches. Use `autoComplete="new-password"` for both password fields.

Add focused styles to `App.css` and keep mobile controls at least 48px tall. Run green and commit.

---

## Task 5 — Integrate onboarding without disturbing Todo behavior

Add RED App tests proving password onboarding and invite-error states can be visible while the normal Todo input stays usable.

Then render:

```tsx
<InviteOnboarding />
<AuthPanel />
```

inside the existing card.

Do not change effective owner calculation, Todo CRUD, share-target parsing, or sync request logic. Run App/share/auth tests and commit.

---

## Task 6 — Lock local Supabase to invite-only

Configuration changes are allowed without TDD code tests, but must be runtime-verified.

Set in `supabase/config.toml`:

```toml
enable_signup = false

[auth.email.template.invite]
subject = "You've been invited to Todo Pop"
content_path = "./supabase/templates/invite.html"
```

Create `supabase/templates/invite.html`:

```html
<html>
  <body>
    <h2>You've been invited to Todo Pop</h2>
    <p>Follow the link below to accept your invitation.</p>
    <p>
      <a href="{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=invite">
        Accept invitation
      </a>
    </p>
  </body>
</html>
```

Start/reset local Supabase, verify config boots, verify a direct signup request is rejected, and run `npx supabase test db`. Stop Supabase and commit.

---

## Task 7 — Full regression/security verification

Run:

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev --audit-level=critical
```

Verify `dist/sw.js` and `dist/manifest.webmanifest` exist. Start/reset local Supabase and run pgTAP. Compare `master...HEAD` and confirm no storage/sync/schema files were modified.

---

## Task 8 — PR and preview validation

Push branch and open PR against `master` with title:

```text
feat: restrict cloud access to invited users
```

Wait for GitHub `test-and-build` and Cloudflare Pages preview to pass.

Before changing hosted Auth settings, use the preview with the existing production account and prove sign-in/sync still works.

---

## Task 9 — Hosted Supabase cutover

After preview/CI are green:
- verify hosted Site URL is `https://tasks.kevinngongang.dev`;
- update hosted Invite email template to the token-hash callback;
- disable public new user signup while leaving email/password sign-in enabled;
- verify an ordinary public signup attempt with only the publishable browser key is rejected.

Never expose service-role/secret keys.

---

## Task 10 — Real invite acceptance

On a signed-out browser/device:
1. create local Todo `INVITE LOCAL TEST`;
2. manually invite a disposable email from Supabase Dashboard;
3. open the invitation on the same browser/device;
4. confirm token params disappear;
5. confirm password setup appears;
6. set a password;
7. confirm local Todo remains and sync reaches `Synced`;
8. sign out;
9. sign in with invited email/password;
10. verify Todo remains;
11. sign in from a second device/browser and verify the Todo arrives;
12. reopen the consumed invite and confirm invalid/expired message without local data loss.

---

## Task 11 — Merge and production smoke

Only after CI, preview, existing-user regression, real invite, and signup-block tests pass:
- user performs Squash and merge into `master`;
- update/prune local master;
- smoke `https://tasks.kevinngongang.dev` for invite-only UI, local signed-out Todo use, existing account sign-in/sync, real invite flow, password reconnect, and public signup rejection.

Only then is the feature complete.
