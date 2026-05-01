import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCxLEGRkPkjwvR_9yJSMccSkI5HzclU8tc",
  authDomain: "tnps-tracker-7f813.firebaseapp.com",
  projectId: "tnps-tracker-7f813",
  storageBucket: "tnps-tracker-7f813.firebasestorage.app",
  messagingSenderId: "702739623300",
  appId: "1:702739623300:web:f4311900da22ce017fc1d1",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, collection, doc, setDoc, deleteDoc, onSnapshot, query };
