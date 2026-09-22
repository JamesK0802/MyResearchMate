import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { LocationRuleDesignerComponent } from './location-rule-designer.component';
import { calculateStorageLocation } from '../utils/storage-location-rules';

describe('simple location rule designer', () => {
  it('builds a rule from keep and replace steps', () => {
    const editor=new LocationRuleDesignerComponent();
    editor.editable=true;
    editor.createRule();
    const rule=editor.selected!;
    rule.separator='';
    editor.add(rule,'characters');
    rule.parts[0].start=1; rule.parts[0].end=3;
    editor.addReplace(rule);
    editor.setReplacementTemplate(rule.parts[1], '0{1}{2}');
    expect(calculateStorageLocation('ADSXX',[rule])).toBe('ADS0XX');
    expect(calculateStorageLocation('ADS72',[rule])).toBe('ADS072');
  });
  it('starts with one example row and adds more on demand', () => {
    const editor=new LocationRuleDesignerComponent();
    expect(editor.examples).toHaveLength(1);
    editor.addExample();
    expect(editor.examples).toHaveLength(2);
    editor.removeExample(1);
    expect(editor.examples).toHaveLength(1);
  });
});
