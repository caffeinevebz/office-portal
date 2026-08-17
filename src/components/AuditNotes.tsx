"use client";

import { useMemo, useState } from "react";
import {
  NotebookPen,
  Plus,
  Trash2,
  Pencil,
  Send,
  FileText,
  MessageSquareReply,
  Check,
  X,
  AlertTriangle,
  Lock,
  Printer,
} from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import type { AuditObservation, QueryLetter, Task } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { DictatedTextarea } from "@/components/ui/Dictate";
import { Loading } from "@/components/ui/EmptyState";
import { VOUCHING_AREAS, UNFILED_VOUCHING } from "@/lib/constants";
import { formatDate, toDateInput, cn } from "@/lib/format";

// The audit working paper for one engagement.
//
// Two sections, because a firm keeps the two kinds apart: vouching
// observations, which come out of testing a voucher and normally need the
// client to explain something, and ledger scrutiny notes, which come out of
// reading an account and are usually the firm's own record.
//
// Only what is ticked as needing clarification can go on a query letter, and
// the internal note never leaves the office — it is marked as such on screen
// so nobody has to wonder.

type Kind = "Vouching" | "Ledger scrutiny";
const KINDS: Kind[] = ["Vouching", "Ledger scrutiny"];

const STATUS_TONE: Record<string, string> = {
  Open: "bg-slate-100 text-slate-700 ring-slate-200",
  Queried: "bg-amber-100 text-amber-800 ring-amber-200",
  Answered: "bg-sky-100 text-sky-800 ring-sky-200",
  Closed: "bg-fern-100 text-fern-800 ring-fern-200",
  Dropped: "bg-slate-100 text-slate-400 ring-slate-200",
};

/** Notes filed under no area yet — a heading of its own, not a guess. */
const UNFILED = UNFILED_VOUCHING;

type Draft = {
  kind: Kind;
  vouchingArea: string;
  observation: string;
  internalNote: string;
  ledgerName: string;
  voucherNo: string;
  voucherDate: string;
  partyName: string;
  amount: string;
  needsClarification: boolean;
};

// Vouching runs area by area — a morning on cash, then the purchase file — so
// a new note starts in the area the last one was filed under.
const emptyDraft = (kind: Kind, area = ""): Draft => ({
  kind,
  vouchingArea: kind === "Vouching" ? area : "",
  observation: "",
  internalNote: "",
  ledgerName: "",
  voucherNo: "",
  voucherDate: "",
  partyName: "",
  amount: "",
  // Vouching asks the client by default; scrutiny does not. Either is a tick away.
  needsClarification: kind === "Vouching",
});

const payloadOf = (d: Draft) => ({
  kind: d.kind,
  vouchingArea: d.kind === "Vouching" ? d.vouchingArea || null : null,
  observation: d.observation,
  internalNote: d.internalNote || null,
  ledgerName: d.ledgerName || null,
  voucherNo: d.voucherNo || null,
  voucherDate: d.voucherDate || null,
  partyName: d.partyName || null,
  amount: d.amount === "" ? null : Number(d.amount),
  needsClarification: d.needsClarification,
});

