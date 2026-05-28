# CRISPR pooled/multiplexed sequencing analysis engine dossier

Stage 1 audit date: 2026-05-27

Scope: current repository code is treated as source of truth. Production code was not modified.

Notes on requested reference materials:

- `AGENTS.md`, `forAgent/README_FOR_CODEX.md`, and `forAgent/current_algorithm_notes.md` exist but are empty in this checkout.
- `forAgent/crispr_multiplexing.pptx` was inspected only as a conceptual reference.
- `forAgent/cleanfinder_reference_paper.pdf` was treated only as a reference for manuscript-level detail, not as implementation evidence.
- `forAgent/target_reference_metadata.xlsx`, `forAgent/sample_pooled.fq`, and `forAgent/expected_export_result.xlsx` were inspected as example inputs/outputs, but the current code remains the source of truth.

## A. Executive summary

The current CRISPR analysis engine is a FastAPI + Python backend pipeline invoked from an Angular analysis page. The active pooled/multiplexed path is:

1. Frontend builds a multi-reference `targets` JSON payload from manually entered genes/targets or an uploaded Excel reference template in `frontend/src/app/pages/analysis-page/analysis-page.component.ts::runAnalysis`, `downloadTemplate`, and `onTemplateUpload`.
2. Backend accepts FASTQ uploads and parameters at `backend/api.py::run_analysis_endpoint`, streams uploaded files into per-job disk folders, starts `backend/api.py::background_analysis`, and exposes job state through `backend/api.py::get_task_status`.
3. Per FASTQ file, `backend/run_local.py::process_single_file_worker` calls `backend/run_local.py::process_files_multi`.
4. FASTQ parsing is handled by `backend/core/parser.py::parse_fastq`, which returns `(sequence, phred_quality_list)` tuples and discards read names.
5. Pooled read assignment is performed by `backend/core/multi_reference_assigner.py::assign_reads_to_references`, which builds gene-level classes from all target windows and delegates eligibility/scoring to `backend/core/classifier.py::apply_gene_classification`.
6. The current primary demultiplexing unit is one gene/reference, not one gene+target/template combination. Target windows inside the same gene are evidence for the same gene, not competitors, as implemented in `backend/core/multi_reference_assigner.py::assign_reads_to_references` and `backend/core/classifier.py::apply_gene_classification`.
7. After a read is assigned to one gene, `backend/run_local.py::run_analysis_on_reads` analyzes that gene's assigned reads independently against every target/gRNA window in that gene.
8. Mutation detection uses `backend/core/analyzer.py::classify_mutation_with_alignment`, which aligns observed read windows to reference windows using Python `difflib.SequenceMatcher`, emits tokenized equal/substitute/delete/insert/unobserved operations, and classifies net indels as in-frame or out-of-frame.
9. Final results are JSON payloads consumed by Angular dashboards and optional Excel export. Excel export is frontend-side in `frontend/src/app/services/excel-export.service.ts::exportToExcel`; database persistence is handled by `frontend/src/app/services/results.service.ts::saveResult` and `backend/routers/results.py::create_result`.

The strongest manuscript-relevant novelty visible in code is pooled assignment by gene-level collapsed evidence across multiple target/gRNA windows, followed by per-target editing quantification. The most important caveat is that several comments/slides describe a fixed sequence-similarity QC filter, but the active analysis path does not apply the declared `INNER_SIMILARITY_MIN` variable in `backend/run_local.py::run_analysis_on_reads`.

## B. Repository map of CRISPR-related files

| File | Role in current CRISPR workflow | Key functions/classes |
|---|---|---|
| `frontend/src/app/app.routes.ts` | Routes `/crispr/analysis`, `/crispr/benchmark`, and `/crispr/result-viewer`. | Angular route declarations |
| `frontend/src/app/pages/analysis-page/analysis-page.component.ts` | User-facing analysis entry point; handles FASTQ selection, reference-template Excel import/export, form validation, FormData construction. | `AnalysisPageComponent::downloadTemplate`, `onTemplateUpload`, `onFileSelected`, `onFileDropped`, `runAnalysis` |
| `frontend/src/app/pages/analysis-page/analysis-page.component.html` | Analysis UI for FASTQ files, window size, Phred threshold, assignment margin, indel threshold, ambiguous/rescue toggles, genes, targets, gRNAs. | Template controls bound to `AppStateService.analysisForm` |
| `frontend/src/app/services/app-state.service.ts` | Holds analysis form defaults, result state, polling, result merging, Excel export preparation, chart image generation. | `AppStateService::initForm`, `setGenesBulk`, `runAnalysis`, `startPolling`, `handleAnalysisComplete`, `getExportData`, `exportToExcel` |
| `frontend/src/app/services/analysis.service.ts` | HTTP client for analysis and benchmark endpoints. | `AnalysisService::runAnalysisWithProgress`, `getTaskStatus` |
| `frontend/src/app/models/analysis.model.ts` | TypeScript shape for analysis results, gene results, target summaries, mutation groups, multi-target summaries. | `GeneResult`, `TargetResult`, `MutationGroup`, `MultiReferenceResponse`, `MultiTargetSummary` |
| `frontend/src/app/components/result-dashboard/result-dashboard.component.ts` | Frontend dashboard state selection, metrics, charts. | `ResultDashboardComponent::refreshDashboard`, `updateChartsForSelected`, `saveResult` |
| `frontend/src/app/components/result-dashboard/result-dashboard.component.html` | Displays gene tabs, read-flow counters, metrics, charts, summary table, and tokenized annotation rows. | Angular template |
| `frontend/src/app/services/excel-export.service.ts` | Creates Excel report and hidden metadata sheet; imports saved Excel reports. | `ExcelExportService::exportToExcel`, `buildSheet`, `importFromExcel` |
| `frontend/src/app/services/results.service.ts` | Saves/loads CRISPR results to backend persistence endpoints. | `ResultsService::saveResult`, `getMyResults`, `getResult` |
| `backend/api.py` | FastAPI analysis endpoint, upload streaming, task lifecycle, background parallel dispatch, status endpoint. | `run_analysis_endpoint`, `background_analysis`, `get_task_status`, `update_task` |
| `backend/run_local.py` | Backend orchestration for single-file and multi-reference analysis; builds final JSON payloads. | `process_single_file_worker`, `process_files_multi`, `run_analysis_on_reads`, `_unpack_analysis_result` |
| `backend/core/parser.py` | FASTQ parser using BioPython. | `parse_fastq` |
| `backend/core/multi_reference_assigner.py` | Gene-level demultiplexing from pooled reads to gene/reference buckets. | `assign_reads_to_references` |
| `backend/core/classifier.py` | Core reference preparation, cut-site/PAM finding, read orientation handling, X-padding, eligibility filtering, k-mer scoring, gene-level assignment. | `find_grna_cut_site`, `extract_window`, `_find_offset`, `_align_read_to_window`, `_xaware_anchor_check`, `is_read_usable`, `score_read_against_window`, `apply_gene_classification` |
| `backend/core/analyzer.py` | X-aware alignment tokenization and mutation classification. | `classify_mutation_with_alignment`, `align_read_to_ref_xaware` |
| `backend/core/aligner.py` | Older/legacy alignment helpers; imported by `run_local.py` but the active primary analysis path uses `classifier.py` for read extraction. | `process_read_with_anchors`, `process_read` |
| `backend/core/benchmark.py` | Classification benchmarking only; not final editing quantification. | `run_benchmark`, `classify_read` |
| `backend/routers/results.py` | Persistence endpoints for CRISPR result JSON. | `create_result`, `list_my_results`, `get_result` |
| `backend/database/models.py` | SQLAlchemy storage model for saved CRISPR results. | `CrisprResult`, `CrisprResultShare` |
| `backend/models/results.py` | Pydantic result persistence schemas. | `CrisprResultCreate`, `CrisprResultInDB` |
| `forAgent/target_reference_metadata.xlsx` | Example reference metadata workbook with columns matching frontend template. | Not production code |
| `forAgent/sample_pooled.fq` | Example pooled FASTQ; read headers contain ONT metadata, but code does not parse these fields. | Not production code |
| `forAgent/expected_export_result.xlsx` | Example exported workbook matching frontend Excel report structure. | Not production code |

