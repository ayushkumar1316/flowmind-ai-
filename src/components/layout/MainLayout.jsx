import Sidebar from "./Sidebar";
import { Outlet } from "react-router-dom";

function MainLayout() {
  return (
    <div className="flex bg-[#F6F1EA] min-h-screen font-sans text-gray-900 selection:bg-purple-200 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden h-screen scroll-smooth">
        <Outlet /> 
      </main>
    </div>
  );
}

export default MainLayout;