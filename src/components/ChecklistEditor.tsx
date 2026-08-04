"use client";

import { useState } from "react";
import { ListChecks, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import type { ChecklistItem } from "@/lib/types";
import { cn } from "@/lib/format";

/**
 * Edit a list of steps — add, rename, reorderless remove, tick.
 *
 * Used both on a task, where the ticks are real progress, and on a recurring
 * obligation, where the list is a template copied onto each generated task
 * (`showTicks={false}` there — nothing has happened yet).
 */
export function ChecklistEditor({
  items,
  onChange,
  title = "Checklist",
  hint,
  showTicks = true,
  className,
}: {
  items: ChecklistItem[];
  onChange: (list: ChecklistItem[]) => void;
  title?: string;
  hint?: string;
  showTicks?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const toggle = (i: number) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, done: !it.done } : it)));
  const edit = (i: number, label: string) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, label } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => {
    const label = draft.trim();
    if (!label) return;
    onChange([...items, { label, done: false }]);
    setDraft("");
  };

  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-3", className)}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700">
        <ListChecks className="h-4 w-4 text-brand-600" />
        {title}
        <span className="text-xs font-normal text-slate-400">
          {items.length === 0
            ? "optional"
            : showTicks
              ? `${items.filter((i) => i.done).length}/${items.length} done`
              : `${items.length} step${items.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
      {items.length > 0 && (
        <ul className="mb-2 space-y-1" data-testid="checklist-steps">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
              {showTicks ? (
                <input
                  type="checkbox"
                  checked={it.done}
                  onChange={() => toggle(i)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
              ) : (
                <span className="w-4 shrink-0 text-center text-xs tabular-nums text-slate-400">
                  {i + 1}
                </span>
              )}
              <input
                value={it.label}
                onChange={(e) => edit(i, e.target.value)}
                aria-label="Checklist step"
                className={cn(
                  "flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm hover:border-slate-200 focus:border-brand-300 focus:bg-white focus:ring-1 focus:ring-brand-200 focus:outline-none",
                  showTicks && it.done && "text-slate-400 line-through",
                )}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                title="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a checklist step…"
        />
        <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </div>
  );
}
