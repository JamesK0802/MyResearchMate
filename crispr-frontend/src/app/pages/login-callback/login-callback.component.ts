/**
 * LoginCallbackComponent — Handles the Supabase OAuth redirect.
 * Supabase redirects here after Google login. We exchange the code
 * for a session and redirect to the appropriate page.
 */
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="callback-container">
      <div class="callback-card">
        <div *ngIf="!error" class="loading-state">
          <div class="spinner"></div>
          <p>Signing you in...</p>
        </div>
        <div *ngIf="error" class="error-state">
          <span class="error-icon">⚠️</span>
          <h3>Sign-in Failed</h3>
          <p>{{ error }}</p>
          <button (click)="goHome()" class="btn-back">Back to Home</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .callback-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: calc(100vh - 56px);
      background: #f7f8fa;
    }
    .callback-card {
      background: white;
      padding: 48px 40px;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06);
      text-align: center;
      max-width: 400px;
      width: 100%;
    }
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e5e7eb;
      border-top: 3px solid #22c55e;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading-state p {
      color: #64748b;
      font-size: 0.95rem;
      font-weight: 500;
    }
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .error-icon { font-size: 2rem; }
    .error-state h3 {
      font-size: 1.15rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0;
    }
    .error-state p {
      color: #ef4444;
      font-size: 0.88rem;
      line-height: 1.5;
    }
    .btn-back {
      padding: 10px 24px;
      background: #166534;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.88rem;
      cursor: pointer;
      transition: background 0.15s;
      margin-top: 8px;
    }
    .btn-back:hover { background: #14532d; }
  `]
})
export class LoginCallbackComponent implements OnInit {
  error: string | null = null;

  constructor(
    private auth: AuthService,
    private router: Router,
  ) {}

  async ngOnInit() {
    try {
      const success = await this.auth.handleCallback();
      if (success) {
        this.router.navigate(['/']);
      } else {
        this.error = 'Could not complete sign-in. Please try again.';
      }
    } catch (err: any) {
      this.error = err.message || 'Authentication failed. Please try again.';
    }
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
