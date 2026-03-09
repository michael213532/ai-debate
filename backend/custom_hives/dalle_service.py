"""DALL-E icon generation service for custom bees."""
import base64
import httpx
from typing import Optional
from pathlib import Path


# Load reference bee image as base64 (embedded for reliability)
REFERENCE_BEE_BASE64 = None

def get_reference_bee_base64() -> Optional[str]:
    """Load the reference bee image from file."""
    global REFERENCE_BEE_BASE64
    if REFERENCE_BEE_BASE64:
        return REFERENCE_BEE_BASE64

    # Try multiple possible locations
    possible_paths = [
        Path(__file__).parent / "assets" / "reference_bee.png",  # In the module folder
        Path(__file__).parent.parent.parent / "frontend" / "images" / "bee-icon.png",
        Path(__file__).parent.parent.parent / "frontend" / "images" / "bees" / "default.png",
        Path("C:/Users/micha/Downloads/bee icons/default bee icon.png"),
    ]

    for path in possible_paths:
        if path.exists():
            try:
                with open(path, "rb") as f:
                    REFERENCE_BEE_BASE64 = base64.b64encode(f.read()).decode("utf-8")
                    return REFERENCE_BEE_BASE64
            except Exception:
                continue

    return None


FALLBACK_STYLE_PROMPT = """Create a cute kawaii cartoon bee character icon, EXACTLY matching this specific style:

BODY SHAPE & PROPORTIONS:
- Round yellow head (bright lemon yellow #F7E14D), perfectly circular
- Oval body below head with 3 thick dark brown (#5D4037) horizontal stripes alternating with bright yellow
- Chibi proportions: head is slightly larger than body
- Total character is compact and round

FACIAL FEATURES:
- Two simple solid black dot eyes (small circles)
- Tiny curved smile line below eyes
- Two rosy pink circular blush marks on cheeks
- Two dark brown curved antennae on top of head, curving outward

LIMBS & WINGS:
- Four tiny dark brown stick limbs (simple lines with small oval ends)
- Two small cream/off-white rounded wings on the back

STYLE REQUIREMENTS:
- PURE WHITE background, absolutely no shadows or gradients
- Flat 2D illustration, like a LINE sticker or emoji
- Thick dark brown outlines around all shapes
- No 3D effects, no textures, no realistic details
- Simple, minimal, cute aesthetic

This bee's personality is "{bee_name}" - {description}

Add ONE small simple accessory or visual element to show this personality (like a tiny hat, glasses, or held item). Keep the EXACT same art style, colors (#F7E14D yellow, #5D4037 brown), and proportions as described above."""


async def generate_dalle_prompt_from_reference(
    openai_api_key: str,
    bee_name: str,
    description: str,
    reference_image_b64: str
) -> Optional[str]:
    """
    Use GPT-4 Vision to analyze reference image and create a DALL-E prompt.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {openai_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o",
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": f"""Look at this bee character image carefully. I need you to create a DALL-E prompt that will generate a bee in the EXACT SAME art style, but representing this personality:

Bee Name: {bee_name}
Personality: {description}

Your DALL-E prompt must:
1. Describe the EXACT art style, colors, proportions, and features of the bee in the reference image
2. Keep the same kawaii/chibi style with simple shapes, thick outlines, flat colors
3. Keep the same yellow (#F7E14D) and brown (#5D4037) color scheme
4. Add ONE small accessory that represents the personality (like a tiny hat, glasses, book, etc.)
5. Specify pure white background, no shadows, flat 2D illustration style

Output ONLY the DALL-E prompt, nothing else. Make it detailed enough to recreate this exact bee style."""
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/png;base64,{reference_image_b64}",
                                        "detail": "high"
                                    }
                                }
                            ]
                        }
                    ],
                    "max_tokens": 500
                }
            )

            if response.status_code != 200:
                print(f"GPT-4V API error: {response.status_code} - {response.text}")
                return None

            data = response.json()
            if "choices" in data and len(data["choices"]) > 0:
                return data["choices"][0]["message"]["content"].strip()

            return None

    except Exception as e:
        print(f"GPT-4V error: {e}")
        return None


async def generate_bee_icon(
    openai_api_key: str,
    bee_name: str,
    description: str,
    size: str = "256x256"
) -> Optional[str]:
    """
    Generate a bee icon using GPT-4V + DALL-E 3.

    Two-step process:
    1. GPT-4V analyzes reference image and creates a perfect DALL-E prompt
    2. DALL-E 3 generates the bee icon matching the style

    Args:
        openai_api_key: User's OpenAI API key
        bee_name: Name of the bee (e.g., "The Strategist")
        description: Description of the bee's personality
        size: Image size (unused, DALL-E 3 uses 1024x1024)

    Returns:
        Base64-encoded PNG image, or None if generation failed
    """
    if not openai_api_key:
        return None

    # Try to get reference image and use GPT-4V approach
    reference_b64 = get_reference_bee_base64()

    if reference_b64:
        print("Using GPT-4V + DALL-E approach with reference image")
        prompt = await generate_dalle_prompt_from_reference(
            openai_api_key,
            bee_name,
            description[:200],
            reference_b64
        )
        if not prompt:
            print("GPT-4V failed, falling back to static prompt")
            prompt = FALLBACK_STYLE_PROMPT.format(
                bee_name=bee_name,
                description=description[:200]
            )
    else:
        print("No reference image found, using fallback prompt")
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
