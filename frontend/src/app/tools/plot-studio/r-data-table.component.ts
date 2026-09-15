import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { RPlotSyncService, PlotState } from '../../services/r-plot-sync.service';
import { OperationProgressService } from '../../services/operation-progress.service';

@Component({
  selector: 'app-r-data-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="r-data-table-container">
      <!-- Panel Header -->
      <div class="panel-header">
        <div class="panel-title">
          <span>1. Data Sheet<ng-container *ngIf="plots.length > 1"> (Plot {{ activePlotIndex + 1 }}{{ activePlot?.figureTag ? ' ' + activePlot?.figureTag : '' }})</ng-container></span>
        </div>
      </div>

      <!-- Variable Mapping Configuration -->
      <div class="mapping-section" *ngIf="plotState">
        <div class="section-subtitle">Variable Mapping:</div>
        <div class="mapping-grid">
          <div class="map-item">
            <label>X-Axis (x):</label>
            <select [(ngModel)]="plotState.xColumn" (change)="onMappingChange()" class="map-select">
              <option *ngFor="let col of columns" [value]="col">{{ col }}</option>
            </select>
          </div>

          <div class="map-item">
            <label>Y-Axis (y):</label>
            <ng-container *ngIf="usesDerivedYAxis; else editableYAxis">
              <select class="map-select map-select-disabled" disabled>
                <option>{{ derivedYAxisLabel }}</option>
              </select>
            </ng-container>
            <ng-template #editableYAxis>
              <select [(ngModel)]="plotState.yColumn" (change)="onMappingChange()" class="map-select">
                <option *ngFor="let col of columns" [value]="col">{{ col }}</option>
              </select>
            </ng-template>
          </div>

          <div class="map-item">
            <label>Group / Fill:</label>
            <ng-container *ngIf="supportsGroupMapping; else unavailableGroupMapping">
              <select [(ngModel)]="plotState.groupColumn" (change)="onMappingChange()" class="map-select">
                <option value="">(None)</option>
                <option *ngFor="let col of columns" [value]="col">{{ col }}</option>
              </select>
            </ng-container>
            <ng-template #unavailableGroupMapping>
              <select class="map-select map-select-disabled" disabled>
                <option>Not used by this plot</option>
              </select>
            </ng-template>
          </div>

          <div class="map-item">
            <label>Error Bar (SD/SE):</label>
            <ng-container *ngIf="supportsErrorMapping; else unavailableErrorMapping">
              <select [(ngModel)]="plotState.errorColumn" (change)="onMappingChange()" class="map-select">
                <option value="">(None)</option>
                <option *ngFor="let col of columns" [value]="col">{{ col }}</option>
              </select>
            </ng-container>
            <ng-template #unavailableErrorMapping>
              <select class="map-select map-select-disabled" disabled>
                <option>Not used by this plot</option>
              </select>
            </ng-template>
          </div>
        </div>
      </div>

      <!-- Toolbar: Add Row/Col, Excel/CSV Upload/Download -->
      <div class="table-actions">
        <button type="button" class="btn-sm" (click)="addRow()">+ Add Row</button>
        <button type="button" class="btn-sm" (click)="addColumn()">+ Add Column</button>
        <input #importInput type="file" (change)="importFile($event)" accept=".xlsx, .xls, .csv" class="hidden-file-input" />
        <button type="button" class="btn-sm btn-upload" (click)="importInput.click()">Import File</button>
        <button type="button" class="btn-sm btn-export" (click)="exportCSV()">Export CSV</button>
      </div>

      <!-- Spreadsheet Grid Table -->
      <div class="grid-table-wrapper">
        <table class="excel-table">
          <thead>
            <tr>
              <th class="row-num-hdr">#</th>
              <th *ngFor="let col of columns; let i = index; trackBy: trackByIndex" class="col-hdr">
                <input
                  type="text"
                  [ngModel]="col"
                  (ngModelChange)="renameColumn(i, $event)"
                  class="col-hdr-input"
                />
                <button type="button" class="btn-del-col" (click)="deleteColumn(i)" title="Delete Column">x</button>
              </th>
              <th class="col-action-hdr"></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of data; let rIdx = index; trackBy: trackByIndex">
              <td class="row-num">{{ rIdx + 1 }}</td>
              <td *ngFor="let col of columns; trackBy: trackByIndex">
                <input
                  type="text"
                  [value]="row[col]"
                  (input)="updateCellLocally(rIdx, col, $any($event.target).value)"
                  (change)="commitCellChanges()"
                  class="cell-input"
                />
              </td>
              <td class="td-del-row">
                <button type="button" class="btn-del-row" (click)="deleteRow(rIdx)" title="Delete Row">×</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .r-data-table-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #ffffff;
      color: #0f172a;
      font-family: system-ui, -apple-system, sans-serif;
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
    }

    .panel-title {
      font-weight: 700;
      font-size: 13px;
      color: #0f172a;
      display: flex;
      align-items: center;
      white-space: nowrap;
    }

    .mapping-section {
      padding: 10px 14px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }

    .section-subtitle {
      font-size: 11px;
      color: #64748b;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .mapping-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .map-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .map-item label {
      font-size: 10.5px;
      color: #475569;
      font-weight: 600;
    }

    .map-select {
      background: #ffffff;
      color: #0f172a;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 6px;
      font-size: 11px;
      outline: none;
    }

    .map-select:focus {
      border-color: #2563eb;
    }

    .map-select:disabled,
    .map-select-disabled {
      cursor: not-allowed;
      color: #94a3b8;
      background: #f1f5f9;
      border-color: #e2e8f0;
    }

    .table-actions {
      padding: 6px 14px;
      background: #f1f5f9;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      gap: 6px;
      flex-wrap: nowrap;
      align-items: center;
    }

    .btn-sm {
      background: #ffffff;
      color: #334155;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      transition: all 0.15s ease;
    }

    .table-actions .btn-sm {
      height: 32px !important;
      min-height: 32px;
      box-sizing: border-box;
      padding: 0 12px;
      line-height: 1;
      letter-spacing: 0;
      text-transform: none;
      white-space: nowrap;
      flex: 0 0 auto;
      align-self: center;
    }

    .btn-sm:hover {
      background: #f8fafc;
      color: #0f172a;
      border-color: #94a3b8;
    }

    .btn-upload {
      cursor: pointer;
      background: #eff6ff;
      border-color: #bfdbfe;
      color: #2563eb;
      font: inherit;
      font-size: 11px !important;
      font-weight: 600;
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
    }

    .btn-upload:hover {
      background: #dbeafe;
    }

    .hidden-file-input { display: none; }

    .btn-export {
      background: #ecfdf5;
      border-color: #a7f3d0;
      color: #059669;
      margin-left: auto;
    }

    .btn-export:hover {
      background: #d1fae5;
    }

    .grid-table-wrapper {
      flex: 1;
      overflow: auto;
      padding: 8px;
      background: #ffffff;
    }

    .excel-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }

    .excel-table th, .excel-table td {
      border: 1px solid #e2e8f0;
      padding: 0;
      position: relative;
    }

    .row-num-hdr, .row-num {
      background: #f8fafc;
      color: #64748b;
      text-align: center;
      width: 28px;
      font-size: 10px;
      font-weight: 600;
    }

    .col-hdr {
      background: #f8fafc;
      padding: 2px;
      min-width: 90px;
    }

    .col-action-hdr {
      background: #f8fafc;
      width: 45px;
    }

    .col-hdr-input {
      background: transparent;
      border: none;
      color: #0f172a;
      font-weight: 700;
      font-size: 11px;
      width: calc(100% - 18px);
      padding: 4px;
      outline: none;
    }

    .btn-del-col {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-weight: bold;
      cursor: pointer;
      font-size: 13px;
      padding: 0 4px;
      border-radius: 4px;
      float: right;
      transition: all 0.15s;
    }

    .btn-del-col:hover {
      color: #ef4444;
      background: #fee2e2;
    }

    .cell-input {
      width: 100%;
      box-sizing: border-box;
      background: #ffffff;
      border: none;
      color: #0f172a;
      padding: 5px 6px;
      font-size: 11px;
      font-family: inherit;
      outline: none;
    }

    .cell-input:focus {
      background: #eff6ff;
      box-shadow: inset 0 0 0 1px #2563eb;
    }

    .td-del-row {
      width: 28px;
      text-align: center;
      background: #f8fafc;
      padding: 0;
    }

    .btn-del-row {
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 13px;
      font-weight: bold;
      padding: 2px 4px;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .btn-del-row:hover {
      color: #ef4444;
      background: #fee2e2;
      text-decoration: none;
    }
    @media (max-width: 700px) {
      .panel-header { padding: 7px 10px; }
      .panel-title { font-size: .76rem; }
      .mapping-section { padding: 8px 10px; }
      .section-subtitle { display: none; }
      .mapping-grid { grid-template-columns: 1fr; gap: 5px; }
      .map-item { display: grid; grid-template-columns: 92px minmax(0, 1fr); align-items: center; gap: 7px; }
      .map-item label { font-size: .62rem; line-height: 1.15; }
      .map-select { min-width: 0; height: 31px; padding: 3px 6px; font-size: .7rem; }
      .table-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; padding: 6px 8px; }
      .table-actions .btn-sm { width: 100%; min-width: 0; height: 30px !important; min-height: 30px; justify-content: center; padding: 0 3px; font-size: .62rem !important; }
      .btn-export { margin-left: 0; }
      .grid-table-wrapper { padding: 6px; }
      .excel-table { min-width: 340px; }
    }
  `]
})
export class RDataTableComponent implements OnInit {
  columns: string[] = [];
  data: Array<Record<string, any>> = [];
  plotState!: PlotState;
  plots: PlotState[] = [];
  activePlotIndex = 0;
  private hasPendingDataChanges = false;

  get activePlot(): PlotState | undefined {
    return this.plots[this.activePlotIndex];
  }

  /** Histogram and density derive their Y values from a single numeric X column. */
  get usesDerivedYAxis(): boolean {
    return this.plotState?.chartType === 'histogram' || this.plotState?.chartType === 'density';
  }

  get derivedYAxisLabel(): string {
    return this.plotState?.chartType === 'histogram'
      ? 'Auto-calculated distribution'
      : 'Auto-calculated density';
  }

  /** Group/fill is meaningful only where the generated R layer uses it. */
  get supportsGroupMapping(): boolean {
    return ['bar', 'line', 'scatter', 'boxplot', 'violin', 'dotplot', 'histogram', 'density']
      .includes(this.plotState?.chartType || '');
  }

  /** The generated R script draws SD/SE bars only for bar and line plots. */
  get supportsErrorMapping(): boolean {
    return ['bar', 'line'].includes(this.plotState?.chartType || '');
  }

  constructor(private rSyncService: RPlotSyncService, private operationProgress: OperationProgressService) {}

  ngOnInit() {
    this.rSyncService.columns$.subscribe(cols => this.columns = cols);
    this.rSyncService.data$.subscribe(data => this.data = data);
    this.rSyncService.plotState$.subscribe(state => this.plotState = state);
    this.rSyncService.plots$.subscribe(plots => this.plots = plots);
    this.rSyncService.activePlotIndex$.subscribe(idx => this.activePlotIndex = idx);
  }

  onMappingChange() {
    this.rSyncService.updatePlotState(this.plotState);
  }

  updateCellLocally(rowIndex: number, colName: string, value: string) {
    // Do not publish through the shared state while a field is being typed.
    // The chart preview is updated after the browser fires `change` (blur),
    // so the native input retains both focus and the user's entire text.
    this.data[rowIndex][colName] = value;
    this.hasPendingDataChanges = true;
  }

  commitCellChanges() {
    if (!this.hasPendingDataChanges) return;
    this.hasPendingDataChanges = false;
    const normalized = this.data.map(row => {
      const copy: Record<string, any> = {};
      this.columns.forEach(col => {
        const value = row[col];
        const numeric = Number(value);
        copy[col] = String(value ?? '').trim() !== '' && !Number.isNaN(numeric) ? numeric : value;
      });
      return copy;
    });
    this.rSyncService.setData(this.columns, normalized);
  }

  trackByIndex(index: number) { return index; }

  renameColumn(colIndex: number, newName: string) {
    const oldName = this.columns[colIndex];
    if (!newName || oldName === newName) return;

    const newCols = [...this.columns];
    newCols[colIndex] = newName;

    const newData = this.data.map(row => {
      const updatedRow: Record<string, any> = {};
      Object.keys(row).forEach(k => {
        if (k === oldName) updatedRow[newName] = row[k];
        else updatedRow[k] = row[k];
      });
      return updatedRow;
    });

    const stateUpdate: Partial<PlotState> = {};
    if (this.plotState.xColumn === oldName) stateUpdate.xColumn = newName;
    if (this.plotState.yColumn === oldName) stateUpdate.yColumn = newName;
    if (this.plotState.groupColumn === oldName) stateUpdate.groupColumn = newName;
    if (this.plotState.errorColumn === oldName) stateUpdate.errorColumn = newName;

    this.rSyncService.setData(newCols, newData);
    if (Object.keys(stateUpdate).length > 0) {
      this.rSyncService.updatePlotState(stateUpdate);
    }
  }

  addRow() {
    const newRow: Record<string, any> = {};
    this.columns.forEach(col => {
      const isNum = typeof this.data[0]?.[col] === 'number';
      newRow[col] = isNum ? 0 : 'Sample';
    });
    this.rSyncService.setData(this.columns, [...this.data, newRow]);
  }

  deleteRow(index: number) {
    if (this.data.length <= 1) return;
    const newData = this.data.filter((_, i) => i !== index);
    this.rSyncService.setData(this.columns, newData);
  }

  addColumn() {
    const colName = `Col_${this.columns.length + 1}`;
    const newCols = [...this.columns, colName];
    const newData = this.data.map(row => ({ ...row, [colName]: 0 }));
    this.rSyncService.setData(newCols, newData);
  }

  deleteColumn(colIndex: number) {
    if (this.columns.length <= 1) return;
    const delCol = this.columns[colIndex];
    const newCols = this.columns.filter((_, i) => i !== colIndex);
    const newData = this.data.map(row => {
      const updatedRow = { ...row };
      delete updatedRow[delCol];
      return updatedRow;
    });

    const stateUpdate: Partial<PlotState> = {};
    if (this.plotState.xColumn === delCol) stateUpdate.xColumn = newCols[0] || '';
    if (this.plotState.yColumn === delCol) stateUpdate.yColumn = newCols[1] || newCols[0] || '';
    if (this.plotState.groupColumn === delCol) stateUpdate.groupColumn = '';
    if (this.plotState.errorColumn === delCol) stateUpdate.errorColumn = '';

    this.rSyncService.setData(newCols, newData);
    if (Object.keys(stateUpdate).length > 0) {
      this.rSyncService.updatePlotState(stateUpdate);
    }
  }

  exportCSV() {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += this.columns.join(',') + '\n';
    this.data.forEach(row => {
      const line = this.columns.map(col => `"${row[col] ?? ''}"`).join(',');
      csvContent += line + '\n';
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'figure_data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  importFile(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    // Preserve the original workbook (including every sheet) for an imported
    // R script. The editable table remains a convenient first-sheet view.
    void this.rSyncService.setSourceWorkbook(file);
    const progressId = this.operationProgress.begin(`Importing ${file.name}`, 'Reading spreadsheet…', 0);

    const reader = new FileReader();
    reader.onprogress = progressEvent => {
      this.operationProgress.update(progressId, {
        detail: 'Reading spreadsheet…',
        percent: progressEvent.lengthComputable ? Math.min(65, (progressEvent.loaded / progressEvent.total) * 65) : null,
        transferred: progressEvent.loaded,
        total: progressEvent.lengthComputable ? progressEvent.total : undefined,
      });
    };
    reader.onload = (e: any) => {
      try {
        this.operationProgress.update(progressId, { detail: 'Parsing spreadsheet rows…', percent: 72 });
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const workbookSheets: Record<string, Array<Record<string, any>>> = {};
        workbook.SheetNames.forEach(sheetName => {
          workbookSheets[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }) as Array<Record<string, any>>;
        });
        this.rSyncService.setWorkbookSheets(workbookSheets);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!json || json.length < 2) {
          this.operationProgress.fail(progressId, 'The spreadsheet does not contain data rows');
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

        const groupCol = headers.find(h => h.toLowerCase() === 'group' || h.toLowerCase() === 'condition' || h.toLowerCase() === 'genotype') || '';
        const errCol = headers.find(h => h.toLowerCase() === 'sd' || h.toLowerCase() === 'se' || h.toLowerCase() === 'sem') || '';
        const yCol = headers.find(h => h !== headers[0] && h !== groupCol && h !== errCol) || headers[1] || headers[0];

        this.rSyncService.setData(headers, parsedRows);
        this.rSyncService.updatePlotState({
          xColumn: headers[0],
          yColumn: yCol,
          groupColumn: groupCol,
          errorColumn: errCol
        });
        this.operationProgress.complete(progressId, 'Plot data imported');
      } catch (err) {
        console.error('Error reading file:', err);
        this.operationProgress.fail(progressId, 'Could not import this spreadsheet');
      }
    };
    reader.onerror = () => this.operationProgress.fail(progressId, 'Could not read this file');
    reader.onabort = () => this.operationProgress.remove(progressId);
    reader.readAsArrayBuffer(file);
  }
}
