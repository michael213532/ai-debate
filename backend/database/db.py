"""Database connection and initialization."""
import asyncpg
import aiosqlite
import json
from contextlib import asynccontextmanager
from backend.config import DATABASE_PATH, DATABASE_URL

# Global connection pool for PostgreSQL
_pool = None

def is_postgres():
    """Check if we're using PostgreSQL."""
    return bool(DATABASE_URL)

async def init_db():
    """Initialize the database with required tables."""
    if is_postgres():
        await init_postgres()
    else:
        await init_sqlite()

async def close_db():
    """Close database connections."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def init_postgres():
    """Initialize PostgreSQL database."""
    global _pool
    print(f"Connecting to PostgreSQL...")
    try:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        print(f"PostgreSQL connection pool created")
    except Exception as e:
        print(f"Failed to create PostgreSQL pool: {e}")
        raise

    async with _pool.acquire() as conn:
        try:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    stripe_customer_id TEXT,
                    subscription_status TEXT DEFAULT 'free',
                    subscription_end TIMESTAMP,
                    debates_used INTEGER DEFAULT 0,
                    debates_reset_month TEXT,
                    privacy_accepted INTEGER DEFAULT 0,
                    privacy_accepted_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            print("Created users table")

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS user_api_keys (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id),
                    provider TEXT NOT NULL,
                    api_key_encrypted TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, provider)
                )
            """)
            print("Created user_api_keys table")

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS debates (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id),
                    topic TEXT NOT NULL,
                    config JSONB NOT NULL,
                    status TEXT DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            print("Created debates table")

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id SERIAL PRIMARY KEY,
                    debate_id TEXT NOT NULL REFERENCES debates(id),
                    round INTEGER NOT NULL,
                    model_name TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            print("Created messages table")
            print("PostgreSQL initialization complete!")
        except Exception as e:
            print(f"Error creating tables: {e}")
            raise

async def init_sqlite():
    """Initialize SQLite database (for local development)."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                stripe_customer_id TEXT,
                subscription_status TEXT DEFAULT 'free',
                subscription_end TIMESTAMP,
                debates_used INTEGER DEFAULT 0,
                debates_reset_month TEXT,
                privacy_accepted INTEGER DEFAULT 0,
                privacy_accepted_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS user_api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                api_key_encrypted TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(user_id, provider)
            );

            CREATE TABLE IF NOT EXISTS debates (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                topic TEXT NOT NULL,
                config JSON NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

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


class DictRow(dict):
    """Dict that also supports index access like sqlite Row."""
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class PostgresCursor:
    """Cursor wrapper for PostgreSQL results."""
    def __init__(self, rows):
        self.rows = [DictRow(row) for row in rows]
        self._index = 0

    async def fetchone(self):
        if self._index < len(self.rows):
            row = self.rows[self._index]
            self._index += 1
            return row
        return None

    async def fetchall(self):
        return self.rows


class PostgresDB:
    """Database wrapper for PostgreSQL that mimics aiosqlite interface."""
    def __init__(self, conn):
        self.conn = conn
        self.row_factory = None

    def _convert_query(self, query, params):
        """Convert SQLite ? placeholders to PostgreSQL $n format."""
        if not params:
            return query, params

        new_query = query
        new_params = list(params)

        # Replace ? with $1, $2, etc.
        count = 0
        result = []
        i = 0
        while i < len(new_query):
            if new_query[i] == '?':
                count += 1
                result.append(f'${count}')
            else:
                result.append(new_query[i])
            i += 1

        return ''.join(result), new_params

    async def execute(self, query, params=None):
        """Execute a query and return a cursor-like object."""
        query, params = self._convert_query(query, params)

        # Handle JSON serialization for config field
        if params:
            params = list(params)
            for i, p in enumerate(params):
                if isinstance(p, (dict, list)):
                    params[i] = json.dumps(p)

        # Determine if this is a SELECT query (returns rows)
        query_upper = query.strip().upper()
        is_select = query_upper.startswith('SELECT')

        if is_select:
            if params:
                rows = await self.conn.fetch(query, *params)
            else:
                rows = await self.conn.fetch(query)
            return PostgresCursor([dict(row) for row in rows])
        else:
            # INSERT/UPDATE/DELETE - use execute
            if params:
                await self.conn.execute(query, *params)
            else:
                await self.conn.execute(query)
            return PostgresCursor([])

    async def commit(self):
        """PostgreSQL auto-commits, so this is a no-op."""
        pass

    async def close(self):
        """Release connection back to pool."""
        pass


@asynccontextmanager
async def get_db():
    """Get database connection as async context manager."""
    if is_postgres():
        conn = await _pool.acquire()
        db = PostgresDB(conn)
        try:
            yield db
        finally:
            await _pool.release(conn)
    else:
        db = await aiosqlite.connect(DATABASE_PATH)
        db.row_factory = aiosqlite.Row
        try:
            yield db
        finally:
            await db.close()
