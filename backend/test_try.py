import core.classifier as classifier

ref_window = "ATACCAAGCCTCACCGTCCTCGCTTTTCTATCTATCCTTCCTAGTGTTTTTGTTTTTAAG"
seq = "ATACCAAGCCTCACCGTCCTCGCTTTTCTATCTATCCTTCCTAGTGTTTTTGTTTTTAAG"
qual = [30] * len(seq)

res = classifier._eval_anchors(seq, qual, ref_window, 20)
print("Forward:", res)
