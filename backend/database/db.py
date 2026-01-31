"""Database connection and initialization."""
import aiosqlite
from pathlib import Path
from contextlib import asynccontextmanager
from backend.config import DATABASE_PATH


async def init_db():
    """Initialize the database with required tables."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.executescript("""
            -- Users table
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                stripe_customer_id TEXT,
                subscription_status TEXT DEFAULT 'free',
                subscription_end TIMESTAMP,
                debates_used INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- User API keys (encrypted)
            CREATE TABLE IF NOT EXISTS user_api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                api_key_encrypted TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(user_id, provider)
            );

            -- Debates table
            CREATE TABLE IF NOT EXISTS debates (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                topic TEXT NOT NULL,
                config JSON NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            -- Messages table
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                debate_id TEXT NOT NULL,
                round INTEGER NOT NULL,
                model_name TEXT NOT NULL,
                provider TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (debate_id) REFERENCES debates(id)
            );
        """)
        await db.commit()


@asynccontextmanager
async def get_db():
    """Get database connection as async context manager."""
    db = await aiosqlite.connect(DATABASE_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()
