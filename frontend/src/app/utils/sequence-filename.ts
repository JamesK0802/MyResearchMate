/** Produce a display-friendly file name that cannot be interpreted as a path. */
export function safeSequenceFilename(value: string, fallback = 'sequence.fastq'): string {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim();
  return cleaned.replace(/[_\s.-]/g, '') ? cleaned : fallback;
}
