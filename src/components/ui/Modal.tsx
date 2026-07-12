"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/format";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg";
}) {
  // Render into <body> via a portal so the fixed overlay is positioned
  // relative to the viewport — not to any ancestor that establishes a
  // containing block (e.g. the header's `backdrop-blur`, which otherwise
  // traps a modal opened from the top bar inside a thin strip).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      {/* min-h-full keeps short modals centred and tall ones fully scrollable */}
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div
          className={cn(
            "relative my-8 w-full rounded-2xl bg-white shadow-xl ring-1 ring-slate-200",
            size === "lg" ? "max-w-2xl" : "max-w-lg",
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{title}</h2>
              {description && (
                <p className="mt-0.5 text-xs text-slate-500">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="-mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
