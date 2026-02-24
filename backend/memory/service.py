"""Memory service - CRUD operations for user memory and debate summaries."""
import json
from typing import Optional
from backend.database import get_db, UserMemory, DebateSummary


async def get_user_memory(user_id: str) -> list[UserMemory]:
    """Get all stored facts for a user."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM user_memory WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,)
        )
        rows = await cursor.fetchall()
        return [UserMemory.from_row(row) for row in rows]


async def get_user_memory_context(user_id: str) -> str:
    """Build a context string from user memory for AI injection.

    Returns a formatted string like:
    - Name: Michael
    - Interests: Photography, AI models
    - Recent topics: Photo comparison (Feb 23), Model benchmarks (Feb 20)
    """
    facts = await get_user_memory(user_id)
    recent_summaries = await get_recent_debate_summaries(user_id, limit=3)

    if not facts and not recent_summaries:
        return ""

    lines = []

    # Group facts by type for cleaner presentation
    fact_groups = {}
    for fact in facts:
        if fact.fact_type not in fact_groups:
            fact_groups[fact.fact_type] = []
        fact_groups[fact.fact_type].append(fact)

    # Format user name first if present
    for fact in facts:
        if fact.fact_key == "user_name":
            lines.append(f"- Name: {fact.fact_value}")
            break

    # Format preferences
    preferences = [f for f in facts if f.fact_type == "preference" and f.fact_key != "user_name"]
    if preferences:
        for pref in preferences:
            lines.append(f"- {pref.fact_key.replace('_', ' ').title()}: {pref.fact_value}")

    # Format interests
    interests = [f for f in facts if f.fact_type == "interest"]
    if interests:
        interest_values = [i.fact_value for i in interests]
        lines.append(f"- Interests: {', '.join(interest_values)}")

    # Format recent debate topics
    if recent_summaries:
        recent_topics = []
        for summary in recent_summaries:
            # Format date nicely
            if summary.created_at:
                date_str = summary.created_at.strftime("%b %d")
            else:
                date_str = "recently"
            recent_topics.append(f"{summary.topic_summary} ({date_str})")
        lines.append(f"- Recent topics: {'; '.join(recent_topics)}")

    return "\n".join(lines) if lines else ""


async def save_user_fact(
    user_id: str,
    fact_type: str,
    fact_key: str,
    fact_value: str,
    source_debate_id: Optional[str] = None
) -> None:
    """Save a user fact (upserts on user_id + fact_key)."""
    async with get_db() as db:
        await db.execute(
            """INSERT INTO user_memory (user_id, fact_type, fact_key, fact_value, source_debate_id)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(user_id, fact_key) DO UPDATE SET
                   fact_value = ?,
                   fact_type = ?,
                   source_debate_id = ?""",
            (user_id, fact_type, fact_key, fact_value, source_debate_id,
             fact_value, fact_type, source_debate_id)
        )
        await db.commit()


async def delete_user_fact(user_id: str, fact_id: int) -> bool:
    """Delete a specific user fact. Returns True if deleted."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id FROM user_memory WHERE id = ? AND user_id = ?",
            (fact_id, user_id)
        )
        if not await cursor.fetchone():
            return False

        await db.execute(
            "DELETE FROM user_memory WHERE id = ? AND user_id = ?",
            (fact_id, user_id)
        )
        await db.commit()
        return True


async def clear_user_memory(user_id: str) -> int:
    """Clear all memory for a user. Returns count of deleted facts."""
    async with get_db() as db:
        # Get count first
        cursor = await db.execute(
            "SELECT COUNT(*) as count FROM user_memory WHERE user_id = ?",
            (user_id,)
        )
        row = await cursor.fetchone()
        count = row["count"] if row else 0

        # Delete facts
        await db.execute(
            "DELETE FROM user_memory WHERE user_id = ?",
            (user_id,)
        )
        # Delete summaries too
        await db.execute(
            "DELETE FROM debate_summaries WHERE user_id = ?",
            (user_id,)
        )
        await db.commit()
        return count


async def save_debate_summary(
    debate_id: str,
    user_id: str,
    topic_summary: str,
    key_points: Optional[list] = None
) -> None:
    """Save a debate summary (upserts on debate_id)."""
    key_points_json = json.dumps(key_points) if key_points else None

    async with get_db() as db:
        await db.execute(
            """INSERT INTO debate_summaries (debate_id, user_id, topic_summary, key_points)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(debate_id) DO UPDATE SET
                   topic_summary = ?,
                   key_points = ?""",
            (debate_id, user_id, topic_summary, key_points_json,
             topic_summary, key_points_json)
        )
        await db.commit()


async def get_recent_debate_summaries(user_id: str, limit: int = 5) -> list[DebateSummary]:
    """Get recent debate summaries for a user."""
    async with get_db() as db:
        cursor = await db.execute(
            """SELECT * FROM debate_summaries
               WHERE user_id = ?
               ORDER BY created_at DESC
               LIMIT ?""",
            (user_id, limit)
        )
        rows = await cursor.fetchall()
        return [DebateSummary.from_row(row) for row in rows]
