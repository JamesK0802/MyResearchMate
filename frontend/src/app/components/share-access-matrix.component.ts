import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-share-access-matrix', standalone: true, imports: [CommonModule],
  template: `
    <div class="tabs"><button type="button" [class.active]="tab==='labs'" (click)="tab='labs'">Labs <span>{{viewLabIds.length}}</span></button><button type="button" [class.active]="tab==='users'" (click)="tab='users'">Users <span>{{viewUserIds.length}}</span></button></div>
    <div class="matrix" [class.view-only]="!allowEdit">
      <div class="head"><span></span><span>View</span><span *ngIf="allowEdit">Edit</span></div>
      <div class="row" *ngFor="let item of tab==='labs' ? labs : users" [class.disabled]="tab==='labs' && item.archive_deletion_at">
        <div><strong>{{tab==='labs' ? (item.lab_name || item.name) : (item.name || item.email)}}</strong><small>{{tab==='labs' ? (item.my_role || item.role_in_lab || '') : item.email}}</small></div>
        <input type="checkbox" [checked]="has(item.id,'view')" [disabled]="tab==='labs' && item.archive_deletion_at" (change)="change.emit({kind:tab,id:''+item.id,permission:'view',checked:$any($event.target).checked})" aria-label="View access">
        <input *ngIf="allowEdit" type="checkbox" [checked]="has(item.id,'edit')" [disabled]="tab==='labs' && item.archive_deletion_at" (change)="change.emit({kind:tab,id:''+item.id,permission:'edit',checked:$any($event.target).checked})" aria-label="Edit access">
      </div>
      <p *ngIf="!(tab==='labs' ? labs : users).length">No {{tab}} available.</p>
    </div>`,
  styles:[`.tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:10px;padding:4px;border:1px solid var(--color-border-light);border-radius:10px;background:var(--color-surface-alt)}.tabs button{min-height:38px;border:0;border-radius:7px;background:transparent;color:var(--color-text-secondary);font-weight:700}.tabs button.active{background:var(--color-surface);color:var(--color-primary);box-shadow:var(--shadow-xs)}.tabs span{font-size:.72rem;opacity:.7}.matrix{border:1px solid var(--color-border);border-radius:12px;overflow:auto;max-height:300px}.head,.row{display:grid;grid-template-columns:minmax(0,1fr) 64px 64px;align-items:center}.view-only .head,.view-only .row{grid-template-columns:minmax(0,1fr) 64px}.head{min-height:36px;background:var(--color-surface-alt);font-size:.72rem;font-weight:800;text-align:center;color:var(--color-text-secondary)}.row{min-height:54px;padding:6px 0 6px 14px;border-top:1px solid var(--color-border-light)}.row>div{min-width:0;display:flex;flex-direction:column}.row strong,.row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row small{font-size:.7rem;color:var(--color-text-tertiary)}.row input{width:18px;height:18px;justify-self:center;accent-color:var(--color-primary)}.row.disabled{opacity:.5}.matrix>p{text-align:center;color:var(--color-text-tertiary);padding:14px}`]
})
export class ShareAccessMatrixComponent {
  @Input() labs:any[]=[]; @Input() users:any[]=[]; @Input() allowEdit=true;
  @Input() viewLabIds:string[]=[]; @Input() editLabIds:string[]=[]; @Input() viewUserIds:string[]=[]; @Input() editUserIds:string[]=[];
  @Output() change=new EventEmitter<{kind:'labs'|'users';id:string;permission:'view'|'edit';checked:boolean}>();
  tab:'labs'|'users'='labs';
  has(id:any, permission:'view'|'edit'){const source=this.tab==='labs'?(permission==='view'?this.viewLabIds:this.editLabIds):(permission==='view'?this.viewUserIds:this.editUserIds);return source.includes(String(id));}
}
