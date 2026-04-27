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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAt,
  endAt,
  where
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from "firebase/storage";
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
export const storage = app ? getStorage(app) : null;
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
  nick?: string;
  nickKey?: string;
  avatarUrl?: string;
  city: string;
  cityKey: string;
  score?: number;
  pro?: boolean;
  pieceStyle?: "cburnett" | "noto" | "neo" | "mono" | "alpha" | "merida" | "california" | "cardinal" | "pixel";
  purchasedPieceStyles?: string[];
  language?: "en" | "kk" | "ru" | "fr";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

export type Friend = {
  id: string;
  name: string;
  nick?: string;
  avatarUrl?: string;
  city?: string;
  score?: number;
};

export type FriendRequest = Friend & {
  fromUserId: string;
};

export type UserSearchResult = Friend;

export type GameInvite = {
  id: string;
  roomId: string;
  fromUserId: string;
  fromName: string;
  fromNick?: string;
  link: string;
  status?: "pending" | "accepted";
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string;
  createdAt?: { seconds: number };
};

async function resizeImageToSquare(file: File, size = 200) {
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not load image."));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not resize image.");
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create image blob."))), "image/jpeg", 0.82);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function normalizeNick(value: string) {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

function profileNick(user: User, existing?: Record<string, unknown>) {
  const currentNick = typeof existing?.nick === "string" ? existing.nick : "";
  if (currentNick) return currentNick;
  const displayNick = user.displayName?.trim().replace(/\s+/g, "");
  if (displayNick) return displayNick;
  const emailNick = user.email?.split("@")[0]?.trim();
  return emailNick || `player-${user.uid.slice(0, 6)}`;
}

export function chatThreadId(firstUserId: string, secondUserId: string) {
  return [firstUserId, secondUserId].sort().join("_");
}

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
  const data = existing.exists() ? existing.data() : undefined;
  const nick = profileNick(user, data);
  await setDoc(
    doc(db, "users", user.uid),
    {
      name: user.displayName || "Guest player",
      nick,
      nickKey: normalizeNick(nick),
      avatarUrl: existing.exists() ? data?.avatarUrl || "" : "",
      city,
      cityKey: city.toLowerCase(),
      score: existing.exists() ? data?.score || 0 : 0,
      pro: existing.exists() ? Boolean(data?.pro) : false,
      pieceStyle: existing.exists() ? data?.pieceStyle || "noto" : "noto",
      purchasedPieceStyles: existing.exists() ? data?.purchasedPieceStyles || [] : [],
      language: existing.exists() ? data?.language || "en" : "en",
      lastSeenAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function setUserNick(userId: string | undefined, nick: string) {
  if (!db || !userId) return;
  const cleanNick = nick.trim().replace(/^@+/, "");
  if (!cleanNick) return;
  await setDoc(
    doc(db, "users", userId),
    {
      nick: cleanNick,
      nickKey: normalizeNick(cleanNick),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function uploadProfileImage(userId: string | undefined, file: File) {
  if (!db || !storage || !userId) return "";
  const blob = await resizeImageToSquare(file, 200);
  const path = `users/${userId}/avatar.jpg`;
  const imageRef = storageRef(storage, path);
  await uploadBytes(imageRef, blob, { contentType: "image/jpeg" });
  const avatarUrl = await getDownloadURL(imageRef);
  await setDoc(doc(db, "users", userId), { avatarUrl, updatedAt: serverTimestamp() }, { merge: true });
  return avatarUrl;
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

export function useFriends(userId?: string) {
  const [friends, setFriends] = useState<Friend[]>([]);

  useEffect(() => {
    if (!db || !userId) {
      setFriends([]);
      return;
    }
    return onSnapshot(collection(db, "users", userId, "friends"), (snapshot) => {
      setFriends(snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<Friend, "id">) })));
    });
  }, [userId]);

  return friends;
}

export async function deleteFriend(userId: string | undefined, friendId: string | undefined) {
  if (!db || !userId || !friendId) return;
  await Promise.all([
    deleteDoc(doc(db, "users", userId, "friends", friendId)),
    deleteDoc(doc(db, "users", friendId, "friends", userId))
  ]);
}

export function useFriendRequests(userId?: string) {
  const [requests, setRequests] = useState<FriendRequest[]>([]);

  useEffect(() => {
    if (!db || !userId) {
      setRequests([]);
      return;
    }
    return onSnapshot(collection(db, "users", userId, "friendRequests"), (snapshot) => {
      setRequests(
        snapshot.docs.map((entry) => ({
          id: entry.id,
          fromUserId: entry.id,
          ...(entry.data() as Omit<FriendRequest, "id" | "fromUserId">)
        }))
      );
    });
  }, [userId]);

  return requests;
}

export function useOutgoingFriendRequests(userId?: string) {
  const [requests, setRequests] = useState<FriendRequest[]>([]);

  useEffect(() => {
    if (!db || !userId) {
      setRequests([]);
      return;
    }
    return onSnapshot(collection(db, "users", userId, "outgoingFriendRequests"), (snapshot) => {
      setRequests(
        snapshot.docs.map((entry) => ({
          id: entry.id,
          fromUserId: userId,
          ...(entry.data() as Omit<FriendRequest, "id" | "fromUserId">)
        }))
      );
    });
  }, [userId]);

  return requests;
}

export function useGameInvites(userId?: string) {
  const [invites, setInvites] = useState<GameInvite[]>([]);

  useEffect(() => {
    if (!db || !userId) {
      setInvites([]);
      return;
    }
    const q = query(collection(db, "users", userId, "gameInvites"), orderBy("createdAt", "desc"), limit(10));
    return onSnapshot(q, (snapshot) => {
      setInvites(snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<GameInvite, "id">) })));
    });
  }, [userId]);

  return invites;
}

