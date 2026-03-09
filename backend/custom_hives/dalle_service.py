"""Icon generation service for custom bees using Stability AI img2img."""
import base64
import httpx
import io
from typing import Optional
from pathlib import Path


# Cache for reference image
_REFERENCE_BEE_BYTES = None


def get_reference_bee_bytes() -> Optional[bytes]:
    """Load the reference bee image bytes from file."""
    global _REFERENCE_BEE_BYTES
    if _REFERENCE_BEE_BYTES:
        return _REFERENCE_BEE_BYTES

    # Try multiple possible locations
    possible_paths = [
        Path(__file__).parent / "assets" / "reference_bee.png",
        Path(__file__).parent.parent.parent / "frontend" / "images" / "bee-icon.png",
        Path("C:/Users/micha/Downloads/bee icons/default bee icon.png"),
    ]

    for path in possible_paths:
        if path.exists():
            try:
                with open(path, "rb") as f:
                    _REFERENCE_BEE_BYTES = f.read()
                    return _REFERENCE_BEE_BYTES
            except Exception:
                continue

    return None


async def generate_bee_icon_stability(
    stability_api_key: str,
    bee_name: str,
    description: str,
) -> Optional[str]:
    """
    Generate a bee icon using Stability AI image-to-image.

    This takes the reference bee image and modifies it slightly to add
    personality-specific accessories while keeping the same style.
    """
    reference_bytes = get_reference_bee_bytes()
    if not reference_bytes:
        print("No reference bee image found")
        return None

    prompt = f"""Transform this bee into "{bee_name}" personality: {description[:150]}.

Add a PROMINENT accessory that defines this character - like a top hat, reading glasses, chef hat, headphones, crown, wizard hat, or tool they would use.

The accessory should be the main visual difference. Keep the cute kawaii bee style with yellow body, brown stripes, and white background."""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Stability AI image-to-image endpoint
            response = await client.post(
                "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image",
                headers={
                    "Authorization": f"Bearer {stability_api_key}",
                    "Accept": "application/json",
                },
                files={
                    "init_image": ("bee.png", reference_bytes, "image/png"),
                },
                data={
                    "text_prompts[0][text]": prompt,
                    "text_prompts[0][weight]": "1",
                    "text_prompts[1][text]": "realistic, 3D, complex background, shadows, text, watermark",
                    "text_prompts[1][weight]": "-1",
                    "cfg_scale": "7",
                    "samples": "1",
                    "steps": "30",
                    "image_strength": "0.75",  # More creativity to add accessories
                }
            )

            if response.status_code != 200:
                print(f"Stability API error: {response.status_code} - {response.text}")
                return None

            data = response.json()
            if "artifacts" in data and len(data["artifacts"]) > 0:
                return data["artifacts"][0].get("base64")

            return None

    except httpx.TimeoutException:
        print("Stability API timeout")
        return None
    except Exception as e:
        print(f"Stability generation error: {e}")
        return None


FALLBACK_STYLE_PROMPT = """Create a cute kawaii cartoon bee character icon, EXACTLY matching this specific style:

BODY SHAPE & PROPORTIONS:
- Round yellow head (bright lemon yellow #F7E14D), perfectly circular
- Oval body below head with 3 thick dark brown (#5D4037) horizontal stripes alternating with bright yellow
- Chibi proportions: head is slightly larger than body

FACIAL FEATURES:
- Two simple solid black dot eyes (small circles)
- Tiny curved smile line below eyes
- Two rosy pink circular blush marks on cheeks
- Two dark brown curved antennae on top of head

LIMBS & WINGS:
- Four tiny dark brown stick limbs
- Two small cream/off-white rounded wings

STYLE:
- PURE WHITE background, no shadows
- Flat 2D illustration, like a LINE sticker
- Thick dark brown outlines
- No 3D effects, no textures

This bee's personality is "{bee_name}" - {description}

Add ONE small accessory to show personality. Keep the EXACT same style and colors."""


async def generate_bee_icon_dalle(
    openai_api_key: str,
    bee_name: str,
    description: str,
) -> Optional[str]:
    """Fallback: Generate bee icon using DALL-E 3 (text-only prompt)."""
    prompt = FALLBACK_STYLE_PROMPT.format(
        bee_name=bee_name,
        description=description[:200]
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
                    "size": "1024x1024",
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


async def generate_bee_icon(
    openai_api_key: str,
    bee_name: str,
    description: str,
    size: str = "256x256",
    stability_api_key: Optional[str] = None
) -> Optional[str]:
    """
    Generate a bee icon matching the reference style.

    Tries Stability AI img2img first (if key provided), falls back to DALL-E.
    """
    # Try Stability AI first if we have a key
    if stability_api_key:
        print("Trying Stability AI image-to-image...")
        result = await generate_bee_icon_stability(stability_api_key, bee_name, description)
        if result:
            return result
        print("Stability AI failed, falling back to DALL-E")

    # Fallback to DALL-E
    if openai_api_key:
        print("Using DALL-E 3...")
        return await generate_bee_icon_dalle(openai_api_key, bee_name, description)

    return None


async def check_openai_key_valid(api_key: str) -> bool:
    """Check if an OpenAI API key is valid."""
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


async def check_stability_key_valid(api_key: str) -> bool:
    """Check if a Stability AI API key is valid."""
    if not api_key:
        return False

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.stability.ai/v1/user/account",
                headers={"Authorization": f"Bearer {api_key}"}
            )
            return response.status_code == 200
    except Exception:
        return False
