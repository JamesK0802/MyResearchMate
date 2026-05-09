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
    .my-data-container { padding: 40px; max-width: 1200px; margin: 0 auto; min-height: 80vh; }
    .page-header { margin-bottom: 30px; }
    .page-header h1 { font-size: 2.5rem; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
    .page-header p { color: #64748b; font-size: 1.1rem; }

    /* Tabs */
    .tabs-nav { display: flex; gap: 8px; margin-bottom: 30px; border-bottom: 1px solid #e2e8f0; padding-bottom: 1px; }
    .tabs-nav button { padding: 12px 24px; border: none; background: none; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
    .tabs-nav button:hover { color: #1e293b; background: #f8fafc; }
    .tabs-nav button.active { color: #166534; border-bottom-color: #166534; }

    /* Grid & Cards */
    .results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; }
    
    .result-card { background: white; border-radius: 20px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border: 1px solid #f1f5f9; display: flex; flex-direction: column; transition: transform 0.2s, box-shadow 0.2s; }
    .result-card:hover { transform: translateY(-4px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
    .shared-card { border-left: 4px solid #3b82f6; }

    .card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 12px; }
    .result-title { font-size: 1.2rem; font-weight: 700; color: #1e293b; margin: 0; line-height: 1.3; }
    
    .card-badges { display: flex; gap: 6px; flex-wrap: wrap; }
    .badge { font-size: 0.65rem; font-weight: 800; padding: 4px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.02em; }
    .badge.owner { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .badge.shared { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }

    .result-meta { display: flex; gap: 16px; font-size: 0.85rem; color: #64748b; margin-bottom: 20px; }
    
    .sharing-info { background: #f8fafc; padding: 12px; border-radius: 12px; margin-bottom: 20px; }
    .info-row { display: flex; gap: 8px; font-size: 0.8rem; margin-bottom: 4px; }
    .info-row.vertical { flex-direction: column; gap: 4px; }
    .info-row:last-child { margin-bottom: 0; }
    .info-row .label { color: #94a3b8; font-weight: 600; min-width: 70px; }
    .info-row .value { color: #475569; font-weight: 700; }

    .labs-scroll-list { max-height: 80px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding-right: 4px; }
    .labs-scroll-list::-webkit-scrollbar { width: 4px; }
    .labs-scroll-list::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
    
    .lab-tag { display: flex; align-items: center; gap: 6px; color: #475569; font-weight: 700; font-size: 0.8rem; }
    .lab-tag .dot { width: 6px; height: 6px; background: #166534; border-radius: 50%; }

    .card-actions { display: flex; gap: 10px; margin-top: auto; }
    .btn-load { flex: 1; padding: 12px; background: #166534; color: white; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; transition: background 0.2s; }
    .btn-load:hover { background: #14532d; }
    
    .btn-share, .btn-delete, .btn-info-only { width: 44px; height: 44px; border: none; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }
    .btn-share { background: #f1f5f9; color: #475569; }
    .btn-share:hover { background: #e2e8f0; }
    .btn-delete { background: #fee2e2; color: #ef4444; }
    .btn-delete:hover { background: #fecaca; }
    .btn-info-only { background: #f8fafc; color: #94a3b8; cursor: default; }

    /* Modal */
    .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-content { background: white; width: 100%; max-width: 500px; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; animation: modalSlide 0.3s ease-out; }
    @keyframes modalSlide { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    .modal-header { padding: 24px 30px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
    .modal-header h2 { font-size: 1.5rem; font-weight: 800; margin: 0; color: #0f172a; }
    .close-btn { background: none; border: none; font-size: 1.8rem; color: #94a3b8; cursor: pointer; }

    .modal-body { padding: 30px; }
    .modal-sub { color: #64748b; margin-bottom: 24px; font-size: 0.95rem; }
    
    .labs-list { display: flex; flex-direction: column; gap: 12px; max-height: 300px; overflow-y: auto; padding-right: 8px; }
    .lab-item { padding: 16px; border: 1.5px solid #e2e8f0; border-radius: 14px; transition: all 0.2s; }
    .lab-item:hover { border-color: #166534; background: #f0fdf4; }

    .checkbox-container { display: flex; align-items: center; position: relative; cursor: pointer; font-size: 1rem; user-select: none; width: 100%; }
    .checkbox-container input { position: absolute; opacity: 0; cursor: pointer; height: 0; width: 0; }
    .checkmark { height: 24px; width: 24px; background-color: #f1f5f9; border: 2px solid #cbd5e1; border-radius: 7px; margin-right: 15px; flex-shrink: 0; position: relative; }
    .checkbox-container:hover input ~ .checkmark { border-color: #166534; }
    .checkbox-container input:checked ~ .checkmark { background-color: #166534; border-color: #166534; }
    .checkmark:after { content: ""; position: absolute; display: none; left: 8px; top: 3px; width: 5px; height: 10px; border: solid white; border-width: 0 2.5px 2.5px 0; transform: rotate(45deg); }
    .checkbox-container input:checked ~ .checkmark:after { display: block; }

    .lab-info { display: flex; flex-direction: column; }
    .lab-info .lab-name { font-weight: 700; color: #1e293b; }
    .lab-info .lab-role { font-size: 0.75rem; color: #64748b; }

    .modal-footer { padding: 24px 30px; background: #f8fafc; display: flex; gap: 12px; justify-content: flex-end; }
    .btn-cancel { padding: 12px 24px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; font-weight: 600; color: #64748b; cursor: pointer; }
    .btn-save-share { padding: 12px 30px; background: #166534; color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; }
    .btn-save-share:disabled { opacity: 0.6; cursor: not-allowed; }

    .no-labs-warning { padding: 20px; background: #fff7ed; border: 1px solid #ffedd5; color: #9a3412; border-radius: 12px; font-size: 0.9rem; margin-bottom: 20px; }

    .loading-spinner { text-align: center; padding: 100px 0; }
    .spinner { width: 40px; height: 40px; border: 4px solid #f1f5f9; border-top: 4px solid #166534; border-radius: 50%; margin: 0 auto 16px; animation: spin 1s linear infinite; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

    .empty-state { text-align: center; padding: 100px 40px; background: white; border-radius: 30px; border: 2px dashed #e2e8f0; margin-top: 20px; }
    .empty-icon { font-size: 4rem; margin-bottom: 20px; }
    .empty-state h3 { font-size: 1.5rem; color: #1e293b; margin-bottom: 12px; }
    .empty-state p { color: #64748b; margin-bottom: 30px; }
    .btn-primary { padding: 14px 32px; background: #166534; color: white; border: none; border-radius: 14px; font-weight: 700; cursor: pointer; font-size: 1.1rem; }
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
