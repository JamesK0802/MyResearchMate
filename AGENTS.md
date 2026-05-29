# AGENTS.md

## Project-level instruction for Codex

This repository contains a full web service with frontend, backend, authentication, user management, lab-note, group management, file sharing, and CRISPR analysis features.

For the current manuscript-preparation task, focus only on the CRISPR pooled/multiplexed sequencing analysis engine.

The main scientific contribution is:

- processing pooled CRISPR sequencing data,
- assigning reads to multiple possible genes, targets, templates, and gRNAs,
- handling cases where one read may contain edits relevant to more than one target,
- avoiding forced assignment of uncertain reads,
- supporting padding-aware and partial-window read handling,
- generating per-target editing outcome summaries,
- reducing sequencing cost and analysis time through pooled/multiplexed analysis.

Do not focus on unrelated web-platform features such as:
- lab notes,
- group management,
- file sharing,
- authentication,
- user permissions,
- general dashboards,

unless they directly affect CRISPR analysis reproducibility or manuscript reporting.

## Reference folder

Before starting manuscript analysis, inspect the following folder:

`forAgent/`

This folder contains:
- an old version PowerPoint describing a previous conceptual pipeline,
- a reference paper showing the desired manuscript-level detail,
- a pooled sample FASTQ file,
- a target/reference metadata Excel file,
- an expected exported result Excel file,
- notes about current algorithmic changes.

Important:
The old PowerPoint is only a conceptual reference and may not match the current implementation. The current repository code is the source of truth.

The CleanFinder paper is only a reference for the desired level of scientific description, not a description of this tool.

## Required behavior

When analyzing the CRISPR engine:

1. Identify actual code entry points.
2. Trace the full path from uploaded/input FASTQ reads to final exported CRISPR statistics.
3. Cite exact file paths, function names, classes, API endpoints, and relevant logic.
4. Do not invent algorithmic steps that are not implemented.
5. Explicitly separate:
   - implemented behavior,
   - inferred behavior,
   - missing or uncertain behavior,
   - recommended manuscript phrasing.
6. Focus especially on:
   - FASTQ parsing,
   - phred/quality filtering,
   - strand/orientation normalization,
   - anchor or seed detection,
   - padding-aware window extraction,
   - partial-window handling near read ends,
   - multi-template assignment,
   - multi-gRNA handling,
   - simultaneous or overlapping edits,
   - ambiguous read handling,
   - unassigned read handling,
   - alignment,
   - mutation calling,
   - mutation grouping,
   - classification,
   - target-level aggregation,
   - export file generation,
   - visualization data generation.

## Output location

Write all manuscript-preparation outputs under:

`paper_analysis/`

Do not overwrite production code unless explicitly instructed.

If scripts are needed for validation, benchmarking, or figure generation, place them under:

`paper_analysis/scripts/`

## Validation principle

Synthetic data can be used to validate algorithmic correctness.

The provided pooled FASTQ and metadata files can be used to demonstrate real-data behavior and edge cases.

Do not make biological claims unless supported by real data.

Do not make clinical claims.

Do not fabricate benchmark values or validation results.

## Manuscript focus

The manuscript should focus on the CRISPR analysis engine, especially pooled/multiplexed sequence analysis and cost-saving.

The manuscript should not be framed as a general web platform paper.

## Desired outputs across stages

Eventually, the following outputs are desired:

- `paper_analysis/algorithm_dossier.md`
- `paper_analysis/methods_algorithm_section.md`
- `paper_analysis/results_validation_draft.md`
- `paper_analysis/figure_plan.md`
- `paper_analysis/figure_legends.md`
- `paper_analysis/benchmark_report.md`
- `paper_analysis/tables/parameter_table.csv`
- `paper_analysis/tables/intermediate_objects_table.csv`
- `paper_analysis/tables/failure_modes.csv`
- `paper_analysis/tables/tool_comparison.csv`
- `paper_analysis/figures/`

For the first stage, only create the algorithm audit dossier unless explicitly asked to proceed.