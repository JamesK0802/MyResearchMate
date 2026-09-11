import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatabaseTableSummary, ServerAdminService, ServerDataEntry, ServerOperationStatus } from '../../services/server-admin.service';

@Component({
  selector: 'app-owner-server-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './owner-server-admin.component.html',
  styleUrl: './owner-server-admin.component.css',
})
export class OwnerServerAdminComponent implements OnInit, OnChanges {
  @Input() view: 'data' | 'database' = 'data';
  dataLoading = false;
  backupsLoading = false;
  databaseLoading = false;
  actionBusy = false;
  error = '';
  notice = '';
  path = '';
  parent = '';
  entries: ServerDataEntry[] = [];
  backups: ServerDataEntry[] = [];
  restoreFile: File | null = null;
  deletingBackupName = '';
  serverOperation: ServerOperationStatus = { active: false };
  private operationStatusLoading = false;
  private operationPollTimer: number | null = null;
  tables: DatabaseTableSummary[] = [];
  selectedTable = '';
  preview: any = null;
  rootDirectories: ServerDataEntry[] = [];
  tableSearch = '';
  showEmptyTables = false;
  showLegacyTables = false;
  wrapCells = false;
  refreshedAt: Date | null = null;
  selectedDataRoots = new Set<string>();
  selectedLegacyTables = new Set<string>();
  selectedLegacyColumns = new Set<string>();

  constructor(public server: ServerAdminService, private cdr: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  get loading(): boolean { return this.dataLoading || this.backupsLoading || this.databaseLoading; }
  get serverBusy(): boolean { return this.actionBusy || this.serverOperation.active; }
  get managedTableCount(): number { return this.tables.filter(table => table.managed).length; }
  get legacyTableCount(): number { return this.tables.filter(table => !table.managed).length; }
  get emptyTableCount(): number { return this.tables.filter(table => table.row_count === 0).length; }
  get filteredTables(): DatabaseTableSummary[] {
    const query = this.tableSearch.trim().toLowerCase();
    return this.tables.filter(table =>
      (this.showLegacyTables || table.managed) &&
      (this.showEmptyTables || table.row_count > 0) &&
      (!query || table.name.toLowerCase().includes(query))
    );
  }
  get cleanupSelectionCount(): number {
    return this.selectedDataRoots.size + this.selectedLegacyTables.size + this.selectedLegacyColumns.size;
  }

  ngOnInit(): void {
    this.loadCurrentView();
    void this.loadServerOperation();
    this.operationPollTimer = window.setInterval(() => void this.loadServerOperation(), 2000);
    this.destroyRef.onDestroy(() => {
      if (this.operationPollTimer !== null) window.clearInterval(this.operationPollTimer);
    });
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['view']?.firstChange) this.loadCurrentView();
  }

  async loadCurrentView(): Promise<void> {
    if (this.view === 'data') await Promise.all([this.loadData(this.path), this.loadBackups(), this.loadRootDirectories()]);
    else await this.loadTables();
  }

  async loadData(path = ''): Promise<void> {
    this.dataLoading = true; this.error = ''; this.syncView();
    try {
      const result = await this.server.listData(path);
      this.path = result.path; this.parent = result.parent; this.entries = result.entries;
    } catch (error: any) { this.error = this.message(error, 'Could not read the server data folder.'); }
    finally { this.dataLoading = false; this.refreshedAt = new Date(); this.syncView(); }
  }

  async loadRootDirectories(): Promise<void> {
    try {
      const result = await this.server.listData('');
      this.rootDirectories = result.entries.filter(entry => entry.kind === 'directory');
      this.selectedDataRoots = new Set([...this.selectedDataRoots].filter(name => this.rootDirectories.some(entry => entry.name === name && !entry.managed)));
    } catch (error: any) { this.error = this.message(error, 'Could not load data locations.'); }
    finally { this.syncView(); }
  }

