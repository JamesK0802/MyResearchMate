export type Topology = 'linear' | 'circular';
export type Strand = 1 | -1 | 0;

export interface SequenceFeature {
  id: string;
  name: string;
  type: string;
  start: number; // 0-indexed, inclusive
  end: number;   // 0-indexed, exclusive (so length = end - start, modulo circularity)
  strand: Strand;
  color?: string;
  description?: string;
  qualifiers?: Record<string, string[]>;
}

export interface Primer {
  id: string;
  name: string;
  sequence: string;
  orientation: 'forward' | 'reverse';
  bindingStart?: number;
  bindingEnd?: number;
  tail?: string;
  description?: string;
}

export interface RestrictionSite {
  id: string;
  enzyme: string;
  cutPosition1: number; // Top strand cut
  cutPosition2: number; // Bottom strand cut
  recognitionStart: number;
  recognitionEnd: number;
  strand: Strand;
  isTypeIIS?: boolean;
}

export interface SequenceDocument {
  type: 'sequence';
  id: string;
  name: string;
  description: string;
  sequence: string; // IUPAC bases
  topology: Topology;
  features: SequenceFeature[];
  primers: Primer[];
  sourceFormat: string; // e.g. 'genbank', 'fasta', 'manual'
  createdTimestamp: number;
  updatedTimestamp: number;
  fileHandle?: any;
  remoteFileId?: string;
  remoteItemIndex?: number;
  originalFileName?: string;
  contentLoaded?: boolean;
}

export interface AlignmentDocument {
  type: 'alignment';
  id: string;
  name: string;
  description: string;
  seq1Name: string;
  seq2Name: string;
  seq1Str: string; // The aligned string with gaps
  seq2Str: string; // The aligned string with gaps
  identityPct: number;
  gapCount: number;
  createdTimestamp: number;
  updatedTimestamp: number;
  fileHandle?: any;
  remoteFileId?: string;
  remoteItemIndex?: number;
  originalFileName?: string;
  contentLoaded?: boolean;
}

export interface FastqRead {
  id: string;
  seq: string;
  qual: number[] | Uint8Array;
  qualString: string;
  alignment?: FastqCachedAlignment;
}

export interface FastqCachedAlignment {
  isAligned: boolean;
  category?: string;
  netIndel?: number;
  hasSub?: boolean;
  grid?: Array<{ char: string; type: 'equal' | 'substitute' | 'delete' | 'unobserved'; insertion?: string }>;
  gridChars?: string;
  gridTypes?: string;
  gridInsertions?: Record<number, string>;
  preWinSeq?: string;
  postWinSeq?: string;
  isRc?: boolean;
  alignmentFailureReason?: string;
}

export interface FastqStats {
  readCount: number;
  avgLength: number;
  minLength: number;
  maxLength: number;
  avgGC: number;
  avgQuality: number;
  lengthDistribution: Record<number, number>;
  qualityDistribution: Record<number, number>;
}

export interface AutoAlignConfig {
  windowSeq: string;
  refSeq?: string;
  grnaSeq?: string;
  winSize?: number;
}

export interface FastqAlignmentState {
  active: boolean;
  mode: 'window' | 'ref_target';
  inputWindowSeq: string;
  inputRefSeq: string;
  inputGrnaSeq: string;
  inputWinSize: number;
  alignedWindowSeq: string;
  alignedCutSiteInWindow: number;
  readOrder: 'aligned' | 'unaligned';
  cacheId?: string;
  processedReadCount?: number;
  alignedCount?: number;
  unalignedCount?: number;
  updatedTimestamp: number;
}

export interface FastqDocument {
  type: 'fastq';
  id: string;
  name: string;
  description: string;
  reads: FastqRead[];
  stats: FastqStats;
  isReadPreview?: boolean;
  loadedReadCount?: number;
  readPreviewLoaded?: boolean;
  readPreviewLoading?: boolean;
  remoteReadsHasMore?: boolean;
  createdTimestamp: number;
  updatedTimestamp: number;
  fileHandle?: any;
  autoAlign?: AutoAlignConfig;
  alignmentState?: FastqAlignmentState;
  remoteFileId?: string;
  remoteItemIndex?: number;
  originalFileName?: string;
  contentLoaded?: boolean;
}

export type ProjectItem = SequenceDocument | AlignmentDocument | FastqDocument;
