import { WorkflowList } from "./views/WorkflowList";

function toggleDark(): void {
  document.documentElement.classList.toggle("dark");
}

export function App(): JSX.Element {
  return (
    <div className="min-h-screen p-4">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Minions</h1>
        <button
          type="button"
          onClick={toggleDark}
          className="px-3 py-1 text-sm border rounded"
        >
          Toggle theme
        </button>
      </header>
      <WorkflowList />
    </div>
  );
}
