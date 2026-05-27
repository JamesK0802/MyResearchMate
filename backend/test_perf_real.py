import json
import os
import sys

from core.classifier import _is_read_usable_cached, clear_classifier_cache, perf_stats

import gzip

def test_real_data():
    fastq_file = "../data/barcode42.fq"
    if not os.path.exists(fastq_file):
        print("FASTQ not found.")
        return
        
    # We need a ref_window. Let's just grab the first one from DB or hardcode one.
    # Actually, we don't know the ref_window for barcode42.
    # Let's just parse the first 100 reads and see what happens if we use a dummy window.
    # Wait, using a dummy window will just fail fast (which we want to be fast).
    # What if the user is running a real gene?
    pass

test_real_data()
