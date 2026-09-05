import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthPanel } from "./AuthPanel";

const mockUseAuth = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const baseAuth = {
  loading: false,
  user: null,
  localUserId: null,
  recoveryOnboarding: { status: "idle" as const },
  signIn: vi.fn(async () => null),
  requestPasswordReset: vi.fn(async () => null),
  setPassword: vi.fn(async () => null),
  dismissRecoveryError: vi.fn(),
  signOut: vi.fn(async () => undefined),
};

describe("AuthPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(baseAuth);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders invite-only cloud sign-in without public account creation", () => {
    render(<AuthPanel />);

    expect(
      screen.getByRole("heading", { name: "Sync your todos everywhere" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
    expect(screen.getByText("Cloud access is invite-only.")).toBeTruthy();
    expect(
      screen.getByText(
        "You can still use Todo Pop locally without an account.",
      ),
    ).toBeTruthy();
  });

  it("offers password recovery from the signed-out sign-in form", () => {
    render(<AuthPanel />);

    expect(
      screen.getByRole("button", { name: "Forgot password?" }),
    ).toBeTruthy();
  });

  it("opens the password reset request form inline", () => {
    render(<AuthPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));

    expect(
      screen.getByRole("heading", { name: "Reset your password" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Send reset link" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Back to sign in" }),
    ).toBeTruthy();
  });

  it("requests a reset email and shows generic confirmation", async () => {
    render(<AuthPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(baseAuth.requestPasswordReset).toHaveBeenCalledWith(
        "user@example.com",
      );
    });
    expect(
      screen.getByText(
        "If an account exists for this email, you'll receive a password reset link.",
      ),
    ).toBeTruthy();
  });

  it("renders a new-password form after a valid recovery callback", () => {
    mockUseAuth.mockReturnValue({
      ...baseAuth,
      user: { id: "recovery-user", email: "recover@example.com" },
      recoveryOnboarding: { status: "needs-password" },
    });

    render(<AuthPanel />);

    expect(
      screen.getByRole("heading", { name: "Choose a new password" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm new password")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Update password" }),
    ).toBeTruthy();
    expect(screen.queryByText("Account")).toBeNull();
  });

  it("submits the recovered password when both entries match", async () => {
    mockUseAuth.mockReturnValue({
      ...baseAuth,
      user: { id: "recovery-user", email: "recover@example.com" },
      recoveryOnboarding: { status: "needs-password" },
    });

    render(<AuthPanel />);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-strong-password-123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-strong-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(baseAuth.setPassword).toHaveBeenCalledWith(
        "new-strong-password-123",
      );
    });
  });

  it("rejects mismatched recovered passwords before calling Supabase", () => {
    mockUseAuth.mockReturnValue({
      ...baseAuth,
      user: { id: "recovery-user", email: "recover@example.com" },
      recoveryOnboarding: { status: "needs-password" },
    });

    render(<AuthPanel />);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-strong-password-123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "different-password-456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(screen.getByRole("alert").textContent).toBe("Passwords do not match.");
    expect(baseAuth.setPassword).not.toHaveBeenCalled();
  });

  it("offers another reset request when a recovery link is invalid", () => {
    mockUseAuth.mockReturnValue({
      ...baseAuth,
      recoveryOnboarding: {
        status: "error",
        message: "This password reset link is invalid or has expired.",
      },
    });

    render(<AuthPanel />);

    expect(screen.getByRole("alert").textContent).toBe(
      "This password reset link is invalid or has expired.",
    );
    expect(screen.getByText("Your local todos are still available.")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Request another reset link" }),
    );
    expect(baseAuth.dismissRecoveryError).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { name: "Reset your password" }),
    ).toBeTruthy();
  });

  it("renders a compact signed-in account card with a styled sign-out action", () => {
    mockUseAuth.mockReturnValue({
      ...baseAuth,
      user: { id: "user-1", email: "user@example.com" },
    });

    render(<AuthPanel />);

    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByText("user@example.com")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Sign out" })
        .classList.contains("auth-panel__button--signout"),
    ).toBe(true);
  });
});
