"use client";

import { useState } from "react";
import { Plus, Trash2, Check, RotateCcw, MessageCircle, HelpCircle } from "lucide-react";
import type { Task, TaskQuery } from "@/lib/types";
import { WhatsappModal } from "@/components/WhatsappModal";
import { cn, formatDate } from "@/lib/format";

/** Points on a task that need the client's clarification, with the answers. */
export function TaskQueriesPanel({
  task,
  canManage,
  onChanged,
}: {
  task: Task;
  canManage: boolean;
  onChanged: (queries: TaskQuery[]) => void;
}) {
  const queries = task.queries ?? [];
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Which point's answer is being typed, and the text so far.
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [waOpen, setWaOpen] = useState(false);

  const base = `/api/tasks/${task.id}/queries`;
  const open = queries.filter((q) => q.status !== "Answered");

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
      // The error banner already explains it.
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

  // The message that goes to the client: every point still awaiting an answer.
  const waMessage =
    `Regarding ${task.title}${task.client?.name ? ` (${task.client.name})` : ""}, ` +
    `we need clarification on the following:\n\n` +
    open.map((q, i) => `${i + 1}. ${q.point}`).join("\n") +
    `\n\nKindly confirm at your convenience. Thank you.`;

  return (
    <div className="mt-2 max-w-2xl rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
          <HelpCircle className="h-3.5 w-3.5" />
          Clarifications from the client
          {open.length > 0 && <span className="text-amber-600">· {open.length} awaiting</span>}
        </p>
        {open.length > 0 && (
          <button
            onClick={() => setWaOpen(true)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
            title="Send the open points to the client on WhatsApp"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Ask on WhatsApp
          </button>
        )}
      </div>

      {err && <p className="mt-1 text-[11px] text-rose-600">{err}</p>}

      <ul className="mt-2 space-y-1.5">
        {queries.length === 0 && (
          <li className="text-[11px] text-slate-500">
            No points raised yet — add anything the client needs to confirm.
          </li>
        )}
        {queries.map((q) => {
          const answered = q.status === "Answered";
          return (
            <li
              key={q.id}
              className={cn(
                "rounded-md border bg-white p-2 text-xs",
                answered ? "border-slate-200" : "border-amber-200",
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    answered
                      ? "bg-fern-100 text-fern-700"
                      : "bg-amber-100 text-amber-800",
                  )}
                >
                  {answered ? "Answered" : "Awaiting"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800">{q.point}</p>
                  {q.response && (
                    <p className="mt-1 border-l-2 border-fern-300 pl-2 text-slate-600">
                      <span className="font-medium text-fern-700">Client:</span> {q.response}
                    </p>
                  )}
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Raised {formatDate(q.askedAt)}
                    {q.askedBy ? ` by ${q.askedBy}` : ""}
                    {q.answeredAt ? ` · answered ${formatDate(q.answeredAt)}` : ""}
                  </p>

                  {canManage && answering === q.id && (
                    <div className="mt-1.5 flex items-start gap-1.5">
                      <textarea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        rows={2}
                        autoFocus
                        aria-label="Client's answer"
                        placeholder="What the client confirmed…"
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none"
                      />
                      <button
                        onClick={() => saveAnswer(q)}
                        disabled={busy || !answer.trim()}
                        aria-label="Save answer"
                        className="rounded bg-fern-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-fern-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setAnswering(null)}
                        className="rounded px-1.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {canManage && answering !== q.id && (
                  <div className="flex shrink-0 gap-0.5">
                    {answered ? (
                      <button
                        onClick={() => reopen(q)}
                        disabled={busy}
                        title="Reopen this point"
                        aria-label="Reopen point"
                        className="rounded p-1 text-slate-400 hover:bg-amber-100 hover:text-amber-700"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setAnswering(q.id);
                          setAnswer(q.response ?? "");
                        }}
                        disabled={busy}
                        title="Record the client's answer"
                        aria-label="Record answer"
                        className="rounded p-1 text-slate-400 hover:bg-fern-100 hover:text-fern-700"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => remove(q)}
                      disabled={busy}
                      title="Remove this point"
                      aria-label="Remove point"
                      className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {canManage && (
        <div className="mt-2 flex items-start gap-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                add();
              }
            }}
            rows={1}
            aria-label="New clarification point"
            placeholder="Point needing the client's clarification…"
            className="flex-1 resize-y rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-200 focus:outline-none"
          />
          <button
            onClick={add}
            disabled={busy || !draft.trim()}
            className="inline-flex items-center gap-1 rounded bg-brand-600 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add point
          </button>
        </div>
      )}

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
    </div>
  );
}
