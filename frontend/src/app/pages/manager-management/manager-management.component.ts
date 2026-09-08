import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { firstValueFrom } from 'rxjs';

interface DeploymentCommit {
  sha: string;
  subject: string;
}

interface DeploymentStatus {
  job_id: string;
  state: 'queued' | 'running' | 'success' | 'failed';
  stage: string;
  message: string;
  old_revision?: string;
  new_revision?: string;
  commits: DeploymentCommit[];
  changed_files: string[];
}

@Component({
  selector: 'app-manager-management',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="manager-container">
      <div class="page-header">
        <h1>Manager & Access Management</h1>
        <p>Promote users, revoke privileges, or manage private priority booking permissions.</p>
      </div>

      <section class="deployment-card" *ngIf="canManageServer">
        <div>
          <span class="section-label">SERVER</span>
          <h2>Update application</h2>
          <p>Pull the latest Git changes, then rebuild and restart Docker.</p>
          <div *ngIf="deploymentStatus && deploymentStatus.state !== 'success'" class="update-progress">
            <span class="small-spinner" *ngIf="deploymentStatus.state !== 'failed'"></span>
            <span>{{ deploymentStatus.message }}</span>
          </div>
          <div *ngIf="deploymentError" class="update-error">{{ deploymentError }}</div>
        </div>
        <button class="btn-update" (click)="startDeploymentUpdate()" [disabled]="updateInProgress">
          {{ updateInProgress ? 'Updating…' : 'Update & rebuild' }}
        </button>
      </section>

      <div *ngIf="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Loading users and access data...</p>
      </div>

      <div *ngIf="!loading" class="user-list">
        <div class="search-bar">
          <input type="text" placeholder="Search by name or email..." (input)="filterUsers($event)">
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Current Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let user of filteredUsers" [class.is-self]="user.id === currentUserId">
                <td>
                  <div class="user-info">
                    <span class="user-name">{{ user.name || 'No Name' }}</span>
                    <span class="user-email">{{ user.email }}</span>
                  </div>
                </td>
                <td>
                  <span class="role-pill" [class]="user.role">{{ user.role | uppercase }}</span>
                </td>

                <td>
                  <div class="actions" *ngIf="user.id !== currentUserId && user.role !== 'owner'">
                    <button *ngIf="user.role === 'user'" (click)="updateRole(user, 'manager')" class="btn-promote">
                      Make Manager
                    </button>
                    <button *ngIf="user.role === 'manager'" (click)="updateRole(user, 'user')" class="btn-revoke">
                      Revoke Manager
                    </button>
                  </div>
                  <span *ngIf="user.id === currentUserId" class="self-tag">You</span>
                  <span *ngIf="user.role === 'owner' && user.id !== currentUserId" class="owner-tag">System Owner</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="result-overlay" *ngIf="deploymentResult" (click)="closeDeploymentResult()">
      <section class="result-modal" (click)="$event.stopPropagation()">
        <button class="modal-close" aria-label="Close" (click)="closeDeploymentResult()">×</button>
        <span class="result-icon" [class.failed]="deploymentResult.state === 'failed'">
          {{ deploymentResult.state === 'success' ? '✓' : '!' }}
        </span>
        <h2>{{ deploymentResult.state === 'success' ? 'Update complete' : 'Update failed' }}</h2>
        <p>{{ deploymentResult.message }}</p>

        <div class="revision" *ngIf="deploymentResult.old_revision && deploymentResult.new_revision">
          <code>{{ shortRevision(deploymentResult.old_revision) }}</code>
          <span>→</span>
          <code>{{ shortRevision(deploymentResult.new_revision) }}</code>
        </div>

        <div class="result-details" *ngIf="deploymentResult.commits.length">
          <h3>Git updates</h3>
          <ul>
            <li *ngFor="let commit of deploymentResult.commits">
              <code>{{ commit.sha }}</code> {{ commit.subject }}
            </li>
          </ul>
        </div>
        <div class="no-changes" *ngIf="deploymentResult.state === 'success' && !deploymentResult.commits.length">
          Git was already up to date. Docker was rebuilt successfully.
        </div>
        <div class="result-details files" *ngIf="deploymentResult.changed_files.length">
          <h3>Changed files</h3>
          <p>{{ deploymentResult.changed_files.slice(0, 12).join(', ') }}<span *ngIf="deploymentResult.changed_files.length > 12">…</span></p>
        </div>
        <button class="btn-done" (click)="closeDeploymentResult()">Done</button>
      </section>
    </div>
  `,
  styles: [`
    .manager-container { padding: 40px; max-width: 1200px; margin: 0 auto; }
    .page-header { margin-bottom: 40px; }
    .page-header h1 { font-size: 2.5rem; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
    .page-header p { color: #64748b; font-size: 1.1rem; }

    .deployment-card { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 24px 28px; margin-bottom: 28px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 18px; }
    .deployment-card h2 { margin: 3px 0 4px; color: #14532d; font-size: 1.2rem; }
    .deployment-card p { margin: 0; color: #64748b; }
    .section-label { color: #16a34a; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.13em; }
    .btn-update { flex: 0 0 auto; padding: 12px 18px; color: white; background: #166534; }
    .btn-update:hover:not(:disabled) { background: #14532d; transform: translateY(-1px); }
    .btn-update:disabled { cursor: wait; opacity: 0.65; }
    .update-progress, .update-error { display: flex; align-items: center; gap: 8px; margin-top: 12px; color: #166534; font-size: 0.86rem; font-weight: 700; }
    .update-error { color: #b91c1c; }
    .small-spinner { width: 14px; height: 14px; border: 2px solid #bbf7d0; border-top-color: #15803d; border-radius: 50%; animation: spin 0.8s linear infinite; }

    .search-bar { margin-bottom: 24px; }
    .search-bar input { width: 100%; padding: 14px 20px; border: 2px solid #f1f5f9; border-radius: 14px; font-size: 1rem; transition: border-color 0.2s; }
    .search-bar input:focus { outline: none; border-color: #166534; }

    .table-container { background: white; border-radius: 20px; border: 1px solid #f1f5f9; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f8fafc; text-align: left; padding: 16px 24px; font-size: 0.85rem; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #f1f5f9; }
    td { padding: 20px 24px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    
    .user-info { display: flex; flex-direction: column; }
    .user-name { font-weight: 700; color: #1e293b; }
    .user-email { font-size: 0.85rem; color: #64748b; }

    .role-pill { font-size: 0.75rem; font-weight: 800; padding: 5px 12px; border-radius: 6px; }
    .role-pill.owner { background: #166534; color: white; }
    .role-pill.manager { background: #dcfce7; color: #166534; }
    .role-pill.user { background: #f1f5f9; color: #64748b; }


    .actions { display: flex; gap: 10px; }
    button { padding: 8px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s; border: none; }
    
    .btn-promote { background: #166534; color: white; }
    .btn-promote:hover { background: #14532d; transform: translateY(-1px); }
    
    .btn-revoke { background: #fee2e2; color: #ef4444; }
    .btn-revoke:hover { background: #fecaca; transform: translateY(-1px); }

    .self-tag, .owner-tag { font-size: 0.85rem; font-weight: 600; color: #94a3b8; font-style: italic; }

    .loading-state { text-align: center; padding: 100px 0; }
    .spinner { width: 40px; height: 40px; border: 4px solid #f1f5f9; border-top: 4px solid #166534; border-radius: 50%; margin: 0 auto 16px; animation: spin 1s linear infinite; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

    .result-overlay { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 24px; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(3px); }
    .result-modal { position: relative; width: min(600px, 100%); max-height: min(720px, calc(100vh - 48px)); overflow: auto; padding: 34px; background: white; border-radius: 22px; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28); }
    .modal-close { position: absolute; top: 14px; right: 14px; width: 34px; height: 34px; padding: 0; border-radius: 50%; background: #f1f5f9; color: #475569; font-size: 1.4rem; }
    .result-icon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; color: white; background: #16a34a; font-size: 1.5rem; font-weight: 800; }
    .result-icon.failed { background: #dc2626; }
    .result-modal > h2 { margin: 16px 0 5px; color: #0f172a; }
    .result-modal > p { margin: 0; color: #64748b; }
    .revision { display: flex; align-items: center; gap: 10px; margin: 20px 0; }
    .revision code, .result-details code { padding: 3px 7px; color: #166534; background: #dcfce7; border-radius: 6px; }
    .result-details { margin-top: 20px; padding-top: 18px; border-top: 1px solid #e2e8f0; }
    .result-details h3 { margin: 0 0 10px; color: #334155; font-size: 0.88rem; text-transform: uppercase; letter-spacing: 0.06em; }
    .result-details ul { display: grid; gap: 8px; margin: 0; padding-left: 20px; color: #334155; }
    .result-details.files p { color: #64748b; line-height: 1.55; overflow-wrap: anywhere; }
    .no-changes { margin-top: 20px; padding: 12px 14px; color: #166534; background: #f0fdf4; border-radius: 10px; }
    .btn-done { display: block; margin: 26px 0 0 auto; padding: 10px 22px; color: white; background: #166534; }
    @media (max-width: 640px) { .manager-container { padding: 22px 14px; } .deployment-card { align-items: stretch; flex-direction: column; } .btn-update { width: 100%; } .result-modal { padding: 28px 20px 22px; } }
  `]
})
export class ManagerManagementComponent implements OnInit, OnDestroy {
  users: any[] = [];
  filteredUsers: any[] = [];
  loading = true;
  currentUserId: number | null = null;
  canManageServer = false;
  private apiUrl = '/api'; // Use relative proxy URL matching other calls
  deploymentStatus: DeploymentStatus | null = null;
  deploymentResult: DeploymentStatus | null = null;
  deploymentError = '';
  updateInProgress = false;
  private updatePollTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly updateJobKey = 'mrm-deployment-update-job';
  private readonly updateReloadKey = 'mrm-deployment-update-reloaded';

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.currentUserId = this.auth.currentProfile?.id || null;
    this.canManageServer = ['owner', 'admin'].includes(this.auth.currentProfile?.role || '');
    void this.resumeDeploymentUpdate();
    await this.loadUsers();
  }

  ngOnDestroy() {
    if (this.updatePollTimer) clearTimeout(this.updatePollTimer);
  }

  async startDeploymentUpdate() {
    if (this.updateInProgress || !confirm('Pull the latest Git changes and rebuild the server now? The app will briefly restart.')) return;
    this.deploymentError = '';
    this.updateInProgress = true;
    try {
      const headers = await this.getAuthHeaders();
      const status = await firstValueFrom(this.http.post<DeploymentStatus>(`${this.apiUrl}/deployment/update`, {}, { headers }));
      this.deploymentStatus = status;
      sessionStorage.setItem(this.updateJobKey, status.job_id);
      sessionStorage.removeItem(this.updateReloadKey);
      this.scheduleStatusPoll(status.job_id, 700);
    } catch (err: any) {
      this.updateInProgress = false;
      this.deploymentError = err?.error?.detail || 'Could not start the server update.';
      this.cdr.detectChanges();
    }
  }

  private async resumeDeploymentUpdate() {
    const jobId = sessionStorage.getItem(this.updateJobKey);
    if (!jobId) return;
    this.updateInProgress = true;
    await this.pollDeploymentStatus(jobId);
  }

  private scheduleStatusPoll(jobId: string, delay = 1800) {
    if (this.updatePollTimer) clearTimeout(this.updatePollTimer);
    this.updatePollTimer = setTimeout(() => void this.pollDeploymentStatus(jobId), delay);
  }

  private async pollDeploymentStatus(jobId: string) {
    try {
      const headers = await this.getAuthHeaders();
      const status = await firstValueFrom(this.http.get<DeploymentStatus>(`${this.apiUrl}/deployment/update/${jobId}`, { headers }));
      this.deploymentStatus = status;
      this.cdr.detectChanges();

      if (status.state === 'success') {
        if (!sessionStorage.getItem(this.updateReloadKey)) {
          sessionStorage.setItem(this.updateReloadKey, '1');
          window.location.reload();
          return;
        }
        this.finishDeploymentUpdate(status);
        return;
      }
      if (status.state === 'failed') {
        this.finishDeploymentUpdate(status);
        return;
      }
    } catch (err: any) {
      // Network/502/503 errors are expected while Docker replaces the API.
      if (err?.status === 403 || err?.status === 404) {
        this.updateInProgress = false;
        this.deploymentError = err?.error?.detail || 'The saved update status is no longer available.';
        sessionStorage.removeItem(this.updateJobKey);
        sessionStorage.removeItem(this.updateReloadKey);
        this.cdr.detectChanges();
        return;
      }
    }
    this.scheduleStatusPoll(jobId);
  }

  private finishDeploymentUpdate(status: DeploymentStatus) {
    this.updateInProgress = false;
    this.deploymentStatus = null;
    this.deploymentResult = status;
    sessionStorage.removeItem(this.updateJobKey);
    sessionStorage.removeItem(this.updateReloadKey);
    this.cdr.detectChanges();
  }

  closeDeploymentResult() {
    this.deploymentResult = null;
  }

  shortRevision(revision: string) {
    return revision.slice(0, 8);
  }

  async loadUsers() {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      const headers = await this.getAuthHeaders();
      this.users = await firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/auth/users`, { headers }));
      this.filteredUsers = [...this.users];


    } catch (err) {
      console.error('Failed to load users', err);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  filterUsers(event: any) {
    const term = event.target.value.toLowerCase();
    this.filteredUsers = this.users.filter(u => 
      u.name?.toLowerCase().includes(term) || 
      u.email.toLowerCase().includes(term)
    );
  }

  async updateRole(user: any, newRole: string) {
    const confirmMsg = newRole === 'manager' 
      ? `Promote ${user.name || user.email} to Manager? They will be able to approve/reject lab requests.`
      : `Revoke Manager status from ${user.name || user.email}?`;
    
    if (!confirm(confirmMsg)) return;

    try {
      const headers = await this.getAuthHeaders();
      await firstValueFrom(this.http.patch(`${this.apiUrl}/auth/users/${user.uid}/role`, { role: newRole }, { headers }));
      user.role = newRole;
      this.cdr.detectChanges();
    } catch (err) {
      alert('Failed to update user role');
    }
  }



  private async getAuthHeaders(): Promise<HttpHeaders> {
    const session = await this.auth.getSession();
    return new HttpHeaders().set('Authorization', `Bearer ${session?.access_token}`);
  }
}
