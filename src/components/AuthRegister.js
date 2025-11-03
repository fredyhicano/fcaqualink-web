// src/components/AuthRegister.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const AuthRegister = ({ onRegister, onSwitchView }) => {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validate = () => {
    if (!name.trim()) return "Ingresa tu nombre completo.";
    if (!email.trim()) return "Ingresa tu correo.";
    // validación simple de email (sin exagerar)
    if (!/^\S+@\S+\.\S+$/.test(email)) return "Correo inválido.";
    if (!password) return "Ingresa tu contraseña.";
    if (password.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
    if (password !== confirmPassword) return "Las contraseñas no coinciden.";
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }

    if (typeof onRegister !== "function") {
      // Si el padre no implementó onRegister, prevenimos un estado "fantasma"
      setError("No se pudo registrar: onRegister no está definido.");
      return;
    }

    setLoading(true);
    try {
      await onRegister(name.trim(), email.trim(), password);
      // Si el padre controla pantallas, úsalo. Si no, navegamos a /login
      if (onSwitchView) onSwitchView("login");
      else navigate("/login");
    } catch (err) {
      // Estandarizamos errores comunes (Firebase u otro backend)
      const code = err?.code || "";
      if (code.includes("auth/email-already-in-use")) {
        setError("Ese correo ya está en uso.");
      } else if (code.includes("auth/invalid-email")) {
        setError("Correo inválido.");
      } else if (code.includes("auth/weak-password")) {
        setError("La contraseña es muy débil.");
      } else {
        setError("No se pudo crear la cuenta. " + (err?.message || ""));
      }
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    !!name.trim() && !!email.trim() && !!password && !!confirmPassword && !loading;

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-br from-blue-100 to-cyan-100 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Crear Cuenta
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="rounded-xl bg-white px-4 py-8 shadow-2xl sm:px-10">
          {/* Mensaje de error */}
          {error && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Nombre Completo
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Correo Electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Mínimo 6 caracteres.</p>
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-gray-700"
              >
                Confirmar Contraseña
              </label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
              >
                {loading ? "Registrando…" : "Registrarse"}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => (onSwitchView ? onSwitchView("login") : navigate("/login"))}
              className="text-sm text-blue-600 hover:text-blue-500"
              type="button"
            >
              ¿Ya tienes una cuenta? Inicia sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthRegister;
