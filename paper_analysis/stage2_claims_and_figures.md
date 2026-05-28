# Stage 2 claims, figure plan, reviewer risks, and cleanup priorities

Date: 2026-05-28

Scope: This document translates the Stage 1 audit and Stage 1.5 critical findings into a claim-risk matrix, figure plan, likely reviewer criticisms, and code cleanup priorities for Stage 3 validation. No production code, validation scripts, or figures were created.

## Claim-risk matrix

| Major claim | Status | Why | Required next step |
|---|---|---|---|
| The workflow accepts pooled FASTQ input and user-defined gene/reference, target, and gRNA metadata. | Safe now | Implemented through frontend payload construction, FastAPI upload, backend parsing, and `process_files_multi`. | Use implementation language; no performance claim. |
| FASTQ parsing extracts sequences and Phred qualities. | Safe now | `parse_fastq` uses BioPython and returns sequence plus quality arrays. | State that read IDs are not used. |
| Reads are assigned at gene/reference level using target-window evidence. | Safe now | Assignment collapses target windows within each gene and compares top gene scores. | Use "gene/reference-level assignment" wording. |
| The method avoids forced primary assignment of uncertain cross-gene reads. | Safe now | Reads below assignment margin are marked ambiguous and excluded from primary denominators. | Validate with similar-reference synthetic data before quantitative claims. |
| Same-gene multi-gRNA targets can be quantified independently after assignment. | Safe now as implementation, safe after validation for correctness | Code analyzes every target in assigned gene independently. | Validate with same-gene multi-gRNA truth set. |
| The method performs multi-template assignment. | Unsafe unless code changes or wording is qualified | No separate template object model exists. | Add template IDs/model or avoid the phrase. |
| The method performs cross-gene multi-assignment or cross-gene co-edit phasing. | Unsafe unless code changes | Primary output assigns one gene or marks ambiguous. | Treat as future work. |
| Partial terminal windows are handled with X/unobserved padding. | Safe now as implementation, safe after validation for correctness | X-padding and unobserved tokens are implemented. | Validate truncation scenarios. |
| Terminal unobserved positions are not counted as biological deletions. | Safe after validation | Implemented in X-aware alignment, but should be tested with synthetic reads. | Run partial-window validation. |
| Forward and reverse-complement reads are normalized. | Safe after validation | Code evaluates both orientations, but reverse-strand display issue was flagged. | Validate orientation and fix display issue. |
| Mutation classification reports no-indel, substitution, in-frame indel, and out-of-frame indel classes. | Safe now as implementation | Tokenization and net-indel classification are implemented. | Validate complex alleles before quantitative Results. |
| Substitutions are handled consistently in editing efficiency. | Unsafe unless code changes | Backend/dashboard/export substitution policy differs. | Define and implement one policy. |
| Low-frequency mutation groups are filtered by user threshold. | Safe now as implementation, safe after validation for correctness | Groups below `indel_threshold` are removed from final denominator. | Validate boundary cases around the threshold. |
| Excel export provides reportable per-target summaries. | Safe now as implementation | Frontend Excel export exists. | Validate export/re-import consistency before reproducibility claim. |
| The method reduces sequencing cost. | Safe after validation or arithmetic demonstration | Pooled design supports the rationale, but no measured values exist. | Provide transparent cost model or validation example. |
| The method reduces analysis time. | Safe after validation | Parallel processing exists, but runtime was not benchmarked. | Benchmark runtime against defined baseline. |
| The method has benchmarked assignment accuracy. | Safe after validation | No Stage 1 benchmark values exist. | Run synthetic truth-set validation. |
| The method is robust to invalid FASTQ input. | Unsafe unless code changes | Explicit backend content validation is limited. | Add validation and test malformed inputs. |
| The method reconstructs unified overlapping edit alleles. | Future work | Overlapping windows are analyzed independently. | Add allele-level model if needed. |
| The method supports durable resumable active jobs. | Future work | Final result JSON persists, but task state is transient. | Add persistent job table if manuscript needs this. |

## Main figure plan

