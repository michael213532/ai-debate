"""Personality Bees System - Decision Engine personalities for Beecision."""
from dataclasses import dataclass
from typing import Optional
import re


@dataclass
class Personality:
    """A personality bee that provides a unique perspective."""
    id: str
    name: str
    emoji: str
    description: str
    role: str  # System prompt injection for this personality


# Define the 5 personality bees
PERSONALITIES = {
    "analyst": Personality(
        id="analyst",
        name="The Analyst",
        emoji="📊",
        description="Data-driven, logical, focuses on facts and numbers",
        role="""You are The Analyst - a data-driven, logical thinker who focuses on facts and numbers.
Your approach:
- Always cite specific data, statistics, or measurable factors when possible
- Break down decisions into quantifiable criteria
- Look for evidence and concrete examples
- Be objective and avoid emotional reasoning
- Highlight cost-benefit analysis and ROI when relevant
Speak with precision and clarity. Back up your opinions with logical reasoning."""
    ),
    "skeptic": Personality(
        id="skeptic",
        name="The Skeptic",
        emoji="🤔",
        description="Questions assumptions, plays devil's advocate",
        role="""You are The Skeptic - someone who questions assumptions and plays devil's advocate.
Your approach:
- Challenge popular opinions and conventional wisdom
- Point out potential risks, downsides, and hidden problems
- Ask "what could go wrong?" and "what are we missing?"
- Question sources and motivations
- Look for logical fallacies and weak arguments
- Be contrarian when appropriate, but constructively
Don't just disagree for the sake of it - provide thoughtful counterpoints."""
    ),
    "optimist": Personality(
        id="optimist",
        name="The Optimist",
        emoji="☀️",
        description="Sees opportunities, positive possibilities",
        role="""You are The Optimist - someone who sees opportunities and positive possibilities.
Your approach:
- Focus on potential upsides and best-case scenarios
- Highlight growth opportunities and positive outcomes
- Look for creative solutions to problems
- Encourage bold moves when warranted
- See challenges as opportunities
- Inspire confidence and momentum
Be genuinely optimistic but not naive - acknowledge risks while emphasizing what's possible."""
    ),
    "expert": Personality(
        id="expert",
        name="The Expert",
        emoji="🎓",
        description="Domain knowledge, technical depth, industry insights",
        role="""You are The Expert - someone with deep domain knowledge and technical expertise.
Your approach:
- Provide industry-specific insights and context
- Explain technical details in accessible terms
- Share relevant case studies and examples
- Consider long-term trends and industry dynamics
- Highlight best practices and common pitfalls
- Draw on specialized knowledge to inform the decision
Be authoritative but humble - acknowledge the limits of expertise when relevant."""
    ),
    "realist": Personality(
        id="realist",
        name="The Realist",
        emoji="⚖️",
        description="Practical constraints, actionable advice",
        role="""You are The Realist - someone focused on practical constraints and actionable advice.
Your approach:
- Consider real-world limitations (time, money, resources)
- Focus on what's actually achievable given the constraints
- Provide step-by-step, implementable recommendations
- Balance ideal outcomes with practical realities
- Think about execution, not just strategy
- Be pragmatic about trade-offs
Give advice that can actually be followed, not just theoretical ideals."""
    ),
}


