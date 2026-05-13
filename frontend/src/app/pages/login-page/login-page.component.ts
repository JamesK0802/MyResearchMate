import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <div class="login-logo">⌬</div>
          <h1>Sign In</h1>
          <p>{{ step === 1 ? 'Enter your ANU ID to receive a login code.' : 'Enter the 6-digit code sent to your email.' }}</p>
        </div>

        <div class="login-body">
          <!-- Step 1: UID Input -->
          <div *ngIf="step === 1" class="step-container">
            <div class="input-group">
              <label for="uid">ANU ID</label>
              <div class="uid-input-wrapper">
                <input 
                  id="uid"
                  type="text" 
                  [(ngModel)]="uid" 
                  placeholder="e.g. u1234567" 
                  class="login-input uid-field"
                  (keyup.enter)="requestOtp()"
                  [disabled]="isProcessing"
                />
                <span class="email-suffix">@anu.edu.au</span>
              </div>
            </div>

            <button 
              (click)="requestOtp()" 
              [disabled]="isProcessing || !uid" 
              class="btn-primary-login"
            >
              {{ isProcessing ? 'Sending Code...' : 'Send Login Code' }}
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
                (keyup.enter)="verifyCode()"
                [disabled]="isProcessing"
                autocomplete="one-time-code"
              />
              <p class="resend-text">Didn't receive a code? <button (click)="step = 1" class="btn-text">Try again</button></p>
            </div>

            <button 
              (click)="verifyCode()" 
              [disabled]="isProcessing || otpCode.length !== 6" 
              class="btn-primary-login"
            >
              {{ isProcessing ? 'Verifying...' : 'Sign In' }}
            </button>
          </div>

          <div *ngIf="message" class="login-status" [class.success]="isSuccess">
            {{ message }}
            <div *ngIf="userNotRegistered" class="mt-4">
              <button (click)="redirectToRegister()" class="btn-primary-login signup-btn">Go to Registration</button>
            </div>
          </div>

          <div class="login-footer">
            <p>Protected by <strong>Supabase Auth</strong></p>
            <a routerLink="/" class="back-link">← Back to Home</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-container { display: flex; justify-content: center; align-items: center; min-height: 80vh; padding: var(--space-6); }
    .login-card { width: 100%; max-width: 440px; background: var(--color-surface); padding: var(--space-12); border-radius: var(--radius-2xl); box-shadow: var(--shadow-xl); border: 1px solid var(--color-border-light); }
    .login-header { text-align: center; margin-bottom: var(--space-8); }
    .login-logo { font-size: 3.5rem; margin-bottom: var(--space-4); color: var(--color-primary); font-weight: var(--fw-black); }
    .login-header h1 { font-size: var(--text-2xl); font-weight: var(--fw-black); color: var(--color-text-primary); margin-bottom: var(--space-2); letter-spacing: -0.025em; }
    .login-header p { color: var(--color-text-secondary); font-size: var(--text-base); line-height: var(--lh-normal); }
    
    .input-group { margin-bottom: var(--space-6); }
    .input-group label { display: block; font-size: var(--text-xs); font-weight: var(--fw-black); color: var(--color-text-tertiary); margin-bottom: var(--space-2); text-transform: uppercase; letter-spacing: 0.05em; }
    
    .uid-input-wrapper { display: flex; align-items: center; background: var(--color-surface); border: 1.5px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; transition: var(--transition-fast); }
    .uid-input-wrapper:focus-within { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(22,101,52,0.08); }
    .uid-field { flex: 1; border: none !important; box-shadow: none !important; padding: 14px 16px; font-size: var(--text-md); font-family: var(--font-sans); color: var(--color-text-body); outline: none; background: transparent; }
    .email-suffix { padding: 0 16px; color: var(--color-text-tertiary); font-weight: var(--fw-bold); font-size: var(--text-sm); background: var(--color-surface-alt); height: 52px; display: flex; align-items: center; border-left: 1.5px solid var(--color-border); }
    
    .otp-field { width: 100%; text-align: center; font-size: 2.5rem; letter-spacing: 0.8rem; font-weight: var(--fw-black); padding: var(--space-4); border-radius: var(--radius-lg); border: 1.5px solid var(--color-border); color: var(--color-primary); font-family: var(--font-sans); }
    .otp-field::placeholder { letter-spacing: 0; font-size: 1.2rem; font-weight: var(--fw-normal); color: var(--color-text-tertiary); }
    
    .btn-primary-login { width: 100%; padding: 16px; background: var(--color-primary); color: white; border: none; border-radius: var(--radius-lg); font-size: var(--text-base); font-weight: var(--fw-black); cursor: pointer; transition: var(--transition-fast); margin-bottom: var(--space-6); box-shadow: var(--shadow-md); }
    .btn-primary-login:hover:not(:disabled) { background: var(--color-primary-hover); transform: translateY(-1px); box-shadow: var(--shadow-lg); }
    .btn-primary-login:disabled { opacity: 0.6; cursor: not-allowed; box-shadow: none; }
    
    .login-status { padding: var(--space-4); border-radius: var(--radius-md); font-size: var(--text-sm); text-align: center; margin-bottom: var(--space-6); background: var(--color-error-bg); color: var(--color-error); border: 1px solid var(--color-error-border); font-weight: var(--fw-semi); }
    .login-status.success { background: var(--color-primary-light); color: var(--color-primary); border: 1px solid var(--color-primary-border); }
    
    .login-footer { text-align: center; padding-top: var(--space-6); border-top: 1px solid var(--color-border-light); }
    .login-footer p { font-size: var(--text-xs); color: var(--color-text-tertiary); margin-bottom: var(--space-4); font-weight: var(--fw-semi); }
    .back-link { font-size: var(--text-sm); color: var(--color-text-secondary); text-decoration: none; font-weight: var(--fw-bold); transition: var(--transition-fast); }
    .back-link:hover { color: var(--color-primary); }
    
    .text-center { text-align: center; }
    .resend-text { margin-top: var(--space-4); font-size: var(--text-sm); color: var(--color-text-tertiary); }
    .btn-text { background: none; border: none; color: var(--color-primary); font-weight: var(--fw-black); cursor: pointer; padding: 0; text-decoration: underline; }
    .mt-4 { margin-top: 1rem; }
    .signup-btn { margin-bottom: 0; background: var(--color-surface-alt); color: var(--color-text-primary); border: 1.5px solid var(--color-border); }
    .signup-btn:hover { background: var(--color-border-light); }
  `]
})
export class LoginPageComponent {
  uid: string = '';
  otpCode: string = '';
  step: 1 | 2 = 1;
  isProcessing: boolean = false;
  message: string = '';
  isSuccess: boolean = false;
  userNotRegistered: boolean = false;

  constructor(
    private auth: AuthService, 
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  private get fullEmail(): string {
    let cleanUid = this.uid.trim().toLowerCase();
    
    // Remove 'u' prefix if it exists to check the digits
    if (cleanUid.startsWith('u')) {
      cleanUid = cleanUid.substring(1);
    }
    
    // Standardize to uXXXXXXX@anu.edu.au
    return `u${cleanUid}@anu.edu.au`;
  }

  private isValidUid(uid: string): boolean {
    const clean = uid.trim().toLowerCase();
    // Match 'u' followed by 7 digits OR just 7 digits
    const uidRegex = /^(u?\d{7})$/i;
    return uidRegex.test(clean);
  }

  async requestOtp() {
    if (!this.uid) return;

    if (!this.isValidUid(this.uid)) {
      this.isSuccess = false;
      this.message = '❌ Invalid ANU ID. Please enter 7 digits (e.g. u1234567).';
      return;
    }

    this.isProcessing = true;
    this.message = '';
    const email = this.fullEmail;
    
    console.log('[Login] Requesting OTP code for:', email);
    this.cdr.detectChanges();
    
    try {
      // 1. Check if user exists in our database first
      const exists = await this.auth.checkUserExists(email);
      
      if (!exists) {
        this.isSuccess = false;
        this.message = '❌ This email is not registered yet. Please sign up first.';
        this.isProcessing = false;
        this.userNotRegistered = true;
        this.cdr.detectChanges();
        return;
      }

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timed out. Please check your internet connection.')), 15000)
      );

      // 2. If exists, send OTP
      await Promise.race([
        this.auth.sendOtpCode(email),
        timeoutPromise
      ]);

      console.log('[Login] OTP code requested successfully');
      this.isSuccess = true;
      this.message = '✅ Code sent! Check your ANU email.';
      this.step = 2; 
      this.isProcessing = false;
      this.cdr.detectChanges();
    } catch (err: any) {
      console.error('[Login] Request failed:', err);
      this.isSuccess = false;
      this.message = err.message || 'Failed to send verification code. Please try again.';
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  redirectToRegister() {
    this.router.navigate(['/register'], { queryParams: { email: this.fullEmail } });
  }

  async verifyCode() {
    if (this.otpCode.length !== 6) return;

    this.isProcessing = true;
    this.message = '';
    this.cdr.detectChanges();

    try {
      // Verify the code
      await this.auth.verifyOtp(this.fullEmail, this.otpCode);
      
      // After OTP success, we must ensure profile is complete
      const profile = await this.auth.getUserProfile();
      if (!profile) {
        // This shouldn't happen if checkUserExists was true, but safety first
        this.router.navigate(['/register'], { queryParams: { email: this.fullEmail } });
        return;
      }

      this.isSuccess = true;
      this.message = '✅ Successfully signed in! Redirecting...';
      this.cdr.detectChanges();

      // Small delay to show success message then navigate
      setTimeout(() => {
        this.router.navigate(['/']);
      }, 1200);
    } catch (err: any) {
      console.error('[Login] Verification failed:', err);
      this.isSuccess = false;
      this.message = '❌ Invalid or expired code. Please try again.';
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }
}
