# Debate Vibes — Devlog

Comprehensive log of the Debate Vibes feature design and iteration (2026-04-14).

## The Vision

Replace the static round-based "5 bees take turns writing paragraphs" debate with
a vibe-driven, choreographed conversation that feels alive. Core ideas:

- **5 vibes** (Group Chat, Brawl, Courtroom, Boardroom, Panel Show) — any hive
  can be played in any vibe. Vibe = stage/setting. Personality = actor.
- **Group Chat** is the v1 hero and default; other vibes are prompt-only for now.
- Bees speak short, natural messages (1-20 words) — not essays.
- Tap a bubble to expand to longer reasoning.
- Verdict keeps its current mini-chat + vote bars, but now with a VS banner
  showing the two main sides.
- "Try Another Hive" becomes **Remix** — same question, different hive + vibe.
- Replay button on verdict re-runs the whole debate deterministically.

## The Group Chat Vibe — Final Shape

- **Turn-based conversation**, not rounds. 8-12 randomized turns per session.
- Each bee speaks up to 3 times; some may speak less. Selective participation.
- Single-column layout — all bubbles left-aligned (no side-a/side-b split).
  The VS banner at the top of the question still shows the conflict labels.
- **SIDE** — 1-3 word label for each bee's position (used for VS banner +
  max-3-per-side enforcement).
- **REPLY_TO** — optional field; shows a small quote above the bubble (iMessage
  quote-reply feel). Backend throttles it to ~20% of messages so it stays rare.
- **@-mentions** — rare, used only when a bee genuinely wants another bee to
  respond. Turn picker gives mentioned bees 50/50 priority. Mention-back is
  optional, not mandatory.
- **Read receipts** — bubbles land grey ("unread"), fade to honey after 1s.
- **@EVERYONE slam** on a bee's first entrance per session (Phoenix Wright style
  tilted banner + screen shake).
- **VS banner** hangs under the question bubble and scrolls with it (sticky).
- **Variable pacing** — typing pill 900-2300ms, inter-bubble gap 700-2300ms.
- **Emojis as reactions** — prompt encourages pure-emoji messages and emoji
  punctuation on ~1 in 3 messages.
- **User reply button** tucked under each bubble, fades in on hover.
- **Topic lock** — bees must use the user's exact options (no inventing
  "coconut water" when asked "Cola vs Pepsi").

## Architecture

### Backend

- `backend/debate/vibes.py` (new)
  - `VIBES` dict with 5 entries (Group Chat, Brawl, Courtroom, Boardroom, Panel Show).
  - `VIBE_OUTPUT_FORMAT` — the SIDE/REPLY_TO/SHORT/LONG format spec appended
    to every system prompt.
  - `parse_bee_response(text)` — returns `(side, short, long, reply_to)`.
  - `extract_short(content)` / `extract_short_and_long(content)` / `extract_reply_to(content)`
    — handle legacy plain-text vs JSON-stored content.
- `backend/debate/orchestrator.py`
  - `DebateOrchestrator.run()` — forks: if `self.vibe`, call `_run_vibed_conversation`,
    else fall back to the legacy round-based `_run_round` loop.
  - `_run_vibed_conversation()` — turn-based flow:
    - Resolves all bee display names + first names up front.
    - `_pick_next_speaker()` — prioritizes least-spoken bees, with 50/50 coin
      flip to boost mention-pending bees.
    - For each turn: broadcast `model_start` → `_get_bee_once()` (buffered
      silently, no chunk leaks) → validate side against `MAX_PER_SIDE=3`
      forbidden list → retry once with stronger prompt → force-assign fallback
      side as last resort → throttle reply_to (80% wipe) → `_commit_turn()`
      (save + broadcast `model_end`).
    - Checks `_check_for_intervention()` at each turn so user reply-to-bee
      messages can force a specific bee as the next speaker.
  - `_build_system_prompt()` — unified prompt for round 1 and subsequent turns.
    Contains the hard topic-lock, length rule (1-20 words), REPLY_TO rules,
    mention rules, emoji rules, forbidden patterns.
  - `_build_context()` (legacy) and `_build_vibed_context()` (vibed) — show
    recent 6 messages, highlight the most recent one, include side tally,
    include optional mention-back reminder.
  - `_generate_hive_verdict()` — unchanged structure, but the title prompt now
    generates casual lowercase friend-text headlines ("just get the pizza").
