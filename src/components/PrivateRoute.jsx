// src/components/PrivateRoute.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function PrivateRoute({ children }) {
  const { user, authReady } = useAuth();

  // Espera a que Firebase hidrate la sesión para evitar redirecciones falsas
  if (!authReady) return <div style={{ padding: 24 }}>Cargando…</div>;

  if (!user) return <Navigate to="/login" replace />;
  return children;
}
