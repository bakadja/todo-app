import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  defaultState,
  reducer,
  type Filter,
  type PriorityFilter,
  type Todo,
} from "../state/todosReducer";
import {
  loadFilterPreference,
  loadPriorityFilterPreference,
  saveFilterPreference,
  savePriorityFilterPreference,
} from "../storage/filterPreference";
import { migrateLegacyState } from "../storage/migrateLegacyState";
import {
  todoDb,
  type LocalTodoRecord,
  type OwnerKey,
  type TodoDb,
} from "../storage/todoDb";
import {
  localTodoRepository,
  type LocalTodoRepository,
} from "../storage/todoRepository";
import type { TodoPriority } from "../types/todoPriority";

const toUiTodo = (row: LocalTodoRecord): Todo => ({
  id: row.id,
  title: row.title,
  completed: row.completed,
  priority: row.priority,
  createdAt: row.createdAt,
});

export function useTodoAppState(
  ownerKey: OwnerKey,
  repository: LocalTodoRepository = localTodoRepository,
  db: TodoDb = todoDb,
) {
  const [state, dispatch] = useReducer(reducer, defaultState);
  const [loadedOwnerKey, setLoadedOwnerKey] = useState<OwnerKey | null>(null);
  const ownerKeyRef = useRef(ownerKey);
  useEffect(() => {
    ownerKeyRef.current = ownerKey;
  }, [ownerKey]);

  const refresh = useCallback(async () => {
    // A stale refresh (e.g. from the sync hook completing for the previous
    // owner) must never repopulate the current owner's view.
    if (ownerKeyRef.current !== ownerKey) return;
    const rows = await repository.listVisible(ownerKey);
    if (ownerKeyRef.current !== ownerKey) return;
    dispatch({ type: "hydrate", todos: rows.map(toUiTodo) });
  }, [ownerKey, repository]);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      await migrateLegacyState(db);
      if (ownerKey !== "anonymous") {
        await repository.claimAnonymous(ownerKey);
      }
      const filter = loadFilterPreference();
      const priorityFilter = loadPriorityFilterPreference();
      const rows = await repository.listVisible(ownerKey);

      if (cancelled) return;

      dispatch({ type: "setFilter", filter });
      dispatch({ type: "setPriorityFilter", priorityFilter });
      dispatch({ type: "hydrate", todos: rows.map(toUiTodo) });
      setLoadedOwnerKey(ownerKey);
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [db, ownerKey, repository]);

  const add = useCallback(
    async (title: string, priority: TodoPriority = null) => {
      const row = await repository.add(title, ownerKey, Date.now(), priority);
      dispatch({ type: "upsert", todo: toUiTodo(row) });
    },
    [ownerKey, repository],
  );

  const toggle = useCallback(
    async (id: string) => {
      const row = await repository.toggle(id, ownerKey);
      dispatch({ type: "upsert", todo: toUiTodo(row) });
    },
    [ownerKey, repository],
  );

  const edit = useCallback(
    async (id: string, title: string, priority?: TodoPriority) => {
      const row = await repository.edit(
        id,
        ownerKey,
        title,
        Date.now(),
        priority,
      );
      dispatch({ type: "upsert", todo: toUiTodo(row) });
    },
    [ownerKey, repository],
  );

  const remove = useCallback(
    async (id: string) => {
      await repository.softDelete(id, ownerKey);
      dispatch({ type: "remove", id });
    },
    [ownerKey, repository],
  );

  const setFilter = useCallback((filter: Filter) => {
    saveFilterPreference(filter);
    dispatch({ type: "setFilter", filter });
  }, []);

  const setPriorityFilter = useCallback((priorityFilter: PriorityFilter) => {
    savePriorityFilterPreference(priorityFilter);
    dispatch({ type: "setPriorityFilter", priorityFilter });
  }, []);

  // While a different owner's session is hydrating, the reducer still holds
  // the previous owner's todos. Exposing them would leak one user's data to
  // the next user of a shared device for the length of the hydration window.
  const visibleState =
    loadedOwnerKey === ownerKey ? state : { ...state, todos: [] };

  return {
    state: visibleState,
    loading: loadedOwnerKey !== ownerKey,
    add,
    toggle,
    edit,
    remove,
    setFilter,
    setPriorityFilter,
    refresh,
  };
}
