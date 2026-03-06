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
from backend.database import init_db, close_db
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
    await close_db()


app = FastAPI(
    title="Beecision",
    description="AI models debate, you decide",
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
async def serve_app():
    """Serve the main app page."""
    return FileResponse(frontend_path / "app.html")


@app.get("/login")
async def serve_login():
    """Serve the login/signup page."""
    return FileResponse(frontend_path / "index.html")


@app.get("/pricing")
async def serve_pricing():
    """Serve the pricing page."""
    return FileResponse(frontend_path / "pricing.html")


@app.get("/privacy")
async def serve_privacy():
    """Serve the privacy policy page."""
    return FileResponse(frontend_path / "privacy.html")


@app.get("/settings")
async def serve_settings():
    """Serve the settings page."""
    return FileResponse(frontend_path / "settings.html")


@app.get("/logo.svg")
async def serve_logo_svg():
    """Serve the SVG logo."""
    return FileResponse(frontend_path / "logo.svg", media_type="image/svg+xml")


@app.get("/logo.png")
async def serve_logo_png():
    """Serve the PNG logo."""
    return FileResponse(frontend_path / "logo.png", media_type="image/png")


@app.get("/bee-avatar.svg")
async def serve_bee_avatar():
    """Serve the bee avatar."""
    return FileResponse(frontend_path / "bee-avatar.svg", media_type="image/svg+xml")


@app.get("/bee-icon.png")
async def serve_bee_icon():
    """Serve the bee icon."""
    return FileResponse(frontend_path / "bee-icon.png", media_type="image/png")


@app.get("/favicon.svg")
async def serve_favicon():
    """Serve the favicon."""
    return FileResponse(frontend_path / "favicon.svg", media_type="image/svg+xml")


@app.get("/bee-expert.png")
async def serve_bee_expert():
    """Serve the expert bee icon."""
    return FileResponse(frontend_path / "bee-expert.png", media_type="image/png")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
