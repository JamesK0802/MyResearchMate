import gzip
from pathlib import Path
from typing import Iterator


def iter_fastq_reads(file_path: Path) -> Iterator[dict[str, str]]:
    """Stream FASTQ records once without retaining the complete file."""
    with file_path.open("rb") as source:
        compressed = source.read(2) == b"\x1f\x8b"
    opener = gzip.open if compressed else open
    try:
        with opener(file_path, "rt", encoding="utf-8", errors="replace", newline="") as source:
            while True:
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
                yield {
                    "id": header[1:].strip(),
                    "seq": sequence,
                    "qualString": quality,
                }
    except gzip.BadGzipFile as exc:
        raise ValueError("Invalid gzip FASTQ") from exc


def read_fastq_page(file_path: Path, offset: int, limit: int) -> tuple[list[dict[str, str]], bool]:
    """Read one small FASTQ page from plain text or gzip storage."""
    reads: list[dict[str, str]] = []
    for record_index, read in enumerate(iter_fastq_reads(file_path)):
        if record_index >= offset:
            reads.append(read)
        if len(reads) > limit:
            break
    has_more = len(reads) > limit
    return reads[:limit], has_more
