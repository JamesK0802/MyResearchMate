import sys
sys.path.append('backend')
from core.classifier import _eval_anchors, ANCHOR_LEN

ref_window = "ATACCAAGCCTCACCGTCCTCGCTTTTCTATCTATCCTTCCTAGTGTTTTTGTTTTTAAG"
sgrna_seq  = "CCTCACCGTCCTCGCTTTTC" # mock gRNA
print("ref_window len:", len(ref_window))

seq = ref_window # Exact match
res = _eval_anchors(seq, None, ref_window, 10.0, sgrna_seq)
print("Exact match:", res['fail'] if res else res)

seq_truncated_left = ref_window[5:] # Missing first 5 bases of left anchor
res = _eval_anchors(seq_truncated_left, None, ref_window, 10.0, sgrna_seq)
print("Truncated left:", res['fail'] if res.get('fail') else res['sim'])

seq_truncated_right = ref_window[:-5] # Missing last 5 bases of right anchor
res = _eval_anchors(seq_truncated_right, None, ref_window, 10.0, sgrna_seq)
print("Truncated right:", res['fail'] if res.get('fail') else res['sim'])
