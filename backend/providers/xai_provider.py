"""xAI (Grok) provider implementation."""
from typing import AsyncGenerator
import httpx
from .base import BaseProvider


class XAIProvider(BaseProvider):
    """xAI (Grok) API provider."""

    BASE_URL = "https://api.x.ai/v1"

    def __init__(self, api_key: str):
        super().__init__(api_key)

    async def generate_stream(
        self,
        model: str,
        messages: list[dict],
        system_prompt: str = "",
        images: list = None  # xAI doesn't support vision, images ignored
    ) -> AsyncGenerator[str, None]:
        """Generate streaming response from xAI."""
        all_messages = []
        if system_prompt:
            all_messages.append({"role": "system", "content": system_prompt})
        all_messages.extend(messages)

        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{self.BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": all_messages,
                    "stream": True
                },
                timeout=60.0
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        import json
                        chunk = json.loads(data)
                        if chunk["choices"][0]["delta"].get("content"):
                            yield chunk["choices"][0]["delta"]["content"]

    async def fetch_grounding(self, topic: str, model: str = "grok-4-fast-reasoning") -> str:
        """Fetch grounded background facts for a topic via xAI Responses API + web_search.

        Returns a short factual brief (or empty string if no fresh facts are needed
        or the call fails). Bees can then reference these facts instead of guessing.
        Cost is incurred only when web_search actually fires (tool_choice=auto).
        """
        instructions = (
            "You are a research assistant producing a short factual brief for an AI debate. "
            "If the user's question depends on current, real-world information (people, "
            "products, prices, events, dates, statistics, current state of things), search "
            "the web and return 2-4 short bullet points of verified facts that the debaters "
            "should know. If the question is opinion- or values-based and does not depend on "
            "current facts, return exactly the string NO_FACTS_NEEDED. Do not editorialize. "
            "Do not give recommendations. Bullet points only or NO_FACTS_NEEDED."
        )
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.BASE_URL}/responses",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model,
                        "instructions": instructions,
                        "input": [{"role": "user", "content": topic}],
                        "tools": [{"type": "web_search", "search_context_size": "low"}],
                        "tool_choice": "auto",
                        "max_tool_calls": 2,  # cap web_search calls to keep cost predictable
                        "stream": False
                    },
                    timeout=45.0
                )
                if resp.status_code != 200:
                    return ""
                data = resp.json()
                # Walk the output array for the assistant message
                text_parts = []
                for item in data.get("output", []):
                    if item.get("type") == "message":
                        for c in item.get("content", []):
                            if c.get("type") == "output_text":
                                text_parts.append(c.get("text", ""))
                text = "\n".join(p for p in text_parts if p).strip()
                if not text or "NO_FACTS_NEEDED" in text:
                    return ""
                return text
        except Exception:
            return ""

    async def test_connection(self) -> tuple[bool, str]:
        """Test xAI API connection. Returns (success, error_message)."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "grok-4-fast-reasoning",
                        "messages": [{"role": "user", "content": "Hi"}],
                        "max_tokens": 10
                    },
                    timeout=30.0
                )
                if response.status_code == 200:
                    return True, ""
                return False, f"HTTP {response.status_code}: {response.text}"
        except Exception as e:
            return False, f"{type(e).__name__}: {e}"
