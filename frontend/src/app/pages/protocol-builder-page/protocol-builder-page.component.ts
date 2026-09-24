import { Component, OnInit, OnDestroy, ViewChild, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { NamuDocument, NamuTree } from '../../models/namu.model';
import { NamuStorageService } from '../../services/namu-storage.service';
import { NamuFlowViewComponent } from '../../components/protocol-builder/namu-flow-view.component';
import { NamuNotebookViewComponent } from '../../components/protocol-builder/namu-notebook-view.component';
import { ProtocolTreeRecord, ProtocolTreeService } from '../../services/protocol-tree.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-namu-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NamuFlowViewComponent,
    NamuNotebookViewComponent
  ],
  template: `
    <div class="namu-page-shell">
      <!-- Works on HTTP deployments where the File System Access API is unavailable. -->
      <input
        #fileInput
        class="file-input-hidden"
        type="file"
        accept=".json,.namu.json,application/json,text/plain"
        (change)="importJsonFile($event)"
      />
      <input
        #mergeFileInput
        class="file-input-hidden"
        type="file"
        multiple
        accept=".json,.namu.json,application/json,text/plain"
        (change)="importProtocolTrees($event)"
      />
      
      <!-- ── VSCODE-STYLE WELCOME LANDING SCREEN (When no file is open) ── -->
      <div class="vscode-welcome-screen" *ngIf="!isFileLoaded">
        <div class="welcome-card-box">
          <div class="welcome-header">
            <h1 class="welcome-title">Tree Protocol</h1>
          </div>

          <div class="welcome-actions-grid">
            <button type="button" class="btn-welcome-primary" (click)="openFile()">
              <div class="action-text">
                <strong>Open</strong>
                <span>Open an existing protocol JSON file</span>
              </div>
            </button>

            <button type="button" class="btn-welcome-secondary" (click)="createNewFile()">
              <div class="action-text">
                <strong>New</strong>
                <span>Start a new local working copy</span>
              </div>
            </button>

            <button type="button" class="btn-welcome-secondary" (click)="openFromMyData()"
              [disabled]="!auth.isLoggedIn" [title]="auth.isLoggedIn ? 'Open a saved Tree Protocol' : 'Sign in to open My Data'">
              <div class="action-text">
                <strong>Open from My Data</strong>
                <span>Open a saved Tree Protocol</span>
              </div>
            </button>
          </div>

          <div class="welcome-footer">
            Your edits stay in a working copy. Use Save to update an opened file, or Save As to create one.
          </div>
        </div>
      </div>

      <!-- ── FULL EDITOR WORKSPACE (When file is open) ── -->
      <div class="namu-editor-container" *ngIf="isFileLoaded">
        <!-- ── Top Toolbar ── -->
        <header class="namu-toolbar">
          <div class="toolbar-left">
            <span class="plain-file-title">{{ doc?.title || openedFileName }}</span>
            <button type="button" class="btn-tool-action" (click)="renameProtocol()">Rename protocol</button>
            <button type="button" class="btn-tool-action" (click)="openProtocolManager()" title="Merge or split protocol trees">Tree management</button>
          </div>

          <div class="toolbar-right">
            <div class="view-switcher">
              <button type="button" [class.active]="viewMode === 'canvas'" (click)="setViewMode('canvas')">Canvas</button>
              <button type="button" [class.active]="viewMode === 'notebook'" (click)="setViewMode('notebook')">Notebook</button>
            </div>
            <div class="save-action-menu">
              <button type="button" class="btn-tool-action btn-primary-save" (click)="runPrimarySave()">
                {{ primarySaveLabel }}
              </button>
              <button type="button" class="btn-tool-action btn-save-menu-toggle" (click)="showSaveMenu = !showSaveMenu" aria-label="Other save options" [attr.aria-expanded]="showSaveMenu">▾</button>
              <div class="save-action-dropdown" *ngIf="showSaveMenu">
                <button type="button" *ngIf="primarySaveAction !== 'save' && canSave" (click)="saveFile()">Save</button>
                <button type="button" *ngIf="primarySaveAction !== 'update-my-data' && hasMyDataRecord" (click)="updateMyData()">Update My Data</button>
                <button type="button" *ngIf="primarySaveAction !== 'save-to-my-data'" (click)="saveToMyData()">Save to My Data</button>
                <button type="button" (click)="saveAsFile()">Save As</button>
              </div>
            </div>

            <button type="button" class="btn-tool-action btn-close-file" (click)="closeCurrentFile()" title="Close file and return to welcome screen">
              Close
            </button>
          </div>
          <div class="mobile-toolbar-main">
            <span class="mobile-file-title">{{ doc?.title || openedFileName }}</span>
            <div class="mobile-view-switcher">
              <button type="button" [class.active]="viewMode === 'canvas'" (click)="setViewMode('canvas')">Canvas</button>
              <button type="button" [class.active]="viewMode === 'notebook'" (click)="setViewMode('notebook')">Notes</button>
            </div>
            <button type="button" class="mobile-more-button" (click)="showMobileTools = !showMobileTools" aria-label="Protocol actions">•••</button>
          </div>
          <div class="mobile-toolbar-menu" *ngIf="showMobileTools">
            <button type="button" (click)="renameProtocol(); showMobileTools = false">Rename</button>
            <button type="button" (click)="openProtocolManager(); showMobileTools = false">Manage trees</button>
            <button type="button" (click)="runPrimarySave(); showMobileTools = false">{{ primarySaveLabel }}</button>
            <button type="button" (click)="saveAsFile(); showMobileTools = false">Save As</button>
            <button type="button" class="danger" (click)="closeCurrentFile(); showMobileTools = false">Close</button>
          </div>
        </header>

        <!-- ── Main Viewport Content ── -->
        <main class="namu-viewport" [class.canvas-viewport]="viewMode === 'canvas'" *ngIf="activeTree">
          <app-namu-flow-view *ngIf="viewMode === 'canvas'"
            [doc]="doc!"
            [tree]="activeTree"
            [connectionEditMode]="connectionEditMode">
          </app-namu-flow-view>
          <app-namu-notebook-view *ngIf="viewMode === 'notebook'"
            [tree]="activeTree"
            [trees]="doc?.trees || []"
            (treeChange)="switchTree($event)">
          </app-namu-notebook-view>
        </main>
      </div>

      <!-- Empty State fallback inside editor -->
      <div class="empty-namu-state" *ngIf="isFileLoaded && !activeTree">
        <h3>No Trees Available</h3>
        <p>Create your first experiment protocol tree to start visualizing steps.</p>
        <button (click)="createNewTree()">+ Create Experiment Tree</button>
      </div>

      <!-- ── BOTTOM-RIGHT CANVAS QUICK-TOOLS DOCK ── -->
      <div class="floating-canvas-dock" *ngIf="isFileLoaded && activeTree && viewMode === 'canvas'">
        <!-- Tree Controls Dock -->
        <div class="fab-tree-selector-group" *ngIf="doc && doc.trees && doc.trees.length > 0">
          <select class="fab-tree-dropdown" [ngModel]="activeTree.id" (ngModelChange)="switchTree($event)">
            <option *ngFor="let t of doc.trees" [value]="t.id">
              {{ t.name }} ({{ t.nodes.length }})
            </option>
          </select>

          <!-- Figma-style Precision Pen Edit Icon -->
          <button type="button" class="btn-fab-icon" (click)="renameActiveTree()" title="Rename current tree">
            Rename
          </button>

          <!-- Figma-style Precision Trash Icon -->
          <button type="button" class="btn-fab-icon btn-fab-del" (click)="deleteActiveTree()" title="Delete current tree" *ngIf="doc.trees.length > 1">
            Delete
          </button>

          <!-- Modern New Tree Button -->
          <button type="button" class="btn-fab-new-tree" (click)="createNewTree()">
            <span>New Tree</span>
          </button>
        </div>

        <!-- Sleek Floating Align FAB Button with Modern Vector Layout Icon -->
        <button type="button" class="btn-fab-layout" *ngIf="viewMode === 'canvas'" (click)="alignActiveTree()" title="Align tree nodes in clean straight-line layout">
          <span>Align</span>
        </button>

        <button type="button" class="btn-fab-layout" *ngIf="viewMode === 'canvas'" [class.connection-edit-active]="connectionEditMode"
          (click)="toggleConnectionEditMode()">
          <span>{{ connectionEditMode ? 'Done editing links' : 'Edit links' }}</span>
        </button>

        <!-- Working-copy status; it does not write to the source file. -->
        <div class="fixed-auto-save-dot"
          [class.saved]="saveStatus === 'saved'"
          [class.saving]="saveStatus === 'saving'"
          [attr.title]="saveStatus === 'saved' ? 'Saved to file' : saveStatus === 'saving' ? 'Saving to file...' : 'Working copy has unsaved file changes'">
        </div>
      </div>

      <div class="protocol-manager-backdrop" *ngIf="showProtocolManager" (click)="closeProtocolManager()">
        <section class="protocol-manager-modal" role="dialog" aria-modal="true" aria-label="Manage protocol trees" (click)="$event.stopPropagation()">
          <header class="protocol-manager-header">
            <div>
              <h2>Tree management</h2>
            </div>
            <button type="button" class="protocol-manager-close" (click)="closeProtocolManager()" aria-label="Close">×</button>
          </header>

          <nav class="protocol-manager-tabs" aria-label="Protocol management options">
            <button type="button" [class.active]="protocolManagerTab === 'merge'" (click)="protocolManagerTab = 'merge'">Merge</button>
            <button type="button" [class.active]="protocolManagerTab === 'split'" (click)="protocolManagerTab = 'split'">Split</button>
          </nav>

          <div class="protocol-manager-body" *ngIf="protocolManagerTab === 'merge'">
            <div class="protocol-manager-intro">
              <button type="button" class="protocol-manager-file" (click)="mergeProtocolFiles()">Import files instead</button>
            </div>

            <p class="protocol-manager-state" *ngIf="loadingSavedProtocols">Loading saved protocols…</p>
            <p class="protocol-manager-state" *ngIf="!auth.isLoggedIn">Sign in to select protocols saved in My Data. You can still import a local file.</p>
            <p class="protocol-manager-state" *ngIf="auth.isLoggedIn && !loadingSavedProtocols && !savedProtocols.length">No other Tree Protocol files are saved in My Data yet.</p>

            <div class="saved-protocol-list" *ngIf="savedProtocols.length">
              <article class="saved-protocol-card" *ngFor="let record of savedProtocols">
                <div class="saved-protocol-title">
                  <strong>{{ record.title }}</strong>
                  <span>{{ record.document_json.trees.length }} tree{{ record.document_json.trees.length === 1 ? '' : 's' }} · Updated {{ record.updated_at | date:'mediumDate' }}</span>
                </div>
                <label class="saved-tree-option" *ngFor="let tree of record.document_json.trees">
                  <input type="checkbox" [checked]="isSourceTreeSelected(record.id, tree.id)" (change)="toggleSourceTree(record.id, tree.id, $any($event.target).checked)">
                  <span>{{ tree.name }}</span>
                  <small>{{ tree.nodes.length }} nodes</small>
                </label>
              </article>
            </div>
            <label class="split-remove-option" *ngIf="savedProtocols.length">
              <input type="checkbox" [(ngModel)]="removeMergedSourceTrees">
              <span>Remove selected trees from source protocols after merging</span>
            </label>
          </div>

          <div class="protocol-manager-body split-manager" *ngIf="protocolManagerTab === 'split'">
            <label>
              <span>Tree</span>
              <select [(ngModel)]="splitTreeId" (ngModelChange)="syncSplitTitle()">
                <option *ngFor="let tree of doc?.trees || []" [value]="tree.id">{{ tree.name }} ({{ tree.nodes.length }} nodes)</option>
              </select>
            </label>
            <label>
              <span>Name</span>
              <input type="text" [(ngModel)]="splitProtocolTitle" placeholder="Protocol name">
            </label>
            <label class="split-remove-option" [class.disabled]="(doc?.trees?.length || 0) <= 1">
              <input type="checkbox" [(ngModel)]="removeSplitTree" [disabled]="(doc?.trees?.length || 0) <= 1">
              <span>Remove from current protocol after saving</span>
            </label>
            <p class="protocol-manager-state" *ngIf="!auth.isLoggedIn">Sign in to save a separate protocol in My Data.</p>
          </div>

          <footer class="protocol-manager-footer">
            <div>
              <button type="button" class="protocol-manager-cancel" (click)="closeProtocolManager()">Cancel</button>
              <button type="button" class="protocol-manager-confirm" *ngIf="protocolManagerTab === 'merge'" [disabled]="!selectedSourceTreeCount || mergingTrees" (click)="mergeSelectedSavedTrees()">{{ mergingTrees ? 'Merging…' : 'Merge selected' }}</button>
              <button type="button" class="protocol-manager-confirm" *ngIf="protocolManagerTab === 'split'" [disabled]="!auth.isLoggedIn || !splitTreeId || !splitProtocolTitle.trim() || splittingTree" (click)="splitTreeToMyData()">{{ splittingTree ? 'Saving…' : 'Save' }}</button>
            </div>
          </footer>
        </section>
      </div>

    </div>
  `,
  styleUrl: './protocol-builder-page.component.css'
})
export class NamuPageComponent implements OnInit, OnDestroy {
  showMobileTools = false;
  @ViewChild(NamuFlowViewComponent) flowView?: NamuFlowViewComponent;
  @ViewChild('fileInput') fileInput: any;
  @ViewChild('mergeFileInput') mergeFileInput: any;

