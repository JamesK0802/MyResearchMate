import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-contact-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="construction-container">
      <div class="content-card">
        <div class="icon-wrap">🚧</div>
        <h1>Under Construction</h1>
        <p class="description">
          The Contact and Support module is currently being developed to provide a seamless communication channel for RSB researchers.
        </p>
        
        <div class="info-box">
          <h3>Need Immediate Assistance?</h3>
          <p>For urgent issues regarding the CRISPR Tool or PCR Calculator, please reach out to the platform administrator via university email.</p>
        </div>

        <div class="actions">
          <a routerLink="/" class="btn-home">Return to Dashboard</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .construction-container {
      min-height: 80vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
      background: #f7f8fa;
    }
    .content-card {
      max-width: 550px;
      width: 100%;
      background: white;
      border-radius: 32px;
      padding: 60px 40px;
      text-align: center;
      box-shadow: 0 20px 40px -10px rgba(0,0,0,0.05);
      border: 1px solid #e2e8f0;
    }
    .icon-wrap {
      font-size: 4rem;
      margin-bottom: 24px;
      display: block;
    }
    h1 {
      font-size: 2.2rem;
      font-weight: 900;
      color: #0f172a;
      margin-bottom: 16px;
      letter-spacing: -0.02em;
    }
    .description {
      font-size: 1.1rem;
      line-height: 1.6;
      color: #64748b;
      margin-bottom: 32px;
    }
    .info-box {
      background: #f8fafc;
      border-radius: 20px;
      padding: 24px;
      text-align: left;
      margin-bottom: 40px;
      border: 1px solid #f1f5f9;
    }
    .info-box h3 {
      font-size: 1rem;
      font-weight: 800;
      color: #1e293b;
      margin-bottom: 8px;
    }
    .info-box p {
      font-size: 0.9rem;
      color: #64748b;
      line-height: 1.5;
    }
    .btn-home {
      display: inline-block;
      padding: 14px 32px;
      background: #0f172a;
      color: white;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 700;
      transition: all 0.2s;
    }
    .btn-home:hover {
      background: #1e293b;
      transform: translateY(-2px);
      box-shadow: 0 10px 20px -5px rgba(15, 23, 42, 0.2);
    }
  `]
})
export class ContactPageComponent {}
