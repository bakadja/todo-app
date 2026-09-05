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
  signIn: vi.fn(async () => null),
  requestPasswordReset: vi.fn(async () => null),
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
