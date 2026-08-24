import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LabService } from '../../services/lab.service';
import { LabArchiveService } from '../../services/lab-archive.service';
import { StorageUsageComponent } from '../../components/storage-usage.component';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

@Component({
  selector: 'app-lab-group-archive-page',
  standalone: true,
  imports: [CommonModule, FormsModule, StorageUsageComponent],
  templateUrl: './lab-group-archive-page.component.html',
  styleUrl: './lab-group-archive-page.component.css'
})
export class LabGroupArchivePageComponent implements OnInit, OnDestroy {
  labId = '';
  labName = '';
  archiveDeletionAt: string | null = null;
  isReadOnly = false;

  viewMode: 'card' | 'table' | 'explorer' = 'card';

  // Records
  records: any[] = [];
  filteredRecords: any[] = [];
  searchQuery = '';
  archiveColumnWidths = [18, 27, 25, 12, 18];

  // Samples
  samples: any[] = [];
  originalSamplesJson = '[]';
  isSavingSamples = false;
  showBulkPasteModal = false;
  bulkPasteText = '';
  selectedSampleForAttachments: any = null;
  showSampleAttachmentModal = false;
  sampleTempLink = '';
  draggedRowIndex: number | null = null;
  dragOverRowIndex: number | null = null;
  showSampleFilesModal = false;
  showAddLinkModal = false;
  showRecordLinkModal = false;
  recordLinkSearchQuery = '';
  filteredModalRecords: any[] = [];
  selectedSampleForRecordLink: any = null;
  newLinkUrl = '';
  linkFileTargetSample: any = null;
  showCreateRecordInline = false;
  inlineRecordData = { title: '', summary: '', description: '', links: [] as string[] };
  isCreatingInlineRecord = false;
  linkNewRecordToSample: any = null;
  showSpreadsheetDropdown = false;

  // Auto-save & Resize & Sort states
  syncState: 'saved' | 'saving' | 'error' = 'saved';
  private autoSaveSubject = new Subject<void>();
  private autoSaveSub!: Subscription;

  colWidths: number[] = [40, 40, 140, 110, 160, 120, 140, 120, 180, 180, 160, 45];
  resizingColumnIndex: number | null = null;
  resizeStartX = 0;
  resizeStartWidth = 0;
  resizeStartWidths: number[] = [];
  resizeTableWidth = 0;

  sortColumn: string | null = null;
  sortDirection: 'asc' | 'desc' = 'asc';
  filterQueries: { [key: string]: string } = {
    barcode: '',
    sample_name: '',
    person: '',
    project: '',
    lab: '',
    storage_location: '',
    record_link: '',
    files: '',
    links: ''
  };
  showFilterRow = false;

  // Explorer
  currentPath = '';
  fsItems: any[] = [];
  explorerSidebarCollapsed = false;
  sidebarWidth = 250;
  resizingSidebar = false;
  sidebarResizeStartX = 0;
  sidebarResizeStartWidth = 0;

  // Detail modal
  selectedRecord: any = null;
  newCommentText = '';
  isUploadingAttachment = false;

  // Create modal
  showNewModal = false;
  newRecord = { title: '', summary: '', description: '', links: [] as string[] };
  tempLink = '';
  pendingFiles: File[] = [];
  isCreating = false;

  // Explorer modals
  showUploadModal = false;
  selectedFile: File | null = null;
  isUploading = false;
  showMkdirModal = false;
  newFolderName = '';
  isCreatingFolder = false;
  isFsLoading = false;
  isDraggingPcFiles = false;
  dragCounter = 0;
  selectedItem: any = null;
  clipboardItem: { rel_path: string; is_dir: boolean; action: 'copy' | 'cut' } | null = null;

  // Renaming properties
  editingItem: any = null;
  editNameValue = '';

  // Link Existing File properties
  showLinkFileModal = false;
  linkFileCurrentPath = '';
  linkFileItems: any[] = [];
  linkFileTargetRecordId: string | null = null;
  pendingExistingFiles: string[] = [];

  // Record Editing properties
  showEditModal = false;
  editingRecordData = { id: '', title: '', summary: '', description: '', links: [] as string[], files: [] as any[] };
  editTempLink = '';
  isSavingEdit = false;
  isUploadingEditAttachment = false;

  // File Tree properties
  treeNodes: any[] = [];

  // Move Modal properties
  showMoveModal = false;
  movingItem: any = null;
  moveCurrentPath = '';
  moveFolders: any[] = [];
  isMovingItem = false;

  // Breadcrumb
  get breadcrumbs(): { name: string; path: string }[] {
    if (!this.currentPath) return [];
    const parts = this.currentPath.split('/');
    return parts.map((p, i) => ({
      name: p,
      path: parts.slice(0, i + 1).join('/')
    }));
  }

  get moveBreadcrumbs(): { name: string; path: string }[] {
    if (!this.moveCurrentPath) return [];
    const parts = this.moveCurrentPath.split('/');
    return parts.map((p, i) => ({
      name: p,
      path: parts.slice(0, i + 1).join('/')
    }));
  }

  get linkFileBreadcrumbs(): { name: string; path: string }[] {
    if (!this.linkFileCurrentPath) return [];
    const parts = this.linkFileCurrentPath.split('/');
    return parts.map((p, i) => ({
      name: p,
      path: parts.slice(0, i + 1).join('/')
    }));
  }

  constructor(
    private route: ActivatedRoute,
    private labService: LabService,
    private archiveService: LabArchiveService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.route.paramMap.subscribe(async params => {
      this.labId = params.get('labId') || '';
      if (this.labId) {
        try {
          const myLabs = await this.labService.getMyLabs();
          const lab = myLabs.find(l => l.id === this.labId);
          if (lab) {
            this.labName = lab.lab_name;
            this.archiveDeletionAt = lab.archive_deletion_at || null;
            this.isReadOnly = !!this.archiveDeletionAt;
          }
          await this.loadRecords();
          await this.loadSamples();
        } catch (e) {
          console.error('Failed to load archive', e);
        } finally {
          this.cdr.detectChanges();
        }
      }
    });

    // Set up debounced auto-save (1 second debounce time is great for table edits)
    this.autoSaveSub = this.autoSaveSubject.pipe(
      debounceTime(1000)
    ).subscribe(() => {
      this.triggerAutoSave();
    });
  }

