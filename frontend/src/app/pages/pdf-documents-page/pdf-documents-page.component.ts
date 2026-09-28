import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MyDataPageComponent } from '../../components/my-data-page.component';
import { MyDataHeaderComponent } from '../../components/my-data-header.component';
import { MyDataCardComponent } from '../../components/my-data-card.component';
import { MyDataGridComponent, MyDataListControlsComponent, MyDataViewMode, readMyDataViewMode, saveMyDataViewMode } from '../../components/my-data-list.component';
import { PdfDocumentRecord, PdfDocumentService } from '../../services/pdf-document.service';

@Component({
  selector: 'app-pdf-documents-page',
  standalone: true,
  imports: [CommonModule, MyDataPageComponent, MyDataHeaderComponent, MyDataCardComponent, MyDataGridComponent, MyDataListControlsComponent],
  template: `
    <app-my-data-page>
      <app-my-data-header title="PDF Editor (Beta)"></app-my-data-header>
      <app-my-data-list-controls [tabs]="[{value:'my',label:'My Data'}]" activeTab="my"
        [sort]="sortMode" (sortChange)="sortMode=$event; sort()"
        [sortOptions]="[{value:'date-desc',label:'Newest first'},{value:'date-asc',label:'Oldest first'},{value:'name-asc',label:'Name A–Z'},{value:'name-desc',label:'Name Z–A'}]"
        [viewMode]="viewMode" (viewModeChange)="setViewMode($event)"></app-my-data-list-controls>
      <div class="loading" *ngIf="loading">Loading PDF documents…</div>
      <app-my-data-grid *ngIf="!loading && documents.length" [viewMode]="viewMode">
        <app-my-data-card *ngFor="let document of documents" [title]="document.title"
          [badges]="[{label:'OWNER',tone:'owner'}]" [meta]="meta(document)" [viewMode]="viewMode"
          primaryLabel="Open PDF" [showDelete]="true" [showShare]="false" [showPin]="false"
          (open)="open(document)" (remove)="remove(document)"></app-my-data-card>
      </app-my-data-grid>
      <div class="empty" *ngIf="!loading && !documents.length">
        <h3>No PDF documents found</h3>
        <p>Save a document from PDF Editor to see it here.</p>
        <button type="button" (click)="newDocument()">Open PDF Editor</button>
      </div>
    </app-my-data-page>
  `,
  styles: [`
    .loading,.empty{padding:48px 20px;text-align:center;color:var(--color-text-secondary)}
    .empty h3{margin:0 0 6px;color:var(--color-text-primary)}.empty p{margin:0 0 16px}
    .empty button{min-height:40px;padding:9px 16px;border:1px solid var(--color-primary);border-radius:8px;background:var(--color-primary);color:white;font-weight:700}
  `]
})
export class PdfDocumentsPageComponent implements OnInit {
  documents: PdfDocumentRecord[] = [];
  loading = true;
  sortMode: 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' = 'date-desc';
  viewMode: MyDataViewMode = readMyDataViewMode();
  constructor(private service: PdfDocumentService, private router: Router, private cdr: ChangeDetectorRef) {}
  async ngOnInit() { await this.load(); }
  async load() {
    this.loading = true;
    try { this.documents = await this.service.list(); this.sort(); }
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
  meta(document: PdfDocumentRecord) { return [`📅 ${new Date(document.updated_at || document.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}`, '📄 PDF document']; }
  open(document: PdfDocumentRecord) { this.router.navigate(['/tools/pdf-editor'], { queryParams: { document: document.id } }); }
  newDocument() { this.router.navigate(['/tools/pdf-editor']); }
  async remove(document: PdfDocumentRecord) {
    if (!confirm(`Delete “${document.title}”?`)) return;
    await this.service.delete(document.id); await this.load();
  }
}
