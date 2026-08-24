from dotenv import load_dotenv
load_dotenv()  # Load .env before any other imports that need env vars

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, APIRouter, Request
from fastapi.responses import JSONResponse
import core.classifier as classifier
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Dict, Any
import os
import json
import shutil
import tempfile
import uuid
import time
import asyncio
import pcr_presets

# PCR Presets are now managed via Supabase (pcr_presets.py)

# Import our analysis pipelines
from run_local import process_files, process_files_multi, process_single_file_worker, _get_code_version, SUBSTITUTION_POLICY

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

# ── In-Memory Task Storage (Multiprocessing-Safe State Shared Manager) ───────
import multiprocessing

if multiprocessing.current_process().name == 'MainProcess':
    _manager = multiprocessing.Manager()
    tasks = _manager.dict()
    cancel_events = _manager.dict()
else:
    tasks = {}
    cancel_events = {}

@api_router.get("/status/{task_id}")
async def get_task_status(task_id: str):
    print(f"[DEBUG] Status checked for {task_id}")
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]

@api_router.post("/cancel/{task_id}")
async def cancel_task(task_id: str):
    print(f"[DEBUG] Cancel requested for {task_id}")
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    # Set the event to signal workers to abort
    if task_id in cancel_events:
        cancel_events[task_id].set()

    update_task(tasks, task_id, status="canceled", stage="Analysis canceled by user")
    return {"status": "canceled"}


# ── Constants for Limits ──────────────────────────────────────────────────────
MAX_TOTAL_SIZE = 5 * 1024 * 1024 * 1024  # 5GB
MAX_FILE_COUNT = 100
# Analysis uploads are temporary runtime files, not user documents. Keep them
# outside /data so the persistent tree contains only personal and lab data.
JOBS_DIR = os.getenv("ANALYSIS_JOBS_DIR", os.path.join(tempfile.gettempdir(), "myresearchmate-jobs"))

os.makedirs(JOBS_DIR, exist_ok=True)

# Startup Clean: Sweep any leftover folders from previously crashed server sessions
if multiprocessing.current_process().name == 'MainProcess' and os.path.exists(JOBS_DIR):
    try:
        for item in os.listdir(JOBS_DIR):
            item_path = os.path.join(JOBS_DIR, item)
            if os.path.isdir(item_path):
                shutil.rmtree(item_path)
            else:
                os.remove(item_path)
        print(f"[INIT] 100% Cleaned up orphaned job folders in {JOBS_DIR}")
    except Exception as e:
        print(f"[WARNING] Failed to clean up orphaned jobs: {str(e)}")

# ── Status helper (Process-Safe assignment) ──
def update_task(tasks_proxy, task_id: str, status: str = None, progress: int = None, stage: str = None, result = None, error = None, file_progress = None):
    if tasks_proxy is not None and task_id in tasks_proxy:
        task_data = dict(tasks_proxy[task_id])
        if status is not None: task_data["status"] = status
        if progress is not None: task_data["progress"] = progress
        if stage is not None: task_data["stage"] = stage
        if result is not None: task_data["result"] = result
        if error is not None: task_data["error"] = error
        if file_progress is not None: task_data["file_progress"] = file_progress
        tasks_proxy[task_id] = task_data

