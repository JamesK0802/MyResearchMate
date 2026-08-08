import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabService } from '../../services/lab.service';

@Component({
  selector: 'app-find-lab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="find-lab-container">
      <div class="page-header">
        <h1>Find Research Labs</h1>
        <p>Discover and join CRISPR research labs to collaborate on analysis results.</p>
      </div>

      <!-- My Requests Status Section -->
      <div *ngIf="myJoinRequests.length > 0" class="my-requests-section">
        <h2 class="section-title">My Application Status</h2>
        <div class="requests-list-mini">
          <div *ngFor="let req of myJoinRequests" class="request-mini-card" [ngClass]="req.status">
            <div class="req-mini-main">
              <span class="req-lab-name">{{ req.lab_name }}</span>
              <span class="status-badge-mini" [ngClass]="req.status">{{ req.status | uppercase }}</span>
            </div>
            <div class="req-mini-date">Applied on {{ req.created_at | date:'mediumDate' }}</div>
          </div>
        </div>
      </div>

      <div class="search-bar-container">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input 
            type="text" 
            [(ngModel)]="searchQuery" 
            (input)="filterLabs()" 
            placeholder="Search by lab name, tagline, or description...">
        </div>
        
        <div class="sort-box">
          <label>Sort by:</label>
          <select [(ngModel)]="sortBy" (change)="filterLabs()">
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name">Name (A-Z)</option>
          </select>
        </div>
      </div>

      <div *ngIf="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Finding labs...</p>
      </div>

      <div *ngIf="!loading && filteredLabs.length === 0" class="empty-state">
        <div class="empty-icon">🧪</div>
        <h3>No labs found</h3>
        <p>Try adjusting your search or be the first to register a new lab!</p>
      </div>

      <div *ngIf="!loading && filteredLabs.length > 0" class="labs-grid">
        <div *ngFor="let lab of filteredLabs" class="lab-card">
          <div class="lab-main-info">
            <div class="lab-card-header">
              <h3 class="lab-name">{{ lab.lab_name }}</h3>
              <span class="lab-date">{{ lab.created_at | date:'mediumDate' }}</span>
            </div>
            
            <div class="lab-tagline" *ngIf="lab.lab_tagline">
              "{{ lab.lab_tagline }}"
            </div>
            
            <p class="lab-desc" *ngIf="lab.lab_description">
              {{ lab.lab_description }}
            </p>
          </div>

          <div class="lab-footer">
            <div *ngIf="isMember(lab)" class="member-status">
              <span class="status-badge">Already a Member</span>
            </div>
            
            <div *ngIf="!isMember(lab) && getLabStatus(lab) === 'pending'" class="member-status">
              <span class="status-badge pending">Pending Approval</span>
            </div>

            <button 
              *ngIf="!isMember(lab) && getLabStatus(lab) !== 'pending'"
              (click)="joinLab(lab)" 
              [disabled]="isJoining === lab.id"
              class="btn-join">
              {{ isJoining === lab.id ? 'Sending...' : 'Request to Join' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .find-lab-container { padding: var(--space-10); max-width: var(--page-max-width); margin: 0 auto; }
    .page-header { margin-bottom: var(--space-8); }
    .page-header h1 { font-size: var(--text-3xl); font-weight: var(--fw-black); color: var(--color-text-primary); margin-bottom: var(--space-2); letter-spacing: -0.025em; }
    .page-header p { color: var(--color-text-secondary); font-size: var(--text-lg); margin: 0; }

    .search-bar-container { display: flex; gap: var(--space-5); margin-bottom: var(--space-8); background: var(--color-surface); padding: var(--space-5); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); border: 1px solid var(--color-border-light); }
    .search-box { flex: 1; position: relative; }
    .search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 1rem; color: var(--color-text-tertiary); }
    .search-box input { width: 100%; padding: 11px 14px 11px 40px; border: 1.5px solid var(--color-border); border-radius: var(--radius-md); font-family: var(--font-sans); font-size: var(--text-md); color: var(--color-text-body); background: var(--color-surface-alt); transition: var(--transition-fast); outline: none; }
    .search-box input:focus { border-color: var(--color-primary); background: var(--color-surface); box-shadow: 0 0 0 3px rgba(22,101,52,0.08); }
    .sort-box { display: flex; align-items: center; gap: var(--space-3); }
    .sort-box label { font-weight: var(--fw-semi); color: var(--color-text-secondary); font-size: var(--text-base); white-space: nowrap; }
    .sort-box select { padding: 10px 14px; border: 1.5px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); font-family: var(--font-sans); font-weight: var(--fw-semi); color: var(--color-text-body); cursor: pointer; font-size: var(--text-base); outline: none; transition: var(--transition-fast); }
    .sort-box select:focus { border-color: var(--color-primary); }

    .labs-grid { display: flex; flex-direction: column; gap: var(--space-3); }
    .lab-card { background: var(--color-surface); border-radius: var(--radius-xl); padding: var(--space-5) var(--space-6); border: 1px solid var(--color-border-light); display: flex; align-items: center; justify-content: space-between; gap: var(--space-6); transition: var(--transition-normal); }
    .lab-card:hover { border-color: var(--color-primary); box-shadow: var(--shadow-md); transform: translateX(4px); }
    .lab-main-info { flex: 1; min-width: 0; }
    .lab-card-header { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2); }
    .lab-name { font-size: var(--text-lg); font-weight: var(--fw-black); color: var(--color-text-primary); margin: 0; }
    .lab-date { font-size: var(--text-xs); color: var(--color-text-tertiary); font-weight: var(--fw-semi); }
    .lab-tagline { font-weight: var(--fw-semi); color: var(--color-primary); font-size: var(--text-base); margin-bottom: var(--space-1); }
    .lab-desc { color: var(--color-text-secondary); font-size: var(--text-base); line-height: var(--lh-normal); margin: 0; max-width: 700px; }
    .lab-footer { min-width: 160px; display: flex; justify-content: flex-end; flex-shrink: 0; }
    .btn-join { padding: 10px 20px; background: var(--color-primary); color: white; border: none; border-radius: var(--radius-md); font-family: var(--font-sans); font-weight: var(--fw-bold); font-size: var(--text-base); cursor: pointer; transition: var(--transition-fast); white-space: nowrap; }
    .btn-join:hover:not(:disabled) { background: var(--color-primary-hover); }
    .btn-join:disabled { opacity: 0.55; cursor: not-allowed; }
    .status-badge { background: var(--color-primary-light); color: var(--color-primary); padding: 9px 18px; border-radius: var(--radius-md); font-weight: var(--fw-bold); font-size: var(--text-base); border: 1px solid var(--color-primary-border); }
    .status-badge.pending { background: var(--color-warning-bg); color: var(--color-warning); border-color: var(--color-warning-border); }

    .my-requests-section { margin-bottom: var(--space-8); background: var(--color-surface-alt); padding: var(--space-6); border-radius: var(--radius-xl); border: 1px solid var(--color-border); }
    .section-title { font-size: var(--text-md); font-weight: var(--fw-black); color: var(--color-text-primary); margin-bottom: var(--space-4); }
    .requests-list-mini { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-3); }
    .request-mini-card { background: var(--color-surface); padding: var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--color-border); }
    .req-mini-main { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; }
    .req-lab-name { font-weight: var(--fw-bold); color: var(--color-text-primary); font-size: var(--text-base); }
    .req-mini-date { font-size: var(--text-xs); color: var(--color-text-tertiary); }
    .status-badge-mini { font-size: var(--text-xs); font-weight: var(--fw-black); padding: 2px 8px; border-radius: var(--radius-sm); text-transform: uppercase; }
    .status-badge-mini.pending  { background: var(--color-warning-bg); color: var(--color-warning); }
    .status-badge-mini.approved { background: var(--color-primary-subtle); color: var(--color-primary); }
    .status-badge-mini.rejected { background: var(--color-error-bg); color: var(--color-error); }

    .loading-state, .empty-state { text-align: center; padding: 80px 0; color: var(--color-text-secondary); }
    .spinner { width: 36px; height: 36px; border: 3px solid var(--color-border-light); border-top-color: var(--color-primary); border-radius: 50%; margin: 0 auto var(--space-4); animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .empty-icon { font-size: 3rem; margin-bottom: var(--space-5); display: block; }
    .empty-state h3 { font-size: var(--text-xl); color: var(--color-text-primary); margin-bottom: var(--space-3); font-weight: var(--fw-bold); }
    .empty-state p { color: var(--color-text-secondary); font-size: var(--text-md); }
  `]
})
export class FindLabComponent implements OnInit {
  allLabs: any[] = [];
  filteredLabs: any[] = [];
  loading = true;
  searchQuery = '';
  sortBy: 'newest' | 'oldest' | 'name' = 'newest';
  isJoining: string | null = null;
  myLabIds: string[] = [];
  myJoinRequests: any[] = [];

  constructor(
    private labService: LabService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await Promise.all([
      this.loadMyLabs(),
      this.loadMyJoinRequests(),
      this.loadLabs()
    ]);
  }

  async loadMyJoinRequests() {
    try {
      this.myJoinRequests = await this.labService.getMyJoinRequests();
    } catch (err) {
      console.error('Failed to load my join requests', err);
    }
  }

  async loadMyLabs() {
    try {
      const myLabs = await this.labService.getMyLabs();
      this.myLabIds = myLabs.map((l: any) => l.id);
    } catch (err) {
      console.error('Failed to load my labs', err);
    }
  }

  async loadLabs() {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      this.allLabs = await this.labService.getAllLabs();
      this.filterLabs();
    } catch (err) {
      console.error('Failed to load labs', err);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  filterLabs() {
    let results = [...this.allLabs];

    // Search
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      results = results.filter(l => 
        l.lab_name.toLowerCase().includes(q) || 
        (l.lab_tagline && l.lab_tagline.toLowerCase().includes(q)) ||
        (l.lab_description && l.lab_description.toLowerCase().includes(q))
      );
    }

    // Sort
    results.sort((a, b) => {
      if (this.sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (this.sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (this.sortBy === 'name') return a.lab_name.localeCompare(b.lab_name);
      return 0;
    });

    this.filteredLabs = results;
  }

  isMember(lab: any): boolean {
    // /labs/all is the authoritative membership snapshot. Keep myLabIds as a
    // fallback for older API responses while that request is still loading.
    return lab?.status === 'member' || this.myLabIds.includes(typeof lab === 'string' ? lab : lab?.id);
  }

  getLabStatus(lab: any): string | null {
    return lab?.status && lab.status !== 'none' ? lab.status : this.getRequestStatus(lab?.id);
  }

  getRequestStatus(labId: string): string | null {
    const req = this.myJoinRequests.find(r => r.lab_id === labId);
    return req ? req.status : null;
  }

  async joinLab(lab: any) {
    const message = prompt(`Would you like to include a message for ${lab.lab_name}? (Optional)`);
    if (message === null) return; // Cancelled

    this.isJoining = lab.id;
    try {
      await this.labService.requestToJoinLab(lab.id, message);
      await this.loadMyJoinRequests(); // Refresh list immediately!
      this.cdr.detectChanges();
    } catch (err: any) {
      if (err.error?.detail === 'Already a member') {
        lab.status = 'member';
        if (!this.myLabIds.includes(lab.id)) this.myLabIds.push(lab.id);
      }
      alert(err.error?.detail || 'Failed to send join request');
    } finally {
      this.isJoining = null;
      this.cdr.detectChanges();
    }
  }
}
