import { Component, OnInit, OnDestroy, ViewChild, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { NamuDocument, NamuTree } from '../../models/namu.model';
import { NamuStorageService } from '../../services/namu-storage.service';
import { NamuFlowViewComponent } from '../../components/protocol-builder/namu-flow-view.component';
import { NamuNotebookViewComponent } from '../../components/protocol-builder/namu-notebook-view.component';
import { ProtocolTreeService } from '../../services/protocol-tree.service';
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
      
      <!-- ── VSCODE-STYLE WELCOME LANDING SCREEN (When no file is open) ── -->
      <div class="vscode-welcome-screen" *ngIf="!isFileLoaded">
        <div class="welcome-card-box">
          <div class="welcome-header">
            <h1 class="welcome-title">Tree Protocol</h1>
            <p class="welcome-subtitle">Map experiment steps visually, record supporting notes, and save the protocol directly on your device.</p>
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
        </header>

        <!-- ── Main Viewport Content ── -->
        <main class="namu-viewport" *ngIf="activeTree">
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

    </div>
  `,
  styleUrl: './protocol-builder-page.component.css'
})
export class NamuPageComponent implements OnInit, OnDestroy {
  @ViewChild(NamuFlowViewComponent) flowView?: NamuFlowViewComponent;
  @ViewChild('fileInput') fileInput: any;

  doc: NamuDocument | null = null;
  saveStatus: 'saved' | 'saving' | 'error' | 'unsaved' = 'unsaved';
  openedFileName = '';
  isFileLoaded = false;
  connectionEditMode = false;
  viewMode: 'canvas' | 'notebook' = 'canvas';
  showSaveMenu = false;

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
