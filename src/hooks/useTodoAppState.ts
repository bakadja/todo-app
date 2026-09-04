import { useCallback, useEffect, useReducer, useState } from "react";
import {
  defaultState,
  reducer,
  type Filter,
  type Todo,
} from "../state/todosReducer";
import {
  loadFilterPreference,
  saveFilterPreference,
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

const toUiTodo = (row: LocalTodoRecord): Todo => ({
  id: row.id,
  title: row.title,
  completed: row.completed,
  createdAt: row.createdAt,
});

export function useTodoAppState(
  ownerKey: OwnerKey,
  repository: LocalTodoRepository = localTodoRepository,
  db: TodoDb = todoDb,
) {
  const [state, dispatch] = useReducer(reducer, defaultState);
  const [loadedOwnerKey, setLoadedOwnerKey] = useState<OwnerKey | null>(null);

  const refresh = useCallback(async () => {
    const rows = await repository.listVisible(ownerKey);
    dispatch({ type: "hydrate", todos: rows.map(toUiTodo) });
  }, [ownerKey, repository]);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      await migrateLegacyState(db);
      const filter = loadFilterPreference();
      const rows = await repository.listVisible(ownerKey);

      if (cancelled) return;

      dispatch({ type: "setFilter", filter });
      dispatch({ type: "hydrate", todos: rows.map(toUiTodo) });
      setLoadedOwnerKey(ownerKey);
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [db, ownerKey, repository]);

  const add = useCallback(
    async (title: string) => {
      const row = await repository.add(title, ownerKey);
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
    async (id: string, title: string) => {
      const row = await repository.edit(id, ownerKey, title);
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

  return {
    state,
    loading: loadedOwnerKey !== ownerKey,
    add,
    toggle,
    edit,
    remove,
    setFilter,
    refresh,
  };
}
