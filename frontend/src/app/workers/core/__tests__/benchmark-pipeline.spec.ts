import { describe, expect, it } from 'vitest';
import { runBenchmark } from '../benchmark-pipeline';
import { extractWindow, findGrnaCutSite } from '../classifier';

const prefix = 'TACGCTAGCATGACCTGATCGTACGATCGTACGCTAGCTA';
const grna = 'GATTACAGATTACAGATTAC';
const reference = `${prefix}${grna}AGGCGTACGATCGATGCTAGCTACGATCGTACGATCGTAGCTAGCTACGATCG`;
const windowSize = 60;
const cut = findGrnaCutSite(reference, grna);
const window = extractWindow(reference, cut.cut_site, windowSize);

describe('current classification benchmark', () => {
  it('evaluates all reads without a train/test split', () => {
    const result = runBenchmark([{
      gene: 'GeneA', target: 'TargetA', reference, grna,
      reads: [
        { id: 'read1', seq: window, qual: new Array(window.length).fill(40) },
        { id: 'read2', seq: window, qual: new Array(window.length).fill(40) },
      ],
    }], {
      platform: 'nanopore', phredThreshold: 20, windowSize, marginThreshold: 0.1,
    }, () => undefined);

    expect(result.subset).toBe('all');
    expect(result.total_reads).toBe(2);
    expect(result.correct_count).toBe(2);
    expect(result.split_info).toEqual([]);
  });

  it('treats multiple target windows within one gene as evidence, not competing classes', () => {
    const result = runBenchmark([
      { gene: 'GeneA', target: 'TargetA', reference, grna, reads: [{ id: 'a', seq: window, qual: new Array(window.length).fill(40) }] },
      { gene: 'GeneA', target: 'TargetB', reference, grna, reads: [{ id: 'b', seq: window, qual: new Array(window.length).fill(40) }] },
    ], {
      platform: 'nanopore', phredThreshold: 20, windowSize, marginThreshold: 0.1,
    }, () => undefined);

    expect(result.correct_count).toBe(2);
    expect(result.wrong_count).toBe(0);
  });
});
