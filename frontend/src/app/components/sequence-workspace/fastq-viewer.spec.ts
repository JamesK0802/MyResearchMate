import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { FastqDocument } from '../../models/sequence.model';
import { cutIndexInWindow, findGrnaCutSite } from '../../workers/core/classifier';
import { createAlignmentCacheId, FastqViewerComponent } from './fastq-viewer.component';

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
  it('creates a valid UUID when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(0)
    });
    try {
      expect(createAlignmentCacheId()).toBe('00000000-0000-4000-8000-000000000000');
    } finally {
      vi.unstubAllGlobals();
    }
  });

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

  it('uses the main analysis cut-site rule for reference and guide input', async () => {
    const spacer = 'GACTGACTGACTGACTGACT';
    const reference = `AACCGGTTAACC${spacer}TGGTTCCAAGGTTCCAAGG`;
    const component = new FastqViewerComponent({ saveItem: vi.fn().mockResolvedValue(undefined) } as any);
    component.document = document();
    component.alignMode = 'ref_target';
    component.inputRefSeq = reference;
    component.inputGrnaSeq = spacer;
    component.inputWinSize = 30;

    await component.runAlign();

    const mainToolCut = findGrnaCutSite(reference, spacer).cut_site;
    expect(component.alignedCutSiteInWindow).toBe(cutIndexInWindow(reference, mainToolCut, 30));
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
    const loadRemoteAlignmentResults = vi.fn().mockResolvedValue(1);
    const remoteReads = document().reads;
    const component = new FastqViewerComponent({
      saveItem,
      saveRemoteAlignmentPage,
      deleteRemoteAlignment,
      streamRemoteFastqReads: vi.fn(async (_document, onBatch) => onBatch(remoteReads)),
      loadRemoteAlignmentResults
    } as any);
    component.document = document();
    component.document.remoteFileId = 'remote-file';
    component.inputWindowSeq = 'AACCGGTT';

    await component.runAlign();

    expect(saveRemoteAlignmentPage).toHaveBeenCalledOnce();
    expect(component.document.alignmentState?.cacheId).toBeTruthy();
    expect(component.document.alignmentState?.cacheVersion).toBe(2);
    expect(component.document.reads[0].alignment).toBeDefined();
    expect(loadRemoteAlignmentResults).toHaveBeenCalledWith(component.document, 'aligned', true);

    await component.setAlignmentReadOrder('unaligned');
    expect(loadRemoteAlignmentResults).toHaveBeenLastCalledWith(component.document, 'unaligned', true);

    const reopened = new FastqViewerComponent({ saveItem } as any);
    reopened.document = component.document;
    const calculate = vi.spyOn(reopened as any, 'findAlignmentInRead');
    (reopened as any).restoreAlignmentState(component.document.alignmentState);

    expect(calculate).not.toHaveBeenCalled();
    expect(reopened.processedReads).toHaveLength(1);
  });

  it('streams every remote read for every alignment', async () => {
    const saveRemoteAlignmentPage = vi.fn().mockResolvedValue(undefined);
    const allReads = [
      document().reads[0],
      { id: 'read-2', seq: 'AACCGGTTAACC', qual: [], qualString: 'IIIIIIIIIIII' }
    ];
    const streamRemoteFastqReads = vi.fn(async (_document, onBatch) => onBatch(allReads));
    const component = new FastqViewerComponent({
      saveItem: vi.fn().mockResolvedValue(undefined),
      saveRemoteAlignmentPage,
      deleteRemoteAlignment: vi.fn().mockResolvedValue(undefined),
      streamRemoteFastqReads,
      loadRemoteAlignmentResults: vi.fn().mockResolvedValue(2)
    } as any);
    component.document = document();
    component.document.remoteFileId = 'remote-file';
    component.document.stats.readCount = 2;
    component.inputWindowSeq = 'AACCGGTT';

    await component.runAlign();

    expect(streamRemoteFastqReads).toHaveBeenCalledOnce();
    expect(component.document.alignmentState).toMatchObject({ processedReadCount: 2 });
    expect(saveRemoteAlignmentPage).toHaveBeenCalledOnce();
  });

  it('resets and deletes the previous cache before starting a replacement alignment', async () => {
    const oldState = {
      active: true, mode: 'window' as const, inputWindowSeq: 'OLDTARGET', inputRefSeq: '', inputGrnaSeq: '',
      inputWinSize: 90, alignedWindowSeq: 'OLDTARGET', alignedCutSiteInWindow: 4,
      readOrder: 'aligned' as const, cacheVersion: 2, cacheId: 'old-cache',
      processedReadCount: 1, alignedCount: 1, unalignedCount: 0, updatedTimestamp: 1
    };
    const sourceReads = document().reads;
    const deleteRemoteAlignment = vi.fn().mockResolvedValue(undefined);
    const saveRemoteAlignmentPage = vi.fn().mockResolvedValue(undefined);
    const component = new FastqViewerComponent({
      saveItem: vi.fn().mockResolvedValue(undefined),
      deleteRemoteAlignment,
      saveRemoteAlignmentPage,
      streamRemoteFastqReads: vi.fn(async (_document, onBatch) => onBatch(sourceReads)),
      loadRemoteAlignmentResults: vi.fn().mockResolvedValue(1)
    } as any);
    component.document = document();
    component.document.remoteFileId = 'remote-file';
    component.document.alignmentState = oldState;
    component.isAlignedActive = true;
    component.inputWindowSeq = 'AACCGGTT';

    await component.runAlign();

    expect(deleteRemoteAlignment).toHaveBeenCalledOnce();
    expect(deleteRemoteAlignment).toHaveBeenCalledWith(component.document, 'old-cache');
    expect(deleteRemoteAlignment.mock.invocationCallOrder[0]).toBeLessThan(saveRemoteAlignmentPage.mock.invocationCallOrder[0]);
    expect(component.document.alignmentState?.cacheId).not.toBe('old-cache');
  });

  it('resumes an alignment page save after a mobile connection interruption', async () => {
    const interrupted = Object.assign(new Error('Unknown Error'), { status: 0 });
    const saveRemoteAlignmentPage = vi.fn()
      .mockRejectedValueOnce(interrupted)
      .mockResolvedValue(undefined);
    const component = new FastqViewerComponent({
      saveItem: vi.fn().mockResolvedValue(undefined),
      saveRemoteAlignmentPage,
      deleteRemoteAlignment: vi.fn().mockResolvedValue(undefined),
      streamRemoteFastqReads: vi.fn(async (_document, onBatch) => onBatch(document().reads)),
      loadRemoteAlignmentResults: vi.fn().mockResolvedValue(1)
    } as any);
    component.document = document();
    component.document.remoteFileId = 'remote-file';
    component.inputWindowSeq = 'AACCGGTT';
    vi.spyOn(component as any, 'waitForAlignmentConnection').mockResolvedValue(undefined);

    await component.runAlign();

    expect(saveRemoteAlignmentPage).toHaveBeenCalledTimes(2);
    expect(component.document.alignmentState).toMatchObject({ processedReadCount: 1 });
  });
});
