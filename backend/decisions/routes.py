"""Public decisions feed API routes."""
import uuid
import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from backend.auth.dependencies import get_current_user, get_current_user_optional
from backend.database import get_db, User

router = APIRouter(prefix="/api/decisions", tags=["decisions"])


class DecisionResponse(BaseModel):
    id: str
    debate_id: str
    user_id: Optional[str] = None
    topic: str
    verdict: dict
    hive_name: Optional[str] = None
    likes: int = 0
    is_liked: bool = False
    creator_name: Optional[str] = None
    created_at: Optional[str] = None
    poll_yes: int = 0
    poll_no: int = 0
    poll_vote: Optional[str] = None


@router.get("", response_model=list[DecisionResponse])
async def list_decisions(
    page: int = 0,
    sort: str = "newest",
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """List public decisions feed."""
    user_id = current_user.id if current_user else None
    limit = 50
    offset = page * limit

    async with get_db() as db:
        if sort == "popular":
            order = "pd.likes DESC, pd.created_at DESC"
        else:
            order = "pd.created_at DESC"

        cursor = await db.execute(
            f"""SELECT pd.*, u.display_name, u.email
                FROM public_decisions pd
                LEFT JOIN users u ON pd.user_id = u.id
                ORDER BY {order}
                LIMIT ? OFFSET ?""",
            (limit, offset)
        )
        rows = await cursor.fetchall()

        # Get user's likes if logged in
        user_likes = set()
        if user_id:
            like_cursor = await db.execute(
                "SELECT decision_id FROM decision_likes WHERE user_id = ?", (user_id,)
            )
            user_likes = {r["decision_id"] for r in await like_cursor.fetchall()}

        # Get poll counts
        poll_cursor = await db.execute(
            "SELECT decision_id, vote, COUNT(*) as cnt FROM decision_polls GROUP BY decision_id, vote"
        )
        poll_rows = await poll_cursor.fetchall()
        poll_counts = {}
        for pr in poll_rows:
            did = pr["decision_id"]
            if did not in poll_counts:
                poll_counts[did] = {"yes": 0, "no": 0}
            poll_counts[did][pr["vote"]] = pr["cnt"]

        # Get user's poll votes
        user_polls = {}
        if user_id:
            pc = await db.execute("SELECT decision_id, vote FROM decision_polls WHERE user_id = ?", (user_id,))
            for pr in await pc.fetchall():
                user_polls[pr["decision_id"]] = pr["vote"]

        decisions = []
        for row in rows:
            try:
                verdict = json.loads(row["verdict_json"])
            except (json.JSONDecodeError, TypeError):
                verdict = {}

            display_name = None
            try:
                display_name = row["display_name"] or (row["email"].split("@")[0] if row["email"] else None)
            except (KeyError, TypeError):
                pass

            did = row["id"]
            pc = poll_counts.get(did, {"yes": 0, "no": 0})

            decisions.append(DecisionResponse(
                id=did,
                debate_id=row["debate_id"],
                user_id=row["user_id"],
                topic=row["topic"],
                verdict=verdict,
                hive_name=row["hive_name"],
                likes=row["likes"] or 0,
                is_liked=did in user_likes,
                creator_name=display_name,
                created_at=str(row["created_at"]) if row["created_at"] else None,
                poll_yes=pc["yes"],
                poll_no=pc["no"],
                poll_vote=user_polls.get(did)
            ))

        return decisions


@router.get("/{decision_id}", response_model=DecisionResponse)
async def get_decision(
    decision_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Get a single decision by ID."""
    user_id = current_user.id if current_user else None

    async with get_db() as db:
        cursor = await db.execute(
            """SELECT pd.*, u.display_name, u.email
               FROM public_decisions pd
               LEFT JOIN users u ON pd.user_id = u.id
               WHERE pd.id = ?""",
            (decision_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Decision not found")

        try:
            verdict = json.loads(row["verdict_json"])
        except (json.JSONDecodeError, TypeError):
            verdict = {}

        display_name = None
        try:
            display_name = row["display_name"] or (row["email"].split("@")[0] if row["email"] else None)
        except (KeyError, TypeError):
            pass

        is_liked = False
        if user_id:
            like_cursor = await db.execute(
                "SELECT id FROM decision_likes WHERE decision_id = ? AND user_id = ?",
                (decision_id, user_id)
            )
            is_liked = await like_cursor.fetchone() is not None

        return DecisionResponse(
            id=row["id"],
            debate_id=row["debate_id"],
            user_id=row["user_id"],
            topic=row["topic"],
            verdict=verdict,
            hive_name=row["hive_name"],
            likes=row["likes"] or 0,
            is_liked=is_liked,
            creator_name=display_name,
            created_at=str(row["created_at"]) if row["created_at"] else None
        )


@router.post("/{decision_id}/like")
async def toggle_like(decision_id: str, current_user: User = Depends(get_current_user)):
    """Toggle like on a decision."""
    async with get_db() as db:
        # Check decision exists
        cursor = await db.execute("SELECT id, likes FROM public_decisions WHERE id = ?", (decision_id,))
        decision = await cursor.fetchone()
        if not decision:
            raise HTTPException(status_code=404, detail="Decision not found")

        # Check if already liked
        cursor = await db.execute(
            "SELECT id FROM decision_likes WHERE decision_id = ? AND user_id = ?",
            (decision_id, current_user.id)
        )
        existing = await cursor.fetchone()

        if existing:
            await db.execute("DELETE FROM decision_likes WHERE decision_id = ? AND user_id = ?",
                             (decision_id, current_user.id))
            await db.execute("UPDATE public_decisions SET likes = MAX(0, likes - 1) WHERE id = ?", (decision_id,))
            await db.commit()
            c = await db.execute("SELECT likes FROM public_decisions WHERE id = ?", (decision_id,))
            r = await c.fetchone()
            return {"liked": False, "likes": r["likes"] if r else 0}
        else:
            like_id = str(uuid.uuid4())
            await db.execute(
                "INSERT INTO decision_likes (id, decision_id, user_id) VALUES (?, ?, ?)",
                (like_id, decision_id, current_user.id)
            )
            await db.execute("UPDATE public_decisions SET likes = likes + 1 WHERE id = ?", (decision_id,))
            await db.commit()
            c = await db.execute("SELECT likes FROM public_decisions WHERE id = ?", (decision_id,))
            r = await c.fetchone()
            return {"liked": True, "likes": r["likes"] if r else 0}


class PollVoteRequest(BaseModel):
    vote: str  # "yes" or "no"


@router.post("/{decision_id}/poll")
async def vote_poll(decision_id: str, request: PollVoteRequest, current_user: User = Depends(get_current_user)):
    """Vote yes/no on a decision poll."""
    if request.vote not in ("yes", "no"):
        raise HTTPException(status_code=400, detail="Vote must be 'yes' or 'no'")

    async with get_db() as db:
        cursor = await db.execute("SELECT id FROM public_decisions WHERE id = ?", (decision_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Decision not found")

        # Check existing vote
        cursor = await db.execute(
            "SELECT id, vote FROM decision_polls WHERE decision_id = ? AND user_id = ?",
            (decision_id, current_user.id)
        )
        existing = await cursor.fetchone()

        if existing:
            if existing["vote"] == request.vote:
                # Same vote = remove it
                await db.execute("DELETE FROM decision_polls WHERE id = ?", (existing["id"],))
                await db.commit()
                user_vote = None
            else:
                # Different vote = switch
                await db.execute("UPDATE decision_polls SET vote = ? WHERE id = ?", (request.vote, existing["id"]))
                await db.commit()
                user_vote = request.vote
        else:
            poll_id = str(uuid.uuid4())
            await db.execute(
                "INSERT INTO decision_polls (id, decision_id, user_id, vote) VALUES (?, ?, ?, ?)",
                (poll_id, decision_id, current_user.id, request.vote)
            )
            await db.commit()
            user_vote = request.vote

        # Get counts
        c = await db.execute(
            "SELECT vote, COUNT(*) as cnt FROM decision_polls WHERE decision_id = ? GROUP BY vote",
            (decision_id,)
        )
        rows = await c.fetchall()
        counts = {r["vote"]: r["cnt"] for r in rows}

        return {
            "yes": counts.get("yes", 0),
            "no": counts.get("no", 0),
            "user_vote": user_vote
        }
