import "server-only";
import { prisma } from "@/lib/prisma";

// Audit working papers, and the letter that turns some of them into questions.
//
// The firm records what it saw while doing the work. Two kinds, because they
// arise differently and are read differently:
//
//   • **Vouching observations** come out of testing a voucher — a bill without
//     support, a payment to a party nobody recognises. Most need the client to
//     explain something, so they default to needing clarification.
//   • **Ledger scrutiny notes** come out of reading an account. Usually they
//     are the firm's own record of what it looked at and concluded, so they
//     default to needing nothing from anyone.
//
// The default follows the kind; the auditor decides. A vouching point settled
// from the file needs no letter, and a scrutiny note occasionally does need
// the client. Only what is *marked* as needing clarification can be queried —
// that is the whole point of keeping the flag separate from the kind.

export const OBSERVATION_KINDS = ["Vouching", "Ledger scrutiny"] as const;
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

/** Open → Queried → Answered → Closed, with Dropped for one let go. */
export const OBSERVATION_STATUSES = [
  "Open",
  "Queried",
  "Answered",
  "Closed",
  "Dropped",
] as const;

export const LETTER_STATUSES = ["Draft", "Sent", "Replied", "Closed"] as const;

/**
 * Whether a note of this kind asks the client anything, unless told otherwise.
 * Vouching tests a document the client produced, so the question usually goes
 * back to them; scrutiny is the firm reading its own way through an account.
 */
export const defaultNeedsClarification = (kind: string) => kind !== "Ledger scrutiny";

/** Everything the panel and the letter need from an observation. */
export const OBSERVATION_SELECT = {
  id: true,
  kind: true,
  observation: true,
  internalNote: true,
  ledgerName: true,
  voucherNo: true,
  voucherDate: true,
  partyName: true,
  amount: true,
  financialYear: true,
  needsClarification: true,
  status: true,
  response: true,
  respondedAt: true,
  resolution: true,
  raisedBy: true,
  createdAt: true,
  letter: { select: { id: true, number: true, status: true, issuedAt: true } },
} as const;

/** Why a chosen observation cannot go on a letter. */
export type Ineligible = { id: string; observation: string; reason: string };

export type Selection = {
  /** The ones that will go on the letter. */
  eligible: {
    id: string;
    kind: string;
    observation: string;
    ledgerName: string | null;
    voucherNo: string | null;
    voucherDate: Date | null;
    partyName: string | null;
    amount: number | null;
    financialYear: string | null;
  }[];
  /** The ones that will not, each with the reason. */
  ineligible: Ineligible[];
  clientId: string | null;
};

/**
 * Sort the chosen observations into those that can be queried and those that
 * cannot, with a reason for each refusal.
 *
 * Three things disqualify a point, and each matters for a different reason: it
 * is not the firm's to ask (no clarification wanted), it has been asked before
 * (already on a letter — asking twice makes the firm look careless), or it is
 * no longer live (closed or dropped).
 */
export async function selectForLetter(ids: string[]): Promise<Selection> {
  if (ids.length === 0) return { eligible: [], ineligible: [], clientId: null };

  const rows = await prisma.auditObservation.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      kind: true,
      observation: true,
      ledgerName: true,
      voucherNo: true,
      voucherDate: true,
      partyName: true,
      amount: true,
      financialYear: true,
      needsClarification: true,
      status: true,
      clientId: true,
      letterId: true,
      letter: { select: { number: true } },
    },
  });

  const eligible: Selection["eligible"] = [];
  const ineligible: Ineligible[] = [];
  for (const r of rows) {
    const { needsClarification, status, letterId, letter, clientId, ...rest } = r;
    void clientId; // held on the row for the caller's one-client check below
    if (!needsClarification) {
      ineligible.push({
        id: r.id,
        observation: r.observation,
        reason: "not marked as needing the client's clarification",
      });
    } else if (letterId) {
      ineligible.push({
        id: r.id,
        observation: r.observation,
        reason: `already asked on letter ${letter?.number ?? "issued earlier"}`,
      });
    } else if (status === "Closed" || status === "Dropped") {
      ineligible.push({
        id: r.id,
        observation: r.observation,
        reason: `${status.toLowerCase()} — no longer being pursued`,
      });
    } else {
      eligible.push(rest);
    }
  }

  // Every point on one letter belongs to one client; the caller checks this.
  const clientIds = [...new Set(rows.map((r) => r.clientId).filter(Boolean))] as string[];
  return { eligible, ineligible, clientId: clientIds.length === 1 ? clientIds[0] : null };
}

/**
 * The plain-text body of a query letter — the same words the PDF carries, so
 * a client reading the email and a client reading the attachment see one
 * letter rather than two.
 */
export function letterBody(
  letter: { number: string; preamble: string | null; replyBy: Date | null },
  clientName: string,
  items: { observation: string; voucherNo: string | null; ledgerName: string | null }[],
  firmName: string,
): string {
  const by = letter.replyBy
    ? `\n\nWe should be grateful for your reply by ${letter.replyBy.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })}.`
    : "";
  const points = items
    .map((it, i) => {
      const where = it.voucherNo
        ? ` (voucher ${it.voucherNo})`
        : it.ledgerName
          ? ` (${it.ledgerName})`
          : "";
      return `${i + 1}. ${it.observation}${where}`;
    })
    .join("\n\n");

  return (
    `Dear ${clientName},\n\n` +
    (letter.preamble?.trim() ||
      "In the course of our audit the following points have arisen on which we require your clarification.") +
    `\n\n${points}${by}\n\n` +
    `Yours faithfully,\n${firmName}\n\nRef: ${letter.number}`
  );
}
