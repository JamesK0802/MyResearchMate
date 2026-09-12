import json
from pathlib import Path


def alignment_group_files(cache_dir: Path, status: str) -> list[tuple[Path, int]]:
    files = []
    for path in (cache_dir / "groups" / status).glob("*.json"):
        try:
            count = int(path.stem.rsplit("-", 1)[1])
        except (IndexError, ValueError):
            continue
        files.append((path, count))
    return sorted(files, key=lambda item: item[0].name)


def read_ordered_alignment_page(cache_dir: Path, order: str, offset: int, limit: int) -> tuple[list[dict], int]:
    statuses = ["aligned", "unaligned"] if order == "aligned" else ["unaligned", "aligned"]
    groups = [(path, count) for status in statuses for path, count in alignment_group_files(cache_dir, status)]
    total = sum(count for _, count in groups)
    remaining_offset = offset
    reads = []
    for path, count in groups:
        if remaining_offset >= count:
            remaining_offset -= count
            continue
        try:
            page = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            page = {}
        entries = page.get("reads", []) if isinstance(page, dict) else []
        start = remaining_offset
        remaining_offset = 0
        reads.extend(entries[start:start + (limit - len(reads))])
        if len(reads) >= limit:
            break
    return reads, total
