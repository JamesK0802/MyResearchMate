export type NamuNodeStatus = 'planned' | 'in_progress' | 'completed' | 'failed';

export interface NamuLeafNote {
  id: string;
  nodeId: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  color?: string; // Leaf color accent (e.g. green, amber, emerald, blue)
}

export interface NamuNode {
  id: string;
  title: string;
  description?: string;
  steps: string[];
  nextNodes: string[]; // Target node IDs
  x?: number; // Canvas X position
  y?: number; // Canvas Y position
  status: NamuNodeStatus;
  leaves: NamuLeafNote[];
}

/**
 * Conservative rendered-card height estimate used by both layout and tree
 * bounds. It accounts for wrapped titles and steps so long protocols do not
 * overlap or escape their tree frame.
 */
export function estimateNamuNodeHeight(node: NamuNode): number {
  const titleLines = Math.max(1, Math.ceil((node.title || '').length / 30));
  const stepLines = (node.steps || []).reduce(
    (total, step) => total + Math.max(1, Math.ceil((step || '').length / 38)),
    0
  );
  const stepGaps = Math.max(0, (node.steps || []).length - 1) * 8;
  const noteHeight = node.leaves && node.leaves.length > 0 ? 24 : 0;
  return Math.max(160, 94 + (titleLines * 24) + (stepLines * 21) + stepGaps + noteHeight);
}

export interface NamuTree {
  id: string;
  name: string;
  description: string;
  rootNodeId: string;
  nodes: NamuNode[];
  createdAt: number;
  updatedAt: number;
}

export interface NamuDocument {
  version: '1.0';
  title: string;
  trees: NamuTree[];
  activeTreeId: string;
}
