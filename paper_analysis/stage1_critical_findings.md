# Stage 1.5 critical findings before manuscript drafting

Date: 2026-05-28

Scope: This review uses `paper_analysis/algorithm_dossier.md` as the primary Stage 1 audit record and reads the current `AGENTS.md`, `forAgent/README_FOR_CODEX.md`, and `forAgent/current_algorithm_notes.md` for instruction conflicts. Production code was not modified. No figures, validation scripts, or benchmark values were created.

Important conflict: `algorithm_dossier.md` states that `AGENTS.md`, `forAgent/README_FOR_CODEX.md`, and `forAgent/current_algorithm_notes.md` were empty in that checkout (`algorithm_dossier.md:7-12`, `algorithm_dossier.md:413-416`). They are not empty now. The current guidance files are instructions and scientific positioning notes, not implementation evidence. This conflict does not invalidate the algorithm trace by itself, but it means the dossier's reference-material note is stale. A targeted re-audit is recommended only for the high-risk items listed below, not a full repository re-audit, unless source code has changed since the Stage 1 audit.

## 1. Ten implementation facts safe to claim

These are safe as implementation claims. They are not performance or biological validation claims.

1. The current active workflow is a web-to-backend FASTQ analysis path: Angular builds a multi-reference `targets` payload, FastAPI receives uploaded FASTQ files, backend workers process files, and JSON results return to the frontend (`algorithm_dossier.md:16-28`, `algorithm_dossier.md:87-126`).

2. FASTQ parsing uses BioPython `SeqIO.parse(..., "fastq")` to extract read sequence and Phred quality arrays, while read names and read metadata are discarded (`algorithm_dossier.md:21`, `algorithm_dossier.md:70`, `algorithm_dossier.md:128-130`).

3. The primary assignment unit is gene/reference level, not gene+target/template level. Target windows under the same gene provide collapsed evidence for that gene (`algorithm_dossier.md:22-24`, `algorithm_dossier.md:171-175`, `algorithm_dossier.md:230-235`).

4. Reads are assigned to at most one primary gene, or are marked ambiguous/filtered. There is no primary multi-gene assignment object (`algorithm_dossier.md:132-135`, `algorithm_dossier.md:286-290`).

5. Multiple targets/gRNAs within an assigned gene are analyzed independently after gene assignment, enabling per-target quantification from a pooled run (`algorithm_dossier.md:74-79`, `algorithm_dossier.md:177-183`, `algorithm_dossier.md:266-268`).

6. The classifier evaluates forward and reverse-complement orientations and selects a usable orientation, supporting strand-normalized read handling (`algorithm_dossier.md:148-152`, `algorithm_dossier.md:278-279`, `algorithm_dossier.md:397-398`).

7. Read usability requires cut-site-window coverage, anchor checks, and average observed-base Phred filtering; failures include `no_alignment`, `no_coverage`, `no_anchor`, and `quality` (`algorithm_dossier.md:72`, `algorithm_dossier.md:148-160`, `algorithm_dossier.md:250`).

8. Partial windows near read ends are represented with X/unobserved padding when cut-site coverage passes, and terminal unobserved regions are not treated as biological deletions (`algorithm_dossier.md:154-164`, `algorithm_dossier.md:191-194`, `algorithm_dossier.md:269-270`).

9. Mutation classification uses `difflib.SequenceMatcher`-derived tokens, counts insertions/deletions/substitutions, and classifies net indels as in-frame or out-of-frame by modulo 3 (`algorithm_dossier.md:25`, `algorithm_dossier.md:185-194`, `algorithm_dossier.md:405-410`).

10. Excel export and saved result persistence exist, but Excel export is frontend-side and saved CRISPR results persist final report JSON, not transient job state (`algorithm_dossier.md:26`, `algorithm_dossier.md:371-390`).

## 2. Ten high-risk claims not to make yet

1. Do not claim the tool performs validated multi-template assignment if "template" means a separate object competing independently during demultiplexing. The code has no separate template object model and uses gene/reference sequence plus target windows (`algorithm_dossier.md:230`, `algorithm_dossier.md:445`).

2. Do not claim primary multi-gene or cross-reference multi-assignment. Primary assignment returns one gene, ambiguous, or filtered (`algorithm_dossier.md:132-135`, `algorithm_dossier.md:286-290`).

