# Stage 2 Methods architecture

Date: 2026-05-28

Scope: This is manuscript-grade Methods architecture based on the implementation described in `paper_analysis/algorithm_dossier.md` and the risk boundaries in `paper_analysis/stage1_critical_findings.md`. It separates implemented behavior from validation requirements and future work. No production code was modified.

## Overview of the implemented analysis workflow

The implemented workflow analyzes pooled CRISPR sequencing reads by first assigning reads to a gene/reference class and then quantifying editing outcomes for each target/gRNA window within the assigned class. The active web path begins with the Angular analysis page, which constructs a multi-reference target payload and submits FASTQ files and analysis parameters to the FastAPI endpoint `backend/api.py::run_analysis_endpoint`. The backend stores uploaded files in a per-job directory, starts `backend/api.py::background_analysis`, and processes each FASTQ file through `backend/run_local.py::process_single_file_worker` and `backend/run_local.py::process_files_multi`.

Within `process_files_multi`, FASTQ reads are parsed, assigned to gene/reference classes by `backend/core/multi_reference_assigner.py::assign_reads_to_references`, and then analyzed per target using `backend/run_local.py::run_analysis_on_reads`. Core reference preparation, read-orientation handling, usability filtering, X-aware window extraction, and assignment scoring are implemented in `backend/core/classifier.py`. Mutation tokenization and indel classification are implemented in `backend/core/analyzer.py`.

## Input data and reference metadata

Implemented behavior:

The workflow accepts one or more FASTQ files and a user-defined reference metadata payload. The frontend can build this metadata manually or from an Excel template. The payload passed to the backend contains gene/reference entries of the form:

```json
{
  "gene": "GeneA",
  "sequence": "REFERENCE_SEQUENCE",
  "targets": [
    {
      "target_id": "Target1",
      "sgrna_seq": "GUIDE_SEQUENCE",
      "reference_seq": "REFERENCE_SEQUENCE_OR_EMPTY",
      "window_size": 90
    }
  ]
}
```

The current implementation does not expose a separate template object model. In manuscript text, "reference" should refer to the submitted gene/reference sequence. "Template" should be avoided or explicitly defined as this submitted reference sequence unless the code is extended.

Validation or future work:

Before using "multi-template" wording, the data model should either add template identifiers or the manuscript should define template narrowly and conservatively.

## FASTQ parsing and quality extraction

Implemented behavior:

FASTQ parsing is performed by `backend/core/parser.py::parse_fastq`, which uses BioPython `SeqIO.parse(handle, "fastq")`. For each record, the parser returns the nucleotide sequence as a string and the per-base Phred quality values from `record.letter_annotations["phred_quality"]`. The output object is a tuple `(sequence, phred_quality_list)`.

The implementation discards read names and metadata. Therefore, read names, ONT metadata, barcodes, run identifiers, sample indices, and per-read tags are not used in assignment or mutation calling.

Recommended Methods wording:

> FASTQ records were parsed into sequence strings and per-base Phred quality arrays. Read identifiers were not used by the current assignment algorithm.

Avoid claiming:

- barcode-aware demultiplexing;
- read-name-aware sample assignment;
- use of ONT header metadata.

## Gene/reference and target/gRNA window construction

Implemented behavior:

For each gene/reference and each target/gRNA, `backend/core/classifier.py::find_grna_cut_site` searches for guide and PAM context. It supports forward `gRNA + NGG`, reverse `CCN + reverse_complement(gRNA)`, and a fallback mode when the gRNA is found without a PAM. The function returns strand, guide coordinates, cut-site position, PAM value, and a `pam_found` indicator.

`backend/core/classifier.py::extract_window` constructs a reference window around the cut site using the requested `window_size`, with the current web default described in the dossier as 90 bp. The extracted window is clipped at reference boundaries when the cut site is close to the start or end of the sequence.

Important limitation:

The implementation should not be described as requiring strict PAM detection because it proceeds when the gRNA is found without PAM. In addition, clipped windows near reference boundaries require targeted validation because Stage 1 identified possible cut-site index assumptions in display and assignment metadata.

## Strand and orientation normalization

Implemented behavior:

For each read/window pair, the classifier evaluates the read in both original and reverse-complement orientation. `backend/core/classifier.py::_is_read_usable_cached` calls `_align_read_to_window` for both orientations and selects a usable orientation, preferring the candidate with fewer terminal unobserved bases when both are usable.

This allows reads sequenced in either orientation to be analyzed against a canonical reference window. Reverse-strand gRNA search is supported during cut-site detection.

Validation requirement:

Forward and reverse-complement synthetic reads should be validated to confirm identical assignment, mutation categories, and display coordinates. Stage 1 flagged the reverse-strand displayed gRNA sequence as potentially using string reversal rather than reverse complement.

