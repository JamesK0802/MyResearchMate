import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import { RPlotSyncService, PlotState } from '../../services/r-plot-sync.service';
import { RPlotPreviewComponent } from './r-plot-preview.component';

interface InlineTextEditorState {
  isOpen: boolean;
  field: 'title' | 'subtitle' | 'xLabel' | 'yLabel' | 'legendTitle';
  label: string;
  value: string;
}

@Component({
  selector: 'app-r-plot-canvas',
  standalone: true,
  imports: [CommonModule, FormsModule, RPlotPreviewComponent],
  template: `
    <div class="r-plot-canvas-container">
      <!-- Top Multi-Plot Tabs & View Mode Bar -->
      <div class="plot-tabs-bar">
        <div class="tabs-list">
          <div
            *ngFor="let p of plots; let pIdx = index"
            class="plot-tab"
            [class.active]="activePlotIndex === pIdx"
            (click)="selectPlotTab(pIdx)">
            <span class="tab-title">Plot {{ pIdx + 1 }} {{ p.figureTag }}</span>
            <button
              type="button"
              class="btn-tab-close"
              *ngIf="plots.length > 1"
              (click)="removePlotTab(pIdx, $event)"
              title="Delete Plot">
              x
            </button>
          </div>

          <button type="button" class="btn-add-tab" (click)="addPlotTab()" title="Add another sub-plot (e.g. Figure 1B)">
            + Add Sub-Plot
          </button>
        </div>

        <div class="view-mode-group">
          <button
            type="button"
            class="btn-view-mode"
            [class.active]="viewMode === 'single'"
            (click)="setViewMode('single')">
            Single
          </button>
          <button
            type="button"
            class="btn-view-mode"
            [class.active]="viewMode === 'grid'"
            (click)="setViewMode('grid')">
            Grid View ({{ plots.length }})
          </button>
        </div>
      </div>

      <!-- Canvas Inspector Toolbar (for Active Plot) -->
      <div class="canvas-toolbar" *ngIf="viewMode === 'single'">
        <div class="toolbar-controls">
          <!-- Chart Type -->
          <div class="ctrl-group">
            <label>Type:</label>
            <select [ngModel]="activePlot.chartType" (ngModelChange)="updateActiveState({chartType: $event})" class="ctrl-select">
              <option value="bar">Bar Chart</option>
              <option value="scatter">Scatter Plot</option>
              <option value="line">Line Plot</option>
              <option value="boxplot">Boxplot</option>
            </select>
          </div>

          <!-- Journal Theme -->
          <div class="ctrl-group">
            <label>Theme:</label>
            <select [ngModel]="activePlot.theme" (ngModelChange)="updateActiveState({theme: $event})" class="ctrl-select">
              <option value="classic">Classic (Color)</option>
              <option value="bw">Black & White</option>
              <option value="dark">Dark Mode</option>
            </select>
          </div>

          <!-- Legend Position -->
          <div class="ctrl-group">
            <label>Legend:</label>
            <select [ngModel]="activePlot.legendPosition" (ngModelChange)="updateActiveState({legendPosition: $event})" class="ctrl-select">
              <option value="right">Right</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
              <option value="none">Hide</option>
            </select>
          </div>

          <!-- Font Family -->
          <div class="ctrl-group">
            <label>Font:</label>
            <select [ngModel]="activePlot.fontFamily" (ngModelChange)="updateActiveState({fontFamily: $event})" class="ctrl-select">
              <option value="Inter, sans-serif">Inter</option>
              <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
              <option value="Arial, sans-serif">Arial</option>
            </select>
          </div>

          <!-- Figure Panel Tag (Optional) -->
          <div class="ctrl-group">
            <label>Tag:</label>
            <input type="text" [ngModel]="activePlot.figureTag" (ngModelChange)="updateActiveState({figureTag: $event})" class="ctrl-input-tag" placeholder="None" />
          </div>

        </div>

        <div class="toolbar-actions">
          <!-- Inspector Toggle Button -->
          <button
            type="button"
            class="btn-toggle-inspector"
            [class.active]="showInspector"
            (click)="showInspector = !showInspector"
            title="Toggle sizing & typography controls">
            Sizing & Bars
          </button>

          <!-- Web-Based Direct Export Dropdown (Default PNG) -->
          <div class="export-actions">
            <div class="export-split-button">
              <button type="button" class="btn-export-main" (click)="executeSelectedExport()">
                Export
              </button>
              <select [(ngModel)]="selectedExportFormat" class="export-select-menu">
                <option value="png">PNG</option>
                <option value="pdf">PDF</option>
                <option value="svg">SVG</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Horizontal Compact Inspector Strip (When open) -->
      <div class="horizontal-inspector-strip" *ngIf="viewMode === 'single' && showInspector">
        <div class="insp-strip-item">
          <label>Title Size: <strong>{{ activePlot.fontSizeTitle }}px</strong></label>
          <input type="range" min="12" max="28" [ngModel]="activePlot.fontSizeTitle" (ngModelChange)="updateActiveState({fontSizeTitle: $event})" />
        </div>

        <div class="insp-strip-item">
          <label>Axis Size: <strong>{{ activePlot.fontSizeAxis }}px</strong></label>
          <input type="range" min="9" max="20" [ngModel]="activePlot.fontSizeAxis" (ngModelChange)="updateActiveState({fontSizeAxis: $event})" />
        </div>

        <div class="insp-strip-item" *ngIf="activePlot.chartType === 'bar' || activePlot.chartType === 'boxplot'">
          <label>Bar Width: <strong>{{ activePlot.barWidth }}</strong></label>
          <input type="range" min="0.2" max="0.95" step="0.05" [ngModel]="activePlot.barWidth" (ngModelChange)="updateActiveState({barWidth: $event})" />
        </div>

        <div class="insp-strip-item" *ngIf="activePlot.chartType === 'scatter' || activePlot.chartType === 'line'">
          <label>Point Size: <strong>{{ activePlot.pointSize }}</strong></label>
          <input type="range" min="1" max="10" [ngModel]="activePlot.pointSize" (ngModelChange)="updateActiveState({pointSize: $event})" />
        </div>

        <div class="insp-strip-item">
          <label>X Rotation: <strong>{{ activePlot.xRotation }}°</strong></label>
          <input type="range" min="0" max="90" step="15" [ngModel]="activePlot.xRotation" (ngModelChange)="updateActiveState({xRotation: $event})" />
        </div>

        <div class="insp-strip-item chk-strip-item">
          <label class="chk-label">
            <input type="checkbox" [ngModel]="activePlot.showErrorBars" (ngModelChange)="updateActiveState({showErrorBars: $event})" />
            Show Error Bars
          </label>
        </div>

        <button type="button" class="btn-close-strip" (click)="showInspector = false" title="Hide inspector">x</button>
      </div>

      <!-- Main Canvas Area -->
      <!-- Mode 1: Single Plot Focus View with Zoom & Pan -->
      <div
        class="canvas-viewport"
        [ngClass]="activePlot.theme"
        *ngIf="viewMode === 'single'"
        (wheel)="onWheelZoom($event)"
        (mousedown)="startPan($event)"
        (mousemove)="onPan($event)"
        (mouseup)="endPan()"
        (mouseleave)="endPan()"
        [class.panning]="isPanning">

        <!-- Rendered SVG Plot -->
        <div
          class="svg-container"
          #svgContainer
          [style.transform]="'scale(' + zoomScale + ') translate(' + panX + 'px, ' + panY + 'px)'"
          [style.transform-origin]="'center center'">
          <svg #plotSvg [attr.viewBox]="'0 0 ' + svgWidth + ' ' + svgHeight" class="paper-svg">
            <defs>
              <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
              </style>
            </defs>

            <rect x="0" y="0" [attr.width]="svgWidth" [attr.height]="svgHeight" [attr.fill]="getThemeBg()" />

            <!-- Figure Panel Tag & Title (Non-overlapping) -->
            <text *ngIf="activePlot.figureTag"
                  [attr.x]="tagX"
                  [attr.y]="titleY"
                  [attr.font-family]="activePlot.fontFamily"
                  font-size="18"
                  font-weight="bold"
                  [attr.fill]="getThemeText()">
              {{ activePlot.figureTag }}
            </text>

            <!-- Editable Title -->
            <g class="editable-group" (click)="openInlineEditor('title', 'Figure Title', activePlot.title)">
              <text [attr.x]="titleX"
                    [attr.y]="titleY"
                    [attr.font-family]="activePlot.fontFamily"
                    [attr.font-size]="activePlot.fontSizeTitle"
                    font-weight="bold"
                    [attr.fill]="getThemeText()"
                    class="clickable-text">
                {{ activePlot.title || 'Figure 1' }}
              </text>
            </g>

            <!-- Editable Subtitle -->
            <g *ngIf="activePlot.subtitle" class="editable-group" (click)="openInlineEditor('subtitle', 'Figure Subtitle', activePlot.subtitle)">
              <text [attr.x]="titleX"
                    [attr.y]="subtitleY"
                    [attr.font-family]="activePlot.fontFamily"
                    [attr.font-size]="activePlot.fontSizeTitle * 0.75"
                    [attr.fill]="getSubtitleColor()"
                    class="clickable-text">
                {{ activePlot.subtitle }}
              </text>
            </g>

            <!-- Grid Lines -->
            <g *ngIf="activePlot.theme !== 'classic'" class="grid-lines" [attr.stroke]="getGridLineColor()" stroke-width="0.8" stroke-dasharray="3 3">
              <line *ngFor="let tick of yTicks"
                    [attr.x1]="margin.left"
                    [attr.y1]="tick.y"
                    [attr.x2]="margin.left + plotWidth"
                    [attr.y2]="tick.y" />
            </g>

            <!-- Y Axis -->
            <g class="y-axis">
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
                  [attr.x1]="margin.left - 5"
                  [attr.y1]="tick.y"
                  [attr.x2]="margin.left"
                  [attr.y2]="tick.y"
                  [attr.stroke]="getAxisLineColor()"
                  stroke-width="1.2"
                />
                <text
                  [attr.x]="margin.left - 10"
                  [attr.y]="tick.y + 4"
                  text-anchor="end"
                  [attr.font-family]="activePlot.fontFamily"
                  [attr.font-size]="activePlot.fontSizeAxis * 0.85"
                  [attr.fill]="getThemeText()">
                  {{ tick.val }}
                </text>
              </g>
            </g>

            <!-- Editable Y Axis Label -->
            <g class="editable-group" (click)="openInlineEditor('yLabel', 'Y-Axis Label', activePlot.yLabel)">
              <text [attr.x]="-(margin.top + (plotHeight / 2))"
                    [attr.y]="Math.max(14, margin.left - 45)"
                    transform="rotate(-90)"
                    text-anchor="middle"
                    [attr.font-family]="activePlot.fontFamily"
                    [attr.font-size]="activePlot.fontSizeAxis"
                    font-weight="bold"
                    [attr.fill]="getThemeText()"
                    class="clickable-text">
                {{ activePlot.yLabel }}
              </text>
            </g>

            <!-- X Axis -->
            <g class="x-axis">
              <line
                [attr.x1]="margin.left"
                [attr.y1]="svgHeight - margin.bottom"
                [attr.x2]="margin.left + plotWidth"
                [attr.y2]="svgHeight - margin.bottom"
                [attr.stroke]="getAxisLineColor()"
                stroke-width="1.2"
              />
              <g *ngFor="let groupItem of chartGroups">
                <line
                  [attr.x1]="groupItem.x"
                  [attr.y1]="svgHeight - margin.bottom"
                  [attr.x2]="groupItem.x"
                  [attr.y2]="svgHeight - margin.bottom + 5"
                  [attr.stroke]="getAxisLineColor()"
                  stroke-width="1.2"
                />
                <text [attr.x]="groupItem.x"
                      [attr.y]="svgHeight - margin.bottom + 18"
                      [attr.text-anchor]="activePlot.xRotation > 0 ? 'end' : 'middle'"
                      [attr.transform]="activePlot.xRotation > 0 ? 'rotate(-' + activePlot.xRotation + ' ' + groupItem.x + ' ' + (svgHeight - margin.bottom + 18) + ')' : null"
                      [attr.font-family]="activePlot.fontFamily"
                      [attr.font-size]="activePlot.fontSizeAxis * 0.85"
                      [attr.fill]="getThemeText()">
                  {{ groupItem.label }}
                </text>
              </g>
            </g>

            <!-- Editable X Axis Label -->
            <g class="editable-group" (click)="openInlineEditor('xLabel', 'X-Axis Label', activePlot.xLabel)">
              <text [attr.x]="margin.left + (plotWidth / 2)"
                    [attr.y]="svgHeight - 12"
                    text-anchor="middle"
                    [attr.font-family]="activePlot.fontFamily"
                    [attr.font-size]="activePlot.fontSizeAxis"
                    font-weight="bold"
                    [attr.fill]="getThemeText()"
                    class="clickable-text">
                {{ activePlot.xLabel }}
              </text>
            </g>

            <!-- Geometry Renderings -->
            <!-- 1. Bar Chart -->
            <g *ngIf="activePlot.chartType === 'bar'">
              <g *ngFor="let item of renderItems">
                <rect [attr.x]="item.x"
                      [attr.y]="item.y"
                      [attr.width]="Math.max(1, item.width)"
                      [attr.height]="Math.max(0, item.height)"
                      [attr.fill]="item.color"
                      [attr.stroke]="getBarBorderColor()"
                      stroke-width="0.8"
                      rx="1"
                      class="visual-element" />
                <g *ngIf="activePlot.showErrorBars && item.errorYMin !== undefined">
                  <line [attr.x1]="item.centerX" [attr.y1]="item.errorYMin" [attr.x2]="item.centerX" [attr.y2]="item.errorYMax" [attr.stroke]="getAxisLineColor()" stroke-width="1.4" />
                  <line [attr.x1]="item.centerX - 5" [attr.y1]="item.errorYMin" [attr.x2]="item.centerX + 5" [attr.y2]="item.errorYMin" [attr.stroke]="getAxisLineColor()" stroke-width="1.4" />
                  <line [attr.x1]="item.centerX - 5" [attr.y1]="item.errorYMax" [attr.x2]="item.centerX + 5" [attr.y2]="item.errorYMax" [attr.stroke]="getAxisLineColor()" stroke-width="1.4" />
                </g>
              </g>
            </g>

            <!-- 2. Scatter Plot -->
            <g *ngIf="activePlot.chartType === 'scatter'">
              <circle *ngFor="let item of renderItems"
                      [attr.cx]="item.centerX"
                      [attr.cy]="item.y"
                      [attr.r]="activePlot.pointSize"
                      [attr.fill]="item.color"
                      [attr.stroke]="getThemeBg()"
                      stroke-width="1.2"
                      class="visual-element" />
            </g>

            <!-- 3. Line Plot -->
            <g *ngIf="activePlot.chartType === 'line'">
              <g *ngFor="let lineGroup of lineSeries">
                <polyline [attr.points]="lineGroup.pointsStr"
                          [attr.stroke]="lineGroup.color"
                          [attr.stroke-width]="activePlot.lineWidth"
                          fill="none" />
                <circle *ngFor="let pt of lineGroup.points"
                        [attr.cx]="pt.x"
                        [attr.cy]="pt.y"
                        [attr.r]="activePlot.pointSize"
                        [attr.fill]="lineGroup.color"
                        [attr.stroke]="getThemeBg()"
                        stroke-width="1.2" />
              </g>
            </g>

            <!-- 4. Boxplot -->
            <g *ngIf="activePlot.chartType === 'boxplot'">
              <g *ngFor="let item of renderItems">
                <line [attr.x1]="item.centerX" [attr.y1]="item.y - 12" [attr.x2]="item.centerX" [attr.y2]="item.y + item.height + 12" [attr.stroke]="getAxisLineColor()" stroke-width="1.2" />
                <rect [attr.x]="item.x"
                      [attr.y]="item.y"
                      [attr.width]="Math.max(1, item.width)"
                      [attr.height]="Math.max(0, item.height)"
                      [attr.fill]="item.color"
                      [attr.stroke]="getAxisLineColor()"
                      stroke-width="1.2"
                      rx="1" />
                <line [attr.x1]="item.x" [attr.y1]="item.y + (item.height / 2)" [attr.x2]="item.x + item.width" [attr.y2]="item.y + (item.height / 2)" [attr.stroke]="getThemeText()" stroke-width="2" />
              </g>
            </g>

            <!-- Legend (Non-overlapping) -->
            <g *ngIf="activePlot.legendPosition !== 'none' && legendItems.length > 0" class="legend-box" (click)="openInlineEditor('legendTitle', 'Legend Title', activePlot.legendTitle)">
              <g *ngIf="activePlot.legendPosition === 'right' || activePlot.legendPosition === 'left'">
                <text [attr.x]="legendX"
                      [attr.y]="legendY"
                      [attr.font-family]="activePlot.fontFamily"
                      [attr.font-size]="activePlot.fontSizeLegend"
                      font-weight="bold"
                      [attr.fill]="getThemeText()"
                      class="clickable-text">
                  {{ activePlot.legendTitle || 'Legend' }}
                </text>
                <g *ngFor="let leg of legendItems; let lIdx = index">
                  <rect [attr.x]="legendX"
                        [attr.y]="legendY + 10 + (lIdx * 20)"
                        width="14" height="14" rx="2"
                        [attr.fill]="leg.color"
                        [attr.stroke]="getBarBorderColor()"
                        stroke-width="0.5" />
                  <text [attr.x]="legendX + 20"
                        [attr.y]="legendY + 22 + (lIdx * 20)"
                        [attr.font-family]="activePlot.fontFamily"
                        [attr.font-size]="activePlot.fontSizeLegend * 0.9"
                        [attr.fill]="getThemeText()">
                    {{ leg.label }}
                  </text>
                </g>
              </g>

              <g *ngIf="activePlot.legendPosition === 'top' || activePlot.legendPosition === 'bottom'">
                <g *ngFor="let leg of legendItems; let lIdx = index">
                  <rect [attr.x]="legendX + (lIdx * 110)"
                        [attr.y]="legendY - 10"
                        width="12" height="12" rx="2"
                        [attr.fill]="leg.color"
                        [attr.stroke]="getBarBorderColor()"
                        stroke-width="0.5" />
                  <text [attr.x]="legendX + (lIdx * 110) + 16"
                        [attr.y]="legendY"
                        [attr.font-family]="activePlot.fontFamily"
                        [attr.font-size]="activePlot.fontSizeLegend * 0.9"
                        [attr.fill]="getThemeText()">
                    {{ leg.label }}
                  </text>
                </g>
              </g>
            </g>

          </svg>
        </div>

        <!-- Inline Label / Title Editor Dialog -->
        <div *ngIf="textEditor.isOpen" class="inline-editor-popover">
          <div class="popover-title">Edit {{ textEditor.label }}</div>
          <input
            type="text"
            [(ngModel)]="textEditor.value"
            (keyup.enter)="applyInlineEditor()"
            (keyup.escape)="closeInlineEditor()"
            class="popover-input"
            autofocus
          />
          <div class="popover-actions">
            <button type="button" class="popover-btn cancel" (click)="closeInlineEditor()">Cancel</button>
            <button type="button" class="popover-btn apply" (click)="applyInlineEditor()">Apply</button>
          </div>
        </div>

        <div class="zoom-popover" [class.open]="showZoomPopover">
          <button type="button" class="zoom-popover-trigger" (click)="showZoomPopover = !showZoomPopover" title="Zoom controls">
            Zoom {{ Math.round(zoomScale * 100) }}%
          </button>
          <div class="zoom-popover-menu" *ngIf="showZoomPopover">
            <button type="button" class="btn-zoom" (click)="zoomOut()">−</button>
            <span class="zoom-level-text" (click)="resetZoom()">{{ Math.round(zoomScale * 100) }}%</span>
            <button type="button" class="btn-zoom" (click)="zoomIn()">+</button>
            <button type="button" class="btn-zoom-fit" (click)="resetZoom()">Fit</button>
          </div>
        </div>

      </div>

      <!-- Mode 2: Multi-Plot Grid View (Side-by-Side & Multi-Panel) -->
      <div class="grid-viewport" *ngIf="viewMode === 'grid'">
        <div class="grid-plots-container" [style.grid-template-columns]="plots.length > 2 ? 'repeat(2, 1fr)' : 'repeat(' + plots.length + ', 1fr)'">
          <div *ngFor="let p of plots; let pIdx = index" class="grid-plot-cell" [class.active-cell]="activePlotIndex === pIdx">
            <!-- Cell Control Bar -->
            <div class="cell-top-bar">
              <div class="cell-title-box" (click)="selectPlotTab(pIdx)">
                <span class="cell-tag">{{ p.figureTag || ('#' + (pIdx + 1)) }}</span>
                <span class="cell-title">{{ p.title }}</span>
              </div>

              <!-- Cell Actions (Focus / Delete) -->
              <div class="cell-quick-controls">
                <button type="button" class="btn-focus-cell" (click)="selectPlotTab(pIdx); setViewMode('single')" title="Focus and edit in Single View">
                  Focus
                </button>

                <button type="button" class="btn-del-cell" *ngIf="plots.length > 1" (click)="removePlotTab(pIdx, $event)" title="Delete panel">
                  x
                </button>
              </div>
            </div>

            <!-- SVG Preview of this Panel -->
            <div class="cell-preview-wrap" (click)="selectPlotTab(pIdx)">
              <app-r-plot-preview [plotState]="p" [data]="data"></app-r-plot-preview>
            </div>
          </div>

          <!-- Empty Add Panel Box -->
          <div class="grid-add-card" (click)="addPlotTab()">
            <span class="add-card-plus">+</span>
            <span class="add-card-label">Add Sub-Panel</span>
            <span class="add-card-sub">Plot {{ plots.length + 1 }} ({{ String.fromCharCode(65 + plots.length) }})</span>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .r-plot-canvas-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #f8fafc;
      color: #0f172a;
      overflow: hidden;
      position: relative;
    }

    .plot-tabs-bar {
      height: 40px;
      padding: 0 12px;
      background: #ffffff;
      border-bottom: 1.5px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .tabs-list {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
    }

    .plot-tab {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
    }

    .plot-tab.active {
      background: #eff6ff;
      color: #2563eb;
      border-color: #3b82f6;
      box-shadow: 0 1px 3px rgba(37, 99, 235, 0.12);
    }

    .btn-tab-close {
      background: transparent;
      border: none;
      color: #ef4444;
      cursor: pointer;
      font-size: 10px;
      padding: 0 2px;
    }

    .btn-add-tab {
      background: #ffffff;
      border: 1.5px dashed #3b82f6;
      color: #2563eb;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-add-tab:hover {
      background: #eff6ff;
    }

    .btn-dup-tab {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #475569;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-dup-tab:hover {
      background: #f1f5f9;
      color: #0f172a;
    }

    .btn-split-cols {
      background: #f5f3ff;
      border: 1px solid #ddd6fe;
      color: #7c3aed;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-split-cols:hover {
      background: #ede9fe;
    }

    .view-mode-group {
      display: flex;
      background: #f1f5f9;
      padding: 2px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }

    .btn-view-mode {
      background: transparent;
      border: none;
      color: #64748b;
      padding: 3px 8px;
      font-size: 10.5px;
      font-weight: 600;
      border-radius: 4px;
      cursor: pointer;
    }

    .btn-view-mode.active {
      background: #ffffff;
      color: #2563eb;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }

    .canvas-toolbar {
      padding: 6px 14px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-start;
      align-items: center;
      gap: 8px;
    }

    .toolbar-controls {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      flex: 1 1 520px;
    }

    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1 0 100%;
    }

    .ctrl-group {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: #475569;
      font-weight: 600;
    }

    .ctrl-select, .ctrl-input-tag {
      background: #ffffff;
      color: #0f172a;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      outline: none;
    }

    .ctrl-select:focus, .ctrl-input-tag:focus {
      border-color: #2563eb;
    }

    .ctrl-input-tag {
      width: 55px;
      text-align: center;
    }

    .btn-toggle-inspector {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      height: 28px;
      padding: 3px 9px;
      font-size: 10.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-toggle-inspector.active {
      background: #eff6ff;
      color: #2563eb;
      border-color: #3b82f6;
    }

    .export-actions {
      display: flex;
      align-items: center;
      margin-left: auto;
    }

    .export-split-button {
      display: flex;
      align-items: center;
      background: #2563eb;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: none;
      height: 28px;
    }

    .btn-export-main {
      background: transparent;
      color: #ffffff;
      border: none;
      padding: 3px 9px;
      font-size: 10.5px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }

    .btn-export-main:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .export-select-menu {
      background: #1d4ed8;
      color: #ffffff;
      border: none;
      border-left: 1px solid rgba(255, 255, 255, 0.25);
      padding: 3px 7px;
      font-size: 10.5px;
      font-weight: 600;
      outline: none;
      cursor: pointer;
    }

    /* HORIZONTAL INSPECTOR STRIP */
    .horizontal-inspector-strip {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
      align-items: center;
      column-gap: 12px;
      row-gap: 6px;
      padding: 6px 12px;
      background: #f1f5f9;
      border-bottom: 1.5px solid #e2e8f0;
      overflow: hidden;
    }

    .insp-strip-item {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      color: #334155;
      min-width: 0;
    }

    .insp-strip-item label {
      white-space: nowrap;
      font-size: 10px;
      letter-spacing: 0;
      text-transform: none;
    }

    .insp-strip-item input[type="range"] {
      width: 70px;
      accent-color: #2563eb;
      margin: 0;
      padding: 0;
      -webkit-appearance: none;
      appearance: none;
      height: 14px;
      background: transparent;
    }

    .insp-strip-item input[type="range"]::-webkit-slider-runnable-track {
      width: 100%;
      height: 4px;
      border-radius: 999px;
      background: #cbd5e1;
    }

    .insp-strip-item input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      margin-top: -4px;
      border: 0;
      border-radius: 50%;
      background: #2563eb;
      cursor: pointer;
    }

    .insp-strip-item input[type="range"]::-moz-range-track {
      height: 4px;
      border-radius: 999px;
      background: #cbd5e1;
    }

    .insp-strip-item input[type="range"]::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border: 0;
      border-radius: 50%;
      background: #2563eb;
      cursor: pointer;
    }

    .chk-strip-item {
      grid-column: 1 / span 2;
      margin-left: 0;
    }

    .chk-label {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      font-weight: 600;
      font-size: 10px !important;
      letter-spacing: 0 !important;
      text-transform: none !important;
      color: #0f172a;
      white-space: nowrap;
    }

    .btn-close-strip {
      grid-column: 3;
      grid-row: 1;
      margin-left: 0;
      background: transparent;
      border: none;
      color: #64748b;
      font-weight: bold;
      font-size: 11px;
      cursor: pointer;
      padding: 2px 6px;
    }

    .btn-close-strip:hover {
      color: #ef4444;
    }

    .zoom-controls {
      display: flex;
      align-items: center;
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
      gap: 1px;
    }

    .zoom-popover {
      position: absolute;
      right: 16px;
      bottom: 16px;
      z-index: 8;
    }

    .zoom-popover-trigger {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.96);
      color: #475569;
      padding: 4px 8px;
      font-size: 10.5px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
    }

    .zoom-popover-menu {
      position: absolute;
      right: 0;
      bottom: calc(100% + 6px);
      display: flex;
      align-items: center;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.16);
      overflow: hidden;
    }

    .btn-zoom {
      background: transparent;
      border: none;
      color: #334155;
      padding: 3px 8px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
    }

    .btn-zoom:hover {
      background: #f1f5f9;
      color: #2563eb;
    }

    .zoom-level-text {
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      padding: 0 4px;
      min-width: 36px;
      text-align: center;
      cursor: pointer;
      user-select: none;
    }

    .zoom-level-text:hover {
      color: #2563eb;
    }

    .btn-zoom-fit {
      background: #f1f5f9;
      border: none;
      border-left: 1px solid #e2e8f0;
      color: #64748b;
      font-size: 10px;
      font-weight: 700;
      padding: 3px 6px;
      cursor: pointer;
      text-transform: uppercase;
    }

    .btn-zoom-fit:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    .canvas-viewport {
      flex: 1;
      display: flex;
      flex-direction: column;
      position: relative;
      background: #f8fafc;
      overflow: hidden;
      align-items: center;
      justify-content: center;
      padding: 16px;
      user-select: none;
      cursor: default;
    }

    .canvas-viewport.panning {
      cursor: grab;
    }

    .canvas-viewport.dark {
      background: #0f172a;
    }

    .svg-container {
      width: 100%;
      max-width: 800px;
      height: 100%;
      max-height: 540px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 30px rgba(0,0,0,0.08);
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #ffffff;
      padding: 12px;
      transition: transform 0.08s ease-out;
      will-change: transform;
    }

    .canvas-viewport.dark .svg-container {
      background: #0f172a;
    }

    .paper-svg {
      width: 100%;
      height: 100%;
    }

    .clickable-text {
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .clickable-text:hover {
      opacity: 0.7;
      text-decoration: underline;
    }

    .visual-element {
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .visual-element:hover {
      filter: brightness(1.08);
    }

    /* GRID VIEW */
    .grid-viewport {
      flex: 1;
      padding: 20px;
      overflow: auto;
      background: #f8fafc;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .grid-toolbar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
      padding: 12px 18px;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 2px 6px rgba(0,0,0,0.03);
    }

    .grid-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .grid-header-title {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
    }

    .grid-header-subtitle {
      font-size: 11.5px;
      color: #64748b;
    }

    .grid-header-actions {
      display: flex;
      gap: 8px;
    }

    .btn-grid-act-primary {
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 11.5px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-grid-act-primary:hover {
      background: #1d4ed8;
    }

    .btn-grid-act-secondary {
      background: #ffffff;
      color: #2563eb;
      border: 1.5px solid #bfdbfe;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-grid-act-secondary:hover {
      background: #eff6ff;
    }

    .grid-plots-container {
      display: grid;
      gap: 18px;
      width: 100%;
    }

    .grid-plot-cell {
      background: #ffffff;
      border: 1.5px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.04);
      transition: all 0.2s;
    }

    .grid-plot-cell.active-cell {
      border-color: #2563eb;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
    }

    .cell-top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    .cell-title-box {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }

    .cell-tag {
      background: #eff6ff;
      color: #2563eb;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid #bfdbfe;
    }

    .cell-title {
      font-size: 12.5px;
      font-weight: 700;
      color: #0f172a;
    }

    .cell-quick-controls {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .cell-mini-select {
      background: #ffffff;
      color: #0f172a;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 11px;
      outline: none;
    }

    .btn-focus-cell {
      background: #f1f5f9;
      color: #2563eb;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      cursor: pointer;
      font-weight: 600;
    }

    .btn-focus-cell:hover {
      background: #eff6ff;
    }

    .btn-del-cell {
      background: transparent;
      color: #ef4444;
      border: none;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      padding: 0 4px;
    }

    .cell-preview-wrap {
      cursor: pointer;
      border-radius: 6px;
      overflow: hidden;
      background: #ffffff;
    }

    .grid-add-card {
      background: #ffffff;
      border: 2px dashed #cbd5e1;
      border-radius: 10px;
      min-height: 260px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .grid-add-card:hover {
      border-color: #2563eb;
      background: #eff6ff;
    }

    .add-card-plus {
      font-size: 32px;
      font-weight: 700;
      color: #2563eb;
    }

    .add-card-label {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
    }

    .add-card-sub {
      font-size: 11px;
      color: #64748b;
    }

    /* INLINE EDITOR POPOVER */
    .inline-editor-popover {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #ffffff;
      border: 1.5px solid #2563eb;
      border-radius: 10px;
      padding: 16px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
      z-index: 100;
      width: 320px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .popover-title {
      font-size: 12.5px;
      font-weight: 700;
      color: #0f172a;
    }

    .popover-input {
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      color: #0f172a;
      padding: 6px 10px;
      font-size: 12px;
      outline: none;
    }

    .popover-input:focus {
      border-color: #2563eb;
    }

    .popover-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .popover-btn {
      border: none;
      border-radius: 6px;
      padding: 5px 12px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
    }

    .popover-btn.cancel {
      background: #f1f5f9;
      color: #475569;
    }

    .popover-btn.apply {
      background: #2563eb;
      color: #ffffff;
    }
  `]
})
export class RPlotCanvasComponent implements OnInit {
  @ViewChild('plotSvg') plotSvg!: ElementRef<SVGElement>;

