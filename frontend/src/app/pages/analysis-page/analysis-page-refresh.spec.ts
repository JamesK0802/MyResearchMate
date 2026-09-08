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
});
