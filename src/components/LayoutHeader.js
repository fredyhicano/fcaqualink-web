import React from 'react';

const LayoutHeader = ({ title, onLogout }) => {
  return (
    <header className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 py-4 px-6 shadow-lg">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
        <nav className="space-x-4">
          <button
            onClick={onLogout}
            className="text-white hover:text-cyan-200 transition"
          >
            Cerrar Sesión
          </button>
        </nav>
      </div>
    </header>
  );
};

export default LayoutHeader;