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
    .profile-page { padding: var(--space-10) var(--space-6); display: flex; justify-content: center; }
    .profile-container { max-width: 600px; width: 100%; }
    .profile-header { text-align: center; margin-bottom: var(--space-8); }
    .avatar { width: 90px; height: 90px; border-radius: var(--radius-full); background: var(--color-primary-gradient); display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-4); box-shadow: var(--shadow-lg); border: 4px solid var(--color-surface); }
    .avatar-letter { font-size: 2.5rem; font-weight: var(--fw-black); color: white; text-transform: uppercase; }
    .profile-header h1 { font-size: var(--text-2xl); font-weight: var(--fw-black); color: var(--color-text-primary); margin: 0 0 var(--space-2); letter-spacing: -0.025em; }
    
    .role-badge { display: inline-block; padding: 4px 14px; border-radius: var(--radius-full); font-size: var(--text-xs); font-weight: var(--fw-black); letter-spacing: 0.05em; text-transform: uppercase; border: 1px solid transparent; }
    .role-owner { background: #fef3c7; color: #92400e; border-color: #fbbf24; }
    .role-admin { background: #dbeafe; color: #1e40af; border-color: #60a5fa; }
    .role-user { background: var(--color-primary-subtle); color: var(--color-primary); border-color: var(--color-primary-border); }

    .profile-card { background: var(--color-surface); border: 1px solid var(--color-border-light); border-radius: var(--radius-xl); padding: var(--space-8); box-shadow: var(--shadow-sm); }
    .info-row { padding: var(--space-4) 0; border-bottom: 1px solid var(--color-border-light); }
    .info-row:last-child { border-bottom: none; }
    .info-row label { display: block; font-size: var(--text-xs); font-weight: var(--fw-black); color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-2); }
    .info-value { font-size: var(--text-base); font-weight: var(--fw-semi); color: var(--color-text-body); }
    
    .editable-field { display: flex; align-items: center; gap: var(--space-3); }
    .btn-edit { background: var(--color-surface-alt); border: 1px solid var(--color-border); color: var(--color-text-secondary); padding: 4px 12px; border-radius: var(--radius-md); font-size: var(--text-xs); font-weight: var(--fw-bold); cursor: pointer; transition: var(--transition-fast); }
    .btn-edit:hover { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-surface); }
    
    .edit-field { display: flex; flex-direction: column; gap: var(--space-3); animation: fadeIn 0.2s ease-out; }
    .name-input { width: 100%; padding: 10px 14px; border: 1.5px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--text-md); font-family: var(--font-sans); color: var(--color-text-body); outline: none; transition: var(--transition-fast); }
    .name-input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(22,101,52,0.08); }
    .textarea-field { min-height: 100px; resize: vertical; }
    .bio-text { color: var(--color-text-secondary); font-style: italic; white-space: pre-wrap; line-height: var(--lh-normal); }
    
    .edit-actions { display: flex; gap: var(--space-2); margin-top: var(--space-1); }
    .btn-save { padding: 9px 18px; background: var(--color-primary); color: white; border: none; border-radius: var(--radius-md); font-weight: var(--fw-bold); font-size: var(--text-base); cursor: pointer; transition: var(--transition-fast); }
    .btn-save:hover { background: var(--color-primary-hover); }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-cancel { padding: 9px 18px; background: var(--color-surface); color: var(--color-text-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-weight: var(--fw-bold); font-size: var(--text-base); cursor: pointer; transition: var(--transition-fast); }
    .btn-cancel:hover { border-color: var(--color-text-tertiary); background: var(--color-surface-alt); }

    .profile-actions { margin-top: var(--space-8); text-align: center; }
    .btn-logout { padding: 12px 32px; background: var(--color-surface); color: var(--color-error); border: 1.5px solid var(--color-error-border); border-radius: var(--radius-lg); font-weight: var(--fw-bold); font-size: var(--text-base); cursor: pointer; transition: var(--transition-fast); display: inline-flex; align-items: center; gap: var(--space-2); }
    .btn-logout:hover { background: var(--color-error-bg); border-color: var(--color-error); }

    .message { text-align: center; margin-top: var(--space-5); font-size: var(--text-sm); color: var(--color-primary); font-weight: var(--fw-semi); padding: var(--space-3); border-radius: var(--radius-md); background: var(--color-primary-light); }
    .message.error { color: var(--color-error); background: var(--color-error-bg); }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
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