| Figure | Figure title | Scientific message | Required input data | Panels | Can generate now? |
|---|---|---|---|---|---|
| Figure 1 | Pooled CRISPR sequencing analysis workflow | The method converts pooled FASTQ and reference metadata into ambiguity-aware gene/reference assignment and per-target editing summaries. | Implementation architecture from Stage 1 dossier; no validation data required. | A. pooled experiment concept; B. input metadata schema; C. FASTQ-to-assignment-to-target-analysis pipeline; D. output report types. | Can generate now as schematic, but should avoid performance claims. |
| Figure 2 | Gene/reference-level assignment with ambiguity-aware margin | Reads are assigned only when the top gene/reference score is sufficiently separated from alternatives. | Synthetic two-gene/two-target assignment data. | A. candidate target windows per gene; B. scoring and top1-top2 margin; C. assigned/ambiguous/filtered read flow; D. margin sweep after validation. | Requires validation for quantitative panels. |
| Figure 3 | Partial-window-aware mutation calling | X-padding prevents terminal unobserved sequence from being counted as deletion. | Synthetic reads with full, left-truncated, right-truncated, and reverse-complement examples. | A. full read window; B. terminal missing sequence represented as X/unobserved; C. tokenized insertion/deletion/substitution examples; D. validation counts. | Requires validation for D; schematic panels can be drafted now. |
| Figure 4 | Multi-target and multi-gRNA quantification after assignment | Assigned reads can be quantified independently across multiple targets in one gene/reference. | Synthetic same-gene multi-gRNA dataset, optionally provided pooled data. | A. same-gene target/gRNA windows; B. per-target editing categories; C. edit-count distribution; D. pairwise co-editing summary. | Requires validation; current code can support structure but data must be generated. |
| Figure 5 | Reporting and reproducibility outputs | The workflow produces per-target summaries, mutation groups, and exportable reports for pooled runs. | Validated analysis output and exported Excel. | A. JSON/result object schema; B. per-target summary table; C. mutation group annotation; D. export/re-import consistency check. | Requires export validation; UI/report schematic can be generated now. |

## Supplementary figure plan

| Figure | Figure title | Scientific message | Required input data | Panels | Can generate now? |
|---|---|---|---|---|---|
| Supplementary Figure 1 | Parameter effects on assignment and filtering | Assignment margin, Phred threshold, and indel threshold affect denominators and ambiguity. | Synthetic parameter sweep. | A. margin vs ambiguous rate; B. Phred threshold vs usable reads; C. indel threshold vs retained groups. | Requires validation. |
| Supplementary Figure 2 | Reverse-complement orientation validation | Forward and reverse-complement reads should yield identical categories after normalization. | Synthetic orientation-paired reads. | A. read orientation examples; B. category concordance; C. coordinate/display check. | Requires validation and display fix if needed. |
| Supplementary Figure 3 | Similar-reference stress test | Ambiguity handling protects against overconfident assignment when references are highly similar. | Synthetic near-identical reference windows. | A. reference similarity design; B. score-gap distribution; C. assigned vs ambiguous outcomes. | Requires validation. |
| Supplementary Figure 4 | Low-frequency mutation group filtering | The abundance threshold changes final denominators and reported top groups. | Synthetic read groups around threshold. | A. designed group abundances; B. retained vs removed groups; C. denominator effect. | Requires validation. |
| Supplementary Figure 5 | Export round-trip consistency | Exported reports preserve key summary fields for re-import. | Backend JSON, exported Excel, re-imported result. | A. export structure; B. fields compared; C. mismatch table if any. | Requires validation. |
| Supplementary Figure 6 | Failure modes and unsupported claims | The method separates filtered, ambiguous, and unsupported cases. | Validation failure-mode table. | A. failure reason taxonomy; B. unsupported claim map; C. recommended wording. | Can draft from Stage 1.5, but empirical counts require validation. |

## Likely reviewer criticisms and responses

### Why not use existing tools?

Likely criticism:

Reviewers may ask whether the tool is novel relative to single-target CRISPR amplicon analysis tools.

Conservative response:

The manuscript should argue that the contribution is not a replacement for all single-target editing tools. The niche is pooled analysis where reads may correspond to multiple gene/reference and target/gRNA contexts. The code-supported contribution is gene/reference-level assignment using collapsed target-window evidence, ambiguity-aware exclusion of uncertain reads, and per-target quantification within assigned references.

Evidence needed:

Stage 3 should include a tool-comparison table focused on capability differences, not unsupported performance superiority.

### Is this really multi-template?

Likely criticism:

Reviewers may challenge "multi-template" if no explicit template model exists.

Conservative response:

Avoid leading with "multi-template." Use "gene/reference-level pooled assignment" and "multi-target/multi-gRNA quantification." If "template" is used, define it as the submitted reference sequence and acknowledge that independent template-level competition is not currently modeled.

Required cleanup:

Add optional `reference_id` and `template_id` only if the manuscript requires template terminology.

### How is ambiguity handled?

Likely criticism:

Reviewers may ask whether ambiguous reads are discarded, assigned to the best match, or rescued.

Conservative response:

Primary analysis does not force uncertain reads. Reads with insufficient top-score separation are marked ambiguous and excluded from primary denominators. Optional ambiguous and rescued outputs are separate and should not be mixed with primary results unless explicitly stated.

Evidence needed:

Synthetic similar-reference stress test and margin sweep.

### Is validation sufficient?

Likely criticism:

Reviewers may reject architecture-only claims without ground-truth accuracy.

Conservative response:

