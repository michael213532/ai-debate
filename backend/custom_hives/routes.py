"""Custom hives API routes."""
import uuid
from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from backend.auth.dependencies import get_current_user, get_current_user_optional
from backend.database import get_db, User
from .schemas import (
    CustomHiveCreate,
    CustomHiveUpdate,
    CustomHiveResponse,
    CustomBeeCreate,
    CustomBeeUpdate,
    CustomBeeResponse,
    CustomHiveLimits,
    IconGenerationRequest,
)
from .dalle_service import generate_bee_icon

router = APIRouter(prefix="/api/custom-hives", tags=["custom-hives"])


def get_max_hives(user: User) -> int:
    """Get maximum number of custom hives allowed for user's tier.

    Returns:
        -1 for unlimited (Pro), 1 for free tier
    """
    if user.subscription_status == "active":
        return -1  # Unlimited
    return 1  # Free tier gets 1 custom hive


async def get_custom_hive_count(user_id: str) -> int:
    """Get the number of custom hives a user has created."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT COUNT(*) as count FROM custom_hives WHERE user_id = ?",
            (user_id,)
        )
        row = await cursor.fetchone()
        return row["count"] if row else 0


async def get_user_api_key(user_id: str, provider: str) -> Optional[str]:
    """Get app-level API key for a specific provider."""
    from backend.config import XAI_API_KEY
    if provider == "xai":
        return XAI_API_KEY or None
    return None


async def get_user_openai_key(user_id: str) -> Optional[str]:
    return await get_user_api_key(user_id, "openai")


async def get_user_stability_key(user_id: str) -> Optional[str]:
    return await get_user_api_key(user_id, "stability")


async def generate_icon_background(
    user_id: str,
    bee_id: str,
    bee_name: str,
    description: str
):
    """Background task to generate bee icon."""
    openai_key = await get_user_openai_key(user_id)
    stability_key = await get_user_stability_key(user_id)

    if not openai_key and not stability_key:
        # No API keys available
        async with get_db() as db:
            await db.execute(
                "UPDATE custom_bees SET icon_generation_status = 'no_key' WHERE id = ?",
                (bee_id,)
            )
            await db.commit()
        return

    # Generate icon (tries Stability AI first, then DALL-E)
    icon_base64 = await generate_bee_icon(
        openai_key or "",
        bee_name,
        description,
        stability_api_key=stability_key
    )

    async with get_db() as db:
        if icon_base64:
            await db.execute(
                "UPDATE custom_bees SET icon_base64 = ?, icon_generation_status = 'completed' WHERE id = ?",
                (icon_base64, bee_id)
            )
        else:
            await db.execute(
                "UPDATE custom_bees SET icon_generation_status = 'failed' WHERE id = ?",
                (bee_id,)
            )
        await db.commit()


@router.get("/limits", response_model=CustomHiveLimits)
async def get_limits(current_user: User = Depends(get_current_user)):
    """Get user's custom hive limits and current count."""
    max_hives = get_max_hives(current_user)
    current_count = await get_custom_hive_count(current_user.id)

    can_create = max_hives == -1 or current_count < max_hives

    return CustomHiveLimits(
        max_hives=max_hives,
        current_count=current_count,
        can_create=can_create,
        subscription_status=current_user.subscription_status
    )


class GenerateIconRequest(BaseModel):
    bee_name: str
    description: str


class GenerateIconResponse(BaseModel):
    icon_base64: Optional[str]
    success: bool
    message: str


