"""Memory extractor - AI-based fact extraction from conversations."""
import json
import asyncio
from typing import Optional
from backend.providers import ProviderRegistry
from .service import save_user_fact, save_debate_summary


# Preferred models for extraction (fast and cheap)
EXTRACTION_MODELS = [
    ("google", "gemini-2.0-flash"),      # Fast and often free
    ("openai", "gpt-5-mini"),            # Fast
    ("anthropic", "claude-haiku-4-5-20251001"),  # Fast
    ("deepseek", "deepseek-chat"),       # Very cheap
]


async def extract_and_save_memory(
    debate_id: str,
    user_id: str,
    topic: str,
    messages: list[dict],
    api_keys: dict[str, str]
) -> bool:
    """Extract facts from a conversation and save to memory.

    Uses a lightweight AI model to:
    1. Extract user facts (name, preferences, interests)
    2. Generate a 1-sentence debate summary
    3. Save to database

    Args:
        debate_id: ID of the debate
        user_id: ID of the user
        topic: Original topic/question
        messages: List of message dicts with model_name and content
        api_keys: Dict of provider -> api_key

    Returns:
        True if extraction was successful, False otherwise
    """
    # Find an available model for extraction
    provider_name = None
    model_id = None

    for prov, model in EXTRACTION_MODELS:
        if prov in api_keys:
            provider_name = prov
            model_id = model
            break

    if not provider_name:
        # No available provider for extraction
        return False

    try:
        provider_class = ProviderRegistry.get(provider_name)
        provider = provider_class(api_keys[provider_name])

        # Build conversation context for extraction
        conversation = f"USER'S QUESTION: {topic}\n\n"
        for msg in messages:
            if msg.get("round", 0) > 0:  # Skip summaries
                conversation += f"{msg['model_name']}: {msg['content']}\n\n"

        # Create extraction prompt - be VERY selective
        system_prompt = """You are a memory extraction assistant. Be VERY selective - only extract truly important, core information.

ONLY extract these types of facts:
1. User's name - ONLY if they explicitly say "I'm [name]" or "my name is [name]"
2. Major profession/job - ONLY if they explicitly state it ("I'm a teacher", "I work as a developer")
3. Core expertise - ONLY if they demonstrate deep knowledge in an area across the conversation

DO NOT extract:
- Random topics they asked about (that's what the summary is for)
- Casual mentions of interests
- One-time preferences
- Anything you have to infer or guess

Return ONLY valid JSON (no markdown, no explanation):
{
    "facts": [
        {"type": "name", "key": "user_name", "value": "Michael"},
        {"type": "profession", "key": "profession", "value": "English teacher"}
    ],
    "summary": "Asked about oral exam questions for students"
}

Rules:
- Be EXTREMELY selective - most conversations should return 0-1 facts
- Only extract what the user EXPLICITLY stated about themselves
- Never infer or guess
- Summary should be max 10 words describing the topic
- Return empty facts array if nothing important was shared
- The bar for saving a fact should be HIGH - only truly identifying information"""

        user_message = f"""Analyze this conversation and extract memory:

{conversation}

Return ONLY the JSON, no other text."""

        # Get extraction response (non-streaming for simplicity)
        full_response = ""
        async for chunk in provider.generate_stream(
            model=model_id,
            messages=[{"role": "user", "content": user_message}],
            system_prompt=system_prompt
        ):
            full_response += chunk

        # Parse response
        try:
            # Clean up response - remove markdown code blocks if present
            response_text = full_response.strip()
            if response_text.startswith("```"):
                lines = response_text.split("\n")
                # Remove first and last lines (``` markers)
                lines = [l for l in lines if not l.strip().startswith("```")]
                response_text = "\n".join(lines)

            data = json.loads(response_text)
        except json.JSONDecodeError:
            # Try to extract JSON from response
            import re
            json_match = re.search(r'\{[\s\S]*\}', full_response)
            if json_match:
                data = json.loads(json_match.group())
            else:
                return False

        # Save facts
        facts = data.get("facts", [])
        for fact in facts:
            fact_type = fact.get("type", "preference")
            fact_key = fact.get("key", "").strip()
            fact_value = fact.get("value", "").strip()

            if fact_key and fact_value:
                await save_user_fact(
                    user_id=user_id,
                    fact_type=fact_type,
                    fact_key=fact_key,
                    fact_value=fact_value,
                    source_debate_id=debate_id
                )

        # Save debate summary
        summary = data.get("summary", "")
        if summary:
            # Extract key points if available
            key_points = data.get("key_points", None)
            await save_debate_summary(
                debate_id=debate_id,
                user_id=user_id,
                topic_summary=summary,
                key_points=key_points
            )

        return True

    except Exception as e:
        # Log but don't fail the main operation
        print(f"Memory extraction error: {e}")
        return False
