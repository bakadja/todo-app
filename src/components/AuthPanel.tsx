import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";

export function AuthPanel() {
  const { user, loading, signIn, signUp, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return <div className="auth-panel">Checking account…</div>;
  }

  if (user) {
    return (
      <div className="auth-panel">
        <span>{user.email ?? "Signed in"}</span>
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  const run = async (action: "signIn" | "signUp") => {
    setSubmitting(true);
    setError(null);

    const message =
      action === "signIn"
        ? await signIn(email, password)
        : await signUp(email, password);

    setError(message);
    setSubmitting(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run("signIn");
  };

  return (
    <form className="auth-panel" onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Email"
        autoComplete="email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        required
      />
      <button type="submit" disabled={submitting}>
        Sign in
      </button>
      <button
        type="button"
        disabled={submitting}
        onClick={() => void run("signUp")}
      >
        Create account
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
