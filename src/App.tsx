import { useReducer } from "react";
import "./App.css";
import { Header } from "./components/Header";
import { TodoInput } from "./components/TodoInput";
import { TodoList } from "./components/TodoList";
import { defaultState, reducer } from "./state/todosReducer";
import { selectVisibleTodos } from "./state/selectors";

function App() {
  const [state, dispatch] = useReducer(reducer, defaultState);
  const visibleTodos = selectVisibleTodos(state);

  return (
    <div className="app">
      <Header />
      <main className="app__main">
        <section className="card">
          <TodoInput onAdd={(title) => dispatch({ type: "add", title })} />
          <TodoList
            todos={visibleTodos}
            onToggle={(id) => dispatch({ type: "toggle", id })}
            onRemove={(id) => dispatch({ type: "remove", id })}
          />
        </section>
      </main>
    </div>
  );
}

export default App;
