import { Component, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResultsService, CrisprResult } from '../../services/results.service';
import { LabService } from '../../services/lab.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AppStateService } from '../../services/app-state.service';
import { AuthService } from '../../services/auth.service';
import { ProtocolTreeService, ProtocolTreeRecord } from '../../services/protocol-tree.service';
import { NamuStorageService } from '../../services/namu-storage.service';
import { PcrPresetService, PCRPreset } from '../../services/pcr-preset.service';
import { MyDataHeaderComponent } from '../../components/my-data-header.component';
import { MyDataCardBadge, MyDataCardComponent } from '../../components/my-data-card.component';

@Component({
  selector: 'app-my-data',
  standalone: true,
  imports: [CommonModule, FormsModule, MyDataHeaderComponent, MyDataCardComponent],
  template: `
    <div class="my-data-container">

      <app-my-data-header [title]="pageTitle"></app-my-data-header>

      <!-- Navigation and compact list controls -->
      <div class="data-toolbar">
        <div class="tabs-nav">
          <button [class.active]="activeTab === 'all'" (click)="setTab('all')">All Data</button>
          <button [class.active]="activeTab === 'my'" (click)="setTab('my')">My Data</button>
          <button [class.active]="activeTab === 'shared'" (click)="setTab('shared')">Shared with Me</button>
        </div>
        <label class="sort-control">
          <span>Sort</span>
          <select [(ngModel)]="sortMode" (ngModelChange)="applySorting()" aria-label="Sort saved data">
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
          </select>
        </label>
      </div>

      <div *ngIf="loading" class="loading-spinner">
        <div class="spinner"></div>
        <p>Loading {{ resource === 'protocol' ? 'Tree Protocols' : resource === 'pcr' ? 'Solution Protocols' : 'Crispr Analysis' }}...</p>
      </div>

      <!-- Results Grid -->
      <div *ngIf="!loading && displayResults.length > 0" class="results-grid">
        <app-my-data-card *ngFor="let res of displayResults"
          [title]="getItemTitle(res)" [badges]="getCardBadges(res)" [meta]="getCardMeta(res)"
          [shared]="!!res.is_shared" [muted]="resource === 'pcr' && isSystemPreset(res)"
          [showPin]="true" [pinned]="isPinned(res)" [primaryLabel]="resource === 'protocol' ? 'Open Tree Protocol' : resource === 'pcr' ? 'Open Solution Protocol' : 'View Crispr Analysis'"
          [showShare]="canManage(res)" [showDelete]="canManage(res)" [readOnly]="!!res.is_shared && !isOwner(res)"
          (pin)="togglePin(res, $event)" (open)="loadItem(res)" (share)="openShareModal(res)" (remove)="deleteItem(res.id || '')">
          <div card-content *ngIf="res.is_shared" class="sharing-info">
              <!-- If I am owner, show WHO I shared it with -->
              <div *ngIf="isOwner(res)" class="info-row vertical">
                <span class="label">Shared with:</span>
                <div class="labs-scroll-list">
                  <div *ngFor="let lab of res.shared_with_labs" class="lab-tag">
                    <span class="dot"></span> {{ lab }}
                  </div>
                </div>
              </div>
              
              <!-- If I am NOT owner, show WHO shared it with me -->
              <div *ngIf="!isOwner(res)" class="info-row">
                <span class="label">Shared by:</span>
                <span class="value">{{ res.shared_by_name }}</span>
              </div>
              <div *ngIf="!isOwner(res)" class="info-row vertical">
                <span class="label">Shared via:</span>
                <div class="labs-scroll-list">
                  <div *ngFor="let lab of res.shared_with_labs || []" class="lab-tag">
                    <span class="dot"></span> {{ lab }}
                  </div>
                </div>
              </div>
          </div>
        </app-my-data-card>
      </div>

      <div *ngIf="!loading && displayResults.length === 0" class="empty-state">
        <div class="empty-icon">📁</div>
        <h3>No {{ resource === 'protocol' ? 'Tree Protocols' : resource === 'pcr' ? 'Solution Protocols' : 'Crispr Analysis' }} found</h3>
        <p>You haven't saved or shared any {{ resource === 'protocol' ? 'Tree Protocols' : resource === 'pcr' ? 'Solution Protocols' : 'Crispr Analysis' }} in this category yet.</p>
        <button *ngIf="activeTab === 'my'" (click)="startNewItem()" class="btn-primary">{{ resource === 'protocol' ? 'Open Tree Protocol' : resource === 'pcr' ? 'Open Solution Protocol' : 'Start Crispr Analysis' }}</button>
      </div>

      <!-- Share Modal -->
      <div *ngIf="sharingResult" class="modal-overlay" (click)="closeShareModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Share {{ resource === 'protocol' ? 'Protocol Tree' : resource === 'pcr' ? 'PCR Protocol' : 'Result' }}</h2>
            <button class="close-btn" (click)="closeShareModal()">×</button>
          </div>
          <div class="modal-body">
            <p class="modal-sub">Select the labs you want to share "<strong>{{ getItemTitle(sharingResult) }}</strong>" with.</p>
            
            <div *ngIf="myLabs.length === 0" class="no-labs-warning">
              You don't belong to any labs yet. Please register or join a lab first.
            </div>

            <div class="labs-list">
              <div *ngFor="let lab of myLabs" class="lab-item" [class.lab-unavailable]="isLabUnavailable(lab)">
                <label class="checkbox-container">
                  <input type="checkbox" 
                         [checked]="isLabSelected(lab.id)"
                         [disabled]="isLabUnavailable(lab)"
                         (change)="toggleLabShare(lab.id)">
                  <span class="checkmark"></span>
                  <div class="lab-info">
                    <span class="lab-name">{{ lab.lab_name }}</span>
                    <span class="lab-role">{{ (lab.my_role || lab.role_in_lab) | titlecase }}</span>
                    <span *ngIf="isLabUnavailable(lab)" class="lab-deletion-status">Deletion scheduled — sharing unavailable</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" (click)="closeShareModal()">Cancel</button>
            <button class="btn-save-share" [disabled]="savingShares" (click)="saveSharing()">
              {{ savingShares ? 'Saving...' : 'Update Sharing' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .my-data-container { padding: var(--space-6) var(--space-6) var(--space-8); max-width: var(--page-max-width); margin: 0 auto; min-height: 80vh; }

    /* Tabs and compact list controls */
    .data-toolbar { display:flex; align-items:flex-end; justify-content:space-between; gap:var(--space-4); margin-bottom:var(--space-4); border-bottom:1px solid var(--color-border); }
    .tabs-nav { display: flex; gap: 0; }
    .tabs-nav button { padding: 10px var(--space-6); border: none; background: none; font-family: var(--font-sans); font-weight: var(--fw-semi); font-size: var(--text-base); color: var(--color-text-secondary); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: var(--transition-fast); }
    .tabs-nav button:hover { color: var(--color-text-body); background: var(--color-surface-alt); }
    .tabs-nav button.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
    .sort-control { display:flex; align-items:center; gap:6px; padding-bottom:8px; color:var(--color-text-tertiary); font-size:var(--text-xs); font-weight:var(--fw-bold); }
    .sort-control select { appearance:auto; border:1px solid var(--color-border); border-radius:var(--radius-sm); background:var(--color-surface); color:var(--color-text-body); padding:4px 7px; font:inherit; font-size:var(--text-xs); font-weight:var(--fw-semi); cursor:pointer; }

    /* Grid & Cards */
    .results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-6); }
    .result-card { position:relative; background: var(--color-surface); border-radius: var(--radius-xl); padding: var(--space-6); box-shadow: var(--shadow-xs); border: 1px solid var(--color-border-light); display: flex; flex-direction: column; transition: var(--transition-normal); }
    .result-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--color-border); }
    .result-card.system-preset-card { background: #f5f6f7; border-color: #e4e7eb; }
    .result-card.system-preset-card:hover { background: #f1f3f5; }
    .shared-card { border-left: 3px solid #3b82f6; }
    .lab-item.lab-unavailable { border-color:#fca5a5; background:#fff7f7; }
    .lab-item.lab-unavailable .checkbox-container { cursor:not-allowed; }
    .lab-item.lab-unavailable .lab-name { color:#b91c1c; }
    .lab-deletion-status { margin-top:3px; color:#dc2626; font-size:var(--text-xs); font-weight:var(--fw-bold); }

    .card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-3); gap: var(--space-3); padding-right:28px; }
    .result-title { font-size: var(--text-lg); font-weight: var(--fw-bold); color: var(--color-text-primary); margin: 0; line-height: var(--lh-tight); }
    .card-badges { display: flex; gap: var(--space-1); flex-wrap: wrap; }
    .badge { font-size: var(--text-xs); font-weight: var(--fw-black); padding: 3px 9px; border-radius: var(--radius-full); text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid; }
    .badge.owner { background: var(--color-primary-subtle); color: var(--color-primary); border-color: var(--color-primary-border); }
    .badge.shared { background: #dbeafe; color: #1e40af; border-color: #bfdbfe; }
    .btn-pin { position:absolute; top:var(--space-4); right:var(--space-4); width:24px; height:24px; padding:4px; border:0; border-radius:var(--radius-sm); background:transparent; color:var(--color-text-tertiary); cursor:pointer; opacity:.65; transition:var(--transition-fast); z-index:1; }
    .btn-pin svg { display:block; width:16px; height:16px; transform:rotate(35deg); }
    .btn-pin:hover { background:var(--color-surface-alt); color:var(--color-primary); opacity:1; }
    .btn-pin.pinned { color:var(--color-primary); background:var(--color-primary-subtle); opacity:1; }

    .result-meta { display: flex; gap: var(--space-4); font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: var(--space-5); font-weight: var(--fw-medium); }
    .sharing-info { background: var(--color-surface-alt); padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-5); border: 1px solid var(--color-border-light); }
    .info-row { display: flex; gap: var(--space-2); font-size: var(--text-sm); margin-bottom: 3px; }
    .info-row.vertical { flex-direction: column; gap: 3px; }
    .info-row:last-child { margin-bottom: 0; }
    .info-row .label { color: var(--color-text-tertiary); font-weight: var(--fw-semi); min-width: 70px; }
    .info-row .value { color: var(--color-text-body); font-weight: var(--fw-bold); }

    .labs-scroll-list { max-height: 80px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; padding-right: 4px; }
    .labs-scroll-list::-webkit-scrollbar { width: 4px; } .labs-scroll-list::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 10px; }
    .lab-tag { display: flex; align-items: center; gap: var(--space-2); color: var(--color-text-body); font-weight: var(--fw-bold); font-size: var(--text-sm); }
    .lab-tag .dot { width: 6px; height: 6px; background: var(--color-primary); border-radius: 50%; flex-shrink: 0; }

    .card-actions { display: flex; gap: var(--space-2); margin-top: auto; padding-top: var(--space-5); }
    .btn-load { flex: 1; padding: 10px; background: var(--color-primary); color: white; border: none; border-radius: var(--radius-md); font-family: var(--font-sans); font-weight: var(--fw-bold); font-size: var(--text-base); cursor: pointer; transition: var(--transition-fast); }
    .btn-load:hover { background: var(--color-primary-hover); }
    .btn-share, .btn-delete, .btn-info-only { width: 40px; height: 40px; border: none; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: var(--transition-fast); flex-shrink: 0; }
    .btn-share { background: var(--color-surface-alt); color: var(--color-text-secondary); border: 1px solid var(--color-border-light); }
    .btn-share:hover { background: var(--color-border-light); color: var(--color-primary); }
    .btn-delete { background: var(--color-error-bg); color: #ef4444; border: 1px solid var(--color-error-border); }
    .btn-delete:hover { background: #fecaca; }
    .btn-info-only { background: var(--color-surface-alt); color: var(--color-text-tertiary); cursor: default; border: 1px solid var(--color-border-light); }
    .action-svg-icon { width: 18px; height: 18px; display: block; stroke: currentColor; }

    /* Modal */
    .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15,23,42,0.55); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: var(--space-5); }
    .modal-content { background: var(--color-surface); width: 100%; max-width: 500px; border-radius: var(--radius-2xl); box-shadow: var(--shadow-xl); overflow: hidden; animation: modalSlide 0.25s cubic-bezier(0.16,1,0.3,1); }
    @keyframes modalSlide { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .modal-header { padding: var(--space-6) var(--space-8); border-bottom: 1px solid var(--color-border-light); display: flex; justify-content: space-between; align-items: center; }
    .modal-header h2 { font-size: var(--text-xl); font-weight: var(--fw-black); margin: 0; color: var(--color-text-primary); }
    .close-btn { background: var(--color-surface-alt); border: 1px solid var(--color-border-light); width: 32px; height: 32px; border-radius: var(--radius-full); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; color: var(--color-text-secondary); cursor: pointer; transition: var(--transition-fast); }
    .close-btn:hover { background: var(--color-error-bg); color: #ef4444; }
    .modal-body { padding: var(--space-6) var(--space-8); }
    .modal-sub { color: var(--color-text-secondary); margin-bottom: var(--space-6); font-size: var(--text-md); }
    .labs-list { display: flex; flex-direction: column; gap: var(--space-3); max-height: 300px; overflow-y: auto; padding-right: var(--space-2); }
    .lab-item { padding: var(--space-4); border: 1.5px solid var(--color-border); border-radius: var(--radius-lg); transition: var(--transition-fast); }
    .lab-item:hover { border-color: var(--color-primary); background: var(--color-primary-light); }
    .checkbox-container { display: flex; align-items: center; position: relative; cursor: pointer; font-size: var(--text-md); user-select: none; width: 100%; }
    .checkbox-container input { position: absolute; opacity: 0; cursor: pointer; height: 0; width: 0; }
    .checkmark { height: 22px; width: 22px; background: var(--color-surface-alt); border: 2px solid var(--color-border-input); border-radius: var(--radius-sm); margin-right: var(--space-4); flex-shrink: 0; position: relative; transition: var(--transition-fast); }
    .checkbox-container:hover input ~ .checkmark { border-color: var(--color-primary); }
    .checkbox-container input:checked ~ .checkmark { background: var(--color-primary); border-color: var(--color-primary); }
    .checkmark:after { content: ""; position: absolute; display: none; left: 7px; top: 3px; width: 5px; height: 9px; border: solid white; border-width: 0 2.5px 2.5px 0; transform: rotate(45deg); }
    .checkbox-container input:checked ~ .checkmark:after { display: block; }
    .lab-info { display: flex; flex-direction: column; }
    .lab-info .lab-name { font-weight: var(--fw-bold); color: var(--color-text-primary); font-size: var(--text-base); }
    .lab-info .lab-role { font-size: var(--text-xs); color: var(--color-text-secondary); margin-top: 1px; }
    .modal-footer { padding: var(--space-5) var(--space-8); background: var(--color-surface-alt); display: flex; gap: var(--space-3); justify-content: flex-end; border-top: 1px solid var(--color-border-light); }
    .btn-cancel { padding: 10px var(--space-6); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-family: var(--font-sans); font-weight: var(--fw-semi); font-size: var(--text-base); color: var(--color-text-secondary); cursor: pointer; transition: var(--transition-fast); }
    .btn-cancel:hover { border-color: var(--color-border-input); }
    .btn-save-share { padding: 10px var(--space-8); background: var(--color-primary); color: white; border: none; border-radius: var(--radius-md); font-family: var(--font-sans); font-weight: var(--fw-bold); font-size: var(--text-base); cursor: pointer; transition: var(--transition-fast); }
    .btn-save-share:hover:not(:disabled) { background: var(--color-primary-hover); }
    .btn-save-share:disabled { opacity: 0.55; cursor: not-allowed; }
    .no-labs-warning { padding: var(--space-5); background: var(--color-warning-bg); border: 1px solid var(--color-warning-border); color: var(--color-warning); border-radius: var(--radius-md); font-size: var(--text-base); margin-bottom: var(--space-5); }

    /* Loading & Empty */
    .loading-spinner { text-align: center; padding: 100px 0; }
    .spinner { width: 36px; height: 36px; border: 3px solid var(--color-border-light); border-top-color: var(--color-primary); border-radius: 50%; margin: 0 auto var(--space-4); animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .empty-state { text-align: center; padding: 80px var(--space-10); background: var(--color-surface); border-radius: var(--radius-xl); border: 2px dashed var(--color-border); margin-top: var(--space-5); }
    .empty-icon { font-size: 3rem; margin-bottom: var(--space-5); display: block; }
    .empty-state h3 { font-size: var(--text-xl); color: var(--color-text-primary); margin-bottom: var(--space-3); font-weight: var(--fw-bold); }
    .empty-state p { color: var(--color-text-secondary); margin-bottom: var(--space-6); font-size: var(--text-md); }
    .btn-primary { padding: 12px 28px; background: var(--color-primary); color: white; border: none; border-radius: var(--radius-md); font-family: var(--font-sans); font-weight: var(--fw-bold); font-size: var(--text-md); cursor: pointer; transition: var(--transition-fast); }
    .btn-primary:hover { background: var(--color-primary-hover); transform: translateY(-1px); }
    @media (max-width:600px) {
      .my-data-container { padding:14px 12px 24px; }
      .data-toolbar { align-items:stretch; border-bottom:0; flex-direction:column; gap:8px; margin-bottom:12px; }
      .tabs-nav { border-bottom:1px solid var(--color-border); display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); overflow:visible; }
      .tabs-nav button { font-size:.72rem; line-height:1.15; min-width:0; padding:9px 4px; white-space:normal; }
      .sort-control { display:grid; grid-template-columns:42px minmax(0,1fr); padding:0; }
      .sort-control select { min-height:36px; padding:6px 8px; width:100%; }
      .results-grid { gap:10px; grid-template-columns:1fr; }
      .result-card { border-radius:12px; padding:13px 14px; }
      .result-card:hover { transform:none; }
      .card-top { align-items:center; gap:7px; margin-bottom:8px; padding-right:20px; }
      .result-title { font-size:1rem; line-height:1.25; }
      .card-badges { flex-shrink:0; }
      .badge { font-size:.58rem; padding:2px 6px; }
      .btn-pin { right:7px; top:7px; }
      .result-meta { flex-wrap:wrap; font-size:.7rem; gap:5px 11px; margin-bottom:4px; }
      .sharing-info { display:none; }
      .card-actions { gap:6px; padding-top:9px; }
      .btn-load { font-size:.76rem; min-height:36px; padding:7px 9px; }
      .btn-share,.btn-delete,.btn-info-only { height:36px; width:36px; }
      .empty-state { border-radius:12px; padding:36px 16px; }
      .empty-icon { font-size:2rem; margin-bottom:10px; }
      .empty-state h3 { font-size:1rem; }
      .empty-state p { font-size:.78rem; margin-bottom:14px; }
      .modal-overlay { align-items:flex-end; padding:0; }
      .modal-content { border-radius:16px 16px 0 0; max-height:88vh; }
      .modal-header { padding:14px 16px; }
      .modal-header h2 { font-size:1rem; }
      .modal-body { overflow-y:auto; padding:14px 16px; }
      .modal-sub { font-size:.78rem; margin-bottom:12px; }
      .lab-item { padding:10px; }
      .modal-footer { padding:11px 16px; }
      .btn-cancel,.btn-save-share { flex:1; font-size:.76rem; padding:9px; }
    }
  `]
})
export class MyDataComponent implements OnInit {
  allResults: Array<CrisprResult | ProtocolTreeRecord | PCRPreset> = [];
  displayResults: Array<CrisprResult | ProtocolTreeRecord | PCRPreset> = [];
  resource: 'crispr' | 'protocol' | 'pcr' = 'crispr';
  activeTab: 'all' | 'my' | 'shared' = 'all';
  sortMode: 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' = 'date-desc';
  loading: boolean = true;
  private pinnedIds = new Set<string>();
  
