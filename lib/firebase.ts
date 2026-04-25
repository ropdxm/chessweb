"use client";

import { initializeApp, getApps } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { useEffect, useState } from "react";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const enabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
const app = enabled && !getApps().length ? initializeApp(firebaseConfig) : enabled ? getApps()[0] : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const firebaseEnabled = enabled;

export type LeaderboardPlayer = {
  id: string;
  name: string;
  city: string;
  score: number;
};

export function useFirebaseUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  return { user, loading };
}

export async function signInGuest() {
  if (!auth) return null;
  return signInAnonymously(auth);
}

export async function signInGoogle() {
  if (!auth) return null;
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOutUser() {
  if (!auth) return;
  await signOut(auth);
}

export async function upsertUserProfile(user: User, city: string) {
  if (!db) return;
  await setDoc(
    doc(db, "users", user.uid),
    {
      name: user.displayName || "Guest player",
      city,
      cityKey: city.toLowerCase(),
      lastSeenAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function saveGameRecord(input: {
  userId?: string;
  opponent: string;
  pgn: string;
  result: string;
  moves: string[];
}) {
  if (!db || !input.userId) return;
  await addDoc(collection(db, "users", input.userId, "games"), {
    opponent: input.opponent,
    pgn: input.pgn,
    result: input.result,
    moves: input.moves,
    createdAt: serverTimestamp()
  });
}

export async function updateLeaderboard(input: { userId?: string; name: string; city: string; delta: number }) {
  if (!db || !input.userId) return;
  await setDoc(
    doc(db, "leaderboard", input.userId),
    {
      name: input.name,
      city: input.city,
      cityKey: input.city.toLowerCase(),
      score: increment(input.delta),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export function useLeaderboard(city?: string) {
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);

  useEffect(() => {
    if (!db) return;
    const q = city
      ? query(collection(db, "leaderboard"), where("cityKey", "==", city.toLowerCase()), orderBy("score", "desc"), limit(10))
      : query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(10));
    return onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<LeaderboardPlayer, "id">) }));
      setPlayers(rows);
    });
  }, [city]);

  return players;
}

export async function markPro(userId?: string) {
  if (!db || !userId) return;
  await updateDoc(doc(db, "users", userId), {
    pro: true,
    upgradedAt: serverTimestamp()
  });
}