# ─────────────────────────────────────────────────────────────────────────────
# CRISPR Analysis Background Worker
# ─────────────────────────────────────────────────────────────────────────────
def background_analysis(
    task_id: str,
    tasks_proxy,
    job_dir: str,
    temp_filenames: List[str],
    targets_json: str,
    phred_threshold: int,
    indel_threshold: float,
    assignment_margin: float,
    analyze_ambiguous: bool,
    rescue_ambiguous: bool,
    rescue_threshold: int
):
    import gc
    import concurrent.futures
    try:
        update_task(tasks_proxy, task_id, status="running", stage="Initializing parallel analysis...", file_progress={f: 0 for f in temp_filenames})
        genes_payload = json.loads(targets_json)

        global _manager
        if '_manager' in globals():
            ce = _manager.Event()
        else:
            import multiprocessing
            ce = multiprocessing.Manager().Event()

        cancel_events[task_id] = ce

        all_results = []
        total_files = len(temp_filenames)

        # Parallel processing of files using a ProcessPoolExecutor
        max_workers = min(os.cpu_count() or 4, 16)
        print(f"[BACKGROUND] Initializing parallel analysis with {max_workers} worker processes for {total_files} files.")

        # Setup cross-process progress queue
        if '_manager' in globals():
            progress_queue = _manager.Queue()
        else:
            import multiprocessing
            progress_queue = multiprocessing.Manager().Queue()

        def monitor_progress():
            file_progress = {f: 0 for f in temp_filenames} # dict of filename -> pct
            while True:
                item = progress_queue.get()
                if item == "DONE":
                    break

                # Check for cancellation before processing updates
                if task_id in cancel_events and cancel_events[task_id].is_set():
                    update_task(tasks_proxy, task_id, status="canceled", stage="Canceling...")
                    break

                fname, p, msg = item
                file_progress[fname] = p

                # Calculate overall progress across all files
                if total_files > 0:
                    total_p = sum(file_progress.get(f, 0) for f in temp_filenames)
                    overall = int(10 + (total_p / (total_files * 100)) * 85)
                else:
                    overall = 10
                overall = min(99, max(10, overall))

                update_task(tasks_proxy, task_id, progress=overall, stage=msg, file_progress=dict(file_progress))

        import threading
        monitor_thread = threading.Thread(target=monitor_progress)
        monitor_thread.daemon = True
        monitor_thread.start()

        futures_to_file = {}
        with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as executor:
            for i, filename in enumerate(temp_filenames):
                filepath = os.path.join(job_dir, filename)
                if not os.path.exists(filepath): continue

                future = executor.submit(
                    process_single_file_worker,
                    filepath,
                    genes_payload,
                    phred_threshold,
                    indel_threshold,
                    assignment_margin,
                    analyze_ambiguous,
                    rescue_ambiguous,
                    rescue_threshold,
                    progress_queue,
                    cancel_events[task_id]
                )
                futures_to_file[future] = filename

            completed_files = 0
            for future in concurrent.futures.as_completed(futures_to_file):
                filename = futures_to_file[future]
                completed_files += 1

                # Ensure the file shows as 100% locally if the worker missed the final callback
                progress_queue.put((filename, 100, f"[{completed_files}/{total_files}] Completed {filename}"))

                try:
                    file_result = future.result()
                    if file_result and "results" in file_result:
                        all_results.extend(file_result["results"])
                except Exception as file_err:
                    print(f"[ERROR] Failed to process file {filename}: {str(file_err)}")
                    # Continue to process other files

        # Stop the monitor thread
        progress_queue.put("DONE")
        monitor_thread.join(timeout=2.0)

        # Check if canceled during execution
        if task_id in cancel_events and cancel_events[task_id].is_set():
            update_task(tasks_proxy, task_id, status="canceled", stage="Analysis canceled by user")
            return

        # Merge results into the final payload
        final_payload = {
            "metadata": {
                "phred_threshold": phred_threshold,
                "indel_threshold": indel_threshold,
                "is_multi_reference": True,
                "total_files": total_files,
                "code_version": _get_code_version(),
                "input_filenames": list(temp_filenames),
                "thresholds": {
                    "phred_threshold": phred_threshold,
                    "indel_threshold": indel_threshold,
                    "assignment_margin_threshold": assignment_margin,
                    "analyze_ambiguous": analyze_ambiguous,
                    "rescue_ambiguous": rescue_ambiguous,
                    "rescue_threshold": rescue_threshold,
                },
                "references": [
                    {
                        "gene": g.get("gene"),
                        "target_ids": [t.get("target_id") for t in g.get("targets", [])],
                    }
                    for g in genes_payload
                ],
                "substitution_policy": SUBSTITUTION_POLICY,
            },
            "results": all_results
        }

        update_task(tasks_proxy, task_id, status="completed", result=final_payload, progress=100, stage="Done")

    except Exception as e:
        import traceback
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(f"[ERROR] Analysis failed: {error_msg}")
        update_task(tasks_proxy, task_id, status="failed", error=str(e))
    finally:
        if task_id in cancel_events:
            del cancel_events[task_id]
        # Final Cleanup of the entire job directory
        if os.path.exists(job_dir):
            try: shutil.rmtree(job_dir)
            except: pass
        gc.collect()

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.requests import Request

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    print(f"[DEBUG] Validation Error: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": str(exc.body)},
    )

