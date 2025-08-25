// src/lib/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDqRTEoSKQnZnFVtEcbQn-2wwQ-tuxEyjw",
  authDomain: "fcaqualink.firebaseapp.com",
  projectId: "fcaqualink",
  storageBucket: "fcaqualink.firebasestorage.app",
  messagingSenderId: "708544989130",
  appId: "1:708544989130:web:bef62d890ed89673c47133",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
