import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
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
        <div class="hero-cta">
          <a *ngIf="!auth.isLoggedIn" routerLink="/login" class="cta-fill">Get Started</a>
          <button *ngIf="auth.isLoggedIn" type="button" (click)="goToMyData()" class="cta-fill">My Data</button>
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
                <h3>Crispr Analysis</h3>
                <p>Analyse pooled CRISPR reads from single-read or paired-end FASTQ files, review confident and ambiguous assignments, then save or export clear editing summaries.</p>
                <div class="tag-row">
                  <span>Illumina R1 / R2</span>
                  <span>Nanopore reads</span>
                  <span>Ambiguity-aware</span>
                  <span>Local processing</span>
                </div>
              </div>
            </a>
            <a routerLink="/tools/protocol-builder" class="tool-card">
              <div class="card-body">
                <h3>Tree Protocol</h3>
                <p>Build visual experiment workflows, connect protocol stages, and keep step-specific notes in a local-first workspace.</p>
                <div class="tag-row">
                  <span>Visual Workflow</span>
                  <span>Step Notes</span>
                  <span>Local Files</span>
                </div>
              </div>
            </a>
            <a routerLink="/tools/plot-generator" class="tool-card">
              <div class="card-body">
                <h3>R-Plot Studio</h3>
                <p>Build publication-ready figures from spreadsheet data, edit the generated R code, and keep each project in My Data.</p>
                <div class="tag-row">
                  <span>Excel Data</span>
                  <span>R Script</span>
                  <span>Figure Export</span>
                </div>
              </div>
            </a>
            <a routerLink="/tools/pcr" class="tool-card">
              <div class="card-body">
                <h3>Solution Protocol</h3>
                <p>Calculate mastermix volumes, dilutions, and primer concentrations with customizable presets.</p>
                <div class="tag-row">
                  <span>Presets</span>
                  <span>Team Sharing</span>
                </div>
              </div>
            </a>
            <a routerLink="/tools/sequence-viewer" class="tool-card">
              <div class="card-body">
                <h3>Sequence Viewer</h3>
                <p>Inspect sequences and FASTQ read groups, annotate features, and export sequence records directly from your browser.</p>
                <div class="tag-row">
                  <span>FASTA / GenBank</span>
                  <span>FASTQ Groups</span>
                  <span>Annotations</span>
                </div>
              </div>
            </a>
            <a routerLink="/tools/sample-photo-compare" class="tool-card">
              <div class="card-body">
                <h3>Photo Comparison</h3>
                <p>Arrange earlier and current sample photos side by side, reorder them, and export a printable comparison sheet.</p>
                <div class="tag-row">
                  <span>Photo Sets</span>
                  <span>Side-by-side</span>
                  <span>PDF Export</span>
                </div>
              </div>
            </a>
            <a routerLink="/tools/pdf-editor" class="tool-card">
              <div class="card-body">
                <h3>PDF Editor</h3>
                <p>Organize, reorder, rotate, annotate, draw, insert signatures and text, and export multi-page PDF documents client-side.</p>
                <div class="tag-row">
                  <span>Page Reorder</span>
                  <span>Annotation & Draw</span>
                  <span>Signatures</span>
                  <span>PDF Export</span>
                </div>
              </div>
            </a>
          </div>
        </section>

        <!-- 3. Lab Workflow Grid -->
        <section class="grid-section">
          <p class="sec-label">LAB WORKFLOW</p>
          <div class="cards-grid">
            <a routerLink="/data/memos" class="tool-card">
              <div class="card-body">
                <h3>Memo</h3>
                <p>Keep free-form lab notes, observations, meeting records, and daily research updates in one place.</p>
                <div class="tag-row">
                  <span>Notes</span>
                  <span>Daily Records</span>
                </div>
              </div>
            </a>
            <a routerLink="/data/experiment-logs" class="tool-card">
              <div class="card-body">
                <h3>Experiment Logs</h3>
                <p>Run a saved Tree Protocol, record deviations and observations, and keep a timestamped history of completed work.</p>
                <div class="tag-row">
                  <span>Protocol Runs</span>
                  <span>Notes & Evidence</span>
                </div>
              </div>
            </a>
            <a routerLink="/booking" class="tool-card">
              <div class="card-body">
                <h3>Facility Booking</h3>
                <p>Reserve shared spaces and growth facilities, check availability, and manage booking timelines.</p>
                <div class="tag-row">
                  <span>Availability</span>
                  <span>Facility Use</span>
                </div>
              </div>
            </a>
            <div class="tool-card placeholder">
              <div class="card-body">
                <h3>More Coming Soon</h3>
                <p>Additional workflow helpers will be added as lab routines become ready for shared use.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 4. Collaboration & Labs Grid -->
        <section class="grid-section">
          <p class="sec-label">COLLABORATION & LABS</p>
          <div class="cards-grid">
            <a routerLink="/labs/my" class="tool-card">
              <div class="card-body">
                <h3>My Labs</h3>
                <p>Access your research groups, manage members, and move into each lab's shared archive workspace.</p>
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
                <p>Create a new lab group to start sharing records, files, results, and presets with your team.</p>
              </div>
            </a>
            <a routerLink="/labs/my" class="tool-card">
              <div class="card-body">
                <h3>Lab Archives</h3>
                <p>Each lab can maintain its own file archive, sample records, experiment notes, and linked attachments.</p>
                <div class="tag-row">
                  <span>Per-lab Files</span>
                  <span>Samples</span>
                  <span>Records</span>
                </div>
              </div>
            </a>
          </div>
        </section>

        <!-- 5. How Crispr Analysis Works -->
        <section class="mechanism-container">
          <div class="mech-header">
            <div class="mech-title-wrap">
              <span class="m-badge">TECHNICAL CORE</span>
              <h2>How Crispr Analysis Works</h2>
              <p class="m-intro">Turn pooled sequencing reads into target-level editing summaries, while keeping uncertain assignments visible instead of silently forcing them into a result.</p>
            </div>
          </div>

          <div class="dual-cards">
            <div class="d-card challenge">
              <span class="d-label">THE CHALLENGE</span>
              <p>Pooled CRISPR experiments can contain related references, repeated target regions, and several guide sites in the same run. A read may fit more than one reference, so forcing a single answer can distort editing estimates.</p>
            </div>
            <div class="d-card solution">
              <span class="d-label">OUR SOLUTION</span>
              <p>The tool checks read quality and orientation, compares each read with the configured target windows, separates clear assignments from uncertain cases, and only then summarises edits for each target.</p>
            </div>
          </div>

          <div class="crispr-feature-grid">
            <div>
              <span>Input</span>
              <strong>Single reads or Illumina R1/R2 pairs, plus references and guides</strong>
            </div>
            <div>
              <span>Assignment</span>
              <strong>Reference-aware matching with an explicit ambiguous-read path</strong>
            </div>
            <div>
              <span>Output</span>
              <strong>Editing summaries, diagnostics, curated views, and Excel export</strong>
            </div>
          </div>

          <div class="steps-grid">
            <div class="step-card">
              <div class="s-header">
                <span class="s-num">01</span>
                <h3>Set up references and targets</h3>
              </div>
              <p>Upload FASTQ files and define each reference, target name, and guide sequence. These settings tell the tool which editing sites and candidate references to look for.</p>
            </div>
            <div class="step-card">
              <div class="s-header">
                <span class="s-num">02</span>
                <h3>Prepare each sequencing input</h3>
              </div>
              <p>Nanopore reads can be analysed directly. For Illumina data, R1 and R2 mates are matched, oriented, and combined where the evidence supports a reliable molecule.</p>
            </div>
            <div class="step-card">
              <div class="s-header">
                <span class="s-num">03</span>
                <h3>Focus on the editing region</h3>
              </div>
              <p>For every target, the tool builds a short window around the expected cut site. It checks orientation, local coverage, anchors, and observed-base quality before a read can be used.</p>
            </div>
            <div class="step-card">
              <div class="s-header">
                <span class="s-num">04</span>
                <h3>Assign only when the match is clear</h3>
              </div>
              <p>Each usable read is compared with the eligible reference windows. A read is assigned only when the best match is clearly ahead of competing references by your selected margin.</p>
            </div>
            <div class="step-card">
              <div class="s-header">
                <span class="s-num">05</span>
                <h3>Keep uncertain reads separate</h3>
              </div>
              <p>Reads that pass quality checks but do not have a clear winner remain visible as ambiguous. They do not alter the primary result, and can be reviewed or rescued separately when useful.</p>
            </div>
            <div class="step-card">
              <div class="s-header">
                <span class="s-num">06</span>
                <h3>Summarise edits per target</h3>
              </div>
              <p>Assigned reads are evaluated independently for every target on that reference. The dashboard groups observed sequence patterns and labels unedited, substitution, in-frame, and out-of-frame outcomes.</p>
            </div>
            <div class="step-card step-card-wide">
              <div class="s-header">
                <span class="s-num">07</span>
                <h3>Review, curate, and export</h3>
              </div>
              <p>Inspect retention and assignment diagnostics alongside the editing summary. You can create a curated view without overwriting the original result, then save it to My Data or export it to Excel. Analysis stays in your browser.</p>
            </div>
          </div>
        </section>
      </div>

      <footer class="main-footer">
        <p>Australian National University · Research School of Biology</p>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; background: #f8fafc; color: #0f172a; }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 40px; }

    /* Hero */
    .hero { padding: 100px 40px 60px; text-align: center; max-width: 750px; margin: 0 auto; }
    .hero-label { font-size: 0.75rem; font-weight: 700; color: #94a3b8; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 24px; }
    h1 { font-size: 3.5rem; font-weight: 900; letter-spacing: 0; margin-bottom: 20px; line-height: 1.1; overflow-wrap: anywhere; }
    .highlight { color: #3b82f6; }
    .hero-sub { font-size: 1.15rem; color: #64748b; line-height: 1.6; margin-bottom: 48px; }
    .hero-cta { display: flex; gap: 12px; justify-content: center; }
    .cta-fill { padding: 14px 32px; background: #0f172a; color: white; border: none; border-radius: 12px; font: inherit; font-weight: 700; text-decoration: none; transition: all 0.2s; cursor: pointer; }
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
    .mech-header h2 { font-size: 2.8rem; font-weight: 900; margin-bottom: 12px; letter-spacing: 0; }
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

    .crispr-feature-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .crispr-feature-grid div {
      background: #f8fafc;
      border: 1px solid #f1f5f9;
      border-radius: 18px;
      padding: 22px;
    }
    .crispr-feature-grid span {
      color: #3b82f6;
      display: block;
      font-size: 0.68rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .crispr-feature-grid strong {
      color: #1e293b;
      display: block;
      font-size: 0.9rem;
      line-height: 1.45;
    }

    /* Uniform Steps Grid */
    .steps-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .step-card { padding: 40px; border-radius: 28px; border: 1px solid #f1f5f9; background: #ffffff; }
    .step-card-wide { grid-column: 1 / -1; }

    .s-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
    .s-num { font-size: 0.8rem; font-weight: 800; color: #3b82f6; background: #eff6ff; padding: 4px 12px; border-radius: 8px; }
    .step-card h3 { font-size: 1.2rem; font-weight: 800; margin: 0; color: #1e293b; }
    .step-card p { font-size: 1rem; color: #64748b; line-height: 1.65; margin: 0; }
    .step-card strong { color: #0f172a; }

    /* Footer */
    .main-footer { text-align: center; padding: 80px 0; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 0.85rem; }

    @media (max-width: 950px) {
      .cards-grid, .dual-cards, .steps-grid, .crispr-feature-grid { grid-template-columns: 1fr; }
      .mechanism-container { padding: 40px 24px; }
      .step-card-wide { grid-column: auto; }
      h1 { font-size: 2.8rem; }
    }

    @media (max-width: 640px) {
      .container { padding: 0 14px; }
      .hero { padding: 48px 18px 34px; max-width: 100%; overflow: hidden; }
      .hero-label { font-size: .66rem; letter-spacing: 0.06em; line-height: 1.4; margin-bottom: 12px; }
      h1 { font-size: 2rem; line-height: 1.1; margin-bottom: 12px; }
      .hero-sub {
        display: -webkit-box;
        font-size: .88rem;
        line-height: 1.45;
        margin-bottom: 22px;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
      }
      .hero-cta { align-items: stretch; }
      .hero-cta a, .hero-cta button { flex: 1; padding: 11px 14px; text-align: center; }
      .grid-section { padding-bottom: 30px; }
      .sec-label { font-size: .66rem; margin: 0 0 12px 4px; }
      .cards-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .tool-card { min-height: 112px; padding: 15px 14px; border-radius: 12px; }
      .tool-card h3 { font-size: .94rem; line-height: 1.2; margin: 0 0 7px; }
      .tool-card p {
        display: -webkit-box;
        font-size: .75rem;
        line-height: 1.4;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
      }
      .tag-row { display: none; }
      .tool-card.placeholder { display: none; }
      .mechanism-container { border-radius: 14px; margin-bottom: 34px; padding: 22px 16px; }
      .mech-header { border-bottom: 0; margin-bottom: 16px; padding-bottom: 0; }
      .m-badge { font-size: .62rem; margin-bottom: 7px; }
      .mech-header h2 { font-size: 1.45rem; margin-bottom: 7px; }
      .m-intro {
        display: -webkit-box;
        font-size: .8rem;
        line-height: 1.45;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
      }
      .dual-cards { display: none; }
      .crispr-feature-grid { gap: 7px; margin-bottom: 12px; }
      .crispr-feature-grid div { border-radius: 9px; padding: 10px 12px; }
      .crispr-feature-grid span { display: inline; font-size: .61rem; margin: 0 7px 0 0; }
      .crispr-feature-grid strong { display: inline; font-size: .72rem; line-height: 1.35; }
      .steps-grid { gap: 7px; }
      .step-card { border-radius: 9px; padding: 11px 12px; }
      .s-header { align-items: center; gap: 8px; margin: 0; }
      .s-num { flex: 0 0 auto; font-size: .65rem; padding: 3px 7px; }
      .step-card h3 { font-size: .8rem; line-height: 1.25; }
      .step-card p { display: none; }
      .main-footer { font-size: .72rem; padding: 32px 16px; }
    }
  `]
})
export class MainPageComponent {
  constructor(public auth: AuthService, private router: Router) { }

  goToMyData() {
    // Use the concrete route instead of the redirect chain from /my-data.
    void this.router.navigateByUrl('/crispr/my-data');
  }
}
