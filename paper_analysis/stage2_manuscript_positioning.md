# Stage 2 manuscript positioning

Date: 2026-05-28

Scope: This document uses `paper_analysis/algorithm_dossier.md` and `paper_analysis/stage1_critical_findings.md` as the evidence base. It does not introduce new validation results, performance numbers, or biological claims. Production code was not modified.

## Safest manuscript framing

The safest current framing is:

> Gene/reference-level pooled CRISPR read assignment with ambiguity-aware filtering and multi-target, multi-gRNA editing quantification.

This phrasing is code-faithful because the implementation assigns reads primarily to one gene/reference class, not to an independent gene+target+template class. Target/gRNA windows inside the same gene are collapsed as assignment evidence. After a read is assigned to a gene/reference, the same read set is analyzed independently against every target/gRNA window in that gene.

Use "multi-reference" when referring to multiple user-provided gene/reference sequences that compete during pooled assignment. Use "multi-target" and "multi-gRNA" for the per-gene target analysis that follows assignment. Avoid leading with "multi-template assignment" unless the manuscript explicitly defines template as the submitted reference sequence or the code later adds explicit template identifiers.

Recommended one-sentence contribution statement:

> We present a pooled CRISPR sequencing analysis workflow that assigns reads to user-defined gene/reference classes using collapsed target-window evidence, avoids forced assignment of uncertain reads, and quantifies editing outcomes across multiple target/gRNA windows within each assigned reference.

## Wording boundaries

Implemented behavior:

- Pooled FASTQ files are accepted through the active web-to-backend analysis path.
- FASTQ parsing extracts sequence and Phred qualities with BioPython.
- Gene/reference assignment uses target/gRNA windows as collapsed evidence.
- Cross-gene ambiguity is handled by a score-margin rule.
- Assigned reads are re-evaluated independently for all targets in the assigned gene.
- Partial terminal windows can be represented with X/unobserved positions when cut-site coverage is sufficient.
- Insertions, deletions, substitutions, and unobserved terminal positions are tokenized for reporting.
- Per-target summaries and frontend Excel exports are generated.

Claims that need validation:

- Accuracy of gene/reference assignment.
- Accuracy of ambiguous-read detection under highly similar references.
- Correctness of multi-target and co-editing summaries in synthetic truth sets.
- Runtime and cost-saving magnitude.
- Export/re-import reproducibility.
- Robust behavior on malformed or edge-case inputs.

Claims that need code changes or qualification:

- Independent multi-template assignment.
- Cross-gene simultaneous edit phasing.
- Unified overlapping-edit allele reconstruction.
- Fixed 85% inner-window similarity QC.
- Strict PAM requirement.
- Durable resumable job tracking.

## Five possible manuscript titles

1. Ambiguity-aware pooled CRISPR sequencing analysis for cost-efficient multi-target editing quantification

2. Gene/reference-level assignment enables pooled CRISPR sequencing analysis with multi-gRNA editing readout

3. A pooled CRISPR sequencing workflow for ambiguity-aware read assignment and per-target editing quantification

4. Cost-conscious pooled CRISPR sequencing analysis with partial-window-aware mutation calling and multi-target reporting

5. Ambiguity-aware gene/reference assignment for pooled CRISPR sequencing and multi-target edit quantification

## Abstract draft

Pooled CRISPR amplicon sequencing can reduce the number of separate sequencing reactions required to evaluate multiple genes, targets, or guide RNAs, but it creates an analysis problem: each read must be interpreted against several possible references while uncertain assignments should not be forced into downstream editing estimates. We developed a pooled CRISPR sequencing analysis workflow that performs gene/reference-level read assignment followed by target-level editing quantification. The implemented pipeline accepts FASTQ files and user-defined reference metadata containing genes, reference sequences, targets, and gRNAs. Reads are parsed with Phred quality values, oriented against forward and reverse-complement reference windows, filtered for cut-site coverage, anchor consistency, and observed-base quality, and scored against candidate gene/reference classes using target-window evidence. Reads with insufficient separation between top candidate references are marked ambiguous and excluded from primary target-level denominators. Assigned reads are then re-evaluated independently against each target/gRNA window within the selected gene, enabling multi-target and multi-gRNA summaries from a pooled sequencing run. Mutation calling uses padded read windows to distinguish terminal unobserved positions from biological deletions, tokenizes substitutions, insertions, deletions, and unobserved bases, and classifies indels by net frame effect. The workflow generates per-target editing summaries, mutation groups, visualization-ready JSON, and Excel reports. Current implementation supports a conservative manuscript framing around ambiguity-aware gene/reference assignment and multi-target quantification; validation against synthetic truth sets and real pooled examples is still required before reporting assignment accuracy, runtime gains, cost reductions, or biological conclusions. These validation steps will define the final Results claims without overstating untested performance or biological interpretation effects.

