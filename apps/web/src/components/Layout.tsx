import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Toasts } from "./Toasts";

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex min-h-full">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-h-full flex-1 flex-col lg:pl-0">
        <Header onMenu={() => setMenuOpen((v) => !v)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
      <Toasts />
    </div>
  );
}
