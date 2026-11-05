# ExecutiveOS

AI-powered executive coaching platform (interactive prototype). Coaches design reflection forms, clients reflect, and an evidence-grounded AI research assistant surfaces recurring patterns, contradictions, emotional trends and coaching questions — with the coach always in charge.

> Payments are intentionally **not** part of this phase (PayPal comes later).

## Quick start

Requirements: Node 20+, Docker Desktop.

```bash
npm run setup     # installs deps, starts Postgres in Docker, runs migrations, seeds demo data
npm run dev       # API on :7461, web on http://localhost:7462
```

Or step by step:

```bash
npm run install:all
npm run db:up        # docker compose up -d --wait  (Postgres 16 on localhost:5433)
npm run db:migrate   # prisma migrate deploy
npm run db:seed      # 1 coach, 3 CEO clients, 9 weeks of reflections
npm run dev
```

Configuration lives in the root `.env` (copy from `.env.example`).

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Coach | elena@executiveos.app | Coach@2026 |
| Client — Alex Morgan (SaaS CEO, delegation) | alex.morgan@lumenstack.io | Client@2026 |
| Client — Sarah Chen (e-commerce founder, scaling) | sarah.chen@verdantgoods.com | Client@2026 |
| Client — David Miller (tech services CEO, presence) | david.miller@brightpath-tech.com | Client@2026 |

The login page also lists these as one-click demo accounts (`SHOW_DEMO_ACCOUNTS=false` hides them). Seed data is relative to the day you run the seed, so “last week” is always last week; re-run `npm run db:seed` to reset.

## The end-to-end workflow to demo

1. **Coach creates a form** — Form Builder → *Create with AI* → “Create a weekly leadership reflection form for a CEO struggling with delegation and team ownership.” Edit, reorder, set required, assign to Alex, preview, publish.
2. **Client submits a weekly reflection** — sign in as Alex → *Weekly Leadership Reflection* (draft autosaves) → submit → completion screen with the reflection streak.
3. **AI identifies a recurring pattern** — the submission re-runs the analysis agent; new evidence on an existing pattern is detected.
4. **Coach receives an insight** — bell notification (“New evidence: Delegation pattern — Alex Morgan”) → AI Intelligence shows the pattern with dates, mention counts, quotes, hypothesis and confidence.
5. **Coach uses a suggested question in a session** — *Use in next session* adds it to the upcoming session's AI Coaching Brief, where it can be marked Relevant / Not relevant / Discussed / Follow up later.
6. **Coach creates a commitment** — from the brief, the client workspace, or AI suggestions after recording the session outcome.
7. **Client tracks progress** — My Commitments → update status with an explanation; the coach is notified and repeated-incomplete patterns update.

## Architecture

```
executiveos/
├─ docker-compose.yml        Postgres 16
├─ .env / .env.example       single source of configuration
├─ server/                   Node + Express 5 + Prisma 7 (adapter-pg)
│  ├─ prisma/schema.prisma   data model · migrations/ · seed.ts · seed-data.ts
│  └─ src/
│     ├─ routes/             coach · forms · client · work (commitments, sessions)
│     ├─ ai/                 LangChain / LangGraph intelligence layer
│     └─ lib/                periods, form templates, growth & gamification
└─ web/                      React 19 + TypeScript + Vite + Tailwind v4
   └─ src/
      ├─ components/ui       shadcn-style primitives (Radix + cva)
      ├─ components/features IntelligenceView, Commitments, Sessions, Growth, FormRenderer…
      ├─ pages/coach · pages/client
      └─ store/ (Zustand) · lib/ (api, types)
```

Tables use **AG Grid** (clients, activity, commitments); charts use **AG Charts**; icons are **Lucide**. Use only AG Grid, AG Charts or Bryntum for tables and charts.

### AI layer (LangChain + LangGraph)

- **Analysis tools** (`server/src/ai/tools.ts`) — LangChain `tool()`s over the client's own words:
  `get_reflection_overview`, `detect_recurring_patterns`, `detect_trend_shifts` (emerging/fading),
  `detect_contradictions`, `analyze_emotional_trends`, `find_unresolved_issues`, `analyze_commitments`.
  Each returns facts, verbatim evidence with timestamps, a hedged hypothesis, a suggested question and a confidence level.