  doc: NamuDocument | null = null;
  saveStatus: 'saved' | 'saving' | 'error' | 'unsaved' = 'unsaved';
  openedFileName = '';
  isFileLoaded = false;
  connectionEditMode = false;
  viewMode: 'canvas' | 'notebook' = 'canvas';
  showSaveMenu = false;
  showProtocolManager = false;
  protocolManagerTab: 'merge' | 'split' = 'merge';
  loadingSavedProtocols = false;
  savedProtocols: ProtocolTreeRecord[] = [];
  selectedSourceTrees: Record<string, boolean> = {};
  removeMergedSourceTrees = false;
  mergingTrees = false;
  splitTreeId = '';
  splitProtocolTitle = '';
  removeSplitTree = false;
  splittingTree = false;

  private sub = new Subscription();

  constructor(
    private namuStorageService: NamuStorageService,
    private protocolTreeService: ProtocolTreeService,
    public auth: AuthService,
    private router: Router,
    private zone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    if (typeof window !== 'undefined' && window.innerWidth <= 900 && window.history.state?.openProtocolInNotebook) {
      this.viewMode = 'notebook';
    }
    this.sub.add(this.namuStorageService.doc$.subscribe(d => {
      this.zone.run(() => {
        this.doc = d;
        this.cdr.detectChanges();
      });
    }));
    this.sub.add(this.namuStorageService.saveStatus$.subscribe(st => {
      this.zone.run(() => {
        this.saveStatus = st;
        this.cdr.detectChanges();
      });
    }));
    this.sub.add(this.namuStorageService.openedFileName$.subscribe(fn => {
      this.zone.run(() => {
        this.openedFileName = fn;
        this.cdr.detectChanges();
      });
    }));
    this.sub.add(this.namuStorageService.isFileLoaded$.subscribe(fl => {
      this.zone.run(() => {
        this.isFileLoaded = fl;
        this.cdr.detectChanges();
      });
    }));
  }

