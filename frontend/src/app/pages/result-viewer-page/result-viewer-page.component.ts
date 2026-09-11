import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStateService } from '../../services/app-state.service';
import { ResultDashboardComponent } from '../../components/result-dashboard/result-dashboard.component';
import { ExcelExportService } from '../../services/excel-export.service';
import { OperationProgressService } from '../../services/operation-progress.service';

@Component({
  selector: 'app-result-viewer-page',
  standalone: true,
  imports: [CommonModule, ResultDashboardComponent],
  templateUrl: './result-viewer-page.component.html'
})
export class ResultViewerPageComponent implements OnInit {
  constructor(
    public state: AppStateService,
    private excelExportService: ExcelExportService,
    private operationProgress: OperationProgressService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.state.activateSlot('viewer');
  }

  onExcelDropped(event: DragEvent) {
    event.preventDefault();
    this.state.isDragging = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) this.loadExcelResult(files[0]);
  }

  onExcelSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) this.loadExcelResult(input.files[0]);
  }

  onDragOver(event: DragEvent) { event.preventDefault(); this.state.isDragging = true; }
  onDragLeave(event: DragEvent) { event.preventDefault(); this.state.isDragging = false; }

  async loadExcelResult(file: File) {
    const progressId = this.operationProgress.begin(`Opening ${file.name}`, 'Reading Excel report…', 10);
    try {
      this.state.addLog(`Loading excel file: ${file.name}`);
      const data = await this.excelExportService.importFromExcel(file);
      this.operationProgress.update(progressId, { detail: 'Rendering analysis result…', percent: 80 });
      this.state.loadResultData(data);
      this.cdr.detectChanges();
      this.state.addLog(`Excel report imported successfully.`);
      this.operationProgress.complete(progressId, 'Excel report opened');
    } catch (e: any) {
      console.error('Excel import failed:', e);
      this.state.addLog(`Excel import failed: ${e.message}`);
      this.operationProgress.fail(progressId, 'Could not open this Excel report');
    }
  }
}
