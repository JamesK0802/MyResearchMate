import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatabaseTableSummary, ServerAdminService, ServerDataEntry } from '../../services/server-admin.service';

@Component({
  selector: 'app-owner-server-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './owner-server-admin.component.html',
  styleUrl: './owner-server-admin.component.css',
})
export class OwnerServerAdminComponent implements OnInit, OnChanges {
  @Input() view: 'data' | 'database' = 'data';
  loading = false;
  actionBusy = false;
  error = '';
  notice = '';
  path = '';
  parent = '';
  entries: ServerDataEntry[] = [];
  backups: ServerDataEntry[] = [];
  restoreFile: File | null = null;
  tables: DatabaseTableSummary[] = [];
  selectedTable = '';
  preview: any = null;

  constructor(public server: ServerAdminService) {}

  ngOnInit(): void { this.loadCurrentView(); }
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['view']?.firstChange) this.loadCurrentView();
  }

  async loadCurrentView(): Promise<void> {
    if (this.view === 'data') await Promise.all([this.loadData(this.path), this.loadBackups()]);
    else await this.loadTables();
  }

  async loadData(path = ''): Promise<void> {
    this.loading = true; this.error = '';
    try {
      const result = await this.server.listData(path);
      this.path = result.path; this.parent = result.parent; this.entries = result.entries;
    } catch (error: any) { this.error = this.message(error, 'Could not read the server data folder.'); }
    finally { this.loading = false; }
  }

  async loadBackups(): Promise<void> {
    try { this.backups = await this.server.listBackups(); }
    catch (error: any) { this.error = this.message(error, 'Could not load server backups.'); }
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
    } catch (error: any) { this.notice = ''; this.error = this.message(error, 'Backup failed.'); }
    finally { this.actionBusy = false; }
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
    } catch (error: any) { this.notice = ''; this.error = this.message(error, 'Restore failed. Current files may require checking.'); }
    finally { this.actionBusy = false; }
  }

  async loadTables(): Promise<void> {
    this.loading = true; this.error = '';
    try {
      this.tables = await this.server.listTables();
      if (!this.selectedTable && this.tables.length) this.selectedTable = this.tables[0].name;
      if (this.selectedTable) await this.selectTable(this.selectedTable);
    } catch (error: any) { this.error = this.message(error, 'Could not inspect the database.'); }
    finally { this.loading = false; }
  }

  async selectTable(name: string, offset = 0): Promise<void> {
    if (!name) return;
    this.selectedTable = name; this.loading = true; this.error = '';
    try { this.preview = await this.server.previewTable(name, offset); }
    catch (error: any) { this.error = this.message(error, 'Could not preview this table.'); }
    finally { this.loading = false; }
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
  private message(error: any, fallback: string): string { return error?.error?.detail || fallback; }
}
