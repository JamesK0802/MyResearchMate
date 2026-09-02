import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { jsPDF } from 'jspdf';
import { NamuLeafNote, NamuNode, NamuTree } from '../../models/namu.model';
import { NamuStorageService } from '../../services/namu-storage.service';

interface NotebookPage {
  node: NamuNode;
  continuation: number;
  stepStart: number;
  stepEnd: number;
  notes: NamuLeafNote[];
  showNotes: boolean;
}

@Component({
  selector: 'app-namu-notebook-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="notebook-shell">
      <header class="notebook-controls">
        <div class="notebook-title">{{ tree.name }}</div>
        <div class="notebook-actions">
          <select class="notebook-tree-select"
            *ngIf="trees.length > 1"
            [ngModel]="tree.id"
            (ngModelChange)="treeChange.emit($event)"
            aria-label="Select protocol tree">
            <option *ngFor="let item of trees" [value]="item.id">{{ item.name }} ({{ item.nodes.length }})</option>
          </select>
          <button type="button" [class.active]="layout === 'spread'" (click)="setLayout('spread')">2 Pages</button>
          <button type="button" [class.active]="layout === 'overview'" (click)="setLayout('overview')">8 Pages</button>
          <button type="button" (click)="printNotebook()" [disabled]="generatingPdf">{{ generatingPdf ? 'Preparing PDF ' + pdfProgress + '…' : 'Preview PDF' }}</button>
        </div>
      </header>

      <p class="notebook-empty" *ngIf="!tree.nodes.length">This tree has no nodes.</p>
      <p class="notebook-pdf-error" *ngIf="pdfError">{{ pdfError }}</p>

      <div class="screen-notebook"
        [class.screen-spread]="layout === 'spread'"
        [class.screen-overview]="layout === 'overview'"
        *ngIf="tree.nodes.length">
        <div class="notebook-spread" *ngIf="layout === 'spread'" [class.turning]="turning">
          <div class="notebook-spine" aria-hidden="true"></div>
          <article class="notebook-page left-page" *ngIf="spreadPages[0] as notebookPage">
            <ng-container *ngTemplateOutlet="pageTemplate; context: { $implicit: notebookPage, editable: true }"></ng-container>
          </article>
          <article class="notebook-page right-page" *ngIf="spreadPages[1] as notebookPage; else blankPage">
            <ng-container *ngTemplateOutlet="pageTemplate; context: { $implicit: notebookPage, editable: true }"></ng-container>
          </article>
        </div>

        <div class="notebook-pagination" *ngIf="layout === 'spread'">
          <button type="button" (click)="previousSpread()" [disabled]="spreadStart === 0">Previous</button>
          <span>{{ spreadStart + 1 }}–{{ Math.min(spreadStart + 2, cachedPages.length) }} of {{ cachedPages.length }}</span>
          <button type="button" (click)="nextSpread()" [disabled]="spreadStart + 2 >= cachedPages.length">Next</button>
        </div>

        <div class="notebook-overview" *ngIf="layout === 'overview'">
          <div class="overview-spread-cell" *ngFor="let pair of overviewSpreads; trackBy: trackByIndex">
            <section class="notebook-spread overview-spread">
              <div class="notebook-spine" aria-hidden="true"></div>
              <article class="notebook-page left-page" *ngIf="pair[0] as notebookPage">
                <ng-container *ngTemplateOutlet="pageTemplate; context: { $implicit: notebookPage, editable: false }"></ng-container>
              </article>
              <article class="notebook-page right-page" *ngIf="pair[1] as notebookPage; else blankPage">
                <ng-container *ngTemplateOutlet="pageTemplate; context: { $implicit: notebookPage, editable: false }"></ng-container>
              </article>
            </section>
          </div>
        </div>

        <div class="notebook-pagination" *ngIf="layout === 'overview'">
          <button type="button" (click)="previousOverview()" [disabled]="overviewStart === 0">Previous</button>
          <span>{{ overviewStart + 1 }}–{{ Math.min(overviewStart + 8, cachedPages.length) }} of {{ cachedPages.length }}</span>
          <button type="button" (click)="nextOverview()" [disabled]="overviewStart + 8 >= cachedPages.length">Next</button>
        </div>
      </div>

      <!-- Created only while printing -->
      <div #pdfNotebook class="print-notebook" [class.pdf-rendering]="pdfRendering" *ngIf="(printing || pdfRendering) && tree.nodes.length">
        <ng-container *ngIf="layout === 'spread'">
          <section class="notebook-spread print-spread" *ngFor="let pair of printSpreads; trackBy: trackByIndex">
            <div class="notebook-spine" aria-hidden="true"></div>
            <article class="notebook-page left-page">
              <ng-container *ngTemplateOutlet="pageTemplate; context: { $implicit: pair[0], editable: false }"></ng-container>
            </article>
            <article class="notebook-page right-page" *ngIf="pair[1] as notebookPage">
              <ng-container *ngTemplateOutlet="pageTemplate; context: { $implicit: notebookPage, editable: false }"></ng-container>
            </article>
            <article class="notebook-page right-page blank-page" *ngIf="!pair[1]">End of notebook</article>
          </section>
        </ng-container>

        <ng-container *ngIf="layout === 'overview'">
          <section class="print-overview-sheet" *ngFor="let sheet of printOverviewSheets; trackBy: trackByIndex">
            <div class="print-overview-cell" *ngFor="let pair of sheet; trackBy: trackByIndex">
              <section class="notebook-spread print-overview-spread">
                <div class="notebook-spine" aria-hidden="true"></div>
                <article class="notebook-page left-page">
                  <ng-container *ngTemplateOutlet="pageTemplate; context: { $implicit: pair[0], editable: false }"></ng-container>
                </article>
                <article class="notebook-page right-page" *ngIf="pair[1] as notebookPage">
                  <ng-container *ngTemplateOutlet="pageTemplate; context: { $implicit: notebookPage, editable: false }"></ng-container>
                </article>
                <article class="notebook-page right-page blank-page" *ngIf="!pair[1]">End of notebook</article>
              </section>
            </div>
          </section>
        </ng-container>
      </div>

      <div class="pdf-generating-backdrop" *ngIf="generatingPdf" role="status" aria-live="polite">
        <section class="pdf-generating-card">
          <div class="pdf-generating-spinner" aria-hidden="true"></div>
          <div>
            <span>PREPARING PDF</span>
            <strong>{{ pdfProgress || 'Preparing notebook pages…' }}</strong>
            <p>Keeping the page layout consistent across browsers.</p>
          </div>
        </section>
      </div>

      <div class="pdf-preview-backdrop" *ngIf="pdfPreviewUrl" (click)="closePdfPreview()">
        <section class="pdf-preview-modal" role="dialog" aria-modal="true" aria-label="Protocol PDF preview" (click)="$event.stopPropagation()">
          <header><div><span>PDF PREVIEW</span><strong>{{ pdfFileName }}</strong></div><button type="button" (click)="closePdfPreview()" aria-label="Close PDF preview">×</button></header>
          <iframe [src]="pdfPreviewUrl" title="Protocol PDF preview"></iframe>
          <footer><span>Review the finished A4 PDF, then download or print it from your PDF viewer.</span><button type="button" (click)="downloadPdf()">Download PDF</button></footer>
        </section>
      </div>

      <ng-template #blankPage><article class="notebook-page right-page blank-page">End of notebook</article></ng-template>

      <ng-template #pageTemplate let-notebookPage let-editable="editable">
        <header class="page-heading">
          <h2 *ngIf="!editable || notebookPage.continuation > 0">
            {{ notebookPage.node.title }}<span *ngIf="notebookPage.continuation > 0"> (cont.)</span>
          </h2>
          <input *ngIf="editable && notebookPage.continuation === 0" class="page-title-input" [(ngModel)]="notebookPage.node.title" (blur)="saveNode(notebookPage.node)" aria-label="Protocol step title">
        </header>

        <section class="page-steps" *ngIf="notebookPage.stepEnd > notebookPage.stepStart">
          <h3>Steps</h3>
          <ol [attr.start]="notebookPage.stepStart + 1">
            <li *ngFor="let step of stepsForPage(notebookPage); let index = index; trackBy: trackByIndex">
              <span *ngIf="!editable">{{ step }}</span>
              <span class="editable-step" *ngIf="editable">
                <input [(ngModel)]="notebookPage.node.steps[notebookPage.stepStart + index]" (blur)="saveNode(notebookPage.node)" aria-label="Protocol step">
                <button type="button" class="inline-delete" (click)="deleteStep(notebookPage.node, notebookPage.stepStart + index)" aria-label="Delete step">×</button>
              </span>
            </li>
          </ol>
          <div class="step-actions" *ngIf="editable && isLastStepPage(notebookPage)">
            <button type="button" class="add-step" (click)="addStep(notebookPage.node)">+ Step</button>
          </div>
        </section>

        <section class="page-notes" [class.notes-only]="notebookPage.stepEnd === notebookPage.stepStart" *ngIf="notebookPage.showNotes">
          <h3>Notes</h3>
          <article class="note-entry" *ngFor="let note of notebookPage.notes; trackBy: trackByNoteId">
            <p *ngIf="!editable">{{ note.content }}</p>
            <div class="editable-note" *ngIf="editable">
              <textarea
                [(ngModel)]="note.content"
                [rows]="getNoteRows(note.content)"
                [style.height]="'calc(' + getNoteRows(note.content) + ' * var(--rule))'"
                (input)="autoGrowTextarea($event)"
                (blur)="saveNode(notebookPage.node)"
                placeholder="Write note details..."
                aria-label="Note content"></textarea>
              <button type="button" class="inline-delete note-delete" (click)="deleteNote(notebookPage.node, note.id)" title="Delete note" aria-label="Delete note">×</button>
            </div>
          </article>
          <button type="button" class="add-note" *ngIf="editable && isLastPageForNode(notebookPage)" (click)="addNote(notebookPage.node)">+ Note</button>
        </section>

        <footer class="page-links" *ngIf="previousNodes(notebookPage.node).length || nextNodes(notebookPage.node).length">
          <div class="previous-links" [class.empty]="!previousNodes(notebookPage.node).length">
            <ng-container *ngIf="previousNodes(notebookPage.node).length">
              <span>Previous:</span><span class="link-list"><button type="button" *ngFor="let linked of previousNodes(notebookPage.node); let last = last; trackBy: trackByNodeId" (click)="goToNode(linked.id)">{{ nodeStartPage(linked) }}{{ last ? '' : ', ' }}</button></span>
            </ng-container>
          </div>
          <div class="next-links" [class.empty]="!nextNodes(notebookPage.node).length">
            <ng-container *ngIf="nextNodes(notebookPage.node).length">
              <span>Next:</span><span class="link-list"><button type="button" *ngFor="let linked of nextNodes(notebookPage.node); let last = last; trackBy: trackByNodeId" (click)="goToNode(linked.id)">{{ nodeStartPage(linked) }}{{ last ? '' : ', ' }}</button></span>
            </ng-container>
          </div>
        </footer>
        <span class="page-number">{{ notebookPageNumber(notebookPage) }}</span>
      </ng-template>
    </section>
  `,
  styles: [`
    :host { display:block; height:100%; overflow:auto; background:#e8e4dc; color:#252422; }
    .notebook-shell { min-height:100%; padding:26px; box-sizing:border-box; }
    .notebook-controls { max-width:1260px; margin:0 auto 20px; display:flex; justify-content:space-between; align-items:center; }
    .notebook-title { font:700 1rem Georgia, serif; }
    .notebook-actions { display:flex; align-items:center; gap:6px; }
    .notebook-tree-select { max-width:280px; height:31px; padding:0 30px 0 10px; border:1px solid #aaa397; border-radius:5px; background:#f9f7f2; color:#322f2a; font:600 .8rem Arial,sans-serif; cursor:pointer; }
    button { font:600 .8rem Arial, sans-serif; border:1px solid #aaa397; border-radius:5px; padding:7px 10px; background:#f9f7f2; color:#322f2a; cursor:pointer; }
    button:hover, button.active { background:#37342f; border-color:#37342f; color:#fff; }
    button:disabled { opacity:.35; cursor:not-allowed; }
    .notebook-spread { position:relative; display:grid; grid-template-columns:1fr 1fr; width:100%; max-width:1260px; min-height:0; aspect-ratio:297 / 210; margin:auto; filter:drop-shadow(0 12px 18px rgba(45,40,32,.18)); }
    .notebook-spread.turning { animation:page-turn .38s ease-out both; }
    .notebook-page { --rule:32px; position:relative; display:flex; flex-direction:column; height:100%; min-height:0; padding:0 48px; box-sizing:border-box; background:repeating-linear-gradient(to bottom, #fffdf7 0, #fffdf7 30px, #d7e1ec 31px, #fffdf7 32px); border:1px solid #d5cec2; overflow:hidden; }
    .left-page { border-radius:8px 0 0 8px; padding-right:56px; }
    .right-page { border-radius:0 8px 8px 0; padding-left:56px; }
    .notebook-spine { position:absolute; left:50%; top:0; bottom:0; z-index:2; width:22px; transform:translateX(-50%); background:radial-gradient(circle at center 9px, #5c5851 0 4px, transparent 4.5px) center top/22px 24px repeat-y; }
    .page-heading { padding-top:var(--rule); min-height:var(--rule); }
    h3, .page-links > div > span { font:700 .68rem Arial,sans-serif; letter-spacing:.08em; text-transform:uppercase; color:#777168; }
    h2 { margin:0; font:700 1.35rem/var(--rule) Georgia,serif; overflow-wrap:anywhere; }
    h3 { height:var(--rule); margin:0; line-height:var(--rule); }
    .page-steps ol { margin:0; padding-left:23px; font:400 .92rem/var(--rule) Georgia,serif; }
    .page-steps li { min-height:var(--rule); line-height:var(--rule); }
    .step-actions { display:flex; align-items:center; min-height:var(--rule); }
    .page-notes { margin-top:auto; }
    .page-notes.notes-only { margin-top:0; }
    .note-entry { min-height:var(--rule); border-left:3px solid #8d887f; padding:0 0 0 9px; margin:0 0 2px; font:400 .83rem/var(--rule) Georgia,serif; }
    .note-entry p { margin:0; white-space:pre-wrap; line-height:var(--rule); word-break:break-word; }
    .editable-note { display:flex; align-items:flex-start; gap:4px; width:100%; min-height:var(--rule); }
    .editable-note textarea { flex:1; min-width:0; width:100%; box-sizing:border-box; border:0; border-radius:0; outline:none; color:#252422; background:transparent; font:400 .83rem/var(--rule) Georgia,serif; padding:0; margin:0; resize:none; min-height:var(--rule); line-height:var(--rule); overflow:hidden; }
    .editable-note textarea::placeholder { color:#8d887f; font:italic 400 .83rem/var(--rule) Georgia,serif; }
    .editable-note textarea:focus { background:rgba(0,0,0,.02); }
    .note-delete { opacity:0; transition:opacity .15s ease; align-self:flex-start; margin-top:4px; margin-left:auto; }
    .note-entry:hover .note-delete { opacity:1; }
    .no-notes, small { display:block; height:var(--rule); color:#777168; font:italic .82rem/var(--rule) Georgia,serif; }
    .page-links { display:grid; grid-template-columns:1fr 1fr; gap:16px; border-top:1px solid #aaa397; margin-top:auto; padding:0 0 10px; min-height:var(--rule); }
    .page-notes + .page-links { margin-top:0; }
    .page-links > div { display:flex; align-items:center; min-width:0; height:var(--rule); white-space:nowrap; }
    .page-links > div:last-child { justify-content:flex-end; text-align:right; }
    .page-links > div > span { display:inline; line-height:var(--rule); }
    .page-links .link-list { display:inline-flex; align-items:center; }
    .page-links button { display:inline; width:auto; max-width:100%; height:var(--rule); padding:0; border:0; border-radius:0; background:transparent; color:#3b5c7b; font:600 .78rem/var(--rule) Arial,sans-serif; white-space:nowrap; }
    .page-links button:hover { color:#1d3557; text-decoration:underline; }
    .page-links > div:last-child button { text-align:right; }
    .page-number { position:absolute; bottom:6px; font:600 .72rem Arial,sans-serif; color:#777168; }
    .left-page .page-number { left:22px; }
    .right-page .page-number { right:22px; }
    .blank-page { justify-content:center; align-items:center; color:#777168; font:italic 1rem Georgia,serif; }
    .notebook-pagination { display:flex; align-items:center; justify-content:center; gap:18px; margin:18px auto 0; }
    .notebook-pagination span { font:600 .8rem Arial,sans-serif; color:#625d55; }
    .notebook-overview { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:6px; width:100%; max-width:1264px; margin:auto; overflow:hidden; }
    .overview-spread-cell { min-width:0; aspect-ratio:297 / 210; overflow:hidden; }
    .notebook-overview .overview-spread { width:200%; max-width:none; min-height:0; aspect-ratio:297 / 210; margin:0; transform:scale(.5); transform-origin:top left; pointer-events:none; user-select:none; }
    .page-title-input { width:100%; box-sizing:border-box; border:0; border-radius:0; outline:none; color:#252422; background:transparent; margin:0; height:var(--rule); font:700 1.35rem/var(--rule) Georgia,serif; }
    .editable-step { display:flex; align-items:center; gap:5px; min-height:var(--rule); line-height:var(--rule); }
    .editable-step input { flex:1; min-width:0; height:var(--rule); line-height:var(--rule); border:0; outline:none; background:transparent; color:#252422; font:400 .92rem/var(--rule) Georgia,serif; padding:0; margin:0; }
    .editable-step .inline-delete { opacity:0; transition:opacity .15s ease; margin-left:auto; }
    .editable-step:hover .inline-delete { opacity:1; }
    .inline-delete, .add-step, .add-note { border:0; background:transparent; color:#8b3a35; padding:0 4px; font:700 1rem/1 Arial,sans-serif; cursor:pointer; }
    .inline-delete:hover, .add-step:hover, .add-note:hover { color:#5c1c18; background:transparent; }
    .add-step, .add-note { color:#3b5c7b; font-size:.76rem; line-height:var(--rule); }
    .notebook-empty { text-align:center; color:#625d55; }
    .notebook-pdf-error { max-width:1260px; margin:0 auto 12px; color:#9f1239; font:600 .8rem Arial,sans-serif; }
    .pdf-generating-backdrop { position:fixed; inset:0; z-index:3100; display:grid; place-items:center; padding:18px; background:rgba(15,23,42,.54); }
    .pdf-generating-card { display:flex; align-items:center; gap:15px; width:min(390px, 92vw); padding:22px; border-radius:12px; background:#fff; box-shadow:0 22px 64px rgba(15,23,42,.34); }.pdf-generating-card span { display:block; margin-bottom:5px; color:#2563eb; font:800 .66rem Arial,sans-serif; letter-spacing:.1em; }.pdf-generating-card strong { display:block; color:#1e293b; font:700 .96rem Arial,sans-serif; }.pdf-generating-card p { margin:5px 0 0; color:#64748b; font:500 .78rem Arial,sans-serif; line-height:1.4; }.pdf-generating-spinner { flex:0 0 auto; width:31px; height:31px; border:3px solid #dbeafe; border-top-color:#2563eb; border-radius:50%; animation:pdf-spin .78s linear infinite; } @keyframes pdf-spin { to { transform:rotate(360deg); } }
    .pdf-preview-backdrop { position:fixed; inset:0; z-index:3000; display:grid; place-items:center; padding:18px; background:rgba(15,23,42,.58); }
    .pdf-preview-modal { display:grid; grid-template-rows:auto minmax(0,1fr) auto; width:min(1120px, 96vw); height:min(820px, 92vh); overflow:hidden; border-radius:12px; background:#fff; box-shadow:0 26px 72px rgba(15,23,42,.45); }
    .pdf-preview-modal header,.pdf-preview-modal footer { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 16px; border-bottom:1px solid #dbe3ef; background:#fff; }.pdf-preview-modal footer { border-top:1px solid #dbe3ef; border-bottom:0; color:#64748b; font:500 .76rem Arial,sans-serif; }.pdf-preview-modal header div { display:grid; gap:2px; }.pdf-preview-modal header span { color:#2563eb; font:800 .64rem Arial,sans-serif; letter-spacing:.09em; }.pdf-preview-modal header strong { color:#1e293b; font:700 .9rem Arial,sans-serif; }.pdf-preview-modal header button { border:0; border-radius:50%; width:28px; height:28px; padding:0; background:#f1f5f9; color:#475569; font-size:21px; }.pdf-preview-modal footer button { border:0; background:#2563eb; color:#fff; border-radius:6px; padding:8px 12px; font:700 .78rem Arial,sans-serif; }.pdf-preview-modal iframe { width:100%; height:100%; border:0; background:#52525b; }
    .print-notebook { display:none; }
    /* PDF capture uses a fixed off-screen A4 artboard. This removes all
       browser print-layout differences before a user ever opens Print. */
    .print-notebook.pdf-rendering { display:block !important; position:fixed; z-index:-1; top:0; left:-12000px; width:1120px; margin:0; padding:0; background:#fff; }
    .pdf-rendering .print-spread { display:grid; grid-template-columns:1fr 1fr; width:1120px; height:788px; padding:23px 30px; margin:0; overflow:hidden; box-sizing:border-box; filter:none; box-shadow:none; }
    .pdf-rendering .print-spread .notebook-page { --rule:27px; min-height:0; height:100%; box-sizing:border-box; border:1px solid #c8c0b2; }
    .pdf-rendering .print-spread .left-page { display:flex; border-radius:8px 0 0 8px; padding:0 52px 0 36px; }
    .pdf-rendering .print-spread .right-page { display:flex; border-radius:0 8px 8px 0; padding:0 36px 0 52px; }
    .pdf-rendering .print-spread .notebook-spine { display:block; }
    .pdf-rendering .print-overview-sheet { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); grid-template-rows:repeat(2, minmax(0, 1fr)); gap:15px 19px; width:1120px; height:788px; padding:15px 23px; margin:0; overflow:hidden; box-sizing:border-box; background:#fff; }
    .pdf-rendering .print-overview-cell { position:relative; min-width:0; min-height:0; overflow:hidden; box-sizing:border-box; border-radius:4px; }
    .pdf-rendering .print-overview-spread { display:grid; grid-template-columns:1fr 1fr; position:absolute; top:0; left:0; width:200%; height:200%; max-width:none; min-height:0; margin:0; transform:scale(.5); transform-origin:top left; box-sizing:border-box; filter:none; box-shadow:none; }
    .pdf-rendering .print-overview-spread .notebook-page { --rule:32px; min-height:0; height:100%; box-sizing:border-box; border:1.5px solid #bbb2a4; }
    .pdf-rendering .print-overview-spread .left-page { display:flex; border-radius:6px 0 0 6px; padding-right:56px; }
    .pdf-rendering .print-overview-spread .right-page { display:flex; border-radius:0 6px 6px 0; padding-left:56px; }
    .pdf-rendering .print-overview-spread .notebook-spine { display:block; }
    @keyframes page-turn { from { opacity:.25; transform:perspective(1200px) rotateY(-11deg); transform-origin:left center; } to { opacity:1; transform:none; } }
    @media (max-width:900px) { .notebook-spread { grid-template-columns:1fr; } .notebook-spine, .right-page { display:none; } .left-page { border-radius:8px; padding-right:48px; } .notebook-overview { grid-template-columns:1fr; } }
    @media print {
      @page {
        size: A4 landscape;
        margin: 0;
      }
      /* Safari rounds physical CSS lengths differently from Chromium. Keep the
         printable sheet just inside A4 so a sub-pixel overflow cannot become
         a second, blank page. */
      :host { display:block; width:296mm !important; height:auto; overflow:visible; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .notebook-shell { min-height:0; padding:0; margin:0; }
      .notebook-controls, .screen-notebook { display:none !important; }
      .print-notebook { display:block !important; width:296mm !important; margin:0 !important; padding:0 !important; }
      .print-notebook .notebook-spread { display:grid !important; grid-template-columns:1fr 1fr !important; filter:none !important; box-shadow:none !important; }
      .print-notebook .left-page { display:flex !important; border-radius:8px 0 0 8px !important; padding:0 52px 0 36px !important; }
      .print-notebook .right-page { display:flex !important; border-radius:0 8px 8px 0 !important; padding:0 36px 0 52px !important; }
      .print-notebook .notebook-spine { display:block !important; }

      /* 2-page spread print: 1 spread per A4 landscape sheet */
      .print-spread { display:grid !important; grid-template-columns:1fr 1fr !important; width:296mm !important; height:208mm !important; padding:6mm 8mm !important; margin:0 !important; overflow:hidden !important; box-sizing:border-box !important; page-break-inside:avoid !important; break-inside:avoid !important; break-after:page !important; }
      .print-spread:last-child { break-after:auto !important; }
      .print-spread .notebook-page { --rule:27px !important; min-height:0 !important; height:100% !important; box-sizing:border-box !important; border:1px solid #c8c0b2 !important; }

      /* 8-page overview print: 4 spreads (2x2) per A4 landscape sheet */
      .print-overview-sheet {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        grid-template-rows: repeat(2, minmax(0, 1fr)) !important;
        gap: 4mm 5mm !important;
        width: 296mm !important;
        height: 208mm !important;
        padding: 4mm 6mm !important;
        margin: 0 !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        break-after: page !important;
      }
      .print-overview-sheet:last-child { break-after:auto !important; }
      .print-overview-cell { position:relative !important; width:auto !important; height:auto !important; min-width:0 !important; min-height:0 !important; overflow:hidden !important; box-sizing:border-box !important; border-radius:4px !important; }
      .print-overview-spread { display:grid !important; grid-template-columns:1fr 1fr !important; position:absolute !important; top:0 !important; left:0 !important; width:200% !important; height:200% !important; max-width:none !important; min-height:0 !important; margin:0 !important; transform:scale(0.5) !important; transform-origin:top left !important; box-sizing:border-box !important; }
      .print-overview-spread .notebook-page { --rule:32px !important; min-height:0 !important; height:100% !important; box-sizing:border-box !important; border:1.5px solid #bbb2a4 !important; }
      .print-overview-spread .left-page { border-radius:6px 0 0 6px !important; padding-right:56px !important; }
      .print-overview-spread .right-page { border-radius:0 6px 6px 0 !important; padding-left:56px !important; }
    }
  `]
})
export class NamuNotebookViewComponent implements OnChanges {
  @Input({ required: true }) tree!: NamuTree;
  @Input() trees: NamuTree[] = [];
  @Output() treeChange = new EventEmitter<string>();
  Math = Math;
  layout: 'spread' | 'overview' = 'spread';
  spreadStart = 0;
  overviewStart = 0;
  turning = false;
  printing = false;
  pdfRendering = false;
  generatingPdf = false;
  pdfProgress = '';
  pdfError = '';
  pdfPreviewUrl: SafeResourceUrl | null = null;
  private pdfBlobUrl = '';
  pdfFileName = 'protocol-notebook.pdf';
  @ViewChild('pdfNotebook') private pdfNotebook?: ElementRef<HTMLElement>;

  cachedPages: NotebookPage[] = [];
  private currentTreeId = '';

  constructor(
    private namuStorageService: NamuStorageService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    const treeIdChanged = !this.currentTreeId || (this.tree && this.currentTreeId !== this.tree.id);
    if (this.tree) this.currentTreeId = this.tree.id;

    this.refreshPages();

    if (treeIdChanged) {
      this.spreadStart = 0;
      this.overviewStart = 0;
    } else {
      if (this.spreadStart >= this.cachedPages.length) {
        this.spreadStart = Math.max(0, Math.floor((this.cachedPages.length - 1) / 2) * 2);
      }
      if (this.overviewStart >= this.cachedPages.length) {
        this.overviewStart = Math.max(0, Math.floor((this.cachedPages.length - 1) / 8) * 8);
      }
    }
  }

  refreshPages() {
    this.cachedPages = this.buildNotebookPages();
  }

  get spreadPages(): NotebookPage[] { return this.cachedPages.slice(this.spreadStart, this.spreadStart + 2); }
  get overviewSpreads(): Array<[NotebookPage, NotebookPage | undefined]> {
    const pages = this.cachedPages.slice(this.overviewStart, this.overviewStart + 8);
    const spreads: Array<[NotebookPage, NotebookPage | undefined]> = [];
    for (let index = 0; index < pages.length; index += 2) spreads.push([pages[index], pages[index + 1]]);
    return spreads;
  }
  get printSpreads(): Array<[NotebookPage, NotebookPage | undefined]> {
    const pages = this.cachedPages;
    const spreads: Array<[NotebookPage, NotebookPage | undefined]> = [];
    for (let index = 0; index < pages.length; index += 2) spreads.push([pages[index], pages[index + 1]]);
    return spreads;
  }
  get printOverviewSheets(): Array<Array<[NotebookPage, NotebookPage | undefined]>> {
    const sheets: Array<Array<[NotebookPage, NotebookPage | undefined]>> = [];
    const spreads = this.printSpreads;
    for (let index = 0; index < spreads.length; index += 4) sheets.push(spreads.slice(index, index + 4));
    return sheets;
  }
  setLayout(layout: 'spread' | 'overview') { this.layout = layout; }
  notebookPageNumber(page: NotebookPage): number { return this.cachedPages.findIndex(candidate => candidate.node.id === page.node.id && candidate.continuation === page.continuation) + 1; }
  nodeStartPage(node: NamuNode): number { return this.cachedPages.findIndex(page => page.node.id === node.id) + 1; }
  previousNodes(node: NamuNode): NamuNode[] { return this.tree.nodes.filter(candidate => candidate.nextNodes.includes(node.id)); }
  nextNodes(node: NamuNode): NamuNode[] { return this.tree.nodes.filter(candidate => node.nextNodes.includes(candidate.id)); }
  goToNode(nodeId: string) { const index = this.cachedPages.findIndex(page => page.node.id === nodeId); if (index >= 0) { this.layout = 'spread'; this.spreadStart = Math.floor(index / 2) * 2; this.turnPage(); } }
  previousSpread() { if (this.spreadStart >= 2) { this.spreadStart -= 2; this.turnPage(); } }
  nextSpread() { if (this.spreadStart + 2 < this.cachedPages.length) { this.spreadStart += 2; this.turnPage(); } }
  previousOverview() { if (this.overviewStart >= 8) this.overviewStart -= 8; }
  nextOverview() { if (this.overviewStart + 8 < this.cachedPages.length) this.overviewStart += 8; }

  saveNode(node: NamuNode) {
    this.namuStorageService.updateNode(this.tree.id, node);
    this.refreshPages();
  }
  addStep(node: NamuNode) {
    node.steps.push('New protocol step');
    this.saveNode(node);
  }
  deleteStep(node: NamuNode, index: number) {
    if (node.steps.length <= 1) return;
    node.steps.splice(index, 1);
    this.saveNode(node);
  }
  addNote(node: NamuNode) {
    this.namuStorageService.addLeafNote(this.tree.id, node.id, 'Note', '');
    this.refreshPages();
  }
  deleteNote(node: NamuNode, leafId: string) {
    this.namuStorageService.deleteLeafNote(this.tree.id, node.id, leafId);
    this.refreshPages();
  }
  stepsForPage(page: NotebookPage): string[] { return page.node.steps.slice(page.stepStart, page.stepEnd); }
  isLastStepPage(page: NotebookPage): boolean {
    return page.stepEnd >= page.node.steps.length && page.stepEnd > page.stepStart;
  }
  isLastPageForNode(page: NotebookPage): boolean {
    const pages = this.cachedPages;
    for (let index = pages.length - 1; index >= 0; index -= 1) {
      if (pages[index].node.id === page.node.id) return pages[index].continuation === page.continuation;
    }
    return false;
  }

  getNoteRows(content: string): number {
    if (!content) return 1;
    const lines = content.split('\n');
    return Math.max(1, lines.reduce((acc, line) => acc + Math.max(1, Math.ceil((line.length || 1) / 50)), 0));
  }

  autoGrowTextarea(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  trackByIndex(index: number): number { return index; }
  trackByNoteId(index: number, note: NamuLeafNote): string { return note.id; }
  trackByNodeId(index: number, node: NamuNode): string { return node.id; }

  async printNotebook() {
    if (this.generatingPdf || !this.tree.nodes.length) return;
    this.generatingPdf = true;
    this.pdfError = '';
    this.pdfProgress = 'Preparing notebook pages…';
    // Force this status to reach the screen before html2canvas starts its
    // expensive DOM capture. Without the paint boundary, some browsers keep
    // the previous UI visible until the first sheet has already finished.
    this.cdr.detectChanges();
    await this.waitForPaint();
    try {
      this.pdfRendering = true;
      this.cdr.detectChanges();
      await this.waitForPaint();
      await document.fonts?.ready;
      const root = this.pdfNotebook?.nativeElement;
      if (!root) return;
      const selector = this.layout === 'spread' ? '.print-spread' : '.print-overview-sheet';
      const sheets = Array.from(root.querySelectorAll<HTMLElement>(selector));
      const html2canvas = (await import('html2canvas')).default;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      for (let index = 0; index < sheets.length; index += 1) {
        const sheet = sheets[index];
        this.pdfProgress = `Rendering sheet ${index + 1} of ${sheets.length}…`;
        this.cdr.detectChanges();
        // Do not wait for another requestAnimationFrame here. WebKit can stop
        // delivering that follow-up frame after several off-screen captures,
        // leaving the final sheet permanently on "Rendering". html2canvas is
        // already asynchronous and yields between captures.
        const canvas = await this.capturePdfSheet(html2canvas, sheet);
        if (index > 0) pdf.addPage('a4', 'landscape');
        // Pass the canvas directly: converting every sheet to a base64 string
        // retains a large duplicate in memory and can stall the last sheet.
        pdf.addImage(canvas, 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
        canvas.width = 1;
        canvas.height = 1;
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      this.closePdfPreview();
      this.pdfFileName = `${this.tree.name || 'protocol-notebook'}.pdf`;
      this.pdfBlobUrl = URL.createObjectURL(pdf.output('blob'));
      this.pdfPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfBlobUrl);
    } catch (error) {
      console.error('Protocol PDF generation failed', error);
      this.pdfError = 'PDF could not be created. Please try again; the detailed error is available in the browser console.';
    } finally {
      this.pdfRendering = false;
      this.generatingPdf = false;
      this.pdfProgress = '';
    }
  }

  private waitForPaint(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }

  private capturePdfSheet(html2canvas: typeof import('html2canvas').default, sheet: HTMLElement): Promise<HTMLCanvasElement> {
    const capture = html2canvas(sheet, {
      backgroundColor: '#ffffff', scale: 1, useCORS: true, logging: false, width: 1120, height: 788
    });
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('This PDF sheet took too long to render.')), 30000);
    });
    return Promise.race([capture, timeout]);
  }

  downloadPdf() {
    if (!this.pdfBlobUrl) return;
    const link = document.createElement('a');
    link.href = this.pdfBlobUrl;
    link.download = this.pdfFileName;
    link.click();
  }

  closePdfPreview() {
    if (this.pdfBlobUrl) URL.revokeObjectURL(this.pdfBlobUrl);
    this.pdfBlobUrl = '';
    this.pdfPreviewUrl = null;
  }
  private turnPage() { this.turning = false; requestAnimationFrame(() => { this.turning = true; setTimeout(() => this.turning = false, 380); }); }

  /**
   * Split only the rendered notebook. The stored node/note data remains whole,
   * while every physical A5 page receives a bounded number of ruled lines.
   */
  private buildNotebookPages(): NotebookPage[] {
    const pages: NotebookPage[] = [];
    for (const node of this.tree.nodes) {
      let continuation = 0;
      let stepIndex = 0;
      let noteIndex = 0;

      while (stepIndex < node.steps.length || noteIndex < node.leaves.length || continuation === 0) {
        const stepStart = stepIndex;
        let availableLines = 21;

        // Fill steps on this page
        while (stepIndex < node.steps.length) {
          const lines = this.wrappedLineCount(node.steps[stepIndex], 48);
          if (lines > availableLines && stepIndex > stepStart) break;
          if (lines > availableLines) break;
          availableLines -= lines;
          stepIndex += 1;
        }
        const stepEnd = stepIndex;

        // Notes appear after steps complete
        const stepsComplete = stepIndex >= node.steps.length;
        const pageNotes: NamuLeafNote[] = [];
        let showNotes = false;

        if (stepsComplete) {
          if (stepEnd > stepStart) {
            availableLines = Math.max(1, availableLines - 2);
          }
          showNotes = true;

          while (noteIndex < node.leaves.length && availableLines > 0) {
            const note = node.leaves[noteIndex];
            const lines = this.wrappedLineCount(note.content, 54);
            if (lines > availableLines && pageNotes.length > 0) break;
            pageNotes.push(note);
            availableLines -= Math.max(1, lines);
            noteIndex += 1;
          }
        }

        // Avoid infinite loop
        if (stepStart === stepEnd && stepIndex < node.steps.length && !pageNotes.length) {
          stepIndex += 1;
        }
        pages.push({ node, continuation, stepStart, stepEnd: Math.max(stepEnd, stepIndex), notes: pageNotes, showNotes });
        continuation += 1;
      }
    }
    return pages;
  }

  private wrappedLineCount(text: string, charsPerLine: number): number {
    if (!text) return 1;
    return text.split('\n').reduce((total, line) => {
      if (line.length === 0) return total + 1;
      return total + Math.max(1, Math.ceil(line.length / charsPerLine));
    }, 0);
  }
}
