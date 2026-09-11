import { describe, expect, it } from 'vitest';
import { NamuNode, NamuTree } from '../../models/namu.model';
import { orderNamuNodesForNotebook, resolveMobileNotebookSwipe } from './namu-notebook-view.component';

const node = (id: string, nextNodes: string[], x: number, y = 0): NamuNode => ({
  id, title: id, steps: ['step'], nextNodes, x, y, status: 'planned', leaves: [],
});

const tree = (nodes: NamuNode[], rootNodeId = 'root'): NamuTree => ({
  id: 'tree', name: 'Tree', description: '', rootNodeId, nodes, createdAt: 0, updatedAt: 0,
});

describe('orderNamuNodesForNotebook', () => {
  it('places a later-created node between its linked parent and child', () => {
    const root = node('root', ['inserted'], 0);
    const child = node('child', [], 200);
    const inserted = node('inserted', ['child'], 100);
    expect(orderNamuNodesForNotebook(tree([root, child, inserted])).map(item => item.id))
      .toEqual(['root', 'inserted', 'child']);
  });

  it('uses canvas position for branches while preserving dependencies', () => {
    const root = node('root', ['lower', 'upper'], 0);
    const lower = node('lower', ['finish'], 100, 200);
    const upper = node('upper', ['finish'], 100, 50);
    const finish = node('finish', [], 200);
    expect(orderNamuNodesForNotebook(tree([finish, lower, root, upper])).map(item => item.id))
      .toEqual(['root', 'upper', 'lower', 'finish']);
  });

  it('keeps disconnected and cyclic nodes visible after the rooted tree', () => {
    const root = node('root', [], 0);
    const a = node('a', ['b'], 300);
    const b = node('b', ['a'], 400);
    expect(orderNamuNodesForNotebook(tree([b, a, root])).map(item => item.id))
      .toEqual(['root', 'a', 'b']);
  });
});

describe('resolveMobileNotebookSwipe', () => {
  it('keeps the current page after a small slow drag', () => {
    expect(resolveMobileNotebookSwipe(-50, 320, true, true, 500)).toBe(0);
    expect(resolveMobileNotebookSwipe(50, 320, true, true, 500)).toBe(0);
  });

  it('turns after roughly one fifth of the page in either direction', () => {
    expect(resolveMobileNotebookSwipe(-72, 320, true, true, 500)).toBe(1);
    expect(resolveMobileNotebookSwipe(72, 320, true, true, 500)).toBe(-1);
  });

  it('accepts a short fast flick without requiring the distance threshold', () => {
    expect(resolveMobileNotebookSwipe(-44, 320, true, true, 100)).toBe(1);
    expect(resolveMobileNotebookSwipe(44, 320, true, true, 100)).toBe(-1);
  });

  it('stays put when there is no page in the dragged direction', () => {
    expect(resolveMobileNotebookSwipe(200, 320, false, true)).toBe(0);
    expect(resolveMobileNotebookSwipe(-200, 320, true, false)).toBe(0);
  });
});
