import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import core.classifier as classifier
from core.multi_reference_assigner import assign_reads_to_references
from run_local import (
    SUBSTITUTION_POLICY,
    process_files_multi,
    run_analysis_on_reads,
)


def _reference(prefix_len=50):
    grna = "GATTACAGATTACAGATTAC"
    prefix = ("ATGCCGTA" * 8)[:prefix_len]
    suffix = "CGTATGCAGGCTAACGTATGCAGGCTAACGTATGCAGGCTAACGTATGCAGGCTAACGTATGCAGGCTAA"
    reference = prefix + grna + "AGG" + suffix
    return reference, grna


def _target(reference, grna, target_id="T1", window_size=90):
    return {
        "target_id": target_id,
        "reference_seq": reference,
        "sgrna_seq": grna,
        "window_size": window_size,
    }


def _read_window(reference, grna, window_size=90):
    cut_info = classifier.find_grna_cut_site(reference, grna)
    return classifier.extract_window(reference, cut_info["cut_site"], window_size)


class Stage25CleanupTests(unittest.TestCase):
    def test_substitution_policy_is_separate_from_indel_editing(self):
        reference, grna = _reference()
        ref_window = _read_window(reference, grna)
        read = list(ref_window)
        edit_idx = len(read) // 2 + 10
        read[edit_idx] = "G" if read[edit_idx] != "G" else "A"
        read = "".join(read)

        result = run_analysis_on_reads(
            [(read, [40] * len(read))],
            [_target(reference, grna)],
            phred_threshold=20,
            indel_threshold=0,
        )[0]

        self.assertEqual(result["breakdown"]["substitution"], 1)
        self.assertEqual(result["breakdown"]["no_indel"], 0)
        self.assertEqual(result["summary"]["modified"], 0)
        self.assertEqual(result["summary"]["unmodified"], 0)
        self.assertEqual(result["summary"]["substitution_reads"], 1)
        self.assertEqual(result["summary"]["editing_efficiency"], 0)
        self.assertEqual(result["summary"]["substitution_policy"], SUBSTITUTION_POLICY)

    def test_reverse_strand_display_uses_reverse_complement(self):
        grna = "AACCGGTTAACCGGTTAACC"
        grna_rc = classifier.reverse_complement(grna)
        reference = ("A" * 35) + "CCA" + grna_rc + ("T" * 60)
        ref_window = _read_window(reference, grna)

        result = run_analysis_on_reads(
            [(ref_window, [40] * len(ref_window))],
            [_target(reference, grna)],
            phred_threshold=20,
            indel_threshold=0,
        )[0]

        self.assertEqual(result["strand"], "reverse")
        self.assertEqual(result["display_sgrna_seq"], grna_rc)
        self.assertNotEqual(result["display_sgrna_seq"], grna[::-1])

    def test_clipped_window_cut_site_index_uses_actual_window_start(self):
        reference, grna = _reference(prefix_len=5)
        cut_info = classifier.find_grna_cut_site(reference, grna)
        expected_idx = classifier.cut_index_in_window(reference, cut_info["cut_site"], 90)
        ref_window = classifier.extract_window(reference, cut_info["cut_site"], 90)

        result = run_analysis_on_reads(
            [(ref_window, [40] * len(ref_window))],
            [_target(reference, grna, window_size=90)],
            phred_threshold=20,
            indel_threshold=0,
        )[0]

        self.assertEqual(expected_idx, cut_info["cut_site"])
        self.assertEqual(result["cut_site_index"], expected_idx)
        self.assertNotEqual(result["cut_site_index"], len(result["ref_sequence"]) // 2)

    def test_failure_accounting_includes_no_anchor(self):
        reference, grna = _reference()
        read = ("N" * 30) + grna + ("N" * 40)

        result = run_analysis_on_reads(
            [(read, [40] * len(read))],
            [_target(reference, grna)],
            phred_threshold=20,
            indel_threshold=0,
        )[0]

        self.assertEqual(result["summary"]["failure_reasons"]["fail_no_anchor"], 1)
        self.assertEqual(result["summary"]["failed_reads"], 1)
        self.assertEqual(result["breakdown"]["failed"], 1)
        self.assertEqual(result["breakdown"]["ambiguous"], 1)

    def test_assignment_debug_preserves_legacy_and_adds_clear_counter_names(self):
        reference, grna = _reference()
        ref_window = _read_window(reference, grna)
        genes = [{"gene": "GeneA", "sequence": reference, "targets": [_target(reference, grna)]}]

        result = assign_reads_to_references(
            [(ref_window, [40] * len(ref_window))],
            genes,
            phred_threshold=20,
            margin_threshold=0.05,
        )
        debug = result["debug_logs"]

        self.assertEqual(debug["anchor_matched_count"], 1)
        self.assertEqual(debug["usable_for_assignment_count"], 1)
        self.assertEqual(debug["assignment_filtered_count"], 0)

    def test_process_files_multi_adds_validation_metadata(self):
        reference, grna = _reference()
        ref_window = _read_window(reference, grna)
        genes = [{"gene": "GeneA", "sequence": reference, "targets": [_target(reference, grna)]}]

        with tempfile.TemporaryDirectory() as td:
            fastq = os.path.join(td, "sample.fastq")
            with open(fastq, "w") as handle:
                handle.write(f"@r1\n{ref_window}\n+\n{'I' * len(ref_window)}\n")

            payload = process_files_multi(
                [fastq],
                genes,
                phred_threshold=20,
                indel_threshold=0,
                margin_threshold=0.05,
            )

        metadata = payload["metadata"]
        self.assertTrue(metadata["code_version"])
        self.assertEqual(metadata["input_filenames"], ["sample.fastq"])
        self.assertEqual(metadata["references"], [{"gene": "GeneA", "target_ids": ["T1"]}])
        self.assertEqual(metadata["thresholds"]["phred_threshold"], 20)
        self.assertEqual(metadata["thresholds"]["assignment_margin_threshold"], 0.05)
        self.assertEqual(metadata["substitution_policy"], SUBSTITUTION_POLICY)


if __name__ == "__main__":
    unittest.main()
