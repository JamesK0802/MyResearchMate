import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlotState } from '../../services/r-plot-sync.service';

@Component({
  selector: 'app-r-plot-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="plot-preview-box" [ngClass]="plotState?.theme">
      <svg [attr.viewBox]="'0 0 ' + svgWidth + ' ' + svgHeight" class="preview-svg">
        <!-- Background -->
        <rect x="0" y="0" [attr.width]="svgWidth" [attr.height]="svgHeight" [attr.fill]="getThemeBg()" />

        <!-- Figure Panel Tag & Title (Non-overlapping) -->
        <text *ngIf="plotState?.figureTag"
              [attr.x]="tagX"
              [attr.y]="titleY"
              [attr.font-family]="plotState?.fontFamily"
              font-size="13"
              font-weight="bold"
              [attr.fill]="getThemeText()">
          {{ plotState?.figureTag }}
        </text>

        <text [attr.x]="titleX"
              [attr.y]="titleY"
              [attr.font-family]="plotState?.fontFamily"
              font-size="11"
              font-weight="bold"
              [attr.fill]="getThemeText()">
          {{ plotState?.title || 'Figure Title' }}
        </text>

        <text *ngIf="plotState?.subtitle"
              [attr.x]="titleX"
              [attr.y]="subtitleY"
              [attr.font-family]="plotState?.fontFamily"
              font-size="8.5"
              [attr.fill]="getSubtitleColor()">
          {{ plotState?.subtitle }}
        </text>

        <!-- Grid Lines -->
        <g *ngIf="plotState?.showGrid !== false && plotState?.chartType !== 'heatmap'" class="grid-lines" [attr.stroke]="getGridLineColor()" stroke-width="0.8" stroke-dasharray="3 3">
          <line *ngFor="let tick of yTicks"
                [attr.x1]="margin.left"
                [attr.y1]="tick.y"
                [attr.x2]="margin.left + plotWidth"
                [attr.y2]="tick.y" />
        </g>

        <!-- Y Axis -->
        <line
          [attr.x1]="margin.left"
          [attr.y1]="margin.top"
          [attr.x2]="margin.left"
          [attr.y2]="svgHeight - margin.bottom"
          [attr.stroke]="getAxisLineColor()"
          stroke-width="1.2"
        />
        <g *ngIf="plotState?.chartType !== 'heatmap'">
          <g *ngFor="let tick of yTicks">
          <line
            [attr.x1]="margin.left - 4"
            [attr.y1]="tick.y"
            [attr.x2]="margin.left"
            [attr.y2]="tick.y"
            [attr.stroke]="getAxisLineColor()"
            stroke-width="1"
          />
          <text
            [attr.x]="margin.left - 6"
            [attr.y]="tick.y + 3"
            text-anchor="end"
            [attr.font-family]="plotState?.fontFamily"
            font-size="8.5"
            [attr.fill]="getThemeText()">
            {{ tick.val }}
          </text>
          </g>
        </g>
        <g *ngIf="plotState?.chartType === 'heatmap'">
          <g *ngFor="let row of heatmapRows">
            <line [attr.x1]="margin.left - 4" [attr.y1]="row.y" [attr.x2]="margin.left" [attr.y2]="row.y" [attr.stroke]="getAxisLineColor()" stroke-width="1" />
            <text [attr.x]="margin.left - 6" [attr.y]="row.y + 3" text-anchor="end" [attr.font-family]="plotState?.fontFamily" font-size="8.5" [attr.fill]="getThemeText()">{{ row.label }}</text>
          </g>
        </g>

        <!-- Y Label -->
        <text
          [attr.x]="-(margin.top + (plotHeight / 2))"
          [attr.y]="Math.max(10, margin.left - 38)"
          transform="rotate(-90)"
          text-anchor="middle"
          [attr.font-family]="plotState?.fontFamily"
          font-size="9.5"
          font-weight="bold"
          [attr.fill]="getThemeText()">
          {{ plotState?.yLabel }}
        </text>

        <!-- X Axis -->
        <line
          [attr.x1]="margin.left"
          [attr.y1]="svgHeight - margin.bottom"
          [attr.x2]="margin.left + plotWidth"
          [attr.y2]="svgHeight - margin.bottom"
          [attr.stroke]="getAxisLineColor()"
          stroke-width="1.2"
        />
        <g *ngFor="let item of chartGroups">
          <line
            [attr.x1]="item.x"
            [attr.y1]="svgHeight - margin.bottom"
            [attr.x2]="item.x"
            [attr.y2]="svgHeight - margin.bottom + 4"
            [attr.stroke]="getAxisLineColor()"
            stroke-width="1"
          />
          <text
            [attr.x]="item.x"
            [attr.y]="svgHeight - margin.bottom + 14"
            [attr.text-anchor]="(plotState?.xRotation || 0) > 0 ? 'end' : 'middle'"
            [attr.transform]="(plotState?.xRotation || 0) > 0 ? 'rotate(-' + plotState?.xRotation + ' ' + item.x + ' ' + (svgHeight - margin.bottom + 14) + ')' : null"
            [attr.font-family]="plotState?.fontFamily"
            font-size="8.5"
            [attr.fill]="getThemeText()">
            {{ item.label }}
          </text>
        </g>

        <!-- X Label -->
        <text
          [attr.x]="margin.left + (plotWidth / 2)"
          [attr.y]="svgHeight - 6"
          text-anchor="middle"
          [attr.font-family]="plotState?.fontFamily"
          font-size="9.5"
          font-weight="bold"
          [attr.fill]="getThemeText()">
          {{ plotState?.xLabel }}
        </text>

        <!-- Geometry Renderings -->
        <!-- 1. Bar Chart -->
        <g *ngIf="plotState?.chartType === 'bar' || plotState?.chartType === 'histogram'">
          <g *ngFor="let item of renderItems">
            <rect
              [attr.x]="item.x"
              [attr.y]="item.y"
              [attr.width]="Math.max(1, item.width)"
              [attr.height]="Math.max(0, item.height)"
              [attr.fill]="item.color"
              [attr.stroke]="getBarBorderColor()"
              stroke-width="0.8"
              rx="1"
            />
            <g *ngIf="plotState?.showErrorBars && item.errorYMin !== undefined">
              <line [attr.x1]="item.centerX" [attr.y1]="item.errorYMin" [attr.x2]="item.centerX" [attr.y2]="item.errorYMax" [attr.stroke]="getAxisLineColor()" stroke-width="1.2" />
              <line [attr.x1]="item.centerX - 4" [attr.y1]="item.errorYMin" [attr.x2]="item.centerX + 4" [attr.y2]="item.errorYMin" [attr.stroke]="getAxisLineColor()" stroke-width="1.2" />
              <line [attr.x1]="item.centerX - 4" [attr.y1]="item.errorYMax" [attr.x2]="item.centerX + 4" [attr.y2]="item.errorYMax" [attr.stroke]="getAxisLineColor()" stroke-width="1.2" />
            </g>
          </g>
        </g>

        <!-- 2. Scatter Plot -->
        <g *ngIf="plotState?.chartType === 'scatter' || plotState?.chartType === 'dotplot' || plotState?.chartType === 'volcano'">
          <circle *ngFor="let item of renderItems"
                  [attr.cx]="item.centerX"
                  [attr.cy]="item.y"
                  [attr.r]="plotState?.pointSize || 4"
                  [attr.fill]="item.color"
                  [attr.stroke]="getThemeBg()"
                  stroke-width="1" />
        </g>

        <!-- 3. Line Plot -->
        <g *ngIf="plotState?.chartType === 'line' || plotState?.chartType === 'density'">
          <g *ngFor="let line of lineSeries">
            <polyline [attr.points]="line.pointsStr" [attr.stroke]="line.color" stroke-width="2" fill="none" />
            <circle *ngFor="let pt of line.points" [attr.cx]="pt.x" [attr.cy]="pt.y" [attr.r]="plotState?.pointSize || 3.5" [attr.fill]="line.color" [attr.stroke]="getThemeBg()" stroke-width="1" />
          </g>
        </g>

        <!-- 4. Boxplot -->
        <g *ngIf="plotState?.chartType === 'boxplot'">
          <g *ngFor="let item of renderItems">
            <line [attr.x1]="item.centerX" [attr.y1]="item.whiskerHighY" [attr.x2]="item.centerX" [attr.y2]="item.whiskerLowY" [attr.stroke]="getAxisLineColor()" stroke-width="1" />
            <line [attr.x1]="item.x + item.width * .22" [attr.y1]="item.whiskerHighY" [attr.x2]="item.x + item.width * .78" [attr.y2]="item.whiskerHighY" [attr.stroke]="getAxisLineColor()" stroke-width="1" />
            <line [attr.x1]="item.x + item.width * .22" [attr.y1]="item.whiskerLowY" [attr.x2]="item.x + item.width * .78" [attr.y2]="item.whiskerLowY" [attr.stroke]="getAxisLineColor()" stroke-width="1" />
            <rect [attr.x]="item.x" [attr.y]="item.y" [attr.width]="Math.max(1, item.width)" [attr.height]="Math.max(0, item.height)" [attr.fill]="item.color" [attr.stroke]="getAxisLineColor()" stroke-width="1" rx="1" />
            <line [attr.x1]="item.x" [attr.y1]="item.medianY" [attr.x2]="item.x + item.width" [attr.y2]="item.medianY" [attr.stroke]="getThemeText()" stroke-width="1.8" />
          </g>
        </g>

        <!-- 5. Violin: compact distribution silhouette plus replicate dots -->
        <g *ngIf="plotState?.chartType === 'violin'">
          <g *ngFor="let item of renderItems">
            <ellipse [attr.cx]="item.centerX" [attr.cy]="item.centerY" [attr.rx]="item.width / 2" [attr.ry]="Math.max(8, item.height / 2)" [attr.fill]="item.color" fill-opacity=".62" [attr.stroke]="getAxisLineColor()" stroke-width="1" />
            <circle *ngFor="let point of item.points" [attr.cx]="point.x" [attr.cy]="point.y" [attr.r]="plotState?.showRawPoints !== false ? 2.4 : 0" [attr.fill]="getThemeText()" fill-opacity=".72" />
            <line [attr.x1]="item.centerX - item.width / 2" [attr.x2]="item.centerX + item.width / 2" [attr.y1]="item.medianY" [attr.y2]="item.medianY" [attr.stroke]="getThemeText()" stroke-width="1.6" />
          </g>
        </g>

        <!-- 6. Heatmap -->
        <g *ngIf="plotState?.chartType === 'heatmap'">
          <rect *ngFor="let item of renderItems" [attr.x]="item.x" [attr.y]="item.y" [attr.width]="item.width" [attr.height]="item.height" [attr.fill]="item.color" stroke="#ffffff" stroke-width="1" />
        </g>
        <g *ngIf="plotState?.chartType === 'heatmap'">
          <defs><linearGradient id="preview-heatmap-value-scale" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" [attr.stop-color]="heatmapLowColor" /><stop offset="50%" [attr.stop-color]="heatmapMidColor" /><stop offset="100%" [attr.stop-color]="heatmapHighColor" /></linearGradient></defs>
          <text [attr.x]="heatmapLegendX" [attr.y]="margin.top - 6" [attr.font-family]="plotState?.fontFamily" font-size="7.5" font-weight="bold" [attr.fill]="getThemeText()">{{ heatmapValueLabel }}</text>
          <rect [attr.x]="heatmapLegendX" [attr.y]="margin.top" width="9" [attr.height]="plotHeight" fill="url(#preview-heatmap-value-scale)" [attr.stroke]="getAxisLineColor()" stroke-width=".4" />
          <text [attr.x]="heatmapLegendX + 13" [attr.y]="margin.top + 3" [attr.font-family]="plotState?.fontFamily" font-size="7" [attr.fill]="getThemeText()">{{ formatHeatValue(heatmapColorMax) }}</text>
          <text *ngIf="heatmapIsDiverging" [attr.x]="heatmapLegendX + 13" [attr.y]="margin.top + plotHeight / 2 + 3" [attr.font-family]="plotState?.fontFamily" font-size="7" [attr.fill]="getThemeText()">0</text>
          <text [attr.x]="heatmapLegendX + 13" [attr.y]="margin.top + plotHeight" [attr.font-family]="plotState?.fontFamily" font-size="7" [attr.fill]="getThemeText()">{{ formatHeatValue(heatmapColorMin) }}</text>
        </g>

        <!-- Legend (Non-overlapping) -->
        <g *ngIf="plotState?.legendPosition !== 'none' && legendItems.length > 0">
          <g *ngIf="plotState?.legendPosition === 'right' || plotState?.legendPosition === 'left'">
            <text [attr.x]="legendX" [attr.y]="legendY" [attr.font-family]="plotState?.fontFamily" font-size="8.5" font-weight="bold" [attr.fill]="getThemeText()">
              {{ plotState?.legendTitle || 'Legend' }}
            </text>
            <g *ngFor="let leg of legendItems; let lIdx = index">
              <rect [attr.x]="legendX" [attr.y]="legendY + 5 + (lIdx * 14)" width="9" height="9" rx="1" [attr.fill]="leg.color" />
              <text [attr.x]="legendX + 13" [attr.y]="legendY + 13 + (lIdx * 14)" [attr.font-family]="plotState?.fontFamily" font-size="8" [attr.fill]="getThemeText()">
                {{ leg.label }}
              </text>
            </g>
          </g>
          <g *ngIf="plotState?.legendPosition === 'top' || plotState?.legendPosition === 'bottom'">
            <g *ngFor="let leg of legendItems; let lIdx = index">
              <rect [attr.x]="legendX + (lIdx * 75)" [attr.y]="legendY - 8" width="9" height="9" rx="1" [attr.fill]="leg.color" />
              <text [attr.x]="legendX + (lIdx * 75) + 12" [attr.y]="legendY" [attr.font-family]="plotState?.fontFamily" font-size="8" [attr.fill]="getThemeText()">
                {{ leg.label }}
              </text>
            </g>
          </g>
        </g>

      </svg>
    </div>
  `,
  styles: [`
    .plot-preview-box {
      width: 100%;
      height: 100%;
      min-height: 260px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      position: relative;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
    }

    .plot-preview-box.dark {
      background: #0f172a;
    }

    .preview-svg {
      width: 100%;
      height: 100%;
      max-height: 380px;
    }
  `]
})
export class RPlotPreviewComponent implements OnInit, OnChanges {
  @Input() plotState!: PlotState;
  @Input() data: Array<Record<string, any>> = [];

  Math = Math;
  svgWidth = 480;
  svgHeight = 320;
  margin = { top: 48, right: 85, bottom: 45, left: 55 };

  tagX = 14;
  titleX = 14;
  titleY = 18;
  subtitleY = 30;

  yTicks: Array<{ val: number; y: number }> = [];
  chartGroups: Array<{ label: string; x: number }> = [];
  renderItems: Array<any> = [];
  lineSeries: Array<{ color: string; pointsStr: string; points: Array<{ x: number; y: number }> }> = [];
  legendItems: Array<{ label: string; color: string }> = [];
  heatmapRows: Array<{ label: string; y: number }> = [];
  heatmapColorMin = 0;
  heatmapColorMax = 1;
  heatmapIsDiverging = false;
  private heatmapPalette: string[] = ['#2563EB', '#EF4444'];
  legendX = 395;
  legendY = 50;

  ngOnInit() {
    this.computeLayout();
  }

  ngOnChanges(changes: SimpleChanges) {
    this.computeLayout();
  }

  get plotWidth(): number {
    return Math.max(10, this.svgWidth - this.margin.left - this.margin.right);
  }

  get plotHeight(): number {
    return Math.max(10, this.svgHeight - this.margin.top - this.margin.bottom);
  }

  get heatmapLowColor(): string { return this.heatmapPalette[0] || '#2166AC'; }
  get heatmapHighColor(): string { return this.heatmapPalette[1] || this.heatmapPalette[this.heatmapPalette.length - 1] || '#B2182B'; }
  get heatmapMidColor(): string {
    return this.heatmapIsDiverging
      ? '#ffffff'
      : this.blendColors(this.heatmapLowColor, this.heatmapHighColor, .5);
  }
  get heatmapLegendX(): number { return this.margin.left + this.plotWidth + 15; }
  get heatmapValueLabel(): string { return this.plotState?.yColumn || 'Value'; }
  formatHeatValue(value: number): string { return Number(value.toFixed(2)).toString(); }

  getThemeBg(): string {
    if (this.plotState?.theme === 'dark') return '#0f172a';
    if (this.plotState?.background === 'transparent') return 'transparent';
    return '#ffffff';
  }

  getThemeText(): string {
    if (this.plotState?.theme === 'dark') return '#f8fafc';
    return '#111827';
  }

  getSubtitleColor(): string {
    if (this.plotState?.theme === 'dark') return '#94a3b8';
    return '#6b7280';
  }

  getAxisLineColor(): string {
    if (this.plotState?.theme === 'dark') return '#94a3b8';
    return '#1e293b';
  }

  getGridLineColor(): string {
    if (this.plotState?.theme === 'dark') return '#1e293b';
    return '#e2e8f0';
  }

  getBarBorderColor(): string {
    if (this.plotState?.theme === 'dark') return '#0f172a';
    return '#1e293b';
  }

  private heatColor(value: number, min: number, max: number, palette: string[]): string {
    const low = palette[0] || '#2166AC';
    const high = palette[1] || palette[palette.length - 1] || '#B2182B';
    if (min < 0 && max > 0) {
      return value <= 0
        ? this.blendColors(low, '#ffffff', (value - min) / Math.max(0.000001, -min))
        : this.blendColors('#ffffff', high, value / Math.max(0.000001, max));
    }
    // Keep the guided preview on the same low → high palette scale as the
    // canvas and its legend; white is only the diverging midpoint.
    return this.blendColors(low, high, (value - min) / Math.max(0.000001, max - min));
  }

  private blendColors(from: string, to: string, amount: number): string {
    const mix = Math.max(0, Math.min(1, amount));
    const lower = this.hexToRgb(from);
    const upper = this.hexToRgb(to);
    return `rgb(${Math.round(lower.r + ((upper.r - lower.r) * mix))}, ${Math.round(lower.g + ((upper.g - lower.g) * mix))}, ${Math.round(lower.b + ((upper.b - lower.b) * mix))})`;
  }

  private hexToRgb(color: string): { r: number; g: number; b: number } {
    const hex = color.replace('#', '');
    const normalized = hex.length === 3 ? hex.split('').map(char => char + char).join('') : hex;
    const value = Number.parseInt(normalized, 16);
    return Number.isFinite(value)
      ? { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
      : { r: 33, g: 102, b: 172 };
  }

  computeLayout() {
    if (!this.plotState) return;

    const widthIn = Number(this.plotState.figureWidthIn) || 6.5;
    const heightIn = Number(this.plotState.figureHeightIn) || 4.5;
    this.svgHeight = Math.max(220, Math.min(520, Math.round(this.svgWidth * heightIn / widthIn)));

    // Use fallback sample data if data is empty so preview is always live and responsive
    const activeData = (this.data && this.data.length > 0)
      ? this.data
      : [
          { Sample: 'Group A', Value: 12 },
          { Sample: 'Group B', Value: 28 },
          { Sample: 'Group C', Value: 19 }
        ];

    const s = this.plotState;
    const xCol = s.xColumn || Object.keys(activeData[0])[0];
    const yCol = s.yColumn || Object.keys(activeData[0])[1] || Object.keys(activeData[0])[0];
    const grpCol = s.groupColumn;
    const errCol = s.errorColumn;
    const densityValues = s.chartType === 'density'
      ? activeData.map(row => Number(row[xCol])).filter(value => Number.isFinite(value))
      : [];
    const densityCurve = this.createDensityCurve(densityValues);
    const histogramValues = s.chartType === 'histogram'
      ? activeData.map(row => Number(row[xCol])).filter(value => Number.isFinite(value))
      : [];
    const histogram = this.createHistogram(histogramValues, Math.max(5, Math.min(80, Number(s.binCount) || 30)));

    // 1. Calculate Y Min / Max & Ticks
    let maxVal = 0;
    activeData.forEach(r => {
      const v = Number(r[yCol]) || 0;
      const err = errCol ? (Number(r[errCol]) || 0) : 0;
      if (v + err > maxVal) maxVal = v + err;
    });
    if (s.chartType === 'histogram') maxVal = Math.max(1, ...histogram.counts);
    if (s.chartType === 'density' && densityCurve.length) maxVal = Math.max(0.01, ...densityCurve.map(point => point.density));
    if (maxVal === 0) maxVal = 10;

    const yCeil = Math.ceil(maxVal * 1.15);
    const tickCount = 4;
    this.yTicks = [];
    for (let i = 0; i <= tickCount; i++) {
      const val = Math.round((yCeil / tickCount) * i * 10) / 10;
      this.yTicks.push({ val, y: 0 });
    }

    // 2. Dynamic Left Margin
    const maxYStrLen = Math.max(...this.yTicks.map(t => String(t.val).length), 1);
    const baseLeftMargin = Math.max(50, maxYStrLen * 7.5 + 20);

    // 3. Collision-free Header Coordinates
    const hasTag = !!s.figureTag && s.figureTag.trim() !== '';
    const hasSubtitle = !!s.subtitle && s.subtitle.trim() !== '';
    this.tagX = 14;
    this.titleX = hasTag ? 36 : 14;
    this.titleY = 18;
    this.subtitleY = 30;

    const legPos = s.legendPosition || 'right';
    if (legPos === 'top') {
      const headerTopOffset = hasSubtitle ? 36 : 24;
      this.legendX = baseLeftMargin;
      this.legendY = headerTopOffset + 12;
      this.margin = { top: headerTopOffset + 24, right: 25, bottom: 45, left: baseLeftMargin };
    } else if (legPos === 'bottom') {
      this.legendX = baseLeftMargin;
      this.legendY = this.svgHeight - 8;
      this.margin = { top: hasSubtitle ? 42 : 30, right: 25, bottom: 58, left: baseLeftMargin };
    } else if (legPos === 'right') {
      this.margin = { top: hasSubtitle ? 42 : 30, right: 85, bottom: 45, left: baseLeftMargin };
      this.legendX = this.svgWidth - this.margin.right + 10;
      this.legendY = this.margin.top + 8;
    } else if (legPos === 'left') {
      this.margin = { top: hasSubtitle ? 42 : 30, right: 25, bottom: 45, left: baseLeftMargin + 75 };
      this.legendX = 10;
      this.legendY = this.margin.top + 8;
    } else { // 'none'
      this.margin = { top: hasSubtitle ? 42 : 30, right: 25, bottom: 45, left: baseLeftMargin };
    }
    if (s.chartType === 'heatmap') this.margin.right = Math.max(this.margin.right, 76);

    // Recompute tick Y positions
    this.yTicks.forEach(t => {
      t.y = this.svgHeight - this.margin.bottom - ((t.val / yCeil) * this.plotHeight);
    });

    // 4. Group & Categories
    const xCategories = Array.from(new Set(activeData.map(r => String(r[xCol] ?? '')))).filter(c => c.trim() !== '');
    const groups = grpCol ? Array.from(new Set(activeData.map(r => String(r[grpCol] ?? '')))).filter(g => g.trim() !== '') : ['Default'];

    let palette = s.palette && s.palette.length > 0
      ? s.palette
      : ['#2563EB', '#EF4444', '#10B981', '#F59E0B'];

    if (s.theme === 'bw') {
      palette = ['#1F2937', '#4B5563', '#9CA3AF', '#D1D5DB'];
    }

    this.legendItems = s.chartType === 'heatmap' ? [] : groups.map((g, idx) => ({
      label: g,
      color: palette[idx % palette.length]
    }));

    const numCategories = Math.max(1, xCategories.length);
    const categoryWidth = this.plotWidth / numCategories;
    this.chartGroups = xCategories.map((cat, idx) => ({
      label: cat,
      x: this.margin.left + (idx * categoryWidth) + (categoryWidth / 2)
    }));
    if (s.chartType === 'density' && densityCurve.length > 1) {
      const labelIndexes = Array.from({ length: 6 }, (_, index) => Math.round(index * (densityCurve.length - 1) / 5));
      this.chartGroups = labelIndexes.map(index => ({
        label: Number(densityCurve[index].value.toFixed(2)).toString(),
        x: this.margin.left + (index / (densityCurve.length - 1)) * this.plotWidth
      }));
    }

    // 5. Render Items
    this.renderItems = [];
    this.lineSeries = [];
    this.heatmapRows = [];

    if (s.chartType === 'bar') {
      xCategories.forEach((cat, xIdx) => {
        const catCenterX = this.margin.left + (xIdx * categoryWidth) + (categoryWidth / 2);
        const catRows = activeData.filter(r => String(r[xCol]) === cat);

        if (groups.length > 1 && grpCol) {
          if (s.stackBars) {
            const barWidthPx = Math.max(2, categoryWidth * s.barWidth);
            const x = catCenterX - (barWidthPx / 2);
            let stacked = 0;
            groups.forEach((g, gIdx) => {
              const row = catRows.find(r => String(r[grpCol]) === g);
              if (!row) return;
              const value = Number(row[yCol]) || 0;
              const top = stacked + value;
              const height = Math.max(0, ((top - stacked) / yCeil) * this.plotHeight);
              this.renderItems.push({ x, y: this.svgHeight - this.margin.bottom - ((top / yCeil) * this.plotHeight), width: Math.max(2, barWidthPx - 2), height, centerX: x + (barWidthPx / 2), color: palette[gIdx % palette.length] });
              stacked = top;
            });
            return;
          }
          const subBarWidth = (categoryWidth * s.barWidth) / groups.length;
          const startX = catCenterX - ((subBarWidth * groups.length) / 2);

          groups.forEach((g, gIdx) => {
            const row = catRows.find(r => String(r[grpCol]) === g);
            if (!row) return;
            const val = Number(row[yCol]) || 0;
            const err = (errCol && row[errCol] !== undefined) ? (Number(row[errCol]) || 0) : 0;

            const height = Math.max(0, (val / yCeil) * this.plotHeight);
            const x = startX + (gIdx * subBarWidth);
            const y = this.svgHeight - this.margin.bottom - height;
            const centerX = x + (subBarWidth / 2);
            const color = palette[gIdx % palette.length];

            let errYMin: number | undefined = undefined;
            let errYMax: number | undefined = undefined;
            if (err > 0 && s.showErrorBars) {
              errYMin = Math.max(this.margin.top, this.svgHeight - this.margin.bottom - (((val + err) / yCeil) * this.plotHeight));
              errYMax = Math.min(this.svgHeight - this.margin.bottom, this.svgHeight - this.margin.bottom - (((Math.max(0, val - err)) / yCeil) * this.plotHeight));
            }

            this.renderItems.push({
              x, y, width: Math.max(2, subBarWidth - 2), height, centerX, color, errorYMin: errYMin, errorYMax: errYMax
            });
          });
        } else {
          const barWidthPx = Math.max(2, categoryWidth * s.barWidth);
          const x = catCenterX - (barWidthPx / 2);
          const row = catRows[0];
          if (!row) return;
          const val = Number(row[yCol]) || 0;
          const err = (errCol && row[errCol] !== undefined) ? (Number(row[errCol]) || 0) : 0;
          const height = Math.max(0, (val / yCeil) * this.plotHeight);
          const y = this.svgHeight - this.margin.bottom - height;

          let errYMin: number | undefined = undefined;
          let errYMax: number | undefined = undefined;
          if (err > 0 && s.showErrorBars) {
            errYMin = Math.max(this.margin.top, this.svgHeight - this.margin.bottom - (((val + err) / yCeil) * this.plotHeight));
            errYMax = Math.min(this.svgHeight - this.margin.bottom, this.svgHeight - this.margin.bottom - (((Math.max(0, val - err)) / yCeil) * this.plotHeight));
          }

          this.renderItems.push({
            x, y, width: barWidthPx, height, centerX: catCenterX, color: palette[0], errorYMin: errYMin, errorYMax: errYMax
          });
        }
      });
    } else if (s.chartType === 'boxplot') {
      const quantile = (values: number[], percentile: number) => {
        const index = (values.length - 1) * percentile;
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        return lower === upper ? values[lower] : values[lower] + ((values[upper] - values[lower]) * (index - lower));
      };
      xCategories.forEach((category, categoryIndex) => {
        const center = this.margin.left + (categoryIndex * categoryWidth) + (categoryWidth / 2);
        const boxGroups = grpCol ? groups : ['Default'];
        const width = Math.max(7, (categoryWidth * s.barWidth) / Math.max(1, boxGroups.length));
        boxGroups.forEach((group, groupIndex) => {
          const values = activeData
            .filter(row => String(row[xCol]) === category && (!grpCol || String(row[grpCol]) === group))
            .map(row => Number(row[yCol]))
            .filter(value => Number.isFinite(value))
            .sort((a, b) => a - b);
          if (!values.length) return;
          const q1 = quantile(values, .25);
          const q3 = quantile(values, .75);
          const x = center - ((width * boxGroups.length) / 2) + (groupIndex * width);
          const renderedWidth = Math.max(5, width - 2);
          const yFor = (value: number) => this.svgHeight - this.margin.bottom - ((value / yCeil) * this.plotHeight);
          const y = yFor(q3);
          this.renderItems.push({
            x, y, width: renderedWidth, height: Math.max(1, yFor(q1) - y), centerX: x + (renderedWidth / 2),
            medianY: yFor(quantile(values, .5)), whiskerHighY: yFor(values[values.length - 1]), whiskerLowY: yFor(values[0]),
            color: palette[groupIndex % palette.length]
          });
        });
      });
    } else if (s.chartType === 'scatter' || s.chartType === 'dotplot' || s.chartType === 'volcano') {
      activeData.forEach(r => {
        const catIndex = xCategories.indexOf(String(r[xCol]));
        const catCenterX = catIndex >= 0
          ? this.margin.left + (catIndex * categoryWidth) + (categoryWidth / 2)
          : this.margin.left + (Number(r[xCol]) || 0);

        const val = Number(r[yCol]) || 0;
        const y = this.svgHeight - this.margin.bottom - ((val / yCeil) * this.plotHeight);
        const gIdx = grpCol ? groups.indexOf(String(r[grpCol])) : 0;
        const color = palette[Math.max(0, gIdx) % palette.length];

        const jitter = s.chartType === 'dotplot' ? ((this.renderItems.length % 3) - 1) * 5 : 0;
        this.renderItems.push({ centerX: catCenterX + jitter, y, color });
      });
    } else if (s.chartType === 'density') {
      const points = densityCurve.map((point, index) => ({
        x: this.margin.left + (index / Math.max(1, densityCurve.length - 1)) * this.plotWidth,
        y: this.svgHeight - this.margin.bottom - ((point.density / yCeil) * this.plotHeight)
      }));
      this.lineSeries.push({ color: palette[0], pointsStr: points.map(point => `${point.x},${point.y}`).join(' '), points: [] });
    } else if (s.chartType === 'line') {
      groups.forEach((g, gIdx) => {
        const color = palette[gIdx % palette.length];
        const points: Array<{ x: number; y: number }> = [];

        const sourceCategories = xCategories;
        sourceCategories.forEach((cat, xIdx) => {
          const catCenterX = this.margin.left + (xIdx * categoryWidth) + (categoryWidth / 2);
          const row = activeData.find(r => String(r[xCol]) === cat && (!grpCol || String(r[grpCol]) === g));
          if (row) {
            const val = Number(row[yCol]) || 0;
            const y = this.svgHeight - this.margin.bottom - ((val / yCeil) * this.plotHeight);
            points.push({ x: catCenterX, y });
          }
        });

        const pointsStr = points.map(pt => `${pt.x},${pt.y}`).join(' ');
        this.lineSeries.push({ color, pointsStr, points });
      });
    } else if (s.chartType === 'violin') {
      xCategories.forEach((cat, index) => {
        const rows = activeData.filter(row => String(row[xCol]) === cat);
        const values = rows.map(row => Number(row[yCol]) || 0).sort((a, b) => a - b);
        if (!values.length) return;
        const centerX = this.margin.left + (index * categoryWidth) + (categoryWidth / 2);
        const yFor = (value: number) => this.svgHeight - this.margin.bottom - ((value / yCeil) * this.plotHeight);
        const topY = yFor(values[values.length - 1]);
        const bottomY = yFor(values[0]);
        const median = values[Math.floor(values.length / 2)];
        this.renderItems.push({
          centerX, centerY: (topY + bottomY) / 2, width: Math.min(50, categoryWidth * 0.45), height: Math.max(16, bottomY - topY), medianY: yFor(median), color: palette[index % palette.length],
          points: values.map((value, pointIndex) => ({ x: centerX + ((pointIndex % 3) - 1) * 5, y: yFor(value) }))
        });
      });
    } else if (s.chartType === 'histogram') {
      const maxCount = Math.max(...histogram.counts, 1);
      histogram.counts.forEach((count, index) => {
        const width = this.plotWidth / histogram.counts.length - 2;
        const height = (count / maxCount) * this.plotHeight;
        const x = this.margin.left + index * (this.plotWidth / histogram.counts.length) + 1;
        this.renderItems.push({ x, y: this.svgHeight - this.margin.bottom - height, width, height, color: palette[0] });
      });
    } else if (s.chartType === 'heatmap') {
      // Match the canvas: an ungrouped heatmap is still a valid one-row matrix.
      const rowCategories = grpCol
        ? Array.from(new Set(activeData.map(row => String(row[grpCol] ?? '')))).filter(Boolean)
        : ['Value'];
      const values = activeData.map(row => Number(row[yCol])).filter(value => Number.isFinite(value));
      const rawMin = values.length ? Math.min(...values) : 0;
      const rawMax = values.length ? Math.max(...values) : 1;
      const diverging = rawMin < 0 && rawMax > 0;
      const minValue = diverging ? Math.min(rawMin, 0) : rawMin;
      const maxValue = diverging ? Math.max(rawMax, 0) : rawMax;
      const cellWidth = this.plotWidth / Math.max(1, xCategories.length);
      const cellHeight = this.plotHeight / Math.max(1, rowCategories.length);
      this.heatmapRows = rowCategories.map((label, index) => ({ label, y: this.margin.top + ((index + 0.5) * cellHeight) }));
      this.heatmapColorMin = minValue;
      this.heatmapColorMax = maxValue;
      this.heatmapIsDiverging = diverging;
      this.heatmapPalette = [...palette];
      activeData.forEach(row => {
        const colIndex = xCategories.indexOf(String(row[xCol]));
        const rowIndex = grpCol ? rowCategories.indexOf(String(row[grpCol])) : 0;
        const value = Number(row[yCol]) || 0;
        this.renderItems.push({ x: this.margin.left + colIndex * cellWidth, y: this.margin.top + rowIndex * cellHeight, width: cellWidth, height: cellHeight, color: this.heatColor(value, minValue, maxValue, palette) });
      });
    }
  }

  private createDensityCurve(values: number[]): Array<{ value: number; density: number }> {
    if (!values.length) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(0.00001, max - min);
    const domainMin = min - (span * 0.06 || 1);
    const domainMax = max + (span * 0.06 || 1);
    const count = 36;
    const bandwidth = Math.max(0.00001, (domainMax - domainMin) / 12);
    return Array.from({ length: count }, (_, index) => {
      const value = domainMin + ((domainMax - domainMin) * index / (count - 1));
      const density = values.reduce((sum, current) => sum + Math.exp(-0.5 * Math.pow((value - current) / bandwidth, 2)), 0) / Math.max(1, values.length);
      return { value, density };
    });
  }

  private createHistogram(values: number[], requestedBins: number): { counts: number[] } {
    if (!values.length) return { counts: [0] };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(0.00001, max - min);
    const binWidth = span / requestedBins;
    const counts = Array.from({ length: requestedBins }, () => 0);
    values.forEach(value => {
      const index = Math.max(0, Math.min(requestedBins - 1, Math.floor((value - min) / binWidth)));
      counts[index]++;
    });
    return { counts };
  }
}
