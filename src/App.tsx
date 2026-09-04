import "./App.css";
import { useAuth } from "./auth/AuthContext";
import { AuthPanel } from "./components/AuthPanel";
import { EmptyState } from "./components/EmptyState";
import { Filters } from "./components/Filters";
import { Header } from "./components/Header";
import { SyncStatus } from "./components/SyncStatus";
import { TodoInput } from "./components/TodoInput";
import { TodoList } from "./components/TodoList";
import { useTodoAppState } from "./hooks/useTodoAppState";
import { useTodoSync } from "./hooks/useTodoSync";
import { selectCounts, selectVisibleTodos } from "./state/selectors";
import { ownerKeyForUser } from "./storage/todoDb";

function App() {
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
