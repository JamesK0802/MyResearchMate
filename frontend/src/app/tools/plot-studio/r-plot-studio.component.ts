import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import * as XLSX from 'xlsx';
import { RPlotSyncService, PanelConfig } from '../../services/r-plot-sync.service';
import { RDataTableComponent } from './r-data-table.component';
import { RCodeEditorComponent } from './r-code-editor.component';
import { RPlotCanvasComponent } from './r-plot-canvas.component';
import { RPlotWizardComponent } from './r-plot-wizard.component';
import { AuthService } from '../../services/auth.service';
import { PlotProjectService } from '../../services/plot-project.service';

@Component({
  selector: 'app-r-plot-studio',
  standalone: true,
  imports: [
    CommonModule,
    RDataTableComponent,
    RCodeEditorComponent,
    RPlotCanvasComponent,
    RPlotWizardComponent
  ],
  template: `
    <div class="r-studio-shell">

      <!-- ── WELCOME LANDING SCREEN ── -->
      <div class="vscode-welcome-screen" *ngIf="showWelcomeScreen">
        <div class="welcome-card-box">
          <div class="welcome-header">
            <h1 class="welcome-title">R-Plot Studio</h1>
            <p class="welcome-subtitle">
              Publication-ready scientific figure builder. Choose how you would like to create your figure.
            </p>
          </div>

          <div class="welcome-actions-grid">
            <!-- 1. Guided Generator (Primary Blue) -->
            <button type="button" class="btn-welcome-primary" (click)="launchGuidedWizard()">
              <div class="action-text">
                <strong>Guided Generator</strong>
                <span>Step-by-step wizard to import data, select plot types, and format themes</span>
              </div>
            </button>

            <!-- 2. Manual Scratchpad (Secondary) -->
            <button type="button" class="btn-welcome-secondary" (click)="launchManualScratchpad()">
              <div class="action-text">
                <strong>Manual Scratchpad</strong>
                <span>Start with a clean blank spreadsheet, R script template, and plot canvas</span>
              </div>
            </button>

            <button type="button" class="btn-welcome-secondary" (click)="openFromMyData()"
              [disabled]="!auth.isLoggedIn" [title]="auth.isLoggedIn ? 'Open a saved R-Plot Studio project' : 'Sign in to open My Data'">
              <div class="action-text">
                <strong>Open from My Data</strong>
                <span>Open a saved R-Plot Studio project</span>
              </div>
            </button>
          </div>

          <div class="welcome-footer">
            Publication figures and scripts are generated directly in your browser.
          </div>
        </div>
      </div>

      <!-- ── FULL STUDIO WORKSPACE ── -->
      <div class="studio-workspace-container" *ngIf="!showWelcomeScreen">
        <!-- Global Top Workspace Control Bar -->
        <header class="workspace-bar">
          <!-- Left: Title -->
          <div class="brand-title">
            <span class="brand-name">R-Plot Studio</span>
          </div>

          <!-- Center: 3 Layout Switcher Icon Buttons -->
          <div class="layout-icon-group-center">
            <!-- 1. 3-Panel Split -->
            <button
              type="button"
              class="btn-layout-icon"
              [class.active]="panelConfig.layoutMode === '3-split'"
              (click)="setLayoutMode('3-split')"
              title="3-Panel View (Data + Code + Plot)">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="1.5" y="2.5" width="15" height="13" rx="2" stroke="currentColor" stroke-width="1.3" />
                <line x1="6.5" y1="2.5" x2="6.5" y2="15.5" stroke="currentColor" stroke-width="1.3" />
                <line x1="11.5" y1="2.5" x2="11.5" y2="15.5" stroke="currentColor" stroke-width="1.3" />
              </svg>
            </button>

            <!-- 2. 2-Panel Side-by-Side (Data + Plot) -->
            <button
              type="button"
              class="btn-layout-icon"
              [class.active]="panelConfig.layoutMode === 'data-plot'"
              (click)="setLayoutMode('data-plot')"
              title="2-Panel Side by Side (Data + Plot)">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="1.5" y="2.5" width="15" height="13" rx="2" stroke="currentColor" stroke-width="1.3" />
                <line x1="8.5" y1="2.5" x2="8.5" y2="15.5" stroke="currentColor" stroke-width="1.3" />
              </svg>
            </button>

            <!-- 3. Full Canvas (Maximized) -->
            <button
              type="button"
              class="btn-layout-icon"
              [class.active]="panelConfig.layoutMode === 'full-plot'"
              (click)="setLayoutMode('full-plot')"
              title="Maximized Full Plot Canvas">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="1.5" y="2.5" width="15" height="13" rx="2" stroke="currentColor" stroke-width="1.3" fill="currentColor" fill-opacity="0.18" />
              </svg>
            </button>
          </div>

          <nav class="mobile-panel-tabs" aria-label="R-Plot workspace panels">
            <button type="button" [class.active]="mobilePanel === 'data'" (click)="mobilePanel = 'data'">Data</button>
            <button type="button" [class.active]="mobilePanel === 'code'" (click)="mobilePanel = 'code'">Code</button>
            <button type="button" [class.active]="mobilePanel === 'plot'" (click)="mobilePanel = 'plot'">Plot</button>
          </nav>

          <!-- Right: Save & Close Buttons -->
          <div class="workspace-right-actions">
            <button type="button" class="btn-top-save" (click)="onSaveClick()" title="Save this project to My Data">
              {{ currentProjectId ? 'Update My Data' : 'Save to My Data' }}
            </button>
            <button type="button" class="btn-top-close" (click)="returnToWelcome()" title="Close studio and return to home">
              Close
            </button>
          </div>
        </header>

        <!-- Workspace Body -->
        <div class="workspace-body" (mousemove)="onMouseMove($event)" (mouseup)="onMouseUp()">

          <!-- PANEL 1: DATA TABLE -->
          <div
            *ngIf="panelConfig.showData || isMobileViewport"
            class="panel-wrapper"
            [class.mobile-panel-hidden]="mobilePanel !== 'data'"
            [style.width.%]="panelConfig.dataWidth">
            <app-r-data-table></app-r-data-table>
          </div>

          <!-- Drag Splitter 1 (Between Panel 1 & 2) -->
          <div
            *ngIf="panelConfig.showData && (panelConfig.showCode || panelConfig.showPlot)"
            class="splitter"
            (mousedown)="startDrag('splitter1', $event)">
            <div class="drag-handle"></div>
          </div>

          <!-- PANEL 2: R CODE EDITOR -->
          <div
            *ngIf="panelConfig.showCode || isMobileViewport"
            class="panel-wrapper"
            [class.mobile-panel-hidden]="mobilePanel !== 'code'"
            [style.width.%]="panelConfig.codeWidth">
            <app-r-code-editor></app-r-code-editor>
          </div>

          <!-- Drag Splitter 2 (Between Panel 2 & 3) -->
          <div
            *ngIf="panelConfig.showCode && panelConfig.showPlot"
            class="splitter"
            (mousedown)="startDrag('splitter2', $event)">
            <div class="drag-handle"></div>
          </div>

          <!-- PANEL 3: INTERACTIVE PLOT CANVAS -->
          <div
            *ngIf="panelConfig.showPlot || isMobileViewport"
            class="panel-wrapper flex-grow"
            [class.mobile-panel-hidden]="mobilePanel !== 'plot'"
            [style.width.%]="panelConfig.plotWidth">
            <app-r-plot-canvas></app-r-plot-canvas>
          </div>

        </div>

      </div>

      <!-- Creation Wizard Modal Component -->
      <app-r-plot-wizard *ngIf="isWizardOpen"></app-r-plot-wizard>

    </div>
  `,
  styles: [`
    .r-studio-shell {
      display: flex;
      flex-direction: column;
      min-height: calc(100vh - 72px);
      height: calc(100vh - 72px);
      width: 100%;
      background: #f8fafc;
      overflow: hidden;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      position: relative;
    }

    /* ── WELCOME LANDING SCREEN ── */
    .vscode-welcome-screen {
      flex: 1;
      min-height: calc(100vh - 72px);
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
      background-size: 28px 28px;
      padding: 20px;
      box-sizing: border-box;
    }

    .welcome-card-box {
      background: #ffffff;
      border-radius: 20px;
      border: 1.5px solid #cbd5e1;
      padding: 36px 44px;
      max-width: 640px;
      width: 100%;
      box-shadow: 0 25px 60px -10px rgba(15, 23, 42, 0.12);
      display: flex;
      flex-direction: column;
      gap: 28px;
      align-items: center;
      text-align: center;
    }

    .welcome-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .welcome-title {
      font-size: 1.8rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
      letter-spacing: -0.5px;
    }

    .welcome-subtitle {
      font-size: 0.96rem;
      color: #64748b;
      margin: 0;
      max-width: 480px;
      line-height: 1.45;
    }

    .welcome-actions-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
    }

    .btn-welcome-primary {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 20px;
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s ease;
      box-shadow: 0 6px 20px rgba(37, 99, 235, 0.25);
      width: 100%;
      box-sizing: border-box;
    }

    .btn-welcome-primary:hover {
      background: #1d4ed8;
      transform: translateY(-1px);
    }

    .btn-welcome-secondary {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 20px;
      background: #f8fafc;
      color: #1e293b;
      border: 1.5px solid #e2e8f0;
      border-radius: 12px;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s ease;
      width: 100%;
      box-sizing: border-box;
    }

    .btn-welcome-secondary:hover {
      background: #ffffff;
      border-color: #3b82f6;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
      transform: translateY(-1px);
    }

    .btn-welcome-secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: #f1f5f9;
      border-color: #e2e8f0;
      color: #94a3b8;
      box-shadow: none;
      transform: none;
    }

    .file-upload-label {
      cursor: pointer;
    }

    .action-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .action-text strong {
      font-size: 0.98rem;
      font-weight: 700;
    }

    .action-text span {
      font-size: 0.82rem;
      opacity: 0.8;
      font-weight: 400;
    }

    .welcome-footer {
      font-size: 0.82rem;
      color: #94a3b8;
      border-top: 1px solid #f1f5f9;
      padding-top: 16px;
      width: 100%;
    }

    /* ── FULL STUDIO WORKSPACE ── */
    .studio-workspace-container {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 72px);
      width: 100%;
      background: #f8fafc;
      color: #0f172a;
      overflow: hidden;
    }

    .workspace-bar {
      height: 42px;
      padding: 0 16px;
      background: #ffffff;
      border-bottom: 1.5px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      z-index: 10;
      position: relative;
    }

    .brand-title {
      display: flex;
      align-items: center;
      min-width: 140px;
    }

    .brand-name {
      font-weight: 800;
      font-size: 14.5px;
      color: #0f172a;
      letter-spacing: -0.3px;
    }

    /* Center layout switcher icons */
    .layout-icon-group-center {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      background: #f1f5f9;
      padding: 2px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      gap: 2px;
      align-items: center;
    }
    .mobile-panel-tabs { display: none; }

    .btn-layout-icon {
      background: transparent;
      color: #64748b;
      border: none;
      border-radius: 6px;
      width: 28px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-layout-icon:hover {
      background: #ffffff;
      color: #0f172a;
    }

    .btn-layout-icon.active {
      background: #ffffff;
      color: #2563eb;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .workspace-right-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }

    .btn-top-save {
      background: #eff6ff;
      color: #2563eb;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 4px 12px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-top-save:hover {
      background: #dbeafe;
    }

    .btn-top-close {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 12px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-top-close:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    /* HORIZONTAL WORKSPACE BODY */
    .workspace-body {
      flex: 1;
      display: flex;
      width: 100%;
      height: calc(100vh - 42px);
      overflow: hidden;
      position: relative;
      background: #f8fafc;
    }

    .panel-wrapper {
      height: 100%;
      overflow: hidden;
      background: #ffffff;
    }

    .flex-grow {
      flex: 1;
    }

    .splitter {
      width: 6px;
      height: 100%;
      background: #f1f5f9;
      border-left: 1px solid #e2e8f0;
      border-right: 1px solid #e2e8f0;
      cursor: col-resize;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
      z-index: 5;
    }

    .splitter:hover {
      background: #3b82f6;
    }

    .drag-handle {
      width: 2px;
      height: 24px;
      background: #cbd5e1;
      border-radius: 1px;
    }
    @media (max-width: 700px) {
      .r-studio-shell, .vscode-welcome-screen, .studio-workspace-container { min-height: calc(100dvh - 56px); height: calc(100dvh - 56px); }
      .vscode-welcome-screen { padding: 14px 12px; align-items: flex-start; }
      .welcome-card-box { padding: 22px 16px; gap: 16px; border-radius: 15px; }
      .welcome-title { font-size: 1.4rem; }
      .welcome-subtitle, .welcome-footer { display: none; }
      .btn-welcome-primary, .btn-welcome-secondary { padding: 11px 13px; gap: 10px; }
      .action-text strong { font-size: .86rem; }
      .action-text span { font-size: .7rem; }
      .workspace-bar { height: 38px; padding: 0 8px; }
      .brand-title { min-width: 0; }
      .brand-name { display: none; }
      .layout-icon-group-center { display: none; }
      .mobile-panel-tabs { display: grid; grid-template-columns: repeat(3, 1fr); width: 144px; padding: 2px; border: 1px solid #dbe3ef; border-radius: 7px; background: #f1f5f9; }
      .mobile-panel-tabs button { border: 0; border-radius: 5px; padding: 4px 5px; background: transparent; color: #64748b; font-size: .67rem; font-weight: 700; }
      .mobile-panel-tabs button.active { background: #fff; color: #2563eb; box-shadow: 0 1px 3px rgba(15,23,42,.12); }
      .btn-top-save, .btn-top-close { padding: 4px 8px; font-size: .68rem; }
      .workspace-body { height: auto; overflow: hidden; display: block; }
      .panel-wrapper, .panel-wrapper.flex-grow { width: 100% !important; height: 100%; min-height: 0; }
      .mobile-panel-hidden { display: none; }
      .splitter { display: none; }
    }
  `]
})
export class RPlotStudioComponent implements OnInit, OnDestroy {
  showWelcomeScreen = true;
  mobilePanel: 'data' | 'code' | 'plot' = 'data';
  readonly isMobileViewport = typeof window !== 'undefined' && window.innerWidth <= 700;
  panelConfig!: PanelConfig;
  isWizardOpen = false;
  currentProjectId: string | null = null;
  currentProjectTitle = '';
  private subs: Subscription[] = [];