  // Sharing Modal
  sharingResult: CrisprResult | ProtocolTreeRecord | PCRPreset | null = null;
  myLabs: any[] = [];
  selectedLabIds: string[] = [];
  savingShares = false;

  constructor(
    private resultsService: ResultsService, 
    private protocolTreeService: ProtocolTreeService,
    private protocolStorage: NamuStorageService,
    private pcrPresetService: PcrPresetService,
    private labService: LabService,
    public auth: AuthService,
    private router: Router,
    private state: AppStateService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private route: ActivatedRoute
  ) {}

  async ngOnInit() {
    const resource = this.route.snapshot.data['resource'];
    if (resource === 'protocol' || resource === 'pcr' || resource === 'crispr') this.resource = resource;
    this.loadPinnedIds();
    await this.loadData();
    // Pre-load labs for sharing modal
    if (!this.auth.isDemo) this.myLabs = await this.labService.getMyLabs();
    this.labService.labsChanged$.subscribe(async () => {
      if (!this.auth.isDemo) this.myLabs = await this.labService.getMyLabs();
      if (this.sharingResult) this.selectedLabIds = this.selectedLabIds.filter(id => !this.isLabUnavailable(this.myLabs.find(lab => String(lab.id) === String(id))));
      this.cdr.detectChanges();
    });
  }

