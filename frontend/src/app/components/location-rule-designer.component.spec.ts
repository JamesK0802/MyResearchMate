import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { LocationRuleDesignerComponent } from './location-rule-designer.component';
import { calculateStorageLocation } from '../utils/storage-location-rules';

describe('plain-language replacement rules', () => {
  it('replaces only the last two characters when they match and preserves the rest', () => {
    const editor=new LocationRuleDesignerComponent();
    editor.editable=true;editor.operation='replace';editor.side='end';editor.skip=0;editor.count=2;
    editor.find='XX';editor.replacement='0XX';editor.createManual();
    const rule=editor.selected!;
    expect(calculateStorageLocation('ADSXX',[rule])).toBe('ADS0XX');
    expect(calculateStorageLocation('ADS72',[rule])).toBe('ADS72');
  });
  it('skips a prefix and conditionally replaces a middle field', () => {
    const editor=new LocationRuleDesignerComponent();
    editor.editable=true;editor.operation='replace';editor.side='start';editor.skip=2;editor.count=1;
    editor.find='S';editor.replacement='South';editor.createManual();
    expect(calculateStorageLocation('ADS572',[editor.selected!])).toBe('ADSouth572');
    expect(calculateStorageLocation('ADT572',[editor.selected!])).toBe('ADT572');
  });
});
