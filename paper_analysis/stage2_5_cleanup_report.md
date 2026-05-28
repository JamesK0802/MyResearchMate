# Stage 2.5 cleanup report

Date: 2026-05-28

Scope: Targeted implementation cleanup before Stage 3 validation. Production code was modified only where the change directly affects manuscript claims, validation denominators, or output interpretation. No new scientific features were added.

## Files changed for Stage 2.5

Backend:

- `backend/core/classifier.py`
- `backend/core/multi_reference_assigner.py`
- `backend/run_local.py`
- `backend/api.py`
- `backend/test_stage2_5_cleanup.py`

Frontend:

- `frontend/src/app/models/analysis.model.ts`
- `frontend/src/app/services/app-state.service.ts`
- `frontend/src/app/components/result-dashboard/result-dashboard.component.ts`
- `frontend/src/app/components/result-dashboard/result-dashboard.component.html`
- `frontend/src/app/services/excel-export.service.ts`

Manuscript workflow files:

- `paper_analysis/stage2_5_cleanup_plan.md`
- `paper_analysis/stage2_5_cleanup_report.md`

Note: `git status` also showed unrelated pre-existing changes in app/lab-notebook/lab-experiment frontend files and untracked `AGENTS.md`, `forAgent/`, and `paper_analysis/`. Those unrelated files were not part of this Stage 2.5 cleanup.

## Functions changed

| File | Function or area | Change |
|---|---|---|
| `backend/core/classifier.py` | `get_window_bounds`, `cut_index_in_window`, `extract_window` | Added explicit clipped-window bounds and cut-site-offset helpers; `extract_window` now uses shared bounds helper. |
| `backend/core/multi_reference_assigner.py` | `assign_reads_to_references` | Uses `classifier.cut_index_in_window` for assignment metadata. Adds `usable_for_assignment_count` and `assignment_filtered_count` while preserving legacy `anchor_matched_count`. |
| `backend/run_local.py` | module helpers | Added `SUBSTITUTION_POLICY`, `_get_code_version`, and `_reference_metadata` for consistent reporting and validation metadata. |
| `backend/run_local.py` | `run_analysis_on_reads` | Removed inactive `INNER_SIMILARITY_MIN` wording/variable. Uses actual clipped-window cut-site index. Uses reverse complement for reverse-strand display gRNA. Separates substitution-only reads from indel editing and pure no-indel counts. Adds explicit failure reason fields. |
| `backend/run_local.py` | `process_files`, `process_files_multi`, `run_analysis`, `run_multi_reference_analysis` | Adds validation metadata and clearer debug counters. Fixes stale demux argument usage in legacy paths while preserving current scientific scope. |
| `backend/api.py` | `background_analysis` final metadata | Adds code version, input filenames, thresholds, references/target IDs, and substitution policy to API result metadata. |
| `frontend/src/app/models/analysis.model.ts` | result interfaces | Adds failure-reason fields, substitution-policy fields, reverse-strand display metadata, `unobserved` tokens, and clearer assignment debug counters. |
| `frontend/src/app/services/app-state.service.ts` | merge/export/chart preparation | Recomputes merged summaries with substitution as a separate category. Prefers `usable_for_assignment_count` when available. Export chart images no longer merge substitutions into edited or unmodified. |
| `frontend/src/app/components/result-dashboard/*` | dashboard charts/table | No-indel display no longer subtracts substitutions. Donut chart now shows indel edited, no indel, and substitution as separate categories. Read-flow label now says "Usable for Assignment". |
| `frontend/src/app/services/excel-export.service.ts` | Excel export | Read-flow table uses "Usable for Assignment"; detailed metrics include "Indel Editing %"; export-compatible read-flow type includes `usableForAssignment`. |

## Behavior before and after

### 1. Substitution policy

Before:

- Backend counted substitution-only reads as `no_indel` and reported `substitution` as a subset.
- Backend `modified` excluded substitutions, but `unmodified` included substitution-only reads.
- Frontend merged summaries recomputed `no_indel_pct` and `unmodified` as pure no-indel plus substitution.
- Export chart images treated substitutions as edited in the donut chart.

After:

- Substitution-only reads are reported as a separate category.
- `summary.modified` and `summary.editing_efficiency` are indel-only: out-of-frame plus in-frame.
- `summary.unmodified` and `summary.no_indel_pct` are pure no-indel only.
- `summary.substitution_reads`, `summary.substitution_pct`, and `summary.substitution_policy` make substitution handling explicit.
- Dashboard and Excel charts represent substitutions separately rather than silently merging them into edited or unmodified groups.

Manuscript wording after cleanup:

> Substitution-only reads were tracked as a separate outcome category and were not included in indel editing efficiency.

### 2. Inactive similarity QC

Before:

- `run_analysis_on_reads` documented an inner-region sequence-similarity filter and declared `INNER_SIMILARITY_MIN = 0.85`, but no active filter used it.

After:

- The inactive variable and misleading Methods-style wording were removed.
- No new similarity filter was implemented.

Manuscript wording after cleanup:

> Do not claim a fixed 85% sequence-similarity QC step. Assignment scoring still uses k-mer evidence, but no separate fixed similarity gate is active.

### 3. Clipped-window cut-site indexing

Before:

- Target display metadata used `len(ref_window) // 2`, which is wrong when the extracted window is clipped near a reference boundary.
- Assignment metadata used an equivalent half-window assumption in multiple places.

