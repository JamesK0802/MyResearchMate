"""
classifier.py — X-Padding Classification Core for CRISPR Analysis.

Pipeline:
1. gRNA-based coordinate alignment between read and reference window.
2. Cut-site ±15bp coverage gate (minimum requirement).
3. Anchor search for precise inner-region extraction (indel detection).
4. X-padding for unobserved terminal positions.
5. X-aware anchor comparison (skip X, exact on observed).
6. X-aware k-mer scoring for gene classification.

Core principle:
  Observed bases are evidence.
  Terminal X bases are unknown and ignored.
  Cut-site ±15bp must be present for analysis.
"""

import difflib
import functools
from typing import List, Dict, Tuple, Optional, Any

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

CUT_SITE_MIN_FLANK = 15   # Read must cover cut_site ± this many bp
ANCHOR_LEN = 12            # Anchor length for boundary detection and comparison

# ─────────────────────────────────────────────────────────────────────────────
# Type Helpers & Basic Utilities
# ─────────────────────────────────────────────────────────────────────────────

def _to_str(seq) -> str:
    if isinstance(seq, str):
        return seq
    if isinstance(seq, (bytes, bytearray)):
        return seq.decode('ascii', errors='replace')
    return str(seq)

def reverse_complement(seq) -> str:
    seq_str = _to_str(seq).upper()
    comp = {'A': 'T', 'T': 'A', 'G': 'C', 'C': 'G', 'N': 'N'}
    return ''.join(comp.get(b, 'N') for b in reversed(seq_str))

def avg_phred(qual) -> float:
    if not qual:
        return 40.0
    if isinstance(qual, (list, tuple)):
        if not qual: return 40.0
        return (sum(qual) / len(qual)) if isinstance(qual[0], int) else \
               sum(ord(c) - 33 for c in qual) / len(qual)
    if isinstance(qual, (bytes, bytearray)):
        return sum(b - 33 for b in qual) / len(qual)
    if isinstance(qual, str):
        return sum(ord(c) - 33 for c in qual) / len(qual)
    return 40.0

# ─────────────────────────────────────────────────────────────────────────────
# Reference Optimization
# ─────────────────────────────────────────────────────────────────────────────