  async ngOnDestroy() {
    if (this.autoSaveSub) {
      this.autoSaveSub.unsubscribe();
    }
    if (this.syncState === 'saving') {
      try {
        await this.triggerAutoSave();
      } catch (e) {
        console.error('Failed to auto-save on destroy', e);
      }
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any) {
    if (this.syncState === 'saving') {
      $event.returnValue = true;
    }
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.showSpreadsheetDropdown = false;
  }

  // ── View Modes ──
  setViewMode(mode: 'card' | 'table' | 'explorer') {
    this.viewMode = mode;
    if (mode === 'explorer') {
      this.loadFsList();
      this.initTree();
    }
    this.cdr.detectChanges();
  }

  remainingDays(value: string): number {
    return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000));
  }

  startArchiveColumnResize(index: number, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const table = (event.currentTarget as HTMLElement).closest('table');
    if (!table) return;

    this.resizingColumnIndex = index;
    this.resizeStartX = event.clientX;
    this.resizeStartWidths = [...this.archiveColumnWidths];
    this.resizeTableWidth = table.getBoundingClientRect().width;
    document.body.classList.add('archive-column-resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  @HostListener('window:mousemove', ['$event'])
  handleArchiveColumnMouseMove(event: MouseEvent) {
    if (this.resizingColumnIndex === null || !this.resizeTableWidth) return;

    const index = this.resizingColumnIndex;
    const nextIndex = index + 1;
    const deltaPercent = ((event.clientX - this.resizeStartX) / this.resizeTableWidth) * 100;
    const pairTotal = this.resizeStartWidths[index] + this.resizeStartWidths[nextIndex];
    const minWidth = 7;
    const nextMinWidth = nextIndex === this.archiveColumnWidths.length - 1 ? 10 : 7;

    const nextWidth = Math.max(nextMinWidth, this.resizeStartWidths[nextIndex] - deltaPercent);
    const currentWidth = Math.max(minWidth, pairTotal - nextWidth);
    const clampedCurrent = Math.min(currentWidth, pairTotal - nextMinWidth);

    this.archiveColumnWidths[index] = clampedCurrent;
    this.archiveColumnWidths[nextIndex] = pairTotal - clampedCurrent;
    this.cdr.detectChanges();
  }

  @HostListener('window:mouseup')
  stopArchiveColumnResize() {
    if (this.resizingColumnIndex === null) return;
    this.resizingColumnIndex = null;
    this.resizeTableWidth = 0;
    document.body.classList.remove('archive-column-resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  // ── Records ──
  async loadRecords() {
    try {
      this.records = await this.archiveService.getRecords(this.labId);
      this.filterRecords();
    } catch (e) { console.error('Failed to load records', e); }
    finally { this.cdr.detectChanges(); }
  }

  filterRecords() {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) { this.filteredRecords = [...this.records]; return; }
    this.filteredRecords = this.records.filter(r =>
      r.title?.toLowerCase().includes(q) ||
      r.summary?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q)
    );
  }

  // ── Samples Management ──
  async loadSamples() {
    try {
      this.samples = await this.archiveService.getSamples(this.labId);
      this.originalSamplesJson = JSON.stringify(this.samples);
    } catch (e) {
      console.error('Failed to load samples', e);
      this.samples = [];
      this.originalSamplesJson = '[]';
    } finally {
      this.cdr.detectChanges();
    }
  }

  // ── Drag & Drop Reordering ──
  rowDraggableIndex: number | null = null;

  onSampleRowDragStart(event: DragEvent, index: number) {
    this.draggedRowIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  onSampleRowDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    this.dragOverRowIndex = index;
  }

  onSampleRowDragLeave(event: DragEvent, index: number) {
    if (this.dragOverRowIndex === index) {
      this.dragOverRowIndex = null;
    }
  }

  onSampleRowDrop(event: DragEvent, targetIndex: number) {
     event.preventDefault();
     const sourceIndex = this.draggedRowIndex;
     if (sourceIndex !== null && sourceIndex !== targetIndex) {
       const rowToMove = this.samples[sourceIndex];
       this.samples.splice(sourceIndex, 1);
       this.samples.splice(targetIndex, 0, rowToMove);
       this.onSamplesChange();
     }
     this.onSampleRowDragEnd();
   }

  onSampleRowDragEnd() {
    this.draggedRowIndex = null;
    this.dragOverRowIndex = null;
    this.rowDraggableIndex = null;
  }

  // ── Record Links & Modal ──
  openLinkedRecord(recordId: string) {
    const record = this.records.find(r => r.id === recordId);
    if (record) {
      this.viewDetails(record);
    } else {
      alert('Linked record not found.');
    }
  }

  openRecordLinkModal(sample: any) {
    this.selectedSampleForRecordLink = sample;
    this.recordLinkSearchQuery = '';
    this.filteredModalRecords = [...this.records];
    this.showCreateRecordInline = false;
    this.inlineRecordData = { title: '', summary: '', description: '', links: [] };
    this.showRecordLinkModal = true;
    this.cdr.detectChanges();
  }

  closeRecordLinkModal() {
    this.showRecordLinkModal = false;
    this.selectedSampleForRecordLink = null;
    this.showCreateRecordInline = false;
    this.inlineRecordData = { title: '', summary: '', description: '', links: [] };
    this.cdr.detectChanges();
  }

  filterModalRecords() {
    const q = this.recordLinkSearchQuery.toLowerCase().trim();
    if (!q) {
      this.filteredModalRecords = [...this.records];
    } else {
      this.filteredModalRecords = this.records.filter(r =>
        r.title?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
      );
    }
    this.cdr.detectChanges();
  }

  selectRecordForSample(recordId: string) {
    if (this.selectedSampleForRecordLink) {
      this.selectedSampleForRecordLink.linked_record_id = recordId;
      
      // Auto-copy files and links from record to sample row
      const record = this.records.find(r => r.id === recordId);
      if (record) {
        if (record.links && record.links.length > 0) {
          if (!this.selectedSampleForRecordLink.links) {
            this.selectedSampleForRecordLink.links = [];
          }
          for (const link of record.links) {
            if (!this.selectedSampleForRecordLink.links.includes(link)) {
              this.selectedSampleForRecordLink.links.push(link);
            }
          }
        }
        if (record.files && record.files.length > 0) {
          if (!this.selectedSampleForRecordLink.files) {
            this.selectedSampleForRecordLink.files = [];
          }
          for (const file of record.files) {
            const exists = this.selectedSampleForRecordLink.files.some((f: any) => f.path === file.path);
            if (!exists) {
              this.selectedSampleForRecordLink.files.push({
                filename: file.filename,
                path: file.path
              });
            }
          }
        }
      }
      
      this.closeRecordLinkModal();
      this.onSamplesChange();
    }
  }

  unlinkRecordFromSample(sample: any) {
    sample.linked_record_id = '';
    this.onSamplesChange();
  }

  getRecordTitle(recordId: string): string {
    const r = this.records.find(rec => rec.id === recordId);
    return r ? r.title : '(Unknown Record)';
  }

  // ── Inline Attachment Removal ──
  removeSampleFileFromRow(sample: any, fIdx: number) {
    if (sample.files) {
      sample.files.splice(fIdx, 1);
      this.onSamplesChange();
    }
  }

  removeLinkFromRow(sample: any, lIdx: number) {
    if (sample.links) {
      sample.links.splice(lIdx, 1);
      this.onSamplesChange();
    }
  }

  // ── Separated Attachments Modal Methods ──
  openSampleFilesManager(sample: any) {
    this.selectedSampleForAttachments = sample;
    this.showSampleFilesModal = true;
    this.cdr.detectChanges();
  }

  closeSampleFilesManager() {
    this.showSampleFilesModal = false;
    this.selectedSampleForAttachments = null;
    this.cdr.detectChanges();
  }

  openAddLinkModal(sample: any) {
    this.selectedSampleForAttachments = sample;
    this.newLinkUrl = '';
    this.showAddLinkModal = true;
    this.cdr.detectChanges();
  }

  closeAddLinkModal() {
    this.showAddLinkModal = false;
    this.newLinkUrl = '';
    this.selectedSampleForAttachments = null;
    this.cdr.detectChanges();
  }

  addLinkToSampleDirect() {
    if (this.selectedSampleForAttachments && this.newLinkUrl.trim()) {
      if (!this.selectedSampleForAttachments.links) {
        this.selectedSampleForAttachments.links = [];
      }
      this.selectedSampleForAttachments.links.push(this.newLinkUrl.trim());
      this.closeAddLinkModal();
      this.onSamplesChange();
    }
  }

  addSampleRow() {
    this.samples.push({
      id: '',
      barcode: '',
      sample_name: '',
      storage_location: '',
      person: '',
      project: '',
      lab: '',
      links: [],
      files: [],
      linked_record_id: ''
    });
    this.onSamplesChange();
  }

  addSampleRows(count: number) {
    for (let i = 0; i < count; i++) {
      this.samples.push({
        id: '',
        barcode: '',
        sample_name: '',
        storage_location: '',
        person: '',
        project: '',
        lab: '',
        links: [],
        files: [],
        linked_record_id: ''
      });
    }
    this.onSamplesChange();
  }

  deleteSampleRow(index: number) {
    this.samples.splice(index, 1);
    this.onSamplesChange();
  }

  onSamplesChange() {
    if (this.isReadOnly) return;
    this.syncState = 'saving';
    this.autoSaveSubject.next();
  }

  async triggerAutoSave() {
    if (this.isReadOnly) return;
    try {
      const samplesToSave = this.samples.map(s => {
        return {
          ...s,
          storage_location: s.storage_location || ''
        };
      });
      const saved = await this.archiveService.saveSamples(this.labId, samplesToSave);
      this.originalSamplesJson = JSON.stringify(saved);
      for (let i = 0; i < this.samples.length; i++) {
        if (saved[i] && !this.samples[i].id) {
          this.samples[i].id = saved[i].id;
        }
      }
      this.syncState = 'saved';
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Failed to auto-save samples', e);
      this.syncState = 'error';
      this.cdr.detectChanges();
    }
  }

  // Sorting, filtering, and search computed property
  get filteredAndSortedSamples(): any[] {
    let result = [...this.samples];

    const q = this.searchQuery.toLowerCase().trim();
    if (q && this.viewMode === 'table') {
      result = result.filter(s => 
        (s.barcode || '').toLowerCase().includes(q) ||
        (s.sample_name || '').toLowerCase().includes(q) ||
        (s.person || '').toLowerCase().includes(q) ||
        (s.project || '').toLowerCase().includes(q) ||
        (s.lab || '').toLowerCase().includes(q) ||
        (s.storage_location || '').toLowerCase().includes(q) ||
        this.getRecordTitle(s.linked_record_id).toLowerCase().includes(q) ||
        (s.files || []).some((f: any) => f.filename.toLowerCase().includes(q)) ||
        (s.links || []).some((l: string) => l.toLowerCase().includes(q))
      );
    }

    for (const key of Object.keys(this.filterQueries)) {
      const val = this.filterQueries[key].toLowerCase().trim();
      if (val) {
        result = result.filter(s => {
          if (key === 'record_link') {
            return this.getRecordTitle(s.linked_record_id).toLowerCase().includes(val);
          } else if (key === 'files') {
            return (s.files || []).some((f: any) => f.filename.toLowerCase().includes(val));
          } else if (key === 'links') {
            return (s.links || []).some((l: string) => l.toLowerCase().includes(val));
          } else {
            return (s[key] || '').toLowerCase().includes(val);
          }
        });
      }
    }

    if (this.sortColumn) {
      const col = this.sortColumn;
      const dir = this.sortDirection === 'asc' ? 1 : -1;
      result.sort((a, b) => {
        let valA = '';
        let valB = '';

        if (col === 'record_link') {
          valA = this.getRecordTitle(a.linked_record_id);
          valB = this.getRecordTitle(b.linked_record_id);
        } else if (col === 'files') {
          valA = (a.files || []).map((f: any) => f.filename).join(', ');
          valB = (b.files || []).map((f: any) => f.filename).join(', ');
        } else if (col === 'links') {
          valA = (a.links || []).join(', ');
          valB = (b.links || []).join(', ');
        } else {
          valA = String(a[col] || '');
          valB = String(b[col] || '');
        }

        return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) * dir;
      });
    }

    return result;
  }

  get isTableFilteredOrSorted(): boolean {
    if (this.sortColumn !== null) return true;
    if (this.searchQuery.trim() !== '') return true;
    return Object.values(this.filterQueries).some(v => v.trim() !== '');
  }

  toggleSort(column: string) {
    if (this.sortColumn === column) {
      if (this.sortDirection === 'asc') {
        this.sortDirection = 'desc';
      } else {
        this.sortColumn = null;
      }
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.cdr.detectChanges();
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return '↕';
    return this.sortDirection === 'asc' ? '▲' : '▼';
  }

  // Column Resizing logic
  startResize(index: number, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.resizingColumnIndex = index;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.colWidths[index];
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  startSidebarResize(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.resizingSidebar = true;
    this.sidebarResizeStartX = event.clientX;
    this.sidebarResizeStartWidth = this.sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.resizingColumnIndex !== null) {
      const delta = event.clientX - this.resizeStartX;
      const newWidth = Math.max(40, this.resizeStartWidth + delta);
      this.colWidths[this.resizingColumnIndex] = newWidth;
      this.cdr.detectChanges();
    } else if (this.resizingSidebar) {
      const delta = event.clientX - this.sidebarResizeStartX;
      this.sidebarWidth = Math.max(150, Math.min(600, this.sidebarResizeStartWidth + delta));
      this.cdr.detectChanges();
    }
  }

  @HostListener('window:mouseup')
  onMouseUp() {
    if (this.resizingColumnIndex !== null) {
      this.resizingColumnIndex = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    if (this.resizingSidebar) {
      this.resizingSidebar = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this.cdr.detectChanges();
    }
  }

  openSampleAttachments(sample: any) {
    this.selectedSampleForAttachments = sample;
    this.sampleTempLink = '';
    this.showSampleAttachmentModal = true;
    this.cdr.detectChanges();
  }

  closeSampleAttachments() {
    this.showSampleAttachmentModal = false;
    this.selectedSampleForAttachments = null;
    this.cdr.detectChanges();
  }

  addLinkToSample() {
    if (this.selectedSampleForAttachments && this.sampleTempLink.trim()) {
      if (!this.selectedSampleForAttachments.links) {
        this.selectedSampleForAttachments.links = [];
      }
      this.selectedSampleForAttachments.links.push(this.sampleTempLink.trim());
      this.sampleTempLink = '';
      this.cdr.detectChanges();
    }
  }

  removeLinkFromSample(index: number) {
    if (this.selectedSampleForAttachments && this.selectedSampleForAttachments.links) {
      this.selectedSampleForAttachments.links.splice(index, 1);
      this.onSamplesChange();
    }
  }

  async uploadSampleFile(event: any) {
    if (!this.selectedSampleForAttachments) return;
    const file = event.target.files[0];
    if (!file) return;
    this.isFsLoading = true;
    this.cdr.detectChanges();
    try {
      const tempId = this.selectedSampleForAttachments.id || 'temp-' + Math.random().toString(36).substring(2, 9);
      const entry = await this.archiveService.uploadSampleAttachment(this.labId, tempId, file);
      if (!this.selectedSampleForAttachments.files) {
        this.selectedSampleForAttachments.files = [];
      }
      this.selectedSampleForAttachments.files.push(entry);
      this.onSamplesChange();
    } catch (e) {
      console.error('Failed to upload sample file', e);
      alert('Upload failed.');
    } finally {
      this.isFsLoading = false;
      event.target.value = null;
      this.cdr.detectChanges();
    }
  }

  removeSampleFile(index: number) {
    if (this.selectedSampleForAttachments && this.selectedSampleForAttachments.files) {
      this.selectedSampleForAttachments.files.splice(index, 1);
      this.onSamplesChange();
    }
  }

  openBulkPasteModal() {
    this.bulkPasteText = '';
    this.showBulkPasteModal = true;
    this.cdr.detectChanges();
  }

  closeBulkPasteModal() {
    this.showBulkPasteModal = false;
    this.bulkPasteText = '';
    this.cdr.detectChanges();
  }

  importBulkPaste() {
    if (!this.bulkPasteText.trim()) return;
    const lines = this.bulkPasteText.split('\n');
    let importedCount = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      const barcode = parts[0]?.trim() || '';
      const sample_name = parts[1]?.trim() || '';
      const person = parts[2]?.trim() || '';
      const project = parts[3]?.trim() || '';
      const lab = parts[4]?.trim() || '';

      this.samples.push({
        id: '',
        barcode,
        sample_name,
        storage_location: '',
        person,
        project,
        lab,
        links: [],
        files: [],
        linked_record_id: ''
      });
      importedCount++;
    }
    this.closeBulkPasteModal();
    this.onSamplesChange();
    alert(`Successfully imported ${importedCount} samples. Changes will be automatically saved.`);
  }

  getDisplayText(value: unknown, maxLength = 80): string {
    const text = String(value ?? '').trim();
    if (text.length <= maxLength) return text;
    if (maxLength <= 3) return text.slice(0, maxLength);

    const headLength = Math.ceil((maxLength - 3) * 0.7);
    const tailLength = maxLength - 3 - headLength;
    return tailLength > 0
      ? `${text.slice(0, headLength)}...${text.slice(-tailLength)}`
      : `${text.slice(0, maxLength - 3)}...`;
  }

  openNewRecordModal() {
    this.showNewModal = true;
    this.newRecord = { title: '', summary: '', description: '', links: [] };
    this.tempLink = '';
    this.pendingFiles = [];
    this.pendingExistingFiles = [];
  }

  addLinkToNewRecord() {
    if (this.tempLink.trim()) {
      this.newRecord.links.push(this.tempLink.trim());
      this.tempLink = '';
    }
  }
  removeLinkFromNewRecord(i: number) { this.newRecord.links.splice(i, 1); }

  onPendingFilesSelected(event: any) {
    const files = Array.from(event.target.files) as File[];
    this.pendingFiles.push(...files);
    event.target.value = null;
  }
  removePendingFile(i: number) { this.pendingFiles.splice(i, 1); }

  async createRecord() {
    if (this.isCreating) return;
    this.isCreating = true;
    this.cdr.detectChanges();
    try {
      const created = await this.archiveService.createRecord(this.labId, this.newRecord);

      // Optimistic: add to list immediately
      this.records.unshift(created);
      this.filterRecords();
      this.showNewModal = false;
      this.cdr.detectChanges();

      // Upload pending files to the new record
      for (const f of this.pendingFiles) {
        try {
          const entry = await this.archiveService.uploadRecordAttachment(this.labId, created.id, f);
          if (!created.files) created.files = [];
          created.files.push(entry);
          this.cdr.detectChanges();
        } catch (e) { console.error('File upload failed', e); }
      }
      this.pendingFiles = [];

      // Link pending existing files
      for (const path of this.pendingExistingFiles) {
        try {
          const entry = await this.archiveService.linkExistingFile(this.labId, created.id, path);
          if (!created.files) created.files = [];
          if (!created.files.some((f: any) => f.path === entry.path)) {
            created.files.push(entry);
          }
          this.cdr.detectChanges();
        } catch (e) {
          console.error('Link existing file failed', e);
        }
      }
      this.pendingExistingFiles = [];
      await this.loadRecords();
      await this.loadFsList();
      await this.initTree();

      if (this.linkNewRecordToSample) {
        const freshRecord = this.records.find(r => r.id === created.id);
        if (freshRecord) {
          this.selectedSampleForRecordLink = this.linkNewRecordToSample;
          this.selectRecordForSample(freshRecord.id);
        }
        this.linkNewRecordToSample = null;
      }
    } catch (e) {
      console.error('Failed to create record', e);
    } finally {
      this.isCreating = false;
      this.cdr.detectChanges();
    }
  }

  async deleteRecord(recordId: string) {
    if (!confirm('Are you sure you want to delete this record?')) return;
    // Optimistic remove
    this.records = this.records.filter(r => r.id !== recordId);
    this.filterRecords();
    this.closeDetails();
    this.cdr.detectChanges();
    try {
      await this.archiveService.deleteRecord(this.labId, recordId);
    } catch (e) {
      console.error('Failed to delete record', e);
      await this.loadRecords(); // Revert on error
    } finally {
      this.cdr.detectChanges();
    }
  }

  viewDetails(record: any) {
    this.selectedRecord = { ...record }; // shallow copy to avoid lag
    this.newCommentText = '';
  }
  closeDetails() { this.selectedRecord = null; }

  openExplorerForRecord() {
    this.currentPath = '';
    this.setViewMode('explorer');
    this.closeDetails();
  }

  // ── Comments ──
  async addComment() {
    if (!this.newCommentText.trim() || !this.selectedRecord) return;
    const text = this.newCommentText;
    this.newCommentText = '';
    this.cdr.detectChanges();
    try {
      const added = await this.archiveService.addComment(this.labId, this.selectedRecord.id, text);
      if (!this.selectedRecord.comments) this.selectedRecord.comments = [];
      this.selectedRecord.comments.push(added);
      // Also update the main list
      const rec = this.records.find(r => r.id === this.selectedRecord.id);
      if (rec) { rec.comments = [...this.selectedRecord.comments]; }
    } catch (e) { console.error('Failed to add comment', e); }
    finally { this.cdr.detectChanges(); }
  }

  async deleteComment(commentId: string) {
    if (!this.selectedRecord) return;
    // Optimistic remove
    this.selectedRecord.comments = this.selectedRecord.comments.filter((c: any) => c.id !== commentId);
    const rec = this.records.find(r => r.id === this.selectedRecord.id);
    if (rec) rec.comments = [...this.selectedRecord.comments];
    this.cdr.detectChanges();
    try {
      await this.archiveService.deleteComment(this.labId, this.selectedRecord.id, commentId);
    } catch (e) {
      console.error('Failed to delete comment', e);
      await this.loadRecords();
    } finally {
      this.cdr.detectChanges();
    }
  }

  // ── Record Attachments ──
  async uploadAttachment(event: any) {
    if (!this.selectedRecord) return;
    const file = event.target.files[0];
    if (!file) return;
    this.isUploadingAttachment = true;
    this.cdr.detectChanges();
    try {
      const entry = await this.archiveService.uploadRecordAttachment(this.labId, this.selectedRecord.id, file);
      if (!this.selectedRecord.files) this.selectedRecord.files = [];
      this.selectedRecord.files.push(entry);
      const rec = this.records.find(r => r.id === this.selectedRecord.id);
      if (rec) rec.files = [...this.selectedRecord.files];
    } catch (e) { console.error('Upload failed', e); }
    finally { this.isUploadingAttachment = false; event.target.value = null; this.cdr.detectChanges(); }
  }

  // ── File Explorer ──
  async loadFsList() {
    this.isFsLoading = true;
    this.cdr.detectChanges();
    try {
      this.fsItems = await this.archiveService.getFsList(this.labId, this.currentPath);
    }
    catch (e) { console.error('Failed to load fs', e); }
    finally {
      this.isFsLoading = false;
      this.cdr.detectChanges();
    }
  }

  async navigateInto(name: string) {
    if (this.isFsLoading) return;
    this.currentPath = this.currentPath ? `${this.currentPath}/${name}` : name;
    await this.loadFsList();
  }
  async navigateUp() {
    if (this.isFsLoading || !this.currentPath) return;
    const parts = this.currentPath.split('/');
    parts.pop();
    this.currentPath = parts.join('/');
    await this.loadFsList();
  }
  async navigateTo(path: string) {
    if (this.isFsLoading) return;
    this.currentPath = path;
    await this.loadFsList();
  }
  async navigateToRoot() {
    if (this.isFsLoading) return;
    this.currentPath = '';
    await this.loadFsList();
  }

  onFileSelected(event: any) { this.selectedFile = event.target.files[0]; }

  async uploadFile() {
    if (!this.selectedFile || this.isUploading) return;
    this.isUploading = true;
    this.cdr.detectChanges();
    try {
      await this.archiveService.uploadFile(this.labId, this.currentPath, this.selectedFile);
      this.showUploadModal = false;
      this.selectedFile = null;
      await this.loadFsList();
      await this.refreshTreeNodeByPath(this.currentPath);
    } catch (e) { console.error('Upload failed', e); }
    finally {
      this.isUploading = false;
      this.cdr.detectChanges();
    }
  }

  async createFolder() {
    if (!this.newFolderName.trim() || this.isCreatingFolder) return;
    this.isCreatingFolder = true;
    this.cdr.detectChanges();
    try {
      await this.archiveService.createFolder(this.labId, this.currentPath, this.newFolderName.trim());
      this.showMkdirModal = false;
      this.newFolderName = '';
      await this.loadFsList();
      await this.refreshTreeNodeByPath(this.currentPath);
    } catch (e) {
      console.error('Create folder failed', e);
    } finally {
      this.isCreatingFolder = false;
      this.cdr.detectChanges();
    }
  }

  async deleteFsItem(file: any) {
    if (file.is_linked) {
      alert('This file is linked to a record. Remove it from the record first or move it.');
      return;
    }
    if (!confirm(`Delete "${file.name}"?`)) return;
    // Optimistic
    this.fsItems = this.fsItems.filter(f => f.rel_path !== file.rel_path);
    this.cdr.detectChanges();
    try {
      await this.archiveService.deletePath(this.labId, file.rel_path);
      await this.refreshTreeNodeByPath(this.currentPath);
    }
    catch (e) {
      console.error('Delete failed', e);
      await this.loadFsList();
    } finally {
      this.cdr.detectChanges();
    }
  }

  // ── Move Operations ──
  async openMoveModal(file: any) {
    this.movingItem = file;
    this.moveCurrentPath = this.currentPath;
    this.showMoveModal = true;
    await this.loadMoveFolders();
  }

  async loadMoveFolders() {
    try {
      const items = await this.archiveService.getFsList(this.labId, this.moveCurrentPath);
      // Filter only directories, and exclude the moving item itself
      this.moveFolders = items.filter(item => 
        item.is_dir && item.rel_path !== this.movingItem?.rel_path
      );
    } catch (e) {
      console.error('Failed to load target directories', e);
    } finally {
      this.cdr.detectChanges();
    }
  }

  async navigateMoveInto(name: string) {
    this.moveCurrentPath = this.moveCurrentPath ? `${this.moveCurrentPath}/${name}` : name;
    await this.loadMoveFolders();
  }

  async navigateMoveUp() {
    if (!this.moveCurrentPath) return;
    const parts = this.moveCurrentPath.split('/');
    parts.pop();
    this.moveCurrentPath = parts.join('/');
    await this.loadMoveFolders();
  }

  async navigateMoveTo(path: string) {
    this.moveCurrentPath = path;
    await this.loadMoveFolders();
  }

  async navigateMoveToRoot() {
    this.moveCurrentPath = '';
    await this.loadMoveFolders();
  }

  async executeMove() {
    if (!this.movingItem || this.isMovingItem) return;
    this.isMovingItem = true;
    this.cdr.detectChanges();
    try {
      await this.archiveService.movePath(this.labId, this.movingItem.rel_path, this.moveCurrentPath);
      const srcParent = this.movingItem.rel_path.includes('/')
        ? this.movingItem.rel_path.substring(0, this.movingItem.rel_path.lastIndexOf('/'))
        : '';
      this.showMoveModal = false;
      this.movingItem = null;
      await this.loadFsList();
      await this.loadRecords(); // reload records to update potential file path references
      await this.refreshTreeNodeByPath(srcParent);
      await this.refreshTreeNodeByPath(this.moveCurrentPath);
    } catch (e) {
      console.error('Move failed', e);
      alert('Move failed: ' + ((e as any).error?.detail || (e as any).message || e));
    } finally {
      this.isMovingItem = false;
      this.cdr.detectChanges();
    }
  }

  // ── Selection & Click Handling ──
  selectRow(file: any, event: MouseEvent) {
    event.stopPropagation();
    this.selectedItem = file;
    this.cdr.detectChanges();
  }

  navigateFolder(file: any, event: MouseEvent) {
    event.stopPropagation();
    this.navigateInto(file.name);
  }

  clearSelection() {
    this.selectedItem = null;
    this.cdr.detectChanges();
  }

  // ── Keyboard Shortcuts (Cmd+C / Cmd+X / Cmd+V) ──
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (this.viewMode !== 'explorer') return;
    
    // Check if user is typing in an input/textarea
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      return;
    }

    if (event.key === 'F2' || event.key === 'Enter') {
      if (this.selectedItem && this.editingItem !== this.selectedItem) {
        event.preventDefault();
        this.startRename(this.selectedItem);
        return;
      }
    }
    
    const isCmdOrCtrl = event.metaKey || event.ctrlKey;
    
    if (isCmdOrCtrl && event.key.toLowerCase() === 'c') {
      if (this.selectedItem) {
        event.preventDefault();
        this.clipboardItem = {
          rel_path: this.selectedItem.rel_path,
          is_dir: this.selectedItem.is_dir,
          action: 'copy'
        };
        this.cdr.detectChanges();
      }
    }
    
    if (isCmdOrCtrl && event.key.toLowerCase() === 'x') {
      if (this.selectedItem) {
        if (this.selectedItem.is_linked) {
          alert('This file is linked to a record. Remove it from the record first or move it using drag & drop.');
          return;
        }
        event.preventDefault();
        this.clipboardItem = {
          rel_path: this.selectedItem.rel_path,
          is_dir: this.selectedItem.is_dir,
          action: 'cut'
        };
        this.cdr.detectChanges();
      }
    }
    
    if (isCmdOrCtrl && event.key.toLowerCase() === 'v') {
      if (this.clipboardItem) {
        event.preventDefault();
        this.pasteItem();
      }
    }
  }

  async pasteItem() {
    if (!this.clipboardItem || this.isFsLoading) return;
    const item = this.clipboardItem;
    this.isFsLoading = true;
    this.cdr.detectChanges();
    try {
      const srcParent = item.rel_path.includes('/')
        ? item.rel_path.substring(0, item.rel_path.lastIndexOf('/'))
        : '';
      if (item.action === 'cut') {
        await this.archiveService.movePath(this.labId, item.rel_path, this.currentPath);
        this.clipboardItem = null; // Clear clipboard after cut-paste
        await this.refreshTreeNodeByPath(srcParent);
      } else if (item.action === 'copy') {
        await this.archiveService.copyPath(this.labId, item.rel_path, this.currentPath);
      }
      await this.loadFsList();
      await this.loadRecords();
      await this.refreshTreeNodeByPath(this.currentPath);
    } catch (e) {
      console.error('Paste failed', e);
      alert('Paste failed: ' + ((e as any).error?.detail || (e as any).message || e));
    } finally {
      this.isFsLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Native Pickers Helpers ──
  triggerFilePicker() {
    document.getElementById('pc-file-input')?.click();
  }

  // ── File/Folder Selection Handlers ──
  async onFilesSelectedForUpload(event: any) {
    const files = Array.from(event.target.files || []) as File[];
    if (files.length === 0) return;
    
    this.isFsLoading = true;
    this.cdr.detectChanges();
    try {
      for (const file of files) {
        await this.archiveService.uploadFile(this.labId, this.currentPath, file);
      }
      await this.loadFsList();
      await this.initTree();
    } catch (err) {
      console.error('File upload error:', err);
      alert('Upload failed: ' + ((err as any).error?.detail || (err as any).message || err));
    } finally {
      this.isFsLoading = false;
      event.target.value = ''; // clear input selection
      this.cdr.detectChanges();
    }
  }

  // ── PC Drag and Drop Event Handlers ──
  onContainerDragEnter(event: DragEvent) {
    const types = event.dataTransfer?.types;
    if (types && (types.includes('Files') || (types as any).indexOf?.('Files') !== -1)) {
      event.preventDefault();
      this.dragCounter++;
      this.isDraggingPcFiles = true;
      this.cdr.detectChanges();
    }
  }

  onContainerDragOver(event: DragEvent) {
    const types = event.dataTransfer?.types;
    if (types && (types.includes('Files') || (types as any).indexOf?.('Files') !== -1)) {
      event.preventDefault();
      if (!this.isDraggingPcFiles) {
        this.isDraggingPcFiles = true;
        this.cdr.detectChanges();
      }
    }
  }

  onContainerDragLeave(event: DragEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      event.clientX < rect.left || 
      event.clientX >= rect.right || 
      event.clientY < rect.top || 
      event.clientY >= rect.bottom
    ) {
      this.isDraggingPcFiles = false;
      this.dragCounter = 0;
      this.cdr.detectChanges();
    }
  }

  async onPcDrop(event: DragEvent) {
    this.isDraggingPcFiles = false;
    this.dragCounter = 0;
    this.cdr.detectChanges();
    
    const items = event.dataTransfer?.items;
    const files = event.dataTransfer?.files;
    
    if ((!items || items.length === 0) && (!files || files.length === 0)) return;
    
    event.preventDefault();
    
    const entries: any[] = [];
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            entries.push(entry);
          }
        }
      }
    }
    
    if (entries.length > 0) {
      this.isFsLoading = true;
      this.cdr.detectChanges();
      try {
        for (const entry of entries) {
          await this.traverseEntry(entry, this.currentPath);
        }
        await this.loadFsList();
        await this.initTree();
      } catch (err) {
        console.error('PC drop upload error:', err);
        alert('Upload failed: ' + ((err as any).error?.detail || (err as any).message || err));
      } finally {
        this.isFsLoading = false;
        this.cdr.detectChanges();
      }
    } else if (files && files.length > 0) {
      this.isFsLoading = true;
      this.cdr.detectChanges();
      try {
        for (let i = 0; i < files.length; i++) {
          await this.archiveService.uploadFile(this.labId, this.currentPath, files[i]);
        }
        await this.loadFsList();
        await this.initTree();
      } catch (err) {
        console.error('PC drop fallback upload error:', err);
        alert('Upload failed: ' + ((err as any).error?.detail || (err as any).message || err));
      } finally {
        this.isFsLoading = false;
        this.cdr.detectChanges();
      }
    }
  }

  async traverseEntry(entry: any, currentParentPath: string): Promise<void> {
    if (entry.isFile) {
      const fileEntry = entry as any;
      const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
      await this.archiveService.uploadFile(this.labId, currentParentPath, file);
    } else if (entry.isDirectory) {
      const dirEntry = entry as any;
      // 1. Create the folder on the backend
      try {
        await this.archiveService.createFolder(this.labId, currentParentPath, dirEntry.name);
      } catch (err) {
        console.warn(`Creating folder ${dirEntry.name} warning:`, err);
      }
      
      // 2. Build the next parent path
      const nextParentPath = currentParentPath ? `${currentParentPath}/${dirEntry.name}` : dirEntry.name;
      
      // 3. Read child entries
      const dirReader = dirEntry.createReader();
      const readBatch = async (): Promise<any[]> => {
        return new Promise((resolve, reject) => {
          dirReader.readEntries(resolve, reject);
        });
      };
      
      let entries = await readBatch();
      const allEntries: any[] = [];
      while (entries.length > 0) {
        allEntries.push(...entries);
        entries = await readBatch();
      }
      
      // 4. Recursively traverse all entries sequentially
      for (const child of allEntries) {
        await this.traverseEntry(child, nextParentPath);
      }
    }
  }

  // ── Renaming Operations ──
  startRename(file: any, event?: MouseEvent) {
    if (event) event.stopPropagation();
    this.editingItem = file;
    this.editNameValue = file.name;
    this.cdr.detectChanges();
    setTimeout(() => {
      const input = document.getElementById('rename-input') as HTMLInputElement;
      input?.focus();
      input?.select();
    }, 50);
  }

  async saveRename() {
    if (!this.editingItem) return;
    const oldName = this.editingItem.name;
    const newName = this.editNameValue.trim();
    
    if (!newName || newName === oldName) {
      this.cancelRename();
      return;
    }
    
    const parentPath = this.editingItem.rel_path.includes('/')
      ? this.editingItem.rel_path.substring(0, this.editingItem.rel_path.lastIndexOf('/'))
      : '';
    const newRelPath = parentPath ? `${parentPath}/${newName}` : newName;
    
    this.isFsLoading = true;
    this.cdr.detectChanges();
    try {
      await this.archiveService.movePath(this.labId, this.editingItem.rel_path, newRelPath);
      await this.loadFsList();
      await this.loadRecords();
      await this.refreshTreeNodeByPath(parentPath);
    } catch (e) {
      console.error('Rename failed', e);
      alert('Rename failed: ' + ((e as any).error?.detail || (e as any).message || e));
    } finally {
      this.isFsLoading = false;
      this.editingItem = null;
      this.cdr.detectChanges();
    }
  }

  cancelRename() {
    this.editingItem = null;
    this.cdr.detectChanges();
  }

  // ── File Double-Click Opening ──
  openFile(file: any) {
    window.open(this.getDownloadUrl(file.rel_path), '_blank');
  }

  // ── Link Existing Files to Records ──
  async openLinkExistingModal(recordId: string | null = null) {
    this.linkFileTargetRecordId = recordId;
    this.linkFileTargetSample = null;
    this.linkFileCurrentPath = '';
    this.showLinkFileModal = true;
    await this.loadLinkFileItems();
  }

  async openLinkExistingForSample(sample: any) {
    this.linkFileTargetSample = sample;
    this.linkFileTargetRecordId = null;
    this.linkFileCurrentPath = '';
    this.showLinkFileModal = true;
    await this.loadLinkFileItems();
  }

  async loadLinkFileItems() {
    try {
      const items = await this.archiveService.getFsList(this.labId, this.linkFileCurrentPath);
      this.linkFileItems = items;
    } catch (e) {
      console.error('Failed to load link files', e);
    } finally {
      this.cdr.detectChanges();
    }
  }

  async navigateLinkFileInto(name: string) {
    this.linkFileCurrentPath = this.linkFileCurrentPath ? `${this.linkFileCurrentPath}/${name}` : name;
    await this.loadLinkFileItems();
  }

  async navigateLinkFileUp() {
    if (!this.linkFileCurrentPath) return;
    const parts = this.linkFileCurrentPath.split('/');
    parts.pop();
    this.linkFileCurrentPath = parts.join('/');
    await this.loadLinkFileItems();
  }

  async selectFileToLink(file: any) {
    if (file.is_dir) return;
    
    if (this.linkFileTargetRecordId) {
      this.isFsLoading = true;
      this.cdr.detectChanges();
      try {
        const entry = await this.archiveService.linkExistingFile(this.labId, this.linkFileTargetRecordId, file.rel_path);
        if (this.selectedRecord && this.selectedRecord.id === this.linkFileTargetRecordId) {
          if (!this.selectedRecord.files) this.selectedRecord.files = [];
          if (!this.selectedRecord.files.some((f: any) => f.path === entry.path)) {
            this.selectedRecord.files.push(entry);
          }
          const rec = this.records.find(r => r.id === this.selectedRecord.id);
          if (rec) rec.files = [...this.selectedRecord.files];
        }
        if (this.showEditModal && this.editingRecordData.id === this.linkFileTargetRecordId) {
          this.addFileToEditingRecord(entry);
        }
        this.showLinkFileModal = false;
        await this.loadFsList();
      } catch (err) {
        console.error('Link file failed', err);
        alert('Linking failed: ' + ((err as any).error?.detail || (err as any).message || err));
      } finally {
        this.isFsLoading = false;
        this.cdr.detectChanges();
      }
    } else if (this.linkFileTargetSample) {
      if (!this.linkFileTargetSample.files) {
        this.linkFileTargetSample.files = [];
      }
      const exists = this.linkFileTargetSample.files.some((f: any) => f.path === file.rel_path);
      if (!exists) {
        this.linkFileTargetSample.files.push({
          filename: file.name,
          path: file.rel_path,
          uploaded_at: new Date().toISOString()
        });
      }
      this.showLinkFileModal = false;
      this.linkFileTargetSample = null;
      this.onSamplesChange();
      await this.loadFsList();
      this.cdr.detectChanges();
    } else {
      if (!this.pendingExistingFiles.includes(file.rel_path)) {
        this.pendingExistingFiles.push(file.rel_path);
      }
      this.showLinkFileModal = false;
      this.cdr.detectChanges();
    }
  }

  removePendingExistingFile(i: number) {
    this.pendingExistingFiles.splice(i, 1);
    this.cdr.detectChanges();
  }

  async unlinkFile(file: any) {
    if (!this.selectedRecord) return;
    if (!confirm(`Unlink "${file.filename}" from this record?`)) return;
    
    this.isFsLoading = true;
    this.cdr.detectChanges();
    try {
      await this.archiveService.unlinkExistingFile(this.labId, this.selectedRecord.id, file.path);
      this.selectedRecord.files = this.selectedRecord.files.filter((f: any) => f.path !== file.path);
      const rec = this.records.find(r => r.id === this.selectedRecord.id);
      if (rec) rec.files = [...this.selectedRecord.files];
      await this.loadFsList();
    } catch (e) {
      console.error('Failed to unlink file', e);
      alert('Unlink failed');
    } finally {
      this.isFsLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Record Editing Operations ──
  openEditRecordModal(record: any) {
    this.editingRecordData = {
      id: record.id,
      title: record.title || '',
      summary: record.summary || '',
      description: record.description || '',
      links: [...(record.links || [])],
      files: [...(record.files || [])]
    };
    this.editTempLink = '';
    this.showEditModal = true;
    this.cdr.detectChanges();
  }

  addLinkToEditRecord() {
    if (this.editTempLink.trim()) {
      this.editingRecordData.links.push(this.editTempLink.trim());
      this.editTempLink = '';
    }
  }

  removeLinkFromEditRecord(i: number) {
    this.editingRecordData.links.splice(i, 1);
  }

  addFileToEditingRecord(entry: any) {
    if (!this.editingRecordData.files) this.editingRecordData.files = [];
    if (!this.editingRecordData.files.some((f: any) => f.path === entry.path)) {
      this.editingRecordData.files.push(entry);
    }

    const rec = this.records.find(r => r.id === this.editingRecordData.id);
    if (rec) {
      if (!rec.files) rec.files = [];
      if (!rec.files.some((f: any) => f.path === entry.path)) {
        rec.files = [...rec.files, entry];
      }
    }

    if (this.selectedRecord && this.selectedRecord.id === this.editingRecordData.id) {
      if (!this.selectedRecord.files) this.selectedRecord.files = [];
      if (!this.selectedRecord.files.some((f: any) => f.path === entry.path)) {
        this.selectedRecord.files.push(entry);
      }
    }
  }

  async uploadEditAttachment(event: any) {
    const files = Array.from(event.target.files || []) as File[];
    if (!files.length || !this.editingRecordData.id) return;
    this.isUploadingEditAttachment = true;
    this.cdr.detectChanges();
    try {
      for (const file of files) {
        const entry = await this.archiveService.uploadRecordAttachment(this.labId, this.editingRecordData.id, file);
        this.addFileToEditingRecord(entry);
      }
      await this.loadFsList();
    } catch (e) {
      console.error('Edit file upload failed', e);
      alert('Upload failed');
    } finally {
      this.isUploadingEditAttachment = false;
      event.target.value = null;
      this.cdr.detectChanges();
    }
  }

  async unlinkEditFile(file: any) {
    if (!this.editingRecordData.id) return;
    if (!confirm(`Unlink "${file.filename}" from this record?`)) return;

    this.isFsLoading = true;
    this.cdr.detectChanges();
    try {
      await this.archiveService.unlinkExistingFile(this.labId, this.editingRecordData.id, file.path);
      this.editingRecordData.files = this.editingRecordData.files.filter((f: any) => f.path !== file.path);

      const rec = this.records.find(r => r.id === this.editingRecordData.id);
      if (rec) rec.files = (rec.files || []).filter((f: any) => f.path !== file.path);

      if (this.selectedRecord && this.selectedRecord.id === this.editingRecordData.id) {
        this.selectedRecord.files = (this.selectedRecord.files || []).filter((f: any) => f.path !== file.path);
      }

      await this.loadFsList();
    } catch (e) {
      console.error('Failed to unlink edit file', e);
      alert('Unlink failed');
    } finally {
      this.isFsLoading = false;
      this.cdr.detectChanges();
    }
  }

  async saveRecordEdit() {
    if (!this.editingRecordData.title || this.isSavingEdit) return;
    this.isSavingEdit = true;
    this.cdr.detectChanges();
    try {
      const updated = await this.archiveService.updateRecord(this.labId, this.editingRecordData.id, {
        title: this.editingRecordData.title,
        summary: this.editingRecordData.summary,
        description: this.editingRecordData.description,
        links: this.editingRecordData.links
      });
      
      const idx = this.records.findIndex(r => r.id === updated.id);
      if (idx !== -1) {
        this.records[idx] = { ...this.records[idx], ...updated };
      }
      this.filterRecords();
      
      if (this.selectedRecord && this.selectedRecord.id === updated.id) {
        this.selectedRecord = { ...this.selectedRecord, ...updated };
      }
      this.editingRecordData.files = [...(updated.files || this.editingRecordData.files || [])];
      
      this.showEditModal = false;
    } catch (e) {
      console.error('Failed to save record edit', e);
      alert('Failed to edit record: ' + ((e as any).error?.detail || (e as any).message || e));
    } finally {
      this.isSavingEdit = false;
      this.cdr.detectChanges();
    }
  }

  // ── Drag and Drop ──
  onDragStart(event: DragEvent, file: any) {
    this.selectedItem = file;
    event.dataTransfer?.setData('text/plain', JSON.stringify({
      rel_path: file.rel_path,
      name: file.name,
      is_dir: file.is_dir
    }));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    this.cdr.detectChanges();
  }

  onDragOver(event: DragEvent, targetFile: any) {
    if (targetFile.is_dir && targetFile.rel_path !== this.selectedItem?.rel_path) {
      event.preventDefault();
      const row = (event.currentTarget as HTMLElement);
      row.classList.add('drag-over');
    }
  }

  onDragLeave(event: DragEvent, targetFile: any) {
    const row = (event.currentTarget as HTMLElement);
    row.classList.remove('drag-over');
  }

  async onDrop(event: DragEvent, targetFile: any) {
    event.preventDefault();
    const row = (event.currentTarget as HTMLElement);
    row.classList.remove('drag-over');
    
    if (!targetFile.is_dir) return;
    
    const dataStr = event.dataTransfer?.getData('text/plain');
    if (!dataStr) return;
    
    try {
      const dragged = JSON.parse(dataStr);
      if (dragged.rel_path === targetFile.rel_path) return;
      
      const dragParent = dragged.rel_path.includes('/')
        ? dragged.rel_path.substring(0, dragged.rel_path.lastIndexOf('/'))
        : '';
      
      this.isFsLoading = true;
      this.cdr.detectChanges();
      await this.archiveService.movePath(this.labId, dragged.rel_path, targetFile.rel_path);
      await this.loadFsList();
      await this.loadRecords();
      await this.refreshTreeNodeByPath(dragParent);
      await this.refreshTreeNodeByPath(targetFile.rel_path);
    } catch (e) {
      console.error('Drop move failed', e);
      alert('Move failed');
    } finally {
      this.isFsLoading = false;
      this.cdr.detectChanges();
    }
  }

  async onDropToPath(event: DragEvent, targetPath: string) {
    event.preventDefault();
    const dataStr = event.dataTransfer?.getData('text/plain');
    if (!dataStr) return;
    
    try {
      const dragged = JSON.parse(dataStr);
      const dragParent = dragged.rel_path.includes('/') 
        ? dragged.rel_path.substring(0, dragged.rel_path.lastIndexOf('/'))
        : '';
      
      if (dragged.rel_path === targetPath || dragParent === targetPath) return;
      
      this.isFsLoading = true;
      this.cdr.detectChanges();
      await this.archiveService.movePath(this.labId, dragged.rel_path, targetPath);
      await this.loadFsList();
      await this.loadRecords();
      await this.refreshTreeNodeByPath(dragParent);
      await this.refreshTreeNodeByPath(targetPath);
    } catch (e) {
      console.error('Drop to breadcrumb failed', e);
      alert('Move failed');
    } finally {
      this.isFsLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Drag & Drop Up Button ──
  onParentBtnDragOver(event: DragEvent) {
    if (this.currentPath) {
      event.preventDefault();
      const btn = (event.currentTarget as HTMLElement);
      btn.classList.add('drag-over-btn');
    }
  }

  onParentBtnDragLeave(event: DragEvent) {
    const btn = (event.currentTarget as HTMLElement);
    btn.classList.remove('drag-over-btn');
  }

  async onDropToParent(event: DragEvent) {
    event.preventDefault();
    const btn = (event.currentTarget as HTMLElement);
    btn.classList.remove('drag-over-btn');
    
    if (!this.currentPath) return;
    
    const parts = this.currentPath.split('/');
    parts.pop();
    const parentPath = parts.join('/');
    
    const dataStr = event.dataTransfer?.getData('text/plain');
    if (!dataStr) return;
    
    try {
      const dragged = JSON.parse(dataStr);
      const dragParent = dragged.rel_path.includes('/')
        ? dragged.rel_path.substring(0, dragged.rel_path.lastIndexOf('/'))
        : '';
      
      this.isFsLoading = true;
      this.cdr.detectChanges();
      await this.archiveService.movePath(this.labId, dragged.rel_path, parentPath);
      await this.loadFsList();
      await this.loadRecords();
      await this.refreshTreeNodeByPath(dragParent);
      await this.refreshTreeNodeByPath(parentPath);
    } catch (e) {
      console.error('Drop to parent button failed', e);
      alert('Move failed');
    } finally {
      this.isFsLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Left Sidebar Folder Tree View ──
  async initTree() {
    try {
      const items = await this.archiveService.getFsList(this.labId, '');
      this.treeNodes = items.map(item => ({
        name: item.name,
        relPath: item.rel_path,
        isDir: item.is_dir,
        isLinked: item.is_linked,
        isExpanded: false,
        children: []
      }));
    } catch (e) {
      console.error('Failed to init tree', e);
    } finally {
      this.cdr.detectChanges();
    }
  }

  async toggleNode(node: any, event: MouseEvent) {
    event.stopPropagation();
    node.isExpanded = !node.isExpanded;
    if (node.isExpanded && (!node.children || node.children.length === 0)) {
      node.isLoading = true;
      try {
        const items = await this.archiveService.getFsList(this.labId, node.relPath);
        node.children = items.map(item => ({
          name: item.name,
          relPath: item.rel_path,
          isDir: item.is_dir,
          isLinked: item.is_linked,
          isExpanded: false,
          children: []
        }));
      } catch (e) {
        console.error('Failed to load node children', e);
      } finally {
        node.isLoading = false;
        this.cdr.detectChanges();
      }
    }
    this.cdr.detectChanges();
  }

  onTreeNodeClick(node: any, event: MouseEvent) {
    if (node.isDir) {
      this.navigateTo(node.relPath);
      this.toggleNode(node, event);
    }
  }

  getTreeNodeIcon(node: any): string {
    return this.getFileIcon({ is_dir: node.isDir, name: node.name });
  }

  async refreshTreeNodeByPath(path: string) {
    if (!path) {
      const items = await this.archiveService.getFsList(this.labId, '');
      this.treeNodes = items.map(item => {
        const existing = this.treeNodes.find(n => n.relPath === item.rel_path);
        return {
          name: item.name,
          relPath: item.rel_path,
          isDir: item.is_dir,
          isLinked: item.is_linked,
          isExpanded: existing ? existing.isExpanded : false,
          children: existing ? existing.children : []
        };
      });
      this.cdr.detectChanges();
      return;
    }
    
    const node = this.findNodeByPath(this.treeNodes, path);
    if (node) {
      try {
        const items = await this.archiveService.getFsList(this.labId, path);
        node.children = items.map(item => {
          const existing = node.children?.find((n: any) => n.relPath === item.rel_path);
          return {
            name: item.name,
            relPath: item.rel_path,
            isDir: item.is_dir,
            isLinked: item.is_linked,
            isExpanded: existing ? existing.isExpanded : false,
            children: existing ? existing.children : []
          };
        });
      } catch (e) {
        console.error('Failed to refresh node children', e);
      } finally {
        this.cdr.detectChanges();
      }
    }
  }

  findNodeByPath(nodes: any[], path: string): any {
    for (const node of nodes) {
      if (node.relPath === path) return node;
      if (node.children && node.children.length > 0) {
        const found = this.findNodeByPath(node.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  onTreeNodeDragOver(event: DragEvent, node: any) {
    if (node.isDir && node.relPath !== this.selectedItem?.rel_path) {
      event.preventDefault();
      node.isDragOver = true;
      this.cdr.detectChanges();
    }
  }

  onTreeNodeDragLeave(event: DragEvent, node: any) {
    node.isDragOver = false;
    this.cdr.detectChanges();
  }

  async onTreeNodeDrop(event: DragEvent, node: any) {
    event.preventDefault();
    node.isDragOver = false;
    this.cdr.detectChanges();
    
    if (!node.isDir) return;
    
    const dataStr = event.dataTransfer?.getData('text/plain');
    if (!dataStr) return;
    
    try {
      const dragged = JSON.parse(dataStr);
      if (dragged.rel_path === node.relPath) return;
      
      const dragParent = dragged.rel_path.includes('/')
        ? dragged.rel_path.substring(0, dragged.rel_path.lastIndexOf('/'))
        : '';
      
      this.isFsLoading = true;
      this.cdr.detectChanges();
      await this.archiveService.movePath(this.labId, dragged.rel_path, node.relPath);
      await this.loadFsList();
      await this.loadRecords();
      await this.refreshTreeNodeByPath(dragParent);
      await this.refreshTreeNodeByPath(node.relPath);
    } catch (e) {
      console.error('Drop to tree node failed', e);
      alert('Move failed');
    } finally {
      this.isFsLoading = false;
      this.cdr.detectChanges();
    }
  }

  onTreeNodeDragStart(event: DragEvent, node: any) {
    this.selectedItem = {
      name: node.name,
      rel_path: node.relPath,
      is_dir: node.isDir
    };
    event.dataTransfer?.setData('text/plain', JSON.stringify({
      rel_path: node.relPath,
      name: node.name,
      is_dir: node.isDir
    }));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    this.cdr.detectChanges();
  }

  onSidebarHeaderDragOver(event: DragEvent) {
    event.preventDefault();
    const el = (event.currentTarget as HTMLElement);
    el.classList.add('drag-over-header');
  }

  onSidebarHeaderDragLeave(event: DragEvent) {
    const el = (event.currentTarget as HTMLElement);
    el.classList.remove('drag-over-header');
  }

  async onDropToSidebarHeader(event: DragEvent) {
    event.preventDefault();
    const el = (event.currentTarget as HTMLElement);
    el.classList.remove('drag-over-header');
    
    const dataStr = event.dataTransfer?.getData('text/plain');
    if (!dataStr) return;
    
    try {
      const dragged = JSON.parse(dataStr);
      const dragParent = dragged.rel_path.includes('/')
        ? dragged.rel_path.substring(0, dragged.rel_path.lastIndexOf('/'))
        : '';
      
      if (dragParent === '') return; // already at root
      
      this.isFsLoading = true;
      this.cdr.detectChanges();
      await this.archiveService.movePath(this.labId, dragged.rel_path, '');
      await this.loadFsList();
      await this.loadRecords();
      await this.refreshTreeNodeByPath(dragParent);
      await this.refreshTreeNodeByPath('');
    } catch (e) {
      console.error('Drop to sidebar header failed', e);
      alert('Move failed');
    } finally {
      this.isFsLoading = false;
      this.cdr.detectChanges();
    }
  }

  getDownloadUrl(relPath: string) {
    if (relPath?.startsWith('/')) return relPath;
    const token = this.archiveService.getCurrentToken() || '';
    return `/api/lab-archive/${this.labId}/fs/download?path=${encodeURIComponent(relPath)}&token=${encodeURIComponent(token)}`;
  }

  formatExternalLink(link: string): string {
    if (!link) return '';
    if (/^https?:\/\//i.test(link)) {
      return link;
    }
    return 'http://' + link;
  }

  getFileIcon(file: any): string {
    if (file.is_dir) return '📁';
    return '';
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // ── Inline Creation during Record Linking ──
  openCreateRecordForLink() {
    this.linkNewRecordToSample = this.selectedSampleForRecordLink;
    this.closeRecordLinkModal();
    this.showNewModal = true;
    this.newRecord = { title: '', summary: '', description: '', links: [] };
    this.tempLink = '';
    this.pendingFiles = [];
    this.pendingExistingFiles = [];
    this.cdr.detectChanges();
  }

  // ── Drag & Drop to Sidebar Background (Move to Parent Folder) ──
  onSidebarTreeDragOver(event: DragEvent) {
    event.preventDefault();
    const el = (event.currentTarget as HTMLElement);
    el.classList.add('drag-over-sidebar');
  }

  onSidebarTreeDragLeave(event: DragEvent) {
    const el = (event.currentTarget as HTMLElement);
    el.classList.remove('drag-over-sidebar');
  }

  async onDropToSidebarTree(event: DragEvent) {
    event.preventDefault();
    const el = (event.currentTarget as HTMLElement);
    el.classList.remove('drag-over-sidebar');
    
    const dataStr = event.dataTransfer?.getData('text/plain');
    if (!dataStr) return;
    
    try {
      const dragged = JSON.parse(dataStr);
      const dragParent = dragged.rel_path.includes('/')
        ? dragged.rel_path.substring(0, dragged.rel_path.lastIndexOf('/'))
        : '';
      
      // Move to parent folder of the current folder
      let targetPath = '';
      if (this.currentPath.includes('/')) {
        targetPath = this.currentPath.substring(0, this.currentPath.lastIndexOf('/'));
      } else {
        targetPath = '';
      }
      
      if (dragged.rel_path === targetPath || dragParent === targetPath) return;
      
      this.isFsLoading = true;
      this.cdr.detectChanges();
      await this.archiveService.movePath(this.labId, dragged.rel_path, targetPath);
      await this.loadFsList();
      await this.loadRecords();
      await this.refreshTreeNodeByPath(dragParent);
      await this.refreshTreeNodeByPath(targetPath);
    } catch (e) {
      console.error('Drop to sidebar tree failed', e);
      alert('Move failed');
    } finally {
      this.isFsLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ── Split Excel Operations ──
  async downloadExcelTemplate() {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template');
    
    worksheet.columns = [
      { header: 'Barcode', key: 'barcode', width: 15 },
      { header: 'Sample Name', key: 'sample_name', width: 25 },
      { header: 'Person', key: 'person', width: 18 },
      { header: 'Project', key: 'project', width: 20 },
      { header: 'Lab', key: 'lab', width: 18 }
    ];
    
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2C3E50' }
    };
    
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'sample-table-template.xlsx');
  }

  async exportCurrentTable() {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sample Table');
    
    worksheet.columns = [
      { header: 'Barcode', key: 'barcode', width: 15 },
      { header: 'Sample Name', key: 'sample_name', width: 25 },
      { header: 'Person', key: 'person', width: 18 },
      { header: 'Project', key: 'project', width: 20 },
      { header: 'Lab', key: 'lab', width: 18 },
      { header: 'Storage Location', key: 'storage_location', width: 20 },
      { header: 'Files', key: 'files', width: 30 },
      { header: 'Links', key: 'links', width: 30 },
      { header: 'Record Link', key: 'record_link', width: 20 }
    ];
    
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2C3E50' }
    };
    
    for (const sample of this.samples) {
      const filesStr = (sample.files || []).map((f: any) => `${f.filename}|${f.path}`).join(', ');
      const linksStr = (sample.links || []).join(', ');
      const recordTitle = sample.linked_record_id ? this.getRecordTitle(sample.linked_record_id) : '';
      
      worksheet.addRow({
        barcode: sample.barcode || '',
        sample_name: sample.sample_name || '',
        person: sample.person || '',
        project: sample.project || '',
        lab: sample.lab || '',
        storage_location: sample.storage_location || '',
        files: filesStr,
        links: linksStr,
        record_link: recordTitle
      });
    }
    
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'current-samples.xlsx');
  }

  async importExcelFile(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    
    this.isFsLoading = true;
    this.cdr.detectChanges();
    
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('No sheet found in Excel file.');
      }
      
      const headerRow = worksheet.getRow(1);
      let colIndices = { barcode: -1, sampleName: -1, person: -1, project: -1, lab: -1, location: -1, files: -1, links: -1, record: -1 };
      
      headerRow.eachCell((cell, colNum) => {
        const text = cell.text.toLowerCase().trim().replace(/[\s_]/g, '');
        if (text === 'barcode') colIndices.barcode = colNum;
        else if (text === 'samplename') colIndices.sampleName = colNum;
        else if (text === 'person' || text === 'researcher') colIndices.person = colNum;
        else if (text === 'project') colIndices.project = colNum;
        else if (text === 'lab' || text === 'labgroup') colIndices.lab = colNum;
        else if (text === 'storagelocation' || text === 'location') colIndices.location = colNum;
        else if (text === 'files') colIndices.files = colNum;
        else if (text === 'links') colIndices.links = colNum;
        else if (text === 'recordlink' || text === 'linkedrecord' || text === 'record') colIndices.record = colNum;
      });
      
      if (colIndices.barcode === -1 && colIndices.sampleName === -1) {
        colIndices = { barcode: 1, sampleName: 2, person: 3, project: 4, lab: 5, location: -1, files: -1, links: -1, record: -1 };
      }
      
      let importedCount = 0;
      let skippedCount = 0;
      
      worksheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        
        const barcode = colIndices.barcode > -1 ? row.getCell(colIndices.barcode).text.trim() : '';
        const sample_name = colIndices.sampleName > -1 ? row.getCell(colIndices.sampleName).text.trim() : '';
        const person = colIndices.person > -1 ? row.getCell(colIndices.person).text.trim() : '';
        const project = colIndices.project > -1 ? row.getCell(colIndices.project).text.trim() : '';
        const lab = colIndices.lab > -1 ? row.getCell(colIndices.lab).text.trim() : '';
        const storage_location = colIndices.location > -1 ? row.getCell(colIndices.location).text.trim() : '';
        const filesVal = colIndices.files > -1 ? row.getCell(colIndices.files).text.trim() : '';
        const linksVal = colIndices.links > -1 ? row.getCell(colIndices.links).text.trim() : '';
        const recordVal = colIndices.record > -1 ? row.getCell(colIndices.record).text.trim() : '';
        
        // Skip duplicate barcodes
        if (barcode) {
          const isDup = this.samples.some(s => s.barcode && s.barcode.toLowerCase() === barcode.toLowerCase());
          if (isDup) {
            skippedCount++;
            return;
          }
        }
        
        const files: any[] = [];
        if (filesVal) {
          const parts = filesVal.split(',');
          for (const p of parts) {
            const trimmed = p.trim();
            if (!trimmed) continue;
            if (trimmed.includes('|')) {
              const [filename, path] = trimmed.split('|');
              files.push({ filename: filename.trim(), path: path.trim() });
            } else {
              files.push({ filename: trimmed, path: trimmed });
            }
          }
        }
        
        const links = linksVal ? linksVal.split(',').map(l => l.trim()).filter(l => l) : [];
        
        let linked_record_id = '';
        if (recordVal) {
          const matched = this.records.find(r => r.id === recordVal || r.title?.toLowerCase() === recordVal.toLowerCase());
          if (matched) linked_record_id = matched.id;
        }
        
        this.samples.push({
          id: '',
          barcode,
          sample_name,
          storage_location,
          person,
          project,
          lab,
          files,
          links,
          linked_record_id
        });
        importedCount++;
      });
      
      this.onSamplesChange();
      alert(`Import complete!\nSuccessfully imported ${importedCount} samples.\nSkipped ${skippedCount} duplicates with existing barcodes.`);
    } catch (e) {
      console.error('Import excel failed', e);
      alert('Failed to import Excel: ' + (e as any).message);
    } finally {
      this.isFsLoading = false;
      event.target.value = '';
      this.cdr.detectChanges();
    }
  }
}