  async loadData() {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      if (this.auth.isDemo) {
        this.allResults = this.getDemoItems();
        this.applySorting();
        return;
      }
      if (this.resource === 'protocol') {
        this.allResults = await this.protocolTreeService.getTrees(this.activeTab);
      } else if (this.resource === 'pcr') {
        this.allResults = await this.pcrPresetService.getDataPresets(this.activeTab);
      } else if (this.activeTab === 'all') {
        this.allResults = await this.resultsService.getAllResults();
      } else if (this.activeTab === 'my') {
        this.allResults = await this.resultsService.getMyResults();
      } else {
        this.allResults = await this.resultsService.getSharedResults();
      }
      this.applySorting();
    } catch (err) {
      console.error('Failed to load results:', err);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  setTab(tab: 'all' | 'my' | 'shared') {
    this.activeTab = tab;
    this.loadData();
  }

  isPinned(res: CrisprResult | ProtocolTreeRecord | PCRPreset): boolean {
    return this.pinnedIds.has(String((res as any).id || ''));
  }

  togglePin(res: CrisprResult | ProtocolTreeRecord | PCRPreset, event: Event) {
    event.stopPropagation();
    const id = String((res as any).id || '');
    if (!id) return;
    if (this.pinnedIds.has(id)) this.pinnedIds.delete(id);
    else this.pinnedIds.add(id);
    this.persistPinnedIds();
    this.applySorting();
  }

  applySorting() {
    const byTitle = (a: CrisprResult | ProtocolTreeRecord | PCRPreset, b: CrisprResult | ProtocolTreeRecord | PCRPreset) =>
      this.getItemTitle(a).localeCompare(this.getItemTitle(b), undefined, { sensitivity: 'base', numeric: true });
    const byDate = (a: CrisprResult | ProtocolTreeRecord | PCRPreset, b: CrisprResult | ProtocolTreeRecord | PCRPreset) => this.itemTimestamp(a) - this.itemTimestamp(b);
    this.displayResults = [...this.allResults].sort((a, b) => {
      const pinnedDifference = Number(this.isPinned(b)) - Number(this.isPinned(a));
      if (pinnedDifference) return pinnedDifference;
      if (this.sortMode === 'name-asc') return byTitle(a, b);
      if (this.sortMode === 'name-desc') return byTitle(b, a);
      return this.sortMode === 'date-asc' ? byDate(a, b) : byDate(b, a);
    });
  }

  private itemTimestamp(res: CrisprResult | ProtocolTreeRecord | PCRPreset): number {
    const raw = (res as any).updated_at || (res as any).created_at || 0;
    if (typeof raw === 'number') return raw;
    const parsed = Date.parse(String(raw));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private pinnedStorageKey(): string {
    return `mrm-my-data-pins:${this.auth.currentProfile?.id || (this.auth.isDemo ? 'demo' : 'guest')}:${this.resource}`;
  }

  private loadPinnedIds() {
    try {
      const saved = localStorage.getItem(this.pinnedStorageKey());
      this.pinnedIds = new Set(saved ? JSON.parse(saved) : []);
    } catch {
      this.pinnedIds = new Set();
    }
  }

  private persistPinnedIds() {
    localStorage.setItem(this.pinnedStorageKey(), JSON.stringify([...this.pinnedIds]));
  }

  get pageTitle(): string { return this.resource === 'protocol' ? 'Tree Protocol' : this.resource === 'pcr' ? 'Solution Protocol' : 'Crispr Analysis'; }

  isOwner(res: CrisprResult | ProtocolTreeRecord | PCRPreset): boolean {
    const currentUserId = this.auth.currentProfile?.id;
    return (res as any).owner_user_id == currentUserId || (res as any).ownerUserId == currentUserId;
  }

  isSystemPreset(res: CrisprResult | ProtocolTreeRecord | PCRPreset): boolean { return !!(res as any).is_system || !!(res as any).isSystem; }
  canManage(res: CrisprResult | ProtocolTreeRecord | PCRPreset): boolean {
    if (this.auth.isDemo) return !this.isSystemPreset(res);
    return !this.isSystemPreset(res) && (!((res as any).is_shared) || this.isOwner(res));
  }

  private getDemoItems(): Array<CrisprResult | ProtocolTreeRecord | PCRPreset> {
    const now = new Date().toISOString();
    if (this.resource === 'protocol') return [
      { title: 'Demo Protocol Tree 1', steps: [['Step 1 — this is a demo step', 'Step 2 — prepare Sample 1-1'], ['Step 3 — this is a demo step', 'Step 4 — review Sample 1-2'], ['Step 5 — record the demo result']] },
      { title: 'Demo Protocol Tree 2', steps: [['Step 1 — this is a demo step', 'Step 2 — prepare Sample 2-1'], ['Step 3 — this is a demo step', 'Step 4 — review Sample 2-2'], ['Step 5 — record the demo result']] },
      { title: 'Demo Protocol Tree 3', steps: [['Step 1 — this is a demo step', 'Step 2 — prepare Sample 3-1'], ['Step 3 — this is a demo step', 'Step 4 — review Sample 3-2'], ['Step 5 — record the demo result']] },
    ].map((entry, index) => ({ id: `demo-tree-${index}`, owner_user_id: -1, title: entry.title, created_at: now, updated_at: now,
      document_json: { version: '1.0', title: entry.title, activeTreeId: `tree-${index}`, trees: [{ id: `tree-${index}`, name: entry.title, description: 'Demo workflow with realistic experimental stages.', rootNodeId: 'stage-0', createdAt: Date.now(), updatedAt: Date.now(), nodes: entry.steps.map((steps, nodeIndex) => ({ id: `stage-${nodeIndex}`, title: ['Preparation', 'Execution', 'Validation'][nodeIndex], steps, nextNodes: nodeIndex < 2 ? [`stage-${nodeIndex + 1}`] : [], x: 120 + nodeIndex * 370, y: 160, status: nodeIndex === 0 ? 'completed' : nodeIndex === 1 ? 'in_progress' : 'planned', leaves: [] })) }] } } as ProtocolTreeRecord));
    if (this.resource === 'pcr') return this.pcrPresetService.getDemoDataPresets();
    return [['Demo Analysis Result 1', ['Sample 1-1'], 72.4], ['Demo Analysis Result 2', ['Sample 2-1', 'Sample 2-2'], 61.8], ['Demo Analysis Result 3', ['Sample 3-1', 'Sample 3-2', 'Sample 3-3'], 48.6]].map(([title, genes, efficiency], index) => ({
      id: `demo-result-${index}`, owner_user_id: -1, title, created_at: now, updated_at: now,
      metadata_json: { phred_threshold: 30, indel_threshold: 0.5 }, result_json: { params: { phred_threshold: 30 }, scopes: [{ sheetName: 'Merged', readFlow: { rawReads: 5000, phredPassed: 4700, anchorMatched: 4300, usableForAssignment: 4200, assignedReads: 3900, ambiguousReads: 80 }, genes: (genes as string[]).map(gene => ({ gene, assigned_read_count: 1200, ambiguous_excluded: false, analysis_result: { targets: [{ target_id: `${gene}-1`, ref_sequence: 'ATGCGTACGTTACCGGATCGATGCCATGGA', sgrna_seq: 'GTTACCGGATCGATGCCATG', cut_site_index: 18, summary: { total_reads: 1500, matched_reads: 1320, aligned_reads: 1280, unmodified: 360, modified: 920, editing_efficiency: efficiency, out_of_frame_pct: 42, in_frame_pct: 18, no_indel_pct: 28, substitution_pct: 12 }, breakdown: { no_indel: 360, substitution: 154, in_frame: 230, out_of_frame: 536 }, read_details: [], top_groups: [{ group_rank: 1, read_inner: 'ATGCGTACGTTACC---ATCGATGCCATGGA', read_count: 312, read_pct: 23.6, classification: 'out_of_frame', net_indel: -3, tokens: [{ type: 'equal', val: 'ATGCGTACGTTACC' }, { type: 'delete', val: 'GGA' }, { type: 'equal', val: 'ATCGATGCCATGGA' }] }, { group_rank: 2, read_inner: 'ATGCGTACGTTACCGGATCGAATGCCATGGA', read_count: 188, read_pct: 14.2, classification: 'in_frame', net_indel: 3, tokens: [{ type: 'equal', val: 'ATGCGTACGTTACCGGATCGA' }, { type: 'insert', val: 'AAT' }, { type: 'equal', val: 'GCCATGGA' }] }] }] } })) }] }
    } as CrisprResult));
  }
  getItemTitle(res: CrisprResult | ProtocolTreeRecord | PCRPreset): string { return (res as any).title || (res as any).name || 'Untitled'; }

  getCardBadges(res: CrisprResult | ProtocolTreeRecord | PCRPreset): MyDataCardBadge[] {
    return [
      ...(this.isOwner(res) ? [{ label: 'OWNER', tone: 'owner' as const }] : []),
      ...((res as any).is_shared ? [{ label: 'SHARED', tone: 'shared' as const }] : [])
    ];
  }

  getCardMeta(res: CrisprResult | ProtocolTreeRecord | PCRPreset): string[] {
    const items: string[] = [];
    if (!(this.resource === 'pcr' && this.isSystemPreset(res))) {
      const raw = (res as any).created_at;
      items.push(`📅 ${raw ? new Date(raw).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Unknown date'}`);
    }
    if (this.resource === 'crispr') items.push(`🧬 ${this.getGeneCount(res)} Genes`);
    if (this.resource === 'protocol') items.push(`🌿 ${this.getNodeCount(res)} Steps`);
    if (this.resource === 'pcr') items.push(`🧪 ${this.getPcrComponentCount(res)} Components`);
    return items;
  }

  getGeneCount(item: CrisprResult | ProtocolTreeRecord | PCRPreset): number {
    const res = item as CrisprResult;
    if (!res.result_json) return 0;
    if (res.result_json.scopes) {
      const mergedScope = res.result_json.scopes.find((s: any) => s.sheetName === 'Merged');
      return mergedScope?.genes?.length || 0;
    }
    if (Array.isArray(res.result_json)) {
      const mergedScope = res.result_json.find((s: any) => s.sheetName === 'Merged');
      return mergedScope?.genes?.length || 0;
    }
    return 0;
  }

  getNodeCount(res: CrisprResult | ProtocolTreeRecord | PCRPreset): number {
    const tree = res as ProtocolTreeRecord;
    return tree.document_json?.trees?.reduce((total, item) => total + (item.nodes?.length || 0), 0) || 0;
  }

  getPcrComponentCount(res: CrisprResult | ProtocolTreeRecord | PCRPreset): number { return ((res as PCRPreset).components || []).length; }

  loadItem(res: CrisprResult | ProtocolTreeRecord | PCRPreset) {
    if (this.resource === 'protocol') {
      const tree = res as ProtocolTreeRecord;
      if (!tree.document_json?.trees?.length) { alert('This protocol tree has no document data.'); return; }
      this.protocolStorage.loadSavedDocument(tree.document_json, tree.title, tree.id);
      this.router.navigate(['/tools/protocol-builder'], {
        state: { openProtocolInNotebook: typeof window !== 'undefined' && window.innerWidth <= 900 }
      });
      return;
    }
    if (this.resource === 'pcr') {
      const preset = res as PCRPreset;
      if (preset.id) this.pcrPresetService.openPresetInCalculator(preset.id);
      this.router.navigate(['/tools/pcr']);
      return;
    }
    this.loadResult(res as CrisprResult);
  }

  loadResult(res: CrisprResult) {
    if (!res.result_json) {
      alert('This result has no data.');
      return;
    }

    this.ngZone.run(() => {
      this.state.activateSlot('viewer');
      if (res.result_json.params && res.result_json.scopes) {
        this.state.loadResultData(res.result_json);
      } else if (Array.isArray(res.result_json)) {
        this.state.loadResultData({
          params: res.metadata_json || {},
          scopes: res.result_json
        });
      } else {
        alert('Unsupported format. Please run analysis again.');
        return;
      }
      this.router.navigate(['/crispr/result-viewer']);
    });
  }

  async deleteItem(id: string) {
    if (this.auth.isDemo) {
      this.auth.notifyDemoUnavailable('Deleting saved My Data');
      return;
    }
    if (!confirm('Are you sure you want to delete this result?')) return;
    try {
      if (this.resource === 'protocol') await this.protocolTreeService.deleteTree(id);
      else if (this.resource === 'pcr') await this.pcrPresetService.deletePreset(id);
      else await this.resultsService.deleteResult(id);
      this.loadData();
    } catch (err) {
      alert('Failed to delete result');
    }
  }

  startNewItem() {
    this.router.navigate([this.resource === 'protocol' ? '/tools/protocol-builder' : this.resource === 'pcr' ? '/tools/pcr' : '/crispr/analysis']);
  }

  // --- Sharing Logic ---

  async openShareModal(result: CrisprResult | ProtocolTreeRecord | PCRPreset) {
    if (this.auth.isDemo) {
      this.auth.notifyDemoUnavailable('Sharing saved My Data');
      return;
    }
    this.sharingResult = result;
    this.selectedLabIds = [];
    try {
      const shares = this.resource === 'protocol'
        ? await this.protocolTreeService.getShares(String(result.id || ''))
        : this.resource === 'pcr'
          ? await this.pcrPresetService.getDataPresetShares(result.id!)
          : await this.resultsService.getResultShares(String(result.id || ''));
      // Backend returns string[] of lab_ids
      if (Array.isArray(shares)) {
        this.selectedLabIds = shares.filter(id => typeof id === 'string' && !this.isLabUnavailable(this.myLabs.find(lab => String(lab.id) === String(id))));
      }
    } catch (err) {
      console.error('Failed to load current shares', err);
    }
    this.cdr.detectChanges();
  }

  closeShareModal() {
    this.sharingResult = null;
    this.selectedLabIds = [];
  }

  isLabSelected(labId: string): boolean {
    if (!labId) return false;
    const isSelected = this.selectedLabIds.some(id => String(id) === String(labId));
    return isSelected;
  }

  isLabUnavailable(lab: any): boolean { return !!lab?.archive_deletion_at; }

  toggleLabShare(labId: string) {
    if (!labId) return;
    if (this.isLabUnavailable(this.myLabs.find(lab => String(lab.id) === String(labId)))) return;
    if (this.isLabSelected(labId)) {
      this.selectedLabIds = this.selectedLabIds.filter(id => id !== labId);
    } else {
      this.selectedLabIds.push(labId);
    }
  }

  async saveSharing() {
    if (!this.sharingResult) return;
    if (this.auth.isDemo) {
      this.auth.notifyDemoUnavailable('Updating sharing settings');
      return;
    }
    
    // Final safety check: remove any non-string values
    const cleanLabIds = this.selectedLabIds.filter(id => typeof id === 'string' && id.length > 0 && !this.isLabUnavailable(this.myLabs.find(lab => String(lab.id) === String(id))));
    
    this.savingShares = true;
    try {
      if (this.resource === 'protocol') await this.protocolTreeService.updateShares(String(this.sharingResult.id || ''), cleanLabIds);
      else if (this.resource === 'pcr') await this.pcrPresetService.updateDataPresetShares(this.sharingResult.id!, cleanLabIds);
      else await this.resultsService.updateResultShares(String(this.sharingResult.id || ''), cleanLabIds);
      this.closeShareModal();
      await this.loadData();
    } catch (err) {
      console.error('Failed to update shares', err);
      alert('Failed to update sharing settings.');
    } finally {
      this.savingShares = false;
    }
  }
}
