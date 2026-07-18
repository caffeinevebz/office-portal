const BASE = "http://localhost:4013";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { failN++; console.log(`FAIL ${name} ${extra}`); }
};

// login as partner
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "rajesh@sharmaassociates.in", password: "partner@123" }),
});
const cookie = login.headers.get("set-cookie").split(";")[0];
const get = (p) => fetch(`${BASE}${p}`, { headers: { cookie } }).then((r) => r.json());
const send = (p, method, body) =>
  fetch(`${BASE}${p}`, {
    method,
    headers: { cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const clients = await get("/api/clients?slim=1");
const client = clients[0];

// ---- 1. Manual fee invoice: normal series ----
const feeRes = await send("/api/invoices", "POST", {
  clientId: client.id,
  status: "Draft",
  lineItems: [{ description: "Audit fee", amount: 10000, taskId: null }],
});
const fee = await feeRes.json();
check("fee invoice created", feeRes.status === 201, JSON.stringify(fee).slice(0, 120));
check("fee invoice numbered on the fee series (no EXP)", /^[A-Z]+\/\d{2}-\d{2}\/\d{3}$/.test(fee.invoiceNumber), fee.invoiceNumber);
check("fee invoice kind = Fee", fee.kind === "Fee", fee.kind);

// ---- 2. Manual reimbursement invoice: EXP series ----
const rbRes = await send("/api/invoices", "POST", {
  clientId: client.id,
  status: "Draft",
  kind: "Reimbursement",
  taxRate: 0,
  gstMode: "None",
  lineItems: [{ description: "Travel to client site", amount: 2500, taskId: null }],
});
const rb = await rbRes.json();
check("reimbursement invoice created", rbRes.status === 201);
check("reimbursement numbered on EXP series", /^[A-Z]+\/EXP\/\d{2}-\d{2}\/001$/.test(rb.invoiceNumber), rb.invoiceNumber);
check("reimbursement kind stored", rb.kind === "Reimbursement", rb.kind);

// ---- 3. Series independence: next fee invoice continues fee sequence ----
const fee2 = await (await send("/api/invoices", "POST", {
  clientId: client.id,
  status: "Draft",
  lineItems: [{ description: "Certification fee", amount: 3000, taskId: null }],
})).json();
const seqOf = (n) => parseInt(n.split("/").pop(), 10);
check("fee sequence unaffected by EXP bill", seqOf(fee2.invoiceNumber) === seqOf(fee.invoiceNumber) + 1,
  `${fee.invoiceNumber} then ${fee2.invoiceNumber}`);
const rb2 = await (await send("/api/invoices", "POST", {
  clientId: client.id,
  status: "Draft",
  kind: "Reimbursement",
  taxRate: 0,
  gstMode: "None",
  lineItems: [{ description: "Court fee stamps", amount: 800, taskId: null }],
})).json();
check("EXP sequence increments independently", /\/EXP\/.*\/002$/.test(rb2.invoiceNumber), rb2.invoiceNumber);

// ---- 4. Expense-claim billing lands on the EXP series ----
const staff = await get("/api/staff");
const amit = staff.find((s) => s.email === "amit@sharmaassociates.in");
const claimRes = await send("/api/expenses", "POST", {
  title: "Outstation audit conveyance",
  clientId: client.id,
  staffId: amit?.id,
  periodFrom: "2026-07-01",
  periodTo: "2026-07-10",
  items: [
    { date: "2026-07-02", category: "Conveyance", description: "Taxi to plant", amount: 1200 },
    { date: "2026-07-05", category: "Lodging", description: "Hotel 2 nights", amount: 4800 },
  ],
});
let claim = await claimRes.json();
check("expense claim created", claimRes.status === 201, JSON.stringify(claim).slice(0, 150));
const approve = await send(`/api/expenses/${claim.id}`, "PATCH", { action: "Approve" });
claim = await approve.json();
check("claim approved", claim.status === "Approved", claim.status);
const billRes = await send(`/api/expenses/${claim.id}/invoice`, "POST");
const billed = await billRes.json();
check("claim billed", billRes.status === 201, JSON.stringify(billed).slice(0, 150));
const claimInvoice = await get(`/api/invoices?q=${encodeURIComponent(billed.invoice.invoiceNumber)}`);
check("claim invoice on EXP series", /\/EXP\//.test(billed.invoice.invoiceNumber), billed.invoice.invoiceNumber);
check("claim invoice kind = Reimbursement", claimInvoice[0]?.kind === "Reimbursement", claimInvoice[0]?.kind);

// ---- 5. Receipts: pay one fee + one reimbursement; register excludes EXP ----
const before = await get("/api/receipts");
await send(`/api/invoices/${fee.id}`, "PATCH", { status: "Paid", paymentMode: "UPI", transactionRef: "UPI-P-001", paidDate: new Date().toISOString() });
await send(`/api/invoices/${rb.id}`, "PATCH", { status: "Paid", paymentMode: "Cash", paidDate: new Date().toISOString() });
const feePaid = (await get(`/api/invoices?q=${encodeURIComponent(fee.invoiceNumber)}`))[0];
const rbPaid = (await get(`/api/invoices?q=${encodeURIComponent(rb.invoiceNumber)}`))[0];
check("fee receipt on fee R-series", /^[A-Z]+\/\d{2}-\d{2}\/R\d{3}$/.test(feePaid.receiptNumber ?? ""), feePaid.receiptNumber);
check("reimbursement receipt on EXP R-series", /^[A-Z]+\/EXP\/\d{2}-\d{2}\/R001$/.test(rbPaid.receiptNumber ?? ""), rbPaid.receiptNumber);

const after = await get("/api/receipts");
check("register gained exactly the fee receipt", after.totals.count === before.totals.count + 1,
  `before=${before.totals.count} after=${after.totals.count}`);
check("register never lists the EXP bill", !after.receipts.some((r) => r.invoiceNumber.includes("/EXP/")));
check("register lists the fee bill", after.receipts.some((r) => r.invoiceNumber === fee.invoiceNumber));
check("register gross grew by fee gross only", after.totals.gross === before.totals.gross + Math.round(10000 * 1.18),
  `before=${before.totals.gross} after=${after.totals.gross}`);

// ---- 6. PDFs titled correctly ----
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const pdfText = async (path, out) => {
  const buf = Buffer.from(await (await fetch(`${BASE}${path}`, { headers: { cookie } })).arrayBuffer());
  writeFileSync(out, buf);
  return execSync(`pdftotext -layout ${out} -`).toString();
};
const invPdf = await pdfText(`/api/invoices/${rb.id}/pdf`, "/tmp/rb-inv.pdf");
check("reimbursement invoice PDF titled REIMBURSEMENT BILL", invPdf.includes("REIMBURSEMENT BILL"), invPdf.slice(0, 200));
const rcPdf = await pdfText(`/api/invoices/${rb.id}/receipt`, "/tmp/rb-rc.pdf");
check("reimbursement receipt PDF titled REIMBURSEMENT RECEIPT", rcPdf.includes("REIMBURSEMENT RECEIPT"), rcPdf.slice(0, 200));
const feePdf = await pdfText(`/api/invoices/${fee.id}/pdf`, "/tmp/fee-inv.pdf");
check("fee invoice PDF still TAX INVOICE", feePdf.includes("TAX INVOICE"));
const regPdf = await pdfText(`/api/receipts/pdf`, "/tmp/reg.pdf");
check("register PDF omits EXP receipts", !regPdf.includes("/EXP/"));
check("register PDF notes the exclusion", regPdf.toLowerCase().includes("reimbursement bills"), regPdf.slice(-300));

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