  Math = Math;
  String = String;
  plots: PlotState[] = [];
  activePlotIndex = 0;
  viewMode: 'single' | 'grid' = 'single';
  data: Array<Record<string, any>> = [];
  columns: string[] = [];

  showInspector = false;
  showZoomPopover = false;
  selectedExportFormat: 'png' | 'pdf' | 'svg' = 'png';

  zoomScale = 1.0;
  panX = 0;
  panY = 0;
  isPanning = false;
  private panStartX = 0;
  private panStartY = 0;

  svgWidth = 720;
  svgHeight = 480;
  margin = { top: 60, right: 130, bottom: 65, left: 65 };

  tagX = 18;
  titleX = 18;
  titleY = 24;
  subtitleY = 40;

  yTicks: Array<{ val: number; y: number }> = [];
  chartGroups: Array<{ label: string; x: number }> = [];
  renderItems: Array<any> = [];
  lineSeries: Array<{ color: string; pointsStr: string; points: Array<{ x: number; y: number }> }> = [];
  legendItems: Array<{ label: string; color: string }> = [];

  legendX = 600;
  legendY = 80;

  textEditor: InlineTextEditorState = {
    isOpen: false,
    field: 'title',
    label: '',
    value: ''
  };

  constructor(private rSyncService: RPlotSyncService) {}

