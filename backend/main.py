"""FastAPI application entry point."""
import os
import sys
import json
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.config import HOST, PORT
from backend.database import init_db, close_db
from backend.auth import auth_router
from backend.debate import debate_router
from backend.billing import billing_router
from backend.custom_hives import router as custom_hives_router
from backend.decisions import decisions_router
from backend.admin import router as admin_router


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
app.include_router(custom_hives_router)
app.include_router(decisions_router)
app.include_router(admin_router)

# Serve frontend static files
frontend_path = Path(__file__).parent.parent / "frontend"

# Mount static directories
if (frontend_path / "css").exists():
    app.mount("/css", StaticFiles(directory=frontend_path / "css"), name="css")
if (frontend_path / "js").exists():
    app.mount("/js", StaticFiles(directory=frontend_path / "js"), name="js")
if (frontend_path / "images").exists():
    app.mount("/images", StaticFiles(directory=frontend_path / "images"), name="images")


NO_CACHE_HEADERS = {"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"}


@app.get("/")
async def serve_app():
    """Serve the main app page."""
    return FileResponse(frontend_path / "app.html", headers=NO_CACHE_HEADERS)


@app.get("/login")
async def serve_login():
    """Serve the login/signup page."""
    return FileResponse(frontend_path / "index.html", headers=NO_CACHE_HEADERS)


@app.get("/pricing")
async def serve_pricing():
    """Serve the pricing page."""
    return FileResponse(frontend_path / "pricing.html", headers=NO_CACHE_HEADERS)


@app.get("/privacy")
async def serve_privacy():
    """Serve the privacy policy page."""
    return FileResponse(frontend_path / "privacy.html", headers=NO_CACHE_HEADERS)


@app.get("/settings")
async def serve_settings():
    """Serve the settings page."""
    return FileResponse(frontend_path / "settings.html", headers=NO_CACHE_HEADERS)


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


@app.get("/bee-expert.png")
async def serve_bee_expert():
    """Serve the expert bee icon."""
    return FileResponse(frontend_path / "bee-expert.png", media_type="image/png")


@app.get("/bee-optimist.png")
async def serve_bee_optimist():
    """Serve the optimist bee icon."""
    return FileResponse(frontend_path / "bee-optimist.png", media_type="image/png")


@app.get("/bee-analyst.png")
async def serve_bee_analyst():
    """Serve the analyst bee icon."""
    return FileResponse(frontend_path / "bee-analyst.png", media_type="image/png")


@app.get("/bee-skeptic.png")
async def serve_bee_skeptic():
    """Serve the skeptic bee icon."""
    return FileResponse(frontend_path / "bee-skeptic.png", media_type="image/png")


@app.get("/bee-realist.png")
async def serve_bee_realist():
    """Serve the realist bee icon."""
    return FileResponse(frontend_path / "bee-realist.png", media_type="image/png")


@app.get("/decision/{decision_id}")
async def serve_decision(decision_id: str):
    """Serve the main app with OG meta tags for a shared decision."""
    from backend.database import get_db

    # Try to fetch decision data for OG tags
    title = "Beecision - Hive Decision"
    description = "See what the hive decided!"

    try:
        async with get_db() as db:
            cursor = await db.execute(
                "SELECT topic, verdict_json, hive_name FROM public_decisions WHERE id = ?",
                (decision_id,)
            )
            row = await cursor.fetchone()
            if row:
                verdict = json.loads(row["verdict_json"]) if row["verdict_json"] else {}
                topic_title = verdict.get("title") or row["topic"]
                hive_decision = verdict.get("hive_decision", "")
                confidence = verdict.get("confidence", "")
                hive = row["hive_name"] or ""

                title = f"{topic_title} - Beecision"
                parts = []
                if hive_decision:
                    parts.append(f"Hive Decision: {hive_decision}")
                if confidence:
                    parts.append(f"{confidence}% confidence")
                if hive:
                    parts.append(f"{hive} Hive")
                description = " · ".join(parts) if parts else "See what the hive decided!"
    except Exception:
        pass

    # Read app.html and inject OG tags
    html_path = Path(__file__).parent.parent / "frontend" / "app.html"
    html = html_path.read_text(encoding="utf-8")

    og_tags = f'''<meta property="og:title" content="{title.replace('"', '&quot;')}">
    <meta property="og:description" content="{description.replace('"', '&quot;')}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="https://www.beecision.com/decision/{decision_id}">
    <meta property="og:image" content="https://www.beecision.com/logo.png">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="{title.replace('"', '&quot;')}">
    <meta name="twitter:description" content="{description.replace('"', '&quot;')}">'''

    # Inject OG tags after the <title> tag
    html = html.replace("</title>", f"</title>\n    {og_tags}")

    return HTMLResponse(content=html)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
