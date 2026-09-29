import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MyDataPageComponent } from '../../components/my-data-page.component';
import { MyDataHeaderComponent } from '../../components/my-data-header.component';
import { MyDataCardComponent } from '../../components/my-data-card.component';
import { MyDataGridComponent, MyDataListControlsComponent, MyDataViewMode, readMyDataViewMode, saveMyDataViewMode } from '../../components/my-data-list.component';
import { PdfDocumentRecord, PdfDocumentService } from '../../services/pdf-document.service';
import { AuthService } from '../../services/auth.service';
import { LabService } from '../../services/lab.service';

@Component({
  selector: 'app-pdf-documents-page',
  standalone: true,
  imports: [CommonModule, MyDataPageComponent, MyDataHeaderComponent, MyDataCardComponent, MyDataGridComponent, MyDataListControlsComponent],
  template: `
    <app-my-data-page>
      <app-my-data-header title="PDF Editor (Beta)"></app-my-data-header>
      <app-my-data-list-controls [tabs]="[{value:'all',label:'All Data'},{value:'my',label:'My Data'},{value:'shared',label:'Shared with Me'}]" [activeTab]="activeTab" (tabChange)="setTab($event)"
        [sort]="sortMode" (sortChange)="sortMode=$event; sort()"
        [sortOptions]="[{value:'date-desc',label:'Newest first'},{value:'date-asc',label:'Oldest first'},{value:'name-asc',label:'Name A–Z'},{value:'name-desc',label:'Name Z–A'}]"
        [viewMode]="viewMode" (viewModeChange)="setViewMode($event)"></app-my-data-list-controls>
      <div class="loading" *ngIf="loading">Loading PDF documents…</div>
      <app-my-data-grid *ngIf="!loading && documents.length" [viewMode]="viewMode">
        <app-my-data-card *ngFor="let document of documents" [title]="document.title"
          [badges]="badges(document)" [meta]="meta(document)" [viewMode]="viewMode" [shared]="!!document.is_shared" [readOnly]="!isOwner(document) && !document.can_edit"
          primaryLabel="Open PDF" [showDelete]="isOwner(document)" [showShare]="isOwner(document)" [showPin]="false"
          (open)="open(document)" (share)="openShare(document)" (remove)="remove(document)">
          <div card-content *ngIf="document.is_shared" class="sharing-info">{{isOwner(document) ? 'Shared with: ' + (document.shared_with_labs || []).join(', ') : 'Shared by: ' + (document.shared_by_name || 'Lab member')}}</div>
        </app-my-data-card>
      </app-my-data-grid>
      <div class="empty" *ngIf="!loading && !documents.length">
        <h3>No PDF documents found</h3>
        <p>Save a document from PDF Editor to see it here.</p>
        <button type="button" (click)="newDocument()">Open PDF Editor</button>
      </div>
      <div *ngIf="sharingDocument" class="modal-overlay" (click)="closeShare()">
        <section class="share-modal" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-label="Share PDF document">
          <header><h2>Share PDF Document</h2><button type="button" (click)="closeShare()" aria-label="Close">×</button></header>
          <div class="modal-body">
            <p>Choose who can read or edit “<strong>{{sharingDocument.title}}</strong>”.</p>
            <div class="permission-tabs" role="tablist"><button type="button" [class.active]="sharingPermissionTab === 'read'" (click)="sharingPermissionTab='read'">Read only <span>{{selectedLabIds.length}}</span></button><button type="button" [class.active]="sharingPermissionTab === 'edit'" (click)="sharingPermissionTab='edit'">Edit <span>{{selectedEditLabIds.length}}</span></button></div>
            <small>{{sharingPermissionTab === 'read' ? 'Can open and save a copy, but cannot update the original.' : 'Can edit and update the original for everyone.'}}</small>
            <div class="labs-list"><label *ngFor="let lab of myLabs" [class.disabled]="!!lab.archive_deletion_at"><input type="checkbox" [checked]="isSelectedLab(lab.id)" [disabled]="!!lab.archive_deletion_at" (change)="toggleLab(lab.id)"><span>{{lab.lab_name}}</span><em>{{(lab.my_role || lab.role_in_lab) | titlecase}}</em></label></div>
            <p *ngIf="!myLabs.length" class="empty-labs">No labs available to share with.</p>
          </div>
          <footer><button type="button" class="secondary" (click)="closeShare()">Cancel</button><button type="button" class="primary" [disabled]="savingShares" (click)="saveShare()">{{savingShares ? 'Saving…' : 'Update Sharing'}}</button></footer>
        </section>
      </div>
    </app-my-data-page>
  `,
  styles: [`
    .loading,.empty{padding:48px 20px;text-align:center;color:var(--color-text-secondary)}
    .empty h3{margin:0 0 6px;color:var(--color-text-primary)}.empty p{margin:0 0 16px}
    .empty button{min-height:40px;padding:9px 16px;border:1px solid var(--color-primary);border-radius:8px;background:var(--color-primary);color:white;font-weight:700}
    .sharing-info{padding:10px 12px;border:1px solid var(--color-border-light);border-radius:8px;background:var(--color-surface-alt);color:var(--color-text-secondary);font-size:.82rem}.modal-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.55);backdrop-filter:blur(6px)}.share-modal{width:min(500px,100%);overflow:hidden;border-radius:18px;background:var(--color-surface);box-shadow:var(--shadow-xl)}.share-modal header{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid var(--color-border-light)}.share-modal h2{margin:0;font-size:1.15rem}.share-modal header button{width:34px;height:34px;border:1px solid var(--color-border-light);border-radius:50%;background:var(--color-surface-alt);font-size:1.2rem}.modal-body{padding:20px 24px}.modal-body>p{margin:0 0 16px;color:var(--color-text-secondary)}.permission-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;border:1px solid var(--color-border-light);border-radius:10px;background:var(--color-surface-alt)}.permission-tabs button{min-height:38px;border:0;border-radius:7px;background:transparent;color:var(--color-text-secondary);font-weight:700}.permission-tabs button.active{background:var(--color-surface);color:var(--color-primary);box-shadow:var(--shadow-xs)}.permission-tabs span{font-size:.72rem;opacity:.7}.modal-body>small{display:block;margin:8px 0 14px;color:var(--color-text-tertiary)}.labs-list{display:grid;gap:8px;max-height:280px;overflow:auto}.labs-list label{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:12px;border:1px solid var(--color-border);border-radius:9px}.labs-list label.disabled{opacity:.5}.labs-list input{width:18px;height:18px;accent-color:var(--color-primary)}.labs-list span{font-weight:700}.labs-list em{font-size:.72rem;color:var(--color-text-tertiary);font-style:normal}.share-modal footer{display:flex;justify-content:flex-end;gap:8px;padding:14px 24px;border-top:1px solid var(--color-border-light);background:var(--color-surface-alt)}.share-modal footer button{min-height:40px;padding:8px 16px;border-radius:8px;font-weight:700}.secondary{border:1px solid var(--color-border);background:var(--color-surface)}.primary{border:1px solid var(--color-primary);background:var(--color-primary);color:#fff}.empty-labs{text-align:center}.primary:disabled{opacity:.55}@media(max-width:600px){.modal-overlay{align-items:flex-end;padding:0}.share-modal{border-radius:16px 16px 0 0}.share-modal header,.modal-body,.share-modal footer{padding:14px 16px}.share-modal footer button{flex:1}}
  `]
})
export class PdfDocumentsPageComponent implements OnInit {
  documents: PdfDocumentRecord[] = [];
  loading = true;
  activeTab: 'all' | 'my' | 'shared' = 'all';
  sortMode: 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' = 'date-desc';
  viewMode: MyDataViewMode = readMyDataViewMode();
  sharingDocument: PdfDocumentRecord | null = null;
  myLabs: any[] = [];
  selectedLabIds: string[] = [];
  selectedEditLabIds: string[] = [];
  sharingPermissionTab: 'read' | 'edit' = 'read';
  savingShares = false;
  constructor(private service: PdfDocumentService, private router: Router, private cdr: ChangeDetectorRef, public auth: AuthService, private labs: LabService) {}
  async ngOnInit() { await this.load(); }
  async load() {
    this.loading = true;
    try { this.documents = await this.service.list(this.activeTab); this.sort(); }
    finally { this.loading = false; this.cdr.detectChanges(); }
  }
  sort() {
    this.documents = [...this.documents].sort((a, b) => {
      if (this.sortMode === 'name-asc') return a.title.localeCompare(b.title);
      if (this.sortMode === 'name-desc') return b.title.localeCompare(a.title);
      const delta = Date.parse(a.updated_at) - Date.parse(b.updated_at);
      return this.sortMode === 'date-asc' ? delta : -delta;
    });
  }
  setViewMode(mode: MyDataViewMode) { this.viewMode = mode; saveMyDataViewMode(mode); }
  setTab(tab: 'all' | 'my' | 'shared') { this.activeTab = tab; void this.load(); }
  isOwner(document: PdfDocumentRecord) { return String(document.owner_user_id) === String(this.auth.currentProfile?.id); }
  badges(document: PdfDocumentRecord): any[] { return [...(this.isOwner(document) ? [{label:'OWNER',tone:'owner'}] : []), ...(document.is_shared ? [{label:'SHARED',tone:'shared'}] : [])]; }
  meta(document: PdfDocumentRecord) { return [`📅 ${new Date(document.updated_at || document.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}`, '📄 PDF document']; }
  open(document: PdfDocumentRecord) { this.router.navigate(['/tools/pdf-editor'], { queryParams: { document: document.id } }); }
  newDocument() { this.router.navigate(['/tools/pdf-editor']); }
  async remove(document: PdfDocumentRecord) {
    if (!confirm(`Delete “${document.title}”?`)) return;
    await this.service.delete(document.id); await this.load();
  }
  async openShare(document: PdfDocumentRecord) { this.sharingDocument = document; this.sharingPermissionTab = 'read'; const [shares, labs] = await Promise.all([this.service.getShares(document.id), this.labs.getMyLabs()]); this.selectedLabIds = shares.read_only_lab_ids || []; this.selectedEditLabIds = shares.edit_lab_ids || []; this.myLabs = labs; this.cdr.detectChanges(); }
  closeShare() { this.sharingDocument = null; this.selectedLabIds = []; this.selectedEditLabIds = []; }
  isSelectedLab(id:string) { return (this.sharingPermissionTab === 'edit' ? this.selectedEditLabIds : this.selectedLabIds).includes(String(id)); }
  toggleLab(id:string) { id=String(id); const selected=this.isSelectedLab(id); if(this.sharingPermissionTab==='edit'){this.selectedEditLabIds=selected?this.selectedEditLabIds.filter(item=>item!==id):[...this.selectedEditLabIds,id];if(!selected)this.selectedLabIds=this.selectedLabIds.filter(item=>item!==id);}else{this.selectedLabIds=selected?this.selectedLabIds.filter(item=>item!==id):[...this.selectedLabIds,id];if(!selected)this.selectedEditLabIds=this.selectedEditLabIds.filter(item=>item!==id);} }
  async saveShare() { if(!this.sharingDocument)return;this.savingShares=true;try{await this.service.updateShares(this.sharingDocument.id,this.selectedLabIds,this.selectedEditLabIds);this.closeShare();await this.load();}finally{this.savingShares=false;this.cdr.detectChanges();} }
}
