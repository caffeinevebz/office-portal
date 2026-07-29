"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  Check,
  RotateCcw,
  MessageCircle,
  HelpCircle,
  Pencil,
  CircleDot,
  CircleCheck,
} from "lucide-react";
import type { Task, TaskQuery } from "@/lib/types";
import { WhatsappModal } from "@/components/WhatsappModal";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn, formatDate } from "@/lib/format";

/**
 * Points on a task awaiting the client's clarification. Opened from the task
 * row into a full modal — the list needs room for the question, the client's
 * answer and who raised it, which a table cell cannot give it.
 */
export function TaskQueriesModal({
  task,
  canManage,
  onChanged,
  onClose,
}: {
  task: Task;
  canManage: boolean;
  onChanged: (queries: TaskQuery[]) => void;
  onClose: () => void;
}) {
  const queries = task.queries ?? [];
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Which point is being answered / reworded, and the working text.
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [waOpen, setWaOpen] = useState(false);

  const base = `/api/tasks/${task.id}/queries`;
  const open = queries.filter((q) => q.status !== "Answered");
  const answered = queries.filter((q) => q.status === "Answered");

  async function call(url: string, method: string, body?: unknown): Promise<TaskQuery | null> {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Could not save");
      }
      return method === "DELETE" ? null : ((await res.json()) as TaskQuery);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const point = draft.trim();
    if (!point) return;
    try {
      const created = await call(base, "POST", { point });
      if (created) onChanged([...queries, created]);
      setDraft("");
    } catch {
      // The banner already explains it.
    }
  }

  async function saveAnswer(q: TaskQuery) {
    const response = answer.trim();
    if (!response) return;
    try {
      const updated = await call(`${base}/${q.id}`, "PATCH", { response, status: "Answered" });
      if (updated) onChanged(queries.map((x) => (x.id === q.id ? updated : x)));
      setAnswering(null);
      setAnswer("");
    } catch {
      // Handled by the banner.
    }
  }

  async function savePoint(q: TaskQuery) {
    const point = editText.trim();
    if (!point) return;
    try {
      const updated = await call(`${base}/${q.id}`, "PATCH", { point });
      if (updated) onChanged(queries.map((x) => (x.id === q.id ? updated : x)));
      setEditing(null);
    } catch {
      // Handled by the banner.
    }
  }

  async function reopen(q: TaskQuery) {
    try {
      const updated = await call(`${base}/${q.id}`, "PATCH", { response: null, status: "Open" });
      if (updated) onChanged(queries.map((x) => (x.id === q.id ? updated : x)));
    } catch {
      // Handled by the banner.
    }
  }

  async function remove(q: TaskQuery) {
    try {
      await call(`${base}/${q.id}`, "DELETE");
      onChanged(queries.filter((x) => x.id !== q.id));
    } catch {
      // Handled by the banner.
    }
  }

  // What goes to the client: every point still awaiting an answer.
  const waMessage =
    `Regarding ${task.title}${task.client?.name ? ` (${task.client.name})` : ""}, ` +
    `we need clarification on the following:\n\n` +
    open.map((q, i) => `${i + 1}. ${q.point}`).join("\n") +
    `\n\nKindly confirm at your convenience. Thank you.`;

  const card = (q: TaskQuery) => {
    const isAnswered = q.status === "Answered";
    return (
      <li
        key={q.id}
        className={cn(
          "rounded-xl border bg-white p-4 shadow-sm",
          isAnswered ? "border-slate-200" : "border-amber-200 bg-amber-50/30",
        )}
      >
        {/* Wraps on narrow screens so the actions never overflow the card. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              isAnswered ? "bg-fern-100 text-fern-800" : "bg-amber-100 text-amber-800",
            )}
          >
            {isAnswered ? (
              <CircleCheck className="h-3.5 w-3.5" />
            ) : (
              <CircleDot className="h-3.5 w-3.5" />
            )}
            {isAnswered ? "Answered" : "Awaiting client"}
          </span>

          {canManage && editing !== q.id && answering !== q.id && (
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {isAnswered ? (
                <>
                  {/* An answer that came out garbled can be corrected in
                      place — reopening is for when it was wrong entirely. */}
                  <button
                    onClick={() => {
                      setAnswering(q.id);
                      setAnswer(q.response ?? "");
                    }}
                    disabled={busy}
                    aria-label="Edit answer"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-fern-50 hover:text-fern-700"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit answer
                  </button>
                  <button
                    onClick={() => reopen(q)}
                    disabled={busy}
                    aria-label="Reopen point"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-amber-50 hover:text-amber-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reopen
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setAnswering(q.id);
                    setAnswer(q.response ?? "");
                  }}
                  disabled={busy}
                  aria-label="Record answer"
                  className="inline-flex items-center gap-1 rounded-lg bg-fern-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-fern-700"
                >
                  <Check className="h-3.5 w-3.5" /> Record answer
                </button>
              )}
              <button
                onClick={() => {
                  setEditing(q.id);
                  setEditText(q.point);
                }}
                disabled={busy}
                aria-label="Edit point"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Edit the question"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => remove(q)}
                disabled={busy}
                aria-label="Remove point"
                className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                title="Remove this point"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* The question */}
        {editing === q.id ? (
          <div className="mt-3">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              autoFocus
              aria-label="Edit point"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => savePoint(q)} disabled={busy || !editText.trim()}>
                Save point
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-slate-800">{q.point}</p>
        )}

        {/* The client's answer */}
        {q.response && answering !== q.id && (
          <div
            data-testid="client-answer"
            className="mt-3 rounded-lg border-l-[3px] border-fern-400 bg-fern-50/60 px-3 py-2"
          >
            <p className="text-[11px] font-semibold tracking-wide text-fern-700 uppercase">
              Client&apos;s answer
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{q.response}</p>
          </div>
        )}

        {answering === q.id && (
          <div className="mt-3">
            <label className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              {q.response ? "Edit the client's answer" : "What the client confirmed"}
            </label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
              autoFocus
              aria-label="Client's answer"
              placeholder="Type the client's reply…"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:border-fern-500 focus:ring-2 focus:ring-fern-200 focus:outline-none"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setAnswering(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => saveAnswer(q)}
                disabled={busy || !answer.trim()}
                aria-label="Save answer"
              >
                <Check className="h-3.5 w-3.5" /> Save answer
              </Button>
            </div>
          </div>
        )}

        <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400">
          Raised {formatDate(q.askedAt)}
          {q.askedBy ? ` by ${q.askedBy}` : ""}
          {q.answeredAt ? ` · answered ${formatDate(q.answeredAt)}` : ""}
        </p>
      </li>
    );
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title="Clarifications from the client"
        description={`${task.title}${task.client?.name ? ` · ${task.client.name}` : ""}`}
        footer={
          <>
            {open.length > 0 && (
              <Button variant="secondary" onClick={() => setWaOpen(true)}>
                <MessageCircle className="h-4 w-4" /> Ask on WhatsApp
              </Button>
            )}
            <Button onClick={onClose}>Done</Button>
          </>
        }
      >
        {/* Where the task stands */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            <CircleDot className="h-3.5 w-3.5" />
            {open.length} awaiting the client
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-fern-100 px-3 py-1 text-xs font-medium text-fern-800">
            <CircleCheck className="h-3.5 w-3.5" />
            {answered.length} answered
          </span>
        </div>

        {err && (
          <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
            {err}
          </div>
        )}

        {queries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
            <HelpCircle className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-600">No points raised yet</p>
            <p className="mt-1 text-xs text-slate-500">
              List anything the client needs to confirm before this work can be finished.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {open.map(card)}
            {answered.length > 0 && open.length > 0 && (
              <li
                data-testid="answered-heading"
                className="pt-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase"
              >
                Answered
              </li>
            )}
            {answered.map(card)}
          </ul>
        )}

        {canManage && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <label
              htmlFor="new-clarification-point"
              className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase"
            >
              Add a point
            </label>
            <textarea
              id="new-clarification-point"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  add();
                }
              }}
              rows={2}
              aria-label="New clarification point"
              placeholder="e.g. Confirm whether the February rent invoice relates to the Andheri office."
              className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">Enter adds · Shift+Enter for a new line</span>
              <Button size="sm" onClick={add} disabled={busy || !draft.trim()}>
                <Plus className="h-3.5 w-3.5" /> Add point
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {waOpen && (
        <WhatsappModal
          to={task.client?.phone}
          recipientName={task.client?.name}
          recipientType="Client"
          title="Ask the client for clarification"
          message={waMessage}
          onClose={() => setWaOpen(false)}
        />
      )}
    </>
  );
}
