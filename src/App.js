import React, { useState } from "react";
import LayoutHeader from "./components/LayoutHeader";
import AuthLogin from "./components/AuthLogin";
import AuthRegister from "./components/AuthRegister";
import AuthResetPassword from "./components/AuthResetPassword";
import DashboardSensors from "./components/DashboardSensors";

const App = () => {
  const [currentView, setCurrentView] = useState("login");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleLogin = (email, password) => {
    // Aquí iría la lógica de autenticación con backend
    setIsLoggedIn(true);
    setCurrentView("dashboard");
  };

  const handleRegister = (name, email, password) => {
    // Aquí iría la lógica de registro con backend
    setIsLoggedIn(true);
    setCurrentView("dashboard");
  };

  const handleResetPassword = (email) => {
    // Aquí iría la lógica de reseteo de contraseña
    alert("Instrucciones enviadas a " + email);
    setCurrentView("login");
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentView("login");
  };

  const handleSwitchView = (view) => {
    setCurrentView(view);
  };

  const renderView = () => {
    if (!isLoggedIn) {
      switch (currentView) {
        case "login":
          return <AuthLogin onLogin={handleLogin} onSwitchView={handleSwitchView} />;
        case "register":
          return (
            <AuthRegister onRegister={handleRegister} onSwitchView={handleSwitchView} />
          );
        case "reset":
          return (
            <AuthResetPassword
              onResetPassword={handleResetPassword}
              onSwitchView={handleSwitchView}
            />
          );
        default:
          return <AuthLogin onLogin={handleLogin} onSwitchView={handleSwitchView} />;
      }
    }
    return (
      <>
        <LayoutHeader title="FCAquaLink" onLogout={handleLogout} />
        <DashboardSensors />
      </>
    );
  };

  return <div className="min-h-screen bg-gray-100">{renderView()}</div>;
};

export default App;
