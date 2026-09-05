# Invite-only Cloud Access Design

## Goal

Keep Todo Pop fully usable locally for everyone while restricting Supabase cloud accounts and synchronization to explicitly invited users.

## Product rules

- Anonymous/local Todo Pop remains open to everyone.
- Public account creation is removed.
- Existing Supabase users can continue to sign in with email/password.
- New cloud users must be invited manually from the Supabase Dashboard.
- Invited users choose a password once after accepting the invitation.
- Existing anonymous Todos on that device are automatically claimed by the invited account and synchronized by the existing sync engine.
- No admin UI is added to Todo Pop.

## Architecture

Todo Pop remains a client-only React/Vite PWA.

The cloud-access boundary is enforced in two places:

1. **Browser surface:** remove `Create account` and remove `signUp()` from `AuthContext`.
2. **Supabase Auth:** disable public signup locally and in hosted production.

The invitation email uses a deterministic callback:

```text
{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=invite
```

Todo Pop exchanges the token with:

```ts
supabase.auth.verifyOtp({
  token_hash: tokenHash,
  type: "invite",
});
```

After a valid exchange, the authenticated invitee chooses a password with:

```ts
supabase.auth.updateUser({ password });
```

The callback parameters are removed from the browser URL after processing.

## Existing behavior reused

No new Todo ownership or sync mechanism is introduced.

The current app already:
- stores signed-out Todos under the anonymous owner;
- calls `claimAnonymous(ownerKey)` when ownership becomes authenticated;
- calls `claimAnonymous(ownerKey)` before authenticated sync;
- pushes/pulls through the current LWW sync engine.

Therefore the invite flow only needs to establish the authenticated user. The existing pipeline then claims and syncs the anonymous Todos.

## Auth state

`AuthContextValue` becomes conceptually:

```ts
export type InviteOnboardingState =
  | { status: "idle" }
  | { status: "needs-password" }
  | { status: "error"; message: string };

export interface AuthContextValue {
  user: User | null;
  localUserId: string | null;
  loading: boolean;
  inviteOnboarding: InviteOnboardingState;
  signIn(email: string, password: string): Promise<string | null>;
  setPassword(password: string): Promise<string | null>;
  dismissInviteError(): void;
  signOut(): Promise<void>;
}
```

There is no `signUp()` method.

## Invitation callback

Add a small pure helper:

```ts
export type InviteCallback =
  | { kind: "none" }
  | { kind: "token"; tokenHash: string };

export function readInviteCallback(url: URL): InviteCallback;
export function stripInviteCallbackParams(url: URL): string;
```

Only `type=invite` plus a non-empty `token_hash` is treated as an invitation callback.

After the token is processed, `history.replaceState(...)` removes `token_hash` and `type` while preserving unrelated parameters.

## Signed-out UX

```text
Cloud sync
Sync your todos everywhere
Sign in to keep your tasks in sync across your devices.

Email
Password
[ Sign in ]

Cloud access is invite-only.
You can still use Todo Pop locally without an account.
```

No `Create account` action is rendered.

## Invite onboarding UX

After a valid invitation:

```text
Welcome to Todo Pop

Your invitation has been accepted.
Choose a password for future sign-ins.

Password
Confirm password

[ Set password ]
```

Rules:
- both fields are required;
- confirmation must match before Supabase is called;
- Supabase password errors are shown inline;
- successful password update completes onboarding;
- normal authenticated Todo Pop remains available.

## Invalid or expired invitation

Show:

```text
This invitation is invalid or has expired.
Ask the owner for a new invitation.

Your local todos are still available.
```

Local Todo rows and remembered local ownership are not deleted or rewritten.

## Supabase configuration

Local `supabase/config.toml`:

```toml
[auth]
enable_signup = false

[auth.email.template.invite]
subject = "You've been invited to Todo Pop"
content_path = "./supabase/templates/invite.html"
```

Local invite template:

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

Hosted production:
- Site URL: `https://tasks.kevinngongang.dev`
- public signup disabled;
- invite email template uses the same token-hash callback;
- email/password sign-in remains enabled.

No service-role or secret key is exposed to browser code.

## Out of scope

- Admin UI in Todo Pop
- Allowlist table
- Approval queue
- Roles/permissions
- Account revocation UI
- Magic-link login
- Todo schema changes
- IndexedDB schema changes
- LWW conflict-resolution changes
- RLS policy changes
- Sync-semantics changes

## Acceptance criteria

1. Anonymous visitors can still use Todo Pop locally.
2. `Create account` is absent.
3. `signUp()` is absent from the app's browser auth surface.
4. Direct public signup is rejected by Supabase.
5. Existing users still sign in and sync.
6. A manually invited user can accept an invitation.
7. Invite callback parameters are removed after processing.
8. A valid invite opens password setup.
9. Password mismatch is rejected client-side.
10. Valid password setup succeeds through `updateUser`.
11. Local anonymous Todos survive onboarding.
12. Those Todos are claimed by the invited account.
13. Claimed Todos synchronize to Supabase.
14. The invited user can sign out and later sign in with email/password.
15. A second device receives the synced Todos.
16. Invalid/expired invites show a clear error without local data loss.
17. Existing offline/sync/RLS tests remain green.
18. No Todo/storage/sync schema regression is introduced.
