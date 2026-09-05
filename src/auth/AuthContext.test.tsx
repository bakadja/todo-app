import "fake-indexeddb/auto";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodoDb, type TodoDb } from "../storage/todoDb";
import { LocalTodoRepository } from "../storage/todoRepository";
import {
  getActiveUserId,
  setActiveUserId,
} from "../storage/deviceIdentity";
import { AuthProvider, useAuth } from "./AuthContext";

type AuthCallback = (event: string, session: Session | null) => void;

type FakeClientOptions = {
  initialSession?: Session | null;
  invitedUser?: User | null;
  verifyOtpError?: string | null;
  updateUserError?: string | null;
};

function createFakeClient({
  initialSession = null,
  invitedUser = null,
  verifyOtpError = null,
  updateUserError = null,
}: FakeClientOptions = {}) {
  let callback: AuthCallback | null = null;
  let signOutCalls = 0;
  const verifyOtpCalls: unknown[] = [];
  const updateUserCalls: unknown[] = [];
  const resetPasswordForEmailCalls: unknown[] = [];

  const auth = {
    getSession: async () => ({ data: { session: initialSession }, error: null }),
    onAuthStateChange: (next: AuthCallback) => {
      callback = next;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    signInWithPassword: async () => ({
      data: { user: null, session: null },
      error: null,
    }),
    resetPasswordForEmail: async (email: string) => {
      resetPasswordForEmailCalls.push(email);
      return { data: {}, error: null };
    },
    verifyOtp: async (input: unknown) => {
      verifyOtpCalls.push(input);
      if (verifyOtpError) {
        return {
          data: { user: null, session: null },
          error: { message: verifyOtpError },
        };
      }

      return {
        data: {
          user: invitedUser,
          session: invitedUser ? makeSession(invitedUser) : null,
        },
        error: null,
      };
    },
    updateUser: async (input: unknown) => {
      updateUserCalls.push(input);
      if (updateUserError) {
        return {
          data: { user: invitedUser },
          error: { message: updateUserError },
        };
      }

      return { data: { user: invitedUser }, error: null };
    },
    signOut: async () => {
      signOutCalls += 1;
      return { error: null };
    },
  };

  return {
    client: { auth } as unknown as SupabaseClient,
    emit(event: string, session: Session | null) {
      callback?.(event, session);
    },
    get signOutCalls() {
      return signOutCalls;
    },
    get verifyOtpCalls() {
      return verifyOtpCalls;
    },
    get updateUserCalls() {
      return updateUserCalls;
    },
    get resetPasswordForEmailCalls() {
      return resetPasswordForEmailCalls;
    },
  };
}

const makeUser = (id: string, email = "user@example.com") =>
  ({ id, email } as User);

const makeSession = (user: User) =>
  ({
    access_token: "token",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user,
  } as Session);

describe("AuthProvider", () => {
  let db: TodoDb;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    db = createTodoDb(`auth-context-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    window.history.replaceState({}, "", "/");
    db.close();
    await db.delete();
  });

  it("retains a remembered local owner when no cloud session is available", async () => {
    await setActiveUserId("remembered-user", db);
    const fake = createFakeClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider client={fake.client} db={db}>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.localUserId).toBe("remembered-user");
  });

  it("persists the user id from a valid cached Supabase session", async () => {
    const user = makeUser("signed-user");
    const fake = createFakeClient({ initialSession: makeSession(user) });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider client={fake.client} db={db}>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.id).toBe("signed-user");
    expect(result.current.localUserId).toBe("signed-user");
    expect(await getActiveUserId(db)).toBe("signed-user");
  });

  it("requests a recovery email for the supplied address", async () => {
    const fake = createFakeClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider client={fake.client} db={db}>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      expect(
        await result.current.requestPasswordReset("user@example.com"),
      ).toBeNull();
    });

    expect(fake.resetPasswordForEmailCalls).toEqual(["user@example.com"]);
  });

  it("exchanges a valid recovery token and requires a new password", async () => {
    window.history.replaceState(
      {},
      "",
      "/?token_hash=recovery-token&type=recovery",
    );
    const recoveryUser = makeUser("recovery-user", "recover@example.com");
    const fake = createFakeClient({ invitedUser: recoveryUser });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider client={fake.client} db={db}>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fake.verifyOtpCalls).toEqual([
      { token_hash: "recovery-token", type: "recovery" },
    ]);
    expect(result.current.user?.id).toBe("recovery-user");
    expect(result.current.localUserId).toBe("recovery-user");
    expect(result.current.recoveryOnboarding).toEqual({
      status: "needs-password",
    });
    expect(window.location.search).toBe("");
    expect(await getActiveUserId(db)).toBe("recovery-user");
  });

  it("does not erase the remembered owner on a sessionless auth event", async () => {
    await setActiveUserId("remembered-user", db);
    const fake = createFakeClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider client={fake.client} db={db}>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      fake.emit("SIGNED_OUT", null);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.localUserId).toBe("remembered-user");
    expect(await getActiveUserId(db)).toBe("remembered-user");
  });

  it("exchanges a valid invite token and requires password setup", async () => {
    window.history.replaceState(
      {},
      "",
      "/?token_hash=invite-token&type=invite",
    );
    const invitedUser = makeUser("invited-user", "invite@example.com");
    const fake = createFakeClient({ invitedUser });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider client={fake.client} db={db}>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fake.verifyOtpCalls).toEqual([
      { token_hash: "invite-token", type: "invite" },
    ]);
    expect(result.current.user?.id).toBe("invited-user");
    expect(result.current.localUserId).toBe("invited-user");
    expect(result.current.inviteOnboarding).toEqual({
      status: "needs-password",
    });
    expect(window.location.search).toBe("");
    expect(await getActiveUserId(db)).toBe("invited-user");
  });

  it("keeps local ownership and todos when an invitation is invalid", async () => {
    const repository = new LocalTodoRepository(db);
    await repository.add("Keep local todo", "anonymous", 1000);
    await setActiveUserId("remembered-user", db);
    window.history.replaceState(
      {},
      "",
      "/?token_hash=expired-token&type=invite",
    );
    const fake = createFakeClient({ verifyOtpError: "Token has expired" });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider client={fake.client} db={db}>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.localUserId).toBe("remembered-user");
    expect(result.current.inviteOnboarding).toEqual({
      status: "error",
      message: "This invitation is invalid or has expired.",
    });
    expect(await getActiveUserId(db)).toBe("remembered-user");
    expect(await db.todos.count()).toBe(1);
    expect(window.location.search).toBe("");
  });

  it("sets the invited user's password and completes onboarding", async () => {
    window.history.replaceState(
      {},
      "",
      "/?token_hash=invite-token&type=invite",
    );
    const invitedUser = makeUser("invited-user", "invite@example.com");
    const fake = createFakeClient({ invitedUser });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider client={fake.client} db={db}>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      expect(
        await result.current.setPassword("strong-password-123"),
      ).toBeNull();
    });

    expect(fake.updateUserCalls).toEqual([
      { password: "strong-password-123" },
    ]);
    expect(result.current.inviteOnboarding).toEqual({ status: "idle" });
  });

  it("returns a Supabase password error without completing onboarding", async () => {
    window.history.replaceState(
      {},
      "",
      "/?token_hash=invite-token&type=invite",
    );
    const invitedUser = makeUser("invited-user", "invite@example.com");
    const fake = createFakeClient({
      invitedUser,
      updateUserError: "Password should be at least 8 characters",
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider client={fake.client} db={db}>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      expect(await result.current.setPassword("short")).toBe(
        "Password should be at least 8 characters",
      );
    });

    expect(result.current.inviteOnboarding).toEqual({
      status: "needs-password",
    });
  });

  it("explicit sign out clears only the active pointer, not todo rows", async () => {
    const repository = new LocalTodoRepository(db);
    await repository.add("Keep local data", "anonymous", 1000);
    await setActiveUserId("remembered-user", db);
    const fake = createFakeClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider client={fake.client} db={db}>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signOut();
    });

    expect(fake.signOutCalls).toBe(1);
    expect(result.current.localUserId).toBeNull();
    expect(await getActiveUserId(db)).toBeNull();
    expect(await db.todos.count()).toBe(1);
  });
});
