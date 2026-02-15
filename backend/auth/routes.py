"""Authentication routes."""
import uuid
import bcrypt
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from .jwt import create_access_token
from .dependencies import get_current_user
from backend.database import get_db, User

router = APIRouter(prefix="/api/auth", tags=["auth"])


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against a hash."""
    return bcrypt.checkpw(password.encode(), hashed.encode())


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    privacy_accepted: bool = False


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    privacy_accepted: bool = False


@router.post("/register", response_model=TokenResponse)
async def register(request: RegisterRequest):
    """Register a new user."""
    # Require privacy acceptance at registration
    if not request.privacy_accepted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must accept the privacy policy to create an account"
        )

    try:
        async with get_db() as db:
            # Check if email already exists
            cursor = await db.execute(
                "SELECT id FROM users WHERE email = ?",
                (request.email,)
            )
            if await cursor.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered"
                )

            # Create new user
            user_id = str(uuid.uuid4())
            password_hash = hash_password(request.password)
            now = datetime.utcnow().isoformat()

            await db.execute(
                """INSERT INTO users (id, email, password_hash, privacy_accepted, privacy_accepted_at)
                   VALUES (?, ?, ?, 1, ?)""",
                (user_id, request.email, password_hash, now)
            )
            await db.commit()

            # Generate token
            access_token = create_access_token(data={"sub": user_id})
            return TokenResponse(access_token=access_token)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Registration error: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """Login with email and password."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM users WHERE email = ?",
            (request.email,)
        )
        row = await cursor.fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        user = User.from_row(row)

        if not verify_password(request.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        access_token = create_access_token(data={"sub": user.id})
        return TokenResponse(access_token=access_token)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        privacy_accepted=current_user.privacy_accepted
    )


@router.post("/accept-privacy")
async def accept_privacy(current_user: User = Depends(get_current_user)):
    """Accept the privacy policy (for existing users)."""
    async with get_db() as db:
        now = datetime.utcnow().isoformat()
        await db.execute(
            "UPDATE users SET privacy_accepted = 1, privacy_accepted_at = ? WHERE id = ?",
            (now, current_user.id)
        )
        await db.commit()
    return {"success": True}