3. Do not claim cross-gene simultaneous edit phasing. The code can analyze multiple targets within an assigned gene, but targets from different genes are not jointly assigned or phased (`algorithm_dossier.md:267`, `algorithm_dossier.md:443`).

4. Do not claim overlapping edits are reconciled into a unified multi-locus allele. Overlapping windows are analyzed independently (`algorithm_dossier.md:441-443`).

5. Do not claim an active fixed 85% sequence-similarity QC filter. `INNER_SIMILARITY_MIN = 0.85` is declared but not used in the active path (`algorithm_dossier.md:28`, `algorithm_dossier.md:259`, `algorithm_dossier.md:401`, `algorithm_dossier.md:423`).

6. Do not claim strict PAM dependence. The implementation falls back to gRNA occurrence if PAM is absent (`algorithm_dossier.md:137-139`, `algorithm_dossier.md:276-277`, `algorithm_dossier.md:398`).

7. Do not claim read-name-aware demultiplexing, barcode-aware analysis, or ONT metadata use. FASTQ record names are discarded (`algorithm_dossier.md:70`, `algorithm_dossier.md:228`, `algorithm_dossier.md:417`).

8. Do not claim robust invalid-input validation. Frontend extension filtering exists, but backend content validation is limited and worker exceptions are only isolated per file (`algorithm_dossier.md:282`, `algorithm_dossier.md:419-421`).

9. Do not claim editing efficiency has one consistent definition across backend, dashboard, and export until substitution handling is fixed. Substitution inclusion is inconsistent (`algorithm_dossier.md:411`, `algorithm_dossier.md:437-439`).

10. Do not claim durable job tracking or resumable analysis. Final report JSON can be saved, but running task state is transient (`algorithm_dossier.md:68`, `algorithm_dossier.md:386-390`, `algorithm_dossier.md:449`).

## 3. Claim-support table

| Manuscript claim | Current code support | Evidence from algorithm_dossier | Risk level | Recommended wording |
|---|---|---|---|---|
| The tool analyzes pooled FASTQ files against user-defined genes and target/gRNA windows. | Supported as implementation behavior. | `algorithm_dossier.md:16-28`, `algorithm_dossier.md:61-83` | Low | "The implementation accepts pooled FASTQ input and user-defined gene, target, and gRNA metadata, then reports per-target outcomes." |
| The algorithm performs multi-template assignment. | Partially supported only if "template" is used loosely for gene/reference sequence. No separate template object exists. | `algorithm_dossier.md:230`, `algorithm_dossier.md:445` | High | Avoid "multi-template assignment" unless code is changed or term is explicitly defined as gene/reference-level assignment. |
| The algorithm performs multi-reference pooled assignment. | Supported if "reference" means gene/reference sequence and primary assignment is gene-level. | `algorithm_dossier.md:22-24`, `algorithm_dossier.md:73`, `algorithm_dossier.md:266` | Medium | "gene/reference-level pooled read assignment using target-window evidence." |
| Multiple gRNAs in the same gene can be analyzed without making same-gene targets compete during demultiplexing. | Supported. | `algorithm_dossier.md:23-24`, `algorithm_dossier.md:268`, `algorithm_dossier.md:403-404` | Low | "Target/gRNA windows within a gene are collapsed for gene assignment and quantified independently afterward." |
| Ambiguous reads are not force-assigned to a primary gene. | Supported for cross-gene top-score ties within the margin. | `algorithm_dossier.md:171-175`, `algorithm_dossier.md:271-272`, `algorithm_dossier.md:286-300` | Low | "Reads with insufficient separation between top gene scores are marked ambiguous and excluded from primary denominators." |
| The method handles partial read windows near read ends. | Supported as X-padding/unobserved terminal handling when cut-site coverage is sufficient. | `algorithm_dossier.md:154-164`, `algorithm_dossier.md:191-194`, `algorithm_dossier.md:269-270` | Low | "Partial windows are retained when the cut-site region is covered; missing terminal positions are represented as unobserved." |
| The method robustly handles all truncated reads. | Not fully supported; cut-site +/-15 bp coverage is still required. | `algorithm_dossier.md:156`, `algorithm_dossier.md:256`, `algorithm_dossier.md:269` | Medium | "The implementation supports partial terminal windows subject to a cut-site coverage requirement." |
| The method performs quality filtering. | Supported. | `algorithm_dossier.md:70`, `algorithm_dossier.md:148-160`, `algorithm_dossier.md:250`, `algorithm_dossier.md:400` | Low | "Observed read-window bases are filtered by average Phred threshold." |
| The method produces per-target editing outcome summaries. | Supported. | `algorithm_dossier.md:177-183`, `algorithm_dossier.md:236-241`, `algorithm_dossier.md:363-369` | Low | "For each target, the tool reports matched/aligned read counts and editing categories." |
| The method reports simultaneous or multi-target editing. | Partially supported within assigned gene through summary counts, not unified allele phasing. | `algorithm_dossier.md:79`, `algorithm_dossier.md:241`, `algorithm_dossier.md:267`, `algorithm_dossier.md:441-443` | Medium-High | "The implementation summarizes per-read edit presence across multiple targets within an assigned gene; it does not currently reconstruct unified multi-target alleles." |
| The method reduces sequencing cost and analysis time. | Plausible value proposition, but not validated by measured benchmarks in Stage 1. | `algorithm_dossier.md:69`, `algorithm_dossier.md:506-508` | High | "The pooled design is intended to reduce the number of separate sequencing runs; cost and runtime benefits should be quantified in validation." |
| The method includes benchmarked accuracy against ground truth. | Not supported yet. | `algorithm_dossier.md:451-504` | High | Do not claim until validation experiments are run. |
| The export is reproducible and re-importable. | Partially supported by hidden metadata and import path; exact round-trip equality still needs validation. | `algorithm_dossier.md:371-384`, `algorithm_dossier.md:503-504` | Medium | "Excel exports include hidden metadata for re-import; round-trip consistency will be validated." |
| The workflow provides durable result persistence. | Supported for final saved result JSON only, not job state. | `algorithm_dossier.md:386-390`, `algorithm_dossier.md:449` | Medium | "Final report JSON can be persisted; active analysis job state is transient." |
| The method uses a fixed similarity cutoff for inner-window QC. | Not supported. | `algorithm_dossier.md:28`, `algorithm_dossier.md:259`, `algorithm_dossier.md:401`, `algorithm_dossier.md:423` | High | Do not claim. If needed, implement or remove from methods. |

