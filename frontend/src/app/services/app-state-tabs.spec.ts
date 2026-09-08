import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
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
});
