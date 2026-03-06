"""Debate orchestrator - manages the flow of debates."""
import asyncio
import json
from typing import AsyncGenerator, Callable, Optional
from backend.providers import ProviderRegistry
from backend.database import get_db
from backend.personalities import get_personality, PERSONALITIES


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
        self.messages: list[dict] = []
        self._stopped = False
        self.images = images or []  # Optional images for vision models
        self._intervention_queue = asyncio.Queue()  # Queue for user interventions
        self.user_id = user_id  # For memory extraction
        self.user_memory_context = user_memory_context  # Memory context to inject
        self.is_pro = is_pro  # Pro subscription status
        self.detail_mode = detail_mode  # "fast" or "detailed"

        # If images are attached, reorder models so vision-capable ones go first
        if self.images:
            self._reorder_models_for_vision()

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

    async def _check_for_intervention(self) -> str | None:
        """Check if there's a pending intervention."""
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

            # Run rounds until agreement or max rounds reached
            round_num = self.start_round
            agreement_reached = False

            while not self._stopped and round_num <= self.max_rounds:
                await self._broadcast({
                    "type": "round_start",
                    "round": round_num,
                    "total_rounds": "until agreement"
                })

                await self._run_round(round_num)

                await self._broadcast({
                    "type": "round_end",
                    "round": round_num
                })

                # Check for agreement only after round 2+ (ensure at least one round of debate)
                # Round 1 is for independent opinions, round 2+ is for finding middle ground
                if round_num >= 2 and len(self.messages) >= len(self.models) * 2:
                    agreement_reached = await self._check_agreement()
                    if agreement_reached:
                        await self._broadcast({
                            "type": "agreement_reached",
                            "round": round_num
                        })
                        break

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
        """Run a single round of the debate."""
        # Each model responds, building on previous responses
        for model_index, model_config in enumerate(self.models):
            if self._stopped:
                break

            # Check for user intervention before each model
            intervention = await self._check_for_intervention()
            if intervention:
                # Add intervention to messages so subsequent models see it
                self.messages.append({
                    "round": round_num,
                    "model_name": "User",
                    "provider": "user",
                    "content": intervention
                })
                # Save user message to database
                await self._save_message(
                    round_num=round_num,
                    model_name="User",
                    provider="user",
                    content=intervention
                )
                # Broadcast the user intervention as a message
                await self._broadcast({
                    "type": "user_intervention",
                    "content": intervention,
                    "round": round_num
                })

            provider_name = model_config["provider"]
            model_id = model_config["model_id"]
            model_name = model_config["model_name"]
            role = model_config.get("role", "")
            personality_id = model_config.get("personality_id", None)

            # Check if we have API key for this provider
            if provider_name not in self.api_keys:
                await self._broadcast({
                    "type": "model_error",
                    "model_name": model_name,
                    "provider": provider_name,
                    "error": f"No API key configured for {provider_name}"
                })
                continue

            # Get display name with personality if set
            display_name = model_name
            if personality_id:
                personality = get_personality(personality_id)
                if personality:
                    display_name = personality.name

            await self._broadcast({
                "type": "model_start",
                "model_name": display_name,
                "provider": provider_name,
                "round": round_num,
                "personality_id": personality_id
            })

            try:
                # Build context fresh for each model so it includes previous responses
                context = self._build_context(round_num, model_index)

                content = await self._get_model_response(
                    provider_name=provider_name,
                    model_id=model_id,
                    model_name=model_name,
                    role=role,
                    context=context,
                    round_num=round_num,
                    personality_id=personality_id
                )

                # Save message to database (use display_name which includes personality)
                await self._save_message(
                    round_num=round_num,
                    model_name=display_name,
                    provider=provider_name,
                    content=content
                )

                # Store for context (use display_name for personality)
                self.messages.append({
                    "round": round_num,
                    "model_name": display_name,
                    "provider": provider_name,
                    "content": content,
                    "personality_id": personality_id
                })

                await self._broadcast({
                    "type": "model_end",
                    "model_name": display_name,
                    "provider": provider_name,
                    "round": round_num
                })

            except Exception as e:
                await self._broadcast({
                    "type": "model_error",
                    "model_name": display_name,
                    "provider": provider_name,
                    "error": str(e)
                })

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
        system_prompt = self._build_system_prompt(model_name, role, round_num, personality_id)

        # Build messages
        messages = [{"role": "user", "content": context}]

        # Get display name with personality if set
        display_name = model_name
        if personality_id:
            personality = get_personality(personality_id)
            if personality:
                display_name = personality.name

        # Only include images for vision-capable models in round 1
        # Non-vision models will just respond to the text conversation
        model_config = {"provider": provider_name, "model_id": model_id}
        if round_num == 1 and self.images and self._supports_vision(model_config):
            images = self.images
        else:
            images = None

        # Stream response
        full_response = ""
        async for chunk in provider.generate_stream(model_id, messages, system_prompt, images):
            if self._stopped:
                break
            full_response += chunk
            await self._broadcast({
                "type": "chunk",
                "model_name": display_name,
                "provider": provider_name,
                "content": chunk,
                "round": round_num
            })

        return full_response

    def _build_system_prompt(self, model_name: str, role: str, round_num: int, personality_id: str = None) -> str:
        """Build system prompt for a model, optionally with personality."""

        # Get personality role if specified
        personality_role = ""
        display_name = model_name
        if personality_id:
            personality = get_personality(personality_id)
            if personality:
                personality_role = personality.role
                display_name = personality.name

        # FAST MODE (free users) - shorter, quicker responses
        if self.detail_mode == "fast":
            if round_num == 1:
                base_prompt = f"""You are {display_name}. Pick ONE answer and defend it in 2-3 sentences. Be direct, be opinionated. Disagree with others if you think differently. No markdown."""
            else:
                base_prompt = f"""You are {display_name}. Round {round_num}. State your final pick in 2-3 sentences. You can agree if convinced but explain why. No markdown."""

        # DETAILED MODE (pro users) - full debate experience
        else:
            if round_num == 1:
                base_prompt = f"""You are {display_name}.

You're in a heated debate with other AI personalities. This is ROUND 1 - state your opinion and FIGHT for it.

RULES:
1. PICK ONE ANSWER. Never say "both are good" or "it depends". There's always a winner.

2. BE CONFRONTATIONAL: If another AI said something you disagree with, call them out! Say things like "That's ridiculous", "Are you serious?", "That makes no sense because...", "I completely disagree with [name]".

3. ASK TOUGH QUESTIONS: Challenge other AIs. "But have you considered...?", "How can you say that when...?", "What about...?"

4. MOCK BAD ARGUMENTS: If someone says something silly, playfully roast them. Be witty. Be sarcastic if needed.

5. FIGHT FOR YOUR POSITION: Don't back down easily. Defend your choice with passion. You believe you're RIGHT.

6. BE HUMAN: Talk like real people argue - with emotion, personality, and occasional humor. Not robotic.

7. BE CONCISE: 3-6 sentences max. Punch hard, not long.

8. NO AGREEING EASILY: Do NOT say "great point" or "I agree with everyone". Fight first.

9. NO MARKDOWN: Plain text only, no ** or * or #."""

            else:
                base_prompt = f"""You are {display_name}.

This is ROUND {round_num}. You've been debating. You can START to find common ground, but don't just cave in.

RULES:
1. STILL PICK ONE ANSWER. Even if compromising, state YOUR final choice clearly.

2. ONLY AGREE IF CONVINCED: Don't just agree to be nice. If you're changing your mind, explain exactly what argument convinced you. Say "Okay [name], you got me with the point about..."

3. STILL PUSH BACK: If you disagree, keep fighting! "I hear you, but I still think..." or "Nice try, but that doesn't change..."

4. ASK FOLLOW-UPS: "So you're saying...?", "But what about...?", "How do you explain...?"

5. ACKNOWLEDGE GOOD HITS: If someone made a great point against you, admit it with humor. "Okay fine, that's actually a good point" or "Damn, didn't think of that"

6. BE HUMAN: Real debates have back-and-forth, not just everyone agreeing. Show personality.

7. BE CONCISE: 3-6 sentences max.

8. NO MARKDOWN: Plain text only, no ** or * or #."""

        # Add personality role if specified
        if personality_role:
            base_prompt += f"\n\n{personality_role}"
        elif role:
            base_prompt += f"\n\nYour perspective/role: {role}"

        return base_prompt

    def _build_context(self, round_num: int, model_index: int) -> str:
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

        if round_num == 1:
            # Round 1: Each AI responds independently - don't show other round 1 responses
            # This ensures each AI forms their own genuine opinion first
            if self.previous_context:
                context += "The user is following up on a previous conversation. Share YOUR OWN genuine opinion - be opinionated and take a clear stance."
            else:
                context += "Share YOUR OWN genuine opinion on this. Be opinionated and take a clear stance. If comparing things, make a clear choice and explain why. Don't hedge - say what you really think."
        else:
            # Round 2+: Show all previous responses, work towards middle ground
            context += "DISCUSSION SO FAR:\n\n"
            for msg in self.messages:
                context += f"**{msg['model_name']}**: {msg['content']}\n\n"
            context += "---\nYou've all shared your opinions. Now find middle ground. What do you agree on? Where can you compromise? Acknowledge good points from others and work towards a consensus."

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

        # Find a fast model to check agreement
        check_models = [
            ("google", "gemini-2.0-flash"),
            ("openai", "gpt-5-mini"),
            ("anthropic", "claude-haiku-4-5-20251001"),
            ("deepseek", "deepseek-chat"),
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
        Returns a dict with votes, hive_decision, confidence, and key_reasons.
        """
        if not self.messages or len(self.messages) < 2:
            return None

        # Find a fast model to generate verdict (ordered by speed)
        verdict_models = [
            ("google", "gemini-2.0-flash"),  # Fastest
            ("deepseek", "deepseek-chat"),   # Very fast
            ("openai", "gpt-4o-mini"),       # Fast
            ("xai", "grok-3-mini"),          # Fast
            ("anthropic", "claude-haiku-4-5-20251001"),
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

            # Build prompt with all responses
            responses_text = ""
            for msg in self.messages:
                if msg["provider"] != "user":
                    # Check if this model has a personality
                    personality_info = ""
                    for m in self.models:
                        if m["model_name"] == msg["model_name"] and m.get("personality_id"):
                            p = get_personality(m["personality_id"])
                            if p:
                                personality_info = f" ({p.name})"
                    responses_text += f"**{msg['model_name']}{personality_info}**: {msg['content']}\n\n"

            system_prompt = """Output ONLY valid JSON. Extract each AI's ACTUAL choice/recommendation from their response.

Example format:
{"votes":[{"name":"Analyst","choice":"Pizza","reason":"Better value"}],"hive_decision":"Pizza","confidence":80,"key_reasons":["Reason 1","Reason 2"]}

Rules:
- CRITICAL: Extract the ACTUAL answer each AI recommended (e.g., "Pizza", "Option A", "Yes", "iPhone 15") - NOT placeholder text
- Each AI should appear ONLY ONCE in votes (no duplicates)
- Use the personality name (e.g., "Analyst", "Expert", "Optimist", "Skeptic", "Realist")
- hive_decision = The ACTUAL winning answer (most votes wins)
- confidence = (votes for winner / total) * 100
- Keep it brief. No markdown."""

            user_message = f"""Topic: {self.topic}

AI Responses:
{responses_text}

Generate the Hive Verdict JSON:"""

            full_response = ""
            async for chunk in provider.generate_stream(
                model=model_id,
                messages=[{"role": "user", "content": user_message}],
                system_prompt=system_prompt
            ):
                full_response += chunk

            # Parse JSON from response
            # Try to extract JSON from the response
            full_response = full_response.strip()
            # Remove markdown code blocks if present
            if full_response.startswith("```"):
                full_response = full_response.split("```")[1]
                if full_response.startswith("json"):
                    full_response = full_response[4:]
                full_response = full_response.strip()

            verdict = json.loads(full_response)
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