# Keyword mappings for personality suggestions
KEYWORD_MAPPINGS = {
    # Financial/Investment decisions
    "financial": ["analyst", "skeptic", "realist"],
    "invest": ["analyst", "skeptic", "realist"],
    "investment": ["analyst", "skeptic", "realist"],
    "buy": ["analyst", "skeptic", "realist"],
    "cost": ["analyst", "realist", "skeptic"],
    "price": ["analyst", "realist", "skeptic"],
    "stock": ["analyst", "skeptic", "expert"],
    "crypto": ["analyst", "skeptic", "expert"],
    "money": ["analyst", "realist", "skeptic"],
    "budget": ["analyst", "realist", "skeptic"],
    "expensive": ["analyst", "realist", "skeptic"],
    "cheap": ["analyst", "realist", "skeptic"],
    "worth": ["analyst", "skeptic", "realist"],
    "roi": ["analyst", "skeptic", "realist"],

    # Life decisions
    "move": ["optimist", "realist", "skeptic"],
    "relocate": ["optimist", "realist", "skeptic"],
    "quit": ["optimist", "realist", "skeptic"],
    "career": ["optimist", "realist", "expert"],
    "job": ["optimist", "realist", "skeptic"],
    "life": ["optimist", "realist", "skeptic"],
    "marriage": ["optimist", "realist", "skeptic"],
    "relationship": ["optimist", "realist", "skeptic"],
    "country": ["optimist", "realist", "expert"],
    "city": ["optimist", "realist", "expert"],
    "travel": ["optimist", "expert", "realist"],

    # Product/Tech decisions
    "laptop": ["analyst", "expert", "realist"],
    "phone": ["analyst", "expert", "realist"],
    "computer": ["analyst", "expert", "realist"],
    "best": ["analyst", "expert", "skeptic"],
    "vs": ["analyst", "skeptic", "expert"],
    "versus": ["analyst", "skeptic", "expert"],
    "compare": ["analyst", "skeptic", "expert"],
    "comparison": ["analyst", "skeptic", "expert"],
    "review": ["analyst", "expert", "skeptic"],
    "recommend": ["analyst", "expert", "realist"],
    "product": ["analyst", "expert", "skeptic"],
    "software": ["analyst", "expert", "realist"],
    "tool": ["analyst", "expert", "realist"],
    "app": ["analyst", "expert", "realist"],

    # Business decisions
    "startup": ["optimist", "skeptic", "realist"],
    "business": ["analyst", "realist", "skeptic"],
    "company": ["analyst", "realist", "expert"],
    "hire": ["analyst", "realist", "skeptic"],
    "strategy": ["analyst", "expert", "realist"],
    "market": ["analyst", "expert", "skeptic"],

    # Health decisions
    "health": ["expert", "realist", "skeptic"],
    "diet": ["expert", "skeptic", "realist"],
    "fitness": ["expert", "optimist", "realist"],
    "doctor": ["expert", "skeptic", "realist"],
    "medical": ["expert", "skeptic", "realist"],
}


def get_all_personalities() -> list[dict]:
    """Get all available personalities as a list of dicts."""
    return [
        {
            "id": p.id,
            "name": p.name,
            "emoji": p.emoji,
            "description": p.description
        }
        for p in PERSONALITIES.values()
    ]


def get_personality(personality_id: str) -> Optional[Personality]:
    """Get a personality by ID."""
    return PERSONALITIES.get(personality_id)


def suggest_personalities(question: str, max_suggestions: int = 3) -> list[str]:
    """
    Suggest personality IDs based on the question content.
    Uses keyword matching for fast, deterministic suggestions.

    Returns a list of personality IDs (e.g., ["analyst", "skeptic", "realist"])
    """
    question_lower = question.lower()

    # Count matches for each personality
    personality_scores: dict[str, int] = {}

    for keyword, personalities in KEYWORD_MAPPINGS.items():
        if keyword in question_lower:
            for i, personality_id in enumerate(personalities):
                # Earlier positions get higher scores
                score = len(personalities) - i
                personality_scores[personality_id] = personality_scores.get(personality_id, 0) + score

    # If we got matches, return top suggestions
    if personality_scores:
        sorted_personalities = sorted(
            personality_scores.items(),
            key=lambda x: x[1],
            reverse=True
        )
        return [p[0] for p in sorted_personalities[:max_suggestions]]

    # Default suggestions if no keywords matched
    return ["analyst", "optimist", "skeptic"]


def get_personality_role(personality_id: str) -> str:
    """Get the role/system prompt for a personality."""
    personality = PERSONALITIES.get(personality_id)
    if personality:
        return personality.role
    return ""
