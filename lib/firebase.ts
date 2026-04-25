"use client";

import { initializeApp, getApps } from "firebase/app";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
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

export type SavedMove = {
  ply: number;
  san: string;
  uci: string;
  color: "w" | "b";
  fenBefore: string;
  fenAfter: string;
};

export type SavedGame = {
  id: string;
  opponent: string;
  result: string;
  scoreDelta: number;
  pgn: string;
  fenHistory: string;
  createdAt?: { seconds: number };
};

export type UserProfile = {
  name: string;
  city: string;
  cityKey: string;
  pro?: boolean;
  pieceStyle?: "classic" | "neo" | "mono";
};

export function useFirebaseUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    void getRedirectResult(auth)
      .then((result) => {
        if (result?.user) setUser(result.user);
      })
      .catch((error) => {
        console.error("Google redirect sign-in failed", error);
      });
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  return { user, loading };
}

export function useUserProfile(userId?: string) {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!db || !userId) {
      setProfile(null);
      return;
    }
    return onSnapshot(doc(db, "users", userId), (snapshot) => {
      setProfile(snapshot.exists() ? (snapshot.data() as UserProfile) : null);
    });
  }, [userId]);

  return profile;
}

export async function signInGoogle() {
  if (!auth) return null;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

export async function signInEmail(email: string, password: string) {
  if (!auth) return null;
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerEmail(email: string, password: string) {
  if (!auth) return null;
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function signOutUser() {
  if (!auth) return;
  await signOut(auth);
}

export async function upsertUserProfile(user: User, city: string) {
  if (!db) return;
  const existing = await getDoc(doc(db, "users", user.uid));
  await setDoc(
    doc(db, "users", user.uid),
    {
      name: user.displayName || "Guest player",
      city,
      cityKey: city.toLowerCase(),
      score: existing.exists() ? existing.data().score || 0 : 0,
      pro: existing.exists() ? Boolean(existing.data().pro) : false,
      pieceStyle: existing.exists() ? existing.data().pieceStyle || "classic" : "classic",
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
  fenHistory: string;
  finalFen: string;
  scoreDelta: number;
}) {
  if (!db || !input.userId) return;
  await addDoc(collection(db, "users", input.userId, "games"), {
    opponent: input.opponent,
    pgn: input.pgn,
    result: input.result,
    fenHistory: input.fenHistory,
    finalFen: input.finalFen,
    scoreDelta: input.scoreDelta,
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
      ? query(collection(db, "leaderboard"), where("cityKey", "==", city.toLowerCase()), limit(25))
      : query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(10));
    return onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs
        .map((entry) => ({ id: entry.id, ...(entry.data() as Omit<LeaderboardPlayer, "id">) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      setPlayers(rows);
    });
  }, [city]);

  return players;
}

export function useSavedGames(userId?: string) {
  const [games, setGames] = useState<SavedGame[]>([]);

  useEffect(() => {
    if (!db || !userId) {
      setGames([]);
      return;
    }
    const q = query(collection(db, "users", userId, "games"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      setGames(snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<SavedGame, "id">) })));
    });
  }, [userId]);

  return games;
}

export async function markPro(userId?: string) {
  if (!db || !userId) return;
  await updateDoc(doc(db, "users", userId), {
    pro: true,
    upgradedAt: serverTimestamp()
  });
}

export async function setUserPieceStyle(userId: string | undefined, pieceStyle: UserProfile["pieceStyle"]) {
  if (!db || !userId) return;
  await setDoc(
    doc(db, "users", userId),
    {
      pieceStyle,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}
