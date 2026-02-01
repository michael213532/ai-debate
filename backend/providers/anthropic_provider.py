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
        system_prompt: str = "",
        image: dict = None
    ) -> AsyncGenerator[str, None]:
        """Generate streaming response from Anthropic."""
        # Process messages, adding image to first user message if provided
        processed_messages = []
        for i, msg in enumerate(messages):
            if image and i == 0 and msg["role"] == "user":
                # Add image to first user message (Anthropic format)
                content = [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": image["media_type"],
                            "data": image["base64"]
                        }
                    },
                    {"type": "text", "text": msg["content"]}
                ]
                processed_messages.append({"role": "user", "content": content})
            else:
                processed_messages.append(msg)

        async with self.client.messages.stream(
            model=model,
            max_tokens=4096,
            system=system_prompt if system_prompt else "",
            messages=processed_messages
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def test_connection(self) -> tuple[bool, str]:
        """Test Anthropic API connection. Returns (success, error_message)."""
        try:
            # Use claude-3-haiku as it's cheapest and most available
            await self.client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=10,
                messages=[{"role": "user", "content": "Hi"}]
            )
            return True, ""
        except Exception as e:
            return False, f"{type(e).__name__}: {e}"
