"""Debate API routes."""
import uuid
import json
import asyncio
from typing import Dict
from fastapi import APIRouter, HTTPException, status, Depends, WebSocket, WebSocketDisconnect
from cryptography.fernet import Fernet
from backend.config import AI_MODELS, ENCRYPTION_KEY, GLOBAL_API_KEYS
from backend.auth.dependencies import get_current_user
from backend.auth.jwt import verify_token
from backend.database import get_db, User, Debate, Message
from .schemas import (
    CreateDebateRequest,
    DebateResponse,
    DebateDetailResponse,
    MessageResponse,
    ApiKeyRequest,
    ProviderStatus,
    ModelInfo
)
from .orchestrator import DebateOrchestrator
from backend.providers import ProviderRegistry

router = APIRouter(tags=["debates"])

# Store active debates and their WebSocket connections
active_debates: Dict[str, DebateOrchestrator] = {}
debate_connections: Dict[str, list[WebSocket]] = {}


# Persistent cipher for the application lifetime
_cipher = None

def get_cipher():
    """Get Fernet cipher for API key encryption."""
    global _cipher
    if _cipher is not None:
        return _cipher

    if ENCRYPTION_KEY:
        key = ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY
    else:
        # Generate and store a key for development (persists for app lifetime)
        key = Fernet.generate_key()

    _cipher = Fernet(key)
    return _cipher


def encrypt_api_key(api_key: str) -> str:
    """Encrypt an API key."""
    cipher = get_cipher()
    return cipher.encrypt(api_key.encode()).decode()


def decrypt_api_key(encrypted_key: str) -> str:
    """Decrypt an API key."""
    cipher = get_cipher()
    return cipher.decrypt(encrypted_key.encode()).decode()


async def get_user_api_keys(user_id: str) -> dict[str, str]:
    """Get API keys - uses global keys if set, otherwise user keys."""
    # Start with global keys
    keys = {k: v for k, v in GLOBAL_API_KEYS.items() if v}

    # Add user keys (can override global if user has their own)
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT provider, api_key_encrypted FROM user_api_keys WHERE user_id = ?",
            (user_id,)
        )
        rows = await cursor.fetchall()
        for row in rows:
            keys[row["provider"]] = decrypt_api_key(row["api_key_encrypted"])

    return keys


# Models endpoints
@router.get("/api/models", response_model=list[ModelInfo])
async def list_models(current_user: User = Depends(get_current_user)):
    """List all available AI models."""
    models = []
    for provider_id, provider_info in AI_MODELS.items():
        for model in provider_info["models"]:
            models.append(ModelInfo(
                id=model["id"],
                name=model["name"],
                provider=provider_id,
                provider_name=provider_info["name"]
            ))
    return models


# API Keys endpoints
@router.post("/api/keys/{provider}")
async def save_api_key(
    provider: str,
    request: ApiKeyRequest,
    current_user: User = Depends(get_current_user)
):
    """Save an API key for a provider."""
    if provider not in AI_MODELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown provider: {provider}"
        )

    encrypted_key = encrypt_api_key(request.api_key)

    async with get_db() as db:
        await db.execute(
            """INSERT INTO user_api_keys (user_id, provider, api_key_encrypted)
               VALUES (?, ?, ?)
               ON CONFLICT(user_id, provider) DO UPDATE SET api_key_encrypted = ?""",
            (current_user.id, provider, encrypted_key, encrypted_key)
        )
        await db.commit()

    return {"status": "ok", "provider": provider}


@router.delete("/api/keys/{provider}")
async def delete_api_key(
    provider: str,
    current_user: User = Depends(get_current_user)
):
    """Delete an API key for a provider."""
    async with get_db() as db:
        await db.execute(
            "DELETE FROM user_api_keys WHERE user_id = ? AND provider = ?",
            (current_user.id, provider)
        )
        await db.commit()

    return {"status": "ok", "provider": provider}