  ngOnInit() {
    this.rSyncService.plots$.subscribe(plots => {
      this.plots = plots;
      this.computeLayout();
    });

    this.rSyncService.activePlotIndex$.subscribe(idx => {
      this.activePlotIndex = idx;
      this.computeLayout();
    });

    this.rSyncService.data$.subscribe(data => {
      this.data = data;
      this.computeLayout();
    });

    this.rSyncService.columns$.subscribe(cols => {
      this.columns = cols;
    });

    this.rSyncService.viewMode$.subscribe(mode => {
      this.viewMode = mode;
    });
  }

  get activePlot(): PlotState {
    const list = this.plots;
    const idx = Math.min(this.activePlotIndex, list.length - 1);
    return list[Math.max(0, idx)] || list[0];
  }

  get plotWidth(): number {
    return Math.max(10, this.svgWidth - this.margin.left - this.margin.right);
  }

  get plotHeight(): number {
    return Math.max(10, this.svgHeight - this.margin.top - this.margin.bottom);
  }

  selectPlotTab(idx: number) {
    this.rSyncService.setActivePlotIndex(idx);
  }

  addPlotTab() {
    this.rSyncService.addNewPlot();
  }

  duplicateActivePlot() {
    this.rSyncService.duplicatePlot();
  }

  generatePlotsForAllColumns() {
    this.rSyncService.generatePlotsFromColumns();
  }

