# Stage 2.5 targeted cleanup plan

Date: 2026-05-28

Scope: Fix only implementation inconsistencies that affect manuscript claims, validation denominators, or output interpretation. No new scientific features, no template-level assignment, no cross-gene co-edit phasing, and no unified overlapping-allele reconstruction.

## Planned cleanup items

| Issue | Affected files/functions | Proposed change | Risk level | Production code modified? | Expected tests |
|---|---|---|---|---|---|
| Substitution policy inconsistent across backend, dashboard, and Excel export. | `backend/run_local.py::run_analysis_on_reads`; `frontend/src/app/services/app-state.service.ts::handleAnalysisComplete`, `generateChartImagesForExport`; `frontend/src/app/components/result-dashboard/result-dashboard.component.ts`; `frontend/src/app/components/result-dashboard/result-dashboard.component.html`; `frontend/src/app/services/excel-export.service.ts`; `frontend/src/app/models/analysis.model.ts` | Adopt conservative policy: substitutions are a separate category. Backend `modified` remains indel-only, `unmodified` becomes pure no-indel, `substitution` remains separate; add explicit summary fields for substitution policy and indel editing efficiency. Dashboard/export charts should not merge substitutions into edited or unmodified categories. | Medium | Yes | Backend synthetic substitution-only test; frontend build/type check. |
| Inactive `INNER_SIMILARITY_MIN` variable/comment implies nonexistent QC. | `backend/run_local.py::run_analysis_on_reads` docstring and local variable | Remove the inactive variable and rewrite comments so no fixed similarity QC is implied. Do not implement a new similarity filter in this stage. | Low | Yes | `rg INNER_SIMILARITY_MIN backend/run_local.py` should return no active reference. |
| Clipped-window cut-site index assumes `len(ref_window)//2`. | `backend/core/classifier.py`; `backend/core/multi_reference_assigner.py::assign_reads_to_references`; `backend/run_local.py::run_analysis_on_reads`; ambiguous rescue classifier-class construction | Add low-risk helpers to compute reference window bounds and cut-site offset from actual clipped start. Use the helper for assignment metadata and display metadata. Keep existing `cut_site_index` field for compatibility while making it consistent with assignment. | Medium | Yes | Unit test for target near reference edge verifies cut-site offset equals `cut_site - window_start` in both assignment classes and target output. |
| Reverse-strand `display_sgrna_seq` uses simple reversal. | `backend/run_local.py::run_analysis_on_reads` | Use biological reverse complement for reverse-strand display. | Low | Yes | Unit test with reverse-strand gRNA verifies display sequence equals reverse complement, not string reversal. |
| Target-level failure accounting omits `fail_no_anchor` and overloads `breakdown.ambiguous`. | `backend/run_local.py::run_analysis_on_reads`; `frontend/src/app/models/analysis.model.ts` | Add explicit `failure_reasons`, `failed_reads`, and `low_frequency_filtered` fields. Preserve `breakdown.ambiguous` for backward compatibility but make it equal total target-level failed reads including `fail_no_anchor`. | Medium | Yes | Unit test with an unusable read verifies `fail_no_anchor` is represented and total failed count matches breakdown. |
| `anchor_matched_count` is not a true anchor-matched count. | `backend/core/multi_reference_assigner.py::assign_reads_to_references`; `backend/run_local.py`; `frontend/src/app/models/analysis.model.ts`; `frontend/src/app/services/app-state.service.ts`; `frontend/src/app/services/excel-export.service.ts` | Preserve legacy `anchor_matched_count` for compatibility. Add clearer `usable_for_assignment_count` and `assignment_filtered_count` fields. Prefer the clearer field for export/read-flow labels while accepting old files. | Low-Medium | Yes | Unit test verifies new debug fields exist and legacy count remains equal for compatibility. |
| Validation metadata would help Stage 3 reproducibility. | `backend/run_local.py::process_files_multi`; `backend/api.py::background_analysis` | Add low-risk metadata fields: code version if available, input filenames, threshold settings, gene IDs, and target IDs. Avoid expensive or mandatory git dependency. | Low | Yes | Unit test verifies metadata contains parameters, input filenames, genes, targets, and code version field. |

## Deliberately out of scope

- No template-level assignment model.
- No cross-gene co-editing or cross-gene multi-assignment.
- No unified overlapping-target allele reconstruction.
- No new similarity QC filter.
- No broad UI redesign.
- No validation script generation beyond focused tests for this cleanup.

## Expected commands

Preferred backend tests:

```bash
backend/venv/bin/python -m unittest backend.test_stage2_5_cleanup
```

Frontend type/build check:

```bash
npm run build
```

Run the frontend build from `frontend/`.
