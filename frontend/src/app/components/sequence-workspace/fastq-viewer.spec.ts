import { describe, expect, it, vi } from 'vitest';
import { FastqDocument } from '../../models/sequence.model';
import { FastqViewerComponent } from './fastq-viewer.component';

const document = (): FastqDocument => ({
  id: 'reads',
  type: 'fastq',
  name: 'reads.fastq',
  description: '',
  reads: [{ id: 'read-1', seq: 'AACCGGTTAACC', qual: [], qualString: 'IIIIIIIIIIII' }],
  stats: { readCount: 1, avgLength: 12, minLength: 12, maxLength: 12, avgGC: 50, avgQuality: 40, lengthDistribution: {}, qualityDistribution: {} },
  createdTimestamp: 1,
  updatedTimestamp: 1
});

describe('FastqViewerComponent alignment persistence', () => {
  it('stores alignment inputs and restores the active view', () => {
    const saveItem = vi.fn().mockResolvedValue(undefined);
    const component = new FastqViewerComponent({ saveItem } as any);
    component.document = document();
    component.inputWindowSeq = 'AACCGGTT';

    component.runAlign();

    expect(component.document.alignmentState).toMatchObject({
      active: true,
      mode: 'window',
      inputWindowSeq: 'AACCGGTT',
      alignedWindowSeq: 'AACCGGTT',
      readOrder: 'aligned'
    });
    expect(saveItem).toHaveBeenCalledWith(component.document);

    const restored = new FastqViewerComponent({ saveItem } as any);
    restored.document = component.document;
    (restored as any).restoreAlignmentState(component.document.alignmentState);
    expect(restored.isAlignedActive).toBe(true);
    expect(restored.alignedWindowSeq).toBe('AACCGGTT');
  });

  it('persists resetting the alignment', () => {
    const saveItem = vi.fn().mockResolvedValue(undefined);
    const component = new FastqViewerComponent({ saveItem } as any);
    component.document = document();
    component.inputWindowSeq = 'AACCGGTT';
    component.runAlign();

    component.resetAlign();

    expect(component.document.alignmentState).toBeUndefined();
    expect(component.isAlignedActive).toBe(false);
    expect(saveItem).toHaveBeenCalledTimes(2);
  });
});