## C. Full read-to-result pipeline

| Stage | Current behavior | Code evidence | Manuscript relevance |
|---|---|---|---|
| Frontend route | CRISPR analysis is served under `/crispr/analysis`. | `frontend/src/app/app.routes.ts` route to `AnalysisPageComponent` | Defines user-facing workflow for the web service manuscript. |
| FASTQ file selection | Frontend accepts `.fastq` and `.fq` in file input/drop handlers. Files are appended to `FormData` under `files`. | `frontend/src/app/pages/analysis-page/analysis-page.component.html`; `AnalysisPageComponent::onFileSelected`, `onFileDropped`, `runAnalysis` | Supports pooled sequencing upload as the starting point of the tool. |
| Reference/template metadata entry | User enters genes, reference sequences, targets, and gRNAs manually, or imports an Excel template with columns `Gene Name`, `Gene Sequence`, `Target Name`, `gRNA Sequence`. | `AnalysisPageComponent::downloadTemplate`, `onTemplateUpload`; `AppStateService::setGenesBulk` | This is where multiplex sample design is encoded for assignment. |
| Parameter entry | Frontend form parameters are `interestRegion`, `phredThreshold`, `marginPercent`, `indelPercent`, `analyzeAmbiguous`, `rescueAmbiguous`, and `rescueThreshold`. | `AppStateService::initForm`; `AnalysisPageComponent::runAnalysis` | Manuscript methods should state these adjustable parameters because they control sensitivity, confidence, and denoising. |
| Upload endpoint | Backend streams multipart files into a job directory, enforces `MAX_FILE_COUNT=100` and `MAX_TOTAL_SIZE=5GB`, parses numeric parameters, and starts background analysis. | `backend/api.py::run_analysis_endpoint` | Shows the implementation supports large pooled runs and multiple FASTQ files. |
| Task lifecycle | Backend stores task status in an in-memory/multiprocessing manager dict and polls via `/api/status/{task_id}`. | `backend/api.py::tasks`, `update_task`, `get_task_status`; `AnalysisService::getTaskStatus`; `AppStateService::startPolling` | Useful for web-service usability, but not durable computational biology evidence. |
| Parallel file processing | Each uploaded FASTQ file is processed through `ProcessPoolExecutor` workers and `process_single_file_worker`. | `backend/api.py::background_analysis`; `backend/run_local.py::process_single_file_worker` | Supports cost/time-reduction claims for batched pooled sequencing. |
| FASTQ parsing | BioPython `SeqIO.parse(..., "fastq")` extracts sequence and phred quality list. Read names/IDs are discarded. | `backend/core/parser.py::parse_fastq` | Limits per-read provenance; manuscript should not claim read-name-aware assignment. |
| Gene/target window preparation | For each gene target, gRNA/PAM is located, cut site computed, and a fixed reference window is extracted around cut site. | `backend/core/multi_reference_assigner.py::assign_reads_to_references`; `backend/core/classifier.py::find_grna_cut_site`, `extract_window` | Defines the biological locus used for assignment and edit quantification. |
| Read eligibility | For each read/window pair, the classifier tries forward and reverse-complement orientations, maps offset by gRNA or anchors, requires cut-site +/-15 bp coverage, performs X-aware anchor checks, and applies observed-base Phred threshold. | `backend/core/classifier.py::_find_offset`, `_align_read_to_window`, `_xaware_anchor_check`, `_is_read_usable_cached`, `is_read_usable` | Ensures reads contribute only when the edit-relevant region is observed with acceptable quality. |
| Gene-level demultiplexing | Each gene's score is the best score among usable target windows in that gene. Top gene and second gene are compared by margin; if the gap fails, read is ambiguous. | `backend/core/classifier.py::apply_gene_classification`; `backend/core/multi_reference_assigner.py::assign_reads_to_references` | This is the key pooled/multiplexed novelty: multiple gRNAs/targets per gene become evidence for gene assignment. |
| Per-gene read buckets | Assigned reads are copied into gene-specific `(seq, qual)` lists; ambiguous reads are excluded from normal gene buckets. | `backend/run_local.py::process_files_multi` | Separates assignment from editing quantification and controls denominators. |
| Per-target editing analysis | For each assigned gene, all targets in that gene are analyzed independently on that gene's assigned reads. | `backend/run_local.py::run_analysis_on_reads`; `process_files_multi` | Enables multiple targets/gRNAs in one pooled sample and target-specific editing rates. |
| Alignment and mutation detection | Usable reads are aligned to the reference window with `SequenceMatcher`, terminal unobserved regions are `X`, insertions/deletions/substitutions are tokenized. | `backend/core/analyzer.py::classify_mutation_with_alignment`, `align_read_to_ref_xaware` | Converts read sequences into explicit editing outcomes. |
| Classification | No indel if insertion/deletion length is zero; otherwise `net_indel % 3` determines in-frame vs out-of-frame. Substitution is tracked separately as a subset of `no_indel`. | `backend/core/analyzer.py::classify_mutation_with_alignment`; `backend/run_local.py::run_analysis_on_reads` | Directly supports manuscript reporting of unmodified, substitution, in-frame, and out-of-frame edits. |
| Mutation grouping | Reads are grouped by X-padded `read_window`; groups below `indel_threshold` percent of pre-threshold aligned reads are removed from the final denominator. | `backend/run_local.py::run_analysis_on_reads` | Denoises low-frequency events and defines final editing-rate denominators. |
| Multi-target co-editing summary | If a gene has multiple targets, per-read target evaluations are accumulated into edit-count distribution and pairwise co-editing counts. | `backend/run_local.py::run_analysis_on_reads` | Useful for multiplex/multi-gRNA manuscripts, but currently only target-level edit presence, not integrated allele phasing. |
| JSON result payload | Backend returns per-file `multi_reference_result` containing genes, assigned counts, target summaries, top groups, and debug read-flow counts. | `backend/run_local.py::process_files_multi`; `backend/api.py::background_analysis` | Main machine-readable output for downstream reporting. |
| Dashboard visualization | Angular displays gene tabs, read-flow counters, metrics, stacked bar, pie, donut, summary table, and tokenized annotation view. | `ResultDashboardComponent::refreshDashboard`, `updateChartsForSelected`; `result-dashboard.component.html` | Supports convenient reporting and visual manuscript screenshots later, but figures are not created in this stage. |
| Excel export | Frontend creates an `.xlsx` report with parameter table, read-flow summary, per-class summary, detailed target metrics, charts, sequence visualization, and hidden `.metadata` JSON for re-import. | `ExcelExportService::exportToExcel`, `buildSheet`, `importFromExcel`; `AppStateService::getExportData`, `exportToExcel` | Supports the value proposition of convenient reporting and reproducible export packages. |
| Database persistence | Saved results persist arbitrary `metadata_json` and `result_json` to `crispr_results`. | `ResultsService::saveResult`; `backend/routers/results.py::create_result`; `backend/database/models.py::CrisprResult` | Durable saved reports exist, but task/job state is temporary. |

