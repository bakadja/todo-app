import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InviteOnboarding } from "./InviteOnboarding";

const mockUseAuth = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

describe("InviteOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when onboarding is idle", () => {
    mockUseAuth.mockReturnValue({
      inviteOnboarding: { status: "idle" },
      setPassword: vi.fn(),
      dismissInviteError: vi.fn(),
    });

    const { container } = render(<InviteOnboarding />);

    expect(container.textContent).toBe("");
  });

  it("rejects mismatched password confirmation before calling Supabase", () => {
    const setPassword = vi.fn(async () => null);
    mockUseAuth.mockReturnValue({
      inviteOnboarding: { status: "needs-password" },
      setPassword,
      dismissInviteError: vi.fn(),
    });

    render(<InviteOnboarding />);
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password-123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "Passwords do not match.",
    );
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("submits a matching password", async () => {
    const setPassword = vi.fn(async () => null);
    mockUseAuth.mockReturnValue({
      inviteOnboarding: { status: "needs-password" },
      setPassword,
      dismissInviteError: vi.fn(),
    });

    render(<InviteOnboarding />);
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password-123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() =>
      expect(setPassword).toHaveBeenCalledWith("password-123"),
    );
  });

  it("shows a Supabase password error inline", async () => {
    const setPassword = vi.fn(
      async () => "Password should be at least 8 characters",
    );
    mockUseAuth.mockReturnValue({
      inviteOnboarding: { status: "needs-password" },
      setPassword,
      dismissInviteError: vi.fn(),
    });

    render(<InviteOnboarding />);
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Password should be at least 8 characters",
      ),
    );
  });

  it("shows invalid or expired invite guidance without hiding local availability", () => {
    mockUseAuth.mockReturnValue({
      inviteOnboarding: {
        status: "error",
        message: "This invitation is invalid or has expired.",
      },
      setPassword: vi.fn(),
      dismissInviteError: vi.fn(),
    });

    render(<InviteOnboarding />);

    expect(
      screen.getByText("This invitation is invalid or has expired."),
    ).toBeTruthy();
    expect(screen.getByText("Ask the owner for a new invitation.")).toBeTruthy();
    expect(
      screen.getByText("Your local todos are still available."),
    ).toBeTruthy();
  });
});
