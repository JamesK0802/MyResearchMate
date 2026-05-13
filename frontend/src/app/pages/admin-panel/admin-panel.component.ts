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
    .admin-container { padding: var(--space-10); max-width: 1000px; margin: 0 auto; }
    .page-header { margin-bottom: var(--space-8); }
    .page-header h1 { font-size: var(--text-3xl); font-weight: var(--fw-black); color: var(--color-text-primary); letter-spacing: -0.025em; margin-bottom: var(--space-2); }
    .page-header p { color: var(--color-text-secondary); font-size: var(--text-lg); margin: 0; }

    .requests-list { display: flex; flex-direction: column; gap: var(--space-5); }
    .request-row { background: var(--color-surface); border-radius: var(--radius-xl); padding: var(--space-6); box-shadow: var(--shadow-xs); border: 1px solid var(--color-border-light); display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-6); }
    .request-row.processed { opacity: 0.7; background: var(--color-surface-alt); }
    .req-main { flex: 1; min-width: 0; }
    .req-info { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-5); flex-wrap: wrap; }
    .lab-name { font-size: var(--text-lg); font-weight: var(--fw-bold); color: var(--color-text-primary); }
    .req-date { font-size: var(--text-sm); color: var(--color-text-secondary); }
    .status-pill { font-size: var(--text-xs); font-weight: var(--fw-black); padding: 3px 9px; border-radius: var(--radius-sm); text-transform: uppercase; letter-spacing: 0.04em; }
    .pending  { background: #fef9c3; color: #854d0e; }
    .approved { background: var(--color-primary-subtle); color: var(--color-primary); }
    .rejected { background: var(--color-error-bg); color: var(--color-error); }
    .req-tagline { font-size: var(--text-md); font-weight: var(--fw-semi); color: var(--color-primary); margin-bottom: var(--space-2); }
    .req-desc { font-size: var(--text-base); color: var(--color-text-secondary); margin-bottom: var(--space-5); line-height: var(--lh-normal); background: var(--color-surface-alt); padding: var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--color-border-light); }
    .details-grid { display: grid; grid-template-columns: 1fr 1.5fr; gap: var(--space-8); }
    .detail-block label { display: block; font-size: var(--text-xs); font-weight: var(--fw-black); color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-2); }
    .leader-box { font-size: var(--text-base); line-height: var(--lh-normal); color: var(--color-text-body); }
    .members-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .member-tag { background: var(--color-surface-alt); color: var(--color-text-body); padding: 3px 10px; border-radius: var(--radius-sm); font-size: var(--text-base); border: 1px solid var(--color-border); }
    .no-m { font-style: italic; color: var(--color-text-tertiary); font-size: var(--text-base); }
    .req-actions { display: flex; gap: var(--space-2); flex-shrink: 0; align-self: flex-start; }
    .req-actions button { padding: 9px 18px; border-radius: var(--radius-md); font-family: var(--font-sans); font-weight: var(--fw-bold); font-size: var(--text-base); cursor: pointer; border: none; transition: var(--transition-fast); }
    .req-actions button:hover:not(:disabled) { transform: translateY(-1px); }
    .btn-approve { background: var(--color-primary); color: white; }
    .btn-approve:hover:not(:disabled) { background: var(--color-primary-hover); }
    .btn-reject { background: var(--color-surface-alt); color: var(--color-text-secondary); border: 1px solid var(--color-border) !important; }
    .btn-reject:hover:not(:disabled) { background: var(--color-border-light); }

    .admin-section { margin-bottom: var(--space-10); }
    .section-title { font-size: var(--text-base); font-weight: var(--fw-black); color: var(--color-text-tertiary); margin-bottom: var(--space-4); text-transform: uppercase; letter-spacing: 0.06em; }
    .empty-mini { background: var(--color-surface-alt); border: 1.5px dashed var(--color-border); border-radius: var(--radius-md); padding: var(--space-5); text-align: center; color: var(--color-text-tertiary); font-size: var(--text-base); }
    .history-section { border-top: 1px solid var(--color-border-light); padding-top: var(--space-8); }
    .btn-history-toggle { width: 100%; padding: 11px; background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-family: var(--font-sans); color: var(--color-text-secondary); font-weight: var(--fw-semi); font-size: var(--text-base); cursor: pointer; margin-bottom: var(--space-5); transition: var(--transition-fast); }
    .btn-history-toggle:hover { background: var(--color-border-light); }
    .history-list { display: flex; flex-direction: column; gap: var(--space-3); }
    .request-row.processed { padding: var(--space-4) var(--space-6); }
    .mini-grid { grid-template-columns: 1fr 1fr; gap: var(--space-3); font-size: var(--text-sm); color: var(--color-text-tertiary); }
    .loading-state, .empty-state { text-align: center; padding: 60px; color: var(--color-text-secondary); font-size: var(--text-md); }
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
