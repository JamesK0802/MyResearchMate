import { describe, expect, it } from 'vitest';
import { safeSequenceFilename } from './sequence-filename';

describe('safeSequenceFilename', () => {
  it('keeps a CRISPR target label while removing path separators', () => {
    expect(safeSequenceFilename('YCO-A/C-1_All_Reads.fastq')).toBe('YCO-A_C-1_All_Reads.fastq');
    expect(safeSequenceFilename('YCO-A\\C-1_Group_2.fastq')).toBe('YCO-A_C-1_Group_2.fastq');
  });

  it('falls back for an unusable generated name', () => {
    expect(safeSequenceFilename('../')).toBe('sequence.fastq');
  });
});