@router.post("/generate-icon", response_model=GenerateIconResponse)
async def generate_icon_endpoint(
    request: GenerateIconRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate a bee icon using Stability AI or DALL-E."""
    openai_key = await get_user_openai_key(current_user.id)
    stability_key = await get_user_stability_key(current_user.id)

    if not openai_key and not stability_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Stability AI or OpenAI API key required for icon generation. Add your key in Settings."
        )

    icon_base64 = await generate_bee_icon(
        openai_key or "",
        request.bee_name,
        request.description,
        stability_api_key=stability_key
    )

    if icon_base64:
        return GenerateIconResponse(
            icon_base64=icon_base64,
            success=True,
            message="Icon generated successfully"
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate icon. Check your OpenAI API key and try again."
        )


@router.get("", response_model=list[CustomHiveResponse])
async def list_custom_hives(current_user: User = Depends(get_current_user)):
    """List all custom hives for the current user."""
    async with get_db() as db:
        # Get all hives
        cursor = await db.execute(
            "SELECT * FROM custom_hives WHERE user_id = ? ORDER BY created_at DESC",
            (current_user.id,)
        )
        hive_rows = await cursor.fetchall()

        hives = []
        for hive_row in hive_rows:
            # Get bees for this hive
            bee_cursor = await db.execute(
                "SELECT * FROM custom_bees WHERE hive_id = ? ORDER BY display_order",
                (hive_row["id"],)
            )
            bee_rows = await bee_cursor.fetchall()

            bees = [
                CustomBeeResponse(
                    id=bee["id"],
                    hive_id=bee["hive_id"],
                    name=bee["name"],
                    human_name=bee["human_name"],
                    emoji=bee["emoji"] or "🐝",
                    description=bee["description"],
                    role=bee["role"],
                    icon_base64=bee["icon_base64"],
                    icon_generation_status=bee["icon_generation_status"] or "pending",
                    display_order=bee["display_order"] or 0,
                    created_at=str(bee["created_at"]) if bee["created_at"] else None
                )
                for bee in bee_rows
            ]

            hives.append(CustomHiveResponse(
                id=hive_row["id"],
                user_id=hive_row["user_id"],
                name=hive_row["name"],
                description=hive_row["description"],
                bees=bees,
                visibility=hive_row["visibility"] or "private",
                tags=hive_row["tags"],
                creator_name=hive_row["creator_name"],
                color=hive_row["color"] if "color" in hive_row.keys() else None,
                created_at=str(hive_row["created_at"]) if hive_row["created_at"] else None,
                is_custom=True
            ))

        return hives


@router.post("", response_model=CustomHiveResponse)
async def create_custom_hive(
    request: CustomHiveCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """Create a new custom hive with bees."""
    # Check limits
    max_hives = get_max_hives(current_user)
    current_count = await get_custom_hive_count(current_user.id)

    if max_hives != -1 and current_count >= max_hives:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You have reached your limit of {max_hives} custom hive(s). Upgrade to Pro for unlimited hives."
        )

    # Validate bee count
    if len(request.bees) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A hive must have at least 2 bees for debates to work."
        )
    if len(request.bees) > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A hive can have at most 5 bees."
        )

    hive_id = str(uuid.uuid4())

    async with get_db() as db:
        # Create hive
        visibility = request.visibility if request.visibility in ("public", "private") else "private"
        tags = request.tags.strip() if request.tags else None
        creator_name = (current_user.display_name or current_user.email.split("@")[0]) if visibility == "public" else None
        await db.execute(
            "INSERT INTO custom_hives (id, user_id, name, description, visibility, tags, creator_name, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (hive_id, current_user.id, request.name, request.description, visibility, tags, creator_name, request.color)
        )

        # Create bees
        bees = []
        for i, bee_data in enumerate(request.bees):
            bee_id = str(uuid.uuid4())
            await db.execute(
                """INSERT INTO custom_bees
                   (id, hive_id, user_id, name, human_name, emoji, description, role, display_order)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    bee_id,
                    hive_id,
                    current_user.id,
                    bee_data.name,
                    bee_data.human_name,
                    bee_data.emoji or "🐝",
                    bee_data.description,
                    bee_data.role,
                    i
                )
            )

            bee = CustomBeeResponse(
                id=bee_id,
                hive_id=hive_id,
                name=bee_data.name,
                human_name=bee_data.human_name,
                emoji=bee_data.emoji or "🐝",
                description=bee_data.description,
                role=bee_data.role,
                icon_base64=None,
                icon_generation_status="pending",
                display_order=i,
                created_at=None
            )
            bees.append(bee)

            # Queue icon generation in background
            background_tasks.add_task(
                generate_icon_background,
                current_user.id,
                bee_id,
                bee_data.name,
                bee_data.description
            )

        await db.commit()

    return CustomHiveResponse(
        id=hive_id,
        user_id=current_user.id,
        name=request.name,
        description=request.description,
        bees=bees,
        visibility=visibility,
        tags=tags,
        creator_name=creator_name,
        color=request.color,
        created_at=None,
        is_custom=True
    )


