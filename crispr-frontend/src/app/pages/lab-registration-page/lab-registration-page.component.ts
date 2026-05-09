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
        <p>Request a dedicated workspace for your research team to share CRISPR results.</p>
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
                <span>👥 {{ req.members_json.length + 1 }} people</span>
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
    .lab-reg-container { padding: 40px; max-width: 1000px; margin: 0 auto; }
    .page-header { margin-bottom: 40px; }
    .page-header h1 { font-size: 2.5rem; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
    .page-header p { color: #64748b; font-size: 1.1rem; }

    .reg-layout { display: grid; grid-template-columns: 1fr 320px; gap: 40px; }
    
    .form-card { background: white; border-radius: 20px; padding: 40px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
    .form-section { margin-bottom: 40px; }
    .form-section h3 { font-size: 1.25rem; font-weight: 700; color: #1e293b; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; }
    .step-num { background: #166534; color: white; width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; }
    
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    
    .input-group { margin-bottom: 20px; }
    .input-group label { display: block; font-size: 0.9rem; font-weight: 600; color: #64748b; margin-bottom: 8px; }
    .input-group input, .input-group textarea { width: 100%; padding: 12px 16px; border: 1.5px solid #e2e8f0; border-radius: 10px; font-size: 1rem; transition: border-color 0.2s; font-family: inherit; }
    .input-group input:focus, .input-group textarea:focus { border-color: #166534; outline: none; }
    .input-group textarea { resize: vertical; }
    .readonly-input { background: #f8fafc !important; color: #1e293b !important; font-weight: 600; cursor: default; border-color: #e2e8f0 !important; }
    .readonly-input-small { background: #f1f5f9 !important; border-color: #e2e8f0 !important; font-size: 0.9rem; }
    
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    
    .member-row { display: grid; grid-template-columns: 1fr 40px; gap: 15px; margin-bottom: 15px; align-items: flex-end; background: #f8fafc; padding: 15px; border-radius: 12px; }
    .m-input label { display: block; font-size: 0.75rem; font-weight: 700; color: #94a3b8; margin-bottom: 5px; text-transform: uppercase; }
    .m-input input { width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.95rem; }
    .btn-remove { background: #fee2e2; color: #ef4444; border: none; border-radius: 8px; cursor: pointer; font-size: 1.2rem; width: 40px; height: 40px; }
    .btn-add-member { background: #f1f5f9; color: #475569; border: none; border-radius: 8px; padding: 8px 16px; font-weight: 600; cursor: pointer; }
    .btn-add-member:hover { background: #e2e8f0; }
    
    .no-members { text-align: center; color: #94a3b8; padding: 20px; border: 1px dashed #cbd5e1; border-radius: 12px; }
    
    .form-actions { border-top: 1px solid #f1f5f9; padding-top: 30px; }
    .btn-submit { width: 100%; padding: 16px; background: #166534; color: white; border: none; border-radius: 12px; font-size: 1.1rem; font-weight: 700; cursor: pointer; transition: background 0.2s; }
    .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-submit:hover:not(:disabled) { background: #14532d; }

    .status-sidebar h3 { font-size: 1.1rem; margin-bottom: 20px; color: #1e293b; }
    .request-card { background: white; border-radius: 12px; padding: 16px; margin-bottom: 16px; border-left: 4px solid #94a3b8; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .request-card.approved { border-left-color: #22c55e; }
    .request-card.rejected { border-left-color: #ef4444; }
    .request-card.pending { border-left-color: #eab308; }
    
    .req-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .req-name { font-weight: 700; color: #1e293b; }
    .status-badge { font-size: 0.7rem; font-weight: 800; padding: 4px 8px; border-radius: 4px; background: #f1f5f9; }
    .pending .status-badge { background: #fef9c3; color: #854d0e; }
    .approved .status-badge { background: #dcfce7; color: #166534; }
    .rejected .status-badge { background: #fee2e2; color: #991b1b; }
    
    .req-details { display: flex; gap: 12px; font-size: 0.8rem; color: #64748b; }

    .sidebar-section { margin-bottom: 30px; }
    .history-section { border-top: 1px solid #e2e8f0; padding-top: 20px; }
    .btn-toggle-history { width: 100%; padding: 10px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; color: #64748b; font-size: 0.85rem; font-weight: 600; cursor: pointer; margin-bottom: 15px; }
    .btn-toggle-history:hover { background: #e2e8f0; }
    .history-list { display: flex; flex-direction: column; gap: 12px; }
    .history-list .request-card { padding: 12px; opacity: 0.8; }
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
