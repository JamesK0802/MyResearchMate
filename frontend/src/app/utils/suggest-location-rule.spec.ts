import { describe, it, expect } from 'vitest';
import { suggestLocationRule } from './suggest-location-rule';
import { calculateStorageLocation } from './storage-location-rules';

describe('example-based location suggestions', () => {
  it('infers copied fields and the room code, not a fixed example string', () => {
    const rule=suggestLocationRule('ADS572','Admin Room S level 5 tray barcode 72')!;
    expect(rule).not.toBeNull();
    expect(calculateStorageLocation('ADS572',[rule])).toBe('Admin Room S level 5 tray barcode 72');
    expect(calculateStorageLocation('ADT683',[rule])).toBe('Admin Room T level 6 tray barcode 83');
    expect(calculateStorageLocation('ZZT683',[rule])).toBe('');
    expect(calculateStorageLocation('ADS572',[JSON.parse(JSON.stringify(rule))])).toBe('Admin Room S level 5 tray barcode 72');
  });
  it('does not pretend to infer a rule when no fields can be identified', () => {
    expect(suggestLocationRule('ADS572','Some freezer')).toBeNull();
    expect(suggestLocationRule('','')).toBeNull();
  });
});
