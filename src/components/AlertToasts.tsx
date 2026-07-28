"use client";

import { useRouter } from "next/navigation";
import { X, ClipboardList, MessageSquare, BellRing } from "lucide-react";
import { useAlerts } from "@/lib/alerts";

const ICON = {
  task: ClipboardList,
  chat: MessageSquare,
  info: BellRing,
} as const;

/**
 * Corner pop-ups for live alerts — a task assigned to you, or a new message.
 * They appear even while the tab is focused (where the OS notification is
 * usually suppressed), and clicking one jumps straight to the item.
 */
export function AlertToasts() {
  const { toasts, dismissToast } = useAlerts();
  const router = useRouter();
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96">
      {toasts.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div
            key={t.id}
            role="alert"
            className="pointer-events-auto w-full animate-[fadeIn_150ms_ease-out] rounded-xl border border-slate-200 bg-white p-3 shadow-lg ring-1 ring-black/5"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-lg bg-brand-100 p-1.5 text-brand-600">
                <Icon className="h-4 w-4" />
              </span>
              <button
                onClick={() => {
                  dismissToast(t.id);
                  if (t.href) router.push(t.href);
                }}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium text-slate-900">{t.title}</p>
                {t.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{t.body}</p>}
              </button>
              <button
                onClick={() => dismissToast(t.id)}
                className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
