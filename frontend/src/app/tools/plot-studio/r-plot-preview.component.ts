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
        <g *ngIf="plotState?.theme !== 'classic'" class="grid-lines" [attr.stroke]="getGridLineColor()" stroke-width="0.8" stroke-dasharray="3 3">
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
        <g *ngIf="plotState?.chartType === 'bar'">
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
        <g *ngIf="plotState?.chartType === 'scatter'">
          <circle *ngFor="let item of renderItems"
                  [attr.cx]="item.centerX"
                  [attr.cy]="item.y"
                  [attr.r]="plotState?.pointSize || 4"
                  [attr.fill]="item.color"
                  [attr.stroke]="getThemeBg()"
                  stroke-width="1" />
        </g>

        <!-- 3. Line Plot -->
        <g *ngIf="plotState?.chartType === 'line'">
          <g *ngFor="let line of lineSeries">
            <polyline [attr.points]="line.pointsStr" [attr.stroke]="line.color" stroke-width="2" fill="none" />
            <circle *ngFor="let pt of line.points" [attr.cx]="pt.x" [attr.cy]="pt.y" [attr.r]="plotState?.pointSize || 3.5" [attr.fill]="line.color" [attr.stroke]="getThemeBg()" stroke-width="1" />
          </g>
        </g>

        <!-- 4. Boxplot -->
        <g *ngIf="plotState?.chartType === 'boxplot'">
          <g *ngFor="let item of renderItems">
            <line [attr.x1]="item.centerX" [attr.y1]="item.y - 10" [attr.x2]="item.centerX" [attr.y2]="item.y + item.height + 10" [attr.stroke]="getAxisLineColor()" stroke-width="1" />
            <rect [attr.x]="item.x" [attr.y]="item.y" [attr.width]="Math.max(1, item.width)" [attr.height]="Math.max(0, item.height)" [attr.fill]="item.color" [attr.stroke]="getAxisLineColor()" stroke-width="1" rx="1" />
            <line [attr.x1]="item.x" [attr.y1]="item.y + (item.height / 2)" [attr.x2]="item.x + item.width" [attr.y2]="item.y + (item.height / 2)" [attr.stroke]="getThemeText()" stroke-width="1.8" />
          </g>
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

  getThemeBg(): string {
    if (this.plotState?.theme === 'dark') return '#0f172a';
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

  computeLayout() {
    if (!this.plotState) return;

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

    // 1. Calculate Y Min / Max & Ticks
    let maxVal = 0;
    activeData.forEach(r => {
      const v = Number(r[yCol]) || 0;
      const err = errCol ? (Number(r[errCol]) || 0) : 0;
      if (v + err > maxVal) maxVal = v + err;
    });
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

    this.legendItems = groups.map((g, idx) => ({
      label: g,
      color: palette[idx % palette.length]
    }));

    const numCategories = Math.max(1, xCategories.length);
    const categoryWidth = this.plotWidth / numCategories;
    this.chartGroups = xCategories.map((cat, idx) => ({
      label: cat,
      x: this.margin.left + (idx * categoryWidth) + (categoryWidth / 2)
    }));

    // 5. Render Items
    this.renderItems = [];
    this.lineSeries = [];

    if (s.chartType === 'bar' || s.chartType === 'boxplot') {
      xCategories.forEach((cat, xIdx) => {
        const catCenterX = this.margin.left + (xIdx * categoryWidth) + (categoryWidth / 2);
        const catRows = activeData.filter(r => String(r[xCol]) === cat);

        if (groups.length > 1 && grpCol) {
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
    } else if (s.chartType === 'scatter') {
      activeData.forEach(r => {
        const catIndex = xCategories.indexOf(String(r[xCol]));
        const catCenterX = catIndex >= 0
          ? this.margin.left + (catIndex * categoryWidth) + (categoryWidth / 2)
          : this.margin.left + (Number(r[xCol]) || 0);

        const val = Number(r[yCol]) || 0;
        const y = this.svgHeight - this.margin.bottom - ((val / yCeil) * this.plotHeight);
        const gIdx = grpCol ? groups.indexOf(String(r[grpCol])) : 0;
        const color = palette[Math.max(0, gIdx) % palette.length];

        this.renderItems.push({ centerX: catCenterX, y, color });
      });
    } else if (s.chartType === 'line') {
      groups.forEach((g, gIdx) => {
        const color = palette[gIdx % palette.length];
        const points: Array<{ x: number; y: number }> = [];

        xCategories.forEach((cat, xIdx) => {
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
    }
  }
}