def find_grna_cut_site(reference: str, grna: str) -> Dict[str, Any]:
    """Finds gRNA and calculates cut site in ref coordinates."""
    ref_up = _to_str(reference).upper()
    grna_up = _to_str(grna).upper()
    grna_rc = reverse_complement(grna_up)
    ref_len, grna_len = len(ref_up), len(grna_up)

    if grna_len == 0:
        return {'strand': 'unknown', 'grna_start': -1, 'grna_end': -1, 'cut_site': ref_len // 2, 'pam': 'N/A', 'pam_found': False}

    # Forward: gRNA + [NGG]
    for pos in range(ref_len - grna_len):
        if ref_up[pos:pos+grna_len] == grna_up:
            ps = pos + grna_len
            if ps + 3 <= ref_len:
                pam = ref_up[ps:ps+3]
                if pam[1] == 'G' and pam[2] == 'G':
                    return {'strand': 'forward', 'grna_start': pos, 'grna_end': pos + grna_len, 
                            'cut_site': pos + grna_len - 3, 'pam': pam, 'pam_found': True}

    # Reverse: [CCN] + gRNA_RC
    for pos in range(ref_len - len(grna_rc)):
        if ref_up[pos:pos+len(grna_rc)] == grna_rc:
            pe = pos
            ps = pe - 3
            if ps >= 0:
                pam = ref_up[ps:pe]
                if pam[0] == 'C' and pam[1] == 'C':
                    return {'strand': 'reverse', 'grna_start': pos, 'grna_end': pos + len(grna_rc),
                            'cut_site': pos + 3, 'pam': pam, 'pam_found': True}

    # Fallback midpoint
    idx = ref_up.find(grna_up)
    if idx != -1: 
        return {'strand': 'forward', 'grna_start': idx, 'grna_end': idx + grna_len,
                'cut_site': idx + grna_len - 3, 'pam': 'NOT_FOUND', 'pam_found': False}
    idx = ref_up.find(grna_rc)
    if idx != -1: 
        return {'strand': 'reverse', 'grna_start': idx, 'grna_end': idx + len(grna_rc),
                'cut_site': idx + 3, 'pam': 'NOT_FOUND', 'pam_found': False}
    
    return {'strand': 'unknown', 'grna_start': -1, 'grna_end': -1, 'cut_site': ref_len // 2, 'pam': 'N/A', 'pam_found': False}

def extract_window(reference: str, cut_site: int, window_size: int) -> str:
    # USER REQUEST: window_size refers to the TOTAL width (± window_size // 2)
    half = int(window_size) // 2
    start = max(0, cut_site - half)
    end = min(len(reference), cut_site + half)
    return reference[start:end]

# ─────────────────────────────────────────────────────────────────────────────
# X-Padding Pipeline
# ─────────────────────────────────────────────────────────────────────────────

def _find_offset(seq_up: str, ref_up: str, sgrna_seq: str) -> Optional[int]:
    """
    Find coordinate offset between read and ref_window.
    offset = read_position - ref_window_position for corresponding bases.
    i.e., ref_window[0] corresponds to seq[offset].
    
    Tries gRNA alignment (fwd + RC), then anchor fallback.
    """
    # Method 1: gRNA alignment
    if sgrna_seq:
        sgrna_up = sgrna_seq.upper()
        sgrna_rc = reverse_complement(sgrna_up)
        for search in (sgrna_up, sgrna_rc):
            ri = seq_up.find(search)
            if ri == -1:
                continue
            rr = ref_up.find(search)
            if rr == -1:
                continue
            return ri - rr

    # Method 2: Left anchor fallback
    left_anchor = ref_up[:ANCHOR_LEN]
    li = seq_up.find(left_anchor)
    if li != -1:
        return li  # left anchor is at ref_window position 0

    # Method 3: Right anchor fallback
    right_anchor = ref_up[-ANCHOR_LEN:]
    ri = seq_up.find(right_anchor)
    if ri != -1:
        return ri - (len(ref_up) - ANCHOR_LEN)

    return None


def _align_read_to_window(seq: str, qual, ref_window: str, cut_index_in_window: int, sgrna_seq: str) -> Dict:
    """
    Aligns read to ref_window. Returns extraction info for classification.
    
    Two outputs:
    - observed_read: variable-length (anchor-based if possible), for alignment/classification
    - read_window: fixed-length (= ref_window), X-padded, for anchor check/display
    
    Returns dict with fail reason or extraction results.
    """
    seq_up = seq.upper()
    ref_up = ref_window.upper()
    win_len = len(ref_window)

    # ── Step 1: Find coordinate offset ────────────────────────────────────────
    offset = _find_offset(seq_up, ref_up, sgrna_seq)
    if offset is None:
        return {'fail': 'no_alignment'}

    # ── Step 2: Cut-site ±15bp coverage gate ──────────────────────────────────
    cut_in_read = offset + cut_index_in_window
    if cut_in_read - CUT_SITE_MIN_FLANK < 0 or cut_in_read + CUT_SITE_MIN_FLANK > len(seq):
        return {'fail': 'no_coverage'}

    # ── Step 3: Find anchors for precise boundary detection ───────────────────
    # Anchors enable variable-length inner extraction → indel detection
    left_anchor = ref_up[:ANCHOR_LEN]
    right_anchor = ref_up[-ANCHOR_LEN:]
    ref_inner_len = win_len - 2 * ANCHOR_LEN

    # Find all anchor positions
    left_positions = []
    idx = seq_up.find(left_anchor)
    while idx != -1:
        left_positions.append(idx)
        idx = seq_up.find(left_anchor, idx + 1)

    right_positions = []
    idx = seq_up.find(right_anchor)
    while idx != -1:
        right_positions.append(idx)
        idx = seq_up.find(right_anchor, idx + 1)

    # Find best anchor pair (inner length closest to expected)
    best_li, best_ri = -1, -1
    best_diff = float('inf')
    for l in left_positions:
        for r in right_positions:
            if r >= l + ANCHOR_LEN:
                inner_len = r - l - ANCHOR_LEN
                diff = abs(inner_len - ref_inner_len)
                if diff < best_diff:
                    best_diff = diff
                    best_li, best_ri = l, r

    # ── Step 4: Build observed_read + read_window ─────────────────────────────
    # read_window: fixed length = win_len, X-padded, for anchor check
    # observed_read: variable length, for alignment (captures indels)

    if best_li != -1 and best_ri != -1:
        # CASE A: Both anchors found — precise variable-length extraction
        observed_read = seq[best_li: best_ri + ANCHOR_LEN].upper()
        left_x = 0
        right_x = 0
        read_window = observed_read

    elif left_positions:
        # CASE B: Left anchor found, right truncated
        best_left = min(left_positions, key=lambda x: abs(x - offset))
        observed_read = seq[best_left:].upper()
        left_x = 0
        right_x = max(0, best_left + win_len - len(seq))
        read_window = observed_read + 'X' * right_x

    elif right_positions:
        # CASE C: Right anchor found, left truncated
        best_right = min(right_positions, key=lambda x: abs(x - (offset + win_len - ANCHOR_LEN)))
        end_pos = best_right + ANCHOR_LEN
        win_start = best_right - (win_len - ANCHOR_LEN)
        actual_start = max(0, win_start)
        observed_read = seq[actual_start:end_pos].upper()
        left_x = max(0, -win_start)
        right_x = 0
        read_window = 'X' * left_x + observed_read

    else:
        # CASE D: No anchors found — offset-based extraction
        rw_start = offset
        rw_end = offset + win_len
        left_x = max(0, -rw_start)
        right_x = max(0, rw_end - len(seq))
        actual_start = max(0, rw_start)
        actual_end = min(len(seq), rw_end)
        observed_read = seq[actual_start:actual_end].upper()
        read_window = 'X' * left_x + observed_read + 'X' * right_x

    # ── Step 5: Quality window for observed bases ─────────────────────────────
    # Build qual for observed_read (for phred check)
    if qual is not None:
        if best_li != -1 and best_ri != -1:
            qual_observed = tuple(qual[best_li: best_ri + ANCHOR_LEN])
        elif left_positions:
            qual_observed = tuple(qual[best_left:])
        elif right_positions:
            qual_observed = tuple(qual[actual_start:end_pos])
        else:
            actual_s = max(0, offset)
            actual_e = min(len(seq), offset + win_len)
            qual_observed = tuple(qual[actual_s:actual_e])
    else:
        qual_observed = None

    return {
        'fail': None,
        'observed_read': observed_read,
        'read_window': read_window,
        'qual_observed': qual_observed,
        'left_x': left_x,
        'right_x': right_x,
    }


def _xaware_anchor_check(read_window: str, ref_window: str) -> bool:
    """
    X-aware anchor comparison on fixed-length read_window.
    Compare only non-X observed bases. X positions are ignored.
    If any observed base mismatches anchor → False.
    """
    rw = read_window.upper()
    rf = ref_window.upper()
    wl = min(len(rw), len(rf))

    # Left anchor: first ANCHOR_LEN positions
    for i in range(min(ANCHOR_LEN, wl)):
        if rw[i] == 'X':
            continue
        if rw[i] != rf[i]:
            return False

    # Right anchor: last ANCHOR_LEN positions
    for i in range(1, min(ANCHOR_LEN + 1, wl + 1)):
        if rw[-i] == 'X':
            continue
        if rw[-i] != rf[-i]:
            return False

    return True


# ─────────────────────────────────────────────────────────────────────────────
# Usability Filter
# ─────────────────────────────────────────────────────────────────────────────

@functools.lru_cache(maxsize=131072)
def _is_read_usable_cached(seq: str, qual_tuple: Optional[Tuple[int, ...]], ref_window: str,
                            phred_threshold: float, sgrna_seq: str = "",
                            cut_index_in_window: int = -1) -> Tuple[bool, str, Optional[Dict]]:
    win_len = len(ref_window)
    if cut_index_in_window < 0:
        cut_index_in_window = win_len // 2

    # Try forward
    fw_res = _align_read_to_window(seq, qual_tuple, ref_window, cut_index_in_window, sgrna_seq)
    # Try RC
    rc_seq = reverse_complement(seq)
    rc_qual = tuple(reversed(qual_tuple)) if qual_tuple is not None else None
    rc_res = _align_read_to_window(rc_seq, rc_qual, ref_window, cut_index_in_window, sgrna_seq)

    candidates = []
    fail_reasons = set()

    for res, is_rc in [(fw_res, False), (rc_res, True)]:
        if res['fail'] is not None:
            fail_reasons.add(res['fail'])
            continue

        # X-aware anchor check
        if not _xaware_anchor_check(res['read_window'], ref_window):
            fail_reasons.add('no_anchor')
            continue

        # Phred check on observed bases
        if res['qual_observed'] is not None:
            observed_quals = res['qual_observed']
            if observed_quals:
                avg_q = sum(observed_quals) / len(observed_quals)
                if avg_q < phred_threshold:
                    fail_reasons.add('quality')
                    continue

        candidates.append((res, is_rc))

    if not candidates:
        # Pick most informative failure reason
        if 'quality' in fail_reasons:
            reason = 'quality'
        elif 'no_anchor' in fail_reasons:
            reason = 'no_anchor'
        elif 'no_coverage' in fail_reasons:
            reason = 'no_coverage'
        else:
            reason = 'no_alignment'
        return False, reason, None

    # Pick best candidate: fewer X (more observed data)
    best_res, is_rc = min(candidates, key=lambda c: c[0]['left_x'] + c[0]['right_x'])

    result = dict(best_res)
    result['is_rc'] = is_rc
    return True, 'ok', result


def is_read_usable(seq: str, qual, ref_window: str, phred_threshold: float,
                   sgrna_seq: str = "", cut_index_in_window: int = -1) -> Tuple[bool, str, Optional[Dict]]:
    """
    Public API. Tries fwd and RC orientations.
    Returns (usable, reason, best_res_dict).
    """
    qual_tuple = tuple(qual) if qual is not None else None
    usable, reason, best_res = _is_read_usable_cached(
        seq, qual_tuple, ref_window, phred_threshold, sgrna_seq, cut_index_in_window
    )
    if best_res is not None:
        return usable, reason, dict(best_res)
    return usable, reason, None

def clear_classifier_cache():
    """Clears the classifier lru cache to prevent unbounded growth."""
    _is_read_usable_cached.cache_clear()

# ─────────────────────────────────────────────────────────────────────────────
# Scoring (X-aware)
# ─────────────────────────────────────────────────────────────────────────────

def score_read_against_window(read: str, ref_window: str, k: int = 10) -> float:
    """X-aware k-mer scoring. Skips k-mers containing X."""
    read_up = _to_str(read).upper()
    ref_up = _to_str(ref_window).upper()
    if not read_up or not ref_up: return 0.0
    if len(read_up) < k or len(ref_up) < k:
        clean_read = read_up.replace('X', '')
        clean_ref = ref_up.replace('X', '')
        if not clean_read or not clean_ref: return 0.0
        return difflib.SequenceMatcher(None, clean_read, clean_ref).ratio()

    ref_kmers = set(ref_up[i:i+k] for i in range(len(ref_up)-k+1)
                    if 'N' not in ref_up[i:i+k] and 'X' not in ref_up[i:i+k])
    if not ref_kmers: return 0.0

    def get_strand_hits(strand):
        hits = 0
        for i in range(len(strand)-k+1):
            kmer = strand[i:i+k]
            if 'N' not in kmer and 'X' not in kmer and kmer in ref_kmers:
                hits += 1
        return hits
        
    fw_hits = get_strand_hits(read_up)
    rc_hits = get_strand_hits(reverse_complement(read_up))
    best_hits = max(fw_hits, rc_hits)
    
    return min(1.0, best_hits / max(len(ref_kmers), 1))

# ─────────────────────────────────────────────────────────────────────────────
# Classification
# ─────────────────────────────────────────────────────────────────────────────

def apply_classification(
    read_seq: str, 
    read_qual: Any, 
    classes: List[Dict], 
    phred_threshold: float,
    margin: float
) -> Dict:
    """
    Unified entry point for classification.
    classes: List of { gene, target, ref_window, sgrna_seq, cut_index_in_window }
    """
    eligible_classes = []
    for c in classes:
        usable, _, _ = is_read_usable(
            read_seq, read_qual, c['ref_window'], phred_threshold,
            c.get('sgrna_seq', ''), c.get('cut_index_in_window', -1)
        )
        if usable:
            eligible_classes.append(c)
    
    if not eligible_classes:
        return {'assigned': False, 'reason': 'filtered'}

    scores = sorted(
        [(score_read_against_window(read_seq, c['ref_window']), c['gene'], c['target'])
         for c in eligible_classes],
        reverse=True
    )
    
    top1_score, top1_gene, top1_target = scores[0]

    if len(classes) == 1:
        return {
            'assigned': True, 
            'predicted_gene': top1_gene, 
            'predicted_target': top1_target,
            'top1_score': round(top1_score, 4)
        }

    top2_score = scores[1][0] if len(scores) > 1 else 0.0
    gap = top1_score - top2_score
    
    if gap >= margin:
        return {
            'assigned': True, 
            'predicted_gene': top1_gene, 
            'predicted_target': top1_target,
            'top1_score': round(top1_score, 4),
            'top2_score': round(top2_score, 4),
            'gap': round(gap, 4)
        }
    
    return {'assigned': False, 'reason': 'ambiguous', 'top1_score': round(top1_score, 4)}

# ─────────────────────────────────────────────────────────────────────────────
# Gene-Level Classification
# ─────────────────────────────────────────────────────────────────────────────

def apply_gene_classification(
    read_seq: str,
    read_qual: Any,
    gene_classes: Dict[str, List[Dict]],
    phred_threshold: float,
    margin: float
) -> Dict:
    """
    Gene/reference-level classification. Assigns a read to a GENE.
    gene_classes: { gene_name -> [{ target, ref_window, sgrna_seq, cut_index_in_window }] }
    """
    gene_names = list(gene_classes.keys())

    # ── Single-gene shortcut ─────────────────────────────────────────────────
    if len(gene_names) == 1:
        gene_name = gene_names[0]
        for t in gene_classes[gene_name]:
            usable, _, _ = is_read_usable(
                read_seq, read_qual, t['ref_window'], phred_threshold,
                t.get('sgrna_seq', ''), t.get('cut_index_in_window', -1)
            )
            if usable:
                return {
                    'assigned': True,
                    'predicted_gene': gene_name,
                    'top1_score': 1.0,
                    'debug': {
                        'gene_scores': {gene_name: {'best_score': 1.0, 'best_target': t['target'], 'usable': 1, 'total': len(gene_classes[gene_name])}},
                        'best_gene': gene_name, 'second_gene': None, 'gap': None, 'margin': margin,
                        'outcome': 'assigned_single_gene'
                    }
                }
        return {
            'assigned': False, 'reason': 'filtered',
            'debug': {
                'gene_scores': {gene_name: {'best_score': None, 'best_target': None, 'usable': 0, 'total': len(gene_classes[gene_name])}},
                'best_gene': None, 'second_gene': None, 'gap': None, 'margin': margin,
                'outcome': 'filtered_no_usable_window'
            }
        }

    # ── Multi-gene: score each gene by its best target window ────────────────
    gene_scores = []
    gene_debug = {}
    any_usable = False

    for gene_name, targets in gene_classes.items():
        best_score = -1.0
        best_target = None
        gene_usable = False
        usable_count = 0

        for t in targets:
            usable, _, _ = is_read_usable(
                read_seq, read_qual, t['ref_window'], phred_threshold,
                t.get('sgrna_seq', ''), t.get('cut_index_in_window', -1)
            )
            if usable:
                gene_usable = True
                any_usable = True
                usable_count += 1
                score = score_read_against_window(read_seq, t['ref_window'])
                if score > best_score:
                    best_score = score
                    best_target = t['target']

        gene_debug[gene_name] = {
            'best_score': round(best_score, 4) if best_score >= 0 else None,
            'best_target': best_target,
            'usable': usable_count,
            'total': len(targets)
        }

        if gene_usable:
            gene_scores.append((best_score, gene_name))

    if not any_usable:
        return {
            'assigned': False, 'reason': 'filtered',
            'debug': {
                'gene_scores': gene_debug,
                'best_gene': None, 'second_gene': None, 'gap': None, 'margin': margin,
                'outcome': 'filtered_no_usable_window'
            }
        }

    gene_scores.sort(reverse=True)
    top1_score, top1_gene = gene_scores[0]

    if len(gene_scores) == 1:
        return {
            'assigned': True,
            'predicted_gene': top1_gene,
            'top1_score': round(top1_score, 4),
            'debug': {
                'gene_scores': gene_debug,
                'best_gene': top1_gene, 'second_gene': None, 'gap': None, 'margin': margin,
                'outcome': 'assigned_only_one_gene_usable'
            }
        }

    top2_score, top2_gene = gene_scores[1]
    gap = top1_score - top2_score

    debug_block = {
        'gene_scores': gene_debug,
        'best_gene': top1_gene, 'second_gene': top2_gene,
        'gap': round(gap, 4), 'margin': margin,
    }

    if gap >= margin:
        debug_block['outcome'] = 'assigned_margin_pass'
        return {
            'assigned': True,
            'predicted_gene': top1_gene,
            'top1_score': round(top1_score, 4),
            'top2_score': round(top2_score, 4),
            'gap': round(gap, 4),
            'debug': debug_block
        }

    debug_block['outcome'] = 'ambiguous_margin_fail'
    return {
        'assigned': False, 'reason': 'ambiguous',
        'top1_score': round(top1_score, 4),
        'top2_score': round(top2_score, 4),
        'gap': round(gap, 4),
        'debug': debug_block
    }
