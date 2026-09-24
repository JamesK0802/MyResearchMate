import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { LabService, LabRegistrationRequest } from '../../services/lab.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-lab-registration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="lab-reg-container">
      <div class="page-header">
        <h1>Lab Workspace Registration</h1>
      </div>

      <div class="reg-layout">
        <!-- Registration Form -->
        <div class="form-card">
          <form [formGroup]="labForm" (ngSubmit)="onSubmit()">
            <div class="form-section">
              <h3><span class="step-num">1</span> Lab Information</h3>
              <div class="input-group">
                <label>Lab Name</label>
                <input type="text" formControlName="lab_name" placeholder="e.g. Min's CRISPR Lab">
              </div>
              <div class="input-group">
                <label>One-line Introduction</label>
                <input type="text" formControlName="lab_tagline" placeholder="Briefly describe your lab's focus">
              </div>
              <div class="input-group">
                <label>Description</label>
                <textarea formControlName="lab_description" placeholder="Tell us more about your research goals and team..." rows="4"></textarea>
              </div>
            </div>

            <div class="form-section">
              <h3><span class="step-num">2</span> Lab Leader Details</h3>
              <div class="grid-2">
                <div class="input-group">
                  <label>Leader UID (Requester)</label>
                  <input type="text" formControlName="lab_leader_uid" readonly class="readonly-input">
                </div>
                <div class="input-group">
                  <label>Leader Name</label>
                  <input type="text" formControlName="lab_leader_name" readonly class="readonly-input">
                </div>
              </div>
              <div class="derived-info">
                Leader Email: <strong>{{ labForm.get('lab_leader_email')?.value }}</strong> (Verified)
              </div>
            </div>

            <div class="form-section">
              <div class="section-header">
                <h3><span class="step-num">3</span> Team Members</h3>
                <button type="button" (click)="addMember()" class="btn-add-member">+ Add Member</button>
              </div>
              
              <div formArrayName="members" class="members-list">
                <div *ngFor="let m of memberControls; let i = index" [formGroupName]="i" class="member-row">
                  <div class="m-input">
                    <label>UID</label>
                    <input type="text" formControlName="uid" placeholder="u1234567" (change)="onMemberUidChange(i)">
                  </div>
                  <button type="button" (click)="removeMember(i)" class="btn-remove">×</button>
                </div>
                <div *ngIf="memberControls.length === 0" class="no-members">
                  No additional members added yet.
                </div>
              </div>
            </div>

            <div class="form-actions">
              <button type="submit" [disabled]="labForm.invalid || submitting" class="btn-submit">
                {{ submitting ? 'Submitting...' : 'Submit Lab Request' }}
              </button>
            </div>
          </form>
        </div>

        <!-- My Requests Sidebar -->
        <div class="status-sidebar">
          <div class="sidebar-section">
            <h3>Active Requests</h3>
            <div *ngIf="pendingRequests.length === 0" class="empty-requests">
              No pending requests.
            </div>
            <div *ngFor="let req of pendingRequests" class="request-card pending">
              <div class="req-header">
                <span class="req-name">{{ req.lab_name }}</span>
                <span class="status-badge">PENDING</span>
              </div>
              <div class="req-details">
                <span>📅 {{ req.created_at | date:'shortDate' }}</span>
                <span>👥 {{ (req.members_json?.length || 0) + 1 }} people</span>
              </div>
            </div>
          </div>

          <div class="sidebar-section history-section">
            <button class="btn-toggle-history" (click)="showHistory = !showHistory">
              {{ showHistory ? 'Hide History' : 'Show Request History (' + historyRequests.length + ')' }}
            </button>
            
            <div *ngIf="showHistory" class="history-list">
              <div *ngFor="let req of historyRequests" class="request-card" [class]="req.status">
                <div class="req-header">
                  <span class="req-name">{{ req.lab_name }}</span>
                  <span class="status-badge">{{ req.status | uppercase }}</span>
                </div>
                <div class="req-details">
                  <span>📅 {{ req.created_at | date:'shortDate' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .lab-reg-container { padding: var(--space-10); max-width: var(--page-max-width); margin: 0 auto; }
    .page-header { margin-bottom: var(--space-10); }
    .page-header h1 { font-size: var(--text-3xl); font-weight: var(--fw-black); color: var(--color-text-primary); margin-bottom: var(--space-2); letter-spacing: -0.025em; }

    .reg-layout { display: grid; grid-template-columns: 1fr 340px; gap: var(--space-10); align-items: flex-start; }
    
    .form-card { background: var(--color-surface); border-radius: var(--radius-2xl); padding: var(--space-10); box-shadow: var(--shadow-sm); border: 1px solid var(--color-border-light); }
    .form-section { margin-bottom: var(--space-10); }
    .form-section h3 { font-size: var(--text-lg); font-weight: var(--fw-black); color: var(--color-text-primary); margin-bottom: var(--space-6); display: flex; align-items: center; gap: var(--space-3); }
    .step-num { background: var(--color-primary); color: white; width: 24px; height: 24px; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-size: var(--text-xs); font-weight: var(--fw-black); }
    
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-6); }
    
    .input-group { margin-bottom: var(--space-5); }
    .input-group label { display: block; font-size: var(--text-sm); font-weight: var(--fw-semi); color: var(--color-text-secondary); margin-bottom: var(--space-2); }
    .input-group input, .input-group textarea { width: 100%; padding: 12px 16px; border: 1.5px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--text-base); font-family: var(--font-sans); color: var(--color-text-body); transition: var(--transition-fast); background: var(--color-surface); outline: none; }
    .input-group input:focus, .input-group textarea:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(22,101,52,0.08); }
    .input-group textarea { resize: vertical; min-height: 100px; }
    .readonly-input { background: var(--color-surface-alt) !important; color: var(--color-text-secondary) !important; font-weight: var(--fw-semi); cursor: default; border-color: var(--color-border) !important; }
    
    .derived-info { font-size: var(--text-sm); color: var(--color-text-tertiary); background: var(--color-surface-alt); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); margin-top: var(--space-2); border-left: 3px solid var(--color-primary); }

    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-5); }
    
    .member-row { display: grid; grid-template-columns: 1fr 48px; gap: var(--space-4); margin-bottom: var(--space-3); align-items: flex-end; background: var(--color-surface-alt); padding: var(--space-4); border-radius: var(--radius-lg); border: 1px solid var(--color-border-light); }
    .m-input label { display: block; font-size: 0.7rem; font-weight: var(--fw-black); color: var(--color-text-tertiary); margin-bottom: var(--space-1); text-transform: uppercase; letter-spacing: 0.05em; }
    .m-input input { width: 100%; padding: 10px; border: 1.5px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--text-base); }
    .btn-remove { background: var(--color-error-bg); color: var(--color-error); border: 1px solid var(--color-error-border); border-radius: var(--radius-md); cursor: pointer; font-size: 1.5rem; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; transition: var(--transition-fast); }
    .btn-remove:hover { background: var(--color-error); color: white; }
    .btn-add-member { background: var(--color-surface-alt); color: var(--color-text-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 8px 16px; font-weight: var(--fw-bold); font-size: var(--text-sm); cursor: pointer; transition: var(--transition-fast); }
    .btn-add-member:hover { background: var(--color-border-light); border-color: var(--color-text-tertiary); }
    
    .no-members { text-align: center; color: var(--color-text-tertiary); padding: var(--space-8); border: 1.5px dashed var(--color-border); border-radius: var(--radius-lg); font-size: var(--text-sm); }
    
    .form-actions { border-top: 1px solid var(--color-border-light); padding-top: var(--space-8); margin-top: var(--space-4); }
    .btn-submit { width: 100%; padding: 16px; background: var(--color-primary); color: white; border: none; border-radius: var(--radius-lg); font-size: var(--text-lg); font-weight: var(--fw-black); cursor: pointer; transition: var(--transition-fast); box-shadow: var(--shadow-md); }
    .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
    .btn-submit:hover:not(:disabled) { background: var(--color-primary-hover); transform: translateY(-1px); box-shadow: var(--shadow-lg); }

    .status-sidebar { position: sticky; top: var(--space-6); }
    .status-sidebar h3 { font-size: var(--text-base); font-weight: var(--fw-black); color: var(--color-text-primary); margin-bottom: var(--space-5); text-transform: uppercase; letter-spacing: 0.05em; }
    .request-card { background: var(--color-surface); border-radius: var(--radius-xl); padding: var(--space-5); margin-bottom: var(--space-4); border: 1px solid var(--color-border-light); border-left: 4px solid var(--color-text-tertiary); box-shadow: var(--shadow-xs); transition: var(--transition-fast); }
    .request-card:hover { transform: translateX(4px); box-shadow: var(--shadow-sm); }
    .request-card.approved { border-left-color: var(--color-primary); }
    .request-card.rejected { border-left-color: var(--color-error); }
    .request-card.pending { border-left-color: var(--color-warning); }
    
    .req-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2); }
    .req-name { font-weight: var(--fw-bold); color: var(--color-text-primary); font-size: var(--text-base); }
    .status-badge { font-size: 0.65rem; font-weight: var(--fw-black); padding: 3px 8px; border-radius: var(--radius-sm); text-transform: uppercase; }
    .pending .status-badge { background: #fef9c3; color: #854d0e; }
    .approved .status-badge { background: var(--color-primary-subtle); color: var(--color-primary); }
    .rejected .status-badge { background: var(--color-error-bg); color: var(--color-error); }
    
    .req-details { display: flex; gap: var(--space-4); font-size: var(--text-xs); color: var(--color-text-tertiary); font-weight: var(--fw-semi); }

    .sidebar-section { margin-bottom: var(--space-8); }
    .history-section { border-top: 1px solid var(--color-border-light); padding-top: var(--space-6); }
    .btn-toggle-history { width: 100%; padding: 10px; background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-secondary); font-size: var(--text-sm); font-weight: var(--fw-bold); cursor: pointer; margin-bottom: var(--space-5); transition: var(--transition-fast); }
    .btn-toggle-history:hover { background: var(--color-border-light); }
    .history-list { display: flex; flex-direction: column; gap: var(--space-3); animation: slideDown 0.3s cubic-bezier(0.16,1,0.3,1); }
    .history-list .request-card { padding: var(--space-4); opacity: 0.85; border-radius: var(--radius-lg); }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

    @media (max-width: 768px) {
      .lab-reg-container { padding: 28px 20px; }
      .page-header { margin-bottom: var(--space-8); }
      .page-header h1 { font-size: 2.35rem; line-height: 1.08; }

      .reg-layout {
        grid-template-columns: 1fr;
        gap: var(--space-8);
      }

      .form-card {
        border-radius: 18px;
        padding: 28px 22px;
      }

      .grid-2 {
        grid-template-columns: 1fr;
        gap: var(--space-4);
      }

      .section-header {
        align-items: flex-start;
        flex-direction: column;
        gap: var(--space-3);
      }

      .btn-add-member {
        width: 100%;
      }

      .status-sidebar {
        position: static;
      }

      .status-sidebar h3 {
        margin-bottom: var(--space-4);
      }

      .history-section {
        margin-bottom: 0;
      }
    }
  `]
})
export class LabRegistrationPageComponent implements OnInit {
  labForm!: FormGroup;
  myRequests: LabRegistrationRequest[] = [];
  submitting = false;
  showHistory = false;

  get pendingRequests() {
    return this.myRequests.filter(r => r.status === 'pending');
  }

  get historyRequests() {
    return this.myRequests.filter(r => r.status !== 'pending');
  }

  constructor(
    private fb: FormBuilder,
    private labService: LabService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.loadMyRequests();
  }

  private initForm() {
    const profile = this.auth.currentProfile;
    const userUid = profile?.uid || profile?.email?.split('@')[0] || '';
                    
    this.labForm = this.fb.group({
      lab_name: ['', Validators.required],
      lab_tagline: [''],
      lab_description: [''],
      lab_leader_name: [profile?.name || ''], 
      lab_leader_uid: [userUid, Validators.required],
      lab_leader_email: [profile?.email || '', [Validators.required, Validators.email]],
      members: this.fb.array([])
    });
  }

  get memberControls() {
    return (this.labForm.get('members') as FormArray).controls;
  }

  onLeaderUidChange() {
    const uid = this.labForm.get('lab_leader_uid')?.value || '';
    if (uid) {
      this.labForm.patchValue({ lab_leader_email: `${uid}@anu.edu.au` });
    }
  }

  async onMemberUidChange(index: number) {
    const members = this.labForm.get('members') as FormArray;
    const m = members.at(index);
    let uid = m.get('uid')?.value || '';
    
    // Normalize UID (ensure 'u' prefix)
    if (uid && !uid.startsWith('u') && /^\d+$/.test(uid)) {
      uid = 'u' + uid;
      m.patchValue({ uid });
    }

    if (uid) {
      m.patchValue({ email: `${uid}@anu.edu.au` });
    }
  }

  addMember() {
    const members = this.labForm.get('members') as FormArray;
    members.push(this.fb.group({
      uid: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]]
    }));
  }

  removeMember(index: number) {
    const members = this.labForm.get('members') as FormArray;
    members.removeAt(index);
  }

  async loadMyRequests() {
    try {
      const requests = await this.labService.getMyRequests();
      // Assign new array reference to trigger change detection
      this.myRequests = [...requests];
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Failed to load requests:', err);
    }
  }

  async onSubmit() {
    if (this.labForm.invalid) return;
    this.submitting = true;
    try {
      await this.labService.createLabRequest(this.labForm.value);
      alert('Lab registration request submitted successfully!');
      this.labForm.reset();
      this.initForm();
      this.loadMyRequests();
    } catch (err) {
      alert('Failed to submit request');
    } finally {
      this.submitting = false;
      this.cdr.detectChanges();
    }
  }
}