Stage 2 should not claim accuracy. Stage 3 must validate assignment, ambiguity, orientation, partial windows, mutation classification, thresholding, and export consistency using synthetic truth sets plus the provided pooled example.

Evidence needed:

Benchmark report with known truth labels, no fabricated values.

### What is the substitution policy?

Likely criticism:

Substitution-only reads may be biologically edited, sequencing errors, or no-indel outcomes depending on context. Reviewers may ask how they contribute to editing efficiency.

Conservative response:

The current implementation tracks substitutions separately. Until backend/dashboard/export semantics are unified, manuscript results should report substitutions as a separate category and avoid a single unqualified editing-efficiency metric.

Required cleanup:

Define whether substitution-only reads count as edited, unmodified, or separate. Apply consistently.

### Where is the runtime and cost-saving evidence?

Likely criticism:

The manuscript may claim cost-efficient pooled analysis without measurements.

Conservative response:

The implementation supports pooled processing and parallel file handling, but cost and runtime benefits require validation. The manuscript should frame cost efficiency as a design rationale until a transparent cost model or runtime benchmark is produced.

Evidence needed:

Simple cost model comparing N separate amplicon runs with one pooled run, plus measured runtime on defined input sizes.

### What is the biological relevance?

Likely criticism:

Reviewers may ask whether the tool improves biological interpretation or only reshapes reporting.

Conservative response:

The biological use case is multi-target or multi-gRNA CRISPR experiments where pooled sequencing reduces separate reactions but creates assignment ambiguity. The tool provides target-level editing summaries while preserving ambiguous-read accounting. Biological claims should be limited to datasets actually validated.

Evidence needed:

Real-data demonstration using provided pooled FASTQ and metadata, without clinical or unsupported biological conclusions.

### Are partial windows biologically safe to interpret?

Likely criticism:

Reviewers may ask whether X-padding hides true deletions or overaccepts incomplete reads.

Conservative response:

Partial windows are accepted only when cut-site coverage and anchor/quality criteria pass. Terminal unobserved positions are labeled separately and not counted as deletions. This must be validated with synthetic truncation cases.

Required cleanup:

Confirm cut-site index handling in clipped windows and report read-failure reasons accurately.

## Code cleanup required before Stage 3 validation

Priority 1: affects core manuscript claims or validation denominators.

1. Define and implement one substitution policy across backend summaries, dashboard calculations, and Excel export.

2. Fix or remove the inactive `INNER_SIMILARITY_MIN` path so validation and Methods do not describe a nonexistent QC step.

3. Fix clipped-window cut-site indexing so validation of targets near reference boundaries is reliable.

4. Fix reverse-strand `display_sgrna_seq` to use reverse complement rather than string reversal.

5. Correct target-level failure accounting so `fail_no_anchor` is represented and `breakdown.ambiguous` is not misleading.

6. Rename or recompute `anchor_matched_count` because it is not a true anchor-matched counter.

Priority 2: affects validation tooling and reproducibility.

7. Preserve compact read-level multi-target edit vectors in a validation output mode or exported JSON so co-editing claims can be audited.

8. Fix or retire stale legacy functions `run_demultiplex` and `run_multi_reference_analysis` before any CLI validation scripts use them.

9. Add explicit backend FASTQ validation and clear errors for empty, malformed, missing-quality, and non-FASTQ uploads.

10. Add stable IDs for references, targets, and optionally templates if manuscript wording needs these distinctions.

Priority 3: affects polish but should not block initial synthetic validation.

11. Update `paper_analysis/algorithm_dossier.md` or a new addendum to remove the stale statement that guidance files were empty.

12. Clarify user-facing labels for `total_reads`, `matched_reads`, `aligned_reads`, and `read_ambiguous` so report tables map cleanly to Methods denominators.

13. Add a validation-specific metadata block recording code version, parameters, input filenames, reference IDs, and threshold settings.

## Stage 3 validation readiness checklist

Before drafting Results, Stage 3 should produce:

- synthetic truth FASTQ datasets for assignment, ambiguity, partial windows, orientation, mutation classes, thresholding, and multi-target cases;
- a real-data demonstration using the provided pooled FASTQ and metadata;
- a benchmark report with exact inputs, parameters, and code version;
- tables for parameters, intermediate objects, failure modes, and tool comparison;
- export/re-import consistency checks;
- no runtime, cost, or accuracy claims without measured or transparently calculated evidence.

## Bottom line

The figure and claim strategy should make the implementation look precise rather than broader than it is. The strongest defensible story is: pooled CRISPR sequencing can be analyzed by gene/reference-level assignment, ambiguous reads can be kept out of primary target denominators, partial windows can be represented without overcalling terminal deletions, and multi-target/multi-gRNA summaries can be generated after assignment. Stage 3 should convert that architecture into validated evidence.
