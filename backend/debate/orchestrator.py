"""Debate orchestrator - manages the flow of debates."""
import asyncio
import json
from typing import AsyncGenerator, Callable, Optional
from backend.providers import ProviderRegistry
from backend.database import get_db


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
        user_memory_context: Optional[str] = None
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

            # Generate summary if not stopped
            if not self._stopped and self.models:
                await self._generate_summary()

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

            # Check if we have API key for this provider
            if provider_name not in self.api_keys:
                await self._broadcast({
                    "type": "model_error",
                    "model_name": model_name,
                    "provider": provider_name,
                    "error": f"No API key configured for {provider_name}"
                })
                continue

            await self._broadcast({
                "type": "model_start",
                "model_name": model_name,
                "provider": provider_name,
                "round": round_num
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
                    round_num=round_num
                )

                # Save message to database
                await self._save_message(
                    round_num=round_num,
                    model_name=model_name,
                    provider=provider_name,
                    content=content
                )

                # Store for context
                self.messages.append({
                    "round": round_num,
                    "model_name": model_name,
                    "provider": provider_name,
                    "content": content
                })

                await self._broadcast({
                    "type": "model_end",
                    "model_name": model_name,
                    "provider": provider_name,
                    "round": round_num
                })

            except Exception as e:
                await self._broadcast({
                    "type": "model_error",
                    "model_name": model_name,
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
        round_num: int
    ) -> str:
        """Get response from a model with streaming."""
        provider_class = ProviderRegistry.get(provider_name)
        provider = provider_class(self.api_keys[provider_name])

        # Build system prompt
        system_prompt = self._build_system_prompt(model_name, role, round_num)

        # Build messages
        messages = [{"role": "user", "content": context}]

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
                "model_name": model_name,
                "provider": provider_name,
                "content": chunk,
                "round": round_num
            })

        return full_response

    def _build_system_prompt(self, model_name: str, role: str, round_num: int) -> str:
        """Build system prompt for a model."""

        # Round 1: Be opinionated and form your own view
        if round_num == 1:
            base_prompt = f"""You are {model_name}. When asked who you are or what model you are, always say "{model_name}" - never use any other name.

You are participating in a discussion with other AI models. This is ROUND 1 - the goal is to share YOUR OWN genuine opinion.

IMPORTANT RULES:
1. IDENTITY: You are {model_name}. If asked your name or what model you are, say "{model_name}".

2. LANGUAGE: Respond in the language of the USER'S CURRENT MESSAGE only.

3. BE OPINIONATED: Share YOUR genuine perspective. Don't hedge or try to please everyone. Take a clear stance. If you disagree with other AIs, say so directly and explain why.

4. BE CONCISE: Keep your response short and focused - typically 3-6 sentences.

5. BE HUMAN: Talk naturally like a thoughtful friend would.

6. MAKE CLEAR CHOICES: When asked to compare or choose, clearly state YOUR choice and explain WHY with specific criteria.

7. DON'T JUST AGREE: If another AI already responded, don't just agree with them. Share what YOU think, even if it's different. Healthy disagreement leads to better answers."""

        # Round 2+: Now work towards middle ground
        else:
            base_prompt = f"""You are {model_name}. When asked who you are or what model you are, always say "{model_name}" - never use any other name.

You are participating in a discussion with other AI models. This is ROUND {round_num} - the goal is to find MIDDLE GROUND.

IMPORTANT RULES:
1. IDENTITY: You are {model_name}. If asked your name or what model you are, say "{model_name}".

2. LANGUAGE: Respond in the language of the USER'S CURRENT MESSAGE only.

3. FIND MIDDLE GROUND: You've all shared your opinions. Now look for common ground. What points do you agree on? Where can you compromise? Work towards a consensus that takes the best from each perspective.

4. ACKNOWLEDGE GOOD POINTS: If another AI made a good argument, acknowledge it. Be willing to update your position.

5. BE CONCISE: Keep your response short - typically 3-6 sentences.

6. BE SPECIFIC: When agreeing or compromising, explain exactly what you're agreeing on.

7. SIGNAL PROGRESS: Explicitly state what you agree on and what (if anything) you still disagree about."""

        if role:
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
            system_prompt = f"""You are {model_name}. Create a comprehensive summary that saves the user from having to read all the individual responses.

IMPORTANT RULES:
1. LANGUAGE: Respond in the language of the USER'S ORIGINAL MESSAGE only. Ignore what language other AIs used.
2. NO FLUFF: No intro like "Here's a summary". Jump straight into the content.

FORMAT - Use this structure:

## Key Positions

**[AI Name]**: [Their main point, reasoning, and any specific recommendations - 2-3 sentences capturing the essence of their argument]

**[AI Name]**: [Same format - capture their unique perspective and key arguments]

(repeat for each AI)

## Points of Agreement
[What did most or all AIs agree on? Highlight the consensus - this is valuable because if multiple AIs agree, it's likely reliable advice]

## Points of Disagreement
[Where did opinions diverge? Why? This helps the user understand the tradeoffs and make their own decision]

## The Bottom Line
[2-3 sentences with actionable advice. What should the user actually DO based on this discussion? If it's a comparison, give a clear recommendation. If it's a question, give a direct answer. Be decisive and helpful.]

---

**In short:** [Write ONE paragraph (3-5 sentences) that someone could read instead of everything above. Synthesize the key insights, the consensus view, and the recommended action into a single flowing paragraph. This is for users who just want the quick answer without reading sections.]

**Final Answer:** [Give ONE clear, decisive answer. Do NOT say "both" or "it depends" - pick the single best option based on the discussion. If comparing A vs B, state "Choose A" or "Choose B". If asked a question, give the direct answer. This must be a SINGLE definitive recommendation that a user can act on immediately without any further decision-making required.]

GUIDELINES:
- Make the summary WORTH reading - it should give more value than reading individual responses
- Highlight the BEST arguments and insights from each AI
- If comparing things, clearly state which option "won" and why
- Be specific - use concrete details from the responses
- For technical questions, include the key facts/steps
- For opinions, explain the reasoning behind different positions
- The "In short" paragraph should stand alone as a complete answer"""

            context = ""
            if self.previous_context:
                context += f"BACKGROUND CONTEXT:\n{self.previous_context}\n---\n\n"
            context += f"USER'S QUESTION: {self.topic}\n\n---\n\nAI RESPONSES:\n\n"
            for msg in self.messages:
                context += f"**{msg['model_name']}**: {msg['content']}\n\n"
            context += "---\n\nCreate a comprehensive summary following the format above. Make it valuable enough that the user doesn't need to read all the individual responses. Be specific, highlight key insights, and give a clear recommendation or answer."

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