  async createNewFile() {
    this.namuStorageService.createNewFile();
    this.zone.run(() => {
      this.cdr.detectChanges();
    });
  }

  openFromMyData() {
    if (!this.auth.isLoggedIn) return;
    void this.router.navigate(['/data/protocol-trees']);
  }

  get canSave(): boolean {
    return this.namuStorageService.canSaveToFile;
  }

  get hasMyDataRecord(): boolean { return this.namuStorageService.hasMyDataRecord; }
  get primarySaveAction(): 'save' | 'save-to-my-data' | 'update-my-data' {
    if (this.canSave) return 'save';
    return this.hasMyDataRecord ? 'update-my-data' : 'save-to-my-data';
  }
  get primarySaveLabel(): string {
    return this.primarySaveAction === 'save' ? 'Save' : this.primarySaveAction === 'update-my-data' ? 'Update My Data' : 'Save to My Data';
  }

  async runPrimarySave() {
    if (this.primarySaveAction === 'save') await this.saveFile();
    else if (this.primarySaveAction === 'update-my-data') await this.updateMyData();
    else await this.saveToMyData();
  }

  async saveFile() {
    this.showSaveMenu = false;
    const success = await this.namuStorageService.saveToOpenedFile();
    this.zone.run(() => {
      if (!success) alert('There is no file to update yet. Use Save As first.');
      this.cdr.detectChanges();
    });
  }

