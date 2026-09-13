# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a suspected security problem.

Use GitHub's private vulnerability reporting for this repository
(**Security → Report a vulnerability**) and include:

- a description of the issue and its impact;
- the steps or code needed to reproduce it;
- any logs, trimmed so that no credential or token is exposed.

You can expect an initial response within a week.

## Scope

Todo Pop is a static, offline-first React application that talks directly to
Supabase from the browser. In scope:

- the application code under `src/` and `e2e/`;
- the Supabase migrations, RLS policies, and RPC definitions under
  `supabase/`;
- the CI workflows and repository configuration under `.github/`.

The Supabase publishable/anon key configured through `VITE_*` variables is
intentionally public browser configuration and is not a secret. Server-only
Supabase credentials (service role, platform secrets) must never appear in
this repository; CI scans both the working tree and the full git history for
them (see `.github/workflows/security.yml`).

## Supported branch

Security fixes are developed against `master`. The `agent/staging` branch is
an integration branch for reviewed hardening work and may contain candidate
changes that have not yet been merged to `master`.

## Automated checks

- **Secret scanning**: gitleaks scans the pushed/PR commit range on every
  push and pull request, and the full git history in a weekly scheduled
  scan.
- **Dependency audit**: `npm audit --audit-level=high` over all dependencies
  (runtime and dev) on every push and pull request, and weekly.
- **Dependabot**: weekly update proposals for npm packages and GitHub Actions,
  pinned to commit SHAs.
