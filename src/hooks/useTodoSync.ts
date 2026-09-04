import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { getBrowserSupabaseClient } from "../lib/supabase";
import { localTodoRepository } from "../storage/todoRepository";
import { SupabaseTodoRemote } from "../sync/supabaseTodoRemote";
import { syncTodos } from "../sync/syncEngine";
import type { SyncResult } from "../sync/types";

export type UiSyncStatus = "offline" | "idle" | "syncing" | "error";
export type TodoSyncRunner = (userId: string) => Promise<SyncResult>;

async function defaultTodoSyncRunner(userId: string): Promise<SyncResult> {
  const client = getBrowserSupabaseClient();
  if (!client) throw new Error("Supabase is not configured");

  return syncTodos(
    localTodoRepository,
    new SupabaseTodoRemote(client),
    userId,
  );
}

export function useTodoSync(
  userId: string | null,
  refresh: () => Promise<void>,
  runner: TodoSyncRunner = defaultTodoSyncRunner,
) {
  const [status, setStatus] = useState<UiSyncStatus>(() =>
    navigator.onLine ? "idle" : "offline",
  );
  const [lastError, setLastError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const inFlightGenerationRef = useRef<number | null>(null);
  const rerunRequestedGenerationRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    generationRef.current += 1;
    rerunRequestedGenerationRef.current = null;
  }, [userId]);

  const requestSync = useCallback(async () => {
    const generation = generationRef.current;

    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }

    if (!userId) {
      setStatus("idle");
      return;
    }

    if (inFlightGenerationRef.current === generation) {
      rerunRequestedGenerationRef.current = generation;
      return;
    }

    inFlightGenerationRef.current = generation;

    try {
      do {
        if (generationRef.current !== generation) return;
        if (rerunRequestedGenerationRef.current === generation) {
          rerunRequestedGenerationRef.current = null;
        }

        if (!navigator.onLine) {
          setStatus("offline");
          break;
        }

        setStatus("syncing");
        setLastError(null);

        try {
          const result = await runner(userId);
          if (generationRef.current !== generation) return;

          await refresh();
          if (generationRef.current !== generation) return;

          if (result.errors > 0) {
            setLastError("One or more sync operations failed");
            setStatus("error");
          } else {
            setStatus("idle");
          }
        } catch (error) {
          if (generationRef.current !== generation) return;
          setLastError(
            error instanceof Error ? error.message : "Unknown sync error",
          );
          setStatus("error");
        }
      } while (rerunRequestedGenerationRef.current === generation);
    } finally {
      if (inFlightGenerationRef.current === generation) {
        inFlightGenerationRef.current = null;
      }
      if (rerunRequestedGenerationRef.current === generation) {
        rerunRequestedGenerationRef.current = null;
      }
    }
  }, [refresh, runner, userId]);

  useEffect(() => {
    const handleOnline = () => {
      void requestSync();
    };
    const handleOffline = () => {
      setStatus("offline");
    };
    const handleFocus = () => {
      if (navigator.onLine) void requestSync();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);

    if (!navigator.onLine) {
      setStatus("offline");
    } else if (userId) {
      void requestSync();
    } else {
      setStatus("idle");
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
    };
  }, [requestSync, userId]);

  return { status, lastError, requestSync };
}