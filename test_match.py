import difflib

ref_window = "ATACCAAGCCTCACCGTCCTCGCTTTTCTATCTATCCTTCCTAGTGTTTTTGTTTTTAAG"
seq = "NNNATACCAAGCCTCACCGTCCTCGCTTTTCTATCTATCCTTCCTAGTGTT"

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
pad_right = ref_window[len(seq) - ri:] if ri > len(seq) else ""
# Wait! pad_right logic: if ri = 60, len(seq) = 51. ri > len(seq) is True.
# Missing length at the end is `ri - len(seq)` = 60 - 51 = 9.
# We want the LAST 9 bases of ref_window.
# ref_window[-9:] -> ref_window[-(ri - len(seq)):]
pad_right2 = ref_window[-(ri - len(seq)):] if ri > len(seq) else ""

print("pad_left:", pad_left)
print("seq part:", seq[actual_start:actual_end])
print("pad_right2:", pad_right2)

read_window = pad_left + seq[actual_start:actual_end] + pad_right2
print("ref:", ref_window)
print("res:", read_window)