After:

- `classifier.cut_index_in_window(reference, cut_site, window_size)` computes `cut_site - actual_window_start`.
- Assignment metadata, target display metadata, and ambiguous-rescue classifier classes use the same clipped-window offset.

Manuscript wording after cleanup:

> Cut-site offsets are computed relative to the actual clipped reference window used for analysis.

### 4. Reverse-strand display gRNA

Before:

- Reverse-strand `display_sgrna_seq` used simple string reversal.

After:

- Reverse-strand `display_sgrna_seq` uses biological reverse complement.
- Target output also includes `is_rc` and `strand` metadata.

### 5. Failure accounting

Before:

- `breakdown.ambiguous` omitted `fail_no_anchor` and mixed several target-level failure meanings.
- There was no explicit per-target failure-reason object in the JSON summary.

After:

- `summary.failure_reasons` and `breakdown.failure_reasons` include `fail_no_anchor`, `fail_quality`, `fail_no_coverage`, `fail_no_alignment`, and `low_frequency_filtered`.
- `summary.failed_reads` and `breakdown.failed` expose total target-level failed reads.
- `breakdown.ambiguous` is preserved for backward compatibility but now equals target-level failed reads, including `fail_no_anchor`.

Manuscript wording after cleanup:

> Target-level failed reads are reported with explicit failure reasons. Demultiplexing ambiguity and target-level usability failure should remain separate concepts.

### 6. Assignment read-flow counter naming

Before:

- `anchor_matched_count` was calculated as `total_reads - filtered_count`, not as a strict anchor-pair count.

After:

- Legacy `anchor_matched_count` is preserved for existing frontend/import compatibility.
- New `usable_for_assignment_count` and `assignment_filtered_count` fields describe the underlying values more accurately.
- Dashboard and Excel export prefer "Usable for Assignment" wording.

### 7. Validation metadata

Before:

- Result metadata contained core thresholds but did not consistently include code version, input filenames, reference/gene IDs, target IDs, or explicit substitution policy.

After:

- Backend process and API result metadata include best-effort `code_version`, input filenames, threshold settings, gene/reference names, target IDs, and `substitution_policy`.

## Tests added

Added `backend/test_stage2_5_cleanup.py` using Python standard-library `unittest` so it can run without adding `pytest`.

Covered cases:

1. Substitution-only reads are separate from indel editing and pure no-indel.
2. Reverse-strand gRNA display uses reverse complement.
3. Clipped-window cut-site index uses actual window start.
4. Failure accounting includes `fail_no_anchor`.
5. Assignment debug preserves legacy `anchor_matched_count` and adds clearer counter names.
6. `process_files_multi` adds validation metadata.

## Tests run

Backend focused tests:

```bash
backend/venv/bin/python -m unittest backend.test_stage2_5_cleanup
```

Result:

```text
Ran 6 tests in 0.019s
OK
```

Python syntax check:

```bash
backend/venv/bin/python -m py_compile backend/run_local.py backend/core/classifier.py backend/core/multi_reference_assigner.py backend/api.py backend/test_stage2_5_cleanup.py
```

Result: passed with no output.

Frontend TypeScript check:

```bash
npx tsc -p tsconfig.app.json --noEmit
```

Result: passed with no output.

Inactive similarity check:

```bash
rg -n "INNER_SIMILARITY_MIN" backend/run_local.py
```

Result: no matches.

Full Angular build attempted:

```bash
npm run build
npx ng build --progress=false
node --trace-uncaught ./node_modules/@angular/cli/bin/ng build --progress=false
```

Result: each build command exited with code `-1` without a diagnostic after printing or starting the Angular build phase. Because no diagnostic was produced, this report does not claim the full build passed. The TypeScript compiler check did pass.

## Remaining unresolved issues

1. Full Angular production build could not be completed in this environment because the Angular build process exited with code `-1` and no diagnostic. Re-run on the normal development/deployment environment.

2. `anchor_matched_count` remains in JSON for backward compatibility, but manuscript/export language should use `usable_for_assignment_count`.

3. `breakdown.ambiguous` remains as a compatibility field. New analyses should use `failed` and `failure_reasons` for target-level failures and `ambiguous_read_count` for demultiplexing ambiguity.

4. No template-level assignment, cross-gene co-edit phasing, or unified overlapping-allele reconstruction was implemented. These remain future work.

5. Existing debug logging in backend analysis is verbose and appears in test output. This was not changed to avoid widening the cleanup scope.

## Manuscript wording changes required after cleanup

Update Stage 2 wording as follows before drafting Methods or Results:

- Replace "substitution subset of no-indel" with "substitution-only reads are reported as a separate category."
- Define "editing efficiency" as indel editing efficiency unless a broader metric is explicitly introduced later.
- Use "usable for assignment" instead of "anchor matched" in read-flow diagrams.
- State that target-level failures are reported separately from demultiplexing ambiguity.
- State that cut-site offsets are computed relative to the actual clipped analysis window.
- State that reverse-strand display gRNA is shown as the reverse complement.
- Continue avoiding any claim of a fixed 85% similarity QC gate.

## Recommended next step

Stage 3 validation can now use the cleaned output semantics. The first validation scripts should target:

- synthetic substitution-only cases;
- clipped-window edge targets;
- reverse-strand target display;
- assignment read-flow counters;
- target-level failure reason accounting;
- export/re-import consistency using the new substitution and read-flow fields.
