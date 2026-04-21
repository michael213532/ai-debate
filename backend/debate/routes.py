"""Debate API routes."""
import uuid
import json
import asyncio
from typing import Dict, Optional
from fastapi import APIRouter, HTTPException, status, Depends, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from cryptography.fernet import Fernet
from backend.config import AI_MODELS, ENCRYPTION_KEY, FREE_DEBATE_LIMIT, GUEST_DEBATE_LIMIT
from backend.auth.dependencies import get_current_user, get_current_user_optional
from fastapi import Request
from backend.auth.jwt import verify_token
from backend.database import get_db, User, Debate, Message
try:
    from backend.memory import (
        get_user_memory,
        get_user_memory_context,
        delete_user_fact,
        clear_user_memory,
    )
    MEMORY_AVAILABLE = True
except ImportError as e:
    print(f"Memory module not available: {e}")
    MEMORY_AVAILABLE = False
    # Provide fallback functions
    async def get_user_memory(user_id): return []
    async def get_user_memory_context(user_id): return ""
    async def delete_user_fact(user_id, fact_id): return False
    async def clear_user_memory(user_id): return 0
from .schemas import (
    CreateDebateRequest,
    DebateResponse,
    DebateDetailResponse,
    MessageResponse,
    ApiKeyRequest,
    ProviderStatus,
    ModelInfo,
    PersonalityInfo,
    PersonalitySuggestionRequest,
    PersonalitySuggestionResponse,
    HiveInfo,
    SpecialBeeInfo,
)
from .orchestrator import DebateOrchestrator
from backend.personalities import (
    get_all_personalities,
    get_all_hives,
    get_hive_personalities,
    get_special_bees,
    suggest_personalities,
    PERSONALITIES,
)
from backend.providers import ProviderRegistry

router = APIRouter(tags=["debates"])

# Store active debates and their WebSocket connections
active_debates: Dict[str, DebateOrchestrator] = {}
debate_connections: Dict[str, list[WebSocket]] = {}


# Persistent cipher for the application lifetime
_cipher = None
_generated_key = None

def get_cipher():
    """Get Fernet cipher for API key encryption."""
    global _cipher, _generated_key
    if _cipher is not None:
        return _cipher

    try:
        if ENCRYPTION_KEY:
            key = ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY
        else:
            # Generate and store a key for development (persists for app lifetime)
            if _generated_key is None:
                _generated_key = Fernet.generate_key()
            key = _generated_key

        _cipher = Fernet(key)
        return _cipher
    except Exception as e:
        print(f"Error creating cipher: {e}")
        raise


def encrypt_api_key(api_key: str) -> str:
    """Encrypt an API key."""
    try:
        cipher = get_cipher()
        return cipher.encrypt(api_key.encode()).decode()
    except Exception as e:
        print(f"Error encrypting API key: {e}")
        raise


def decrypt_api_key(encrypted_key: str) -> str:
    """Decrypt an API key."""
    try:
        cipher = get_cipher()
        return cipher.decrypt(encrypted_key.encode()).decode()
    except Exception as e:
        print(f"Error decrypting API key: {e}")
        raise


async def get_user_api_keys(user_id: str) -> dict[str, str]:
    """Get app-level API key (xAI only)."""
    from backend.config import XAI_API_KEY
    keys = {}
    if XAI_API_KEY:
        keys["xai"] = XAI_API_KEY
    return keys


# Hives endpoints
@router.get("/api/hives", response_model=list[HiveInfo])
async def list_hives():
    """List all available hives with their bees (public endpoint)."""
    hives_data = get_all_hives()
    return [
        HiveInfo(
            id=h["id"],
            name=h["name"],
            description=h["description"],
            personalities=[
                PersonalityInfo(
                    id=p["id"],
                    name=p["name"],
                    human_name=p["human_name"],
                    emoji=p["emoji"],
                    description=p["description"],
                    is_special=p.get("is_special", False)
                )
                for p in h["personalities"]
            ]
        )
        for h in hives_data
    ]


@router.get("/api/hives/{hive_id}/personalities", response_model=list[PersonalityInfo])
async def list_hive_personalities(hive_id: str):
    """List personalities for a specific hive (public endpoint)."""
    personalities = get_hive_personalities(hive_id)
    return [
        PersonalityInfo(
            id=p["id"],
            name=p["name"],
            human_name=p["human_name"],
            emoji=p["emoji"],
            description=p["description"],
            is_special=p.get("is_special", False)
        )
        for p in personalities
    ]


@router.get("/api/special-bees", response_model=list[SpecialBeeInfo])
async def list_special_bees():
    """List all special add-on bees (public endpoint)."""
    special = get_special_bees()
    return [
        SpecialBeeInfo(
            id=b["id"],
            name=b["name"],
            human_name=b["human_name"],
            emoji=b["emoji"],
            description=b["description"],
            is_special=True
        )
        for b in special
    ]


