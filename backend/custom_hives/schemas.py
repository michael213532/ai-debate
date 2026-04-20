"""Pydantic schemas for custom hives API."""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class CustomBeeCreate(BaseModel):
    """Request to create a custom bee."""
    name: str = Field(..., min_length=1, max_length=50, description="Role title (e.g., 'The Strategist')")
    human_name: str = Field(..., min_length=1, max_length=30, description="Display name (e.g., 'Alex')")
    emoji: str = Field(default="🐝", max_length=10)
    description: str = Field(..., min_length=1, max_length=200, description="Short description for UI")
    role: str = Field(..., min_length=10, max_length=2000, description="Full personality prompt/system prompt")
    display_order: int = Field(default=0)


class CustomBeeUpdate(BaseModel):
    """Request to update a custom bee."""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    human_name: Optional[str] = Field(None, min_length=1, max_length=30)
    emoji: Optional[str] = Field(None, max_length=10)
    description: Optional[str] = Field(None, min_length=1, max_length=200)
    role: Optional[str] = Field(None, min_length=10, max_length=2000)
    display_order: Optional[int] = None


class CustomBeeResponse(BaseModel):
    """Response containing custom bee info."""
    id: str
    hive_id: str
    name: str
    human_name: str
    emoji: str
    description: str
    role: str
    icon_base64: Optional[str] = None
    icon_generation_status: str = "pending"
    display_order: int = 0
    created_at: Optional[str] = None


class CustomHiveCreate(BaseModel):
    """Request to create a custom hive with bees."""
    name: str = Field(..., min_length=1, max_length=50, description="Hive name")
    description: Optional[str] = Field(None, max_length=200, description="Hive description")
    bees: list[CustomBeeCreate] = Field(..., min_length=2, max_length=5, description="2-5 bees required")
    visibility: str = Field(default="private", description="'private' or 'public'")
    tags: Optional[str] = Field(None, max_length=200, description="Comma-separated tags")
    color: Optional[str] = None


class CustomHiveUpdate(BaseModel):
    """Request to update a custom hive."""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    description: Optional[str] = Field(None, max_length=200)
    visibility: Optional[str] = Field(None)
    color: Optional[str] = None


class CustomHiveResponse(BaseModel):
    """Response containing custom hive info."""
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    bees: list[CustomBeeResponse] = []
    visibility: str = "private"
    tags: Optional[str] = None
    creator_name: Optional[str] = None
    color: Optional[str] = None
    favorite_count: int = 0
    is_favorited: bool = False
    is_built_in: bool = False
    created_at: Optional[str] = None
    is_custom: bool = True


class CustomHiveLimits(BaseModel):
    """Response containing user's custom hive limits."""
    max_hives: int  # -1 for unlimited
    current_count: int
    can_create: bool
    subscription_status: str


class IconGenerationRequest(BaseModel):
    """Request to generate/regenerate a bee icon."""
    pass  # No additional params needed - uses bee's description