## D. Function-level trace with file paths and function names

### Primary pooled/multiplexed web path

1. `frontend/src/app/pages/analysis-page/analysis-page.component.ts::runAnalysis`
   - Validates the Angular form and selected files.
   - Appends FASTQ files to `FormData` under `files`.
   - Appends parameters: `data_type`, `interest_region`, `phred_threshold`, `indel_threshold`, `is_multi_reference`, `assignment_margin_threshold`, `rescue_threshold`, `analyze_ambiguous`, and `rescue_ambiguous`.
   - Builds `genesPayload`: `{ gene, sequence, targets: [{ target_id, sgrna_seq, reference_seq, window_size }] }`.

2. `frontend/src/app/services/app-state.service.ts::runAnalysis`
   - Calls `AnalysisService::runAnalysisWithProgress`.
   - Starts polling when the backend returns `task_id`.

3. `frontend/src/app/services/analysis.service.ts::runAnalysisWithProgress`
   - POSTs `FormData` to `/api/analyze`.

4. `backend/api.py::run_analysis_endpoint`
   - Creates a task and job directory.
   - Streams each `UploadFile` to disk.
   - Enforces file count and total upload size.
   - Parses `targets` JSON and parameter fields.
   - Starts a background thread running `background_analysis`.

5. `backend/api.py::background_analysis`
   - Loads `genes_payload = json.loads(targets_json)`.
   - Submits each FASTQ file to `ProcessPoolExecutor` via `process_single_file_worker`.
   - Merges returned per-file `results` into final payload.
   - Updates task status to completed.

6. `backend/run_local.py::process_single_file_worker`
   - Calls `process_files_multi` for exactly one FASTQ path.
   - Removes the temporary FASTQ file after processing.

7. `backend/run_local.py::process_files_multi`
   - Clears classifier cache.
   - Parses FASTQ through `backend/core/parser.py::parse_fastq`.
   - Calls `backend/core/multi_reference_assigner.py::assign_reads_to_references`.
   - For each assigned gene bucket, fills target `reference_seq` from gene sequence if needed.
   - Calls `run_analysis_on_reads` for all targets in that gene.
   - Optionally analyzes/rescues ambiguous reads if enabled.
   - Returns `metadata` plus per-file `multi_reference_result`.

8. `backend/core/parser.py::parse_fastq`
   - Uses `Bio.SeqIO.parse(handle, "fastq")`.
   - Emits `seq = str(record.seq)` and `qual = record.letter_annotations["phred_quality"]`.

9. `backend/core/multi_reference_assigner.py::assign_reads_to_references`
   - For each gene target, calls `classifier.find_grna_cut_site` and `classifier.extract_window`.
   - Calls `classifier.apply_gene_classification` for each read.
   - Buckets reads into exactly one assigned gene, `ambiguous_reads`, or filtered count.

10. `backend/core/classifier.py::find_grna_cut_site`
    - Finds forward `gRNA + NGG`, reverse `CCN + reverse_complement(gRNA)`, or falls back to gRNA occurrence without PAM.
    - Returns strand, gRNA coordinates, cut site, PAM, and `pam_found`.

11. `backend/core/classifier.py::extract_window`
    - Creates the reference window centered on cut site using `window_size // 2` on each side and clips at reference ends.

12. `backend/core/classifier.py::is_read_usable`
    - Converts quality to tuple for caching.
    - Calls `_is_read_usable_cached`.

13. `backend/core/classifier.py::_is_read_usable_cached`
    - Tests forward read and reverse-complement read.
    - Calls `_align_read_to_window`.
    - Rejects candidates for `no_alignment`, `no_coverage`, `no_anchor`, or `quality`.
    - Selects the usable orientation with fewer unobserved `X` bases.

14. `backend/core/classifier.py::_align_read_to_window`
    - Finds read-to-window offset by gRNA or left/right anchor fallback.
    - Enforces cut-site +/-15 bp coverage.
    - Searches exact left and right anchor strings from the reference window.
    - Extracts a variable-length `observed_read`.
    - Builds a fixed/X-padded `read_window`.
    - Extracts observed quality values for Phred filtering.

15. `backend/core/classifier.py::_xaware_anchor_check`
    - Compares first and last 12 positions of `read_window` against `ref_window`, ignoring `X`.

