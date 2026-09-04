import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  signUp: vi.fn(async () => null),
  signOut: vi.fn(async () => undefined),
};

describe("AuthPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(baseAuth);
  });

  it("renders an accessible signed-out account card with distinct actions", () => {
    render(<AuthPanel />);

    expect(screen.getByRole("heading", { name: "Sync your todos everywhere" })).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" }).classList.contains("auth-panel__button--primary")).toBe(true);
    expect(screen.getByRole("button", { name: "Create account" }).classList.contains("auth-panel__button--secondary")).toBe(true);
  });

  it("renders a compact signed-in account card with a styled sign-out action", () => {
    mockUseAuth.mockReturnValue({
      ...baseAuth,
      user: { id: "user-1", email: "user@example.com" },
    });

    render(<AuthPanel />);

    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByText("user@example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" }).classList.contains("auth-panel__button--signout")).toBe(true);
  });
});
