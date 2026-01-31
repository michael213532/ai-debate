"""Google Gemini provider implementation."""
from typing import AsyncGenerator
import google.generativeai as genai
from .base import BaseProvider


class GoogleProvider(BaseProvider):
    """Google Gemini API provider."""

    def __init__(self, api_key: str):
        super().__init__(api_key)
        genai.configure(api_key=api_key)

    async def generate_stream(
        self,
        model: str,
        messages: list[dict],
        system_prompt: str = ""
    ) -> AsyncGenerator[str, None]:
        """Generate streaming response from Google Gemini."""
        # Convert messages to Gemini format
        gemini_messages = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            gemini_messages.append({
                "role": role,
                "parts": [msg["content"]]
            })

        # Create model with system instruction
        generation_config = {"temperature": 0.7}
        model_instance = genai.GenerativeModel(
            model_name=model,
            generation_config=generation_config,
            system_instruction=system_prompt if system_prompt else None
        )

        # Start chat and generate response
        chat = model_instance.start_chat(history=gemini_messages[:-1] if len(gemini_messages) > 1 else [])
        last_message = gemini_messages[-1]["parts"][0] if gemini_messages else ""

        response = await chat.send_message_async(last_message, stream=True)
        async for chunk in response:
            if chunk.text:
                yield chunk.text

    async def test_connection(self) -> tuple[bool, str]:
        """Test Google API connection. Returns (success, error_message)."""
        try:
            model = genai.GenerativeModel("gemini-pro")
            await model.generate_content_async("Hi", stream=False)
            return True, ""
        except Exception as e:
            return False, f"{type(e).__name__}: {e}"