## 4. Code issues to fix before validation or manuscript submission

| Issue | Why it matters for manuscript | Evidence from algorithm_dossier | Suggested fix priority |
|---|---|---|---|
| Stale statement in dossier that guidance files were empty. | Current manuscript instructions are now present; the dossier should not imply missing guidance. | `algorithm_dossier.md:9`, `algorithm_dossier.md:415` | Documentation fix before manuscript drafting. |
| `INNER_SIMILARITY_MIN = 0.85` is declared but not applied. | Methods must not describe a nonexistent QC gate; validation could misinterpret read filtering. | `algorithm_dossier.md:259`, `algorithm_dossier.md:401`, `algorithm_dossier.md:423` | High. Either implement the filter with tests or remove/rename the variable and comments. |
| Reverse-strand `display_sgrna_seq` uses string reversal instead of reverse complement. | Displayed gRNA sequence could be scientifically misleading. | `algorithm_dossier.md:429`, `algorithm_dossier.md:470-473` | High before figures/export screenshots. |
| Cut-site index assumes centered clipped windows. | Near-reference-edge targets may show wrong cut-site positions and mutation visualization. | `algorithm_dossier.md:431-433`, `algorithm_dossier.md:479-481` | High if edge targets are possible in validation. |
| `breakdown.ambiguous` omits `fail_no_anchor`. | Read-flow/failure-mode tables may undercount target-level failures. | `algorithm_dossier.md:238`, `algorithm_dossier.md:312-314`, `algorithm_dossier.md:435` | High before validation read-flow reporting. |
| `anchor_matched_count` is not a true anchor-pair count. | Manuscript diagrams could incorrectly report anchor matching. | `algorithm_dossier.md:235`, `algorithm_dossier.md:312-314` | Medium-high. Rename or compute a real counter. |
| Substitution contribution to editing efficiency is inconsistent. | Results, dashboard, and export could disagree on modified percentage. | `algorithm_dossier.md:411`, `algorithm_dossier.md:437-439`, `algorithm_dossier.md:483-485` | High before Results drafting. |
| `run_demultiplex` positional call appears stale. | Legacy or CLI paths could silently use margin as Phred threshold. | `algorithm_dossier.md:220`, `algorithm_dossier.md:425` | Medium. Fix or retire legacy function. |
| `run_multi_reference_analysis` appears stale and references missing debug key. | Legacy path may fail if used for validation or scripts. | `algorithm_dossier.md:219`, `algorithm_dossier.md:427` | Medium. Fix or clearly mark unsupported. |
| `read_level_results` are dropped before final multi-reference output. | Multi-target co-editing claims cannot be deeply inspected from exported results. | `algorithm_dossier.md:241`, `algorithm_dossier.md:441` | Medium. Preserve minimal read-level target edit vector for validation outputs. |
| Backend lacks explicit FASTQ extension/content validation. | Validation and user-facing robustness claims are weak. | `algorithm_dossier.md:282`, `algorithm_dossier.md:419-421` | Medium. Add explicit validation and error reporting. |
| No separate template object model. | "Template-level" claims are semantically risky. | `algorithm_dossier.md:230`, `algorithm_dossier.md:445` | Medium. Either add template IDs or avoid template wording. |