  removePlotTab(idx: number, event: Event) {
    event.stopPropagation();
    this.rSyncService.removePlot(idx);
  }

  setViewMode(mode: 'single' | 'grid') {
    this.rSyncService.setViewMode(mode);
  }

  updateActiveState(partial: Partial<PlotState>) {
    this.rSyncService.updateActivePlotState(partial);
  }

  updatePlotAt(idx: number, partial: Partial<PlotState>) {
    const list = [...this.plots];
    if (list[idx]) {
      list[idx] = { ...list[idx], ...partial };
      this.rSyncService.setPlots(list);
    }
  }

  getThemeBg(): string {
    if (this.activePlot?.theme === 'dark') return '#0f172a';
    return '#ffffff';
  }

  getThemeText(): string {
    if (this.activePlot?.theme === 'dark') return '#f8fafc';
    return '#111827';
  }

  getSubtitleColor(): string {
    if (this.activePlot?.theme === 'dark') return '#94a3b8';
    return '#6b7280';
  }

  getAxisLineColor(): string {
    if (this.activePlot?.theme === 'dark') return '#94a3b8';
    return '#1e293b';
  }

  getGridLineColor(): string {
    if (this.activePlot?.theme === 'dark') return '#1e293b';
    return '#e2e8f0';
  }