16. `backend/core/classifier.py::score_read_against_window`
    - Uses k=10 by default.
    - Builds reference k-mer set excluding `N` and `X`.
    - Counts matching k-mers in read and reverse-complement read.
    - Returns `best_hits / len(ref_kmers)` capped at 1.0.

17. `backend/core/classifier.py::apply_gene_classification`
    - For a single-gene payload, assigns to that gene if any target window is usable.
    - For multiple genes, computes each gene's best usable target-window score.
    - Assigns only if top1-top2 score gap is greater than or equal to `margin`.
    - Otherwise returns `reason="ambiguous"`.

18. `backend/run_local.py::run_analysis_on_reads`
    - For each target, calls `classifier.find_grna_cut_site`, `classifier.extract_window`, and `classifier.is_read_usable`.
    - Counts failed reads by reason.
    - Calls `backend/core/analyzer.py::classify_mutation_with_alignment`.
    - Groups identical `read_window` strings.
    - Applies `indel_threshold` group filtering and builds target summary/top groups.
    - If multiple targets are present, builds `multi_target_summary`.

19. `backend/core/analyzer.py::classify_mutation_with_alignment`
    - Calls `align_read_to_ref_xaware`.
    - Counts insertion length, deletion length, and substitution count.
    - Computes `net_indel = insertion_length - deletion_length`.
    - Returns category, substitution flag, net indel, and alignment tokens.

20. `backend/core/analyzer.py::align_read_to_ref_xaware`
    - Uses `difflib.SequenceMatcher.get_opcodes`.
    - Converts terminal truncation deletes into `unobserved` X tokens when `left_x` or `right_x` is present.
    - Emits `equal`, `substitute`, `delete`, `insert`, and `unobserved` tokens.

21. `frontend/src/app/services/app-state.service.ts::handleAnalysisComplete`
    - Merges per-file gene results into `mergedGenes`.
    - Recomputes merged target summaries from breakdown counts.
    - Stores raw per-file results.

22. `frontend/src/app/components/result-dashboard/result-dashboard.component.ts::refreshDashboard`
    - Selects current gene and target, updates displayed metrics.

23. `frontend/src/app/components/result-dashboard/result-dashboard.component.ts::updateChartsForSelected`
    - Renders mutation distribution bar, mutation pie, and editing-efficiency donut charts.

24. `frontend/src/app/services/app-state.service.ts::getExportData`
    - Builds `Merged` and per-file scopes for Excel export.

25. `frontend/src/app/services/excel-export.service.ts::exportToExcel`
    - Writes one sheet per scope plus hidden `.metadata`.

26. `frontend/src/app/services/results.service.ts::saveResult` and `backend/routers/results.py::create_result`
    - Persist selected result packages as JSON in `crispr_results`.

### Secondary/legacy paths

- `backend/run_local.py::process_files` and `run_analysis` support non-multi-reference target analysis.
- `backend/run_local.py::run_multi_reference_analysis` appears older than `process_files_multi`; it contains a likely bug referencing `output['debug']['usable_count']`, a key not set in that object.
- `backend/run_local.py::run_demultiplex` appears legacy and currently calls `assign_reads_to_references(data, references, margin_threshold)` positionally, which passes `margin_threshold` as `phred_threshold` under the current signature.
- `backend/core/aligner.py::process_read_with_anchors` is a legacy exact-anchor extraction helper imported by `run_local.py`, but active per-read filtering/extraction in `run_analysis_on_reads` calls `classifier.is_read_usable`.
- `backend/core/benchmark.py::run_benchmark` benchmarks classification only and explicitly does not compute CRISPR indels, frameshifts, or mutation groups.

## E. Data-object map

| Object | Shape / fields | Producer | Consumer | Notes |
|---|---|---|---|---|
| FASTQ read tuple | `(seq, qual)` | `backend/core/parser.py::parse_fastq` | `assign_reads_to_references`, `run_analysis_on_reads` | Read ID/name is discarded. `qual` is BioPython phred list. |
| Frontend gene form block | `gene_name`, `gene_reference`, `geneTargets[]` | `AppStateService::initForm`, `setGenesBulk` | `AnalysisPageComponent::runAnalysis` | Manual or Excel-derived reference metadata. |
| `genesPayload` / `genes_payload` | `{ gene, sequence, targets: [{ target_id, sgrna_seq, reference_seq, window_size }] }` | `AnalysisPageComponent::runAnalysis` | `backend/api.py::background_analysis`, `process_files_multi` | No separate template class; gene sequence is the reference/template-like sequence. |
| Gene class | `gene_name -> [{ target, ref_window, sgrna_seq, cut_index_in_window }]` | `assign_reads_to_references` | `classifier.apply_gene_classification` | Target windows in one gene are evidence for that gene. |
| Cut-site info | `{ strand, grna_start, grna_end, cut_site, pam, pam_found }` | `classifier.find_grna_cut_site` | `assign_reads_to_references`, `run_analysis_on_reads` | PAM-aware when NGG/CCN is found; fallback without PAM exists. |
| Read alignment/extraction result | `{ observed_read, read_window, qual_observed, left_x, right_x, is_rc }` | `classifier._align_read_to_window`, `_is_read_usable_cached` | `run_analysis_on_reads`, `score_read_against_window` | `observed_read` is variable length; `read_window` is fixed/X-padded. |
| Demux assigned read object | `{ read_index, seq, qual, best_score }` | `assign_reads_to_references` | `process_files_multi` | Does not retain predicted target because current assignment is gene-level. |
| Demux result | `{ genes: [{ gene, assigned_reads, count, average_score }], ambiguous_reads, debug_logs }` | `assign_reads_to_references` | `process_files_multi` | `debug_logs.anchor_matched_count` is computed as `total_reads - filtered_count`, not a direct per-anchor counter. |
| Target result | `{ target_id, summary, breakdown, sgrna_seq, display_sgrna_seq, grna_start_index, ref_sequence, cut_site_index, top_groups }` | `run_analysis_on_reads` | frontend dashboard/export | Duplicate `target_id` key is present in construction but harmless in Python final dict. |
| Summary | `total_reads`, `matched_reads`, `aligned_reads`, `out_of_frame_pct`, `in_frame_pct`, `no_indel_pct`, `substitution_pct`, `modified`, `unmodified`, `read_ambiguous` | `run_analysis_on_reads` | Angular models/dashboard/export | `aligned_reads` is post-threshold denominator; `matched_reads` is pre-threshold usable/aligned count. |
| Breakdown | `out_of_frame`, `in_frame`, `no_indel`, `substitution`, `ambiguous` | `run_analysis_on_reads` | dashboard pie/export | `no_indel` is pure no-indel excluding substitution. `ambiguous` omits `fail_no_anchor` in current code. |
| Mutation group | `{ group_rank, read_inner, read_count, read_pct, classification, net_indel, tokens }` | `run_analysis_on_reads` | annotation UI/export | `read_inner` is the X-padded read window string, despite the name. |
| Alignment token | `{ type, val }` where type includes `equal`, `substitute`, `delete`, `insert`, `unobserved` | `analyzer.align_read_to_ref_xaware` | dashboard annotation/export | TypeScript model omits `unobserved`, but template handles it. |
| Multi-target summary | `total_reads`, `reads_evaluated`, edit distribution, `co_editing_matrix` | `run_analysis_on_reads` | `GeneResult.analysis_result.multi_target_summary` | Not currently prominent in dashboard/export tables. |
| Excel scope | `{ sheetName, readFlow, genes }` | `AppStateService::getExportData` | `ExcelExportService::exportToExcel`, `importFromExcel` | Hidden metadata stores params/scopes JSON. |
| Persisted CRISPR result | `title`, `metadata_json`, `result_json` | `ResultsService::saveResult` | `backend/routers/results.py::create_result`; `backend/database/models.py::CrisprResult` | Stores report data, not background job state. |

