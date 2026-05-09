import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login-page',
  // ... (rest of the component decorator remains same)
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
    .login-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: calc(100vh - 150px);
      padding: 20px;
      background: #f8fafc;
    }
    .login-card {
      width: 100%;
      max-width: 440px;
      background: white;
      padding: 48px;
      border-radius: 20px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    }
    .login-header {
      text-align: center;
      margin-bottom: 32px;
    }
    .login-logo {
      font-size: 3rem;
      margin-bottom: 12px;
      color: #166534;
    }
    .login-header h1 {
      font-size: 1.75rem;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 8px;
    }
    .login-header p {
      color: #64748b;
      font-size: 0.95rem;
      line-height: 1.5;
    }
    .input-group {
      margin-bottom: 24px;
    }
    .input-group label {
      display: block;
      font-size: 0.85rem;
      font-weight: 700;
      color: #334155;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .uid-input-wrapper {
      display: flex;
      align-items: center;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 12px;
      overflow: hidden;
      transition: all 0.2s;
    }
    .uid-input-wrapper:focus-within {
      border-color: #22c55e;
      box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.1);
    }
    .uid-field {
      flex: 1;
      border: none !important;
      box-shadow: none !important;
      padding: 14px 16px;
      font-size: 1rem;
      outline: none;
    }
    .email-suffix {
      padding: 0 16px;
      color: #94a3b8;
      font-weight: 600;
      font-size: 0.9rem;
      background: #f8fafc;
      height: 100%;
      display: flex;
      align-items: center;
      border-left: 1px solid #e2e8f0;
    }
    .otp-field {
      width: 100%;
      text-align: center;
      font-size: 2rem;
      letter-spacing: 0.5rem;
      font-weight: 800;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid #d1d5db;
    }
    .otp-field::placeholder {
      letter-spacing: 0;
      font-size: 1.2rem;
      font-weight: 400;
    }
    .btn-primary-login {
      width: 100%;
      padding: 16px;
      background: #166534;
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 24px;
    }
    .btn-primary-login:hover:not(:disabled) {
      background: #14532d;
      transform: translateY(-1px);
    }
    .btn-primary-login:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    .login-status {
      padding: 14px;
      border-radius: 10px;
      font-size: 0.9rem;
      text-align: center;
      margin-bottom: 24px;
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid #fee2e2;
    }
    .login-status.success {
      background: #f0fdf4;
      color: #166534;
      border: 1px solid #dcfce7;
    }
    .login-footer {
      text-align: center;
      padding-top: 24px;
      border-top: 1px solid #f1f5f9;
    }
    .login-footer p {
      font-size: 0.8rem;
      color: #94a3b8;
      margin-bottom: 16px;
    }
    .back-link {
      font-size: 0.9rem;
      color: #64748b;
      text-decoration: none;
      font-weight: 500;
    }
    .back-link:hover {
      color: #1e293b;
    }
    .text-center { text-align: center; }
    .resend-text {
      margin-top: 12px;
      font-size: 0.85rem;
      color: #64748b;
    }
    .btn-text {
      background: none;
      border: none;
      color: #166534;
      font-weight: 700;
      cursor: pointer;
      padding: 0;
      text-decoration: underline;
    }
    .mt-4 { margin-top: 1rem; }
    .signup-btn { margin-bottom: 0; background: #1e293b; }
    .signup-btn:hover { background: #0f172a; }
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
