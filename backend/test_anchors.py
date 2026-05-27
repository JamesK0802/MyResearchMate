import difflib

def edit_distance(s1: str, s2: str) -> int:
    # Levenshtein distance
    m, n = len(s1), len(s2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if s1[i - 1] == s2[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1,       # deletion
                           dp[i][j - 1] + 1,       # insertion
                           dp[i - 1][j - 1] + cost) # substitution
    return dp[m][n]

def locate_target(seq: str, ref_window: str, anchor_len: int = 12):
    ref_inner = ref_window[anchor_len:-anchor_len]
    
    # 1. Try exact seeds from ref_inner
    seed_len = 10
    if len(ref_inner) >= seed_len:
        # Generate up to 3 seeds
        step = max(1, (len(ref_inner) - seed_len) // 2)
        seeds = [
            (ref_inner[:seed_len], 0),
            (ref_inner[step:step+seed_len], step),
            (ref_inner[-seed_len:], len(ref_inner) - seed_len)
        ]
        for seed, offset in seeds:
            idx = seq.find(seed)
            if idx != -1:
                # Found exact seed!
                inner_start = idx - offset
                expected_left = inner_start - anchor_len
                expected_right = inner_start + len(ref_inner)
                return expected_left, expected_right
                
    # 2. Fallback: Block match of ref_window
    sm = difflib.SequenceMatcher(None, ref_window, seq)
    match = sm.find_longest_match(0, len(ref_window), 0, len(seq))
    if match.size >= 10:
        # We matched at least 10 contiguous bp somewhere
        expected_ref_start = match.a
        expected_seq_start = match.b
        expected_left = expected_seq_start - expected_ref_start
        expected_right = expected_left + anchor_len + len(ref_inner)
        return expected_left, expected_right
        
    return -1, -1

def eval_anchor_state(seq: str, anchor: str, expected_pos: int, slop: int = 5):
    if expected_pos < 0 or expected_pos + len(anchor) > len(seq):
        return 'UNAVAILABLE', -1
        
    start = max(0, expected_pos - slop)
    end = min(len(seq), expected_pos + len(anchor) + slop)
    search_region = seq[start:end]
    
    if len(search_region) < len(anchor) - 2:
        return 'UNAVAILABLE', -1
        
    best_dist = float('inf')
    for i in range(len(search_region) - len(anchor) + 3):
        for l in (len(anchor)-2, len(anchor)-1, len(anchor), len(anchor)+1, len(anchor)+2):
            if i + l > len(search_region): continue
            sub = search_region[i:i+l]
            dist = edit_distance(anchor, sub)
            if dist < best_dist:
                best_dist = dist
                
    return ('MATCH' if best_dist <= 2 else 'MISMATCH'), best_dist

def test_read(seq, ref_window):
    print(f"\n--- Testing Read ---")
    print(f"SEQ: {seq}")
    exp_l, exp_r = locate_target(seq, ref_window)
    print(f"Expected L: {exp_l}, R: {exp_r}")
    
    if exp_l == -1 or exp_r == -1:
        print("RESULT: UNAVAILABLE (Target not located) -> FALLBACK")
        return
        
    left_anchor = ref_window[:12]
    right_anchor = ref_window[-12:]
    
    l_state, l_err = eval_anchor_state(seq, left_anchor, exp_l)
    r_state, r_err = eval_anchor_state(seq, right_anchor, exp_r)
    
    print(f"L Anchor: {l_state} (Err: {l_err})")
    print(f"R Anchor: {r_state} (Err: {r_err})")
    
    if l_state == 'MISMATCH' or r_state == 'MISMATCH':
        print("RESULT: REJECT (MISMATCH)")
        return
        
    if l_state == 'UNAVAILABLE' or r_state == 'UNAVAILABLE':
        print("RESULT: FALLBACK TRIGGERED (UNAVAILABLE)")
        return
        
    total_err = l_err + r_err
    print(f"Total Errors: {total_err}")
    if total_err <= 2:
        print("RESULT: PASS")
    else:
        print("RESULT: REJECT (Total err > 2)")

# Test Cases
ref_window = "ATCGATCGATCG" + "GGCCTTAAGGCC" * 5 + "TTTTAAAATTTT"
l_anchor = "ATCGATCGATCG" # 12bp
r_anchor = "TTTTAAAATTTT" # 12bp
inner = "GGCCTTAAGGCC" * 5 # 60bp

print(f"Ref Window Length: {len(ref_window)}")
print(f"L Anchor: {l_anchor}")
print(f"R Anchor: {r_anchor}")

# A. 1 substitution in left anchor -> PASS
seq_A = "NNN" + "ATCGATCGATCC" + inner + r_anchor + "NNN"
test_read(seq_A, ref_window)

# B. 1 deletion in right anchor -> PASS
seq_B = "NNN" + l_anchor + inner + "TTTTAAAATTT" + "NNN"
test_read(seq_B, ref_window)

# C. 1 insertion in each anchor -> PASS
seq_C = "NNN" + "ATCGGATCGATCG" + inner + "TTTTAAAAATTTT" + "NNN"
test_read(seq_C, ref_window)

# D. 3 total anchor errors -> FAIL
seq_D = "NNN" + "ATCGATCGATAA" + inner + "TTTTAAAATTTA" + "NNN"  # 2 in left, 1 in right
test_read(seq_D, ref_window)

# E. missing right anchor due to read edge -> fallback alignment triggered
seq_E = "NNN" + l_anchor + inner + "TTT"
test_read(seq_E, ref_window)

# F. large deletion removing one anchor -> fallback alignment triggered
# If left anchor is completely missing but inner is there
seq_F = "NNN" + inner + r_anchor + "NNN"
test_read(seq_F, ref_window)

# G. completely wrong anchor sequence -> immediate reject
seq_G = "NNN" + "GGGGGGGGGGGG" + inner + r_anchor + "NNN"
test_read(seq_G, ref_window)