## 5. Terminology table

| Term | Recommended definition for this project | Current implementation support | Aspirational or risky usage |
|---|---|---|---|
| Multi-template | Multiple template sequences are independently modeled and assigned. | Weak. The code does not expose a separate template object; it uses `gene.sequence` or target `reference_seq` as reference/template-like sequence (`algorithm_dossier.md:230`, `algorithm_dossier.md:445`). | Risky unless "template" is explicitly defined as the submitted gene/reference sequence, or code adds template IDs. |
| Multi-reference | Multiple user-provided reference/gene sequences are candidates for pooled read assignment. | Supported at gene/reference level (`algorithm_dossier.md:22-24`, `algorithm_dossier.md:266`). | Avoid implying independent target/template competition within a gene. |
| Multi-target | Multiple target/gRNA windows can be associated with a gene and quantified separately. | Supported within an assigned gene (`algorithm_dossier.md:75`, `algorithm_dossier.md:177-183`, `algorithm_dossier.md:268`). | Risky if used to imply cross-gene multi-target phasing or unified overlapping allele reconstruction. |
| Multi-gRNA | Multiple gRNAs are represented as multiple target objects and analyzed per target after assignment. | Supported within a gene (`algorithm_dossier.md:65`, `algorithm_dossier.md:268`). | Needs validation for overlapping windows and same-read co-editing summaries. |
| Pooled sequencing | A FASTQ contains reads from multiple genes/references/targets in one uploaded sample. | Supported as workflow framing and assignment problem (`algorithm_dossier.md:16-28`, `algorithm_dossier.md:266`). | Cost-saving claims require empirical or arithmetic validation. |
| Multiplexed sequencing | Multiple target/gRNA/reference contexts are processed from one run. | Supported as implementation framing when restricted to pooled multi-reference/gene and multi-target analysis (`algorithm_dossier.md:16-28`, `algorithm_dossier.md:506-508`). | Avoid overclaiming full multiplex barcode handling or sample-index demultiplexing; read names/barcodes are not used. |

## 6. Recommended manuscript framing

Recommended framing: **gene-level pooled read assignment with multi-target and multi-gRNA editing quantification**.

This is closest to the implementation. It acknowledges that:

- pooled FASTQ reads are assigned primarily to a gene/reference class;
- multiple target/gRNA windows within a gene are collapsed as assignment evidence;
- after gene assignment, every target in that gene is quantified independently;
- ambiguous cross-gene reads are excluded from primary denominators rather than force-assigned.

Avoid leading with "multi-template assignment" unless the manuscript defines template narrowly as the submitted reference sequence or the code adds explicit template identifiers. "Multi-reference pooled assignment" is acceptable if immediately clarified as gene/reference-level assignment. Option C from the prompt, "gene-level pooled assignment with multi-target quantification," is the safest current choice.

Suggested title-level phrase:

> Pooled CRISPR sequencing analysis by gene-level read assignment and multi-target editing quantification

Suggested methods phrase:

> Reads are assigned to a primary gene/reference class using collapsed evidence from all target/gRNA windows within that gene; assigned reads are then re-evaluated independently for each target to quantify editing outcomes.

## 7. Minimal code changes that would strengthen manuscript claims

1. Normalize terminology in data structures by adding optional stable IDs: `reference_id`, `target_id`, and, if needed, `template_id`. This would make "multi-reference" and "multi-template" claims less ambiguous.

2. Decide whether to implement or remove the inactive `INNER_SIMILARITY_MIN` filter. If implemented, expose it as a parameter or document it as a constant; if removed, remove methods-language references to it.

