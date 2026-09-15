import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { RPlotSyncService, PlotState, PlotType, PlotExample, NativeRImage } from '../../services/r-plot-sync.service';
import { RPlotPreviewComponent } from './r-plot-preview.component';

interface InlineTextEditorState {
  isOpen: boolean;
  field: 'title' | 'subtitle' | 'xLabel' | 'yLabel' | 'legendTitle' | 'figureTag';
  label: string;
  value: string;
}

type DraggableElement = 'tag' | 'title' | 'subtitle' | 'xLabel' | 'yLabel' | 'legend';

interface ElementDragState {
  element: DraggableElement;
  mode: 'move' | 'resize';
  x: number;
  y: number;
  startX: number;
  startY: number;
  startSize: number;
}

interface PlotHelpCard extends PlotExample {
  type: PlotType;
  name: string;
  use: string;
  xMeaning: string;
  yMeaning: string;
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
      <div class="canvas-toolbar" *ngIf="viewMode === 'single' && !nativeImages.length">
        <div class="toolbar-controls">
          <!-- Chart Type -->
          <div class="ctrl-group type-menu-wrap">
            <label>Type:</label>
            <button type="button" class="ctrl-select type-menu-button" (click)="showTypeMenu = !showTypeMenu">{{ plotName(activePlot.chartType) }} <span>⌄</span></button>
            <div class="type-menu" *ngIf="showTypeMenu">
              <span class="type-menu-heading">Common</span>
              <div class="type-menu-row" *ngFor="let type of commonPlotTypes"><button type="button" (click)="choosePlotType(type)"><span [class.selected-check]="activePlot.chartType === type">{{ activePlot.chartType === type ? '✓' : '' }}</span>{{ plotName(type) }}</button><button type="button" class="row-help" (click)="$event.stopPropagation(); openPlotHelp(type)">?</button></div>
              <span class="type-menu-heading">Advanced analysis</span>
              <div class="type-menu-row" *ngFor="let type of advancedPlotTypes"><button type="button" (click)="choosePlotType(type)"><span [class.selected-check]="activePlot.chartType === type">{{ activePlot.chartType === type ? '✓' : '' }}</span>{{ plotName(type) }}</button><button type="button" class="row-help" (click)="$event.stopPropagation(); openPlotHelp(type)">?</button></div>
            </div>
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
            (click)="toggleInspector()"
            title="Open publication formatting controls">
            Customize
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

      <div class="plot-help-backdrop" *ngIf="plotHelp" (click)="closePlotHelp()">
        <section class="plot-help-modal" role="dialog" aria-modal="true" [attr.aria-label]="plotHelp.name + ' guide'" (click)="$event.stopPropagation()">
          <header><div><span class="eyebrow">PLOT GUIDE</span><h2>{{ plotHelp.name }}</h2></div><button type="button" class="modal-close" (click)="closePlotHelp()">×</button></header>
          <p class="help-use"><strong>When to use it:</strong> {{ plotHelp.use }}</p>
          <div class="axis-explainer"><div><strong>X axis</strong><span>{{ plotHelp.xMeaning }}</span></div><div><strong>Y axis</strong><span>{{ plotHelp.yMeaning }}</span></div></div>
          <div class="example-mapping"><strong>Example mapping</strong><span><b>X</b> → {{ plotHelp.plot.xColumn }}</span><span *ngIf="isSingleVariablePlotHelp"><b>Y</b> → calculated automatically</span><span *ngIf="!isSingleVariablePlotHelp"><b>Y</b> → {{ plotHelp.plot.yColumn }}</span><span *ngIf="plotHelp.plot.groupColumn"><b>Group</b> → {{ plotHelp.plot.groupColumn }}</span><span *ngIf="plotHelp.plot.errorColumn"><b>Error bar</b> → {{ plotHelp.plot.errorColumn }}</span><span *ngIf="plotHelp.plot.labelColumn"><b>Label</b> → {{ plotHelp.plot.labelColumn }}</span></div>
          <div class="help-example-grid"><div class="example-data"><div class="example-heading">Minimal Excel example</div><div class="excel-note">Copy these columns into Excel, then upload or paste them.</div><div class="example-table-wrap"><table><thead><tr><th *ngFor="let column of plotHelp.columns">{{ column }}</th></tr></thead><tbody><tr *ngFor="let row of plotHelp.rows | slice:0:6"><td *ngFor="let column of plotHelp.columns">{{ row[column] }}</td></tr></tbody></table></div></div><div class="example-plot"><div class="example-heading">Expected plot</div><app-r-plot-preview [plotState]="plotHelp.plot" [data]="plotHelp.rows"></app-r-plot-preview></div></div>
          <footer><span>This replaces the current canvas with a small editable example.</span><div class="help-actions"><button type="button" class="download-example-btn" (click)="downloadHelpExample()">Download Excel</button><button type="button" class="load-example-btn" (click)="loadHelpExample()">Load this example</button></div></footer>
        </section>
      </div>

      <!-- Publication controls: a focused modal keeps the canvas workspace uncluttered. -->
      <div class="customize-backdrop" *ngIf="viewMode === 'single' && showInspector" (click)="showInspector = false">
      <section class="customize-modal" role="dialog" aria-modal="true" aria-label="Customize plot" (click)="$event.stopPropagation()">
        <header class="customize-modal-header">
          <div><span class="eyebrow">FIGURE SETTINGS</span><h2>Customize plot</h2><p>Adjust the figure as a whole, then use the canvas to position and resize individual text elements.</p></div>
          <button type="button" class="modal-close" (click)="showInspector = false" title="Close customize">×</button>
        </header>
      <div class="customize-content">
      <div class="horizontal-inspector-strip">
        <div class="inspector-hint">Select a title, axis label, or legend on the canvas. Drag it to move; drag the blue corner handle to resize. Double-click text to edit it.</div>

        <section class="inspector-section" *ngIf="hasPlotMarkControls">
          <span class="inspector-section-title">Plot marks</span>
        <div class="insp-strip-item" *ngIf="activePlot.chartType === 'bar' || activePlot.chartType === 'boxplot'">
          <label class="control-field">Bar Width: <strong>{{ activePlot.barWidth }}</strong><input type="range" min="0.2" max="0.95" step="0.05" [ngModel]="activePlot.barWidth" (ngModelChange)="updateActiveState({barWidth: $event})" /></label>
        </div>

        <div class="insp-strip-item" *ngIf="activePlot.chartType === 'scatter' || activePlot.chartType === 'line' || activePlot.chartType === 'dotplot'">
          <label class="control-field">Point Size: <strong>{{ activePlot.pointSize }}</strong><input type="range" min="1" max="10" [ngModel]="activePlot.pointSize" (ngModelChange)="updateActiveState({pointSize: $event})" /></label>
        </div>

        <div class="insp-strip-item" *ngIf="activePlot.chartType === 'violin'">
          <label class="chk-label"><input type="checkbox" [ngModel]="activePlot.showRawPoints !== false" (ngModelChange)="updateActiveState({showRawPoints: $event})" />Raw points</label>
        </div>

        <div class="insp-strip-item" *ngIf="activePlot.chartType === 'line' || activePlot.chartType === 'density'">
          <label class="control-field">Line width: <strong>{{ activePlot.lineWidth }}</strong><input type="range" min="1" max="6" step="0.5" [ngModel]="activePlot.lineWidth" (ngModelChange)="updateActiveState({lineWidth: +$event})" /></label>
        </div>

        <div class="insp-strip-item" *ngIf="activePlot.chartType === 'histogram'">
          <label class="control-field">Bins <strong>{{ activePlot.binCount || 30 }}</strong><input type="range" min="5" max="80" step="1" [ngModel]="activePlot.binCount || 30" (ngModelChange)="updateActiveState({binCount: +$event})" /></label>
        </div>

        <div class="insp-strip-item" *ngIf="activePlot.chartType === 'volcano'">
          <label class="control-field">|logFC|<input type="number" class="inline-number" min="0" step="0.25" [ngModel]="activePlot.thresholdX || 1" (ngModelChange)="updateActiveState({thresholdX: +$event})" /></label>
          <label class="control-field">-log10 FDR<input type="number" class="inline-number" min="0" step="0.1" [ngModel]="activePlot.thresholdY || 1.3" (ngModelChange)="updateActiveState({thresholdY: +$event})" /></label>
          <label class="control-field">Label<select class="ctrl-select" [ngModel]="activePlot.labelColumn || ''" (ngModelChange)="updateActiveState({labelColumn: $event})">
            <option value="">None</option>
            <option *ngFor="let column of columns" [value]="column">{{ column }}</option>
          </select></label>
        </div>

        <div class="insp-strip-item" *ngIf="activePlot.chartType === 'heatmap'">
          <label class="chk-label"><input type="checkbox" [ngModel]="activePlot.showHeatmapValues === true" (ngModelChange)="updateActiveState({showHeatmapValues: $event})" />Cell values</label>
        </div>
        </section>

        <section class="inspector-section" *ngIf="hasAxisControls">
          <span class="inspector-section-title">Axes</span>
        <div class="insp-strip-item" *ngIf="canRotateXAxis" title="Rotates category labels to stop long names overlapping.">
          <label class="control-field">X Rotation: <strong>{{ activePlot.xRotation }}°</strong><input type="range" min="0" max="90" step="15" [ngModel]="activePlot.xRotation" (ngModelChange)="updateActiveState({xRotation: $event})" /></label>
        </div>

        <div class="insp-strip-item" *ngIf="canSetYAxisRange" title="Set the visible Y-axis range. Leave empty to calculate it from your data.">
          <label class="control-field">Y min <span class="field-help" tabindex="0" role="button" aria-label="Y-axis limit help" data-tooltip="Leave blank for automatic limits. Use fixed limits when comparing panels.">?</span><input type="number" class="inline-number" [ngModel]="activePlot.yMin" (ngModelChange)="updateActiveState({yMin: $event === '' ? null : +$event})" placeholder="Auto" /></label>
          <label class="control-field">max<input type="number" class="inline-number" [ngModel]="activePlot.yMax" (ngModelChange)="updateActiveState({yMax: $event === '' ? null : +$event})" placeholder="Auto" /></label>
        </div>
        </section>

        <section class="inspector-section">
          <span class="inspector-section-title">Canvas & export</span>
        <div class="insp-strip-item">
          <label>Width</label>
          <input type="number" min="2" max="14" step="0.1" [ngModel]="figureWidthIn" (ngModelChange)="updateActiveState({figureWidthIn: +$event})" />
          <span class="unit-label">in</span>
        </div>

        <div class="insp-strip-item">
          <label>Height</label>
          <input type="number" min="2" max="12" step="0.1" [ngModel]="figureHeightIn" (ngModelChange)="updateActiveState({figureHeightIn: +$event})" />
          <span class="unit-label">in</span>
        </div>

        <div class="insp-strip-item">
          <label>DPI</label>
          <select class="ctrl-select" [ngModel]="exportDpi" (ngModelChange)="updateActiveState({exportDpi: +$event})">
            <option [ngValue]="300">300</option>
            <option [ngValue]="600">600</option>
          </select>
          <label>Background</label>
          <select class="ctrl-select" [ngModel]="activePlot.background || 'white'" (ngModelChange)="updateActiveState({background: $event})">
            <option value="white">White</option>
            <option value="transparent">Transparent</option>
          </select>
        </div>
        </section>

