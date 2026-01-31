"""FastAPI application entry point."""
import os
import sys
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.config import HOST, PORT
from backend.database import init_db
from backend.auth import auth_router
from backend.debate import debate_router
from backend.billing import billing_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    await init_db()
    yield
    # Shutdown
    pass


app = FastAPI(
    title="AI Debate Arena",
    description="A platform where multiple AI models debate and discuss topics",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(debate_router)
app.include_router(billing_router)

# Serve frontend static files
frontend_path = Path(__file__).parent.parent / "frontend"

# Mount static directories
if (frontend_path / "css").exists():
    app.mount("/css", StaticFiles(directory=frontend_path / "css"), name="css")
if (frontend_path / "js").exists():
    app.mount("/js", StaticFiles(directory=frontend_path / "js"), name="js")


@app.get("/")
async def serve_index():
    """Serve the landing page."""
    return FileResponse(frontend_path / "index.html")


@app.get("/app")
async def serve_app():
    """Serve the main app page."""
    return FileResponse(frontend_path / "app.html")


@app.get("/pricing")
async def serve_pricing():
    """Serve the pricing page."""
    return FileResponse(frontend_path / "pricing.html")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
