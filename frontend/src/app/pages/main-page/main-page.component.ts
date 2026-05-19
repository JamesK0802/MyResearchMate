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
      <!-- 1. Hero Section -->
      <section class="hero">
        <p class="hero-label">Australian National University · RSB</p>
        <h1>Unified Research <span class="highlight">Platform</span></h1>
        <p class="hero-sub">
          A dedicated platform for pooled CRISPR analysis, lab collaboration, 
          and genomic data management.
        </p>
        <div class="hero-cta">
          <a *ngIf="!auth.isLoggedIn" routerLink="/login" class="cta-fill">Get Started</a>
          <a *ngIf="auth.isLoggedIn" routerLink="/my-data" class="cta-fill">My Data</a>
          <a routerLink="/contact" class="cta-ghost">Get Support</a>
        </div>
      </section>

      <div class="container">
        <!-- 2. Research Tools Grid -->
        <section class="grid-section">
          <p class="sec-label">RESEARCH TOOLS</p>
          <div class="cards-grid">
            <a routerLink="/crispr" class="tool-card">
              <div class="card-body">
                <h3>CRISPR Tool</h3>
                <p>Pooled experiment analysis with multi-target competitive mapping and benchmarking.</p>
                <div class="tag-row">
                  <span>Multiplex Analysis</span>
                  <span>Competitive Mapping</span>
                  <span>Result Viewer</span>
                </div>
              </div>
            </a>
            <a routerLink="/tools/pcr" class="tool-card">
              <div class="card-body">
                <h3>PCR Setup Calculator</h3>
                <p>Calculate mastermix volumes, dilutions, and primer concentrations with customizable presets.</p>
                <div class="tag-row">
                  <span>Personalized</span>
                  <span>Sharing</span>
                </div>
              </div>
            </a>
            <div class="tool-card placeholder">
              <div class="card-body">
                <h3>More Coming Soon</h3>
                <p>Additional research tools will be added to the platform as they are developed.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 3. Collaboration & Labs Grid -->
        <section class="grid-section">
          <p class="sec-label">COLLABORATION & LABS</p>
          <div class="cards-grid">
            <a routerLink="/labs/my" class="tool-card">
              <div class="card-body">
                <h3>My Labs</h3>
                <p>Access your research groups, manage members, and view shared datasets.</p>
              </div>
            </a>
            <a routerLink="/labs/find" class="tool-card">
              <div class="card-body">
                <h3>Find Labs</h3>
                <p>Discover other research groups at RSB and request to join their community.</p>
              </div>
            </a>
            <a routerLink="/labs/register" class="tool-card">
              <div class="card-body">
                <h3>Register Lab</h3>
                <p>Create a new lab group to start sharing results and presets with your team.</p>
              </div>
            </a>
          </div>
        </section>

        <!-- 4. How CRISPR Tool Works -->
        <section class="mechanism-container">
          <div class="mech-header">
            <div class="mech-title-wrap">
              <span class="m-badge">TECHNICAL CORE</span>
              <h2>How CRISPR Tool Works</h2>
              <p class="m-intro">Most pipelines discard ambiguity. This pipeline models it.</p>
            </div>
          </div>

          <div class="dual-cards">
            <div class="d-card challenge">
              <span class="d-label">THE CHALLENGE</span>
              <p>Traditional pipelines assume one reference per read. In pooled/multiplex experiments, highly similar targets cause unstable alignment and forced misassignment.</p>
            </div>
            <div class="d-card solution">
              <span class="d-label">OUR SOLUTION</span>
              <p>Our engine performs Multi-Reference Competitive Classification. Every read is evaluated against all candidate targets in parallel, ensuring the most confident match is selected.</p>
            </div>
          </div>

          <div class="steps-grid">
            <div class="step-card">
              <div class="s-header">
                <span class="s-num">01</span>
                <h3>k-mer Competitive Assignment</h3>
              </div>
              <p>Efficient pre-alignment classification using k-mer indexing. This enables scalable multiplex analysis across hundreds of competing reference sequences.</p>
            </div>
            <div class="step-card">
              <div class="s-header">
                <span class="s-num">02</span>
                <h3>Confidence Margin System</h3>
              </div>
              <p>Prevents aggressive misclassification by identifying reads where competing targets are too similar. Only high-confidence assignments proceed to primary reporting.</p>
            </div>
            <div class="step-card">
              <div class="s-header">
                <span class="s-num">03</span>
                <h3>Reliability: The Rescue Layer</h3>
              </div>
              <p>Unresolved reads are moved to an Ambiguous Pool for secondary clustering. This preserves statistical transparency without compromising primary classification integrity.</p>
            </div>
            <div class="step-card">
              <div class="s-header">
                <span class="s-num">04</span>
                <h3>Final Mutation Interpretation</h3>
              </div>
              <p>Precise biological classification (In-frame vs Out-of-frame) performed after confident target assignment, ensuring reliable editing efficiency metrics.</p>
            </div>
          </div>
        </section>
      </div>

      <footer class="main-footer">
        <p>Australian National University · Research School of Biology</p>
        <p class="v-tag">System Version {{ version }}</p>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; background: #f8fafc; color: #0f172a; }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 40px; }

    /* Hero */
    .hero { padding: 100px 40px 60px; text-align: center; max-width: 750px; margin: 0 auto; }
    .hero-label { font-size: 0.75rem; font-weight: 700; color: #94a3b8; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 24px; }
    h1 { font-size: 3.5rem; font-weight: 900; letter-spacing: -0.04em; margin-bottom: 20px; line-height: 1.1; }
    .highlight { color: #3b82f6; }
    .hero-sub { font-size: 1.15rem; color: #64748b; line-height: 1.6; margin-bottom: 48px; }
    .hero-cta { display: flex; gap: 12px; justify-content: center; }
    .cta-fill { padding: 14px 32px; background: #0f172a; color: white; border-radius: 12px; font-weight: 700; text-decoration: none; transition: all 0.2s; cursor: pointer; }
    .cta-fill:hover { transform: translateY(-2px); box-shadow: 0 10px 20px -5px rgba(15, 23, 42, 0.2); }
    .cta-ghost { padding: 14px 32px; border: 1px solid #e2e8f0; color: #64748b; border-radius: 12px; font-weight: 700; text-decoration: none; transition: all 0.2s; cursor: pointer; }
    .cta-ghost:hover { background: #f1f5f9; border-color: #cbd5e1; }

    /* Grid Layouts */
    .grid-section { padding-bottom: 60px; }
    .sec-label { font-size: 0.75rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.1em; margin-bottom: 24px; }
    .cards-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }

    /* Tool/Lab Cards */
    .tool-card {
      background: white; border: 1px solid #f1f5f9; border-radius: 20px; padding: 40px;
      text-decoration: none; color: inherit; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex; flex-direction: column;
    }
    .tool-card:hover { transform: translateY(-6px); box-shadow: 0 20px 40px -15px rgba(0,0,0,0.06); border-color: #3b82f6; }
    .tool-card h3 { font-size: 1.2rem; font-weight: 800; margin-bottom: 12px; color: #1e293b; }
    .tool-card p { font-size: 0.95rem; color: #64748b; line-height: 1.6; margin: 0; flex: 1; }
    .tag-row { display: flex; gap: 8px; margin-top: 24px; flex-wrap: wrap; }
    .tag-row span { font-size: 0.7rem; font-weight: 700; color: #3b82f6; background: #eff6ff; padding: 4px 10px; border-radius: 6px; }
    .tool-card.placeholder { border-style: dashed; background: #fcfdfe; cursor: default; }
    .tool-card.placeholder:hover { transform: none; box-shadow: none; border-color: #f1f5f9; }
    .tool-card.placeholder h3 { color: #cbd5e1; }

    /* Mechanism Container */
    .mechanism-container {
      background: white; border-radius: 40px; padding: 80px; border: 1px solid #f1f5f9;
      box-shadow: 0 4px 60px -12px rgba(0,0,0,0.03); margin-bottom: 80px;
    }

    .mech-header { margin-bottom: 60px; padding-bottom: 40px; border-bottom: 1px solid #f1f5f9; }
    .m-badge { font-size: 0.75rem; font-weight: 800; color: #3b82f6; letter-spacing: 0.2em; display: block; margin-bottom: 12px; }
    .mech-header h2 { font-size: 2.8rem; font-weight: 900; margin-bottom: 12px; letter-spacing: -0.04em; }
    .m-intro { color: #64748b; font-size: 1.2rem; font-weight: 500; line-height: 1.5; margin: 0; }

    /* Dual Cards */
    .dual-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .d-card { padding: 48px; border-radius: 32px; border: 1px solid #f1f5f9; }
    .d-card.challenge { background: #f8fafc; }
    .d-card.solution { background: #0f172a; color: white; border: none; }
    .d-label { font-size: 0.7rem; font-weight: 800; letter-spacing: 0.15em; display: block; margin-bottom: 16px; color: #3b82f6; }
    .d-card p { font-size: 1.1rem; line-height: 1.7; margin: 0; }
    .d-card.challenge p { color: #475569; }
    .d-card.solution p { color: #94a3b8; }

    /* Uniform Steps Grid */
    .steps-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .step-card { padding: 40px; border-radius: 28px; border: 1px solid #f1f5f9; background: #ffffff; }
    
    .s-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
    .s-num { font-size: 0.8rem; font-weight: 800; color: #3b82f6; background: #eff6ff; padding: 4px 12px; border-radius: 8px; }
    .step-card h3 { font-size: 1.2rem; font-weight: 800; margin: 0; color: #1e293b; }
    .step-card p { font-size: 1rem; color: #64748b; line-height: 1.65; margin: 0; }
    .step-card strong { color: #0f172a; }

    /* Footer */
    .main-footer { text-align: center; padding: 80px 0; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 0.85rem; }
    .v-tag { font-family: monospace; color: #cbd5e1; margin-top: 8px; }

    @media (max-width: 950px) {
      .cards-grid, .dual-cards, .steps-grid { grid-template-columns: 1fr; }
      .mechanism-container { padding: 40px 24px; }
      h1 { font-size: 2.8rem; }
    }
  `]
})
export class MainPageComponent {
  version = '2.3.0';
  constructor(public auth: AuthService) { }
}
