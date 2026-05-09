import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <div class="login-logo">⌬</div>
          <h1>Create Profile</h1>
          <p>{{ step === 1 ? 'Complete your information to register.' : 'Enter the 6-digit code sent to your email.' }}</p>
        </div>

        <div class="login-body">
          <!-- Step 1: Profile Info -->
          <div *ngIf="step === 1" class="step-container">
            <div class="input-group">
              <label>Email Address</label>
              <input type="text" [value]="email" readonly class="login-input readonly-field" />
            </div>

            <div class="input-group">
              <label>ANU UID</label>
              <input type="text" [value]="derivedUid" readonly class="login-input readonly-field" />
              <small class="hint">Automatically derived from your email.</small>
            </div>

            <div class="input-group">
              <label for="name">Full Name <span class="required">*</span></label>
              <input 
                id="name"
                type="text" 
                [(ngModel)]="name" 
                placeholder="Enter your full name" 
                class="login-input"
                [disabled]="isProcessing"
              />
            </div>

            <div class="input-group">
              <label for="bio">Bio / Introduction (Optional)</label>
              <textarea 
                id="bio"
                [(ngModel)]="bio" 
                placeholder="Tell us a bit about yourself..." 
                class="login-input textarea-field"
                [disabled]="isProcessing"
              ></textarea>
            </div>

            <button 
              (click)="requestOtp()" 
              [disabled]="isProcessing || !name" 
              class="btn-primary-login"
            >
              {{ isProcessing ? 'Sending Code...' : 'Verify Email & Register' }}
            </button>
          </div>

          <!-- Step 2: OTP Verification -->
          <div *ngIf="step === 2" class="step-container">
            <div class="input-group text-center">
              <label for="otp">Verification Code</label>
              <input 
                id="otp"
                type="text" 
                [(ngModel)]="otpCode" 
                placeholder="000000" 
                maxlength="6"
                class="login-input otp-field"
                (keyup.enter)="verifyAndRegister()"
                [disabled]="isProcessing"
              />
              <p class="resend-text">Didn't receive a code? <button (click)="step = 1" class="btn-text">Try again</button></p>
            </div>

            <button 
              (click)="verifyAndRegister()" 
              [disabled]="isProcessing || otpCode.length !== 6" 
              class="btn-primary-login"
            >
              {{ isProcessing ? 'Completing Registration...' : 'Verify & Finish' }}
            </button>
          </div>

          <div *ngIf="message" class="login-status" [class.success]="isSuccess">
            {{ message }}
          </div>

          <div class="login-footer">
            <a routerLink="/login" class="back-link">← Back to Login</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-container { display: flex; justify-content: center; align-items: center; min-height: calc(100vh - 150px); padding: 20px; background: #f8fafc; }
    .login-card { width: 100%; max-width: 480px; background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1); }
    .login-header { text-align: center; margin-bottom: 32px; }
    .login-logo { font-size: 3rem; margin-bottom: 12px; color: #166534; }
    .login-header h1 { font-size: 1.75rem; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
    .login-header p { color: #64748b; font-size: 0.95rem; }
    .input-group { margin-bottom: 20px; }
    .input-group label { display: block; font-size: 0.85rem; font-weight: 700; color: #334155; margin-bottom: 8px; text-transform: uppercase; }
    .login-input { width: 100%; padding: 12px 16px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 1rem; transition: all 0.2s; }
    .login-input:focus { border-color: #22c55e; box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.1); outline: none; }
    .readonly-field { background: #f1f5f9; color: #64748b; cursor: not-allowed; }
    .textarea-field { min-height: 80px; resize: vertical; }
    .required { color: #ef4444; }
    .hint { font-size: 0.75rem; color: #94a3b8; margin-top: 4px; display: block; }
    .otp-field { text-align: center; font-size: 2rem; letter-spacing: 0.5rem; font-weight: 800; }
    .btn-primary-login { width: 100%; padding: 14px; background: #166534; color: white; border: none; border-radius: 10px; font-size: 1rem; font-weight: 700; cursor: pointer; transition: all 0.2s; margin-top: 10px; }
    .btn-primary-login:hover:not(:disabled) { background: #14532d; }
    .btn-primary-login:disabled { opacity: 0.7; cursor: not-allowed; }
    .login-status { padding: 12px; border-radius: 8px; font-size: 0.9rem; text-align: center; margin-top: 20px; background: #fef2f2; color: #991b1b; }
    .login-status.success { background: #f0fdf4; color: #166534; }
    .login-footer { text-align: center; padding-top: 20px; margin-top: 20px; border-top: 1px solid #f1f5f9; }
    .back-link { font-size: 0.9rem; color: #64748b; text-decoration: none; }
    .text-center { text-align: center; }
    .btn-text { background: none; border: none; color: #166534; font-weight: 700; cursor: pointer; text-decoration: underline; padding: 0; }
  `]
})
export class RegisterPageComponent implements OnInit {
  email: string = '';
  name: string = '';
  bio: string = '';
  otpCode: string = '';
  step: 1 | 2 = 1;
  isProcessing: boolean = false;
  message: string = '';
  isSuccess: boolean = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Get email from query params
    this.route.queryParams.subscribe(params => {
      this.email = params['email'] || '';
      if (!this.email) {
        this.router.navigate(['/login']);
      }
    });
  }

  get derivedUid(): string {
    if (!this.email) return '';
    return this.email.split('@')[0];
  }

  async requestOtp() {
    if (!this.name) {
      this.message = '❌ Please enter your full name.';
      return;
    }

    this.isProcessing = true;
    this.message = '';
    
    try {
      await this.auth.sendOtpCode(this.email);
      this.isSuccess = true;
      this.message = '✅ Code sent to your ANU email.';
      this.step = 2;
    } catch (err: any) {
      this.isSuccess = false;
      this.message = err.message || 'Failed to send verification code.';
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  async verifyAndRegister() {
    if (this.otpCode.length !== 6) return;

    this.isProcessing = true;
    this.message = '';

    try {
      // 1. Verify OTP with Supabase
      await this.auth.verifyOtp(this.email, this.otpCode);

      // 2. Register profile with backend
      await this.auth.registerProfile({
        email: this.email,
        name: this.name,
        bio: this.bio
      });

      this.isSuccess = true;
      this.message = '✅ Registration complete! Welcome.';
      this.cdr.detectChanges();

      // 3. Small delay then redirect
      setTimeout(() => {
        this.router.navigate(['/']);
      }, 1500);
    } catch (err: any) {
      console.error('Registration failed:', err);
      this.isSuccess = false;
      
      // Extract specific error message if available
      const errorDetail = err?.error?.detail || err?.message || 'Verification failed or registration error.';
      this.message = `❌ ${errorDetail}`;
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }
}
