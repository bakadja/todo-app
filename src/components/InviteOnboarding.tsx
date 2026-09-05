import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";

export function InviteOnboarding() {
  const { inviteOnboarding, setPassword } = useAuth();
  const [password, setPasswordValue] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (inviteOnboarding.status === "idle") {
    return null;
  }

  if (inviteOnboarding.status === "error") {
    return (
      <section className="invite-onboarding invite-onboarding--error">
        <div className="invite-onboarding__copy">
          <p className="invite-onboarding__error" role="alert">
            {inviteOnboarding.message}
          </p>
          <p>Ask the owner for a new invitation.</p>
          <p>Your local todos are still available.</p>
        </div>
      </section>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const message = await setPassword(password);
    setError(message);
    setSubmitting(false);
  };

  return (
    <form
      className="invite-onboarding"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="invite-onboarding__copy">
        <h2>Welcome to Todo Pop</h2>
        <p>Your invitation has been accepted.</p>
        <p>Choose a password for future sign-ins.</p>
      </div>

      <div className="invite-onboarding__fields">
        <label className="auth-panel__field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPasswordValue(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        <label className="auth-panel__field">
          <span>Confirm password</span>
          <input
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
      </div>

      <div className="invite-onboarding__actions">
        <button
          type="submit"
          className="auth-panel__button auth-panel__button--primary"
          disabled={submitting}
        >
          Set password
        </button>
      </div>

      {error && (
        <p className="invite-onboarding__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
