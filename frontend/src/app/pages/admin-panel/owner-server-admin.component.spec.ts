import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { OwnerServerAdminComponent } from './owner-server-admin.component';

describe('owner server data explorer', () => {
  it('expands nested folders and exposes the root data size', async () => {
    const root = { name: 'lab', path: 'lab', kind: 'directory', size: null, item_count: 1, managed: true, modified_at: '' } as const;
    const child = { name: 'nicole', path: 'lab/nicole', kind: 'directory', size: null, item_count: 0, managed: true, modified_at: '' } as const;
    const server = {
      listData: vi.fn().mockImplementation(async (path: string) => path
        ? { path, parent: '', entries: [child], total_size: null }
        : { path: '', parent: '', entries: [root], total_size: 4096 }),
    };
    const page = new OwnerServerAdminComponent(server as any, { detectChanges() {} } as any, { onDestroy() {} } as any);

    await page.loadData('');
    await page.loadRootDirectories();
    expect(page.dataTotalSize).toBe(4096);
    expect(page.visibleDirectoryNodes.map(node => node.entry.path)).toEqual(['lab']);

    await page.toggleDirectoryNode(page.directoryTree[0]);
    expect(page.visibleDirectoryNodes.map(node => node.entry.path)).toEqual(['lab', 'lab/nicole']);
  });
});
