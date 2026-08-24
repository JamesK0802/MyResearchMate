import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { firstValueFrom } from 'rxjs';

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
  `,
  styles: [`
    .manager-container { padding: 40px; max-width: 1200px; margin: 0 auto; }
    .page-header { margin-bottom: 40px; }
    .page-header h1 { font-size: 2.5rem; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
    .page-header p { color: #64748b; font-size: 1.1rem; }

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
  `]
})
export class ManagerManagementComponent implements OnInit {
  users: any[] = [];
  filteredUsers: any[] = [];
  loading = true;
  currentUserId: number | null = null;
  private apiUrl = '/api'; // Use relative proxy URL matching other calls

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.currentUserId = this.auth.currentProfile?.id || null;
    await this.loadUsers();
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
