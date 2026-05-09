import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-main-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="landing">

      <!-- Hero -->
      <section class="hero">
        <p class="hero-label">ANU · Research School of Biology</p>
        <h1>My Research Mate</h1>
        <p class="hero-sub">
          A unified research platform for analysis tools, lab collaboration, and data management.
        </p>
        <div class="hero-cta">
          <a *ngIf="!auth.isLoggedIn" routerLink="/login" class="cta-fill">Get Started</a>
          <a *ngIf="auth.isLoggedIn" routerLink="/my-data" class="cta-fill">My Results</a>
          <a routerLink="/contact" class="cta-ghost">Contact</a>
        </div>
      </section>

      <!-- Tools -->
      <section class="section">
        <p class="sec-label">Research Tools</p>
        <div class="cards-row">
          <a routerLink="/crispr" class="t-card">
            <h3>CRISPR Tool</h3>
            <p>Multi-reference genome editing analysis, benchmarking, and result visualization.</p>
            <div class="t-subs">
              <span>Analysis</span>
              <span>Benchmark</span>
              <span>Result Viewer</span>
            </div>
          </a>
          <a routerLink="/tools/pcr" class="t-card">
            <h3>PCR Setup Calculator</h3>
            <p>Calculate mastermix volumes, dilutions, and primer concentrations with customizable presets.</p>
            <div class="t-subs">
              <span>Personalized</span>
              <span>Sharing</span>
            </div>
          </a>
          <div class="t-card t-placeholder">
            <h3>More Coming Soon</h3>
            <p>Additional research tools will be added to the platform as they are developed.</p>
          </div>
        </div>
      </section>

      <!-- Labs Section -->
      <section class="section labs-section">
        <p class="sec-label">Collaboration & Labs</p>
        <div class="cards-row">
          <a routerLink="/labs/my" class="t-card lab-card">
            <h3>My Labs</h3>
            <p>Access your research groups, manage members, and view shared datasets.</p>
          </a>
          <a routerLink="/labs/find" class="t-card lab-card">
            <h3>Find Labs</h3>
            <p>Discover other research groups at RSB and request to join their community.</p>
          </a>
          <a routerLink="/labs/register" class="t-card lab-card">
            <h3>Register Lab</h3>
            <p>Create a new lab group to start sharing results and presets with your team.</p>
          </a>
        </div>
      </section>

      <!-- Platform Features -->
      <section class="section feat-section">
        <p class="sec-label">Platform Features</p>
        <div class="feat-row">
          <div class="f-item"><h4>Lab Management</h4><p>Register labs and manage group memberships.</p></div>
          <div class="f-item"><h4>Data Sharing</h4><p>Share results with specific labs you choose.</p></div>
          <div class="f-item"><h4>Lab Discovery</h4><p>Browse groups and request to join.</p></div>
          <div class="f-item"><h4>Secure Access</h4><p>University email authentication only.</p></div>
        </div>
      </section>

      <!-- Footer -->
      <footer class="foot">
        Australian National University · Research School of Biology
      </footer>
    </div>
  `,
  styles: [`
    .landing { background: #f7f8fa; min-height: 100vh; }

    /* ── Hero ── */
    .hero {
      padding: 100px 40px 60px;
      text-align: center;
      max-width: 620px;
      margin: 0 auto;
    }
    .hero-label {
      font-size: 0.7rem; font-weight: 600; letter-spacing: 0.1em;
      text-transform: uppercase; color: #94a3b8; margin-bottom: 24px;
    }
    .hero h1 {
      font-size: 3rem; font-weight: 800; color: #0f172a;
      letter-spacing: -0.03em; margin-bottom: 20px;
    }
    .hero-sub {
      font-size: 1.05rem; line-height: 1.7; color: #64748b; margin-bottom: 40px;
    }
    .hero-cta { display: flex; gap: 12px; justify-content: center; }
    .cta-fill {
      padding: 12px 28px; border-radius: 8px;
      background: #1e293b; color: #fff;
      font-weight: 600; font-size: 0.88rem;
      text-decoration: none; transition: background 0.15s;
    }
    .cta-fill:hover { background: #334155; }
    .cta-ghost {
      padding: 12px 28px; border-radius: 8px;
      background: transparent; color: #64748b;
      font-weight: 600; font-size: 0.88rem;
      text-decoration: none; border: 1px solid #e2e8f0;
      transition: all 0.15s; cursor: pointer;
    }
    .cta-ghost:hover { border-color: #cbd5e1; color: #334155; background: #f8fafc; }
    
    button.cta-ghost { font-family: inherit; }

    /* ── Section ── */
    .section { padding: 40px 40px; max-width: 960px; margin: 0 auto; }
    .sec-label {
      font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: #94a3b8; margin-bottom: 16px;
    }

    /* ── Card Grid ── */
    .cards-row {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
    }
    .t-card {
      background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
      padding: 28px 24px; text-decoration: none; color: inherit;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex; flex-direction: column;
      position: relative; overflow: hidden;
    }
    .t-card:hover { 
      border-color: #cbd5e1; 
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);
      transform: translateY(-2px);
    }
    .t-card h3 { font-size: 0.95rem; font-weight: 800; color: #1e293b; margin-bottom: 8px; }
    .t-card p { font-size: 0.82rem; line-height: 1.55; color: #64748b; margin: 0; flex: 1; }

    .t-subs {
      display: flex; gap: 6px; margin-top: 16px; flex-wrap: wrap;
    }
    .t-subs span {
      font-size: 0.65rem; font-weight: 700; color: #64748b;
      background: #f1f5f9; padding: 3px 8px; border-radius: 5px;
    }

    .t-placeholder { border-style: dashed; cursor: default; }
    .t-placeholder:hover { border-color: #e5e7eb; box-shadow: none; transform: none; }
    .t-placeholder h3 { color: #94a3b8; }
    .t-placeholder p { color: #cbd5e1; }

    /* ── Lab Specific ── */
    .labs-section { padding-top: 0; }
    .lab-card { background: white; }
    .icon-circle {
      width: 36px; height: 36px; background: #f1f5f9; 
      border-radius: 10px; display: flex; align-items: center; 
      justify-content: center; font-size: 1.2rem; margin-bottom: 16px;
    }
    .lab-card:hover .icon-circle { background: #e2e8f0; }

    /* ── Feature Row ── */
    .feat-section { border-top: 1px solid #e5e7eb; margin-top: 20px; }
    .feat-row {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px;
      padding-top: 10px;
    }
    .f-item h4 { font-size: 0.85rem; font-weight: 700; color: #334155; margin-bottom: 6px; }
    .f-item p { font-size: 0.78rem; line-height: 1.55; color: #94a3b8; margin: 0; }

    /* ── Footer ── */
    .foot {
      text-align: center; padding: 48px 40px 32px;
      font-size: 0.75rem; color: #cbd5e1;
    }

    @media (max-width: 800px) {
      .cards-row { grid-template-columns: 1fr; }
      .feat-row { grid-template-columns: repeat(2, 1fr); }
      .hero h1 { font-size: 2.2rem; }
    }
  `]
})
export class MainPageComponent {
  constructor(public auth: AuthService) { }
}
