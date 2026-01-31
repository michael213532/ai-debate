"""Anthropic provider implementation."""
from typing import AsyncGenerator
import anthropic
from .base import BaseProvider


class AnthropicProvider(BaseProvider):
    """Anthropic API provider."""

    def __init__(self, api_key: str):
        super().__init__(api_key)
        self.client = anthropic.AsyncAnthropic(api_key=api_key)

    async def generate_stream(
        self,
        model: str,
        messages: list[dict],
        system_prompt: str = ""
    ) -> AsyncGenerator[str, None]:
        """Generate streaming response from Anthropic."""
        async with self.client.messages.stream(
            model=model,
            max_tokens=4096,
            system=system_prompt if system_prompt else "",
            messages=messages
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def test_connection(self) -> bool:
        """Test Anthropic API connection."""
        try:
            # Use claude-3-haiku as it's cheapest and most available
            await self.client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=10,
                messages=[{"role": "user", "content": "Hi"}]
            )
            return True
        except Exception as e:
            print(f"Anthropic test error: {type(e).__name__}: {e}")
            return False
