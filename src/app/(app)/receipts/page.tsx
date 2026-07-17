"use client";

import { useState } from "react";
import {
  BookOpenCheck,
  FileDown,
  IndianRupee,
  Landmark,
  Percent,
  ReceiptText,
} from "lucide-react";
import { useResource } from "@/lib/useApi";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Loading, EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { financialYears } from "@/lib/constants";
import { formatCurrency, formatDate, cn } from "@/lib/format";

type ReceiptRow = {
  id: string;
  receiptNumber: string | null;
  paidDate: string;
  invoiceNumber: string;
  clientName: string;
  paymentMode: string | null;
  detail: string;
  gross: number;
  tds: number;
  net: number;
};

type RegisterData = {
  label: string;
  receipts: ReceiptRow[];
  totals: { count: number; gross: number; tds: number; net: number };
};

type PeriodKind = "fy" | "month" | "range";

const MODE_TONE: Record<string, "green" | "blue" | "indigo" | "amber" | "slate"> = {
  Cash: "amber",
  Cheque: "blue",
  "NEFT/IMPS/Transfer": "indigo",
  UPI: "green",
};

// Professional income is accounted on receipt basis — this register lists
// what was actually received in a financial year, a month, or any period.
export default function ReceiptRegisterPage() {
  const fys = financialYears();
  const [kind, setKind] = useState<PeriodKind>("fy");
  const [fy, setFy] = useState(fys[0]);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params =
    kind === "fy"
      ? `fy=${encodeURIComponent(fy)}`
      : kind === "month"
        ? `month=${encodeURIComponent(month)}`
        : `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const { data, loading, error } = useResource<RegisterData>(`/api/receipts?${params}`);

  const totals = data?.totals ?? { count: 0, gross: 0, tds: 0, net: 0 };

  return (
    <div>
      <PageHeader
        title="Receipt Register"
        subtitle="Money actually received — professional income on receipt basis"
        actions={
          <a
            href={`/api/receipts/pdf?${params}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            <FileDown className="h-4 w-4" /> Register PDF
          </a>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Receipts" value={totals.count} icon={ReceiptText} accent="indigo" hint={data?.label} />
        <StatCard label="Gross receipts" value={formatCurrency(totals.gross)} icon={Landmark} accent="blue" hint="Invoice value incl. GST" />
        <StatCard label="TDS deducted by clients" value={formatCurrency(totals.tds)} icon={Percent} accent={totals.tds > 0 ? "amber" : "emerald"} hint="Claimable against tax" />
        <StatCard label="Net received" value={formatCurrency(totals.net)} icon={IndianRupee} accent="emerald" />
      </div>

      {/* Period selection: FY / month / custom range */}
      <Card className="mb-4">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            {(
              [
                ["fy", "Financial year"],
                ["month", "Month"],
                ["range", "Custom period"],
              ] as [PeriodKind, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium",
                  kind === k ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {kind === "fy" && (
            <select
              value={fy}
              onChange={(e) => setFy(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            >
              {fys.map((y) => (
                <option key={y} value={y}>
                  FY {y} (Apr–Mar)
                </option>
              ))}
            </select>
          )}
          {kind === "month" && (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          )}
          {kind === "range" && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
              to
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </div>
          )}
          {data && <p className="text-xs text-slate-400 sm:ml-auto">{data.label}</p>}
        </div>
      </Card>

      <Card>
        {loading && !data ? (
          <Loading label="Loading receipts…" />
        ) : error ? (
          <p className="p-6 text-sm text-rose-600">Failed to load: {error}</p>
        ) : !data || data.receipts.length === 0 ? (
          <EmptyState
            icon={BookOpenCheck}
            title="No receipts in this period"
            message="Payments recorded against invoices (marked Paid) appear here by their receipt date."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Receipt</th>
                  <th className="px-5 py-3">Received from</th>
                  <th className="px-5 py-3">Against invoice</th>
                  <th className="px-5 py-3">Mode</th>
                  <th className="px-5 py-3 text-right">Gross</th>
                  <th className="px-5 py-3 text-right">TDS</th>
                  <th className="px-5 py-3 text-right">Net received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-mono text-xs font-medium text-slate-800">
                        {r.receiptNumber ?? "—"}
                      </p>
                      <p className="text-[11px] text-slate-400">{formatDate(r.paidDate)}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{r.clientName}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">
                      {r.invoiceNumber}
                    </td>
                    <td className="px-5 py-3">
                      {r.paymentMode ? (
                        <>
                          <Badge tone={MODE_TONE[r.paymentMode] ?? "slate"}>{r.paymentMode}</Badge>
                          {r.detail && (
                            <p className="mt-0.5 max-w-52 truncate text-[11px] text-slate-400">
                              {r.detail}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-600">
                      {formatCurrency(r.gross)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {r.tds > 0 ? (
                        <span className="text-amber-700">{formatCurrency(r.tds)}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-slate-900">
                      {formatCurrency(r.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/60 text-sm font-semibold">
                  <td className="px-5 py-3 text-slate-700" colSpan={4}>
                    Total · {totals.count} receipt{totals.count === 1 ? "" : "s"}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-700">
                    {formatCurrency(totals.gross)}
                  </td>
                  <td className="px-5 py-3 text-right text-amber-700">
                    {formatCurrency(totals.tds)}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-900">
                    {formatCurrency(totals.net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
