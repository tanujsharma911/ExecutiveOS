# ExecutiveOS

AI-powered executive coaching platform. A coach finds and qualifies prospects, prepares discovery calls with an AI-assisted **Discovery Call Book**, and sends a shareable intake form. New clients chat with an AI assistant about programs and payments, then pay with **PayPal**, either once or as an auto-renewing subscription. Once they're clients, they reflect weekly, and an evidence-grounded AI research assistant surfaces recurring patterns, contradictions, emotional trends and coaching questions — with the coach always in charge.

Built for the **“Build What's Next with PayPal and AI”** hackathon.

## Table of contents

- [Highlights](#highlights)
- [Quick start](#quick-start)
  - [Demo accounts](#demo-accounts)
  - [Demo mode and passwords](#demo-mode-and-passwords)
- [Configuration](#configuration)
  - [PayPal sandbox setup](#paypal-sandbox-setup)
  - [Email with Resend](#email-with-resend)
  - [Licence keys (Bryntum, AG Grid)](#licence-keys-bryntum-ag-grid)
- [The journey to demo](#the-journey-to-demo)
  - [1. Prospect to client](#1-prospect-to-client)
  - [2. Coaching with AI insights](#2-coaching-with-ai-insights)
  - [3. Renewals and failed payments](#3-renewals-and-failed-payments)
- [Features](#features)
  - [Prospects and discovery calls](#prospects-and-discovery-calls)
  - [Discovery Call Book](#discovery-call-book)
  - [Intake form and PayPal checkout](#intake-form-and-paypal-checkout)
  - [Intake chat assistant](#intake-chat-assistant)
  - [Auto-renewing programs (PayPal Subscriptions)](#auto-renewing-programs-paypal-subscriptions)
  - [Client accounts and sign-in](#client-accounts-and-sign-in)
  - [Coaching workspace](#coaching-workspace)
  - [Session Calendar (Bryntum)](#session-calendar-bryntum)
  - [Tables and exports (AG Grid)](#tables-and-exports-ag-grid)
  - [Charts (AG Charts)](#charts-ag-charts)
  - [Client experience](#client-experience)
- [Architecture](#architecture)
  - [Project layout](#project-layout)
  - [Tech stack](#tech-stack)
  - [Data model](#data-model)
  - [API overview](#api-overview)
- [AI layer (LangChain + LangGraph)](#ai-layer-langchain--langgraph)
- [PayPal integration in detail](#paypal-integration-in-detail)
- [Privacy and safety](#privacy-and-safety)
- [Logging](#logging)
- [Useful scripts](#useful-scripts)
- [Notes and limits](#notes-and-limits)
- [License](#license)

## Highlights

- **PayPal + AI together.** On the public intake form, an AI assistant explains each program and exactly how paying works: what you pay today, when it renews, what happens if a payment fails, and how to cancel. The prospect then pays with PayPal on the same page.
- **Real PayPal billing, not just a checkout button.** It uses one-time Orders v2 and auto-renewing Subscriptions. Failed renewals are retried up to 3 times, the coach and client are emailed after each failure, the client is paused after the last one, and the coach can reactivate them.
- **Prospect to client in one product.** Prospects, discovery calls with a fit check, a rich-text Discovery Call Book with an AI assistant, an intake form, payment, automatic account creation, then the coaching workspace.
- **Evidence-grounded coaching AI.** LangChain tools compute every insight from the client's own words; the LLM writes the narrative. Hypotheses are labelled, never presented as diagnoses.
- **Sponsor tools used for real.** AG Grid Enterprise (row grouping, Excel/CSV export, master/detail rows), AG Charts, and the Bryntum Calendar with drag-to-reschedule.

## Quick start

Requirements: Node 20+, Docker Desktop.

```bash
cp .env.example .env   # then fill in the keys you have (see Configuration)
npm run setup          # installs deps, starts Postgres in Docker, runs migrations, seeds demo data
npm run dev            # API on :7461, web on http://localhost:7462
```

Or step by step:

```bash
npm run install:all
npm run db:up                      # Postgres 16 in Docker
npm --prefix server run db:generate
npm run db:migrate                 # prisma migrate deploy
npm run db:seed                    # 1 coach, 3 CEO clients, 9 weeks of reflections, prospects, programs
npm run dev
```

After pulling new changes, run `npm run install:all`, `npm --prefix server run db:generate` and `npm run db:migrate` again.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Coach: Dr. Elena Vasquez | elena@executiveos.app | Coach@2026 |
| Client: Alex Morgan (SaaS CEO, delegation) | alex.morgan@lumenstack.io | Client@2026 |
| Client: Sarah Chen (e-commerce founder, scaling) | sarah.chen@verdantgoods.com | Client@2026 |
| Client: David Miller (tech services CEO, presence) | david.miller@brightpath-tech.com | Client@2026 |

- **Intake link** (no sign-in): `http://localhost:7462/intake/elena-vasquez-intake`.
- **Seeded prospects** cover each stage of the pipeline: Priya Nair (new), Marcus Webb (in discussion, with a Discovery Call Book and calls), Sofia Rossi (not a fit) and James Okafor (intake sent).
- **Dates move with you:** seed data is relative to the day you run the seed, so "last week" is always last week. Re-run `npm run db:seed` to reset.

### Demo mode and passwords

`SHOW_DEMO_ACCOUNTS` (on unless set to `false`) turns on demo mode:

- The sign-in page lists the coach and every **active** client as one-click demo accounts. Clients paused after failed renewals are hidden.
- Every client uses the shared password `Client@2026` (`SEED_CLIENT_PASSWORD`), including people who join through the intake form, and isn't forced to change it.
- `npm --prefix server run db:demo-passwords` resets every existing client to the demo password.

Set `SHOW_DEMO_ACCOUNTS=false` for real use. The demo list is then hidden, and new clients get a random password by email that they must change at first sign-in.

## Configuration

All configuration lives in the root `.env` (copy `.env.example`). The main groups:

| Group | Variables | Notes |
|---|---|---|
| Database | `POSTGRES_*`, `DATABASE_URL` | Docker Compose starts Postgres 16 |
| API | `PORT`, `JWT_SECRET`, `CORS_ORIGIN`, `APP_URL` | `APP_URL` is used for links in emails |
| Demo | `SHOW_DEMO_ACCOUNTS`, `SEED_COACH_PASSWORD`, `SEED_CLIENT_PASSWORD` | See [Demo mode](#demo-mode-and-passwords) |
| AI | `GOOGLE_API_KEY`, `GEMINI_MODEL`, `GROQ_API_KEY`, `GROQ_MODEL`, `DETERMINISTIC_FALLBACK` | See [AI layer](#ai-layer-langchain--langgraph) |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, `PAYPAL_WEBHOOK_ID`, `SUBSCRIPTION_SYNC_MINUTES` | See [PayPal sandbox setup](#paypal-sandbox-setup) |
| Email | `RESEND_API_KEY`, `EMAIL_FROM` | Without a key, emails are written to the server log |
| Licences | `VITE_BRYNTUM_LICENSE_KEY`, `VITE_AG_GRID_LICENSE_KEY` | Without keys, the libraries show trial watermarks |
| Web | `WEB_PORT`, `VITE_API_PROXY` | Vite proxies `/api` to the API |
| Logging | `LOG_LEVEL`, `LOG_FORMAT`, `LANGSMITH_*` | See [Logging](#logging) |

### PayPal sandbox setup

1. On [developer.paypal.com](https://developer.paypal.com), with **Sandbox** mode on, go to **Apps & Credentials → Create App** and choose **Merchant**. Pick the default sandbox business account; it receives the test payments.
2. Copy the **Client ID** and **Secret** into `.env` as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`, with `PAYPAL_ENV=sandbox`. Restart the API.
3. To pay, use a sandbox **Personal** account (Testing Tools → Sandbox Accounts) and choose **Log In** in the PayPal window. Card payments in the sandbox need a test card from PayPal's Credit Card Generator, with the country set to United States.
4. Optional: set `PAYPAL_WEBHOOK_ID` once the API has a public URL (hosted or tunnelled), pointing the webhook at `POST {API}/api/public/paypal/webhook`. Until then, the server checks PayPal every `SUBSCRIPTION_SYNC_MINUTES` (default 60) instead.

### Email with Resend

Set `RESEND_API_KEY` to send welcome emails, intake links, call invites, renewal notices and reschedule emails through [Resend](https://resend.com) (free tier). The default sender, `onboarding@resend.dev`, only delivers to your own Resend account address. Verify a domain and set `EMAIL_FROM` to email anyone. Without a key, every email is written to the server log instead.

### Licence keys (Bryntum, AG Grid)

- **Bryntum Calendar 8 (Enterprise):** `VITE_BRYNTUM_LICENSE_KEY`, registered before the calendar loads (`web/src/lib/bryntumLicense.ts`).
- **AG Grid Enterprise 36.2:** `VITE_AG_GRID_LICENSE_KEY` (`web/src/lib/agGridLicense.ts`). Row grouping, Excel export and expandable detail rows are Enterprise features.

Without keys, both still work but show a trial watermark. Keep every `@bryntum/*` package on the same version, and all three `ag-grid-*` packages on the same version.

## The journey to demo

### 1. Prospect to client

1. **Coach adds a prospect:** Prospects → *Add prospect*. Add links (website, articles) so the AI can research them.
2. **Prepares the call:** Discovery Call Book → pick the prospect → *Draft for <name>*. The AI reads their public pages and drafts the intro, info-gathering questions (pains, problems, highlights), transition and fit check. Edit it like a document, then *Save to <name>*.
3. **Books and records the call:** on the prospect page, *Book call* (online with a Zoom or Meet link, or in person; optional email invite). Afterwards, *Record call*: notes, tick any warning signs in the fit check, then choose an outcome.
   - **Not a fit:** the prospect is marked "Not a fit" and kept in the list.
   - **Undecided:** book another call.
   - **Good fit:** choose *Another discovery call* or *Send intake form*.
4. **Sends the intake form:** with an optional note that only the intake assistant sees. The link opens with the prospect's details pre-filled.
5. **Prospect chats and pays:** they ask the assistant "How does auto-renew work?", pick the recommended program, and pay with PayPal.
6. **Account is created automatically:** the client account is created exactly once, the coach is notified, sign-in details are emailed, and the prospect becomes **Client**. The chat transcript appears on their page.

### 2. Coaching with AI insights

1. **Coach creates a form:** Form Builder → *Create with AI* → "Create a weekly leadership reflection form for a CEO struggling with delegation." Edit, assign, publish.
2. **Client reflects:** sign in as Alex → *Weekly Review* (drafts autosave) → submit.
3. **AI finds a pattern:** the submission re-runs the analysis; the coach gets a notification, and Report Cards shows the pattern with dates, quotes, a hypothesis and a confidence level.
4. **Coach uses it in a session:** *Use in next session* adds the question to the session's AI brief; mark it Relevant, Not relevant, Discussed or Follow up.
5. **Commitments:** create them from the brief or the client page; the client updates their status and the coach is notified.

### 3. Renewals and failed payments

1. Executive Presence Intensive is seeded as an **auto-renewing** program ($2,500 every 16 weeks). Pay for it on the intake form.
2. Open the new client's page as the coach. The **Billing** card shows the renewal amount, last payment and next renewal.
3. Click **Simulate failed renewal** (sandbox only) three times. The coach and client are notified and emailed after each failure; after the third, the client becomes **inactive**. They can sign in and read, but can't submit anything, and see a "Your program is paused" banner.
4. Click **Reactivate**: PayPal resumes the subscription and the client is active again.

## Features

### Prospects and discovery calls

- AG Grid list with status counts (New, In discussion, Not a fit, Intake sent, Client), search, grouping by status, Excel/CSV export, and expandable rows showing each prospect's discovery calls.
- Prospect page with a stage tracker (Added → Discovery call → Good fit → Intake sent → Client), contact details and links, discovery calls, the Discovery Call Book, payments and "Questions they asked".
- **Calls:** online (with meeting link) or in person, optional email invite, notes, a fit check pre-filled from the book's "Fit check" section, and an outcome.
- *Mark not a fit* (with a private reason), *Reopen*, *Send intake form*, and delete.

### Discovery Call Book

- **One rich-text editor** (TipTap) with headings, bold, italic, underline, links, lists, quotes and checklists.
- **Template plus one copy per prospect:** a picker chooses **Template** (the coach's master book) or a prospect. A prospect without a book opens the template; *Save to <name>* stores that prospect's own copy and leaves the template unchanged. *Reset to template* deletes the copy.
- **AI assistant panel** (LangChain): quick actions (*Draft for <name>*, *Tailor to their industry*, *Add profit questions*, *Make it shorter*; with text selected, *Rewrite selection* and *Shorten selection*) or any typed request. Each suggestion shows a preview with **Replace the book**, **Insert at cursor**, **Replace selection** or **Discard**; nothing changes until the coach applies it.
- **Research:** *Draft for <name>* reads up to 3 public pages from the prospect's links (social networks are skipped) and lists the sources.
- **Export:** PDF (print), Word (.docx) and Markdown.

### Intake form and PayPal checkout

- One reusable link per coach (Settings or Prospects page; *rotate* creates a new one). The page shows the coach, their programs with a price, a details form, and the PayPal buttons.
- Each program has **one fixed price in USD** and a payment type: **one-time** or **auto-renew each term**. Programs priced at $0 stay off the form.
- Links sent to a prospect (`?p=<id>`) pre-fill their details.
- The email must not already have an account. The server sets the amount; PayPal amounts are compared in cents.
- After payment: a success screen, and the account is created right away. If PayPal is still collecting a subscription's first payment, the server finishes sign-up as soon as it's paid.

### Intake chat assistant

A floating **"Ask about programs & payment"** chat on the intake form, focused on payments.

- **Starter questions:** "Which program fits me?", "How does auto-renew work?", "What if a payment fails?", "Can I pay by card without a PayPal account?", "How do I cancel?".
- **Answers can include:**
  - a **payment schedule card** (today, the next charges with dates, and the first-12-months total);
  - a **program comparison**;
  - **Choose <program>**, which selects that program on the form;
  - **Go to payment**, which closes the chat and highlights the PayPal box.
- **Grounded:** prices, dates and payment rules come from the database and from how the PayPal integration actually works. The coach's refund policy and payment contact (Settings → Payment policies) and each program's "What's included" are quoted when asked. The demo policy is *no refunds*.
- **Transparent:** the chat says the coach can read the conversation. The coach sees topics, the full transcript and "Paid after chatting" on the prospect page, and is notified when the assistant couldn't answer something.
- **Safe:**
  - card-like numbers are blocked before they reach the AI or the database;
  - it can't change prices or give discounts;
  - it never sees the coach's call notes, only a short note the coach approves when sending the form;
  - limits of 30 messages per hour per visitor, 20 per conversation and 1,000 characters per message.

### Auto-renewing programs (PayPal Subscriptions)

- PayPal charges the program price on the intake form, then again at the end of each term (every `durationWeeks`, up to 52 weeks per PayPal's limit) until cancelled.
- **Failed renewal:** PayPal retries up to 3 times; the coach and client get in-app and email notices after each attempt ("attempt 1 of 3"), with a link to update the payment method in PayPal.
- **After the third failure:** PayPal suspends the subscription and the client becomes **inactive** (read-only, with a paused banner). They're hidden from the demo sign-in list.
- **Coach Billing card:** status, renewal amount, last and next payment, failed attempts, plus **Sync with PayPal**, **Reactivate**, **Cancel auto-renew** and, in sandbox only, **Simulate failed renewal**. My Clients has a Billing column.
- **Client Settings → Subscription:** renewal details and a link to manage the payment method in PayPal.

### Client accounts and sign-in

- **Created automatically** when payment completes: client profile, program, the coach's published reflection forms assigned, and the prospect linked and marked converted.
- **Welcome email** with sign-in details. In demo mode the password is `Client@2026`; otherwise it's a random temporary password that must be changed at first sign-in, on a forced *Choose your password* screen.
- **Resend sign-in email** (key icon on the client page) issues new sign-in details. If email fails, the password is shown to the coach.
- No coach sign-up page yet: coach accounts come from the seed data.

### Coaching workspace

- **Overview:** stats and the client activity table (reorderable columns).
- **My Clients:** table or cards, filters, grouping, export, expandable rows (open commitments and latest reflections), Billing column.
- **Client page tabs:** Overview (Report Card summary, trends chart with a Line/Area/Bar switch, coach notes, Billing card, profile with contact details and links), Reflections, Report Card (the full AI analysis: patterns, trends, contradictions, unresolved issues and suggested questions, with evidence), Commitments, Growth Journey and Session Calendar. Skeleton loading while data arrives; an animation shows where AI is still writing.
- **Coaching Programs:** price, payment type, "What's included", focus areas and enrolled clients.
- **Form Builder** with AI form generation; **Report Cards** (every client's report card, with the Report Card summary); **Commitments**; **Settings** (profile, password, intake link, payment policies, AI status).

### Session Calendar (Bryntum)

- Bryntum Calendar 8 with month, week, day and list views, colour-coded by status (scheduled, completed, cancelled), on the coach page, the client page tab and the client's own page.
- **Drag-to-reschedule (coach only):**
  - drag an upcoming scheduled session to a new time, or drag its edge to change the length;
  - a dialog confirms the old and new time, with *Email <client> the new time* ticked by default;
  - Cancel, or any error, snaps the session back;
  - completed, cancelled and past sessions stay locked.
- Times are shown in UTC throughout the app.

### Tables and exports (AG Grid)

The shared `DataGrid` component (`web/src/components/common/DataGrid.tsx`) adds three AG Grid Enterprise features on top of sorting and column reordering:

| Feature | My Clients | Prospects | Commitments |
|---|---|---|---|
| Row grouping (drag a header into the group bar) | Program, Billing, Engagement (shows average confidence, total open commitments) | Status | Client, Status, Priority |
| Expandable detail rows | Open commitments and latest reflections | Discovery calls | – |
| Export | Excel + CSV | Excel + CSV | Excel + CSV |

Exports keep the grouping and the labels shown on screen, and are named `executiveos-<table>-<date>`.

### Charts (AG Charts)

Emotional and confidence trends on the client page (Line, Area or Bar, remembered per browser) and the indicators over time on the client's Growth Journey.

### Client experience

- **Dashboard:** reflections due and a reflection streak.
- **Daily, weekly and monthly reflections** with autosaving drafts.
- **My Commitments:** update the status with a note.
- **My Growth Journey:** program banner with "Week X of N" and the program's focus areas.
- **Session Calendar** (read-only).
- **Settings:** contact details and links, password, and the subscription (for auto-renewing programs).

## Architecture

### Project layout

```
executiveos/
├─ docker-compose.yml          Postgres 16
├─ .env / .env.example         single source of configuration
├─ server/                     Node + Express 5 + Prisma 7 (adapter-pg)
│  ├─ prisma/                  schema.prisma · migrations/ (hand-written SQL) · seed.ts · seed-data.ts
│  ├─ scripts/                 ai-smoke · ai-fallback-check · demo-passwords
│  └─ src/
│     ├─ index.ts              app, auth routes, router mounting
│     ├─ auth.ts               JWT auth, roles, must-change-password and inactive-client gates
│     ├─ routes/               coach · client · forms · work (sessions, commitments)
│     │                        discovery (prospects, calls, Discovery Call Book, intake link, subscriptions)
│     │                        public (intake form, checkout, chat, PayPal webhook)
│     ├─ ai/                   LangChain / LangGraph: intelligence, brief, assist, discoveryBook, intakeAssistant
│     └─ lib/                  paypal · subscriptions · intake · email · logger · growth · periods
└─ web/                        React 19 + TypeScript + Vite + Tailwind v4
   └─ src/
      ├─ components/ui         shadcn-style primitives (Radix + cva)
      ├─ components/common     DataGrid (AG Grid) · AgLineChart (AG Charts) · AiGenerating · Page
      ├─ components/features   SessionCalendar (Bryntum) · Sessions · RichTextEditor · IntakeAssistant
      │                        Billing · Prospects · IntelligenceView · Commitments · Growth · FormRenderer
      ├─ pages/coach           Overview · Prospects · ProspectDetail · DiscoveryBook · Clients · ClientWorkspace
      │                        Programs · Forms · Intelligence · Commitments · Sessions
      ├─ pages/client          Dashboard · Reflections · Commitments · Growth · Sessions
      ├─ pages/                Login · Intake (public) · ChangePassword · Settings
      └─ store/ (Zustand) · lib/ (api, types, discovery, licence loaders)
```

### Tech stack

| Area | Choice |
|---|---|
| Web | React 19, TypeScript, Vite, Tailwind CSS v4, Radix (shadcn-style), Zustand, axios (cancellable requests) |
| Tables | AG Grid 36.2 Enterprise |
| Charts | AG Charts 14.2 |
| Calendar | Bryntum Calendar 8.0 (Enterprise) |
| Rich text | TipTap 3.32 |
| Payments | PayPal REST (Orders v2, Subscriptions, webhooks) and `@paypal/react-paypal-js` |
| API | Node, Express 5, Zod |
| Database | PostgreSQL 16, Prisma 7 (adapter-pg) |
| AI | LangChain + LangGraph; Gemini (primary) and Groq (fallback) |
| Email | Resend REST API |
| Documents | `docx` for Word export |

Tables, charts and calendars use only AG Grid, AG Charts and Bryntum.

### Data model

Main models (`server/prisma/schema.prisma`):

- **People:** `User` (coach or client; `intakeToken`, `refundPolicy`, `paymentContact`, `mustChangePassword`), `ClientProfile` (program, contact details, links, `active`).
- **Coaching:** `Program` (`priceCents`, `billingType`, `included`, PayPal plan ids), `Form`, `Question`, `FormAssignment`, `Submission`, `Commitment`, `CommitmentUpdate`, `Session`, `InsightFeedback`, `FormSuggestion`, `AiReport`, `Notification`.
- **Pipeline:** `Prospect` (status, `intakeNote`), `DiscoveryCall` (mode, link, notes, fit check, outcome), `DiscoveryBook` (TipTap JSON, `isTemplate`), `ProspectBook`.
- **Payments:** `IntakePayment` (PayPal order or subscription, status, linked chat), `Subscription` (status, failed payments, last and next billing), `IntakeChat` (assistant transcript).

### API overview

| Prefix | Who | Examples |
|---|---|---|
| `/api/auth`, `/api/demo-accounts`, `/api/notifications` | Everyone | Sign in, me, change password, demo list |
| `/api/coach` | Coach | Clients, client detail and recent rows, programs, analysis, intelligence |
| `/api/discovery` | Coach | Prospects, calls (create, record, invite), Discovery Call Book (`/book`, `/book/assist`, `/book/export`), intake link, send intake, payment policies, resend sign-in, subscription sync/reactivate/cancel/simulate |
| `/api/forms`, `/api/client` | Coach / client | Forms, reflections, profile, subscription |
| `/api/sessions`, `/api/commitments` | Coach / client | Sessions (incl. `/sessions/:id/reschedule`), commitments |
| `/api/public` | No sign-in | Intake page, orders and capture, subscriptions and activation, chat, PayPal webhook |

## AI layer (LangChain + LangGraph)

Every AI feature calls an LLM through LangChain: **Gemini first, Groq as fallback**. Set `GOOGLE_API_KEY` and/or `GROQ_API_KEY`; if only one is set, that provider is used alone.

| Feature | Where | How |
|---|---|---|
| Analysis tools | `ai/tools.ts` | LangChain `tool()`s over the client's own words: recurring patterns, trend shifts, contradictions, emotional trends, unresolved issues, commitments. Each returns facts, quotes with dates, a hypothesis, a question and a confidence level. |
| Intelligence briefing | `ai/intelligence.ts` | `createAgent()` calls the tools and writes the briefing; reports are cached in `AiReport` until the data changes. |
| Session brief | `ai/brief.ts` | LangGraph `StateGraph`: analyze → snapshot, explore, commitments, context → compose. |
| Form and session assists | `ai/assist.ts` | Structured output (`invokeStructured`). |
| Discovery Call Book | `ai/discoveryBook.ts` | Researches the prospect's public links, then drafts or edits the book with structured output (`reply`, `apply`, `html`); AI HTML is sanitized. |
| Intake chat assistant | `ai/intakeAssistant.ts` | One grounded structured-output call per message (`reply`, `topic`, `actions`, `suggestions`, `unanswered`). Programs, payment rules and coach policies are passed in, so prices can't be invented. |

`DETERMINISTIC_FALLBACK` decides what happens when no LLM answers:

- **`false`** (default): AI screens show *"AI is unavailable"* (HTTP 503); pages that only display insights keep working.
- **`true`:** a deterministic analyst (a LangChain `BaseChatModel`), templates and built-in answers respond instead. The intake chat always falls back to built-in payment answers.

`npm run ai:fallback-check` prints which provider served each call. LLM response times are highlighted in the logs.

## PayPal integration in detail

Code: `server/src/lib/paypal.ts`, `lib/subscriptions.ts`, `lib/intake.ts`, `routes/public.ts`; web: `pages/Intake.tsx`.

- **Auth:** OAuth client credentials with a cached token; sandbox or live from `PAYPAL_ENV`.
- **One-time:** the server creates an Orders v2 order (`intent: CAPTURE`, USD, no shipping), the browser approves it, the server captures it, checks the amount in cents, and creates the client. `PayPal-Request-Id` makes retries idempotent.
- **Auto-renew:** a PayPal product and plan are created per program on first use, and recreated when the price or term changes. The plan bills up front and then every term, with `payment_failure_threshold: 3` and `auto_bill_outstanding`. The server creates the subscription (`custom_id` = intake payment); after approval it waits for the first payment, checks the amount, then creates the client and the `Subscription` row.
- **Exactly once:** `completeIntakePayment` claims the payment in a transaction, so the browser, the webhook and the sync can't create two clients. A subscription that can't become a client (email already taken) is cancelled.
- **Staying in step:**
  - webhooks (`PAYMENT.CAPTURE.COMPLETED`, `BILLING.SUBSCRIPTION.*`, `PAYMENT.SALE.*`), verified with PayPal;
  - a periodic sync (`SUBSCRIPTION_SYNC_MINUTES`) for local development;
  - both feed `applySubscriptionState`, which records payments, failures, suspension and reactivation and sends the notices.
- **Amounts:** always compared as cents. Subscriptions return `"2500.0"`, while Orders return `"2500.00"`.

## Privacy and safety

- AI insights and alerts are coach-only and scoped to the coach's own clients. Coach observations, prep notes and call notes are never shown to clients or to the public intake assistant.
- The intake chat tells prospects the coach can read it, blocks card numbers, and has rate limits.
- Card and bank details only ever go to PayPal.
- Inactive clients can read but not write: the API returns 402 for changes until reactivated.
- Request bodies are never logged; prompt text is logged only at `LOG_LEVEL=debug`, truncated.

## Logging

Every API request and every LLM and tool call is logged to the server console.

```
09:58:46 INFO  [api]  POST /api/forms/ai/generate reqId=23250e86 status=200 ms=3202 user=coach:…
09:58:46 INFO  [llm]  LLM call started  reqId=23250e86 op=form.generate provider=google_genai model=gemini-2.5-flash
09:58:47 WARN  [ai]   Gemini failed, falling back to Groq reqId=23250e86 …
09:58:49 INFO  [tool] Tool call finished reqId=6358199d op=intelligence tool=detect_recurring_patterns ms=3
```

- `reqId` links a request to the LLM and tool calls it triggered (also returned as the `X-Request-Id` header).
- PayPal calls log the method, path, status, time and PayPal debug id.
- `LOG_LEVEL` = `debug` · `info` (default) · `warn` · `error`; `LOG_FORMAT` = `pretty` (default) or `json`.

## Useful scripts

| Command | What it does |
|---|---|
| `npm run setup` | Install, start Postgres, migrate and seed |
| `npm run dev` | API (tsx watch) and web (Vite) together |
| `npm run typecheck` | Type-check server and web |
| `npm run build` | Production build of the web app |
| `npm run db:seed` | Reset the demo data |
| `npm --prefix server run db:generate` | Regenerate the Prisma client after schema changes |
| `npm --prefix server run db:demo-passwords` | Set every client's password to the demo password |
| `npm --prefix server run db:reset` | Drop, migrate and re-seed the database |
| `npm run ai:smoke` | Print the AI analysis for every seeded client |
| `npm run ai:fallback-check` | Show which AI provider served each call |

## Notes and limits

- **One PayPal account:** all intake payments go to the merchant account in `.env`. Paying each coach into their own account would need PayPal's Platform (partner) setup.
- **Webhooks need a public URL.** Locally, renewals and failures arrive through the periodic sync, or *Sync with PayPal* on the client page.
- **Sandbox can't fail a renewal on demand,** so *Simulate failed renewal* (sandbox only) records one failure exactly as a real one would.
- **Resend's test sender** only reaches your own address; verify a domain for real clients.
- **No coach sign-up page yet.**
- **Migrations** are hand-written SQL in `server/prisma/migrations`.
- UI primitives follow shadcn/ui conventions (`components.json`); LangChain agent skills for coding agents live in `.claude/skills`.

## License

[MIT](LICENSE) © 2026 Tanuj Sharma
