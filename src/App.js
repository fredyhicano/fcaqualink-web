import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";

import LayoutHeader from "./components/LayoutHeader";
import AuthLogin from "./components/AuthLogin";
import AuthRegister from "./components/AuthRegister";
import AuthResetPassword from "./components/AuthResetPassword";
import DashboardSensors from "./components/DashboardSensors";

import { AuthProvider, useAuth } from "./hooks/useAuth";
import PrivateRoute from "./components/PrivateRoute";
import { auth } from "./lib/firebase";

// Header + Dashboard envueltos con logout real
function DashboardWithHeader() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Error al cerrar sesión:", err);
    }
  };

  return (
    <>
      <LayoutHeader title="FCAquaLink" onLogout={handleLogout} />
      <DashboardSensors />
    </>
  );
}

// Si ya estás logueado y visitas /login, redirige a /dashboard
function LoginRoute() {
  const { user, authReady } = useAuth();
  if (!authReady) return <div style={{ padding: 24 }}>Cargando…</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  // Si tu AuthLogin necesita props, agrégalas aquí (onLogin, onSwitchView, etc.)
  return <AuthLogin />;
}

function RegisterRoute() {
  const { user, authReady } = useAuth();
  if (!authReady) return <div style={{ padding: 24 }}>Cargando…</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <AuthRegister />;
}

function ResetRoute() {
  const { user, authReady } = useAuth();
  if (!authReady) return <div style={{ padding: 24 }}>Cargando…</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <AuthResetPassword />;
}

const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* públicas */}
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/register" element={<RegisterRoute />} />
          <Route path="/reset" element={<ResetRoute />} />

          {/* privadas */}
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <DashboardWithHeader />
              </PrivateRoute>
            }
          />

          {/* raíz → a dashboard si logueado, si no a login */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