  async saveToMyData() {
    this.showSaveMenu = false;
    const title = prompt('Save Protocol Tree to My Data', this.doc?.title || this.activeTree?.name || 'Untitled Protocol');
    if (!title?.trim() || !this.doc) return;
    try {
      this.namuStorageService.renameDocument(title.trim());
      const saved = await this.protocolTreeService.saveTree(title.trim(), this.namuStorageService.currentDoc);
      this.namuStorageService.markSavedToMyData(saved.id, title.trim());
      alert('Saved to My Data. You can share it with a lab from My Data → Tree Protocol.');
    } catch (error) {
      console.error('Failed to save protocol tree', error);
      alert('Could not save to My Data. Please sign in and try again.');
    }
  }

  async updateMyData() {
    this.showSaveMenu = false;
    const id = this.namuStorageService.currentMyDataRecordId;
    if (!id || !this.doc) return;
    try {
      await this.protocolTreeService.updateTree(id, this.doc.title || this.activeTree?.name || 'Untitled Protocol', this.doc);
      this.namuStorageService.markSavedToMyData(id);
      alert('My Data has been updated.');
    } catch (error) {
      console.error('Failed to update protocol tree', error);
      alert('Could not update My Data. Please try again.');
    }
  }

  closeCurrentFile() {
    this.namuStorageService.closeCurrentFile();
  }

