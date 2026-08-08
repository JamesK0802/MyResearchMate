import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { NamuDocument, NamuTree, NamuNode, NamuLeafNote, estimateNamuNodeHeight } from '../models/namu.model';

// This is a recoverable browser draft only. It is never used to overwrite a
// file selected by the user; disk writes always require an explicit Save.
const STORAGE_KEY = 'protocol_builder_draft_v1';
type SaveStatus = 'saved' | 'saving' | 'error' | 'unsaved';

@Injectable({
  providedIn: 'root'
})
export class NamuStorageService {
  private docSubject = new BehaviorSubject<NamuDocument>(this.getInitialDocument());
  doc$ = this.docSubject.asObservable();

  saveStatus$ = new BehaviorSubject<SaveStatus>('unsaved');
  openedFileName$ = new BehaviorSubject<string>('');
  isFileLoaded$ = new BehaviorSubject<boolean>(false);
  private activeFileHandle: any = null;
  private myDataRecordId: string | null = null;

  constructor() {
    this.loadFromLocalStorage();
  }

  get currentDoc(): NamuDocument {
    return this.docSubject.value;
  }

  get activeTree(): NamuTree | undefined {
    const doc = this.currentDoc;
    return doc.trees.find(t => t.id === doc.activeTreeId) || doc.trees[0];
  }

  get canSaveToFile(): boolean {
    return !!this.activeFileHandle && typeof this.activeFileHandle.createWritable === 'function';
  }

  get hasMyDataRecord(): boolean { return !!this.myDataRecordId; }
  get currentMyDataRecordId(): string | null { return this.myDataRecordId; }

  loadSavedDocument(document: NamuDocument, title: string, recordId: string) {
    this.activeFileHandle = null;
    this.myDataRecordId = recordId;
    this.openedFileName$.next(`${title} — not saved`);
    this.isFileLoaded$.next(true);
    this.updateDocument(structuredClone(document));
    // Every newly opened protocol starts in a clean, readable layout.
    this.autoLayoutTreeNodes(document.activeTreeId);
  }

  markSavedToMyData(recordId: string) { this.myDataRecordId = recordId; }