## F. Parameter table

| Parameter | Frontend default / source | Backend default / parsing | Used in | Effect | Notes |
|---|---:|---:|---|---|---|
| Window size / interest region | `90` in `AppStateService::initForm` | Sent as `window_size` inside `targets`; default fallback `90` in `run_analysis_on_reads` | `classifier.extract_window`, `multi_reference_assigner.assign_reads_to_references`, `run_analysis_on_reads` | Total reference window width centered around cut site. | Conceptual PPT says 90 bp default; current frontend matches. |
| Phred threshold | `20` in `AppStateService::initForm` | `20` in `api.py::run_analysis_endpoint`; `30` default in `process_files_multi` if called directly | `classifier.is_read_usable`, `_is_read_usable_cached`; `multi_reference_assigner.assign_reads_to_references` | Rejects reads/windows with observed-base average Phred below threshold. | Comments in `run_analysis_on_reads` mention Q10/CRISPRnano Q30, but web default is Q20. |
| Assignment margin | `10%` in `AppStateService::initForm`; converted to `0.10` in `AnalysisPageComponent::runAnalysis` | `0.02` default in `api.py::run_analysis_endpoint`; passed to `process_files_multi` | `classifier.apply_gene_classification` | Requires top gene score minus second gene score >= margin. | Conceptual PPT default says 2%; current web form default is 10%. |
| Indel threshold | `2%` in `AppStateService::initForm` | `1.0` default in `api.py::run_analysis_endpoint` and `process_files_multi` | `run_analysis_on_reads` | Removes mutation groups with read count below `aligned * threshold/100` from final denominator. | Current web form default is stricter than backend fallback. |
| Analyze ambiguous | `false` in `AppStateService::initForm` | parsed from `analyze_ambiguous`, default `false` | `process_files_multi` | If enabled, ambiguous reads are analyzed separately against each gene. | Primary output always excludes ambiguous reads from normal gene denominators. |
| Rescue ambiguous | `false` in `AppStateService::initForm` and disabled unless analyze ambiguous is true | parsed from `rescue_ambiguous`, backend fallback `true` if field absent | `process_files_multi` | If enabled together with ambiguous analysis, loosely assigns ambiguous reads to top class and keeps exact-match clusters above threshold. | Frontend always sends explicit value, so backend fallback usually does not apply. |
| Rescue threshold | `20` in `AppStateService::initForm` | `20` in `api.py::run_analysis_endpoint` | `process_files_multi` | Minimum exact read-window cluster size for ambiguous rescue. | Rescued results are separate `Gene-rescued` entries, not merged into primary. |
| Cut-site minimum flank | constant `15` | constant `15` | `classifier.CUT_SITE_MIN_FLANK`, `_align_read_to_window` | Requires read coverage of cut site +/-15 bp. | Not exposed in UI. |
| Anchor length | constant `12` | constant `12` | `classifier.ANCHOR_LEN`, `_align_read_to_window`, `_xaware_anchor_check` | Uses first/last 12 bp of reference window as anchors. | Not exposed in UI. |
| k-mer length | constant default `10` | constant default `10` | `classifier.score_read_against_window` | Scoring feature size for assignment. | Conceptual PPT example uses k=6; code uses k=10. |
| Similarity threshold | `INNER_SIMILARITY_MIN = 0.85` local variable | not actually applied | `run_analysis_on_reads` declares but does not use | None in active code. | Do not claim active fixed similarity QC unless code is changed. |
| Data type | frontend sends `single-end` | stored in metadata | `process_files_multi` metadata | No branching found in current analysis logic. | Paired-end behavior is not implemented in the audited path. |

## G. Edge-case handling table

