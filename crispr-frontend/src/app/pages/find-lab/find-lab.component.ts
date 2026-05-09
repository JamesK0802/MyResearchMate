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
            <div *ngIf="isMember(lab.id)" class="member-status">
              <span class="status-badge">Already a Member</span>
            </div>
            
            <div *ngIf="!isMember(lab.id) && getRequestStatus(lab.id) === 'pending'" class="member-status">
              <span class="status-badge pending">Pending Approval</span>
            </div>

            <button 
              *ngIf="!isMember(lab.id) && getRequestStatus(lab.id) !== 'pending'"
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
    .find-lab-container { padding: 40px; max-width: 1200px; margin: 0 auto; }
    .page-header { margin-bottom: 40px; }
    .page-header h1 { font-size: 2.5rem; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
    .page-header p { color: #64748b; font-size: 1.1rem; }

    .search-bar-container { display: flex; gap: 20px; margin-bottom: 40px; background: white; padding: 20px; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .search-box { flex: 1; position: relative; }
    .search-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); font-size: 1.2rem; }
    .search-box input { width: 100%; padding: 14px 16px 14px 48px; border: 2px solid #f1f5f9; border-radius: 12px; font-size: 1rem; transition: all 0.2s; }
    .search-box input:focus { border-color: #166534; outline: none; background: #f0fdf4; }
    
    .sort-box { display: flex; align-items: center; gap: 12px; }
    .sort-box label { font-weight: 700; color: #64748b; font-size: 0.9rem; white-space: nowrap; }
    .sort-box select { padding: 12px 16px; border: 2px solid #f1f5f9; border-radius: 12px; background: white; font-weight: 600; color: #1e293b; cursor: pointer; }

    .labs-grid { display: flex; flex-direction: column; gap: 16px; }
    .lab-card { background: white; border-radius: 20px; padding: 24px; border: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; gap: 30px; transition: all 0.2s; }
    .lab-card:hover { transform: translateX(8px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); border-color: #166534; }
    
    .lab-main-info { flex: 1; }
    .lab-card-header { display: flex; align-items: center; gap: 15px; margin-bottom: 8px; }
    .lab-name { font-size: 1.2rem; font-weight: 800; color: #0f172a; margin: 0; }
    .lab-date { font-size: 0.8rem; color: #94a3b8; font-weight: 600; }
    
    .lab-tagline { font-weight: 700; color: #166534; font-size: 0.9rem; margin-bottom: 6px; }
    .lab-desc { color: #64748b; font-size: 0.9rem; line-height: 1.5; margin: 0; max-width: 800px; }
    
    .lab-footer { min-width: 180px; display: flex; justify-content: flex-end; }
    .btn-join { width: 100%; padding: 14px; background: #166534; color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; transition: background 0.2s; }
    .btn-join:hover:not(:disabled) { background: #14532d; }
    .btn-join:disabled { opacity: 0.6; cursor: not-allowed; }

    .status-badge { background: #f0fdf4; color: #166534; padding: 10px 20px; border-radius: 12px; font-weight: 700; font-size: 0.9rem; border: 1px solid #bbf7d0; }
    .status-badge.pending { background: #fffbeb; color: #92400e; border-color: #fde68a; }

    .my-requests-section { margin-bottom: 40px; background: #f8fafc; padding: 24px; border-radius: 20px; border: 1px solid #e2e8f0; }
    .section-title { font-size: 1.1rem; font-weight: 800; color: #1e293b; margin-bottom: 16px; }
    .requests-list-mini { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .request-mini-card { background: white; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0; }
    .req-mini-main { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .req-lab-name { font-weight: 700; color: #0f172a; }
    .req-mini-date { font-size: 0.75rem; color: #94a3b8; }
    .status-badge-mini { font-size: 0.7rem; font-weight: 800; padding: 4px 8px; border-radius: 6px; }
    .status-badge-mini.pending { background: #fffbeb; color: #b45309; }
    .status-badge-mini.approved { background: #f0fdf4; color: #15803d; }
    .status-badge-mini.rejected { background: #fef2f2; color: #b91c1c; }

    .loading-state, .empty-state { text-align: center; padding: 100px 0; color: #64748b; }
    .spinner { width: 40px; height: 40px; border: 4px solid #f1f5f9; border-top: 4px solid #166534; border-radius: 50%; margin: 0 auto 16px; animation: spin 1s linear infinite; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .empty-icon { font-size: 4rem; margin-bottom: 20px; }
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

  isMember(labId: string): boolean {
    return this.myLabIds.includes(labId);
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
      alert(`Join request sent to ${lab.lab_name}!`);
    } catch (err: any) {
      alert(err.error?.detail || 'Failed to send join request');
    } finally {
      this.isJoining = null;
      this.cdr.detectChanges();
    }
  }
}
