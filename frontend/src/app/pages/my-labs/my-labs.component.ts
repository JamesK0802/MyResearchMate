import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabService } from '../../services/lab.service';

@Component({
  selector: 'app-my-labs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="my-labs-container">
      <div class="page-header">
        <h1>My Research Labs</h1>
        <p>Manage the labs you are a member of or lead.</p>
      </div>

      <div class="modal-overlay" *ngIf="deleteWarningLab" (click)="deleteWarningLab=null">
        <div class="modal-content delete-warning" (click)="$event.stopPropagation()">
          <div class="modal-header"><h2>Schedule lab deletion?</h2><button class="close-btn" (click)="deleteWarningLab=null">×</button></div>
          <div class="modal-body"><div class="warning-icon">⚠</div><p><strong>{{deleteWarningLab.lab_name}}</strong> will stop accepting Lab Archive changes immediately.</p><ul><li>Lab Archive remains available for viewing and download only for 10 days.</li><li>After 10 days, all Lab Archive files are permanently deleted.</li><li>Data shared with this Lab becomes visible immediately to its original owner only.</li></ul><p class="warning-note">This action cannot be undone after the 10-day retention period.</p></div>
          <div class="modal-footer"><button class="btn-cancel" (click)="deleteWarningLab=null">Cancel</button><button class="btn-delete-confirm" (click)="confirmDeleteLab()">Schedule deletion</button></div>
        </div>
      </div>

      <div *ngIf="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Loading your labs...</p>
      </div>

      <div *ngIf="!loading && myLabs.length === 0" class="empty-state">
        <div class="empty-icon">🏢</div>
        <h3>No labs joined yet</h3>
        <p>Search for research labs or register your own!</p>
      </div>

      <div *ngIf="!loading && myLabs.length > 0" class="labs-list">
        <div *ngFor="let lab of myLabs" class="lab-item-row" [class.deletion-scheduled]="lab.archive_deletion_at">
          <div class="lab-main">
            <div class="lab-header">
              <h3 class="lab-name">{{ lab.lab_name }}</h3>
              <span class="role-badge" [class.leader]="lab.is_leader">
                {{ lab.is_leader ? 'LAB LEADER' : 'MEMBER' }}
              </span>
            </div>
            <div class="lab-tagline" *ngIf="lab.lab_tagline">"{{ lab.lab_tagline }}"</div>
            <p class="lab-desc" *ngIf="lab.lab_description">{{ lab.lab_description }}</p>
            <div class="lab-meta">
              <span>📅 Joined on {{ lab.created_at | date:'mediumDate' }}</span>
              <span class="member-count" (click)="toggleTeam(lab)">
                👥 Team ({{ teamCounts[lab.id] || '...' }}) {{ expandedLabs[lab.id] ? '▲' : '▼' }}
              </span>
            </div>
            <div *ngIf="lab.archive_deletion_at" class="deletion-banner">⚠ Deletion scheduled — Archive is read-only. {{ remainingDays(lab.archive_deletion_at) }} day(s) remain before permanent deletion.</div>

            <!-- Team Members Section -->
            <div class="team-section" *ngIf="expandedLabs[lab.id]">
              <div *ngIf="loadingTeam[lab.id]" class="mini-spinner"></div>
              <div *ngIf="!loadingTeam[lab.id]" class="members-grid">
                <div *ngFor="let member of labMembers[lab.id]" class="member-mini-card">
                  <div class="member-info">
                    <span class="m-name">{{ member.name || 'No Name' }}</span>
                    <span class="m-uid">{{ member.uid }}</span>
                  </div>
                  <div class="member-role-tag" [class.leader]="member.role_in_lab === 'leader'">
                    {{ member.role_in_lab | uppercase }}
                  </div>
                  <button 
                    *ngIf="lab.is_leader && member.role_in_lab !== 'leader'" 
                    (click)="removeMember(lab, member)" 
                    class="btn-remove-member"
                    title="Remove Member">
                    &times;
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="lab-actions">
            <button *ngIf="lab.is_leader && !lab.archive_deletion_at"
              (click)="openManageModal(lab)" 
              class="btn-manage">
              Manage Requests <span *ngIf="joinRequestCounts[lab.id]" class="request-badge">{{ joinRequestCounts[lab.id] }}</span>
            </button>
            <button 
              *ngIf="lab.is_leader && !lab.archive_deletion_at"
              (click)="deleteLab(lab)" 
              class="btn-delete"
              [disabled]="isDeleting === lab.id">
              {{ isDeleting === lab.id ? 'Deleting...' : 'Delete Lab' }}
            </button>
            <button *ngIf="lab.is_leader && lab.archive_deletion_at" (click)="cancelDeletion(lab)" class="btn-cancel-deletion">Cancel deletion</button>
          </div>
        </div>
      </div>

      <!-- Manage Requests Modal -->
      <div class="modal-overlay" *ngIf="managingLab" (click)="closeManageModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Join Requests for {{ managingLab.lab_name }}</h2>
            <button class="close-btn" (click)="closeManageModal()">&times;</button>
          </div>
          <div class="modal-body">
            <div *ngIf="loadingRequests" class="modal-loading">
              <div class="spinner"></div>
              <p>Loading requests...</p>
            </div>

            <div *ngIf="!loadingRequests && pendingRequests.length === 0" class="modal-empty">
              <p>No pending join requests.</p>
            </div>

            <div *ngIf="!loadingRequests && pendingRequests.length > 0" class="requests-list">
              <div *ngFor="let req of pendingRequests" class="request-item">
                <div class="req-user-info">
                  <div style="display: flex; flex-direction: column;">
                    <span class="m-name">{{ req.name || 'No Name' }}</span>
                    <span class="req-uid">{{ req.uid }}</span>
                  </div>
                  <span class="req-date">{{ req.created_at | date:'mediumDate' }}</span>
                </div>
                <div class="req-message" *ngIf="req.message">
                  "{{ req.message }}"
                </div>
                <div class="req-actions">
                  <button class="btn-approve" (click)="approveJoin(req)" [disabled]="processingId === req.id">
                    {{ processingId === req.id ? '...' : 'Approve' }}
                  </button>
                  <button class="btn-reject" (click)="rejectJoin(req)" [disabled]="processingId === req.id">
                    {{ processingId === req.id ? '...' : 'Reject' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .my-labs-container { padding: var(--space-10); max-width: 1000px; margin: 0 auto; }
    .page-header { margin-bottom: var(--space-8); }
    .page-header h1 { font-size: var(--text-3xl); font-weight: var(--fw-black); color: var(--color-text-primary); margin-bottom: var(--space-2); letter-spacing: -0.025em; }
    .page-header p { color: var(--color-text-secondary); font-size: var(--text-lg); margin: 0; }

    .labs-list { display: flex; flex-direction: column; gap: var(--space-4); }
    .lab-item-row { background: var(--color-surface); border-radius: var(--radius-xl); padding: var(--space-6); border: 1px solid var(--color-border-light); display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-8); transition: var(--transition-normal); }
    .lab-item-row:hover { border-color: var(--color-primary); box-shadow: var(--shadow-md); }

    .lab-main { flex: 1; min-width: 0; }
    .lab-header { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2); flex-wrap: wrap; }
    .lab-name { font-size: var(--text-xl); font-weight: var(--fw-black); color: var(--color-text-primary); margin: 0; }
    .role-badge { font-size: var(--text-xs); font-weight: var(--fw-black); padding: 3px 10px; border-radius: var(--radius-full); background: var(--color-surface-alt); color: var(--color-text-secondary); border: 1px solid var(--color-border); letter-spacing: 0.04em; text-transform: uppercase; }
    .role-badge.leader { background: var(--color-primary-subtle); color: var(--color-primary); border-color: var(--color-primary-border); }

    .lab-tagline { font-weight: var(--fw-semi); color: var(--color-primary); margin-bottom: var(--space-2); font-size: var(--text-md); }
    .lab-desc { color: var(--color-text-secondary); font-size: var(--text-base); line-height: var(--lh-normal); margin-bottom: var(--space-4); max-width: 600px; }
    .lab-meta { font-size: var(--text-sm); color: var(--color-text-tertiary); font-weight: var(--fw-semi); display: flex; gap: var(--space-5); align-items: center; flex-wrap: wrap; }
    .member-count { color: var(--color-primary); cursor: pointer; background: var(--color-primary-light); padding: 3px 10px; border-radius: var(--radius-md); transition: var(--transition-fast); border: 1px solid var(--color-primary-border); }
    .member-count:hover { background: var(--color-primary-subtle); }

    /* Team Section */
    .team-section { margin-top: var(--space-5); padding-top: var(--space-5); border-top: 1px dashed var(--color-border); animation: fadeIn 0.25s ease-out; }
    .members-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--space-3); }
    .member-mini-card { background: var(--color-surface-alt); border-radius: var(--radius-md); padding: var(--space-3); display: flex; align-items: center; gap: var(--space-2); position: relative; border: 1px solid transparent; transition: var(--transition-fast); }
    .member-mini-card:hover { border-color: var(--color-border); }
    .member-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .m-name { font-weight: var(--fw-bold); color: var(--color-text-primary); font-size: var(--text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .m-uid { font-size: var(--text-xs); color: var(--color-text-tertiary); }
    .member-role-tag { font-size: 0.6rem; font-weight: var(--fw-black); padding: 2px 6px; border-radius: var(--radius-sm); background: var(--color-border); color: var(--color-text-secondary); white-space: nowrap; }
    .member-role-tag.leader { background: var(--color-primary-subtle); color: var(--color-primary); }
    .btn-remove-member { background: var(--color-error-bg); color: #ef4444; border: none; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; cursor: pointer; transition: var(--transition-fast); opacity: 0; flex-shrink: 0; font-size: 0.85rem; }
    .member-mini-card:hover .btn-remove-member { opacity: 1; }
    .btn-remove-member:hover { background: #ef4444; color: white; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    .mini-spinner { width: 20px; height: 20px; border: 2px solid var(--color-border-light); border-top-color: var(--color-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }

    .lab-actions { display: flex; flex-direction: column; gap: var(--space-2); flex-shrink: 0; }
    .btn-manage { padding: 10px 18px; background: var(--color-primary); color: white; border: none; border-radius: var(--radius-md); font-family: var(--font-sans); font-weight: var(--fw-bold); font-size: var(--text-base); cursor: pointer; transition: var(--transition-fast); white-space: nowrap; }.request-badge{display:inline-grid;place-items:center;min-width:18px;height:18px;margin-left:6px;padding:0 5px;border-radius:999px;background:#dc2626;color:#fff;font-size:.68rem;font-weight:800;line-height:1;vertical-align:middle}
    .btn-manage:hover { background: var(--color-primary-hover); }
    .btn-delete { padding: 10px 18px; background: var(--color-surface-alt); color: #ef4444; border: 1px solid var(--color-error-border); border-radius: var(--radius-md); font-family: var(--font-sans); font-weight: var(--fw-bold); font-size: var(--text-base); cursor: pointer; transition: var(--transition-fast); white-space: nowrap; }
    .btn-delete:hover:not(:disabled) { background: var(--color-error-bg); }
    .btn-delete:disabled { opacity: 0.5; cursor: not-allowed; }
    .lab-item-row.deletion-scheduled{border:2px solid #f87171;background:#fff8f8}.deletion-banner{margin-top:14px;padding:9px 12px;border-radius:7px;background:#fff1f2;color:#b91c1c;font-size:.82rem;font-weight:700}.btn-cancel-deletion{padding:10px 18px;background:#fff;color:#b91c1c;border:1px solid #fca5a5;border-radius:var(--radius-md);font-family:var(--font-sans);font-weight:var(--fw-bold);font-size:var(--text-base);cursor:pointer}.btn-cancel-deletion:hover{background:#fff1f2}
    .delete-warning{border:2px solid #fca5a5}.warning-icon{font-size:32px}.delete-warning ul{padding-left:20px;color:var(--color-text-secondary);line-height:1.65}.warning-note{color:#b91c1c;font-weight:700}

    /* Modal Styles */
    .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15,23,42,0.55); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(6px); padding: var(--space-5); }
    .modal-content { background: var(--color-surface); width: 100%; max-width: 500px; border-radius: var(--radius-2xl); box-shadow: var(--shadow-xl); overflow: hidden; animation: modalIn 0.25s cubic-bezier(0.16,1,0.3,1); }
    .modal-footer { display:flex; justify-content:flex-end; align-items:center; gap:var(--space-3); padding:var(--space-4) var(--space-6); border-top:1px solid var(--color-border-light); }
    .delete-warning .modal-footer .btn-cancel, .delete-warning .modal-footer .btn-delete-confirm { box-sizing:border-box; height:40px; padding:0 18px; display:inline-flex; align-items:center; justify-content:center; border-radius:var(--radius-md); font-family:var(--font-sans); font-size:var(--text-base); font-weight:var(--fw-bold); line-height:1; }
    .delete-warning .modal-footer .btn-cancel { background:var(--color-surface); color:var(--color-text-secondary); border:1px solid var(--color-border); cursor:pointer; }
    .delete-warning .modal-footer .btn-delete-confirm { background:#dc2626; color:#fff; border:0; cursor:pointer; }
    @keyframes modalIn { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .modal-header { padding: var(--space-6) var(--space-6); border-bottom: 1px solid var(--color-border-light); display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); }
    .modal-header h2 { font-size: var(--text-lg); font-weight: var(--fw-black); color: var(--color-text-primary); margin: 0; }
    .close-btn { background: var(--color-surface-alt); border: 1px solid var(--color-border-light); width: 32px; height: 32px; border-radius: var(--radius-full); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; color: var(--color-text-secondary); cursor: pointer; transition: var(--transition-fast); }
    .close-btn:hover { background: var(--color-error-bg); color: #ef4444; }
    .modal-body { padding: var(--space-6); max-height: 420px; overflow-y: auto; }
    .request-item { background: var(--color-surface-alt); border-radius: var(--radius-lg); padding: var(--space-4); margin-bottom: var(--space-3); border: 1px solid var(--color-border-light); }
    .req-user-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2); }
    .req-uid { font-weight: var(--fw-bold); color: var(--color-text-primary); font-size: var(--text-md); }
    .req-date { font-size: var(--text-xs); color: var(--color-text-tertiary); }
    .req-message { font-style: italic; color: var(--color-text-secondary); font-size: var(--text-base); margin-bottom: var(--space-3); padding: var(--space-3); background: var(--color-surface); border-radius: var(--radius-sm); border: 1px solid var(--color-border-light); }
    .req-actions { display: flex; gap: var(--space-2); }
    .btn-approve { flex: 1; padding: 9px; background: var(--color-primary); color: white; border: none; border-radius: var(--radius-md); font-family: var(--font-sans); font-weight: var(--fw-bold); font-size: var(--text-base); cursor: pointer; transition: var(--transition-fast); }
    .btn-approve:hover:not(:disabled) { background: var(--color-primary-hover); }
    .btn-reject { flex: 1; padding: 9px; background: var(--color-surface); color: #ef4444; border: 1px solid var(--color-error-border); border-radius: var(--radius-md); font-family: var(--font-sans); font-weight: var(--fw-bold); font-size: var(--text-base); cursor: pointer; transition: var(--transition-fast); }
    .btn-reject:hover:not(:disabled) { background: var(--color-error-bg); }
    .modal-empty, .modal-loading { text-align: center; padding: 40px 0; color: var(--color-text-secondary); font-size: var(--text-base); }

    .loading-state, .empty-state { text-align: center; padding: 100px 0; color: var(--color-text-secondary); }
    .spinner { width: 36px; height: 36px; border: 3px solid var(--color-border-light); border-top-color: var(--color-primary); border-radius: 50%; margin: 0 auto var(--space-4); animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .empty-icon { font-size: 3rem; margin-bottom: var(--space-5); display: block; }
  `]
})
export class MyLabsComponent implements OnInit {
  myLabs: any[] = [];
  loading = true;
  isDeleting: string | null = null;

  // Manage Requests
  managingLab: any = null;
  pendingRequests: any[] = [];
  loadingRequests = false;
  processingId: string | null = null;

  constructor(
    private labService: LabService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.loadMyLabs();
  }

  // Expanded Team View State
  expandedLabs: { [key: string]: boolean } = {};
  labMembers: { [key: string]: any[] } = {};
  loadingTeam: { [key: string]: boolean } = {};
  teamCounts: { [key: string]: number } = {};
  joinRequestCounts: { [key: string]: number } = {};

  async loadMyLabs() {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      this.myLabs = await this.labService.getMyLabs();
      // Initialize counts
      for (const lab of this.myLabs) {
        this.fetchMemberCount(lab.id);
        if (lab.is_leader && !lab.archive_deletion_at) this.fetchJoinRequestCount(lab.id);
      }
    } catch (err) {
      console.error('Failed to load my labs', err);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async fetchMemberCount(labId: string) {
    try {
      const members = await this.labService.getLabMembers(labId);
      this.teamCounts[labId] = members.length;
      this.labMembers[labId] = members;
      this.cdr.detectChanges();
    } catch (err) {}
  }

  async fetchJoinRequestCount(labId: string) {
    try {
      const requests = await this.labService.getLabJoinRequests(labId);
      this.joinRequestCounts[labId] = requests.filter(request => request.status === 'pending').length;
      this.cdr.detectChanges();
    } catch (err) {}
  }

  async toggleTeam(lab: any) {
    const labId = lab.id;
    this.expandedLabs[labId] = !this.expandedLabs[labId];
    
    if (this.expandedLabs[labId] && !this.labMembers[labId]) {
      this.loadTeamMembers(labId);
    }
    this.cdr.detectChanges();
  }

  async loadTeamMembers(labId: string) {
    this.loadingTeam[labId] = true;
    this.cdr.detectChanges();
    try {
      this.labMembers[labId] = await this.labService.getLabMembers(labId);
      this.teamCounts[labId] = this.labMembers[labId].length;
    } catch (err) {
      console.error('Failed to load team members', err);
    } finally {
      this.loadingTeam[labId] = false;
      this.cdr.detectChanges();
    }
  }

  async removeMember(lab: any, member: any) {
    if (!confirm(`Are you sure you want to remove ${member.name || member.uid} from the lab?`)) return;
    
    try {
      await this.labService.removeLabMember(lab.id, member.uid);
      this.labMembers[lab.id] = this.labMembers[lab.id].filter(m => m.uid !== member.uid);
      this.teamCounts[lab.id]--;
      this.cdr.detectChanges();
    } catch (err: any) {
      alert(err.error?.detail || 'Failed to remove member');
    }
  }

  async openManageModal(lab: any) {
    this.managingLab = lab;
    this.loadingRequests = true;
    this.pendingRequests = [];
    this.cdr.detectChanges();
    
    try {
      this.pendingRequests = await this.labService.getLabJoinRequests(lab.id);
    } catch (err) {
      console.error('Failed to load lab join requests', err);
    } finally {
      this.loadingRequests = false;
      this.cdr.detectChanges();
    }
  }

  closeManageModal() {
    this.managingLab = null;
    this.pendingRequests = [];
  }

  async approveJoin(req: any) {
    this.processingId = req.id;
    try {
      await this.labService.approveJoinRequest(req.id);
      this.pendingRequests = this.pendingRequests.filter(r => r.id !== req.id);
      this.joinRequestCounts[this.managingLab.id] = this.pendingRequests.length;
      alert('Member approved and added to lab.');
    } catch (err) {
      alert('Failed to approve request.');
    } finally {
      this.processingId = null;
      this.cdr.detectChanges();
    }
  }

  async rejectJoin(req: any) {
    if (!confirm('Are you sure you want to reject this request?')) return;
    this.processingId = req.id;
    try {
      await this.labService.rejectJoinRequest(req.id);
      this.pendingRequests = this.pendingRequests.filter(r => r.id !== req.id);
      this.joinRequestCounts[this.managingLab.id] = this.pendingRequests.length;
    } catch (err) {
      alert('Failed to reject request.');
    } finally {
      this.processingId = null;
      this.cdr.detectChanges();
    }
  }

  async deleteLab(lab: any) {
    this.deleteWarningLab = lab;
  }
  deleteWarningLab: any = null;
  async confirmDeleteLab() {
    const lab = this.deleteWarningLab;
    if (!lab) return;

    this.isDeleting = lab.id;
    try {
      await this.labService.deleteLab(lab.id);
      this.myLabs = await this.labService.getMyLabs();
      this.labService.notifyLabsChanged();
      this.deleteWarningLab = null;
      alert('Deletion scheduled. The Lab Archive is read-only for 10 days.');
    } catch (err: any) {
      alert(err.error?.detail || 'Failed to delete lab');
    } finally {
      this.isDeleting = null;
      this.cdr.detectChanges();
    }
  }
  remainingDays(value: string) { return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)); }
  async cancelDeletion(lab: any) {
    if (!confirm(`Cancel deletion for "${lab.lab_name}" and restore Archive editing?`)) return;
    try { await this.labService.cancelLabDeletion(lab.id); this.myLabs = await this.labService.getMyLabs(); this.labService.notifyLabsChanged(); }
    catch (err: any) { alert(err?.error?.detail || 'Could not cancel deletion'); }
    finally { this.cdr.detectChanges(); }
  }
}