- `backend/debate/schemas.py`
  - `DebateConfig.vibe: Optional[str] = "group-chat"` — stored in config JSON.
- `backend/debate/routes.py`
  - `GET /api/vibes` — lists all vibes.
  - `/continue` endpoint uses `extract_short()` when rebuilding previous_context
    so JSON doesn't leak into the AI prompt.

### Frontend

- `frontend/app.html`
  - `#vibe-chip` in the textbar (next to `#hive-chip-bar`), always visible.
  - `#vibe-modal` — vibe picker modal.
  - `#remix-modal` — hive + vibe picker for re-running the same question.
  - CSS block for all vibe-related styling:
    - `.chat-messages[data-vibe="group-chat"]` scoped rules
    - `.gc-bubble-pop` / `.gc-typing-pill` / `.gc-dot-bounce` keyframes
    - `.vibe-slam-overlay` / `.vibe-slam-banner` + entrance keyframes + chat shake
    - `.vibe-sides-banner` (under question bubble, sticky with header)
    - `.gc-mention` — clickable-looking mention pills, per-bee color via inline style
    - `.gc-reply-quote` — iMessage-style quote above a bubble
    - `.bc-hook.bc-hook-bubble` — orange gradient verdict hook with VS banner
    - `.bc-vs-banner` / `.bc-vs-side` / `.bc-vs-x` — winner-highlighted VS pills
    - Read receipt states: `.unread` grey → `.read` honey
    - Reply button tucked under bubble, hidden until hover
- `frontend/js/app.js`
  - `fetchVibes()` — loads vibes from API on init.
  - `selectedVibeId` — localStorage `'selectedVibe'`, default `'group-chat'`.
  - `openVibeModal()` / `renderVibeOptions()` / `selectVibe()`.
  - `handleQuestionSubmit()` passes `vibe: selectedVibeId` in config.
- `frontend/js/chat.js`
  - `beeQueue` — enqueue/setResponse/finishBee now carry `side`, `short`,
    `long`, `replyTo`.
  - `_playAll()` — sets `data-vibe` on container, assigns sides via
    `assignBeeSides()`, interleaves via `interleaveBeesBySide()` (no 3+
    consecutive same-side), loops with variable pacing, fires slam for
    first-entries, applies read receipts.
  - `_playEntranceSlam()` — creates overlay, shakes chat, removes after 1.4s.
  - `addBeeTypingPill()` — renders typing dots pill.
  - `addAiDiscussionMessage()` — renders bubble, optional reply quote via
    `findBeeBubbleByName()`, stores short/long on dataset for tap-expand.
  - `toggleBeeExpand()` — swaps short ↔ long via innerHTML (preserves mention
    spans, unlike textContent).
  - `escapeHtmlWithMentions()` — escapes HTML then replaces `@Name` with
    `<span class="gc-mention">` styled with per-bee personality color via
    inline style.
  - `showSideLabels()` — attaches the VS banner as a child of the most recent
    visible `.question-header` so it scrolls with the sticky header.
  - `applyHistoricalSides()` — on load, classifies stored sides and re-renders
    side classes + VS banner.
  - `replayDebate()` — collects bubble data from DOM, clears chat, re-runs
    through `beeQueue._playAll`.
  - `openRemixModal()` / `submitRemix()` — remix flow.
  - `parseStoredBeeContent(content)` — handles legacy plain-text vs JSON
    content with optional reply_to.
  - `seenBeesThisSession` Set — tracks first-entries for the slam effect.
  - `finishAiDiscussion()` — uses `TreeWalker` to strip `**` markdown from
    text nodes without destroying child elements (the .gc-mention spans).
    Early-returns for vibed debates to skip the legacy clamp/show-more logic.
  - `handleWebSocketMessage()` — new `vibe_info` case sets `data-vibe` attr;
    `model_end` now includes `side`, `short`, `long`, `reply_to`.

