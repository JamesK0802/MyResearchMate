import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabService, LabRegistrationRequest } from '../../services/lab.service';
import { AuthService } from '../../services/auth.service';
import { StorageQuotaService } from '../../services/storage-quota.service';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="admin-container">
      <div class="page-header">
        <h1>Admin Dashboard</h1>
        <p>Review and manage lab workspace registration requests.</p>
      </div>
      <div class="tabs"><button [class.active]="activeAdminTab==='labs'" (click)="activeAdminTab='labs'">Lab Approval <span *ngIf="pendingRequests.length" class="request-badge">{{pendingRequests.length}}</span></button><button [class.active]="activeAdminTab==='storage'" (click)="activeAdminTab='storage'">Storage Management <span *ngIf="pendingStorageRequests.length" class="request-badge">{{pendingStorageRequests.length}}</span></button></div>
      <div class="admin-section" *ngIf="activeAdminTab==='storage'">
        <h2 class="section-title">Storage requests</h2>
        <div *ngFor="let req of pendingStorageRequests" class="request-row storage-request"><div class="req-main"><div class="request-top"><strong>{{req.target}}</strong><span>{{gb(req.requested_bytes)}} requested</span></div><p>{{req.reason}}</p><div class="review-fields"><label>Approve total <input type="number" [(ngModel)]="req.approvedGb" min="1"><small>GB</small></label><label>Review note <input [(ngModel)]="req.reviewReason" placeholder="Optional for approval, required for rejection"></label></div></div><div class="req-actions"><button class="btn-approve" (click)="approveStorage(req)">Approve</button><button class="btn-reject" (click)="rejectStorage(req)">Reject</button></div></div>
        <div *ngIf="!pendingStorageRequests.length" class="empty-mini">No pending storage requests.</div>
        <h2 class="section-title" style="margin-top:24px">Personal storage</h2>
        <div *ngFor="let target of personalTargets" class="request-row processed allocation-row"><strong>{{displayStorageTarget(target)}}</strong><span class="req-date">{{gb(target.used_bytes)}} used / {{gb(target.quota_bytes)}}</span><button class="btn-manage-quota" (click)="manageQuota(target)" [attr.aria-label]="'Edit storage allocation for ' + displayStorageTarget(target)">✎ <span>Edit allocation</span></button></div>
        <h2 class="section-title" style="margin-top:24px">Lab storage</h2>
        <div *ngFor="let target of labTargets" class="request-row processed allocation-row"><strong>{{target.name}}</strong><span class="req-date">{{gb(target.used_bytes)}} used / {{gb(target.quota_bytes)}}</span><button class="btn-manage-quota" (click)="manageQuota(target)" [attr.aria-label]="'Edit storage allocation for ' + target.name">✎ <span>Edit allocation</span></button></div>
      </div>

      <div *ngIf="activeAdminTab==='labs' && loading" class="loading-state">
        <p>Loading requests...</p>
      </div>

      <div *ngIf="activeAdminTab==='labs' && !loading && requests.length === 0" class="empty-state">
        <p>No registration requests found.</p>
      </div>

      <div *ngIf="activeAdminTab==='labs' && !loading && requests.length > 0" class="requests-list">
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
                  <label>Team Members ({{ req.members_json?.length || 0 }})</label>
                  <div class="members-tags">
                    <span *ngFor="let m of req.members_json" class="member-tag" [title]="m.email">
                      {{ m.name || m.uid }}
                    </span>
                    <span *ngIf="(req.members_json?.length || 0) === 0" class="no-m">No additional members</span>
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
    .page-header { margin-bottom: var(--space-5); }
    .tabs{display:flex;gap:4px;border-bottom:1px solid var(--color-border);margin-bottom:var(--space-7)}.tabs button{padding:10px 16px;border:0;border-bottom:2px solid transparent;background:none;font:inherit;font-weight:700;color:var(--color-text-secondary);cursor:pointer}.tabs button.active{color:var(--color-primary);border-bottom-color:var(--color-primary)}.request-badge{display:inline-grid;place-items:center;min-width:18px;height:18px;margin-left:5px;padding:0 5px;border-radius:999px;background:#dc2626;color:#fff;font-size:.68rem;font-weight:800;line-height:1;vertical-align:middle}
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
    .storage-request{padding:20px 24px}.request-top{display:flex;align-items:center;gap:10px}.request-top strong{font-size:1rem}.request-top span{font-size:.78rem;font-weight:800;color:var(--color-primary);background:var(--color-primary-subtle);padding:4px 8px;border-radius:999px}.storage-request p{margin:10px 0 14px;color:var(--color-text-secondary);font-size:.9rem}.review-fields{display:grid;grid-template-columns:150px 1fr;gap:10px}.review-fields label{font-size:.72rem;font-weight:800;color:var(--color-text-tertiary);text-transform:uppercase}.review-fields input{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:8px;border:1px solid var(--color-border);border-radius:6px;font:inherit;text-transform:none}.review-fields small{display:block;margin-top:3px}.allocation-row{align-items:center;padding:16px 22px;gap:14px}.allocation-row .req-date{margin-left:auto}.btn-manage-quota{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:var(--color-surface);color:var(--color-primary);border:1px solid var(--color-primary-border);border-radius:var(--radius-md);font:inherit;font-size:.82rem;font-weight:var(--fw-bold);cursor:pointer;white-space:nowrap;transition:var(--transition-fast)}.btn-manage-quota:hover{background:var(--color-primary-light);border-color:var(--color-primary)}
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
    @media (max-width: 600px) {
      .admin-container { padding: 16px 12px; }
      .page-header { margin-bottom: 10px; }
      .page-header h1 { font-size: 1.5rem; margin-bottom: 0; }
      .page-header p { display: none; }
      .tabs { margin-bottom: 14px; }
      .tabs button { flex: 1; padding: 9px 5px; font-size: .76rem; }
      .admin-section { margin-bottom: 18px; }
      .section-title { margin-bottom: 8px; font-size: .68rem; }
      .requests-list { gap: 9px; }
      .request-row, .storage-request, .allocation-row { padding: 12px; border-radius: 13px; display: block; }
      .req-info { gap: 6px; margin-bottom: 9px; }
      .lab-name { font-size: .95rem; }
      .req-date { font-size: .68rem; }
      .req-tagline { font-size: .78rem; margin-bottom: 5px; }
      .req-desc { display: none; }
      .details-grid, .mini-grid { grid-template-columns: 1fr; gap: 8px; }
      .detail-block label { margin-bottom: 3px; font-size: .62rem; }
      .leader-box, .member-tag, .no-m { font-size: .75rem; }
      .req-actions { margin-top: 10px; }
      .req-actions button { flex: 1; padding: 8px; font-size: .75rem; }
      .review-fields { grid-template-columns: 1fr; gap: 8px; }
      .allocation-row .req-date { margin: 4px 0 10px; display: block; }
      .btn-manage-quota { width: 100%; justify-content: center; }
      .history-section { padding-top: 14px; }
      .request-row.processed { padding: 10px 12px; }
      .loading-state, .empty-state { padding: 45px 10px; }
    }
  `]
})
export class AdminPanelComponent implements OnInit {
  requests: LabRegistrationRequest[] = [];
  loading = true;
  processingId: string | null = null;
  showHistory = false;
  storageRequests: any[] = []; storageTargets: any[] = [];
  activeAdminTab: 'labs'|'storage' = 'labs';
  get personalTargets(){return this.storageTargets.filter(t=>t.scope==='personal');} get labTargets(){return this.storageTargets.filter(t=>t.scope==='lab');}
  displayStorageTarget(target:any){ return target.scope === 'personal' && target.uid ? `${target.name} (${target.uid})` : target.name; }
  get pendingStorageRequests(){ return this.storageRequests.filter(r => r.status === 'pending'); }

  get pendingRequests() {
    return this.requests.filter(r => r.status === 'pending');
  }

  get processedRequests() {
    return this.requests.filter(r => r.status !== 'pending');
  }

  constructor(
    private labService: LabService,
    public auth: AuthService,
    private cdr: ChangeDetectorRef,
    private storage: StorageQuotaService
  ) {}

  ngOnInit() {
    this.loadRequests(); this.loadStorage();
  }
  gb(bytes:number){ return `${(bytes / 1024 ** 3).toFixed(2)} GB`; }
  async loadStorage(){ try { const data:any=await this.storage.adminOverview(); this.storageRequests=data.requests.map((r:any)=>({...r,approvedGb:Math.ceil(r.requested_bytes/1024**3),reviewReason:''})); this.storageTargets=data.targets.map((t:any)=>({...t,quotaGb:Math.ceil(t.quota_bytes/1024**3)})); this.cdr.detectChanges(); }catch(e){console.error('Failed to load storage admin data',e)} }
  async approveStorage(r:any){ try{await this.storage.adminApprove(r.id,r.approvedGb*1024**3,r.reviewReason); await this.loadStorage();}catch(e:any){alert(e?.error?.detail||'Could not approve request.')} }
  async rejectStorage(r:any){ if(!r.reviewReason?.trim()){alert('Enter a rejection reason.');return;} try{await this.storage.adminReject(r.id,r.reviewReason);await this.loadStorage();}catch(e:any){alert(e?.error?.detail||'Could not reject request.')} }
  async saveQuota(t:any){ try{await this.storage.adminSet(t.scope,t.id,t.quotaGb*1024**3);await this.loadStorage();}catch(e:any){alert(e?.error?.detail||'Could not update quota.')} }
  async manageQuota(t:any){ const value=prompt(`Set ${t.name} allocation in GB`, String(Math.ceil(t.quota_bytes/1024**3))); if(value===null)return; const gb=Number(value); if(!Number.isFinite(gb)||gb<=0){alert('Enter a positive number.');return;} try{await this.storage.adminSet(t.scope,t.id,gb*1024**3);await this.loadStorage();}catch(e:any){alert(e?.error?.detail||'Could not update quota.')} }

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