  getBarBorderColor(): string {
    if (this.activePlot?.theme === 'dark') return '#0f172a';
    return '#1e293b';
  }

  openInlineEditor(field: 'title' | 'subtitle' | 'xLabel' | 'yLabel' | 'legendTitle', label: string, currentVal: string) {
    this.textEditor = {
      isOpen: true,
      field,
      label,
      value: currentVal || ''
    };
  }

  closeInlineEditor() {
    this.textEditor.isOpen = false;
  }

  applyInlineEditor() {
    this.updateActiveState({ [this.textEditor.field]: this.textEditor.value });
    this.textEditor.isOpen = false;
  }

  private computeLayout() {
    const s = this.activePlot;
    if (!s) return;

    const activeData = (this.data && this.data.length > 0)
      ? this.data
      : [
          { Sample: 'Group A', Value: 12 },
          { Sample: 'Group B', Value: 28 },
          { Sample: 'Group C', Value: 19 }
        ];

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
    const tickCount = 5;
    this.yTicks = [];
    for (let i = 0; i <= tickCount; i++) {
      const val = Math.round((yCeil / tickCount) * i * 10) / 10;
      this.yTicks.push({ val, y: 0 });
    }

    // 2. Dynamic Left Margin
    const maxYStrLen = Math.max(...this.yTicks.map(t => String(t.val).length), 1);
    const baseLeftMargin = Math.max(65, maxYStrLen * 8.5 + 25);

    // 3. Collision-free Header Coordinates
    const hasTag = !!s.figureTag && s.figureTag.trim() !== '';
    const hasSubtitle = !!s.subtitle && s.subtitle.trim() !== '';
    this.tagX = 18;
    this.titleX = hasTag ? 48 : 18;
    this.titleY = 24;
    this.subtitleY = 40;

    const legPos = s.legendPosition || 'right';
    if (legPos === 'top') {
      const headerTopOffset = hasSubtitle ? 46 : 32;
      this.legendX = baseLeftMargin;
      this.legendY = headerTopOffset + 14;
      this.margin = { top: headerTopOffset + 30, right: 35, bottom: 65, left: baseLeftMargin };
    } else if (legPos === 'bottom') {
      this.legendX = baseLeftMargin;
      this.legendY = this.svgHeight - 15;
      this.margin = { top: hasSubtitle ? 56 : 40, right: 35, bottom: 85, left: baseLeftMargin };
    } else if (legPos === 'right') {
      this.margin = { top: hasSubtitle ? 56 : 40, right: 130, bottom: 65, left: baseLeftMargin };
      this.legendX = this.svgWidth - this.margin.right + 15;
      this.legendY = this.margin.top + 20;
    } else if (legPos === 'left') {
      this.margin = { top: hasSubtitle ? 56 : 40, right: 35, bottom: 65, left: baseLeftMargin + 110 };
      this.legendX = 18;
      this.legendY = this.margin.top + 20;
    } else { // 'none'
      this.margin = { top: hasSubtitle ? 56 : 40, right: 35, bottom: 65, left: baseLeftMargin };
    }

    // Recompute tick Y positions
    this.yTicks.forEach(t => {
      t.y = this.svgHeight - this.margin.bottom - ((t.val / yCeil) * this.plotHeight);
    });

    // 4. Groups & Categories
    const xCategories = Array.from(new Set(activeData.map(r => String(r[xCol] ?? '')))).filter(c => c.trim() !== '');
    const groups = grpCol ? Array.from(new Set(activeData.map(r => String(r[grpCol] ?? '')))).filter(g => g.trim() !== '') : ['Default'];

    let palette = s.palette && s.palette.length > 0
      ? s.palette
      : ['#2563EB', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'];

    if (s.theme === 'bw') {
      palette = ['#1F2937', '#4B5563', '#9CA3AF', '#D1D5DB', '#E5E7EB'];
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

  zoomIn() {
    this.zoomScale = Math.min(3.0, Math.round((this.zoomScale + 0.15) * 100) / 100);
  }

  zoomOut() {
    this.zoomScale = Math.max(0.4, Math.round((this.zoomScale - 0.15) * 100) / 100);
  }

  resetZoom() {
    this.zoomScale = 1.0;
    this.panX = 0;
    this.panY = 0;
  }

  onWheelZoom(event: WheelEvent) {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    this.zoomScale = Math.min(3.0, Math.max(0.4, Math.round((this.zoomScale + delta) * 100) / 100));
  }

  startPan(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('.inline-editor-popover') || target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'SELECT') {
      return;
    }
    this.isPanning = true;
    this.panStartX = event.clientX - this.panX;
    this.panStartY = event.clientY - this.panY;
  }

  onPan(event: MouseEvent) {
    if (!this.isPanning) return;
    this.panX = event.clientX - this.panStartX;
    this.panY = event.clientY - this.panStartY;
  }

  endPan() {
    this.isPanning = false;
  }

  executeSelectedExport() {
    if (this.selectedExportFormat === 'pdf') {
      this.exportPDF();
    } else if (this.selectedExportFormat === 'svg') {
      this.exportSVG();
    } else {
      this.exportPNG();
    }
  }

  exportPDF() {
    const svgEl = this.plotSvg.nativeElement;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const URLObj = window.URL || window.webkitURL || window;
    const blobURL = URLObj.createObjectURL(svgBlob);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = this.svgWidth * 2;
      canvas.height = this.svgHeight * 2;
      const context = canvas.getContext('2d');
      if (context) {
        context.scale(2, 2);
        context.drawImage(image, 0, 0);
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'px',
          format: [this.svgWidth, this.svgHeight]
        });
        pdf.addImage(imgData, 'PNG', 0, 0, this.svgWidth, this.svgHeight);
        pdf.save(`${this.activePlot.figureTag ? this.activePlot.figureTag.replace(/[^a-zA-Z0-9]/g, '') + '_' : ''}publication_figure.pdf`);
      }
    };
    image.src = blobURL;
  }

  exportPNG() {
    const svgEl = this.plotSvg.nativeElement;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const URLObj = window.URL || window.webkitURL || window;
    const blobURL = URLObj.createObjectURL(svgBlob);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = this.svgWidth * 3;
      canvas.height = this.svgHeight * 3;
      const context = canvas.getContext('2d');
      if (context) {
        context.scale(3, 3);
        context.drawImage(image, 0, 0);
        const png = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = png;
        downloadLink.download = `${this.activePlot.figureTag ? this.activePlot.figureTag.replace(/[^a-zA-Z0-9]/g, '') + '_' : ''}figure_300dpi.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      }
    };
    image.src = blobURL;
  }

  exportSVG() {
    const svgEl = this.plotSvg.nativeElement;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.activePlot.figureTag ? this.activePlot.figureTag.replace(/[^a-zA-Z0-9]/g, '') + '_' : ''}figure_vector.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
