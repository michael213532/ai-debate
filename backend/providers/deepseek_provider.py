"""Deepseek provider implementation."""
from typing import AsyncGenerator
import httpx
from .base import BaseProvider


class DeepseekProvider(BaseProvider):
    """Deepseek API provider."""

    BASE_URL = "https://api.deepseek.com/v1"

    def __init__(self, api_key: str):
        super().__init__(api_key)

    async def generate_stream(
        self,
        model: str,
        messages: list[dict],
        system_prompt: str = "",
        images: list = None  # Deepseek doesn't support vision, images ignored
    ) -> AsyncGenerator[str, None]:
        """Generate streaming response from Deepseek."""
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

    async def test_connection(self) -> tuple[bool, str]:
        """Test Deepseek API connection. Returns (success, error_message)."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "deepseek-chat",
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
