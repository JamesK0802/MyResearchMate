"""
analyzer.py — X-aware Mutation Classification and Alignment.

Aligns observed_read against ref_window using SequenceMatcher.
Terminal operations (leading/trailing deletes from truncation) are
identified and marked as "unobserved" — never counted as biological deletions.

Token types:
  equal       — matching base
  substitute  — mismatching base
  delete      — biological deletion (internal)
  insert      — biological insertion
  unobserved  — terminal unobserved position (X)
"""

from difflib import SequenceMatcher


def classify_mutation_with_alignment(ref_seq, read_seq, left_x=0, right_x=0):
    """
    X-aware mutation classification.
    
    Aligns read_seq (variable length, observed portion) against ref_seq (full ref_window).
    Terminal alignment artifacts from truncation are marked as 'unobserved', not 'delete'.
    
    Returns: (category, has_sub, net_indel, tokens)
    """
    tokens = align_read_to_ref_xaware(ref_seq, read_seq, left_x, right_x)
    
    # Count only biological (non-unobserved) operations
    ins_len = sum(len(t["val"]) for t in tokens if t["type"] == "insert")
    del_len = sum(len(t["val"]) for t in tokens if t["type"] == "delete")
    sub_count = sum(len(t["val"]) for t in tokens if t["type"] == "substitute")
    
    net_indel = ins_len - del_len
    has_sub = (sub_count > 0)
    
    if ins_len == 0 and del_len == 0:
        category = "no_indel"
    else:
        if net_indel % 3 == 0:
            category = "in_frame"
        else:
            category = "out_of_frame"
            
    return category, has_sub, net_indel, tokens


def align_read_to_ref_xaware(ref_seq, read_seq, left_x=0, right_x=0):
    """
    X-aware alignment with terminal detection.
    
    Aligns read_seq against ref_seq using SequenceMatcher.
    If left_x > 0 or right_x > 0, the read doesn't cover the full reference.
    Terminal delete operations (from truncation) are converted to 'unobserved'.
    Terminal insert operations (beyond-window bases) are discarded.
    
    Returns list of tokens for frontend rendering.
    """
    matcher = SequenceMatcher(None, ref_seq, read_seq)
    opcodes = matcher.get_opcodes()
    
    if not opcodes:
        return []
    
    # ── Identify terminal opcodes ─────────────────────────────────────────────
    # Leading terminals: consecutive deletes at the start (left truncation)
    # Trailing terminals: consecutive deletes/inserts at the end (right truncation / beyond-window)
    
    leading_terminal = set()
    for idx, (tag, i1, i2, j1, j2) in enumerate(opcodes):
        if tag == 'delete':
            leading_terminal.add(idx)
        else:
            break
    
    trailing_terminal = set()
    for idx in range(len(opcodes) - 1, -1, -1):
        tag, i1, i2, j1, j2 = opcodes[idx]
        if tag == 'delete':
            trailing_terminal.add(idx)
        elif tag == 'insert' and i1 >= len(ref_seq):
            # Insert at the very end of ref — beyond-window bases
            trailing_terminal.add(idx)
        else:
            break
    
    terminal_indices = leading_terminal | trailing_terminal
    
    # Only apply terminal detection when there IS truncation
    has_truncation = (left_x > 0 or right_x > 0)
    
    # ── Generate tokens ───────────────────────────────────────────────────────
    tokens = []
    
    for idx, (tag, i1, i2, j1, j2) in enumerate(opcodes):
        is_terminal = has_truncation and idx in terminal_indices
        
        if tag == 'equal':
            tokens.append({"type": "equal", "val": read_seq[j1:j2]})
            
        elif tag == 'replace':
            ref_chunk = ref_seq[i1:i2]
            read_chunk = read_seq[j1:j2]
            sub_len = min(len(ref_chunk), len(read_chunk))
            if sub_len > 0:
                tokens.append({"type": "substitute", "val": read_chunk[:sub_len]})
            if len(ref_chunk) > sub_len:
                op_type = "unobserved" if is_terminal else "delete"
                val = "X" * (len(ref_chunk) - sub_len) if op_type == "unobserved" else "-" * (len(ref_chunk) - sub_len)
                tokens.append({"type": op_type, "val": val})
            elif len(read_chunk) > sub_len:
                if not is_terminal:  # Don't add beyond-window inserts
                    tokens.append({"type": "insert", "val": read_chunk[sub_len:]})
                    
        elif tag == 'delete':
            if is_terminal:
                tokens.append({"type": "unobserved", "val": "X" * (i2 - i1)})
            else:
                tokens.append({"type": "delete", "val": "-" * (i2 - i1)})
                
        elif tag == 'insert':
            if not is_terminal:  # Discard beyond-window trailing inserts
                tokens.append({"type": "insert", "val": read_seq[j1:j2]})
    
    return tokens


# ── Legacy compatibility wrapper ──────────────────────────────────────────────
def align_read_to_ref(ref_seq, read_seq):
    """
    Legacy alignment without X-awareness.
    Creates an array of alignment tokens for frontend rendering.
    """
    return align_read_to_ref_xaware(ref_seq, read_seq, left_x=0, right_x=0)