export function AuditNotesModal({
  task,
  canManage,
  onClose,
  onChanged,
}: {
  task: Task;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const notes = useResource<AuditObservation[]>(`/api/tasks/${task.id}/observations`);
  const letters = useResource<QueryLetter[]>(`/api/query-letters?taskId=${task.id}`);

  const [adding, setAdding] = useState<Kind | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft("Vouching"));
  const [lastArea, setLastArea] = useState("");
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [raising, setRaising] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = notes.data ?? [];
  const byKind = useMemo(
    () => ({
      Vouching: (notes.data ?? []).filter((r) => r.kind === "Vouching"),
      "Ledger scrutiny": (notes.data ?? []).filter((r) => r.kind === "Ledger scrutiny"),
    }),
    [notes.data],
  );

  // How the vouching divides up: the areas in the order the work is done, and
  // then whatever has not been filed under one yet.
  const areaCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of byKind.Vouching) {
      const key = r.vouchingArea?.trim() || UNFILED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const ordered = [...VOUCHING_AREAS, UNFILED].filter((a) => counts.has(a));
    return ordered.map((area) => ({ area, n: counts.get(area)! }));
  }, [byKind.Vouching]);

  const shownVouching = areaFilter
    ? byKind.Vouching.filter((r) => (r.vouchingArea?.trim() || UNFILED) === areaFilter)
    : byKind.Vouching;
  const vouchingGroups = useMemo(() => {
    const groups = new Map<string, AuditObservation[]>();
    for (const r of shownVouching) {
      const key = r.vouchingArea?.trim() || UNFILED;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...VOUCHING_AREAS, UNFILED]
      .filter((a) => groups.has(a))
      .map((area) => ({ area, items: groups.get(area)! }));
  }, [shownVouching]);

  // Printing gives you what you are looking at: the same narrowing goes to
  // the PDF, so "print this" and "print everything" are both a press away.
  const printUrl = () => {
    const params = new URLSearchParams();
    if (areaFilter && areaFilter !== UNFILED) {
      params.set("kind", "Vouching");
      params.set("area", areaFilter);
    }
    const q = params.toString();
    return `/api/tasks/${task.id}/observations/pdf${q ? `?${q}` : ""}`;
  };
  // What could go on a letter: wanted from the client, not yet asked, still live.
  const askable = rows.filter(
    (r) => r.needsClarification && !r.letter && r.status !== "Closed" && r.status !== "Dropped",
  );
  const awaiting = rows.filter((r) => r.status === "Queried").length;

  const refresh = () => {
    notes.refresh();
    letters.refresh();
    onChanged();
  };

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      refresh();
      after?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not work");
    } finally {
      setBusy(false);
    }
  }

  const save = (kind: Kind) =>
    run(
      () =>
        editing
          ? apiMutate(`/api/observations/${editing}`, "PATCH", payloadOf(draft))
          : apiMutate(`/api/tasks/${task.id}/observations`, "POST", payloadOf({ ...draft, kind })),
      () => {
        setAdding(null);
        setEditing(null);
        // The next note in this sitting starts in the same area.
        if (kind === "Vouching") setLastArea(draft.vouchingArea);
        setDraft(emptyDraft(kind, draft.vouchingArea));
      },
    );

  // Everything a note card needs to act on itself, gathered once so the two
  // lists (grouped vouching, flat scrutiny) render the same card.
  const cardProps = {
    canManage,
    busy,
    replyingTo,
    reply,
    setReply,
    onReply: (n: AuditObservation) => {
      setReplyingTo(replyingTo === n.id ? null : n.id);
      setReply(n.response ?? "");
    },
    onEdit: (n: AuditObservation) => {
      setEditing(n.id);
      setAdding(n.kind as Kind);
      setDraft({
        kind: n.kind as Kind,
        vouchingArea: n.vouchingArea ?? "",
        observation: n.observation,
        internalNote: n.internalNote ?? "",
        ledgerName: n.ledgerName ?? "",
        voucherNo: n.voucherNo ?? "",
        voucherDate: toDateInput(n.voucherDate) ?? "",
        partyName: n.partyName ?? "",
        amount: n.amount != null ? String(n.amount) : "",
        needsClarification: n.needsClarification,
      });
    },
    onDelete: (id: string) => run(() => apiMutate(`/api/observations/${id}`, "DELETE")),
    onRecord: (id: string) =>
      run(
        () => apiMutate(`/api/observations/${id}`, "PATCH", { response: reply || null }),
        () => setReplyingTo(null),
      ),
    onCancelReply: () => setReplyingTo(null),
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Audit notes — ${task.title}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button
            variant="secondary"
            onClick={() => window.open(printUrl(), "_blank", "noopener")}
            title="Opens the working paper as a PDF — print it or save it from there"
          >
            <Printer className="h-4 w-4" />
            {areaFilter ? `Print ${areaFilter.toLowerCase()}` : "Print / PDF"}
          </Button>
          {canManage && (
            <Button onClick={() => setRaising(true)} disabled={busy || askable.length === 0}>
              <Send className="h-4 w-4" />
              {askable.length > 0
                ? `Raise query letter (${askable.length})`
                : "Nothing to query"}
            </Button>
          )}
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}
      {notice && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-lg bg-fern-50 px-3 py-2 text-xs text-fern-800 ring-1 ring-fern-200">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
        These are the firm&apos;s working papers. Tick <strong>needs the client&apos;s
        clarification</strong> on the points you want answered — only those can go on a query
        letter. Anything written under <strong>internal note</strong> stays here.
        {awaiting > 0 && (
          <>
            {" "}
            <span className="font-medium text-amber-700">
              {awaiting} point{awaiting === 1 ? "" : "s"} awaiting the client.
            </span>
          </>
        )}
      </p>

      {notes.loading && !notes.data ? (
        <Loading label="Opening the working paper…" />
      ) : (
        KINDS.map((kind) => (
          <section key={kind} className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <NotebookPen className="h-4 w-4 text-brand-500" />
                {kind === "Vouching" ? "Vouching observations" : "Ledger scrutiny notes"}
                <span className="text-xs font-normal text-slate-400">
                  ({byKind[kind].length})
                </span>
              </h3>
              {canManage && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(null);
                    // A filter that is showing one area is also a statement of
                    // what is being worked on, so a new note starts there.
                    setDraft(
                      emptyDraft(kind, areaFilter && areaFilter !== UNFILED ? areaFilter : lastArea),
                    );
                    setAdding(adding === kind ? null : kind);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              )}
            </div>
            <p className="mb-2 text-xs text-slate-400">
              {kind === "Vouching"
                ? "Points arising from testing vouchers, filed under the area they came from — cash, journal, purchase, sales, bank."
                : "Points arising from reading the ledgers — usually the firm's own record, but any can be queried."}
            </p>

            {kind === "Vouching" && areaCounts.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <AreaChip
                  label="All areas"
                  n={byKind.Vouching.length}
                  active={!areaFilter}
                  onClick={() => setAreaFilter(null)}
                />
                {areaCounts.map(({ area, n }) => (
                  <AreaChip
                    key={area}
                    label={area}
                    n={n}
                    active={areaFilter === area}
                    onClick={() => setAreaFilter(areaFilter === area ? null : area)}
                  />
                ))}
              </div>
            )}

            {adding === kind && canManage && (
              <NoteForm
                draft={draft}
                setDraft={setDraft}
                kind={kind}
                busy={busy}
                editing={!!editing}
                onCancel={() => {
                  setAdding(null);
                  setEditing(null);
                }}
                onSave={() => save(kind)}
              />
            )}

            {kind === "Vouching" ? (
              vouchingGroups.length === 0 && adding !== kind ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                  {areaFilter ? `Nothing recorded under ${areaFilter}.` : "Nothing recorded yet."}
                </p>
              ) : (
                vouchingGroups.map((g) => (
                  <div key={g.area} className="mb-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      {g.area}
                      <span className="font-normal text-slate-400">({g.items.length})</span>
                    </p>
                    <ul className="space-y-2">
                      {g.items.map((n) => (
                        <NoteCard key={n.id} n={n} {...cardProps} />
                      ))}
                    </ul>
                  </div>
                ))
              )
            ) : byKind[kind].length === 0 && adding !== kind ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                Nothing recorded yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {byKind[kind].map((n) => (
                  <NoteCard key={n.id} n={n} {...cardProps} />
                ))}
              </ul>
            )}
          </section>
        ))
      )}

      {/* Letters already issued on this engagement */}
      {(letters.data ?? []).length > 0 && (
        <section className="border-t border-slate-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Query letters issued</h3>
          <ul className="space-y-1.5">
            {(letters.data ?? []).map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
              >
                <a
                  href={`/api/query-letters/${l.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
                >
                  <FileText className="h-3.5 w-3.5" /> {l.number}
                </a>
                <span className="text-slate-400">
                  {l.items.length} point{l.items.length === 1 ? "" : "s"} · {formatDate(l.issuedAt)}
                </span>
                <Badge tone={l.status === "Sent" ? "amber" : l.status === "Replied" ? "green" : "slate"}>
                  {l.status}
                </Badge>
                {l.sentTo && <span className="text-slate-400">to {l.sentTo}</span>}
                {canManage && l.status === "Draft" && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      run(
                        () => apiMutate(`/api/query-letters/${l.id}/send`, "POST"),
                        () => setNotice(`Letter ${l.number} sent to the client.`),
                      )
                    }
                    disabled={busy || !l.client.email}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {l.client.email ? "Send" : "No client email"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {raising && (
        <RaiseLetterModal
          task={task}
          askable={askable}
          onClose={() => setRaising(false)}
          onRaised={(msg) => {
            setRaising(false);
            setNotice(msg);
            setPicked([]);
            refresh();
          }}
          picked={picked}
          setPicked={setPicked}
        />
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

/** One area of the vouching, with how many notes are filed under it. */
function AreaChip({
  label,
  n,
  active,
  onClick,
}: {
  label: string;
  n: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors",
        active
          ? "bg-brand-600 text-white ring-brand-600"
          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
      )}
    >
      {label}
      <span className={cn("ml-1", active ? "text-brand-100" : "text-slate-400")}>{n}</span>
    </button>
  );
}

type CardProps = {
  canManage: boolean;
  busy: boolean;
  replyingTo: string | null;
  reply: string;
  setReply: (v: string) => void;
  onReply: (n: AuditObservation) => void;
  onEdit: (n: AuditObservation) => void;
  onDelete: (id: string) => void;
  onRecord: (id: string) => void;
  onCancelReply: () => void;
};

/** One note as it reads in the file: what was seen, where it stands, what came back. */
function NoteCard({ n, ...p }: { n: AuditObservation } & CardProps) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm whitespace-pre-wrap text-slate-800">{n.observation}</p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
            STATUS_TONE[n.status] ?? STATUS_TONE.Open,
          )}
        >
          {n.status}
        </span>
      </div>

      {(n.voucherNo || n.ledgerName || n.partyName || n.amount != null || n.voucherDate) && (
        <p className="mt-1 text-xs text-slate-500">
          {[
            n.voucherNo ? `Voucher ${n.voucherNo}` : null,
            n.voucherDate ? formatDate(n.voucherDate) : null,
            n.ledgerName,
            n.partyName,
            n.amount != null ? `Rs. ${n.amount.toLocaleString("en-IN")}` : null,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      )}

      {n.internalNote && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
          <Lock className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
          <span>
            <span className="font-medium">Internal — not sent: </span>
            {n.internalNote}
          </span>
        </p>
      )}

      {n.response && (
        <p className="mt-1.5 rounded bg-sky-50 px-2 py-1.5 text-xs text-sky-900">
          <span className="font-medium">Client: </span>
          {n.response}
          {n.respondedAt && <span className="text-sky-600"> · {formatDate(n.respondedAt)}</span>}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        {n.needsClarification ? (
          <Badge tone="amber">Needs clarification</Badge>
        ) : (
          <Badge tone="slate">No clarification needed</Badge>
        )}
        {n.letter && (
          <a
            href={`/api/query-letters/${n.letter.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-brand-600 hover:underline"
          >
            <FileText className="h-3 w-3" /> {n.letter.number}
          </a>
        )}
        {n.raisedBy && <span>by {n.raisedBy}</span>}
        <span className="ml-auto flex items-center gap-1">
          {p.canManage && (
            <>
              <button
                onClick={() => p.onEdit(n)}
                className="rounded p-1 hover:bg-slate-100 hover:text-slate-600"
                title="Edit"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => p.onReply(n)}
                className="rounded p-1 hover:bg-slate-100 hover:text-slate-600"
                title="Record the client's answer"
              >
                <MessageSquareReply className="h-3 w-3" />
              </button>
              <button
                onClick={() => p.onDelete(n.id)}
                className="rounded p-1 hover:bg-rose-50 hover:text-rose-600"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </span>
      </div>

      {p.replyingTo === n.id && p.canManage && (
        <div className="mt-2 rounded-lg bg-slate-50 p-2">
          {/* The reply is usually read off the phone or a letter, so it can be
              dictated as easily as the observation itself. */}
          <DictatedTextarea
            rows={2}
            value={p.reply}
            onValue={p.setReply}
            placeholder="What the client said…"
            label="Dictate the client's answer"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <Button variant="ghost" onClick={p.onCancelReply}>
              Cancel
            </Button>
            <Button onClick={() => p.onRecord(n.id)} disabled={p.busy}>
              <Check className="h-3.5 w-3.5" /> Record
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */

function NoteForm({
  draft,
  setDraft,
  kind,
  busy,
  editing,
  onCancel,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  kind: Kind;
  busy: boolean;
  editing: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const vouching = kind === "Vouching";

  return (
    <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
      <Field
        label="Observation"
        required
        hint="Press the mic to dictate it instead of typing — the words appear as you speak."
      >
        <DictatedTextarea
          rows={2}
          value={draft.observation}
          onValue={(v) => set("observation", v)}
          label="Dictate the observation"
          placeholder={
            vouching
              ? "e.g. Payment of Rs. 45,000 to Shreeji Traders supported only by a proforma invoice."
              : "e.g. Repairs & maintenance shows a single entry of Rs. 2,10,000 in March with no narration."
          }
        />
      </Field>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {vouching ? (
          <>
            <Field
              label="Vouching area"
              className="sm:col-span-2"
              hint="Where in the vouching it arose — the working paper is filed under this."
            >
              <Select
                value={draft.vouchingArea}
                onChange={(e) => set("vouchingArea", e.target.value)}
              >
                <option value="">Not stated yet</option>
                {VOUCHING_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Voucher no.">
              <Input value={draft.voucherNo} onChange={(e) => set("voucherNo", e.target.value)} />
            </Field>
            <Field label="Voucher date">
              <Input
                type="date"
                value={draft.voucherDate}
                onChange={(e) => set("voucherDate", e.target.value)}
              />
            </Field>
            <Field label="Party">
              <Input value={draft.partyName} onChange={(e) => set("partyName", e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="Ledger / account head" className="sm:col-span-2">
            <Input
              value={draft.ledgerName}
              onChange={(e) => set("ledgerName", e.target.value)}
              placeholder="e.g. Repairs & Maintenance"
            />
          </Field>
        )}
        <Field label="Amount">
          <Input
            value={draft.amount}
            onChange={(e) => set("amount", e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.00"
          />
        </Field>
      </div>
      <Field
        label="Internal note"
        className="mt-3"
        hint="The firm's own view — never printed on a letter or sent to the client"
      >
        <DictatedTextarea
          rows={2}
          value={draft.internalNote}
          onValue={(v) => set("internalNote", v)}
          label="Dictate the internal note"
        />
      </Field>
      <label className="mt-3 flex items-start gap-2">
        <input
          type="checkbox"
          checked={draft.needsClarification}
          onChange={(e) => set("needsClarification", e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
        />
        <span className="text-sm text-slate-700">
          Needs the client&apos;s clarification
          <span className="mt-0.5 block text-xs text-slate-500">
            Only ticked points can go on a query letter.{" "}
            {vouching
              ? "Vouching points usually do — untick one you settled from the file."
              : "Scrutiny notes usually do not — tick one you want the client to answer."}
          </span>
        </span>
      </label>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={busy || !draft.observation.trim()}>
          {busy ? "Saving…" : editing ? "Save changes" : "Add note"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RaiseLetterModal({
  task,
  askable,
  picked,
  setPicked,
  onClose,
  onRaised,
}: {
  task: Task;
  askable: AuditObservation[];
  picked: string[];
  setPicked: (ids: string[]) => void;
  onClose: () => void;
  onRaised: (notice: string) => void;
}) {
  // Everything askable starts ticked: the auditor marked these as needing an
  // answer, so the letter asking for them is the expected next step.
  const [ids, setIds] = useState<string[]>(picked.length ? picked : askable.map((a) => a.id));
  const [subject, setSubject] = useState("");
  const [preamble, setPreamble] = useState("");
  const [replyBy, setReplyBy] = useState("");
  const [sendNow, setSendNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (id: string) =>
    setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  async function raise() {
    setBusy(true);
    setErr(null);
    try {
      const { letter, ineligible } = (await apiMutate("/api/query-letters", "POST", {
        observationIds: ids,
        taskId: task.id,
        subject: subject || null,
        preamble: preamble || null,
        replyBy: replyBy || null,
      })) as { letter: QueryLetter; ineligible: { reason: string }[] };

      let note = `Letter ${letter.number} raised with ${letter.items.length} point${letter.items.length === 1 ? "" : "s"}.`;
      if (ineligible.length) note += ` ${ineligible.length} left off (${ineligible[0].reason}).`;

      if (sendNow) {
        const sent = (await apiMutate(`/api/query-letters/${letter.id}/send`, "POST")) as {
          status: string;
          to: string;
        };
        note +=
          sent.status === "Simulated"
            ? " Recorded, but not actually emailed — no mail credentials are configured."
            : ` Emailed to ${sent.to}.`;
      }
      setPicked([]);
      onRaised(note);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not raise the letter");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Raise a query letter"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={raise} disabled={busy || ids.length === 0}>
            <Send className="h-4 w-4" />
            {busy ? "Working…" : sendNow ? `Raise & send (${ids.length})` : `Raise (${ids.length})`}
          </Button>
        </>
      }
    >
      {err && (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}
      <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Only the points below go to the client. Internal notes are never included.
      </p>

      <ul className="mb-4 max-h-64 space-y-1.5 overflow-y-auto">
        {askable.map((a) => (
          <li key={a.id}>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={ids.includes(a.id)}
                onChange={() => toggle(a.id)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-slate-800">{a.observation}</span>
                <span className="mt-0.5 block text-xs text-slate-400">
                  {a.kind}
                  {a.voucherNo ? ` · Voucher ${a.voucherNo}` : ""}
                  {a.ledgerName ? ` · ${a.ledgerName}` : ""}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Subject" className="sm:col-span-2" hint="Blank uses the engagement's name">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Reply requested by">
          <Input type="date" value={replyBy} onChange={(e) => setReplyBy(e.target.value)} />
        </Field>
        <Field label="Send now" hint="Emails the letter with the PDF attached">
          <Select value={sendNow ? "yes" : "no"} onChange={(e) => setSendNow(e.target.value === "yes")}>
            <option value="yes">Raise and email it</option>
            <option value="no">Raise as a draft</option>
          </Select>
        </Field>
        <Field
          label="Covering words"
          className="sm:col-span-2"
          hint="Blank uses the firm's standard wording"
        >
          <Textarea rows={3} value={preamble} onChange={(e) => setPreamble(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
