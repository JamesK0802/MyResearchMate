import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export type MyDataViewMode = 'card' | 'list';

const MY_DATA_VIEW_STORAGE_KEY = 'mrm-my-data-view-mode';

export function readMyDataViewMode(): MyDataViewMode {
  try {
    return localStorage.getItem(MY_DATA_VIEW_STORAGE_KEY) === 'list' ? 'list' : 'card';
  } catch {
    return 'card';
  }
}

export function saveMyDataViewMode(mode: MyDataViewMode): void {
  try { localStorage.setItem(MY_DATA_VIEW_STORAGE_KEY, mode); } catch { /* Storage may be unavailable. */ }
}

@Component({
  selector:'app-my-data-list-controls', standalone:true, imports:[CommonModule, FormsModule],
  template:`
    <div class="controls">
      <div *ngIf="tabs.length" class="tabs" role="tablist" aria-label="Saved data filter">
        <button *ngFor="let tab of tabs" role="tab" [attr.aria-selected]="activeTab === tab.value" [class.active]="activeTab === tab.value" (click)="tabChange.emit(tab.value)">{{tab.label}}</button>
      </div>
      <div class="actions" *ngIf="searchable || sortOptions.length || createLabel || showViewToggle">
        <input *ngIf="searchable" type="search" [ngModel]="query" (ngModelChange)="queryChange.emit($event)" placeholder="Search" aria-label="Search saved data">
        <label *ngIf="sortOptions.length"><select [ngModel]="sort" (ngModelChange)="sortChange.emit($event)" aria-label="Sort saved data"><option *ngFor="let option of sortOptions" [value]="option.value">{{option.label}}</option></select></label>
        <button *ngIf="createLabel" class="create" (click)="create.emit()">{{createLabel}}</button>
        <div *ngIf="showViewToggle" class="view-toggle" role="group" aria-label="View layout">
          <button type="button" [class.active]="viewMode === 'card'" [attr.aria-pressed]="viewMode === 'card'" title="Card view" aria-label="Card view" (click)="selectView('card')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>
          </button>
          <button type="button" [class.active]="viewMode === 'list'" [attr.aria-pressed]="viewMode === 'list'" title="List view" aria-label="List view" (click)="selectView('list')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"></path><circle cx="4" cy="6" r="1"></circle><circle cx="4" cy="12" r="1"></circle><circle cx="4" cy="18" r="1"></circle></svg>
          </button>
        </div>
      </div>
    </div>`,
  styles:[`
    :host{display:block;margin-bottom:var(--space-4)}
    .controls{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;border-bottom:1px solid var(--color-border)}
    .tabs{display:flex;align-items:flex-end;gap:4px}
    .tabs button{flex:0 0 auto;min-width:0;margin-bottom:-1px;padding:10px var(--space-5);border:0;border-bottom:2px solid transparent;background:none;font-family:var(--font-sans);font-weight:var(--fw-semi);font-size:var(--text-base);color:var(--color-text-secondary);cursor:pointer}
    .tabs button.active{color:var(--color-primary);border-bottom-color:var(--color-primary)}
    .actions{display:flex;align-items:center;gap:8px;padding-bottom:7px}
    .actions label{flex:0 1 180px;min-width:140px;margin:0}
    .actions input,.actions select,.create{box-sizing:border-box;height:40px;min-height:40px;margin:0;padding:8px 12px;border:1px solid var(--color-border);border-radius:var(--radius-md);font-family:var(--font-sans);font-size:var(--text-sm);line-height:1.2}
    .actions input{width:min(260px,30vw);min-width:160px;background:var(--color-surface)}
    .actions select{width:100%;background:var(--color-surface)}
    .create{border:0;background:var(--color-primary);color:white;font-weight:var(--fw-bold);cursor:pointer;white-space:nowrap}
    .view-toggle{display:inline-flex;flex:none;height:40px;padding:3px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface-alt)}
    .view-toggle button{display:grid;place-items:center;width:34px;height:32px;padding:7px;border:0;border-radius:calc(var(--radius-md) - 3px);background:transparent;color:var(--color-text-secondary);cursor:pointer}
    .view-toggle button.active{background:var(--color-surface);color:var(--color-primary);box-shadow:var(--shadow-xs)}
    .view-toggle svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    @media(max-width:720px){
      :host{margin-bottom:12px}
      .controls{align-items:stretch;flex-direction:column;gap:8px;border-bottom:0}
      .tabs{width:100%;border-bottom:1px solid var(--color-border)}
      .tabs button{flex:1;font-size:.72rem;line-height:1.15;padding:9px 4px}
      .actions{display:grid;grid-template-columns:minmax(0,1fr) auto auto;width:100%;padding-bottom:0}
      .actions input{grid-column:1/-1;width:100%;min-width:0}
      .actions label{min-width:0}
      .actions label:only-child{grid-column:1/-1}
      .actions input,.actions select,.create{height:36px;min-height:36px;font-size:.76rem}
      .create{min-width:72px}
      .view-toggle{height:36px;margin-left:auto;padding:2px}.view-toggle button{width:32px;height:30px;padding:7px}
    }
  `]
})
export class MyDataListControlsComponent {
  @Input() tabs: {value:string;label:string}[] = [];
  @Input() activeTab = '';
  @Input() sort = '';
  @Input() query = '';
  @Input() searchable = false;
  @Input() createLabel = '';
  @Input() showViewToggle = true;
  @Input() viewMode: MyDataViewMode = 'card';
  @Input() sortOptions: {value:string;label:string}[] = [];
  @Output() tabChange = new EventEmitter<any>();
  @Output() sortChange = new EventEmitter<any>();
  @Output() queryChange = new EventEmitter<string>();
  @Output() create = new EventEmitter<void>();
  @Output() viewModeChange = new EventEmitter<MyDataViewMode>();

  selectView(mode: MyDataViewMode) {
    if (mode !== this.viewMode) this.viewModeChange.emit(mode);
  }
}

@Component({
  selector:'app-my-data-grid', standalone:true, imports:[CommonModule],
  template:`
    <div *ngIf="viewMode === 'list'" class="list-header" aria-hidden="true">
      <span>Name</span><span>Details</span><span>Sharing</span><span>Actions</span>
    </div>
    <ng-content></ng-content>
  `,
  host:{'[class.list-view]':"viewMode === 'list'"},
  styles:[`
    :host{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:var(--space-6)}
    :host.list-view{display:block;overflow:hidden;border:1px solid var(--color-border-light);border-radius:var(--radius-lg);background:var(--color-surface);box-shadow:var(--shadow-xs)}
    .list-header{display:grid;grid-template-columns:minmax(220px,1.35fr) minmax(170px,.75fr) minmax(190px,1fr) minmax(220px,auto);gap:16px;padding:8px 14px;border-bottom:1px solid var(--color-border-light);background:var(--color-surface-alt);color:var(--color-text-tertiary);font-size:.66rem;font-weight:850;letter-spacing:.055em;text-transform:uppercase}
    @media(max-width:720px){:host{grid-template-columns:1fr;gap:10px}}
    @media(max-width:720px){:host.list-view{border-radius:10px}.list-header{grid-template-columns:minmax(0,1fr) minmax(82px,.55fr) auto;gap:8px;padding:7px 10px}.list-header span:nth-child(3){display:none}}
    @media(max-width:460px){.list-header{grid-template-columns:minmax(0,1fr) auto}.list-header span:nth-child(2){display:none}}
  `]
})
export class MyDataGridComponent { @Input() viewMode: MyDataViewMode = 'card'; }
