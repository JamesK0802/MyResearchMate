import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ProjectItem } from '../../models/sequence.model';
import { SequenceWorkspacePageComponent } from './sequence-workspace-page.component';

describe('SequenceWorkspacePageComponent mobile panels', () => {
  it('only enables panels supported by the current selection', () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const selectedItem$ = new BehaviorSubject<ProjectItem | null>(null);
    const component = new SequenceWorkspacePageComponent({ selectedItem$ } as any, {} as any);

    component.setMobilePanel('viewer');
    expect(component.mobilePanel).toBe('files');
    component.setMobilePanel('details');
    expect(component.mobilePanel).toBe('files');

    selectedItem$.next({ type: 'fastq' } as ProjectItem);
    component.setMobilePanel('details');
    expect(component.canOpenDetails).toBe(false);
    expect(component.mobilePanel).toBe('viewer');

    selectedItem$.next({ type: 'sequence' } as ProjectItem);
    component.setMobilePanel('details');
    expect(component.canOpenDetails).toBe(true);
    expect(component.mobilePanel).toBe('details');

    selectedItem$.next(null);
    expect(component.mobilePanel).toBe('files');
    component.ngOnDestroy();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });
});
