import gzip
from pathlib import Path


def read_fastq_page(file_path: Path, offset: int, limit: int) -> tuple[list[dict[str, str]], bool]:
    """Read one small FASTQ page from plain text or gzip storage."""
    with file_path.open("rb") as source:
        compressed = source.read(2) == b"\x1f\x8b"
    opener = gzip.open if compressed else open
    reads: list[dict[str, str]] = []
    record_index = 0
    try:
        with opener(file_path, "rt", encoding="utf-8", errors="replace", newline="") as source:
            while len(reads) <= limit:
                header = source.readline()
                if not header:
                    break
                if not header.startswith("@"):
                    continue
                sequence = source.readline().strip()
                separator = source.readline()
                quality = source.readline().strip()
                if not separator or not quality:
                    break
                if not separator.startswith("+"):
                    raise ValueError("Invalid FASTQ separator")
                if record_index >= offset:
                    reads.append({
                        "id": header[1:].strip(),
                        "seq": sequence,
                        "qualString": quality,
                    })
                record_index += 1
    except gzip.BadGzipFile as exc:
        raise ValueError("Invalid gzip FASTQ") from exc
    has_more = len(reads) > limit
    return reads[:limit], has_more
