import React from "react";

const LayoutHeader = ({ title, onLogout }) => {
  return (
    <header className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-4 shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        <nav className="space-x-4">
          <button
            onClick={onLogout}
            className="text-white transition hover:text-cyan-200"
          >
            Cerrar Sesión
          </button>
        </nav>
      </div>
    </header>
  );
};

export default LayoutHeader;
