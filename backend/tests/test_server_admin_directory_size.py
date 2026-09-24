from pathlib import Path

from routers.server_admin import _directory_size


def test_directory_size_counts_regular_files_without_following_links(tmp_path: Path):
    nested = tmp_path / "nested"
    nested.mkdir()
    (tmp_path / "root.bin").write_bytes(b"1234")
    (nested / "child.bin").write_bytes(b"123456")
    (tmp_path / "duplicate-link").symlink_to(nested, target_is_directory=True)

    assert _directory_size(tmp_path) == 10
