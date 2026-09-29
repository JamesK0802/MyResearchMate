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
import { ActivatedRoute, Router } from '@angular/router';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { AuthService } from '../../services/auth.service';
import { PdfDocumentService, SavedSignature } from '../../services/pdf-document.service';

// Configure PDF.js worker (CDN fallback with local asset)
if (typeof window !== 'undefined') {
  const v = pdfjsLib.version || '4.10.38';
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;
}

export type ToolType =
  | 'select'
  | 'text'
  | 'pen'
  | 'eraser'
  | 'highlight'
  | 'rect'
  | 'circle'
  | 'triangle'
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
  @ViewChild('signatureImageInput') signatureImageInputRef!: ElementRef<HTMLInputElement>;

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
  showTitlePopover = false;

  // Multi-touch canvas zoom state
  private canvasPointers = new Map<number, { x: number; y: number }>();
  private suppressedCanvasPointers = new Set<number>();
  private isPinchingCanvas = false;
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;
  private pinchPageX = 0;
  private pinchPageY = 0;
  private pinchClientX = 0;
  private pinchClientY = 0;
  private pinchFrame: number | null = null;
  private pendingPinchZoom = 1;

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
  private eraserChanged = false;

  // Interactive Resizing & Dragging State
  isResizing: boolean = false;
  resizeHandle: 'tl' | 'tr' | 'bl' | 'br' | null = null;
  isDraggingAnnotation: boolean = false;
  origAnnX: number = 0;
  origAnnY: number = 0;
  origAnnWidth: number = 0;
  origAnnHeight: number = 0;
  dragStartX: number = 0;
  dragStartY: number = 0;

  // Drag & Drop Reordering State
  draggedPageIndex: number | null = null;
  dragOverPageIndex: number | null = null;

  // Signature Modal
  showSignatureModal: boolean = false;
  private isSigning: boolean = false;
  signaturePreviewUrl: string = '';
  savedSignatures: SavedSignature[] = [];
  currentDocumentId: string | null = null;
  openedReadOnlyShare = false;
  isSavingDocument = false;

  // Undo / Redo History
  private history: string[] = [];
  private historyIndex: number = -1;

  constructor(
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    private pdfDocuments: PdfDocumentService,
    public auth: AuthService
  ) {}

  async ngOnInit() {
    const documentId = this.route.snapshot.queryParamMap.get('document');
    if (documentId && this.auth.isLoggedIn && !this.auth.isDemo) await this.loadSavedDocument(documentId);
    else this.createEmptyDocument();
    if (this.auth.isLoggedIn && !this.auth.isDemo) void this.loadSavedSignatures();
  }

  private createEmptyDocument() {
    this.fileName = 'Untitled.pdf';
    this.pages = [];
    this.sourcePdfDocs.clear();
    this.currentDocumentId = null;
    this.openedReadOnlyShare = false;
    this.history = [];
    this.historyIndex = -1;
    this.addBlankPage();
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

  get drawToolValue(): ToolType | '' {
    return ['pen', 'highlight', 'eraser'].includes(this.activeTool) ? this.activeTool : '';
  }

  get shapeToolValue(): ToolType | '' {
    return ['rect', 'circle', 'triangle'].includes(this.activeTool) ? this.activeTool : '';
  }

  get lineToolValue(): ToolType | '' {
    return ['line', 'arrow'].includes(this.activeTool) ? this.activeTool : '';
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

  renameDocumentTitle() {
    const current = this.fileName.replace(/\.pdf$/i, '');
    const next = prompt('Document name', current)?.trim();
    if (!next) return;
    this.fileName = `${next.replace(/\.pdf$/i, '')}.pdf`;
    this.showTitlePopover = false;
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
      const loadingTask = pdfjsLib.getDocument({ data: uint8.slice() });
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
        const editableText = await this.extractEditableText(page, viewport);

        // Generate clean proportional thumbnail (140x198 standard A4 ratio)
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 140;
        thumbCanvas.height = 198;
        const thumbCtx = thumbCanvas.getContext('2d')!;
        thumbCtx.fillStyle = '#ffffff';
        thumbCtx.fillRect(0, 0, 140, 198);

        const thumbScale = Math.min(140 / viewport.width, 198 / viewport.height);
        const thumbViewport = page.getViewport({ scale: thumbScale });
        const offX = (140 - thumbViewport.width) / 2;
        const offY = (198 - thumbViewport.height) / 2;

        thumbCtx.save();
        thumbCtx.translate(offX, offY);
        await page.render({ canvasContext: thumbCtx, viewport: thumbViewport }).promise;
        thumbCtx.restore();

        const pageItem: PdfPageItem = {
          id: `${docId}_p${i}_${Date.now()}`,
          originalPageIndex: i - 1,
          displayNumber: baseIndex + i,
          rotation: 0,
          thumbnailUrl: thumbCanvas.toDataURL('image/jpeg', 0.85),
          width: viewport.width,
          height: viewport.height,
          aspectRatio: viewport.width / viewport.height,
          sourceDocId: docId,
          sourceType: 'pdf',
          sourceFileName: file.name,
          annotations: editableText
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

  private async extractEditableText(page: any, viewport: any): Promise<AnnotationItem[]> {
    try {
      const content = await page.getTextContent();
      return (content.items || []).filter((item: any) => String(item.str || '').trim()).map((item: any, index: number) => {
        const fontHeight = Math.max(7, Math.abs(Number(item.transform?.[3] || item.height || 12)));
        return {
          id: `pdf-text-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 5)}`,
          type: 'text' as ToolType,
          x: Number(item.transform?.[4] || 0),
          y: Math.max(0, viewport.height - Number(item.transform?.[5] || 0) - fontHeight),
          width: Math.max(12, Number(item.width || String(item.str).length * fontHeight * 0.55)),
          height: fontHeight * 1.35,
          text: String(item.str),
          fontSize: fontHeight,
          fontFamily: 'Arial, sans-serif',
          color: '#0f172a',
          backgroundColor: '#ffffff'
        };
      });
    } catch {
      return [];
    }
  }

  // Import Word .docx with Multi-Page Slicing (Prevents single squished page!)
  async importDocxFile(file: File, append: boolean = false) {
    this.isLoading = true;
    this.loadingMessage = `Converting ${file.name} to PDF pages…`;
    this.cdr.detectChanges();

    try {
      const { renderAsync: renderDocxAsync } = await import('docx-preview');
      const html2canvas = (await import('html2canvas')).default;
      const arrayBuffer = await file.arrayBuffer();

      const tempContainer = document.createElement('div');
      tempContainer.style.width = '794px'; // Standard A4 width at 96 DPI
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

      this.loadingMessage = `Rendering ${file.name} pages…`;
      this.cdr.detectChanges();

      // Capture full rendered docx into high-res canvas
      const fullCanvas = await html2canvas(tempContainer, {
        scale: 1.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      document.body.removeChild(tempContainer);

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

      // Calculate A4 page slices (ratio 1 : 1.4142)
      const a4Ratio = 841.89 / 595.28; // ~1.41426
      const pagePixelHeight = Math.round(fullCanvas.width * a4Ratio);
      const totalDocxPages = Math.max(1, Math.ceil(fullCanvas.height / pagePixelHeight));
      const baseIndex = this.pages.length;

      for (let p = 0; p < totalDocxPages; p++) {
        this.loadingMessage = `Processing Word page ${p + 1} of ${totalDocxPages}…`;
        this.cdr.detectChanges();

        // 1. Create page canvas with exact A4 proportions
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = fullCanvas.width;
        pageCanvas.height = pagePixelHeight;
        const pctx = pageCanvas.getContext('2d')!;
        pctx.fillStyle = '#ffffff';
        pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

        const sourceY = p * pagePixelHeight;
        const sourceH = Math.min(pagePixelHeight, fullCanvas.height - sourceY);

        pctx.drawImage(
          fullCanvas,
          0, sourceY, fullCanvas.width, sourceH,
          0, 0, fullCanvas.width, sourceH
        );

        const pageDataUrl = pageCanvas.toDataURL('image/jpeg', 0.92);

        // 2. Generate clean thumbnail (140x198, zero letterboxing)
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 140;
        thumbCanvas.height = 198;
        const tctx = thumbCanvas.getContext('2d')!;
        tctx.fillStyle = '#ffffff';
        tctx.fillRect(0, 0, 140, 198);
        tctx.drawImage(pageCanvas, 0, 0, 140, 198);
        const thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.85);

        const newPage: PdfPageItem = {
          id: `docx_${Date.now()}_${p}_${Math.random().toString(36).substring(2, 6)}`,
          originalPageIndex: -1,
          displayNumber: baseIndex + p + 1,
          rotation: 0,
          thumbnailUrl: thumbUrl,
          imageBackgroundUrl: pageDataUrl,
          width: 595.28,
          height: 841.89,
          aspectRatio: 595.28 / 841.89,
          sourceType: 'docx',
          sourceFileName: file.name,
          annotations: []
        };
        this.pages.push(newPage);
      }

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

      // Generate clean thumbnail (140x198, zero letterboxing)
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 140;
      thumbCanvas.height = 198;
      const ctx = thumbCanvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 140, 198);

      const scale = Math.min(140 / img.width, 198 / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (140 - dw) / 2, (198 - dh) / 2, dw, dh);
      const thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.85);

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
    this.createEmptyDocument();
    setTimeout(() => this.fitToWidth(), 30);
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
    c.width = 140;
    c.height = 198;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, c.width, c.height);
    }
    return c.toDataURL('image/jpeg', 0.85);
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

  renderAnnotationCanvas(showSelection: boolean = true) {
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
      this.drawSingleAnnotation(ctx, ann, showSelection && ann.id === this.selectedAnnotationId);
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

      case 'triangle': {
        ctx.strokeStyle = ann.strokeColor || this.strokeColor;
        ctx.lineWidth = ann.strokeWidth || 2;
        ctx.beginPath();
        ctx.moveTo(ann.x + ann.width / 2, ann.y);
        ctx.lineTo(ann.x + ann.width, ann.y + ann.height);
        ctx.lineTo(ann.x, ann.y + ann.height);
        ctx.closePath();
        ctx.stroke();
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

      case 'line':
      case 'arrow': {
        ctx.strokeStyle = ann.strokeColor || this.strokeColor;
        ctx.fillStyle = ann.strokeColor || this.strokeColor;
        ctx.lineWidth = ann.strokeWidth || 3;
        const fromX = ann.x;
        const fromY = ann.y;
        const toX = ann.x + ann.width;
        const toY = ann.y + ann.height;
        if (ann.type === 'arrow') this.drawArrow(ctx, fromX, fromY, toX, toY);
        else {
          ctx.beginPath();
          ctx.moveTo(fromX, fromY);
          ctx.lineTo(toX, toY);
          ctx.stroke();
        }
        break;
      }

      case 'whiteout': {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
        break;
      }

      case 'text': {
        if (ann.backgroundColor) {
          ctx.fillStyle = ann.backgroundColor;
          ctx.fillRect(ann.x - 1, ann.y - 1, ann.width + 2, ann.height + 2);
        }
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

    // Draw Selection Box & 4 Visible Touch Corner Resize Handles
    if (isSelected) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
      ctx.setLineDash([]);

      // 4 Corner Handles
      const handleRadius = 6;
      const corners = [
        { x: ann.x, y: ann.y },                          // tl
        { x: ann.x + ann.width, y: ann.y },              // tr
        { x: ann.x, y: ann.y + ann.height },             // bl
        { x: ann.x + ann.width, y: ann.y + ann.height }  // br
      ];

      for (const pt of corners) {
        ctx.beginPath();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.arc(pt.x, pt.y, handleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Bottom-right prominent accent for intuitive scaling
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(ann.x + ann.width, ann.y + ann.height, handleRadius - 2, 0, Math.PI * 2);
      ctx.fill();
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
  // ANNOTATION INTERACTION & POINTER EVENTS (TOUCH RESIZE + MOVE)
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
    if (event.pointerType === 'touch') {
      event.preventDefault();
      canvas.setPointerCapture?.(event.pointerId);
      this.canvasPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.canvasPointers.size === 2) {
        this.isPinchingCanvas = true;
        for (const pointerId of this.canvasPointers.keys()) this.suppressedCanvasPointers.add(pointerId);
        this.pinchStartDistance = this.canvasPointerDistance();
        this.pinchStartZoom = this.zoom;
        const midpoint = this.canvasPointerMidpoint();
        const pageRect = canvas.getBoundingClientRect();
        this.pinchClientX = midpoint.x;
        this.pinchClientY = midpoint.y;
        this.pinchPageX = (midpoint.x - pageRect.left) / this.zoom;
        this.pinchPageY = (midpoint.y - pageRect.top) / this.zoom;
        this.cancelCanvasInteraction();
        return;
      }
      if (this.isPinchingCanvas) return;
    }
    const rect = canvas.getBoundingClientRect();
    const scale = this.activePage.width / rect.width;

    const x = (event.clientX - rect.left) * scale;
    const y = (event.clientY - rect.top) * scale;

    if (this.activeTool === 'eraser') {
      this.isDrawing = true;
      this.eraserChanged = false;
      this.eraseAnnotationAt(x, y);
      return;
    }

    if (this.activeTool === 'select') {
      // 1. Check if user tapped a corner handle of the selected annotation
      if (this.selectedAnnotation) {
        const ann = this.selectedAnnotation;
        const hitRadius = 18; // generous touch target in pt units
        if (Math.hypot(x - (ann.x + ann.width), y - (ann.y + ann.height)) <= hitRadius) {
          this.startResizing('br', x, y, ann);
          return;
        } else if (Math.hypot(x - ann.x, y - (ann.y + ann.height)) <= hitRadius) {
          this.startResizing('bl', x, y, ann);
          return;
        } else if (Math.hypot(x - (ann.x + ann.width), y - ann.y) <= hitRadius) {
          this.startResizing('tr', x, y, ann);
          return;
        } else if (Math.hypot(x - ann.x, y - ann.y) <= hitRadius) {
          this.startResizing('tl', x, y, ann);
          return;
        }
      }

      // 2. Check if user tapped an existing annotation to select and drag
      const clicked = this.findAnnotationAt(x, y);
      if (clicked) {
        this.selectedAnnotationId = clicked.id;
        this.isDraggingAnnotation = true;
        this.dragStartX = x;
        this.dragStartY = y;
        this.origAnnX = clicked.x;
        this.origAnnY = clicked.y;
        this.origAnnWidth = clicked.width;
        this.origAnnHeight = clicked.height;
        this.renderAnnotationCanvas();
        return;
      } else {
        this.selectedAnnotationId = null;
        this.renderAnnotationCanvas();
        return;
      }
    }

    // Drawing tools
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

  private startResizing(handle: 'tl' | 'tr' | 'bl' | 'br', x: number, y: number, ann: AnnotationItem) {
    this.isResizing = true;
    this.resizeHandle = handle;
    this.dragStartX = x;
    this.dragStartY = y;
    this.origAnnX = ann.x;
    this.origAnnY = ann.y;
    this.origAnnWidth = ann.width;
    this.origAnnHeight = ann.height;
  }

  onPointerMoveCanvas(event: PointerEvent) {
    if (!this.activePage || !this.annotationCanvasRef) return;
    if (event.pointerType === 'touch' && this.canvasPointers.has(event.pointerId)) {
      event.preventDefault();
      this.canvasPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.isPinchingCanvas && this.canvasPointers.size >= 2) {
        const distance = this.canvasPointerDistance();
        const midpoint = this.canvasPointerMidpoint();
        this.pinchClientX = midpoint.x;
        this.pinchClientY = midpoint.y;
        if (this.pinchStartDistance > 0) this.queuePinchZoom(this.pinchStartZoom * distance / this.pinchStartDistance);
        return;
      }
      if (this.isPinchingCanvas || this.suppressedCanvasPointers.has(event.pointerId)) return;
    }
    const canvas = this.annotationCanvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scale = this.activePage.width / rect.width;

    const x = (event.clientX - rect.left) * scale;
    const y = (event.clientY - rect.top) * scale;

    if (this.activeTool === 'eraser' && this.isDrawing) {
      this.eraseAnnotationAt(x, y);
      return;
    }

    // 1. Resizing with touch corner handle
    if (this.isResizing && this.selectedAnnotation) {
      const ann = this.selectedAnnotation;
      const dx = x - this.dragStartX;
      const dy = y - this.dragStartY;

      if (this.resizeHandle === 'br') {
        ann.width = Math.max(20, this.origAnnWidth + dx);
        ann.height = Math.max(15, this.origAnnHeight + dy);
      } else if (this.resizeHandle === 'bl') {
        const newW = Math.max(20, this.origAnnWidth - dx);
        ann.x = this.origAnnX + (this.origAnnWidth - newW);
        ann.width = newW;
        ann.height = Math.max(15, this.origAnnHeight + dy);
      } else if (this.resizeHandle === 'tr') {
        ann.width = Math.max(20, this.origAnnWidth + dx);
        const newH = Math.max(15, this.origAnnHeight - dy);
        ann.y = this.origAnnY + (this.origAnnHeight - newH);
        ann.height = newH;
      } else if (this.resizeHandle === 'tl') {
        const newW = Math.max(20, this.origAnnWidth - dx);
        const newH = Math.max(15, this.origAnnHeight - dy);
        ann.x = this.origAnnX + (this.origAnnWidth - newW);
        ann.y = this.origAnnY + (this.origAnnHeight - newH);
        ann.width = newW;
        ann.height = newH;
      }
      this.renderAnnotationCanvas();
      return;
    }

    // 2. Dragging/moving selected annotation
    if (this.isDraggingAnnotation && this.selectedAnnotation) {
      const ann = this.selectedAnnotation;
      ann.x = Math.max(0, this.origAnnX + (x - this.dragStartX));
      ann.y = Math.max(0, this.origAnnY + (y - this.dragStartY));
      this.renderAnnotationCanvas();
      return;
    }

    // 3. Drawing new shape/pen
    if (!this.isDrawing) return;

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
    } else if (['rect', 'circle', 'triangle', 'line', 'arrow', 'whiteout'].includes(this.activeTool)) {
      let w = x - this.drawStartX;
      let h = y - this.drawStartY;
      if (event.shiftKey && (this.activeTool === 'line' || this.activeTool === 'arrow')) {
        ({ width: w, height: h } = this.snapLineDelta(w, h));
      } else if (event.shiftKey && ['rect', 'circle', 'triangle'].includes(this.activeTool)) {
        const size = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * size;
        h = Math.sign(h || 1) * size;
      }
      const directional = this.activeTool === 'line' || this.activeTool === 'arrow';
      this.previewShape = {
        id: 'preview',
        type: this.activeTool,
        x: directional ? this.drawStartX : Math.min(this.drawStartX, this.drawStartX + w),
        y: directional ? this.drawStartY : Math.min(this.drawStartY, this.drawStartY + h),
        width: directional ? w : Math.abs(w),
        height: directional ? h : Math.abs(h),
        strokeColor: this.strokeColor,
        strokeWidth: this.strokeWidth
      };
      this.renderAnnotationCanvas();
    }
  }

  onPointerUpCanvas(event?: PointerEvent) {
    if (event?.pointerType === 'touch') {
      const wasSuppressed = this.suppressedCanvasPointers.has(event.pointerId);
      this.canvasPointers.delete(event.pointerId);
      this.suppressedCanvasPointers.delete(event.pointerId);
      if (this.isPinchingCanvas || wasSuppressed) {
        if (this.canvasPointers.size === 0) {
          this.isPinchingCanvas = false;
          this.suppressedCanvasPointers.clear();
          void this.renderActivePage();
        }
        return;
      }
    }
    if (this.activeTool === 'eraser' && this.isDrawing) {
      this.isDrawing = false;
      if (this.eraserChanged) {
        this.saveHistory();
        this.refreshActiveThumbnail();
      }
      return;
    }
    if (this.isResizing || this.isDraggingAnnotation) {
      this.isResizing = false;
      this.resizeHandle = null;
      this.isDraggingAnnotation = false;
      this.saveHistory();
      this.refreshActiveThumbnail();
      return;
    }

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
      this.refreshActiveThumbnail();
    }
  }

  private canvasPointerDistance(): number {
    const points = [...this.canvasPointers.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  private canvasPointerMidpoint(): { x: number; y: number } {
    const points = [...this.canvasPointers.values()];
    if (points.length < 2) return points[0] || { x: 0, y: 0 };
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
  }

  private cancelCanvasInteraction() {
    this.isDrawing = false;
    this.isResizing = false;
    this.resizeHandle = null;
    this.isDraggingAnnotation = false;
    this.previewShape = null;
    this.currentPoints = [];
    this.renderAnnotationCanvas();
  }

  private queuePinchZoom(value: number) {
    this.pendingPinchZoom = Math.max(0.25, Math.min(3, value));
    if (this.pinchFrame !== null) return;
    this.pinchFrame = requestAnimationFrame(() => {
      this.pinchFrame = null;
      this.zoom = Math.round(this.pendingPinchZoom * 100) / 100;
      const page = this.activePage;
      const base = this.pageCanvasRef?.nativeElement;
      const annotations = this.annotationCanvasRef?.nativeElement;
      if (page && base && annotations) {
        const width = `${page.width * this.zoom}px`;
        const height = `${page.height * this.zoom}px`;
        base.style.width = width;
        base.style.height = height;
        annotations.style.width = width;
        annotations.style.height = height;
      }
      this.cdr.detectChanges();
      const viewport = this.canvasViewportRef?.nativeElement;
      if (viewport && base) {
        const pageRect = base.getBoundingClientRect();
        viewport.scrollLeft += pageRect.left + this.pinchPageX * this.zoom - this.pinchClientX;
        viewport.scrollTop += pageRect.top + this.pinchPageY * this.zoom - this.pinchClientY;
      }
    });
  }

  private snapLineDelta(width: number, height: number): { width: number; height: number } {
    const length = Math.hypot(width, height);
    if (!length) return { width, height };
    const angle = Math.atan2(height, width);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return { width: Math.cos(snapped) * length, height: Math.sin(snapped) * length };
  }

  private eraseAnnotationAt(x: number, y: number) {
    if (!this.activePage) return;
    const hit = this.findAnnotationAt(x, y, 12);
    if (!hit) return;
    this.activePage.annotations = this.activePage.annotations.filter(annotation => annotation.id !== hit.id);
    if (this.selectedAnnotationId === hit.id) this.selectedAnnotationId = null;
    this.eraserChanged = true;
    this.renderAnnotationCanvas();
  }

  private findAnnotationAt(x: number, y: number, tolerance = 6): AnnotationItem | undefined {
    if (!this.activePage) return undefined;
    for (let i = this.activePage.annotations.length - 1; i >= 0; i--) {
      const ann = this.activePage.annotations[i];
      if ((ann.type === 'pen' || ann.type === 'highlight') && ann.points?.some(point => Math.hypot(point.x - x, point.y - y) <= tolerance + (ann.strokeWidth || 2) / 2)) return ann;
      if ((ann.type === 'line' || ann.type === 'arrow') && this.pointToSegmentDistance(x, y, ann.x, ann.y, ann.x + ann.width, ann.y + ann.height) <= tolerance + (ann.strokeWidth || 2) / 2) return ann;
      const left = Math.min(ann.x, ann.x + ann.width);
      const right = Math.max(ann.x, ann.x + ann.width);
      const top = Math.min(ann.y, ann.y + ann.height);
      const bottom = Math.max(ann.y, ann.y + ann.height);
      if (x >= left - tolerance && x <= right + tolerance && y >= top - tolerance && y <= bottom + tolerance) {
        return ann;
      }
    }
    return undefined;
  }

  private pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  // Mobile-Friendly Scaling & Font Size Helpers
  scaleSelectedAnnotation(factor: number) {
    if (!this.selectedAnnotation) return;
    const ann = this.selectedAnnotation;
    const oldW = ann.width;
    const oldH = ann.height;
    ann.width = Math.max(24, Math.round(ann.width * factor));
    ann.height = Math.max(16, Math.round(ann.height * factor));
    // Keep centered
    ann.x = Math.max(0, Math.round(ann.x - (ann.width - oldW) / 2));
    ann.y = Math.max(0, Math.round(ann.y - (ann.height - oldH) / 2));
    this.saveHistory();
    this.renderAnnotationCanvas();
    this.refreshActiveThumbnail();
  }

  changeTextFontSize(delta: number) {
    if (!this.selectedAnnotation) return;
    const current = this.selectedAnnotation.fontSize || this.fontSize;
    const next = Math.max(10, Math.min(72, current + delta));
    this.selectedAnnotation.fontSize = next;
    this.saveHistory();
    this.renderAnnotationCanvas();
    this.refreshActiveThumbnail();
  }

  onSelectedAnnotationEdited() {
    this.renderAnnotationCanvas();
    this.refreshActiveThumbnail();
  }

  commitSelectedAnnotationEdit() {
    this.saveHistory();
    this.refreshActiveThumbnail();
  }

  deleteSelectedAnnotation() {
    if (!this.activePage || !this.selectedAnnotationId) return;
    this.activePage.annotations = this.activePage.annotations.filter(a => a.id !== this.selectedAnnotationId);
    this.selectedAnnotationId = null;
    this.saveHistory();
    this.renderAnnotationCanvas();
    this.refreshActiveThumbnail();
  }

  editSelectedText() {
    const annotation = this.selectedAnnotation;
    if (!annotation || annotation.type !== 'text') return;
    const next = prompt('Edit text', annotation.text || '');
    if (next === null) return;
    annotation.text = next;
    annotation.width = Math.max(annotation.width, (annotation.fontSize || 18) * Math.max(3, next.length) * 0.55);
    this.saveHistory();
    this.renderAnnotationCanvas();
    this.refreshActiveThumbnail();
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
          this.refreshActiveThumbnail();
        }
      };
      reader.readAsDataURL(file);
      input.value = '';
    }
  }

  openSignatureModal() {
    this.showSignatureModal = true;
    this.signaturePreviewUrl = '';
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
    this.signaturePreviewUrl = '';
  }

  applySignature() {
    if (!this.activePage) return;
    const sigDataUrl = this.signaturePreviewUrl || this.signatureCanvasRef?.nativeElement.toDataURL('image/png');
    if (!sigDataUrl) return;

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
    this.refreshActiveThumbnail();
  }

  onSignatureImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < pixels.data.length; i += 4) {
          const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
          const brightness = (r + g + b) / 3;
          if (brightness > 238 && Math.max(r, g, b) - Math.min(r, g, b) < 24) pixels.data[i + 3] = 0;
        }
        ctx.putImageData(pixels, 0, 0);
        this.signaturePreviewUrl = canvas.toDataURL('image/png');
        this.cdr.detectChanges();
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  async loadSavedSignatures() {
    try { this.savedSignatures = await this.pdfDocuments.listSignatures(); }
    catch { this.savedSignatures = []; }
    this.cdr.detectChanges();
  }

  useSavedSignature(signature: SavedSignature) {
    const imageUrl = signature.document_json?.image_url;
    if (imageUrl) this.signaturePreviewUrl = imageUrl;
  }

  async saveCurrentSignature() {
    if (!this.auth.isLoggedIn || this.auth.isDemo) return;
    const imageUrl = this.signaturePreviewUrl || this.signatureCanvasRef?.nativeElement.toDataURL('image/png');
    if (!imageUrl) return;
    const title = prompt('Signature name', 'My signature')?.trim();
    if (!title) return;
    await this.pdfDocuments.saveSignature(title, imageUrl);
    await this.loadSavedSignatures();
  }

  async deleteSavedSignature(event: Event, signature: SavedSignature) {
    event.stopPropagation();
    if (!confirm(`Delete saved signature “${signature.title}”?`)) return;
    try {
      await this.pdfDocuments.deleteSignature(signature.id);
      if (this.signaturePreviewUrl === signature.document_json?.image_url) this.signaturePreviewUrl = '';
      await this.loadSavedSignatures();
    } catch (error) {
      console.error('Failed to delete saved signature', error);
      alert('Could not delete this signature. Please try again.');
    }
  }

  private refreshActiveThumbnail() {
    const page = this.activePage;
    const base = this.pageCanvasRef?.nativeElement;
    const annotations = this.annotationCanvasRef?.nativeElement;
    if (!page || !base || !annotations || !base.width || !base.height) return;
    requestAnimationFrame(() => {
      this.renderAnnotationCanvas(false);
      const thumbnail = document.createElement('canvas');
      thumbnail.width = 140;
      thumbnail.height = 198;
      const ctx = thumbnail.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, thumbnail.width, thumbnail.height);
      ctx.drawImage(base, 0, 0, thumbnail.width, thumbnail.height);
      ctx.drawImage(annotations, 0, 0, thumbnail.width, thumbnail.height);
      page.thumbnailUrl = thumbnail.toDataURL('image/jpeg', 0.88);
      this.renderAnnotationCanvas();
      this.cdr.detectChanges();
    });
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(binary);
  }

  private base64ToBytes(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  private async serializeDocument(): Promise<Record<string, unknown>> {
    const pdfBytes = await this.buildPdfBytes();
    return {
      version: 1,
      fileName: this.fileName,
      pages: this.pages,
      sources: [...this.sourcePdfDocs.entries()].map(([id, source]) => ({ id, fileName: source.fileName, pdfBase64: this.bytesToBase64(source.pdfBytes) })),
      pdf_base64: this.bytesToBase64(pdfBytes)
    };
  }

  async saveToMyData() {
    if (!this.auth.isLoggedIn) { alert('Please sign in to save PDF documents to My Data.'); return; }
    if (this.auth.isDemo) { this.auth.notifyDemoUnavailable('Saving PDF documents to My Data'); return; }
    const title = prompt(this.currentDocumentId ? 'Update PDF document' : 'Save PDF document to My Data', this.fileName.replace(/\.pdf$/i, ''))?.trim();
    if (!title) return;
    this.isSavingDocument = true;
    try {
      const document = await this.serializeDocument();
      const wasUpdate = !!this.currentDocumentId;
      const record = this.currentDocumentId
        ? await this.pdfDocuments.update(this.currentDocumentId, title, document)
        : await this.pdfDocuments.save(title, document);
      this.openedReadOnlyShare = false;
      this.currentDocumentId = record.id;
      this.fileName = `${title}.pdf`;
      void this.router.navigate([], { relativeTo: this.route, queryParams: { document: record.id }, replaceUrl: true });
      alert(wasUpdate ? 'PDF document updated in My Data.' : 'PDF document saved to My Data.');
    } catch (error) {
      console.error('Failed to save PDF document', error);
      alert('Could not save the PDF document. Please try again.');
    } finally {
      this.isSavingDocument = false;
      this.cdr.detectChanges();
    }
  }

  async loadSavedDocument(id: string) {
    this.isLoading = true;
    this.loadingMessage = 'Opening PDF document…';
    try {
      const record = await this.pdfDocuments.get(id);
      const document = (record.document_json || {}) as any;
      this.fileName = document.fileName || `${record.title}.pdf`;
      this.pages = Array.isArray(document.pages) ? document.pages : [];
      this.sourcePdfDocs.clear();
      for (const source of document.sources || []) {
        const bytes = this.base64ToBytes(source.pdfBase64);
        const pdfJsDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
        this.sourcePdfDocs.set(source.id, { fileName: source.fileName, pdfBytes: bytes, pdfJsDoc });
      }
      if (!this.pages.length) this.addBlankPage();
      this.openedReadOnlyShare = record.can_edit === false;
      this.currentDocumentId = this.openedReadOnlyShare ? null : record.id;
      this.activePageIndex = 0;
      this.activeMode = 'edit';
      this.history = [];
      this.historyIndex = -1;
      this.saveHistory();
      setTimeout(() => this.fitToWidth(), 30);
    } catch (error) {
      console.error('Failed to open PDF document', error);
      alert('Could not open this PDF document. A new blank document has been created.');
      this.createEmptyDocument();
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
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

  private async buildPdfBytes(): Promise<Uint8Array> {
    const outputDoc = await PDFDocument.create();
    for (const entry of this.sourcePdfDocs.values()) {
      if (!entry.pdfDocInstance) entry.pdfDocInstance = await PDFDocument.load(entry.pdfBytes, { ignoreEncryption: true });
    }
    for (const pageItem of this.pages) {
      let outPage: any;
      if (pageItem.sourceType === 'pdf' && pageItem.sourceDocId && pageItem.originalPageIndex >= 0) {
        const entry = this.sourcePdfDocs.get(pageItem.sourceDocId);
        if (entry?.pdfDocInstance) {
          const [copiedPage] = await outputDoc.copyPages(entry.pdfDocInstance, [pageItem.originalPageIndex]);
          outPage = outputDoc.addPage(copiedPage);
        } else outPage = outputDoc.addPage([pageItem.width, pageItem.height]);
      } else if (pageItem.imageBackgroundUrl) {
        outPage = outputDoc.addPage([pageItem.width, pageItem.height]);
        const embedded = pageItem.imageBackgroundUrl.startsWith('data:image/png')
          ? await outputDoc.embedPng(pageItem.imageBackgroundUrl)
          : await outputDoc.embedJpg(pageItem.imageBackgroundUrl);
        outPage.drawImage(embedded, { x: 0, y: 0, width: outPage.getWidth(), height: outPage.getHeight() });
      } else outPage = outputDoc.addPage([pageItem.width, pageItem.height]);
      if (pageItem.rotation) outPage.setRotation(degrees((outPage.getRotation().angle + pageItem.rotation) % 360));
      if (pageItem.annotations?.length) {
        const overlay = await this.renderAnnotationLayerToImage(pageItem);
        if (overlay) {
          const png = await outputDoc.embedPng(overlay);
          outPage.drawImage(png, { x: 0, y: 0, width: outPage.getWidth(), height: outPage.getHeight() });
        }
      }
    }
    return outputDoc.save();
  }

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
