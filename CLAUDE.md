# Beecision - Project Notes

## 🔴 ROLLBACK STATE (2026-04-21)
This working copy was rolled back on 2026-04-21 to match a pre-vibes Railway deploy (deploy id `b30635bc-250d-46ef-bcf4-836b28183fa4`). `backend/` and `frontend/` were pulled from the running production container and now match live exactly. **Work from this state only.** Do not reintroduce vibes, SHORT/LONG/REACT, v157 conversation mode, v158 handoff ban, v160 grounding, or v161–v165 mention-budget logic unless explicitly asked. Those commits still exist in git history (pre-rollback tip was `f0a974a` v165) and in `beecision-backups/beecision-2026-04-21_v165-pre-rollback.zip`.

## ⚠️ Workflow Rule: Commit, Push, Back Up After Every Change
After every change, in this order:
1. `git add` + `git commit` the change
2. `git push origin master`
3. Run `powershell -ExecutionPolicy Bypass -File backup.ps1` from the repo root

`backup.ps1` writes a dated zip to `C:\Users\micha\beecision-backups\` and keeps only the 20 most recent. Never skip this — it's the user's disaster-recovery policy.

## What This Is
A multi-AI debate platform where users pose a question, a "hive" of AI bee personalities discusses it live, and a synthesized verdict is rendered at the end. Each hive is 5 themed bees. Finished debates can be published to a public **Decisions** feed with likes and yes/no polls.

**Live at**: https://beecision.com

## Tech Stack
- **Backend**: Python 3.11+, FastAPI, Uvicorn, WebSockets
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Database**: SQLite via aiosqlite (Postgres also supported via `DATABASE_URL`)
- **Auth**: JWT (HS256), bcrypt
- **API Key Encryption**: Fernet (AES-256)
- **Payments**: Stripe subscriptions
- **Deployment**: Docker on Railway

## Project Structure
```
beecision/
├── backend/
│   ├── main.py                 # FastAPI entry, static file routes, /decision/{id} OG-tag page
│   ├── config.py               # Env settings + AI_MODELS registry
│   ├── personalities.py        # 6 hives × 5 bees + 2 special bees
│   ├── admin.py                # /api/admin/* — gated to ADMIN_EMAIL
│   ├── auth/                   # JWT register/login, password reset
│   ├── debate/
│   │   ├── routes.py           # REST + /ws/debates/{id}
│   │   ├── orchestrator.py     # Round-based debate flow + verdict generation
│   │   └── schemas.py          # DebateConfig, request/response models
│   ├── decisions/              # Public decisions feed: list, like, yes/no poll
│   ├── memory/                 # Per-user memory: facts + debate summaries
│   ├── custom_hives/           # User-created hives + bee icon generation (Pro)
│   ├── billing/                # Stripe checkout, portal, webhook
│   ├── providers/              # openai, anthropic, google, deepseek, xai
│   └── database/               # aiosqlite models, init/migrations
├── frontend/
│   ├── app.html                # Main debate UI (big single-file with inline CSS)
│   ├── index.html              # Landing / login
│   ├── pricing.html, privacy.html, settings.html
│   ├── css/, images/bee-icons/ # 30+ themed bee PNGs (opaque RGB post-rollback)
│   └── js/
│       ├── app.js              # Hive selection, model selection, view routing
│       ├── chat.js             # WebSocket client, beeQueue sequential playback, verdict render
│       ├── auth.js             # Login/register
│       ├── settings.js         # API key mgmt (Pro-only for non-xAI/stability)
│       ├── bee-designer.js     # Canvas-based avatar customizer for custom bees
│       └── theme.js            # Dark/light mode
├── Dockerfile, railway.json, README.md
```

## Core Concepts

### Hives (6 themed groups of 5 bees each)
- **Chaos** — Maximum Disagreement (Optimist, Pessimist, Realist, Contrarian, Cynic)
- **Friend Group** — Group Chat Advice (Bestie, Honest, Funny, Wise, Practical)
- **Billionaire** — Ambition & Strategy (Builder, Investor, Strategist, Disruptor, Visionary)
- **Internet** — Chaotic Online Energy (Redditor, Influencer, Coder, Gamer, Troll)
- **Generations** — Generational Perspectives (Gen Z, Millennial, Gen X, Boomer, Future Kid)
- **Courtroom** — Mini Trial (Judge, Prosecutor, Defense, Witness, Jury)

Every bee has an `id`, role `name`, `human_name`, emoji, and long `role` prompt in `backend/personalities.py`.

### Special Bees (add-on, can join any hive)
- **Devil's Advocate** (Lucifer 😈) — challenges consensus
- **Wild Card** (Joker 🃏) — lateral/unexpected takes

Special bees always speak last. Configured via `selectedSpecialBees` in localStorage.

### Custom Hives (Pro)
Users create hives with custom bees, colors, and AI-generated icons (DALL·E or Stability AI). Free tier = 1 custom hive, Pro = unlimited. Lives in `backend/custom_hives/`.

### Debate Flow (round-based)
- Orchestrator runs fixed rounds via `_run_round(round_num)` in `backend/debate/orchestrator.py`.
- 3 rounds for new questions, 1 round for follow-ups.
- Each round, every selected bee produces a response in parallel; responses stream to the frontend and play back sequentially through `beeQueue` (one bubble at a time, typewriter effect).
- Users can intervene mid-debate (`add_intervention`) or reply to a specific bee (`add_targeted_reply`).
- Verdict generated after all rounds via `_generate_hive_verdict` — per-bee vote + overall hive decision with confidence %.

### Memory System
`backend/memory/` stores core identity facts per user (`user_name`, `profession`) and per-debate summaries. Memory is injected into the system prompt. Debate topics are NOT included (prevents cross-debate bleed).

### Decisions Feed
`backend/decisions/routes.py` — public feed at `/api/decisions` with newest/popular sorts, likes, yes/no polls. Shareable `/decision/{id}` URLs with OG meta tags injected server-side (`main.py:serve_decision`).

### Admin
`backend/admin.py` — gated by `ADMIN_EMAIL` (`michael24011@icloud.com`). Lists users, resets buzz counts, etc.

### Bee Designer
Frontend-only canvas avatar composer (`frontend/js/bee-designer.js`). Layers backgrounds + hats + glasses + face + shirts + items + effects on a base bee PNG; used for custom hive creation.

## AI Models (served by `/api/models`)

`backend/config.py:AI_MODELS` is the **authoritative registry**. Currently configured: **xAI** only. All 5 provider classes (OpenAI, Anthropic, Google, Deepseek, xAI) are registered in `ProviderRegistry` — code paths work but the live config is trimmed to xAI.

`XAI_API_KEY` is an **app-level env var**. Other providers (if re-enabled) are BYOK via Fernet-encrypted per-user storage. Free users see only xAI + stability in settings; Pro sees all.

### Historical Model IDs (if re-enabling providers)
Claude 3.x retired Jan 2026 — use Claude 4.x (`claude-opus-4-6`, `claude-sonnet-4-5-20250929`, `claude-opus-4-5-20251101`, `claude-haiku-4-5-20251001`). OpenAI: `gpt-5.2`, `gpt-5`, `gpt-5-mini`, `gpt-4o`. Google: `gemini-2.0-flash`, `gemini-1.5-pro`. Deepseek: `deepseek-chat` (V3.2), `deepseek-reasoner`. xAI: `grok-4-1-fast-non-reasoning`, `grok-4-fast-reasoning`, `grok-3-mini`.

## Environment Variables
- `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `JWT_EXPIRATION_MINUTES`
- `ENCRYPTION_KEY` (Fernet base64 key for BYOK provider storage)
- `DATABASE_PATH` (default `/app/data/beecision.db` on Railway)
- `DATABASE_URL` (Postgres connection string, optional)
- `HOST`, `PORT`, `APP_URL`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- `XAI_API_KEY` — app-level xAI key (not BYOK)

