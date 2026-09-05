# Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline forgot-password and password-reset support for existing invited Todo Pop users while preserving invite-only access and current Todo storage/sync behavior.

**Architecture:** Extend the existing `AuthContext` and `AuthPanel` patterns already used for invite onboarding. Recovery callbacks use `token_hash` + `type=recovery`, are verified with Supabase `verifyOtp`, and reuse `updateUser({ password })` so the recovered user stays authenticated and sync resumes naturally.

**Tech Stack:** React 19, TypeScript 5.9, Supabase JS 2.x, Vitest 4, Testing Library, Dexie/IndexedDB, Vite/PWA, Supabase local auth config.

**Spec:** `docs/superpowers/specs/2026-09-06-password-recovery-design.md`

## Global Constraints

- Public signup remains disabled.
- No React Router or dedicated reset page.
- No Todo schema, Dexie ownership, LWW sync, RLS, or service-worker behavior changes.
- Recovery request confirmation must not reveal whether an account exists.
- Invalid recovery callbacks must not clear remembered local ownership or local Todo rows.
- Recovery users remain signed in after a successful password update.

---

### Task 1: Parse and clean recovery callbacks

**Files:**
- Create: `src/auth/recoveryCallback.ts`
- Test: `src/auth/recoveryCallback.test.ts`

**Interfaces:**
- Produces: `readRecoveryCallback(url: URL)` returning `{ kind: "none" } | { kind: "token"; tokenHash: string }`
- Produces: `stripRecoveryCallbackParams(url: URL): string`

- [x] **Step 1: Write failing tests** for valid recovery token, wrong callback type, empty token, and preservation of unrelated query parameters.
- [x] **Step 2: Run the callback tests and verify RED.**
- [x] **Step 3: Implement minimal parser and URL cleanup.**
- [x] **Step 4: Run callback tests and verify GREEN.**
- [x] **Step 5: Commit the callback implementation.**

### Task 2: Extend AuthContext with recovery behavior

**Files:**
- Modify: `src/auth/AuthContext.tsx`
- Test: `src/auth/AuthContext.test.tsx`

**Interfaces:**
- Produces: `RecoveryOnboardingState = idle | needs-password | error`
- Produces: `requestPasswordReset(email: string): Promise<string | null>`
- Reuses: `setPassword(password: string): Promise<string | null>`
- Produces: `dismissRecoveryError(): void`

- [x] **Step 1: Write failing tests** proving reset-email dispatch, token verification, new-password state, invalid-token local-data preservation, and successful password completion.
- [x] **Step 2: Run `npm test -- src/auth/AuthContext.test.tsx` and verify RED.**
- [x] **Step 3: Implement `resetPasswordForEmail`, recovery `verifyOtp`, recovery state, and completion via `updateUser({ password })`.**
- [x] **Step 4: Run the AuthContext tests and verify GREEN.**
- [x] **Step 5: Commit AuthContext recovery support.**

### Task 3: Add inline forgot-password UX

**Files:**
- Modify: `src/components/AuthPanel.tsx`
- Test: `src/components/AuthPanel.test.tsx`

**Interfaces:**
- Consumes: `requestPasswordReset`, `recoveryOnboarding`, `setPassword`, `dismissRecoveryError`
- Produces UI states: sign-in, reset-request, recovered-password, recovery-error

- [x] **Step 1: Write failing test for `Forgot password?`.**
- [x] **Step 2: Add the minimal button and verify the test passes.**
- [x] **Step 3: Write failing test for inline `Reset your password` form with email, `Send reset link`, and `Back to sign in`.**
- [x] **Step 4: Implement reset-request mode and verify GREEN.**
- [x] **Step 5: Write and pass tests for generic confirmation text.**
- [x] **Step 6: Write and pass tests for `Choose a new password`, matching-password submit, mismatch validation, and invalid-link retry UI.**
- [x] **Step 7: Run full unit suite, lint, and build.**
- [x] **Step 8: Commit the inline recovery UX.**

### Task 4: Configure Supabase recovery email template locally

**Files:**
- Create: `supabase/templates/recovery.html`
- Modify: `supabase/config.toml`

**Interfaces:**
- Recovery email target: `{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=recovery`

- [x] **Step 1: Add `supabase/templates/recovery.html` with the Todo Pop reset link.**
- [x] **Step 2: Register `[auth.email.template.recovery]` in `supabase/config.toml`.**
- [x] **Step 3: Run CI path that starts Supabase local, resets DB, and runs database tests.**
- [x] **Step 4: Verify the runtime-only audit remains at 0 vulnerabilities.**

### Task 5: Verify branch and PR quality gate

**Files:**
- No source changes required unless verification finds a defect.

- [x] **Step 1: Verify the latest branch CI is `completed / success`.**
- [x] **Step 2: Inspect PR #8 changed files and confirm there are no Todo schema/RLS/sync changes.**
- [x] **Step 3: Verify Cloudflare preview deployment succeeds for the PR head.**
- [x] **Step 4: Perform pre-merge review against the approved spec.**

Review result: no critical or important source-code issue found. The custom `TokenHash` + `verifyOtp(type: "recovery")` flow matches Supabase's supported email-template pattern. The only operational nuance is that the hosted template uses `SiteURL`, so before merge the email naturally points at production; preview acceptance must preserve the query string while switching the host to the branch preview URL.

### Task 6: Hosted Supabase cutover and manual acceptance

**Files:**
- Hosted Supabase Dashboard only; no repository source change unless the hosted template differs from the repo template.

- [ ] **Step 1: In Supabase Authentication email templates, set the recovery subject to `Reset your Todo Pop password`.**
- [ ] **Step 2: Set the hosted recovery email body link exactly to:**

```html
<a href="{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=recovery">
  Reset password
</a>
```

- [ ] **Step 3: Confirm hosted Site URL remains `https://tasks.kevinngongang.dev/` and public signup remains OFF.**
- [ ] **Step 4: Open the branch preview `https://feat-password-recovery.todo-app-79m.pages.dev`, sign out, and trigger `Forgot password?` for an existing invited account.**
- [ ] **Step 5: Verify the generic confirmation appears and the Resend email arrives.**
- [ ] **Step 6: For pre-merge preview validation, open the email link, then replace only the origin `https://tasks.kevinngongang.dev` with `https://feat-password-recovery.todo-app-79m.pages.dev` while keeping the complete `?token_hash=...&type=recovery` query unchanged. Load that preview URL, set a new password, and verify the user remains signed in with Todos synced.**
- [ ] **Step 7: Sign out on the preview, confirm the old password fails, then confirm the new password succeeds.**
- [ ] **Step 8: Reopen the consumed recovery URL on the preview and verify `This password reset link is invalid or has expired.` while local Todos remain available.**
- [ ] **Step 9: After all acceptance checks pass, squash-merge PR #8 into `master`, verify post-merge CI/Cloudflare production, then test one normal production recovery email without changing its host.**
- [ ] **Step 10: Delete `feat/password-recovery` after production acceptance passes.**