  private saveToLocalStorage(doc: NamuDocument) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
      this.saveStatus$.next('unsaved');
    } catch (e) {
      console.error('Failed to save Namu document', e);
      this.saveStatus$.next('error');
    }
  }

  async openNativeFile(): Promise<boolean> {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'Namu Experiment Protocol Files (*.json, *.namu.json)',
            accept: {
              'application/json': ['.json', '.namu.json'],
              'text/plain': ['.json', '.namu.json']
            }
          }],
          excludeAcceptAllOption: false
        });

        const file = await handle.getFile();
        const text = await file.text();
        const parsed = JSON.parse(text) as NamuDocument;

        if (parsed && Array.isArray(parsed.trees) && parsed.trees.length > 0) {
          this.activeFileHandle = handle;
          this.myDataRecordId = null;
          this.openedFileName$.next(file.name);
          this.isFileLoaded$.next(true);
          // Keep an independent working copy. The file on disk is untouched
          // until the user explicitly selects Save.
          this.updateDocument(structuredClone(parsed));
          return true;
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error('Error opening file via Native File Picker', e);
        }
      }
    }
    return false;
  }

  async saveAsNativeFile(): Promise<boolean> {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `${this.activeTree?.name || 'experiment-tree'}.namu.json`,
          types: [{
            description: 'Namu Experiment Protocol Files (*.json, *.namu.json)',
            accept: {
              'application/json': ['.json', '.namu.json'],
              'text/plain': ['.json', '.namu.json']
            }
          }],
          excludeAcceptAllOption: false
        });

        this.activeFileHandle = handle;
        const file = await handle.getFile();
        this.openedFileName$.next(file.name);
        this.isFileLoaded$.next(true);

        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(this.currentDoc, null, 2));
        await writable.close();

        this.saveStatus$.next('saved');
        return true;
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error('Error saving file via Native File Picker', e);
        }
      }
    }
    return false;
  }

  async saveToOpenedFile(): Promise<boolean> {
    if (!this.canSaveToFile) return false;
    this.saveStatus$.next('saving');
    try {
      const writable = await this.activeFileHandle.createWritable();
      await writable.write(JSON.stringify(this.currentDoc, null, 2));
      await writable.close();
      this.saveStatus$.next('saved');
      return true;
    } catch (e) {
      console.error('Failed to save Protocol Builder file', e);
      this.saveStatus$.next('error');
      return false;
    }
  }

  createNewFile(name: string = 'Untitled Protocol'): NamuDocument {
    const rootNodeId = 'node_' + Math.random().toString(36).substring(2, 9);
    const newTree: NamuTree = {
      id: 'tree_' + Math.random().toString(36).substring(2, 9),
      name: name,
      description: 'Newly created experiment protocol tree',
      rootNodeId: rootNodeId,
      nodes: [
        {
          id: rootNodeId,
          title: 'Initial Stage Node',
          description: 'Root node for your new protocol',
          steps: ['Protocol procedure'],
          nextNodes: [],
          x: 12500,
          y: 10000,
          status: 'planned',
          leaves: []
        }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const newDoc: NamuDocument = {
      version: '1.0',
      title: name,
      activeTreeId: newTree.id,
      trees: [newTree]
    };

    this.activeFileHandle = null;
    this.myDataRecordId = null;
    this.openedFileName$.next(`${name} — not saved`);
    this.isFileLoaded$.next(true);
    this.updateDocument(newDoc);
    return newDoc;
  }

  loadSampleDemoProtocol() {
    const initial = this.getInitialDocument();
    this.activeFileHandle = null;
    this.myDataRecordId = null;
    this.openedFileName$.next('Sample Protocol — not saved');
    this.isFileLoaded$.next(true);
    this.updateDocument(initial);
  }

  closeCurrentFile() {
    this.isFileLoaded$.next(false);
    this.openedFileName$.next('');
    this.activeFileHandle = null;
    this.myDataRecordId = null;
  }

  private loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as NamuDocument;
        if (parsed && parsed.trees && parsed.trees.length > 0) {
          this.docSubject.next(parsed);
          this.openedFileName$.next('Last_Opened_Protocol.namu.json');
          // Start with VSCode-style welcome landing screen if desired
          this.isFileLoaded$.next(false);
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load Namu document from localStorage', e);
    }
  }

  setActiveTree(treeId: string) {
    const doc = { ...this.currentDoc, activeTreeId: treeId };
    this.updateDocument(doc);
  }

  renameTree(treeId: string, newName: string) {
    const doc = this.currentDoc;
    const tree = doc.trees.find(t => t.id === treeId);
    if (tree) {
      tree.name = newName;
      tree.updatedAt = Date.now();
      this.updateDocument({ ...doc });
    }
  }

  deleteTree(treeId: string) {
    const doc = this.currentDoc;
    if (!doc.trees || doc.trees.length <= 1) return; // Keep at least 1 tree

    const updatedTrees = doc.trees.filter(t => t.id !== treeId);
    const newActiveId = updatedTrees[0].id;
    this.updateDocument({
      ...doc,
      trees: updatedTrees,
      activeTreeId: newActiveId
    });
  }

  createTree(name: string, description: string = ''): NamuTree {
    const now = Date.now();
    const rootNodeId = 'node_' + Math.random().toString(36).substring(2, 9);
    
    // Find bottom-most Y coordinate of all existing tree boundaries
    let maxBottomY = 10000;
    let minStartX = 12500;

    if (this.currentDoc.trees && this.currentDoc.trees.length > 0) {
      this.currentDoc.trees.forEach(t => {
        if (t.nodes) {
          t.nodes.forEach(n => {
            if (n.y !== undefined && (n.y + 350) > maxBottomY) {
              maxBottomY = n.y + 350;
            }
            if (n.x !== undefined && n.x < minStartX) {
              minStartX = n.x;
            }
          });
        }
      });
      maxBottomY += 500; // Place new tree 500px BELOW all existing boundaries
    }

    const rootNode: NamuNode = {
      id: rootNodeId,
      title: name + ' Root Node',
      description: description || 'Starting node of your experiment tree',
      steps: ['Execute protocol procedure'],
      nextNodes: [],
      x: minStartX,
      y: maxBottomY,
      status: 'planned',
      leaves: []
    };

    const newTree: NamuTree = {
      id: 'tree_' + Math.random().toString(36).substring(2, 9),
      name: name,
      description: description,
      rootNodeId: rootNodeId,
      nodes: [rootNode],
      createdAt: now,
      updatedAt: now
    };

    const updatedDoc: NamuDocument = {
      ...this.currentDoc,
      activeTreeId: newTree.id,
      trees: [...(this.currentDoc.trees || []), newTree]
    };

    this.updateDocument(updatedDoc);
    return newTree;
  }

  updateTree(updatedTree: NamuTree) {
    const doc = this.currentDoc;
    const trees = doc.trees.map(t => (t.id === updatedTree.id ? { ...updatedTree, updatedAt: Date.now() } : t));
    this.updateDocument({ ...doc, trees });
  }

  // Node operations
  addNode(treeId: string, parentNodeId?: string): NamuNode {
    const tree = this.currentDoc.trees.find(t => t.id === treeId);
    if (!tree) throw new Error('Tree not found');

    const parentNode = parentNodeId ? tree.nodes.find(n => n.id === parentNodeId) : undefined;
    const newNodeId = 'node_' + Math.random().toString(36).substring(2, 9);
    
    const parentX = parentNode?.x ?? 12500;
    const parentY = parentNode?.y ?? 10000;

    const newNode: NamuNode = {
      id: newNodeId,
      title: 'New Protocol Step',
      description: 'Describe experiment step',
      steps: ['Execute protocol procedure'],
      nextNodes: [],
      x: parentX + 460,
      y: parentY,
      status: 'planned',
      leaves: []
    };

    const updatedNodes = [...tree.nodes, newNode];
    if (parentNode) {
      const updatedParent = {
        ...parentNode,
        nextNodes: [...parentNode.nextNodes, newNodeId]
      };
      const idx = updatedNodes.findIndex(n => n.id === parentNodeId);
      if (idx !== -1) updatedNodes[idx] = updatedParent;
    }

    const updatedTree: NamuTree = {
      ...tree,
      nodes: updatedNodes,
      updatedAt: Date.now()
    };

    this.updateTree(updatedTree);
    return newNode;
  }

  insertNodeBefore(treeId: string, targetNodeId: string): NamuNode {
    const tree = this.currentDoc.trees.find(t => t.id === treeId);
    if (!tree) throw new Error('Tree not found');

    const targetNode = tree.nodes.find(n => n.id === targetNodeId);
    if (!targetNode) throw new Error('Target node not found');

    const newNodeId = 'node_' + Math.random().toString(36).substring(2, 9);
    const targetX = targetNode.x ?? 12500;
    const targetY = targetNode.y ?? 10000;

    const newNode: NamuNode = {
      id: newNodeId,
      title: 'New Protocol Step',
      description: 'Describe experiment step',
      steps: ['Execute protocol procedure'],
      nextNodes: [targetNodeId],
      x: Math.max(20, targetX - 280),
      y: targetY,
      status: 'planned',
      leaves: []
    };

    // Find any parent nodes currently pointing to targetNode, re-route them to newNode
    const updatedNodes = tree.nodes.map(n => {
      if (n.nextNodes.includes(targetNodeId)) {
        return {
          ...n,
          nextNodes: n.nextNodes.map(id => (id === targetNodeId ? newNodeId : id))
        };
      }
      return n;
    });

    updatedNodes.push(newNode);
    const rootNodeId = tree.rootNodeId === targetNodeId ? newNodeId : tree.rootNodeId;

    this.updateTree({ ...tree, rootNodeId, nodes: updatedNodes, updatedAt: Date.now() });
    return newNode;
  }

  connectNodes(treeId: string, sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const tree = this.currentDoc.trees.find(t => t.id === treeId);
    if (!tree) return;

    const sourceNode = tree.nodes.find(n => n.id === sourceId);
    if (!sourceNode || sourceNode.nextNodes.includes(targetId)) return;

    const updatedSource = {
      ...sourceNode,
      nextNodes: [...sourceNode.nextNodes, targetId]
    };

    this.updateNode(treeId, updatedSource);
  }

  disconnectNodes(treeId: string, sourceId: string, targetId: string) {
    const tree = this.currentDoc.trees.find(t => t.id === treeId);
    if (!tree) return;

    const sourceNode = tree.nodes.find(n => n.id === sourceId);
    if (!sourceNode) return;

    const updatedSource = {
      ...sourceNode,
      nextNodes: sourceNode.nextNodes.filter(id => id !== targetId)
    };

    this.updateNode(treeId, updatedSource);
  }

  autoLayoutAllTrees() {
    if (!this.currentDoc || !this.currentDoc.trees || this.currentDoc.trees.length === 0) return;

    let currentStartY = 10000;
    const verticalGap = 500;

    this.currentDoc.trees.forEach(t => {
      const treeHeight = this.layoutSingleTreeAtPosition(t, 12500, currentStartY);
      currentStartY += treeHeight + verticalGap;
    });

    this.updateDocument({ ...this.currentDoc });
  }

  autoLayoutTreeNodes(treeId: string) {
    this.autoLayoutAllTrees();
  }

  private layoutSingleTreeAtPosition(tree: NamuTree, startX: number, startY: number): number {
    if (!tree || !tree.nodes || tree.nodes.length === 0) return 400;

    // 1. Calculate Level for each node (Depth-First / Topological)
    const levelMap = new Map<string, number>();

    const calculateLevel = (nodeId: string, currentLvl: number, ancestors = new Set<string>()) => {
      // A merge must use the deepest incoming branch. If that branch is found
      // after a shorter one, propagate the new level through every descendant.
      // The previous early return left descendants in stale columns.
      if (ancestors.has(nodeId)) return;

      const existing = levelMap.get(nodeId);
      if (existing !== undefined && currentLvl <= existing) return;
      levelMap.set(nodeId, currentLvl);

      const n = tree.nodes.find(item => item.id === nodeId);
      if (n && n.nextNodes) {
        const nextAncestors = new Set(ancestors);
        nextAncestors.add(nodeId);
        n.nextNodes.forEach(childId => calculateLevel(childId, currentLvl + 1, nextAncestors));
      }
    };

    calculateLevel(tree.rootNodeId, 0);

    // Assign level to orphan nodes
    tree.nodes.forEach(n => {
      if (!levelMap.has(n.id)) calculateLevel(n.id, 0);
    });

    // Group nodes by level
    const nodesByLevel = new Map<number, NamuNode[]>();
    tree.nodes.forEach(n => {
      const lvl = levelMap.get(n.id) || 0;
      if (!nodesByLevel.has(lvl)) nodesByLevel.set(lvl, []);
      nodesByLevel.get(lvl)!.push(n);
    });

    const totalLevels = Math.max(...Array.from(nodesByLevel.keys()), 0) + 1;
    const xGap = 460;
    const treeWidth = (totalLevels - 1) * xGap + 360;
    const getNodeHeight = estimateNamuNodeHeight;

    const nodePosMap = new Map<string, { x: number; y: number }>();

    // Position Root Node
    const rootNode = tree.nodes.find(n => n.id === tree.rootNodeId) || tree.nodes[0];
    nodePosMap.set(rootNode.id, { x: startX, y: startY });

    // 2. Position nodes level by level aligning children STRAIGHT with parents
    for (let lvl = 0; lvl < totalLevels; lvl++) {
      const nodesInLvl = nodesByLevel.get(lvl) || [];
      const colX = startX + lvl * xGap;

      nodesInLvl.forEach(parent => {
        const parentPos = nodePosMap.get(parent.id) || { x: colX, y: startY };
        const childrenIds = parent.nextNodes || [];
        const childrenInNextLvl = childrenIds.filter(cid => (levelMap.get(cid) || 0) === lvl + 1);

        if (childrenInNextLvl.length === 1) {
          const childId = childrenInNextLvl[0];
          if (!nodePosMap.has(childId)) {
            nodePosMap.set(childId, { x: colX + xGap, y: parentPos.y });
          }
        } else if (childrenInNextLvl.length > 1) {
          const childHeights = childrenInNextLvl.map(cid => {
            const childNode = tree.nodes.find(n => n.id === cid);
            return childNode ? getNodeHeight(childNode) : 160;
          });

          const totalChildrenHeight = childHeights.reduce((a, b) => a + b, 0) + (childrenInNextLvl.length - 1) * 70;
          let currentY = parentPos.y + (getNodeHeight(parent) / 2) - (totalChildrenHeight / 2);

          childrenInNextLvl.forEach((cid, idx) => {
            if (!nodePosMap.has(cid)) {
              nodePosMap.set(cid, { x: colX + xGap, y: currentY });
            }
            currentY += childHeights[idx] + 70;
          });
        }
      });

      // Handle unpositioned nodes in this level
      let currentY = startY;
      nodesInLvl.forEach(n => {
        if (!nodePosMap.has(n.id)) {
          nodePosMap.set(n.id, { x: colX, y: currentY });
          currentY += getNodeHeight(n) + 70;
        }
      });
    }

    // 3. Resolve vertical collisions per column
    for (let lvl = 0; lvl < totalLevels; lvl++) {
      const nodesInLvl = (nodesByLevel.get(lvl) || []).slice();
      nodesInLvl.sort((a, b) => (nodePosMap.get(a.id)?.y || 0) - (nodePosMap.get(b.id)?.y || 0));

      for (let i = 0; i < nodesInLvl.length - 1; i++) {
        const curr = nodesInLvl[i];
        const next = nodesInLvl[i + 1];

        const currPos = nodePosMap.get(curr.id)!;
        const nextPos = nodePosMap.get(next.id)!;
        const currH = getNodeHeight(curr);

        const minY = currPos.y + currH + 70; // 70px clearance margin
        if (nextPos.y < minY) {
          nextPos.y = minY; // Push next node down cleanly
        }
      }
    }

    // 4. Update Tree Nodes with final straight-line coordinates
    const updatedNodes = tree.nodes.map(n => {
      const pos = nodePosMap.get(n.id) || { x: startX, y: startY };
      return {
        ...n,
        x: Math.round(pos.x),
        y: Math.round(pos.y)
      };
    });

    this.updateTree({ ...tree, nodes: updatedNodes, updatedAt: Date.now() });
    return treeWidth;
  }

  updateNode(treeId: string, updatedNode: NamuNode) {
    const tree = this.currentDoc.trees.find(t => t.id === treeId);
    if (!tree) return;

    const nodes = tree.nodes.map(n => (n.id === updatedNode.id ? updatedNode : n));
    this.updateTree({ ...tree, nodes, updatedAt: Date.now() });
  }

  deleteNode(treeId: string, nodeId: string) {
    const tree = this.currentDoc.trees.find(t => t.id === treeId);
    if (!tree || tree.nodes.length <= 1) return; // Keep root node

    // Remove from other nodes' nextNodes
    const nodes = tree.nodes
      .filter(n => n.id !== nodeId)
      .map(n => ({
        ...n,
        nextNodes: n.nextNodes.filter(id => id !== nodeId)
      }));

    const rootNodeId = tree.rootNodeId === nodeId ? nodes[0].id : tree.rootNodeId;
    this.updateTree({ ...tree, rootNodeId, nodes, updatedAt: Date.now() });
  }

  addLeafNote(treeId: string, nodeId: string, title: string, content: string, tags: string[] = [], color: string = '#10b981'): NamuLeafNote {
    const tree = this.currentDoc.trees.find(t => t.id === treeId);
    if (!tree) throw new Error('Tree not found');

    const node = tree.nodes.find(n => n.id === nodeId);
    if (!node) throw new Error('Node not found');

    const newLeaf: NamuLeafNote = {
      id: 'leaf_' + Math.random().toString(36).substring(2, 9),
      nodeId,
      title: title || 'Leaf Note',
      content,
      tags,
      createdAt: Date.now(),
      color
    };

    const updatedNode = {
      ...node,
      leaves: [...node.leaves, newLeaf]
    };

    this.updateNode(treeId, updatedNode);
    return newLeaf;
  }

  deleteLeafNote(treeId: string, nodeId: string, leafId: string) {
    const tree = this.currentDoc.trees.find(t => t.id === treeId);
    if (!tree) return;

    const node = tree.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const updatedNode = {
      ...node,
      leaves: node.leaves.filter(l => l.id !== leafId)
    };

    this.updateNode(treeId, updatedNode);
  }

  // Import / Export
  exportDocumentToJson(): string {
    return JSON.stringify(this.currentDoc, null, 2);
  }

  importDocumentFromJson(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString) as NamuDocument;
      if (parsed && Array.isArray(parsed.trees) && parsed.trees.length > 0) {
        this.updateDocument(parsed);
        return true;
      }
    } catch (e) {
      console.error('Invalid Namu JSON document format', e);
    }
    return false;
  }

  exportTreeToMarkdown(tree: NamuTree): string {
    let md = `# 🌲 ${tree.name}\n\n`;
    if (tree.description) md += `*${tree.description}*\n\n---\n\n`;

    const visited = new Set<string>();

    const printNode = (nodeId: string, level: number = 1) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = tree.nodes.find(n => n.id === nodeId);
      if (!node) return;

      const indent = '#'.repeat(Math.min(6, level + 1));
      md += `${indent} Step: ${node.title} \`[Status: ${node.status.toUpperCase()}]\`\n\n`;
      
      if (node.description) {
        md += `> ${node.description}\n\n`;
      }

      if (node.steps && node.steps.length > 0) {
        md += `**Protocol Instructions:**\n`;
        node.steps.forEach((s, idx) => {
          md += `${idx + 1}. ${s}\n`;
        });
        md += `\n`;
      }

      if (node.leaves && node.leaves.length > 0) {
        md += `🍃 **Leaf Notes (${node.leaves.length}):**\n`;
        node.leaves.forEach(leaf => {
          md += `- **${leaf.title}** (${leaf.tags.join(', ')}): ${leaf.content}\n`;
        });
        md += `\n`;
      }

      if (node.nextNodes && node.nextNodes.length > 0) {
        node.nextNodes.forEach(childId => printNode(childId, level + 1));
      }
    };

    printNode(tree.rootNodeId, 1);

    // Include orphan nodes if any
    tree.nodes.forEach(n => {
      if (!visited.has(n.id)) {
        printNode(n.id, 1);
      }
    });

    return md;
  }

  private updateDocument(doc: NamuDocument) {
    this.docSubject.next(doc);
    this.saveToLocalStorage(doc);
  }

  private getInitialDocument(): NamuDocument {
    const rootId = 'n_root';
    const n2Id = 'n_gRNA_design';
    const n3Id = 'n_pcr_amp';
    const n4aId = 'n_sequencing';
    const n4bId = 'n_in_vitro_cleavage';

    const demoNodes: NamuNode[] = [
      {
        id: rootId,
        title: '1. Target Sequence Selection',
        description: 'Identify exon target region for BnYCO gene editing',
        steps: [
          'Download FASTA reference for BnYCO-A & BnYCO-C',
          'Locate active PAM sites (NGG) near exon 2',
          'Verify off-target scores < 15%'
        ],
        nextNodes: [n2Id],
        x: 11200,
        y: 9800,
        status: 'completed',
        leaves: [
          {
            id: 'l1',
            nodeId: rootId,
            title: 'PAM Site Note',
            content: 'PAM position +432 selected due to highest specificity.',
            tags: ['Genomics', 'PAM'],
            createdAt: Date.now() - 86400000 * 3,
            color: '#10b981'
          },
          {
            id: 'l2',
            nodeId: rootId,
            title: 'Reference Genome',
            content: 'Ensemble release 54 used for locus validation.',
            tags: ['FASTA', 'Database'],
            createdAt: Date.now() - 86400000 * 2,
            color: '#3b82f6'
          }
        ]
      },
      {
        id: n2Id,
        title: '2. gRNA Synthesis & Oligo Annealing',
        description: 'Synthesize forward and reverse gRNA oligos with sticky ends',
        steps: [
          'Mix 100µM Forward & Reverse oligos in T4 Ligation Buffer',
          'Heat at 95°C for 5 min, then ramp down 1°C/min to 25°C',
          'Ligate into BsaI-digested pSpCas9 vector'
        ],
        nextNodes: [n3Id],
        x: 11640,
        y: 9800,
        status: 'completed',
        leaves: [
          {
            id: 'l3',
            nodeId: n2Id,
            title: 'Annealing Protocol Warning',
            content: 'Use slow ramp down rate to maximize duplex formation efficiency.',
            tags: ['Oligo', 'Protocol'],
            createdAt: Date.now() - 86400000 * 2,
            color: '#f59e0b'
          }
        ]
      },
      {
        id: n3Id,
        title: '3. Target Amplicon PCR & Purification',
        description: 'Amplify target genomic window (280bp - 350bp)',
        steps: [
          'Set up 50µL PCR reaction using Q5 High-Fidelity DNA Polymerase',
          'Thermocycle: 98°C 30s → 30x (98°C 10s, 62°C 20s, 72°C 30s) → 72°C 2 min',
          'Perform 1.2% Agarose gel electrophoresis & column purification'
        ],
        nextNodes: [n4aId, n4bId],
        x: 12080,
        y: 9800,
        status: 'completed',
        leaves: [
          {
            id: 'l4',
            nodeId: n3Id,
            title: 'Gel Extraction Yield',
            content: 'Purified band concentration: 48.5 ng/µL, A260/280 = 1.88.',
            tags: ['PCR', 'Purification'],
            createdAt: Date.now() - 86400000 * 1,
            color: '#8b5cf6'
          }
        ]
      },
      {
        id: n4aId,
        title: '4a. Targeted Deep FASTQ Sequencing',
        description: 'Illumina MiSeq 2x250bp paired-end sequencing',
        steps: [
          'Index amplicons with dual barcode adapters',
          'Pool libraries at 4nM concentration',
          'Analyze FASTQ output in MyLabMate Local pipeline'
        ],
        nextNodes: [],
        x: 12520,
        y: 9600,
        status: 'in_progress',
        leaves: [
          {
            id: 'l5',
            nodeId: n4aId,
            title: 'NGS Coverage Target',
            content: 'Target minimum 10,000 reads per sample for indel frequency.',
            tags: ['NGS', 'MiSeq'],
            createdAt: Date.now() - 43200000,
            color: '#ec4899'
          }
        ]
      },
      {
        id: n4bId,
        title: '4b. In Vitro Cas9 Cleavage Assay',
        description: 'Validate Cas9-gRNA ribonucleoprotein (RNP) activity',
        steps: [
          'Incubate 100ng amplicon + 100nM Cas9 + 100nM gRNA at 37°C for 1 hour',
          'Add Proteinase K (1µL) and incubate at 56°C for 10 min to stop reaction',
          'Analyze cleavage bands on Agilent TapeStation'
        ],
        nextNodes: [],
        x: 12520,
        y: 10040,
        status: 'planned',
        leaves: [
          {
            id: 'l6',
            nodeId: n4bId,
            title: 'Control Sample',
            content: 'Include mock RNP reaction (no gRNA) as negative control.',
            tags: ['Assay', 'Cas9'],
            createdAt: Date.now() - 21600000,
            color: '#3b82f6'
          }
        ]
      }
    ];

    const demoTree: NamuTree = {
      id: 'tree_crispr_demo',
      name: '🌱 CRISPR Editing Workflow',
      description: 'Complete protocol & knowledge tree for BnYCO gene editing experiment',
      rootNodeId: rootId,
      nodes: demoNodes,
      createdAt: Date.now() - 86400000 * 5,
      updatedAt: Date.now()
    };

    return {
      version: '1.0',
      title: 'Lab Notebook Forest',
      trees: [demoTree],
      activeTreeId: demoTree.id
    };
  }
}