- **Intelligence agent** (`ai/intelligence.ts`) — `createAgent()` from `langchain` calls the tools and writes the briefing. The UI shows the tool-call trace.
- **Session brief** (`ai/brief.ts`) — a LangGraph `StateGraph`: `analyze → [snapshot, explore, commitments, context] → compose`.
- **Assists** (`ai/assist.ts`) — AI form generation, adaptive form suggestions, post-session suggestions (structured output in LLM mode).

**Analysis always uses an LLM first — Gemini primary, Groq fallback.** Set `GOOGLE_API_KEY` and/or `GROQ_API_KEY` (model IDs via `GEMINI_MODEL` and `GROQ_MODEL`).

`DETERMINISTIC_FALLBACK` controls what happens when no LLM can answer:

- `false` (default) — never use the deterministic analyst. The Intelligence screen, session brief, AI form creation and session suggestions show *“AI is unavailable”* (HTTP 503). Pages that only *use* insights keep working with their raw data: dashboard alerts show an “AI unavailable” note, the growth journey skips AI timeline items, and reflections still save.
- `true` — if Gemini and Groq both fail, or no key is set, `DeterministicAnalystModel` (a LangChain `BaseChatModel` that plans tool calls deterministically) answers instead.

| Call | Primary | Fallback |
|---|---|---|
| Intelligence agent (`createAgent`) | `ChatGoogleGenerativeAI` | `ChatGroq` via LangChain `modelFallbackMiddleware` |
| Form generation, session assist (structured output) | Gemini | Groq (`invokeStructured` in `ai/model.ts`) |
| If both providers fail | — | deterministic analyst / generator **only if** `DETERMINISTIC_FALLBACK=true`; otherwise “AI is unavailable” |

Only one key set? That provider is used alone. `npm run ai:fallback-check` prints which provider served each call. Insights stay grounded in tool output either way; hypotheses are labelled as such and never presented as diagnoses.

### Privacy model

- AI alerts and insights are coach-only and scoped to the coach's own clients.
- Coach observations and prep notes are never returned to clients.
- Clients see their own reflections, commitments, sessions (summary/decisions/follow-ups) and growth journey.

## Logging

Every API request and every LLM / tool call is logged to the server console.

```
09:58:46 INFO  [api]  POST /api/forms/ai/generate reqId=23250e86 status=200 ms=3202 user=coach:…
09:58:46 INFO  [llm]  LLM call started  reqId=23250e86 op=form.generate provider=google_genai model=gemini-2.5-flash
09:58:47 WARN  [ai]   Gemini failed, falling back to Groq reqId=23250e86 …
09:58:49 INFO  [tool] Tool call finished reqId=6358199d op=intelligence tool=detect_recurring_patterns ms=3
```

- `reqId` links an API request to the LLM and tool calls it triggered (also returned as the `X-Request-Id` response header).
- LLM lines include provider, model, duration, token counts and the tools the model chose; failures and Gemini → Groq fallbacks are logged as warnings.
- Request bodies are never logged. Prompt and response text is logged only at `LOG_LEVEL=debug`, truncated, because it contains client reflections.
- `LOG_LEVEL` = `debug` · `info` (default) · `warn` · `error`; `LOG_FORMAT` = `pretty` (default) or `json` for log aggregators.

## Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (tsx watch) + web (Vite) together |
| `npm run typecheck` | Type-check server and web |
| `npm run build` | Production build of the web app |
| `npm run ai:smoke` | Prints the AI analysis for every seeded client |
| `npm run ai:fallback-check` | Shows which AI provider (Gemini / Groq / deterministic) served each call |
| `npm --prefix server run db:reset` | Drop, migrate and re-seed the database |

## Notes

- UI primitives follow shadcn/ui conventions (`components.json`, Radix + `class-variance-authority`); add more with `npx shadcn@latest add <component>`.
- LangChain agent skills for coding agents are installed in `.claude/skills` (see `skills-lock.json`).
