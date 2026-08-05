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
| **Clients** | Full client register (Individual / Proprietorship / Partnership / LLP / Pvt Ltd / HUF / Trust …) with PAN, GSTIN, **TAN** (all clients) and the **entity-specific statutory number** shown by type — **Aadhaar** for individuals, **CIN** for companies, **LLP Registration No.** for LLPs, **Firm Registration No.** for partnership firms — plus contacts. Search, filter, create, edit, delete, **bulk import from an Excel template**, and a per-client detail page. **Duplicate records are blocked**: the **PAN identifies a client** — creating or editing a record with a PAN that already belongs to another client is rejected (the form warns live as you type, and the Excel import skips such rows); clients without a PAN are checked by exact name. A **duplicity banner** on the register lists any duplicate groups that already exist so they can be merged. Each client can hold **multiple firm / trade names** (a proprietor's several concerns, or a company's brand name) — each with its own GSTIN/PAN/address — **added right in the client form** (add as many as needed) or from the client page. A client registered in more than one state can also record **multiple GST registrations (one GSTIN per state)** — the state is auto-derived from each GSTIN — so GST work can be tracked per registration. Clients can be organised into **groups** with a manually-assigned unique code, filterable across the register. |
| **Tasks** | Track engagements under six master groups — **Income Tax, TDS, GST, MCA/ROC, Audit, Registration** (plus *Other*). Each task can be **one-time or recurring** (choose the cadence when creating it), and a task can be **created for many clients in one go** (e.g. the season's ITR filing task for every individual client), with a **client search** in the picker (by name, PAN or GSTIN) to find them quickly — the same search also narrows the **single-client dropdown** when creating an ordinary task. Task **status updates automatically from the checklist** — none done → Pending, some → In Progress, all → Completed — and steps can be ticked right from the task list. Completed tasks move to a separate **Completed** list (segmented **In Progress / Completed** toggle) so the working list stays uncluttered, and tasks can be **searched by client name** and **filtered by financial year, assignee and client group** (including an ungrouped-clients view). Category-specific fields guide data entry: **Income Tax** picks a task type (ITR filing, rectification, grievance, PAN/TAN application, misc.) and an **Assessment / Tax Year** (labelled AY or TY per the Income-tax Act 2025); **TDS** picks the return form shown as *new / old* number (Form 138/24Q, 140/26Q, 144/27Q, 144A/27EQ), quarter, year and Original/Revised, with a full workflow checklist (data received → return prepared → e-return run → files saved → filed → certificate requested, downloaded & **mailed to the client**); **ITR filing** tasks carry their own checklist (data received → 26AS/AIS/TIS downloaded → computation prepared & finalised → filed → e-verified); **GST** picks the return (GSTR-1, GSTR-3B, GSTR-2B, GSTR-9, GSTR-9C), monthly/quarterly periodicity and the FY/month/quarter, and — for a client with several GST registrations — the **GSTIN** the return is filed under, with an option to **create a separate task for each of the client's GSTINs in one go** (each files its GSTR returns separately); **Audit** picks a sub-type (Statutory, Tax, Internal, GST, Bank, Management, Trust & NGO, Cost, Special, Liquidation/Insolvency, Corporate Secretarial/Compliance) each with its own default work-programme. Per-task **checklists** are seeded by type and fully **editable** — add, rename or remove any step. A task can be **assigned to one or more team members** (the first is the lead) and given an **approval hierarchy** — a Partner/Admin **approver** who gives final sign-off: once the work is done the task waits **Under Review** until the approver clicks **Approve**, which completes it and stamps who approved. **Assignees get an in-app + device notification the moment a task is assigned to them.** **Task visibility follows the role**: accountants and article assistants see only tasks assigned to them (or awaiting their approval), while partners/admins/managers see everything (tunable per role in Access Control). **Priority is automatic by default**, derived from the days left to the due date — 0–7 days (or overdue) → *Very High*, 8–30 → *High*, 31–45 → *Medium*, beyond 45 → *Low* — escalating on its own as the deadline nears; a Partner/Admin can pin an explicit priority instead. Due dates with overdue highlighting, and inline status changes. **Return-filing tasks** (GST/ITR/TDS) complete automatically the moment the filing entry — filing date + acknowledgment number — is recorded, via a one-click "Record filing" action. Any task can also carry **points needing the client's clarification**, opened from the task row into a full-size panel: a card per query showing who raised it and when, with **awaiting / answered counts** at the top and answered points grouped beneath the open ones. The task row badges how many are still awaiting an answer, the client's reply is recorded against its point in its own block, and **both the question and the recorded answer can be edited** later (or the point reopened if the reply turns out to be wrong). The open points can be **sent to the client on WhatsApp in one click**, already written out as a numbered list. Where a client operates under a **firm / trade name**, the task can be raised against that particular concern — the register shows it beneath the client's legal name, so *Suresh Patel · Sunrise Traders* reads apart from *Suresh Patel · Patel Agro Industries* at a glance. The register is split into tabs so one list never mixes concerns: **Tasks** (everything the firm has to do — raised by hand *or* generated from one of its own recurring obligations), **Recurring** (those obligations, i.e. the settings the repeating work is generated from) and **Statutory** (dates pulled in from the Income Tax / GST / MCA calendars — the whole calendar for every client, kept out of the working list). The **Statutory tab only appears once a government calendar has been synced**. Within each tab, **service-type chips with live counts** — *All · Income Tax · TDS · GST · MCA/ROC · Audit · Registration · Other* — segregate the work by practice area in one click, tinted in the same colours the category badges use. |
| **Messages** | **Instant messaging among the team** — a firm-wide **Team channel** everyone can post in, plus a **one-to-one thread with every colleague**. Conversations with recent activity float to the top, each showing the last message and an unread count; the sidebar carries a badge for unread messages. Threads stream in near-real time (no refresh needed), Enter sends and Shift+Enter starts a new line, and the layout collapses to one pane at a time on phones. Direct messages stay private to their two participants. **Sent messages can be edited** — correct a typo or a wrong date in place and everyone in the conversation sees the update within seconds, with an *edited* marker on the bubble; only the author can change their own words. |
| **Invoices** | Raise professional-fee invoices with GST, track Draft → Sent → Paid → Overdue. **Invoice numbers auto-generate** as `PREFIX/FY/NNN` (e.g. `APSB/26-27/001`) — the firm initials come from the billing organization, the sequence resets to 001 each financial year; **receipts** get the same number with an `R` (`APSB/26-27/R001`), assigned when an invoice is marked Paid. An invoice can bill **multiple services on one invoice** (line items), and each line can be **mapped to the Task it settles** — so you can see which service/task has been billed (billed tasks show a *Billed* badge). It can be **billed under the client's legal name or one of their trade names** (using that concern's GSTIN & address). Pick the **billing organization** and **GST applicability**; download a multi-line GST **tax-invoice PDF** and a **payment-receipt PDF** (with the firm's logo sized up and aligned with the letterhead). Marking an invoice **Paid records the payment**: the **mode** (Cash, Cheque, NEFT/IMPS/Transfer, UPI) with its instrument details — **cheque no./date/bank** for cheques, **transaction number + date** for transfers/UPI — and whether the client **deducted TDS** on the fee and how much. The receipt PDF prints the mode and details, and shows **invoice amount − TDS = net received** when TDS applies, and is **emailed to the client automatically** the moment the receipt is generated (once per receipt; skipped silently when the client has no email on record — recording the payment never fails because of email). A single service line can be **mapped to several tasks at once** (tick every engagement it settles), so one consolidated fee line can close out a whole set of filings. Invoices also carry the firm's **scan-to-pay UPI QR** and the **authorised signatory's signature** — see *Firm Settings* below. Every invoice and receipt PDF **opens inside the app** with Back, Share, WhatsApp and Download, and can be **sent to the client on WhatsApp with the document itself** — see *Documents on the phone* below. |
| **Receipt Register** | Lives **inside the Invoices module** (an *Invoices / Receipt Register* tab pair — one billing module, less clutter). Professional income is accounted on **receipt basis**, so this register lists **money actually received** — every payment by its receipt date — for a **financial year (Apr–Mar), a month, or any custom period**. The register is **firm-wise**: pick the billing organization (receipt numbers run per firm) or an **all-firms view grouped per firm**. Columns for gross (incl. GST), **TDS deducted by clients** (claimable) and net received, with period totals, and a **printable register PDF** — on the selected firm's letterhead, or grouped with per-firm subtotals across all firms. **Expense reimbursement bills (EXP series) are excluded** — they are recoveries, not professional receipts. |
| **Filing Register** | One register for **every return the firm files — ITR, TDS, GST and MCA** — per client, keyed by **financial year** with the period (quarter/month) where relevant. Recording a filing on a return task **posts it into the register automatically** (linked back to the task); entries can also be added by hand. GST entries carry the **GSTIN** they were filed under, so a client's several registrations stay distinct in the register. The link works **both ways** — a register entry can be **mapped directly to the relevant task from the register side**: find the client by **name, PAN, TAN, GSTIN or CIN** (their statutory numbers are shown to confirm the match), then pick which of that client's tasks the filing settles. A filed entry so linked **marks the task complete** and carries the acknowledgement number across, and each task can back only one filing entry (a second attempt is refused). The income-tax period label follows the Income-tax Act 2025 changeover: **FY 2025-26 and earlier show as `AY <fy+1>`** (e.g. AY 2026-27); **FY 2026-27 onwards show as `TY <fy>`** (Tax Year, e.g. TY 2026-27). Form type per return type (ITR-1…7, Form 138/24Q…, GSTR-1/3B/9…, AOC-4/MGT-7…), regime for ITR, status pipeline, filing dates, acknowledgement numbers and refunds. |
| **Reimbursements** | Staff and article assistants **claim back out-of-pocket expenses** (conveyance, travel, lodging…) from audit assignments: a claim carries the assignment, its **period**, and itemised expenses with dates, categories and amounts. Claims go to a **Partner/Admin for approval** (with an optional note back to the requester, who is notified of the decision); an approved claim can then be **billed to the client in one click** — a draft no-GST invoice with one line per expense. Reimbursement bills run on their **own number series** with an `EXP` segment (`APSB/EXP/26-27/001`, receipts `…/R001`) — they never consume a fee-invoice number — and because they are **recoveries, not professional income**, they are **excluded from the Receipt Register**. The invoice list marks them with an *Expense reimbursement* badge, can filter by type, and their PDFs are titled *Reimbursement Bill* / *Reimbursement Receipt* instead of *Tax Invoice*. A reimbursement bill can also be raised directly from the invoice form (invoice type selector). Requesters see their own claims; approvers see everyone's. |
| **Notifications & alerts** | A **header bell** with the member's in-app notifications — new task assignments, approval requests, expense-claim decisions — with unread badge and mark-as-read. Anything new **pops up as an on-screen alert with a sound**, on both the web app and the installed mobile app: assign a task and the assignee hears a chime and sees the pop-up within seconds, wherever they are in the portal, and clicking it jumps straight to the task. The same alert fires for a new team message. Device notifications (outside the app) go through a service worker so they work on phones too — permission is asked the first time the bell is opened — and the **sound can be muted** from the bell at any time. |
| **WhatsApp** | Message clients **from inside the app** — from the client register, from an invoice (prefilled with its number, date, amount and due date), or from a task's clarification points. If the firm has **WhatsApp Business Cloud API** credentials (added in Firm Settings), messages go out from the firm's own WhatsApp number; otherwise the app opens the chat in the sender's own WhatsApp with the text already written. Numbers are normalised (a 10-digit mobile gets the 91 country code), and every message is recorded in the delivery log. |
| **Firm Settings** | Manage one or more **billing organizations** (name, letterhead address, PAN/GSTIN, bank & UPI, invoice note) and upload three images per organization: a **logo**, a **scan-to-pay UPI QR** and the **authorised signatory's signature**. The QR prints on that firm's invoices under *Scan to pay (UPI)* so clients can pay by scanning, and the signature prints between the *For «firm name»* line and *Authorised Signatory* on both invoices and receipts. The bank QRs for **Anil P.S. Bhansali & Co.** (HDFC) and **Vaibhav Bhansali** (SBI), and the signatory's signature, ship with the app and install themselves into the matching firms — replace or remove any of them here at any time. The default organization brands the app and the sign-in screen. |
| **Team** | Manage partners, managers, accountants and article assistants, with their open-task load. **Enrol new members by email invitation**: send an invite link (7-day expiry), the invitee sets their own password on a public accept page, and pending invites can be revoked. |
| **Access Control** | Admins can **add user categories (roles)** and **edit each category's access level** in a permission × role grid — grouped by area, with per-permission toggles. Built-in roles can be re-tuned; the Partner role is the locked super-admin so a firm can never lock itself out. |
| **Documents** | A register of statutory documents (PAN, GST, ITR, financials, agreements) linked to clients. |
| **DSC Register** | Digital Signature Certificates per client signatory: class, authority, the **DSC PIN/password** needed to use the token (stored masked, revealed on demand), validity with expiry countdowns, and a physical-token custody in/out register stamped with the acting user. **Holders not yet linked to a client are highlighted** (amber row + banner count) so they can be mapped. DSC expiries feed the reminders engine, and **Renewal reminders** writes to the holders on demand — every certificate expired or expiring within 30 days, each listed with the address it will go to, pick the ones to write to and send. |
| **Inward/Outward Register** | The office's physical-document register, digitized: every packet of originals received gets an auto-issued inward number (IN-2627-001…) with the deliverer, mode/courier docket and storage location. The **documents received are entered as a list** (one row per document/file), so returning them to the client means **simply selecting from that list** — a dispatch ticks the chosen documents off (issuing an outward number), the entry shows *Partly returned* with an n/m count until everything is back with the client, and documents can be received back the same way. The movement trail records exactly **which documents moved in each dispatch/receipt**. Legacy free-text entries convert to the list on their next edit. Long-held packets (90+ days) are flagged. |
| **Calendar** | A month view showing the **statutory due dates prescribed by law — Income Tax, GST and MCA/ROC** — alongside the firm's own deadlines. The statutory dates need no setup: they are computed from the built-in calendars, so every month (past or future) is painted the moment you navigate to it. Each law can be **toggled on or off** with a chip, day cells tint statutory rows by law (violet = Income Tax, green = GST, amber = MCA/ROC), the header counts *N statutory due date(s) · M firm deadline(s)*, and a list beneath the grid spells out the month's statutory dates with the legal note for each (e.g. *"20 Aug — GSTR-3B, summary return and tax payment for the preceding month"*). |
| **Recurring** *(a tab within Tasks)* | A statutory calendar of recurring obligations (monthly GST, quarterly TDS/advance tax, annual ITR/ROC…) that auto-generates the upcoming deadline tasks — idempotently. One click **syncs a statutory calendar — Income Tax, GST or MCA/ROC (or all three)** — into the list; re-syncing updates dates in place and never duplicates. An obligation can be created for **one client, several clients at once, or every active client** — each client gets their own copy, so their deadlines generate and can be assigned independently. It can be pinned to one of the client's **firm / trade names**, and a **GST** obligation for a client registered in several states can be **set up separately for each GSTIN** in one tick — one obligation per registration, each generating its own task under that GSTIN. The tasks it generates land in the ordinary **Tasks** tab, because a recurring obligation is a setting for the firm's own work, not a separate kind of work. |
| **Deadline reminders** | Email & WhatsApp nudges for tasks that are due soon or overdue, to the assignee and/or client, with a preview, a delivery log and configurable lead time. Two things can also be sent **on demand**: **DSC renewal reminders** to the holders whose certificates have lapsed or lapse within 30 days, and a **statutory due-date circular** to every client listing the Income Tax / GST / MCA dates falling in a period. |
| **Login & roles** | Session-based sign-in with role-based access, enforced on both the API and the UI. Roles are dynamic: the built-in five ship with sensible defaults, and admins can add custom roles and adjust any role's permissions from **Access Control**. **Billing is partner-level** — invoices, receipts and the firm's billing figures are visible to Partners and Admins only; other roles get no Invoices tab, no receivables figure and no billing data at all (see below). A **Forgot password?** flow emails a one-time reset link (60-minute expiry). |
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

### Performance on Vercel + Neon

The app caches sessions/permissions in-process and reuses fetched data across
page navigations, but on a serverless deploy the biggest delays come from the
hosting setup itself. Three settings make the deployed app feel dramatically
faster:

1. **Use Neon's pooled connection string.** In the Neon dashboard, copy the
   connection string labelled **Pooled** (its host contains `-pooler`) and set
   it as `DATABASE_URL` in Vercel (*Settings → Environment Variables*), then
   redeploy. Serverless functions open a fresh database connection per
   instance; the pooler makes that near-instant instead of a full Postgres
   handshake each time.
2. **Keep the database awake.** Neon's free tier suspends the database after
   ~5 minutes of inactivity, so the first request after a quiet spell waits
   for a cold start (often 1–3 s, sometimes more). The app exposes a public
   `/api/health` endpoint that touches the database — point any free uptime
   monitor (UptimeRobot, Better Stack, cron-job.org) at
   `https://<your-app>.vercel.app/api/health` every 5 minutes to keep it warm
   during working hours. (Paid Neon plans can disable autosuspend entirely.)
3. **Put the app and the database in the same region.** Every API call makes
   several database round-trips, so 200 ms of app↔database distance multiplies
   quickly. Check the Neon project's region and set the Vercel project's
   function region (*Settings → Functions*) to the closest match — e.g. Neon
   `ap-southeast-1` (Singapore) with Vercel `sin1` for users in India.

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

## Statutory due dates (Income Tax, GST, MCA)

The app ships with the **statutory compliance calendars as prescribed by law** —
36 recurring due dates across three statutes:

| Law | Covers |
| --- | --- |
| **Income Tax** | TDS/TCS payment (7th monthly), advance-tax installments (15 Jun/Sep/Dec/Mar), quarterly TDS returns & Form 16/16A, ITR due dates for non-audit / audit / transfer-pricing cases, tax-audit report, SFT. |
| **GST** | GSTR-7 & GSTR-8 (10th), GSTR-1 monthly (11th), GSTR-6 ISD (13th), GSTR-1 QRMP (13th quarterly), CMP-08 (18th quarterly), GSTR-3B monthly (20th), GSTR-3B QRMP (22nd), PMT-06 (25th), GSTR-4 annual (30 Jun), GSTR-9/9C (31 Dec), LUT renewal (31 Mar). |
| **MCA / ROC** | MSME-1 (30 Apr & 31 Oct), LLP Form 11 (30 May), PAS-6 (30 May & 29 Nov), DPT-3 (30 Jun), AGM & DIR-3 KYC (30 Sep), ADT-1 (14 Oct), AOC-4 and LLP Form 8 (30 Oct), MGT-7 (29 Nov). |

These appear **automatically on the Calendar** — no setup, no data entry. They are
computed from the built-in calendars for whichever month you are looking at, tinted
by law, and each law can be toggled off. `GET /api/statutory-calendar?from&to&law`
returns the same expansion as JSON.

## Recurring compliance (turning due dates into tasks)

The **Recurring** tab (inside **Tasks**) lets the firm define recurring statutory
obligations per client — e.g. *GSTR-3B, monthly, due 20th* or *Advance Tax, quarterly,
15 Jun/Sep/Dec/Mar*. You can also mark a task as recurring right from the New Task
form. A built-in library of common Indian obligations (GSTR-1/3B, CMP-08, TDS,
advance tax, PF/ESI, ITR, tax audit, ROC AOC-4/MGT-7, DIR-3 KYC) pre-fills the form.

One obligation can cover **one client, several clients, or every active client** —
pick the scope on the form and a separate schedule is created per client (searchable
multi-select by name / PAN / GSTIN), so each client's deadlines generate, assign and
complete on their own.

For a single client the obligation can also be pinned to **one of their firm /
trade names**, which is then carried onto every task it generates. And because
each GST registration files its returns separately, a **GST** obligation for a
client registered in more than one state offers *"set this up separately for
each of this client's N GSTINs"*: ticking it creates one obligation per
registration — each titled by its registration (*GSTR-3B · Karnataka branch*)
and each generating its own dated task carrying that GSTIN.

**Sync calendar** pulls a whole statutory calendar into the list — choose *Income
Tax*, *GST*, *MCA / ROC*, or all three. Syncing is keyed by source so re-running
updates revised dates in place and never duplicates; obligations you paused stay
paused.

### Tasks appear by themselves

An obligation's task is created **at the start of the month it falls due**, for
every client the obligation covers — nobody has to remember to press a button
for work the law already scheduled. A *GSTR-3B, monthly, due 20th* obligation
covering three clients produces three dated tasks on the 1st, and they show up
in the ordinary register like any other task. Create an obligation mid-month
and this month's task appears immediately.

The pass runs on the first task-list read of each month (a serverless
deployment has no resident scheduler), and again whenever an obligation is
created. It is **idempotent twice over** — existing occurrences are filtered
out, and a unique index on (schedule, period) means two servers generating at
once still cannot duplicate. `POST /api/schedules/generate {"mode":"month"}` does
the same thing on demand, for a daily scheduler.

**Generate tasks** still reaches further ahead — the next 3 / 6 / 12 months —
with correct due dates and period labels (e.g. "GSTR-3B — Jun 2026", "Advance
Tax — Q2 FY 2026-27", "Tax Audit — FY 2025-26"), for planning the season.

### A work programme on the obligation

Each obligation carries a **checklist that is copied onto every task it
generates**, unticked. Choosing a category offers that category's standard
steps; a GST obligation runs the full length of a return —

> Data / Documents received from client → GSTR-2B reconciled with purchase
> register → Sales register reconciled with books → Tax liability & ITC
> computed → Working shared with client for confirmation → Tax paid (challan
> saved) → Return prepared → Return filed & ARN saved → Filing entry recorded

— and the steps are editable, so a firm can write its own. Ticking them off on
the generated task drives its status as usual (none → Pending, some → In
Progress, all → Completed). Obligations synced from a statutory calendar pick
up their category's standard programme automatically.

**Where a generated task lands** follows one rule: *who set the obligation up.*

- A **recurring obligation the firm defined** — GSTR-1/3B, TDS returns (Form
  138/24Q, 140/26Q…), advance tax, book-keeping — is only a *setting* for work
  the firm does anyway, so its tasks appear in the ordinary **Tasks** tab
  alongside hand-raised work. Setting one up saves typing the same task out
  every month; it does not move the work somewhere else.
- A date **pulled in from a government calendar** by *Sync calendar* is the
  whole calendar for every client at once, so those land in the **Statutory**
  tab, where they can't swamp the working list.

The **Statutory tab only appears once a calendar has actually been synced** — a
firm that never syncs one simply has two tabs, *Tasks* and *Recurring*. Both
list tabs carry the same filters and service-type chips. The Calendar likewise
lists a statutory date once — as the statutory date — rather than twice
alongside its generated task. Managing obligations and generating tasks
requires the `manageSchedules` permission (Partner / Admin / Manager).

## Documents on the phone (viewer, share, WhatsApp)

Invoices, receipts and the receipt register **open inside Ledgify** rather than
being handed to the browser. Opening a PDF in a new tab is a dead end on a
phone — and worse in the installed app, where it launches an external browser
with no way back — so the document appears in the app's own viewer with:

- **Back** — returns to the page behind it. So does the phone's back gesture:
  the viewer pushes a history entry and unwinds it, rather than letting Back
  walk out of the app.
- **Share** — hands the actual PDF file to the device's share sheet
  (`navigator.share` with files), so it can go to WhatsApp, mail, Drive or
  anywhere else the phone offers. Shown only where the device supports it;
  **Download** is always there, so a document is never a dead end.
- **WhatsApp** — opens the send dialog with this document attached.
- **Zoom** — the document has its own zoom and scroll box, so magnifying an
  invoice does not drag the toolbar around with it.

Pages are drawn with **pdf.js onto a canvas** rather than embedded in an
`<iframe>`: phone browsers largely refuse to render a PDF inline (Android
Chrome hands it to a downloader; iOS Safari shows only the first page), which
is what sent people out of the app to begin with. The library is loaded only
when a document is opened, so it costs nothing on any other page. Its worker
is copied into `public/` at build time by `scripts/copy-pdf-worker.mjs`.

### Sending an invoice or receipt on WhatsApp

The WhatsApp button on an invoice row — or in the viewer — sends the client the
**document**, not just the details:

- **With WhatsApp Cloud API credentials** (Firm Settings), the PDF is uploaded
  to Meta and delivered as a document message from the firm's own number.
- **Without them**, WhatsApp cannot be handed a file from a web page, so the
  message carries a **secure share link** the client taps to open the PDF —
  and on a phone, *Share the PDF* puts the file itself into a chat through the
  OS share sheet. The button stays disabled until the link exists, so a message
  can never go out with nothing behind it.

Share links are signed with the app secret and carry `{document, id, expiry}`
— nothing is stored, they grant read of that one document, and they stop
working after 30 days. That is what lets a client, who has no Ledgify login,
open their own invoice: `GET /api/share/<token>`.

## Deadline reminders (email & WhatsApp)

The **Reminders** page sends nudges for open tasks that are **due within N days
or overdue**. Configure who is notified (the assigned staff member and/or the
client) and on which channels (email, WhatsApp), preview exactly what will go
out, and run it. Each recipient/channel is deduplicated per day, so running it
repeatedly never double-sends. Every send is written to a **delivery log**, and
every message is signed with the **firm's own name**, taken from the billing
organization.

### Sending on demand

Two things do not wait for the nightly run:

**DSC renewal reminders.** *Renewal reminders* on the DSC Register lists every
certificate that has **expired or expires within 30 days**, each with its
holder, client, expiry and the address it would be written at — the holder's
own email/phone, falling back to their client's. Holders with neither are shown
but cannot be selected. Pick the ones to write to, choose email and/or
WhatsApp, and send. Because it is a deliberate act it is **not** suppressed by
the day's automatic run, and every message still lands in the delivery log.

**A statutory due-date circular.** On the Reminders page, *Statutory due-date
circular* writes to **every client at once** with the dates falling in a
period — this month, next month or a custom range — under whichever of Income
Tax, GST and MCA/ROC you tick. The dates come from the built-in calendars, so
nobody types them out, and each client gets **one message covering all of
them** rather than one per date. Before sending you can read the exact message
a client will receive, see how many will be reached on each channel, and
deselect any client. Re-sending the same period is skipped (one circular per
client per period), while the next period's goes out normally. The circular
says plainly that not every date listed will apply to every client.

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

**Access levels** — most modules are readable by everyone and these gate the
write actions; **billing is the exception**, where seeing anything at all needs
a permission of its own. The table below shows the **built-in defaults**: from **Access Control** an
admin can change any of them per role, and add new roles (user categories)
with their own set of permissions. Only the Partner role is fixed — it is the
super-admin and always has full access, so the firm can never lock itself out.

| Action | Partner / Admin | Manager | Accountant | Article Assistant |
| --- | :-: | :-: | :-: | :-: |
| Manage clients | ✓ | ✓ | ✓ | — |
| Delete clients | ✓ | ✓ | — | — |
| Manage tasks | ✓ | ✓ | ✓ | ✓ |
| Delete tasks | ✓ | ✓ | ✓ | — |
| **See invoices, receipts & billing figures** | ✓ | — | — | — |
| Create, edit & delete invoices | ✓ | — | — | — |
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
`403`) and mirrored in the UI (buttons hidden / controls read-only). Billing goes
further than hiding: without `viewInvoices` the Invoices entry is absent from the
sidebar, `/invoices` says so plainly rather than showing an empty register, the
dashboard drops the receivables figure and the Billing tab — and the billing
numbers **never leave the server** in the first place, so they cannot be read out
of a network response either. A partner can grant it to any role from Access
Control. Partners and
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