3. Fix reverse-strand display by using reverse complement rather than string reversal for `display_sgrna_seq`.

4. Compute cut-site index within clipped windows from actual `cut_site - window_start`, not `len(ref_window) // 2`.

5. Replace misleading read-flow labels: compute true anchor pass/fail counters or rename `anchor_matched_count` to a broader "usable_for_assignment_count" style label.

6. Include `fail_no_anchor` in target-level failed-read/breakdown accounting or report all failure reasons separately.

7. Define substitution policy once and apply it consistently in backend summaries, dashboard metrics, and Excel export. Manuscript results should state whether substitution-only reads are edited or no-indel-with-substitution.

8. Preserve a compact read-level multi-target edit vector in exported validation JSON, at least for validation mode, so simultaneous edit claims can be audited.

9. Add explicit backend FASTQ validation and clear user-facing errors for empty, malformed, non-FASTQ, and missing-quality uploads.

10. Either fix or remove legacy `run_demultiplex` and `run_multi_reference_analysis` paths before using any command-line validation workflow.

## 8. Minimal validation experiments before drafting Results

Do not report benchmark values until these are run. Synthetic data is appropriate for algorithmic correctness; real pooled FASTQ can demonstrate practical behavior and edge cases.

1. Two-gene/two-target pooled assignment benchmark.
   - Ground truth: known reads from two genes and two targets.
   - Measure: correct assignment, ambiguous rate, filtered rate, and margin sensitivity.
   - Supports: gene/reference-level pooled assignment.

2. Same-gene multi-gRNA benchmark.
   - Ground truth: one gene with at least two target/gRNA windows, including non-overlapping and overlapping cases if relevant.
   - Measure: per-target counts, co-edited read summary, and absence of same-gene target competition during assignment.
   - Supports: multi-gRNA and multi-target quantification.

3. Cross-gene similarity stress test.
   - Ground truth: highly similar reference windows across genes.
   - Measure: ambiguous-vs-incorrect assignment across margin settings.
   - Supports: "avoids forced assignment" claims.

4. Partial-window/X-padding validation.
   - Ground truth: reads truncated on left and/or right but covering cut-site +/-15 bp.
   - Measure: unobserved token placement and absence of false terminal deletions.
   - Supports: padding-aware and partial-window handling.

5. Strand/orientation validation.
   - Ground truth: forward and reverse-complement reads for identical alleles.
   - Measure: identical assignment, counts, tokenization, and displayed coordinates.
   - Supports: strand-normalized analysis.

6. Mutation classification validation.
   - Ground truth: no-indel, substitution-only, in-frame indel, out-of-frame indel, insertion+deletion, and complex alleles.
   - Measure: category, net indel, substitution flag, and group labels.
   - Supports: editing outcome classification.

7. Low-frequency threshold validation.
   - Ground truth: mutation groups just below, equal to, and above threshold.
   - Measure: group retention and denominator shifts.
   - Supports: denoising/filtering descriptions.

8. Ambiguous/rescue validation.
   - Ground truth: ambiguous reads with cluster sizes above and below rescue threshold.
   - Measure: primary exclusion, optional ambiguous tabs, and separate rescued output.
   - Supports: ambiguous read handling wording.

9. Export/re-import reproducibility validation.
   - Ground truth: generated backend JSON and exported Excel.
   - Measure: round-trip equality for parameters, summaries, target metrics, and top mutation groups.
   - Supports: reproducible reporting claims.

10. Real-data demonstration with provided `forAgent` files.
    - Input: provided pooled FASTQ, metadata Excel, and expected exported result.
    - Measure: whether current code reproduces expected structure and highlights any edge-case behavior.
    - Supports: practical manuscript examples, not broad biological claims.

## Bottom line

The manuscript should currently be written around a conservative, code-faithful contribution: **pooled CRISPR sequencing analysis using gene/reference-level read assignment, explicit ambiguity handling, partial-window-aware mutation calling, and per-target/multi-gRNA editing quantification**.

The highest-risk overclaim is "multi-template assignment" if it implies independent template-level demultiplexing or cross-gene simultaneous edit assignment. The highest-priority implementation cleanup before validation is to fix terminology/metrics inconsistencies that would directly affect Methods and Results wording: inactive similarity QC, reverse-strand gRNA display, clipped-window cut-site index, ambiguous/failure counters, and substitution editing-efficiency policy.
