import { auth } from "./firebase";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

export function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
export function resetPasswordEmail(email) {
  return sendPasswordResetEmail(auth, email);
}
export function observeAuth(cb) {
  return onAuthStateChanged(auth, cb);
}
export function logout() {
  return signOut(auth);
}
