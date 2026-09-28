import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { FormBuilder } from '@angular/forms';
import { AppStateService, AnalysisTab, ResultSlot } from './app-state.service';

function slot(): ResultSlot {
  return {
    genes: [], mergedGenes: [], selectedGeneIndex: 0, ambiguousReadCount: 0,
    totalMergedAmbiguous: 0, totalRawReads: 0, totalMergedRawReads: 0,
    totalPhredPassed: 0, totalMergedPhredPassed: 0, totalAnchorMatched: 0,
    totalMergedAnchorMatched: 0, allFileResults: [], lastRunParams: null,
    selectedScopeIndex: -1, isMultiReference: false, multiFileCount: 0,
    selectedRowIndex: 0, selectedTarget: null,
    metrics: { totalReads: 0, alignedReads: 0, avgOutOfFrame: 0, avgInFrame: 0, avgNoIndel: 0, avgSubstitution: 0 },
    isLoading: false, error: null, result: null,
  };
}

function tab(id: string): AnalysisTab {
  return { id, name: id, formValue: null, selectedFiles: [], illuminaPairs: [], slot: slot() };
}

describe('analysis tab isolation', () => {
  it('inherits the default reference until a barcode configuration is edited', () => {
    const zone = { run: (callback: () => void) => callback() };
    const state = new AppStateService(
      new FormBuilder(), {} as any, {} as any, {} as any, {} as any, {} as any, zone as any
    );
    state.setGenesBulk([{ geneName: 'Default gene', geneSeq: 'AACCGG', targetName: 'T1', targetSeq: 'CCGG' }]);

    state.selectReferenceConfig('file:barcode-a');
    expect(state.activeReferenceInherited).toBe(true);
    expect(state.hasCustomReferenceConfig('file:barcode-a')).toBe(false);
    expect(state.geneBlocks.at(0).get('gene_reference')?.value).toBe('AACCGG');

    state.geneBlocks.at(0).get('gene_reference')?.setValue('TTCCGG');
    expect(state.hasCustomReferenceConfig('file:barcode-a')).toBe(true);
    state.selectReferenceConfig('default');
    expect(state.geneBlocks.at(0).get('gene_reference')?.value).toBe('AACCGG');
    state.selectReferenceConfig('file:barcode-a');
    expect(state.geneBlocks.at(0).get('gene_reference')?.value).toBe('TTCCGG');

    state.useDefaultReferenceConfig('file:barcode-a');
    expect(state.hasCustomReferenceConfig('file:barcode-a')).toBe(false);
    expect(state.geneBlocks.at(0).get('gene_reference')?.value).toBe('AACCGG');
  });

  it('blocks tab creation, switching, and closing while an analysis is running', () => {
    const state = Object.create(AppStateService.prototype) as AppStateService;
    const first = tab('first');
    const second = tab('second');
    state.tabs = [first, second];
    state.activeTabId = first.id;
    state.analysisSlot = first.slot;
    state.runningAnalysisTabId = first.id;
    state.analysisForm = { getRawValue: vi.fn() } as any;

    state.addTab();
    state.selectTab(second.id);
    state.closeTab(first.id);

    expect(state.tabs).toEqual([first, second]);
    expect(state.activeTabId).toBe(first.id);
    expect(state.analysisSlot).toBe(first.slot);
  });

  it('applies a completed result to the originating slot even when another main view is active', () => {
    const state = Object.create(AppStateService.prototype) as AppStateService;
    const analysisTab = tab('analysis');
    const viewerSlot = slot();
    state.tabs = [analysisTab];
    state.activeTabId = analysisTab.id;
    state.analysisSlot = analysisTab.slot;
    state.viewerSlot = viewerSlot;
    state.activeMode = 'viewer';
    (state as any).handleAnalysisComplete = function (payload: any) {
      this.result = payload;
    };

    (state as any).applyAnalysisResultToSlot(analysisTab.slot, { id: 'finished' });

    expect(analysisTab.slot.result).toEqual({ id: 'finished' });
    expect(viewerSlot.result).toBeNull();
    expect(state.activeMode).toBe('viewer');
    expect(state.analysisSlot).toBe(analysisTab.slot);
  });

  it('merges results by sequences and preserves aliases and same-name different sequences', () => {
    const state = Object.create(AppStateService.prototype) as AppStateService;
    const analysisTab = tab('analysis');
    state.tabs = [analysisTab];
    state.activeTabId = analysisTab.id;
    state.analysisSlot = analysisTab.slot;
    state.activeMode = 'analysis';
    state.resultsUpdated$ = { next: vi.fn() } as any;

    const target = (targetId: string, sgrna: string, reads: number) => ({
      target_id: targetId,
      sgrna_seq: sgrna,
      summary: { total_reads: reads, matched_reads: reads, aligned_reads: reads },
      breakdown: { out_of_frame: 0, in_frame: 0, no_indel: reads, substitution: 0, failed: 0 },
      top_groups: []
    });
    const file = (gene: string, reference: string, targetId: string, sgrna: string) => ({
      multi_reference_result: {
        ambiguous_read_count: 0,
        debug: { total_reads_parsed: 1, phred_passed_count: 1, usable_for_assignment_count: 1 },
        genes: [{
          gene,
          reference_sequence: reference,
          assigned_read_count: 1,
          ambiguous_excluded: true,
          analysis_result: { targets: [target(targetId, sgrna, 1)] }
        }]
      }
    });

    state.handleAnalysisComplete({ results: [
      file('YCO', 'AAAA', 'T1', 'GG'),
      file('TRY', 'AAAA', 'T2', 'GG'),
      file('YCO', 'CCCC', 'T1', 'TT')
    ] });

    expect(state.mergedGenes).toHaveLength(2);
    expect(state.mergedGenes[0].gene).toBe('YCO/TRY');
    expect(state.mergedGenes[0].analysis_result.targets).toHaveLength(1);
    expect(state.mergedGenes[0].analysis_result.targets[0].target_id).toBe('T1/T2');
    expect(state.mergedGenes[0].assigned_read_count).toBe(2);
    expect(state.mergedGenes[1].gene).toBe('YCO');
    expect(state.mergedGenes[1].reference_sequence).toBe('CCCC');
  });
});
