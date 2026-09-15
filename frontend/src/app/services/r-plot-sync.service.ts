import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

export interface DataColumn {
  name: string;
  type: 'string' | 'number';
}

// Keep the common laboratory plots discoverable without pretending that every
// ggplot extension is a first-class canvas renderer.  These are deliberately
// data-shape-oriented rather than domain-specific templates.
export type PlotType =
  | 'bar' | 'scatter' | 'boxplot' | 'line'
  | 'violin' | 'dotplot' | 'histogram' | 'density'
  | 'heatmap' | 'volcano';

export interface PlotState {
  id: string;
  // Chart Meta
  chartType: PlotType;
  title: string;
  subtitle: string;
  xLabel: string;
  yLabel: string;
  legendTitle: string;
  figureTag: string; // e.g. "(A)", "(B)"

  // Aesthetic mappings
  xColumn: string;
  yColumn: string;
  groupColumn: string;
  errorColumn: string;

  // Typography & Styling
  fontFamily: string;
  fontSizeTitle: number;
  fontSizeSubtitle?: number;
  fontSizeTag?: number;
  fontSizeAxis: number;
  fontSizeXAxis?: number;
  fontSizeYAxis?: number;
  fontSizeLegend: number;
  barWidth: number;
  pointSize: number;
  lineWidth: number;
  showErrorBars: boolean;
  xRotation: number;

  // Theme & Colors
  theme: 'classic' | 'bw' | 'dark';
  palette: string[];
  legendPosition: 'top' | 'bottom' | 'left' | 'right' | 'none';

  // Y Scale Limits
  yMin: number | null;
  yMax: number | null;

  // Optional publication/statistical controls. Optional keeps saved projects
  // from the earlier editor compatible.
  showRawPoints?: boolean;
  showTrendLine?: boolean;
  showConfidenceBand?: boolean;
  showMean?: boolean;
  showHeatmapValues?: boolean;
  binCount?: number;
  xScale?: 'linear' | 'log10';
  yScale?: 'linear' | 'log10';
  thresholdX?: number;
  thresholdY?: number;
  labelColumn?: string;

  // Publication output and visual layout. Optional fields keep existing saved
  // projects fully compatible; the canvas supplies sensible defaults.
  figureWidthIn?: number;
  figureHeightIn?: number;
  exportDpi?: number;
  background?: 'white' | 'transparent';
  showGrid?: boolean;
  showMinorGrid?: boolean;
  axisLineWidth?: number;
  titleOffsetX?: number;
  titleOffsetY?: number;
  subtitleOffsetX?: number;
  subtitleOffsetY?: number;
  legendOffsetX?: number;
  legendOffsetY?: number;
  xLabelOffset?: number;
  yLabelOffset?: number;
  xLabelOffsetX?: number;
  xLabelOffsetY?: number;
  yLabelOffsetX?: number;
  yLabelOffsetY?: number;
  tagOffsetX?: number;
  tagOffsetY?: number;
}

export interface PanelConfig {
  showData: boolean;
  showCode: boolean;
  showPlot: boolean;
  layoutMode: '3-split' | 'data-plot' | 'vertical-stack' | 'full-plot';
  // Panel widths in percent
  dataWidth: number;
  codeWidth: number;
  plotWidth: number;
}

export interface RSourceWorkbook {
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface NativeRImage {
  name: string;
  data_url: string;
}

export interface PlotProjectDocument {
  version: 1;
  columns: string[];
  data: Array<Record<string, any>>;
  plots: PlotState[];
  activePlotIndex: number;
  panelConfig: PanelConfig;
  viewMode: 'single' | 'grid';
  rCode: string;
  rSourceMode?: boolean;
  sourceWorkbook?: RSourceWorkbook | null;
}

export interface PlotExample {
  columns: string[];
  rows: Array<Record<string, any>>;
  plot: PlotState;
}

@Injectable({
  providedIn: 'root'
})
export class RPlotSyncService {

  // Default dataset (Minimal starter data)
  private initialColumns: string[] = ['Sample', 'Value'];
  private initialData: Array<Record<string, any>> = [
    { Sample: 'Sample 1', Value: 1 },
    { Sample: 'Sample 2', Value: 2 },
    { Sample: 'Sample 3', Value: 3 }
  ];

