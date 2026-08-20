import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

export interface DataColumn {
  name: string;
  type: 'string' | 'number';
}

export interface PlotState {
  id: string;
  // Chart Meta
  chartType: 'bar' | 'scatter' | 'boxplot' | 'line';
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
  fontSizeAxis: number;
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

export interface PlotProjectDocument {
  version: 1;
  columns: string[];
  data: Array<Record<string, any>>;
  plots: PlotState[];
  activePlotIndex: number;
  panelConfig: PanelConfig;
  viewMode: 'single' | 'grid';
  rCode: string;
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
      yMin: 0,
      yMax: null
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
  private wizardOpenSubject = new BehaviorSubject<boolean>(false);
  private viewModeSubject = new BehaviorSubject<'single' | 'grid'>('single');

  // Observables
  columns$ = this.columnsSubject.asObservable();
  data$ = this.dataSubject.asObservable();
  plots$ = this.plotsSubject.asObservable();
  activePlotIndex$ = this.activePlotIndexSubject.asObservable();
  panelConfig$ = this.panelConfigSubject.asObservable();
  rCode$ = this.rCodeSubject.asObservable();
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

  createProjectDocument(): PlotProjectDocument {
    return {
      version: 1,
      columns: [...this.columns],
      data: this.data.map(row => ({ ...row })),
      plots: this.plots.map(plot => ({ ...plot, palette: [...plot.palette] })),
      activePlotIndex: this.activePlotIndex,
      panelConfig: { ...this.panelConfig },
      viewMode: this.viewMode,
      rCode: this.rCode
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
      yMin: 0,
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
      yMin: 0,
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
        yMin: 0,
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
        yMin: 0,
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
        yMin: 0,
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
        yMin: 0,
        yMax: null
      }]);
      this.activePlotIndexSubject.next(0);
    }
  }

  // Generate R ggplot2 script supporting single and multi-panel figures (patchwork)
  private updateRCodeFromState() {
    const plots = this.plotsSubject.value;
    const cols = this.columnsSubject.value;
    const rows = this.dataSubject.value;

    let code = `# ==========================================================\n`;
    code += `# Publication-Ready Figure Generated by R-Plot Studio\n`;
    code += `# ==========================================================\n\n`;
    code += `library(ggplot2)\n`;
    code += `library(dplyr)\n`;
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
        return `"${String(val).replace(/"/g, '\\"')}"`;
      });
      code += `  ${col} = c(${vals.join(', ')})${idx < cols.length - 1 ? ',' : ''}\n`;
    });
    code += `)\n\n`;

    // 2. Generate each plot object (p1, p2, ...)
    code += `# 2. Construct ggplot Object(s)\n`;
    plots.forEach((s, pIdx) => {
      const pVar = `p${pIdx + 1}`;
      const aesParts = [];
      if (s.xColumn) aesParts.push(`x = ${s.xColumn}`);
      if (s.yColumn) aesParts.push(`y = ${s.yColumn}`);
      if (s.groupColumn) {
        aesParts.push(`fill = ${s.groupColumn}`, `color = ${s.groupColumn}`);
      }

      code += `${pVar} <- ggplot(df, aes(${aesParts.join(', ')}))\n`;

      if (s.chartType === 'bar') {
        const position = s.groupColumn ? `position_dodge(width = ${s.barWidth})` : '"identity"';
        code += `  + geom_bar(stat = "identity", position = ${position}, width = ${s.barWidth}, alpha = 0.9)\n`;
        if (s.showErrorBars && s.errorColumn) {
          code += `  + geom_errorbar(aes(ymin = ${s.yColumn} - ${s.errorColumn}, ymax = ${s.yColumn} + ${s.errorColumn}), position = ${position}, width = 0.2, color = "#333333", size = 0.6)\n`;
        }
      } else if (s.chartType === 'scatter') {
        code += `  + geom_point(size = ${s.pointSize}, alpha = 0.85)\n`;
        code += `  + geom_smooth(method = "lm", se = FALSE, linetype = "dashed", size = 0.8)\n`;
      } else if (s.chartType === 'line') {
        const groupAes = s.groupColumn ? `, group = ${s.groupColumn}` : '';
        code += `  + geom_line(aes(${groupAes.replace(', ', '')}), size = ${s.lineWidth})\n`;
        code += `  + geom_point(size = ${s.pointSize})\n`;
        if (s.showErrorBars && s.errorColumn) {
          code += `  + geom_errorbar(aes(ymin = ${s.yColumn} - ${s.errorColumn}, ymax = ${s.yColumn} + ${s.errorColumn}), width = 0.15, size = 0.5)\n`;
        }
      } else if (s.chartType === 'boxplot') {
        code += `  + geom_boxplot(alpha = 0.8, width = ${s.barWidth}, outlier.size = 2)\n`;
        code += `  + geom_jitter(width = 0.15, size = ${s.pointSize * 0.6}, alpha = 0.5)\n`;
      }

      if (s.palette && s.palette.length > 0) {
        const colorValues = s.palette.map(c => `"${c}"`).join(', ');
        code += `  + scale_fill_manual(values = c(${colorValues}))\n`;
        code += `  + scale_color_manual(values = c(${colorValues}))\n`;
      }

      code += `  + labs(\n`;
      code += `    title = "${s.figureTag ? s.figureTag + ' ' : ''}${s.title}",\n`;
      if (s.subtitle) code += `    subtitle = "${s.subtitle}",\n`;
      code += `    x = "${s.xLabel}",\n`;
      code += `    y = "${s.yLabel}"${s.legendTitle ? `,\n    fill = "${s.legendTitle}",\n    color = "${s.legendTitle}"` : ''}\n`;
      code += `  )\n`;

      let themeFn = 'theme_classic';
      if (s.theme === 'bw') themeFn = 'theme_bw';
      else if (s.theme === 'dark') themeFn = 'theme_dark';
      code += `  + ${themeFn}(base_family = "${s.fontFamily.split(',')[0].replace(/'/g, '')}")\n`;

      code += `  + theme(\n`;
      code += `    plot.title = element_text(size = ${s.fontSizeTitle}, face = "bold", hjust = 0),\n`;
      code += `    plot.subtitle = element_text(size = ${Math.round(s.fontSizeTitle * 0.8)}, color = "#555555"),\n`;
      code += `    axis.title.x = element_text(size = ${s.fontSizeAxis}, face = "bold"),\n`;
      code += `    axis.title.y = element_text(size = ${s.fontSizeAxis}, face = "bold"),\n`;
      code += `    axis.text.x = element_text(size = ${Math.round(s.fontSizeAxis * 0.9)}, angle = ${s.xRotation}, hjust = ${s.xRotation > 0 ? 1 : 0.5}),\n`;
      code += `    axis.text.y = element_text(size = ${Math.round(s.fontSizeAxis * 0.9)}),\n`;
      code += `    legend.title = element_text(size = ${s.fontSizeLegend}, face = "bold"),\n`;
      code += `    legend.text = element_text(size = ${Math.round(s.fontSizeLegend * 0.9)}),\n`;
      code += `    legend.position = "${s.legendPosition}"\n`;
      code += `  )\n\n`;
    });

    // 3. Export
    code += `# 3. Export Publication Figure (300 DPI)\n`;
    if (plots.length > 1) {
      const plotVars = plots.map((_, i) => `p${i + 1}`).join(' + ');
      code += `figure_final <- ${plotVars}\n`;
      code += `ggsave("Figure_MultiPanel.pdf", plot = figure_final, width = ${plots.length * 4.5}, height = 5, units = "in", dpi = 300)\n`;
      code += `ggsave("Figure_MultiPanel.png", plot = figure_final, width = ${plots.length * 4.5}, height = 5, units = "in", dpi = 300)\n`;
    } else {
      code += `ggsave("Figure1_Final.pdf", plot = p1, width = 6.5, height = 4.5, units = "in", dpi = 300)\n`;
      code += `ggsave("Figure1_Final.png", plot = p1, width = 6.5, height = 4.5, units = "in", dpi = 300)\n`;
    }

    this.rCodeSubject.next(code);
  }

  // Parse modified R script
  parseRCodeAndUpdateState(rawCode: string) {
    this.rCodeSubject.next(rawCode);
    const stateUpdate: Partial<PlotState> = {};

    const titleMatch = rawCode.match(/title\s*=\s*"([^"]+)"/);
    if (titleMatch) stateUpdate.title = titleMatch[1];

    const subtitleMatch = rawCode.match(/subtitle\s*=\s*"([^"]+)"/);
    if (subtitleMatch) stateUpdate.subtitle = subtitleMatch[1];

    const xMatch = rawCode.match(/x\s*=\s*"([^"]+)"/);
    if (xMatch) stateUpdate.xLabel = xMatch[1];

    const yMatch = rawCode.match(/y\s*=\s*"([^"]+)"/);
    if (yMatch) stateUpdate.yLabel = yMatch[1];

    const fillMatch = rawCode.match(/fill\s*=\s*"([^"]+)"/);
    if (fillMatch) stateUpdate.legendTitle = fillMatch[1];

    if (rawCode.includes('geom_bar')) stateUpdate.chartType = 'bar';
    else if (rawCode.includes('geom_point') && !rawCode.includes('geom_line')) stateUpdate.chartType = 'scatter';
    else if (rawCode.includes('geom_line')) stateUpdate.chartType = 'line';
    else if (rawCode.includes('geom_boxplot')) stateUpdate.chartType = 'boxplot';

    const colorsMatch = rawCode.match(/scale_fill_manual\(values\s*=\s*c\(([^)]+)\)\)/);
    if (colorsMatch) {
      const parsedColors = colorsMatch[1].split(',').map(c => c.trim().replace(/"/g, ''));
      if (parsedColors.length > 0) stateUpdate.palette = parsedColors;
    }

    const legPosMatch = rawCode.match(/legend\.position\s*=\s*"([^"]+)"/);
    if (legPosMatch) {
      const pos = legPosMatch[1] as any;
      if (['top', 'bottom', 'left', 'right', 'none'].includes(pos)) {
        stateUpdate.legendPosition = pos;
      }
    }

    if (Object.keys(stateUpdate).length > 0) {
      this.updateActivePlotState(stateUpdate);
    }
  }
}