@router.get("/api/keys", response_model=list[ProviderStatus])
async def list_configured_providers(current_user: User = Depends(get_current_user)):
    """List all providers and whether they have API keys configured."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT provider FROM user_api_keys WHERE user_id = ?",
            (current_user.id,)
        )
        rows = await cursor.fetchall()
        configured = {row["provider"] for row in rows}

    return [
        ProviderStatus(provider=provider_id, configured=provider_id in configured)
        for provider_id in AI_MODELS.keys()
    ]


@router.post("/api/keys/{provider}/test")
async def test_api_key(
    provider: str,
    current_user: User = Depends(get_current_user)
):
    """Test if an API key is valid."""
    if provider not in AI_MODELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown provider: {provider}"
        )

    api_keys = await get_user_api_keys(current_user.id)
    if provider not in api_keys:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No API key configured for {provider}"
        )

    try:
        provider_class = ProviderRegistry.get(provider)
        provider_instance = provider_class(api_keys[provider])
        is_valid = await provider_instance.test_connection()
        return {"valid": is_valid, "provider": provider}
    except Exception as e:
        return {"valid": False, "provider": provider, "error": str(e)}


# Debates endpoints
@router.post("/api/debates", response_model=DebateResponse)
async def create_debate(
    request: CreateDebateRequest,
    current_user: User = Depends(get_current_user)
):
    """Create and start a new debate."""
    debate_id = str(uuid.uuid4())
    config_json = json.dumps(request.config.model_dump())

    async with get_db() as db:
        await db.execute(
            "INSERT INTO debates (id, user_id, topic, config, status) VALUES (?, ?, ?, ?, ?)",
            (debate_id, current_user.id, request.topic, config_json, "pending")
        )
        await db.commit()

    return DebateResponse(
        id=debate_id,
        topic=request.topic,
        config=request.config.model_dump(),
        status="pending"
    )


@router.get("/api/debates", response_model=list[DebateResponse])
async def list_debates(current_user: User = Depends(get_current_user)):
    """List all debates for the current user."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM debates WHERE user_id = ? ORDER BY created_at DESC",
            (current_user.id,)
        )
        rows = await cursor.fetchall()

    return [
        DebateResponse(
            id=row["id"],
            topic=row["topic"],
            config=json.loads(row["config"]) if isinstance(row["config"], str) else row["config"],
            status=row["status"],
            created_at=str(row["created_at"]) if row["created_at"] else None
        )
        for row in rows
    ]


@router.get("/api/debates/{debate_id}", response_model=DebateDetailResponse)
async def get_debate(
    debate_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a debate with all its messages."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM debates WHERE id = ? AND user_id = ?",
            (debate_id, current_user.id)
        )
        debate_row = await cursor.fetchone()

        if not debate_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Debate not found"
            )

        cursor = await db.execute(
            "SELECT * FROM messages WHERE debate_id = ? ORDER BY round, created_at",
            (debate_id,)
        )
        message_rows = await cursor.fetchall()

    debate = DebateResponse(
        id=debate_row["id"],
        topic=debate_row["topic"],
        config=json.loads(debate_row["config"]) if isinstance(debate_row["config"], str) else debate_row["config"],
        status=debate_row["status"],
        created_at=str(debate_row["created_at"]) if debate_row["created_at"] else None
    )

    messages = [
        MessageResponse(
            id=row["id"],
            debate_id=row["debate_id"],
            round=row["round"],
            model_name=row["model_name"],
            provider=row["provider"],
            content=row["content"],
            created_at=str(row["created_at"]) if row["created_at"] else None
        )
        for row in message_rows
    ]

    return DebateDetailResponse(debate=debate, messages=messages)


@router.post("/api/debates/{debate_id}/stop")
async def stop_debate(
    debate_id: str,
    current_user: User = Depends(get_current_user)
):
    """Stop an ongoing debate."""
    if debate_id in active_debates:
        active_debates[debate_id].stop()
        return {"status": "stopping", "debate_id": debate_id}

    async with get_db() as db:
        await db.execute(
            "UPDATE debates SET status = ? WHERE id = ? AND user_id = ?",
            ("stopped", debate_id, current_user.id)
        )
        await db.commit()

    return {"status": "stopped", "debate_id": debate_id}


# WebSocket endpoint
@router.websocket("/ws/debates/{debate_id}")
async def debate_websocket(websocket: WebSocket, debate_id: str):
    """WebSocket endpoint for real-time debate updates."""
    await websocket.accept()

    # Authenticate via token in query params
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return

    payload = verify_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid authentication token")
        return

    user_id = payload.get("sub")

    # Verify debate belongs to user
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM debates WHERE id = ? AND user_id = ?",
            (debate_id, user_id)
        )
        debate_row = await cursor.fetchone()

        if not debate_row:
            await websocket.close(code=4004, reason="Debate not found")
            return

    # Add to connections
    if debate_id not in debate_connections:
        debate_connections[debate_id] = []
    debate_connections[debate_id].append(websocket)

    async def broadcast_message(message: dict):
        """Broadcast message to all connected clients."""
        if debate_id in debate_connections:
            disconnected = []
            for ws in debate_connections[debate_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    disconnected.append(ws)
            for ws in disconnected:
                debate_connections[debate_id].remove(ws)

    try:
        # If debate is pending, start it
        if debate_row["status"] == "pending":
            api_keys = await get_user_api_keys(user_id)
            config = json.loads(debate_row["config"]) if isinstance(debate_row["config"], str) else debate_row["config"]

            orchestrator = DebateOrchestrator(
                debate_id=debate_id,
                topic=debate_row["topic"],
                config=config,
                api_keys=api_keys,
                on_message=broadcast_message
            )
            active_debates[debate_id] = orchestrator

            # Run debate in background
            asyncio.create_task(orchestrator.run())

        # Keep connection alive and handle messages
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=30)
                if data.get("type") == "stop":
                    if debate_id in active_debates:
                        active_debates[debate_id].stop()
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break
            except WebSocketDisconnect:
                break

    except WebSocketDisconnect:
        pass
    finally:
        # Clean up
        if debate_id in debate_connections and websocket in debate_connections[debate_id]:
            debate_connections[debate_id].remove(websocket)
        if debate_id in active_debates and not debate_connections.get(debate_id):
            del active_debates[debate_id]