  private initialPlots: PlotState[] = [
    {
      id: 'plot-1',
      chartType: 'bar',
      title: '',
      subtitle: '',
      xLabel: 'Sample',
      yLabel: 'Value',
      legendTitle: '',
      figureTag: '',
      xColumn: 'Sample',
      yColumn: 'Value',
      groupColumn: '',
      errorColumn: '',
      fontFamily: 'Inter, sans-serif',
      fontSizeTitle: 16,
      fontSizeAxis: 12,
      fontSizeLegend: 11,
      barWidth: 0.7,
      pointSize: 4,
      lineWidth: 2,
      showErrorBars: false,
      xRotation: 0,
      theme: 'classic',
      palette: ['#2563EB', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'],
      legendPosition: 'none',
      yMin: null,
      yMax: null,
      showRawPoints: true,
      showTrendLine: true,
      showConfidenceBand: false,
      showMean: false,
      binCount: 30,
      xScale: 'linear',
      yScale: 'linear',
      thresholdX: 1,
      thresholdY: 1.3,
      labelColumn: ''
    }
  ];

  private initialPanelConfig: PanelConfig = {
    showData: true,
    showCode: true,
    showPlot: true,
    layoutMode: '3-split',
    dataWidth: 28,
    codeWidth: 32,
    plotWidth: 40
  };

  // Subjects
  private columnsSubject = new BehaviorSubject<string[]>(this.initialColumns);
  private dataSubject = new BehaviorSubject<Array<Record<string, any>>>(this.initialData);
  private plotsSubject = new BehaviorSubject<PlotState[]>(this.initialPlots);
  private activePlotIndexSubject = new BehaviorSubject<number>(0);
  private panelConfigSubject = new BehaviorSubject<PanelConfig>(this.initialPanelConfig);
  private rCodeSubject = new BehaviorSubject<string>('');
  private rSourceModeSubject = new BehaviorSubject<boolean>(false);
  private sourceWorkbookSubject = new BehaviorSubject<RSourceWorkbook | null>(null);
  private nativeRenderSubject = new BehaviorSubject<NativeRImage[]>([]);
  private wizardOpenSubject = new BehaviorSubject<boolean>(false);
  private viewModeSubject = new BehaviorSubject<'single' | 'grid'>('single');

  // Observables
  columns$ = this.columnsSubject.asObservable();
  data$ = this.dataSubject.asObservable();
  plots$ = this.plotsSubject.asObservable();
  activePlotIndex$ = this.activePlotIndexSubject.asObservable();
  panelConfig$ = this.panelConfigSubject.asObservable();
  rCode$ = this.rCodeSubject.asObservable();
  rSourceMode$ = this.rSourceModeSubject.asObservable();
  sourceWorkbook$ = this.sourceWorkbookSubject.asObservable();
  nativeRender$ = this.nativeRenderSubject.asObservable();
  wizardOpen$ = this.wizardOpenSubject.asObservable();
  viewMode$ = this.viewModeSubject.asObservable();

  // Active plot observable for single-plot consumers
  plotState$: Observable<PlotState> = combineLatest([this.plotsSubject, this.activePlotIndexSubject]).pipe(
    map(([plots, idx]) => {
      const validIdx = Math.min(idx, plots.length - 1);
      return plots[Math.max(0, validIdx)] || plots[0];
    })
  );

  constructor() {
    this.updateRCodeFromState();
  }

  // Get snapshots
  get columns(): string[] { return this.columnsSubject.value; }
  get data(): Array<Record<string, any>> { return this.dataSubject.value; }
  get plots(): PlotState[] { return this.plotsSubject.value; }
  get activePlotIndex(): number { return this.activePlotIndexSubject.value; }
  get activePlot(): PlotState {
    const list = this.plots;
    const idx = Math.min(this.activePlotIndex, list.length - 1);
    return list[Math.max(0, idx)] || list[0];
  }
  get panelConfig(): PanelConfig { return this.panelConfigSubject.value; }
  get viewMode(): 'single' | 'grid' { return this.viewModeSubject.value; }
  get rCode(): string { return this.rCodeSubject.value; }
  get rSourceMode(): boolean { return this.rSourceModeSubject.value; }
  get sourceWorkbook(): RSourceWorkbook | null { return this.sourceWorkbookSubject.value; }

  setRSourceCode(code: string) {
    this.rSourceModeSubject.next(true);
    this.rCodeSubject.next(code);
    this.nativeRenderSubject.next([]);
  }

  leaveRSourceMode() {
    this.rSourceModeSubject.next(false);
    this.nativeRenderSubject.next([]);
    this.updateRCodeFromState();
  }

  async setSourceWorkbook(file: File): Promise<void> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read this spreadsheet'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(file);
    });
    this.sourceWorkbookSubject.next({ name: file.name, mimeType: file.type || 'application/octet-stream', dataUrl });
    this.nativeRenderSubject.next([]);
  }

  async sourceWorkbookFile(): Promise<File | null> {
    const source = this.sourceWorkbook;
    if (!source?.dataUrl) return null;
    const blob = await (await fetch(source.dataUrl)).blob();
    return new File([blob], source.name, { type: source.mimeType });
  }

  expectedInputFileName(): string {
    const code = this.rCode;
    const assignment = code.match(/(?:input_file|input_path|file_path)\s*<-\s*["']([^"']+)["']/i);
    if (assignment?.[1]) return assignment[1];
    const readerCall = code.match(/(?:read_excel|read\.csv|read_csv)\s*\(\s*["']([^"']+)["']/i);
    return readerCall?.[1] || this.sourceWorkbook?.name || '';
  }

  setNativeRender(images: NativeRImage[]) { this.nativeRenderSubject.next(images); }

  /** Small, real-shaped datasets used by the in-product plot guide. */
  getPlotExample(type: PlotType): PlotExample {
    const base = (overrides: Partial<PlotState>): PlotState => ({
      id: 'example-plot', chartType: type, title: 'Example figure', subtitle: '', xLabel: 'Condition', yLabel: 'Measurement', legendTitle: '', figureTag: '',
      xColumn: 'Condition', yColumn: 'Measurement', groupColumn: '', errorColumn: '',
      fontFamily: 'Inter, sans-serif', fontSizeTitle: 16, fontSizeAxis: 12, fontSizeLegend: 11,
      barWidth: 0.7, pointSize: 4, lineWidth: 2, showErrorBars: false, xRotation: 0,
      theme: 'classic', palette: ['#2563EB', '#EF4444', '#10B981', '#F59E0B'], legendPosition: 'none', yMin: null, yMax: null,
      showRawPoints: true, showTrendLine: true, showConfidenceBand: false, showMean: false, binCount: 20,
      xScale: 'linear', yScale: 'linear', thresholdX: 1, thresholdY: 1.3, labelColumn: '', ...overrides
    });
    const simple = [
      { Condition: 'Control', Measurement: 1.0, SEM: 0.12 }, { Condition: 'Drug A', Measurement: 2.4, SEM: 0.2 }, { Condition: 'Drug B', Measurement: 3.1, SEM: 0.28 }
    ];
    const distributions = [
      { Condition: 'Control', Measurement: 0.9 }, { Condition: 'Control', Measurement: 1.1 }, { Condition: 'Control', Measurement: 1.3 },
      { Condition: 'Treatment', Measurement: 1.8 }, { Condition: 'Treatment', Measurement: 2.1 }, { Condition: 'Treatment', Measurement: 2.6 }
    ];
    if (type === 'line') return { columns: ['Time_h', 'Group', 'Response'], rows: [
      { Time_h: 0, Group: 'Control', Response: 1.0 }, { Time_h: 24, Group: 'Control', Response: 1.1 }, { Time_h: 48, Group: 'Control', Response: 1.2 },
      { Time_h: 0, Group: 'Drug', Response: 1.0 }, { Time_h: 24, Group: 'Drug', Response: 1.8 }, { Time_h: 48, Group: 'Drug', Response: 2.5 }
    ], plot: base({ title: 'Time-course response', xColumn: 'Time_h', yColumn: 'Response', groupColumn: 'Group', xLabel: 'Time (h)', yLabel: 'Relative response', legendTitle: 'Group', legendPosition: 'right' }) };
    if (type === 'scatter') return { columns: ['Dose_uM', 'Response'], rows: [{ Dose_uM: 0, Response: 0.1 }, { Dose_uM: 1, Response: 0.5 }, { Dose_uM: 2, Response: 1.0 }, { Dose_uM: 4, Response: 2.0 }, { Dose_uM: 8, Response: 3.8 }], plot: base({ title: 'Dose-response association', xColumn: 'Dose_uM', yColumn: 'Response', xLabel: 'Dose (µM)', yLabel: 'Response' }) };
    if (type === 'bar') return { columns: ['Condition', 'Measurement', 'SEM'], rows: simple, plot: base({ title: 'Group mean ± SEM', xColumn: 'Condition', yColumn: 'Measurement', errorColumn: 'SEM', showErrorBars: true }) };
    if (type === 'histogram' || type === 'density') return { columns: ['Measurement'], rows: [0.6, 0.8, 0.9, 1.0, 1.1, 1.15, 1.3, 1.35, 1.5, 1.7, 1.9, 2.1].map(Measurement => ({ Measurement })), plot: base({ chartType: type, title: type === 'histogram' ? 'Distribution of measurements' : 'Measurement density', xColumn: 'Measurement', yColumn: 'Measurement', xLabel: 'Measurement', yLabel: type === 'histogram' ? 'Count' : 'Density' }) };
    if (type === 'volcano') return { columns: ['Gene', 'log2FC', 'minusLog10FDR'], rows: [
      { Gene: 'GENE1', log2FC: -2.1, minusLog10FDR: 3.0 }, { Gene: 'GENE2', log2FC: -0.3, minusLog10FDR: 0.6 }, { Gene: 'GENE3', log2FC: 0.8, minusLog10FDR: 1.1 }, { Gene: 'GENE4', log2FC: 1.8, minusLog10FDR: 2.7 }, { Gene: 'GENE5', log2FC: 2.5, minusLog10FDR: 4.0 }
    ], plot: base({ title: 'Differential expression', xColumn: 'log2FC', yColumn: 'minusLog10FDR', labelColumn: 'Gene', xLabel: 'log2 fold change', yLabel: '-log10 adjusted P value', thresholdX: 1, thresholdY: 1.3 }) };
    if (type === 'heatmap') return { columns: ['Gene', 'Sample', 'Z_score'], rows: [
      { Gene: 'Gene A', Sample: 'S1', Z_score: -1.2 }, { Gene: 'Gene A', Sample: 'S2', Z_score: 0.4 }, { Gene: 'Gene A', Sample: 'S3', Z_score: 1.4 }, { Gene: 'Gene B', Sample: 'S1', Z_score: 1.1 }, { Gene: 'Gene B', Sample: 'S2', Z_score: -0.7 }, { Gene: 'Gene B', Sample: 'S3', Z_score: 0.2 }
    ], plot: base({ title: 'Expression heatmap', xColumn: 'Sample', yColumn: 'Z_score', groupColumn: 'Gene', xLabel: 'Sample', yLabel: 'Gene' }) };
    if (type === 'dotplot') return { columns: ['Condition', 'Measurement'], rows: distributions, plot: base({ title: 'Individual observations', xColumn: 'Condition', yColumn: 'Measurement', showMean: true }) };
    if (type === 'violin' || type === 'boxplot') return { columns: ['Condition', 'Measurement'], rows: distributions, plot: base({ chartType: type, title: type === 'violin' ? 'Distribution + raw data' : 'Distribution summary', xColumn: 'Condition', yColumn: 'Measurement' }) };
    return { columns: ['Condition', 'Measurement', 'SEM'], rows: simple, plot: base({ xColumn: 'Condition', yColumn: 'Measurement', errorColumn: 'SEM' }) };
  }

  loadPlotExample(type: PlotType) {
    this.rSourceModeSubject.next(false);
    this.sourceWorkbookSubject.next(null);
    this.nativeRenderSubject.next([]);
    const example = this.getPlotExample(type);
    this.columnsSubject.next(example.columns);
    this.dataSubject.next(example.rows);
    this.plotsSubject.next([{ ...example.plot, palette: [...example.plot.palette] }]);
    this.activePlotIndexSubject.next(0);
    this.viewModeSubject.next('single');
    this.updateRCodeFromState();
  }

  createProjectDocument(): PlotProjectDocument {
    return {
      version: 1,
      columns: [...this.columns],
      data: this.data.map(row => ({ ...row })),
      plots: this.plots.map(plot => ({ ...plot, palette: [...plot.palette] })),
      activePlotIndex: this.activePlotIndex,
      panelConfig: { ...this.panelConfig },
      viewMode: this.viewMode,
      rCode: this.rCode,
      rSourceMode: this.rSourceMode,
      sourceWorkbook: this.sourceWorkbook
    };
  }

  loadProjectDocument(project: PlotProjectDocument) {
    this.columnsSubject.next(Array.isArray(project?.columns) ? project.columns : this.initialColumns);
    this.dataSubject.next(Array.isArray(project?.data) ? project.data : this.initialData);
    this.plotsSubject.next(Array.isArray(project?.plots) && project.plots.length ? project.plots : this.initialPlots);
    this.activePlotIndexSubject.next(Math.max(0, Math.min(project?.activePlotIndex || 0, this.plotsSubject.value.length - 1)));
    this.panelConfigSubject.next({ ...this.initialPanelConfig, ...(project?.panelConfig || {}) });
    this.viewModeSubject.next(project?.viewMode === 'grid' ? 'grid' : 'single');
    this.rCodeSubject.next(project?.rCode || '');
    this.rSourceModeSubject.next(!!project?.rSourceMode);
    this.sourceWorkbookSubject.next(project?.sourceWorkbook || null);
    this.nativeRenderSubject.next([]);
    if (!project?.rCode) this.updateRCodeFromState();
    this.closeWizard();
  }

  setViewMode(mode: 'single' | 'grid') {
    this.viewModeSubject.next(mode);
  }

  openWizard() {
    this.wizardOpenSubject.next(true);
  }

  closeWizard() {
    this.wizardOpenSubject.next(false);
  }

  // Active Plot Selection
  setActivePlotIndex(index: number) {
    if (index >= 0 && index < this.plots.length) {
      this.activePlotIndexSubject.next(index);
    }
  }

  // Add a new sub-plot (e.g. Figure 1B)
  addNewPlot(custom?: Partial<PlotState>) {
    const currentList = this.plots;
    const nextTagChar = String.fromCharCode(65 + currentList.length); // 'B', 'C', 'D'
    const newPlot: PlotState = {
      id: `plot-${Date.now()}`,
      chartType: 'bar',
      title: `Figure Panel ${nextTagChar}`,
      subtitle: '',
      xLabel: this.columns[0] || 'X',
      yLabel: this.columns[1] || 'Y',
      legendTitle: 'Group',
      figureTag: `(${nextTagChar})`,
      xColumn: this.columns[0] || '',
      yColumn: this.columns[1] || '',
      groupColumn: this.columns[2] || '',
      errorColumn: this.columns.find(c => c.toLowerCase().includes('sd') || c.toLowerCase().includes('se')) || '',
      fontFamily: 'Inter, sans-serif',
      fontSizeTitle: 16,
      fontSizeAxis: 12,
      fontSizeLegend: 11,
      barWidth: 0.7,
      pointSize: 4,
      lineWidth: 2,
      showErrorBars: true,
      xRotation: 0,
      theme: 'classic',
      palette: ['#2563EB', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'],
      legendPosition: 'right',
      yMin: null,
      yMax: null,
      ...custom
    };

    const updated = [...currentList, newPlot];
    this.plotsSubject.next(updated);
    this.activePlotIndexSubject.next(updated.length - 1);
    this.updateRCodeFromState();
  }

  // Duplicate an existing plot
  duplicatePlot(index?: number) {
    const targetIdx = index !== undefined ? index : this.activePlotIndex;
    const source = this.plots[targetIdx] || this.activePlot;
    const nextTagChar = String.fromCharCode(65 + this.plots.length);
    this.addNewPlot({
      ...source,
      id: `plot-${Date.now()}`,
      figureTag: `(${nextTagChar})`,
      title: `${source.title} (${nextTagChar})`
    });
  }

  // Auto-generate 1 sub-plot for each measurement column
  generatePlotsFromColumns(yColumns?: string[]) {
    const xCol = this.activePlot.xColumn || this.columns[0] || 'X';
    const candidateYCols = yColumns && yColumns.length > 0
      ? yColumns
      : this.columns.filter(c => c !== xCol && !c.toLowerCase().includes('sd') && !c.toLowerCase().includes('se') && !c.toLowerCase().includes('group'));

    if (candidateYCols.length === 0) return;

    const basePlot = this.activePlot;
    const generated: PlotState[] = candidateYCols.map((yCol, idx) => {
      const tagChar = String.fromCharCode(65 + idx);
      return {
        ...basePlot,
        id: `plot-${Date.now()}-${idx}`,
        figureTag: `(${tagChar})`,
        title: yCol,
        xColumn: xCol,
        yColumn: yCol,
        xLabel: xCol,
        yLabel: yCol,
        errorColumn: this.columns.find(c => c.toLowerCase() === `${yCol.toLowerCase()}_sd` || c.toLowerCase() === `${yCol.toLowerCase()}_se`) || basePlot.errorColumn || ''
      };
    });

    this.plotsSubject.next(generated);
    this.activePlotIndexSubject.next(0);
    this.viewModeSubject.next('grid');
    this.updateRCodeFromState();
  }

  // Remove a sub-plot
  removePlot(index: number) {
    if (this.plots.length <= 1) return;
    const updated = this.plots.filter((_, i) => i !== index);
    this.plotsSubject.next(updated);
    this.activePlotIndexSubject.next(Math.max(0, Math.min(this.activePlotIndex, updated.length - 1)));
    this.updateRCodeFromState();
  }

  // Update Data Table
  setData(columns: string[], data: Array<Record<string, any>>) {
    this.columnsSubject.next(columns);
    this.dataSubject.next(data);
    this.updateRCodeFromState();
    this.nativeRenderSubject.next([]);
  }

  // Update Active Plot State
  updateActivePlotState(partial: Partial<PlotState>) {
    const list = [...this.plots];
    const idx = Math.min(this.activePlotIndex, list.length - 1);
    if (idx >= 0 && list[idx]) {
      list[idx] = { ...list[idx], ...partial };
      this.plotsSubject.next(list);
      this.updateRCodeFromState();
    }
  }

  // Alias for compatibility
  updatePlotState(partial: Partial<PlotState>) {
    this.updateActivePlotState(partial);
  }

  // Update All Plots
  setPlots(plots: PlotState[]) {
    this.plotsSubject.next(plots);
    this.activePlotIndexSubject.next(0);
    this.updateRCodeFromState();
  }

  // Update Panel Controls
  updatePanelConfig(partial: Partial<PanelConfig>) {
    this.panelConfigSubject.next({ ...this.panelConfigSubject.value, ...partial });
  }

  // Manual Scratchpad for R Studio Users (Empty / Clean Slate)
  loadManualScratchpad() {
    this.rSourceModeSubject.next(false);
    this.sourceWorkbookSubject.next(null);
    this.nativeRenderSubject.next([]);
    const emptyCols = ['Sample', 'Value'];
    const emptyRows = [
      { Sample: 'Sample 1', Value: 1 },
      { Sample: 'Sample 2', Value: 2 },
      { Sample: 'Sample 3', Value: 3 }
    ];
    const blankPlot: PlotState = {
      id: 'plot-1',
      chartType: 'bar',
      title: '',
      subtitle: '',
      xLabel: 'Sample',
      yLabel: 'Value',
      legendTitle: '',
      figureTag: '',
      xColumn: 'Sample',
      yColumn: 'Value',
      groupColumn: '',
      errorColumn: '',
      fontFamily: 'Inter, sans-serif',
      fontSizeTitle: 16,
      fontSizeAxis: 12,
      fontSizeLegend: 11,
      barWidth: 0.7,
      pointSize: 4,
      lineWidth: 2,
      showErrorBars: false,
      xRotation: 0,
      theme: 'classic',
      palette: ['#2563EB', '#EF4444', '#10B981', '#F59E0B'],
      legendPosition: 'none',
      yMin: null,
      yMax: null
    };

    this.setData(emptyCols, emptyRows);
    this.plotsSubject.next([blankPlot]);
    this.activePlotIndexSubject.next(0);
    this.closeWizard();
  }

  // Preset Datasets Loader
  loadPresetDataset(presetKey: 'expression' | 'timecourse' | 'standard_curve' | 'boxplot') {
    if (presetKey === 'expression') {
      const cols = ['Treatment', 'Group', 'Expression', 'SD'];
      const rows = [
        { Treatment: 'Control', Group: 'WT', Expression: 1.00, SD: 0.08 },
        { Treatment: 'Control', Group: 'Mutant-1', Expression: 1.05, SD: 0.11 },
        { Treatment: 'Drug A (10uM)', Group: 'WT', Expression: 3.42, SD: 0.25 },
        { Treatment: 'Drug A (10uM)', Group: 'Mutant-1', Expression: 1.84, SD: 0.19 },
        { Treatment: 'Drug B (50uM)', Group: 'WT', Expression: 5.68, SD: 0.41 },
        { Treatment: 'Drug B (50uM)', Group: 'Mutant-1', Expression: 2.12, SD: 0.22 }
      ];
      this.setData(cols, rows);
      this.plotsSubject.next([{
        id: 'plot-1',
        chartType: 'bar',
        title: 'Relative Gene Expression Level',
        subtitle: 'Quantitative RT-PCR analysis (n=3 biological replicates)',
        xLabel: 'Treatment Condition',
        yLabel: 'Relative mRNA Expression (Fold Change)',
        legendTitle: 'Genotype',
        figureTag: '(A)',
        xColumn: 'Treatment',
        yColumn: 'Expression',
        groupColumn: 'Group',
        errorColumn: 'SD',
        fontFamily: 'Inter, sans-serif',
        fontSizeTitle: 16,
        fontSizeAxis: 12,
        fontSizeLegend: 11,
        barWidth: 0.7,
        pointSize: 4,
        lineWidth: 2,
        showErrorBars: true,
        xRotation: 0,
        theme: 'classic',
        palette: ['#2563EB', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'],
        legendPosition: 'right',
        yMin: null,
        yMax: null
      }]);
      this.activePlotIndexSubject.next(0);
    } else if (presetKey === 'timecourse') {
      const cols = ['Time_h', 'Stiff_kPa', 'Cell_Count', 'SD'];
      const rows = [
        { Time_h: '0h', Stiff_kPa: 'Soft (2kPa)', Cell_Count: 120, SD: 12 },
        { Time_h: '0h', Stiff_kPa: 'Rigid (30kPa)', Cell_Count: 125, SD: 10 },
        { Time_h: '24h', Stiff_kPa: 'Soft (2kPa)', Cell_Count: 280, SD: 24 },
        { Time_h: '24h', Stiff_kPa: 'Rigid (30kPa)', Cell_Count: 450, SD: 35 },
        { Time_h: '48h', Stiff_kPa: 'Soft (2kPa)', Cell_Count: 410, SD: 38 },
        { Time_h: '48h', Stiff_kPa: 'Rigid (30kPa)', Cell_Count: 920, SD: 70 },
        { Time_h: '72h', Stiff_kPa: 'Soft (2kPa)', Cell_Count: 560, SD: 45 },
        { Time_h: '72h', Stiff_kPa: 'Rigid (30kPa)', Cell_Count: 1480, SD: 110 }
      ];
      this.setData(cols, rows);
      this.plotsSubject.next([{
        id: 'plot-1',
        chartType: 'line',
        title: 'Substrate Stiffness Promotes Proliferation',
        subtitle: 'Time-course cell growth curve',
        xLabel: 'Incubation Time (Hours)',
        yLabel: 'Cell Proliferation (cells / mm2)',
        legendTitle: 'Matrix Stiffness',
        figureTag: '(B)',
        xColumn: 'Time_h',
        yColumn: 'Cell_Count',
        groupColumn: 'Stiff_kPa',
        errorColumn: 'SD',
        fontFamily: 'Inter, sans-serif',
        fontSizeTitle: 16,
        fontSizeAxis: 12,
        fontSizeLegend: 11,
        barWidth: 0.7,
        pointSize: 4,
        lineWidth: 2,
        showErrorBars: true,
        xRotation: 0,
        theme: 'classic',
        palette: ['#2563EB', '#EF4444', '#10B981', '#F59E0B'],
        legendPosition: 'right',
        yMin: null,
        yMax: null
      }]);
      this.activePlotIndexSubject.next(0);
    } else if (presetKey === 'standard_curve') {
      const cols = ['Concentration_mgmL', 'Absorbance_562nm'];
      const rows = [
        { Concentration_mgmL: 0.0, Absorbance_562nm: 0.045 },
        { Concentration_mgmL: 0.25, Absorbance_562nm: 0.182 },
        { Concentration_mgmL: 0.50, Absorbance_562nm: 0.354 },
        { Concentration_mgmL: 0.75, Absorbance_562nm: 0.521 },
        { Concentration_mgmL: 1.00, Absorbance_562nm: 0.710 },
        { Concentration_mgmL: 1.50, Absorbance_562nm: 1.042 },
        { Concentration_mgmL: 2.00, Absorbance_562nm: 1.389 }
      ];
      this.setData(cols, rows);
      this.plotsSubject.next([{
        id: 'plot-1',
        chartType: 'scatter',
        title: 'BCA Protein Assay Standard Curve',
        subtitle: 'Linear regression R2 = 0.998',
        xLabel: 'BSA Concentration (mg/mL)',
        yLabel: 'Absorbance (OD 562 nm)',
        legendTitle: '',
        figureTag: '(C)',
        xColumn: 'Concentration_mgmL',
        yColumn: 'Absorbance_562nm',
        groupColumn: '',
        errorColumn: '',
        fontFamily: 'Inter, sans-serif',
        fontSizeTitle: 16,
        fontSizeAxis: 12,
        fontSizeLegend: 11,
        barWidth: 0.7,
        pointSize: 4,
        lineWidth: 2,
        showErrorBars: false,
        xRotation: 0,
        theme: 'classic',
        palette: ['#2563EB', '#EF4444', '#10B981'],
        legendPosition: 'right',
        yMin: null,
        yMax: null
      }]);
      this.activePlotIndexSubject.next(0);
    } else if (presetKey === 'boxplot') {
      const cols = ['Organ', 'Condition', 'Enzyme_Activity'];
      const rows = [
        { Organ: 'Liver', Condition: 'Control', Enzyme_Activity: 45.2 },
        { Organ: 'Liver', Condition: 'Control', Enzyme_Activity: 48.1 },
        { Organ: 'Liver', Condition: 'Control', Enzyme_Activity: 42.9 },
        { Organ: 'Liver', Condition: 'Treated', Enzyme_Activity: 89.4 },
        { Organ: 'Liver', Condition: 'Treated', Enzyme_Activity: 95.1 },
        { Organ: 'Liver', Condition: 'Treated', Enzyme_Activity: 84.7 },
        { Organ: 'Kidney', Condition: 'Control', Enzyme_Activity: 32.1 },
        { Organ: 'Kidney', Condition: 'Control', Enzyme_Activity: 30.5 },
        { Organ: 'Kidney', Condition: 'Control', Enzyme_Activity: 35.8 },
        { Organ: 'Kidney', Condition: 'Treated', Enzyme_Activity: 52.3 },
        { Organ: 'Kidney', Condition: 'Treated', Enzyme_Activity: 58.0 },
        { Organ: 'Kidney', Condition: 'Treated', Enzyme_Activity: 49.6 }
      ];
      this.setData(cols, rows);
      this.plotsSubject.next([{
        id: 'plot-1',
        chartType: 'boxplot',
        title: 'Tissue-Specific Enzyme Activity',
        subtitle: 'Comparative quantification across organ lysates',
        xLabel: 'Target Organ',
        yLabel: 'Enzyme Activity (U / mg protein)',
        legendTitle: 'Treatment',
        figureTag: '(D)',
        xColumn: 'Organ',
        yColumn: 'Enzyme_Activity',
        groupColumn: 'Condition',
        errorColumn: '',
        fontFamily: 'Inter, sans-serif',
        fontSizeTitle: 16,
        fontSizeAxis: 12,
        fontSizeLegend: 11,
        barWidth: 0.7,
        pointSize: 4,
        lineWidth: 2,
        showErrorBars: false,
        xRotation: 0,
        theme: 'classic',
        palette: ['#2563EB', '#EF4444', '#10B981'],
        legendPosition: 'right',
        yMin: null,
        yMax: null
      }]);
      this.activePlotIndexSubject.next(0);
    }
  }

  // Generate R ggplot2 script supporting single and multi-panel figures (patchwork)
  private rString(value: unknown): string {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
  }

  private rColumn(name: string): string {
    return `\`${String(name || '').replace(/`/g, '\\`')}\``;
  }

  private updateRCodeFromState() {
    if (this.rSourceMode) return;
    const plots = this.plotsSubject.value;
    const cols = this.columnsSubject.value;
    const rows = this.dataSubject.value;

    let code = `# ==========================================================\n`;
    code += `# Publication-Ready Figure Generated by R-Plot Studio\n`;
    code += `# ==========================================================\n\n`;
    code += `library(ggplot2)\n`;
    code += `library(dplyr)\n`;
    if (plots.some(plot => plot.chartType === 'volcano' && plot.labelColumn)) {
      code += `library(ggrepel)\n`;
    }
    if (plots.length > 1) {
      code += `library(patchwork)\n`;
    }
    code += `\n`;

    // 1. Data Frame
    code += `# 1. Define Dataset\n`;
    code += `df <- data.frame(\n`;
    cols.forEach((col, idx) => {
      const vals = rows.map(r => {
        const val = r[col];
        if (typeof val === 'number' || (!isNaN(Number(val)) && val !== '' && val !== null)) {
          return val;
        }
        return `"${this.rString(val)}"`;
      });
      code += `  ${this.rColumn(col)} = c(${vals.join(', ')})${idx < cols.length - 1 ? ',' : ''}\n`;
    });
    code += `)\n\n`;

    // 2. Generate each plot object (p1, p2, ...)
    code += `# 2. Construct ggplot Object(s)\n`;
    plots.forEach((s, pIdx) => {
      const pVar = `p${pIdx + 1}`;
      const widthIn = Number(s.figureWidthIn) || 6.5;
      const heightIn = Number(s.figureHeightIn) || 4.5;
      const exportDpi = Number(s.exportDpi) || 300;
      const titleHjust = Math.max(0, Math.min(1, (18 + (Number(s.titleOffsetX) || 0)) / 720));
      const subtitleHjust = Math.max(0, Math.min(1, (18 + (Number(s.subtitleOffsetX) || 0)) / 720));
      const titleVjust = 0.5 - ((Number(s.titleOffsetY) || 0) / 80);
      const subtitleVjust = 0.5 - ((Number(s.subtitleOffsetY) || 0) / 80);
      const xTitleVjust = 1 - ((Number(s.xLabelOffset) || 0) / 50);
      const yTitleVjust = 1 - ((Number(s.yLabelOffset) || 0) / 50);
      const gridMajor = s.showGrid === false ? 'element_blank()' : 'element_line(color = "#E5E7EB", linewidth = 0.35)';
      const gridMinor = s.showMinorGrid ? 'element_line(color = "#F3F4F6", linewidth = 0.2)' : 'element_blank()';
      const axisLineWidth = Number(s.axisLineWidth) || 0.45;
      const background = s.background === 'transparent' ? 'transparent' : 'white';
      const xColumn = this.rColumn(s.xColumn);
      const yColumn = this.rColumn(s.yColumn);
      const groupColumn = this.rColumn(s.groupColumn);
      const errorColumn = this.rColumn(s.errorColumn);
      const aesParts = [];
      if (s.xColumn) aesParts.push(`x = ${xColumn}`);
      if (s.yColumn) aesParts.push(`y = ${yColumn}`);
      if (s.groupColumn) {
        aesParts.push(`fill = ${groupColumn}`, `color = ${groupColumn}`);
      }

      code += `${pVar} <- ggplot(df, aes(${aesParts.join(', ')}))\n`;

      if (s.chartType === 'bar') {
        const position = s.groupColumn ? `position_dodge(width = ${s.barWidth})` : '"identity"';
        code += `  + geom_bar(stat = "identity", position = ${position}, width = ${s.barWidth}, alpha = 0.9)\n`;
        if (s.showErrorBars && s.errorColumn) {
          code += `  + geom_errorbar(aes(ymin = ${yColumn} - ${errorColumn}, ymax = ${yColumn} + ${errorColumn}), position = ${position}, width = 0.2, color = "#333333", size = 0.6)\n`;
        }
      } else if (s.chartType === 'scatter') {
        code += `  + geom_point(size = ${s.pointSize}, alpha = 0.85)\n`;
      } else if (s.chartType === 'line') {
        const groupAes = s.groupColumn ? `, group = ${groupColumn}` : '';
        code += `  + geom_line(aes(${groupAes.replace(', ', '')}), size = ${s.lineWidth})\n`;
        code += `  + geom_point(size = ${s.pointSize})\n`;
      } else if (s.chartType === 'boxplot') {
        code += `  + geom_boxplot(alpha = 0.8, width = ${s.barWidth}, outlier.size = 2)\n`;
      } else if (s.chartType === 'violin') {
        code += `  + geom_violin(alpha = 0.72, width = ${s.barWidth}, trim = FALSE)\n`;
        code += `  + geom_boxplot(width = ${Math.min(0.22, s.barWidth * 0.35)}, outlier.shape = NA, alpha = 0.9)\n`;
        if (s.showRawPoints !== false) code += `  + geom_jitter(width = 0.12, size = ${s.pointSize * 0.55}, alpha = 0.48)\n`;
      } else if (s.chartType === 'dotplot') {
        code += `  + geom_jitter(width = 0.16, height = 0, size = ${s.pointSize}, alpha = 0.78)\n`;
      } else if (s.chartType === 'histogram') {
        code += `  + geom_histogram(bins = ${Math.max(5, Number(s.binCount) || 30)}, fill = "${(s.palette || ['#2563EB'])[0]}", color = "white", alpha = 0.86)\n`;
      } else if (s.chartType === 'density') {
        code += `  + geom_density(alpha = 0.35, linewidth = ${s.lineWidth})\n`;
      } else if (s.chartType === 'volcano') {
        const xThreshold = Math.abs(Number(s.thresholdX) || 1);
        const yThreshold = Math.abs(Number(s.thresholdY) || 1.3);
        code += `  + geom_point(aes(color = abs(${xColumn}) >= ${xThreshold} & ${yColumn} >= ${yThreshold}), size = ${s.pointSize}, alpha = 0.78)\n`;
        code += `  + geom_vline(xintercept = c(-${xThreshold}, ${xThreshold}), linetype = "dashed", color = "#9CA3AF")\n`;
        code += `  + geom_hline(yintercept = ${yThreshold}, linetype = "dashed", color = "#9CA3AF")\n`;
        code += `  + scale_color_manual(values = c("FALSE" = "#B8C0CC", "TRUE" = "#DC2626"), guide = "none")\n`;
        if (s.labelColumn) code += `  + ggrepel::geom_text_repel(aes(label = ${this.rColumn(s.labelColumn)}), data = subset(df, abs(${xColumn}) >= ${xThreshold} & ${yColumn} >= ${yThreshold}), size = 3, max.overlaps = 12)\n`;
      } else if (s.chartType === 'heatmap') {
        code += `  + geom_tile(aes(fill = ${yColumn}), color = "white", linewidth = 0.25)\n`;
        const heatmapPalette = s.theme === 'bw'
          ? ['#374151', '#111827']
          : (s.palette && s.palette.length ? s.palette : ['#2166AC', '#B2182B']);
        const low = heatmapPalette[0] || '#2166AC';
        const high = heatmapPalette[1] || heatmapPalette[heatmapPalette.length - 1] || '#B2182B';
        const heatValues = rows.map(row => Number(row[s.yColumn])).filter(value => Number.isFinite(value));
        const divergingHeatmap = heatValues.some(value => value < 0) && heatValues.some(value => value > 0);
        code += divergingHeatmap
          ? `  + scale_fill_gradient2(low = "${low}", mid = "white", high = "${high}", midpoint = 0, name = "${this.rString(s.yColumn || 'Value')}")\n`
          : `  + scale_fill_gradient(low = "${low}", high = "${high}", name = "${this.rString(s.yColumn || 'Value')}")\n`;
        if (s.showHeatmapValues) code += `  + geom_text(aes(label = ${yColumn}), size = 3, color = "#111827")\n`;
      }

      if (s.palette && s.palette.length > 0 && s.chartType !== 'heatmap' && s.chartType !== 'volcano') {
        const colorValues = s.palette.map(c => `"${c}"`).join(', ');
        code += `  + scale_fill_manual(values = c(${colorValues}))\n`;
        code += `  + scale_color_manual(values = c(${colorValues}))\n`;
      }

      if (s.yMin !== null || s.yMax !== null) {
        const lower = s.yMin === null || s.yMin === undefined ? 'NA' : Number(s.yMin);
        const upper = s.yMax === null || s.yMax === undefined ? 'NA' : Number(s.yMax);
        code += `  + coord_cartesian(ylim = c(${lower}, ${upper}), clip = "off")\n`;
      }

      code += `  + labs(\n`;
      code += `    title = "${this.rString(s.figureTag ? s.figureTag + ' ' : '')}${this.rString(s.title)}",\n`;
      if (s.subtitle) code += `    subtitle = "${this.rString(s.subtitle)}",\n`;
      code += `    x = "${this.rString(s.xLabel)}",\n`;
      code += `    y = "${this.rString(s.yLabel)}"${s.legendTitle ? `,\n    fill = "${this.rString(s.legendTitle)}",\n    color = "${this.rString(s.legendTitle)}"` : ''}\n`;
      code += `  )\n`;

      let themeFn = 'theme_classic';
      if (s.theme === 'bw') themeFn = 'theme_bw';
      else if (s.theme === 'dark') themeFn = 'theme_dark';
      code += `  + ${themeFn}(base_family = "${s.fontFamily.split(',')[0].replace(/'/g, '')}")\n`;

      code += `  + theme(\n`;
      code += `    plot.title = element_text(size = ${s.fontSizeTitle}, face = "bold", hjust = ${titleHjust.toFixed(3)}, vjust = ${titleVjust.toFixed(3)}),\n`;
      code += `    plot.subtitle = element_text(size = ${s.fontSizeSubtitle || Math.round(s.fontSizeTitle * 0.8)}, color = "#555555", hjust = ${subtitleHjust.toFixed(3)}, vjust = ${subtitleVjust.toFixed(3)}),\n`;
      code += `    axis.title.x = element_text(size = ${s.fontSizeXAxis || s.fontSizeAxis}, face = "bold", vjust = ${xTitleVjust.toFixed(3)}),\n`;
      code += `    axis.title.y = element_text(size = ${s.fontSizeYAxis || s.fontSizeAxis}, face = "bold", vjust = ${yTitleVjust.toFixed(3)}),\n`;
      code += `    axis.text.x = element_text(size = ${Math.round(s.fontSizeAxis * 0.9)}, angle = ${s.xRotation}, hjust = ${s.xRotation > 0 ? 1 : 0.5}),\n`;
      code += `    axis.text.y = element_text(size = ${Math.round(s.fontSizeAxis * 0.9)}),\n`;
      code += `    legend.title = element_text(size = ${s.fontSizeLegend}, face = "bold"),\n`;
      code += `    legend.text = element_text(size = ${Math.round(s.fontSizeLegend * 0.9)}),\n`;
      code += `    legend.position = "${s.chartType === 'heatmap' ? 'right' : s.legendPosition}",\n`;
      code += `    panel.grid.major = ${gridMajor},\n`;
      code += `    panel.grid.minor = ${gridMinor},\n`;
      code += `    axis.line = element_line(linewidth = ${axisLineWidth}),\n`;
      code += `    plot.background = element_rect(fill = "${background}", color = NA),\n`;
      code += `    panel.background = element_rect(fill = "${background}", color = NA)\n`;
      code += `  )\n\n`;

      code += `# Canvas: ${widthIn} x ${heightIn} in at ${exportDpi} DPI (${background} background)\n\n`;
    });

    // 3. Export
    code += `# 3. Export publication-ready figure\n`;
    if (plots.length > 1) {
      const plotVars = plots.map((_, i) => `p${i + 1}`).join(' + ');
      const panelColumns = Math.min(2, plots.length);
      const figureWidth = Math.max(...plots.map(p => Number(p.figureWidthIn) || 6.5)) * panelColumns;
      const figureHeight = Math.max(...plots.map(p => Number(p.figureHeightIn) || 4.5)) * Math.ceil(plots.length / panelColumns);
      const dpi = Math.max(...plots.map(p => Number(p.exportDpi) || 300));
      const bg = plots.some(p => p.background === 'transparent') ? 'transparent' : 'white';
      code += `figure_final <- ${plotVars}\n`;
      code += `ggsave("Figure_MultiPanel.pdf", plot = figure_final, width = ${figureWidth}, height = ${figureHeight}, units = "in", dpi = ${dpi}, bg = "${bg}")\n`;
      code += `ggsave("Figure_MultiPanel.png", plot = figure_final, width = ${figureWidth}, height = ${figureHeight}, units = "in", dpi = ${dpi}, bg = "${bg}")\n`;
    } else {
      const s = plots[0];
      const width = Number(s.figureWidthIn) || 6.5;
      const height = Number(s.figureHeightIn) || 4.5;
      const dpi = Number(s.exportDpi) || 300;
      const bg = s.background === 'transparent' ? 'transparent' : 'white';
      code += `ggsave("Figure1_Final.pdf", plot = p1, width = ${width}, height = ${height}, units = "in", dpi = ${dpi}, bg = "${bg}")\n`;
      code += `ggsave("Figure1_Final.png", plot = p1, width = ${width}, height = ${height}, units = "in", dpi = ${dpi}, bg = "${bg}")\n`;
    }

    this.rCodeSubject.next(code);
  }

  // Parse modified R script
  parseRCodeAndUpdateState(rawCode: string) {
    // Imported or pasted R code is the authoritative program.  Do not reduce
    // it to a guessed chart configuration: it will run unchanged on the R
    // renderer with the selected input workbook.
    this.setRSourceCode(rawCode);
  }
}