| Edge case | Current handling | Code evidence | Manuscript implication |
|---|---|---|---|
| Two genes and two targets in one pooled file | All target windows across both genes are used for gene-level demux; each read is assigned to at most one gene if margin passes. Then each gene's assigned reads are analyzed across that gene's targets. | `multi_reference_assigner.assign_reads_to_references`; `classifier.apply_gene_classification`; `run_local.process_files_multi`; `run_local.run_analysis_on_reads` | Supports pooled/multiplexed claim, but assignment is gene-level primary classification. |
| One read containing edits relevant to two targets | If the targets are in the same assigned gene, `run_analysis_on_reads` can evaluate the same read against multiple targets and include it in `multi_target_summary` as edited at multiple targets. If targets are in different genes, primary demux assigns the read to only one gene or marks it ambiguous. | `run_local.run_analysis_on_reads` multi-target accumulator; `classifier.apply_gene_classification` | Co-editing is target-level within assigned gene, not cross-gene multi-assignment. |
| Multiple gRNAs in one sample | Multiple gRNAs are represented as multiple target objects under a gene. During demux, their windows are collapsed as evidence for the gene; during analysis, all targets are quantified independently. | `AnalysisPageComponent::runAnalysis`; `multi_reference_assigner.assign_reads_to_references`; `classifier.apply_gene_classification`; `run_analysis_on_reads` | Strong manuscript point: multi-gRNA samples can be analyzed without making same-gene targets compete during assignment. |
| Read-end template / incomplete analysis window | `_align_read_to_window` supports left-anchor-only, right-anchor-only, and offset-only extraction with `left_x`/`right_x` X padding if cut-site coverage passes. `analyzer.align_read_to_ref_xaware` marks terminal unobserved positions as `unobserved`, not biological deletions. | `classifier._align_read_to_window`; `analyzer.align_read_to_ref_xaware` | Important for long-read/noisy read-end behavior; avoids false terminal deletions. |
| Padding-aware comparison | Anchor checking ignores `X` positions; alignment converts terminal unobserved regions to `X` tokens. | `classifier._xaware_anchor_check`; `analyzer.align_read_to_ref_xaware` | Supports robust partial-read analysis; should be described carefully. |
| Highly similar templates/references | If two genes have usable windows with top scores closer than margin, read is ambiguous. If similar targets are within the same gene, they do not compete during demux. | `classifier.apply_gene_classification` | Margin controls cross-gene specificity; same-gene similarity is intentionally collapsed. |
| Ambiguous assignment | Ambiguous reads are stored in `ambiguous_reads` when gene-level margin fails. They are excluded from primary gene analysis; optional ambiguous/rescue outputs are separate. | `multi_reference_assigner.assign_reads_to_references`; `run_local.process_files_multi` | Denominators for primary target rates exclude ambiguous reads. |
| Low-quality but otherwise assignable reads | Read/window candidates with observed-base average Phred below threshold fail with reason `quality`. In demux these become filtered, not ambiguous. | `classifier._is_read_usable_cached`; `multi_reference_assigner.assign_reads_to_references` | Quality control affects assignment and target analysis denominators. |
| Reads that pass anchors but fail assignment | If usable for more than one gene but top score gap is below margin, read is ambiguous. If no usable class exists, it is filtered. | `classifier.apply_gene_classification`; `classifier.apply_gene_classification` single/multi-gene branches | Ambiguous reads are valid but not confidently assigned. |
| Reads that pass assignment but fail classification | After gene assignment, a read is retested per target. It may fail a specific target with `quality`, `no_anchor`, `no_coverage`, or `no_alignment` and not enter that target's classification denominator. If it is usable for a target, `SequenceMatcher` classification always returns a category/token list. | `run_local.run_analysis_on_reads`; `classifier.is_read_usable`; `analyzer.classify_mutation_with_alignment` | A read assigned to a gene is not guaranteed to count for every target in that gene. |
| gRNA not found in reference | Target is skipped with an error target result containing `error: "gRNA not found in reference"` and zero matched/aligned reads. | `run_local.run_analysis_on_reads`; `classifier.find_grna_cut_site` | Reference configuration errors should be validated in experiments. |
| PAM not found but gRNA found | `find_grna_cut_site` falls back to gRNA occurrence and sets `pam_found=False`; analysis still proceeds. | `classifier.find_grna_cut_site` | Manuscript should not imply strict PAM requirement unless validation enforces it. |
| Reverse-complement reads | For each window, classifier tests forward and reverse complement and chooses usable orientation with fewer X bases. | `classifier._is_read_usable_cached`; `classifier.reverse_complement` | Supports strand-normalized pooled analysis. |
| Reverse-strand gRNA in reference | `find_grna_cut_site` searches reverse complement of gRNA with upstream `CCN` PAM. `run_analysis_on_reads` keeps canonical forward `ref_window`. | `classifier.find_grna_cut_site`; `run_local.run_analysis_on_reads` | Coordinates are normalized to forward reference display. |
| Low-frequency mutation groups | Groups below `indel_threshold` percent of pre-threshold aligned reads are dropped; denominator becomes sum of passing groups. | `run_local.run_analysis_on_reads` | Defines final editing-rate denominator; must be disclosed. |
| Exact same mutation in multiple files | Frontend merged view combines top groups by `read_inner`, sums read counts, and recomputes percentages. | `AppStateService::handleAnalysisComplete` | Merged reports are frontend-derived from backend per-file results. |
| Corrupted/invalid FASTQ | No explicit content validation beyond BioPython parsing was found. Worker exceptions are caught per file in `background_analysis`, and other files continue. | `parser.parse_fastq`; `api.background_analysis` | Robustness claim should be limited to per-file exception isolation, not comprehensive FASTQ validation. |

## H. Ambiguous/unassigned read policy

### Definitions in current code

- **Filtered/unassigned**: `classifier.apply_gene_classification` returns `assigned=False, reason="filtered"` when no target window in any gene is usable. Usability can fail for `no_alignment`, `no_coverage`, `no_anchor`, or `quality` inside `classifier._is_read_usable_cached`.
- **Ambiguous**: `classifier.apply_gene_classification` returns `assigned=False, reason="ambiguous"` when at least two genes are usable but top1-top2 score gap is below `margin`.
- **Primary assigned**: a read is assigned to one `predicted_gene` only. There is no primary multi-gene assignment object.

### Retention and export policy

- `multi_reference_assigner.assign_reads_to_references` stores ambiguous read objects in `ambiguous_reads`, but filtered reads are only counted.
- `run_local.process_files_multi` reports `ambiguous_read_count` per file and sets normal gene entries to `ambiguous_excluded=True`.
- Ambiguous reads are excluded from primary per-gene/per-target denominators.
- If `analyze_ambiguous=True`, ambiguous reads are analyzed separately against every gene and emitted as `GeneName-ambiguous` entries.
- If `analyze_ambiguous=True` and `rescue_ambiguous=True`, `process_files_multi` also loosely assigns ambiguous reads to a top class without a margin check, clusters by exact X-padded read window, keeps clusters with size at least `rescue_threshold`, and emits separate `GeneName-rescued` entries.
- Rescued and ambiguous-derived outputs are not merged into normal primary genes in backend code.
- Frontend exposes separate gene tabs for normal, rescued, and ambiguous-derived entries through `AppStateService::normalGenes`, `rescuedGenes`, and `ambiguousGenes`.

### Denominator effects

- Demux ambiguous reads reduce assigned-read counts and are excluded before target-level analysis.
- Target-level `summary.total_reads` is the number of reads assigned to that gene, not total pooled FASTQ reads.
- Target-level `summary.matched_reads` is the pre-threshold usable/aligned count for that target.
- Target-level `summary.aligned_reads` is the final denominator after low-frequency mutation groups are removed.
- Target-level `summary.read_ambiguous` is `pre_threshold_aligned - post_threshold_aligned`, meaning "filtered by indel threshold" rather than demux ambiguity.

### Unclear or misleading labels

