import json
import tempfile
import unittest
from pathlib import Path

from utils.alignment_paging import read_ordered_alignment_page


class AlignmentPagingTests(unittest.TestCase):
    def test_returns_all_aligned_reads_before_unaligned_reads(self):
        with tempfile.TemporaryDirectory() as directory:
            cache_dir = Path(directory)
            aligned_dir = cache_dir / "groups" / "aligned"
            unaligned_dir = cache_dir / "groups" / "unaligned"
            aligned_dir.mkdir(parents=True)
            unaligned_dir.mkdir(parents=True)
            (aligned_dir / "000000000000-000002.json").write_text(
                json.dumps({"reads": [{"id": "aligned-1"}, {"id": "aligned-2"}]}), encoding="utf-8"
            )
            (unaligned_dir / "000000000000-000002.json").write_text(
                json.dumps({"reads": [{"id": "unaligned-1"}, {"id": "unaligned-2"}]}), encoding="utf-8"
            )

            first, total = read_ordered_alignment_page(cache_dir, "aligned", 0, 3)
            second, _ = read_ordered_alignment_page(cache_dir, "aligned", 3, 3)

            self.assertEqual(total, 4)
            self.assertEqual([read["id"] for read in first], ["aligned-1", "aligned-2", "unaligned-1"])
            self.assertEqual([read["id"] for read in second], ["unaligned-2"])

    def test_can_reverse_the_global_result_order(self):
        with tempfile.TemporaryDirectory() as directory:
            cache_dir = Path(directory)
            for status in ("aligned", "unaligned"):
                group_dir = cache_dir / "groups" / status
                group_dir.mkdir(parents=True)
                (group_dir / "000000000000-000001.json").write_text(
                    json.dumps({"reads": [{"id": status}]}), encoding="utf-8"
                )

            reads, _ = read_ordered_alignment_page(cache_dir, "unaligned", 0, 2)

            self.assertEqual([read["id"] for read in reads], ["unaligned", "aligned"])


if __name__ == "__main__":
    unittest.main()
