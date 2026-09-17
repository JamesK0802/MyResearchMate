"""Regression tests for canonical lab storage paths."""
import ast
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from storage import file_store


class LabStoragePathTest(unittest.TestCase):
    def test_lab_root_and_tool_directory_share_sanitized_name(self):
        with TemporaryDirectory() as folder, patch.object(file_store, "LAB_ROOT", Path(folder)):
            archive = file_store.lab_tool_dir("Nicole's Lab", "lab-archive")
            stored_file = archive / "reads.fastq"
            stored_file.write_bytes(b"reads")

            root = file_store.lab_root_dir("Nicole's Lab", create=False)

            self.assertEqual(root, archive.parent)
            self.assertTrue((root / "lab-archive" / "reads.fastq").is_file())
            self.assertNotIn("'", root.name)

    def test_usage_lookup_does_not_create_missing_lab_directory(self):
        with TemporaryDirectory() as folder, patch.object(file_store, "LAB_ROOT", Path(folder)):
            root = file_store.lab_root_dir("New Lab!", create=False)

            self.assertFalse(root.exists())

    def test_lab_usage_payload_counts_the_canonical_lab_root(self):
        source = Path(__file__).parents[1] / "routers" / "storage_quotas.py"
        function = next(node for node in ast.parse(source.read_text()).body
                        if isinstance(node, ast.FunctionDef) and node.name == "usage_payload")
        counted = []
        expected_root = Path("/data/lab/Nicole-s Lab")
        namespace = {
            "quota_row": lambda *args: None,
            "PERSONAL_ROOT": Path("/data/personal"),
            "user_uid": lambda user: "user",
            "lab_root_dir": lambda name, create=False: expected_root,
            "directory_size": lambda path: counted.append(path) or 1234,
            "PERSONAL_DEFAULT": 5,
            "LAB_DEFAULT": 20,
            "latest_request_payload": lambda *args: None,
        }
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), "exec"), namespace)

        payload = namespace["usage_payload"](None, "lab", lab=SimpleNamespace(id="lab-id", lab_name="Nicole's Lab"))

        self.assertEqual(counted, [expected_root])
        self.assertEqual(payload["used_bytes"], 1234)


if __name__ == "__main__":
    unittest.main()
