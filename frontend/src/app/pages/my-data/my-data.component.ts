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

@Component({
  selector: 'app-my-data',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="my-data-container">

      <div class="page-header">
        <h1>{{ pageTitle }}</h1>
      </div>

      <!-- Tab Navigation -->
      <div class="tabs-nav">
        <button [class.active]="activeTab === 'all'" (click)="setTab('all')">All Data</button>
        <button [class.active]="activeTab === 'my'" (click)="setTab('my')">My Data</button>
        <button [class.active]="activeTab === 'shared'" (click)="setTab('shared')">Shared with Me</button>
      </div>

      <div *ngIf="loading" class="loading-spinner">
        <div class="spinner"></div>
        <p>Loading {{ resource === 'protocol' ? 'protocol trees' : resource === 'pcr' ? 'PCR protocols' : 'results' }}...</p>
      </div>

      <!-- Results Grid -->
      <div *ngIf="!loading && displayResults.length > 0" class="results-grid">
        <div *ngFor="let res of displayResults" class="result-card" [class.shared-card]="res.is_shared" [class.system-preset-card]="resource === 'pcr' && isSystemPreset(res)">
          <div class="card-body">
            <div class="card-top">
              <h3 class="result-title">{{ getItemTitle(res) }}</h3>
              <div class="card-badges">
                <span *ngIf="isOwner(res)" class="badge owner">OWNER</span>
                <span *ngIf="res.is_shared" class="badge shared">SHARED</span>
              </div>
            </div>
            
            <div class="result-meta">
              <span *ngIf="!(resource === 'pcr' && isSystemPreset(res))">📅 {{ res.created_at | date:'mediumDate' }}</span>
              <span *ngIf="resource === 'crispr'">🧬 {{ getGeneCount(res) }} Genes</span>
              <span *ngIf="resource === 'protocol'">🌿 {{ getNodeCount(res) }} Steps</span>
              <span *ngIf="resource === 'pcr'">🧪 {{ getPcrComponentCount(res) }} Components</span>
            </div>

            <div *ngIf="res.is_shared" class="sharing-info">
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
          </div>

          <div class="card-actions">
            <button (click)="loadItem(res)" class="btn-load">{{ resource === 'protocol' ? 'Open Tree' : resource === 'pcr' ? 'Open Protocol' : 'View Result' }}</button>
            
            <!-- Owner Actions -->
            <ng-container *ngIf="canManage(res)">
              <button (click)="openShareModal(res)" class="btn-share" title="Manage Sharing">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-svg-icon"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              </button>
              <button (click)="deleteItem(res.id || '')" class="btn-delete" title="Delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-svg-icon"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              </button>
            </ng-container>

            <!-- Shared Actions (Non-owner) -->
            <ng-container *ngIf="res.is_shared && !isOwner(res)">
              <button class="btn-info-only" title="Read Only">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-svg-icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </button>
            </ng-container>
          </div>
        </div>
      </div>

      <div *ngIf="!loading && displayResults.length === 0" class="empty-state">
        <div class="empty-icon">📁</div>
        <h3>No {{ resource === 'protocol' ? 'protocol trees' : resource === 'pcr' ? 'PCR protocols' : 'results' }} found</h3>
        <p>You haven't saved or shared any {{ resource === 'protocol' ? 'protocol trees' : resource === 'pcr' ? 'PCR protocols' : 'results' }} in this category yet.</p>
        <button *ngIf="activeTab === 'my'" (click)="startNewItem()" class="btn-primary">{{ resource === 'protocol' ? 'Open Protocol Builder' : resource === 'pcr' ? 'Open PCR Calculator' : 'Start New Analysis' }}</button>
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
              <div *ngFor="let lab of myLabs" class="lab-item">
                <label class="checkbox-container">
                  <input type="checkbox" 
                         [checked]="isLabSelected(lab.id)"
                         (change)="toggleLabShare(lab.id)">
                  <span class="checkmark"></span>
                  <div class="lab-info">
                    <span class="lab-name">{{ lab.lab_name }}</span>
                    <span class="lab-role">{{ (lab.my_role || lab.role_in_lab) | titlecase }}</span>
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
    .page-header { margin-bottom: var(--space-3); }
    .page-header h1 { font-size: var(--text-3xl); font-weight: var(--fw-black); color: var(--color-text-primary); margin-bottom: 0; letter-spacing: -0.025em; }
    .page-header p { display: none; }

    /* Tabs */
    .tabs-nav { display: flex; gap: 0; margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); }
    .tabs-nav button { padding: 10px var(--space-6); border: none; background: none; font-family: var(--font-sans); font-weight: var(--fw-semi); font-size: var(--text-base); color: var(--color-text-secondary); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: var(--transition-fast); }
    .tabs-nav button:hover { color: var(--color-text-body); background: var(--color-surface-alt); }
    .tabs-nav button.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }

    /* Grid & Cards */
    .results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-6); }
    .result-card { background: var(--color-surface); border-radius: var(--radius-xl); padding: var(--space-6); box-shadow: var(--shadow-xs); border: 1px solid var(--color-border-light); display: flex; flex-direction: column; transition: var(--transition-normal); }
    .result-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--color-border); }
    .result-card.system-preset-card { background: #f5f6f7; border-color: #e4e7eb; }
    .result-card.system-preset-card:hover { background: #f1f3f5; }
    .shared-card { border-left: 3px solid #3b82f6; }

    .card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-3); gap: var(--space-3); }
    .result-title { font-size: var(--text-lg); font-weight: var(--fw-bold); color: var(--color-text-primary); margin: 0; line-height: var(--lh-tight); }
    .card-badges { display: flex; gap: var(--space-1); flex-wrap: wrap; }
    .badge { font-size: var(--text-xs); font-weight: var(--fw-black); padding: 3px 9px; border-radius: var(--radius-full); text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid; }
    .badge.owner { background: var(--color-primary-subtle); color: var(--color-primary); border-color: var(--color-primary-border); }
    .badge.shared { background: #dbeafe; color: #1e40af; border-color: #bfdbfe; }

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
  `]
})
export class MyDataComponent implements OnInit {
  allResults: Array<CrisprResult | ProtocolTreeRecord | PCRPreset> = [];
  displayResults: Array<CrisprResult | ProtocolTreeRecord | PCRPreset> = [];
  resource: 'crispr' | 'protocol' | 'pcr' = 'crispr';
  activeTab: 'all' | 'my' | 'shared' = 'all';
  loading: boolean = true;
  
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
    private auth: AuthService,
    private router: Router,
    private state: AppStateService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private route: ActivatedRoute
  ) {}

  async ngOnInit() {
    const resource = this.route.snapshot.data['resource'];
    if (resource === 'protocol' || resource === 'pcr' || resource === 'crispr') this.resource = resource;
    await this.loadData();
    // Pre-load labs for sharing modal
    if (!this.auth.isDemo) this.myLabs = await this.labService.getMyLabs();
  }

  async loadData() {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      if (this.auth.isDemo) {
        this.allResults = this.getDemoItems();
        this.displayResults = [...this.allResults];
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
      this.displayResults = [...this.allResults];
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

  get pageTitle(): string { return this.resource === 'protocol' ? 'Protocol Trees' : this.resource === 'pcr' ? 'PCR Protocols' : 'CRISPR Analysis Results'; }

  isOwner(res: CrisprResult | ProtocolTreeRecord | PCRPreset): boolean {
    const currentUserId = this.auth.currentProfile?.id;
    return (res as any).owner_user_id == currentUserId || (res as any).ownerUserId == currentUserId;
  }

  isSystemPreset(res: CrisprResult | ProtocolTreeRecord | PCRPreset): boolean { return !!(res as any).is_system || !!(res as any).isSystem; }
  canManage(res: CrisprResult | ProtocolTreeRecord | PCRPreset): boolean { return !this.auth.isDemo && !this.isSystemPreset(res) && (!((res as any).is_shared) || this.isOwner(res)); }

  private getDemoItems(): Array<CrisprResult | ProtocolTreeRecord | PCRPreset> {
    const now = new Date().toISOString();
    if (this.resource === 'protocol') return [
      { title: 'Arabidopsis transformation', steps: [['Sterilise seeds', 'Stratify seeds for 2 days'], ['Prepare Agrobacterium culture', 'Infiltrate flowering plants'], ['Collect T1 seed', 'Select transformants']] },
      { title: 'Genotyping workflow', steps: [['Collect leaf tissue', 'Extract genomic DNA'], ['PCR amplification', 'Run agarose gel'], ['Sanger validation', 'Record genotype']] },
      { title: 'Tissue culture checklist', steps: [['Prepare MS media', 'Sterilise explants'], ['Callus induction', 'Monitor contamination'], ['Shoot regeneration', 'Transfer plantlets']] },
    ].map((entry, index) => ({ id: `demo-tree-${index}`, owner_user_id: -1, title: entry.title, created_at: now, updated_at: now,
      document_json: { version: '1.0', title: entry.title, activeTreeId: `tree-${index}`, trees: [{ id: `tree-${index}`, name: entry.title, description: 'Demo workflow with realistic experimental stages.', rootNodeId: 'stage-0', createdAt: Date.now(), updatedAt: Date.now(), nodes: entry.steps.map((steps, nodeIndex) => ({ id: `stage-${nodeIndex}`, title: ['Preparation', 'Execution', 'Validation'][nodeIndex], steps, nextNodes: nodeIndex < 2 ? [`stage-${nodeIndex + 1}`] : [], x: 120 + nodeIndex * 370, y: 160, status: nodeIndex === 0 ? 'completed' : nodeIndex === 1 ? 'in_progress' : 'planned', leaves: [] })) }] } } as ProtocolTreeRecord));
    if (this.resource === 'pcr') return this.pcrPresetService.getDemoDataPresets();
    return [['PDS knockout — batch 04', ['PDS'], 72.4], ['CPC / TRY multiplex screen', ['CPC', 'TRY'], 61.8], ['T1 validation cohort', ['FT', 'FLC', 'AP1'], 48.6]].map(([title, genes, efficiency], index) => ({
      id: `demo-result-${index}`, owner_user_id: -1, title, created_at: now, updated_at: now,
      metadata_json: { phred_threshold: 30, indel_threshold: 0.5 }, result_json: { params: { phred_threshold: 30 }, scopes: [{ sheetName: 'Merged', readFlow: { rawReads: 5000, phredPassed: 4700, anchorMatched: 4300, usableForAssignment: 4200, assignedReads: 3900, ambiguousReads: 80 }, genes: (genes as string[]).map(gene => ({ gene, assigned_read_count: 1200, ambiguous_excluded: false, analysis_result: { targets: [{ target_id: `${gene}-1`, ref_sequence: 'ATGCGTACGTTACCGGATCGATGCCATGGA', sgrna_seq: 'GTTACCGGATCGATGCCATG', cut_site_index: 18, summary: { total_reads: 1500, matched_reads: 1320, aligned_reads: 1280, unmodified: 360, modified: 920, editing_efficiency: efficiency, out_of_frame_pct: 42, in_frame_pct: 18, no_indel_pct: 28, substitution_pct: 12 }, breakdown: { no_indel: 360, substitution: 154, in_frame: 230, out_of_frame: 536 }, read_details: [], top_groups: [{ group_rank: 1, read_inner: 'ATGCGTACGTTACC---ATCGATGCCATGGA', read_count: 312, read_pct: 23.6, classification: 'out_of_frame', net_indel: -3, tokens: [{ type: 'equal', val: 'ATGCGTACGTTACC' }, { type: 'delete', val: 'GGA' }, { type: 'equal', val: 'ATCGATGCCATGGA' }] }, { group_rank: 2, read_inner: 'ATGCGTACGTTACCGGATCGAATGCCATGGA', read_count: 188, read_pct: 14.2, classification: 'in_frame', net_indel: 3, tokens: [{ type: 'equal', val: 'ATGCGTACGTTACCGGATCGA' }, { type: 'insert', val: 'AAT' }, { type: 'equal', val: 'GCCATGGA' }] }] }] } })) }] }
    } as CrisprResult));
  }
  getItemTitle(res: CrisprResult | ProtocolTreeRecord | PCRPreset): string { return (res as any).title || (res as any).name || 'Untitled'; }

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
      this.router.navigate(['/tools/protocol-builder']);
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
        this.selectedLabIds = shares.filter(id => typeof id === 'string');
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

  toggleLabShare(labId: string) {
    if (!labId) return;
    if (this.isLabSelected(labId)) {
      this.selectedLabIds = this.selectedLabIds.filter(id => id !== labId);
    } else {
      this.selectedLabIds.push(labId);
    }
  }

  async saveSharing() {
    if (!this.sharingResult) return;
    
    // Final safety check: remove any non-string values
    const cleanLabIds = this.selectedLabIds.filter(id => typeof id === 'string' && id.length > 0);
    
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
