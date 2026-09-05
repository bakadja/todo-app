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

export interface AuthContextValue {
  user: User | null;
  localUserId: string | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<string | null>;
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

  const signOut = useCallback(async () => {
    try {
      await client?.auth.signOut();
    } finally {
      await clearActiveUserId(db);
      setUser(null);
      setLocalUserId(null);
    }
  }, [client, db]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, localUserId, loading, signIn, signOut }),
    [user, localUserId, loading, signIn, signOut],
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