- `debug_logs.anchor_matched_count` in `assign_reads_to_references` is computed as `total_reads - filtered_count`; filtered includes more than anchor failures, so the label is not a precise anchor count.
- `breakdown.ambiguous` in `run_analysis_on_reads` sums `fail_quality + fail_no_coverage + fail_no_alignment` and omits `fail_no_anchor`; this is not a complete target-level failed-read count.
- The frontend label "Anchor Matched" uses that debug count, so manuscript read-flow diagrams should avoid treating it as a rigorously measured anchor-pair count unless this is corrected or validated.

## I. Export/output structure

### Backend JSON payload

`backend/api.py::background_analysis` returns:

```json
{
  "metadata": {
    "phred_threshold": 20,
    "indel_threshold": 2.0,
    "is_multi_reference": true,
    "total_files": 1
  },
  "results": [
    {
      "fastq_file": "sample.fastq",
      "multi_reference_result": {
        "genes": [],
        "ambiguous_read_count": 0,
        "debug": {
          "total_reads_parsed": 0,
          "phred_passed_count": 0,
          "anchor_matched_count": 0,
          "assignment_margin_threshold_used": 0.1,
          "genes": []
        }
      }
    }
  ]
}
```

Within each gene entry, `backend/run_local.py::process_files_multi` emits:

```json
{
  "gene": "GeneA",
  "assigned_read_count": 0,
  "ambiguous_excluded": true,
  "analysis_result": {
    "targets": [],
    "multi_target_summary": {}
  }
}
```

Within each target, `backend/run_local.py::run_analysis_on_reads` emits summary, breakdown, display reference/gRNA metadata, cut-site index, and `top_groups` with tokenized alignment.

### Frontend dashboard

- `ResultDashboardComponent::summaryTableData` displays gene, target, total reads, aligned reads, out-of-frame %, in-frame %, unmodified %, and substitution %.
- `ResultDashboardComponent::updateChartsForSelected` renders stacked bar, pie, and donut charts.
- `result-dashboard.component.html` displays annotation rows from `top_groups[].tokens`, including deletion, substitution, insertion, and unobserved X tokens.

### Excel export

`frontend/src/app/services/excel-export.service.ts::exportToExcel` creates one workbook with:

- one sheet per scope (`Merged` plus each FASTQ file),
- section 1: analysis parameters,
- section 2: read-flow summary,
- section 3: per-class summary,
- section 4: detailed per-gene/per-target analysis,
- reference row and top mutation group sequence visualization,
- optional embedded chart images generated by `AppStateService::generateChartImagesForExport`,
- hidden `.metadata` sheet containing JSON `{ params, scopes }` for re-import by `ExcelExportService::importFromExcel`.

No backend CSV export function and no backend Excel export function were found. Excel export is client-side only.

### Database persistence

- `frontend/src/app/services/results.service.ts::saveResult` sends `title`, `metadata_json`, and `result_json` to `/api/crispr-results`.
- `backend/routers/results.py::create_result` stores those fields in `backend/database/models.py::CrisprResult`.
- This persists final report JSON, not transient task state from `backend/api.py::tasks`.

## J. Differences between old PPT and current implementation

| Old PPT concept | Current code status | Evidence / difference |
|---|---|---|
| FASTQ input to final statistics staged pipeline | Still exists. | Implemented across `AnalysisPageComponent::runAnalysis`, `api.py::run_analysis_endpoint`, `process_files_multi`, `assign_reads_to_references`, `run_analysis_on_reads`, `ExcelExportService::exportToExcel`. |
| Strand normalization | Still exists. | `classifier._is_read_usable_cached` tests forward and RC reads; `run_analysis_on_reads` keeps canonical forward reference window. |
| gRNA/PAM/cut-site window generation | Still exists with fallback behavior. | `classifier.find_grna_cut_site` supports NGG/CCN PAM and fallback if gRNA is present without PAM. |
| First/last 12 bp anchors | Still exists, but with X-aware partial-window handling. | `classifier.ANCHOR_LEN`, `_align_read_to_window`, `_xaware_anchor_check`. |
| Phred conversion/filter | Exists. | FASTQ quality lists from `parser.parse_fastq`; `classifier.avg_phred`; observed-window quality check in `_is_read_usable_cached`. |
| Fixed sequence-similarity QC filter | Not implemented in active analysis path. | `run_analysis_on_reads` declares `INNER_SIMILARITY_MIN` but no code applies it; `classifier.score_read_against_window` is used for assignment scoring, not a separate QC gate. |
| k-mer decomposition and scoring | Exists but differs. | `classifier.score_read_against_window` uses k=10 and returns hit count divided by reference k-mer count, not the PPT's Jaccard-style intersection/union example. |
| Assignment by top target/reference with margin | Changed. | `classifier.apply_gene_classification` collapses target-window evidence by gene and compares top genes only. Same-gene targets are not competitors. |
| Old assumption of assigning a read to one gene+template combination | No longer valid for current primary path. | `multi_reference_assigner.assign_reads_to_references` emits only predicted gene buckets; `run_analysis_on_reads` later analyzes all targets within that gene. |
| Alignment after assignment | Still exists. | `analyzer.classify_mutation_with_alignment` runs after gene assignment and per-target usability checks. |
| Indel frame classification by net indel modulo 3 | Still exists. | `analyzer.classify_mutation_with_alignment`. |
| Low-frequency group filtering by indel threshold | Still exists. | `run_analysis_on_reads` filters `groups_dict` into `passed_groups_dict`. |
| Ambiguous reads retained | Partially true. | Ambiguous reads are retained in memory for optional separate analysis/rescue and count reporting; they are not included in primary result denominators. If optional analysis is off, only the count is exposed. |
| Rescue mechanism | Exists as optional code path. | `process_files_multi` loose top1 assignment plus exact `read_window` cluster threshold, emitted separately as `Gene-rescued`. |
| Final categories unmodified/substitution/in-frame/out-of-frame | Exists. | `run_analysis_on_reads` summary and `ResultDashboardComponent` charts. |
| Editing rate includes substitution | Inconsistent. | Excel chart generation treats substitution as edited in `AppStateService::generateChartImagesForExport`, while backend `summary.modified` excludes substitution and dashboard donut uses `modified`/`unmodified`. |

## K. Missing or uncertain behavior

1. Empty guidance files: `AGENTS.md`, `forAgent/README_FOR_CODEX.md`, and `forAgent/current_algorithm_notes.md` are empty. There are no additional instructions there to reconcile with the code.

2. No read-name parsing: `backend/core/parser.py::parse_fastq` discards read IDs and metadata. The ONT-style metadata visible in `forAgent/sample_pooled.fq` is not used.