@router.get("/explore", response_model=list[CustomHiveResponse])
async def explore_public_hives(
    q: str = "",
    tag: str = "",
    sort: str = "popular",
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Browse all public hives with favorite counts. Optional auth for is_favorited."""
    user_id = current_user.id if current_user else None

    async with get_db() as db:
        # Base query with favorite count
        base = """SELECT ch.*, COALESCE(fav.cnt, 0) as favorite_count
                  FROM custom_hives ch
                  LEFT JOIN (SELECT hive_id, COUNT(*) as cnt FROM hive_favorites GROUP BY hive_id) fav
                  ON ch.id = fav.hive_id
                  WHERE ch.visibility = 'public'"""

        params = []
        if q:
            base += " AND (LOWER(ch.name) LIKE ? OR LOWER(ch.description) LIKE ? OR LOWER(ch.tags) LIKE ?)"
            params.extend([f"%{q.lower()}%"] * 3)
        elif tag:
            base += " AND LOWER(ch.tags) LIKE ?"
            params.append(f"%{tag.lower()}%")

        if sort == "popular":
            base += " ORDER BY favorite_count DESC, ch.created_at DESC"
        else:
            base += " ORDER BY ch.created_at DESC"
        base += " LIMIT 100"

        cursor = await db.execute(base, params)
        hive_rows = await cursor.fetchall()

        # Get user's favorites if logged in
        user_favorites = set()
        if user_id:
            fav_cursor = await db.execute("SELECT hive_id FROM hive_favorites WHERE user_id = ?", (user_id,))
            user_favorites = {r["hive_id"] for r in await fav_cursor.fetchall()}

        hives = []
        for hive_row in hive_rows:
            bee_cursor = await db.execute(
                "SELECT * FROM custom_bees WHERE hive_id = ? ORDER BY display_order",
                (hive_row["id"],)
            )
            bee_rows = await bee_cursor.fetchall()
            bees = [
                CustomBeeResponse(
                    id=bee["id"], hive_id=bee["hive_id"], name=bee["name"],
                    human_name=bee["human_name"], emoji=bee["emoji"] or "🐝",
                    description=bee["description"], role=bee["role"],
                    icon_base64=bee["icon_base64"],
                    icon_generation_status=bee["icon_generation_status"] or "pending",
                    display_order=bee["display_order"] or 0,
                    created_at=str(bee["created_at"]) if bee["created_at"] else None
                ) for bee in bee_rows
            ]
            hives.append(CustomHiveResponse(
                id=hive_row["id"], user_id=hive_row["user_id"],
                name=hive_row["name"], description=hive_row["description"],
                bees=bees, visibility="public", tags=hive_row["tags"],
                creator_name=hive_row["creator_name"],
                color=hive_row["color"] if "color" in hive_row.keys() else None,
                favorite_count=hive_row["favorite_count"],
                is_favorited=hive_row["id"] in user_favorites,
                created_at=str(hive_row["created_at"]) if hive_row["created_at"] else None,
                is_custom=True
            ))
        return hives


@router.get("/favorites", response_model=list[CustomHiveResponse])
async def list_favorites(current_user: User = Depends(get_current_user)):
    """List user's favorited hives."""
    async with get_db() as db:
        cursor = await db.execute(
            """SELECT ch.*, COALESCE(fav_count.cnt, 0) as favorite_count
               FROM hive_favorites hf
               JOIN custom_hives ch ON hf.hive_id = ch.id
               LEFT JOIN (SELECT hive_id, COUNT(*) as cnt FROM hive_favorites GROUP BY hive_id) fav_count
               ON ch.id = fav_count.hive_id
               WHERE hf.user_id = ?
               ORDER BY hf.created_at DESC""",
            (current_user.id,)
        )
        hive_rows = await cursor.fetchall()

        hives = []
        for hive_row in hive_rows:
            bee_cursor = await db.execute(
                "SELECT * FROM custom_bees WHERE hive_id = ? ORDER BY display_order",
                (hive_row["id"],)
            )
            bee_rows = await bee_cursor.fetchall()
            bees = [
                CustomBeeResponse(
                    id=bee["id"], hive_id=bee["hive_id"], name=bee["name"],
                    human_name=bee["human_name"], emoji=bee["emoji"] or "🐝",
                    description=bee["description"], role=bee["role"],
                    icon_base64=bee["icon_base64"],
                    icon_generation_status=bee["icon_generation_status"] or "pending",
                    display_order=bee["display_order"] or 0,
                    created_at=str(bee["created_at"]) if bee["created_at"] else None
                ) for bee in bee_rows
            ]
            hives.append(CustomHiveResponse(
                id=hive_row["id"], user_id=hive_row["user_id"],
                name=hive_row["name"], description=hive_row["description"],
                bees=bees, visibility=hive_row["visibility"] or "public",
                tags=hive_row["tags"], creator_name=hive_row["creator_name"],
                color=hive_row["color"] if "color" in hive_row.keys() else None,
                favorite_count=hive_row["favorite_count"],
                is_favorited=True,
                created_at=str(hive_row["created_at"]) if hive_row["created_at"] else None,
                is_custom=True
            ))
        return hives


@router.post("/{hive_id}/favorite")
async def toggle_favorite(hive_id: str, current_user: User = Depends(get_current_user)):
    """Toggle favorite on a public hive."""
    async with get_db() as db:
        # Check hive exists and is public
        cursor = await db.execute(
            "SELECT id FROM custom_hives WHERE id = ? AND visibility = 'public'", (hive_id,)
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Public hive not found")

        # Check if already favorited
        cursor = await db.execute(
            "SELECT id FROM hive_favorites WHERE user_id = ? AND hive_id = ?",
            (current_user.id, hive_id)
        )
        existing = await cursor.fetchone()

        if existing:
            await db.execute("DELETE FROM hive_favorites WHERE user_id = ? AND hive_id = ?",
                             (current_user.id, hive_id))
            await db.commit()
            return {"favorited": False}
        else:
            fav_id = str(uuid.uuid4())
            await db.execute(
                "INSERT INTO hive_favorites (id, user_id, hive_id) VALUES (?, ?, ?)",
                (fav_id, current_user.id, hive_id)
            )
            await db.commit()
            return {"favorited": True}


@router.get("/{hive_id}", response_model=CustomHiveResponse)
async def get_custom_hive(
    hive_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific custom hive."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM custom_hives WHERE id = ? AND user_id = ?",
            (hive_id, current_user.id)
        )
        hive_row = await cursor.fetchone()

        if not hive_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Custom hive not found"
            )

        # Get bees
        bee_cursor = await db.execute(
            "SELECT * FROM custom_bees WHERE hive_id = ? ORDER BY display_order",
            (hive_id,)
        )
        bee_rows = await bee_cursor.fetchall()

        bees = [
            CustomBeeResponse(
                id=bee["id"],
                hive_id=bee["hive_id"],
                name=bee["name"],
                human_name=bee["human_name"],
                emoji=bee["emoji"] or "🐝",
                description=bee["description"],
                role=bee["role"],
                icon_base64=bee["icon_base64"],
                icon_generation_status=bee["icon_generation_status"] or "pending",
                display_order=bee["display_order"] or 0,
                created_at=str(bee["created_at"]) if bee["created_at"] else None
            )
            for bee in bee_rows
        ]

        return CustomHiveResponse(
            id=hive_row["id"],
            user_id=hive_row["user_id"],
            name=hive_row["name"],
            description=hive_row["description"],
            bees=bees,
            visibility=hive_row["visibility"] or "private",
            tags=hive_row["tags"],
            creator_name=hive_row["creator_name"],
            color=hive_row["color"] if "color" in hive_row.keys() else None,
            created_at=str(hive_row["created_at"]) if hive_row["created_at"] else None,
            is_custom=True
        )


@router.put("/{hive_id}", response_model=CustomHiveResponse)
async def update_custom_hive(
    hive_id: str,
    request: CustomHiveUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a custom hive's name/description."""
    async with get_db() as db:
        # Check ownership
        cursor = await db.execute(
            "SELECT * FROM custom_hives WHERE id = ? AND user_id = ?",
            (hive_id, current_user.id)
        )
        hive_row = await cursor.fetchone()

        if not hive_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Custom hive not found"
            )

        # Update fields
        updates = []
        params = []
        if request.name is not None:
            updates.append("name = ?")
            params.append(request.name)
        if request.description is not None:
            updates.append("description = ?")
            params.append(request.description)
        if request.visibility is not None and request.visibility in ("public", "private"):
            updates.append("visibility = ?")
            params.append(request.visibility)
        if request.color is not None:
            updates.append("color = ?")
            params.append(request.color)

        if updates:
            params.append(hive_id)
            await db.execute(
                f"UPDATE custom_hives SET {', '.join(updates)} WHERE id = ?",
                params
            )
            await db.commit()

    # Return updated hive
    return await get_custom_hive(hive_id, current_user)


@router.delete("/{hive_id}")
async def delete_custom_hive(
    hive_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a custom hive and all its bees."""
    async with get_db() as db:
        # Check ownership
        cursor = await db.execute(
            "SELECT id FROM custom_hives WHERE id = ? AND user_id = ?",
            (hive_id, current_user.id)
        )
        if not await cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Custom hive not found"
            )

        # Delete bees first (foreign key)
        await db.execute(
            "DELETE FROM custom_bees WHERE hive_id = ?",
            (hive_id,)
        )

        # Delete hive
        await db.execute(
            "DELETE FROM custom_hives WHERE id = ?",
            (hive_id,)
        )
        await db.commit()

    return {"success": True}


# Bee management endpoints

@router.post("/{hive_id}/bees", response_model=CustomBeeResponse)
async def add_bee_to_hive(
    hive_id: str,
    request: CustomBeeCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """Add a new bee to an existing custom hive."""
    async with get_db() as db:
        # Check hive ownership
        cursor = await db.execute(
            "SELECT id FROM custom_hives WHERE id = ? AND user_id = ?",
            (hive_id, current_user.id)
        )
        if not await cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Custom hive not found"
            )

        # Check bee count
        bee_cursor = await db.execute(
            "SELECT COUNT(*) as count FROM custom_bees WHERE hive_id = ?",
            (hive_id,)
        )
        count_row = await bee_cursor.fetchone()
        if count_row["count"] >= 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A hive can have at most 5 bees."
            )

        # Get next display order
        order_cursor = await db.execute(
            "SELECT MAX(display_order) as max_order FROM custom_bees WHERE hive_id = ?",
            (hive_id,)
        )
        order_row = await order_cursor.fetchone()
        next_order = (order_row["max_order"] or 0) + 1

        # Create bee
        bee_id = str(uuid.uuid4())
        await db.execute(
            """INSERT INTO custom_bees
               (id, hive_id, user_id, name, human_name, emoji, description, role, display_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                bee_id,
                hive_id,
                current_user.id,
                request.name,
                request.human_name,
                request.emoji or "🐝",
                request.description,
                request.role,
                next_order
            )
        )
        await db.commit()

        # Queue icon generation
        background_tasks.add_task(
            generate_icon_background,
            current_user.id,
            bee_id,
            request.name,
            request.description
        )

        return CustomBeeResponse(
            id=bee_id,
            hive_id=hive_id,
            name=request.name,
            human_name=request.human_name,
            emoji=request.emoji or "🐝",
            description=request.description,
            role=request.role,
            icon_base64=None,
            icon_generation_status="pending",
            display_order=next_order,
            created_at=None
        )


@router.put("/{hive_id}/bees/{bee_id}", response_model=CustomBeeResponse)
async def update_bee(
    hive_id: str,
    bee_id: str,
    request: CustomBeeUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """Update a bee in a custom hive."""
    async with get_db() as db:
        # Check ownership
        cursor = await db.execute(
            """SELECT cb.* FROM custom_bees cb
               JOIN custom_hives ch ON cb.hive_id = ch.id
               WHERE cb.id = ? AND cb.hive_id = ? AND ch.user_id = ?""",
            (bee_id, hive_id, current_user.id)
        )
        bee_row = await cursor.fetchone()

        if not bee_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bee not found"
            )

        # Update fields
        updates = []
        params = []
        regenerate_icon = False

        if request.name is not None:
            updates.append("name = ?")
            params.append(request.name)
            regenerate_icon = True
        if request.human_name is not None:
            updates.append("human_name = ?")
            params.append(request.human_name)
        if request.emoji is not None:
            updates.append("emoji = ?")
            params.append(request.emoji)
        if request.description is not None:
            updates.append("description = ?")
            params.append(request.description)
            regenerate_icon = True
        if request.role is not None:
            updates.append("role = ?")
            params.append(request.role)
        if request.display_order is not None:
            updates.append("display_order = ?")
            params.append(request.display_order)

        if updates:
            params.append(bee_id)
            await db.execute(
                f"UPDATE custom_bees SET {', '.join(updates)} WHERE id = ?",
                params
            )
            await db.commit()

        # Regenerate icon if name or description changed
        if regenerate_icon:
            await db.execute(
                "UPDATE custom_bees SET icon_generation_status = 'pending', icon_base64 = NULL WHERE id = ?",
                (bee_id,)
            )
            await db.commit()

            new_name = request.name or bee_row["name"]
            new_desc = request.description or bee_row["description"]
            background_tasks.add_task(
                generate_icon_background,
                current_user.id,
                bee_id,
                new_name,
                new_desc
            )

        # Fetch updated bee
        cursor = await db.execute(
            "SELECT * FROM custom_bees WHERE id = ?",
            (bee_id,)
        )
        updated = await cursor.fetchone()

        return CustomBeeResponse(
            id=updated["id"],
            hive_id=updated["hive_id"],
            name=updated["name"],
            human_name=updated["human_name"],
            emoji=updated["emoji"] or "🐝",
            description=updated["description"],
            role=updated["role"],
            icon_base64=updated["icon_base64"],
            icon_generation_status=updated["icon_generation_status"] or "pending",
            display_order=updated["display_order"] or 0,
            created_at=str(updated["created_at"]) if updated["created_at"] else None
        )


@router.delete("/{hive_id}/bees/{bee_id}")
async def delete_bee(
    hive_id: str,
    bee_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a bee from a custom hive."""
    async with get_db() as db:
        # Check ownership and get current bee count
        cursor = await db.execute(
            """SELECT cb.id FROM custom_bees cb
               JOIN custom_hives ch ON cb.hive_id = ch.id
               WHERE cb.id = ? AND cb.hive_id = ? AND ch.user_id = ?""",
            (bee_id, hive_id, current_user.id)
        )
        if not await cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bee not found"
            )

        # Check we'll still have at least 2 bees
        count_cursor = await db.execute(
            "SELECT COUNT(*) as count FROM custom_bees WHERE hive_id = ?",
            (hive_id,)
        )
        count_row = await count_cursor.fetchone()
        if count_row["count"] <= 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A hive must have at least 2 bees. Delete the hive instead."
            )

        # Delete bee
        await db.execute(
            "DELETE FROM custom_bees WHERE id = ?",
            (bee_id,)
        )
        await db.commit()

    return {"success": True}


@router.post("/{hive_id}/bees/{bee_id}/regenerate-icon", response_model=CustomBeeResponse)
async def regenerate_bee_icon(
    hive_id: str,
    bee_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """Regenerate the icon for a bee."""
    async with get_db() as db:
        # Check ownership
        cursor = await db.execute(
            """SELECT cb.* FROM custom_bees cb
               JOIN custom_hives ch ON cb.hive_id = ch.id
               WHERE cb.id = ? AND cb.hive_id = ? AND ch.user_id = ?""",
            (bee_id, hive_id, current_user.id)
        )
        bee_row = await cursor.fetchone()

        if not bee_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bee not found"
            )

        # Reset icon status
        await db.execute(
            "UPDATE custom_bees SET icon_generation_status = 'pending', icon_base64 = NULL WHERE id = ?",
            (bee_id,)
        )
        await db.commit()

        # Queue regeneration
        background_tasks.add_task(
            generate_icon_background,
            current_user.id,
            bee_id,
            bee_row["name"],
            bee_row["description"]
        )

        return CustomBeeResponse(
            id=bee_row["id"],
            hive_id=bee_row["hive_id"],
            name=bee_row["name"],
            human_name=bee_row["human_name"],
            emoji=bee_row["emoji"] or "🐝",
            description=bee_row["description"],
            role=bee_row["role"],
            icon_base64=None,
            icon_generation_status="pending",
            display_order=bee_row["display_order"] or 0,
            created_at=str(bee_row["created_at"]) if bee_row["created_at"] else None
        )


