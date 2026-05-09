import { Component, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResultsService, CrisprResult } from '../../services/results.service';
import { LabService } from '../../services/lab.service';
import { Router, RouterLink } from '@angular/router';
import { AppStateService } from '../../services/app-state.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-my-data',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="my-data-container">
      <div class="page-header">
        <h1>Research Data Explorer</h1>
        <p>Manage your CRISPR analysis results and collaborate with your lab teams.</p>
      </div>

      <!-- Tab Navigation -->
      <div class="tabs-nav">
        <button [class.active]="activeTab === 'all'" (click)="setTab('all')">All Data</button>
        <button [class.active]="activeTab === 'my'" (click)="setTab('my')">My Data</button>
        <button [class.active]="activeTab === 'shared'" (click)="setTab('shared')">Shared with Me</button>
      </div>

      <div *ngIf="loading" class="loading-spinner">
        <div class="spinner"></div>
        <p>Loading results...</p>
      </div>

      <!-- Results Grid -->
      <div *ngIf="!loading && displayResults.length > 0" class="results-grid">
        <div *ngFor="let res of displayResults" class="result-card" [class.shared-card]="res.is_shared">
          <div class="card-body">
            <div class="card-top">
              <h3 class="result-title">{{ res.title }}</h3>
              <div class="card-badges">
                <span *ngIf="isOwner(res)" class="badge owner">OWNER</span>
                <span *ngIf="res.is_shared" class="badge shared">SHARED</span>
              </div>
            </div>
            
            <div class="result-meta">
              <span>📅 {{ res.created_at | date:'mediumDate' }}</span>
              <span>🧬 {{ getGeneCount(res) }} Genes</span>
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
                  <div *ngFor="let lab of res.shared_with_labs || [res.lab_name]" class="lab-tag">
                    <span class="dot"></span> {{ lab }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="card-actions">
            <button (click)="loadResult(res)" class="btn-load">View Result</button>
            
            <!-- Owner Actions -->
            <ng-container *ngIf="!res.is_shared || isOwner(res)">
              <button (click)="openShareModal(res)" class="btn-share" title="Manage Sharing">
                <span class="icon">🔗</span>
              </button>
              <button (click)="deleteResult(res.id)" class="btn-delete" title="Delete">
                <span class="icon">🗑️</span>
              </button>
            </ng-container>

            <!-- Shared Actions (Non-owner) -->
            <ng-container *ngIf="res.is_shared && !isOwner(res)">
              <button class="btn-info-only" title="Read Only">
                <span class="icon">🔒</span>
              </button>
            </ng-container>
          </div>
        </div>
      </div>

      <div *ngIf="!loading && displayResults.length === 0" class="empty-state">
        <div class="empty-icon">📁</div>
        <h3>No results found</h3>
        <p>You haven't saved or shared any results in this category yet.</p>
        <button *ngIf="activeTab === 'my'" routerLink="/crispr/analysis" class="btn-primary">Start New Analysis</button>
      </div>

      <!-- Share Modal -->
      <div *ngIf="sharingResult" class="modal-overlay" (click)="closeShareModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Share Result</h2>
            <button class="close-btn" (click)="closeShareModal()">×</button>
          </div>
          <div class="modal-body">
            <p class="modal-sub">Select the labs you want to share "<strong>{{ sharingResult.title }}</strong>" with.</p>
            
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
    .my-data-container { padding: var(--space-10); max-width: var(--page-max-width); margin: 0 auto; min-height: 80vh; }
    .page-header { margin-bottom: var(--space-8); }
    .page-header h1 { font-size: var(--text-3xl); font-weight: var(--fw-black); color: var(--color-text-primary); margin-bottom: var(--space-2); letter-spacing: -0.025em; }
    .page-header p { color: var(--color-text-secondary); font-size: var(--text-lg); margin: 0; }

    /* Tabs */
    .tabs-nav { display: flex; gap: 0; margin-bottom: var(--space-8); border-bottom: 1px solid var(--color-border); }
    .tabs-nav button { padding: 10px var(--space-6); border: none; background: none; font-family: var(--font-sans); font-weight: var(--fw-semi); font-size: var(--text-base); color: var(--color-text-secondary); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: var(--transition-fast); }
    .tabs-nav button:hover { color: var(--color-text-body); background: var(--color-surface-alt); }
    .tabs-nav button.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }

    /* Grid & Cards */
    .results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-6); }
    .result-card { background: var(--color-surface); border-radius: var(--radius-xl); padding: var(--space-6); box-shadow: var(--shadow-xs); border: 1px solid var(--color-border-light); display: flex; flex-direction: column; transition: var(--transition-normal); }
    .result-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--color-border); }
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
    .btn-share, .btn-delete, .btn-info-only { width: 40px; height: 40px; border: none; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: var(--transition-fast); font-size: 1rem; flex-shrink: 0; }
    .btn-share { background: var(--color-surface-alt); color: var(--color-text-secondary); border: 1px solid var(--color-border-light); }
    .btn-share:hover { background: var(--color-border-light); }
    .btn-delete { background: var(--color-error-bg); color: #ef4444; border: 1px solid var(--color-error-border); }
    .btn-delete:hover { background: #fecaca; }
    .btn-info-only { background: var(--color-surface-alt); color: var(--color-text-tertiary); cursor: default; border: 1px solid var(--color-border-light); }

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
  allResults: CrisprResult[] = [];
  displayResults: CrisprResult[] = [];
  activeTab: 'all' | 'my' | 'shared' = 'all';
  loading: boolean = true;
  
  // Sharing Modal
  sharingResult: CrisprResult | null = null;
  myLabs: any[] = [];
  selectedLabIds: string[] = [];
  savingShares = false;

  constructor(
    private resultsService: ResultsService, 
    private labService: LabService,
    private auth: AuthService,
    private router: Router,
    private state: AppStateService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  async ngOnInit() {
    await this.loadData();
    // Pre-load labs for sharing modal
    this.myLabs = await this.labService.getMyLabs();
  }

  async loadData() {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      if (this.activeTab === 'all') {
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

  isOwner(res: CrisprResult): boolean {
    const currentUserId = this.auth.currentProfile?.id;
    return res.owner_user_id == currentUserId;
  }

  getGeneCount(res: CrisprResult): number {
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

  async deleteResult(id: string) {
    if (!confirm('Are you sure you want to delete this result?')) return;
    try {
      await this.resultsService.deleteResult(id);
      this.loadData();
    } catch (err) {
      alert('Failed to delete result');
    }
  }

  // --- Sharing Logic ---

  async openShareModal(result: CrisprResult) {
    this.sharingResult = result;
    this.selectedLabIds = [];
    try {
      const shares = await this.resultsService.getResultShares(result.id);
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
      await this.resultsService.updateResultShares(this.sharingResult.id, cleanLabIds);
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
