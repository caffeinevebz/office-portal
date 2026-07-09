# Sharma & Associates — Office Portal

A web-based **office management portal for a Chartered Accountancy (CA) firm**.
It brings the firm's day-to-day operations — clients, statutory compliance,
billing, team and documents — into a single dashboard.

> Built with Next.js (App Router), TypeScript, Tailwind CSS, Prisma and SQLite.
> The sample data models an Indian CA practice (GST, income-tax, TDS, ROC/MCA,
> audit, etc.), but the app is generic enough for any professional-services firm.

---

## Features

| Module | What it does |
| --- | --- |
| **Dashboard** | KPIs (active clients, open tasks, overdue deadlines, receivables), a 6-month billing vs. collections chart, task-status breakdown, upcoming deadlines and a compliance-mix view. |
| **Clients** | Full client register (Individual / Proprietorship / Partnership / LLP / Pvt Ltd / HUF / Trust …) with PAN, GSTIN and contacts. Search, filter, create, edit, delete, and a per-client detail page showing their tasks, invoices and documents. |
| **Compliance & Tasks** | Track engagements by category (GST, Income Tax, TDS, ROC/MCA, Audit, Accounting, Registration). Priorities, due dates with overdue highlighting, assignee, and inline status changes. |
| **Invoices** | Raise professional-fee invoices with GST, track Draft → Sent → Paid → Overdue, and see billed / collected / outstanding totals. |
| **Team** | Manage partners, managers, accountants and article assistants, with their open-task load. |
| **Documents** | A register of statutory documents (PAN, GST, ITR, financials, agreements) linked to clients. |
| **DSC Register** | Digital Signature Certificates per client signatory: class, authority, serial, validity with expiry countdowns, and a physical-token custody in/out register stamped with the acting user. DSC expiries feed the reminders engine. |
| **Inward/Outward Register** | The office's physical-document register, digitized: every packet of originals received gets an auto-issued inward number (IN-2627-001…) with contents, deliverer, mode/courier docket and storage location; returns/dispatches get outward numbers, and a full movement trail shows who handled what. Long-held packets (90+ days) are flagged. |
| **Calendar** | A month view of every statutory due date across all clients, colour-coded by category. |
| **Recurring compliance** | A statutory calendar of recurring obligations (monthly GST, quarterly TDS/advance tax, annual ITR/ROC…) that auto-generates the upcoming deadline tasks — idempotently. |
| **Deadline reminders** | Email & WhatsApp nudges for tasks that are due soon or overdue, to the assignee and/or client, with a preview, a delivery log and configurable lead time. |
| **Login & roles** | Session-based sign-in with role-based access (Partner / Manager / Accountant / Article Assistant), enforced on both the API and the UI. |

## Tech stack

- **Next.js 16** (App Router, Route Handlers) + **React 19** + **TypeScript**
- **Tailwind CSS v4** for styling
- **Prisma 6** ORM with a **SQLite** database (zero external services)
- **Recharts** for dashboard charts, **lucide-react** icons, **Zod** for API validation
- Session auth with signed cookies + `scrypt` password hashing (no auth service)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Create the SQLite database and load sample data
npm run db:push
npm run db:seed

# 3. Run the app
npm run dev
```

Then open <http://localhost:3000> — you'll be taken to the sign-in screen.

## Recurring compliance (statutory calendar)

The **Recurring** page lets the firm define recurring statutory obligations
per client — e.g. *GSTR-3B, monthly, due 20th* or *Advance Tax, quarterly,
15 Jun/Sep/Dec/Mar*. A built-in library of common Indian obligations (GSTR-1/3B,
CMP-08, TDS, advance tax, PF/ESI, ITR, tax audit, ROC AOC-4/MGT-7, DIR-3 KYC)
pre-fills the form.

Clicking **Generate tasks** creates the actual deadline tasks for the next
3 / 6 / 12 months, with correct due dates and period labels (e.g. "GSTR-3B —
Jun 2026", "Advance Tax — Q2 FY 2026-27", "Tax Audit — FY 2025-26"). Generation
is **idempotent**: each occurrence is keyed by schedule + period, so re-running
never creates duplicates. Generated tasks show a ↻ marker on the Compliance page
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
| Email | `RESEND_API_KEY` (+ optional `REMINDER_FROM_EMAIL`) | Simulated |
| WhatsApp | `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` (Meta Cloud API) | Simulated |

In **simulation mode** (the default, and what runs without credentials) messages
are fully rendered and logged but not actually delivered — nothing leaves the
server. To automate reminders, point a daily scheduler (cron) at
`POST /api/reminders/run`; it is safe to call repeatedly. Configuring and
running reminders requires the `manageReminders` permission (Partner / Admin /
Manager).

Reminder runs also cover **DSC expiries**: certificate holders (falling back to
the client's contact details) are nudged when their DSC expires within a
configurable window (default 30 days) or has already lapsed.

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

**Access levels** — everyone can *view* everything; these gate the write actions:

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
| Manage the team & roles | ✓ | — | — | — |

Permissions are enforced server-side on every API route (a denied action returns
`403`) and mirrored in the UI (buttons hidden / controls read-only). Partners and
Admins can set or reset a member's login password from the **Team** page.

> **Production note:** set a strong `AUTH_SECRET` in the environment (the
> committed `.env` ships with a development value). The session cookie is signed
> with it.

### Useful scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run db:push` | Sync the Prisma schema to the SQLite DB |
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

The database is a local SQLite file, so all data lives on your machine.
Authentication & roles, a statutory calendar of recurring obligations, and
email/WhatsApp deadline reminders are already built. Natural extensions from
here: real file uploads for documents, PDF invoice generation, an audit log of
who changed what, and self-service password changes.
