import Sidebar from "./Sidebar";

function MainLayout({ children }) {
  return (
    <div className="flex bg-black min-h-screen">
      <Sidebar />

      <main className="flex-1 p-8 text-white">
        {children}
      </main>
    </div>
  );
}

export default MainLayout;