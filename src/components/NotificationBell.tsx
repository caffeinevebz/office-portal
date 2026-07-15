"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ClipboardList, IndianRupee, BadgeCheck } from "lucide-react";
import { apiMutate } from "@/lib/useApi";
import { cn } from "@/lib/format";

type Item = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

const POLL_MS = 30_000;

function typeIcon(type: string) {
  if (type.startsWith("expense")) return IndianRupee;
  if (type === "task-approver") return BadgeCheck;
  return ClipboardList;
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Pop the notification on the device via the browser Notification API. */
function popOnDevice(items: Item[]) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  for (const n of items.slice(0, 3)) {
    try {
      new Notification(n.title, {
        body: n.body ?? undefined,
        icon: "/icon-192.png",
        tag: n.id, // dedupe if the poll fires twice
      });
    } catch {
      // Some browsers (mobile Chrome) require a service worker — fail quietly.
    }
  }
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  // Newest createdAt already seen — anything newer pops on the device.
  const newestSeen = useRef<string | null>(null);
  const firstLoad = useRef(true);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: Item[]; unread: number };
      setItems(data.items);
      setUnread(data.unread);
      const newest = data.items[0]?.createdAt ?? null;
      if (!firstLoad.current && newestSeen.current && newest && newest > newestSeen.current) {
        popOnDevice(data.items.filter((n) => n.createdAt > newestSeen.current!));
      }
      if (newest) newestSeen.current = newest;
      firstLoad.current = false;
    } catch {
      // Network hiccup — the next poll will catch up.
    }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  function toggle() {
    setOpen((o) => !o);
    // Ask for device-notification permission on the first interaction (a
    // user gesture is required by the browser).
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }

  async function markAllRead() {
    setUnread(0);
    setItems((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    await apiMutate("/api/notifications", "POST").catch(() => {});
  }

  async function openItem(n: Item) {
    setOpen(false);
    if (!n.readAt) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) =>
        list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
      );
      apiMutate("/api/notifications", "POST", { ids: [n.id] }).catch(() => {});
    }
    if (n.href) router.push(n.href);
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <p className="text-sm font-semibold text-slate-800">Notifications</p>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-96 divide-y divide-slate-50 overflow-y-auto">
              {items.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-slate-400">
                  Nothing yet — task assignments and approvals show up here.
                </li>
              )}
              {items.map((n) => {
                const Icon = typeIcon(n.type);
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => openItem(n)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50",
                        !n.readAt && "bg-brand-50/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 rounded-lg p-1.5",
                          n.readAt ? "bg-slate-100 text-slate-400" : "bg-brand-100 text-brand-600",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-sm",
                            n.readAt ? "text-slate-600" : "font-medium text-slate-900",
                          )}
                        >
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                      {!n.readAt && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
