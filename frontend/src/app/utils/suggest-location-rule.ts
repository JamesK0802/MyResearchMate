import { calculateStorageLocation, makeStoragePart, StorageLocationRule, StorageRulePart } from './storage-location-rules';

/** Suggest positional fields from an example, never apply or persist the guess. */
export function suggestLocationRule(barcode: string, output: string): StorageLocationRule | null {
  barcode = barcode.trim();
  output = output.trim();
  if (!barcode || !output) return null;
  const parts: StorageRulePart[] = [];
  let cursor = 0;
  let pending = '';
  let connector = '';
  let prefix = '';
  let copied = 0;
  const addLiteral = () => {
    if (!pending.trim()) return;
    parts.push({ ...makeStoragePart('text'), value: pending.trim(), joiner: parts.length ? connector : '' });
    pending = '';
  };
  for (const match of output.matchAll(/\S+\s*/g)) {
    const token = match[0].trimEnd();
    const trailing = match[0].slice(token.length);
    // Whole output words must occur verbatim in the barcode. Do not match letters inside prose.
    const index = barcode.indexOf(token, cursor);
    if (index < 0) {
      pending += token + trailing;
      continue;
    }
    const precedingSpace = pending.match(/\s+$/)?.[0] || connector;
    if (!copied && index > 0 && pending.trim()) {
      prefix = barcode.slice(0, index);
      parts.push({ ...makeStoragePart('characters'), start: 1, end: index, joiner: '',
        mappings: [{ from: prefix, to: pending.trim() }], label: 'Room name' });
      pending = '';
    } else addLiteral();
    const fromEnd = index + token.length === barcode.length;
    parts.push({ ...makeStoragePart(fromEnd ? 'characters_from_end' : 'characters'),
      start: fromEnd ? 1 : index + 1, end: fromEnd ? token.length : index + token.length,
      joiner: parts.length ? precedingSpace : '' });
    copied++;
    cursor = index + token.length;
    connector = trailing;
  }
  addLiteral();
  if (!copied) return null;
  const rule: StorageLocationRule = {
    id: globalThis.crypto?.randomUUID?.() || `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: prefix ? `${prefix} locations` : 'Example-based locations', enabled: true,
    match: prefix ? { type: 'starts_with', value: prefix } : { type: 'always', value: '' }, separator: ' ', parts
  };
  return calculateStorageLocation(barcode, [rule]) === output ? rule : null;
}
