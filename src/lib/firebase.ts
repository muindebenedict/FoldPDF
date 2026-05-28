import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCDKYB1J6M3QUEuff1f7K14jkQLclsCVoE",
  authDomain: "foldpdf.firebaseapp.com",
  projectId: "foldpdf",
  storageBucket: "foldpdf.firebasestorage.app",
  messagingSenderId: "796732208535",
  appId: "1:796732208535:web:79e73cb7b13eedac4000d2",
  measurementId: "G-SH2YD2BLKS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