# Personalities endpoints (legacy + all personalities)
@router.get("/api/personalities", response_model=list[PersonalityInfo])
async def list_personalities():
    """List all available personality bees (public endpoint)."""
    return [
        PersonalityInfo(
            id=p["id"],
            name=p["name"],
            human_name=p["human_name"],
            emoji=p["emoji"],
            description=p["description"],
            is_special=p.get("is_special", False)
        )
        for p in get_all_personalities()
    ]


@router.post("/api/suggest-personalities", response_model=PersonalitySuggestionResponse)
async def get_personality_suggestions(
    request: PersonalitySuggestionRequest,
    current_user: User = Depends(get_current_user)
):
    """Suggest personalities based on a question."""
    suggested = suggest_personalities(request.question)
    all_personalities = [
        PersonalityInfo(
            id=p["id"],
            name=p["name"],
            human_name=p["human_name"],
            emoji=p["emoji"],
            description=p["description"],
            is_special=p.get("is_special", False)
        )
        for p in get_all_personalities()
    ]
    return PersonalitySuggestionResponse(
        suggested=suggested,
        all_personalities=all_personalities
    )


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


@router.get("/api/keys", response_model=list[ProviderStatus])
async def list_configured_providers(current_user: User = Depends(get_current_user)):
    """List all providers and whether they have API keys configured."""
    valid_keys = await get_user_api_keys(current_user.id)
    configured = set(valid_keys.keys())

    return [
        ProviderStatus(provider=provider_id, configured=provider_id in configured)
        for provider_id in AI_MODELS.keys()
    ]


