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
        <div *ngFor="let lab of myLabs" class="lab-item-row">
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
            <button 
              *ngIf="lab.is_leader" 
              (click)="openManageModal(lab)" 
              class="btn-manage">
              Manage Requests
            </button>
            <button 
              *ngIf="lab.is_leader" 
              (click)="deleteLab(lab)" 
              class="btn-delete"
              [disabled]="isDeleting === lab.id">
              {{ isDeleting === lab.id ? 'Deleting...' : 'Delete Lab' }}
            </button>
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
                  <span class="req-uid">{{ req.uid }}</span>
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
    .my-labs-container { padding: 40px; max-width: 1000px; margin: 0 auto; }
    .page-header { margin-bottom: 40px; }
    .page-header h1 { font-size: 2.5rem; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
    .page-header p { color: #64748b; font-size: 1.1rem; }

    .labs-list { display: flex; flex-direction: column; gap: 20px; }
    .lab-item-row { background: white; border-radius: 20px; padding: 30px; border: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; gap: 40px; transition: all 0.2s; }
    .lab-item-row:hover { border-color: #166534; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }

    .lab-main { flex: 1; }
    .lab-header { display: flex; align-items: center; gap: 15px; margin-bottom: 12px; }
    .lab-name { font-size: 1.4rem; font-weight: 800; color: #1e293b; margin: 0; }
    
    .role-badge { font-size: 0.7rem; font-weight: 800; padding: 4px 10px; border-radius: 6px; background: #f1f5f9; color: #64748b; }
    .role-badge.leader { background: #dcfce7; color: #166534; }

    .lab-tagline { font-weight: 600; color: #166534; margin-bottom: 8px; font-size: 1rem; }
    .lab-desc { color: #64748b; font-size: 0.9rem; line-height: 1.5; margin-bottom: 15px; max-width: 600px; }
    .lab-meta { font-size: 0.8rem; color: #94a3b8; font-weight: 600; display: flex; gap: 20px; align-items: center; }
    .member-count { color: #166534; cursor: pointer; background: #f0fdf4; padding: 4px 10px; border-radius: 8px; transition: all 0.2s; }
    .member-count:hover { background: #dcfce7; }

    /* Team Section Styles */
    .team-section { margin-top: 20px; padding-top: 20px; border-top: 1px dashed #e2e8f0; animation: fadeIn 0.3s ease-out; }
    .members-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .member-mini-card { background: #f8fafc; border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 10px; position: relative; border: 1px solid transparent; }
    .member-mini-card:hover { border-color: #cbd5e1; }
    .member-info { flex: 1; display: flex; flex-direction: column; }
    .m-name { font-weight: 700; color: #1e293b; font-size: 0.85rem; }
    .m-uid { font-size: 0.75rem; color: #94a3b8; }
    .member-role-tag { font-size: 0.6rem; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: #e2e8f0; color: #64748b; }
    .member-role-tag.leader { background: #dcfce7; color: #166534; }
    
    .btn-remove-member { background: #fee2e2; color: #ef4444; border: none; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; cursor: pointer; transition: all 0.2s; opacity: 0; }
    .member-mini-card:hover .btn-remove-member { opacity: 1; }
    .btn-remove-member:hover { background: #ef4444; color: white; transform: scale(1.1); }

    @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

    .mini-spinner { width: 20px; height: 20px; border: 2px solid #f1f5f9; border-top: 2px solid #166534; border-radius: 50%; animation: spin 1s linear infinite; }

    .btn-manage { padding: 12px 20px; background: #166534; color: white; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; transition: background 0.2s; white-space: nowrap; }
    .btn-manage:hover { background: #14532d; }
    
    .btn-delete { padding: 12px 20px; background: #f8fafc; color: #ef4444; border: 1px solid #fee2e2; border-radius: 10px; font-weight: 700; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
    .btn-delete:hover:not(:disabled) { background: #fee2e2; }
    .btn-delete:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Modal Styles */
    .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
    .modal-content { background: white; width: 100%; max-width: 500px; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; }
    .modal-header { padding: 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
    .modal-header h2 { font-size: 1.2rem; font-weight: 800; color: #0f172a; margin: 0; }
    .close-btn { background: none; border: none; font-size: 1.5rem; color: #94a3b8; cursor: pointer; }
    
    .modal-body { padding: 24px; max-height: 400px; overflow-y: auto; }
    .request-item { background: #f8fafc; border-radius: 16px; padding: 16px; margin-bottom: 12px; border: 1px solid #f1f5f9; }
    .req-user-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .req-uid { font-weight: 700; color: #1e293b; font-size: 1rem; }
    .req-date { font-size: 0.75rem; color: #94a3b8; }
    .req-message { font-style: italic; color: #64748b; font-size: 0.85rem; margin-bottom: 12px; padding: 10px; background: white; border-radius: 8px; }
    
    .req-actions { display: flex; gap: 8px; }
    .btn-approve { flex: 1; padding: 10px; background: #166534; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; }
    .btn-reject { flex: 1; padding: 10px; background: white; color: #ef4444; border: 1px solid #fee2e2; border-radius: 8px; font-weight: 700; cursor: pointer; }
    
    .modal-empty, .modal-loading { text-align: center; padding: 40px 0; color: #64748b; }

    .loading-state, .empty-state { text-align: center; padding: 100px 0; color: #64748b; }
    .spinner { width: 40px; height: 40px; border: 4px solid #f1f5f9; border-top: 4px solid #166534; border-radius: 50%; margin: 0 auto 16px; animation: spin 1s linear infinite; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .empty-icon { font-size: 4rem; margin-bottom: 20px; }
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

  async loadMyLabs() {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      this.myLabs = await this.labService.getMyLabs();
      // Initialize counts
      for (const lab of this.myLabs) {
        this.fetchMemberCount(lab.id);
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
    } catch (err) {
      alert('Failed to reject request.');
    } finally {
      this.processingId = null;
      this.cdr.detectChanges();
    }
  }

  async deleteLab(lab: any) {
    if (!confirm(`Are you sure you want to delete "${lab.lab_name}"? This action cannot be undone.`)) return;

    this.isDeleting = lab.id;
    try {
      await this.labService.deleteLab(lab.id);
      this.myLabs = this.myLabs.filter(l => l.id !== lab.id);
      alert('Lab deleted successfully.');
    } catch (err: any) {
      alert(err.error?.detail || 'Failed to delete lab');
    } finally {
      this.isDeleting = null;
      this.cdr.detectChanges();
    }
  }
}
