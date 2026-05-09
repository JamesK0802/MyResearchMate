/**
 * ProfilePageComponent — User profile page.
 * Displays user info, role, and allows name editing.
 */
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, UserProfile } from '../../services/auth.service';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="profile-page">
      <div class="profile-container">
        <div class="profile-header">
          <div class="avatar">
            <span class="avatar-letter">{{ getInitial() }}</span>
          </div>
          <h1>My Profile</h1>
          <span class="role-badge" [class]="'role-' + (profile?.role || 'user')">
            {{ profile?.role | uppercase }}
          </span>
        </div>

        <div class="profile-card" *ngIf="profile">
          <div class="info-section">
            <div class="info-row">
              <label>ANU UID</label>
              <span class="info-value">{{ profile.uid }}</span>
            </div>

            <div class="info-row">
              <label>Email</label>
              <span class="info-value">{{ profile.email }}</span>
            </div>

            <div class="info-row">
              <label>Display Name</label>
              <div class="editable-field" *ngIf="!editing">
                <span class="info-value">{{ profile.name }}</span>
                <button class="btn-edit" (click)="startEdit()">✏️ Edit</button>
              </div>
              <div class="edit-field" *ngIf="editing">
                <input
                  [(ngModel)]="editName"
                  type="text"
                  placeholder="Enter display name"
                  class="name-input"
                  (keyup.enter)="saveProfile()"
                />
              </div>
            </div>

            <div class="info-row">
              <label>Bio / Introduction</label>
              <div class="editable-field" *ngIf="!editing">
                <span class="info-value bio-text">{{ profile.bio || 'No bio provided.' }}</span>
              </div>
              <div class="edit-field" *ngIf="editing">
                <textarea
                  [(ngModel)]="editBio"
                  placeholder="Enter bio"
                  class="name-input textarea-field"
                ></textarea>
                <div class="edit-actions">
                  <button class="btn-save" (click)="saveProfile()" [disabled]="saving">
                    {{ saving ? 'Saving...' : 'Save All' }}
                  </button>
                  <button class="btn-cancel" (click)="cancelEdit()">Cancel</button>
                </div>
              </div>
            </div>

            <div class="info-row">
              <label>Role</label>
              <span class="info-value">{{ profile.role }}</span>
            </div>

            <div class="info-row">
              <label>Member Since</label>
              <span class="info-value">{{ formatDate(profile.created_at) }}</span>
            </div>

            <div class="info-row">
              <label>Last Login</label>
              <span class="info-value">{{ formatDate(profile.last_login) }}</span>
            </div>
          </div>
        </div>

        <div class="profile-actions">
          <button class="btn-logout" (click)="logout()">
            🚪 Sign Out
          </button>
        </div>

        <p *ngIf="message" class="message" [class.error]="isError">{{ message }}</p>
      </div>
    </div>
  `,
  styles: [`
    .profile-page {
      padding: 40px 24px 80px;
      display: flex;
      justify-content: center;
    }
    .profile-container {
      max-width: 560px;
      width: 100%;
    }
    .profile-header {
      text-align: center;
      margin-bottom: 32px;
    }
    .avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, #22c55e, #166534);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      box-shadow: 0 4px 16px rgba(22, 101, 52, 0.3);
    }
    .avatar-letter {
      font-size: 2rem;
      font-weight: 800;
      color: white;
      text-transform: uppercase;
    }
    .profile-header h1 {
      font-size: 1.6rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 8px;
    }
    .role-badge {
      display: inline-block;
      padding: 4px 14px;
      border-radius: 20px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .role-owner {
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fbbf24;
    }
    .role-admin {
      background: #dbeafe;
      color: #1e40af;
      border: 1px solid #60a5fa;
    }
    .role-user {
      background: #ecfdf5;
      color: #166534;
      border: 1px solid #86efac;
    }
    .profile-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .info-row {
      padding: 16px 0;
      border-bottom: 1px solid #f1f5f9;
    }
    .info-row:last-child { border-bottom: none; }
    .info-row label {
      display: block;
      font-size: 0.75rem;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 6px;
    }
    .info-value {
      font-size: 0.95rem;
      font-weight: 500;
      color: #1e293b;
    }
    .editable-field {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .btn-edit {
      background: none;
      border: 1px solid #d1d5db;
      color: #64748b;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.78rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-edit:hover {
      border-color: #22c55e;
      color: #166534;
    }
    .edit-field {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .name-input {
      padding: 10px 14px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.15s;
    }
    .name-input:focus {
      border-color: #22c55e;
      box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
    }
    .textarea-field { min-height: 80px; resize: vertical; width: 100%; font-family: inherit; }
    .bio-text { color: #64748b; font-style: italic; white-space: pre-wrap; }
    .edit-actions {
      display: flex;
      gap: 8px;
    }
    .btn-save {
      padding: 8px 18px;
      background: #166534;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-save:hover { background: #14532d; }
    .btn-save:disabled { background: #94a3b8; cursor: not-allowed; }
    .btn-cancel {
      padding: 8px 18px;
      background: white;
      color: #64748b;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-cancel:hover { border-color: #94a3b8; }
    .profile-actions {
      margin-top: 24px;
      text-align: center;
    }
    .btn-logout {
      padding: 10px 28px;
      background: white;
      color: #ef4444;
      border: 1px solid #fca5a5;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.88rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-logout:hover {
      background: #fef2f2;
      border-color: #ef4444;
    }
    .message {
      text-align: center;
      margin-top: 16px;
      font-size: 0.85rem;
      color: #166534;
      font-weight: 500;
    }
    .message.error {
      color: #ef4444;
    }
  `]
})
export class ProfilePageComponent implements OnInit {
  profile: UserProfile | null = null;
  editing = false;
  editName = '';
  editBio = '';
  saving = false;
  message = '';
  isError = false;

  constructor(
    private auth: AuthService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.auth.profile$.subscribe(p => {
      this.profile = p;
      if (p) {
        this.editName = p.name;
        this.editBio = p.bio || '';
      }
    });
  }

  getInitial(): string {
    return this.profile?.name?.charAt(0) || this.profile?.email?.charAt(0) || '?';
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  startEdit() {
    this.editName = this.profile?.name || '';
    this.editBio = this.profile?.bio || '';
    this.editing = true;
  }

  async saveProfile() {
    if (!this.editName.trim()) return;
    this.saving = true;
    this.message = '';
    try {
      // Update name if changed
      if (this.editName.trim() !== this.profile?.name) {
        await this.auth.updateName(this.editName.trim());
      }
      // Update bio (using generic update logic if available, or just updateName if that's all we have)
      // Since we added update_user_bio to backend, we should use it.
      // For now, let's assume updateProfile handles both or we call separate.
      await this.auth.updateProfile({ name: this.editName.trim(), bio: this.editBio.trim() });
      
      this.editing = false;
      this.message = 'Profile updated successfully.';
      this.isError = false;
    } catch {
      this.message = 'Failed to update profile.';
      this.isError = true;
    } finally {
      this.saving = false;
    }
  }

  cancelEdit() {
    this.editName = this.profile?.name || '';
    this.editing = false;
  }

  async logout() {
    await this.auth.signOut();
    this.router.navigate(['/']);
  }
}
