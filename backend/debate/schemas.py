"""Pydantic schemas for debate API."""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ModelConfig(BaseModel):
    """Configuration for a model in a debate."""
    provider: str
    model_id: str
    model_name: str
    role: Optional[str] = None  # Optional role/perspective
    personality_id: Optional[str] = None  # Personality bee ID (e.g., "analyst")


class PersonalityConfig(BaseModel):
    """Configuration for a personality bee in a decision."""
    personality_id: str  # e.g., "analyst", "skeptic", "optimist"
    model_provider: Optional[str] = None  # Provider to use, or auto-assign
    model_id: Optional[str] = None  # Specific model to use, or auto-assign


class PersonalityInfo(BaseModel):
    """Information about a personality bee."""
    id: str
    name: str
    human_name: str
    emoji: str
    description: str
    is_special: bool = False  # True for add-on bees (Devil's Advocate, Wild Card)


class HiveInfo(BaseModel):
    """Information about a hive (themed group of bees)."""
    id: str
    name: str
    description: str
    personalities: list[PersonalityInfo]


class SpecialBeeInfo(BaseModel):
    """Information about a special add-on bee."""
    id: str
    name: str
    human_name: str
    emoji: str
    description: str
    is_special: bool = True


class PersonalitySuggestionRequest(BaseModel):
    """Request to suggest personalities for a question."""
    question: str


class PersonalitySuggestionResponse(BaseModel):
    """Response with suggested personalities for a question."""
    suggested: list[str]  # List of personality IDs
    all_personalities: list[PersonalityInfo]  # All available personalities


class DebateConfig(BaseModel):
    """Configuration for a debate."""
    models: list[ModelConfig]
    rounds: int = 3
    summarizer_index: Optional[int] = 0  # Index of model to summarize
    previous_context: Optional[str] = None  # Context from continued conversations
    vibe: Optional[str] = "group-chat"  # Debate vibe (group-chat, brawl, courtroom, boardroom, panel-show)


class ImageData(BaseModel):
    """Image data for vision models."""
    base64: str  # Base64 encoded image
    media_type: str = "image/jpeg"  # image/jpeg, image/png, image/gif, image/webp


class CreateDebateRequest(BaseModel):
    """Request to create a new debate."""
    topic: str
    config: DebateConfig
    images: Optional[list[ImageData]] = None  # Optional image attachments (up to 10)


class DebateResponse(BaseModel):
    """Response containing debate info."""
    id: str
    topic: str
    config: dict
    status: str
    created_at: Optional[str] = None


class MessageResponse(BaseModel):
    """Response containing a message."""
    id: int
    debate_id: str
    round: int
    model_name: str
    provider: str
    content: str
    created_at: Optional[str] = None


class DebateDetailResponse(BaseModel):
    """Response with full debate details."""
    debate: DebateResponse
    messages: list[MessageResponse]


class ApiKeyRequest(BaseModel):
    """Request to save an API key."""
    api_key: str


class ProviderStatus(BaseModel):
    """Status of a provider's API key."""
    provider: str
    configured: bool


class ModelInfo(BaseModel):
    """Information about an AI model."""
    id: str
    name: str
    provider: str
    provider_name: str