## Read usability filtering

Implemented behavior:

Read usability is evaluated before assignment and again during per-target analysis. A read/window candidate can fail with `no_alignment`, `no_coverage`, `no_anchor`, or `quality`.

The implemented usability checks include:

- read-to-window offset detection using gRNA, left anchor, right anchor, or fallback offset logic;
- required coverage of the cut-site neighborhood, reported in the dossier as cut site +/-15 bp;
- exact left/right anchor search using the reference-window terminal anchors;
- X-aware anchor checking through `backend/core/classifier.py::_xaware_anchor_check`, which compares terminal regions while ignoring `X` positions;
- observed-base Phred filtering over the extracted observed region.

Quality filtering is based on the average Phred value over observed bases, not over the full original read. Low-quality candidates fail as `quality`.

Recommended Methods wording:

> Candidate read-window matches were retained only when the cut-site neighborhood was observed, terminal anchor consistency passed after ignoring unobserved X positions, and the average Phred quality over observed bases met the user-specified threshold.

## Gene/reference-level assignment

Implemented behavior:

Pooled read assignment is performed by `backend/core/multi_reference_assigner.py::assign_reads_to_references`, which prepares target windows for each gene/reference and calls `backend/core/classifier.py::apply_gene_classification` for each read.

For each candidate gene/reference, the algorithm evaluates all target/gRNA windows associated with that gene. The gene score is the best score among usable windows within that gene. Scoring is performed by `backend/core/classifier.py::score_read_against_window`, which uses k-mer overlap with default k=10, excluding `N` and `X` k-mers from the reference set and taking the better score across read orientations.

For multiple candidate genes, the top gene and second gene are compared. A read is assigned to the top gene only when the score difference is greater than or equal to the assignment margin. The frontend default margin described in the dossier is 10%, while backend fallback defaults differ in direct calls. Parameter values used in validation should be explicitly recorded.

Conservative manuscript wording:

> Reads were assigned at the gene/reference level. Multiple target/gRNA windows within a gene were used as collapsed evidence for that gene rather than as competing target-level classes.

Avoid claiming:

- independent gene+target+template assignment;
- primary assignment to multiple genes;
- separate template-level classification.

## Ambiguity handling

Implemented behavior:

The implementation distinguishes filtered/unassigned reads from ambiguous reads.

Filtered/unassigned reads have no usable target window in any candidate gene/reference, typically because of alignment, coverage, anchor, or quality failure. These reads are counted but not retained as detailed objects in the primary output.

Ambiguous reads have at least two usable candidate gene/reference classes but insufficient top-score separation under the assignment margin. These reads are stored in `ambiguous_reads`, counted in the file-level output, and excluded from primary gene and target denominators.

Optional behavior:

If `analyze_ambiguous=True`, ambiguous reads are analyzed separately against each gene and emitted as separate `GeneName-ambiguous` outputs. If `rescue_ambiguous=True` as well, the code can perform a loose top-class assignment and retain exact X-padded read-window clusters above a rescue threshold. These rescued outputs are emitted separately as `GeneName-rescued` entries and are not merged into the normal primary gene result.

Recommended Methods wording:

> Reads that did not meet the gene/reference assignment margin were treated as ambiguous and excluded from primary editing denominators. Optional secondary ambiguous-read and rescued-read outputs were generated separately when enabled.

## Target-level mutation analysis

Implemented behavior:

After gene/reference assignment, `backend/run_local.py::run_analysis_on_reads` analyzes each target/gRNA window within the assigned gene independently. A read assigned to a gene is not guaranteed to contribute to every target in that gene; it must pass the target-specific usability checks for each target window.

For each usable target/read pair, the code calls `backend/core/analyzer.py::classify_mutation_with_alignment`, which aligns the observed read window to the reference window and emits tokenized mutation operations.

The per-target output includes:

- total reads assigned to the gene;
- matched reads before low-frequency group filtering;
- aligned reads after mutation-group filtering;
- counts and percentages for out-of-frame indel, in-frame indel, no-indel, and substitution categories;
- top mutation groups;
- tokenized sequence annotations;
- gRNA and cut-site display metadata.

Important denominator note:

`summary.total_reads` is the number of reads assigned to the gene, not the total pooled FASTQ read count. `summary.matched_reads` is the target-specific usable count before low-frequency filtering. `summary.aligned_reads` is the final post-filter denominator.

## X-padding and partial-window handling

Implemented behavior:

`backend/core/classifier.py::_align_read_to_window` can extract variable-length observed read sequence and build a fixed-length X-padded `read_window`. Padding occurs when the read lacks terminal portions of the expected analysis window but still covers the required cut-site neighborhood. The resulting object tracks `left_x` and `right_x`.

