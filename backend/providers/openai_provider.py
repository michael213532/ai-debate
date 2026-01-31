"""OpenAI provider implementation."""
from typing import AsyncGenerator
from openai import AsyncOpenAI
from .base import BaseProvider


class OpenAIProvider(BaseProvider):
    """OpenAI API provider."""

    def __init__(self, api_key: str):
        super().__init__(api_key)
        self.client = AsyncOpenAI(api_key=api_key)

    async def generate_stream(
        self,
        model: str,
        messages: list[dict],
        system_prompt: str = ""
    ) -> AsyncGenerator[str, None]:
        """Generate streaming response from OpenAI."""
        all_messages = []
        if system_prompt:
            all_messages.append({"role": "system", "content": system_prompt})
        all_messages.extend(messages)

        stream = await self.client.chat.completions.create(
            model=model,
            messages=all_messages,
            stream=True
        )

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def test_connection(self) -> bool:
        """Test OpenAI API connection."""
        try:
            await self.client.models.list()
            return True
        except Exception:
            return False
