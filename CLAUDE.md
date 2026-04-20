# Beecision - Project Notes

## What This Is
A multi-AI debate platform where users pose a question, a "hive" of AI bee personalities discusses it live, and a synthesized verdict is rendered at the end. Each hive is 5 themed bees; conversations are choreographed by a **vibe** (the stage/setting — e.g. Group Chat, Courtroom, Boardroom) that shapes how they speak. Finished debates can be published to a public **Decisions** feed with likes and yes/no polls.

**Live at**: https://beecision.com

## Tech Stack
- **Backend**: Python 3.11+, FastAPI, Uvicorn, WebSockets
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Database**: SQLite via aiosqlite
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
│   │   ├── orchestrator.py     # Vibed turn-based flow + legacy round-based fallback + verdict generation
│   │   ├── vibes.py            # VIBES dict, VIBE_OUTPUT_FORMAT prompt, parse_bee_response, extract_short/long/reply_to/reactions
│   │   └── schemas.py          # DebateConfig (includes `vibe` field), request/response models
│   ├── decisions/              # Public decisions feed: list, like, yes/no poll
│   ├── memory/                 # Per-user memory: facts (name/profession) + debate summaries
│   ├── custom_hives/           # User-created hives + DALL·E / Stability bee icon generation (Pro)
│   ├── billing/                # Stripe checkout, portal, webhook
│   ├── providers/              # openai, anthropic, google, deepseek, xai (all registered in ProviderRegistry)
│   └── database/               # aiosqlite models, init/migrations
├── frontend/
│   ├── app.html                # Main debate UI (big single-file with inline CSS)
│   ├── index.html              # Landing / login
│   ├── pricing.html, privacy.html, settings.html
│   ├── css/, images/bee-icons/ # 30+ themed bee PNGs
│   └── js/
│       ├── app.js              # Hive/vibe selection, model selection, view routing
│       ├── chat.js             # WebSocket client, beeQueue, Group Chat choreography, verdict render
│       ├── auth.js             # Login/register
│       ├── settings.js         # API key mgmt (Pro-only for non-xAI/stability)
│       ├── bee-designer.js     # Canvas-based avatar customizer for custom bees
│       └── theme.js            # Dark/light mode
├── Dockerfile, railway.json, README.md, VIBES_DEVLOG.md
```

## Core Concepts

### Hives (6 themed groups of 5 bees each)
- **Chaos** — Maximum Disagreement (Optimist, Pessimist, Realist, Contrarian, Cynic)
- **Friend Group** — Group Chat Advice (Bestie, Honest, Funny, Wise, Practical)
- **Billionaire** — Ambition & Strategy (Builder, Investor, Strategist, Disruptor, Visionary)
- **Internet** — Chaotic Online Energy (Redditor, Influencer, Coder, Gamer, Troll)
- **Generations** — Generational Perspectives (Gen Z, Millennial, Gen X, Boomer, Future Kid)
- **Courtroom** — Mini Trial (Judge, Prosecutor, Defense, Witness, Jury)

Every bee has an `id`, a role `name`, a `human_name`, an emoji, and a long `role` prompt. All live in `backend/personalities.py`.

### Special Bees (add-on, can join any hive)
- **Devil's Advocate** (Lucifer 😈) — challenges consensus
- **Wild Card** (Joker 🃏) — lateral/unexpected takes

Special bees always speak last in a debate. Configured via `selectedSpecialBees` in localStorage.

### Custom Hives (Pro)
Users can create their own hives with custom bees, colors, and AI-generated icons (DALL·E or Stability AI). Free tier gets 1 custom hive, Pro gets unlimited. Lives in `backend/custom_hives/`.

### Vibes (5 settings that shape how bees talk)
Defined in `backend/debate/vibes.py`:
- **Group Chat** 💬 (default, the v1 hero) — iMessage banter, short quips, emojis, @-mentions, tapback REACTions
- **Brawl** 🥊 — aggressive shouting match
- **Courtroom** ⚖️ — formal legal proceedings
- **Boardroom** 💼 — high-stakes executive meeting
- **Panel Show** 🎤 — performative panel/game-show energy

All 5 vibes use the same Group Chat **frontend choreography** (single column, VS banner, typing pill, tap-to-expand, read receipts). The per-vibe stage/assets (gavel, dust cloud, podium) are not built yet — only the prompts differ between non-GC vibes today.

### Vibed Conversation Flow (the hot path)
- Turn-based, not round-based. 8–12 randomized turns per debate.
- Each bee speaks up to 3 times; participation is selective.
- Orchestrator picks the next speaker by **least-spoken first**, with a 50/50 boost for bees that were @-mentioned last turn.
- Each bee produces a structured response parsed server-side:
  - `SIDE` (1-3 word position label, validated against MAX_PER_SIDE=3)
  - `SHORT` (1–20 words, the visible bubble)
  - `LONG` (3–5 sentences, shown on tap)
  - `REPLY_TO` (optional quote-reply — backend throttles to ~20%)
  - `REACT` (tapback emoji on a prior bee/user — throttled to ~35%)
- Backend **buffers silently** and broadcasts a single parsed `model_end` — raw chunks are NOT streamed for vibed debates (prevents `SHORT:` labels leaking into the UI).
- Users can intervene mid-debate; interventions can force the next speaker.
- Verdict prompt generates casual lowercase titles ("just get the pizza") + side vote breakdown.

Content is stored as JSON `{side, short, long, reply_to, reactions}` in the existing `messages.content` column — no DB migration. Legacy plain-text messages still load via `extract_short*` helpers.

### Memory System
`backend/memory/` stores core identity facts per user (currently only `user_name` and `profession`) and per-debate summaries. Memory is injected into the system prompt for personalized debates. Debate topics are NOT included in the context to prevent cross-debate bleed.

### Decisions Feed
`backend/decisions/routes.py` — public feed at `/api/decisions` with newest/popular sorts, likes, and yes/no polls. Individual decisions have shareable URLs `/decision/{id}` with OG meta tags injected server-side (see `main.py:serve_decision`).

### Admin
`backend/admin.py` — gated by `ADMIN_EMAIL` constant (currently `michael24011@icloud.com`). Lists users, resets buzz counts, etc.

### Bee Designer
Frontend-only canvas-based avatar composer (`frontend/js/bee-designer.js`). Layers backgrounds + hats + glasses + face + shirts + items + effects on top of a base bee PNG; used for custom hive creation.

## AI Models (served by `/api/models`)

`backend/config.py:AI_MODELS` is the **authoritative registry** for what's exposed to users. Currently configured:
- **xAI** — `grok-4-fast-reasoning` (Grok 4)

All 5 provider classes (OpenAI, Anthropic, Google, Deepseek, xAI) are registered in `ProviderRegistry` and the code paths still work — but the live config has been trimmed to xAI. The README still lists all 5 providers for marketing; the **code is source of truth**. If adding models, edit `AI_MODELS` in `config.py`.

`XAI_API_KEY` is an **app-level env var** — xAI uses the platform key, not BYOK. Other providers (if re-enabled) are BYOK via Fernet-encrypted per-user storage. Free users only see xAI + stability in settings; Pro users see all providers.

### Historical Model IDs (for reference if re-enabling providers)
Claude 3.x was RETIRED Jan 2026 — use Claude 4.x (`claude-opus-4-6`, `claude-sonnet-4-5-20250929`, `claude-opus-4-5-20251101`, `claude-haiku-4-5-20251001`). OpenAI current: `gpt-5.2`, `gpt-5`, `gpt-5-mini`, `gpt-4o`. Google: `gemini-2.0-flash`, `gemini-1.5-pro`. Deepseek: `deepseek-chat` (V3.2), `deepseek-reasoner`. xAI: `grok-4-1-fast-non-reasoning`, `grok-4-fast-reasoning`, `grok-3-mini`.

## Environment Variables
- `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `JWT_EXPIRATION_MINUTES`
- `ENCRYPTION_KEY` (Fernet base64 key for BYOK provider storage)
- `DATABASE_PATH` (default `/app/data/beecision.db` on Railway)
- `DATABASE_URL` (Postgres connection string, if migrating off SQLite)
- `HOST`, `PORT`, `APP_URL`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (password reset emails)
- `XAI_API_KEY` — app-level xAI key (the one provider that's NOT BYOK)

## Free Tier Limits (config.py)
- `GUEST_DEBATE_LIMIT = 5` (no account, tracked by IP)
- `FREE_DEBATE_LIMIT = 20` (logged in, no subscription)
- Pro ($5/mo): unlimited debates, unlimited custom hives, PDF export

## Data Persistence (Railway)
- SQLite database at `/app/data/beecision.db` (volume mount via `railway.json`)
- Stores: users, encrypted API keys, debates, messages, custom hives/bees, public decisions, likes, poll votes, user memory, debate summaries
- Data persists across deploys — **volume mount must be attached** or updates wipe the DB

## Key API Endpoints
| | |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, password reset |
| Debates | `POST /api/debates`, `GET /api/debates`, `GET /api/debates/{id}`, `POST /api/debates/{id}/continue`, `POST /api/debates/{id}/stop`, `GET /api/debates/{id}/export` (PDF, Pro), `WS /ws/debates/{id}` |
| Hives | `GET /api/hives`, `GET /api/hives/{id}/personalities`, `GET /api/special-bees`, `GET /api/personalities` |
| Vibes | `GET /api/vibes` |
| Custom Hives | `/api/custom-hives/*` — CRUD + icon generation |
| Decisions | `GET /api/decisions`, `POST /api/decisions/{id}/like`, `POST /api/decisions/{id}/poll` |
| Memory | `GET /api/memory`, `DELETE /api/memory`, `DELETE /api/memory/{fact_id}` |
| Keys | `GET /api/keys`, `POST /api/keys/{provider}`, `DELETE /api/keys/{provider}` |
| Billing | `POST /api/billing/checkout`, `POST /api/billing/portal`, `GET /api/billing/status`, `POST /api/billing/webhook` |
| Admin | `/api/admin/*` (ADMIN_EMAIL only) |

## Important Design Notes (don't re-learn these)
- **Slow vibed pacing is intentional.** Typing pill 900–2300ms, inter-bubble 700–2300ms — do not "optimize" this faster. User explicitly wants chat-feel, not rapid-fire.
- **Backend buffers then broadcasts parsed.** Never stream raw chunks in a vibed debate. `SHORT:`/`LONG:` labels will leak into the UI if you do.
- **REPLY_TO is throttled in the backend, not the prompt.** Grok always fills the field; the 80% wipe is what keeps reply-chains from forming.
- **Max-3-per-side is enforced via retry + forbidden list**, not prompt nudges (Grok ignored those). Last resort is force-assign a non-forbidden side.
- **Vibed turns all use `round=1`.** Frontend sorts by round then `created_at`. No schema migration needed for vibes.
- **Mention matching uses first word** (`human_name.split()[0]`) so multi-word names like "Devil's Advocate" still match `@Devils`.
- **TreeWalker for markdown strip** — don't use `textContent = textContent.replace(...)` in `finishAiDiscussion`, it flattens `.gc-mention` child spans. Use a TreeWalker to walk text nodes only.
- **Special bees always last.** Orchestrator enforces this.

## Open Work / Known Rough Edges
- Other 4 vibes (Brawl, Courtroom, Boardroom, Panel Show) share Group Chat's choreography — per-vibe stages/props not built.
- Reply button only appears on hover; mobile users get no affordance (tap-to-expand fires instead).
- ~12 turns × ~3s each + pacing → 45–60s per debate. Acceptable but long.
- Decisions feed previews play the full animation on load; no thumbnail/highlight system.
- Long-term: verdict recap trailer, overlapping typing indicators, silent skip turns, reaction-only turns — all in `VIBES_DEVLOG.md` as parked.

## See Also
- `VIBES_DEVLOG.md` — exhaustive Vibes feature history and decision log (2026-04-14 v105→v122)
- `README.md` — public-facing overview
