# Password Recovery Design

## Goal

Add a safe, inline password-recovery flow for existing invited Todo Pop users without changing Todo storage or sync semantics.

## Product decisions

- The signed-out auth card exposes `Forgot password?`.
- Recovery stays inline in the existing Todo Pop auth card; no React Router or dedicated route is introduced.
- Requesting recovery shows the same generic success copy regardless of whether the email exists:
  `If an account exists for this email, you'll receive a password reset link.`
- Supabase sends the recovery email through the already configured custom SMTP/Resend setup.
- Recovery links target the production app with `token_hash` and `type=recovery`.
- A valid recovery callback exchanges the token through `verifyOtp`, then asks for a new password.
- After `updateUser({ password })` succeeds, the user remains signed in and existing Todo sync continues automatically.
- Invalid, expired, or already-consumed recovery links show an explicit error and preserve local Todos.
- The error state offers `Request another reset link`.
- Public signup remains disabled. Recovery is only for existing accounts.

## Architecture

```text
Signed-out AuthPanel
  -> Forgot password?
  -> requestPasswordReset(email)
  -> Supabase resetPasswordForEmail
  -> Resend email
  -> tasks.kevinngongang.dev/?token_hash=...&type=recovery
  -> readRecoveryCallback
  -> verifyOtp({ token_hash, type: "recovery" })
  -> recoveryOnboarding = needs-password
  -> updateUser({ password })
  -> recoveryOnboarding = idle
  -> existing authenticated sync resumes
```

## Boundaries

No changes to:

- Todo schema
- Dexie/IndexedDB ownership model
- anonymous claim semantics
- LWW sync behavior
- RLS policies
- service worker/PWA architecture
- public-signup policy

## Error handling

- Missing/invalid recovery callback parameters are ignored.
- Invalid or expired token: `This password reset link is invalid or has expired.`
- Password mismatch is blocked client-side before calling Supabase.
- Supabase password-policy errors are displayed inline.
- Local ownership and local Todo rows are not cleared by a failed recovery callback.

## Acceptance criteria

- `Forgot password?` is visible when signed out.
- Recovery request form opens inline.
- Generic confirmation is shown after a successful request.
- Recovery email arrives through the configured SMTP path.
- Valid recovery link opens Todo Pop and shows new-password form.
- Matching password submission updates the password.
- User stays signed in after reset.
- Existing cloud Todos remain available and synced.
- Old password no longer works; new password works.
- Invalid/consumed link shows the expected error.
- Local Todos remain available during invalid recovery.
- CI, build, PWA artifact verification, Supabase local startup/reset, and DB tests pass.
