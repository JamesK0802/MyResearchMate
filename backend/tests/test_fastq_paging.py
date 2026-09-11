import gzip
import tempfile
import unittest
from pathlib import Path

from utils.fastq_paging import read_fastq_page


FASTQ = """@read one
AACCGG
+
IIIIII
@read two
TTGGCC
+
HHHHHH
@read three
GATTACA
+
IIIIIII
"""


class FastqPagingTests(unittest.TestCase):
    def test_reads_plain_fastq_in_pages(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "reads.fastq"
            path.write_text(FASTQ, encoding="utf-8")

            reads, has_more = read_fastq_page(path, 0, 2)
            tail, tail_has_more = read_fastq_page(path, 2, 2)

            self.assertEqual([read["id"] for read in reads], ["read one", "read two"])
            self.assertTrue(has_more)
            self.assertEqual([read["id"] for read in tail], ["read three"])
            self.assertFalse(tail_has_more)

    def test_reads_gzip_fastq_without_full_browser_download(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "reads.fastq.gz"
            with gzip.open(path, "wt", encoding="utf-8") as output:
                output.write(FASTQ)

            reads, has_more = read_fastq_page(path, 1, 1)

            self.assertEqual(reads[0]["seq"], "TTGGCC")
            self.assertTrue(has_more)


if __name__ == "__main__":
    unittest.main()
