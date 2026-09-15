import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector:'app-my-data-list-controls', standalone:true, imports:[CommonModule, FormsModule],
  template:`
    <div class="controls">
      <div *ngIf="tabs.length" class="tabs" role="tablist" aria-label="Saved data filter">
        <button *ngFor="let tab of tabs" role="tab" [attr.aria-selected]="activeTab === tab.value" [class.active]="activeTab === tab.value" (click)="tabChange.emit(tab.value)">{{tab.label}}</button>
      </div>
      <div class="actions" *ngIf="searchable || sortOptions.length || createLabel">
        <input *ngIf="searchable" type="search" [ngModel]="query" (ngModelChange)="queryChange.emit($event)" placeholder="Search" aria-label="Search saved data">
        <label *ngIf="sortOptions.length"><select [ngModel]="sort" (ngModelChange)="sortChange.emit($event)" aria-label="Sort saved data"><option *ngFor="let option of sortOptions" [value]="option.value">{{option.label}}</option></select></label>
        <button *ngIf="createLabel" class="create" (click)="create.emit()">{{createLabel}}</button>
      </div>
    </div>`,
  styles:[`
    :host{display:block;margin-bottom:var(--space-4)}
    .controls{display:flex;flex-direction:column;gap:12px}
    .tabs{display:flex;border-bottom:1px solid var(--color-border)}
    .tabs button{flex:1;min-width:0;padding:10px var(--space-6);border:0;border-bottom:2px solid transparent;background:none;font-family:var(--font-sans);font-weight:var(--fw-semi);font-size:var(--text-base);color:var(--color-text-secondary);cursor:pointer}
    .tabs button.active{color:var(--color-primary);border-bottom-color:var(--color-primary)}
    .actions{display:flex;gap:8px;align-items:center}
    .actions label{flex:1;min-width:0;margin:0}
    .actions input,.actions select,.create{box-sizing:border-box;height:40px;min-height:40px;margin:0;padding:8px 12px;border:1px solid var(--color-border);border-radius:var(--radius-md);font-family:var(--font-sans);font-size:var(--text-sm);line-height:1.2}
    .actions input{flex:1;min-width:0;background:var(--color-surface)}
    .actions select{width:100%;background:var(--color-surface)}
    .create{border:0;background:var(--color-primary);color:white;font-weight:var(--fw-bold);cursor:pointer;white-space:nowrap}
    @media(max-width:600px){:host{margin-bottom:12px}.tabs button{font-size:.72rem;line-height:1.15;padding:9px 4px}.actions{flex-wrap:wrap}.actions input{flex-basis:100%;width:100%}.actions input,.actions select,.create{height:36px;min-height:36px;font-size:.76rem}.create{min-width:72px}}
  `]
})
export class MyDataListControlsComponent {
  @Input() tabs: {value:string;label:string}[] = [];
  @Input() activeTab = '';
  @Input() sort = '';
  @Input() query = '';
  @Input() searchable = false;
  @Input() createLabel = '';
  @Input() sortOptions: {value:string;label:string}[] = [];
  @Output() tabChange = new EventEmitter<any>();
  @Output() sortChange = new EventEmitter<any>();
  @Output() queryChange = new EventEmitter<string>();
  @Output() create = new EventEmitter<void>();
}

@Component({selector:'app-my-data-grid',standalone:true,template:'<ng-content></ng-content>',styles:[`
  :host{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:var(--space-6)}@media(max-width:720px){:host{grid-template-columns:1fr;gap:10px}}
`]})
export class MyDataGridComponent {}
