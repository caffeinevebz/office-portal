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
| **Calendar** | A month view of every statutory due date across all clients, colour-coded by category. |
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

The database is a local SQLite file, so all data lives on your machine. Natural
extensions from here: user authentication & roles, real file uploads for
documents, PDF invoice generation, email/WhatsApp deadline reminders, and a
statutory-calendar template that auto-creates recurring compliance tasks.
