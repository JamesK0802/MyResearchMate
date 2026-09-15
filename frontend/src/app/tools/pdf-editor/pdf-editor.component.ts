import {
  Component,
  OnInit,
  ElementRef,
  ViewChild,
  HostListener,
  ChangeDetectorRef,
  AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker (CDN fallback with local asset)
if (typeof window !== 'undefined') {
  const v = pdfjsLib.version || '4.10.38';
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;
}

export type ToolType =
  | 'select'
  | 'text'
  | 'pen'
  | 'highlight'
  | 'rect'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'whiteout'
  | 'image'
  | 'signature';

export interface Point {
  x: number;
  y: number;
}

export interface AnnotationItem {
  id: string;
  type: ToolType;
  x: number;
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
  sourceDocId?: string;
  sourceType?: 'pdf' | 'docx' | 'image' | 'blank';
  sourceFileName?: string;
  imageBackgroundUrl?: string;
}

interface SourcePdfEntry {
  fileName: string;
  pdfBytes: Uint8Array;
  pdfJsDoc: any;
  pdfDocInstance?: PDFDocument;
}

@Component({
  selector: 'app-pdf-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pdf-editor.component.html',
  styleUrl: './pdf-editor.component.css'
})
export class PdfEditorComponent implements OnInit, AfterViewInit {
  @ViewChild('pageCanvas') pageCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('annotationCanvas') annotationCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasViewport') canvasViewportRef!: ElementRef<HTMLDivElement>;
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

  // Multi-document Source PDF Store
  private sourcePdfDocs: Map<string, SourcePdfEntry> = new Map();

  // Mobile Drawer State
  isMobileSidebarOpen: boolean = false;

  // View / Edit Settings & Zoom
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
    this.loadSampleDocument();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.fitToWidth();
    }, 120);
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
  // MOBILE DRAWER CONTROLS
  // ═════════════════════════════════════════════════════════════════════════════

  toggleMobileSidebar() {
    this.isMobileSidebarOpen = !this.isMobileSidebarOpen;
  }

  closeMobileSidebar() {
    this.isMobileSidebarOpen = false;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // FULL PAGE AUTO-FIT ZOOM
  // ═════════════════════════════════════════════════════════════════════════════

  fitToWidth() {
    if (!this.activePage || !this.canvasViewportRef) return;
    const container = this.canvasViewportRef.nativeElement;
    const isMobile = window.innerWidth <= 768;
    const padding = isMobile ? 8 : 24;
    const availableWidth = Math.max(260, container.clientWidth - padding);
    const targetZoom = availableWidth / this.activePage.width;
    this.zoom = Math.max(0.2, Math.min(3.0, Math.round(targetZoom * 100) / 100));
    this.renderActivePage();
  }

  fitToPage() {
    if (!this.activePage || !this.canvasViewportRef) return;
    const container = this.canvasViewportRef.nativeElement;
    const isMobile = window.innerWidth <= 768;
    const paddingX = isMobile ? 8 : 24;
    const paddingY = isMobile ? 12 : 36;
    const availableWidth = Math.max(260, container.clientWidth - paddingX);
    const availableHeight = Math.max(260, container.clientHeight - paddingY);
    const scaleX = availableWidth / this.activePage.width;
    const scaleY = availableHeight / this.activePage.height;
    const targetZoom = Math.min(scaleX, scaleY);
    this.zoom = Math.max(0.2, Math.min(3.0, Math.round(targetZoom * 100) / 100));
    this.renderActivePage();
  }

  setZoom(val: number) {
    this.zoom = Math.max(0.25, Math.min(3.0, Math.round(val * 100) / 100));
    this.renderActivePage();
  }

  @HostListener('window:resize')
  onWindowResize() {
    if (this.activeMode === 'edit' && window.innerWidth <= 768) {
      this.fitToWidth();
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // FILE INGESTION (PDF, Word .docx, Images) - OPEN & MERGE
  // ═════════════════════════════════════════════════════════════════════════════

  onOpenFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFileList(Array.from(input.files), false);
      input.value = '';
    }
  }

  onMergeFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFileList(Array.from(input.files), true);
      input.value = '';
    }
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const files = Array.from(event.dataTransfer.files);
      const append = this.pages.length > 0;
      this.handleFileList(files, append);
    }
  }

  onDragOverRoot(event: DragEvent) {
    event.preventDefault();
  }

  private async handleFileList(files: File[], append: boolean) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isFirst = i === 0;
      const shouldAppend = append || !isFirst;
      const lowerName = file.name.toLowerCase();

      if (lowerName.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        await this.importDocxFile(file, shouldAppend);
      } else if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
        await this.importPdfFile(file, shouldAppend);
      } else if (file.type.startsWith('image/')) {
        await this.importImageFile(file, shouldAppend);
      } else {
        alert(`Unsupported file format: ${file.name}. Please select PDF, Word (.docx), or Image files.`);
      }
    }
  }

  // Import PDF
  async importPdfFile(file: File, append: boolean = false) {
    this.isLoading = true;
    this.loadingMessage = `Loading ${file.name}…`;
    this.cdr.detectChanges();

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const docId = `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const loadingTask = pdfjsLib.getDocument({ data: uint8 });
      const pdfJsDoc = await loadingTask.promise;

      this.sourcePdfDocs.set(docId, {
        fileName: file.name,
        pdfBytes: uint8,
        pdfJsDoc
      });

      if (!append) {
        this.pages = [];
        this.sourcePdfDocs.clear();
        this.sourcePdfDocs.set(docId, {
          fileName: file.name,
          pdfBytes: uint8,
          pdfJsDoc
        });
        this.fileName = file.name;
      } else {
        if (this.pages.length === 0) {
          this.fileName = file.name;
        } else {
          this.fileName = this.fileName.replace(/\.pdf$/i, '') + '_merged.pdf';
        }
      }

      const baseIndex = this.pages.length;
      for (let i = 1; i <= pdfJsDoc.numPages; i++) {
        const page = await pdfJsDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });

        // Generate thumbnail
        const thumbScale = 140 / viewport.width;
        const thumbViewport = page.getViewport({ scale: thumbScale });
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = thumbViewport.width;
        thumbCanvas.height = thumbViewport.height;
        const thumbCtx = thumbCanvas.getContext('2d');
        if (thumbCtx) {
          await page.render({ canvasContext: thumbCtx, viewport: thumbViewport }).promise;
        }

        const pageItem: PdfPageItem = {
          id: `${docId}_p${i}_${Date.now()}`,
          originalPageIndex: i - 1,
          displayNumber: baseIndex + i,
          rotation: 0,
          thumbnailUrl: thumbCanvas.toDataURL('image/jpeg', 0.8),
          width: viewport.width,
          height: viewport.height,
          aspectRatio: viewport.width / viewport.height,
          sourceDocId: docId,
          sourceType: 'pdf',
          sourceFileName: file.name,
          annotations: []
        };
        this.pages.push(pageItem);
      }

      this.reindexPages();
      if (!append && this.pages.length > 0) {
        this.activePageIndex = 0;
      }
      this.saveHistory();
      this.activeMode = 'edit';
      setTimeout(() => this.fitToWidth(), 50);
    } catch (err: any) {
      console.error('Failed to load PDF:', err);
      alert(`Could not open ${file.name}. Please ensure it is an unencrypted PDF.`);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // Import Word .docx
  async importDocxFile(file: File, append: boolean = false) {
    this.isLoading = true;
    this.loadingMessage = `Converting ${file.name} to PDF pages…`;
    this.cdr.detectChanges();

    try {
      const { renderAsync: renderDocxAsync } = await import('docx-preview');
      const html2canvas = (await import('html2canvas')).default;
      const arrayBuffer = await file.arrayBuffer();

      const tempContainer = document.createElement('div');
      tempContainer.style.width = '794px'; // A4 standard width at 96 DPI
      tempContainer.style.position = 'fixed';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '0';
      tempContainer.style.background = '#ffffff';
      tempContainer.style.zIndex = '-1000';
      document.body.appendChild(tempContainer);

      await renderDocxAsync(arrayBuffer, tempContainer, undefined, {
        inWrapper: true,
        breakPages: true,
        ignoreWidth: false,
        ignoreHeight: false
      });

      // Find rendered pages
      let pageElements = Array.from(tempContainer.querySelectorAll<HTMLElement>('section.docx'));
      if (pageElements.length === 0) {
        const wrappers = Array.from(tempContainer.querySelectorAll<HTMLElement>('.docx-wrapper > *'));
        pageElements = wrappers.length > 0 ? wrappers : [tempContainer];
      }

      if (!append) {
        this.pages = [];
        this.sourcePdfDocs.clear();
        this.fileName = file.name.replace(/\.docx$/i, '.pdf');
      } else {
        if (this.pages.length === 0) {
          this.fileName = file.name.replace(/\.docx$/i, '.pdf');
        } else {
          this.fileName = this.fileName.replace(/\.pdf$/i, '') + '_merged.pdf';
        }
      }

      const baseIndex = this.pages.length;
      for (let i = 0; i < pageElements.length; i++) {
        this.loadingMessage = `Rendering Word page ${i + 1} of ${pageElements.length}…`;
        this.cdr.detectChanges();

        const sec = pageElements[i];
        const canvas = await html2canvas(sec, {
          scale: 1.5,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

        // Standard A4 dimensions in PDF points
        const w = 595.28;
        const h = 841.89;

        const newPage: PdfPageItem = {
          id: `docx_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          originalPageIndex: -1,
          displayNumber: baseIndex + i + 1,
          rotation: 0,
          thumbnailUrl: dataUrl,
          imageBackgroundUrl: dataUrl,
          width: w,
          height: h,
          aspectRatio: w / h,
          sourceType: 'docx',
          sourceFileName: file.name,
          annotations: []
        };
        this.pages.push(newPage);
      }

      document.body.removeChild(tempContainer);

      this.reindexPages();
      if (!append && this.pages.length > 0) {
        this.activePageIndex = 0;
      }
      this.saveHistory();
      this.activeMode = 'edit';
      setTimeout(() => this.fitToWidth(), 50);
    } catch (err: any) {
      console.error('Failed to convert DOCX:', err);
      alert(`Could not convert Word document ${file.name}: ${err?.message || 'Unknown error'}`);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // Import Image (.png, .jpg, .jpeg) as a page
  async importImageFile(file: File, append: boolean = false) {
    this.isLoading = true;
    this.loadingMessage = `Adding image ${file.name}…`;
    this.cdr.detectChanges();

    try {
      const dataUrl = await this.readFileAsDataUrl(file);
      const img = new Image();
      img.src = dataUrl;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });

      const w = 595.28;
      const h = 841.89;

      // Generate thumbnail
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 160;
      thumbCanvas.height = 226;
      const ctx = thumbCanvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 160, 226);

      const scale = Math.min(160 / img.width, 226 / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (160 - dw) / 2, (226 - dh) / 2, dw, dh);
      const thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.8);

      if (!append) {
        this.pages = [];
        this.sourcePdfDocs.clear();
        this.fileName = file.name.replace(/\.[^/.]+$/, '') + '.pdf';
      } else {
        if (this.pages.length === 0) {
          this.fileName = file.name.replace(/\.[^/.]+$/, '') + '.pdf';
        } else {
          this.fileName = this.fileName.replace(/\.pdf$/i, '') + '_merged.pdf';
        }
      }

      const newPage: PdfPageItem = {
        id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        originalPageIndex: -1,
        displayNumber: this.pages.length + 1,
        rotation: 0,
        thumbnailUrl: thumbUrl,
        imageBackgroundUrl: dataUrl,
        width: w,
        height: h,
        aspectRatio: w / h,
        sourceType: 'image',
        sourceFileName: file.name,
        annotations: []
      };
      this.pages.push(newPage);
      this.reindexPages();
      if (!append) {
        this.activePageIndex = 0;
      }
      this.saveHistory();
      this.activeMode = 'edit';
      setTimeout(() => this.fitToWidth(), 50);
    } catch (err: any) {
      console.error('Failed to import image:', err);
      alert(`Could not load image ${file.name}`);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // Load Sample Document
  async loadSampleDocument() {
    this.isLoading = true;
    this.loadingMessage = 'Generating sample research protocol…';
    this.cdr.detectChanges();

    try {
      const sampleDoc = await PDFDocument.create();

      // Page 1: Protocol Overview
      const page1 = sampleDoc.addPage([595, 842]);
      const { width, height } = page1.getSize();

      // Page 2: Methods & Procedures
      const page2 = sampleDoc.addPage([595, 842]);

      // Page 3: Data & Results
      const page3 = sampleDoc.addPage([595, 842]);

      const pdfBytes = await sampleDoc.save();
      const docId = 'sample_protocol';
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) });
      const pdfJsDoc = await loadingTask.promise;

      this.sourcePdfDocs.clear();
      this.sourcePdfDocs.set(docId, {
        fileName: 'Sample_Research_Protocol.pdf',
        pdfBytes: new Uint8Array(pdfBytes),
        pdfJsDoc
      });

      this.fileName = 'Sample_Research_Protocol.pdf';
      this.pages = [];

      for (let i = 1; i <= 3; i++) {
        const page = await pdfJsDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.35 });
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = viewport.width;
        thumbCanvas.height = viewport.height;
        const thumbCtx = thumbCanvas.getContext('2d');

        // Draw clean placeholder preview
        if (thumbCtx) {
          thumbCtx.fillStyle = '#ffffff';
          thumbCtx.fillRect(0, 0, viewport.width, viewport.height);
          thumbCtx.fillStyle = '#166534';
          thumbCtx.fillRect(20, 20, viewport.width - 40, 16);
          thumbCtx.fillStyle = '#e2e8f0';
          thumbCtx.fillRect(20, 50, viewport.width - 60, 8);
          thumbCtx.fillRect(20, 65, viewport.width - 40, 8);
          thumbCtx.fillRect(20, 80, viewport.width - 80, 8);
        }

        this.pages.push({
          id: `sample_p${i}`,
          originalPageIndex: i - 1,
          displayNumber: i,
          rotation: 0,
          thumbnailUrl: thumbCanvas.toDataURL('image/jpeg', 0.8),
          width: 595,
          height: 842,
          aspectRatio: 595 / 842,
          sourceDocId: docId,
          sourceType: 'pdf',
          sourceFileName: 'Sample_Research_Protocol.pdf',
          annotations: []
        });
      }

      this.activePageIndex = 0;
      this.activeMode = 'edit';
      this.saveHistory();
      setTimeout(() => this.fitToWidth(), 50);
    } catch (err) {
      console.error('Failed to load sample doc:', err);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PAGE MANAGEMENT: ADD, DELETE, ROTATE, REORDER, DUPLICATE
  // ═════════════════════════════════════════════════════════════════════════════

  addBlankPage(insertIndex?: number) {
    const targetIndex = insertIndex !== undefined ? insertIndex : this.pages.length;
    const blankThumb = this.createBlankThumbnail(595, 842);

    const newPage: PdfPageItem = {
      id: `blank-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      originalPageIndex: -1,
      displayNumber: targetIndex + 1,
      rotation: 0,
      thumbnailUrl: blankThumb,
      width: 595,
      height: 842,
      aspectRatio: 595 / 842,
      isCustomBlank: true,
      sourceType: 'blank',
      annotations: []
    };

    this.pages.splice(targetIndex, 0, newPage);
    this.reindexPages();
    this.activePageIndex = targetIndex;
    this.saveHistory();
    this.renderActivePage();
  }

  duplicatePage(index: number) {
    const p = this.pages[index];
    if (!p) return;

    const clonedAnnotations = JSON.parse(JSON.stringify(p.annotations));
    const newPage: PdfPageItem = {
      ...p,
      id: `page-dup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      displayNumber: index + 2,
      annotations: clonedAnnotations
    };

    this.pages.splice(index + 1, 0, newPage);
    this.reindexPages();
    this.activePageIndex = index + 1;
    this.saveHistory();
    this.renderActivePage();
  }

  deletePage(index: number) {
    if (this.pages.length <= 1) {
      alert('The document must contain at least one page.');
      return;
    }
    this.pages.splice(index, 1);
    this.reindexPages();
    if (this.activePageIndex >= this.pages.length) {
      this.activePageIndex = this.pages.length - 1;
    }
    this.saveHistory();
    this.renderActivePage();
  }

  rotatePage(index: number, degreesToAdd: number = 90) {
    const p = this.pages[index];
    if (!p) return;
    p.rotation = (p.rotation + degreesToAdd) % 360;
    this.saveHistory();
    if (this.activePageIndex === index) {
      this.renderActivePage();
    }
  }

  movePageUp(index: number) {
    if (index <= 0) return;
    const temp = this.pages[index];
    this.pages[index] = this.pages[index - 1];
    this.pages[index - 1] = temp;
    this.reindexPages();
    this.activePageIndex = index - 1;
    this.saveHistory();
    this.renderActivePage();
  }

  movePageDown(index: number) {
    if (index >= this.pages.length - 1) return;
    const temp = this.pages[index];
    this.pages[index] = this.pages[index + 1];
    this.pages[index + 1] = temp;
    this.reindexPages();
    this.activePageIndex = index + 1;
    this.saveHistory();
    this.renderActivePage();
  }

  reindexPages() {
    for (let i = 0; i < this.pages.length; i++) {
      this.pages[i].displayNumber = i + 1;
    }
  }

  private createBlankThumbnail(width: number, height: number): string {
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = Math.round(120 * (height / width));
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, c.width, c.height);
    }
    return c.toDataURL('image/jpeg', 0.8);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // DRAG AND DROP PAGE REORDERING
  // ═════════════════════════════════════════════════════════════════════════════

  onDragStart(event: DragEvent, index: number) {
    this.draggedPageIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${index}`);
    }
  }

  onDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    if (this.draggedPageIndex !== null && this.draggedPageIndex !== index) {
      this.dragOverPageIndex = index;
    }
  }

  onDragLeave(index: number) {
    if (this.dragOverPageIndex === index) {
      this.dragOverPageIndex = null;
    }
  }

  onDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();
    if (this.draggedPageIndex === null || this.draggedPageIndex === dropIndex) {
      this.dragOverPageIndex = null;
      return;
    }

    const item = this.pages.splice(this.draggedPageIndex, 1)[0];
    this.pages.splice(dropIndex, 0, item);
    this.reindexPages();
    this.activePageIndex = dropIndex;
    this.draggedPageIndex = null;
    this.dragOverPageIndex = null;
    this.saveHistory();
    this.renderActivePage();
  }

  onDragEnd() {
    this.draggedPageIndex = null;
    this.dragOverPageIndex = null;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // MODE & PAGE SELECTION
  // ═════════════════════════════════════════════════════════════════════════════

  setMode(mode: 'view' | 'edit') {
    this.activeMode = mode;
    this.selectedAnnotationId = null;
    if (mode === 'edit') {
      setTimeout(() => this.renderActivePage(), 30);
    }
  }

  selectPage(index: number) {
    if (index < 0 || index >= this.pages.length) return;
    this.activePageIndex = index;
    this.selectedAnnotationId = null;
    this.closeMobileSidebar();
    if (this.activeMode === 'edit') {
      this.renderActivePage();
    }
  }

  openEditModeForPage(index: number) {
    this.activePageIndex = index;
    this.setMode('edit');
    this.closeMobileSidebar();
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // CANVAS RENDERING
  // ═════════════════════════════════════════════════════════════════════════════

  async renderActivePage() {
    if (this.activeMode !== 'edit' || !this.activePage) return;
    await this.renderBasePdfPage(this.activePageIndex);
  }

  private async renderBasePdfPage(pageIndex: number) {
    const page = this.pages[pageIndex];
    if (!page || !this.pageCanvasRef) return;

    const canvas = this.pageCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const renderScale = this.zoom * dpr;

    canvas.width = Math.round(page.width * renderScale);
    canvas.height = Math.round(page.height * renderScale);
    canvas.style.width = `${page.width * this.zoom}px`;
    canvas.style.height = `${page.height * this.zoom}px`;

    // 1. If it's a PDF vector page
    if (page.sourceType === 'pdf' && page.sourceDocId) {
      const docEntry = this.sourcePdfDocs.get(page.sourceDocId);
      if (docEntry && docEntry.pdfJsDoc && page.originalPageIndex >= 0) {
        try {
          const pdfPage = await docEntry.pdfJsDoc.getPage(page.originalPageIndex + 1);
          const viewport = pdfPage.getViewport({
            scale: renderScale,
            rotation: page.rotation
          });
          await pdfPage.render({ canvasContext: ctx, viewport }).promise;
          this.renderAnnotationCanvas();
          this.cdr.detectChanges();
          return;
        } catch (err) {
          console.warn('PDF.js render error:', err);
        }
      }
    }

    // 2. If it's a Word .docx or Image page
    if (page.imageBackgroundUrl) {
      try {
        const img = new Image();
        img.src = page.imageBackgroundUrl;
        await new Promise((res) => { img.onload = res; img.onerror = res; });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        this.renderAnnotationCanvas();
        this.cdr.detectChanges();
        return;
      } catch (err) {
        console.warn('Image page render error:', err);
      }
    }

    // 3. Default Blank
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.renderAnnotationCanvas();
    this.cdr.detectChanges();
  }

  renderAnnotationCanvas() {
    if (!this.activePage || !this.annotationCanvasRef) return;
    const page = this.activePage;
    const canvas = this.annotationCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const renderScale = this.zoom * dpr;

    canvas.width = Math.round(page.width * renderScale);
    canvas.height = Math.round(page.height * renderScale);
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
      this.drawSingleAnnotation(ctx, this.previewShape, false);
    }

    ctx.restore();
  }

  private drawSingleAnnotation(ctx: CanvasRenderingContext2D, ann: AnnotationItem, isSelected: boolean) {
    ctx.save();

    switch (ann.type) {
      case 'pen':
      case 'highlight': {
        if (!ann.points || ann.points.length < 2) break;
        ctx.beginPath();
        ctx.strokeStyle = ann.strokeColor || this.strokeColor;
        ctx.lineWidth = ann.strokeWidth || 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = ann.strokeOpacity ?? (ann.type === 'highlight' ? 0.35 : 1.0);

        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i].x, ann.points[i].y);
        }
        ctx.stroke();
        break;
      }

      case 'rect': {
        ctx.strokeStyle = ann.strokeColor || this.strokeColor;
        ctx.lineWidth = ann.strokeWidth || 2;
        ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
        break;
      }

      case 'circle': {
        ctx.strokeStyle = ann.strokeColor || this.strokeColor;
        ctx.lineWidth = ann.strokeWidth || 2;
        ctx.beginPath();
        const rx = Math.abs(ann.width) / 2;
        const ry = Math.abs(ann.height) / 2;
        const cx = ann.x + rx;
        const cy = ann.y + ry;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case 'arrow': {
        ctx.strokeStyle = ann.strokeColor || this.strokeColor;
        ctx.fillStyle = ann.strokeColor || this.strokeColor;
        ctx.lineWidth = ann.strokeWidth || 3;
        const fromX = ann.x;
        const fromY = ann.y;
        const toX = ann.x + ann.width;
        const toY = ann.y + ann.height;
        this.drawArrow(ctx, fromX, fromY, toX, toY);
        break;
      }

      case 'whiteout': {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
        break;
      }

      case 'text': {
        ctx.fillStyle = ann.color || this.textColor;
        const fontStyle = `${ann.italic ? 'italic ' : ''}${ann.bold ? 'bold ' : ''}`;
        const fontSize = ann.fontSize || 18;
        ctx.font = `${fontStyle}${fontSize}px ${ann.fontFamily || 'Inter, sans-serif'}`;
        ctx.textBaseline = 'top';

        if (ann.text) {
          const lines = ann.text.split('\n');
          let offsetY = ann.y;
          for (const line of lines) {
            ctx.fillText(line, ann.x, offsetY);
            offsetY += fontSize * 1.3;
          }
        }
        break;
      }

      case 'image':
      case 'signature': {
        if (ann.imageUrl) {
          const img = new Image();
          img.src = ann.imageUrl;
          if (img.complete) {
            ctx.drawImage(img, ann.x, ann.y, ann.width, ann.height);
          } else {
            img.onload = () => this.renderAnnotationCanvas();
          }
        }
        break;
      }
    }

    // Draw selection box if selected
    if (isSelected) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(ann.x - 3, ann.y - 3, ann.width + 6, ann.height + 6);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(ann.x - 5, ann.y - 5, 6, 6);
      ctx.fillRect(ann.x + ann.width - 1, ann.y - 5, 6, 6);
      ctx.fillRect(ann.x - 5, ann.y + ann.height - 1, 6, 6);
      ctx.fillRect(ann.x + ann.width - 1, ann.y + ann.height - 1, 6, 6);
    }

    ctx.restore();
  }

  private drawArrow(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) {
    const headLen = 14;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ANNOTATION INTERACTION & POINTER EVENTS
  // ═════════════════════════════════════════════════════════════════════════════

  setTool(tool: ToolType) {
    this.activeTool = tool;
    this.selectedAnnotationId = null;

    if (tool === 'image') {
      if (this.imageInputRef) {
        this.imageInputRef.nativeElement.click();
      }
    } else if (tool === 'signature') {
      this.openSignatureModal();
    }
  }

  onPointerDownCanvas(event: PointerEvent) {
    if (!this.activePage || !this.annotationCanvasRef) return;
    const canvas = this.annotationCanvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scale = this.activePage.width / rect.width;

    const x = (event.clientX - rect.left) * scale;
    const y = (event.clientY - rect.top) * scale;

    if (this.activeTool === 'select') {
      const clicked = this.findAnnotationAt(x, y);
      this.selectedAnnotationId = clicked ? clicked.id : null;
      this.renderAnnotationCanvas();
      return;
    }

    this.isDrawing = true;
    this.drawStartX = x;
    this.drawStartY = y;

    if (this.activeTool === 'pen' || this.activeTool === 'highlight') {
      this.currentPoints = [{ x, y }];
    } else if (this.activeTool === 'text') {
      const newText: AnnotationItem = {
        id: `text-${Date.now()}`,
        type: 'text',
        x,
        y,
        width: 180,
        height: 30,
        text: 'Type text here...',
        fontSize: this.fontSize,
        fontFamily: this.fontFamily,
        color: this.strokeColor,
        bold: false,
        italic: false
      };
      this.activePage.annotations.push(newText);
      this.selectedAnnotationId = newText.id;
      this.isDrawing = false;
      this.saveHistory();
      this.renderAnnotationCanvas();
    }
  }

  onPointerMoveCanvas(event: PointerEvent) {
    if (!this.isDrawing || !this.activePage || !this.annotationCanvasRef) return;
    const canvas = this.annotationCanvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scale = this.activePage.width / rect.width;

    const x = (event.clientX - rect.left) * scale;
    const y = (event.clientY - rect.top) * scale;

    if (this.activeTool === 'pen' || this.activeTool === 'highlight') {
      this.currentPoints.push({ x, y });
      this.previewShape = {
        id: 'preview',
        type: this.activeTool,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [...this.currentPoints],
        strokeColor: this.strokeColor,
        strokeWidth: this.activeTool === 'highlight' ? 14 : this.strokeWidth,
        strokeOpacity: this.activeTool === 'highlight' ? 0.35 : 1.0
      };
      this.renderAnnotationCanvas();
    } else if (['rect', 'circle', 'arrow', 'whiteout'].includes(this.activeTool)) {
      const w = x - this.drawStartX;
      const h = y - this.drawStartY;
      this.previewShape = {
        id: 'preview',
        type: this.activeTool,
        x: this.activeTool === 'arrow' ? this.drawStartX : Math.min(this.drawStartX, x),
        y: this.activeTool === 'arrow' ? this.drawStartY : Math.min(this.drawStartY, y),
        width: this.activeTool === 'arrow' ? w : Math.abs(w),
        height: this.activeTool === 'arrow' ? h : Math.abs(h),
        strokeColor: this.strokeColor,
        strokeWidth: this.strokeWidth
      };
      this.renderAnnotationCanvas();
    }
  }

  onPointerUpCanvas() {
    if (!this.isDrawing || !this.activePage) return;
    this.isDrawing = false;

    if (this.previewShape) {
      if (this.activeTool === 'pen' || this.activeTool === 'highlight') {
        if (this.currentPoints.length > 1) {
          const newAnn: AnnotationItem = {
            id: `draw-${Date.now()}`,
            type: this.activeTool,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            points: [...this.currentPoints],
            strokeColor: this.strokeColor,
            strokeWidth: this.activeTool === 'highlight' ? 14 : this.strokeWidth,
            strokeOpacity: this.activeTool === 'highlight' ? 0.35 : 1.0
          };
          this.activePage.annotations.push(newAnn);
        }
      } else {
        if (Math.abs(this.previewShape.width) > 3 || Math.abs(this.previewShape.height) > 3) {
          this.activePage.annotations.push({
            ...this.previewShape,
            id: `shape-${Date.now()}`
          });
        }
      }
      this.previewShape = null;
      this.currentPoints = [];
      this.saveHistory();
      this.renderAnnotationCanvas();
    }
  }

  private findAnnotationAt(x: number, y: number): AnnotationItem | undefined {
    if (!this.activePage) return undefined;
    for (let i = this.activePage.annotations.length - 1; i >= 0; i--) {
      const ann = this.activePage.annotations[i];
      if (x >= ann.x - 5 && x <= ann.x + ann.width + 5 && y >= ann.y - 5 && y <= ann.y + ann.height + 5) {
        return ann;
      }
    }
    return undefined;
  }

  deleteSelectedAnnotation() {
    if (!this.activePage || !this.selectedAnnotationId) return;
    this.activePage.annotations = this.activePage.annotations.filter(a => a.id !== this.selectedAnnotationId);
    this.selectedAnnotationId = null;
    this.saveHistory();
    this.renderAnnotationCanvas();
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // IMAGE & SIGNATURE STAMP INSERTION
  // ═════════════════════════════════════════════════════════════════════════════

  onImageInserted(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0] && this.activePage) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        if (url && this.activePage) {
          const newImg: AnnotationItem = {
            id: `stamp-${Date.now()}`,
            type: 'image',
            x: 50,
            y: 50,
            width: 160,
            height: 160,
            imageUrl: url
          };
          this.activePage.annotations.push(newImg);
          this.selectedAnnotationId = newImg.id;
          this.saveHistory();
          this.renderAnnotationCanvas();
        }
      };
      reader.readAsDataURL(file);
      input.value = '';
    }
  }

  openSignatureModal() {
    this.showSignatureModal = true;
    setTimeout(() => {
      if (this.signatureCanvasRef) {
        const c = this.signatureCanvasRef.nativeElement;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
        }
      }
    }, 50);
  }

  closeSignatureModal() {
    this.showSignatureModal = false;
  }

  onSignPointerDown(event: PointerEvent) {
    this.isSigning = true;
    const canvas = this.signatureCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(event.clientX - rect.left, event.clientY - rect.top);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
  }

  onSignPointerMove(event: PointerEvent) {
    if (!this.isSigning) return;
    const canvas = this.signatureCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(event.clientX - rect.left, event.clientY - rect.top);
    ctx.stroke();
  }

  onSignPointerUp() {
    this.isSigning = false;
  }

  clearSignature() {
    if (!this.signatureCanvasRef) return;
    const canvas = this.signatureCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  applySignature() {
    if (!this.signatureCanvasRef || !this.activePage) return;
    const canvas = this.signatureCanvasRef.nativeElement;
    const sigDataUrl = canvas.toDataURL('image/png');

    const newSig: AnnotationItem = {
      id: `sig-${Date.now()}`,
      type: 'signature',
      x: 100,
      y: 200,
      width: 180,
      height: 70,
      imageUrl: sigDataUrl
    };
    this.activePage.annotations.push(newSig);
    this.selectedAnnotationId = newSig.id;
    this.showSignatureModal = false;
    this.saveHistory();
    this.renderAnnotationCanvas();
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // UNDO / REDO HISTORY
  // ═════════════════════════════════════════════════════════════════════════════

  saveHistory() {
    const snapshot = JSON.stringify(this.pages);
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push(snapshot);
    if (this.history.length > 30) this.history.shift();
    this.historyIndex = this.history.length - 1;
  }

  undo() {
    if (this.canUndo) {
      this.historyIndex--;
      this.pages = JSON.parse(this.history[this.historyIndex]);
      this.selectedAnnotationId = null;
      this.renderActivePage();
    }
  }

  redo() {
    if (this.canRedo) {
      this.historyIndex++;
      this.pages = JSON.parse(this.history[this.historyIndex]);
      this.selectedAnnotationId = null;
      this.renderActivePage();
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
  // EXPORT / DOWNLOAD PDF (MULTI-DOC MERGE SUPPORT)
  // ═════════════════════════════════════════════════════════════════════════════

  async exportPdf() {
    if (this.pages.length === 0) return;
    this.isExporting = true;
    this.loadingMessage = 'Assembling and exporting merged PDF…';
    this.cdr.detectChanges();

    try {
      const outputDoc = await PDFDocument.create();

      // Pre-load all source PDFDocument instances
      for (const [docId, entry] of this.sourcePdfDocs.entries()) {
        if (!entry.pdfDocInstance) {
          entry.pdfDocInstance = await PDFDocument.load(entry.pdfBytes, { ignoreEncryption: true });
        }
      }

      for (let i = 0; i < this.pages.length; i++) {
        const pageItem = this.pages[i];
        let outPage: any;

        // 1. If page originates from a PDF
        if (pageItem.sourceType === 'pdf' && pageItem.sourceDocId && pageItem.originalPageIndex >= 0) {
          const entry = this.sourcePdfDocs.get(pageItem.sourceDocId);
          if (entry && entry.pdfDocInstance) {
            const [copiedPage] = await outputDoc.copyPages(entry.pdfDocInstance, [pageItem.originalPageIndex]);
            outPage = outputDoc.addPage(copiedPage);
          } else {
            outPage = outputDoc.addPage([pageItem.width, pageItem.height]);
          }
        } else if (pageItem.imageBackgroundUrl) {
          // 2. If page originates from Word .docx or Image
          outPage = outputDoc.addPage([pageItem.width, pageItem.height]);
          const imgUrl = pageItem.imageBackgroundUrl;
          let embeddedImg: any;
          if (imgUrl.startsWith('data:image/png')) {
            embeddedImg = await outputDoc.embedPng(imgUrl);
          } else {
            embeddedImg = await outputDoc.embedJpg(imgUrl);
          }
          const { width: pWidth, height: pHeight } = outPage.getSize();
          outPage.drawImage(embeddedImg, {
            x: 0,
            y: 0,
            width: pWidth,
            height: pHeight
          });
        } else {
          // 3. Blank page
          outPage = outputDoc.addPage([pageItem.width, pageItem.height]);
        }

        // Apply rotation
        if (pageItem.rotation !== 0) {
          const currentRotation = outPage.getRotation().angle;
          outPage.setRotation(degrees((currentRotation + pageItem.rotation) % 360));
        }

        // Render annotations overlay
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
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);

      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      const exportName = this.fileName.replace(/\.pdf$/i, '') + '_exported.pdf';
      downloadLink.download = exportName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);

    } catch (err: any) {
      console.error('Failed to export PDF:', err);
      alert('An error occurred during PDF export: ' + (err?.message || 'Unknown error'));
    } finally {
      this.isExporting = false;
      this.cdr.detectChanges();
    }
  }

  private async renderAnnotationLayerToImage(page: PdfPageItem): Promise<string | null> {
    if (!page.annotations || page.annotations.length === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(page.width * 2);
    canvas.height = Math.round(page.height * 2);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.scale(2, 2);
    for (const ann of page.annotations) {
      this.drawSingleAnnotation(ctx, ann, false);
    }
    return canvas.toDataURL('image/png');
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
