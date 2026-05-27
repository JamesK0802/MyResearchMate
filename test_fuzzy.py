import difflib
import time

def find_anchor(seq, anchor):
    best_ratio = 0.0
    best_idx = -1
    best_len = len(anchor)
    a_len = len(anchor)
    for i in range(len(seq) - a_len + 3):
        for l in (a_len-2, a_len-1, a_len, a_len+1, a_len+2):
            if i + l > len(seq): continue
            sub = seq[i:i+l]
            ratio = difflib.SequenceMatcher(None, anchor, sub).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_idx = i
                best_len = l
                if ratio == 1.0:
                    return best_ratio, best_idx, best_len
    return best_ratio, best_idx, best_len

seq = "A" * 50 + "TCTAGCGCTAT" + "C" * 50
anchor = "TCTAGCGCTATA"

start = time.time()
for _ in range(100):
    find_anchor(seq, anchor)
print(f"Time for 100 reads: {time.time() - start:.4f}s")
