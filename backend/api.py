from dotenv import load_dotenv
load_dotenv()  # Load .env before any other imports that need env vars

from fastapi import FastAPI, HTTPException, APIRouter, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import asyncio
import pcr_presets

# PCR Presets are now managed via Supabase (pcr_presets.py)

# Database Initialization
from database.db import engine, Base, SessionLocal
import database.models # Ensure all models are loaded
import multiprocessing
from sqlalchemy import text

if multiprocessing.current_process().name == 'MainProcess':
    Base.metadata.create_all(bind=engine)

    # Small, idempotent schema additions used by local/self-hosted deployments.
    # The database keeps ownership and path indexes; research payloads live in /data.
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE workflow_shares ADD COLUMN IF NOT EXISTS shared_with_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE"))
            conn.execute(text("ALTER TABLE workflow_shares ALTER COLUMN lab_id DROP NOT NULL"))
            for table_name in ("crispr_results", "protocol_trees", "plot_projects", "pcr_presets", "sequence_workspace_files"):
                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS storage_path TEXT"))
            conn.execute(text("ALTER TABLE labs ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ"))
            conn.execute(text("ALTER TABLE labs ADD COLUMN IF NOT EXISTS archive_deletion_at TIMESTAMPTZ"))
            conn.commit()
        from database.db import SessionLocal
        from storage.migrate_layout import migrate_data_layout
        with SessionLocal() as migration_db:
            migrate_data_layout(migration_db)
        print("[STORAGE] Owner-oriented /data layout is ready.")
    except Exception as e:
        print(f"[STORAGE] Layout/schema migration failed: {e}")

    # Keep Booking's editable layout migration isolated so an unrelated legacy
    # migration cannot prevent these required columns from being installed.
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE facility_spots ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facility_areas(id) ON DELETE SET NULL"))
            conn.execute(text("ALTER TABLE facility_spots ADD COLUMN IF NOT EXISTS grid_x INTEGER DEFAULT 1"))
            conn.execute(text("ALTER TABLE facility_spots ADD COLUMN IF NOT EXISTS grid_y INTEGER DEFAULT 1"))
            conn.execute(text("ALTER TABLE facility_spots ADD COLUMN IF NOT EXISTS grid_width INTEGER DEFAULT 1"))
            conn.execute(text("ALTER TABLE facility_spots ADD COLUMN IF NOT EXISTS grid_height INTEGER DEFAULT 1"))
            conn.execute(text("ALTER TABLE facility_areas ADD COLUMN IF NOT EXISTS grid_rows INTEGER DEFAULT 4"))
            conn.commit()
    except Exception as e:
        print(f"[BOOKING] Facility layout schema migration failed: {e}")

app = FastAPI(title="My Lab Mate API")


async def _purge_expired_lab_archives_periodically():
    """Remove expired Lab Archives even when nobody opens the Labs page."""
    while True:
        try:
            from routers.labs import purge_expired_labs
            with SessionLocal() as db:
                purge_expired_labs(db)
        except Exception as exc:
            print(f"[LAB ARCHIVE] Expired archive cleanup failed: {exc}")
        await asyncio.sleep(60 * 60)


@app.on_event("startup")
async def start_lab_archive_cleanup():
    asyncio.create_task(_purge_expired_lab_archives_periodically())

@app.middleware("http")
async def block_writes_to_deleting_lab_archives(request: Request, call_next):
    """A scheduled Lab deletion leaves its archive strictly read-only."""
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.url.path.startswith("/api/lab-archive/"):
        parts = request.url.path.split("/")
        if len(parts) > 3:
            from database.models import Lab
            db = SessionLocal()
            try:
                lab = db.query(Lab).filter(Lab.id == parts[3]).first()
                if lab and lab.archive_deletion_at:
                    return JSONResponse(status_code=423, content={"detail": "This Lab Archive is read-only until its scheduled deletion."})
            finally:
                db.close()
    return await call_next(request)

# ── Main API Router ──────────────────────────────────────────────────────────
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    print(f"[DEBUG] Validation Error: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": str(exc.body)},
    )

# Include PCR presets router
api_router.include_router(pcr_presets.router)

# Include auth router
from auth.router import router as auth_router
api_router.include_router(auth_router)

# Include results router
from routers.results import router as results_router
from routers.protocol_trees import router as protocol_trees_router
from routers.plot_projects import router as plot_projects_router
from routers.tool_directory import router as tool_directory_router
from routers.sequence_workspace import router as sequence_workspace_router
from routers.storage_quotas import router as storage_quotas_router
from routers.deployment_updates import router as deployment_updates_router
from routers.server_admin import router as server_admin_router
from routers.r_plot_render import router as r_plot_render_router
from routers.pdf_documents import router as pdf_documents_router
api_router.include_router(results_router)
api_router.include_router(protocol_trees_router)
api_router.include_router(plot_projects_router)
api_router.include_router(tool_directory_router)
api_router.include_router(sequence_workspace_router)
api_router.include_router(storage_quotas_router)
api_router.include_router(deployment_updates_router)
api_router.include_router(server_admin_router)
api_router.include_router(r_plot_render_router)
api_router.include_router(pdf_documents_router)

# Include labs router
print("[DEBUG] Including labs_router from routers.labs")
from routers.labs import router as labs_router
api_router.include_router(labs_router)

# Include lab notebook router
print("[DEBUG] Including lab_notebook_router from routers.lab_notebook")
from routers.lab_notebook import router as lab_notebook_router
api_router.include_router(lab_notebook_router)

# Include lab archive router
print("[DEBUG] Including lab_archive_router from routers.lab_archive")
from routers.lab_archive import router as lab_archive_router
api_router.include_router(lab_archive_router)

# Include facility booking router
print("[DEBUG] Including facility_booking_router from routers.facility_booking")
from routers.facility_booking import router as facility_booking_router
api_router.include_router(facility_booking_router)



# Include main api_router
app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=False)