  ngOnDestroy() {
    if (this.sub) this.sub.unsubscribe();
  }

  get activeTree(): NamuTree | undefined {
    return this.namuStorageService.activeTree;
  }

  switchTree(treeId: string) {
    this.namuStorageService.setActiveTree(treeId);
    // Switching trees is workspace navigation. Keep each tree's saved layout
    // intact and only centre the newly selected workspace after it renders.
    setTimeout(() => this.flowView?.centerTreeInCanvas(), 80);
  }

  createNewTree() {
    const name = prompt('Enter new Experiment Tree Name:', 'New Research Protocol');
    if (name) {
      this.namuStorageService.createTree(name);
      setTimeout(() => this.flowView?.centerTreeInCanvas(), 80);
    }
  }

  renameActiveTree() {
    if (!this.activeTree) return;
    const newName = prompt('Rename Experiment Tree:', this.activeTree.name);
    if (newName && newName.trim()) {
      this.namuStorageService.renameTree(this.activeTree.id, newName.trim());
    }
  }

  renameProtocol() {
    if (!this.doc) return;
    const newTitle = prompt('Rename Tree Protocol:', this.doc.title || this.openedFileName.replace(/\s+—\s+not saved$/, ''));
    if (newTitle?.trim()) this.namuStorageService.renameDocument(newTitle.trim());
  }

