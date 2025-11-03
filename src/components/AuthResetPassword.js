// src/components/AuthResetPassword.js
import React, { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../lib/firebase";
import { getApp } from "firebase/app";
import { useNavigate } from "react-router-dom";

// Forzar idioma de emails a ES (con guard)
try {
  if (auth) auth.languageCode = "es";
} catch (_) {
  // noop
}

const AuthResetPassword = ({ onSwitchView }) => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Log de proyecto para confirmar que apunta a fcaqualink
  try {
    const app = getApp();
    // eslint-disable-next-line no-console
    console.log(
      "Firebase project/authDomain:",
      app.options.projectId,
      app.options.authDomain,
    );
  } catch (_) {
    /* noop */
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");

    const target = email.trim().toLowerCase();
    if (!target) {
      setErr("Ingresa tu correo.");
      return;
    }

    setLoading(true);
    try {
      // actionCodeSettings opcional: continuar en /login del mismo origen
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const actionCodeSettings = origin
        ? { url: `${origin}/login`, handleCodeInApp: false }
        : undefined;

      await sendPasswordResetEmail(auth, target, actionCodeSettings);
      setMsg(
        "Te enviamos un correo con instrucciones para restablecer tu contraseña. Revisa tu bandeja de entrada y también el spam.",
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("RESET ERROR:", error?.code, error?.message);
      const code = error?.code ?? "";

      if (code.includes("auth/user-not-found")) {
        setErr("No existe un usuario con ese correo.");
      } else if (code.includes("auth/invalid-email")) {
        setErr("El correo no es válido.");
      } else if (code.includes("auth/too-many-requests")) {
        setErr("Demasiados intentos. Inténtalo más tarde.");
      } else if (code.includes("auth/unauthorized-continue-uri")) {
        setErr(
          "El dominio de redirección no está autorizado en Firebase (Authorized domains).",
        );
      } else if (code.includes("auth/unauthorized-domain")) {
        setErr(
          "Dominio no autorizado en Firebase. Agrega este dominio en Authentication → Sign-in method → Authorized domains.",
        );
      } else {
        setErr("No se pudo enviar el correo. " + (error?.message ?? ""));
      }
    } finally {
      setLoading(false);
    }
  };

  const backToLogin = () => {
    if (onSwitchView) onSwitchView("login");
    else navigate("/login");
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-br from-blue-100 to-cyan-100 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Restablecer Contraseña
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Ingresa tu correo electrónico para recuperar tu contraseña
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="rounded-xl bg-white px-4 py-8 shadow-2xl sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
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
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (msg) setMsg("");
                  if (err) setErr("");
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {msg && (
              <p className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-700">
                {msg}
              </p>
            )}
            {err && (
              <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {err}
              </p>
            )}

            <div>
              <button
                type="submit"
                disabled={loading || email.trim() === ""}
                className="flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
              >
                {loading ? "Enviando…" : "Enviar Instrucciones"}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={backToLogin}
              className="text-sm text-blue-600 hover:text-blue-500"
              type="button"
            >
              Volver a Iniciar Sesión
            </button>
          </div>

          {/* Nota rápida (quítala si no la quieres en UI):
              Si ves 'auth/unauthorized-continue-uri' o 'auth/unauthorized-domain',
              agrega tu dominio/host (p.ej., localhost, 127.0.0.1, tu IP LAN o tu dominio HTTPS)
              en Firebase Console → Authentication → Sign-in method → Authorized domains. */}
        </div>
      </div>
    </div>
  );
};

export default AuthResetPassword;
