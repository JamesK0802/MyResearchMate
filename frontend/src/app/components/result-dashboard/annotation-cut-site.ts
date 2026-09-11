export interface AnnotationTarget {
  ref_sequence?: string;
  sgrna_seq?: string;
  display_sgrna_seq?: string;
  grna_start_index?: number;
  cut_site_index?: number;
  is_rc?: boolean;
  strand?: string;
}

/**
 * Resolve the marker used by the result annotation only.
 *
 * Analysis coordinates remain untouched. This handles both supported input
 * conventions: a spacer by itself, or a reference-oriented sequence that
 * already includes its three-base PAM.
 */
export function resolveAnnotationCutSite(target: AnnotationTarget | null | undefined): number | null {
  if (!target) return null;

  const reference = (target.ref_sequence || '').replace(/\s+/g, '').toUpperCase();
  const displayedGuide = (target.display_sgrna_seq || target.sgrna_seq || '').replace(/\s+/g, '').toUpperCase();
  const guideStart = Number(target.grna_start_index);
  const savedCut = target.cut_site_index;
  const fallback = typeof savedCut === 'number' && Number.isFinite(savedCut) ? savedCut : null;

  if (!reference || !displayedGuide || !Number.isInteger(guideStart) || guideStart < 0) return fallback;

  const guideEnd = guideStart + displayedGuide.length;
  if (guideEnd > reference.length) return fallback;

  // Prefer the strand selected during analysis when both orientations happen
  // to be possible. This changes only the annotation marker.
  const reverse = target.is_rc === true || target.strand === 'reverse';

  const preferred = resolveMatchedCutSite(reference, guideStart, displayedGuide.length, reverse ? 'reverse' : 'forward');
  const alternate = preferred.pam_found
    ? preferred
    : resolveMatchedCutSite(reference, guideStart, displayedGuide.length, reverse ? 'forward' : 'reverse');
  const resolved = alternate.pam_found ? alternate.cut_site : fallback;

  return resolved !== null && resolved >= 0 && resolved <= reference.length
    ? resolved
    : fallback;
}
import { resolveMatchedCutSite } from '../../workers/core/classifier';
