"""Authentication routes."""
import uuid
import random
import bcrypt
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from .jwt import create_access_token
from .dependencies import get_current_user
from backend.database import get_db, User
from backend.config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM

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
    display_name: Optional[str] = None
    display_name_changed_at: Optional[str] = None


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
            now = datetime.utcnow()

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
        privacy_accepted=current_user.privacy_accepted,
        display_name=current_user.display_name,
        display_name_changed_at=current_user.display_name_changed_at
    )


class DisplayNameRequest(BaseModel):
    display_name: str


@router.put("/display-name")
async def update_display_name(
    request: DisplayNameRequest,
    current_user: User = Depends(get_current_user)
):
    """Update display name. Can only change once per week."""
    name = request.display_name.strip()
    if len(name) < 2 or len(name) > 20:
        raise HTTPException(status_code=400, detail="Display name must be 2-20 characters.")

    # Check weekly cooldown
    if current_user.display_name_changed_at:
        try:
            last_changed = datetime.fromisoformat(str(current_user.display_name_changed_at))
            if datetime.utcnow() - last_changed < timedelta(days=7):
                next_change = last_changed + timedelta(days=7)
                raise HTTPException(status_code=400, detail=f"You can change your display name again on {next_change.strftime('%b %d, %Y')}.")
        except (ValueError, TypeError):
            pass

    async with get_db() as db:
        now = datetime.utcnow().isoformat()
        await db.execute(
            "UPDATE users SET display_name = ?, display_name_changed_at = ? WHERE id = ?",
            (name, now, current_user.id)
        )
        await db.commit()

    return {"success": True, "display_name": name}


@router.post("/accept-privacy")
async def accept_privacy(current_user: User = Depends(get_current_user)):
    """Accept the privacy policy (for existing users)."""
    async with get_db() as db:
        now = datetime.utcnow()
        await db.execute(
            "UPDATE users SET privacy_accepted = 1, privacy_accepted_at = ? WHERE id = ?",
            (now, current_user.id)
        )
        await db.commit()
    return {"success": True}


# --- Password Reset ---

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str


def send_reset_email(to_email: str, code: str):
    """Send a password reset code via SMTP."""
    if not SMTP_USER or not SMTP_PASSWORD:
        print(f"[SMTP] Not configured. Reset code for {to_email}: {code}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Beecision - Password Reset Code"
    msg["From"] = SMTP_FROM
    msg["To"] = to_email

    html = f"""\
    <div style="font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #333; margin-bottom: 8px;">Reset your password</h2>
        <p style="color: #666; font-size: 15px;">Enter this code on Beecision to reset your password:</p>
        <div style="background: #f5f5f5; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #333;">{code}</span>
        </div>
        <p style="color: #999; font-size: 13px;">This code expires in 15 minutes. If you didn't request this, ignore this email.</p>
    </div>
    """
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM, to_email, msg.as_string())


@router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Send a 6-digit reset code to the user's email."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id FROM users WHERE email = ?",
            (request.email,)
        )
        row = await cursor.fetchone()

        if not row:
            # Don't reveal if email exists or not
            return {"success": True}

        code = f"{random.randint(0, 999999):06d}"
        expires = datetime.utcnow() + timedelta(minutes=15)

        await db.execute(
            "UPDATE users SET reset_code = ?, reset_code_expires = ? WHERE email = ?",
            (code, expires, request.email)
        )
        await db.commit()

    try:
        send_reset_email(request.email, code)
    except Exception as e:
        print(f"Failed to send reset email: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send email. Please try again later."
        )

    return {"success": True}


@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """Verify the reset code and set a new password."""
    if len(request.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters"
        )

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id, reset_code, reset_code_expires FROM users WHERE email = ?",
            (request.email,)
        )
        row = await cursor.fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid code"
            )

        stored_code = row["reset_code"]
        expires = row["reset_code_expires"]

        if not stored_code or stored_code != request.code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid code"
            )

        # Check expiration
        if expires:
            if isinstance(expires, str):
                expires = datetime.fromisoformat(expires)
            if datetime.utcnow() > expires:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Code has expired. Please request a new one."
                )

        # Update password and clear reset code
        new_hash = hash_password(request.new_password)
        await db.execute(
            "UPDATE users SET password_hash = ?, reset_code = NULL, reset_code_expires = NULL WHERE email = ?",
            (new_hash, request.email)
        )
        await db.commit()

    return {"success": True}
