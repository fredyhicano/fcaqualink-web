// src/lib/firebase.js
import { initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence, // <- persistencia en localStorage
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDqRTEoSKQnZnFVtEcbQn-2wwQ-tuxEyjw",
  authDomain: "fcaqualink.firebaseapp.com",
  projectId: "fcaqualink",
  storageBucket: "fcaqualink.appspot.com",
  messagingSenderId: "708544989130",
  appId: "1:708544989130:web:bef62d890ed89673c47133",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// 🔒 Mantén la sesión al refrescar (localStorage)
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Error setting auth persistence:", err);
});
