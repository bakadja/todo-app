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

function createFakeClient(initialSession: Session | null = null) {
  let callback: AuthCallback | null = null;
  let signOutCalls = 0;

  const auth = {
    getSession: async () => ({ data: { session: initialSession }, error: null }),
    onAuthStateChange: (next: AuthCallback) => {
      callback = next;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: null }),
    signUp: async () => ({ data: { user: null, session: null }, error: null }),
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
    db = createTodoDb(`auth-context-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("retains a remembered local owner when no cloud session is available", async () => {
    await setActiveUserId("remembered-user", db);
    const fake = createFakeClient(null);
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
    const fake = createFakeClient(makeSession(user));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider client={fake.client} db={db}>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.id).toBe("signed-user");
    expect(result.current.localUserId).toBe("signed-user");
    expect(await getActiveUserId(db)).toBe("signed-user");
  });

  it("does not erase the remembered owner on a sessionless auth event", async () => {
    await setActiveUserId("remembered-user", db);
    const fake = createFakeClient(null);
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

  it("explicit sign out clears only the active pointer, not todo rows", async () => {
    const repository = new LocalTodoRepository(db);
    await repository.add("Keep local data", "anonymous", 1000);
    await setActiveUserId("remembered-user", db);
    const fake = createFakeClient(null);
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
