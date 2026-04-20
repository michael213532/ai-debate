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
_DEFAULT_DEV_KEY = "ZGV2LWtleS1mb3ItYmVlY2lzaW9uLWFwcC0xMjM0NTY3OA=="  # Base64 padding needed
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")

# Database
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", Path(__file__).parent / "beecision.db"))
DATABASE_URL = os.getenv("DATABASE_URL", "")  # PostgreSQL connection string from Railway

# Server
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Stripe
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_ID = os.getenv("STRIPE_PRICE_ID", "")  # Monthly subscription price ID
APP_URL = os.getenv("APP_URL", "http://localhost:8000")

# SMTP Email (for password reset)
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "") or SMTP_USER

# App-level API key (xAI/Grok only)
XAI_API_KEY = os.getenv("XAI_API_KEY", "")

# Free tier limits
GUEST_DEBATE_LIMIT = 5      # No account (total, tracked by IP)
FREE_DEBATE_LIMIT = 20      # Logged in, no subscription
# Pro users: unlimited

# Available AI models by provider
AI_MODELS = {
    "xai": {
        "name": "xAI",
        "models": [
            {"id": "grok-4-fast-reasoning", "name": "Grok 4"},
        ]
    }
}

