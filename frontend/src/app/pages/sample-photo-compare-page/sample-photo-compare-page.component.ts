import { ChangeDetectorRef, Component, ElementRef, NgZone, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';

type Period = 'previous' | 'today';
type PhotoSlot = { id: string; url?: string; printUrl?: string; name?: string; rotation?: number; reserved?: boolean; error?: string };

@Component({
  selector: 'app-sample-photo-compare-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="compare-shell">
      <header class="compare-header">
        <div><h1>Photo Comparison</h1><p class="comparison-summary">{{ comparisonCount }} comparisons · {{ pdfPageCount }} PDF {{ pdfPageCount === 1 ? 'page' : 'pages' }}</p></div>
        <button type="button" class="save-pdf" (click)="openSaveDialog()" [disabled]="pendingUploads > 0 || pendingPdfPrep > 0">
          {{ pendingUploads > 0 ? 'Loading photos…' : pendingPdfPrep > 0 ? 'Preparing PDF…' : 'Save PDF' }}
        </button>
      </header>

      <section class="comparison-board">
        <div class="board-title"><input type="text" [(ngModel)]="sampleName" placeholder="Sample name" aria-label="Sample name"></div>

        <section class="photo-row">
          <div class="row-label"><input type="text" [(ngModel)]="previousLabel" aria-label="Earlier photo label"><small>Earlier photos</small></div>
          <div class="slot-grid" #previousGrid (scroll)="syncScroll('previous')">
            <ng-container *ngFor="let slot of displaySlots('previous'); let index = index; trackBy: trackBySlot">
              <article class="photo-slot" (dragover)="$event.preventDefault()" (drop)="dropPhoto($event, 'previous', index)">
                <ng-container *ngIf="slot.url; else previousEmpty">
                  <img [src]="slot.url" [alt]="slot.name || 'Earlier sample photo'" draggable="true"
                    [style.transform]="'rotate(' + (slot.rotation || 0) + 'deg)'" (dragstart)="startPhotoDrag($event, 'previous', index)">
                  <div class="slot-actions"><button type="button" (click)="rotatePhoto('previous', index)" title="Rotate photo">↻</button><button type="button" (click)="clearSlot('previous', index)" title="Delete photo">×</button></div>
                </ng-container>
                <ng-template #previousEmpty><ng-container *ngTemplateOutlet="emptySlot; context: {$implicit: { period: 'previous', index: index, slot: slot }}"></ng-container></ng-template>
              </article>
              <button type="button" class="insert-slot" (click)="insertSlot(index + 1)" title="Insert comparison slot">+</button>
              <div class="page-divider" *ngIf="(index + 1) % 4 === 0 && index < displaySlotCount - 1"><span>Next PDF page</span></div>
            </ng-container>
          </div>
          <label class="upload-action"><input type="file" accept="image/*" multiple (change)="addFiles($event, 'previous')">Upload photos</label>
        </section>

        <div class="comparison-divider"><span>Compare</span></div>

        <section class="photo-row">
          <div class="row-label"><input type="text" [(ngModel)]="todayLabel" aria-label="Current photo label"><small>Current photos</small></div>
          <div class="slot-grid" #todayGrid (scroll)="syncScroll('today')">
            <ng-container *ngFor="let slot of displaySlots('today'); let index = index; trackBy: trackBySlot">
              <article class="photo-slot" (dragover)="$event.preventDefault()" (drop)="dropPhoto($event, 'today', index)">
                <ng-container *ngIf="slot.url; else todayEmpty">
                  <img [src]="slot.url" [alt]="slot.name || 'Current sample photo'" draggable="true"
                    [style.transform]="'rotate(' + (slot.rotation || 0) + 'deg)'" (dragstart)="startPhotoDrag($event, 'today', index)">
                  <div class="slot-actions"><button type="button" (click)="rotatePhoto('today', index)" title="Rotate photo">↻</button><button type="button" (click)="clearSlot('today', index)" title="Delete photo">×</button></div>
                </ng-container>
                <ng-template #todayEmpty><ng-container *ngTemplateOutlet="emptySlot; context: {$implicit: { period: 'today', index: index, slot: slot }}"></ng-container></ng-template>
              </article>
              <button type="button" class="insert-slot" (click)="insertSlot(index + 1)" title="Insert comparison slot">+</button>
              <div class="page-divider" *ngIf="(index + 1) % 4 === 0 && index < displaySlotCount - 1"><span>Next PDF page</span></div>
            </ng-container>
          </div>
          <label class="upload-action"><input type="file" accept="image/*" multiple (change)="addFiles($event, 'today')">Upload photos</label>
        </section>
      </section>

      <div class="save-dialog-backdrop" *ngIf="saveDialogOpen" (click)="closeSaveDialog()">
        <section class="save-dialog" role="dialog" aria-modal="true" aria-labelledby="save-pdf-title" (click)="$event.stopPropagation()">
          <h2 id="save-pdf-title">Save PDF</h2>
          <label>File name<input type="text" [(ngModel)]="saveFileName" (keydown.enter)="savePdf()" autofocus></label>
          <p>Chrome will ask where to save the file. Safari saves to its configured Downloads location.</p>
          <div class="save-dialog-actions"><button type="button" class="dialog-cancel" (click)="closeSaveDialog()">Cancel</button><button type="button" class="dialog-save" (click)="savePdf()">Save PDF</button></div>
        </section>
      </div>

      <ng-template #emptySlot let-data>
        <div class="empty-slot" *ngIf="!data.slot.error; else unavailable">
          <label><input type="file" accept="image/*" multiple (change)="addFiles($event, data.period, data.index)"><span>+ Add photo</span><small>Empty slot</small></label>
          <button type="button" (click)="deleteSlot(data.period, data.index)" title="Delete photo slot">×</button>
        </div>
        <ng-template #unavailable><div class="unavailable"><strong>Preview unavailable</strong><small>{{ data.slot.error }}</small><button type="button" (click)="clearSlot(data.period, data.index)">×</button></div></ng-template>
      </ng-template>
    </main>
  `,
  styles: [`
    :host{display:block;min-height:100%;--print-slot-width:260px;--print-slot-height:323px;background:#f6f7f9;color:#172033}.compare-shell{min-height:100%;padding:38px clamp(22px,4vw,72px) 58px;box-sizing:border-box}.compare-header{display:flex;align-items:center;justify-content:space-between;gap:28px;max-width:1540px;margin:0 auto 30px}.compare-header h1{margin:0;color:#172033;font:700 clamp(1.8rem,3vw,2.5rem)/1.1 Georgia,serif}.comparison-summary{margin:8px 0 0;color:#64748b;font:.8rem Arial,sans-serif}.save-pdf{border:1px solid #172033;background:#172033;color:#fff;border-radius:7px;padding:9px 14px;font:600 .8rem Arial,sans-serif;cursor:pointer;white-space:nowrap}.save-pdf:disabled{opacity:.55;cursor:wait}.comparison-board{max-width:1540px;margin:auto;border:1px solid #dce2ea;background:#fff;box-shadow:0 10px 32px rgba(15,23,42,.06)}.board-title{display:flex;align-items:center;padding:18px 24px;border-bottom:1px solid #e7ebf0}.board-title input{width:min(520px,100%);padding:0;border:0;border-bottom:1px solid transparent;outline:0;background:transparent;color:#172033;font:700 1.25rem Georgia,serif}.board-title input:hover,.board-title input:focus{border-bottom-color:#cbd5e1}.photo-row{display:grid;grid-template-columns:150px minmax(0,1fr) 140px;gap:20px;padding:24px;align-items:center}.row-label{align-self:center;padding-top:0;display:flex;flex-direction:column;gap:5px}.row-label input{width:100%;border:0;border-bottom:1px solid transparent;outline:0;background:transparent;color:#172033;font:700 1.05rem Georgia,serif}.row-label input:hover,.row-label input:focus{border-bottom-color:#cbd5e1}.row-label small{color:#7b8796;font:.75rem Arial,sans-serif}.slot-grid{min-width:0;display:flex;align-items:center;gap:10px;overflow-x:scroll;overflow-y:visible;scrollbar-gutter:stable;padding:0 0 12px;overscroll-behavior-x:contain}.slot-grid::-webkit-scrollbar{height:12px}.slot-grid::-webkit-scrollbar-track{background:#eef2f6;border-radius:99px}.slot-grid::-webkit-scrollbar-thumb{background:#94a3b8;border:3px solid #eef2f6;border-radius:99px}.photo-slot{flex:0 0 var(--print-slot-width);height:var(--print-slot-height);position:relative;overflow:hidden;border:1px solid #d9e0e8;background:#f8fafc}.photo-slot img{display:block;width:100%;height:100%;object-fit:contain;transform-origin:center;cursor:grab}.photo-slot img:active{cursor:grabbing}.slot-actions{position:absolute;top:8px;right:8px;display:flex;gap:5px}.slot-actions button,.empty-slot>button,.unavailable>button{width:26px;height:26px;border:0;border-radius:50%;background:rgba(15,23,42,.72);color:#fff;cursor:pointer;font:400 1.2rem/1 Arial,sans-serif}.slot-actions button:first-child{font:600 1rem/1 Arial,sans-serif}.empty-slot{height:100%;position:relative;border:1px dashed #b8c3d0;color:#64748b}.empty-slot label{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;cursor:pointer}.empty-slot span{font:600 .8rem Arial,sans-serif}.empty-slot small{color:#94a3b8;font:.7rem Arial,sans-serif}.empty-slot>button,.unavailable>button{position:absolute;top:8px;right:8px;background:#64748b}.unavailable{height:100%;box-sizing:border-box;padding:28px;display:flex;flex-direction:column;justify-content:center;gap:8px;position:relative;background:#fffaf5;color:#64748b}.unavailable strong{color:#9a3412;font:.9rem Arial,sans-serif}.unavailable small{line-height:1.45}input[type=file]{display:none}.insert-slot{flex:0 0 28px;width:28px;height:28px;padding:0;border:1px solid #c5cfdb;border-radius:50%;background:#fff;color:#475569;cursor:pointer;font:500 1.05rem/1 Arial,sans-serif}.insert-slot:hover{border-color:#334155;color:#172033}.page-divider{position:relative;flex:0 0 18px;height:var(--print-slot-height);border-left:2px dashed #94a3b8;margin:0 5px}.page-divider span{position:absolute;top:-22px;left:50%;transform:translateX(-50%);width:max-content;color:#64748b;font:700 .63rem Arial,sans-serif;text-transform:uppercase;letter-spacing:.05em}.upload-action{display:flex;align-items:center;justify-content:center;width:140px;height:34px;border:1px solid #b9c6d7;border-radius:6px;color:#334155;cursor:pointer;font:600 .75rem Arial,sans-serif;white-space:nowrap}.comparison-divider{position:relative;height:1px;margin:0 24px;background:#dce3eb}.comparison-divider span{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:0 12px;background:#fff;color:#94a3b8;text-transform:uppercase;letter-spacing:.12em;font:700 .65rem Arial,sans-serif}.save-dialog-backdrop{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;padding:24px;background:rgba(15,23,42,.42)}.save-dialog{width:min(430px,100%);border-radius:12px;padding:24px;background:#fff;box-shadow:0 24px 65px rgba(15,23,42,.28)}.save-dialog h2{margin:0 0 20px;font:700 1.35rem Georgia,serif}.save-dialog label{display:grid;gap:7px;color:#475569;font:700 .75rem Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em}.save-dialog input{min-width:0;border:1px solid #cbd5e1;border-radius:6px;padding:10px;color:#172033;font:.95rem Arial,sans-serif;text-transform:none;letter-spacing:0}.save-dialog p{margin:14px 0 0;color:#64748b;font:.78rem/1.45 Arial,sans-serif}.save-dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}.save-dialog-actions button{border-radius:6px;padding:9px 13px;font:600 .8rem Arial,sans-serif;cursor:pointer}.dialog-cancel{border:1px solid #cbd5e1;background:#fff;color:#475569}.dialog-save{border:1px solid #172033;background:#172033;color:#fff}@media(max-width:850px){:host{--print-slot-width:240px;--print-slot-height:298px}.compare-header{display:block}.save-pdf{margin-top:18px}.photo-row{grid-template-columns:1fr;gap:10px;align-items:start}.row-label{align-self:start}.upload-action{width:140px}}
  `]
})
export class SamplePhotoComparePageComponent {
  @ViewChild('previousGrid') previousGrid?: ElementRef<HTMLElement>;
  @ViewChild('todayGrid') todayGrid?: ElementRef<HTMLElement>;
  readonly title = 'Photo Comparison';
  sampleName = 'Sample';
  previousLabel = 'Previous';
  todayLabel = 'Today';
  previous: PhotoSlot[] = [this.emptySlot(), this.emptySlot()];
  today: PhotoSlot[] = [this.emptySlot(), this.emptySlot()];
  pendingUploads = 0;
  pendingPdfPrep = 0;
  saveDialogOpen = false;
  saveFileName = '';
  private pdfQueue: PhotoSlot[] = [];
  private activePdfConversions = 0;
  private pendingSyncedScroll: { period: Period; left: number } | null = null;

  constructor(private zone: NgZone, private cdr: ChangeDetectorRef) {}

  get displaySlotCount() { return Math.max(1, this.previous.length, this.today.length); }
  get previousPhotoCount() { return this.previous.filter(slot => !!slot.url).length; }
  get todayPhotoCount() { return this.today.filter(slot => !!slot.url).length; }
  get comparisonCount() { return this.displaySlotCount; }
  get pdfPageCount() { return Math.max(1, Math.ceil(this.comparisonCount / 4)); }
  displaySlots(period: Period): PhotoSlot[] {
    const slots = this[period];
    return Array.from({ length: this.displaySlotCount }, (_, index) => slots[index] ?? { id: `${period}-virtual-${index}` });
  }
  trackBySlot(_index: number, slot: PhotoSlot) { return slot.id; }
  insertSlot(index: number) {
    this.ensureComparisonSlot(index);
    this.previous.splice(index, 0, this.emptySlot(true));
    this.today.splice(index, 0, this.emptySlot(true));
    this.refresh();
  }
  deleteSlot(period: Period, index: number) {
    const slots = this[period];
    if (index >= slots.length) return;
    if (slots.length <= 1) slots[0] = this.emptySlot(true);
    else slots.splice(index, 1);
    this.refresh();
  }
  clearSlot(period: Period, index: number) { this.ensureComparisonSlot(index); this[period][index] = this.emptySlot(true); this.refresh(); }
  rotatePhoto(period: Period, index: number) {
    const slot = this[period][index];
    if (!slot?.url) return;
    slot.rotation = ((slot.rotation || 0) + 90) % 360;
    this.preparePdfImage(slot); this.refresh();
  }
  startPhotoDrag(event: DragEvent, period: Period, index: number) {
    event.dataTransfer?.setData('application/x-sample-photo', JSON.stringify({ period, index }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  dropPhoto(event: DragEvent, period: Period, targetIndex: number) {
    event.preventDefault();
    const raw = event.dataTransfer?.getData('application/x-sample-photo');
    if (!raw) return;
    const source = JSON.parse(raw) as { period: Period; index: number };
    const sourceSlot = this[source.period][source.index];
    if (!sourceSlot?.url || (source.period === period && source.index === targetIndex)) return;
    this.ensureComparisonSlot(targetIndex);
    const replacement = this[period][targetIndex];
    this[period][targetIndex] = sourceSlot;
    this[source.period][source.index] = replacement;
    this.refresh();
  }
  syncScroll(source: Period) {
    const from = source === 'previous' ? this.previousGrid?.nativeElement : this.todayGrid?.nativeElement;
    const to = source === 'previous' ? this.todayGrid?.nativeElement : this.previousGrid?.nativeElement;
    if (!from || !to) return;
    // Ignore only the scroll event generated by the synchronized partner.
    // The two grids deliberately contain the same number of fixed-width slots,
    // so copying the exact pixel position keeps each upper/lower pair aligned.
    if (this.pendingSyncedScroll?.period === source && Math.abs(from.scrollLeft - this.pendingSyncedScroll.left) < 1) {
      this.pendingSyncedScroll = null;
      return;
    }
    this.pendingSyncedScroll = { period: source === 'previous' ? 'today' : 'previous', left: from.scrollLeft };
    to.scrollLeft = from.scrollLeft;
  }
  addFiles(event: Event, period: Period, targetIndex?: number) {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    if (!files.length) return;
    const slots = this[period];
    const indexes = targetIndex === undefined
      ? slots.map((slot, index) => (!slot.url ? index : -1)).filter(index => index >= 0)
      : [targetIndex];
    if (targetIndex !== undefined) this.ensureComparisonSlot(targetIndex);
    while (indexes.length < files.length) {
      this.previous.push(this.emptySlot());
      this.today.push(this.emptySlot());
      indexes.push(this.previous.length - 1);
    }
    this.pendingUploads += files.length;
    this.refresh();
    files.forEach((file, fileIndex) => {
      const index = indexes[fileIndex];
      if (/\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type)) {
        slots[index] = { id: this.makeId(), name: file.name, error: 'HEIC/HEIF cannot be previewed here. Convert it to JPEG or PNG first.' };
        this.pendingUploads--; this.refresh(); return;
      }
      const slot: PhotoSlot = { id: this.makeId(), url: URL.createObjectURL(file), name: file.name };
      slots[index] = slot;
      this.pendingUploads--; this.preparePdfImage(slot); this.refresh();
    });
    (event.target as HTMLInputElement).value = '';
  }
  openSaveDialog() {
    if (this.pendingUploads > 0 || this.pendingPdfPrep > 0) return;
    this.saveFileName = `${(this.sampleName || 'sample').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'sample'}-photo-comparison.pdf`;
    this.saveDialogOpen = true;
  }
  closeSaveDialog() { this.saveDialogOpen = false; }
  async savePdf() {
    if (this.pendingUploads > 0 || this.pendingPdfPrep > 0) return;
    const previous = this.printSlots(this.previous);
    const today = this.printSlots(this.today);
    const pageCount = Math.ceil(Math.max(previous.length, today.length) / 4);
    if (!pageCount || (!this.previousPhotoCount && !this.todayPhotoCount)) { alert('Add at least one photo before saving a PDF.'); return; }

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const gap = 3;
    const cellWidth = (pageWidth - margin * 2 - gap * 3) / 4;
    const headerHeight = 12;
    const rowGap = 5;
    const rowLabelHeight = 7;
    const rowHeight = (pageHeight - margin * 2 - headerHeight - rowLabelHeight * 2 - rowGap) / 2;

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      if (pageIndex) pdf.addPage('a4', 'landscape');
      pdf.setTextColor(23, 32, 51);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text(this.sampleName || 'Sample', margin, margin + 4);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(8);
      pdf.text(`${Math.max(previous.length, today.length)} comparisons · ${pageIndex + 1} / ${pageCount}`, pageWidth - margin, margin + 4, { align: 'right' });
      pdf.setDrawColor(203, 213, 225);
      pdf.line(margin, margin + headerHeight - 1, pageWidth - margin, margin + headerHeight - 1);
      this.drawPdfRow(pdf, this.previousLabel || 'Previous', previous.slice(pageIndex * 4, pageIndex * 4 + 4), margin, margin + headerHeight, cellWidth, rowHeight, gap, rowLabelHeight);
      this.drawPdfRow(pdf, this.todayLabel || 'Today', today.slice(pageIndex * 4, pageIndex * 4 + 4), margin, margin + headerHeight + rowLabelHeight + rowHeight + rowGap, cellWidth, rowHeight, gap, rowLabelHeight);
    }
    const requestedName = this.saveFileName.trim() || 'photo-comparison.pdf';
    const filename = requestedName.toLowerCase().endsWith('.pdf') ? requestedName : `${requestedName}.pdf`;
    const blob = pdf.output('blob');
    this.saveDialogOpen = false;
    try {
      const picker = (window as any).showSaveFilePicker;
      if (typeof picker === 'function') {
        const handle = await picker({ suggestedName: filename, types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }] });
        const stream = await handle.createWritable();
        await stream.write(blob);
        await stream.close();
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = filename; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') alert('The PDF could not be saved. Please try again.');
    }
  }
  private drawPdfRow(pdf: jsPDF, label: string, slots: PhotoSlot[], x: number, y: number, cellWidth: number, height: number, gap: number, labelHeight: number) {
    pdf.setTextColor(23, 32, 51);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(label, x, y + 4.5);
    for (let index = 0; index < 4; index++) {
      const cellX = x + index * (cellWidth + gap);
      const cellY = y + labelHeight;
      const slot = slots[index];
      pdf.setDrawColor(214, 220, 229);
      pdf.rect(cellX, cellY, cellWidth, height);
      if (!slot?.printUrl) continue;
      try {
        const image = pdf.getImageProperties(slot.printUrl);
        const scale = Math.min((cellWidth - 2) / image.width, (height - 2) / image.height);
        const width = image.width * scale;
        const imageHeight = image.height * scale;
        pdf.addImage(slot.printUrl, 'JPEG', cellX + (cellWidth - width) / 2, cellY + (height - imageHeight) / 2, width, imageHeight, undefined, 'FAST');
      } catch { /* A single unsupported image should not prevent the rest of the PDF from downloading. */ }
    }
  }
  private printSlots(slots: PhotoSlot[]) { return [...slots]; }
  private ensureComparisonSlot(index: number) {
    while (this.previous.length <= index) this.previous.push(this.emptySlot());
    while (this.today.length <= index) this.today.push(this.emptySlot());
  }
  private emptySlot(reserved = false): PhotoSlot { return { id: this.makeId(), reserved }; }
  private makeId(): string { return typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
  private refresh() { this.cdr.detectChanges(); }
  private preparePdfImage(slot: PhotoSlot) { if (!slot.url) return; this.pendingPdfPrep++; this.pdfQueue.push(slot); this.processPdfQueue(); }
  private processPdfQueue() { while (this.activePdfConversions < 2 && this.pdfQueue.length) this.convertForPdf(this.pdfQueue.shift()!); }
  private convertForPdf(slot: PhotoSlot) {
    this.activePdfConversions++;
    const image = new Image();
    image.onload = () => {
      const maxSide = 1400; const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale)); const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const turned = (slot.rotation || 0) % 180 !== 0; const canvas = document.createElement('canvas'); canvas.width = turned ? height : width; canvas.height = turned ? width : height;
      const context = canvas.getContext('2d');
      if (context) { context.translate(canvas.width / 2, canvas.height / 2); context.rotate((slot.rotation || 0) * Math.PI / 180); context.drawImage(image, -width / 2, -height / 2, width, height); slot.printUrl = canvas.toDataURL('image/jpeg', .82); }
      this.zone.run(() => { this.pendingPdfPrep--; this.activePdfConversions--; this.refresh(); this.processPdfQueue(); });
    };
    image.onerror = () => this.zone.run(() => { this.pendingPdfPrep--; this.activePdfConversions--; this.refresh(); this.processPdfQueue(); });
    image.src = slot.url!;
  }
}
