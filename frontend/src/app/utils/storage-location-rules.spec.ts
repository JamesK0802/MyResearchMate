import { describe, expect, it } from 'vitest';
import { calculateStorageLocation, makeStoragePart, storagePartValue, StorageLocationRule } from './storage-location-rules';

describe('storage location formula', () => {
  it('splits variable-length cabinet and layer numbers without changing formats', () => {
    const rule: StorageLocationRule = {
      id:'split', name:'Location', enabled:true, match:{type:'always',value:''}, separator:' / ',
      parts:[
        {...makeStoragePart('characters'), end:2, mappings:[{from:'AD',to:'Admin room'}]},
        {...makeStoragePart('digits_after'),value:'AD',trimEnd:1,prefix:'Cabinet ',joiner:' / '},
        {...makeStoragePart('characters_from_end'),prefix:'Layer ',joiner:' / '}
      ]
    };
    expect(calculateStorageLocation('AD12',[rule])).toBe('Admin room / Cabinet 1 / Layer 2');
    expect(calculateStorageLocation('ad432',[rule])).toBe('Admin room / Cabinet 43 / Layer 2');
    expect(storagePartValue('AD432',{...makeStoragePart('digits_after'),value:'AD'})).toBe('432');
    expect(storagePartValue('AD432',{...makeStoragePart('characters_from_end'),end:2})).toBe('32');
    expect(storagePartValue('AD',{...makeStoragePart('digits_after'),value:'AD',prefix:'Cabinet '})).toBe('');
  });
  it('combines any number of barcode and text elements in order', () => {
    const rule: StorageLocationRule = {
      id: 'rule-1', name: 'Admin room', enabled: true,
      match: { type: 'starts_with', value: 'AD' }, separator: ' ',
      parts: [
        { type: 'text', value: 'Admin room', start: 1, end: 1, group: 1, transform: 'as_is', joiner: '' },
        { type: 'characters', value: '', start: 3, end: 4, group: 1, transform: 'as_is', joiner: ' ' },
        { type: 'text', value: 'layer', start: 1, end: 1, group: 1, transform: 'as_is', joiner: ' ' },
      ],
    };

    expect(calculateStorageLocation('AD12bc2', [rule])).toBe('Admin room 12 layer');
  });

  it('supports a different connector between every pair of elements', () => {
    const rule: StorageLocationRule = {
      id: 'rule-2', name: 'Mixed separators', enabled: true,
      match: { type: 'always', value: '' }, separator: ' ',
      parts: [
        { type: 'text', value: 'Freezer', start: 1, end: 1, group: 1, transform: 'as_is', joiner: '' },
        { type: 'number_group', value: '', start: 1, end: 1, group: 1, transform: 'as_is', joiner: ' / ' },
        { type: 'remainder_after', value: '-', start: 1, end: 1, group: 1, transform: 'uppercase', joiner: ' - ' },
      ],
    };

    expect(calculateStorageLocation('BOX27-shelfB', [rule])).toBe('Freezer / 27 - SHELFB');
  });

  it('keeps the previous rule-wide separator for older saved rules', () => {
    const rule: StorageLocationRule = {
      id: 'legacy', name: 'Legacy', enabled: true,
      match: { type: 'always', value: '' }, separator: ' / ',
      parts: [
        { type: 'text', value: 'Box', start: 1, end: 1, group: 1, transform: 'as_is' },
        { type: 'number_group', value: '', start: 1, end: 1, group: 1, transform: 'as_is' },
      ],
    };

    expect(calculateStorageLocation('A42', [rule])).toBe('Box / 42');
  });
});
