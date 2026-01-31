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


class DebateConfig(BaseModel):
    """Configuration for a debate."""
    models: list[ModelConfig]
    rounds: int = 3
    summarizer_index: Optional[int] = 0  # Index of model to summarize


class CreateDebateRequest(BaseModel):
    """Request to create a new debate."""
    topic: str
    config: DebateConfig


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
