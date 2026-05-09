import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabService, LabRegistrationRequest } from '../../services/lab.service';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="admin-container">
      <div class="page-header">
        <h1>Admin Dashboard</h1>
        <p>Review and manage lab workspace registration requests.</p>
      </div>

      <div *ngIf="loading" class="loading-state">
        <p>Loading requests...</p>
      </div>

      <div *ngIf="!loading && requests.length === 0" class="empty-state">
        <p>No registration requests found.</p>
      </div>

      <div *ngIf="!loading && requests.length > 0" class="requests-list">
        <!-- Pending Section -->
        <div class="admin-section">
          <h2 class="section-title">Pending Requests ({{ pendingRequests.length }})</h2>
          <div *ngIf="pendingRequests.length === 0" class="empty-mini">
            All caught up! No pending requests.
          </div>
          <div *ngFor="let req of pendingRequests" class="request-row">
            <div class="req-main">
              <div class="req-info">
                <span class="lab-name">{{ req.lab_name }}</span>
                <span class="req-date">Submitted on {{ req.created_at | date:'mediumDate' }}</span>
                <span class="status-pill pending">PENDING</span>
              </div>
              <div *ngIf="req.lab_tagline" class="req-tagline">"{{ req.lab_tagline }}"</div>
              <div *ngIf="req.lab_description" class="req-desc">{{ req.lab_description }}</div>

              <div class="details-grid">
                <div class="detail-block">
                  <label>Lab Leader</label>
                  <div class="leader-box">
                    <strong>{{ req.lab_leader_name }}</strong> ({{ req.lab_leader_uid }})<br>
                    <small>{{ req.lab_leader_email }}</small>
                  </div>
                </div>
                <div class="detail-block">
                  <label>Team Members ({{ req.members_json.length }})</label>
                  <div class="members-tags">
                    <span *ngFor="let m of req.members_json" class="member-tag" [title]="m.email">
                      {{ m.name || m.uid }}
                    </span>
                    <span *ngIf="req.members_json.length === 0" class="no-m">No additional members</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="req-actions">
              <button (click)="approve(req)" class="btn-approve" [disabled]="processingId === req.id">
                {{ processingId === req.id ? '...' : 'Approve' }}
              </button>
              <button (click)="reject(req)" class="btn-reject" [disabled]="processingId === req.id">
                Reject
              </button>
            </div>
          </div>
        </div>

        <!-- History Section -->
        <div class="admin-section history-section">
          <button class="btn-history-toggle" (click)="showHistory = !showHistory">
            {{ showHistory ? 'Hide Processed Requests' : 'View Processed Requests (' + processedRequests.length + ')' }}
          </button>

          <div *ngIf="showHistory" class="history-list">
            <div *ngFor="let req of processedRequests" class="request-row processed">
              <div class="req-main">
                <div class="req-info">
                  <span class="lab-name">{{ req.lab_name }}</span>
                  <span class="status-pill" [class]="req.status">{{ req.status | uppercase }}</span>
                </div>
                <div class="details-grid mini-grid">
                   <span>Leader: {{ req.lab_leader_name }}</span>
                   <span>Date: {{ req.created_at | date:'shortDate' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .admin-container { padding: 40px; max-width: 1000px; margin: 0 auto; }
    .page-header { margin-bottom: 30px; }
    .page-header h1 { font-size: 2rem; font-weight: 800; color: #0f172a; }
    
    .requests-list { display: flex; flex-direction: column; gap: 20px; }
    .request-row { background: white; border-radius: 16px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
    .request-row.processed { opacity: 0.7; background: #f8fafc; }
    
    .req-main { flex: 1; }
    .req-info { display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
    .lab-name { font-size: 1.25rem; font-weight: 700; color: #1e293b; }
    .req-date { font-size: 0.85rem; color: #64748b; }
    
    .status-pill { font-size: 0.7rem; font-weight: 800; padding: 4px 8px; border-radius: 6px; }
    .pending { background: #fef9c3; color: #854d0e; }
    .approved { background: #dcfce7; color: #166534; }
    .rejected { background: #fee2e2; color: #991b1b; }
    
    .req-tagline { font-size: 1rem; font-weight: 600; color: #166534; margin-bottom: 8px; }
    .req-desc { font-size: 0.9rem; color: #64748b; margin-bottom: 20px; line-height: 1.5; background: #f8fafc; padding: 12px; border-radius: 10px; border: 1px solid #f1f5f9; }

    .details-grid { display: grid; grid-template-columns: 1fr 1.5fr; gap: 30px; }
    .detail-block label { display: block; font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; }
    
    .leader-box { font-size: 0.95rem; line-height: 1.4; }
    .members-tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .member-tag { background: #f1f5f9; color: #475569; padding: 4px 10px; border-radius: 6px; font-size: 0.85rem; }
    .no-m { font-style: italic; color: #cbd5e1; font-size: 0.85rem; }
    
    .req-actions { display: flex; gap: 10px; }
    .req-actions button { padding: 10px 20px; border-radius: 10px; font-weight: 700; cursor: pointer; border: none; transition: transform 0.1s; }
    .req-actions button:hover:not(:disabled) { transform: scale(1.05); }
    .btn-approve { background: #166534; color: white; }
    .btn-reject { background: #f1f5f9; color: #64748b; }

    .admin-section { margin-bottom: 40px; }
    .section-title { font-size: 1.1rem; font-weight: 700; color: #64748b; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px; }
    .empty-mini { background: #f8fafc; border: 1.5px dashed #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; color: #94a3b8; }
    
    .history-section { border-top: 2px solid #f1f5f9; padding-top: 30px; }
    .btn-history-toggle { width: 100%; padding: 12px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 12px; color: #64748b; font-weight: 700; cursor: pointer; margin-bottom: 20px; }
    .history-list { display: flex; flex-direction: column; gap: 12px; }
    .request-row.processed { padding: 16px 24px; }
    .mini-grid { grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.85rem; color: #94a3b8; }
    
    .loading-state, .empty-state { text-align: center; padding: 60px; color: #64748b; }
  `]
})
export class AdminPanelComponent implements OnInit {
  requests: LabRegistrationRequest[] = [];
  loading = true;
  processingId: string | null = null;
  showHistory = false;

  get pendingRequests() {
    return this.requests.filter(r => r.status === 'pending');
  }

  get processedRequests() {
    return this.requests.filter(r => r.status !== 'pending');
  }

  constructor(
    private labService: LabService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadRequests();
  }

  async loadRequests() {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      const data = await this.labService.getAllRequests();
      this.requests = [...data];
    } catch (err) {
      console.error('Admin: Failed to load requests', err);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async approve(req: LabRegistrationRequest) {
    if (!confirm(`Approve lab "${req.lab_name}" and its members?`)) return;
    this.processingId = req.id;
    try {
      await this.labService.approveRequest(req.id);
      req.status = 'approved';
      this.requests = [...this.requests];
      this.cdr.detectChanges();
      alert('Lab approved and workspace created!');
    } catch (err) {
      alert('Failed to approve request');
    } finally {
      this.processingId = null;
      this.cdr.detectChanges();
    }
  }

  async reject(req: LabRegistrationRequest) {
    if (!confirm(`Reject lab "${req.lab_name}"?`)) return;
    this.processingId = req.id;
    try {
      await this.labService.rejectRequest(req.id);
      req.status = 'rejected';
      this.requests = [...this.requests];
      this.cdr.detectChanges();
    } catch (err) {
      alert('Failed to reject request');
    } finally {
      this.processingId = null;
      this.cdr.detectChanges();
    }
  }
}
