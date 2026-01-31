"""Debate package."""
from .routes import router as debate_router
from .orchestrator import DebateOrchestrator

__all__ = ["debate_router", "DebateOrchestrator"]
