import json
import os
import re
import uuid
from pathlib import Path
from typing import Any


DEFAULT_DATA_ROOT = Path(__file__).resolve().parent.parent.parent / "data"
DATA_ROOT = Path(os.getenv("LAB_NOTEBOOK_DATA_DIR", str(DEFAULT_DATA_ROOT))).resolve()
PERSONAL_ROOT = DATA_ROOT / "personal"
LAB_ROOT = DATA_ROOT / "lab"


def safe_segment(value: Any, fallback: str = "unknown") -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._ -]+", "-", str(value or "").strip())
    cleaned = cleaned.strip(" .-")
    return cleaned or fallback


def user_uid(user: Any) -> str:
    if isinstance(user, dict):
        uid = user.get("uid")
        email = user.get("email")
        internal_id = user.get("id")
    else:
        uid = getattr(user, "uid", None)
        email = getattr(user, "email", None)
        internal_id = getattr(user, "id", None)
    return safe_segment(uid or (email.split("@", 1)[0] if email else None) or internal_id, "unknown-user")


def personal_tool_dir(user: Any, tool_name: str, create: bool = True) -> Path:
    path = PERSONAL_ROOT / user_uid(user) / safe_segment(tool_name)
    if create:
        path.mkdir(parents=True, exist_ok=True)
    return path


def lab_tool_dir(lab_name: str, tool_name: str, create: bool = True) -> Path:
    path = LAB_ROOT / safe_segment(lab_name, "unnamed-lab") / safe_segment(tool_name)
    if create:
        path.mkdir(parents=True, exist_ok=True)
    return path


def relative_data_path(path: Path) -> str:
    return path.resolve().relative_to(DATA_ROOT).as_posix()


def resolve_data_path(relative_path: str) -> Path:
    candidate = (DATA_ROOT / relative_path).resolve()
    if candidate != DATA_ROOT and DATA_ROOT not in candidate.parents:
        raise ValueError("Storage path escapes the data directory")
    return candidate


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    os.replace(temporary, path)


def read_json(relative_path: str, fallback: Any = None) -> Any:
    try:
        path = resolve_data_path(relative_path)
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        pass
    return fallback


def document_path(user: Any, tool_name: str, document_id: Any) -> Path:
    return personal_tool_dir(user, tool_name) / f"{safe_segment(document_id)}.json"