@api_router.post("/analyze")
async def run_analysis_endpoint(
    request: Request,
    background_tasks: BackgroundTasks
):
    """
    Optimized endpoint that streams files directly to disk to prevent RAM exhaustion.
    """
    import uuid
    from starlette.datastructures import UploadFile as StarletteUploadFile

    # 1. Initialize Task
    task_id = str(uuid.uuid4())
    tasks[task_id] = {
        "status": "pending",
        "progress": 0,
        "stage": "Streaming upload...",
        "result": None,
        "file_progress": {}
    }

    # 2. Create Job Directory
    job_id = str(uuid.uuid4())
    job_dir = os.path.join(JOBS_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    temp_filenames = []
    total_size = 0
    params = {}

    try:
        # 3. Stream Multipart Body
        # We use request.form() which Starlette optimizes to stream large files to disk (SpooledTemporaryFile)
        form = await request.form()

        # Validate File Count
        uploaded_files = form.getlist("files")
        if len(uploaded_files) > MAX_FILE_COUNT:
            shutil.rmtree(job_dir)
            raise HTTPException(status_code=400, detail=f"Too many files. Limit is {MAX_FILE_COUNT}.")

        # Process Files
        for field_name, value in form.multi_items():
            if isinstance(value, StarletteUploadFile):
                # Check Size during stream
                # Note: Starlette/FastAPI already saved this to a temp file if it's large.
                # We move it to our specific job directory.
                filename = os.path.basename(value.filename)

                # Prevent filename collisions from different directories
                base_name, ext = os.path.splitext(filename)
                counter = 1
                while filename in temp_filenames:
                    filename = f"{base_name}_{counter}{ext}"
                    counter += 1

                save_path = os.path.join(job_dir, filename)
                # Stream write from spooled file to our job dir using highly-optimized low-level C shutil
                await value.seek(0)
                with open(save_path, "wb") as buffer:
                    shutil.copyfileobj(value.file, buffer, length=1024*1024*10)

                # Check Size after copy
                file_size = os.path.getsize(save_path)
                total_size += file_size
                if total_size > MAX_TOTAL_SIZE:
                    shutil.rmtree(job_dir)
                    raise HTTPException(status_code=413, detail=f"Upload too large. Limit is 5GB.")

                temp_filenames.append(filename)
                await value.close()
            else:
                # Regular form fields
                params[field_name] = value

        # 4. Extract Analysis Params
        targets = params.get("targets", "[]")
        phred = int(params.get("phred_threshold", 20))
        indel = float(params.get("indel_threshold", 1.0))
        margin = float(params.get("assignment_margin_threshold", 0.02))
        do_analyze = params.get("analyze_ambiguous", "false").lower() == "true"
        do_rescue = params.get("rescue_ambiguous", "true").lower() == "true"
        rescue_val = int(params.get("rescue_threshold", 20))

        if not temp_filenames:
            shutil.rmtree(job_dir)
            raise HTTPException(status_code=400, detail="No files uploaded.")

        # 5. Dispatch Sandboxed Parallel Thread Analysis
        import threading
        t = threading.Thread(
            target=background_analysis,
            args=(
                task_id,
                tasks, # Safe manager proxy dictionary
                job_dir,
                temp_filenames,
                targets,
                phred,
                indel,
                margin,
                do_analyze,
                do_rescue,
                rescue_val
            )
        )
        t.daemon = True
        t.start()

        return {"task_id": task_id}

    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(job_dir): shutil.rmtree(job_dir)
        print(f"[ERROR] Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Benchmark Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@api_router.post("/benchmark/split")
async def benchmark_split_preview(
    target_seq: str = Form(...),
    files: List[UploadFile] = File(...),
    test_ratio: float = Form(0.2)
):
    total_reads = 0
    temp_dir = tempfile.gettempdir()
    for f in files:
        path = os.path.join(temp_dir, f"{uuid.uuid4()}_{f.filename}")
        with open(path, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
        with open(path, "r") as r:
            total_reads += sum(1 for line in r) // 4
        os.remove(path)

    test_count = int(total_reads * test_ratio)
    train_count = total_reads - test_count

    return {
        "total": total_reads,
        "train": train_count,
        "test": test_count
    }

def background_benchmark(
    task_id: str,
    target_seq: str,
    files: List[str],
    test_ratio: float,
    window_size: int,
    phred_threshold: int
):
    try:
        from core.benchmark import run_benchmarking
        tasks[task_id]["status"] = "running"
        results = run_benchmarking(
            target_seq=target_seq,
            fastq_paths=files,
            test_ratio=test_ratio,
            window_size=window_size,
            phred_threshold=phred_threshold,
            progress_callback=lambda p, s: tasks[task_id].update({"progress": p, "stage": s})
        )
        tasks[task_id]["status"] = "completed"
        tasks[task_id]["result"] = results
        tasks[task_id]["progress"] = 100
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)
    finally:
        for f in files:
            if os.path.exists(f): os.remove(f)

@api_router.post("/benchmark/run")
async def run_benchmark_endpoint(
    background_tasks: BackgroundTasks,
    target_seq: str = Form(...),
    files: List[UploadFile] = File(...),
    test_ratio: float = Form(0.2),
    window_size: int = Form(20),
    phred_threshold: int = Form(20)
):
    task_id = str(uuid.uuid4())
    tasks[task_id] = {
        "status": "pending",
        "progress": 0,
        "stage": "Queueing benchmark...",
        "result": None
    }

    temp_paths = []
    temp_dir = tempfile.gettempdir()
    for f in files:
        path = os.path.join(temp_dir, f"{uuid.uuid4()}_{f.filename}")
        with open(path, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
        temp_paths.append(path)

    background_tasks.add_task(
        background_benchmark,
        task_id,
        target_seq,
        temp_paths,
        test_ratio,
        window_size,
        phred_threshold
    )

    return {"task_id": task_id}

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
api_router.include_router(results_router)
api_router.include_router(protocol_trees_router)
api_router.include_router(plot_projects_router)
api_router.include_router(tool_directory_router)
api_router.include_router(sequence_workspace_router)
api_router.include_router(storage_quotas_router)

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

# ── Legacy Redirects (No prefix) ──
@app.get("/status/{task_id}", include_in_schema=False)
async def legacy_status(task_id: str):
    return await get_task_status(task_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=False)
