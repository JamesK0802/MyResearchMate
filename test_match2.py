import difflib

ref_window = "ATACCAAGCCTCACCGTCCTCGCTTTTCTATCTATCCTTCCTAGTGTTTTTGTTTTTAAG"
seq = "AGCCTCACCGTCCTCGCTTTTCTATCTATCCTTCCTAGTGTTTTTGTTTTTAAGNNN"

sm = difflib.SequenceMatcher(None, ref_window.lower(), seq.lower())
match = sm.find_longest_match(0, len(ref_window), 0, len(seq))
print("Match:", match)

offset = match.b - match.a
li = offset
ri = offset + len(ref_window)
print("li:", li, "ri:", ri)

pad_left = ref_window[:-li] if li < 0 else ""
actual_start = max(0, li)
actual_end = min(len(seq), ri)
pad_right = ref_window[-(ri - len(seq)):] if ri > len(seq) else ""

print("pad_left:", pad_left)
print("seq part:", seq[actual_start:actual_end])
print("pad_right:", pad_right)

read_window = pad_left + seq[actual_start:actual_end] + pad_right
print("ref:", ref_window)
print("res:", read_window)

