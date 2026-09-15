import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { RPlotSyncService, PlotState } from '../../services/r-plot-sync.service';

@Component({
  selector: 'app-r-code-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="r-code-editor-container">
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-title">
          <span>2. R Script Editor<ng-container *ngIf="plots.length > 1"> (Plot {{ activePlotIndex + 1 }}{{ activePlot?.figureTag ? ' ' + activePlot?.figureTag : '' }})</ng-container></span>
        </div>
        <div class="header-actions">
          <input #rImport type="file" accept=".r,.R" class="hidden-file-input" (change)="importRFile($event)">
          <button type="button" class="btn-download" (click)="rImport.click()">Import .R</button>
          <button type="button" class="btn-download" (click)="downloadRFile()">
            Export .R Script
          </button>
        </div>
      </div>
      <div class="source-status" *ngIf="sourceMode">
        R source mode · the Data Sheet on the left is the editable input
      </div>

      <!-- Syntax Code Area (Clean Editor) -->
      <div class="editor-area">
        <textarea
          [(ngModel)]="rCode"
          (ngModelChange)="onCodeInputChange($event)"
          class="code-textarea"
          spellcheck="false"
          placeholder="# Type or paste R ggplot2 script here..."
        ></textarea>
      </div>
    </div>
  `,
  styles: [`
    .r-code-editor-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #ffffff;
      color: #0f172a;
      font-family: 'Fira Code', 'Cascadia Code', Consolas, Monaco, monospace;
      border-right: 1.5px solid #e2e8f0;
      overflow: hidden;
    }

    .panel-header {
      padding: 8px 14px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }

    .panel-title {
      font-weight: 700;
      font-size: 13px;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .header-actions {
      display: flex;
      gap: 6px;
    }

    .btn-copy {
      background: #ffffff;
      color: #059669;
      border: 1px solid #a7f3d0;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
      font-family: system-ui, sans-serif;
      font-weight: 600;
      transition: all 0.15s;
    }

    .btn-copy:hover {
      background: #ecfdf5;
    }

    .btn-download {
      background: #eff6ff;
      color: #2563eb;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
      font-family: system-ui, sans-serif;
      font-weight: 600;
      transition: all 0.15s;
    }
    .btn-run { background:#166534; color:white; border:1px solid #166534; border-radius:6px; padding:4px 10px; font-size:11px; cursor:pointer; font-family:system-ui,sans-serif; font-weight:700; }
    .btn-run:disabled { opacity:.62; cursor:wait; }
    .hidden-file-input { display:none; }
    .source-status { padding:5px 14px; border-bottom:1px solid #dbeafe; background:#eff6ff; color:#1d4ed8; font:600 11px system-ui,sans-serif; }

    .btn-download:hover {
      background: #dbeafe;
    }

    .editor-area {
      flex: 1;
      position: relative;
      background: #ffffff;
      padding: 10px;
    }

    .code-textarea {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      color: #1e293b;
      font-family: inherit;
      font-size: 12px;
      line-height: 1.6;
      padding: 10px;
      resize: none;
      outline: none;
      white-space: pre;
    }

    .code-textarea:focus {
      border-color: #2563eb;
      background: #ffffff;
    }
  `]
})
export class RCodeEditorComponent implements OnInit, OnDestroy {
  rCode: string = '';
  copied: boolean = false;
  plots: PlotState[] = [];
  activePlotIndex: number = 0;
  sourceMode = false;
  private subs: Subscription[] = [];

  get activePlot(): PlotState | undefined {
    return this.plots[this.activePlotIndex];
  }

  constructor(private rSyncService: RPlotSyncService) {}

  ngOnInit() {
    this.subs.push(
      this.rSyncService.rCode$.subscribe(code => {
        this.rCode = code;
      }),
      this.rSyncService.plots$.subscribe(plots => {
        this.plots = plots;
      }),
      this.rSyncService.activePlotIndex$.subscribe(idx => {
        this.activePlotIndex = idx;
      }),
      this.rSyncService.rSourceMode$.subscribe(mode => { this.sourceMode = mode; })
    );
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  onCodeInputChange(newCode: string) {
    this.rSyncService.parseRCodeAndUpdateState(newCode);
  }

  importRFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.rSyncService.parseRCodeAndUpdateState(String(reader.result || ''));
    };
    reader.readAsText(file);
    (event.target as HTMLInputElement).value = '';
  }

  copyCode() {
    navigator.clipboard.writeText(this.rCode);
    this.copied = true;
    setTimeout(() => this.copied = false, 2000);
  }

  downloadRFile() {
    const blob = new Blob([this.rCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'publication_figure.R';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