  draggingSplitter: 'splitter1' | 'splitter2' | null = null;
  dragStartX = 0;

  constructor(
    private rSyncService: RPlotSyncService,
    private plotProjects: PlotProjectService,
    public auth: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    const queuedProject = this.plotProjects.consumeQueuedOpen();
    if (queuedProject) {
      this.rSyncService.loadProjectDocument(queuedProject.project_json);
      this.currentProjectId = queuedProject.id;
      this.currentProjectTitle = queuedProject.title;
      this.showWelcomeScreen = false;
    }
    this.subs.push(
      this.rSyncService.panelConfig$.subscribe(cfg => {
        this.panelConfig = cfg;
      }),
      this.rSyncService.wizardOpen$.subscribe(isOpen => {
        if (this.isMobileViewport && this.isWizardOpen && !isOpen) this.mobilePanel = 'plot';
        this.isWizardOpen = isOpen;
      })
    );
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  returnToWelcome() {
    this.showWelcomeScreen = true;
  }

  openFromMyData() {
    if (!this.auth.isLoggedIn) return;
    void this.router.navigate(['/data/plot-projects']);
  }

  async onSaveClick() {
    if (!this.auth.isLoggedIn) {
      alert('Please sign in to save R-Plot Studio projects to My Data.');
      return;
    }
    if (this.auth.isDemo) {
      this.auth.notifyDemoUnavailable('Saving R-Plot Studio projects to My Data');
      return;
    }
    const title = prompt('Save Plot Project to My Data', this.currentProjectTitle || 'Untitled Plot Project');
    if (!title?.trim()) return;
    try {
      const project = this.rSyncService.createProjectDocument();
      const saved = this.currentProjectId
        ? await this.plotProjects.update(this.currentProjectId, title.trim(), project)
        : await this.plotProjects.save(title.trim(), project);
      this.currentProjectId = saved.id;
      this.currentProjectTitle = saved.title;
      alert(this.currentProjectId ? 'Saved to My Data. Excel and R files are available from My Data → R-Plot Studio.' : 'Saved to My Data.');
    } catch (error) {
      console.error('Failed to save plot project', error);
      alert('Could not save the plot project. Please try again.');
    }
  }

  launchGuidedWizard() {
    this.showWelcomeScreen = false;
    this.currentProjectId = null;
    this.currentProjectTitle = '';
    this.rSyncService.openWizard();
  }

  launchManualScratchpad() {
    this.showWelcomeScreen = false;
    this.currentProjectId = null;
    this.currentProjectTitle = '';
    this.rSyncService.loadManualScratchpad();
  }

  onWelcomeFileImport(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    if (file.name.endsWith('.R') || file.name.endsWith('.r')) {
      reader.onload = (e: any) => {
        const text = e.target.result;
        this.showWelcomeScreen = false;
        this.rSyncService.parseRCodeAndUpdateState(text);
      };
      reader.readAsText(file);
    } else {
      void this.rSyncService.setSourceWorkbook(file);
      reader.onload = (e: any) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const workbookSheets: Record<string, Array<Record<string, any>>> = {};
          workbook.SheetNames.forEach(sheetName => {
            workbookSheets[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }) as Array<Record<string, any>>;
          });
          this.rSyncService.setWorkbookSheets(workbookSheets);
          const sheetName = workbook.SheetNames[0];
          const json: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

          if (!json || json.length < 2) return;

          const headers = json[0].map((h: any, idx: number) => String(h || `Col_${idx + 1}`).trim());
          const parsedRows: Array<Record<string, any>> = [];

          for (let i = 1; i < json.length; i++) {
            const rowArr = json[i];
            if (!rowArr || rowArr.length === 0) continue;
            const rowObj: Record<string, any> = {};
            headers.forEach((h: string, cIdx: number) => {
              const rawVal = rowArr[cIdx];
              if (rawVal === undefined || rawVal === null || rawVal === '') {
                rowObj[h] = '';
              } else {
                const num = Number(rawVal);
                rowObj[h] = !isNaN(num) && String(rawVal).trim() !== '' ? num : rawVal;
              }
            });
            parsedRows.push(rowObj);
          }

          const groupCol = headers.find(h => h.toLowerCase() === 'group' || h.toLowerCase() === 'condition' || h.toLowerCase() === 'genotype') || '';
          const errCol = headers.find(h => h.toLowerCase() === 'sd' || h.toLowerCase() === 'se' || h.toLowerCase() === 'sem') || '';
          const yCol = headers.find(h => h !== headers[0] && h !== groupCol && h !== errCol) || headers[1] || headers[0];

          this.showWelcomeScreen = false;
          this.rSyncService.setData(headers, parsedRows);
          this.rSyncService.updatePlotState({
            xColumn: headers[0],
            yColumn: yCol,
            groupColumn: groupCol,
            errorColumn: errCol
          });
        } catch (err) {
          console.error('Error importing file:', err);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }

  setLayoutMode(mode: '3-split' | 'data-plot' | 'full-plot') {
    if (mode === '3-split') {
      this.rSyncService.updatePanelConfig({
        layoutMode: '3-split',
        showData: true, showCode: true, showPlot: true,
        dataWidth: 28, codeWidth: 32, plotWidth: 40
      });
    } else if (mode === 'data-plot') {
      this.rSyncService.updatePanelConfig({
        layoutMode: 'data-plot',
        showData: true, showCode: false, showPlot: true,
        dataWidth: 40, plotWidth: 60
      });
    } else if (mode === 'full-plot') {
      this.rSyncService.updatePanelConfig({
        layoutMode: 'full-plot',
        showData: false, showCode: false, showPlot: true,
        plotWidth: 100
      });
    }
  }

  startDrag(splitter: 'splitter1' | 'splitter2', event: MouseEvent) {
    this.draggingSplitter = splitter;
    this.dragStartX = event.clientX;
    event.preventDefault();
  }

  onMouseMove(event: MouseEvent) {
    if (!this.draggingSplitter) return;

    const deltaX = event.clientX - this.dragStartX;
    this.dragStartX = event.clientX;
    const windowWidth = window.innerWidth;
    const deltaPercent = (deltaX / windowWidth) * 100;

    if (this.draggingSplitter === 'splitter1') {
      const newObj = {
        dataWidth: Math.max(15, Math.min(60, this.panelConfig.dataWidth + deltaPercent)),
        codeWidth: Math.max(15, Math.min(60, this.panelConfig.codeWidth - deltaPercent))
      };
      this.rSyncService.updatePanelConfig(newObj);
    } else if (this.draggingSplitter === 'splitter2') {
      const newObj = {
        codeWidth: Math.max(15, Math.min(60, this.panelConfig.codeWidth + deltaPercent)),
        plotWidth: Math.max(20, Math.min(80, this.panelConfig.plotWidth - deltaPercent))
      };
      this.rSyncService.updatePanelConfig(newObj);
    }
  }

  onMouseUp() {
    this.draggingSplitter = null;
  }
}
