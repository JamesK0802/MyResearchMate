"""Owner-only server inspection and migration endpoints."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
import threading
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import MetaData, Table, func, inspect, select, text
from sqlalchemy.engine import make_url

from auth.dependencies import get_current_user
from database import models as database_models  # noqa: F401 - registers application tables
from database.db import Base, DATABASE_URL, engine
from storage.file_store import DATA_ROOT, resolve_data_path


router = APIRouter(prefix="/server-admin", tags=["server-admin"])
BACKUP_ROOT = DATA_ROOT / "server-backups"
ENV_FILE = Path(os.getenv("SERVER_ENV_FILE", str(Path(__file__).resolve().parents[2] / ".env")))
BACKUP_PATTERN = re.compile(r"^my-lab-mate-backup-[A-Za-z0-9_-]+\.tar\.gz$")
EXCLUDED_DATA_NAMES = {"server-backups", "deployment-update"}
MAX_RESTORE_BYTES = int(os.getenv("SERVER_BACKUP_MAX_BYTES", str(50 * 1024**3)))
_migration_lock = threading.RLock()
APP_TABLE_NAMES = frozenset(table.name for table in Base.metadata.sorted_tables)
APP_TABLE_COLUMNS = {
    table.name: frozenset(column.name for column in table.columns)
    for table in Base.metadata.sorted_tables
}
MANAGED_DATA_ROOTS = frozenset({"personal", "lab", "server-backups", "deployment-update"})


class DatabaseColumnCleanup(BaseModel):
    table: str
    column: str


class ServerCleanupRequest(BaseModel):
    data_roots: list[str] = Field(default_factory=list)
    tables: list[str] = Field(default_factory=list)
    columns: list[DatabaseColumnCleanup] = Field(default_factory=list)
    confirmation: str


async def require_owner(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Owner access required")
    return user


def _safe_data_path(relative_path: str = "") -> Path:
    try:
        path = resolve_data_path((relative_path or "").lstrip("/"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if path != DATA_ROOT and DATA_ROOT not in path.parents:
        raise HTTPException(status_code=400, detail="Path escapes the data directory")
    return path


def _cleanup_data_root_path(root_name: str) -> Path:
    """Return one direct child of DATA_ROOT without resolving symlinks.

    Legacy deployments can leave compatibility symlinks such as ``data/notes``
    pointing into the canonical ``data/personal`` tree. Resolving those links
    makes the path appear nested and previously caused cleanup validation to
    reject an item that the inspector had offered for removal. Keeping the
    lexical path lets cleanup unlink only the compatibility entry; its target is
    never removed.
    """
    if (
        root_name in MANAGED_DATA_ROOTS
        or not root_name
        or root_name in {".", ".."}
        or Path(root_name).name != root_name
        or "/" in root_name
        or "\\" in root_name
    ):
        raise HTTPException(status_code=400, detail=f"{root_name or 'Root'} is a protected data location")
    path = DATA_ROOT / root_name
    if path.parent != DATA_ROOT or (not path.is_symlink() and not path.is_dir()):
        raise HTTPException(status_code=400, detail=f"{root_name} is not a removable root folder")
    return path


def _backup_path(name: str) -> Path:
    if not BACKUP_PATTERN.fullmatch(name):
        raise HTTPException(status_code=400, detail="Invalid backup name")
    path = (BACKUP_ROOT / name).resolve()
    if path.parent != BACKUP_ROOT.resolve():
        raise HTTPException(status_code=400, detail="Invalid backup path")
    return path


def _human_entry(path: Path) -> dict[str, Any]:
    stat = path.stat()
    is_directory = path.is_dir()
    return {
        "name": path.name,
        "path": path.relative_to(DATA_ROOT).as_posix(),
        "kind": "directory" if is_directory else "file",
        "size": None if is_directory else stat.st_size,
        "item_count": sum(1 for item in path.iterdir() if not item.is_symlink()) if is_directory else None,
        "managed": path.relative_to(DATA_ROOT).parts[0] in MANAGED_DATA_ROOTS,
        "modified_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
    }


def _json_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime, date, Decimal, uuid.UUID)):
        return str(value)
    if isinstance(value, bytes):
        return f"<binary: {len(value)} bytes>"
    if isinstance(value, (dict, list)):
        return value
    return str(value)


def _table_names() -> list[str]:
    return inspect(engine).get_table_names(schema="public")


def _table_or_404(table_name: str) -> Table:
    if table_name not in _table_names():
        raise HTTPException(status_code=404, detail="Database table not found")
    return Table(table_name, MetaData(), schema="public", autoload_with=engine)


def _run_postgres_tool(command: list[str], timeout: int = 3600) -> None:
    process_environment = os.environ.copy()
    # pg_dump/pg_restore do not understand SQLAlchemy driver URLs reliably
    # (for example postgresql+psycopg2://). Pass the parsed libpq fields
    # explicitly so the tools use the exact same server as the application
    # instead of silently falling back to a local Unix socket.
    try:
        database = make_url(DATABASE_URL)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="The configured database URL is invalid") from exc
    if not database.database:
        raise HTTPException(status_code=500, detail="The configured database URL has no database name")
    process_environment.pop("PGSERVICE", None)
    postgres_fields = {
        "PGDATABASE": database.database,
        "PGHOST": database.host,
        "PGPORT": str(database.port) if database.port else None,
        "PGUSER": database.username,
        "PGPASSWORD": database.password,
        "PGSSLMODE": database.query.get("sslmode"),
        "PGSSLROOTCERT": database.query.get("sslrootcert"),
        "PGSSLCERT": database.query.get("sslcert"),
        "PGSSLKEY": database.query.get("sslkey"),
    }
    for key, value in postgres_fields.items():
        if value is not None:
            process_environment[key] = str(value)
        else:
            process_environment.pop(key, None)
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False, env=process_environment)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="PostgreSQL backup tools are not installed on the server") from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Database backup or restore timed out") from exc
    if result.returncode:
        message = (result.stderr or "PostgreSQL command failed").strip().splitlines()[-1]
        raise HTTPException(status_code=500, detail=f"Database operation failed: {message[:500]}")


def _copy_data_for_backup(destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    for item in DATA_ROOT.iterdir():
        if item.name in EXCLUDED_DATA_NAMES or item.is_symlink():
            continue
        target = destination / item.name
        if item.is_dir():
            shutil.copytree(item, target, symlinks=False, ignore=lambda folder, names: [name for name in names if (Path(folder) / name).is_symlink()])
        elif item.is_file():
            shutil.copy2(item, target)


def _create_backup(owner: dict) -> dict[str, Any]:
    if not ENV_FILE.is_file():
        raise HTTPException(status_code=500, detail=f"Server environment file is not available at {ENV_FILE}")
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    name = f"my-lab-mate-backup-{stamp}.tar.gz"
    final_path = BACKUP_ROOT / name
    if final_path.exists():
        name = f"my-lab-mate-backup-{stamp}-{uuid.uuid4().hex[:6]}.tar.gz"
        final_path = BACKUP_ROOT / name

    with tempfile.TemporaryDirectory(prefix="mrm-backup-") as temp_name:
        temp = Path(temp_name)
        payload = temp / "payload"
        payload.mkdir()
        shutil.copy2(ENV_FILE, payload / ".env")
        _copy_data_for_backup(payload / "data")
        _run_postgres_tool([
            "pg_dump", "--format=custom", "--no-owner", "--no-acl",
            "--file", str(payload / "database.dump"),
        ])
        manifest = {
            "format": "my-lab-mate-server-backup",
            "version": 1,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": owner.get("email"),
            "components": [".env", "data", "postgresql"],
            "excluded_data_directories": sorted(EXCLUDED_DATA_NAMES),
        }
        (payload / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        temporary_archive = BACKUP_ROOT / f".{name}.{uuid.uuid4().hex}.tmp"
        try:
            with tarfile.open(temporary_archive, "w:gz") as archive:
                for child in payload.iterdir():
                    archive.add(child, arcname=child.name, recursive=True)
            os.replace(temporary_archive, final_path)
        finally:
            temporary_archive.unlink(missing_ok=True)
    return _human_entry(final_path)


def _validate_archive(archive: tarfile.TarFile) -> None:
    required = {"manifest.json", ".env", "database.dump"}
    roots: set[str] = set()
    names: set[str] = set()
    unpacked_size = 0
    for member in archive.getmembers():
        path = Path(member.name)
        if path.is_absolute() or ".." in path.parts or member.issym() or member.islnk() or member.isdev():
            raise HTTPException(status_code=400, detail="Backup contains an unsafe path or file type")
        if member.name in names:
            raise HTTPException(status_code=400, detail="Backup contains duplicate paths")
        names.add(member.name)
        unpacked_size += member.size
        if unpacked_size > MAX_RESTORE_BYTES * 5:
            raise HTTPException(status_code=413, detail="Expanded backup contents are too large")
        if path.parts:
            roots.add(path.parts[0])
    if not required.issubset(roots) or "data" not in roots:
        raise HTTPException(status_code=400, detail="This is not a complete My Lab Mate server backup")


def _extract_archive(source: Path, destination: Path) -> dict[str, Any]:
    try:
        with tarfile.open(source, "r:gz") as archive:
            _validate_archive(archive)
            archive.extractall(destination)
    except (tarfile.TarError, OSError) as exc:
        raise HTTPException(status_code=400, detail="The uploaded backup archive is invalid") from exc
    try:
        manifest = json.loads((destination / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Backup manifest is invalid") from exc
    if manifest.get("format") != "my-lab-mate-server-backup" or manifest.get("version") != 1:
        raise HTTPException(status_code=400, detail="Unsupported server backup format")
    if not (destination / ".env").is_file() or not (destination / "database.dump").is_file() or not (destination / "data").is_dir():
        raise HTTPException(status_code=400, detail="Backup contents are incomplete")
    if (destination / ".env").stat().st_size > 1024 * 1024:
        raise HTTPException(status_code=400, detail="Environment file in backup is unexpectedly large")
    return manifest


def _replace_data(restored_data: Path) -> None:
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    rollback = DATA_ROOT / f".restore-rollback-{uuid.uuid4().hex}"
    rollback.mkdir()
    moved_new: list[Path] = []
    completed = False
    try:
        for current in list(DATA_ROOT.iterdir()):
            if current.name in EXCLUDED_DATA_NAMES or current == rollback:
                continue
            shutil.move(str(current), str(rollback / current.name))
        for restored in restored_data.iterdir():
            if restored.name in EXCLUDED_DATA_NAMES:
                continue
            target = DATA_ROOT / restored.name
            shutil.move(str(restored), str(target))
            moved_new.append(target)
        completed = True
    except Exception:
        for item in moved_new:
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            else:
                item.unlink(missing_ok=True)
        try:
            for previous in rollback.iterdir():
                shutil.move(str(previous), str(DATA_ROOT / previous.name))
        except Exception as rollback_error:
            raise RuntimeError(f"Data restore failed and rollback files remain at {rollback}") from rollback_error
        raise
    finally:
        if completed or not any(rollback.iterdir()):
            shutil.rmtree(rollback, ignore_errors=True)


@router.get("/data")
def list_data(path: str = Query(default=""), _owner: dict = Depends(require_owner)):
    directory = _safe_data_path(path)
    if not directory.exists():
        raise HTTPException(status_code=404, detail="Data path not found")
    if not directory.is_dir():
        raise HTTPException(status_code=400, detail="Data path is not a directory")
    # Root-level compatibility links are legacy storage entries that owners may
    # remove after migration. Do not follow links while browsing nested paths.
    entries = [
        _human_entry(item)
        for item in directory.iterdir()
        if directory == DATA_ROOT or not item.is_symlink()
    ]
    entries.sort(key=lambda item: (item["kind"] != "directory", item["name"].lower()))
    relative = "" if directory == DATA_ROOT else directory.relative_to(DATA_ROOT).as_posix()
    parent = "" if not relative or "/" not in relative else relative.rsplit("/", 1)[0]
    return {"path": relative, "parent": parent, "entries": entries}


@router.get("/data/download")
def download_data_file(path: str, _owner: dict = Depends(require_owner)):
    file_path = _safe_data_path(path)
    if not file_path.is_file() or file_path.is_symlink():
        raise HTTPException(status_code=404, detail="Data file not found")
    return FileResponse(file_path, filename=file_path.name)


@router.get("/database/tables")
def list_database_tables(_owner: dict = Depends(require_owner)):
    inspector = inspect(engine)
    names = inspector.get_table_names(schema="public")
    metadata = MetaData()
    metadata.reflect(bind=engine, schema="public", only=names)
    tables = []
    with engine.connect() as connection:
        for name in names:
            table = metadata.tables[f"public.{name}"]
            count = connection.execute(select(func.count()).select_from(table)).scalar_one()
            columns = inspector.get_columns(name, schema="public")
            primary = set((inspector.get_pk_constraint(name, schema="public") or {}).get("constrained_columns") or [])
            tables.append({
                "name": name,
                "row_count": count,
                "managed": name in APP_TABLE_NAMES,
                "columns": [{
                    "name": c["name"],
                    "type": str(c["type"]),
                    "nullable": c.get("nullable", True),
                    "primary_key": c["name"] in primary,
                    "managed": c["name"] in APP_TABLE_COLUMNS.get(name, frozenset()),
                } for c in columns],
            })
    return sorted(tables, key=lambda item: item["name"].lower())


@router.get("/database/tables/{table_name}")
def preview_database_table(table_name: str, limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0), _owner: dict = Depends(require_owner)):
    table = _table_or_404(table_name)
    statement = select(table)
    primary_columns = list(table.primary_key.columns)
    if primary_columns:
        statement = statement.order_by(*primary_columns)
    with engine.connect() as connection:
        total = connection.execute(select(func.count()).select_from(table)).scalar_one()
        result = connection.execute(statement.limit(limit).offset(offset))
        rows = [{key: _json_value(value) for key, value in row._mapping.items()} for row in result]
    return {"table": table_name, "total": total, "limit": limit, "offset": offset, "columns": [column.name for column in table.columns], "rows": rows}


@router.post("/cleanup")
def cleanup_server(payload: ServerCleanupRequest, owner: dict = Depends(require_owner)):
    """Remove explicitly selected storage roots and unmanaged database objects.

    A complete backup is created before any destructive operation. Application
    model tables/columns and canonical storage roots can never be selected.
    """
    if payload.confirmation != "CLEANUP":
        raise HTTPException(status_code=400, detail="Cleanup confirmation is required")
    if not payload.data_roots and not payload.tables and not payload.columns:
        raise HTTPException(status_code=400, detail="Select at least one legacy item")
    if not _migration_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Another server backup, restore, or cleanup is already running")
    try:
        inspector = inspect(engine)
        live_tables = set(inspector.get_table_names(schema="public"))
        legacy_tables = live_tables - APP_TABLE_NAMES
        requested_tables = set(payload.tables)
        if not requested_tables.issubset(legacy_tables):
            raise HTTPException(status_code=400, detail="Only unmanaged database tables can be removed")

        requested_columns: list[tuple[str, str]] = []
        for item in payload.columns:
            if item.table not in live_tables or item.table in requested_tables:
                continue
            live_columns = {column["name"] for column in inspector.get_columns(item.table, schema="public")}
            managed_columns = APP_TABLE_COLUMNS.get(item.table, frozenset())
            if item.column not in live_columns or item.column in managed_columns:
                raise HTTPException(status_code=400, detail=f"{item.table}.{item.column} is not a removable legacy column")
            requested_columns.append((item.table, item.column))

        data_paths: list[Path] = []
        for root_name in set(payload.data_roots):
            data_paths.append(_cleanup_data_root_path(root_name))

        safety_backup = _create_backup(owner)
        quote = engine.dialect.identifier_preparer.quote
        with engine.begin() as connection:
            for table_name, column_name in requested_columns:
                connection.execute(text(f"ALTER TABLE public.{quote(table_name)} DROP COLUMN {quote(column_name)}"))
            if requested_tables:
                targets = ", ".join(f"public.{quote(name)}" for name in sorted(requested_tables))
                connection.execute(text(f"DROP TABLE {targets}"))

        for path in data_paths:
            if path.is_symlink():
                path.unlink()
            else:
                shutil.rmtree(path)
        engine.dispose()
        return {
            "message": "Legacy server data removed.",
            "safety_backup": safety_backup["name"],
            "removed": {
                "data_roots": sorted(path.name for path in data_paths),
                "tables": sorted(requested_tables),
                "columns": [{"table": table, "column": column} for table, column in requested_columns],
            },
        }
    finally:
        _migration_lock.release()


@router.get("/backups")
def list_backups(_owner: dict = Depends(require_owner)):
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    entries = [_human_entry(path) for path in BACKUP_ROOT.iterdir() if path.is_file() and BACKUP_PATTERN.fullmatch(path.name)]
    return sorted(entries, key=lambda item: item["modified_at"], reverse=True)


@router.post("/backups")
def create_backup(owner: dict = Depends(require_owner)):
    if not _migration_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Another server backup or restore is already running")
    try:
        return _create_backup(owner)
    finally:
        _migration_lock.release()


@router.get("/backups/{name}")
def download_backup(name: str, _owner: dict = Depends(require_owner)):
    path = _backup_path(name)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Backup not found")
    return FileResponse(path, filename=path.name, media_type="application/gzip")


@router.delete("/backups/{name}")
def delete_backup(name: str, _owner: dict = Depends(require_owner)):
    path = _backup_path(name)
    if not path.is_file() or path.is_symlink():
        raise HTTPException(status_code=404, detail="Backup not found")
    if not _migration_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Another server backup, restore, or cleanup is already running")
    try:
        path.unlink()
    except OSError as exc:
        raise HTTPException(status_code=500, detail="The backup could not be deleted") from exc
    finally:
        _migration_lock.release()
    return {"deleted": True, "name": name}


@router.post("/restore")
def restore_backup(archive: UploadFile = File(...), confirmation: str = Form(...), owner: dict = Depends(require_owner)):
    if confirmation != "RESTORE":
        raise HTTPException(status_code=400, detail="Restore confirmation is required")
    if not (archive.filename or "").endswith(".tar.gz"):
        raise HTTPException(status_code=400, detail="Select a .tar.gz server backup")

    if not _migration_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Another server backup or restore is already running")
    try:
        with tempfile.TemporaryDirectory(prefix="mrm-restore-") as temp_name:
            temp = Path(temp_name)
            upload_path = temp / "uploaded.tar.gz"
            size = 0
            with upload_path.open("wb") as target:
                while chunk := archive.file.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_RESTORE_BYTES:
                        raise HTTPException(status_code=413, detail="Backup archive is too large")
                    target.write(chunk)
            extracted = temp / "extracted"
            extracted.mkdir()
            manifest = _extract_archive(upload_path, extracted)
            safety_backup = _create_backup(owner)

            engine.dispose()
            _run_postgres_tool([
                "pg_restore", "--clean", "--if-exists", "--no-owner", "--no-acl",
                "--exit-on-error", str(extracted / "database.dump"),
            ])
            _replace_data(extracted / "data")
            try:
                with ENV_FILE.open("wb") as target:
                    target.write((extracted / ".env").read_bytes())
            except OSError as exc:
                raise HTTPException(status_code=500, detail="Database and data were restored, but the environment file could not be replaced") from exc
            engine.dispose()
    finally:
        _migration_lock.release()
    return {
        "restored": True,
        "source_created_at": manifest.get("created_at"),
        "safety_backup": safety_backup["name"],
        "restart_required": True,
        "message": "Database, data, and environment file restored. Restart the application to apply environment changes.",
    }
