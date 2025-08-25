// src/lib/auth.js
import { auth } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

export const login = (email, pass) => signInWithEmailAndPassword(auth, email, pass);

export const register = (email, pass) =>
  createUserWithEmailAndPassword(auth, email, pass);

export const resetPassword = (email) => sendPasswordResetEmail(auth, email);

export const onAuth = (cb) => onAuthStateChanged(auth, cb);

export const logout = () => signOut(auth);

// ---- ALIAS para que coincidan con lo que importan tus componentes ----
export const loginWithEmail = login;
export const resetPasswordEmail = resetPassword;
