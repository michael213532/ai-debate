"""Authentication dependencies and middleware."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from .jwt import verify_token
from backend.database import get_db, User

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """Get current authenticated user from JWT token."""
    token = credentials.credentials
    payload = verify_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM users WHERE id = ?",
            (user_id,)
        )
        row = await cursor.fetchone()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return User.from_row(row)


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> Optional[User]:
    """Get current user if authenticated, None otherwise."""
    if credentials is None:
        return None

    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