export function useChatMessages(userId?: string, friendId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!db || !userId || !friendId) {
      setMessages([]);
      return;
    }
    const threadId = chatThreadId(userId, friendId);
    const q = query(collection(db, "chats", threadId, "messages"), orderBy("createdAt", "asc"), limit(100));
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<ChatMessage, "id">) })));
    });
  }, [friendId, userId]);

  return messages;
}

export async function searchUsersByNick(input: string, currentUserId?: string) {
  if (!db) return [];
  const nickKey = normalizeNick(input);
  if (nickKey.length < 2) return [];
  const q = query(collection(db, "users"), orderBy("nickKey"), startAt(nickKey), endAt(`${nickKey}\uf8ff`), limit(8));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .filter((entry) => entry.id !== currentUserId)
    .map((entry) => {
      const data = entry.data() as UserProfile;
      return {
        id: entry.id,
        name: data.name || "Guest player",
        nick: data.nick,
        avatarUrl: data.avatarUrl,
        city: data.city,
        score: data.score || 0
      };
    });
}

async function friendSnapshot(userId: string) {
  const snapshot = await getDoc(doc(db!, "users", userId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as UserProfile;
  return {
    name: data.name || "Guest player",
    nick: data.nick,
    avatarUrl: data.avatarUrl,
    city: data.city,
    score: data.score || 0
  };
}

export async function sendFriendRequest(fromUserId: string | undefined, toUserId: string | undefined) {
  if (!db || !fromUserId || !toUserId || fromUserId === toUserId) return;
  const [fromProfile, toProfile] = await Promise.all([friendSnapshot(fromUserId), friendSnapshot(toUserId)]);
  if (!fromProfile || !toProfile) throw new Error("User was not found.");
  const existingFriend = await getDoc(doc(db, "users", fromUserId, "friends", toUserId));
  if (existingFriend.exists()) throw new Error("This user is already your friend.");
  await setDoc(
    doc(db, "users", toUserId, "friendRequests", fromUserId),
    {
      ...fromProfile,
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
  await setDoc(
    doc(db, "users", fromUserId, "outgoingFriendRequests", toUserId),
    {
      ...toProfile,
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function acceptFriendRequest(userId: string | undefined, fromUserId: string | undefined) {
  if (!db || !userId || !fromUserId || userId === fromUserId) return;
  const [userProfile, friendProfile] = await Promise.all([friendSnapshot(userId), friendSnapshot(fromUserId)]);
  if (!userProfile || !friendProfile) throw new Error("User was not found.");
  await Promise.all([
    setDoc(doc(db, "users", userId, "friends", fromUserId), { ...friendProfile, createdAt: serverTimestamp() }, { merge: true }),
    setDoc(doc(db, "users", fromUserId, "friends", userId), { ...userProfile, createdAt: serverTimestamp() }, { merge: true }),
    deleteDoc(doc(db, "users", userId, "friendRequests", fromUserId)),
    deleteDoc(doc(db, "users", fromUserId, "friendRequests", userId)),
    deleteDoc(doc(db, "users", fromUserId, "outgoingFriendRequests", userId)),
    deleteDoc(doc(db, "users", userId, "outgoingFriendRequests", fromUserId))
  ]);
}

export async function declineFriendRequest(userId: string | undefined, fromUserId: string | undefined) {
  if (!db || !userId || !fromUserId) return;
  await Promise.all([
    deleteDoc(doc(db, "users", userId, "friendRequests", fromUserId)),
    deleteDoc(doc(db, "users", fromUserId, "outgoingFriendRequests", userId))
  ]);
}

export async function sendGameInvite(input: {
  fromUserId?: string;
  toUserId?: string;
  roomId: string;
  link: string;
}) {
  if (!db || !input.fromUserId || !input.toUserId || input.fromUserId === input.toUserId) return;
  const fromProfile = await friendSnapshot(input.fromUserId);
  if (!fromProfile) throw new Error("User was not found.");
  const inviteRef = doc(db, "users", input.toUserId, "gameInvites", input.roomId);
  await setDoc(
    inviteRef,
    {
      roomId: input.roomId,
      fromUserId: input.fromUserId,
      fromName: fromProfile.name,
      fromNick: fromProfile.nick,
      link: input.link,
      status: "pending",
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function dismissGameInvite(userId: string | undefined, inviteId: string | undefined) {
  if (!db || !userId || !inviteId) return;
  await deleteDoc(doc(db, "users", userId, "gameInvites", inviteId));
}

export async function sendChatMessage(input: {
  fromUserId?: string;
  toUserId?: string;
  senderName: string;
  text: string;
  imageFile?: File;
}) {
  if (!db || !input.fromUserId || !input.toUserId) return;
  const text = input.text.trim();
  if (!text && !input.imageFile) return;
  const threadId = chatThreadId(input.fromUserId, input.toUserId);
  await setDoc(
    doc(db, "chats", threadId),
    {
      participants: [input.fromUserId, input.toUserId],
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
  let imageUrl = "";
  if (input.imageFile) {
    if (!storage) throw new Error("Firebase Storage is not configured.");
    const blob = await resizeImageToSquare(input.imageFile, 200);
    const imageRef = storageRef(storage, `chats/${threadId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
    await uploadBytes(imageRef, blob, { contentType: "image/jpeg" });
    imageUrl = await getDownloadURL(imageRef);
  }
  await addDoc(collection(db, "chats", threadId, "messages"), {
    senderId: input.fromUserId,
    senderName: input.senderName,
    text: text.slice(0, 1000),
    imageUrl,
    createdAt: serverTimestamp()
  });
}

export async function markPro(userId?: string, stripe?: { customerId?: string; subscriptionId?: string }) {
  if (!db || !userId) return;
  await setDoc(
    doc(db, "users", userId),
    {
      pro: true,
      stripeCustomerId: stripe?.customerId,
      stripeSubscriptionId: stripe?.subscriptionId,
      upgradedAt: serverTimestamp()
    },
    { merge: true }
  );
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

export async function markPieceStylePurchased(userId: string | undefined, pieceStyle: "alpha" | "merida" | "california" | "cardinal" | "pixel") {
  if (!db || !userId) return;
  const userRef = doc(db, "users", userId);
  const snapshot = await getDoc(userRef);
  const current = snapshot.exists() ? snapshot.data().purchasedPieceStyles || [] : [];
  const next = Array.from(new Set([...current, pieceStyle]));
  await setDoc(
    userRef,
    {
      purchasedPieceStyles: next,
      pieceStyle,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function setUserLanguage(userId: string | undefined, language: UserProfile["language"]) {
  if (!db || !userId) return;
  await setDoc(
    doc(db, "users", userId),
    {
      language,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}
