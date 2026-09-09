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
    .login-container { display: flex; justify-content: center; align-items: center; min-height: 80vh; padding: var(--space-6); }
    .login-card { width: 100%; max-width: 480px; background: var(--color-surface); padding: var(--space-10); border-radius: var(--radius-2xl); box-shadow: var(--shadow-xl); border: 1px solid var(--color-border-light); }
    .login-header { text-align: center; margin-bottom: var(--space-8); }
    .login-logo { font-size: 3.5rem; margin-bottom: var(--space-4); color: var(--color-primary); font-weight: var(--fw-black); }
    .login-header h1 { font-size: var(--text-2xl); font-weight: var(--fw-black); color: var(--color-text-primary); margin-bottom: var(--space-2); letter-spacing: -0.025em; }
    .login-header p { color: var(--color-text-secondary); font-size: var(--text-base); }
    
    .input-group { margin-bottom: var(--space-5); }
    .input-group label { display: block; font-size: var(--text-xs); font-weight: var(--fw-black); color: var(--color-text-tertiary); margin-bottom: var(--space-2); text-transform: uppercase; letter-spacing: 0.05em; }
    
    .login-input { width: 100%; padding: 12px 16px; border: 1.5px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--text-base); font-family: var(--font-sans); color: var(--color-text-body); transition: var(--transition-fast); background: var(--color-surface); outline: none; }
    .login-input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(22,101,52,0.08); }
    
    .readonly-field { background: var(--color-surface-alt); color: var(--color-text-tertiary); cursor: not-allowed; border-color: var(--color-border-light); }
    .textarea-field { min-height: 100px; resize: vertical; }
    .required { color: var(--color-error); }
    .hint { font-size: var(--text-xs); color: var(--color-text-tertiary); margin-top: var(--space-1); display: block; font-weight: var(--fw-semi); }
    
    .otp-field { text-align: center; font-size: 2.5rem; letter-spacing: 0.8rem; font-weight: var(--fw-black); color: var(--color-primary); }
    
    .btn-primary-login { width: 100%; padding: 16px; background: var(--color-primary); color: white; border: none; border-radius: var(--radius-lg); font-size: var(--text-base); font-weight: var(--fw-black); cursor: pointer; transition: var(--transition-fast); margin-top: var(--space-4); box-shadow: var(--shadow-md); }
    .btn-primary-login:hover:not(:disabled) { background: var(--color-primary-hover); transform: translateY(-1px); box-shadow: var(--shadow-lg); }
    .btn-primary-login:disabled { opacity: 0.6; cursor: not-allowed; box-shadow: none; }
    
    .login-status { padding: var(--space-4); border-radius: var(--radius-md); font-size: var(--text-sm); text-align: center; margin-top: var(--space-5); background: var(--color-error-bg); color: var(--color-error); border: 1px solid var(--color-error-border); font-weight: var(--fw-semi); }
    .login-status.success { background: var(--color-primary-light); color: var(--color-primary); border: 1px solid var(--color-primary-border); }
    
    .login-footer { text-align: center; padding-top: var(--space-5); margin-top: var(--space-5); border-top: 1px solid var(--color-border-light); }
    .back-link { font-size: var(--text-sm); color: var(--color-text-secondary); text-decoration: none; font-weight: var(--fw-bold); transition: var(--transition-fast); }
    .back-link:hover { color: var(--color-primary); }
    
    .text-center { text-align: center; }
    .btn-text { background: none; border: none; color: var(--color-primary); font-weight: var(--fw-black); cursor: pointer; text-decoration: underline; padding: 0; }
    @media (max-width: 600px) {
      .login-container { min-height: auto; align-items: flex-start; padding: 18px 12px; }
      .login-card { padding: 22px 16px; border-radius: 15px; box-shadow: var(--shadow-md); }
      .login-header { margin-bottom: 18px; }
      .login-logo { font-size: 2rem; margin-bottom: 7px; }
      .login-header h1 { font-size: 1.45rem; }
      .login-header p { font-size: .82rem; }
      .login-footer { padding-top: 14px; margin-top: 14px; }
    }
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
