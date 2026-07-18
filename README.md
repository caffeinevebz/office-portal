# Ledgify · Anil P.S.Bhansali & Co.

**Ledgify** is a web-based **office management portal for a Chartered
Accountancy (CA) firm**. It brings the firm's day-to-day operations — clients,
statutory compliance, billing, team and documents — into a single dashboard.
The browser tab shows *Ledgify · your firm's name* (taken from the default
organization in Firm Settings). The UI wears Ledgify's chalkboard-green
identity — deep green with chalk-white and light-green accents — with a
collapsible sidebar on desktop and a split login screen (Ledgify logo panel
beside a clean sign-in card; stacked on phones).

> Built with Next.js (App Router), TypeScript, Tailwind CSS, Prisma and PostgreSQL.
> The sample data models an Indian CA practice (GST, income-tax, TDS, ROC/MCA,
> audit, etc.), but the app is generic enough for any professional-services firm.

---

## Features

| Module | What it does |
| --- | --- |
| **Dashboard** | A compact summary: four KPIs (active clients, open tasks, overdue deadlines, receivables) with the detail organised under **summary tabs — Tasks, Billing and DSC** — so one focused panel shows at a time. The Tasks tab has upcoming deadlines, the status donut and compliance mix; the Billing tab the 6-month billed-vs-collected chart; the **DSC tab just the three numbers that matter — expired, expiring in 30 days, and valid** (with an attention badge on the tab). Staff-level members see *their* task numbers; partners see the firm's. |
| **Clients** | Full client register (Individual / Proprietorship / Partnership / LLP / Pvt Ltd / HUF / Trust …) with PAN, GSTIN, **TAN** (all clients) and the **entity-specific statutory number** shown by type — **Aadhaar** for individuals, **CIN** for companies, **LLP Registration No.** for LLPs, **Firm Registration No.** for partnership firms — plus contacts. Search, filter, create, edit, delete, **bulk import from an Excel template**, and a per-client detail page. Each client can hold **multiple firm / trade names** (a proprietor's several concerns, or a company's brand name) — each with its own GSTIN/PAN/address — **added right in the client form** (add as many as needed) or from the client page. A client registered in more than one state can also record **multiple GST registrations (one GSTIN per state)** — the state is auto-derived from each GSTIN — so GST work can be tracked per registration. Clients can be organised into **groups** with a manually-assigned unique code, filterable across the register. |
| **Tasks** | Track engagements under six master groups — **Income Tax, TDS, GST, MCA/ROC, Audit, Registration** (plus *Other*). Each task can be **one-time or recurring** (choose the cadence when creating it), and a task can be **created for many clients in one go** (e.g. the season's ITR filing task for every individual client), with a **client search** in the picker (by name, PAN or GSTIN) to find them quickly. Task **status updates automatically from the checklist** — none done → Pending, some → In Progress, all → Completed — and steps can be ticked right from the task list. Completed tasks move to a separate **Completed** list (segmented **In Progress / Completed** toggle) so the working list stays uncluttered, and tasks can be **searched by client name** and **filtered by financial year**. Category-specific fields guide data entry: **Income Tax** picks a task type (ITR filing, rectification, grievance, PAN/TAN application, misc.) and an **Assessment / Tax Year** (labelled AY or TY per the Income-tax Act 2025); **TDS** picks the return form shown as *new / old* number (Form 138/24Q, 140/26Q, 144/27Q, 144A/27EQ), quarter, year and Original/Revised, with a full workflow checklist (data received → return prepared → e-return run → files saved → filed → certificate requested, downloaded & **mailed to the client**); **ITR filing** tasks carry their own checklist (data received → 26AS/AIS/TIS downloaded → computation prepared & finalised → filed → e-verified); **GST** picks the return (GSTR-1, GSTR-3B, GSTR-2B, GSTR-9, GSTR-9C), monthly/quarterly periodicity and the FY/month/quarter, and — for a client with several GST registrations — the **GSTIN** the return is filed under, with an option to **create a separate task for each of the client's GSTINs in one go** (each files its GSTR returns separately); **Audit** picks a sub-type (Statutory, Tax, Internal, GST, Bank, Management, Trust & NGO, Cost, Special, Liquidation/Insolvency, Corporate Secretarial/Compliance) each with its own default work-programme. Per-task **checklists** are seeded by type and fully **editable** — add, rename or remove any step. A task can be **assigned to one or more team members** (the first is the lead) and given an **approval hierarchy** — a Partner/Admin **approver** who gives final sign-off: once the work is done the task waits **Under Review** until the approver clicks **Approve**, which completes it and stamps who approved. **Assignees get an in-app + device notification the moment a task is assigned to them.** **Task visibility follows the role**: accountants and article assistants see only tasks assigned to them (or awaiting their approval), while partners/admins/managers see everything (tunable per role in Access Control). **Priority is automatic by default**, derived from the days left to the due date — 0–7 days (or overdue) → *Very High*, 8–30 → *High*, 31–45 → *Medium*, beyond 45 → *Low* — escalating on its own as the deadline nears; a Partner/Admin can pin an explicit priority instead. Due dates with overdue highlighting, and inline status changes. **Return-filing tasks** (GST/ITR/TDS) complete automatically the moment the filing entry — filing date + acknowledgment number — is recorded, via a one-click "Record filing" action. A **Recurring** tab manages recurring obligations and generates their upcoming dated tasks (idempotently), and one click **syncs the Income Tax Department's compliance calendar** into the list. |
| **Invoices** | Raise professional-fee invoices with GST, track Draft → Sent → Paid → Overdue. **Invoice numbers auto-generate** as `PREFIX/FY/NNN` (e.g. `APSB/26-27/001`) — the firm initials come from the billing organization, the sequence resets to 001 each financial year; **receipts** get the same number with an `R` (`APSB/26-27/R001`), assigned when an invoice is marked Paid. An invoice can bill **multiple services on one invoice** (line items), and each line can be **mapped to the Task it settles** — so you can see which service/task has been billed (billed tasks show a *Billed* badge). It can be **billed under the client's legal name or one of their trade names** (using that concern's GSTIN & address). Pick the **billing organization** and **GST applicability**; download a multi-line GST **tax-invoice PDF** and a **payment-receipt PDF** (with the firm's logo sized up and aligned with the letterhead). Marking an invoice **Paid records the payment**: the **mode** (Cash, Cheque, NEFT/IMPS/Transfer, UPI) with its instrument details — **cheque no./date/bank** for cheques, **transaction number + date** for transfers/UPI — and whether the client **deducted TDS** on the fee and how much. The receipt PDF prints the mode and details, and shows **invoice amount − TDS = net received** when TDS applies. |
| **Receipt Register** | Lives **inside the Invoices module** (an *Invoices / Receipt Register* tab pair — one billing module, less clutter). Professional income is accounted on **receipt basis**, so this register lists **money actually received** — every payment by its receipt date — for a **financial year (Apr–Mar), a month, or any custom period**. The register is **firm-wise**: pick the billing organization (receipt numbers run per firm) or an **all-firms view grouped per firm**. Columns for gross (incl. GST), **TDS deducted by clients** (claimable) and net received, with period totals, and a **printable register PDF** — on the selected firm's letterhead, or grouped with per-firm subtotals across all firms. |
| **Filing Register** | One register for **every return the firm files — ITR, TDS, GST and MCA** — per client, keyed by **financial year** with the period (quarter/month) where relevant. Recording a filing on a return task **posts it into the register automatically** (linked back to the task); entries can also be added by hand. GST entries carry the **GSTIN** they were filed under, so a client's several registrations stay distinct in the register. The link works **both ways** — a register entry can be **mapped directly to the relevant task from the register side**: find the client by **name, PAN, TAN, GSTIN or CIN** (their statutory numbers are shown to confirm the match), then pick which of that client's tasks the filing settles. A filed entry so linked **marks the task complete** and carries the acknowledgement number across, and each task can back only one filing entry (a second attempt is refused). The income-tax period label follows the Income-tax Act 2025 changeover: **FY 2025-26 and earlier show as `AY <fy+1>`** (e.g. AY 2026-27); **FY 2026-27 onwards show as `TY <fy>`** (Tax Year, e.g. TY 2026-27). Form type per return type (ITR-1…7, Form 138/24Q…, GSTR-1/3B/9…, AOC-4/MGT-7…), regime for ITR, status pipeline, filing dates, acknowledgement numbers and refunds. |
| **Reimbursements** | Staff and article assistants **claim back out-of-pocket expenses** (conveyance, travel, lodging…) from audit assignments: a claim carries the assignment, its **period**, and itemised expenses with dates, categories and amounts. Claims go to a **Partner/Admin for approval** (with an optional note back to the requester, who is notified of the decision); an approved claim can then be **billed to the client in one click** — a draft no-GST invoice with one line per expense. Requesters see their own claims; approvers see everyone's. |
| **Notifications** | A **header bell** with the member's in-app notifications — new task assignments, approval requests, expense-claim decisions — with unread badge and mark-as-read. New notifications also **pop up on the device** via the browser's Notification API (permission asked on first use), so an assignee knows the moment work lands on their desk. |
| **Firm Settings** | Manage one or more **billing organizations** (name, letterhead address, PAN/GSTIN, bank & UPI, invoice note) and upload a **logo** per organization. The default organization brands the app and the sign-in screen. |
| **Team** | Manage partners, managers, accountants and article assistants, with their open-task load. **Enrol new members by email invitation**: send an invite link (7-day expiry), the invitee sets their own password on a public accept page, and pending invites can be revoked. |
| **Access Control** | Admins can **add user categories (roles)** and **edit each category's access level** in a permission × role grid — grouped by area, with per-permission toggles. Built-in roles can be re-tuned; the Partner role is the locked super-admin so a firm can never lock itself out. |
| **Documents** | A register of statutory documents (PAN, GST, ITR, financials, agreements) linked to clients. |
| **DSC Register** | Digital Signature Certificates per client signatory: class, authority, the **DSC PIN/password** needed to use the token (stored masked, revealed on demand), validity with expiry countdowns, and a physical-token custody in/out register stamped with the acting user. **Holders not yet linked to a client are highlighted** (amber row + banner count) so they can be mapped. DSC expiries feed the reminders engine. |
| **Inward/Outward Register** | The office's physical-document register, digitized: every packet of originals received gets an auto-issued inward number (IN-2627-001…) with contents, deliverer, mode/courier docket and storage location; returns/dispatches get outward numbers, and a full movement trail shows who handled what. Long-held packets (90+ days) are flagged. |
| **Calendar** | A month view of every statutory due date across all clients, colour-coded by category. |
| **Recurring** *(a tab within Tasks)* | A statutory calendar of recurring obligations (monthly GST, quarterly TDS/advance tax, annual ITR/ROC…) that auto-generates the upcoming deadline tasks — idempotently. One click **syncs the Income Tax Department's compliance calendar** (advance tax installments, monthly TDS payments, quarterly TDS returns, ITR & tax-audit due dates, Form 16, SFT) into the list; re-syncing updates dates in place and never duplicates. |
| **Deadline reminders** | Email & WhatsApp nudges for tasks that are due soon or overdue, to the assignee and/or client, with a preview, a delivery log and configurable lead time. |
| **Login & roles** | Session-based sign-in with role-based access, enforced on both the API and the UI. Roles are dynamic: the built-in five ship with sensible defaults, and admins can add custom roles and adjust any role's permissions from **Access Control**. A **Forgot password?** flow emails a one-time reset link (60-minute expiry). |
| **Mobile & PWA** | Fully responsive on phones, plus a web-app manifest: open the site on a phone and *Add to Home Screen* to install Ledgify like an app (full-screen, own icon). |
| **Quick-access PIN** | Any member can set a **4-digit PIN** from their profile menu; the sign-in screen then offers one-tap PIN unlock for that device (5 wrong attempts lock the PIN until a password sign-in). |

## Tech stack

- **Next.js 16** (App Router, Route Handlers) + **React 19** + **TypeScript**
- **Tailwind CSS v4** for styling
- **Prisma 6** ORM with **PostgreSQL** (Neon's free tier on Vercel; any Postgres locally)
- **Recharts** for dashboard charts, **lucide-react** icons, **Zod** for API validation
- **pdf-lib** for server-generated invoice & receipt PDFs (pure JS, no headless browser)
- Session auth with signed cookies + `scrypt` password hashing (no auth service)

> Invoice PDFs use the firm identity in `src/lib/firm.ts` (name, address, PAN,
> GSTIN, bank details) — edit that one file to change the letterhead.

## Deploy to Vercel (recommended — nothing to install)

The whole setup happens in the browser:

1. **Import the repo** — sign in at [vercel.com](https://vercel.com) with GitHub →
   *Add New → Project* → import `office-portal`. Don't deploy yet.
2. **Attach a free database** — in the project, open the **Storage** tab →
   *Create Database* → **Neon (Postgres)** → accept the defaults. This injects
   the `DATABASE_URL` environment variable automatically.
3. **Add one env var** — under *Settings → Environment Variables*, add
   `AUTH_SECRET` with any long random string (it signs the login cookies).
4. **Deploy.** The build runs `prisma db push` automatically, so the database
   tables are created on the first deploy.
5. **Initialise from the browser** — open `https://<your-app>.vercel.app`.
   The sign-in page shows a **"First run?"** link to the setup screen, where
   you either **load the demo firm** (sample clients, tasks, invoices, DSCs +
   the demo logins) or **create your own Partner account** and start clean.
   Setup locks itself the moment the first account exists.

## Run locally (for development)

Requires Node.js 20+ and a PostgreSQL server (any 14+). Put its connection
string in `.env` as `DATABASE_URL`, then:

```bash
npm install
npm run db:push      # create the tables
npm run db:seed      # optional: load the demo firm
npm run dev
```

Then open <http://localhost:3000> — you'll be taken to the sign-in screen.

## Recurring compliance (statutory calendar)

The **Recurring** tab (inside **Tasks**) lets the firm define recurring statutory
obligations per client — e.g. *GSTR-3B, monthly, due 20th* or *Advance Tax, quarterly,
15 Jun/Sep/Dec/Mar*. You can also mark a task as recurring right from the New Task
form. A built-in library of common Indian obligations (GSTR-1/3B, CMP-08, TDS,
advance tax, PF/ESI, ITR, tax audit, ROC AOC-4/MGT-7, DIR-3 KYC) pre-fills the form.

Clicking **Generate tasks** creates the actual deadline tasks for the next
3 / 6 / 12 months, with correct due dates and period labels (e.g. "GSTR-3B —
Jun 2026", "Advance Tax — Q2 FY 2026-27", "Tax Audit — FY 2025-26"). Generation
is **idempotent**: each occurrence is keyed by schedule + period, so re-running
never creates duplicates. Generated tasks show a ↻ marker on the Tasks page
and flow through to the dashboard and calendar like any other task. Managing
obligations and generating tasks requires the `manageSchedules` permission
(Partner / Admin / Manager).

## Deadline reminders (email & WhatsApp)

The **Reminders** page sends nudges for open tasks that are **due within N days
or overdue**. Configure who is notified (the assigned staff member and/or the
client) and on which channels (email, WhatsApp), preview exactly what will go
out, and run it. Each recipient/channel is deduplicated per day, so running it
repeatedly never double-sends. Every send is written to a **delivery log**.

Delivery is **pluggable and dependency-free**:

| Channel | Goes live when you set | Otherwise |
| --- | --- | --- |
| Email | the firm's official mailbox in **Firm Settings → Official firm email** — either **Google/Gmail** (a Google **App Password** for the firm's account; the right choice when the firm's email is hosted on Google Workspace — no DNS changes needed) or **Resend** (API key; falls back to `RESEND_API_KEY`) | Simulated |
| WhatsApp | `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` (Meta Cloud API) | Simulated |

The same official mailbox is used for **everything the portal emails**: invoice
PDFs sent to clients from the Invoices page, ad-hoc client emails composed from
a client's page (document requests etc.), team invitations, password-reset
links, deadline reminders and DSC-expiry alerts. Configure it once in the app —
no redeploy needed — and use **Send test email** to verify.

For the Google option: sign in to the firm's Google account → enable
**2-Step Verification** → create an **App password** (myaccount.google.com →
search "App passwords") → paste it in Firm Settings together with the firm's
email as the From address. For Resend, the From domain must be verified with
Resend first.

In **simulation mode** (the default, and what runs without credentials) messages
are fully rendered and logged but not actually delivered — nothing leaves the
server. To automate reminders, point a daily scheduler (cron) at
`POST /api/reminders/run`; it is safe to call repeatedly. Configuring and
running reminders requires the `manageReminders` permission (Partner / Admin /
Manager).

Reminder runs also cover **DSC expiries**: certificate holders (falling back to
the client's contact details) are nudged when their DSC expires within a
configurable window (default 30 days) or has already lapsed. The **dashboard**
additionally shows a standing *Digital signature alerts* panel listing every
active DSC that has expired or expires within 30 days.

## Authentication & roles

Sign-in is session-based (an HTTP-only, HMAC-signed cookie; passwords hashed
with Node's built-in `scrypt` — no external service). Team members *are* the
users: each `Staff` record can have a login password.

**Demo accounts** (also shown as click-to-fill cards on the login screen):

| Role | Email | Password |
| --- | --- | --- |
| Partner | `rajesh@sharmaassociates.in` | `partner@123` |
| Manager | `priya@sharmaassociates.in` | `manager@123` |
| Accountant | `amit@sharmaassociates.in` | `staff@123` |
| Article Assistant | `sneha@sharmaassociates.in` | `staff@123` |

**Access levels** — everyone can *view* everything; these gate the write actions.
The table below shows the **built-in defaults**: from **Access Control** an
admin can change any of them per role, and add new roles (user categories)
with their own set of permissions. Only the Partner role is fixed — it is the
super-admin and always has full access, so the firm can never lock itself out.

| Action | Partner / Admin | Manager | Accountant | Article Assistant |
| --- | :-: | :-: | :-: | :-: |
| Manage clients | ✓ | ✓ | ✓ | — |
| Delete clients | ✓ | ✓ | — | — |
| Manage tasks | ✓ | ✓ | ✓ | ✓ |
| Delete tasks | ✓ | ✓ | ✓ | — |
| Manage invoices (billing) | ✓ | ✓ | — | — |
| Manage documents | ✓ | ✓ | ✓ | ✓ |
| Manage recurring obligations & generate | ✓ | ✓ | — | — |
| Configure & send reminders | ✓ | ✓ | — | — |
| Manage DSCs & record custody | ✓ | ✓ | ✓ | — |
| Delete DSCs | ✓ | ✓ | — | — |
| Maintain the inward/outward register | ✓ | ✓ | ✓ | ✓ |
| Delete inward register entries | ✓ | ✓ | — | — |
| Manage ITR filings | ✓ | ✓ | ✓ | ✓ |
| Delete ITR filings | ✓ | ✓ | ✓ | — |
| Firm settings (organizations, logo) | ✓ | — | — | — |
| Manage the team & roles | ✓ | — | — | — |

Permissions are enforced server-side on every API route (a denied action returns
`403`) and mirrored in the UI (buttons hidden / controls read-only). Partners and
Admins can set or reset a member's login password from the **Team** page, or
**invite a member by email** — the invitee opens the link and sets their own
password. Members who forget their password can use **Forgot password?** on
the sign-in screen: a one-time reset link (valid 60 minutes) is emailed to
them; while email is in simulated mode the link is also visible to admins in
the reminders **delivery log**. Invitation and reset emails go out live once
the firm email is configured (Firm Settings → Official firm email, or
`RESEND_API_KEY`); otherwise invite links are shown for manual sharing.

> **Production note:** set a strong `AUTH_SECRET` in the environment (the
> committed `.env` ships with a development value). The session cookie is signed
> with it.

### Useful scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run db:push` | Sync the Prisma schema to the database |
| `npm run db:seed` | Reset and load sample data |
| `npm run db:studio` | Open Prisma Studio to browse the data |

## Project structure

```
prisma/
  schema.prisma        # Data model: Client, Staff, Task, Invoice, Document
  seed.ts              # Sample Indian CA-firm data
src/
  app/
    (app)/             # Authenticated shell (sidebar layout) + pages
      layout.tsx       # Server-side auth guard (redirects to /login)
      page.tsx         # Dashboard
      clients/ tasks/ invoices/ staff/ documents/ calendar/
    login/             # Public sign-in page
    api/
      auth/            # login / logout / me
      ...              # REST route handlers for every module (auth-enforced)
  components/
    AppShell.tsx       # Sidebar + top bar + user menu
    charts.tsx         # Recharts dashboard charts
    ui/                # Reusable primitives (Card, Button, Modal, Badge, …)
  lib/
    prisma.ts          # Prisma client singleton
    constants.ts       # Domain enums + badge colours
    validation.ts      # Zod schemas
    format.ts          # Currency / date helpers
    auth/              # password (scrypt), session, roles/permissions, context
```

## Notes & next steps

Authentication & roles, a statutory calendar of recurring obligations,
email/WhatsApp deadline reminders, DSC and inward/outward registers,
invoice/receipt PDFs, and cloud deployment (Vercel + Neon Postgres) are
already built. Natural extensions from here: real file uploads for documents,
an audit log of who changed what, and self-service password changes.
