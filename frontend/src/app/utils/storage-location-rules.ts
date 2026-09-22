export type StorageMatchType = 'starts_with' | 'contains' | 'ends_with' | 'equals' | 'always';
export type StoragePartType = 'text' | 'barcode' | 'characters' | 'characters_from_end' | 'digits_after' | 'remainder_after' | 'number_group';
export type StorageTextTransform = 'as_is' | 'uppercase' | 'lowercase';

export interface StorageRulePart {
  type: StoragePartType;
  joiner?: string;
  value: string;
  start: number;
  end: number;
  group: number;
  transform: StorageTextTransform;
  label?: string;
  trimStart?: number;
  trimEnd?: number;
  prefix?: string;
  suffix?: string;
  mappings?: { from:string; to:string }[];
}

export interface StorageLocationRule {
  id: string;
  name: string;
  enabled: boolean;
  match: { type: StorageMatchType; value: string };
  separator: string;
  parts: StorageRulePart[];
}

export interface ArchiveSettings {
  storage_location_rules: StorageLocationRule[];
  can_manage: boolean;
  updated_at?: string;
}

export function makeStoragePart(type: StoragePartType = 'text'): StorageRulePart {
  return { type, joiner: ' ', value: '', start: 1, end: 1, group: 1, transform: 'as_is' };
}

export function storageRuleMatches(barcode: string, rule: StorageLocationRule): boolean {
  if (!rule.enabled) return false;
  const actual = (barcode || '').toLocaleLowerCase();
  const expected = (rule.match.value || '').toLocaleLowerCase();
  if (rule.match.type === 'always') return true;
  if (!expected) return false;
  if (rule.match.type === 'starts_with') return actual.startsWith(expected);
  if (rule.match.type === 'contains') return actual.includes(expected);
  if (rule.match.type === 'ends_with') return actual.endsWith(expected);
  return actual === expected;
}

export function storagePartValue(barcode: string, part: StorageRulePart): string {
  let value = '';
  if (part.type === 'text') value = part.value || '';
  if (part.type === 'barcode') value = barcode || '';
  if (part.type === 'characters') {
    const start = Math.max(1, Number(part.start) || 1) - 1;
    const end = Math.max(start + 1, Number(part.end) || start + 1);
    value = (barcode || '').slice(start, end);
  }
  if (part.type === 'characters_from_end') {
    const near = Math.max(1, Number(part.start) || 1);
    const far = Math.max(near, Number(part.end) || near);
    value = barcode.slice(Math.max(0, barcode.length - far), Math.max(0, barcode.length - near + 1));
  }
  if (part.type === 'digits_after' || part.type === 'remainder_after') {
    const marker = part.value || '';
    const index = marker ? (barcode || '').toLocaleLowerCase().indexOf(marker.toLocaleLowerCase()) : -1;
    const remainder = index >= 0 ? (barcode || '').slice(index + marker.length) : '';
    value = part.type === 'digits_after' ? (remainder.match(/\d+/)?.[0] || '') : remainder;
  }
  if (part.type === 'number_group') {
    const groups = (barcode || '').match(/\d+/g) || [];
    value = groups[Math.max(1, Number(part.group) || 1) - 1] || '';
  }
  value = value.slice(Math.max(0, part.trimStart || 0), Math.max(0, value.length - Math.max(0, part.trimEnd || 0))).trim();
  if (!value) return '';
  const mapping = part.mappings?.find(item => item.from.toLowerCase() === value.toLowerCase());
  if (mapping) value = mapping.to;
  if (part.transform === 'uppercase') value = value.toUpperCase();
  if (part.transform === 'lowercase') value = value.toLowerCase();
  return value ? (part.prefix || '') + value + (part.suffix || '') : '';
}

export function calculateStorageLocation(barcode: string, rules: StorageLocationRule[]): string | null {
  // An unfinished rule in the editor must not clear existing locations.
  const enabled = (rules || []).filter(rule => rule.enabled && (rule.parts || []).length > 0);
  if (!enabled.length) return null;
  const matches = enabled.filter(candidate => storageRuleMatches(barcode, candidate));
  const results = matches.map(rule => {
    const pieces = rule.parts.map(part => ({ value: storagePartValue(barcode, part), joiner: part.joiner })).filter(piece => piece.value);
    return pieces.reduce((output, piece, index) => output + (index ? (piece.joiner ?? rule.separator ?? ' ') : '') + piece.value, '');
  });
  if (new Set(results).size > 1) {
    throw new Error(`Conflicting location rules for “${barcode}”: ${matches.map((rule, i) => `${rule.name || rule.id} → “${results[i]}”`).join('; ')}`);
  }
  return results[0] ?? '';
}
