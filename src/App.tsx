import { useEffect, useReducer } from "react";
import "./App.css";
import { Header } from "./components/Header";
import { TodoInput } from "./components/TodoInput";
import { TodoList } from "./components/TodoList";
import { Filters } from "./components/Filters";
import { EmptyState } from "./components/EmptyState";
import { defaultState, reducer } from "./state/todosReducer";
import { selectCounts, selectVisibleTodos } from "./state/selectors";
import { useLocalStorageState } from "./hooks/useLocalStorageState";

const STORAGE_KEY = "todos_app_v1";

function App() {
  const [persistedState, setPersistedState] = useLocalStorageState(
    STORAGE_KEY,
    defaultState
  );
  const [state, dispatch] = useReducer(reducer, persistedState);

  useEffect(() => {
    setPersistedState(state);
  }, [state, setPersistedState]);

  const visibleTodos = selectVisibleTodos(state);
  const counts = selectCounts(state);

  return (
    <div className="app">
      <Header />
      <main className="app__main">
        <section className="card">
          <TodoInput onAdd={(title) => dispatch({ type: "add", title })} />
          <Filters
            filter={state.filter}
            counts={counts}
            onChange={(filter) => dispatch({ type: "setFilter", filter })}
          />
          {visibleTodos.length === 0 ? (
            <EmptyState />
          ) : (
            <TodoList
              todos={visibleTodos}
              onToggle={(id) => dispatch({ type: "toggle", id })}
              onRemove={(id) => dispatch({ type: "remove", id })}
              onEdit={(id, title) => dispatch({ type: "edit", id, title })}
            />
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
