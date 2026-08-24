import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectExplorerComponent } from '../../components/sequence-workspace/project-explorer.component';
import { MainViewerComponent } from '../../components/sequence-workspace/main-viewer.component';
import { ItemInspectorComponent } from '../../components/sequence-workspace/item-inspector.component';
import { SequenceWorkspaceService } from '../../services/sequence-workspace.service';
import { AuthService } from '../../services/auth.service';
import { StorageUsageComponent } from '../../components/storage-usage.component';

@Component({
  selector: 'app-sequence-workspace-page',
  standalone: true,
  imports: [
    CommonModule, 
    ProjectExplorerComponent, 
    MainViewerComponent, 
    ItemInspectorComponent,
    StorageUsageComponent
  ],
  template: `
    <div class="sequence-workspace-page">
      <header class="storage-bar">
        <span class="storage-title">Sequence Viewer</span>
        <app-storage-usage *ngIf="(auth.session$ | async) && !auth.isDemo" scope="personal" label="Cloud storage"></app-storage-usage>
        <span *ngIf="!(auth.session$ | async) || auth.isDemo" class="storage-usage muted">Sign in to save files to your account</span>
      </header>
      <div class="workspace-container">
      <!-- Collapsible Explorer Left Sidebar -->
      <div class="panel explorer-panel" *ngIf="!isSidebarCollapsed">
        <app-project-explorer (collapse)="toggleSidebar()"></app-project-explorer>
      </div>

      <!-- Expand Floating Button when Collapsed -->
      <button type="button" class="btn-expand-sidebar" *ngIf="isSidebarCollapsed" (click)="toggleSidebar()" title="Expand Project Explorer">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>

      <div class="panel viewer-panel">
        <app-main-viewer [isSidebarCollapsed]="isSidebarCollapsed"></app-main-viewer>
      </div>

      <div class="panel inspector-panel" *ngIf="(workspace.selectedItem$ | async)?.type !== 'fastq'">
        <app-item-inspector></app-item-inspector>
      </div>
      </div>
    </div>
  `,
  styles: [`
    .sequence-workspace-page { display: flex; flex-direction: column; height: calc(100vh - 56px); width: 100%; background: var(--color-background); overflow: hidden; }
    .storage-bar { height: 34px; padding: 0 14px; flex: 0 0 34px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-border); background: var(--color-surface); box-sizing: border-box; }
    .storage-title { color: var(--color-text-primary); font-size: 0.82rem; font-weight: 800; }
    .storage-usage { color: var(--color-primary); font-size: 0.78rem; font-weight: 700; }
    .storage-usage.muted { color: var(--color-text-tertiary); font-weight: 600; }
    .workspace-container {
      display: flex;
      flex-direction: row;
      flex: 1;
      min-height: 0;
      width: 100%;
      background: var(--color-background);
      overflow: hidden;
      position: relative;
    }
    .panel {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    app-project-explorer, app-main-viewer, app-item-inspector {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .explorer-panel {
      flex: 0 0 250px;
      border-right: 1px solid var(--color-border);
      background: var(--color-surface);
    }
    .btn-expand-sidebar {
      position: absolute;
      top: 5px;
      left: 6px;
      z-index: 10;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      color: #334155;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      transition: all 0.2s ease;
    }
    .btn-expand-sidebar:hover {
      background: #f1f5f9;
      color: #2563eb;
      border-color: #93c5fd;
    }
    .viewer-panel {
      flex: 1;
      background: #ffffff;
      min-width: 0;
    }
    .inspector-panel {
      flex: 0 0 300px;
      border-left: 1px solid var(--color-border);
      background: var(--color-surface);
    }
  `]
})
export class SequenceWorkspacePageComponent {
  isSidebarCollapsed = false;

  constructor(public workspace: SequenceWorkspaceService, public auth: AuthService) {}

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(index >= 3 ? 2 : 0)} ${units[index]}`;
  }

  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }
}
