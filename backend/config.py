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

# Stripe
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_ID = os.getenv("STRIPE_PRICE_ID", "")  # Monthly subscription price ID
APP_URL = os.getenv("APP_URL", "http://localhost:8000")

# Free tier limits
FREE_DEBATE_LIMIT = 20  # Free users get 20 debates total

# Available AI models by provider
AI_MODELS = {
    "openai": {
        "name": "OpenAI",
        "models": [
            {"id": "gpt-4o", "name": "GPT-4o"},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
            {"id": "gpt-4-turbo", "name": "GPT-4 Turbo"},
            {"id": "gpt-4", "name": "GPT-4"},
        ]
    },
    "anthropic": {
        "name": "Anthropic",
        "models": [
            {"id": "claude-opus-4-6", "name": "Claude Opus 4.6"},
            {"id": "claude-sonnet-4-5-20250929", "name": "Claude Sonnet 4.5"},
            {"id": "claude-opus-4-5-20251101", "name": "Claude Opus 4.5"},
            {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4"},
            {"id": "claude-haiku-4-5-20251001", "name": "Claude Haiku 4.5"},
        ]
    },
    "google": {
        "name": "Google",
        "models": [
            {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro"},
            {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash"},
            {"id": "gemini-2.0-flash-exp", "name": "Gemini 2.0 Flash"},
        ]
    },
    "deepseek": {
        "name": "Deepseek",
        "models": [
            {"id": "deepseek-chat", "name": "Deepseek V3"},
            {"id": "deepseek-coder", "name": "Deepseek Coder"},
        ]
    },
    "xai": {
        "name": "xAI",
        "models": [
            {"id": "grok-beta", "name": "Grok Beta"},
            {"id": "grok-2-latest", "name": "Grok 2"},
        ]
    }
}
