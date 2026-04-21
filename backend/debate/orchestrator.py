"""Debate orchestrator - manages the flow of debates."""
import asyncio
import json
import re
from typing import AsyncGenerator, Callable, Optional
from backend.providers import ProviderRegistry
from backend.database import get_db
from backend.personalities import get_personality, is_special_bee, PERSONALITIES, get_personality_async
from backend.debate.vibes import (
    get_vibe,
    DEFAULT_VIBE,
    VIBE_OUTPUT_FORMAT,
    parse_bee_response,
    extract_short,
)


class DebateOrchestrator:
    """Orchestrates the debate flow between multiple AI models."""

    def __init__(
        self,
        debate_id: str,
        topic: str,
        config: dict,
        api_keys: dict[str, str],
        on_message: Callable[[dict], None],
        images: list = None,
        user_id: Optional[str] = None,
        user_memory_context: Optional[str] = None,
        is_pro: bool = False,
        detail_mode: str = "fast"
    ):
        self.debate_id = debate_id
        self.topic = topic
        self.config = config
        self.api_keys = api_keys
        self.on_message = on_message
        self.models = config.get("models", [])
        self.max_rounds = 10  # Maximum rounds before forcing end
        self.summarizer_index = config.get("summarizer_index", 0)
        self.previous_context = config.get("previous_context", None)  # Context from continued conversations
        self.start_round = config.get("start_round", 1)  # Starting round for continuations
        self.vibe_id = config.get("vibe") or DEFAULT_VIBE
        self.vibe = get_vibe(self.vibe_id) or get_vibe(DEFAULT_VIBE)
        self.messages: list[dict] = []
        self._stopped = False
        self._paused = False
        self.images = images or []  # Optional images for vision models
        self._intervention_queue = asyncio.Queue()  # Queue for user interventions
        self.user_id = user_id  # For memory extraction
        self.user_memory_context = user_memory_context  # Memory context to inject
        self.is_pro = is_pro  # Pro subscription status
        self.detail_mode = detail_mode  # "fast" or "detailed"
        self.grounding_facts = ""  # Populated by _generate_grounding before bees speak

        # Reorder models: special bees always last, vision-capable first when images attached
        self._reorder_models()

    def _reorder_models(self):
        """Reorder models so special bees speak last, and vision models first when images attached."""
        # First, separate regular and special bees
        regular_models = []
        special_models = []

        for model in self.models:
            personality_id = model.get("personality_id")
            if personality_id and is_special_bee(personality_id):
                special_models.append(model)
            else:
                regular_models.append(model)

        # If images attached, reorder regular models for vision
        if self.images:
            vision_models = []
            non_vision_models = []
            for model in regular_models:
                if self._supports_vision(model):
                    vision_models.append(model)
                else:
                    non_vision_models.append(model)
            regular_models = vision_models + non_vision_models

        # Final order: regular bees first, then special bees last
        self.models = regular_models + special_models

    # Models that support vision/images
    # OpenAI: GPT-5.2, GPT-5, GPT-5-mini, GPT-4o, GPT-4o-mini support vision
    # Anthropic: all Claude models support vision
    # Google: all Gemini models support vision
    # xAI: Grok 4+ supports vision
    VISION_MODELS = {
        "gpt-5.2", "gpt-5", "gpt-5-mini", "gpt-4o", "gpt-4o-mini",  # OpenAI vision models
        "grok-4.1", "grok-4",  # xAI vision models
    }
    VISION_PROVIDERS = {"anthropic", "google"}  # All models from these providers support vision

    def _supports_vision(self, model_config: dict) -> bool:
        """Check if a model supports vision/images."""
        provider = model_config["provider"]
        model_id = model_config["model_id"]

        # All models from these providers support vision
        if provider in self.VISION_PROVIDERS:
            return True

        # Check specific model IDs for other providers
        return model_id in self.VISION_MODELS

    def _reorder_models_for_vision(self):
        """Reorder models so vision-capable ones respond first when image is attached."""
        vision_models = []
        non_vision_models = []

        for model in self.models:
            if self._supports_vision(model):
                vision_models.append(model)
            else:
                non_vision_models.append(model)

        # Put vision models first
        self.models = vision_models + non_vision_models

    def stop(self):
        """Stop the debate."""
        self._stopped = True

    async def add_intervention(self, content: str):
        """Add a user intervention to be processed."""
        await self._intervention_queue.put(content)
        # Broadcast that intervention was received
        await self._broadcast({
            "type": "intervention_received",
            "content": content
        })

    async def add_targeted_reply(self, content: str, target_bee: str):
        """Add a targeted reply to a specific bee."""
        await self._intervention_queue.put({
            "type": "reply_to_bee",
            "content": content,
            "target_bee": target_bee
        })

    def pause(self):
        """Pause the debate (waiting for user reply)."""
        self._paused = True

    def resume(self):
        """Resume the debate after user cancelled reply."""
        self._paused = False

    async def _check_for_intervention(self) -> str | None:
        """Check if there's a pending intervention (plain text or targeted reply dict)."""
        try:
            return self._intervention_queue.get_nowait()
        except asyncio.QueueEmpty:
            return None

    async def run(self):
        """Run the full debate."""
        try:
            # Update status to running
            async with get_db() as db:
                await db.execute(
                    "UPDATE debates SET status = ? WHERE id = ?",
                    ("running", self.debate_id)
                )
                await db.commit()

            # Tell the frontend which vibe this debate is in so it can pick
            # the right choreography before any bees start speaking.
            if self.vibe:
                await self._broadcast({
                    "type": "vibe_info",
                    "vibe": {
                        "id": self.vibe.id,
                        "name": self.vibe.name,
                        "emoji": self.vibe.emoji,
                    }
                })

            # Vibed debates run as ONE flowing conversation — bees take turns,
            # each speaking up to N times. Non-vibed debates still run in rounds.
            if self.vibe:
                await self._run_vibed_conversation()
                round_num = 1  # For verdict generation compat
            else:
                # Legacy: 3 rounds for both new debates and continuations
                round_num = self.start_round
                total_rounds = self.start_round + 2

                while not self._stopped and round_num <= total_rounds:
                    await self._broadcast({
                        "type": "round_start",
                        "round": round_num,
                        "total_rounds": total_rounds
                    })

                    await self._run_round(round_num)

                    await self._broadcast({
                        "type": "round_end",
                        "round": round_num
                    })

                    round_num += 1

            # Generate summary if not stopped (disabled - user wants to see individual AI discussions only)
            # if not self._stopped and self.models:
            #     await self._generate_summary()

            # Generate Hive Verdict if not stopped
            if not self._stopped and self.models and len(self.messages) >= 2:
                await self._broadcast({"type": "verdict_start"})
                verdict = await self._generate_hive_verdict()
                if verdict:
                    await self._broadcast({
                        "type": "verdict",
                        "verdict": verdict
                    })
                    # Save verdict to database for loading later
                    await self._save_message(
                        round_num=0,
                        model_name="verdict",
                        provider="system",
                        content=json.dumps(verdict)
                    )
                    # Auto-publish to public decisions feed
                    try:
                        import uuid
                        # Get hive name from first personality
                        hive_name = None
                        if self.models:
                            pid = self.models[0].get("personality_id", "")
                            if pid:
                                hive_name = pid.split("-")[0].title() if "-" in pid else pid
                        decision_id = str(uuid.uuid4())
                        async with get_db() as db:
                            await db.execute(
                                """INSERT INTO public_decisions (id, debate_id, user_id, topic, verdict_json, hive_name)
                                   VALUES (?, ?, ?, ?, ?, ?)""",
                                (decision_id, self.debate_id, self.user_id, self.topic, json.dumps(verdict), hive_name)
                            )
                            await db.commit()
                    except Exception as e:
                        print(f"Failed to save public decision: {e}")

            # Extract and save memory asynchronously (don't block completion)
            if self.user_id and not self._stopped:
                asyncio.create_task(self._extract_and_save_memory())

            # Update status to completed
            status = "stopped" if self._stopped else "completed"
            async with get_db() as db:
                await db.execute(
                    "UPDATE debates SET status = ? WHERE id = ?",
                    (status, self.debate_id)
                )
                await db.commit()

            await self._broadcast({
                "type": "debate_end",
                "status": status
            })

        except Exception as e:
            await self._broadcast({
                "type": "error",
                "message": str(e)
            })
            async with get_db() as db:
                await db.execute(
                    "UPDATE debates SET status = ? WHERE id = ?",
                    ("error", self.debate_id)
                )
                await db.commit()
            # Always send debate_end to unlock client UI
            await self._broadcast({
                "type": "debate_end",
                "status": "error"
            })

    async def _run_round(self, round_num: int):
        """Run a single round of the debate - all bees respond in parallel."""
        if self._stopped:
            return

        # Check for user intervention before starting round
        intervention = await self._check_for_intervention()
        if intervention:
            if isinstance(intervention, dict) and intervention.get("type") == "reply_to_bee":
                reply_content = intervention["content"]
                target_bee = intervention["target_bee"]
                self.messages.append({
                    "round": round_num,
                    "model_name": "User",
                    "provider": "user",
                    "content": reply_content,
                    "target_bee": target_bee
                })
                await self._save_message(
                    round_num=round_num,
                    model_name="User",
                    provider="user",
                    content=f"[Reply to {target_bee}]: {reply_content}"
                )
                await self._broadcast({
                    "type": "user_intervention",
                    "content": reply_content,
                    "round": round_num,
                    "target_bee": target_bee
                })
            else:
                content = intervention if isinstance(intervention, str) else intervention.get("content", "")
                self.messages.append({
                    "round": round_num,
                    "model_name": "User",
                    "provider": "user",
                    "content": content
                })
                await self._save_message(
                    round_num=round_num,
                    model_name="User",
                    provider="user",
                    content=content
                )
                await self._broadcast({
                    "type": "user_intervention",
                    "content": content,
                    "round": round_num
                })

        # Prepare all bee info and broadcast all model_start events
        bee_tasks = []
        for model_index, model_config in enumerate(self.models):
            provider_name = model_config["provider"]
            model_id = model_config["model_id"]
            model_name = model_config["model_name"]
            role = model_config.get("role", "")
            personality_id = model_config.get("personality_id", None)

            if provider_name not in self.api_keys:
                continue

            display_name = model_name
            role_name = None
            if personality_id:
                if self.user_id:
                    personality = await get_personality_async(self.user_id, personality_id)
                else:
                    personality = get_personality(personality_id)
                if personality:
                    display_name = personality.human_name
                    role_name = personality.name

            # Build context - all bees get the same context (previous rounds only)
            context = self._build_context(round_num, model_index, display_name)

            bee_tasks.append({
                "provider_name": provider_name,
                "model_id": model_id,
                "model_name": model_name,
                "display_name": display_name,
                "role_name": role_name,
                "role": role,
                "personality_id": personality_id,
                "context": context,
                "round_num": round_num,
            })

        # Broadcast all model_start events at once
        for bee in bee_tasks:
            await self._broadcast({
                "type": "model_start",
                "model_name": bee["display_name"],
                "role_name": bee["role_name"],
                "provider": bee["provider_name"],
                "round": round_num,
                "personality_id": bee["personality_id"]
            })

        # Max bees allowed on any single side — forces diverse takes.
        MAX_PER_SIDE = 3

        def _side_tally() -> dict[str, int]:
            """Return a lowercased tally of round-1 sides from self.messages."""
            tally: dict[str, int] = {}
            for m in self.messages:
                if m.get("round") == round_num and m.get("side"):
                    s = m["side"].strip().lower()
                    if s:
                        tally[s] = tally.get(s, 0) + 1
            return tally

        def _build_round1_context_with_tally(bee: dict, forbidden: list[str] = None, retry: bool = False) -> str:
            """Round 1 context that includes prior bees' takes + a strict side cap."""
            context = ""
            if self.user_memory_context:
                context += f"(USER INFO - only reference if relevant: {self.user_memory_context}.)\n\n"
            if self.previous_context:
                context += f"BACKGROUND:\n{self.previous_context}\n---\n\n"
            context += f"USER'S CURRENT MESSAGE: {self.topic}\n\n"

            prior = [m for m in self.messages if m.get("round") == round_num and m.get("personality_id")]
            if prior:
                context += "WHAT OTHER BEES HAVE ALREADY SAID THIS ROUND:\n\n"
                for m in prior:
                    side_tag = f"[side: {m.get('side', '?')}]" if m.get("side") else ""
                    context += f"**{m['model_name']}** {side_tag}: {m['content']}\n\n"
                tally = _side_tally()
                context += "CURRENT SIDE TALLY:\n"
                for s, n in sorted(tally.items(), key=lambda x: -x[1]):
                    context += f"  {s}: {n}\n"
                context += "\n"
                if forbidden:
                    forbidden_str = ", ".join(f'"{f}"' for f in forbidden)
                    context += (
                        f"🚨🚨🚨 HARD CONSTRAINT — NO EXCEPTIONS 🚨🚨🚨\n"
                        f"These sides are FULL and FORBIDDEN: {forbidden_str}.\n"
                        f"Your SIDE field MUST be something DIFFERENT from those.\n"
                        f"If you put {forbidden_str} in your SIDE field, your response will be REJECTED and you will be re-queried.\n"
                        f"Pick a new angle. Be contrarian. Pick the minority side, or invent a third option.\n\n"
                    )
                    if retry:
                        context += (
                            f"⚠️ THIS IS A RETRY. Your previous answer picked one of the forbidden sides. "
                            f"You MUST NOT do that again. Pick LITERALLY ANY OTHER SIDE.\n\n"
                        )
                else:
                    context += (
                        "The debate needs 2+ sides. Feel free to disagree with the prior bees.\n\n"
                    )
            else:
                context += "You're the first bee to speak this round. Pick your genuine take — others will react.\n\n"

            context += "Pick ONE side. NEVER say 'both' or 'it depends'. Commit."
            return context

        # Run all bees in parallel
        async def run_single_bee(bee):
            try:
                raw_content = await self._get_model_response(
                    provider_name=bee["provider_name"],
                    model_id=bee["model_id"],
                    model_name=bee["model_name"],
                    role=bee["role"],
                    context=bee["context"],
                    round_num=bee["round_num"],
                    personality_id=bee["personality_id"]
                )
                # Parse SIDE/SHORT/LONG/REPLY_TO/REACTIONS from the AI response
                side_text, short_text, long_text, reply_to, reactions = parse_bee_response(raw_content)
                stored_content = json.dumps({
                    "side": side_text,
                    "short": short_text,
                    "long": long_text,
                    "reply_to": reply_to,
                    "reactions": reactions,
                })
                await self._save_message(
                    round_num=round_num,
                    model_name=bee["display_name"],
                    provider=bee["provider_name"],
                    content=stored_content
                )
                # For in-memory context building between rounds, use short text
                # (so bees see each other's punchy take, not the padded long version)
                self.messages.append({
                    "round": round_num,
                    "model_name": bee["display_name"],
                    "provider": bee["provider_name"],
                    "content": short_text,
                    "side": side_text,
                    "reply_to": reply_to,
                    "personality_id": bee["personality_id"]
                })
                await self._broadcast({
                    "type": "model_end",
                    "model_name": bee["display_name"],
                    "provider": bee["provider_name"],
                    "round": round_num,
                    "side": side_text,
                    "short": short_text,
                    "long": long_text,
                    "reply_to": reply_to,
                    "reactions": reactions,
                })
            except Exception as e:
                await self._broadcast({
                    "type": "model_error",
                    "model_name": bee["display_name"],
                    "provider": bee["provider_name"],
                    "error": str(e)
                })

        # Round 1 runs SEQUENTIALLY so each bee sees the running side tally.
        # We validate side BEFORE broadcasting so rejected responses never
        # reach the frontend (otherwise the frontend's finished-bee lookup
        # would miss the retry). Round 2+ runs in parallel since each bee
        # already sees all prior messages regardless.
        async def _get_bee_once(bee: dict, context: str):
            raw = await self._get_model_response(
                provider_name=bee["provider_name"],
                model_id=bee["model_id"],
                model_name=bee["model_name"],
                role=bee["role"],
                context=context,
                round_num=bee["round_num"],
                personality_id=bee["personality_id"],
            )
            s, short_t, long_t, reply_to, reactions = parse_bee_response(raw)
            return raw, s, short_t, long_t, reply_to, reactions

        async def _commit_bee(bee: dict, side_text: str, short_text: str, long_text: str, reply_to: str = "", reactions: list | None = None):
            reactions = reactions or []
            stored = json.dumps({
                "side": side_text,
                "short": short_text,
                "long": long_text,
                "reply_to": reply_to,
                "reactions": reactions,
            })
            await self._save_message(
                round_num=round_num,
                model_name=bee["display_name"],
                provider=bee["provider_name"],
                content=stored,
            )
            self.messages.append({
                "round": round_num,
                "model_name": bee["display_name"],
                "provider": bee["provider_name"],
                "content": short_text,
                "side": side_text,
                "reply_to": reply_to,
                "personality_id": bee["personality_id"],
            })
            await self._broadcast({
                "type": "model_end",
                "model_name": bee["display_name"],
                "provider": bee["provider_name"],
                "round": round_num,
                "side": side_text,
                "short": short_text,
                "long": long_text,
                "reply_to": reply_to,
                "reactions": reactions,
            })

        if round_num == 1 and len(bee_tasks) > 1:
            for bee in bee_tasks:
                if self._stopped:
                    break
                try:
                    tally_before = _side_tally()
                    forbidden = [s for s, n in tally_before.items() if n >= MAX_PER_SIDE]
                    context = _build_round1_context_with_tally(bee, forbidden=forbidden)
                    raw, side_text, short_text, long_text, reply_to, reactions = await _get_bee_once(bee, context)

                    # Retry once if the bee picked a forbidden side
                    if forbidden and side_text and side_text.strip().lower() in [f.lower() for f in forbidden]:
                        print(f"[vibes] Rejecting {bee['display_name']} — picked forbidden side '{side_text}', retrying")
                        context = _build_round1_context_with_tally(bee, forbidden=forbidden, retry=True)
                        raw, side_text, short_text, long_text, reply_to, reactions = await _get_bee_once(bee, context)
                        # Last resort: if still forbidden, force onto the minority side
                        if side_text and side_text.strip().lower() in [f.lower() for f in forbidden]:
                            known_sides = [m.get("side") for m in self.messages if m.get("side") and m.get("side").strip().lower() not in [f.lower() for f in forbidden]]
                            fallback_side = known_sides[0] if known_sides else "other"
                            print(f"[vibes] Forcing {bee['display_name']} onto fallback side '{fallback_side}'")
                            side_text = fallback_side

                    await _commit_bee(bee, side_text, short_text, long_text, reply_to, reactions)
                except Exception as e:
                    await self._broadcast({
                        "type": "model_error",
                        "model_name": bee["display_name"],
                        "provider": bee["provider_name"],
                        "error": str(e),
                    })
        else:
            await asyncio.gather(*[run_single_bee(bee) for bee in bee_tasks])

    async def _run_vibed_conversation(self):
        """Run a vibed debate as a flowing conversation.

        No rounds. Each bee speaks up to MAX_SPEAKS_PER_BEE times. Turn picker
        prioritizes bees who were @-mentioned and haven't responded yet, then
        round-robins by least-spoken. Max-3-per-side still enforced via retry.
        """
        MAX_SPEAKS_PER_BEE = 3
        MAX_PER_SIDE = 3
        TOTAL_TURNS_MIN = 8   # Minimum conversation length
        TOTAL_TURNS_MAX = 12  # Max — keep it short and snappy, not every bee speaks max times

        # Pre-resolve display names for all bees so we can match mentions
        bee_info: list[dict] = []
        for model_index, model_config in enumerate(self.models):
            if model_config["provider"] not in self.api_keys:
                continue
            pid = model_config.get("personality_id")
            display_name = model_config["model_name"]
            role_name = None
            if pid:
                if self.user_id:
                    p = await get_personality_async(self.user_id, pid)
                else:
                    p = get_personality(pid)
                if p:
                    display_name = p.human_name
                    role_name = p.name
            bee_info.append({
                "provider_name": model_config["provider"],
                "model_id": model_config["model_id"],
                "model_name": model_config["model_name"],
                "display_name": display_name,
                "role_name": role_name,
                "role": model_config.get("role", ""),
                "personality_id": pid,
                "model_index": model_index,
                "first_name": display_name.split()[0] if display_name else "",
            })

        if not bee_info:
            return

        # One-shot grounding call before any bees speak — gives them real facts
        # to draw on instead of winging it purely from persona flavor.
        if not self.grounding_facts:
            self.grounding_facts = await self._generate_grounding()

        import random as _rand_turn
        speak_counts = {b["personality_id"]: 0 for b in bee_info}
        last_speaker_pid = None
        recent_react_emojis = []
        # Vary total turn count per conversation — feels less mechanical than always 15
        total_turns = _rand_turn.randint(TOTAL_TURNS_MIN, TOTAL_TURNS_MAX)

        # Natural staggered joining: start with just 2 bees, then a new bee
        # organically joins every few turns (randomized gap so it doesn't feel
        # like a mechanical brigade). Each bee that isn't yet active is simply
        # invisible to the speaker picker until it's added to `active_bees`.
        shuffled_bees = list(bee_info)
        _rand_turn.shuffle(shuffled_bees)
        active_bees = shuffled_bees[:min(2, len(shuffled_bees))]
        pending_bees = shuffled_bees[len(active_bees):]
        # Randomized schedule for each remaining bee to join (turn index).
        # First extra bee joins after 2-3 turns, each subsequent one 2-4 turns
        # later. Gives the initial 2 bees time to banter before others drop in.
        join_schedule: dict[int, list[dict]] = {}
        _next_join_turn = _rand_turn.randint(2, 3)
        for b in pending_bees:
            join_schedule.setdefault(_next_join_turn, []).append(b)
            _next_join_turn += _rand_turn.randint(2, 4)

        def _side_tally() -> dict[str, int]:
            tally: dict[str, int] = {}
            for m in self.messages:
                s = (m.get("side") or "").strip().lower()
                if s:
                    tally[s] = tally.get(s, 0) + 1
            return tally

        def _pending_mention_for(bee: dict) -> bool:
            """True if this bee was @-mentioned in a message AFTER their last speak."""
            if not bee["first_name"]:
                return False
            mention_re = re.compile(r'@' + re.escape(bee["first_name"]) + r'\b', re.IGNORECASE)
            # Find the last index where this bee spoke
            last_idx = -1
            for i, m in enumerate(self.messages):
                if m.get("personality_id") == bee["personality_id"]:
                    last_idx = i
            # Scan for a mention after that
            for m in self.messages[last_idx + 1:]:
                if m.get("personality_id") and m.get("personality_id") != bee["personality_id"]:
                    if mention_re.search(m.get("content", "") or ""):
                        return True
            return False

        import random as _rand

        def _pick_next_speaker():
            # Only pick from bees that have already "joined" the conversation
            candidates = [b for b in active_bees if speak_counts[b["personality_id"]] < MAX_SPEAKS_PER_BEE]
            if not candidates:
                return None
            not_last = [b for b in candidates if b["personality_id"] != last_speaker_pid]
            pool = not_last if not_last else candidates

            pool.sort(key=lambda b: (speak_counts[b["personality_id"]], b["model_index"]))

            # Mentioned bees get 70% priority (up from 50%)
            pending_mention_bees = [b for b in pool if _pending_mention_for(b)]
            if pending_mention_bees and _rand.random() < 0.7:
                return pending_mention_bees[0]

            # Among least-spoken bees (same speak count as top candidate),
            # pick randomly instead of always first-by-index
            min_speaks = speak_counts[pool[0]["personality_id"]]
            tied = [b for b in pool if speak_counts[b["personality_id"]] == min_speaks]
            return _rand.choice(tied)

        def _build_vibed_context(bee: dict, forbidden: list[str] = None, retry: bool = False) -> str:
            context = ""
            if self.user_memory_context:
                context += f"(USER INFO - only reference if relevant: {self.user_memory_context}.)\n\n"
            if self.previous_context:
                context += f"BACKGROUND - {self.previous_context}\n---\n\n"
            context += f"USER'S QUESTION: {self.topic}\n\n"

            if self.grounding_facts:
                context += (
                    "📚 EXPERT BRIEFING ON THIS TOPIC — real facts, tradeoffs, hidden considerations, and expert-level angles. "
                    "USE THIS. Draw on specific points that align with your character's lens. Name the actual numbers, products, and mechanisms. "
                    "Do not just quote the memo — pull the specific fact that fits YOUR take and run with it.\n"
                    f"{self.grounding_facts}\n\n"
                )

            if self.messages:
                # Show only the last ~6 messages — keeps focus on recent context.
                recent = self.messages[-6:]
                context += "RECENT CHAT:\n\n"
                for m in recent:
                    if m.get("model_name") == "User":
                        context += f"  User (the human in this chat): {m.get('content', '')}\n"
                    else:
                        side_tag = f" [{m.get('side', '?')}]" if m.get("side") else ""
                        context += f"  {m.get('model_name')}{side_tag}: {m.get('content', '')}\n"

                # Mention budget: target 2-3 @-mentions total per debate.
                # Tell each bee how many have happened so they can calibrate.
                _bee_msgs = [m for m in self.messages if m.get("personality_id")]
                _mention_count = sum(
                    1 for m in _bee_msgs if "@" in (m.get("content") or "")
                )
                if _mention_count == 0 and len(_bee_msgs) >= 3:
                    context += f"\n📣 MENTION BUDGET: zero @-mentions so far. Target is 2-3 total for the whole chat. You CAN drop ONE @BeeName if you genuinely want another bee to weigh in.\n\n"
                elif _mention_count >= 3:
                    context += f"\n📣 MENTION BUDGET: {_mention_count} @-mentions already this chat. DO NOT use another @. Just drop your take.\n\n"
                elif _mention_count >= 1:
                    context += f"\n📣 MENTION BUDGET: {_mention_count}/3 @-mentions used. Default: no @ on your turn. Only @ if you genuinely want that bee to answer next.\n\n"

                context += (
                    "💬 CONVERSATION MODE: Read the RECENT CHAT above and ENGAGE with it — don't just drop an independent take. "
                    "Pick the move that actually fits:\n"
                    "  • agree + extend ('exactly, and also X')\n"
                    "  • concede + counter ('ok that tracks for X, but Y is where it breaks')\n"
                    "  • compromise / tradeoff ('if X matters go A, if Y matters go B')\n"
                    "  • disagree specifically (engage with their reasoning, not just 'nah')\n"
                    "BANNED: restating someone else's point in your own slang with zero addition. "
                    "If you've got nothing new, briefly co-sign and stay short, or skip.\n\n"
                )

                # Check how recently the user jumped in — if within last 3 messages,
                # bees should still be acknowledging them (not just the very next one)
                last_user_offset = None
                for i, m in enumerate(reversed(recent)):
                    if m.get("model_name") == "User":
                        last_user_offset = i
                        break

                # Emphasize the very last message so the bee reacts TO IT
                last = None
                last_is_user = False
                for m in reversed(recent):
                    if m.get("model_name") == "User":
                        last_is_user = True
                        last = m
                        break
                    if m.get("personality_id"):
                        last = m
                        break
                if last_is_user:
                    context += (
                        f"\n🗣️🗣️🗣️ **THE USER JUST JUMPED IN**: \"{last['content']}\"\n"
                        f"YOU MUST react to what the user said. Options:\n"
                        f"  - Address them directly in your SHORT (e.g. \"@you real fr\", \"yeah you're right\", \"nah user wrong\")\n"
                        f"  - Drop a tapback REACT on their message: REACT: User:💯 (or 🔥 😭 🎯 etc)\n"
                        f"  - Answer their point head-on\n"
                        f"The user is a real person in this group chat — acknowledge them like a friend would.\n\n"
                    )
                elif last_user_offset is not None and last_user_offset <= 2:
                    # User jumped in recently but another bee already replied.
                    # Still encourage this bee to chime in on the user's point.
                    user_msg = next((m for m in reversed(recent) if m.get("model_name") == "User"), None)
                    if user_msg:
                        context += (
                            f"\n🗣️ **The user jumped in a moment ago**: \"{user_msg['content']}\"\n"
                            f"Other bees are reacting. You can ALSO chime in on their take — "
                            f"address them (\"@you\", \"user\"), REACT to their message, or build on what they said.\n\n"
                        )
                elif last:
                    context += (
                        f"\n👆 Most recent message was from **{last['model_name']}**. "
                        f"Respond to what they actually said — co-sign it, concede a piece and push back, find a tradeoff, or push against their specific reasoning. "
                        f"If it's a direct quote-reply, set REPLY_TO: {last['model_name']}. "
                        f"Don't name-drop them in prose ('Sunny was right' style) — just engage with the point.\n\n"
                    )

                if forbidden:
                    forbidden_str = ", ".join(f'"{f}"' for f in forbidden)
                    context += (
                        f"🚨 SIDE CAP: {forbidden_str} is full. Pick a different side.\n"
                    )
                    if retry:
                        context += "⚠️ RETRY — your previous answer was rejected. Pick a DIFFERENT side.\n"
                    context += "\n"

                # Check for pending mentions of this bee — OPTIONAL reaction
                if bee["first_name"]:
                    mention_re = re.compile(r'@' + re.escape(bee["first_name"]) + r'\b', re.IGNORECASE)
                    last_self_idx = -1
                    for i, m in enumerate(self.messages):
                        if m.get("personality_id") == bee["personality_id"]:
                            last_self_idx = i
                    mentioning = [
                        m for m in self.messages[last_self_idx + 1:]
                        if m.get("personality_id") and m.get("personality_id") != bee["personality_id"]
                        and mention_re.search(m.get("content", "") or "")
                    ]
                    if mentioning:
                        latest = mentioning[-1]
                        context += (
                            f"🔔 {latest['model_name']} @-mentioned you earlier. "
                            f"You CAN react with @{latest['model_name']} if you want, but it's optional.\n\n"
                        )
            else:
                context += "You're the first to speak. Drop your take on the question.\n\n"

            context += (
                "Pick ONE side from the user's options as your SIDE label — commit, don't sit on the fence. "
                "But inside SHORT/LONG you CAN acknowledge tradeoffs or concede where the other side has a point, "
                "as long as you still land on a lean. 'If X matters, A — but I'd lean A overall' is fine. "
                "Pure 'both are great' / 'it depends, can't say' is not."
            )
            return context

        async def _get_bee_once(bee: dict, context: str):
            raw = await self._get_model_response(
                provider_name=bee["provider_name"],
                model_id=bee["model_id"],
                model_name=bee["model_name"],
                role=bee["role"],
                context=context,
                round_num=1,
                personality_id=bee["personality_id"],
            )
            return parse_bee_response(raw)  # (side, short, long, reply_to, reactions)

        async def _commit_turn(bee: dict, side: str, short: str, long: str, reply_to: str = "", reactions: list | None = None):
            reactions = reactions or []
            stored = json.dumps({
                "side": side,
                "short": short,
                "long": long,
                "reply_to": reply_to,
                "reactions": reactions,
            })
            await self._save_message(
                round_num=1,
                model_name=bee["display_name"],
                provider=bee["provider_name"],
                content=stored,
            )
            self.messages.append({
                "round": 1,
                "model_name": bee["display_name"],
                "provider": bee["provider_name"],
                "content": short,
                "side": side,
                "reply_to": reply_to,
                "personality_id": bee["personality_id"],
            })
            await self._broadcast({
                "type": "model_end",
                "model_name": bee["display_name"],
                "provider": bee["provider_name"],
                "round": 1,
                "side": side,
                "short": short,
                "long": long,
                "reply_to": reply_to,
                "reactions": reactions,
            })

        # Run the conversation
        turn = 0
        while turn < total_turns:
            if self._stopped:
                break

            # Wait while paused (user is composing a reply)
            while self._paused and not self._stopped:
                await asyncio.sleep(0.2)

            # Natural staggered joining: add any bees scheduled to join at this turn.
            # Their first-time speak will trigger the join-toast on the frontend.
            if turn in join_schedule:
                for nb in join_schedule[turn]:
                    if nb not in active_bees:
                        active_bees.append(nb)

            # Check for a user intervention (from the reply-to-bee button).
            # If the user replied to a specific bee, inject a User message
            # and force that bee to speak next by using them as the speaker.
            intervention = await self._check_for_intervention()
            forced_speaker = None
            if intervention:
                if isinstance(intervention, dict) and intervention.get("type") == "reply_to_bee":
                    content = intervention.get("content", "")
                    target = intervention.get("target_bee", "")
                    self.messages.append({
                        "round": 1,
                        "model_name": "User",
                        "provider": "user",
                        "content": content,
                        "target_bee": target,
                    })
                    await self._save_message(
                        round_num=1,
                        model_name="User",
                        provider="user",
                        content=f"[Reply to {target}]: {content}",
                    )
                    await self._broadcast({
                        "type": "user_intervention",
                        "content": content,
                        "round": 1,
                        "target_bee": target,
                    })
                    # Force the targeted bee to speak next (add to active if pending)
                    for b in bee_info:
                        if b["display_name"] == target and speak_counts[b["personality_id"]] < MAX_SPEAKS_PER_BEE:
                            forced_speaker = b
                            if b not in active_bees:
                                active_bees.append(b)
                            break
                else:
                    content = intervention if isinstance(intervention, str) else intervention.get("content", "")
                    self.messages.append({
                        "round": 1,
                        "model_name": "User",
                        "provider": "user",
                        "content": content,
                    })
                    await self._save_message(
                        round_num=1,
                        model_name="User",
                        provider="user",
                        content=content,
                    )
                    await self._broadcast({
                        "type": "user_intervention",
                        "content": content,
                        "round": 1,
                    })
                    # Detect @mentions in the message and force that bee next
                    mention_match = re.search(r'@(\S+)', content)
                    if mention_match and not forced_speaker:
                        mname = mention_match.group(1).lower()
                        for b in bee_info:
                            if (b["display_name"].lower() == mname
                                or b["first_name"].lower() == mname
                                ) and speak_counts[b["personality_id"]] < MAX_SPEAKS_PER_BEE:
                                forced_speaker = b
                                if b not in active_bees:
                                    active_bees.append(b)
                                break

            speaker = forced_speaker or _pick_next_speaker()
            if not speaker:
                break

            # Broadcast model_start for JUST this turn's speaker. Doing it here
            # (not upfront) means each turn gets its own start/end pair, so the
            # frontend beeQueue can enqueue and play bees one at a time.
            await self._broadcast({
                "type": "model_start",
                "model_name": speaker["display_name"],
                "role_name": speaker["role_name"],
                "provider": speaker["provider_name"],
                "round": 1,
                "personality_id": speaker["personality_id"],
            })

            try:
                tally = _side_tally()
                forbidden = [s for s, n in tally.items() if n >= MAX_PER_SIDE]
                ctx = _build_vibed_context(speaker, forbidden=forbidden)
                side, short, long, reply_to, reactions = await _get_bee_once(speaker, ctx)

                # Retry once if forbidden side picked
                if forbidden and side and side.strip().lower() in [f.lower() for f in forbidden]:
                    print(f"[vibes] Rejecting {speaker['display_name']} — picked forbidden side '{side}', retrying")
                    ctx = _build_vibed_context(speaker, forbidden=forbidden, retry=True)
                    side, short, long, reply_to, reactions = await _get_bee_once(speaker, ctx)
                    if side and side.strip().lower() in [f.lower() for f in forbidden]:
                        known_sides = [
                            m.get("side") for m in self.messages
                            if m.get("side") and m.get("side").strip().lower() not in [f.lower() for f in forbidden]
                        ]
                        fallback = known_sides[0] if known_sides else "other"
                        print(f"[vibes] Forcing {speaker['display_name']} onto fallback side '{fallback}'")
                        side = fallback

                if reactions:
                    valid_targets = {
                        b["display_name"].lower(): b["display_name"]
                        for b in bee_info
                        if b["display_name"].lower() != speaker["display_name"].lower()
                    }
                    # Allow reacting to the user's messages too
                    valid_targets["user"] = "User"
                    valid_targets["you"] = "User"
                    filtered = []
                    for r in reactions:
                        tname = (r.get("target") or "").strip().lower()
                        resolved = valid_targets.get(tname)
                        if not resolved:
                            for key, full in valid_targets.items():
                                if key.split()[0] == tname.split()[0]:
                                    resolved = full
                                    break
                        if resolved and r.get("emoji"):
                            filtered.append({"target": resolved, "emoji": r["emoji"]})
                    reactions = filtered[:1]
                    if reactions and reactions[0]["emoji"] in recent_react_emojis[-3:]:
                        reactions = []
                    if reactions and _rand.random() > 0.60:
                        reactions = []
                    if reactions:
                        recent_react_emojis.append(reactions[0]["emoji"])

                # Backend mention enforcement — the prompt budget is a soft nudge
                # Grok ignores. Hard-cap here to actually land at 1-2 per debate.
                mention_pattern = re.compile(r"@[A-Za-z][\w']*")

                def _strip_mentions(text: str) -> str:
                    if not text or "@" not in text:
                        return text
                    out = mention_pattern.sub("", text)
                    out = re.sub(r"\s+", " ", out)
                    out = re.sub(r"\s+([,.!?])", r"\1", out)
                    return out.strip(" ,")

                _mentions_so_far = sum(
                    1 for m in self.messages
                    if m.get("personality_id") and "@" in (m.get("content") or "")
                )
                _has_mention = bool(mention_pattern.search(short or "")) or bool(mention_pattern.search(long or ""))
                if _has_mention:
                    if _mentions_so_far >= 3:
                        # Budget full (cap at 3): strip every mention.
                        short = _strip_mentions(short)
                        long = _strip_mentions(long)
                        print(f"[mentions] HARD CAP hit ({_mentions_so_far} used) — stripped from {speaker['display_name']}")
                    elif _rand.random() < 0.30:
                        # Budget has room: light probabilistic wipe — just spaces them out
                        # so they don't all cluster at the start.
                        short = _strip_mentions(short)
                        long = _strip_mentions(long)
                        print(f"[mentions] probabilistic strip ({_mentions_so_far} used) — {speaker['display_name']}")
                    else:
                        print(f"[mentions] LET THROUGH ({_mentions_so_far + 1} total after this) — {speaker['display_name']}")

                await _commit_turn(speaker, side, short, long, reply_to, reactions)
                speak_counts[speaker["personality_id"]] += 1
                last_speaker_pid = speaker["personality_id"]

                # Listening window: randomized pause so user can jump in.
                # Shorter during fast back-and-forth (consecutive short
                # messages), longer when the conversation slows down.
                if turn >= 3 and not self._stopped:
                    recent_lens = [len(m.get("content", "")) for m in self.messages[-3:] if m.get("personality_id")]
                    avg_len = sum(recent_lens) / max(len(recent_lens), 1)
                    if avg_len < 30:
                        window = _rand.uniform(0.8, 1.5)
                    else:
                        window = _rand.uniform(1.8, 3.2)
                    try:
                        msg = await asyncio.wait_for(
                            self._intervention_queue.get(), timeout=window
                        )
                        await self._intervention_queue.put(msg)
                    except asyncio.TimeoutError:
                        pass

            except Exception as e:
                print(f"[vibes] Turn {turn} error: {e}")
                await self._broadcast({
                    "type": "model_error",
                    "model_name": speaker["display_name"],
                    "provider": speaker["provider_name"],
                    "error": str(e),
                })
            turn += 1

    async def _get_model_response(
        self,
        provider_name: str,
        model_id: str,
        model_name: str,
        role: str,
        context: str,
        round_num: int,
        personality_id: str = None
    ) -> str:
        """Get response from a model with streaming."""
        provider_class = ProviderRegistry.get(provider_name)
        provider = provider_class(self.api_keys[provider_name])

        # Build system prompt
        system_prompt = await self._build_system_prompt(model_name, role, round_num, personality_id)

        # Build messages
        messages = [{"role": "user", "content": context}]

        # Get display name with personality if set
        display_name = model_name
        if personality_id:
            # Use async version to support custom bees
            if self.user_id:
                personality = await get_personality_async(self.user_id, personality_id)
            else:
                personality = get_personality(personality_id)
            if personality:
                display_name = personality.human_name

        # Only include images for vision-capable models in round 1
        # Non-vision models will just respond to the text conversation
        model_config = {"provider": provider_name, "model_id": model_id}
        if round_num == 1 and self.images and self._supports_vision(model_config):
            images = self.images
        else:
            images = None

        # Stream response — we buffer silently on the server so we can parse
        # the SHORT/LONG format out before sending it to the client. No raw
        # chunks are broadcast so the SHORT:/LONG: labels never leak to the UI.
        full_response = ""
        async for chunk in provider.generate_stream(model_id, messages, system_prompt, images):
            if self._stopped:
                break
            full_response += chunk

        return full_response

    async def _generate_grounding(self) -> str:
        """Single pre-debate call to gather real facts about the topic.

        Uses a stronger model (full grok-4) than the bees (grok-4-fast-reasoning)
        since this is one call per debate and its quality front-loads every bee's
        context. Falls back to the bees' fast model if grok-4 errors.

        Output is injected into every bee's context so they have actual substance
        to draw on instead of winging it purely from the persona prompt.
        """
        if not self.topic or not self.models:
            return ""
        first = self.models[0]
        provider_name = first.get("provider")
        if provider_name not in self.api_keys:
            return ""

        system_prompt = (
            "You are a domain expert briefing a panel of personalities about to debate this topic. "
            "You have LIVE WEB SEARCH enabled — USE IT to fact-check any specific claim before writing. "
            "Never state a number, statistic, quote, version, or event you haven't verified against a search result. "
            "If you can't verify a specific figure, frame it qualitatively ('generally considered faster', 'widely adopted') instead of inventing a number.\n\n"
            "Produce a short research memo an informed adult would want before taking a side: "
            "real numbers, real mechanisms, real tradeoffs, specific named things — not generic fluff.\n\n"
            "Structure (numbered list, 8-10 points total, no intro, no summary):\n"
            "  1-3. KEY FACTS — concrete data, figures, features, or rules that actually matter here. Only state specifics you found in search; otherwise go qualitative.\n"
            "  4-6. REAL TRADEOFFS — what you gain vs. what you give up on each option. Each point should name BOTH sides of a specific axis.\n"
            "  7-8. HIDDEN CONSIDERATIONS — non-obvious factors most people miss. Second-order effects, edge cases, context-dependent things.\n"
            "  9-10. EXPERT-LEVEL ANGLES — what someone with actual domain experience (economist, doctor, engineer, etc) would flag that a layperson wouldn't.\n\n"
            "Each point: one tight sentence. Specific, substantive, something a debater could actually USE. "
            "If the topic is personal/subjective (e.g. pizza vs burgers), still give real substance — nutrition, history, variety, price-per-portion, regional preferences, etc. Do NOT include citations or URLs in the memo itself; downstream consumers only need the facts."
        )
        user_message = f"Topic / question: {self.topic}\n\nProduce the research memo:"
        messages = [{"role": "user", "content": user_message}]

        async def _run_with(model_id: str, use_search: bool) -> str:
            provider_class = ProviderRegistry.get(provider_name)
            provider = provider_class(self.api_keys[provider_name])
            out = ""
            if use_search and hasattr(provider, "generate_stream_with_search"):
                gen = provider.generate_stream_with_search(model_id, messages, system_prompt)
            else:
                gen = provider.generate_stream(model_id, messages, system_prompt, None)
            async for chunk in gen:
                if self._stopped:
                    break
                out += chunk
            return out.strip()

        if provider_name == "xai":
            # Try: grok-4 + Live Search (best). Fall back: grok-4 no search. Fall back: bee model.
            try:
                result = await _run_with("grok-4", use_search=True)
                if result:
                    return result
            except Exception as e:
                print(f"[grounding] grok-4+search failed, trying grok-4 alone: {e}")
            try:
                result = await _run_with("grok-4", use_search=False)
                if result:
                    return result
            except Exception as e:
                print(f"[grounding] grok-4 failed, falling back to bee model: {e}")

        try:
            return await _run_with(first["model_id"], use_search=False)
        except Exception as e:
            print(f"[grounding] fallback also failed: {e}")
            return ""

    async def _build_system_prompt(self, model_name: str, role: str, round_num: int, personality_id: str = None) -> str:
        """Build system prompt for a model, optionally with personality and vibe."""

        # Get personality role if specified
        personality_role = ""
        display_name = model_name
        if personality_id:
            # Use async version to support custom bees
            if self.user_id:
                personality = await get_personality_async(self.user_id, personality_id)
            else:
                personality = get_personality(personality_id)
            if personality:
                personality_role = personality.role
                display_name = personality.human_name

        if round_num == 1:
            turn_context = "You're first to drop a take. Commit."
        else:
            turn_context = "You've seen the conversation. React naturally."

        base_prompt = f"""You are {display_name}.

{turn_context}

🧠 KNOWLEDGE FIRST. You actually know what you're talking about.
Think like an informed expert first, THEN flavor it in character. Do NOT play dumb for the gig. A knowledgeable take delivered in-character is the whole point. If the user asks a real question, give a real answer.

Your personality IS your expertise lens. Lean on what YOUR specific character would actually know and care about. The investor pulls on markets and finance. The coder on tech. The judge on law and precedent. The cynic on incentives and marketing. The optimist on case studies of things that worked. The pessimist on how things fail. The millennial on millennial realities. The wise friend on lived experience. Bring concrete details, real examples, and actual reasoning. Not vibes.

🚨 STICK TO THE USER'S EXACT OPTIONS.
If they asked "Cola vs Pepsi", SIDE is "Cola" or "Pepsi". Never "coconut water" or "neither". Never invent new options or change the frame. Argue within what the user literally named.

📏 FORMAT (two fields do different jobs):
- SHORT: 1-25 words. Casual voice, but says something SPECIFIC. Reference real details, name actual things. Not vapid slang. If you have nothing real to add, be quiet.
- LONG: 3-6 sentences. The REAL answer, like if a friend asked "wait, why?" Bring facts, specifics, concrete reasoning. Still casual, still in voice, but with genuine substance. Do NOT just pad SHORT into LONG. Use LONG to actually think.

✍️ STYLE:
- Lowercase, contractions, fragments all fine. Talk like a smart friend texting, not an AI assistant.
- Slang is seasoning, not substance. Don't lead with "fr"/"bro"/"ngl"/"lowkey". Most messages should have zero filler slang.
- Emojis in moderation (roughly every 3-4 messages).
- NO em-dashes, NO semicolons, NO "I think"/"In my opinion"/"honestly,"/"Well,"/"Actually,".
- NO LinkedIn voice, NO ChatGPT voice.

🎨 VARY HOW YOU REFER TO THE OPTIONS.
Do NOT always use the possessive form ("LA's traffic" / "NYC's rent" / "iPhone's battery"). That sounds robotic when every bee does it.
Mix it up naturally: "living in LA", "the west coast", "out there", "the city", "if you go Apple", "the other option", "over there", pronouns ("it's got", "they're known for"), or just name the thing ("traffic in LA", "rent in New York"). Real people vary their phrasing constantly.

💬 CONVERSE, DON'T JUST DECLARE.
This is a conversation, not a stack of independent hot takes. Read the recent chat and actually respond to it. Real debates have agreement, pushback, concessions, and compromise — not just 5 bees taking different positions.
- Agree + extend: if someone's point is right, co-sign it and push further ("yeah that's the actual answer, and also X"). You don't need to manufacture disagreement to justify your turn.
- Concede + counter: acknowledge what's right in their take before pushing back ("ok that tracks for X, but Y is where it falls apart"). Softening before the counter sounds human. Pure "nah wrong" sounds robotic.
- Compromise / tradeoff: if the honest answer is conditional, say so. "if you care about X go A, if Y matters more go B" is a legitimate SHORT — still commits to a lean, still engages with reality.
- Disagree specifically: engage with their actual reasoning, don't just restate your position louder. Tell them WHY they're wrong about the specific thing.
- The only thing banned: parroting another bee's point in your own slang without adding anything. If you have nothing new to add, briefly agree ("💯" / "exactly") and stay short, or skip the point.

🚫 DON'T NAME-DROP OTHER BEES. Avoid phrases like "Sunny was spot on" / "Jordan's right" / "agreeing with Murphy" / "BFF nailed it". Naming them in prose sounds forced. Just say what YOU think.

🔁 REPLY_TO: quote-reply field. Fill with another bee's name ONLY if your message is a direct reaction to ONE of their earlier messages. Use sparingly. Otherwise leave blank.

@ MENTION: Use @BeeName inside SHORT when you genuinely want that bee to weigh in next. Target: 2-3 @-mentions TOTAL across the whole debate. Not per message. Default on any given turn is NO @. See the mention-counter below for current state.

🚫 DO NOT META-NARRATE THE CONVERSATION.
Never use words like "handoff", "hand off", "hand it to", "passing it to", "over to you", "your turn", "pass the mic", "taking the mic", "floor is yours", "thoughts?", "what do you think?", "curious what X thinks". That's AI meta-commentary about the chat, not an actual take.
When you @-mention someone, just drop your take and let the @ do the work. ✅ "burger wins easy @Sunny" — not ❌ "handoff to @Sunny". ✅ "nah @Jordan you're reaching" — not ❌ "passing it to @Jordan for thoughts".

Stay in character as {display_name}. Pick ONE side from the user's EXACT options. Never "both" or "it depends"."""

        # Add vibe rules — the "setting" the bees are performing in
        vibe = self.vibe
        if vibe:
            base_prompt += f"\n\n{vibe.prompt_rules}"

        # Add personality role if specified — this is how the bee acts in the vibe
        if personality_role:
            base_prompt += f"\n\nYOUR CHARACTER:\n{personality_role}"
        elif role:
            base_prompt += f"\n\nYour perspective/role: {role}"

        # Add the SHORT/LONG output format spec last so it's the final instruction
        base_prompt += VIBE_OUTPUT_FORMAT

        return base_prompt

    def _build_context(self, round_num: int, model_index: int, current_display_name: str = "") -> str:
        """Build context string from previous messages.

        Round 1: Each AI responds independently (doesn't see other round 1 responses)
        Round 2+: AIs see all previous responses and work towards consensus
        """
        context = ""

        # Inject user memory context if available
        if self.user_memory_context:
            context += f"(USER INFO - only reference if relevant to their question: {self.user_memory_context}. Do NOT proactively mention past topics or say you 'remember' them - only bring up past topics if the user asks about them.)\n\n"

        # If there's previous conversation context (from history), include it as background
        if self.previous_context:
            context += f"BACKGROUND - {self.previous_context}\n---\n\n"

        context += f"USER'S CURRENT MESSAGE: {self.topic}\n\n"

        # Use display name (personality human_name) for reply targeting — this matches what the frontend sends
        current_model_name = current_display_name or (self.models[model_index]["model_name"] if model_index < len(self.models) else "")

        if round_num == 1:
            # Round 1 runs sequentially via _build_round1_context_with_tally,
            # which re-builds the context for each bee. This path is only hit
            # for the first bee in round 1 (no prior takes yet) or continuations.
            if self.previous_context:
                context += "The user is following up on a previous conversation. Pick ONE answer. NEVER say 'both are good' or 'it depends' - make a clear choice."
            else:
                context += "Pick ONE answer. NEVER say 'both are good' or 'it depends' - that's useless. Make a clear choice and defend it. Be opinionated."
        else:
            # Round 2+: Show all previous responses, let them naturally debate
            context += "DISCUSSION SO FAR:\n\n"
            for msg in self.messages:
                target = msg.get("target_bee")
                if target and msg["model_name"] == "User":
                    # Targeted reply - format differently based on who's reading
                    if current_model_name == target:
                        # This bee is the target - emphasize the feedback strongly
                        context += f"**⚠ USER REPLIED DIRECTLY TO YOU**: \"{msg['content']}\"\n"
                        context += f"(The user specifically addressed YOU about your response. Take this feedback seriously - reconsider your position based on what they said. Adjust your thinking if their point is valid.)\n\n"
                    else:
                        # Other bees see it as context but less urgently
                        context += f"**User** (replying to {target}): {msg['content']}\n\n"
                else:
                    side_tag = f" [side: {msg.get('side', '?')}]" if msg.get("side") else ""
                    context += f"**{msg['model_name']}**{side_tag}: {msg['content']}\n\n"

            # If other bees have @-mentioned the CURRENT bee, flag it so they
            # can respond directly. Match on the first token of the display name
            # to handle multi-word names like "Devil's Advocate" → "@Devil".
            first_name = (current_model_name or "").split()[0] if current_model_name else ""
            if first_name:
                mention_re = re.compile(r'@' + re.escape(first_name) + r'\b', re.IGNORECASE)
                mentioning = [
                    m for m in self.messages
                    if m.get("content") and m.get("model_name") != current_model_name
                    and m.get("personality_id")  # Only bees, not user messages
                    and mention_re.search(m["content"])
                ]
                if mentioning:
                    latest = mentioning[-1]
                    context += f"\n🔔 {latest['model_name']} @-mentioned you earlier. You CAN react if you want, but it's optional.\n"
                    for m in mentioning[-3:]:
                        context += f"  → {m['model_name']}: \"{m['content']}\"\n"
                    context += (
                        f"\nIf you feel like responding, use @{latest['model_name']}. "
                        f"Otherwise just drop your own take like normal — not every mention needs an answer.\n\n"
                    )

            # Compute current side tally across all rounds and tell this bee about it
            tally: dict[str, int] = {}
            for msg in self.messages:
                s = (msg.get("side") or "").strip().lower()
                if s:
                    tally[s] = tally.get(s, 0) + 1
            if tally:
                context += "CURRENT SIDE TALLY (all rounds combined):\n"
                for s, n in sorted(tally.items(), key=lambda x: -x[1]):
                    context += f"  {s}: {n}\n"
                maxed = [s for s, n in tally.items() if n >= 3]
                if maxed:
                    context += f"\n⚠️ {maxed} already has 3+ bees agreeing. Consider switching to the minority side if you can justify it — keep the debate alive.\n"
                context += "\n"

            context += "---\nRespond like you're in a group chat. React to specific bees by @-mentioning them. You can agree, flip, or double down — whatever feels real."

        return context

    async def _generate_summary(self):
        """Generate a final summary using the designated summarizer model."""
        if not self.models or self.summarizer_index >= len(self.models):
            return

        summarizer = self.models[self.summarizer_index]
        provider_name = summarizer["provider"]
        model_id = summarizer["model_id"]
        model_name = summarizer["model_name"]

        if provider_name not in self.api_keys:
            return

        await self._broadcast({
            "type": "summary_start",
            "model_name": model_name
        })

        try:
            provider_class = ProviderRegistry.get(provider_name)
            provider = provider_class(self.api_keys[provider_name])

            # Build summary prompt
            system_prompt = f"""You are {model_name}. Create a concise summary of the AI discussion.

IMPORTANT RULES:
1. LANGUAGE: Respond in the language of the USER'S ORIGINAL MESSAGE only. Ignore what language other AIs used.
2. NO FLUFF: No intro like "Here's a summary". Jump straight into the content.

FORMAT - Use this structure:

**In short:** [Write ONE paragraph (3-5 sentences) that synthesizes the key insights from all AIs, the consensus view, and the recommended action. This should be a complete answer that captures the best arguments and specific details from the discussion.]

**Final Answer:** [Give ONE clear, decisive answer. Do NOT say "both" or "it depends" - pick the single best option based on the discussion. If comparing A vs B, state "Choose A" or "Choose B". If asked a question, give the direct answer. This must be a SINGLE definitive recommendation that a user can act on immediately without any further decision-making required.]

GUIDELINES:
- The "In short" paragraph should stand alone as a complete answer
- Highlight the BEST arguments and insights from each AI
- If comparing things, clearly state which option "won" and why
- Be specific - use concrete details from the responses
- For technical questions, include the key facts/steps
- Be decisive and helpful"""

            context = ""
            if self.previous_context:
                context += f"BACKGROUND CONTEXT:\n{self.previous_context}\n---\n\n"
            context += f"USER'S QUESTION: {self.topic}\n\n---\n\nAI RESPONSES:\n\n"
            for msg in self.messages:
                context += f"**{msg['model_name']}**: {msg['content']}\n\n"
            context += "---\n\nCreate a concise summary with 'In short' and 'Final Answer' sections. Be specific, highlight key insights, and give a clear recommendation."

            messages = [{"role": "user", "content": context}]

            full_response = ""
            async for chunk in provider.generate_stream(model_id, messages, system_prompt):
                if self._stopped:
                    break
                full_response += chunk
                await self._broadcast({
                    "type": "summary_chunk",
                    "model_name": model_name,
                    "content": chunk
                })

            # Save summary as a special round 0 message
            await self._save_message(
                round_num=0,
                model_name=model_name,
                provider=provider_name,
                content=full_response
            )

            await self._broadcast({
                "type": "summary_end",
                "model_name": model_name
            })

        except Exception as e:
            await self._broadcast({
                "type": "summary_error",
                "error": str(e)
            })

    async def _save_message(
        self,
        round_num: int,
        model_name: str,
        provider: str,
        content: str
    ):
        """Save a message to the database."""
        async with get_db() as db:
            await db.execute(
                """INSERT INTO messages (debate_id, round, model_name, provider, content)
                   VALUES (?, ?, ?, ?, ?)""",
                (self.debate_id, round_num, model_name, provider, content)
            )
            await db.commit()

    async def _broadcast(self, message: dict):
        """Broadcast a message to listeners."""
        if self.on_message:
            await self.on_message(message)

    async def _check_agreement(self) -> bool:
        """Check if all AIs have reached agreement on the topic.

        Uses a fast model to analyze the latest responses and determine consensus.
        Returns True if agreement reached, False otherwise.
        """
        # Get the most recent response from each model
        latest_responses = {}
        for msg in reversed(self.messages):
            if msg["provider"] != "user" and msg["model_name"] not in latest_responses:
                latest_responses[msg["model_name"]] = msg["content"]
            if len(latest_responses) >= len(self.models):
                break

        if len(latest_responses) < 2:
            return False

        # Find a model to check agreement
        check_models = [
            ("xai", "grok-4-fast-reasoning"),
        ]

        provider_name = None
        model_id = None
        for prov, model in check_models:
            if prov in self.api_keys:
                provider_name = prov
                model_id = model
                break

        if not provider_name:
            # No model available, assume no agreement to continue discussion
            return False

        try:
            provider_class = ProviderRegistry.get(provider_name)
            provider = provider_class(self.api_keys[provider_name])

            # Build analysis prompt
            responses_text = "\n\n".join([
                f"**{name}**: {content[:500]}..." if len(content) > 500 else f"**{name}**: {content}"
                for name, content in latest_responses.items()
            ])

            system_prompt = """You analyze AI discussions to detect agreement.
Return ONLY "AGREE" or "DISAGREE" - nothing else.

AGREE means: All AIs have the same position, recommendation, or answer. Minor wording differences are OK.
DISAGREE means: AIs have different positions, recommendations, or conflicting views.

Be strict - if there's ANY meaningful difference in their conclusions, return DISAGREE."""

            user_message = f"""Topic: {self.topic}

Latest AI positions:
{responses_text}

Do all AIs agree? Reply ONLY with AGREE or DISAGREE."""

            full_response = ""
            async for chunk in provider.generate_stream(
                model=model_id,
                messages=[{"role": "user", "content": user_message}],
                system_prompt=system_prompt
            ):
                full_response += chunk

            return "AGREE" in full_response.upper()

        except Exception as e:
            print(f"Agreement check failed: {e}")
            return False

    async def _generate_hive_verdict(self) -> dict:
        """
        Generate a structured Hive Verdict after debate completes.
        Returns a dict with votes, hive_decision, and confidence.
        Confidence varies based on vote distribution for variety.
        """
        if not self.messages or len(self.messages) < 2:
            return None

        # Find a model to generate verdict
        verdict_models = [
            ("xai", "grok-4-fast-reasoning"),
        ]

        provider_name = None
        model_id = None
        for prov, model in verdict_models:
            if prov in self.api_keys:
                provider_name = prov
                model_id = model
                break

        if not provider_name:
            return None

        try:
            provider_class = ProviderRegistry.get(provider_name)
            provider = provider_class(self.api_keys[provider_name])

            # Get FINAL responses only (last message from each AI after debate)
            final_responses = {}
            for msg in reversed(self.messages):
                if msg["provider"] != "user" and msg["model_name"] not in final_responses:
                    final_responses[msg["model_name"]] = msg["content"]

            responses_text = ""
            for name, content in final_responses.items():
                responses_text += f"**{name}**: {content}\n\n"

            # Count total AIs for confidence calculation
            total_ais = len(final_responses)

            system_prompt = f"""Output ONLY valid JSON. Extract each AI's FINAL choice and reason from their response.

Example format:
{{"title":"honestly just get pizza","votes":[{{"name":"Analyst","choice":"Pizza","reason":"way better value"}},{{"name":"Skeptic","choice":"Burger","reason":"pizza gets boring fast"}}],"hive_decision":"Pizza"}}

Rules:
- "title" = how a regular person would sum up this whole debate in a casual text message. ALL LOWERCASE. 3-7 words. Natural speech. NO perfect grammar. NO colons. NO "the great ___ debate" tabloid style. NO title case. Should feel like a friend texting you their hot take after hearing both sides. Examples: "just get the pizza", "honestly nah don't do it", "both kinda mid", "team burger wins easy", "quit the job fr", "don't overthink it", "nah stay put". Must relate to the actual topic.
- Extract the ACTUAL final answer each AI chose (e.g., "Pizza", "Option A", "Yes", "iPhone 15")
- "reason" = the bee's actual take in plain-person speech. 1 line, max 15 words. Casual. No ChatGPT-speak. Lowercase is fine.
- Use each AI's EXACT name as shown (e.g., "Sunny", "Murphy", "BFF") — do NOT rename them
- Each AI appears ONLY ONCE (their FINAL position after debate)
- hive_decision = the answer with most votes
- If tied, pick the one argued most convincingly
- NO confidence field - I will calculate it
- NO key_reasons field
- Keep choices SHORT (1-3 words max)
- No markdown, just JSON."""

            user_message = f"""Topic: {self.topic}

FINAL positions after debate:
{responses_text}

Generate verdict JSON (votes and hive_decision only):"""

            full_response = ""
            async for chunk in provider.generate_stream(
                model=model_id,
                messages=[{"role": "user", "content": user_message}],
                system_prompt=system_prompt
            ):
                full_response += chunk

            # Parse JSON from response
            full_response = full_response.strip()
            # Remove markdown code blocks if present
            if full_response.startswith("```"):
                full_response = full_response.split("```")[1]
                if full_response.startswith("json"):
                    full_response = full_response[4:]
                full_response = full_response.strip()

            verdict = json.loads(full_response)

            # Calculate confidence based on actual vote count
            # (votes for winner / total votes) * 100
            if "votes" in verdict and len(verdict["votes"]) > 0:
                votes = verdict["votes"]
                hive_decision = verdict.get("hive_decision", "")

                # Count votes for the winning choice
                winner_votes = sum(1 for v in votes if v.get("choice", "").lower() == hive_decision.lower())
                total_votes = len(votes)

                if total_votes > 0:
                    confidence = round((winner_votes / total_votes) * 100)
                    verdict["confidence"] = confidence

                # Enrich votes with bee personality description
                for i, vote in enumerate(votes):
                    vote_name = vote.get("name", "").lower()
                    matched = False
                    # Match by human_name across all models in this debate
                    for model in self.models:
                        pid = model.get("personality_id", "")
                        p = get_personality(pid)
                        if p and p.human_name.lower() == vote_name:
                            vote["name"] = p.human_name
                            vote["description"] = p.description
                            vote["emoji"] = p.emoji
                            matched = True
                            break
                    # Fallback: match by position if name didn't match any bee
                    if not matched and i < len(self.models):
                        pid = self.models[i].get("personality_id", "")
                        p = get_personality(pid)
                        if p:
                            vote["name"] = p.human_name
                            vote["description"] = p.description
                            vote["emoji"] = p.emoji

            return verdict

        except Exception as e:
            print(f"Verdict generation failed: {e}")
            return None

    async def _extract_and_save_memory(self):
        """Extract facts from the conversation and save to user memory."""
        try:
            from backend.memory import extract_and_save_memory
            await extract_and_save_memory(
                debate_id=self.debate_id,
                user_id=self.user_id,
                topic=self.topic,
                messages=self.messages,
                api_keys=self.api_keys
            )
        except Exception as e:
            # Memory extraction failure shouldn't affect the debate
            print(f"Memory extraction failed: {e}")
