import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "../lib/supabase";
import {
  clearActiveUserId,
  getActiveUserId,
  setActiveUserId,
} from "../storage/deviceIdentity";
import { todoDb, type TodoDb } from "../storage/todoDb";
import {
  readInviteCallback,
  stripInviteCallbackParams,
} from "./inviteCallback";
import {
  readRecoveryCallback,
  stripRecoveryCallbackParams,
} from "./recoveryCallback";

export type InviteOnboardingState =
  | { status: "idle" }
  | { status: "needs-password" }
  | { status: "error"; message: string };

export type RecoveryOnboardingState =
  | { status: "idle" }
  | { status: "needs-password" }
  | { status: "error"; message: string };

export interface AuthContextValue {
  user: User | null;
  localUserId: string | null;
  loading: boolean;
  inviteOnboarding: InviteOnboardingState;
  recoveryOnboarding: RecoveryOnboardingState;
  signIn(email: string, password: string): Promise<string | null>;
  requestPasswordReset(email: string): Promise<string | null>;
  setPassword(password: string): Promise<string | null>;
  dismissInviteError(): void;
  dismissRecoveryError(): void;
  signOut(): Promise<void>;
}

type AuthProviderProps = {
  children: ReactNode;
  client?: SupabaseClient | null;
  db?: TodoDb;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  client = getBrowserSupabaseClient(),
  db = todoDb,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [localUserId, setLocalUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOnboarding, setInviteOnboarding] =
    useState<InviteOnboardingState>({ status: "idle" });
  const [recoveryOnboarding, setRecoveryOnboarding] =
    useState<RecoveryOnboardingState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const rememberedUserId = await getActiveUserId(db);
      if (cancelled) return;

      setLocalUserId(rememberedUserId);

      if (!client) {
        setLoading(false);
        return;
      }

      const invite = readInviteCallback(new URL(window.location.href));
      if (invite.kind === "token") {
        const { data, error } = await client.auth.verifyOtp({
          token_hash: invite.tokenHash,
          type: "invite",
        });

        window.history.replaceState(
          window.history.state,
          "",
          stripInviteCallbackParams(new URL(window.location.href)),
        );

        if (cancelled) return;

        const invitedUser = data.session?.user ?? null;
        if (error || !invitedUser) {
          setUser(null);
          setInviteOnboarding({
            status: "error",
            message: "This invitation is invalid or has expired.",
          });
          setLoading(false);
          return;
        }

        await setActiveUserId(invitedUser.id, db);
        if (cancelled) return;

        setUser(invitedUser);
        setLocalUserId(invitedUser.id);
        setInviteOnboarding({ status: "needs-password" });
        setLoading(false);
        return;
      }

      const recovery = readRecoveryCallback(new URL(window.location.href));
      if (recovery.kind === "token") {
        const { data, error } = await client.auth.verifyOtp({
          token_hash: recovery.tokenHash,
          type: "recovery",
        });

        window.history.replaceState(
          window.history.state,
          "",
          stripRecoveryCallbackParams(new URL(window.location.href)),
        );

        if (cancelled) return;

        const recoveryUser = data.session?.user ?? null;
        if (error || !recoveryUser) {
          setUser(null);
          setRecoveryOnboarding({
            status: "error",
            message: "This password reset link is invalid or has expired.",
          });
          setLoading(false);
          return;
        }

        await setActiveUserId(recoveryUser.id, db);
        if (cancelled) return;

        setUser(recoveryUser);
        setLocalUserId(recoveryUser.id);
        setRecoveryOnboarding({ status: "needs-password" });
        setLoading(false);
        return;
      }

      const { data } = await client.auth.getSession();
      if (cancelled) return;

      const cachedUser = data.session?.user ?? null;
      if (cachedUser) {
        await setActiveUserId(cachedUser.id, db);
        if (cancelled) return;
        setUser(cachedUser);
        setLocalUserId(cachedUser.id);
      } else {
        setUser(null);
      }

      setLoading(false);
    };

    void restore();

    const subscription = client?.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;

      if (!nextUser) {
        if (!cancelled) setUser(null);
        return;
      }

      void setActiveUserId(nextUser.id, db).then(() => {
        if (cancelled) return;
        setUser(nextUser);
        setLocalUserId(nextUser.id);
      });
    }).data.subscription;

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [client, db]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      if (!client) return "Supabase is not configured";

      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return error.message;

      if (data.user) {
        await setActiveUserId(data.user.id, db);
        setUser(data.user);
        setLocalUserId(data.user.id);
      }

      return null;
    },
    [client, db],
  );

  const requestPasswordReset = useCallback(
    async (email: string): Promise<string | null> => {
      if (!client) return "Supabase is not configured";

      const { error } = await client.auth.resetPasswordForEmail(email);
      return error?.message ?? null;
    },
    [client],
  );

  const setPassword = useCallback(
    async (password: string): Promise<string | null> => {
      if (!client) return "Supabase is not configured";
      if (!user) return "You must be signed in to set a password";

      const { error } = await client.auth.updateUser({ password });
      if (error) return error.message;

      setInviteOnboarding({ status: "idle" });
      setRecoveryOnboarding({ status: "idle" });
      return null;
    },
    [client, user],
  );

  const dismissInviteError = useCallback(() => {
    setInviteOnboarding({ status: "idle" });
  }, []);

  const dismissRecoveryError = useCallback(() => {
    setRecoveryOnboarding({ status: "idle" });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await client?.auth.signOut();
    } finally {
      await clearActiveUserId(db);
      setUser(null);
      setLocalUserId(null);
      setInviteOnboarding({ status: "idle" });
      setRecoveryOnboarding({ status: "idle" });
    }
  }, [client, db]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      localUserId,
      loading,
      inviteOnboarding,
      recoveryOnboarding,
      signIn,
      requestPasswordReset,
      setPassword,
      dismissInviteError,
      dismissRecoveryError,
      signOut,
    }),
    [
      user,
      localUserId,
      loading,
      inviteOnboarding,
      recoveryOnboarding,
      signIn,
      requestPasswordReset,
      setPassword,
      dismissInviteError,
      dismissRecoveryError,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
