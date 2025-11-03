// src/App.js
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
  return <AuthLogin />;
}

// Registro: ahora SÍ pasamos onRegister
function RegisterRoute() {
  const { user, authReady } = useAuth();
  if (!authReady) return <div style={{ padding: 24 }}>Cargando…</div>;
  if (user) return <Navigate to="/dashboard" replace />;

  // Implementación mínima de creación de usuario + rol por defecto en Firestore
  const handleRegister = async (name, email, password) => {
    // Importes dinámicos para evitar peso en el bundle inicial
    const { getAuth, createUserWithEmailAndPassword, updateProfile } = await import(
      "firebase/auth"
    );
    const { getFirestore, doc, setDoc, serverTimestamp } = await import(
      "firebase/firestore"
    );
    const { app } = await import("./lib/firebase");

    const auth = getAuth(app);
    const db = getFirestore(app);

    // 1) Crear usuario en Auth
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // 2) Guardar displayName (opcional)
    if (name?.trim()) {
      await updateProfile(cred.user, { displayName: name.trim() });
    }

    // 3) Crear doc en Firestore con rol por defecto
    await setDoc(doc(db, "users", cred.user.uid), {
      email: email.toLowerCase(),
      displayName: name || "",
      role: "Tecnico", // Cambia si quieres: "Operador", "Tecnico" o "Consulta"
      createdAt: serverTimestamp(),
    });

    return cred.user;
  };

  return <AuthRegister onRegister={handleRegister} />;
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
          {/* ALIAS para que el botón que navega a /forgot funcione */}
          <Route path="/forgot" element={<ResetRoute />} />

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