`backend/core/analyzer.py::align_read_to_ref_xaware` treats terminal missing positions as `unobserved` tokens rather than biological deletions when the corresponding X-padding is present. Anchor comparison also ignores X positions.

Recommended Methods wording:

> Missing terminal portions of an otherwise usable read window were represented as unobserved X positions. During mutation tokenization, terminal unobserved regions were distinguished from deletion events.

Boundary:

This does not mean every truncated read is accepted. Reads must still satisfy cut-site coverage, anchor, and quality requirements.

## Mutation classification

Implemented behavior:

`backend/core/analyzer.py::classify_mutation_with_alignment` calls `align_read_to_ref_xaware`, which uses Python `difflib.SequenceMatcher.get_opcodes` to generate alignment operations. The emitted token types include `equal`, `substitute`, `delete`, `insert`, and `unobserved`.

The classifier counts insertion length, deletion length, and substitution count. Net indel is computed as:

```text
net_indel = insertion_length - deletion_length
```

If no insertion or deletion is present, the read is categorized as no indel, with substitution tracked separately. If an indel is present, net indel modulo 3 determines in-frame versus out-of-frame classification.

Substitution policy issue:

Stage 1 identified inconsistent handling of substitution-only reads in editing-efficiency summaries. Until this is fixed, manuscript Methods should state that substitutions are tracked separately and avoid using a single unqualified "editing efficiency" metric that mixes backend and export semantics.

## Grouping and low-frequency filtering

Implemented behavior:

Reads are grouped by identical X-padded `read_window`. For each group, the code stores group rank, read-window sequence, read count, percentage, classification, net indel, and alignment tokens.

Low-frequency mutation groups are filtered using `indel_threshold`, expressed as a percentage of the pre-threshold aligned read count. Groups below this threshold are excluded from the final denominator. The final `aligned_reads` count is the sum of reads in retained groups.

Recommended Methods wording:

> Identical X-padded read windows were collapsed into mutation groups. Groups below the user-specified abundance threshold were removed before calculating final per-target category percentages.

Validation requirement:

Synthetic groups just below, equal to, and above the threshold should be tested before Results claims use this filtering.

## Multi-target and multi-gRNA summaries

Implemented behavior:

When a gene contains more than one target/gRNA, `run_analysis_on_reads` can summarize edit presence across targets for reads assigned to that gene. The output can include an edit-count distribution and pairwise co-editing matrix.

Boundary:

The current implementation does not reconstruct a single unified multi-locus allele for overlapping target windows, and read-level multi-target details are not preserved in the final multi-reference output according to Stage 1. Therefore, manuscript wording should describe "multi-target summary" rather than "phased multi-target allele reconstruction."

## Output generation

Implemented behavior:

The backend returns JSON containing metadata and per-file `multi_reference_result` objects. Each per-file result includes genes, assigned read counts, target-level summaries, top mutation groups, and debug/read-flow fields.

The frontend dashboard displays gene and target summaries, read-flow counters, category charts, and tokenized sequence annotations. Excel export is implemented in `frontend/src/app/services/excel-export.service.ts::exportToExcel`, which creates a workbook with analysis parameters, read-flow summary, per-class summary, detailed per-gene/per-target analysis, optional chart images, sequence visualization, and a hidden `.metadata` sheet for re-import.

Saved result persistence stores final report JSON through `frontend/src/app/services/results.service.ts::saveResult` and `backend/routers/results.py::create_result`. This is durable result persistence, not durable active job tracking.

## Methods wording to avoid until code or validation changes

Avoid these statements in the current manuscript:

- "The method performs validated multi-template assignment" unless template is explicitly redefined or implemented as a first-class object.
- "All uncertain reads are rescued" because primary ambiguous reads are excluded and rescue is optional and separate.
- "The method performs barcode-aware demultiplexing" because read names and barcodes are not used.
- "A fixed 85% sequence similarity threshold filters reads" because this variable is not active.
- "PAM detection is mandatory" because gRNA-only fallback exists.
- "Editing efficiency includes substitutions" until substitution policy is unified.
- "The method reconstructs phased multi-locus alleles" because current multi-target summaries do not provide unified allele phasing.

## Implementation limitations to disclose

The manuscript should disclose, in Methods or Discussion:

- assignment is gene/reference-level;
- ambiguous reads are excluded from primary denominators;
- read IDs are not used;
- final saved reports are persistent but active job state is transient;
- validation is needed for clipped windows, reverse-strand display, substitution policy, low-frequency filtering, and export round-trip consistency;
- no statistical confidence intervals or replicate modeling are currently implemented.
