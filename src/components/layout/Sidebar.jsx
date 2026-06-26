import { Link } from "react-router-dom";

function Sidebar() {
  return (
    <div className="w-64 min-h-screen bg-zinc-950 border-r border-zinc-800 p-6">
      <h1 className="text-2xl font-bold text-white mb-8">
        ⚡ FlowMind
      </h1>

      <div className="flex flex-col gap-4">
        <Link to="/" className="text-zinc-300 hover:text-white">
          Dashboard
        </Link>

        <Link to="/planner" className="text-zinc-300 hover:text-white">
          AI Planner
        </Link>

        <Link to="/tasks" className="text-zinc-300 hover:text-white">
          Task Board
        </Link>

        <Link to="/insights" className="text-zinc-300 hover:text-white">
          Insights
        </Link>
      </div>
    </div>
  );
}

export default Sidebar;