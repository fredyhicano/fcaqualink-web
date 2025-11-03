// src/lib/firebase.js
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ─────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDqRTEoSKQnZnFVtEcbQn-2wwQ-tuxEyjw",
  authDomain: "fcaqualink.firebaseapp.com",
  projectId: "fcaqualink",
  storageBucket: "fcaqualink.appspot.com",
  messagingSenderId: "708544989130",
  appId: "1:708544989130:web:bef62d890ed89673c47133",
};

// Evita doble inicialización en hot-reload
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Auth principal (tu sesión actual)
export const auth = getAuth(app);

// Persistencia en localStorage (mantener sesión tras refresh)
setPersistence(auth, browserLocalPersistence).catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Error setting auth persistence:", err);
});

// Idioma de emails a ES (por si usas plantillas de Firebase)
try {
  auth.languageCode = "es";
} catch {
  /* noop */
}

// Firestore (para guardar roles, perfiles, etc.)
export const db = getFirestore(app);

// ─────────────────────────────────────────────────────────
// Auth secundario: permite crear usuarios sin “sacar” al admin
// ─────────────────────────────────────────────────────────
export function getSecondaryAuth() {
  // Reutiliza si ya existe
  const name = "secondary";
  const existing = getApps().find((a) => a.name === name);
  const secondaryApp = existing || initializeApp(firebaseConfig, name);
  const secondaryAuth = getAuth(secondaryApp);

  // No seteamos persistencia aquí para evitar que tome control de la sesión
  // (el default está bien para uso temporal).
  try {
    secondaryAuth.languageCode = "es";
  } catch {
    /* noop */
  }

  return secondaryAuth;
}

// ─────────────────────────────────────────────────────────
// Roles soportados en la app (útiles para selects/validaciones)
// ─────────────────────────────────────────────────────────
export const ROLES = ["Operador", "Tecnico", "Consulta"];
