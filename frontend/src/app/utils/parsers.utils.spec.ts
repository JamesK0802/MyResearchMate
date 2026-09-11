import { gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseFastqFile } from './parsers.utils';

describe('Sequence Viewer FASTQ parser', () => {
  it('streams compressed FASTQ data and preserves full-file statistics', async () => {
    const content = '@one\nACGT\n+\nIIII\n@two\nGGGG\n+\n!!!!\n';
    const compressed = gzipSync(new TextEncoder().encode(content));
    const file = Object.assign(new Blob([compressed]), { name: 'reads.fastq.gz' }) as File;

    const document = await parseFastqFile(file);

    expect(document.stats.readCount).toBe(2);
    expect(document.reads.map(read => read.seq)).toEqual(['ACGT', 'GGGG']);
    expect(document.reads[0].qualString).toBe('IIII');
  });

  it('caps the interactive preview without losing the total read count', async () => {
    const records = Array.from({ length: 25_001 }, (_, index) => `@read-${index}\nACGT\n+\nIIII\n`).join('');
    const file = Object.assign(new Blob([records]), { name: 'large.fastq' }) as File;

    const document = await parseFastqFile(file);

    expect(document.stats.readCount).toBe(25_001);
    expect(document.reads).toHaveLength(25_000);
    expect(document.isReadPreview).toBe(true);
    expect(document.loadedReadCount).toBe(25_000);
  });
});