  async openProtocolManager() {
    this.showProtocolManager = true;
    this.protocolManagerTab = 'merge';
    this.selectedSourceTrees = {};
    this.removeMergedSourceTrees = false;
    this.splitTreeId = this.activeTree?.id || this.doc?.trees[0]?.id || '';
    this.syncSplitTitle();
    this.removeSplitTree = false;
    this.savedProtocols = [];
    if (!this.auth.isLoggedIn) return;
    this.loadingSavedProtocols = true;
    try {
      const currentRecordId = this.namuStorageService.currentMyDataRecordId;
      this.savedProtocols = (await this.protocolTreeService.getTrees('my'))
        .filter(record => record.id !== currentRecordId && Array.isArray(record.document_json?.trees));
    } catch (error) {
      console.error('Failed to load saved protocols', error);
      alert('Could not load your saved protocols. You can still import a local protocol file.');
    } finally {
      this.loadingSavedProtocols = false;
      this.cdr.detectChanges();
    }
  }

  closeProtocolManager() {
    this.showProtocolManager = false;
  }

  mergeProtocolFiles() {
    this.closeProtocolManager();
    this.mergeFileInput?.nativeElement.click();
  }

  isSourceTreeSelected(recordId: string, treeId: string): boolean {
    return !!this.selectedSourceTrees[`${recordId}:${treeId}`];
  }

  toggleSourceTree(recordId: string, treeId: string, selected: boolean) {
    const key = `${recordId}:${treeId}`;
    this.selectedSourceTrees = { ...this.selectedSourceTrees, [key]: selected };
  }

  get selectedSourceTreeCount(): number {
    return Object.values(this.selectedSourceTrees).filter(Boolean).length;
  }

  async mergeSelectedSavedTrees() {
    const selectedDocuments = this.savedProtocols.map(record => ({
      ...record.document_json,
      trees: record.document_json.trees.filter(tree => this.isSourceTreeSelected(record.id, tree.id))
    })).filter(document => document.trees.length);
    if (!selectedDocuments.length) return;
    this.mergingTrees = true;
    try {
      const count = this.namuStorageService.mergeDocuments(selectedDocuments);
      if (this.removeMergedSourceTrees) {
        for (const record of this.savedProtocols) {
          const selectedIds = new Set(record.document_json.trees
            .filter(tree => this.isSourceTreeSelected(record.id, tree.id))
            .map(tree => tree.id));
          if (!selectedIds.size) continue;
          const remainingTrees = record.document_json.trees.filter(tree => !selectedIds.has(tree.id));
          if (!remainingTrees.length) {
            await this.protocolTreeService.deleteTree(record.id);
          } else {
            await this.protocolTreeService.updateTree(record.id, record.title, {
              ...record.document_json,
              trees: remainingTrees,
              activeTreeId: remainingTrees.some(tree => tree.id === record.document_json.activeTreeId)
                ? record.document_json.activeTreeId : remainingTrees[0].id
            });
          }
        }
      }
      this.closeProtocolManager();
      alert(`${count} tree${count === 1 ? '' : 's'} ${this.removeMergedSourceTrees ? 'moved' : 'added'} to this protocol.`);
    } catch (error) {
      console.error('Failed to remove merged source trees', error);
      alert('The selected trees were added, but their source protocol could not be updated.');
    } finally {
      this.mergingTrees = false;
      this.cdr.detectChanges();
    }
  }

  syncSplitTitle() {
    const tree = this.doc?.trees.find(candidate => candidate.id === this.splitTreeId);
    this.splitProtocolTitle = tree?.name || '';
  }

