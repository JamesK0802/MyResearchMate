import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector:'app-my-data-list-controls', standalone:true, imports:[CommonModule, FormsModule],
  template:`
    <div class="controls">
      <div class="tabs" role="tablist" aria-label="Saved data filter">
        <button *ngFor="let tab of tabs" role="tab" [attr.aria-selected]="activeTab === tab.value" [class.active]="activeTab === tab.value" (click)="tabChange.emit(tab.value)">{{tab.label}}</button>
      </div>
      <div class="actions">
        <input *ngIf="searchable" type="search" [ngModel]="query" (ngModelChange)="queryChange.emit($event)" placeholder="Search" aria-label="Search saved data">
        <label><select [ngModel]="sort" (ngModelChange)="sortChange.emit($event)" aria-label="Sort saved data"><option *ngFor="let option of sortOptions" [value]="option.value">{{option.label}}</option></select></label>
        <button *ngIf="createLabel" class="create" (click)="create.emit()">{{createLabel}}</button>
      </div>
    </div>`,
  styles:[`
    .controls .actions select,.controls .actions .create{height:42px;min-height:42px;box-sizing:border-box;margin:0;align-self:center}.controls .actions label{margin:0;align-self:center}
    @media(max-width:720px){.controls .actions{display:grid;grid-template-columns:minmax(0,1fr) auto}.controls .actions>input{grid-column:1/-1;width:100%;max-width:none}.controls .actions>label{min-width:0}.controls .actions select{width:100%;max-width:none;font-size:.85rem}.controls .actions .create{min-width:72px;white-space:nowrap}.controls .actions>label:only-child{grid-column:1/-1}}
    :host{display:block;margin-bottom:20px}.controls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.tabs{display:flex;border-bottom:1px solid var(--color-border);gap:4px}.tabs button{border:0;border-bottom:2px solid transparent;background:transparent;padding:12px;color:var(--color-text-secondary);font:inherit;cursor:pointer}.tabs button.active{color:var(--color-primary);border-color:var(--color-primary);font-weight:700}.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.actions label{display:flex;gap:8px;align-items:center;font-size:.85rem}.actions input,.actions select{min-width:0;max-width:180px;padding:10px;border:1px solid var(--color-border);border-radius:8px;background:white;font:inherit}.create{padding:11px;border:0;border-radius:8px;background:var(--color-primary);color:white;font-weight:700;cursor:pointer}@media(max-width:720px){.controls,.tabs,.actions{width:100%}.tabs button{flex:1;padding:10px 6px;font-size:.8rem}.actions>*{flex:1}.actions input{max-width:100%;width:100px}.actions select{width:100%;max-width:100%}.create{min-height:42px}}
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
