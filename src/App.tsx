import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { useAuth } from "./auth/AuthContext";
import { AuthPanel } from "./components/AuthPanel";
import { EmptyState } from "./components/EmptyState";
import { Filters } from "./components/Filters";
import { Header } from "./components/Header";
import { SharedTodoCard } from "./components/SharedTodoCard";
import { SyncStatus } from "./components/SyncStatus";
import { TodoInput } from "./components/TodoInput";
import { TodoList } from "./components/TodoList";
import { useTodoAppState } from "./hooks/useTodoAppState";
import { useTodoSync } from "./hooks/useTodoSync";
import { selectCounts, selectVisibleTodos } from "./state/selectors";
import { ownerKeyForUser } from "./storage/todoDb";
import {
  isShareTargetSearch,
  readSharedTodoFromSearch,
  stripShareTargetParams,
} from "./utils/sharedTodo";

function App() {
  const initialShare = useMemo(() => {
    const search = window.location.search;
    return {
      marked: isShareTargetSearch(search),
      draft: readSharedTodoFromSearch(search),
    };
  }, []);
  const [sharedTodo, setSharedTodo] = useState<string | null>(
    initialShare.draft,
  );

  useEffect(() => {
    if (!initialShare.marked) return;
    const cleanPath = stripShareTargetParams(new URL(window.location.href));
    window.history.replaceState(window.history.state, "", cleanPath);
  }, [initialShare]);

  const { user, localUserId } = useAuth();
  const effectiveUserId = user?.id ?? localUserId;
  const ownerKey = effectiveUserId
    ? ownerKeyForUser(effectiveUserId)
    : "anonymous";
  const local = useTodoAppState(ownerKey);
  const sync = useTodoSync(user?.id ?? null, local.refresh);
  const visibleTodos = selectVisibleTodos(local.state);
  const counts = selectCounts(local.state);

  const handleAdd = async (title: string) => {
    await local.add(title);
    void sync.requestSync();
  };

  const handleSharedAdd = (title: string) => {
    setSharedTodo(null);
    void handleAdd(title);
  };

  const handleToggle = async (id: string) => {
    await local.toggle(id);
    void sync.requestSync();
  };

  const handleRemove = async (id: string) => {
    await local.remove(id);
    void sync.requestSync();
  };

  const handleEdit = async (id: string, title: string) => {
    await local.edit(id, title);
    void sync.requestSync();
  };

  return (
    <div className="app">
      <Header />
      <main className="app__main">
        <section className="card">
          <AuthPanel />
          <SyncStatus status={sync.status} />
          {sharedTodo ? (
            <SharedTodoCard
              initialValue={sharedTodo}
              onAdd={handleSharedAdd}
              onCancel={() => setSharedTodo(null)}
            />
          ) : null}
          <TodoInput onAdd={(title) => void handleAdd(title)} />
          <Filters
            filter={local.state.filter}
            counts={counts}
            onChange={local.setFilter}
          />
          {visibleTodos.length === 0 ? (
            <EmptyState />
          ) : (
            <TodoList
              todos={visibleTodos}
              onToggle={(id) => void handleToggle(id)}
              onRemove={(id) => void handleRemove(id)}
              onEdit={(id, title) => void handleEdit(id, title)}
            />
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
