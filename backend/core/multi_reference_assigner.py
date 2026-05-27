"""
multi_reference_assigner.py — Unified Demultiplexing for Multi-Gene Analysis.

Gene/reference-level assignment algorithm:
  1. Score each read against ALL target windows across ALL genes.
  2. Collapse scores by gene: gene_score = max(target window scores for that gene).
     Target windows within the same gene are evidence, NOT competitors.
  3. Margin check between top-1 and top-2 gene-level scores only.
  4. After assignment, downstream analysis runs against every target within the gene.
"""

import core.classifier as classifier

# Number of reads to print detailed per-read debug info for
_DEBUG_DETAIL_LIMIT = 30


def assign_reads_to_references(reads_data, gene_payloads, phred_threshold=10, margin_threshold=0.05):
    """
    Unified read assignment using the shared classifier core.
    
    Args:
        reads_data: List of tuples (seq, qual)
        gene_payloads: List of { gene, sequence, targets: [{target_id, sgrna_seq}] }
        phred_threshold: float
        margin_threshold: float
    """
    # 1. Prepare gene-grouped target windows for gene-level classification.
    #    ALL target windows per gene are included — they serve as evidence for
    #    that gene/reference, not as competing classes.
    gene_classes = {}  # gene_name -> list of {target, ref_window}
    for g in gene_payloads:
        gene_name = g["gene"]
        gene_ref = g["sequence"]
        gene_classes[gene_name] = []
        for t in g.get("targets", []):
            cut_info = classifier.find_grna_cut_site(gene_ref, t["sgrna_seq"])
            win_size = int(t.get("window_size", 90))
            ref_win = classifier.extract_window(gene_ref, cut_info["cut_site"], win_size)
            cut_index_in_window = cut_info["cut_site"] - max(0, cut_info["cut_site"] - (win_size // 2))
            gene_classes[gene_name].append({
                "target": t["target_id"],
                "ref_window": ref_win,
                "sgrna_seq": t["sgrna_seq"],
                "cut_index_in_window": cut_index_in_window
            })

    # Print gene_classes summary
    print(f"[CLASSIFIER_DEMUX] Gene classes built:")
    for gn, targets in gene_classes.items():
        tnames = [t["target"] for t in targets]
        print(f"  {gn}: {len(targets)} target window(s) → {tnames}")

    results = {
        "genes": {g["gene"]: [] for g in gene_payloads},
        "ambiguous_reads": []
    }
    
    total_reads = len(reads_data)
    ambiguous_count = 0
    filtered_count = 0
    phred_passed_count = 0
    assigned_counts = {g["gene"]: 0 for g in gene_payloads}

    # Outcome counters for summary
    outcome_counts = {}
    
    # 2. Iterate and classify
    for i, (seq, qual) in enumerate(reads_data):
        # Global Phred check (independent of classification)
        if qual is not None:
            avg_q = classifier.avg_phred(qual)
            if avg_q >= phred_threshold:
                phred_passed_count += 1

        res = classifier.apply_gene_classification(
            seq, qual, 
            gene_classes, 
            phred_threshold, 
            margin_threshold
        )

        # Track outcome distribution
        dbg = res.get("debug", {})
        outcome = dbg.get("outcome", "unknown")
        outcome_counts[outcome] = outcome_counts.get(outcome, 0) + 1
        
        # Per-read debug output (detailed for first N reads)
        if i < _DEBUG_DETAIL_LIMIT:
            gene_scores = dbg.get("gene_scores", {})
            scores_str = "  ".join(
                f"{gn}={d['best_score']}(via {d['best_target']}, usable={d['usable']}/{d['total']})"
                for gn, d in gene_scores.items()
                if d.get('best_score') is not None
            )
            filtered_str = "  ".join(
                f"{gn}=NONE(usable=0/{d['total']})"
                for gn, d in gene_scores.items()
                if d.get('best_score') is None
            )
            all_scores = (scores_str + "  " + filtered_str).strip()

            if res["assigned"]:
                label = f"ASSIGNED→{res['predicted_gene']}"
            elif res.get("reason") == "ambiguous":
                label = "AMBIGUOUS"
            else:
                label = "FILTERED"

            print(
                f"  [DEMUX] read={i}  {label}  "
                f"best={dbg.get('best_gene')}  second={dbg.get('second_gene')}  "
                f"gap={dbg.get('gap')}  margin={dbg.get('margin')}  "
                f"outcome={outcome}  "
                f"scores=[{all_scores}]"
            )

        read_obj = {
            "read_index": i,
            "seq": seq,
            "qual": qual,
            "best_score": res.get("top1_score", 0.0)
        }
        
        if res["assigned"]:
            results["genes"][res["predicted_gene"]].append(read_obj)
            assigned_counts[res["predicted_gene"]] += 1
        else:
            if res.get("reason") == "filtered":
                filtered_count += 1
            else:
                results["ambiguous_reads"].append(read_obj)
                ambiguous_count += 1
                
    # 3. Format output
    output_genes = []
    for gene_name, reads in results["genes"].items():
        output_genes.append({
            "gene": gene_name,
            "assigned_reads": reads,
            "count": len(reads),
            "average_score": sum(r["best_score"] for r in reads) / len(reads) if reads else 0.0
        })

    # Summary
    total_assigned = sum(assigned_counts.values())
    print(f"\n[CLASSIFIER_DEMUX] ════════════════════════════════════════════")
    print(f"  total_reads    = {total_reads}")
    print(f"  assigned       = {total_assigned}  ({', '.join(f'{g}={c}' for g,c in assigned_counts.items())})")
    print(f"  ambiguous      = {ambiguous_count}")
    print(f"  filtered       = {filtered_count}")
    print(f"  phred_passed   = {phred_passed_count}")
    print(f"  margin_used    = {margin_threshold}")
    print(f"  --- Outcome breakdown ---")
    for oc, cnt in sorted(outcome_counts.items()):
        print(f"    {oc}: {cnt}")
    print(f"[CLASSIFIER_DEMUX] ════════════════════════════════════════════\n")
        
    return {
        "genes": output_genes,
        "ambiguous_reads": results["ambiguous_reads"],
        "debug_logs": {
            "total_reads": total_reads,
            "assigned_count": total_assigned,
            "ambiguous_count": ambiguous_count,
            "filtered_count": filtered_count,
            "phred_passed_count": phred_passed_count,
            "anchor_matched_count": total_reads - filtered_count,
            "per_gene_counts": assigned_counts,
            "outcome_counts": outcome_counts
        }
    }
