"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, Send, Swords, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  sendChatMessage,
  sendGameInvite,
  useChatMessages,
  useFirebaseUser,
  useFriends,
  useUserProfile
} from "@/lib/firebase";

function makeInviteRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function ChatPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading } = useFirebaseUser();
  const profile = useUserProfile(user?.uid);
  const friends = useFriends(user?.uid);
  const selectedFriendId = params.get("friend") || friends[0]?.id || "";
  const selectedFriend = useMemo(
    () => friends.find((friend) => friend.id === selectedFriendId) || null,
    [friends, selectedFriendId]
  );
  const messages = useChatMessages(user?.uid, selectedFriend?.id);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  async function sendMessage() {
    if (!user || !selectedFriend || !draft.trim()) return;
    await sendChatMessage({
      fromUserId: user.uid,
      toUserId: selectedFriend.id,
      senderName: profile?.name || user.displayName || user.email || "Player",
      text: draft
    });
    setDraft("");
  }

  async function inviteSelectedFriend() {
    if (!user || !selectedFriend || typeof window === "undefined") return;
    const room = makeInviteRoomId();
    const link = `${window.location.origin}/play/friend?room=${room}`;
    await sendGameInvite({ fromUserId: user.uid, toUserId: selectedFriend.id, roomId: room, link });
    router.push(`/play/friend?hostRoom=${room}`);
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Chat</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Checking your account...</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-5">
      <section className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5" /> Friends
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {friends.length ? (
              friends.map((friend) => (
                <Button
                  key={friend.id}
                  className="h-auto w-full justify-start px-3 py-3"
                  variant={friend.id === selectedFriendId ? "default" : "outline"}
                  asChild
                >
                  <Link href={`/chat?friend=${friend.id}`}>
                    <span className="text-left">
                      <span className="block font-semibold">{friend.name}</span>
                      <span className="block text-xs opacity-80">@{friend.nick || "player"}</span>
                    </span>
                  </Link>
                </Button>
              ))
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Add friends from your profile to start chatting.</p>
                <Button variant="outline" asChild>
                  <Link href="/profile">Open profile</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[70vh]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                {selectedFriend ? selectedFriend.name : "Chat"}
              </CardTitle>
              {selectedFriend ? (
                <div className="flex items-center gap-2">
                  <Badge>@{selectedFriend.nick || "player"}</Badge>
                  <Button size="sm" onClick={() => void inviteSelectedFriend()}>
                    <Swords className="h-4 w-4" /> Invite
                  </Button>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex min-h-[58vh] flex-col gap-4">
            {selectedFriend ? (
              <>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto rounded-md border bg-background p-3">
                  {messages.length ? (
                    messages.map((message) => {
                      const mine = message.senderId === user.uid;
                      return (
                        <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[78%] rounded-md px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            <div className="text-xs opacity-75">{message.senderName}</div>
                            <div className="whitespace-pre-wrap break-words">{message.text}</div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">No messages yet.</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Write a message"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void sendMessage();
                    }}
                  />
                  <Button onClick={() => void sendMessage()} disabled={!draft.trim()}>
                    <Send className="h-4 w-4" /> Send
                  </Button>
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center rounded-md border bg-background p-6 text-center text-sm text-muted-foreground">
                Select a friend to chat.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Chat</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Loading chat...</p>
            </CardContent>
          </Card>
        </main>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
