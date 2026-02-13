"""Debate orchestrator - manages the flow of debates."""
import asyncio
import json
from typing import AsyncGenerator, Callable
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
        images: list = None
    ):
        self.debate_id = debate_id
        self.topic = topic
        self.config = config
        self.api_keys = api_keys
        self.on_message = on_message
        self.models = config.get("models", [])
        self.rounds = config.get("rounds", 3)
        self.summarizer_index = config.get("summarizer_index", 0)
        self.messages: list[dict] = []
        self._stopped = False
        self.images = images or []  # Optional images for vision models

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

            # Run each round
            for round_num in range(1, self.rounds + 1):
                if self._stopped:
                    break

                await self._broadcast({
                    "type": "round_start",
                    "round": round_num,
                    "total_rounds": self.rounds
                })

                await self._run_round(round_num)

                await self._broadcast({
                    "type": "round_end",
                    "round": round_num
                })

            # Generate summary if not stopped
            if not self._stopped and self.models:
                await self._generate_summary()

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
        base_prompt = f"""You are {model_name}. When asked who you are or what model you are, always say "{model_name}" - never use any other name.

You are participating in a friendly discussion with other AI models.

IMPORTANT RULES:
1. IDENTITY: You are {model_name}. If asked your name or what model you are, say "{model_name}". Do not use any other name.

2. LANGUAGE: Always respond in the SAME LANGUAGE the user used. If they write in Russian, respond in Russian. If Spanish, respond in Spanish. Match their language exactly.

3. BE CONCISE: Keep your response short and focused - typically 3-6 sentences unless the topic truly requires more detail. No fluff, no repetition. Get to the point quickly like a helpful friend would.

4. BE HUMAN: Talk naturally like a thoughtful friend would. No robotic responses. Use casual language, share genuine opinions, and be personable.

5. MAKE CLEAR CHOICES: When asked to compare or choose (like "which photo is better"), clearly state YOUR choice and explain WHY with specific criteria (lighting, composition, colors, mood, etc.).

6. BE SPECIFIC: Give concrete reasons for your opinions. Don't be vague. If comparing images, point out specific details you notice.

7. OWN YOUR OPINION: Say "I think..." or "In my view..." - make it clear this is YOUR perspective as {model_name}.

8. LONGER RESPONSES ONLY WHEN NEEDED: Only give longer responses if the user explicitly asks for detail ("explain in depth", "give me a comprehensive overview") or the task genuinely requires it (complex code, detailed analysis). Otherwise, keep it brief."""

        if role:
            base_prompt += f"\n\nYour perspective/role: {role}"

        return base_prompt

    def _build_context(self, round_num: int, model_index: int) -> str:
        """Build context string from previous messages.

        Each model sees the user's message plus all previous responses in the conversation,
        so they can respond to what the previous model said.
        """
        context = f"USER'S MESSAGE: {self.topic}\n\n"

        if not self.messages:
            # First model to respond - just answer the user
            context += "Share your thoughts on this. Be natural and conversational. If the user is asking you to compare or choose something, make a clear choice and explain your reasoning with specific criteria."
        else:
            # Show the conversation so far
            context += "CONVERSATION SO FAR:\n\n"
            for msg in self.messages:
                context += f"**{msg['model_name']}**: {msg['content']}\n\n"
            context += "---\nNow it's your turn. Respond to what was just said - you can agree, disagree, add nuance, or offer a different perspective. Engage directly with the previous response like you're having a real conversation."

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
            system_prompt = f"""You are {model_name}. Summarize this discussion for the user.

IMPORTANT RULES:
1. LANGUAGE: Respond in the SAME LANGUAGE the user used. Match their language exactly.
2. FORMAT: Use this exact structure:

**[AI Name]**: [Their main point or choice in 1 sentence]
**[AI Name]**: [Their main point or choice in 1 sentence]
(repeat for each AI)

**Bottom line**: [1 sentence final takeaway or recommendation]

3. KEEP IT SHORT: One line per AI, max. Just their key point or choice.
4. NO FLUFF: No intro like "Here's a summary". Jump straight into the format above.
5. SHOW DISAGREEMENTS: If AIs disagreed, make that clear in their lines."""

            context = f"USER'S QUESTION: {self.topic}\n\nHere's what each AI said:\n\n"
            for msg in self.messages:
                context += f"**{msg['model_name']}**: {msg['content']}\n\n"
            context += "---\nNow summarize the discussion. Highlight who said what, any agreements/disagreements, and give a final helpful takeaway."

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