        <section class="inspector-section">
          <span class="inspector-section-title">Appearance</span>
        <div class="insp-strip-item palette-strip">
          <label>Palette</label>
          <select class="ctrl-select" [ngModel]="palettePreset" (ngModelChange)="applyPalette($event)">
            <option value="publication">Publication</option>
            <option value="colorblind">Color-blind safe</option>
            <option value="viridis">Viridis-inspired</option>
            <option value="mono">Monochrome</option>
            <option value="custom">Custom</option>
          </select>
          <input *ngFor="let color of activePlot.palette; let index = index" type="color" [ngModel]="color" (ngModelChange)="updatePaletteColor(index, $event)" [attr.aria-label]="'Palette color ' + (index + 1)" />
        </div>

        <div class="insp-strip-item chk-strip-item">
          <label class="chk-label" *ngIf="canUseErrorBars">
            <input type="checkbox" [ngModel]="activePlot.showErrorBars" (ngModelChange)="updateActiveState({showErrorBars: $event})" />
            Show Error Bars
          </label>
          <label class="chk-label" *ngIf="canUseGridControls">
            <input type="checkbox" [ngModel]="activePlot.showGrid !== false" (ngModelChange)="updateActiveState({showGrid: $event})" />
            Major grid
          </label>
          <label class="chk-label" *ngIf="canUseGridControls">
            <input type="checkbox" [disabled]="activePlot.showGrid === false" [ngModel]="activePlot.showMinorGrid === true" (ngModelChange)="updateActiveState({showMinorGrid: $event})" />
            Minor grid
          </label>
        </div>
        </section>

      </div>
      <aside class="customize-preview" aria-label="Live plot preview">
        <div class="customize-preview-heading"><span>LIVE PREVIEW</span><small>Changes update instantly</small></div>
        <div class="exact-preview" [innerHTML]="previewSvgMarkup"></div>
      </aside>
      </div>
      </section>
      </div>

      <!-- Main Canvas Area -->
      <!-- Mode 1: Single Plot Focus View with Zoom & Pan -->
      <div
        class="canvas-viewport"
        [ngClass]="activePlot.theme"
        *ngIf="viewMode === 'single'"
        (wheel)="onWheelZoom($event)"
        (mousedown)="startPan($event)"
        (click)="clearSelectionIfBackground($event)"
        (mousemove)="onPan($event)"
        (mouseup)="endPan()"
        (mouseleave)="endPan()"
        [class.panning]="isPanning">

        <div class="native-r-output" *ngIf="nativeImages.length">
          <figure *ngFor="let image of nativeImages">
            <img [src]="image.data_url" [alt]="image.name">
            <a [href]="image.data_url" [attr.download]="image.name">Download {{ image.name }}</a>
          </figure>
        </div>

        <!-- Rendered SVG Plot -->
        <div
          class="svg-container"
          [class.native-render-hidden]="nativeImages.length > 0"
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
            <g *ngIf="activePlot.figureTag" class="editable-group draggable-element" [class.selected]="selectedElement === 'tag'" (mousedown)="beginElementDrag('tag', $event)" (dblclick)="onEditableClick('figureTag', 'Figure tag', activePlot.figureTag)">
              <rect *ngIf="selectedElement === 'tag'" class="selection-box" [attr.x]="tagX + (activePlot.tagOffsetX || 0) - 7" [attr.y]="titleY + (activePlot.tagOffsetY || 0) - (activePlot.fontSizeTag || 18)" [attr.width]="textHandleWidth(activePlot.figureTag, activePlot.fontSizeTag || 18)" [attr.height]="(activePlot.fontSizeTag || 18) + 10" />
              <text [attr.x]="tagX + (activePlot.tagOffsetX || 0)" [attr.y]="titleY + (activePlot.tagOffsetY || 0)" [attr.font-family]="activePlot.fontFamily" [attr.font-size]="activePlot.fontSizeTag || 18" font-weight="bold" [attr.fill]="getThemeText()" class="clickable-text">{{ activePlot.figureTag }}</text>
              <circle *ngIf="selectedElement === 'tag'" [attr.cx]="tagX + (activePlot.tagOffsetX || 0) + textHandleWidth(activePlot.figureTag, activePlot.fontSizeTag || 18) - 2" [attr.cy]="titleY + (activePlot.tagOffsetY || 0) + 8" r="5" class="resize-handle" (mousedown)="beginElementResize('tag', $event)" />
            </g>

            <!-- Editable Title -->
            <g class="editable-group draggable-element" [class.selected]="selectedElement === 'title'" (mousedown)="beginElementDrag('title', $event)" (dblclick)="onEditableClick('title', 'Figure Title', activePlot.title)">
              <rect *ngIf="selectedElement === 'title'" class="selection-box" [attr.x]="titleX + (activePlot.titleOffsetX || 0) - 7" [attr.y]="titleY + (activePlot.titleOffsetY || 0) - activePlot.fontSizeTitle" [attr.width]="textHandleWidth(activePlot.title || 'Figure 1', activePlot.fontSizeTitle)" [attr.height]="activePlot.fontSizeTitle + 10" />
              <text [attr.x]="titleX + (activePlot.titleOffsetX || 0)"
                    [attr.y]="titleY + (activePlot.titleOffsetY || 0)"
                    [attr.font-family]="activePlot.fontFamily"
                    [attr.font-size]="activePlot.fontSizeTitle"
                    font-weight="bold"
                    [attr.fill]="getThemeText()"
                    class="clickable-text">
                {{ activePlot.title || 'Figure 1' }}
              </text>
              <circle *ngIf="selectedElement === 'title'" [attr.cx]="titleX + (activePlot.titleOffsetX || 0) + textHandleWidth(activePlot.title || 'Figure 1', activePlot.fontSizeTitle) - 2" [attr.cy]="titleY + (activePlot.titleOffsetY || 0) + 8" r="5" class="resize-handle" (mousedown)="beginElementResize('title', $event)" />
            </g>

            <!-- Editable Subtitle -->
            <g *ngIf="activePlot.subtitle" class="editable-group draggable-element" [class.selected]="selectedElement === 'subtitle'" (mousedown)="beginElementDrag('subtitle', $event)" (dblclick)="onEditableClick('subtitle', 'Figure Subtitle', activePlot.subtitle)">
              <rect *ngIf="selectedElement === 'subtitle'" class="selection-box" [attr.x]="titleX + (activePlot.subtitleOffsetX || 0) - 7" [attr.y]="subtitleY + (activePlot.subtitleOffsetY || 0) - subtitleFontSize" [attr.width]="textHandleWidth(activePlot.subtitle, subtitleFontSize)" [attr.height]="subtitleFontSize + 10" />
              <text [attr.x]="titleX + (activePlot.subtitleOffsetX || 0)"
                    [attr.y]="subtitleY + (activePlot.subtitleOffsetY || 0)"
                    [attr.font-family]="activePlot.fontFamily"
                    [attr.font-size]="subtitleFontSize"
                    [attr.fill]="getSubtitleColor()"
                    class="clickable-text">
                {{ activePlot.subtitle }}
              </text>
              <circle *ngIf="selectedElement === 'subtitle'" [attr.cx]="titleX + (activePlot.subtitleOffsetX || 0) + textHandleWidth(activePlot.subtitle, subtitleFontSize) - 2" [attr.cy]="subtitleY + (activePlot.subtitleOffsetY || 0) + 8" r="5" class="resize-handle" (mousedown)="beginElementResize('subtitle', $event)" />
            </g>

            <!-- Grid Lines -->
            <g *ngIf="activePlot.showGrid !== false && activePlot.chartType !== 'heatmap'" class="grid-lines" [attr.stroke]="getGridLineColor()" stroke-width="0.8" stroke-dasharray="3 3">
              <line *ngFor="let tick of yTicks"
                    [attr.x1]="margin.left"
                    [attr.y1]="tick.y"
                    [attr.x2]="margin.left + plotWidth"
                    [attr.y2]="tick.y" />
            </g>
            <g *ngIf="activePlot.showGrid !== false && activePlot.showMinorGrid === true && activePlot.chartType !== 'heatmap'" class="minor-grid-lines" [attr.stroke]="getGridLineColor()" stroke-width="0.55" stroke-dasharray="2 4" opacity=".72">
              <line *ngFor="let y of minorGridYs" [attr.x1]="margin.left" [attr.y1]="y" [attr.x2]="margin.left + plotWidth" [attr.y2]="y" />
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
              <g *ngIf="activePlot.chartType !== 'heatmap'" >
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
              <g *ngIf="activePlot.chartType === 'heatmap'">
                <g *ngFor="let row of heatmapRows">
                  <line [attr.x1]="margin.left - 5" [attr.y1]="row.y" [attr.x2]="margin.left" [attr.y2]="row.y" [attr.stroke]="getAxisLineColor()" stroke-width="1.2" />
                  <text [attr.x]="margin.left - 10" [attr.y]="row.y + 4" text-anchor="end" [attr.font-family]="activePlot.fontFamily" [attr.font-size]="activePlot.fontSizeAxis * 0.85" [attr.fill]="getThemeText()">{{ row.label }}</text>
                </g>
              </g>
            </g>

            <!-- Editable Y Axis Label -->
            <g class="editable-group draggable-element" [class.selected]="selectedElement === 'yLabel'" (mousedown)="beginElementDrag('yLabel', $event)" (dblclick)="onEditableClick('yLabel', 'Y-Axis Label', activePlot.yLabel)" transform="rotate(-90)">
              <rect *ngIf="selectedElement === 'yLabel'" class="selection-box" [attr.x]="yLabelLocalX - textHandleWidth(activePlot.yLabel, yLabelFontSize) / 2 - 7" [attr.y]="yLabelLocalY - yLabelFontSize" [attr.width]="textHandleWidth(activePlot.yLabel, yLabelFontSize) + 14" [attr.height]="yLabelFontSize + 10" />
              <text [attr.x]="yLabelLocalX"
                    [attr.y]="yLabelLocalY"
                    text-anchor="middle"
                    [attr.font-family]="activePlot.fontFamily"
                    [attr.font-size]="yLabelFontSize"
                    font-weight="bold"
                    [attr.fill]="getThemeText()"
                    class="clickable-text">
                {{ activePlot.yLabel }}
              </text>
              <circle *ngIf="selectedElement === 'yLabel'" [attr.cx]="yLabelLocalX + textHandleWidth(activePlot.yLabel, yLabelFontSize) / 2 + 5" [attr.cy]="yLabelLocalY + 8" r="5" class="resize-handle" (mousedown)="beginElementResize('yLabel', $event)" />
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
            <g class="editable-group draggable-element" [class.selected]="selectedElement === 'xLabel'" (mousedown)="beginElementDrag('xLabel', $event)" (dblclick)="onEditableClick('xLabel', 'X-Axis Label', activePlot.xLabel)">
              <rect *ngIf="selectedElement === 'xLabel'" class="selection-box" [attr.x]="xLabelX - textHandleWidth(activePlot.xLabel, xLabelFontSize) / 2 - 7" [attr.y]="xLabelY - xLabelFontSize" [attr.width]="textHandleWidth(activePlot.xLabel, xLabelFontSize) + 14" [attr.height]="xLabelFontSize + 10" />
              <text [attr.x]="xLabelX"
                    [attr.y]="xLabelY"
                    text-anchor="middle"
                    [attr.font-family]="activePlot.fontFamily"
                    [attr.font-size]="xLabelFontSize"
                    font-weight="bold"
                    [attr.fill]="getThemeText()"
                    class="clickable-text">
                {{ activePlot.xLabel }}
              </text>
              <circle *ngIf="selectedElement === 'xLabel'" [attr.cx]="xLabelX + textHandleWidth(activePlot.xLabel, xLabelFontSize) / 2 + 5" [attr.cy]="xLabelY + 8" r="5" class="resize-handle" (mousedown)="beginElementResize('xLabel', $event)" />
            </g>

