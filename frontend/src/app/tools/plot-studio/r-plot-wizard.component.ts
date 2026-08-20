import { Component, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { RPlotSyncService, PlotState } from '../../services/r-plot-sync.service';
import { RPlotPreviewComponent } from './r-plot-preview.component';

interface PaletteDef {
  key: string;
  name: string;
  colors: string[];
}

@Component({
  selector: 'app-r-plot-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, RPlotPreviewComponent],
  template: `
    <div class="wizard-modal-overlay">
      <div class="wizard-modal-card">
        <!-- Header (Clean, No verbose subtitle) -->
        <div class="wizard-header">
          <div class="header-left">
            <h2 class="wizard-title">Guided Plot Generator</h2>
          </div>
          <button type="button" class="btn-close" (click)="close()">Close</button>
        </div>

        <!-- 4-Step Indicator -->
        <div class="step-indicator-bar">
          <div class="step-badge" [class.active]="step === 1" [class.completed]="step > 1" (click)="goToStep(1)">
            <span class="step-num">1</span>
            <span class="step-label">Title & Info</span>
          </div>
          <div class="step-divider"></div>
          <div class="step-badge" [class.active]="step === 2" [class.completed]="step > 2" (click)="canGoStep(2) && goToStep(2)">
            <span class="step-num">2</span>
            <span class="step-label">Data Sheet</span>
          </div>
          <div class="step-divider"></div>
          <div class="step-badge" [class.active]="step === 3" [class.completed]="step > 3" (click)="canGoStep(3) && goToStep(3)">
            <span class="step-num">3</span>
            <span class="step-label">Plot Type</span>
          </div>
          <div class="step-divider"></div>
          <div class="step-badge" [class.active]="step === 4" (click)="canGoStep(4) && goToStep(4)">
            <span class="step-num">4</span>
            <span class="step-label">Theme & Palette</span>
          </div>
        </div>

        <!-- Step Body -->
        <div class="wizard-body">

          <!-- ============================================== -->
          <!-- STEP 1: CONVERSATIONAL & FRIENDLY TITLE/TAG/CAPTION -->
          <!-- ============================================== -->
          <div *ngIf="step === 1" class="step-panel step-1-container">
            <div class="step-1-card">
              <div class="step-1-header">
                <h3 class="step-1-title">Define Your Figure Details</h3>
                <p class="step-1-desc">Enter your title and panel labels. These will automatically format the R script and figure layout.</p>
              </div>

              <!-- Question 1: Title -->
              <div class="question-block">
                <div class="question-header">
                  <span class="q-badge">Required</span>
                  <label class="q-label">What is your figure title?</label>
                </div>
                <input
                  type="text"
                  [(ngModel)]="currentPlot.title"
                  class="q-input-main"
                  placeholder="e.g. Relative Gene Expression Level"
                  autofocus
                />
              </div>

              <!-- Question 2: Figure Tag -->
              <div class="question-block">
                <div class="question-header">
                  <span class="q-badge optional">Optional</span>
                  <label class="q-label">Do you need a Figure Tag / Panel Label?</label>
                </div>
                <div class="q-sub-desc">Specify (A), (B), or Fig 1A for multi-panel publication layouts.</div>
                <input
                  type="text"
                  [(ngModel)]="currentPlot.figureTag"
                  class="q-input"
                  placeholder="e.g. (A)"
                />
              </div>

              <!-- Question 3: Subtitle / Caption -->
              <div class="question-block">
                <div class="question-header">
                  <span class="q-badge optional">Optional</span>
                  <label class="q-label">Do you need a subtitle or description caption?</label>
                </div>
                <div class="q-sub-desc">Add experimental details or sample size (e.g. n=3 biological replicates).</div>
                <input
                  type="text"
                  [(ngModel)]="currentPlot.subtitle"
                  class="q-input"
                  placeholder="e.g. Quantitative RT-PCR analysis (n=3 biological replicates)"
                />
              </div>
            </div>
          </div>

          <!-- ============================================== -->
          <!-- STEP 2: DATA SHEET (EXCEL / MANUAL) -->
          <!-- ============================================== -->
          <div *ngIf="step === 2" class="step-panel">
            <div class="panel-header-row">
              <div class="panel-section-title">Input Data or Import Spreadsheet</div>
              <label class="btn-import-excel">
                Import Excel / CSV
                <input type="file" (change)="onFileSelected($event)" accept=".xlsx, .xls, .csv" style="display:none;" />
              </label>
            </div>

            <!-- Paste Input Area -->
            <div class="paste-row">
              <div class="paste-title">
                <span>Paste cells copied from Excel / CSV:</span>
              </div>
              <textarea
                [(ngModel)]="pasteText"
                (ngModelChange)="onPasteTextChange()"
                placeholder="Copy a table from Excel/CSV and paste (Ctrl+V / Cmd+V) here..."
                class="paste-box"
                rows="2"
              ></textarea>
            </div>

            <!-- Spreadsheet Grid Preview -->
            <div class="grid-card" *ngIf="columns.length > 0">
              <div class="grid-toolbar">
                <span class="grid-count">{{ rows.length }} Rows, {{ columns.length }} Columns</span>
                <div class="grid-btn-group">
                  <button type="button" class="btn-grid-act" (click)="addRow()">+ Add Row</button>
                  <button type="button" class="btn-grid-act" (click)="addColumn()">+ Add Column</button>
                </div>
              </div>

              <div class="table-container">
                <table class="wizard-grid-table">
                  <thead>
                    <tr>
                      <th class="th-num">#</th>
                      <th *ngFor="let col of columns; let cIdx = index" class="th-col-hdr">
                        <div class="col-hdr-wrap">
                          <input type="text" [ngModel]="col" (ngModelChange)="renameColumn(cIdx, $event)" class="col-hdr-input" />
                          <button
                            type="button"
                            class="btn-del-col"
                            *ngIf="columns.length > 1"
                            (click)="deleteColumn(cIdx)"
                            title="Delete column">
                            ×
                          </button>
                        </div>
                      </th>
                      <th class="th-del-act" *ngIf="rows.length > 1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let row of rows; let rIdx = index">
                      <td class="td-num">{{ rIdx + 1 }}</td>
                      <td *ngFor="let col of columns">
                        <input type="text" [ngModel]="row[col]" (ngModelChange)="onCellChange(rIdx, col, $event)" class="cell-val-input" />
                      </td>
                      <td class="td-del-act" *ngIf="rows.length > 1">
                        <button
                          type="button"
                          class="btn-del-row"
                          (click)="deleteRow(rIdx)"
                          title="Delete row">
                          ×
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div *ngIf="errorMessage" class="error-box">{{ errorMessage }}</div>
          </div>

          <!-- ============================================== -->
          <!-- STEP 3: PLOT TYPE & MAPPING + LIVE PREVIEW -->
          <!-- ============================================== -->
          <div *ngIf="step === 3" class="step-panel split-layout">
            <!-- Left Side: Controls -->
            <div class="split-left">
              <div class="panel-section-title">Plot Type & Variable Mapping</div>

              <div class="plot-type-row">
                <button
                  type="button"
                  class="type-btn"
                  [class.active]="currentPlot.chartType === 'bar'"
                  (click)="setChartType('bar')">
                  Bar Chart
                  <span class="info-bubble" data-tooltip="Categorical comparisons & error bars">?</span>
                </button>
                <button
                  type="button"
                  class="type-btn"
                  [class.active]="currentPlot.chartType === 'line'"
                  (click)="setChartType('line')">
                  Line Plot
                  <span class="info-bubble" data-tooltip="Time courses, kinetics, continuous trends">?</span>
                </button>
                <button
                  type="button"
                  class="type-btn"
                  [class.active]="currentPlot.chartType === 'scatter'"
                  (click)="setChartType('scatter')">
                  Scatter Plot
                  <span class="info-bubble" data-tooltip="Standard curves, correlations">?</span>
                </button>
                <button
                  type="button"
                  class="type-btn"
                  [class.active]="currentPlot.chartType === 'boxplot'"
                  (click)="setChartType('boxplot')">
                  Boxplot
                  <span class="info-bubble" data-tooltip="Data distributions & quartiles">?</span>
                </button>
              </div>

              <div class="mapping-box">
                <div class="form-field">
                  <label>X-Axis (Horizontal):
                    <span class="info-bubble" data-tooltip="Column for the horizontal axis">?</span>
                  </label>
                  <select [(ngModel)]="currentPlot.xColumn" (ngModelChange)="onMappingUpdated()" class="form-select">
                    <option *ngFor="let col of columns" [value]="col">{{ col }}</option>
                  </select>
                </div>

                <div class="form-field">
                  <label>Y-Axis (Vertical):
                    <span class="info-bubble" data-tooltip="Measurement column for vertical axis">?</span>
                  </label>
                  <select [(ngModel)]="currentPlot.yColumn" (ngModelChange)="onMappingUpdated()" class="form-select">
                    <option *ngFor="let col of numericColumns" [value]="col">{{ col }} (numeric)</option>
                    <ng-container *ngIf="numericColumns.length === 0">
                      <option *ngFor="let col of columns" [value]="col">{{ col }}</option>
                    </ng-container>
                  </select>
                </div>

                <div class="form-field">
                  <label>Group / Fill (Subgroups):
                    <span class="info-bubble" data-tooltip="Column to group conditions or genotypes side-by-side">?</span>
                  </label>
                  <select [(ngModel)]="currentPlot.groupColumn" (ngModelChange)="onMappingUpdated()" class="form-select">
                    <option value="">(None - Single Color)</option>
                    <option *ngFor="let col of columns" [value]="col">{{ col }}</option>
                  </select>
                </div>

                <div class="form-field" *ngIf="currentPlot.chartType === 'bar' || currentPlot.chartType === 'line'">
                  <label>Error Bar (SD/SE):
                    <span class="info-bubble" data-tooltip="Standard Deviation or Standard Error column">?</span>
                  </label>
                  <select [(ngModel)]="currentPlot.errorColumn" (ngModelChange)="onMappingUpdated()" class="form-select">
                    <option value="">(None - No Error Bars)</option>
                    <option *ngFor="let col of numericColumns" [value]="col">{{ col }}</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Right Side: Live Preview Plot -->
            <div class="split-right">
              <div class="preview-header-label">Live Preview</div>
              <app-r-plot-preview [plotState]="currentPlot" [data]="rows"></app-r-plot-preview>
            </div>
          </div>

          <!-- ============================================== -->
          <!-- STEP 4: THEME, LABELS & PALETTE (CLEAN + CUSTOM PALETTE) -->
          <!-- ============================================== -->
          <div *ngIf="step === 4" class="step-panel split-layout">
            <!-- Left Side: Controls -->
            <div class="split-left">
              <div class="panel-section-title">Journal Theme, Font & Color Palette</div>

              <div class="mapping-box">
                <!-- Theme (Clean, No Parentheses) -->
                <div class="form-field">
                  <label>Journal Theme:</label>
                  <select [(ngModel)]="currentPlot.theme" (ngModelChange)="onThemeUpdated()" class="form-select">
                    <option value="classic">Classic (Color)</option>
                    <option value="bw">Black & White</option>
                    <option value="dark">Dark Mode</option>
                  </select>
                </div>

                <!-- Font Family (Clean, No Parentheses) -->
                <div class="form-field">
                  <label>Font Family:</label>
                  <select [(ngModel)]="currentPlot.fontFamily" (ngModelChange)="onThemeUpdated()" class="form-select">
                    <option value="Inter, sans-serif">Inter</option>
                    <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica</option>
                    <option value="'Times New Roman', serif">Times New Roman</option>
                    <option value="Arial, sans-serif">Arial</option>
                  </select>
                </div>

                <!-- Legend Position -->
                <div class="form-field">
                  <label>Legend Position:</label>
                  <select [(ngModel)]="currentPlot.legendPosition" (ngModelChange)="onThemeUpdated()" class="form-select">
                    <option value="right">Right</option>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                    <option value="left">Left</option>
                    <option value="none">Hide Legend</option>
                  </select>
                </div>

                <!-- Axis Labels -->
                <div class="form-row-2">
                  <div class="form-field">
                    <label>X-Axis Label:</label>
                    <input type="text" [(ngModel)]="currentPlot.xLabel" (ngModelChange)="onThemeUpdated()" class="form-input" />
                  </div>
                  <div class="form-field">
                    <label>Y-Axis Label:</label>
                    <input type="text" [(ngModel)]="currentPlot.yLabel" (ngModelChange)="onThemeUpdated()" class="form-input" />
                  </div>
                </div>

                <!-- Color Palette (Expanded + Custom Builder) -->
                <div class="form-field">
                  <label>Color Palette:</label>
                  <div class="palette-grid">
                    <div
                      class="palette-card"
                      *ngFor="let pal of paletteOptions"
                      [class.selected]="selectedPaletteKey === pal.key"
                      (click)="setPalette(pal)">
                      <span class="pal-title">{{ pal.name }}</span>
                      <div class="pal-dots">
                        <span *ngFor="let c of pal.colors" class="pal-dot" [style.background]="c"></span>
                      </div>
                    </div>
                  </div>

                  <!-- Custom Palette Color Picker & Editor -->
                  <div class="custom-palette-editor" *ngIf="selectedPaletteKey === 'custom'">
                    <div class="custom-colors-list">
                      <div *ngFor="let c of customColors; let cIdx = index" class="custom-color-chip">
                        <input
                          type="color"
                          [ngModel]="c"
                          (ngModelChange)="onCustomColorChange(cIdx, $event)"
                          class="color-picker-input"
                        />
                        <button
                          type="button"
                          class="btn-del-custom-color"
                          *ngIf="customColors.length > 1"
                          (click)="removeCustomColor(cIdx)"
                          title="Delete color">
                          x
                        </button>
                      </div>
                      <button type="button" class="btn-add-custom-color" (click)="addCustomColor()" title="Add color">
                        + Add
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            </div>

            <!-- Right Side: Live Preview Plot -->
            <div class="split-right">
              <div class="preview-header-label">Live Preview</div>
              <app-r-plot-preview [plotState]="currentPlot" [data]="rows"></app-r-plot-preview>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="wizard-footer">
          <button
            type="button"
            class="btn-secondary"
            *ngIf="step > 1"
            (click)="prevStep()">
            Previous Step
          </button>

          <div class="footer-spacer"></div>

          <button
            type="button"
            class="btn-primary"
            *ngIf="step < 4"
            (click)="nextStep()"
            [disabled]="!canProceedStep(step)">
            Next Step
          </button>

          <button
            type="button"
            class="btn-success"
            *ngIf="step === 4"
            (click)="finishWizard()">
            Finish & Open Studio
          </button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .wizard-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(6px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .wizard-modal-card {
      width: 1000px;
      max-width: 96vw;
      height: 700px;
      max-height: 92vh;
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 60px -10px rgba(15, 23, 42, 0.2);
      color: #0f172a;
      overflow: hidden;
    }

    .wizard-header {
      padding: 14px 24px;
      background: #ffffff;
      border-bottom: 1.5px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .wizard-title {
      margin: 0;
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.3px;
    }

    .btn-close {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      color: #475569;
      padding: 5px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 11.5px;
      font-weight: 600;
      transition: all 0.15s;
    }

    .btn-close:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    .step-indicator-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 28px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }

    .step-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      opacity: 0.6;
      transition: all 0.2s;
    }

    .step-badge.active {
      opacity: 1;
    }

    .step-badge.completed {
      opacity: 0.95;
    }

    .step-num {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #e2e8f0;
      color: #475569;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11.5px;
      font-weight: 700;
    }

    .step-badge.active .step-num {
      background: #2563eb;
      color: #ffffff;
    }

    .step-badge.completed .step-num {
      background: #10b981;
      color: #ffffff;
    }

    .step-label {
      font-size: 12px;
      font-weight: 700;
      color: #334155;
    }

    .step-badge.active .step-label {
      color: #2563eb;
    }

    .step-divider {
      flex: 1;
      height: 1.5px;
      background: #e2e8f0;
      margin: 0 14px;
    }

    .wizard-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px 24px;
      background: #ffffff;
    }

    /* STEP 1: CONVERSATIONAL & WARM DESIGN */
    .step-1-container {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
    }

    .step-1-card {
      background: #ffffff;
      border: 1.5px solid #e2e8f0;
      border-radius: 14px;
      padding: 28px 36px;
      max-width: 620px;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 22px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.05);
    }

    .step-1-header {
      display: flex;
      flex-direction: column;
      gap: 6px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 16px;
    }

    .step-1-title {
      font-size: 1.2rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
    }

    .step-1-desc {
      font-size: 0.88rem;
      color: #64748b;
      margin: 0;
      line-height: 1.45;
    }

    .question-block {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .question-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .q-badge {
      background: #2563eb;
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 4px;
    }

    .q-badge.optional {
      background: #f1f5f9;
      color: #64748b;
      border: 1px solid #cbd5e1;
    }

    .q-label {
      font-size: 0.95rem;
      font-weight: 700;
      color: #0f172a;
    }

    .q-sub-desc {
      font-size: 0.8rem;
      color: #64748b;
    }

    .q-input-main {
      background: #ffffff;
      border: 1.5px solid #2563eb;
      color: #0f172a;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 0.95rem;
      font-weight: 500;
      outline: none;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }

    .q-input {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #0f172a;
      border-radius: 8px;
      padding: 9px 12px;
      font-size: 0.9rem;
      outline: none;
    }

    .q-input:focus {
      border-color: #2563eb;
    }

    /* STEP 2 DATA SHEET */
    .panel-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 8px;
    }

    .panel-section-title {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }

    .btn-import-excel {
      background: #2563eb;
      color: #ffffff;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-import-excel:hover {
      background: #1d4ed8;
    }

    .paste-row {
      margin-bottom: 12px;
    }

    .paste-title {
      font-size: 11.5px;
      font-weight: 700;
      color: #475569;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
    }

    .paste-box {
      width: 100%;
      box-sizing: border-box;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      color: #0f172a;
      padding: 8px 10px;
      font-family: monospace;
      font-size: 11.5px;
      outline: none;
      resize: none;
    }

    .paste-box:focus {
      border-color: #2563eb;
      background: #ffffff;
    }

    .grid-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px;
    }

    .grid-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .grid-count {
      font-size: 11.5px;
      color: #64748b;
      font-weight: 600;
    }

    .grid-btn-group {
      display: flex;
      gap: 6px;
    }

    .btn-grid-act {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 10.5px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-grid-act:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    .table-container {
      max-height: 220px;
      overflow: auto;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }

    .wizard-grid-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11.5px;
    }

    .wizard-grid-table th, .wizard-grid-table td {
      border: 1px solid #e2e8f0;
      padding: 4px 6px;
    }

    .th-col-hdr {
      background: #f8fafc;
    }

    .col-hdr-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 2px;
    }

    .btn-del-col {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .btn-del-col:hover {
      color: #ef4444;
      background: #fee2e2;
    }

    .th-del-act, .td-del-act {
      width: 24px;
      text-align: center;
      padding: 2px 4px;
      background: #f8fafc;
    }

    .btn-del-row {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .btn-del-row:hover {
      color: #ef4444;
      background: #fee2e2;
    }

    .th-num, .td-num {
      background: #f8fafc;
      color: #64748b;
      width: 28px;
      text-align: center;
      font-size: 10.5px;
      font-weight: 600;
    }

    .col-hdr-input {
      background: transparent;
      border: none;
      color: #0f172a;
      font-weight: 700;
      font-size: 11.5px;
      outline: none;
      width: 100%;
    }

    .cell-val-input {
      background: transparent;
      border: none;
      color: #0f172a;
      font-size: 11.5px;
      outline: none;
      width: 100%;
    }

    .error-box {
      margin-top: 8px;
      padding: 8px 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 600;
    }

    /* SPLIT LAYOUT (STEP 3 & 4) */
    .split-layout {
      display: grid;
      grid-template-columns: 380px 1fr;
      gap: 20px;
      height: 100%;
    }

    .split-left {
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
      padding-right: 4px;
    }

    .split-right {
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 100%;
    }

    .preview-header-label {
      font-size: 11.5px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .plot-type-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .type-btn {
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      color: #1e293b;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.15s;
    }

    .type-btn:hover {
      border-color: #3b82f6;
      background: #f8fafc;
    }

    .type-btn.active {
      background: #eff6ff;
      border-color: #2563eb;
      color: #2563eb;
      box-shadow: 0 1px 3px rgba(37, 99, 235, 0.12);
    }

    .info-bubble {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      background: #e2e8f0;
      color: #475569;
      border-radius: 50%;
      font-size: 10px;
      font-weight: 800;
      cursor: help;
      margin-left: 5px;
      transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
      flex-shrink: 0;
      user-select: none;
      vertical-align: middle;
    }

    .info-bubble:hover {
      background: #2563eb;
      color: #ffffff;
      transform: scale(1.15);
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.35);
    }

    /* Instant Custom Tooltip (Zero delay) */
    .info-bubble[data-tooltip]::before {
      content: "";
      position: absolute;
      bottom: calc(100% + 2px);
      left: 50%;
      transform: translateX(-50%) translateY(3px);
      border-width: 5px 5px 0 5px;
      border-style: solid;
      border-color: #0f172a transparent transparent transparent;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.12s cubic-bezier(0.4, 0, 0.2, 1), transform 0.12s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
      z-index: 1000;
    }

    .info-bubble[data-tooltip]::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: calc(100% + 7px);
      left: 50%;
      transform: translateX(-50%) translateY(3px);
      background: #0f172a;
      color: #ffffff;
      font-size: 11px;
      font-weight: 500;
      line-height: 1.35;
      padding: 5px 9px;
      border-radius: 6px;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.3);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.12s cubic-bezier(0.4, 0, 0.2, 1), transform 0.12s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
      z-index: 1000;
    }

    .info-bubble:hover[data-tooltip]::before,
    .info-bubble:hover[data-tooltip]::after {
      opacity: 1;
      visibility: visible;
      transform: translateX(-50%) translateY(0);
    }

    /* Alignment adjustments for edge elements to prevent clipping */
    .plot-type-row .type-btn:nth-child(even) .info-bubble[data-tooltip]::after {
      left: auto;
      right: -6px;
      transform: translateY(3px);
    }
    .plot-type-row .type-btn:nth-child(even) .info-bubble[data-tooltip]::before {
      left: auto;
      right: 4px;
      transform: translateY(3px);
    }
    .plot-type-row .type-btn:nth-child(even) .info-bubble:hover[data-tooltip]::after,
    .plot-type-row .type-btn:nth-child(even) .info-bubble:hover[data-tooltip]::before {
      transform: translateY(0);
    }

    .mapping-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .form-row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .form-field label {
      font-size: 11.5px;
      color: #334155;
      font-weight: 600;
      display: flex;
      align-items: center;
    }

    .form-input, .form-select {
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      color: #0f172a;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11.5px;
      outline: none;
    }

    .form-input:focus, .form-select:focus {
      border-color: #2563eb;
    }

    /* PALETTE GRID & CUSTOM EDITOR */
    .palette-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .palette-card {
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      padding: 8px 10px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: all 0.15s;
    }

    .palette-card:hover {
      border-color: #3b82f6;
    }

    .palette-card.selected {
      border-color: #2563eb;
      background: #eff6ff;
      box-shadow: 0 1px 3px rgba(37, 99, 235, 0.12);
    }

    .pal-title {
      font-size: 10.5px;
      font-weight: 700;
      color: #0f172a;
    }

    .pal-dots {
      display: flex;
      gap: 4px;
    }

    .pal-dot {
      width: 14px;
      height: 14px;
      border-radius: 3px;
    }

    .custom-palette-editor {
      background: #ffffff;
      border: 1.5px dashed #2563eb;
      border-radius: 8px;
      padding: 10px;
      margin-top: 8px;
    }

    .custom-colors-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .custom-color-chip {
      position: relative;
      display: flex;
      align-items: center;
    }

    .color-picker-input {
      width: 28px;
      height: 28px;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      background: transparent;
      cursor: pointer;
      padding: 0;
    }

    .btn-del-custom-color {
      position: absolute;
      top: -5px;
      right: -5px;
      width: 16px;
      height: 16px;
      background: #ef4444;
      color: #ffffff;
      border: none;
      border-radius: 50%;
      font-size: 10px;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .btn-add-custom-color {
      background: #f1f5f9;
      color: #2563eb;
      border: 1.5px dashed #2563eb;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 10.5px;
      font-weight: 700;
      cursor: pointer;
    }

    .btn-add-custom-color:hover {
      background: #eff6ff;
    }

    /* FOOTER */
    .wizard-footer {
      padding: 14px 24px;
      background: #ffffff;
      border-top: 1.5px solid #e2e8f0;
      display: flex;
      align-items: center;
    }

    .footer-spacer {
      flex: 1;
    }

    .wizard-footer .btn-primary, .wizard-footer .btn-secondary, .wizard-footer .btn-success {
      border: none;
      border-radius: 6px;
      padding: 7px 18px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
      width: auto;
      min-width: 0;
      font-family: inherit;
    }

    .wizard-footer .btn-primary {
      background: #2563eb;
      color: #ffffff;
    }

    .wizard-footer .btn-primary:hover {
      background: #1d4ed8;
    }

    .wizard-footer .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .wizard-footer .btn-secondary {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
    }

    .wizard-footer .btn-secondary:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    .wizard-footer .btn-success {
      background: #10b981;
      color: #ffffff;
    }

    .wizard-footer .btn-success:hover {
      background: #059669;
    }
  `]
})
export class RPlotWizardComponent implements OnInit {
  step: number = 1;
  pasteText: string = '';
  errorMessage: string = '';

