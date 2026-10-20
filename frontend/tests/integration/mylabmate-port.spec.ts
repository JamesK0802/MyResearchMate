import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormBuilder } from '@angular/forms';
import { AppStateService } from '../../src/app/services/app-state.service';
import { ResultDashboardComponent } from '../../src/app/components/result-dashboard/result-dashboard.component';
import { AnalysisPageComponent } from '../../src/app/pages/analysis-page/analysis-page.component';

afterEach(() => vi.unstubAllGlobals());

describe('MyLabMate integration preserved around the CasMANGO engine', () => {
  it('records the actual platform when starting an Illumina run so paired export sources remain available', () => {
    const state = new AppStateService(new FormBuilder(), {} as any, {} as any, {} as any, {} as any, {} as any, {run: (fn: any) => fn()} as any);
    state.analysisForm.patchValue({sequencingPlatform: 'illumina'});
    state.setGenesBulk([{geneName: 'Control', geneSeq: 'AACCGGTT', targetName: 'T1', targetSeq: 'CCGG'}]);
    state.illuminaPairs = [{id: 'pair', name: 'pair', r1: {name: 'pair_R1.fastq'} as File, r2: {name: 'pair_R2.fastq'} as File}];
    state.runLocalAnalysis = vi.fn();
    const page = new AnalysisPageComponent(state, {} as any);
    page.runAnalysis();
    expect(state.runLocalAnalysis).toHaveBeenCalledOnce();
    expect(state.lastRunParams.sequencingPlatform).toBe('illumina');
    expect(state.hasFastqExportSources).toBe(true);
  });
  it('routes generated reads into the existing Sequence Viewer', () => {
    const router = { navigateByUrl: vi.fn() };
    const state = new AppStateService(new FormBuilder(), {} as any, {} as any, {} as any, {} as any, router as any, {run: (fn: any) => fn()} as any);
    state.switchMainTab('workspace');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/tools/sequence-viewer');
    state.runningAnalysisTabId = state.activeTabId;
    state.switchMainTab('benchmark');
    expect(state.activeMainTab$.value).toBe('workspace');
  });

  it('uses paired Illumina sources for FASTQ export without requiring single-read files', () => {
    const state = Object.create(AppStateService.prototype) as any;
    state.activeMode = 'analysis';
    state.analysisSlot = {lastRunParams: {sequencingPlatform: 'illumina'}, selectedScopeIndex: -1};
    state.selectedFiles = [];
    const pair = {r1: {name: 'R1.fastq'}, r2: {name: 'R2.fastq'}};
    state.illuminaPairs = [pair];
    expect(state.hasFastqExportSources).toBe(true);
    expect(state.fastqExportSources()).toEqual([pair]);
    state.selectedScopeIndex = 0;
    expect(state.fastqExportSources()).toEqual([pair]);
  });

  it('saves a standalone curated baseline to My Data with exclusions retained as provenance only', async () => {
    vi.stubGlobal('prompt', () => 'Reviewed result');
    vi.stubGlobal('alert', vi.fn());
    const saveResult = vi.fn().mockResolvedValue({});
    const config = {excludedGroups: ['removed']};
    const data = {params: {}, scopes: [{sheetName: 'Merged', genes: []}]};
    const component = new ResultDashboardComponent(
      {curationConfig: config, getExportData: () => data} as any,
      {detectChanges: vi.fn()} as any, {} as any,
      {getSession: async () => ({user: {id: 'test'}})} as any, {saveResult} as any,
    );
    await component.saveCuratedView();
    const [title, metadata, stored] = saveResult.mock.calls[0];
    expect(title).toBe('Reviewed result');
    expect(metadata.curated_config).toBe(config);
    expect(stored.scopes).toEqual(data.scopes);
    expect(stored.curationConfig).toBeNull();
    expect(stored.curationHistory).toBe(config);
    expect(component.isSaving).toBe(false);
  });
});