            <!-- Geometry Renderings -->
            <!-- 1. Bar Chart -->
            <g *ngIf="activePlot.chartType === 'bar' || activePlot.chartType === 'histogram'">
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
            <g *ngIf="activePlot.chartType === 'volcano'" class="volcano-guides">
              <line [attr.x1]="volcanoX(-volcanoThresholdX)" [attr.x2]="volcanoX(-volcanoThresholdX)" [attr.y1]="margin.top" [attr.y2]="svgHeight - margin.bottom" stroke="#9ca3af" stroke-dasharray="4 3" />
              <line [attr.x1]="volcanoX(volcanoThresholdX)" [attr.x2]="volcanoX(volcanoThresholdX)" [attr.y1]="margin.top" [attr.y2]="svgHeight - margin.bottom" stroke="#9ca3af" stroke-dasharray="4 3" />
              <line [attr.x1]="margin.left" [attr.x2]="margin.left + plotWidth" [attr.y1]="volcanoY(volcanoThresholdY)" [attr.y2]="volcanoY(volcanoThresholdY)" stroke="#9ca3af" stroke-dasharray="4 3" />
            </g>
            <g *ngIf="activePlot.chartType === 'scatter' || activePlot.chartType === 'dotplot' || activePlot.chartType === 'volcano'">
              <circle *ngFor="let item of renderItems"
                      [attr.cx]="item.centerX"
                      [attr.cy]="item.y"
                      [attr.r]="activePlot.pointSize"
                      [attr.fill]="activePlot.chartType === 'volcano' ? volcanoPointColor(item) : item.color"
                      [attr.stroke]="getThemeBg()"
                      stroke-width="1.2"
                      class="visual-element" />
              <ng-container *ngIf="activePlot.chartType === 'volcano'">
                <text *ngFor="let item of renderItems" [attr.x]="item.centerX + 6" [attr.y]="item.y - 6"
                      [attr.font-family]="activePlot.fontFamily" [attr.font-size]="Math.max(9, activePlot.fontSizeAxis * .72)"
                      [attr.fill]="getThemeText()" [style.display]="item.label && volcanoIsSignificant(item) ? null : 'none'">{{ item.label }}</text>
              </ng-container>
            </g>

            <!-- 3. Line Plot -->
            <g *ngIf="activePlot.chartType === 'line' || activePlot.chartType === 'density'">
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
                <line [attr.x1]="item.centerX" [attr.y1]="item.whiskerHighY" [attr.x2]="item.centerX" [attr.y2]="item.whiskerLowY" [attr.stroke]="getAxisLineColor()" stroke-width="1.2" />
                <line [attr.x1]="item.x + item.width * .22" [attr.y1]="item.whiskerHighY" [attr.x2]="item.x + item.width * .78" [attr.y2]="item.whiskerHighY" [attr.stroke]="getAxisLineColor()" stroke-width="1.2" />
                <line [attr.x1]="item.x + item.width * .22" [attr.y1]="item.whiskerLowY" [attr.x2]="item.x + item.width * .78" [attr.y2]="item.whiskerLowY" [attr.stroke]="getAxisLineColor()" stroke-width="1.2" />
                <rect [attr.x]="item.x"
                      [attr.y]="item.y"
                      [attr.width]="Math.max(1, item.width)"
                      [attr.height]="Math.max(0, item.height)"
                      [attr.fill]="item.color"
                      [attr.stroke]="getAxisLineColor()"
                      stroke-width="1.2"
                      rx="1" />
                <line [attr.x1]="item.x" [attr.y1]="item.medianY" [attr.x2]="item.x + item.width" [attr.y2]="item.medianY" [attr.stroke]="getThemeText()" stroke-width="2" />
              </g>
            </g>

            <!-- 5. Violin plot: distribution silhouette, median, and optional raw observations. -->
            <g *ngIf="activePlot.chartType === 'violin'">
              <g *ngFor="let item of renderItems">
                <ellipse [attr.cx]="item.centerX" [attr.cy]="item.centerY" [attr.rx]="item.width / 2" [attr.ry]="Math.max(8, item.height / 2)" [attr.fill]="item.color" fill-opacity=".62" [attr.stroke]="getAxisLineColor()" stroke-width="1.2" />
                <circle *ngFor="let point of item.points" [attr.cx]="point.x" [attr.cy]="point.y" [attr.r]="activePlot.showRawPoints !== false ? 3 : 0" [attr.fill]="getThemeText()" fill-opacity=".72" />
                <line [attr.x1]="item.centerX - item.width / 2" [attr.x2]="item.centerX + item.width / 2" [attr.y1]="item.medianY" [attr.y2]="item.medianY" [attr.stroke]="getThemeText()" stroke-width="2" />
              </g>
            </g>

            <!-- Heatmaps use x categories and groups as their two discrete axes. -->
            <g *ngIf="activePlot.chartType === 'heatmap'">
              <rect *ngFor="let item of renderItems"
                    [attr.x]="item.x" [attr.y]="item.y"
                    [attr.width]="item.width" [attr.height]="item.height"
                    [attr.fill]="item.color" stroke="#ffffff" stroke-width="1" />
              <ng-container *ngIf="activePlot.showHeatmapValues === true">
                <text *ngFor="let item of renderItems"
                      [attr.x]="item.x + item.width / 2" [attr.y]="item.y + item.height / 2 + 4"
                      text-anchor="middle" [attr.font-family]="activePlot.fontFamily"
                      [attr.font-size]="Math.max(8, activePlot.fontSizeAxis * .72)"
                      [attr.fill]="getHeatmapCellTextColor(item.color)">{{ formatHeatValue(item.value) }}</text>
              </ng-container>
            </g>
            <g *ngIf="activePlot.chartType === 'heatmap'" class="heatmap-scale">
              <defs><linearGradient id="heatmap-value-scale" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" [attr.stop-color]="heatmapLowColor" /><stop offset="50%" [attr.stop-color]="heatmapMidColor" /><stop offset="100%" [attr.stop-color]="heatmapHighColor" /></linearGradient></defs>
              <text [attr.x]="heatmapLegendX" [attr.y]="margin.top - 8" [attr.font-family]="activePlot.fontFamily" [attr.font-size]="activePlot.fontSizeAxis * .75" font-weight="bold" [attr.fill]="getThemeText()">{{ heatmapValueLabel }}</text>
              <rect [attr.x]="heatmapLegendX" [attr.y]="margin.top" width="13" [attr.height]="plotHeight" fill="url(#heatmap-value-scale)" [attr.stroke]="getAxisLineColor()" stroke-width=".5" />
              <text [attr.x]="heatmapLegendX + 19" [attr.y]="margin.top + 4" [attr.font-family]="activePlot.fontFamily" [attr.font-size]="activePlot.fontSizeAxis * .72" [attr.fill]="getThemeText()">{{ formatHeatValue(heatmapColorMax) }}</text>
              <text *ngIf="heatmapIsDiverging" [attr.x]="heatmapLegendX + 19" [attr.y]="margin.top + plotHeight / 2 + 4" [attr.font-family]="activePlot.fontFamily" [attr.font-size]="activePlot.fontSizeAxis * .72" [attr.fill]="getThemeText()">0</text>
              <text [attr.x]="heatmapLegendX + 19" [attr.y]="margin.top + plotHeight" [attr.font-family]="activePlot.fontFamily" [attr.font-size]="activePlot.fontSizeAxis * .72" [attr.fill]="getThemeText()">{{ formatHeatValue(heatmapColorMin) }}</text>
            </g>

            <!-- Legend (Non-overlapping) -->
            <g *ngIf="activePlot.legendPosition !== 'none' && legendItems.length > 0" class="legend-box draggable-element" [class.selected]="selectedElement === 'legend'" (mousedown)="beginElementDrag('legend', $event)" (dblclick)="onEditableClick('legendTitle', 'Legend Title', activePlot.legendTitle)">
              <rect *ngIf="selectedElement === 'legend'" class="selection-box" [attr.x]="legendBounds.x" [attr.y]="legendBounds.y" [attr.width]="legendBounds.width" [attr.height]="legendBounds.height" />
              <g *ngIf="activePlot.legendPosition === 'right' || activePlot.legendPosition === 'left'">
                <text [attr.x]="legendX + (activePlot.legendOffsetX || 0)"
                      [attr.y]="legendY + (activePlot.legendOffsetY || 0)"
                      [attr.font-family]="activePlot.fontFamily"
                      [attr.font-size]="activePlot.fontSizeLegend"
                      font-weight="bold"
                      [attr.fill]="getThemeText()"
                      class="clickable-text">
                  {{ activePlot.legendTitle || 'Legend' }}
                </text>
                <g *ngFor="let leg of legendItems; let lIdx = index">
                  <rect [attr.x]="legendX + (activePlot.legendOffsetX || 0)"
                        [attr.y]="legendY + (activePlot.legendOffsetY || 0) + (10 * legendScale) + (lIdx * 20 * legendScale)"
                        [attr.width]="14 * legendScale" [attr.height]="14 * legendScale" rx="2"
                        [attr.fill]="leg.color"
                        [attr.stroke]="getBarBorderColor()"
                        stroke-width="0.5" />
                  <text [attr.x]="legendX + (activePlot.legendOffsetX || 0) + (20 * legendScale)"
                        [attr.y]="legendY + (activePlot.legendOffsetY || 0) + (22 * legendScale) + (lIdx * 20 * legendScale)"
                        [attr.font-family]="activePlot.fontFamily"
                        [attr.font-size]="activePlot.fontSizeLegend * 0.9"
                        [attr.fill]="getThemeText()">
                    {{ leg.label }}
                  </text>
                </g>
              </g>

              <g *ngIf="activePlot.legendPosition === 'top' || activePlot.legendPosition === 'bottom'">
                <g *ngFor="let leg of legendItems; let lIdx = index">
                  <rect [attr.x]="legendX + (activePlot.legendOffsetX || 0) + (lIdx * 110 * legendScale)"
                        [attr.y]="legendY + (activePlot.legendOffsetY || 0) - (10 * legendScale)"
                        [attr.width]="12 * legendScale" [attr.height]="12 * legendScale" rx="2"
                        [attr.fill]="leg.color"
                        [attr.stroke]="getBarBorderColor()"
                        stroke-width="0.5" />
                  <text [attr.x]="legendX + (activePlot.legendOffsetX || 0) + (lIdx * 110 * legendScale) + (16 * legendScale)"
                        [attr.y]="legendY + (activePlot.legendOffsetY || 0)"
                        [attr.font-family]="activePlot.fontFamily"
                        [attr.font-size]="activePlot.fontSizeLegend * 0.9"
                        [attr.fill]="getThemeText()">
                    {{ leg.label }}
                  </text>
                </g>
              </g>
              <circle *ngIf="selectedElement === 'legend'" [attr.cx]="legendBounds.x + legendBounds.width - 2" [attr.cy]="legendBounds.y + legendBounds.height - 2" r="5" class="resize-handle" (mousedown)="beginElementResize('legend', $event)" />
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

        <div class="mobile-element-controls" *ngIf="selectedElement" (click)="$event.stopPropagation()">
          <div class="mobile-element-control-head">
            <strong>{{ selectedElementLabel }}</strong>
            <button type="button" (click)="selectedElement = null" aria-label="Close element controls">×</button>
          </div>
          <div class="mobile-element-control-row">
            <button type="button" (click)="nudgeSelected(0, -6)" aria-label="Move up">↑</button>
            <button type="button" (click)="nudgeSelected(-6, 0)" aria-label="Move left">←</button>
            <button type="button" (click)="nudgeSelected(6, 0)" aria-label="Move right">→</button>
            <button type="button" (click)="nudgeSelected(0, 6)" aria-label="Move down">↓</button>
            <span class="mobile-element-control-separator"></span>
            <button type="button" (click)="resizeSelected(-1)" aria-label="Decrease size">A−</button>
            <button type="button" (click)="resizeSelected(1)" aria-label="Increase size">A+</button>
          </div>
        </div>