  async loadBackups(): Promise<void> {
    this.backupsLoading = true; this.syncView();
    try { this.backups = await this.server.listBackups(); }
    catch (error: any) { this.error = this.message(error, 'Could not load server backups.'); }
    finally { this.backupsLoading = false; this.syncView(); }
  }

  async loadServerOperation(): Promise<void> {
    if (this.operationStatusLoading) return;
    this.operationStatusLoading = true;
    const wasActive = this.serverOperation.active;
    try {
      this.serverOperation = await this.server.operationStatus();
      if (wasActive && !this.serverOperation.active && this.view === 'data') {
        await Promise.all([this.loadBackups(), this.loadData(this.path), this.loadRootDirectories()]);
      }
    } catch {
      // The inspector remains usable when status polling is temporarily unavailable.
    } finally {
      this.operationStatusLoading = false;
      this.syncView();
    }
  }

  operationElapsed(): string {
    if (!this.serverOperation.started_at) return '';
    const seconds = Math.max(1, Math.floor((Date.now() - new Date(this.serverOperation.started_at).getTime()) / 1000));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  private async showActionError(error: any, fallback: string): Promise<void> {
    await this.loadServerOperation();
    this.notice = '';
    this.error = this.serverOperation.active ? '' : this.message(error, fallback);
  }

  open(entry: ServerDataEntry): void {
    if (entry.kind === 'directory') this.loadData(entry.path);
    else this.server.downloadData(entry).catch(error => this.error = this.message(error, 'Could not download this file.'));
  }

  crumbs(): { label: string; path: string }[] {
    const parts = this.path.split('/').filter(Boolean);
    return [{ label: 'data', path: '' }, ...parts.map((part, index) => ({ label: part, path: parts.slice(0, index + 1).join('/') }))];
  }

  async createBackup(): Promise<void> {
    this.actionBusy = true; this.error = ''; this.notice = 'Creating a complete server backup…';
    try {
      const backup = await this.server.createBackup();
      this.notice = `Backup created: ${backup.name}`;
      await this.loadBackups();
    } catch (error: any) { await this.showActionError(error, 'Backup failed.'); }
    finally { this.actionBusy = false; this.syncView(); }
  }

  chooseRestore(event: Event): void {
    this.restoreFile = (event.target as HTMLInputElement).files?.[0] || null;
  }

  async restore(): Promise<void> {
    if (!this.restoreFile) return;
    const warning = 'Restore will replace the current database, data folder, and server environment. A safety backup will be created first. Continue?';
    if (!confirm(warning)) return;
    this.actionBusy = true; this.error = ''; this.notice = 'Validating and restoring the server…';
    try {
      const result = await this.server.restore(this.restoreFile);
      this.notice = `${result.message} Safety backup: ${result.safety_backup}`;
      this.restoreFile = null;
      await Promise.all([this.loadBackups(), this.loadData('')]);
    } catch (error: any) { await this.showActionError(error, 'Restore failed. Current files may require checking.'); }
    finally { this.actionBusy = false; this.syncView(); }
  }

  async deleteBackup(backup: ServerDataEntry): Promise<void> {
    if (this.actionBusy || !confirm(`Permanently delete backup “${backup.name}”? This cannot be undone.`)) return;
    this.actionBusy = true; this.deletingBackupName = backup.name; this.error = ''; this.notice = 'Deleting server backup…'; this.syncView();
    try {
      await this.server.deleteBackup(backup);
      this.backups = this.backups.filter(item => item.name !== backup.name);
      this.notice = `Backup deleted: ${backup.name}`;
    } catch (error: any) {
      await this.showActionError(error, 'The backup could not be deleted.');
    } finally {
      this.actionBusy = false; this.deletingBackupName = ''; this.syncView();
    }
  }

  async loadTables(): Promise<void> {
    this.databaseLoading = true; this.error = ''; this.syncView();
    try {
      this.tables = await this.server.listTables();
      const preferred = this.tables.find(table => table.managed && table.row_count > 0) || this.tables.find(table => table.managed) || this.tables[0];
      if (!this.selectedTable || !this.filteredTables.some(table => table.name === this.selectedTable)) this.selectedTable = preferred?.name || '';
      if (this.selectedTable) await this.selectTable(this.selectedTable);
    } catch (error: any) { this.error = this.message(error, 'Could not inspect the database.'); }
    finally { this.databaseLoading = false; this.refreshedAt = new Date(); this.syncView(); }
  }

  async selectTable(name: string, offset = 0): Promise<void> {
    if (!name) return;
    this.selectedTable = name; this.databaseLoading = true; this.error = ''; this.syncView();
    try { this.preview = await this.server.previewTable(name, offset); }
    catch (error: any) { this.error = this.message(error, 'Could not preview this table.'); }
    finally { this.databaseLoading = false; this.syncView(); }
  }

  refreshData(): void { void Promise.all([this.loadData(this.path), this.loadBackups(), this.loadRootDirectories()]); }
  refreshDatabase(): void { void this.loadTables(); }
  toggleEmptyTables(): void { this.showEmptyTables = !this.showEmptyTables; this.ensureVisibleSelection(); }
  toggleLegacyTables(): void { this.showLegacyTables = !this.showLegacyTables; this.ensureVisibleSelection(); }
  private ensureVisibleSelection(): void {
    if (!this.filteredTables.some(table => table.name === this.selectedTable)) {
      const next = this.filteredTables[0];
      if (next) void this.selectTable(next.name);
    }
  }
  toggleDataRoot(entry: ServerDataEntry): void {
    if (entry.managed) return;
    this.toggleSet(this.selectedDataRoots, entry.name);
  }
  toggleLegacyTable(table: DatabaseTableSummary): void {
    if (table.managed) return;
    this.toggleSet(this.selectedLegacyTables, table.name);
  }
  toggleLegacyColumn(table: string, column: string): void {
    this.toggleSet(this.selectedLegacyColumns, `${table}.${column}`);
  }
  async cleanupSelected(): Promise<void> {
    if (!this.cleanupSelectionCount) return;
    const warning = `Permanently remove ${this.cleanupSelectionCount} selected legacy item(s)? A complete safety backup will be created first.`;
    if (!confirm(warning)) return;
    this.actionBusy = true; this.error = ''; this.notice = 'Creating a safety backup and cleaning legacy data…'; this.syncView();
    try {
      const result = await this.server.cleanup({
        data_roots: [...this.selectedDataRoots],
        tables: [...this.selectedLegacyTables],
        columns: [...this.selectedLegacyColumns].map(value => {
          const separator = value.indexOf('.');
          return { table: value.slice(0, separator), column: value.slice(separator + 1) };
        }),
      });
      this.notice = `${result.message} Safety backup: ${result.safety_backup}`;
      this.selectedDataRoots.clear(); this.selectedLegacyTables.clear(); this.selectedLegacyColumns.clear();
      await this.loadCurrentView();
    } catch (error: any) { await this.showActionError(error, 'Cleanup failed. Nothing was removed unless a safety backup completed.'); }
    finally { this.actionBusy = false; this.syncView(); }
  }
  private toggleSet(values: Set<string>, value: string): void {
    values.has(value) ? values.delete(value) : values.add(value);
    this.syncView();
  }

  tableSummary(name: string): DatabaseTableSummary | undefined { return this.tables.find(table => table.name === name); }
  formatBytes(bytes: number | null): string {
    if (bytes === null) return 'Folder';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }
  displayCell(value: any): string {
    if (value === null || value === undefined) return '—';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  }
  pageEnd(): number { return Math.min(this.preview.offset + this.preview.limit, this.preview.total); }
  private syncView(): void { if (!this.destroyRef.destroyed) this.cdr.detectChanges(); }
  private message(error: any, fallback: string): string { return error?.error?.detail || fallback; }
}
