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
        system_prompt: str = "",
        image: dict = None
    ) -> AsyncGenerator[str, None]:
        """Generate streaming response from OpenAI."""
        all_messages = []
        if system_prompt:
            all_messages.append({"role": "system", "content": system_prompt})

        # Process messages, adding image to first user message if provided
        for i, msg in enumerate(messages):
            if image and i == 0 and msg["role"] == "user":
                # Add image to first user message
                content = [
                    {"type": "text", "text": msg["content"]},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{image['media_type']};base64,{image['base64']}"
                        }
                    }
                ]
                all_messages.append({"role": "user", "content": content})
            else:
                all_messages.append(msg)

        stream = await self.client.chat.completions.create(
            model=model,
            messages=all_messages,
            stream=True
        )

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def test_connection(self) -> tuple[bool, str]:
        """Test OpenAI API connection. Returns (success, error_message)."""
        try:
            await self.client.models.list()
            return True, ""
        except Exception as e:
            return False, f"{type(e).__name__}: {e}"
