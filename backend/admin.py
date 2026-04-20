"""Admin routes - restricted to admin email only."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from backend.auth.dependencies import get_current_user
from backend.database import get_db, User

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_EMAIL = "michael24011@icloud.com"


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that requires admin access."""
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/users")
async def list_users(admin: User = Depends(require_admin)):
    """List all users with their buzz usage."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id, email, subscription_status, debates_used, debates_reset_month, "
            "display_name, created_at FROM users ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        users = []
        for row in rows:
            users.append({
                "id": row[0],
                "email": row[1],
                "subscription_status": row[2],
                "debates_used": row[3],
                "debates_reset_month": row[4],
                "display_name": row[5],
                "created_at": str(row[6]) if row[6] else None,
            })
        return {"users": users}


class ResetBuzzesRequest(BaseModel):
    user_id: str


@router.post("/reset-buzzes")
async def reset_buzzes(request: ResetBuzzesRequest, admin: User = Depends(require_admin)):
    """Reset a user's buzz count to 0."""
    async with get_db() as db:
        cursor = await db.execute("SELECT email FROM users WHERE id = ?", (request.user_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        await db.execute(
            "UPDATE users SET debates_used = 0 WHERE id = ?",
            (request.user_id,)
        )
        await db.commit()
        return {"success": True, "email": row[0]}


class SetSubscriptionRequest(BaseModel):
    user_id: str
    status: str  # free, active, cancelled


@router.post("/set-subscription")
async def set_subscription(request: SetSubscriptionRequest, admin: User = Depends(require_admin)):
    """Set a user's subscription status."""
    if request.status not in ("free", "active", "cancelled"):
        raise HTTPException(status_code=400, detail="Invalid status")
    async with get_db() as db:
        cursor = await db.execute("SELECT email FROM users WHERE id = ?", (request.user_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        await db.execute(
            "UPDATE users SET subscription_status = ? WHERE id = ?",
            (request.status, request.user_id)
        )
        await db.commit()
        return {"success": True, "email": row[0], "status": request.status}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: User = Depends(require_admin)):
    """Delete a user and all their data."""
    async with get_db() as db:
        cursor = await db.execute("SELECT email FROM users WHERE id = ?", (user_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if row[0] == ADMIN_EMAIL:
            raise HTTPException(status_code=400, detail="Cannot delete admin account")
        # Delete user data
        await db.execute("DELETE FROM messages WHERE debate_id IN (SELECT id FROM debates WHERE user_id = ?)", (user_id,))
        await db.execute("DELETE FROM debates WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM user_memory WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM hive_favorites WHERE user_id = ?", (user_id,))
        await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        await db.commit()
        return {"success": True, "email": row[0]}
