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
  it('stores alignment inputs and restores the active view', async () => {
    const saveItem = vi.fn().mockResolvedValue(undefined);
    const component = new FastqViewerComponent({ saveItem } as any);
    component.document = document();
    component.inputWindowSeq = 'AACCGGTT';

    await component.runAlign();

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

  it('persists resetting the alignment', async () => {
    const saveItem = vi.fn().mockResolvedValue(undefined);
    const component = new FastqViewerComponent({ saveItem } as any);
    component.document = document();
    component.inputWindowSeq = 'AACCGGTT';
    await component.runAlign();

    await component.resetAlign();

    expect(component.document.alignmentState).toBeUndefined();
    expect(component.isAlignedActive).toBe(false);
    expect(saveItem).toHaveBeenCalledTimes(2);
  });

  it('renders reads in groups of ten and requests another server page only after exhausting the local page', async () => {
    const loadMoreRemoteFastqReads = vi.fn().mockImplementation(async (doc: FastqDocument) => {
      doc.reads.push({ id: 'remote-read', seq: 'ACGT', qual: [], qualString: 'IIII' });
      doc.remoteReadsHasMore = false;
      return 1;
    });
    const component = new FastqViewerComponent({ saveItem: vi.fn(), loadMoreRemoteFastqReads } as any);
    component.document = document();
    component.document.reads = Array.from({ length: 12 }, (_, index) => ({
      id: `read-${index + 1}`,
      seq: 'AACCGG',
      qual: [],
      qualString: 'IIIIII'
    }));
    component.document.remoteReadsHasMore = true;
    (component as any).initProcessedReads();

    expect(component.visibleReads).toHaveLength(10);
    await component.loadMore();
    expect(component.visibleReads).toHaveLength(12);
    expect(loadMoreRemoteFastqReads).not.toHaveBeenCalled();

    await component.loadMore();
    expect(loadMoreRemoteFastqReads).toHaveBeenCalledOnce();
    expect(component.visibleReads).toHaveLength(13);
  });

  it('exposes the full read identifier and length from a mobile read number', () => {
    const component = new FastqViewerComponent({ saveItem: vi.fn() } as any);
    const read = { id: 'full-read-name', seq: 'AACCGG', isAligned: false };

    component.showReadInfo(read);

    expect(component.selectedReadInfo).toBe(read);
    expect(component.selectedReadInfo?.seq.length).toBe(6);
  });

  it('saves remote alignment batches once and reuses cached results without realigning', async () => {
    const saveItem = vi.fn().mockResolvedValue(undefined);
    const saveRemoteAlignmentPage = vi.fn().mockResolvedValue(undefined);
    const deleteRemoteAlignment = vi.fn().mockResolvedValue(undefined);
    const component = new FastqViewerComponent({
      saveItem,
      saveRemoteAlignmentPage,
      deleteRemoteAlignment,
      fetchRemoteFastqReads: vi.fn()
    } as any);
    component.document = document();
    component.document.remoteFileId = 'remote-file';
    component.inputWindowSeq = 'AACCGGTT';

    await component.runAlign();

    expect(saveRemoteAlignmentPage).toHaveBeenCalledOnce();
    expect(component.document.alignmentState?.cacheId).toBeTruthy();
    expect(component.document.reads[0].alignment).toBeDefined();

    const reopened = new FastqViewerComponent({ saveItem } as any);
    reopened.document = component.document;
    const calculate = vi.spyOn(reopened as any, 'findAlignmentInRead');
    (reopened as any).restoreAlignmentState(component.document.alignmentState);

    expect(calculate).not.toHaveBeenCalled();
    expect(reopened.processedReads).toHaveLength(1);
  });
});
