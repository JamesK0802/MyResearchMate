import os
import json
from run_local import process_single_file_worker

with open("test_dummy.fastq", "wb") as f:
    f.write(b"@1\n" + b"A"*100 + b"\n+\n" + b"F"*100 + b"\n")

res = process_single_file_worker(
    "test_dummy.fastq",
    [{"gene": "Gene1", "sequence": "A"*200, "targets": [{"target_id": "T1", "sgrna_seq": "A"*20, "window_size": 90}]}],
    20, 1.0, 0.05, False, False, 20
)
print("File Result length:", len(res["results"]))
