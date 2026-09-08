#!/usr/bin/env python3
"""Small, dependency-free status helper for the host update service."""

import argparse
import json
import os
import tempfile
from pathlib import Path
from typing import Optional


def read_lines(path: Optional[str], separator: Optional[str] = None):
    if not path or not Path(path).exists():
        return []
    lines = [line.strip() for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]
    if separator:
        result = []
        for line in lines[:30]:
            sha, _, subject = line.partition(separator)
            result.append({"sha": sha, "subject": subject})
        return result
    return lines[:100]


def atomic_write(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary_name, 0o664)
        os.replace(temporary_name, path)
    finally:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass


parser = argparse.ArgumentParser()
subparsers = parser.add_subparsers(dest="command", required=True)

read_parser = subparsers.add_parser("read-job")
read_parser.add_argument("request_file")

write_parser = subparsers.add_parser("write")
write_parser.add_argument("status_file")
write_parser.add_argument("--job-id", required=True)
write_parser.add_argument("--state", required=True, choices=("queued", "running", "success", "failed"))
write_parser.add_argument("--stage", required=True)
write_parser.add_argument("--message", required=True)
write_parser.add_argument("--requested-at")
write_parser.add_argument("--started-at")
write_parser.add_argument("--finished-at")
write_parser.add_argument("--old-revision")
write_parser.add_argument("--new-revision")
write_parser.add_argument("--commits-file")
write_parser.add_argument("--changed-files-file")

args = parser.parse_args()
if args.command == "read-job":
    payload = json.loads(Path(args.request_file).read_text(encoding="utf-8"))
    print(payload["job_id"])
else:
    payload = {
        "job_id": args.job_id,
        "state": args.state,
        "stage": args.stage,
        "message": args.message,
        "commits": read_lines(args.commits_file, "\t"),
        "changed_files": read_lines(args.changed_files_file),
    }
    for field in ("requested_at", "started_at", "finished_at", "old_revision", "new_revision"):
        value = getattr(args, field)
        if value:
            payload[field] = value
    atomic_write(Path(args.status_file), payload)
