import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from database.models import (
    CrisprResult,
    Lab,
    PcrPreset,
    PlotProject,
    ProtocolTree,
    SequenceWorkspaceFile,
    User,
)
from storage.file_store import (
    DATA_ROOT,
    document_path,
    lab_tool_dir,
    personal_tool_dir,
    relative_data_path,
    write_json,
)


def _copy_tree(source: Path, destination: Path) -> None:
    if not source.is_dir():
        return
    destination.mkdir(parents=True, exist_ok=True)
    for item in source.rglob("*"):
        if not item.is_file():
            continue
        target = destination / item.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            shutil.copy2(item, target)


def _write_if_missing(path: Path, payload: dict) -> None:
    if not path.exists():
        write_json(path, payload)


def migrate_data_layout(db: Session) -> None:
    """Idempotently copy legacy data into the owner-oriented /data layout.

    Legacy files and legacy JSON columns are deliberately retained during this
    first migration so a deployment can be rolled back without losing user data.
    New writes use the file paths created here as their canonical source.
    """
    users = {user.id: user for user in db.query(User).all()}

    for user in users.values():
        keys = {str(user.id), str(user.uid or (user.email.split("@", 1)[0] if user.email else user.id))}
        for key in keys:
            _copy_tree(DATA_ROOT / "notes" / key, personal_tool_dir(user, "lab-note") / "notes")
            _copy_tree(DATA_ROOT / "workflow-presets" / key, personal_tool_dir(user, "lab-note") / "workflow-presets")
            _copy_tree(DATA_ROOT / "experiments" / "active" / key, personal_tool_dir(user, "lab-note") / "experiments" / "active")
            _copy_tree(DATA_ROOT / "experiments" / "archive" / key, personal_tool_dir(user, "lab-note") / "experiments" / "archive")
            _copy_tree(DATA_ROOT / "assets" / key, personal_tool_dir(user, "lab-note") / "assets")

        for tool_name in (
            "crispr-analysis", "sequence-viewer", "tree-protocol", "r-plot-studio",
            "solution-protocol", "lab-note",
        ):
            personal_tool_dir(user, tool_name)

    for row in db.query(CrisprResult).all():
        user = users.get(row.owner_user_id)
        if not user:
            continue
        path = document_path(user, "crispr-analysis", row.id)
        _write_if_missing(path, {
            "version": 1, "type": "crispr-analysis", "id": str(row.id), "title": row.title,
            "metadata": row.metadata_json or {}, "result": row.result_json or {},
            "created_at": row.created_at, "updated_at": row.updated_at,
        })
        row.storage_path = relative_data_path(path)
        row.metadata_json = {}
        row.result_json = {}

    for row in db.query(ProtocolTree).all():
        user = users.get(row.owner_user_id)
        if not user:
            continue
        path = document_path(user, "tree-protocol", row.id)
        _write_if_missing(path, {
            "version": 1, "type": "tree-protocol", "id": str(row.id), "title": row.title,
            "document": row.document_json or {}, "created_at": row.created_at, "updated_at": row.updated_at,
        })
        row.storage_path = relative_data_path(path)
        row.document_json = {}

    for row in db.query(PlotProject).all():
        user = users.get(row.owner_user_id)
        if not user:
            continue
        path = document_path(user, "r-plot-studio", row.id)
        _write_if_missing(path, {
            "version": 1, "type": "r-plot-studio", "id": str(row.id), "title": row.title,
            "project": row.project_json or {}, "created_at": row.created_at, "updated_at": row.updated_at,
        })
        row.storage_path = relative_data_path(path)
        row.project_json = {}

    for row in db.query(PcrPreset).filter(PcrPreset.owner_user_id.isnot(None)).all():
        user = users.get(row.owner_user_id)
        if not user:
            continue
        path = document_path(user, "solution-protocol", row.id)
        _write_if_missing(path, {
            "version": 1, "type": "solution-protocol", "id": str(row.id), "name": row.name,
            "category": row.category, "description": row.description or "", "primer_f": row.primer_f,
            "primer_r": row.primer_r, "product_size": row.product_size,
            "components": row.components_json or [], "is_public": bool(row.is_public),
            "defaultReactionVolume": 20, "allowedReactionVolumes": [20],
            "created_at": row.created_at, "updated_at": row.updated_at,
        })
        row.storage_path = relative_data_path(path)
        row.components_json = []

    for row in db.query(SequenceWorkspaceFile).all():
        user = users.get(row.owner_user_id)
        if not user:
            continue
        destination = personal_tool_dir(user, "sequence-viewer") / "files" / row.stored_name
        source = DATA_ROOT / "sequence-workspace" / str(row.owner_user_id) / row.stored_name
        destination.parent.mkdir(parents=True, exist_ok=True)
        if source.is_file() and not destination.exists():
            shutil.copy2(source, destination)
        if destination.is_file():
            row.storage_path = relative_data_path(destination)
            metadata_path = personal_tool_dir(user, "sequence-viewer") / "metadata" / f"{row.id}.json"
            _write_if_missing(metadata_path, row.metadata_json or {})
            row.metadata_json = {}

    for lab in db.query(Lab).all():
        legacy = DATA_ROOT / "Labs Archive" / str(lab.lab_name)
        _copy_tree(legacy, lab_tool_dir(lab.lab_name, "lab-archive"))

    db.commit()