# Debates endpoints
@router.post("/api/debates", response_model=DebateResponse)
async def create_debate(
    request: CreateDebateRequest,
    req: Request,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Create and start a new debate."""
    if current_user is None:
        # Guest user - no server-side limit, tracked by frontend session
        pass
    else:
        # Logged in user - check limits
        if not current_user.can_create_debate(FREE_DEBATE_LIMIT):
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Monthly limit ({FREE_DEBATE_LIMIT} buzzes) reached. Upgrade to Pro for unlimited buzzes!"
            )

    # Free users cannot attach images
    if request.images and (current_user is None or current_user.subscription_status != "active"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Image attachments are a Pro feature. Upgrade to Pro to use images."
        )

    # Determine user_id for this debate
    if current_user:
        user_id = current_user.id
    else:
        client_ip = req.headers.get("x-forwarded-for", req.client.host if req.client else "unknown").split(",")[0].strip()
        user_id = f"guest:{client_ip}"
        # Ensure guest user row exists (for FK constraint)
        async with get_db() as db:
            await db.execute(
                """INSERT INTO users (id, email, password_hash, subscription_status)
                   VALUES (?, ?, '', 'free')
                   ON CONFLICT(id) DO NOTHING""",
                (user_id, f"{client_ip}@guest")
            )
            await db.commit()

    debate_id = str(uuid.uuid4())
    config_data = request.config.model_dump()
    # Include images in config if provided
    if request.images:
        config_data["images"] = [img.model_dump() for img in request.images]
    config_json = json.dumps(config_data)

    try:
        async with get_db() as db:
            await db.execute(
                "INSERT INTO debates (id, user_id, topic, config, status) VALUES (?, ?, ?, ?, ?)",
                (debate_id, user_id, request.topic, config_json, "pending")
            )
            # Increment debates_used for logged-in free users
            if current_user and current_user.subscription_status != "active":
                current_month = current_user.get_current_month()
                if current_user.debates_reset_month != current_month:
                    # New month - reset counter
                    await db.execute(
                        "UPDATE users SET debates_used = 1, debates_reset_month = ? WHERE id = ?",
                        (current_month, current_user.id)
                    )
                else:
                    await db.execute(
                        "UPDATE users SET debates_used = debates_used + 1 WHERE id = ?",
                        (current_user.id,)
                    )
            await db.commit()
    except Exception as e:
        print(f"Error creating debate: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database temporarily unavailable. Please try again."
        )

    return DebateResponse(
        id=debate_id,
        topic=request.topic,
        config=request.config.model_dump(),
        status="pending"
    )


@router.post("/api/debates/{debate_id}/continue", response_model=DebateResponse)
async def continue_debate(
    debate_id: str,
    request: CreateDebateRequest,
    current_user: User = Depends(get_current_user)
):
    """Continue an existing debate with a new message."""
    # Free users cannot attach images
    if request.images and current_user.subscription_status != "active":
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Image attachments are a Pro feature. Upgrade to Pro to use images."
        )

    async with get_db() as db:
        # Verify debate exists and belongs to user
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

        # Get existing messages to build context
        cursor = await db.execute(
            "SELECT * FROM messages WHERE debate_id = ? ORDER BY round, created_at",
            (debate_id,)
        )
        existing_messages = await cursor.fetchall()

        # Build context from previous messages
        original_topic = debate_row["topic"]
        previous_context = f"Previous conversation:\nUser: {original_topic}\n"
        for msg in existing_messages:
            if msg["round"] > 0:  # Skip summary (round 0)
                previous_context += f"{msg['model_name']}: {msg['content']}\n"

        # Get max round number to continue from
        cursor = await db.execute(
            "SELECT MAX(round) as max_round FROM messages WHERE debate_id = ? AND round > 0",
            (debate_id,)
        )
        max_round_row = await cursor.fetchone()
        start_round = (max_round_row["max_round"] or 0) + 1

        # Update config with new settings and context
        config_data = request.config.model_dump()
        config_data["previous_context"] = previous_context
        config_data["continuation_topic"] = request.topic  # The new question
        config_data["start_round"] = start_round
        if request.images:
            config_data["images"] = [img.model_dump() for img in request.images]
        config_json = json.dumps(config_data)

        # Save the new user message as a separate message record
        await db.execute(
            """INSERT INTO messages (debate_id, round, model_name, provider, content)
               VALUES (?, ?, ?, ?, ?)""",
            (debate_id, start_round, "User", "user", request.topic)
        )

        # Update debate config and reset status (keep original topic)
        await db.execute(
            "UPDATE debates SET config = ?, status = ? WHERE id = ?",
            (config_json, "pending", debate_id)
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
    """List recent debates for the current user (max 50)."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM debates WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
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


@router.delete("/api/debates/{debate_id}")
async def delete_debate(
    debate_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a debate and all its messages."""
    async with get_db() as db:
        # Check if debate exists and belongs to user
        cursor = await db.execute(
            "SELECT id FROM debates WHERE id = ? AND user_id = ?",
            (debate_id, current_user.id)
        )
        if not await cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Debate not found"
            )

        # Delete related records first (foreign key constraints)
        await db.execute("DELETE FROM messages WHERE debate_id = ?", (debate_id,))
        await db.execute("DELETE FROM debate_summaries WHERE debate_id = ?", (debate_id,))
        # Clear source_debate_id reference in user_memory (no FK but good to clean up)
        await db.execute("UPDATE user_memory SET source_debate_id = NULL WHERE source_debate_id = ?", (debate_id,))
        # Delete debate
        await db.execute("DELETE FROM debates WHERE id = ?", (debate_id,))
        await db.commit()

    return {"success": True}


@router.get("/api/debates/{debate_id}/export")
async def export_debate(
    debate_id: str,
    auto_print: bool = True,
    current_user: User = Depends(get_current_user)
):
    """Export debate as printable HTML (Pro feature). Set auto_print=false for PDF generation."""
    # Check if user is Pro
    if current_user.subscription_status != "active":
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Export to PDF is a Pro feature. Please upgrade to access."
        )

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

    config = json.loads(debate_row["config"]) if isinstance(debate_row["config"], str) else debate_row["config"]

    # Build HTML
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Debate: {debate_row["topic"]}</title>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }}
            h1 {{ font-size: 24px; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }}
            .meta {{ color: #666; margin-bottom: 30px; }}
            .round {{ margin: 30px 0; }}
            .round-title {{ font-size: 14px; color: #6366f1; font-weight: 600; text-transform: uppercase; margin-bottom: 15px; }}
            .message {{ background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 15px; }}
            .model-name {{ font-weight: 600; color: #333; margin-bottom: 10px; }}
            .content {{ line-height: 1.7; white-space: pre-wrap; }}
            .summary {{ background: #f0f0ff; border: 2px solid #6366f1; border-radius: 8px; padding: 20px; margin-top: 30px; }}
            .summary-title {{ font-size: 18px; font-weight: 600; margin-bottom: 15px; }}
            @media print {{ body {{ margin: 20px; }} }}
        </style>
    </head>
    <body>
        <h1>{debate_row["topic"]}</h1>
        <div class="meta">
            <strong>Models:</strong> {', '.join(m.get('model_name', '') for m in config.get('models', []))}<br>
            <strong>Rounds:</strong> {config.get('rounds', 3)}<br>
            <strong>Date:</strong> {debate_row["created_at"]}
        </div>
    """

    # Group messages by round
    rounds = {}
    summary = None
    for row in message_rows:
        if row["round"] == 0:
            summary = row
        else:
            if row["round"] not in rounds:
                rounds[row["round"]] = []
            rounds[row["round"]].append(row)

    for round_num in sorted(rounds.keys()):
        html += f'<div class="round"><div class="round-title">Round {round_num}</div>'
        for msg in rounds[round_num]:
            html += f'''
            <div class="message">
                <div class="model-name">{msg["model_name"]}</div>
                <div class="content">{msg["content"]}</div>
            </div>
            '''
        html += '</div>'

    if summary:
        html += f'''
        <div class="summary">
            <div class="summary-title">Summary by {summary["model_name"]}</div>
            <div class="content">{summary["content"]}</div>
        </div>
        '''

    if auto_print:
        html += """
        <script>window.onload = function() { window.print(); }</script>
    """
    html += """
    </body>
    </html>
    """

    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)


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

    # Authenticate via token in query params (optional for guests)
    token = websocket.query_params.get("token")
    user_id = None
    is_pro = False

    if token:
        payload = verify_token(token)
        if payload:
            user_id = payload.get("sub")

    # Verify debate exists and belongs to user (or is a guest debate)
    async with get_db() as db:
        if user_id:
            cursor = await db.execute(
                "SELECT * FROM debates WHERE id = ? AND user_id = ?",
                (debate_id, user_id)
            )
        else:
            # Guest - just check debate exists and is a guest debate
            cursor = await db.execute(
                "SELECT * FROM debates WHERE id = ? AND user_id LIKE 'guest:%'",
                (debate_id,)
            )
        debate_row = await cursor.fetchone()

        if not debate_row:
            await websocket.close(code=4004, reason="Debate not found")
            return

        if user_id:
            user_cursor = await db.execute(
                "SELECT subscription_status FROM users WHERE id = ?",
                (user_id,)
            )
            user_row = await user_cursor.fetchone()
            is_pro = user_row and user_row["subscription_status"] == "active"

        # Use the debate's user_id for guest debates
        if not user_id:
            user_id = debate_row["user_id"]

    # Add to connections (prevent duplicates)
    if debate_id not in debate_connections:
        debate_connections[debate_id] = []
    if websocket not in debate_connections[debate_id]:
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

            # All users use grok-4-fast-reasoning
            for model in config.get("models", []):
                model["provider"] = "xai"
                model["model_id"] = "grok-4-fast-reasoning"
                model["model_name"] = "Grok 4"

            # Extract images from config if present
            images = config.pop("images", None)

            # For continuations, use the continuation_topic instead of full topic
            topic = config.pop("continuation_topic", None) or debate_row["topic"]

            # Build user memory context for AI injection
            user_memory_context = await get_user_memory_context(user_id)

            # Get detail mode from config (Pro users can choose)
            detail_mode = config.pop("detail_mode", "normal") if is_pro else "fast"

            orchestrator = DebateOrchestrator(
                debate_id=debate_id,
                topic=topic,
                config=config,
                api_keys=api_keys,
                on_message=broadcast_message,
                images=images,
                user_id=user_id,
                user_memory_context=user_memory_context,
                is_pro=is_pro,
                detail_mode=detail_mode
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
                elif data.get("type") == "pause":
                    if debate_id in active_debates:
                        active_debates[debate_id].pause()
                elif data.get("type") == "resume":
                    if debate_id in active_debates:
                        active_debates[debate_id].resume()
                elif data.get("type") == "reply_to_bee":
                    if debate_id in active_debates:
                        content = data.get("content", "")
                        target_bee = data.get("target_bee", "")
                        if content and target_bee:
                            await active_debates[debate_id].add_targeted_reply(content, target_bee)
                            active_debates[debate_id].resume()  # Unpause AFTER queuing reply
                elif data.get("type") == "intervention":
                    # Handle user intervention during discussion
                    if debate_id in active_debates:
                        content = data.get("content", "")
                        if content:
                            await active_debates[debate_id].add_intervention(content)
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


# Memory API Response Models
class MemoryFactResponse(BaseModel):
    id: int
    fact_type: str
    fact_key: str
    fact_value: str
    source_debate_id: Optional[str] = None
    created_at: Optional[str] = None


# Memory endpoints
@router.get("/api/memory", response_model=list[MemoryFactResponse])
async def list_memory_facts(current_user: User = Depends(get_current_user)):
    """List all stored memory facts for the current user."""
    facts = await get_user_memory(current_user.id)
    return [
        MemoryFactResponse(
            id=fact.id,
            fact_type=fact.fact_type,
            fact_key=fact.fact_key,
            fact_value=fact.fact_value,
            source_debate_id=fact.source_debate_id,
            created_at=str(fact.created_at) if fact.created_at else None
        )
        for fact in facts
    ]


@router.delete("/api/memory")
async def clear_all_memory(current_user: User = Depends(get_current_user)):
    """Clear all memory for the current user."""
    count = await clear_user_memory(current_user.id)
    return {"success": True, "deleted_count": count}


@router.delete("/api/memory/{fact_id}")
async def delete_memory_fact(
    fact_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete a specific memory fact."""
    deleted = await delete_user_fact(current_user.id, fact_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory fact not found"
        )
    return {"success": True}