## Free Tier Limits (config.py)
- `GUEST_DEBATE_LIMIT = 5` (no account, tracked by IP)
- `FREE_DEBATE_LIMIT = 20` (logged in, no subscription)
- Pro ($5/mo): unlimited debates, unlimited custom hives, PDF export

## Data Persistence (Railway)
- SQLite at `/app/data/beecision.db` (volume mount via `railway.json`) — or Postgres if `DATABASE_URL` set
- Stores: users, encrypted API keys, debates, messages, custom hives/bees, public decisions, likes, poll votes, user memory, debate summaries
- Data persists across deploys — **volume mount must be attached** or updates wipe the DB

## Key API Endpoints
| | |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, password reset |
| Debates | `POST /api/debates`, `GET /api/debates`, `GET /api/debates/{id}`, `POST /api/debates/{id}/continue`, `POST /api/debates/{id}/stop`, `GET /api/debates/{id}/export` (PDF, Pro), `WS /ws/debates/{id}` |
| Hives | `GET /api/hives`, `GET /api/hives/{id}/personalities`, `GET /api/special-bees`, `GET /api/personalities` |
| Custom Hives | `/api/custom-hives/*` — CRUD + icon generation |
| Decisions | `GET /api/decisions`, `POST /api/decisions/{id}/like`, `POST /api/decisions/{id}/poll` |
| Memory | `GET /api/memory`, `DELETE /api/memory`, `DELETE /api/memory/{fact_id}` |
| Keys | `GET /api/keys`, `POST /api/keys/{provider}`, `DELETE /api/keys/{provider}` |
| Billing | `POST /api/billing/checkout`, `POST /api/billing/portal`, `GET /api/billing/status`, `POST /api/billing/webhook` |
| Admin | `/api/admin/*` (ADMIN_EMAIL only) |

## Important Design Notes
- **Special bees always speak last.** Orchestrator enforces this.
- **Mention matching uses first word** (`human_name.split()[0]`) so multi-word names like "Devil's Advocate" still match `@Devils`.
- **beeQueue is the frontend pacing mechanism** — bees stream in parallel but render sequentially with typewriter. Don't try to render them in parallel, the UI expects one at a time.
- **`backend/debate/vibes.py` does not exist** in this rolled-back state. If tooling or old code references it, that's a ghost from pre-rollback.

## See Also
- `VIBES_DEVLOG.md` — historical Vibes feature log (feature itself is REMOVED from this state, kept for reference if revisiting)
- `README.md` — public-facing overview
