import { BrowserRouter, Routes, Route } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import AIPlanner from "./pages/AIPlanner";
import TaskBoard from "./pages/TaskBoard";
import Insights from "./pages/Insights";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/planner" element={<AIPlanner />} />
        <Route path="/tasks" element={<TaskBoard />} />
        <Route path="/taskboard" element={<TaskBoard />} />
        <Route path="/insights" element={<Insights />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;