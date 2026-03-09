"""DALL-E icon generation service for custom bees."""
import base64
import httpx
from typing import Optional


STYLE_PROMPT = """A single cute kawaii bee mascot character, exactly like a Japanese chibi bee sticker.

THE BEE MUST LOOK EXACTLY LIKE THIS:
- Perfectly round head attached to oval/egg-shaped body
- Head and body are BRIGHT LEMON YELLOW (#FFEB3B)
- THREE thick horizontal DARK BROWN (#3E2723) stripes across the body
- Face has TWO small black dot eyes, a tiny "u" shaped smile, and light pink circular blush marks on cheeks
- TWO small off-white/cream colored wings on the back with thin dark brown outlines
- TWO thin curved dark brown antennae sticking up from head
- Small dark brown legs at bottom
- THICK dark brown outline around entire bee
- Style is COMPLETELY FLAT with solid colors, like a vinyl sticker or LINE emoji
- WHITE background only, nothing else

This bee represents: {bee_name} - {description}

Add a tiny visual element that suggests the personality (like small glasses for smart, tiny crown for leader, etc) but keep the core bee design identical.

DO NOT add text, complex backgrounds, realistic shading, 3D effects, or change the basic bee shape."""


async def generate_bee_icon(
    openai_api_key: str,
    bee_name: str,
    description: str,
    size: str = "256x256"
) -> Optional[str]:
    """
    Generate a bee icon using DALL-E 3.

    Args:
        openai_api_key: User's OpenAI API key
        bee_name: Name of the bee (e.g., "The Strategist")
        description: Description of the bee's personality
        size: Image size (256x256, 512x512, or 1024x1024)

    Returns:
        Base64-encoded PNG image, or None if generation failed
    """
    if not openai_api_key:
        return None

    prompt = STYLE_PROMPT.format(
        bee_name=bee_name,
        description=description[:200]  # Limit description length
    )

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/images/generations",
                headers={
                    "Authorization": f"Bearer {openai_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "dall-e-3",
                    "prompt": prompt,
                    "n": 1,
                    "size": "1024x1024",  # DALL-E 3 minimum size
                    "response_format": "b64_json",
                    "quality": "standard"
                }
            )

            if response.status_code != 200:
                print(f"DALL-E API error: {response.status_code} - {response.text}")
                return None

            data = response.json()
            if "data" in data and len(data["data"]) > 0:
                return data["data"][0].get("b64_json")

            return None

    except httpx.TimeoutException:
        print("DALL-E API timeout")
        return None
    except Exception as e:
        print(f"DALL-E generation error: {e}")
        return None


async def check_openai_key_valid(api_key: str) -> bool:
    """Check if an OpenAI API key is valid by making a simple API call."""
    if not api_key:
        return False

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"}
            )
            return response.status_code == 200
    except Exception:
        return False
