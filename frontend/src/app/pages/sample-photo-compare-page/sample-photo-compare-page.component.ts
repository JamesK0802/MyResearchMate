import { ChangeDetectorRef, Component, ElementRef, NgZone, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type PhotoSlot = {
  id: string;
  url?: string;
  printUrl?: string;
  name?: string;
  rotation?: number;
  reserved?: boolean;
  error?: string;
};

@Component({
  selector: 'app-sample-photo-compare-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="compare-shell">
      <header class="compare-header">
        <div>
          <h1>Photo comparison</h1>
        </div>
        <button type="button" class="save-pdf" (click)="savePdf()" [disabled]="pendingImages > 0">
          {{ pendingImages ? 'Preparing images…' : 'Save PDF' }}
        </button>
      </header>

      <section class="comparison-board">
        <div class="board-title">
          <input type="text" [(ngModel)]="sampleName" placeholder="Sample name" aria-label="Sample name">
        </div>

        <section class="photo-row">
          <div class="row-label"><input type="text" [(ngModel)]="previousLabel" aria-label="Earlier photo label"><small>Earlier photos</small></div>
          <div class="slot-grid" #previousGrid (scroll)="syncScroll('previous')">
            <ng-container *ngFor="let slot of previous; let index = index">
              <article class="photo-slot" (dragover)="$event.preventDefault()" (drop)="dropPhoto($event, 'previous', index)">
                <ng-container *ngIf="slot.url; else previousEmpty">
                  <img [src]="slot.url" [alt]="slot.name || 'Earlier sample photo'" draggable="true"
                    [style.transform]="'rotate(' + (slot.rotation || 0) + 'deg)'" (dragstart)="startPhotoDrag($event, 'previous', index)">
                  <div class="slot-actions">
                    <button type="button" (click)="rotatePhoto('previous', index)" title="Rotate photo">↻</button>
                    <button type="button" (click)="clearSlot('previous', index)" title="Delete photo">×</button>
                  </div>
                </ng-container>
                <ng-template #previousEmpty><ng-container *ngTemplateOutlet="emptySlot; context: {$implicit: { period: 'previous', index: index, slot: slot }}"></ng-container></ng-template>
              </article>
              <button type="button" class="insert-slot" (click)="insertSlot('previous', index + 1)" title="Insert photo slot">+</button>
            </ng-container>
          </div>
          <label class="upload-action"><input type="file" accept="image/*" multiple (change)="addFiles($event, 'previous')">Upload photos</label>
        </section>

        <div class="comparison-divider"><span>Compare</span></div>

        <section class="photo-row">
          <div class="row-label"><input type="text" [(ngModel)]="todayLabel" aria-label="Current photo label"><small>Current photos</small></div>
          <div class="slot-grid" #todayGrid (scroll)="syncScroll('today')">
            <ng-container *ngFor="let slot of today; let index = index">
              <article class="photo-slot" (dragover)="$event.preventDefault()" (drop)="dropPhoto($event, 'today', index)">
                <ng-container *ngIf="slot.url; else todayEmpty">
                  <img [src]="slot.url" [alt]="slot.name || 'Current sample photo'" draggable="true"
                    [style.transform]="'rotate(' + (slot.rotation || 0) + 'deg)'" (dragstart)="startPhotoDrag($event, 'today', index)">
                  <div class="slot-actions">
                    <button type="button" (click)="rotatePhoto('today', index)" title="Rotate photo">↻</button>
                    <button type="button" (click)="clearSlot('today', index)" title="Delete photo">×</button>
                  </div>
                </ng-container>
                <ng-template #todayEmpty><ng-container *ngTemplateOutlet="emptySlot; context: {$implicit: { period: 'today', index: index, slot: slot }}"></ng-container></ng-template>
              </article>
              <button type="button" class="insert-slot" (click)="insertSlot('today', index + 1)" title="Insert photo slot">+</button>
            </ng-container>
          </div>
          <label class="upload-action"><input type="file" accept="image/*" multiple (change)="addFiles($event, 'today')">Upload photos</label>
        </section>
      </section>

      <ng-template #emptySlot let-data>
        <div class="empty-slot" *ngIf="!data.slot.error; else unavailable">
          <label><input type="file" accept="image/*" multiple (change)="addFiles($event, data.period, data.index)"><span>+ Add photo</span><small>Empty slot</small></label>
          <button *ngIf="data.slot.reserved" type="button" (click)="deleteSlot(data.period, data.index)" title="Delete empty slot">×</button>
        </div>
        <ng-template #unavailable><div class="unavailable"><strong>Preview unavailable</strong><small>{{ data.slot.error }}</small><button type="button" (click)="clearSlot(data.period, data.index)">×</button></div></ng-template>
      </ng-template>
    </main>
  `,
  styles: [`
    :host{display:block;min-height:100%;background:#f6f7f9;color:#172033}.compare-shell{min-height:100%;padding:38px clamp(22px,4vw,72px) 58px;box-sizing:border-box}.compare-header{display:flex;align-items:end;justify-content:space-between;gap:28px;max-width:1540px;margin:0 auto 30px}.eyebrow{margin:0 0 7px;color:#64748b;font:700 .7rem Arial,sans-serif;letter-spacing:.13em}.page-title{width:min(680px,80vw);padding:0;border:0;border-bottom:1px solid transparent;outline:0;background:transparent;color:#172033;font:700 clamp(1.7rem,3vw,2.45rem)/1.1 Georgia,serif}.page-title:hover,.page-title:focus{border-bottom-color:#cbd5e1}.subtitle{margin:10px 0 0;color:#64748b}.save-pdf{border:1px solid #172033;background:#172033;color:#fff;border-radius:7px;padding:9px 14px;font:600 .8rem Arial,sans-serif;cursor:pointer;white-space:nowrap}.save-pdf:disabled{opacity:.55;cursor:wait}.comparison-board{max-width:1540px;margin:auto;border:1px solid #dce2ea;background:#fff;box-shadow:0 10px 32px rgba(15,23,42,.06)}.board-title{display:flex;align-items:baseline;gap:14px;padding:18px 24px;border-bottom:1px solid #e7ebf0}.board-title label{color:#64748b;font:700 .7rem Arial,sans-serif;text-transform:uppercase;letter-spacing:.1em}.board-title input,.row-label input{border:0;border-bottom:1px solid #cbd5e1;outline:0;background:transparent;color:#172033;font:700 1.05rem Georgia,serif}.board-title small{margin-left:auto;color:#64748b;font:600 .72rem Arial,sans-serif}.photo-row{display:grid;grid-template-columns:135px minmax(0,1fr) 112px;gap:20px;padding:24px;align-items:start}.row-label{padding-top:8px;display:flex;flex-direction:column;gap:5px}.row-label input{width:100%;border-bottom-color:transparent}.row-label input:hover,.row-label input:focus{border-bottom-color:#cbd5e1}.row-label small{color:#7b8796;font:.75rem Arial,sans-serif}.slot-grid{min-width:0;display:flex;align-items:center;gap:10px;overflow-x:scroll;overflow-y:visible;scrollbar-gutter:stable;padding:0 0 12px;overscroll-behavior-x:contain}.slot-grid::-webkit-scrollbar{height:12px}.slot-grid::-webkit-scrollbar-track{background:#eef2f6;border-radius:99px}.slot-grid::-webkit-scrollbar-thumb{background:#94a3b8;border:3px solid #eef2f6;border-radius:99px}.photo-slot{flex:0 0 360px;height:300px;position:relative;overflow:hidden;border:1px solid #d9e0e8;background:#f8fafc}.photo-slot img{display:block;width:100%;height:100%;object-fit:contain;transform-origin:center;cursor:grab}.photo-slot img:active{cursor:grabbing}.slot-actions{position:absolute;top:8px;right:8px;display:flex;gap:5px}.slot-actions button,.empty-slot>button,.unavailable>button{width:26px;height:26px;border:0;border-radius:50%;background:rgba(15,23,42,.72);color:#fff;cursor:pointer;font:400 1.2rem/1 Arial,sans-serif}.slot-actions button:first-child{font:600 1rem/1 Arial,sans-serif}.empty-slot{height:100%;position:relative;border:1px dashed #b8c3d0;color:#64748b}.empty-slot label{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;cursor:pointer}.empty-slot span{font:600 .8rem Arial,sans-serif}.empty-slot small{color:#94a3b8;font:.7rem Arial,sans-serif}.empty-slot>button,.unavailable>button{position:absolute;top:8px;right:8px;background:#64748b}.unavailable{height:100%;box-sizing:border-box;padding:28px;display:flex;flex-direction:column;justify-content:center;gap:8px;position:relative;background:#fffaf5;color:#64748b}.unavailable strong{color:#9a3412;font:.9rem Arial,sans-serif}.unavailable small{line-height:1.45}input[type=file]{display:none}.insert-slot{flex:0 0 28px;width:28px;height:28px;padding:0;border:1px solid #c5cfdb;border-radius:50%;background:#fff;color:#475569;cursor:pointer;font:500 1.05rem/1 Arial,sans-serif}.insert-slot:hover{border-color:#334155;color:#172033}.upload-action{display:flex;align-items:center;justify-content:center;height:34px;border:1px solid #b9c6d7;border-radius:6px;color:#334155;cursor:pointer;font:600 .75rem Arial,sans-serif}.comparison-divider{position:relative;height:1px;margin:0 24px;background:#dce3eb}.comparison-divider span{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:0 12px;background:#fff;color:#94a3b8;text-transform:uppercase;letter-spacing:.12em;font:700 .65rem Arial,sans-serif}@media(max-width:850px){.compare-header{display:block}.save-pdf{margin-top:18px}.photo-row{grid-template-columns:1fr;gap:10px}.upload-action{width:120px}.row-label{padding:0}}
  `, `
    .compare-header { align-items:center; }
    .compare-header h1 { margin:0; color:#172033; font:700 clamp(1.8rem,3vw,2.5rem)/1.1 Georgia,serif; }
    .board-title { align-items:center; }
    .board-title > input { width:min(520px,100%); padding:0; border:0; border-bottom:1px solid transparent; outline:0; background:transparent; color:#172033; font:700 1.25rem Georgia,serif; }
    .board-title > input:hover, .board-title > input:focus { border-bottom-color:#cbd5e1; }
    .photo-row { grid-template-columns:150px minmax(0,1fr) 140px; align-items:center; }
    .row-label { align-self:center; padding-top:0; }
    .upload-action { width:140px; white-space:nowrap; }
    @media(max-width:850px) { .photo-row { align-items:start; } .row-label { align-self:start; } .upload-action { width:140px; } }
  `]
})
export class SamplePhotoComparePageComponent {
  @ViewChild('previousGrid') previousGrid?: ElementRef<HTMLElement>;
  @ViewChild('todayGrid') todayGrid?: ElementRef<HTMLElement>;
  title = 'Photo comparison';
  sampleName = 'Sample';
  previousLabel = 'Previous';
  todayLabel = 'Today';
  previous: PhotoSlot[] = [this.emptySlot(), this.emptySlot()];
  today: PhotoSlot[] = [this.emptySlot(), this.emptySlot()];
  pendingImages = 0;

  constructor(private zone: NgZone, private cdr: ChangeDetectorRef) {}

  photoCount(slots: PhotoSlot[]) { return slots.filter(slot => !!slot.url).length; }
  insertSlot(period: 'previous' | 'today', index: number) { this[period].splice(index, 0, this.emptySlot(true)); this.refresh(); }
  deleteSlot(period: 'previous' | 'today', index: number) { this[period].splice(index, 1); this.refresh(); }
  clearSlot(period: 'previous' | 'today', index: number) { this[period][index] = this.emptySlot(true); this.refresh(); }
  rotatePhoto(period: 'previous' | 'today', index: number) {
    const slot = this[period][index];
    if (!slot.url) return;
    slot.rotation = ((slot.rotation || 0) + 90) % 360;
    this.preparePrintImage(slot);
    this.refresh();
  }
  startPhotoDrag(event: DragEvent, period: 'previous' | 'today', index: number) {
    event.dataTransfer?.setData('application/x-sample-photo', JSON.stringify({ period, index }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }
  dropPhoto(event: DragEvent, period: 'previous' | 'today', targetIndex: number) {
    event.preventDefault();
    const raw = event.dataTransfer?.getData('application/x-sample-photo');
    if (!raw) return;
    const source = JSON.parse(raw) as { period: 'previous' | 'today'; index: number };
    const sourceSlot = this[source.period][source.index];
    if (!sourceSlot?.url || (source.period === period && source.index === targetIndex)) return;
    const replacement = this[period][targetIndex];
    this[period][targetIndex] = sourceSlot;
    this[source.period][source.index] = replacement;
    this.refresh();
  }
  syncScroll(source: 'previous' | 'today') {
    const from = source === 'previous' ? this.previousGrid?.nativeElement : this.todayGrid?.nativeElement;
    const to = source === 'previous' ? this.todayGrid?.nativeElement : this.previousGrid?.nativeElement;
    if (!from || !to || !from.scrollWidth || !to.scrollWidth) return;
    const range = from.scrollWidth - from.clientWidth;
    const targetRange = to.scrollWidth - to.clientWidth;
    if (range > 0 && targetRange > 0) to.scrollLeft = (from.scrollLeft / range) * targetRange;
  }
  addFiles(event: Event, period: 'previous' | 'today', targetIndex?: number) {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    if (!files.length) return;
    const slots = this[period];
    const indexes = targetIndex === undefined
      ? slots.map((slot, index) => !slot.url && !slot.reserved ? index : -1).filter(index => index >= 0)
      : [targetIndex];
    while (indexes.length < files.length) { slots.push(this.emptySlot()); indexes.push(slots.length - 1); }
    this.pendingImages += files.length;
    files.forEach((file, fileIndex) => {
      const index = indexes[fileIndex];
      if (/\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type)) {
        slots[index] = { id: crypto.randomUUID(), name: file.name, error: 'HEIC/HEIF cannot be previewed here. Convert it to JPEG or PNG first.' };
        this.pendingImages--; this.refresh(); return;
      }
      const slot: PhotoSlot = { id: crypto.randomUUID(), url: URL.createObjectURL(file), name: file.name };
      slots[index] = slot;
      this.pendingImages--; this.preparePrintImage(slot); this.refresh();
    });
    (event.target as HTMLInputElement).value = '';
  }
  savePdf() {
    const windowRef = window.open('', '_blank');
    if (!windowRef) { alert('Allow pop-ups for this page to save the PDF.'); return; }
    const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
    const row = (label: string, slots: PhotoSlot[]) => `<section><h2>${escape(label)}</h2><div class="photos">${slots.filter(slot => slot.url || slot.reserved).map(slot => slot.url ? `<div class="photo"><img src="${slot.printUrl || slot.url}" alt="${escape(slot.name || 'Sample photo')}"></div>` : '<div class="photo blank">Blank slot</div>').join('')}</div></section>`;
    windowRef.document.write(`<!doctype html><html><head><title>${escape(this.title)}</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#172033}.page{height:190mm;display:flex;flex-direction:column;gap:5mm}header{border-bottom:.4mm solid #172033;padding-bottom:2mm;font:700 15pt Georgia,serif}section{min-height:0;flex:1;display:grid;grid-template-columns:18mm 1fr;gap:4mm}h2{margin:0;font:700 12pt Georgia,serif;writing-mode:vertical-rl;transform:rotate(180deg)}.photos{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4mm;min-height:0}.photo{overflow:hidden;border:.25mm solid #d6dce5}.blank{display:grid;place-items:center;border-style:dashed;color:#94a3b8;font:8pt Arial}.photo img{width:100%;height:100%;object-fit:fill;display:block}</style></head><body><article class="page"><header>${escape(this.title)} · ${escape(this.sampleName)}</header>${row(this.previousLabel, this.previous)}${row(this.todayLabel, this.today)}</article></body></html>`);
    windowRef.document.close();
    requestAnimationFrame(() => { windowRef.focus(); windowRef.print(); });
  }
  private emptySlot(reserved = false): PhotoSlot { return { id: crypto.randomUUID(), reserved }; }
  private refresh() { this.cdr.detectChanges(); }
  private preparePrintImage(slot: PhotoSlot) {
    if (!slot.url) return;
    this.pendingImages++;
    const image = new Image();
    image.onload = () => {
      const maxSide = 1400;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const turned = (slot.rotation || 0) % 180 !== 0;
      const canvas = document.createElement('canvas'); canvas.width = turned ? height : width; canvas.height = turned ? width : height;
      const context = canvas.getContext('2d');
      if (context) { context.translate(canvas.width / 2, canvas.height / 2); context.rotate((slot.rotation || 0) * Math.PI / 180); context.drawImage(image, -width / 2, -height / 2, width, height); slot.printUrl = canvas.toDataURL('image/jpeg', .82); }
      this.zone.run(() => { this.pendingImages--; this.refresh(); });
    };
    image.onerror = () => this.zone.run(() => { this.pendingImages--; this.refresh(); });
    image.src = slot.url;
  }
}
