import { Component, OnInit, ElementRef, ViewChild, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// Ensure local worker is configured
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

export type ToolType = 'select' | 'text' | 'pen' | 'highlight' | 'rect' | 'circle' | 'line' | 'arrow' | 'whiteout' | 'image' | 'signature';

export interface Point {
  x: number;
  y: number;
}

export interface AnnotationItem {
  id: string;
  type: ToolType;
  x: number;          // relative 0..1 percentage or normalized coordinate
  y: number;
  width: number;
  height: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  backgroundColor?: string;
  points?: Point[];
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  fillColor?: string;
  fillOpacity?: number;
  imageUrl?: string;
}

export interface PdfPageItem {
  id: string;
  originalPageIndex: number;
  displayNumber: number;
  rotation: number;
  thumbnailUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
  annotations: AnnotationItem[];
  isCustomBlank?: boolean;
}

@Component({
  selector: 'app-pdf-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pdf-editor.component.html',
  styleUrl: './pdf-editor.component.css'
})
export class PdfEditorComponent implements OnInit {
  @ViewChild('pageCanvas') pageCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('annotationCanvas') annotationCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('imageInput') imageInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('signatureCanvas') signatureCanvasRef!: ElementRef<HTMLCanvasElement>;

  // Document State
  fileName: string = 'Untitled.pdf';
  pages: PdfPageItem[] = [];
  activePageIndex: number = 0;
  activeMode: 'view' | 'edit' = 'edit';
  isLoading: boolean = false;
  isExporting: boolean = false;
  loadingMessage: string = '';

  // Original PDF bytes
  private originalPdfBytes: ArrayBuffer | null = null;
  private pdfJsDoc: any = null;

  // View / Edit Settings
  zoom: number = 1.0;
  activeTool: ToolType = 'select';
  strokeColor: string = '#2563eb';
  fillColor: string = '#3b82f6';
  strokeWidth: number = 3;
  fontSize: number = 18;
  fontFamily: string = 'Inter, sans-serif';
  textColor: string = '#0f172a';

  // Selection & Annotation State
  selectedAnnotationId: string | null = null;
  isDrawing: boolean = false;
  currentPoints: Point[] = [];
  drawStartX: number = 0;
  drawStartY: number = 0;
  previewShape: AnnotationItem | null = null;

  // Drag & Drop Reordering State
  draggedPageIndex: number | null = null;
  dragOverPageIndex: number | null = null;

  // Signature Modal
  showSignatureModal: boolean = false;
  private isSigning: boolean = false;

  // Undo / Redo History
  private history: string[] = [];
  private historyIndex: number = -1;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    // Start with a clean sample document if no file loaded
    this.loadSampleDocument();
  }

  get activePage(): PdfPageItem | undefined {
    return this.pages[this.activePageIndex];
  }

  get selectedAnnotation(): AnnotationItem | undefined {
    if (!this.activePage || !this.selectedAnnotationId) return undefined;
    return this.activePage.annotations.find(a => a.id === this.selectedAnnotationId);
  }

  get canUndo(): boolean {
    return this.historyIndex > 0;
  }

  get canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // FILE LOADING & INITIALIZATION
  // ═════════════════════════════════════════════════════════════════════════════

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.fileName = file.name;
      const reader = new FileReader();
      reader.onload = async (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        if (buffer) {
          await this.loadPdfFromBuffer(buffer);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
      const file = event.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        this.fileName = file.name;
        const reader = new FileReader();
        reader.onload = async (e) => {
          const buffer = e.target?.result as ArrayBuffer;
          if (buffer) {
            await this.loadPdfFromBuffer(buffer);
          }
        };
        reader.readAsArrayBuffer(file);
      }
    }
  }

  onDragOverRoot(event: DragEvent) {
    event.preventDefault();
  }

  async loadPdfFromBuffer(buffer: ArrayBuffer) {
    this.isLoading = true;
    this.loadingMessage = 'Rendering PDF pages…';
    this.cdr.detectChanges();

    try {
      this.originalPdfBytes = buffer.slice(0);
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      this.pdfJsDoc = await loadingTask.promise;
      const numPages = this.pdfJsDoc.numPages;

      const newPages: PdfPageItem[] = [];
      for (let i = 1; i <= numPages; i++) {
        this.loadingMessage = `Rendering page ${i} of ${numPages}…`;
        this.cdr.detectChanges();

        const page = await this.pdfJsDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });

        // Generate thumbnail
        const thumbViewport = page.getViewport({ scale: 0.35 });
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = thumbViewport.width;
        thumbCanvas.height = thumbViewport.height;
        const thumbCtx = thumbCanvas.getContext('2d');
        if (thumbCtx) {
          await page.render({ canvasContext: thumbCtx, viewport: thumbViewport }).promise;
        }

        newPages.push({
          id: `page-${i}-${Date.now()}`,
          originalPageIndex: i - 1,
          displayNumber: i,
          rotation: 0,
          thumbnailUrl: thumbCanvas.toDataURL('image/jpeg', 0.8),
          width: viewport.width,
          height: viewport.height,
          aspectRatio: viewport.width / viewport.height,
          annotations: []
        });
      }

      this.pages = newPages;
      this.activePageIndex = 0;
      this.activeMode = 'edit';
      this.saveHistory();
      await this.renderActivePage();
    } catch (err: any) {
      console.error('Failed to load PDF:', err);
      alert('Could not open this PDF file. Please ensure it is a valid, unencrypted PDF.');
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async loadSampleDocument() {
    this.isLoading = true;
    this.loadingMessage = 'Generating sample research protocol…';
    this.cdr.detectChanges();

    try {
      // Create a clean 3-page research protocol PDF with pdf-lib
      const sampleDoc = await PDFDocument.create();

      // Page 1: Protocol Overview
      const page1 = sampleDoc.addPage([595, 842]); // A4
      const { width, height } = page1.getSize();

      // Page 2: Methods & Procedures
      const page2 = sampleDoc.addPage([595, 842]);

      // Page 3: Data & Results
      const page3 = sampleDoc.addPage([595, 842]);

      // We render crisp canvas representations for the sample
      const bytes = await sampleDoc.save();
      this.fileName = 'Sample_Research_Protocol.pdf';
      await this.loadPdfFromBuffer(bytes.buffer as ArrayBuffer);

      // Add sample annotations on page 1
      if (this.pages[0]) {
        this.pages[0].annotations.push({
          id: 'ann-title',
          type: 'text',
          x: 40,
          y: 60,
          width: 515,
          height: 50,
          text: 'CRISPR-Cas9 Editing Protocol v3.2',
          fontSize: 26,
          fontFamily: 'Inter, sans-serif',
          color: '#1e3a8a',
          bold: true
        });
        this.pages[0].annotations.push({
          id: 'ann-desc',
          type: 'text',
          x: 40,
          y: 120,
          width: 515,
          height: 60,
          text: 'Standard operating procedure for high-efficiency targeted gene cleavage in Arabidopsis thaliana cells. Read all safety precautions before starting.',
          fontSize: 14,
          fontFamily: 'Inter, sans-serif',
          color: '#475569'
        });
        this.pages[0].annotations.push({
          id: 'ann-badge',
          type: 'rect',
          x: 40,
          y: 200,
          width: 140,
          height: 32,
          strokeColor: '#16a34a',
          strokeWidth: 2,
          fillColor: '#dcfce7',
          fillOpacity: 0.8
        });
        this.pages[0].annotations.push({
          id: 'ann-badge-text',
          type: 'text',
          x: 48,
          y: 206,
          width: 124,
          height: 20,
          text: '✓ VERIFIED STEP',
          fontSize: 12,
          fontFamily: 'Inter, sans-serif',
          color: '#15803d',
          bold: true
        });
        await this.renderActivePage();
      }
    } catch (e) {
      console.error('Failed to create sample:', e);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async addBlankPage() {
    const newPage: PdfPageItem = {
      id: `page-blank-${Date.now()}`,
      originalPageIndex: -1,
      displayNumber: this.pages.length + 1,
      rotation: 0,
      thumbnailUrl: this.createBlankThumbnail(),
      width: 595, // Standard A4
      height: 842,
      aspectRatio: 595 / 842,
      annotations: [],
      isCustomBlank: true
    };
    this.pages.push(newPage);
    this.recalculateDisplayNumbers();
    this.saveHistory();
    this.selectPage(this.pages.length - 1);
  }

  private createBlankThumbnail(): string {
    const canvas = document.createElement('canvas');
    canvas.width = 150;
    canvas.height = 212;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 150, 212);
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(0, 0, 150, 212);
    }
    return canvas.toDataURL('image/jpeg');
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PAGE MANAGEMENT & REORDERING
  // ═════════════════════════════════════════════════════════════════════════════

  selectPage(index: number) {
    if (index < 0 || index >= this.pages.length) return;
    this.activePageIndex = index;
    this.selectedAnnotationId = null;
    this.renderActivePage();
  }

  openEditModeForPage(index: number) {
    this.selectPage(index);
    this.activeMode = 'edit';
  }

  recalculateDisplayNumbers() {
    this.pages.forEach((p, idx) => {
      p.displayNumber = idx + 1;
    });
  }

  rotatePage(index: number, angle: number = 90) {
    if (index < 0 || index >= this.pages.length) return;
    const page = this.pages[index];
    page.rotation = (page.rotation + angle) % 360;
    // Swap width & height if 90 or 270
    if (angle % 180 !== 0) {
      const temp = page.width;
      page.width = page.height;
      page.height = temp;
      page.aspectRatio = page.width / page.height;
    }
    this.saveHistory();
    this.renderActivePage();
  }

  duplicatePage(index: number) {
    if (index < 0 || index >= this.pages.length) return;
    const source = this.pages[index];
    const duplicated: PdfPageItem = {
      ...source,
      id: `page-dup-${Date.now()}`,
      annotations: JSON.parse(JSON.stringify(source.annotations))
    };
    this.pages.splice(index + 1, 0, duplicated);
    this.recalculateDisplayNumbers();
    this.saveHistory();
    this.selectPage(index + 1);
  }

  deletePage(index: number) {
    if (this.pages.length <= 1) {
      alert('The document must have at least one page.');
      return;
    }
    if (!confirm(`Delete page ${index + 1}?`)) return;
    this.pages.splice(index, 1);
    this.recalculateDisplayNumbers();
    if (this.activePageIndex >= this.pages.length) {
      this.activePageIndex = this.pages.length - 1;
    }
    this.saveHistory();
    this.renderActivePage();
  }

  movePageUp(index: number) {
    if (index <= 0) return;
    const temp = this.pages[index];
    this.pages[index] = this.pages[index - 1];
    this.pages[index - 1] = temp;
    this.recalculateDisplayNumbers();
    this.saveHistory();
    this.selectPage(index - 1);
  }

  movePageDown(index: number) {
    if (index >= this.pages.length - 1) return;
    const temp = this.pages[index];
    this.pages[index] = this.pages[index + 1];
    this.pages[index + 1] = temp;
    this.recalculateDisplayNumbers();
    this.saveHistory();
    this.selectPage(index + 1);
  }

  // HTML5 Drag & Drop reordering
  onDragStart(event: DragEvent, index: number) {
    this.draggedPageIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  onDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverPageIndex = index;
  }

  onDragLeave(index: number) {
    if (this.dragOverPageIndex === index) {
      this.dragOverPageIndex = null;
    }
  }

  onDrop(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    if (this.draggedPageIndex !== null && this.draggedPageIndex !== targetIndex) {
      const movedItem = this.pages.splice(this.draggedPageIndex, 1)[0];
      this.pages.splice(targetIndex, 0, movedItem);
      this.recalculateDisplayNumbers();
      this.saveHistory();
      this.selectPage(targetIndex);
    }
    this.draggedPageIndex = null;
    this.dragOverPageIndex = null;
  }

  onDragEnd() {
    this.draggedPageIndex = null;
    this.dragOverPageIndex = null;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // EDITING & ANNOTATION CANVAS
  // ═════════════════════════════════════════════════════════════════════════════

  setTool(tool: ToolType) {
    this.activeTool = tool;
    this.selectedAnnotationId = null;
    if (tool === 'image') {
      this.imageInputRef?.nativeElement.click();
    } else if (tool === 'signature') {
      this.openSignatureModal();
    }
  }

  setMode(mode: 'view' | 'edit') {
    this.activeMode = mode;
    if (mode === 'edit') {
      this.renderActivePage();
    }
  }

  setZoom(val: number) {
    this.zoom = Math.min(3.0, Math.max(0.4, val));
    this.renderActivePage();
  }

  async renderActivePage() {
    if (!this.activePage || !this.pageCanvasRef) return;

    const page = this.activePage;
    const canvas = this.pageCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions according to page and zoom
    const renderScale = 1.5; // High resolution
    const displayWidth = page.width * this.zoom;
    const displayHeight = page.height * this.zoom;

    canvas.width = page.width * renderScale;
    canvas.height = page.height * renderScale;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If blank page
    if (page.isCustomBlank || page.originalPageIndex < 0 || !this.pdfJsDoc) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      // Render base PDF page using pdfjs-dist
      try {
        const pdfPage = await this.pdfJsDoc.getPage(page.originalPageIndex + 1);
        const viewport = pdfPage.getViewport({
          scale: renderScale,
          rotation: page.rotation
        });
        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        console.warn('PDF.js render fallback:', err);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    this.renderAnnotationCanvas();
    this.cdr.detectChanges();
  }

  renderAnnotationCanvas() {
    if (!this.activePage || !this.annotationCanvasRef) return;
    const page = this.activePage;
    const canvas = this.annotationCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderScale = 1.5;
    canvas.width = page.width * renderScale;
    canvas.height = page.height * renderScale;
    canvas.style.width = `${page.width * this.zoom}px`;
    canvas.style.height = `${page.height * this.zoom}px`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(renderScale, renderScale);

    // Render annotations
    for (const ann of page.annotations) {
      this.drawSingleAnnotation(ctx, ann, ann.id === this.selectedAnnotationId);
    }

    // Render preview shape while drawing
    if (this.previewShape) {
      this.drawSingleAnnotation(ctx, this.previewShape, true);
    }

    ctx.restore();
  }

  private drawSingleAnnotation(ctx: CanvasRenderingContext2D, ann: AnnotationItem, isSelected: boolean) {
    ctx.save();

    if (ann.type === 'pen' || ann.type === 'highlight') {
      if (ann.points && ann.points.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = ann.strokeColor || '#2563eb';
        ctx.lineWidth = ann.strokeWidth || 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = ann.type === 'highlight' ? 0.35 : (ann.strokeOpacity || 1);

        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i].x, ann.points[i].y);
        }
        ctx.stroke();
      }
    } else if (ann.type === 'rect') {
      ctx.beginPath();
      ctx.rect(ann.x, ann.y, ann.width, ann.height);
      if (ann.fillColor) {
        ctx.fillStyle = ann.fillColor;
        ctx.globalAlpha = ann.fillOpacity || 0.2;
        ctx.fill();
      }
      ctx.globalAlpha = ann.strokeOpacity || 1;
      ctx.strokeStyle = ann.strokeColor || '#2563eb';
      ctx.lineWidth = ann.strokeWidth || 2;
      ctx.stroke();
    } else if (ann.type === 'circle') {
      ctx.beginPath();
      const radiusX = Math.abs(ann.width) / 2;
      const radiusY = Math.abs(ann.height) / 2;
      const centerX = ann.x + radiusX;
      const centerY = ann.y + radiusY;
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
      if (ann.fillColor) {
        ctx.fillStyle = ann.fillColor;
        ctx.globalAlpha = ann.fillOpacity || 0.2;
        ctx.fill();
      }
      ctx.globalAlpha = ann.strokeOpacity || 1;
      ctx.strokeStyle = ann.strokeColor || '#2563eb';
      ctx.lineWidth = ann.strokeWidth || 2;
      ctx.stroke();
    } else if (ann.type === 'line' || ann.type === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(ann.x, ann.y);
      ctx.lineTo(ann.x + ann.width, ann.y + ann.height);
      ctx.strokeStyle = ann.strokeColor || '#2563eb';
      ctx.lineWidth = ann.strokeWidth || 3;
      ctx.globalAlpha = ann.strokeOpacity || 1;
      ctx.stroke();

      if (ann.type === 'arrow') {
        const angle = Math.atan2(ann.height, ann.width);
        const headLen = 12;
        const endX = ann.x + ann.width;
        const endY = ann.y + ann.height;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = ann.strokeColor || '#2563eb';
        ctx.fill();
      }
    } else if (ann.type === 'whiteout') {
      // Solid white block
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
      ctx.setLineDash([]);
    } else if (ann.type === 'text') {
      if (ann.backgroundColor) {
        ctx.fillStyle = ann.backgroundColor;
        ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
      }
      ctx.font = `${ann.bold ? 'bold ' : ''}${ann.italic ? 'italic ' : ''}${ann.fontSize || 16}px ${ann.fontFamily || 'Inter, sans-serif'}`;
      ctx.fillStyle = ann.color || '#0f172a';
      ctx.textBaseline = 'top';

      // Multiline text wrapping
      const lines = (ann.text || '').split('\n');
      let currentY = ann.y + 4;
      const lineHeight = (ann.fontSize || 16) * 1.3;
      for (const line of lines) {
        ctx.fillText(line, ann.x + 4, currentY);
        currentY += lineHeight;
      }
    } else if (ann.type === 'image' && ann.imageUrl) {
      const img = new Image();
      img.src = ann.imageUrl;
      if (img.complete) {
        ctx.drawImage(img, ann.x, ann.y, ann.width, ann.height);
      } else {
        img.onload = () => this.renderAnnotationCanvas();
      }
    }

    // Selection border & handles
    if (isSelected) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      const padding = 3;
      ctx.strokeRect(ann.x - padding, ann.y - padding, ann.width + padding * 2, ann.height + padding * 2);
      ctx.setLineDash([]);

      // Corner resize handle
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(ann.x + ann.width - 4, ann.y + ann.height - 4, 8, 8);
    }

    ctx.restore();
  }

  // Pointer Canvas Interactions
  onPointerDownCanvas(event: PointerEvent) {
    if (!this.activePage) return;
    const coords = this.getCanvasCoords(event);

    if (this.activeTool === 'select') {
      // Check if clicking existing annotation
      const hit = this.findAnnotationAt(coords.x, coords.y);
      this.selectedAnnotationId = hit ? hit.id : null;
      if (hit) {
        this.isDrawing = true;
        this.drawStartX = coords.x - hit.x;
        this.drawStartY = coords.y - hit.y;
      }
      this.renderAnnotationCanvas();
      return;
    }

    this.isDrawing = true;
    this.drawStartX = coords.x;
    this.drawStartY = coords.y;

    if (this.activeTool === 'pen' || this.activeTool === 'highlight') {
      this.currentPoints = [{ x: coords.x, y: coords.y }];
      this.previewShape = {
        id: `ann-${Date.now()}`,
        type: this.activeTool,
        x: coords.x,
        y: coords.y,
        width: 0,
        height: 0,
        points: this.currentPoints,
        strokeColor: this.activeTool === 'highlight' ? '#fde047' : this.strokeColor,
        strokeWidth: this.activeTool === 'highlight' ? 18 : this.strokeWidth,
        strokeOpacity: this.activeTool === 'highlight' ? 0.4 : 1.0
      };
    } else if (this.activeTool === 'text') {
      const newText: AnnotationItem = {
        id: `ann-text-${Date.now()}`,
        type: 'text',
        x: coords.x,
        y: coords.y,
        width: 220,
        height: 42,
        text: 'Click here to edit text',
        fontSize: this.fontSize,
        fontFamily: this.fontFamily,
        color: this.textColor,
        bold: false
      };
      this.activePage.annotations.push(newText);
      this.selectedAnnotationId = newText.id;
      this.isDrawing = false;
      this.activeTool = 'select';
      this.saveHistory();
      this.renderAnnotationCanvas();
    } else if (['rect', 'circle', 'line', 'arrow', 'whiteout'].includes(this.activeTool)) {
      this.previewShape = {
        id: `ann-${Date.now()}`,
        type: this.activeTool,
        x: coords.x,
        y: coords.y,
        width: 1,
        height: 1,
        strokeColor: this.activeTool === 'whiteout' ? '#cbd5e1' : this.strokeColor,
        strokeWidth: this.activeTool === 'whiteout' ? 1 : this.strokeWidth,
        fillColor: this.activeTool === 'whiteout' ? '#ffffff' : this.fillColor,
        fillOpacity: this.activeTool === 'whiteout' ? 1.0 : 0.2
      };
    }
  }

  onPointerMoveCanvas(event: PointerEvent) {
    if (!this.isDrawing || !this.activePage) return;
    const coords = this.getCanvasCoords(event);

    if (this.activeTool === 'select' && this.selectedAnnotation) {
      // Dragging selected annotation
      this.selectedAnnotation.x = Math.max(0, coords.x - this.drawStartX);
      this.selectedAnnotation.y = Math.max(0, coords.y - this.drawStartY);
      this.renderAnnotationCanvas();
      return;
    }

    if (this.activeTool === 'pen' || this.activeTool === 'highlight') {
      this.currentPoints.push({ x: coords.x, y: coords.y });
      if (this.previewShape) {
        this.previewShape.points = [...this.currentPoints];
      }
      this.renderAnnotationCanvas();
    } else if (this.previewShape) {
      this.previewShape.width = coords.x - this.drawStartX;
      this.previewShape.height = coords.y - this.drawStartY;
      this.renderAnnotationCanvas();
    }
  }

  onPointerUpCanvas() {
    if (!this.isDrawing || !this.activePage) return;
    this.isDrawing = false;

    if (this.previewShape) {
      // Normalize width & height if negative (except line/arrow)
      if (['rect', 'circle', 'whiteout'].includes(this.previewShape.type)) {
        if (this.previewShape.width < 0) {
          this.previewShape.x += this.previewShape.width;
          this.previewShape.width = Math.abs(this.previewShape.width);
        }
        if (this.previewShape.height < 0) {
          this.previewShape.y += this.previewShape.height;
          this.previewShape.height = Math.abs(this.previewShape.height);
        }
      }

      // Only save if meaningful size
      if (this.previewShape.type === 'pen' || this.previewShape.type === 'highlight' || (Math.abs(this.previewShape.width) > 4 || Math.abs(this.previewShape.height) > 4)) {
        this.activePage.annotations.push({ ...this.previewShape });
        this.selectedAnnotationId = this.previewShape.id;
        this.saveHistory();
      }
      this.previewShape = null;
    }

    this.renderAnnotationCanvas();
  }

  private getCanvasCoords(event: PointerEvent): Point {
    const canvas = this.annotationCanvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / this.zoom;
    const y = (event.clientY - rect.top) / this.zoom;
    return { x, y };
  }

  private findAnnotationAt(x: number, y: number): AnnotationItem | null {
    if (!this.activePage) return null;
    // Reverse search so topmost element is clicked first
    for (let i = this.activePage.annotations.length - 1; i >= 0; i--) {
      const ann = this.activePage.annotations[i];
      if (x >= ann.x && x <= ann.x + ann.width && y >= ann.y && y <= ann.y + ann.height) {
        return ann;
      }
      if (ann.points && ann.points.some(p => Math.hypot(p.x - x, p.y - y) < 12)) {
        return ann;
      }
    }
    return null;
  }

  deleteSelectedAnnotation() {
    if (!this.activePage || !this.selectedAnnotationId) return;
    this.activePage.annotations = this.activePage.annotations.filter(a => a.id !== this.selectedAnnotationId);
    this.selectedAnnotationId = null;
    this.saveHistory();
    this.renderAnnotationCanvas();
  }

  onImageInserted(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0] && this.activePage) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const maxDim = 200;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            const scale = maxDim / Math.max(w, h);
            w *= scale;
            h *= scale;
          }
          const imageAnn: AnnotationItem = {
            id: `ann-img-${Date.now()}`,
            type: 'image',
            x: 80,
            y: 80,
            width: w,
            height: h,
            imageUrl: dataUrl
          };
          this.activePage?.annotations.push(imageAnn);
          this.selectedAnnotationId = imageAnn.id;
          this.activeTool = 'select';
          this.saveHistory();
          this.renderAnnotationCanvas();
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SIGNATURE MODAL
  // ═════════════════════════════════════════════════════════════════════════════

  openSignatureModal() {
    this.showSignatureModal = true;
    setTimeout(() => this.initSignaturePad(), 50);
  }

  closeSignatureModal() {
    this.showSignatureModal = false;
  }

  initSignaturePad() {
    const canvas = this.signatureCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
    }
  }

  onSignPointerDown(event: PointerEvent) {
    const canvas = this.signatureCanvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.isSigning = true;
    ctx.beginPath();
    ctx.moveTo(event.clientX - rect.left, event.clientY - rect.top);
  }

  onSignPointerMove(event: PointerEvent) {
    if (!this.isSigning) return;
    const canvas = this.signatureCanvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(event.clientX - rect.left, event.clientY - rect.top);
    ctx.stroke();
  }

  onSignPointerUp() {
    this.isSigning = false;
  }

  clearSignature() {
    this.initSignaturePad();
  }

  applySignature() {
    const canvas = this.signatureCanvasRef?.nativeElement;
    if (!canvas || !this.activePage) return;
    const sigUrl = canvas.toDataURL('image/png');
    const sigAnn: AnnotationItem = {
      id: `ann-sig-${Date.now()}`,
      type: 'image',
      x: 100,
      y: 150,
      width: 180,
      height: 70,
      imageUrl: sigUrl
    };
    this.activePage.annotations.push(sigAnn);
    this.selectedAnnotationId = sigAnn.id;
    this.activeTool = 'select';
    this.closeSignatureModal();
    this.saveHistory();
    this.renderAnnotationCanvas();
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // UNDO / REDO HISTORY
  // ═════════════════════════════════════════════════════════════════════════════

  saveHistory() {
    const state = JSON.stringify({
      pages: this.pages.map(p => ({
        id: p.id,
        originalPageIndex: p.originalPageIndex,
        displayNumber: p.displayNumber,
        rotation: p.rotation,
        width: p.width,
        height: p.height,
        aspectRatio: p.aspectRatio,
        annotations: p.annotations,
        isCustomBlank: p.isCustomBlank
      })),
      activePageIndex: this.activePageIndex
    });

    // Remove any redo steps ahead
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(state);
    this.historyIndex = this.history.length - 1;
  }

  undo() {
    if (!this.canUndo) return;
    this.historyIndex--;
    this.restoreHistoryState(this.history[this.historyIndex]);
  }

  redo() {
    if (!this.canRedo) return;
    this.historyIndex++;
    this.restoreHistoryState(this.history[this.historyIndex]);
  }

  private restoreHistoryState(stateStr: string) {
    try {
      const data = JSON.parse(stateStr);
      // Preserve existing thumbnail URLs
      const thumbMap = new Map(this.pages.map(p => [p.id, p.thumbnailUrl]));
      this.pages = data.pages.map((p: any) => ({
        ...p,
        thumbnailUrl: thumbMap.get(p.id) || this.createBlankThumbnail()
      }));
      this.activePageIndex = Math.min(data.activePageIndex, this.pages.length - 1);
      this.renderActivePage();
    } catch (e) {
      console.error('Failed to restore history state:', e);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const target = event.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (this.selectedAnnotationId) {
        event.preventDefault();
        this.deleteSelectedAnnotation();
      }
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // EXPORT / DOWNLOAD PDF
  // ═════════════════════════════════════════════════════════════════════════════

  async exportPdf() {
    if (this.pages.length === 0) return;
    this.isExporting = true;
    this.loadingMessage = 'Assembling and exporting modified PDF…';
    this.cdr.detectChanges();

    try {
      const outputDoc = await PDFDocument.create();

      // If we have an original PDF document, load it for copying pages
      let sourceDoc: PDFDocument | null = null;
      if (this.originalPdfBytes) {
        sourceDoc = await PDFDocument.load(this.originalPdfBytes, { ignoreEncryption: true });
      }

      for (let i = 0; i < this.pages.length; i++) {
        const pageItem = this.pages[i];
        let outPage: any;

        if (!pageItem.isCustomBlank && sourceDoc && pageItem.originalPageIndex >= 0) {
          const [copiedPage] = await outputDoc.copyPages(sourceDoc, [pageItem.originalPageIndex]);
          outPage = outputDoc.addPage(copiedPage);
        } else {
          outPage = outputDoc.addPage([pageItem.width, pageItem.height]);
        }

        // Apply rotation
        if (pageItem.rotation !== 0) {
          const currentRotation = outPage.getRotation().angle;
          outPage.setRotation(degrees((currentRotation + pageItem.rotation) % 360));
        }

        // If there are annotations, render them to an overlay image and embed
        if (pageItem.annotations && pageItem.annotations.length > 0) {
          const overlayDataUrl = await this.renderAnnotationLayerToImage(pageItem);
          if (overlayDataUrl) {
            const pngImage = await outputDoc.embedPng(overlayDataUrl);
            const { width: pWidth, height: pHeight } = outPage.getSize();
            outPage.drawImage(pngImage, {
              x: 0,
              y: 0,
              width: pWidth,
              height: pHeight
            });
          }
        }
      }

      const pdfBytes = await outputDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);

      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      const exportName = this.fileName.replace(/\.pdf$/i, '') + '_edited.pdf';
      downloadLink.download = exportName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);

    } catch (err: any) {
      console.error('Failed to export PDF:', err);
      alert('An error occurred during PDF export. Please try again.');
    } finally {
      this.isExporting = false;
      this.cdr.detectChanges();
    }
  }

  private async renderAnnotationLayerToImage(page: PdfPageItem): Promise<string | null> {
    const canvas = document.createElement('canvas');
    const scale = 2.0; // High resolution output
    canvas.width = page.width * scale;
    canvas.height = page.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.save();
    ctx.scale(scale, scale);

    // Render annotations onto transparent canvas
    for (const ann of page.annotations) {
      this.drawSingleAnnotation(ctx, ann, false);
    }
    ctx.restore();

    return canvas.toDataURL('image/png');
  }
}
