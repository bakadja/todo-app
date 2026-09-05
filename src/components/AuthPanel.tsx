import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";

export function AuthPanel() {
  const { user, loading, signIn, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="auth-panel auth-panel--loading" role="status">
        Checking account…
      </div>
    );
  }

  if (user) {
    return (
      <div className="auth-panel auth-panel--signed-in">
        <div className="auth-panel__identity">
          <span className="auth-panel__eyebrow">Account</span>
          <strong className="auth-panel__email">
            {user.email ?? "Signed in"}
          </strong>
          <span className="auth-panel__helper">
            Your todos are connected to this account.
          </span>
        </div>
        <button
          type="button"
          className="auth-panel__button auth-panel__button--signout"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const message = await signIn(email, password);

    setError(message);
    setSubmitting(false);
  };

  return (
    <form
      className="auth-panel auth-panel--signed-out"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="auth-panel__intro">
        <span className="auth-panel__eyebrow">Cloud sync</span>
        <h2>Sync your todos everywhere</h2>
        <p>Sign in to keep your tasks in sync across your devices.</p>
      </div>

      <div className="auth-panel__form-row">
        <label className="auth-panel__field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="auth-panel__field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            required
          />
        </label>

        <div className="auth-panel__actions">
          <button
            type="submit"
            className="auth-panel__button auth-panel__button--primary"
            disabled={submitting}
          >
            Sign in
          </button>
        </div>
      </div>

      <div className="auth-panel__invite-note">
        <strong>Cloud access is invite-only.</strong>
        <span>You can still use Todo Pop locally without an account.</span>
      </div>

      {error && (
        <p className="auth-panel__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
