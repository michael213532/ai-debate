FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV PYTHONUNBUFFERED=1
ENV DATABASE_PATH=/app/data/ai_debate.db
ENV PORT=8000

EXPOSE 8000

# Use shell to expand $PORT environment variable (Railway sets this dynamically)
CMD ["/bin/sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port $PORT"]