      </div>

      <!-- Mode 2: Multi-Plot Grid View (Side-by-Side & Multi-Panel) -->
      <div class="grid-viewport" *ngIf="viewMode === 'grid'">
        <div class="native-r-grid" *ngIf="nativeImages.length">
          <figure *ngFor="let image of nativeImages">
            <img [src]="image.data_url" [alt]="image.name">
            <figcaption><a [href]="image.data_url" [attr.download]="image.name">Download {{ image.name }}</a></figcaption>
          </figure>
        </div>
        <div *ngIf="!nativeImages.length" class="grid-plots-container" [style.grid-template-columns]="plots.length > 2 ? 'repeat(2, 1fr)' : 'repeat(' + plots.length + ', 1fr)'">
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

    .type-menu-wrap { position: relative; }.type-menu-button { min-width: 155px; display: inline-flex; justify-content: space-between; align-items: center; cursor: pointer; }.type-menu { position: absolute; z-index: 100; top: 28px; left: 38px; width: 230px; padding: 7px; border: 1px solid #cbd5e1; border-radius: 8px; background: #ffffff; box-shadow: 0 10px 24px rgba(15,23,42,.18); }.type-menu-heading { display: block; padding: 6px 8px 3px; color: #94a3b8; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }.type-menu-row { display: grid; grid-template-columns: 1fr 24px; align-items: center; border-radius: 5px; }.type-menu-row:hover { background: #f1f5f9; }.type-menu-row > button:first-child { min-width: 0; padding: 6px 8px; border: none; background: transparent; color: #334155; text-align: left; font-size: 11px; cursor: pointer; }.selected-check { display: inline-block; width: 15px; color: #2563eb; font-weight: 800; }.row-help { width: 18px; height: 18px; border-radius: 50%; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 800; font-size: 10px; cursor: pointer; }.row-help:hover { border-color: #2563eb; color: #ffffff; background: #2563eb; }

    .ctrl-input-tag {
      width: 55px;
      text-align: center;
    }

    .output-size-control {
      margin-left: 4px;
      padding-left: 8px;
      border-left: 1px solid #dbe3ef;
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

    .plot-help-trigger, .gallery-help {
      display: inline-grid; place-items: center; width: 18px; height: 18px; padding: 0;
      border-radius: 50%; border: 1px solid #94a3b8; background: #ffffff; color: #475569;
      font-size: 11px; font-weight: 800; cursor: pointer;
    }
    .editable-group.selected .clickable-text, .legend-box.selected { filter: drop-shadow(0 0 1px #2563eb); }
    .selection-box { fill: rgba(37, 99, 235, .035); stroke: #2563eb; stroke-width: 1.3; stroke-dasharray: 4 3; pointer-events: none; }
    .resize-handle { fill: #2563eb; stroke: #ffffff; stroke-width: 2; cursor: nwse-resize; }
    .plot-help-trigger:hover, .gallery-help:hover { background: #2563eb; color: #ffffff; border-color: #2563eb; }

    .plot-gallery {
      display: grid;
      grid-template-columns: minmax(180px, 1.5fr) repeat(6, minmax(112px, 1fr));
      gap: 7px;
      padding: 10px 14px;
      background: #ffffff;
      border-bottom: 1px solid #dbe3ef;
    }

    .plot-gallery-copy { display: grid; gap: 2px; align-content: center; color: #475569; font-size: 10px; }
    .plot-gallery-copy strong { color: #1e293b; font-size: 11px; }
    .gallery-card { position: relative; }
    .plot-gallery .gallery-card > button:first-child {
      width: 100%; min-height: 50px;
      text-align: left; background: #f8fafc; border: 1px solid #dbe3ef; border-radius: 6px;
      padding: 6px 8px; color: #1e293b; font-size: 10.5px; font-weight: 700; cursor: pointer;
    }
    .plot-gallery button small { color: #64748b; font-size: 9px; font-weight: 500; }
    .plot-gallery .gallery-card > button:first-child:hover, .plot-gallery .gallery-card.active > button:first-child { background: #eff6ff; border-color: #60a5fa; color: #1d4ed8; }
    .gallery-help { position: absolute; top: 5px; right: 5px; background: #ffffff; }
    @media (max-width: 1100px) { .plot-gallery { grid-template-columns: repeat(3, minmax(130px, 1fr)); } .plot-gallery-copy { grid-column: 1 / -1; } }

    .plot-help-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 18px; background: rgba(15, 23, 42, 0.52); }
    .plot-help-modal { width: min(980px, 96vw); max-height: min(760px, 92vh); overflow: auto; border-radius: 14px; background: #ffffff; box-shadow: 0 24px 70px rgba(15, 23, 42, 0.35); color: #1e293b; }
    .plot-help-modal header { display: flex; justify-content: space-between; gap: 18px; align-items: start; padding: 21px 24px 14px; border-bottom: 1px solid #e2e8f0; }
    .eyebrow { display: block; color: #2563eb; font-size: 10px; font-weight: 800; letter-spacing: .1em; }
    .plot-help-modal h2 { margin: 3px 0 0; font-size: 22px; }
    .modal-close { border: none; background: #f1f5f9; color: #475569; border-radius: 50%; width: 30px; height: 30px; font-size: 22px; cursor: pointer; }
    .help-use { margin: 16px 24px; font-size: 13px; line-height: 1.55; color: #475569; }
    .axis-explainer { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0 24px 16px; }
    .axis-explainer div { display: grid; gap: 3px; border: 1px solid #dbe3ef; border-radius: 8px; padding: 10px 12px; background: #f8fafc; }
    .axis-explainer strong { font-size: 11px; color: #0f766e; text-transform: uppercase; letter-spacing: .04em; }.axis-explainer span { font-size: 12px; color: #475569; }
    .example-mapping { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin: 0 24px 16px; font-size: 11px; color: #475569; }.example-mapping > strong { color: #1e293b; margin-right: 4px; }.example-mapping span { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; border-radius: 999px; padding: 4px 8px; }.example-mapping b { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
    .help-example-grid { display: grid; grid-template-columns: minmax(260px, .9fr) minmax(340px, 1.1fr); gap: 16px; padding: 0 24px 20px; }
    .example-heading { font-size: 12px; font-weight: 800; color: #1e293b; margin-bottom: 4px; }.excel-note { font-size: 10px; color: #64748b; margin-bottom: 8px; }
    .example-table-wrap { overflow: auto; border: 1px solid #dbe3ef; border-radius: 8px; }.example-table-wrap table { width: 100%; border-collapse: collapse; font-size: 10px; }.example-table-wrap th { background: #eff6ff; color: #1e40af; }.example-table-wrap th,.example-table-wrap td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }.example-table-wrap tr:last-child td { border-bottom: none; }
    .example-plot app-r-plot-preview { display: block; border: 1px solid #dbe3ef; border-radius: 8px; overflow: hidden; }
    .plot-help-modal footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 13px 24px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 11px; }.help-actions { display: flex; gap: 7px; }.load-example-btn,.download-example-btn { border: none; border-radius: 7px; padding: 8px 12px; font-weight: 700; cursor: pointer; }.load-example-btn { background: #2563eb; color: #ffffff; }.download-example-btn { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    @media (max-width: 720px) { .axis-explainer,.help-example-grid { grid-template-columns: 1fr; }.plot-help-modal footer { align-items: stretch; flex-direction: column; } }

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

    /* Customization modal: settings stay out of the canvas workspace. */
    .customize-backdrop { position: fixed; inset: 0; z-index: 10001; display: grid; place-items: center; padding: 20px; background: rgba(15, 23, 42, .52); }
    .customize-modal { width: min(1280px, 96vw); max-height: min(760px, 90vh); overflow: auto; border: 1px solid #dbe3ef; border-radius: 14px; background: #f8fafc; box-shadow: 0 24px 70px rgba(15, 23, 42, .35); color: #1e293b; }
    .customize-modal-header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; padding: 20px 24px 15px; background: #ffffff; border-bottom: 1px solid #dbe3ef; }
    .customize-modal-header h2 { margin: 3px 0 4px; font-size: 23px; }
    .customize-modal-header p { margin: 0; color: #64748b; font-size: 12px; line-height: 1.45; }
    .customize-content { display: grid; grid-template-columns: minmax(520px, 1.15fr) minmax(360px, .85fr); align-items: stretch; }
    .customize-preview { display: flex; flex-direction: column; gap: 9px; min-height: 390px; padding: 18px; background: #ffffff; border-left: 1px solid #dbe3ef; }
    .customize-preview-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; color: #64748b; }.customize-preview-heading span { color: #475569; font-size: 10px; font-weight: 800; letter-spacing: .09em; }.customize-preview-heading small { font-size: 10px; }
    .exact-preview { display: flex; flex: 1; min-height: 300px; border: 1px solid #dbe3ef; border-radius: 9px; overflow: hidden; background: #ffffff; }
    ::ng-deep .exact-preview svg { width: 100%; height: 100%; display: block; }

    .horizontal-inspector-strip {
      display: grid;
      /* Plot-specific sections may disappear. Use compact, auto-filled cards
         so the remaining controls never leave a large empty quadrant. */
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      align-items: start;
      gap: 12px;
      padding: 18px 22px 22px;
      background: #f1f5f9;
    }

    .inspector-hint {
      grid-column: 1 / -1;
      color: #64748b;
      font-size: 12px;
      line-height: 1.35;
      padding: 0 2px 2px;
    }

    .inspector-section {
      display: flex;
      align-content: start;
      align-items: flex-start;
      gap: 10px;
      flex-wrap: wrap;
      min-height: 0;
      padding: 14px;
      border: 1px solid #dbe3ef;
      border-radius: 10px;
      background: #ffffff;
    }
    .inspector-section:only-child { grid-column: 1 / -1; }
    .inspector-section .insp-strip-item { flex-wrap: wrap; }
    .unit-label { color: #64748b; font-size: 10px; font-weight: 700; white-space: nowrap; }
    .inspector-section-title {
      width: 100%;
      color: #64748b;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .field-help { display: inline-grid; place-items: center; width: 13px; height: 13px; border-radius: 50%; background: #e2e8f0; color: #475569; font-size: 9px; font-weight: 800; cursor: help; position: relative; }
    .field-help::after { content: attr(data-tooltip); position: absolute; bottom: calc(100% + 7px); left: 50%; width: 220px; box-sizing: border-box; padding: 7px 9px; border-radius: 6px; background: #0f172a; color: #fff; font-size: 11px; font-weight: 500; line-height: 1.35; text-transform: none; letter-spacing: 0; opacity: 0; visibility: hidden; transform: translateX(-50%); pointer-events: none; z-index: 1000; }
    .field-help:hover::after, .field-help:focus::after { opacity: 1; visibility: visible; }

    .insp-strip-item {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      color: #334155;
      min-width: 0;
      flex-wrap: wrap;
    }

    .insp-strip-item label {
      white-space: nowrap;
      font-size: 10px;
      letter-spacing: 0;
      text-transform: none;
    }
    .control-field { display: inline-flex; align-items: center; gap: 5px; flex-wrap: nowrap; max-width: 100%; }
    .control-field .ctrl-select { min-width: 108px; }

    .insp-strip-item input[type="range"] {
      width: min(138px, 100%);
      accent-color: #2563eb;
      margin: 0;
      padding: 0;
      -webkit-appearance: none;
      appearance: none;
      height: 14px;
      background: transparent;
    }

    .insp-strip-item input[type="number"], .inline-number {
      width: 68px;
      min-width: 0;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 3px 5px;
      background: #ffffff;
      color: #0f172a;
      font-size: 11px;
    }

    .palette-strip input[type="color"] {
      width: 20px;
      height: 20px;
      padding: 1px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      cursor: pointer;
      background: #fff;
    }

    .horizontal-inspector-strip .ctrl-select {
      max-width: 180px;
    }

    .palette-strip { width: 100%; }
    @media (max-width: 920px) { .customize-content { grid-template-columns: 1fr; } .customize-preview { border-left: none; border-top: 1px solid #dbe3ef; min-height: 320px; } }
    @media (max-width: 720px) { .horizontal-inspector-strip { grid-template-columns: 1fr; padding: 14px; } .customize-backdrop { padding: 10px; } .customize-modal { width: 100%; max-height: 94vh; } .customize-modal-header { padding: 16px; } }

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

    .chk-strip-item { width: 100%; margin-left: 0; }

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

    .draggable-element {
      cursor: grab;
    }

    .draggable-element:active {
      cursor: grabbing;
    }

    .draggable-element:hover .clickable-text, .legend-box:hover text {
      filter: drop-shadow(0 0 2px rgba(37, 99, 235, 0.35));
    }

    .mobile-element-controls { display: none; }

    .btn-close-strip {
      position: absolute;
      right: 7px;
      top: 6px;
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
    .chk-label:has(input:disabled) { color: #94a3b8; cursor: not-allowed; }
    .chk-label input:disabled { cursor: not-allowed; opacity: .55; }

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

    .svg-container.native-render-hidden { display: none; }
    .native-r-output { width: 100%; height: 100%; padding: 20px; box-sizing: border-box; overflow: auto; display: flex; align-items: center; justify-content: center; }
    .native-r-output figure { margin: 0; width: 100%; max-width: 1200px; text-align: center; }
    .native-r-output img { display: block; max-width: 100%; max-height: calc(100vh - 220px); margin: 0 auto 10px; object-fit: contain; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,.08); }
    .native-r-output a, .native-r-grid a { color: #166534; font: 700 12px system-ui, sans-serif; text-decoration: none; }

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

    .native-r-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    .native-r-grid figure { margin: 0; padding: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; text-align: center; }
    .native-r-grid img { display: block; width: 100%; height: auto; margin-bottom: 8px; }

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
    @media (max-width: 700px) {
      .plot-tabs-bar { height: 34px; padding: 0 7px; }
      .plot-tab { padding: 3px 7px; font-size: .65rem; }
      .btn-add-tab { padding: 3px 7px; font-size: .64rem; }
      .view-mode-group { display: none; }
      .canvas-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; padding: 5px 7px; gap: 5px; }
      .toolbar-controls { min-width: 0; flex-basis: auto; }
      .toolbar-controls .ctrl-group:not(:first-child) { display: none; }
      .ctrl-group.type-menu-wrap { width: 100%; }
      .type-menu-button { width: 100%; min-width: 0; }
      .type-menu { left: 0; width: min(230px, calc(100vw - 24px)); }
      .toolbar-actions { flex: none; gap: 4px; }
      .btn-toggle-inspector { height: 27px; padding: 3px 7px; font-size: .65rem; }
      .export-split-button { height: 27px; }
      .btn-export-main, .export-select-menu { font-size: .64rem; }
      .plot-gallery { display: none; }
      .canvas-viewport { padding: 7px; }
      .svg-container { padding: 5px; border-radius: 5px; box-shadow: none; }
      .selection-box { stroke-width: 2.2; }
      .resize-handle { display: none; }
      .mobile-element-controls {
        align-items: stretch;
        background: rgba(255,255,255,.97);
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        bottom: max(10px, env(safe-area-inset-bottom));
        box-shadow: 0 8px 28px rgba(15,23,42,.18);
        display: flex;
        flex-direction: column;
        gap: 6px;
        left: 10px;
        padding: 7px;
        position: absolute;
        right: 10px;
        z-index: 80;
      }
      .mobile-element-control-head { align-items: center; display: flex; justify-content: space-between; padding-left: 3px; }
      .mobile-element-control-head strong { color: #334155; font-size: .7rem; }
      .mobile-element-control-head button { background: transparent; border: 0; color: #64748b; font-size: 1rem; height: 26px; width: 30px; }
      .mobile-element-control-row { display: grid; grid-template-columns: repeat(4, 1fr) 1px repeat(2, 1.2fr); gap: 5px; }
      .mobile-element-control-row button { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; color: #0f172a; font-size: .9rem; font-weight: 800; min-height: 40px; padding: 0; }
      .mobile-element-control-row button:active { background: #dbeafe; border-color: #2563eb; }
      .mobile-element-control-separator { background: #e2e8f0; }
      .field-help::after { bottom: max(18px, env(safe-area-inset-bottom)); left: 12px; position: fixed; right: 12px; transform: none; width: auto; z-index: 12000; }
      .inline-editor-popover { width: calc(100vw - 42px); box-sizing: border-box; }
      .grid-viewport { padding: 9px; }
      .grid-header-subtitle { display: none; }
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
  nativeImages: NativeRImage[] = [];

  showInspector = false;
  previewSvgMarkup: SafeHtml = '';
  showTypeMenu = false;
  plotHelp: PlotHelpCard | null = null;
  readonly advancedPlotTypes: PlotType[] = ['violin', 'dotplot', 'histogram', 'density', 'volcano', 'heatmap'];
  readonly commonPlotTypes: PlotType[] = ['bar', 'line', 'scatter', 'boxplot'];
  showZoomPopover = false;
  selectedExportFormat: 'png' | 'pdf' | 'svg' = 'png';
  private elementDrag: ElementDragState | null = null;
  private suppressEditorClick = false;
  selectedElement: DraggableElement | null = null;

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
  heatmapRows: Array<{ label: string; y: number }> = [];
  heatmapColorMin = 0;
  heatmapColorMax = 1;
  heatmapIsDiverging = false;
  private heatmapPalette: string[] = ['#2563EB', '#EF4444'];

  legendX = 600;
  legendY = 80;
  private yDomainMin = 0;
  private yDomainMax = 10;
  private xDomainMin = 0;
  private xDomainMax = 10;
  private continuousX = false;

  textEditor: InlineTextEditorState = {
    isOpen: false,
    field: 'title',
    label: '',
    value: ''
  };

  constructor(private rSyncService: RPlotSyncService, private sanitizer: DomSanitizer) {}

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

    this.rSyncService.nativeRender$.subscribe(images => {
      this.nativeImages = images;
    });
  }

  get activePlot(): PlotState {
    const list = this.plots;
    const idx = Math.min(this.activePlotIndex, list.length - 1);
    return list[Math.max(0, idx)] || list[0];
  }

  get figureWidthIn(): number { return Number(this.activePlot?.figureWidthIn) || 6.5; }
  get figureHeightIn(): number { return Number(this.activePlot?.figureHeightIn) || 4.5; }
  get exportDpi(): number { return Number(this.activePlot?.exportDpi) || 300; }

  get publicationPreset(): string {
    const width = this.figureWidthIn;
    const height = this.figureHeightIn;
    if (Math.abs(width - 3.5) < 0.05 && Math.abs(height - 2.7) < 0.05) return 'journal-single';
    if (Math.abs(width - 7.2) < 0.05 && Math.abs(height - 4.8) < 0.05) return 'journal-double';
    if (Math.abs(width - 5) < 0.05 && Math.abs(height - 5) < 0.05) return 'square';
    if (Math.abs(width - 10) < 0.05 && Math.abs(height - 5.625) < 0.05) return 'slide';
    return 'custom';
  }

  get plotWidth(): number {
    return Math.max(10, this.svgWidth - this.margin.left - this.margin.right);
  }

  get plotHeight(): number {
    return Math.max(10, this.svgHeight - this.margin.top - this.margin.bottom);
  }

  private valueToY(value: number): number {
    const range = Math.max(0.000001, this.yDomainMax - this.yDomainMin);
    return this.svgHeight - this.margin.bottom - (((value - this.yDomainMin) / range) * this.plotHeight);
  }

  private valueToX(value: number): number {
    const range = Math.max(0.000001, this.xDomainMax - this.xDomainMin);
    return this.margin.left + (((value - this.xDomainMin) / range) * this.plotWidth);
  }

  /** Interpolate all selected palette stops so heatmaps honor Appearance > Palette. */
  private heatColor(value: number, min: number, max: number, palette: string[]): string {
    const low = palette[0] || '#2166AC';
    const high = palette[1] || palette[palette.length - 1] || '#B2182B';
    if (min < 0 && max > 0) {
      return value <= 0
        ? this.blendColors(low, '#ffffff', (value - min) / Math.max(0.000001, -min))
        : this.blendColors('#ffffff', high, value / Math.max(0.000001, max));
    }
    // A non-diverging heatmap must use the same low → high scale shown in
    // its legend. White is reserved for the midpoint of diverging data.
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

  get heatmapLowColor(): string { return this.heatmapPalette[0] || '#2166AC'; }
  get heatmapMidColor(): string {
    return this.heatmapIsDiverging
      ? '#ffffff'
      : this.blendColors(this.heatmapLowColor, this.heatmapHighColor, .5);
  }
  get heatmapHighColor(): string { return this.heatmapPalette[1] || this.heatmapPalette[this.heatmapPalette.length - 1] || '#B2182B'; }
  get heatmapLegendX(): number { return this.margin.left + this.plotWidth + 24; }
  get heatmapValueLabel(): string { return this.activePlot?.yColumn || 'Value'; }
  formatHeatValue(value: number): string { return Number(value.toFixed(2)).toString(); }

  getHeatmapCellTextColor(color: string): string {
    const channels = String(color).match(/\d+(?:\.\d+)?/g)?.map(Number);
    if (!channels || channels.length < 3) return '#111827';
    const luminance = ((channels[0] * 299) + (channels[1] * 587) + (channels[2] * 114)) / 1000;
    return luminance < 145 ? '#ffffff' : '#111827';
  }

  selectPlotTab(idx: number) {
    this.rSyncService.setActivePlotIndex(idx);
  }

  choosePlotType(type: PlotType) {
    const defaults: Partial<PlotState> = {
      chartType: type,
      showRawPoints: true,
      showTrendLine: type === 'scatter',
      showConfidenceBand: false,
      binCount: 30,
      xScale: 'linear',
      yScale: 'linear',
      // A plot type change starts with data-driven limits; fixed values are
      // deliberate per-figure overrides, never defaults carried across types.
      yMin: null,
      yMax: null
    };
    if (type === 'volcano') {
      Object.assign(defaults, { xLabel: 'log2 fold change', yLabel: '-log10 adjusted P value', thresholdX: 1, thresholdY: 1.3, legendPosition: 'none' });
    }
    this.updateActiveState(defaults);
    this.showTypeMenu = false;
  }

  plotName(type: PlotType): string {
    return ({ bar: 'Bar chart', line: 'Line plot', scatter: 'Scatter plot', boxplot: 'Boxplot', violin: 'Violin plot', dotplot: 'Dot plot', histogram: 'Histogram', density: 'Density plot', volcano: 'Volcano plot', heatmap: 'Heatmap' } as Record<PlotType, string>)[type];
  }

  plotSummary(type: PlotType): string {
    return ({ bar: 'group means and error bars', line: 'time course or kinetics', scatter: 'association or standard curve', boxplot: 'quartile summary', violin: 'distribution + raw data', dotplot: 'paired / replicate values', histogram: 'one numeric variable', density: 'distribution comparison', volcano: 'logFC vs -log10 FDR', heatmap: 'matrix / grouped values' } as Record<PlotType, string>)[type];
  }

  openPlotHelp(type: PlotType) {
    const copy: Record<PlotType, Omit<PlotHelpCard, 'type' | 'columns' | 'rows' | 'plot'>> = {
      bar: { name: 'Bar chart', use: 'Compare summarized group values, especially when each bar is a mean with SD, SEM, or confidence-interval error bars.', xMeaning: 'Experimental condition or category.', yMeaning: 'A summarized measurement such as mean expression or activity.' },
      line: { name: 'Line / time-course plot', use: 'Show how a measurement changes over ordered time points, doses, or other continuous conditions; use a group column for multiple trajectories.', xMeaning: 'Ordered time, dose, or measurement interval.', yMeaning: 'Response measured at each interval.' },
      scatter: { name: 'Scatter / regression plot', use: 'Show the relationship between two continuous variables, such as a standard curve, concentration-response association, or correlation.', xMeaning: 'First continuous measurement or predictor.', yMeaning: 'Second continuous measurement or response.' },
      boxplot: { name: 'Boxplot', use: 'Compare distributions across groups when showing medians, interquartile ranges, and potential outliers matters more than just a mean.', xMeaning: 'Experimental group or category.', yMeaning: 'Individual replicate measurement.' },
      violin: { name: 'Violin plot', use: 'Show the shape and spread of replicate-level data, while retaining a compact statistical summary and raw points.', xMeaning: 'Experimental group or category.', yMeaning: 'Individual replicate measurement.' },
      dotplot: { name: 'Dot plot', use: 'Show every observation directly. This is often preferable for small biological replicate counts and paired measurements.', xMeaning: 'Experimental group or paired condition.', yMeaning: 'Individual replicate measurement.' },
      histogram: { name: 'Histogram', use: 'Inspect the frequency distribution of one continuous variable before choosing tests or identifying unusual values.', xMeaning: 'Numeric measurement divided into bins.', yMeaning: 'Number of observations in each bin.' },
      density: { name: 'Density plot', use: 'Compare the smoothed distribution of one continuous variable, especially with many observations.', xMeaning: 'Numeric measurement.', yMeaning: 'Estimated relative density, not a raw count.' },
      volcano: { name: 'Volcano plot', use: 'Prioritize differential-expression or screening results by displaying effect size and statistical significance together.', xMeaning: 'log2 fold change; left is lower and right is higher relative to the reference.', yMeaning: '-log10 adjusted P value; higher means stronger statistical evidence.' },
      heatmap: { name: 'Heatmap', use: 'Show a numeric matrix such as scaled expression values across genes and samples or conditions.', xMeaning: 'Samples, conditions, or features across columns.', yMeaning: 'Rows/groups such as genes, pathways, or markers; color encodes the numeric value.' }
    };
    const example = this.rSyncService.getPlotExample(type);
    this.plotHelp = { type, ...copy[type], ...example };
  }

  closePlotHelp() { this.plotHelp = null; }

  loadHelpExample() {
    if (!this.plotHelp) return;
    this.rSyncService.loadPlotExample(this.plotHelp.type);
    this.closePlotHelp();
  }

  downloadHelpExample() {
    if (!this.plotHelp) return;
    const worksheet = XLSX.utils.json_to_sheet(this.plotHelp.rows, { header: this.plotHelp.columns });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Example data');
    XLSX.writeFile(workbook, `${this.plotHelp.type}-plot-example.xlsx`);
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
    this.scheduleExactPreview();
  }

  toggleInspector() {
    this.showInspector = !this.showInspector;
    if (this.showInspector) this.scheduleExactPreview();
  }

  /** The modal deliberately shows a clone of the rendered production SVG.
   * This avoids a second, slightly different preview layout engine. */
  private scheduleExactPreview() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const source = this.plotSvg?.nativeElement;
      if (!source) return;
      const clone = source.cloneNode(true) as SVGElement;
      clone.classList.remove('paper-svg');
      clone.classList.add('customize-preview-svg');
      clone.querySelectorAll('.selection-box, .resize-handle').forEach(element => element.remove());
      const originalGradientId = 'heatmap-value-scale';
      const previewGradientId = 'customize-heatmap-value-scale';
      clone.querySelectorAll(`[id="${originalGradientId}"]`).forEach(element => element.setAttribute('id', previewGradientId));
      clone.querySelectorAll(`[fill="url(#${originalGradientId})"]`).forEach(element => element.setAttribute('fill', `url(#${previewGradientId})`));
      this.previewSvgMarkup = this.sanitizer.bypassSecurityTrustHtml(clone.outerHTML);
    }));
  }

  updatePlotAt(idx: number, partial: Partial<PlotState>) {
    const list = [...this.plots];
    if (list[idx]) {
      list[idx] = { ...list[idx], ...partial };
      this.rSyncService.setPlots(list);
    }
  }

  applyPublicationPreset(preset: string) {
    const presets: Record<string, Partial<PlotState>> = {
      'journal-single': { figureWidthIn: 3.5, figureHeightIn: 2.7, exportDpi: 600 },
      'journal-double': { figureWidthIn: 7.2, figureHeightIn: 4.8, exportDpi: 600 },
      square: { figureWidthIn: 5, figureHeightIn: 5, exportDpi: 300 },
      slide: { figureWidthIn: 10, figureHeightIn: 5.625, exportDpi: 300 }
    };
    if (presets[preset]) this.updateActiveState(presets[preset]);
  }

  get palettePreset(): string {
    const palette = (this.activePlot?.palette || []).map(color => color.toLowerCase()).join(',');
    if (palette === ['#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'].join(',')) return 'publication';
    if (palette === ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9'].join(',')) return 'colorblind';
    if (palette === ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'].join(',')) return 'viridis';
    if (palette === ['#111827', '#4b5563', '#9ca3af', '#d1d5db', '#e5e7eb'].join(',')) return 'mono';
    return 'custom';
  }

  applyPalette(preset: string) {
    const palettes: Record<string, string[]> = {
      publication: ['#2563EB', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'],
      colorblind: ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9'],
      viridis: ['#440154', '#3B528B', '#21918C', '#5EC962', '#FDE725'],
      mono: ['#111827', '#4B5563', '#9CA3AF', '#D1D5DB', '#E5E7EB']
    };
    if (palettes[preset]) this.updateActiveState({ palette: palettes[preset] });
  }

  updatePaletteColor(index: number, color: string) {
    const palette = [...(this.activePlot.palette || [])];
    palette[index] = color;
    this.updateActiveState({ palette });
  }

  getThemeBg(): string {
    if (this.activePlot?.theme === 'dark') return '#0f172a';
    if (this.activePlot?.background === 'transparent') return 'transparent';
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

  openInlineEditor(field: 'title' | 'subtitle' | 'xLabel' | 'yLabel' | 'legendTitle' | 'figureTag', label: string, currentVal: string) {
    this.textEditor = {
      isOpen: true,
      field,
      label,
      value: currentVal || ''
    };
  }

  onEditableClick(field: 'title' | 'subtitle' | 'xLabel' | 'yLabel' | 'legendTitle' | 'figureTag', label: string, currentVal: string) {
    if (this.suppressEditorClick) {
      this.suppressEditorClick = false;
      return;
    }
    this.openInlineEditor(field, label, currentVal);
  }

  beginElementDrag(element: DraggableElement, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.selectedElement = element;
    this.elementDrag = { element, mode: 'move', x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, startSize: this.elementFontSize(element) };
  }

  beginElementResize(element: DraggableElement, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.selectedElement = element;
    this.elementDrag = { element, mode: 'resize', x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, startSize: this.elementFontSize(element) };
  }

  private elementFontSize(element: DraggableElement): number {
    if (element === 'title') return this.activePlot.fontSizeTitle || 16;
    if (element === 'subtitle') return this.subtitleFontSize;
    if (element === 'tag') return this.activePlot.fontSizeTag || 18;
    if (element === 'legend') return this.activePlot.fontSizeLegend || 11;
    return element === 'xLabel' ? this.xLabelFontSize : this.yLabelFontSize;
  }

  get selectedElementLabel(): string {
    const labels: Record<DraggableElement, string> = {
      tag: 'Figure tag',
      title: 'Title',
      subtitle: 'Subtitle',
      xLabel: 'X-axis label',
      yLabel: 'Y-axis label',
      legend: 'Legend'
    };
    return this.selectedElement ? labels[this.selectedElement] : '';
  }

  nudgeSelected(dx: number, dy: number) {
    const element = this.selectedElement;
    if (!element) return;
    if (element === 'tag') {
      this.updateActiveState({ tagOffsetX: (this.activePlot.tagOffsetX || 0) + dx, tagOffsetY: (this.activePlot.tagOffsetY || 0) + dy });
    } else if (element === 'title') {
      this.updateActiveState({ titleOffsetX: (this.activePlot.titleOffsetX || 0) + dx, titleOffsetY: (this.activePlot.titleOffsetY || 0) + dy });
    } else if (element === 'subtitle') {
      this.updateActiveState({ subtitleOffsetX: (this.activePlot.subtitleOffsetX || 0) + dx, subtitleOffsetY: (this.activePlot.subtitleOffsetY || 0) + dy });
    } else if (element === 'legend') {
      this.updateActiveState({ legendOffsetX: (this.activePlot.legendOffsetX || 0) + dx, legendOffsetY: (this.activePlot.legendOffsetY || 0) + dy });
    } else if (element === 'xLabel') {
      this.updateActiveState({ xLabelOffsetX: (this.activePlot.xLabelOffsetX ?? this.activePlot.xLabelOffset ?? 0) + dx, xLabelOffsetY: (this.activePlot.xLabelOffsetY || 0) + dy });
    } else {
      this.updateActiveState({ yLabelOffsetX: (this.activePlot.yLabelOffsetX ?? this.activePlot.yLabelOffset ?? 0) + dx, yLabelOffsetY: (this.activePlot.yLabelOffsetY || 0) + dy });
    }
  }

  resizeSelected(delta: number) {
    const element = this.selectedElement;
    if (!element) return;
    const next = this.elementFontSize(element) + delta;
    if (element === 'title') {
      this.updateActiveState({ fontSizeTitle: Math.max(10, Math.min(42, next)) });
    } else if (element === 'subtitle') {
      this.updateActiveState({ fontSizeSubtitle: Math.max(8, Math.min(34, next)) });
    } else if (element === 'tag') {
      this.updateActiveState({ fontSizeTag: Math.max(8, Math.min(34, next)) });
    } else if (element === 'legend') {
      this.updateActiveState({ fontSizeLegend: Math.max(8, Math.min(28, next)) });
    } else if (element === 'xLabel') {
      this.updateActiveState({ fontSizeXAxis: Math.max(8, Math.min(28, next)) });
    } else {
      this.updateActiveState({ fontSizeYAxis: Math.max(8, Math.min(28, next)) });
    }
  }

  textHandleWidth(text: string, fontSize: number): number {
    // Latin glyphs are roughly 0.6em wide; CJK/Korean glyphs are close to a
    // full em.  This keeps the selection frame and handle aligned for both.
    const size = Math.max(9, fontSize);
    const width = Array.from(String(text || '')).reduce((sum, character) => {
      return sum + size * (character.charCodeAt(0) > 0x7f ? 1.02 : 0.6);
    }, 0);
    return Math.max(12, width + 12);
  }

  get subtitleFontSize(): number {
    return this.activePlot?.fontSizeSubtitle || Math.round((this.activePlot?.fontSizeTitle || 16) * 0.75);
  }

  get xLabelFontSize(): number {
    return this.activePlot?.fontSizeXAxis || this.activePlot?.fontSizeAxis || 12;
  }

  get yLabelFontSize(): number {
    return this.activePlot?.fontSizeYAxis || this.activePlot?.fontSizeAxis || 12;
  }

  get minorGridYs(): number[] {
    if (!this.activePlot?.showMinorGrid || this.yTicks.length < 2) return [];
    return this.yTicks.slice(0, -1).map((tick, index) => (tick.y + this.yTicks[index + 1].y) / 2);
  }

  get canUseErrorBars(): boolean {
    // Error bars need an assigned numeric error column and are only rendered
    // by the summary-style plots that support them in the canvas/R script.
    return !!this.activePlot?.errorColumn
      && this.activePlot.chartType === 'bar';
  }

  get hasPlotMarkControls(): boolean {
    return ['bar', 'boxplot', 'scatter', 'line', 'dotplot', 'violin', 'density', 'histogram', 'volcano', 'heatmap'].includes(this.activePlot?.chartType);
  }

  get hasAxisControls(): boolean {
    return this.canRotateXAxis || this.canSetYAxisRange;
  }

  get canRotateXAxis(): boolean {
    return ['bar', 'line', 'boxplot', 'violin', 'dotplot'].includes(this.activePlot?.chartType);
  }

  get canSetYAxisRange(): boolean {
    return ['bar', 'line', 'scatter', 'boxplot', 'violin', 'dotplot', 'volcano'].includes(this.activePlot?.chartType);
  }

  get canUseGridControls(): boolean {
    return this.activePlot?.chartType !== 'heatmap';
  }

  get volcanoThresholdX(): number { return Math.abs(Number(this.activePlot?.thresholdX) || 1); }
  get volcanoThresholdY(): number { return Math.abs(Number(this.activePlot?.thresholdY) || 1.3); }

  volcanoX(value: number): number {
    return Math.max(this.margin.left, Math.min(this.margin.left + this.plotWidth, this.valueToX(value)));
  }

  volcanoY(value: number): number {
    return Math.max(this.margin.top, Math.min(this.svgHeight - this.margin.bottom, this.valueToY(value)));
  }

  volcanoIsSignificant(item: any): boolean {
    return Math.abs(Number(item?.xValue)) >= this.volcanoThresholdX && Number(item?.yValue) >= this.volcanoThresholdY;
  }

  volcanoPointColor(item: any): string {
    return this.volcanoIsSignificant(item) ? '#DC2626' : '#B8C0CC';
  }

  get isSingleVariablePlotHelp(): boolean {
    return this.plotHelp?.type === 'histogram' || this.plotHelp?.type === 'density';
  }

  get xLabelX(): number {
    return this.margin.left + (this.plotWidth / 2) + (this.activePlot?.xLabelOffsetX ?? this.activePlot?.xLabelOffset ?? 0);
  }

  get xLabelY(): number {
    return this.svgHeight - 12 + (this.activePlot?.xLabelOffsetY || 0);
  }

  get yLabelLocalX(): number {
    // The local x axis becomes screen Y after rotate(-90), so invert screen Y.
    return -(this.margin.top + (this.plotHeight / 2)) - (this.activePlot?.yLabelOffsetY || 0);
  }

  get yLabelLocalY(): number {
    // The local y axis becomes screen X after rotate(-90).
    return Math.max(14, this.margin.left - 45) + (this.activePlot?.yLabelOffsetX ?? this.activePlot?.yLabelOffset ?? 0);
  }

  get legendBounds(): { x: number; y: number; width: number; height: number } {
    const x = this.legendX + (this.activePlot?.legendOffsetX || 0) - 7;
    const y = this.legendY + (this.activePlot?.legendOffsetY || 0) - (this.activePlot?.fontSizeLegend || 11) - 4;
    const horizontal = this.activePlot?.legendPosition === 'top' || this.activePlot?.legendPosition === 'bottom';
    const titleWidth = this.textHandleWidth(this.activePlot?.legendTitle || 'Legend', this.activePlot?.fontSizeLegend || 11);
    const rowWidth = Math.max(0, ...this.legendItems.map(item => (20 * this.legendScale) + this.textHandleWidth(item.label, (this.activePlot?.fontSizeLegend || 11) * 0.9)));
    const width = horizontal ? Math.max(titleWidth, 20, this.legendItems.length * 110 * this.legendScale) : Math.max(titleWidth, rowWidth) + 10;
    const height = horizontal ? Math.max(30, 26 * this.legendScale) : Math.max(28, (18 + this.legendItems.length * 20) * this.legendScale);
    return { x, y, width, height };
  }

  get legendScale(): number {
    return Math.max(0.7, Math.min(2.55, (this.activePlot?.fontSizeLegend || 11) / 11));
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

    // Keep the on-screen artboard in the same aspect ratio as the exported R figure.
    this.svgHeight = Math.max(300, Math.min(760, Math.round(this.svgWidth * this.figureHeightIn / this.figureWidthIn)));

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
    const densityValues = s.chartType === 'density'
      ? activeData.map(row => Number(row[xCol])).filter(value => Number.isFinite(value))
      : [];

    // 1. Calculate Y Min / Max & Ticks
    let maxVal = Number.NEGATIVE_INFINITY;
    let minVal = Number.POSITIVE_INFINITY;
    activeData.forEach(r => {
      const v = Number(r[yCol]) || 0;
      const err = errCol ? (Number(r[errCol]) || 0) : 0;
      if (v + err > maxVal) maxVal = v + err;
      if (v - err < minVal) minVal = v - err;
    });
    if (s.chartType === 'density' && densityValues.length) {
      const rawMin = Math.min(...densityValues);
      const rawMax = Math.max(...densityValues);
      const span = Math.max(0.00001, rawMax - rawMin);
      const bandwidth = Math.max(0.00001, (span * 1.12) / 12);
      const densityPeak = Math.max(...Array.from({ length: 48 }, (_, index) => {
        const value = rawMin - (span * 0.06) + ((span * 1.12) * index / 47);
        return densityValues.reduce((sum, current) => sum + Math.exp(-0.5 * Math.pow((value - current) / bandwidth, 2)), 0) / densityValues.length;
      }));
      minVal = 0;
      maxVal = Math.max(0.01, densityPeak);
    }
    if (!Number.isFinite(maxVal) || maxVal === 0) maxVal = 10;
    if (!Number.isFinite(minVal)) minVal = 0;

    const defaultFloor = s.chartType === 'bar' ? 0 : Math.min(0, Math.floor(minVal * 1.08));
    this.yDomainMin = s.yMin === null || s.yMin === undefined ? defaultFloor : Number(s.yMin);
    this.yDomainMax = s.yMax === null || s.yMax === undefined ? Math.ceil(maxVal * 1.15) : Number(s.yMax);
    if (this.yDomainMax <= this.yDomainMin) this.yDomainMax = this.yDomainMin + 1;
    const yRange = this.yDomainMax - this.yDomainMin;
    const tickCount = 5;
    this.yTicks = [];
    for (let i = 0; i <= tickCount; i++) {
      const val = Math.round((this.yDomainMin + ((yRange / tickCount) * i)) * 100) / 100;
      this.yTicks.push({ val, y: 0 });
    }

    // 2. Dynamic Left Margin
    const maxYStrLen = Math.max(...this.yTicks.map(t => String(t.val).length), 1);
    const baseLeftMargin = Math.max(65, maxYStrLen * 8.5 + 25);

    // 3. Collision-free Header Coordinates
    const hasTag = !!s.figureTag && s.figureTag.trim() !== '';
    const hasSubtitle = !!s.subtitle && s.subtitle.trim() !== '';
    this.tagX = 18;
    this.titleX = hasTag ? this.tagX + this.textHandleWidth(s.figureTag, s.fontSizeTag || 18) + 10 : 18;
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
    // A heatmap has a numeric fill scale, even when the categorical legend is hidden.
    if (s.chartType === 'heatmap') this.margin.right = Math.max(this.margin.right, 112);

    // Recompute tick Y positions
    this.yTicks.forEach(t => {
      t.y = this.valueToY(t.val);
    });

    // 4. Groups & Categories. Scatter, volcano and distribution plots need a
    // continuous X scale when the selected spreadsheet column is numeric.
    const xValues = activeData.map(r => Number(r[xCol]));
    this.continuousX = ['scatter', 'volcano', 'histogram', 'density'].includes(s.chartType)
      && xValues.length > 0 && xValues.every(value => Number.isFinite(value));
    if (this.continuousX) {
      const rawMin = Math.min(...xValues);
      const rawMax = Math.max(...xValues);
      const padding = rawMax === rawMin ? 1 : (rawMax - rawMin) * 0.06;
      this.xDomainMin = rawMin - padding;
      this.xDomainMax = rawMax + padding;
    }
    const xCategories = Array.from(new Set(activeData.map(r => String(r[xCol] ?? '')))).filter(c => c.trim() !== '');
    const groups = grpCol ? Array.from(new Set(activeData.map(r => String(r[grpCol] ?? '')))).filter(g => g.trim() !== '') : ['Default'];

    let palette = s.palette && s.palette.length > 0
      ? s.palette
      : ['#2563EB', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'];

    if (s.theme === 'bw') {
      palette = ['#1F2937', '#4B5563', '#9CA3AF', '#D1D5DB', '#E5E7EB'];
    }

    this.legendItems = s.chartType === 'heatmap' ? [] : groups.map((g, idx) => ({
      label: g,
      color: palette[idx % palette.length]
    }));

    const numCategories = Math.max(1, xCategories.length);
    const categoryWidth = this.plotWidth / numCategories;
    this.chartGroups = this.continuousX
      ? Array.from({ length: 6 }, (_, index) => {
          const value = this.xDomainMin + ((this.xDomainMax - this.xDomainMin) * index / 5);
          return { label: Number(value.toFixed(2)).toString(), x: this.valueToX(value) };
        })
      : xCategories.map((cat, idx) => ({
          label: cat,
          x: this.margin.left + (idx * categoryWidth) + (categoryWidth / 2)
        }));

    this.renderItems = [];
    this.lineSeries = [];
    this.heatmapRows = [];

    if (s.chartType === 'bar') {
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

            const height = Math.max(0, this.valueToY(this.yDomainMin) - this.valueToY(val));
            const x = startX + (gIdx * subBarWidth);
            const y = this.valueToY(val);
            const centerX = x + (subBarWidth / 2);
            const color = palette[gIdx % palette.length];

            let errYMin: number | undefined = undefined;
            let errYMax: number | undefined = undefined;
            if (err > 0 && s.showErrorBars) {
              errYMin = Math.max(this.margin.top, this.valueToY(val + err));
              errYMax = Math.min(this.svgHeight - this.margin.bottom, this.valueToY(Math.max(this.yDomainMin, val - err)));
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
          const height = Math.max(0, this.valueToY(this.yDomainMin) - this.valueToY(val));
          const y = this.valueToY(val);

          let errYMin: number | undefined = undefined;
          let errYMax: number | undefined = undefined;
          if (err > 0 && s.showErrorBars) {
            errYMin = Math.max(this.margin.top, this.valueToY(val + err));
            errYMax = Math.min(this.svgHeight - this.margin.bottom, this.valueToY(Math.max(this.yDomainMin, val - err)));
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
        const width = Math.max(8, (categoryWidth * s.barWidth) / Math.max(1, boxGroups.length));
        boxGroups.forEach((group, groupIndex) => {
          const values = activeData
            .filter(row => String(row[xCol]) === category && (!grpCol || String(row[grpCol]) === group))
            .map(row => Number(row[yCol]))
            .filter(value => Number.isFinite(value))
            .sort((a, b) => a - b);
          if (!values.length) return;
          const q1 = quantile(values, .25);
          const median = quantile(values, .5);
          const q3 = quantile(values, .75);
          const x = center - ((width * boxGroups.length) / 2) + (groupIndex * width);
          const y = this.valueToY(q3);
          this.renderItems.push({
            x, y, width: Math.max(6, width - 2), height: Math.max(1, this.valueToY(q1) - y),
            centerX: x + ((Math.max(6, width - 2)) / 2), medianY: this.valueToY(median),
            whiskerHighY: this.valueToY(values[values.length - 1]), whiskerLowY: this.valueToY(values[0]),
            color: palette[groupIndex % palette.length]
          });
        });
      });
    } else if (s.chartType === 'violin') {
      xCategories.forEach((cat, xIdx) => {
        const values = activeData.filter(row => String(row[xCol]) === cat).map(row => Number(row[yCol])).filter(value => Number.isFinite(value)).sort((a, b) => a - b);
        if (!values.length) return;
        const centerX = this.margin.left + (xIdx * categoryWidth) + (categoryWidth / 2);
        const topY = this.valueToY(values[values.length - 1]);
        const bottomY = this.valueToY(values[0]);
        const medianY = this.valueToY(values[Math.floor(values.length / 2)]);
        const width = Math.min(92, categoryWidth * Math.max(0.25, s.barWidth));
        this.renderItems.push({
          centerX, centerY: (topY + bottomY) / 2, width, height: Math.max(18, bottomY - topY), medianY,
          color: palette[xIdx % palette.length],
          points: values.map((value, index) => ({ x: centerX + ((index % 3) - 1) * 8, y: this.valueToY(value) }))
        });
      });
    } else if (s.chartType === 'scatter' || s.chartType === 'dotplot' || s.chartType === 'volcano') {
      activeData.forEach(r => {
        const catIndex = xCategories.indexOf(String(r[xCol]));
        const numericX = Number(r[xCol]);
        const dotJitter = s.chartType === 'dotplot' ? ((Math.random() - 0.5) * Math.min(18, categoryWidth * 0.25)) : 0;
        const catCenterX = this.continuousX && Number.isFinite(numericX)
          ? this.valueToX(numericX)
          : (catIndex >= 0 ? this.margin.left + (catIndex * categoryWidth) + (categoryWidth / 2) + dotJitter : this.margin.left);

        const val = Number(r[yCol]) || 0;
        const y = this.valueToY(val);
        const gIdx = grpCol ? groups.indexOf(String(r[grpCol])) : 0;
        const color = palette[Math.max(0, gIdx) % palette.length];

        this.renderItems.push({ centerX: catCenterX, y, color, xValue: numericX, yValue: val, label: s.chartType === 'volcano' && s.labelColumn ? String(r[s.labelColumn] ?? '') : '' });
      });
    } else if (s.chartType === 'line' || s.chartType === 'density') {
      if (s.chartType === 'density') {
        const values = densityValues;
        const bins = Math.max(20, Math.min(70, Number(s.binCount) || 35));
        const span = Math.max(0.00001, this.xDomainMax - this.xDomainMin);
        const bandwidth = span / 12;
        const points = Array.from({ length: bins }, (_, index) => {
          const value = this.xDomainMin + (span * index / (bins - 1));
          const density = values.reduce((sum, current) => sum + Math.exp(-0.5 * Math.pow((value - current) / bandwidth, 2)), 0) / Math.max(1, values.length);
          return { x: this.valueToX(value), y: this.valueToY(density) };
        });
        this.lineSeries.push({ color: palette[0], pointsStr: points.map(point => `${point.x},${point.y}`).join(' '), points });
        return;
      }
      groups.forEach((g, gIdx) => {
        const color = palette[gIdx % palette.length];
        const points: Array<{ x: number; y: number }> = [];

        xCategories.forEach((cat, xIdx) => {
          const catCenterX = this.margin.left + (xIdx * categoryWidth) + (categoryWidth / 2);
          const row = activeData.find(r => String(r[xCol]) === cat && (!grpCol || String(r[grpCol]) === g));
          if (row) {
            const val = Number(row[yCol]) || 0;
            const y = this.valueToY(val);
            points.push({ x: catCenterX, y });
          }
        });

        const pointsStr = points.map(pt => `${pt.x},${pt.y}`).join(' ');
        this.lineSeries.push({ color, pointsStr, points });
      });
    } else if (s.chartType === 'histogram') {
      const values = activeData.map(row => Number(row[xCol])).filter(value => Number.isFinite(value));
      const bins = Math.max(5, Math.min(80, Number(s.binCount) || 30));
      const span = Math.max(0.00001, this.xDomainMax - this.xDomainMin);
      const binWidth = span / bins;
      const counts = Array.from({ length: bins }, () => 0);
      values.forEach(value => {
        const index = Math.max(0, Math.min(bins - 1, Math.floor((value - this.xDomainMin) / binWidth)));
        counts[index]++;
      });
      const maxCount = Math.max(1, ...counts);
      this.yDomainMin = 0;
      this.yDomainMax = Math.max(1, maxCount * 1.15);
      this.yTicks = Array.from({ length: 6 }, (_, index) => {
        const val = Math.round((this.yDomainMax * index / 5) * 100) / 100;
        return { val, y: this.valueToY(val) };
      });
      counts.forEach((count, index) => {
        const leftValue = this.xDomainMin + (index * binWidth);
        const rightValue = leftValue + binWidth;
        const x = this.valueToX(leftValue) + 1;
        const width = Math.max(1, this.valueToX(rightValue) - this.valueToX(leftValue) - 2);
        const y = this.valueToY(count);
        this.renderItems.push({ x, y, width, height: this.valueToY(0) - y, centerX: x + width / 2, color: palette[0] });
      });
    } else if (s.chartType === 'heatmap') {
      const rowGroups = grpCol ? groups : ['Value'];
      const values = activeData.map(row => Number(row[yCol])).filter(value => Number.isFinite(value));
      const rawMin = values.length ? Math.min(...values) : 0;
      const rawMax = values.length ? Math.max(...values) : 1;
      const diverging = rawMin < 0 && rawMax > 0;
      const min = diverging ? Math.min(rawMin, 0) : rawMin;
      const max = diverging ? Math.max(rawMax, 0) : rawMax;
      const cellHeight = this.plotHeight / Math.max(1, rowGroups.length);
      this.heatmapRows = rowGroups.map((label, index) => ({ label, y: this.margin.top + ((index + 0.5) * cellHeight) }));
      this.heatmapColorMin = min;
      this.heatmapColorMax = max;
      this.heatmapIsDiverging = diverging;
      this.heatmapPalette = [...palette];
      xCategories.forEach((category, xIndex) => {
        rowGroups.forEach((group, groupIndex) => {
          const row = activeData.find(candidate => String(candidate[xCol]) === category && (!grpCol || String(candidate[grpCol]) === group));
          if (!row) return;
          const value = Number(row[yCol]) || 0;
          this.renderItems.push({
            x: this.margin.left + xIndex * categoryWidth,
            y: this.margin.top + groupIndex * cellHeight,
            width: categoryWidth,
            height: cellHeight,
            value,
            color: this.heatColor(value, min, max, palette)
          });
        });
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

  clearSelectionIfBackground(event: MouseEvent) {
    const target = event.target as Element;
    // Text/legend selection lives inside a draggable group.  Everything else
    // on the paper behaves as a neutral background and clears the selection.
    if (target.closest('.draggable-element') || target.closest('.inline-editor-popover')) return;
    this.selectedElement = null;
  }

  onPan(event: MouseEvent) {
    if (this.elementDrag) {
      const drag = this.elementDrag;
      const svgEl = this.plotSvg?.nativeElement;
      const rect = svgEl?.getBoundingClientRect();
      const scaleX = rect ? this.svgWidth / Math.max(1, rect.width) : 1;
      const scaleY = rect ? this.svgHeight / Math.max(1, rect.height) : 1;
      const dx = (event.clientX - drag.x) * scaleX;
      const dy = (event.clientY - drag.y) * scaleY;
      drag.x = event.clientX;
      drag.y = event.clientY;
      this.suppressEditorClick = true;

      if (drag.mode === 'resize') {
        // Calculate from the original pointer/size, not the last re-rendered
        // handle position. This prevents jitter and compounding size jumps.
        const totalDx = (event.clientX - drag.startX) * scaleX;
        const totalDy = (event.clientY - drag.startY) * scaleY;
        // All handles sit at the visible lower-right corner.  For the rotated
        // Y label that direction is right/up in screen space, hence dx - dy.
        const amount = (drag.element === 'yLabel' ? totalDx - totalDy : totalDx + totalDy) / 16;
        if (drag.element === 'title') {
          this.updateActiveState({ fontSizeTitle: Math.max(10, Math.min(42, Math.round(drag.startSize + amount))) });
        } else if (drag.element === 'subtitle') {
          this.updateActiveState({ fontSizeSubtitle: Math.max(8, Math.min(34, Math.round(drag.startSize + amount))) });
        } else if (drag.element === 'tag') {
          this.updateActiveState({ fontSizeTag: Math.max(8, Math.min(34, Math.round(drag.startSize + amount))) });
        } else if (drag.element === 'legend') {
          this.updateActiveState({ fontSizeLegend: Math.max(8, Math.min(28, Math.round(drag.startSize + amount))) });
        } else if (drag.element === 'xLabel') {
          this.updateActiveState({ fontSizeXAxis: Math.max(8, Math.min(28, Math.round(drag.startSize + amount))) });
        } else {
          this.updateActiveState({ fontSizeYAxis: Math.max(8, Math.min(28, Math.round(drag.startSize + amount))) });
        }
        return;
      }

      if (drag.element === 'tag') {
        this.updateActiveState({ tagOffsetX: (this.activePlot.tagOffsetX || 0) + dx, tagOffsetY: (this.activePlot.tagOffsetY || 0) + dy });
      } else if (drag.element === 'title') {
        this.updateActiveState({ titleOffsetX: (this.activePlot.titleOffsetX || 0) + dx, titleOffsetY: (this.activePlot.titleOffsetY || 0) + dy });
      } else if (drag.element === 'subtitle') {
        this.updateActiveState({ subtitleOffsetX: (this.activePlot.subtitleOffsetX || 0) + dx, subtitleOffsetY: (this.activePlot.subtitleOffsetY || 0) + dy });
      } else if (drag.element === 'legend') {
        this.updateActiveState({ legendOffsetX: (this.activePlot.legendOffsetX || 0) + dx, legendOffsetY: (this.activePlot.legendOffsetY || 0) + dy });
      } else if (drag.element === 'xLabel') {
        this.updateActiveState({ xLabelOffsetX: (this.activePlot.xLabelOffsetX ?? this.activePlot.xLabelOffset ?? 0) + dx, xLabelOffsetY: (this.activePlot.xLabelOffsetY || 0) + dy });
      } else {
        this.updateActiveState({ yLabelOffsetX: (this.activePlot.yLabelOffsetX ?? this.activePlot.yLabelOffset ?? 0) + dx, yLabelOffsetY: (this.activePlot.yLabelOffsetY || 0) + dy });
      }
      return;
    }
    if (!this.isPanning) return;
    this.panX = event.clientX - this.panStartX;
    this.panY = event.clientY - this.panStartY;
  }

  endPan() {
    if (this.elementDrag) {
      this.elementDrag = null;
      return;
    }
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
      const outputWidth = Math.round(this.figureWidthIn * this.exportDpi);
      const outputHeight = Math.round(this.figureHeightIn * this.exportDpi);
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(image, 0, 0, outputWidth, outputHeight);
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'in',
          format: [this.figureWidthIn, this.figureHeightIn]
        });
        pdf.addImage(imgData, 'PNG', 0, 0, this.figureWidthIn, this.figureHeightIn);
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
      canvas.width = Math.round(this.figureWidthIn * this.exportDpi);
      canvas.height = Math.round(this.figureHeightIn * this.exportDpi);
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
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
