"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ChatLatest = {
  id: string;
  body: string;
  createdAt: string;
  senderName: string;
  conversationId: string;
};

/** A transient pop-up shown in the corner of the app. */
export type Toast = {
  id: string;
  title: string;
  body?: string | null;
  href?: string | null;
  kind: "task" | "chat" | "info";
};

type AlertsState = {
  items: NotificationItem[];
  unread: number;
  chatUnread: number;
  toasts: Toast[];
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
  dismissToast: (id: string) => void;
  pushToast: (t: Omit<Toast, "id">) => void;
  refresh: () => Promise<void>;
  markRead: (ids?: string[]) => Promise<void>;
  /** Ask for device-notification permission (needs a user gesture). */
  enableDeviceAlerts: () => void;
};

const Ctx = createContext<AlertsState | null>(null);

const POLL_MS = 15_000;
const SOUND_KEY = "ledgify.alertSound";

/* ------------------------------------------------------------------ *
 * Chime — a short two-note tone synthesised with the Web Audio API so
 * no audio file has to ship or load. Browsers only allow audio after a
 * user gesture, so the context is created/resumed on the first one.
 * ------------------------------------------------------------------ */
let audioCtx: AudioContext | null = null;

function unlockAudio() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  } catch {
    // Audio unavailable — alerts still pop visually.
  }
}

function playChime() {
  try {
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    const now = audioCtx.currentTime;
    // Two rising notes (A5 → C#6), each softly enveloped.
    [
      { freq: 880, at: 0 },
      { freq: 1108.73, at: 0.14 },
    ].forEach(({ freq, at }) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.22, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.32);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.36);
    });
  } catch {
    // Never let a failed sound break the alert.
  }
}

/* ------------------------------------------------------------------ *
 * Device notifications — shown through the service worker when one is
 * registered (required on mobile), else the plain Notification API.
 * ------------------------------------------------------------------ */
async function showOnDevice(title: string, body: string | null, href: string | null, tag: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const options: NotificationOptions = {
    body: body ?? undefined,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag,
    data: { href: href ?? "/" },
  };
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // Fall through to the direct API.
  }
  try {
    new Notification(title, options);
  } catch {
    // Desktop-only API unavailable (mobile without SW) — the in-app toast
    // and the chime still fire.
  }
}

export function AlertsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [soundOn, setSoundOnState] = useState(true);

  const newestNotif = useRef<string | null>(null);
  const newestChat = useRef<string | null>(null);
  const primed = useRef(false);
  const soundRef = useRef(true);

  const setSoundOn = useCallback((on: boolean) => {
    soundRef.current = on;
    setSoundOnState(on);
    try {
      localStorage.setItem(SOUND_KEY, on ? "on" : "off");
    } catch {
      // Private mode — the choice just won't persist.
    }
    if (on) unlockAudio();
  }, []);

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((list) => [...list, { ...t, id }].slice(-4));
    // Auto-dismiss after a while; the bell and Messages keep the record.
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 9000);
  }, []);

  const dismissToast = useCallback(
    (id: string) => setToasts((list) => list.filter((t) => t.id !== id)),
    [],
  );

  const alert = useCallback(
    (t: Omit<Toast, "id">, tag: string) => {
      pushToast(t);
      if (soundRef.current) playChime();
      void showOnDevice(t.title, t.body ?? null, t.href ?? null, tag);
    },
    [pushToast],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: { items: NotificationItem[]; unread: number };
        chat: { unread: number; latest: ChatLatest | null };
      };
      setItems(data.notifications.items);
      setUnread(data.notifications.unread);
      setChatUnread(data.chat.unread);

      const newest = data.notifications.items[0]?.createdAt ?? null;
      const chatLatest = data.chat.latest;

      if (primed.current) {
        // Anything newer than the last poll pops with a sound. With no
        // notifications seen yet, everything in this batch is new — that is
        // a member's very first alert, which must still pop.
        const fresh = data.notifications.items.filter(
          (n) => !newestNotif.current || n.createdAt > newestNotif.current,
        );
        for (const n of fresh.slice(0, 3)) {
          alert(
            {
              title: n.title,
              body: n.body,
              href: n.href,
              kind: n.type.startsWith("task") ? "task" : "info",
            },
            n.id,
          );
        }
        if (
          chatLatest &&
          data.chat.unread > 0 &&
          (!newestChat.current || chatLatest.createdAt > newestChat.current)
        ) {
          alert(
            {
              title: `${chatLatest.senderName} sent a message`,
              body: chatLatest.body,
              href: `/messages?c=${chatLatest.conversationId}`,
              kind: "chat",
            },
            chatLatest.id,
          );
        }
      }
      newestNotif.current = newest;
      newestChat.current = chatLatest?.createdAt ?? newestChat.current;
      primed.current = true;
    } catch {
      // Network hiccup — the next poll catches up.
    }
  }, [alert]);

  const markRead = useCallback(async (ids?: string[]) => {
    const now = new Date().toISOString();
    setItems((list) =>
      list.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)),
    );
    setUnread((u) => (ids ? Math.max(0, u - ids.length) : 0));
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : {}),
      });
    } catch {
      // The next poll re-syncs the count.
    }
  }, []);

  const enableDeviceAlerts = useCallback(() => {
    unlockAudio();
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Restore the sound preference and register the notification worker.
  useEffect(() => {
    try {
      if (localStorage.getItem(SOUND_KEY) === "off") {
        soundRef.current = false;
        setSoundOnState(false);
      }
    } catch {
      // Ignore storage errors.
    }
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
  }, []);

  // Any first interaction unlocks audio playback for later alerts.
  useEffect(() => {
    const on = () => unlockAudio();
    window.addEventListener("pointerdown", on, { once: true });
    window.addEventListener("keydown", on, { once: true });
    return () => {
      window.removeEventListener("pointerdown", on);
      window.removeEventListener("keydown", on);
    };
  }, []);

  // Poll steadily, and immediately whenever the tab comes back into view.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  return (
    <Ctx.Provider
      value={{
        items,
        unread,
        chatUnread,
        toasts,
        soundOn,
        setSoundOn,
        dismissToast,
        pushToast,
        refresh,
        markRead,
        enableDeviceAlerts,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAlerts(): AlertsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAlerts must be used inside AlertsProvider");
  return ctx;
}