  async splitTreeToMyData() {
    const tree = this.doc?.trees.find(candidate => candidate.id === this.splitTreeId);
    const title = this.splitProtocolTitle.trim();
    if (!tree || !title || !this.auth.isLoggedIn) return;
    this.splittingTree = true;
    try {
      const copiedTree = JSON.parse(JSON.stringify(tree)) as NamuTree;
      const separateDocument: NamuDocument = { version: '1.0', title, trees: [copiedTree], activeTreeId: copiedTree.id };
      await this.protocolTreeService.saveTree(title, separateDocument);
      if (this.removeSplitTree && (this.doc?.trees.length || 0) > 1) {
        this.namuStorageService.deleteTree(tree.id);
      }
      this.closeProtocolManager();
      alert(`"${title}" was saved as a separate protocol in My Data.`);
    } catch (error) {
      console.error('Failed to split protocol tree', error);
      alert('Could not save the separate protocol. Please try again.');
    } finally {
      this.splittingTree = false;
      this.cdr.detectChanges();
    }
  }

  async importProtocolTrees(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    try {
      const documents: NamuDocument[] = [];
      for (const file of files) {
        const parsed = JSON.parse(await file.text()) as NamuDocument;
        if (!parsed || !Array.isArray(parsed.trees)) throw new Error(`${file.name} is not a Tree Protocol file.`);
        documents.push(parsed);
      }
      const count = this.namuStorageService.mergeDocuments(documents);
      alert(`${count} tree${count === 1 ? '' : 's'} imported from ${files.length} protocol file${files.length === 1 ? '' : 's'}.`);
    } catch (error) {
      console.error('Failed to merge protocol files', error);
      alert(error instanceof Error ? error.message : 'Could not merge the selected protocol files.');
    } finally {
      input.value = '';
    }
  }

  deleteActiveTree() {
    if (!this.activeTree) return;
    if (confirm(`Are you sure you want to delete tree "${this.activeTree.name}"?`)) {
      this.namuStorageService.deleteTree(this.activeTree.id);
    }
  }

  alignActiveTree() {
    if (this.activeTree) {
      this.namuStorageService.autoLayoutTreeNodes(this.activeTree.id);
      setTimeout(() => {
        if (this.flowView) this.flowView.centerTreeInCanvas();
      }, 100);
    }
  }

  toggleConnectionEditMode() {
    this.connectionEditMode = !this.connectionEditMode;
  }

  setViewMode(mode: 'canvas' | 'notebook') {
    this.viewMode = mode;
    if (mode === 'notebook') this.connectionEditMode = false;
  }

  async openFile() {
    // localhost/HTTPS can use a writable native handle. The deployed server is
    // currently HTTP, where browsers intentionally hide that API; use the
    // normal file input there so Open still works.
    if (!this.namuStorageService.supportsNativeFilePicker) {
      this.fileInput?.nativeElement.click();
      return;
    }

    const success = await this.namuStorageService.openNativeFile();
    if (success) {
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  async saveAsFile() {
    this.showSaveMenu = false;
    const success = await this.namuStorageService.saveAsNativeFile();
    this.zone.run(() => {
      if (!success) {
        this.exportJsonFile();
      }
      this.cdr.detectChanges();
    });
  }

  exportJsonFile() {
    const jsonText = this.namuStorageService.exportDocumentToJson();
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.activeTree?.name || 'Namu_Document'}.namu.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importJsonFile(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const content = e.target.result;
      const success = this.namuStorageService.importDocumentFromJson(content);
      this.zone.run(() => {
        if (success) {
          this.namuStorageService.openedFileName$.next(file.name);
          this.namuStorageService.isFileLoaded$.next(true);
        } else {
          alert('Failed to import Namu document: Invalid JSON format.');
        }
        this.cdr.detectChanges();
      });
    };
    reader.readAsText(file);
    event.target.value = '';
  }
}
