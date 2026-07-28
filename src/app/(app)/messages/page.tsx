"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessagesSquare, Send, Users, ArrowLeft, Pencil, Check, X } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useAlerts } from "@/lib/alerts";
import type { ChatMessage, Conversation } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { cn, initials } from "@/lib/format";

// Messages arrive by polling — often enough to feel live, cheap enough for
// a serverless deployment.
const POLL_MS = 5_000;

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
        " " +
        d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { refresh: refreshAlerts } = useAlerts();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The message being edited (own messages only) and its working text.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  // On phones the list and the thread share the screen, one at a time.
  const [showThread, setShowThread] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = active;
  const editingRef = useRef<string | null>(null);
  editingRef.current = editingId;

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Conversation[];
      setConversations(data);
      // Open the deep-linked conversation, else the first with activity.
      if (!activeRef.current) {
        const wanted = new URLSearchParams(window.location.search).get("c");
        const pick = (wanted && data.find((c) => c.id === wanted)) || data[0];
        if (pick) setActive(pick.id);
      }
    } catch {
      // Next poll retries.
    }
  }, []);

  const loadMessages = useCallback(async (id: string, peek = false) => {
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(id)}${peek ? "?peek=1" : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as ChatMessage[];
      setMessages((prev) => {
        // Only re-render when something actually changed — a new message, or
        // an edit to one already on screen.
        const sig = (list: ChatMessage[]) =>
          list.map((m) => `${m.id}:${m.editedAt ?? ""}`).join("|");
        return sig(prev) === sig(data) ? prev : data;
      });
    } catch {
      // Next poll retries.
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Open the selected conversation and keep it fresh.
  useEffect(() => {
    if (!active) return;
    setMessages([]);
    loadMessages(active);
    refreshAlerts(); // opening clears its unread badge
    const t = setInterval(() => {
      // Pause refreshes while an edit is open so typing is never clobbered.
      if (!editingRef.current) loadMessages(active, true);
      loadConversations();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [active, loadMessages, loadConversations, refreshAlerts]);

  // Stick to the newest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || !active || sending) return;
    setSending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(active)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Could not send the message");
      }
      const saved = (await res.json()) as ChatMessage;
      setDraft("");
      setMessages((list) => [...list, saved]);
      loadConversations();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the message");
    } finally {
      setSending(false);
    }
  }

  async function saveEdit(id: string) {
    const body = editDraft.trim();
    if (!body || !active) return;
    const original = messages.find((m) => m.id === id);
    if (original && original.body === body) {
      setEditingId(null);
      return;
    }
    setErr(null);
    try {
      const res = await fetch(
        `/api/chat/${encodeURIComponent(active)}/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Could not save the change");
      }
      const saved = (await res.json()) as ChatMessage;
      setMessages((list) => list.map((m) => (m.id === id ? saved : m)));
      setEditingId(null);
      loadConversations(); // the preview may have changed
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the change");
    }
  }

  const current = conversations?.find((c) => c.id === active) ?? null;

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Instant messaging with your team — the Team channel, or one-to-one"
      />

      <Card className="overflow-hidden">
        <div className="flex h-[calc(100vh-15rem)] min-h-[24rem]">
          {/* Conversation list */}
          <aside
            className={cn(
              "w-full shrink-0 overflow-y-auto border-r border-slate-100 sm:w-72",
              showThread && "hidden sm:block",
            )}
          >
            {conversations === null ? (
              <Loading label="Loading conversations…" />
            ) : (
              <ul className="divide-y divide-slate-50">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => {
                        setActive(c.id);
                        setShowThread(true);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50",
                        active === c.id && "bg-brand-50/60",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          c.kind === "team"
                            ? "bg-fern-100 text-fern-700"
                            : "bg-brand-100 text-brand-700",
                        )}
                      >
                        {c.kind === "team" ? <Users className="h-4 w-4" /> : initials(c.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-800">
                            {c.name}
                          </span>
                          {c.lastAt && (
                            <span className="ml-auto shrink-0 text-[11px] text-slate-400">
                              {timeLabel(c.lastAt)}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span
                            className={cn(
                              "truncate text-xs",
                              c.unread > 0 ? "font-medium text-slate-700" : "text-slate-400",
                            )}
                          >
                            {c.lastMessage
                              ? `${c.lastFromSelf && c.kind === "dm" ? "You: " : ""}${c.lastMessage}`
                              : c.kind === "team"
                                ? "Everyone in the firm"
                                : (c.role ?? "No messages yet")}
                          </span>
                          {c.unread > 0 && (
                            <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                              {c.unread > 99 ? "99+" : c.unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* Thread */}
          <section className={cn("flex min-w-0 flex-1 flex-col", !showThread && "hidden sm:flex")}>
            {!current ? (
              <EmptyState
                icon={MessagesSquare}
                title="No conversation selected"
                message="Pick a colleague or the Team channel to start messaging."
              />
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                  <button
                    onClick={() => setShowThread(false)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 sm:hidden"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{current.name}</p>
                    <p className="truncate text-[11px] text-slate-400">
                      {current.kind === "team" ? "Everyone in the firm" : current.role}
                    </p>
                  </div>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50/60 px-4 py-3">
                  {messages.length === 0 && (
                    <p className="py-10 text-center text-sm text-slate-400">
                      No messages yet — say hello.
                    </p>
                  )}
                  {messages.map((m, i) => {
                    const mine = m.senderId === user?.id;
                    const prev = messages[i - 1];
                    const newDay =
                      !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
                    return (
                      <div key={m.id}>
                        {newDay && (
                          <p className="my-3 text-center text-[11px] font-medium text-slate-400">
                            {dayLabel(m.createdAt)}
                          </p>
                        )}
                        <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                              mine
                                ? "rounded-br-sm bg-brand-600 text-white"
                                : "rounded-bl-sm bg-white text-slate-800 ring-1 ring-slate-200",
                            )}
                          >
                            {!mine && current.kind === "team" && (
                              <p className="mb-0.5 text-[11px] font-semibold text-brand-600">
                                {m.sender?.name ?? "Team member"}
                              </p>
                            )}
                            {editingId === m.id ? (
                              <div className="min-w-[12rem]">
                                <textarea
                                  value={editDraft}
                                  onChange={(e) => setEditDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      saveEdit(m.id);
                                    }
                                    if (e.key === "Escape") setEditingId(null);
                                  }}
                                  autoFocus
                                  rows={2}
                                  aria-label="Edit message"
                                  className="w-full resize-y rounded-lg border border-white/40 bg-white/95 px-2 py-1.5 text-sm text-slate-800 focus:outline-none"
                                />
                                <div className="mt-1 flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => setEditingId(null)}
                                    aria-label="Cancel edit"
                                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-brand-100 hover:bg-white/15"
                                  >
                                    <X className="h-3 w-3" /> Cancel
                                  </button>
                                  <button
                                    onClick={() => saveEdit(m.id)}
                                    disabled={!editDraft.trim()}
                                    aria-label="Save edit"
                                    className="inline-flex items-center gap-1 rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-white/30 disabled:opacity-50"
                                  >
                                    <Check className="h-3 w-3" /> Save
                                  </button>
                                </div>
                                <p className="mt-0.5 text-[10px] text-brand-100">
                                  Enter saves · Esc cancels
                                </p>
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            )}
                            <p
                              className={cn(
                                "mt-0.5 flex items-center justify-end gap-1.5 text-[10px]",
                                mine ? "text-brand-100" : "text-slate-400",
                              )}
                            >
                              {m.editedAt && <span title={`Edited ${timeLabel(m.editedAt)}`}>edited</span>}
                              {timeLabel(m.createdAt)}
                              {mine && editingId !== m.id && (
                                <button
                                  onClick={() => {
                                    setEditingId(m.id);
                                    setEditDraft(m.body);
                                  }}
                                  className="rounded p-0.5 text-brand-100 hover:bg-white/20 hover:text-white"
                                  title="Edit message"
                                  aria-label="Edit message"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                </div>

                {err && (
                  <p className="border-t border-rose-100 bg-rose-50 px-4 py-1.5 text-xs text-rose-700">
                    {err}
                  </p>
                )}
                <div className="flex items-end gap-2 border-t border-slate-100 p-3">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter sends; Shift+Enter starts a new line.
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={1}
                    placeholder={
                      current.kind === "team"
                        ? "Message the whole team…"
                        : `Message ${current.name.split(" ")[0]}…`
                    }
                    className="max-h-32 min-h-[2.5rem] flex-1 resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                  />
                  <button
                    onClick={send}
                    disabled={sending || !draft.trim()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" /> Send
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </Card>
    </div>
  );
}
