import time
import difflib

def smith_waterman(seq: str, ref: str):
    sm = difflib.SequenceMatcher(None, seq, ref)
    match = sm.find_longest_match(0, len(seq), 0, len(ref))
    if match.size < 8:
        return 0, -1, -1
        
    m, n = len(seq), len(ref)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    max_score = 0
    max_i, max_j = 0, 0
    
    match_award = 2
    mismatch_penalty = -2
    gap_penalty = -2
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            score_diag = dp[i-1][j-1] + (match_award if seq[i-1] == ref[j-1] else mismatch_penalty)
            score_up = dp[i-1][j] + gap_penalty
            score_left = dp[i][j-1] + gap_penalty
            
            dp[i][j] = max(0, score_diag, score_up, score_left)
            if dp[i][j] > max_score:
                max_score = dp[i][j]
                max_i = i
                max_j = j
                
    if max_score == 0:
        return 0, -1, -1
        
    i, j = max_i, max_j
    while dp[i][j] != 0:
        if i > 0 and j > 0 and dp[i][j] == dp[i-1][j-1] + (match_award if seq[i-1] == ref[j-1] else mismatch_penalty):
            i -= 1
            j -= 1
        elif i > 0 and dp[i][j] == dp[i-1][j] + gap_penalty:
            i -= 1
        elif j > 0 and dp[i][j] == dp[i][j-1] + gap_penalty:
            j -= 1
        else:
            break
            
    return max_score, i, j

ref = "ATCGATCGATCGGGCCTTAAGGCCGGCCTTAAGGCCGGCCTTAAGGCCGGCCTTAAGGCCGGCCTTAAGGCCTTTTAAAATTTT"
seq1 = "NNNATCGATCGATCGGGCCTTAAGGCCGGCCTTAAGGCCGGCCTTAAGGCCGGCCTTAAGGCCGGCCTTAAGGCCTTTTAAAATTTTNNN"
seq2 = "NNNAAAAAATTTTTTGGGGGGCCCCCCAAAAAATTTTTTGGGGGGCCCCCCAAAAAATTTTTTGGGGGGCCCCCCNNN"

t0 = time.time()
for _ in range(1000):
    smith_waterman(seq2, ref)
t1 = time.time()
print(f"Time for 1000 unrelated reads: {t1-t0:.4f}s")

t0 = time.time()
for _ in range(1000):
    smith_waterman(seq1, ref)
t1 = time.time()
print(f"Time for 1000 matching reads: {t1-t0:.4f}s")

