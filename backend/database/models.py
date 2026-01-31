"""Database models and data classes."""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
import json


@dataclass
class User:
    id: str
    email: str
    password_hash: str
    stripe_customer_id: Optional[str] = None
    subscription_status: str = "free"  # free, active, cancelled
    subscription_end: Optional[datetime] = None
    debates_used: int = 0
    created_at: Optional[datetime] = None

    @classmethod
    def from_row(cls, row) -> "User":
        return cls(
            id=row["id"],
            email=row["email"],
            password_hash=row["password_hash"],
            stripe_customer_id=row["stripe_customer_id"] if "stripe_customer_id" in row.keys() else None,
            subscription_status=row["subscription_status"] if "subscription_status" in row.keys() else "free",
            subscription_end=row["subscription_end"] if "subscription_end" in row.keys() else None,
            debates_used=row["debates_used"] if "debates_used" in row.keys() else 0,
            created_at=row["created_at"]
        )

    def can_create_debate(self, free_limit: int) -> bool:
        """Check if user can create a new debate."""
        if self.subscription_status == "active":
            return True
        return self.debates_used < free_limit


@dataclass
class UserApiKey:
    id: int
    user_id: str
    provider: str
    api_key_encrypted: str
    created_at: Optional[datetime] = None

    @classmethod
    def from_row(cls, row) -> "UserApiKey":
        return cls(
            id=row["id"],
            user_id=row["user_id"],
            provider=row["provider"],
            api_key_encrypted=row["api_key_encrypted"],
            created_at=row["created_at"]
        )


@dataclass
class Debate:
    id: str
    user_id: str
    topic: str
    config: dict
    status: str = "pending"
    created_at: Optional[datetime] = None

    @classmethod
    def from_row(cls, row) -> "Debate":
        config = row["config"]
        if isinstance(config, str):
            config = json.loads(config)
        return cls(
            id=row["id"],
            user_id=row["user_id"],
            topic=row["topic"],
            config=config,
            status=row["status"],
            created_at=row["created_at"]
        )


@dataclass
class Message:
    id: int
    debate_id: str
    round: int
    model_name: str
    provider: str
    content: str
    created_at: Optional[datetime] = None

    @classmethod
    def from_row(cls, row) -> "Message":
        return cls(
            id=row["id"],
            debate_id=row["debate_id"],
            round=row["round"],
            model_name=row["model_name"],
            provider=row["provider"],
            content=row["content"],
            created_at=row["created_at"]
        )