## Results section outline

### 1. Motivation: pooled CRISPR sequencing needs assignment-aware analysis

Purpose: establish the niche relative to single-target analysis tools.

Key points:

- Pooled sequencing can reduce the number of separate sequencing reactions when multiple genes, targets, or gRNAs are analyzed together.
- Pooled input creates uncertainty because reads may be compatible with more than one reference.
- The manuscript should frame the tool as an assignment-aware pooled analysis engine, not a general web-platform paper.

Evidence needed:

- Schematic comparison of single-target vs pooled workflow.
- No performance numbers until Stage 3 validation.

### 2. Pipeline architecture from FASTQ input to per-target outputs

Purpose: show the implemented computational workflow.

Key points:

- FASTQ upload and reference metadata produce a `genesPayload` with genes, sequences, targets, gRNAs, and window sizes.
- Backend parsing, assignment, target analysis, mutation grouping, and JSON/export generation form the main pipeline.
- This section should cite the active functions from `backend/api.py`, `backend/run_local.py`, `backend/core/parser.py`, `backend/core/multi_reference_assigner.py`, `backend/core/classifier.py`, and `backend/core/analyzer.py`.

Evidence needed:

- Pipeline diagram generated from implementation details.

### 3. Gene/reference-level pooled assignment avoids forced calls

Purpose: describe the core assignment contribution.

Key points:

- Target/gRNA windows inside a gene are collapsed as evidence for that gene/reference.
- Reads are assigned only when the best gene/reference score is separated from the second best by the assignment margin.
- Reads failing the margin rule are marked ambiguous and excluded from primary denominators.

Evidence needed:

- Synthetic two-gene/two-target assignment benchmark.
- Highly similar reference stress test.

### 4. Partial-window-aware mutation classification

Purpose: explain why the read-window handling is important for amplicon or long-read edge cases.

Key points:

- Reads are tested in forward and reverse-complement orientation.
- Read windows may be X-padded when terminal sequence is not observed but the cut-site region is sufficiently covered.
- Terminal unobserved positions are not interpreted as biological deletions.

Evidence needed:

- Synthetic truncation examples showing unobserved token placement and stable indel calls.
- Reverse-complement validation.

### 5. Multi-target and multi-gRNA quantification within assigned references

Purpose: connect assignment to the biological output users need.

Key points:

- Once a read is assigned to a gene/reference, the same read can be evaluated against each target/gRNA in that gene.
- Per-target summaries include matched/aligned reads, no-indel, substitution, in-frame, and out-of-frame categories.
- Multi-target summaries are supported, but the manuscript should not claim unified multi-locus allele reconstruction.

Evidence needed:

- Same-gene multi-gRNA validation.
- Overlapping-window validation if simultaneous editing is emphasized.

### 6. Reporting, export, and validation roadmap

Purpose: position the output layer without overemphasizing unrelated web features.

Key points:

- JSON and Excel outputs summarize parameters, read flow, per-target results, and mutation groups.
- Excel export is frontend-side and saved result persistence stores final report JSON, not active job state.
- Validation is required before Results claims about accuracy, speed, cost savings, and reproducibility.

Evidence needed:

- Export/re-import validation.
- Stage 3 benchmark and failure-mode tables.

## Recommended manuscript posture

The manuscript can be positive, but it should be framed as a method and workflow whose implementation is now ready for validation, not as a fully benchmarked algorithm. The strongest current story is an architecture paper plus validation plan: pooled reads are assigned conservatively to gene/reference classes, ambiguous reads are explicitly handled, partial windows are not overcalled as deletions, and target-level outcomes are reported for multi-gRNA experiments.

The first Results draft should be written only after Stage 3 validates assignment accuracy, partial-window behavior, mutation classification, substitution policy, and export reproducibility.
