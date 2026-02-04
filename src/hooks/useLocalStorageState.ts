import { useEffect, useState } from "react";
import { loadState, saveState } from "../storage/localStorage";

export function useLocalStorageState<T>(key: string, fallback: T) {
  const [state, setState] = useState<T>(() => loadState(key, fallback));

  useEffect(() => {
    saveState(key, state);
  }, [key, state]);

  return [state, setState] as const;
}
