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
        on_message: Callable[[dict], None]
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
        # Build context from previous rounds
        context = self._build_context(round_num)

        # Each model responds
        for model_config in self.models:
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

        # Stream response
        full_response = ""
        async for chunk in provider.generate_stream(model_id, messages, system_prompt):
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
        base_prompt = f"You are {model_name} participating in a structured debate."

        if role:
            base_prompt += f" Your assigned perspective/role is: {role}."

        if round_num == 1:
            base_prompt += " This is Round 1. Provide your initial thoughts on the topic."
        elif round_num == self.rounds:
            base_prompt += f" This is the final round (Round {round_num}). Work toward a synthesis or conclusion, acknowledging points of agreement and remaining disagreements."
        else:
            base_prompt += f" This is Round {round_num}. Respond to the other participants' arguments, refine your position, and engage constructively with different viewpoints."

        base_prompt += " Be concise but thorough. Focus on substance over rhetoric."

        return base_prompt

    def _build_context(self, round_num: int) -> str:
        """Build context string from previous messages."""
        context = f"DEBATE TOPIC: {self.topic}\n\n"

        if round_num == 1:
            context += "Please provide your initial response to this topic."
        else:
            context += "PREVIOUS DISCUSSION:\n\n"
            for msg in self.messages:
                context += f"[Round {msg['round']}] {msg['model_name']}:\n{msg['content']}\n\n"
            context += f"---\nPlease provide your Round {round_num} response, engaging with the above discussion."

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
            system_prompt = f"You are {model_name}. Your task is to provide a balanced summary of the debate that just concluded. Highlight key arguments, points of agreement, remaining disagreements, and any conclusions reached."

            context = f"DEBATE TOPIC: {self.topic}\n\nFULL DEBATE TRANSCRIPT:\n\n"
            for msg in self.messages:
                context += f"[Round {msg['round']}] {msg['model_name']}:\n{msg['content']}\n\n"
            context += "---\nPlease provide a concise summary of this debate."

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
