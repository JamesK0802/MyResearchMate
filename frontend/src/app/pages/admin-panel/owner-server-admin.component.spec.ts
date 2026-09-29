import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { OwnerServerAdminComponent } from './owner-server-admin.component';

describe('owner server data explorer', () => {
  it('groups managed tables and filters them without flattening the database list', () => {
    const page = new OwnerServerAdminComponent({} as any, { detectChanges() {} } as any, { onDestroy() {} } as any);
    page.tables = [
      {name:'crispr_results',display_name:'Crispr Results',group:'Research data',kind:'entity',row_count:4,managed:true,columns:[]},
      {name:'crispr_result_shares',display_name:'Crispr Result Shares',group:'Access & sharing',kind:'relation',row_count:6,managed:true,columns:[]},
      {name:'unused_table',display_name:'Unused Table',group:'Legacy',kind:'legacy',row_count:1,managed:false,columns:[]},
    ];
    expect(page.groupedTables.map(group => group.name)).toEqual(['Research data','Access & sharing']);
    page.tableGroup='Access & sharing';
    expect(page.filteredTables.map(table => table.name)).toEqual(['crispr_result_shares']);
  });

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
