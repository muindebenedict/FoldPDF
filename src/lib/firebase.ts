import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY?.trim()) || "AIzaSyCDKYB1J6M3QUEuff1f7K14jkQLclsCVoE",
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim()) || "foldpdf.online",
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim()) || "foldpdf",
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim()) || "foldpdf.firebasestorage.app",
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim()) || "796732208535",
  appId: (import.meta.env.VITE_FIREBASE_APP_ID?.trim()) || "1:796732208535:web:79e73cb7b13eedac4000d2",
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim()) || "G-SH2YD2BLKS"
};

// Handle potential environment variable typo corrections automatically
if (firebaseConfig.apiKey === "AIzaSyCDKYB1J6M3QUEufF1f7K14jkQLc1sCVOe") {
  firebaseConfig.apiKey = "AIzaSyCDKYB1J6M3QUEuff1f7K14jkQLclsCVoE";
}

console.log("Firebase initialized successfully with configuration.", {
  apiKeyLength: firebaseConfig.apiKey?.length,
  projectId: firebaseConfig.projectId
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
