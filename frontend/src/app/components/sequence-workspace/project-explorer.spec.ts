import { describe, expect, it } from 'vitest';
import { ProjectItem, SequenceDocument } from '../../models/sequence.model';
import { sortProjectItems } from './project-explorer.component';

const item = (name: string, updatedTimestamp: number, type: 'sequence' | 'fastq' = 'sequence'): ProjectItem => {
  if (type === 'fastq') {
    return {
      id: name,
      type,
      name,
      description: '',
      reads: [],
      stats: { readCount: 0, avgLength: 0, minLength: 0, maxLength: 0, avgGC: 0, avgQuality: 0, lengthDistribution: {}, qualityDistribution: {} },
      createdTimestamp: updatedTimestamp,
      updatedTimestamp
    };
  }
  return {
    id: name,
    type,
    name,
    description: '',
    sequence: '',
    topology: 'linear',
    features: [],
    primers: [],
    sourceFormat: 'manual',
    createdTimestamp: updatedTimestamp,
    updatedTimestamp
  } satisfies SequenceDocument;
};

describe('sortProjectItems', () => {
  const items = [item('Beta', 20), item('Alpha', 10), item('Gamma', 30, 'fastq')];

  it('sorts files by updated time without mutating service order', () => {
    expect(sortProjectItems(items, 'updated-desc').map(entry => entry.name)).toEqual(['Gamma', 'Beta', 'Alpha']);
    expect(items.map(entry => entry.name)).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('supports names and file types', () => {
    expect(sortProjectItems(items, 'name-asc').map(entry => entry.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(sortProjectItems(items, 'type').map(entry => entry.name)).toEqual(['Gamma', 'Alpha', 'Beta']);
  });
});