3. No backend validation of FASTQ filename extension: frontend filters `.fastq`/`.fq`, but `backend/api.py::run_analysis_endpoint` accepts every multipart `UploadFile` and relies on downstream parsing.

4. No explicit FASTQ content validation layer: invalid FASTQ likely fails during `Bio.SeqIO.parse` or downstream processing. Per-file worker exceptions are isolated in `backend/api.py::background_analysis`, but specific validation messages are not implemented.

5. Similarity QC mismatch: `backend/run_local.py::run_analysis_on_reads` documents `INNER_SIMILARITY_MIN = 0.85`, but no active filter uses it.

6. `run_local.run_demultiplex` argument order appears stale: it passes `margin_threshold` as the third positional argument to `assign_reads_to_references`, whose third parameter is now `phred_threshold`.

7. `run_local.run_multi_reference_analysis` appears stale: it prints `output['debug']['usable_count']`, but no `usable_count` key is created.

8. `display_sgrna_seq` for reverse-reference targets is computed as `sgrna_seq[::-1]` in `run_analysis_on_reads`, not reverse complement. This may be a display-only issue but should be validated.

9. `cut_site_index_fixed = len(ref_window) // 2` in `run_analysis_on_reads` assumes the cut site is centered in the clipped window. If the cut site is near a reference edge and `extract_window` clips the window, the actual cut index may differ.

10. `cut_index_in_window` in `multi_reference_assigner.assign_reads_to_references` is computed using `win_size // 2` and may be inaccurate for clipped windows near reference boundaries.

11. `breakdown.ambiguous` omits `fail_no_anchor` in `run_analysis_on_reads`, so failed-read counts are not fully represented in the target breakdown.

12. `target.summary.editing_efficiency` is defined in the TypeScript model but not emitted by backend target results. Frontend merged summaries compute it as `modified / total_reads`, while dashboard donut uses `modified`/`unmodified` counts.

13. Substitution editing-rate policy is inconsistent between dashboard and export chart image generation. Backend `modified` excludes substitutions; export donut image calculation includes substitution percentage as edited.

14. Multi-target read-level details are returned from `run_analysis_on_reads` as `read_level_results`, but `_unpack_analysis_result` drops them in `process_files_multi` and only keeps `multi_target_summary`.

15. No explicit simultaneous overlapping edit reconciliation: overlapping target/gRNA windows are analyzed independently. The code can count a read as edited in multiple targets, but it does not construct one unified multi-locus allele representation.

16. No separate template object model was found. The code represents the reference/template-like sequence as `gene.sequence` or target `reference_seq`.

17. No statistical confidence intervals, replicate modeling, error model, or hypothesis testing were found in the CRISPR engine.

18. No durable analysis-job table exists in the audited path. Final saved results are persisted, but running task state is in `backend/api.py::tasks`.

## L. Recommended next validation experiments

These are recommended experiments only; no validation scripts were created in this stage.

1. Two-gene/two-target pooled assignment benchmark
   - Build a ground-truth pooled FASTQ with reads from two genes and two targets.
   - Measure correct assignment, ambiguous rate, and filtered rate under several assignment margins.
   - Validate `classifier.apply_gene_classification` gene-level collapse behavior.

2. Same-gene multi-gRNA benchmark
   - Use two or more gRNAs in one gene with partially overlapping windows.
   - Confirm same-gene targets do not compete during demux.
   - Confirm `run_analysis_on_reads` quantifies each target independently and `multi_target_summary` counts co-edited reads as expected.

3. Cross-gene highly similar reference stress test
   - Use near-identical gene/reference windows.
   - Sweep assignment margin and quantify ambiguous vs incorrect assignments.
   - This directly supports manuscript claims about ambiguity avoidance.

4. Reverse-complement orientation validation
   - Include forward and reverse-complement reads for the same edited alleles.
   - Confirm counts, tokens, and coordinates are identical after orientation normalization.
   - Specifically inspect reverse-strand gRNA display because `display_sgrna_seq` uses string reversal.

5. Read-end truncation / X-padding validation
   - Create reads missing left/right ends but covering cut-site +/-15 bp.
   - Confirm terminal missing reference bases become `unobserved` and do not inflate deletion counts.

6. Cut-site-near-reference-edge validation
   - Use gRNAs close to the start/end of the reference sequence.
   - Validate `cut_site_index` and `cut_index_in_window` are correct after clipped `extract_window`.

7. Substitution-only edits
   - Confirm substitution-only reads are classified as `no_indel` with `has_sub=True`.
   - Decide whether substitutions count as edited in manuscript metrics, then align backend/dashboard/export semantics.

8. Complex allele validation
   - Include reads with insertion plus deletion plus substitution in the same window.
   - Validate `SequenceMatcher` tokenization, net indel, and group labels.

9. Low-frequency threshold validation
   - Create groups just below, equal to, and above `indel_threshold`.
   - Confirm denominator changes and `read_ambiguous` naming are understood.

10. Ambiguous rescue validation
    - Generate ambiguous reads with exact clusters above and below `rescue_threshold`.
    - Verify rescued entries are separate and unresolved reads remain in ambiguous-derived outputs.

11. Invalid input validation
    - Test empty FASTQ, malformed FASTQ, non-FASTQ upload, missing gRNA, missing reference, lowercase/ambiguous bases.
    - Document which errors are user-facing and which are only logged.

12. Reproducibility/export validation
    - Export Excel, re-import via result viewer, and compare all summary counts and top groups to the original JSON.

## M. Draft manuscript positioning paragraph

We developed a web-based pooled CRISPR sequencing analysis engine that assigns reads from multiplexed FASTQ files to user-defined reference genes and target windows before quantifying editing outcomes per target. Unlike single-target workflows, the current implementation uses all target/gRNA windows within a gene as collapsed evidence for gene-level assignment, then applies a margin rule between the top candidate genes to avoid forcing reads from highly similar references into uncertain calls. Assigned reads are subsequently re-evaluated against each target in the selected gene, enabling multi-gRNA and multi-target editing summaries from one pooled sequencing run. The analysis normalizes forward and reverse-complement reads, uses gRNA/PAM-derived cut-site windows with anchor and X-padding logic to handle partial read coverage, classifies insertions and deletions by net frame effect, tracks substitution-only alleles separately, filters low-frequency mutation groups, and exports interactive dashboard and Excel reports. This design supports lower sequencing cost and faster reporting by allowing multiple genes, targets, and gRNAs to be analyzed from pooled reads while preserving explicit ambiguous-read accounting.
