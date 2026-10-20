import '@angular/compiler';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AnalysisPageComponent } from './analysis-page.component';


describe('AnalysisPageComponent result rendering', () => {
  it('redraws immediately when worker results update the shared slot', () => {
    const resultsUpdated$ = new Subject<void>();
    const state = {
      resultsUpdated$,
      activateSlot: vi.fn(),
      collapseAnalysisPanels$: new Subject<void>(),
      analysisForm: { get: () => ({ value: false }) },
      geneBlocks: { valueChanges: new Subject<void>() },
    } as any;
    const cdr = { detectChanges: vi.fn() } as any;
    const component = new AnalysisPageComponent(state, cdr);

    component.ngOnInit();
    resultsUpdated$.next();

    expect(cdr.detectChanges).toHaveBeenCalledOnce();
    component.ngOnDestroy();
    resultsUpdated$.next();
    expect(cdr.detectChanges).toHaveBeenCalledOnce();
  });

  it('uses sequences as identity and joins aliases without collapsing different sequences', () => {
    const component = new AnalysisPageComponent({analysisForm: {get: () => ({value: false})}} as any, {} as any);
    const payload = (component as any).buildSequenceBasedPayload([
      { gene_name: 'YCO', gene_reference: 'AAAA', geneTargets: [{ target_id: 'T1', gRNA: 'GG' }] },
      { gene_name: 'TRY', gene_reference: 'AAAA', geneTargets: [{ target_id: 'T2', gRNA: 'GG' }] },
      { gene_name: 'YCO', gene_reference: 'CCCC', geneTargets: [{ target_id: 'T1', gRNA: 'TT' }] }
    ], 90, false, 0, 0);

    expect(payload).toHaveLength(2);
    expect(payload[0].display_gene).toBe('YCO/TRY');
    expect(payload[0].targets).toHaveLength(1);
    expect(payload[0].targets[0].target_id).toBe('T1/T2');
    expect(payload[1].sequence).toBe('CCCC');
  });
});
