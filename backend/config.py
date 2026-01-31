"""Application configuration and settings."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

# JWT Settings
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION_MINUTES = int(os.getenv("JWT_EXPIRATION_MINUTES", "1440"))

# Encryption key for API keys
# In development, we use a fixed key. In production, set ENCRYPTION_KEY env var.
_DEFAULT_DEV_KEY = "ZGV2LWtleS1mb3ItYWktZGViYXRlLWFwcC0xMjM0NTY3OA=="  # Base64 padding needed
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")

# Database
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", Path(__file__).parent / "ai_debate.db"))

# Server
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Global API Keys (set these in Railway environment variables)
GLOBAL_API_KEYS = {
    "openai": os.getenv("OPENAI_API_KEY", ""),
    "anthropic": os.getenv("ANTHROPIC_API_KEY", ""),
    "google": os.getenv("GOOGLE_API_KEY", ""),
    "deepseek": os.getenv("DEEPSEEK_API_KEY", ""),
    "xai": os.getenv("XAI_API_KEY", ""),
}

# Available AI models by provider
AI_MODELS = {
    "openai": {
        "name": "OpenAI",
        "models": [
            {"id": "gpt-4", "name": "GPT-4"},
            {"id": "gpt-4o", "name": "GPT-4o"},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
            {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo"},
        ]
    },
    "anthropic": {
        "name": "Anthropic",
        "models": [
            {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4"},
            {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet"},
            {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus"},
        ]
    },
    "google": {
        "name": "Google",
        "models": [
            {"id": "gemini-pro", "name": "Gemini Pro"},
            {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro"},
        ]
    },
    "deepseek": {
        "name": "Deepseek",
        "models": [
            {"id": "deepseek-chat", "name": "Deepseek Chat"},
            {"id": "deepseek-reasoner", "name": "Deepseek Reasoner"},
        ]
    },
    "xai": {
        "name": "xAI",
        "models": [
            {"id": "grok-2", "name": "Grok 2"},
            {"id": "grok-beta", "name": "Grok Beta"},
        ]
    }
}