## Deploy History

| Ver  | Date       | Change |
|------|------------|--------|
| v105 | 2026-04-12 | (pre-vibes) Fixed marquee restart bug on quick-templates hide/show. |
| v106 | 2026-04-14 | **Initial Debate Vibes**: 5 vibes, vibe chip in textbar, @EVERYONE slam, tap-to-expand, Replay, Remix (replaces Try Another Hive), single-column iMessage layout. |
| v107 | 2026-04-14 | Added SIDE field parsing, left/right side columns, VS banner (full-width sticky at top), read-receipt grey→honey transitions, slower pacing, casual verdict titles (lowercase, no tabloid). |
| v108 | 2026-04-14 | Sequential round 1 + prompt-only side cap (didn't actually enforce). Added @-mention prompts, emoji guidance, delayed side banner. |
| v109 | 2026-04-14 | **Hard max-3-per-side retry**: sequential round 1 now validates side before broadcasting, rejects + retries, last-resort force-assigns fallback side. Added VS banner inside verdict hook bubble. |
| v110 | 2026-04-14 | **Fixed mention-wipe bug** — `finishAiDiscussion` was setting `textContent = textContent.replace(...)` which flattened `.gc-mention` child spans. Fixed with TreeWalker text-node walk. VS banner attachment to question header attempted. |
| v111 | 2026-04-14 | **Colored per-bee mentions** via `getPersonalityColor` inline style. VS banner attachment robustified (remove-and-rebuild approach). |
| v112 | 2026-04-14 | Natural mentions (dropped "must mention" rule). Mention-back detection via regex. Frontend interleaver so no 3+ consecutive same-side bees. |
| v113 | 2026-04-14 | Hard 12-word SHORT cap, banned em-dashes/semicolons/ChatGPT openers, forbade opener @-mentions entirely, hidden reply button in vibed debates. |
| v114 | 2026-04-14 | Soft mention-back when mentioned (removed "MUST respond" language). |
| v115 | 2026-04-14 | **MAJOR**: Replaced rounds with turn-based `_run_vibed_conversation`. 15 turns, 3 speaks per bee, mention-priority picker. Each turn broadcasts its own model_start+end so frontend streams one bee at a time. |
| v116 | 2026-04-14 | Prompt flavor overhaul — length 1-20 words with variety rule, pro-mention framing, reaction-only messages explicit. |
| v117 | 2026-04-14 | Strict mention rule with ✅/❌ examples, forced emoji frequency, hard topic-lock ("stick to user's exact options, never invent new ones"). |
| v118 | 2026-04-14 | **Single stream + REPLY_TO**: removed left/right visual split (all bubbles left-aligned, VS banner retained). New REPLY_TO field = iMessage quote-reply. Mentions reframed as "pass the mic". 4-tuple `parse_bee_response`. User reply button restored + intervention handling in vibed flow. |
| v119 | 2026-04-14 | Softer mentions — turn picker 50/50 on mention-pending bees, "MUST respond" language removed from context block. |
| v120 | 2026-04-14 | Natural conversation flow: variable 8-12 turns per conversation, context shows last 6 messages only, explicit `👆 most recent message` highlight, variable frontend pacing. |
| v121 | 2026-04-14 | **Reply-chain killed**: backend throttles REPLY_TO to ~20% after parsing (`if reply_to and random() > 0.2: reply_to = ""`). Prompt updated to "REPLY_TO blank for most messages, maybe 1 in 10". Reply button CSS fixed — `.message.ai-individual` now `flex-direction: column` so the button flows below the bubble; hidden by default, fades in on message hover. |
| v122 | 2026-04-14 | **Life upgrade**: (1) **Tapback reactions** — new `REACT` field in vibe output format. `parse_bee_response` returns 5-tuple `(side, short, long, reply_to, reactions)`. Orchestrator validates target names against `bee_info`, caps 1 per turn, throttles to ~35%. Frontend `addReactionChip()` renders small emoji pills inside a `.gc-reaction-tray` inserted after `.message-content` on the target bubble. Per-reactor border color, pop-in scale animation, deduped. (2) **Named typing pill** — replaces the anonymous 3-dot pill with `[avatar] Name is typing [dots]` tinted in the bee's personality color. Avatar bobs via `gcAvatarBob`. (3) **Bee roster strip** — persistent row above the chat via new `.gc-roster-strip`. Built from `window.allPersonalities ∩ window.selectedPersonalities`. Three states: `idle` (breath + blink + desaturated), `typing` (ring pulses in personality color via CSS `color-mix()` + `--roster-accent` var, 1.12x scale, bobbing avatar), `spoken` (steady, half-accent border). `rosterMarkTyping` called before each turn, `rosterMarkSpoken` after bubble drops. History loader builds it with all bees pre-marked spoken. `beeQueue.reset()` rebuilds for new debates. |

## Design Decisions Worth Remembering

- **Buffer silently, broadcast parsed**: the backend no longer streams raw
  chunks for vibed debates. The SHORT:/LONG: labels were leaking to the UI
  via typewriter when we did. Now the full response is collected server-side,
  parsed, and broadcast as a single `model_end` with parsed fields.
- **Message schema**: no DB migration. JSON content (`{side, short, long,
  reply_to}`) stored in the existing `messages.content` text column. Old
  plain-text messages still work via the `extract_short*` helpers that fall
  back to raw text when the content isn't parseable JSON.
- **Round number for vibed**: all vibed turns are stored with `round=1`. The
  frontend's history loader sorts by round then created_at, which preserves
  the sequential order. Keeps things simple; no schema change needed.
- **Turn picker priority**: least-spoken first, then 50/50 boost for
  mention-pending. Avoids mechanical rotation while still rewarding mentions.
- **Max-3-per-side enforcement**: prompt nudges failed (Grok ignored them);
  retry-on-rejection with forbidden list works reliably. Last resort is
  force-assign a non-forbidden side if retry also fails.
- **Reply-chain trap**: every attempt to let Grok use REPLY_TO naturally
  resulted in reply-to-reply-to-reply chains. Backend throttle (80% wipe)
  was the only reliable fix. Prompt alone couldn't beat Grok's default
  "always fill the field" bias.
- **First-word name matching** for mentions (`current_name.split()[0]`) so
  multi-word names like "Devil's Advocate" → `@Devils` still match.
- **Frontend pacing is intentional**: slow pacing was explicitly requested
  and should not be "optimized" back to fast. The conversation is meant to
  feel more like a real chat than a rapid-fire text dump.

## Open / Future Work

- **Other 4 vibes** (Brawl, Courtroom, Boardroom, Panel Show): backend prompts
  exist and will change how bees TALK in those settings, but the frontend
  animation is still Group Chat choreography for all 5. Needs per-vibe shot
  lists + custom props (gavel, dust cloud, podium, panel table) before
  building. User has said they'll send real assets when we start.
- **Overlapping typing indicators**: the natural-flow spec asked for
  occasional overlap (2 bees typing at once, interruptions). Not built.
- **Reaction-only turns**: tiny emoji-only drops between full turns, cheap
  API calls, more conversational rhythm. Not built.
- **Silent skip turns**: picker occasionally returns "nobody speaks". Not
  built.
- **Beecisions feed previews**: stored debates should render a thumbnail or
  looped highlight. Currently just plays the full animation on load.
- **Verdict recap trailer**: a 2-3 second highlight of the most dramatic
  moments before the vote reveal. Not built.
- **Remix across other people's beecisions**: "play this debate in another
  vibe" on public decisions. Parked.

## Known Rough Edges

- If Grok ignores the SIDE format entirely, the max-3 retry can loop once.
  Fallback side assignment catches it.
- The VS banner sometimes shows labels that don't match what Grok ended up
  with (if it invented a third option that got force-corrected).
- Long conversations (~12 turns × ~3s each) mean ~36s of backend generation
  before the verdict. Combined with the generous frontend pacing, total
  user-facing time is ~45-60s per debate. Acceptable for "feels real" vibe
  but on the long side.
- Reply button hover state doesn't appear on mobile (no hover events).
  Users on mobile don't see the reply affordance unless they tap the bubble
  first (which triggers tap-to-expand instead). Not fixed.
