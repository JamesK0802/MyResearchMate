import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-contact-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="contact-page">
      <div class="container">
        <!-- Unified Premium Card -->
        <div class="unified-card">
          <!-- Card Left: Support Scope -->
          <div class="card-left">
            <header class="card-header">
              <span class="m-badge">RESEARCH SUPPORT</span>
              <h1>How can I help?</h1>
              <p>Direct assistance for technical issues, research collaboration, and system inquiries within the ANU RSB platform.</p>
            </header>

            <div class="support-categories">
              <div class="cat-item">
                <div class="cat-dot"></div>
                <div class="cat-text">
                  <strong>Technical Issues</strong>
                  <span>Bug reports & analysis errors</span>
                </div>
              </div>
              <div class="cat-item">
                <div class="cat-dot blue"></div>
                <div class="cat-text">
                  <strong>Collaboration</strong>
                  <span>Feature proposals & research</span>
                </div>
              </div>
            </div>

            <div class="card-actions">
              <a routerLink="/" class="btn-return">← Back to Dashboard</a>
            </div>
          </div>

          <!-- Card Right: Direct Contact (Personal Info) -->
          <div class="card-right">
            <div class="contact-block">
              <span class="label">PROJECT LEAD</span>
              <h3>James Kim</h3>
              <a href="mailto:James.Kim@anu.edu.au" class="email-link">James.Kim@anu.edu.au</a>
              <p class="role-desc">Lead Developer & Platform Architect</p>
            </div>

            <div class="info-block">
              <span class="label">OFFICE LOCATION</span>
              <h3>Robertson Building (Bldg 46)</h3>
              <p>Australian National University<br>Acton ACT 2601, Australia</p>
            </div>

            <div class="footer-meta">
              <p class="v-text">System Version {{ version }}</p>
              <p class="copyright">© 2026 My Lab Mate</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #f8fafc;
      color: #0f172a;
      font-family: 'Inter', sans-serif;
    }

    .container { width: 100%; max-width: 950px; padding: 40px; }

    /* Unified Card */
    .unified-card {
      background: white;
      border-radius: 40px;
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      overflow: hidden;
      box-shadow: 0 40px 100px -20px rgba(0,0,0,0.06);
      border: 1px solid #e2e8f0;
    }

    /* Left Side */
    .card-left { padding: 80px 60px; }
    .m-badge { font-size: 0.7rem; font-weight: 800; color: #3b82f6; letter-spacing: 0.15em; display: block; margin-bottom: 20px; }
    .card-header h1 { font-size: 2.5rem; font-weight: 900; letter-spacing: -0.04em; margin-bottom: 12px; }
    .card-header p { font-size: 1rem; color: #64748b; line-height: 1.6; margin-bottom: 48px; }

    .support-categories { display: flex; flex-direction: column; gap: 24px; margin-bottom: 60px; }
    .cat-item { display: flex; gap: 16px; align-items: flex-start; }
    .cat-dot { width: 8px; height: 8px; border-radius: 50%; background: #e2e8f0; margin-top: 6px; }
    .cat-dot.blue { background: #3b82f6; }
    .cat-text strong { font-size: 0.95rem; font-weight: 800; color: #1e293b; display: block; }
    .cat-text span { font-size: 0.85rem; color: #94a3b8; }

    .card-actions { border-top: 1px solid #f1f5f9; padding-top: 32px; }
    .btn-return { font-size: 0.9rem; font-weight: 700; color: #94a3b8; text-decoration: none; transition: color 0.2s; }
    .btn-return:hover { color: #0f172a; }

    /* Right Side */
    .card-right { background: #fcfdfe; padding: 80px 60px; border-left: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 48px; }
    .label { font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.12em; display: block; margin-bottom: 12px; }
    
    .contact-block h3 { font-size: 1.5rem; font-weight: 900; color: #0f172a; margin-bottom: 4px; }
    .email-link { font-size: 1.05rem; font-weight: 700; color: #3b82f6; text-decoration: none; border-bottom: 1px solid transparent; transition: all 0.2s; }
    .email-link:hover { border-color: #3b82f6; }
    .role-desc { font-size: 0.85rem; color: #94a3b8; margin-top: 8px; }

    .info-block h3 { font-size: 1.1rem; font-weight: 800; color: #1e293b; margin-bottom: 8px; }
    .info-block p { font-size: 0.9rem; color: #64748b; line-height: 1.6; margin: 0; }

    .footer-meta { margin-top: auto; border-top: 1px solid #f1f5f9; padding-top: 32px; }
    .v-text { font-family: monospace; font-size: 0.75rem; font-weight: 700; color: #cbd5e1; margin-bottom: 4px; }
    .copyright { font-size: 0.75rem; color: #cbd5e1; margin: 0; }

    @media (max-width: 900px) {
      .unified-card { grid-template-columns: 1fr; }
      .card-left, .card-right { padding: 60px 40px; }
      .card-right { border-left: none; border-top: 1px solid #f1f5f9; }
    }
  `]
})
export class ContactPageComponent {
  version = '3.1.3';
}
