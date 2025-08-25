import React, { useState } from "react";
import { loginWithEmail } from "../lib/auth"; // <-- usamos Firebase Auth

const AuthLogin = ({ onLogin, onSwitchView }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Ingresa correo y contraseña.");
      return;
    }

    setLoading(true);
    try {
      const cred = await loginWithEmail(email, password); // <-- valida en Firebase
      if (typeof onLogin === "function") {
        onLogin(cred.user); // compatibilidad con tu flujo actual
      } else {
        window.location.href = "/"; // o la ruta de tu dashboard
      }
    } catch (err) {
      const code = err?.code || "";
      if (
        code.includes("auth/invalid-credential") ||
        code.includes("auth/wrong-password")
      ) {
        setError("Correo o contraseña incorrectos.");
      } else if (code.includes("auth/user-not-found")) {
        setError("El usuario no existe.");
      } else if (code.includes("auth/too-many-requests")) {
        setError("Demasiados intentos. Inténtalo más tarde.");
      } else {
        setError("No se pudo iniciar sesión. " + (err.message ?? ""));
      }
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = Boolean(email) && Boolean(password) && !loading;

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-br from-blue-500 via-cyan-300 to-emerald-300 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <img
          src="/assets/84427232.svg"
          alt="Logo FCAquaLink"
          className="mx-auto mb-4 h-auto w-60"
        />
        <h2 className="text-center text-3xl font-extrabold text-gray-900">
          Universidad Mariano Galvez Guatemala
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Ingeniería en Sistemas de Información y Ciencias de la Computación
        </p>
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
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Correo Electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="tucorreo@dominio.com"
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
              >
                {loading ? "Ingresando…" : "Iniciar Sesión"}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => onSwitchView?.("register")}
              className="text-sm text-blue-600 hover:text-blue-500"
              type="button"
            >
              Crear una cuenta
            </button>
            <span className="mx-2 text-gray-400">|</span>
            <button
              onClick={() => onSwitchView?.("reset")}
              className="text-sm text-blue-600 hover:text-blue-500"
              type="button"
            >
              Olvidé mi contraseña
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLogin;
