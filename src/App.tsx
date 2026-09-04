import "./App.css";
import { AuthPanel } from "./components/AuthPanel";
import { EmptyState } from "./components/EmptyState";
import { Filters } from "./components/Filters";
import { Header } from "./components/Header";
import { TodoInput } from "./components/TodoInput";
import { TodoList } from "./components/TodoList";
import { useTodoAppState } from "./hooks/useTodoAppState";
import { selectCounts, selectVisibleTodos } from "./state/selectors";

function App() {
  const local = useTodoAppState("anonymous");
  const visibleTodos = selectVisibleTodos(local.state);
  const counts = selectCounts(local.state);

  return (
    <div className="app">
      <Header />
      <main className="app__main">
        <section className="card">
          <AuthPanel />
          <TodoInput onAdd={(title) => void local.add(title)} />
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
              onToggle={(id) => void local.toggle(id)}
              onRemove={(id) => void local.remove(id)}
              onEdit={(id, title) => void local.edit(id, title)}
            />
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