  columns: string[] = [];
  rows: Array<Record<string, any>> = [];

  currentPlot!: PlotState;

  paletteOptions: PaletteDef[] = [
    { key: 'npg', name: 'Nature / NPG', colors: ['#E64B35', '#4DBBD5', '#00A087', '#3C5488', '#F39B7F', '#8491B4'] },
    { key: 'science', name: 'Science / AAAS', colors: ['#0072B2', '#D55E00', '#009E73', '#F0E442', '#56B4E9', '#CC79A7'] },
    { key: 'cell', name: 'Cell Press', colors: ['#E11D48', '#F59E0B', '#0284C7', '#10B981', '#7C3AED', '#64748B'] },
    { key: 'nejm', name: 'NEJM / Lancet', colors: ['#BC3C29', '#0072B5', '#E18727', '#20854E', '#7876B1', '#6F99AD'] },
    { key: 'viridis', name: 'Viridis Safe', colors: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
    { key: 'grayscale', name: 'Grayscale', colors: ['#111827', '#374151', '#6B7280', '#9CA3AF', '#D1D5DB'] },
    { key: 'custom', name: 'Custom Palette', colors: ['#2563EB', '#EF4444', '#10B981'] }
  ];
  selectedPaletteKey: string = 'npg';
  customColors: string[] = ['#2563EB', '#EF4444', '#10B981', '#F59E0B'];

  constructor(
    private rSyncService: RPlotSyncService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.columns = [...this.rSyncService.columns];
    this.rows = this.rSyncService.data.map(r => ({ ...r }));
    this.currentPlot = { ...this.rSyncService.activePlot };
    this.currentPlot.title = this.currentPlot.title || '';
    this.currentPlot.figureTag = this.currentPlot.figureTag || '';
    this.currentPlot.subtitle = this.currentPlot.subtitle || '';
  }

  close() {
    this.rSyncService.closeWizard();
  }

  goToStep(s: number) {
    this.step = s;
  }

  canGoStep(targetStep: number): boolean {
    if (targetStep >= 3) return this.columns.length >= 2 && this.rows.length >= 1;
    return true;
  }

  canProceedStep(s: number): boolean {
    if (s === 2) return this.columns.length >= 2 && this.rows.length >= 1;
    return true;
  }

  nextStep() {
    if (this.step === 2) {
      if (!this.currentPlot.xColumn || !this.columns.includes(this.currentPlot.xColumn)) {
        this.currentPlot.xColumn = this.columns[0] || '';
      }
      if (!this.currentPlot.yColumn || !this.columns.includes(this.currentPlot.yColumn)) {
        const numCols = this.numericColumns;
        this.currentPlot.yColumn = numCols.length > 0 ? numCols[0] : (this.columns[1] || this.columns[0]);
      }
      this.currentPlot.xLabel = this.currentPlot.xColumn;
      this.currentPlot.yLabel = this.currentPlot.yColumn;
    }
    if (this.step < 4) this.step++;
  }

  prevStep() {
    if (this.step > 1) this.step--;
  }

  get numericColumns(): string[] {
    return this.columns.filter(col => {
      const sample = this.rows.find(r => r[col] !== undefined && r[col] !== null && r[col] !== '');
      if (!sample) return false;
      return typeof sample[col] === 'number' || (!isNaN(Number(sample[col])) && isFinite(Number(sample[col])));
    });
  }

  setChartType(type: 'bar' | 'scatter' | 'boxplot' | 'line') {
    this.currentPlot.chartType = type;
    this.currentPlot = { ...this.currentPlot };
  }

  onMappingUpdated() {
    this.currentPlot = { ...this.currentPlot };
  }

  onThemeUpdated() {
    this.currentPlot = { ...this.currentPlot };
  }

  setPalette(pal: PaletteDef) {
    this.selectedPaletteKey = pal.key;
    if (pal.key === 'custom') {
      this.currentPlot.palette = [...this.customColors];
    } else {
      this.currentPlot.palette = [...pal.colors];
    }
    this.currentPlot = { ...this.currentPlot };
  }

  onCustomColorChange(idx: number, newColor: string) {
    this.customColors[idx] = newColor;
    this.currentPlot.palette = [...this.customColors];
    this.currentPlot = { ...this.currentPlot };
  }

  addCustomColor() {
    this.customColors.push('#38BDF8');
    this.currentPlot.palette = [...this.customColors];
    this.currentPlot = { ...this.currentPlot };
  }

  removeCustomColor(idx: number) {
    if (this.customColors.length <= 1) return;
    this.customColors.splice(idx, 1);
    this.currentPlot.palette = [...this.customColors];
    this.currentPlot = { ...this.currentPlot };
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.errorMessage = '';
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.ngZone.run(() => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const json: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

          if (!json || json.length < 2) {
            this.errorMessage = 'The file must contain at least 1 header row and 1 data row.';
            this.cdr.detectChanges();
            return;
          }

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

          this.columns = headers;
          this.rows = parsedRows;
          this.currentPlot.xColumn = headers[0];
          this.currentPlot.yColumn = headers[1] || headers[0];
          this.currentPlot = { ...this.currentPlot };
          this.cdr.detectChanges();
        } catch (err: any) {
          this.errorMessage = 'Failed to import file: ' + (err?.message || 'Unknown error');
          this.cdr.detectChanges();
        }
      });
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  }

  onPasteTextChange() {
    if (!this.pasteText || this.pasteText.trim() === '') return;
    const lines = this.pasteText.trim().split('\n');
    if (lines.length < 2) return;

    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const parsedRows: Array<Record<string, any>> = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
      const rowObj: Record<string, any> = {};
      headers.forEach((h, idx) => {
        const val = vals[idx] ?? '';
        const num = Number(val);
        rowObj[h] = !isNaN(num) && val !== '' ? num : val;
      });
      parsedRows.push(rowObj);
    }

    this.columns = headers;
    this.rows = parsedRows;
    this.currentPlot.xColumn = headers[0];
    this.currentPlot.yColumn = headers[1] || headers[0];
    this.currentPlot = { ...this.currentPlot };
    this.cdr.detectChanges();
  }

  addRow() {
    const newRow: Record<string, any> = {};
    this.columns.forEach(col => {
      newRow[col] = typeof this.rows[0]?.[col] === 'number' ? 0 : 'Sample';
    });
    this.rows = [...this.rows, newRow];
  }

  deleteRow(rIdx: number) {
    if (this.rows.length <= 1) return;
    this.rows = this.rows.filter((_, i) => i !== rIdx);
  }

  addColumn() {
    const colName = `Col_${this.columns.length + 1}`;
    this.columns = [...this.columns, colName];
    this.rows = this.rows.map(r => ({ ...r, [colName]: 0 }));
  }

  deleteColumn(cIdx: number) {
    if (this.columns.length <= 1) return;
    const delCol = this.columns[cIdx];
    const newCols = this.columns.filter((_, i) => i !== cIdx);
    const newRows = this.rows.map(r => {
      const u = { ...r };
      delete u[delCol];
      return u;
    });
    this.columns = newCols;
    this.rows = newRows;
    if (this.currentPlot.xColumn === delCol) this.currentPlot.xColumn = newCols[0] || '';
    if (this.currentPlot.yColumn === delCol) this.currentPlot.yColumn = newCols[1] || newCols[0] || '';
    if (this.currentPlot.groupColumn === delCol) this.currentPlot.groupColumn = '';
    if (this.currentPlot.errorColumn === delCol) this.currentPlot.errorColumn = '';
    this.currentPlot = { ...this.currentPlot };
  }

  renameColumn(idx: number, newName: string) {
    const oldName = this.columns[idx];
    if (!newName || oldName === newName) return;

    this.columns[idx] = newName;
    this.rows = this.rows.map(row => {
      const u: Record<string, any> = {};
      Object.keys(row).forEach(k => {
        u[k === oldName ? newName : k] = row[k];
      });
      return u;
    });

    if (this.currentPlot.xColumn === oldName) this.currentPlot.xColumn = newName;
    if (this.currentPlot.yColumn === oldName) this.currentPlot.yColumn = newName;
    this.currentPlot = { ...this.currentPlot };
  }

  onCellChange(rIdx: number, col: string, val: any) {
    const num = Number(val);
    this.rows[rIdx][col] = !isNaN(num) && String(val).trim() !== '' ? num : val;
    this.rows = [...this.rows];
  }

  finishWizard() {
    this.rSyncService.setData(this.columns, this.rows);
    this.rSyncService.setPlots([this.currentPlot]);
    this.close();
  }
}
