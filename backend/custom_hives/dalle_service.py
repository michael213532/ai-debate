"""Icon generation service for custom bees using Stability AI img2img."""
import base64
import httpx
from typing import Optional
from pathlib import Path


# Cache for reference image
_REFERENCE_BEE_BYTES = None


def get_reference_bee_bytes() -> Optional[bytes]:
    """Load the reference bee image bytes from file."""
    global _REFERENCE_BEE_BYTES
    if _REFERENCE_BEE_BYTES:
        return _REFERENCE_BEE_BYTES

    possible_paths = [
        Path(__file__).parent / "assets" / "reference_bee.png",
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


# Super detailed style prompt based on the reference bee
STABILITY_PROMPT = """Cute kawaii cartoon bee character icon, chibi style illustration:

- Round bright yellow head (#F7E14D) with two small black dot eyes
- Tiny curved smile, two pink circular blush marks on cheeks
- Two dark brown curved antennae on top
- Oval yellow body with 3 thick dark brown (#5D4037) horizontal stripes
- Two small cream-colored rounded wings
- Four tiny dark brown stick limbs
- Pure white background, no shadows
- Flat 2D vector style like a LINE sticker or emoji
- Thick dark outlines around all shapes
- Simple minimal kawaii aesthetic

This bee is "{bee_name}" - {description}

IMPORTANT: Add a {accessory} to show this personality. The accessory should be clearly visible."""

ACCESSORIES = [
    "small top hat", "tiny reading glasses", "little crown", "mini headphones",
    "small chef hat", "tiny bow tie", "little wizard hat", "small graduation cap",
    "mini detective magnifying glass", "tiny artist beret", "small superhero cape",
    "little pirate eyepatch", "mini scientist goggles", "small cowboy hat"
]


def get_accessory_for_personality(description: str) -> str:
    """Pick an accessory that matches the personality description."""
    desc_lower = description.lower()

    if any(w in desc_lower for w in ["smart", "think", "logic", "analy", "intel"]):
        return "tiny reading glasses"
    if any(w in desc_lower for w in ["leader", "boss", "king", "queen", "royal"]):
        return "small crown"
    if any(w in desc_lower for w in ["music", "creative", "art"]):
        return "mini headphones"
    if any(w in desc_lower for w in ["chef", "cook", "food"]):
        return "small chef hat"
    if any(w in desc_lower for w in ["magic", "mystic", "wizard"]):
        return "little wizard hat"
    if any(w in desc_lower for w in ["formal", "business", "professional"]):
        return "tiny bow tie"
    if any(w in desc_lower for w in ["detective", "investigate", "mystery"]):
        return "mini detective magnifying glass"
    if any(w in desc_lower for w in ["science", "research", "experiment"]):
        return "mini scientist goggles"
    if any(w in desc_lower for w in ["adventure", "explore", "brave"]):
        return "small explorer hat"
    if any(w in desc_lower for w in ["rebel", "wild", "chaos"]):
        return "tiny punk mohawk"
    if any(w in desc_lower for w in ["peace", "calm", "zen"]):
        return "small flower on head"
    if any(w in desc_lower for w in ["tech", "computer", "code"]):
        return "mini VR headset"

    # Default: pick based on hash of description for consistency
    import hashlib
    h = int(hashlib.md5(description.encode()).hexdigest(), 16)
    return ACCESSORIES[h % len(ACCESSORIES)]


async def generate_bee_icon_stability(
    stability_api_key: str,
    bee_name: str,
    description: str,
) -> Optional[str]:
    """Generate a bee icon using Stability AI image-to-image."""

    reference_bytes = get_reference_bee_bytes()
    if not reference_bytes:
        print("No reference bee image found, falling back to text-to-image")
        return None

    accessory = get_accessory_for_personality(description)

    # Simple prompt focusing on the accessory - let the reference image handle the style
    prompt = f"Same cute bee but wearing a {accessory}. This bee is {bee_name}. Keep exact same art style, colors, white background."

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
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
                    "text_prompts[1][text]": "realistic, 3D, different style, complex background, shadows",
                    "text_prompts[1][weight]": "-1",
                    "cfg_scale": "7",
                    "samples": "1",
                    "steps": "25",
                    "image_strength": "0.5",  # Balanced - keep style but add accessory
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


DALLE_PROMPT = """Cute kawaii cartoon bee character icon:

- Round bright yellow head with two small black dot eyes
- Tiny curved smile, two pink blush marks on cheeks
- Two dark brown curved antennae
- Oval yellow body with dark brown horizontal stripes
- Two small cream-colored wings
- Pure white background
- Flat 2D vector style like a LINE sticker
- Simple minimal kawaii aesthetic

This bee is "{bee_name}" - {description}

Add a {accessory} to show this personality."""


async def generate_bee_icon_dalle(
    openai_api_key: str,
    bee_name: str,
    description: str,
) -> Optional[str]:
    """Generate bee icon using DALL-E 3."""

    accessory = get_accessory_for_personality(description)

    prompt = DALLE_PROMPT.format(
        bee_name=bee_name,
        description=description[:200],
        accessory=accessory
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
    """Generate a bee icon matching the reference style."""

    # Try Stability AI first if we have a key
    if stability_api_key:
        print("Using Stability AI text-to-image...")
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
