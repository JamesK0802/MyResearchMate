import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NamuNode, NamuTree } from '../../models/namu.model';
import { NamuStorageService } from '../../services/namu-storage.service';

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
          <button type="button" (click)="printNotebook()">Print</button>
        </div>
      </header>

      <p class="notebook-empty" *ngIf="!tree.nodes.length">This tree has no nodes.</p>

      <div class="screen-notebook"
        [class.screen-spread]="layout === 'spread'"
        [class.screen-overview]="layout === 'overview'"
        *ngIf="tree.nodes.length">
        <div class="notebook-spread" *ngIf="layout === 'spread'" [class.turning]="turning">
          <div class="notebook-spine" aria-hidden="true"></div>
          <article class="notebook-page left-page" *ngIf="spreadNodes[0] as node">
            <ng-container *ngTemplateOutlet="page; context: { $implicit: node, editable: true }"></ng-container>
          </article>
          <article class="notebook-page right-page" *ngIf="spreadNodes[1] as node; else blankPage">
            <ng-container *ngTemplateOutlet="page; context: { $implicit: node, editable: true }"></ng-container>
          </article>
        </div>

        <div class="notebook-pagination" *ngIf="layout === 'spread'">
          <button type="button" (click)="previousSpread()" [disabled]="spreadStart === 0">Previous</button>
          <span>{{ spreadStart + 1 }}–{{ Math.min(spreadStart + 2, tree.nodes.length) }} of {{ tree.nodes.length }}</span>
          <button type="button" (click)="nextSpread()" [disabled]="spreadStart + 2 >= tree.nodes.length">Next</button>
        </div>

        <div class="notebook-overview" *ngIf="layout === 'overview'">
          <div class="overview-spread-cell" *ngFor="let pair of overviewSpreads">
            <section class="notebook-spread overview-spread">
              <div class="notebook-spine" aria-hidden="true"></div>
              <article class="notebook-page left-page" *ngIf="pair[0] as node">
                <ng-container *ngTemplateOutlet="page; context: { $implicit: node, editable: false }"></ng-container>
              </article>
              <article class="notebook-page right-page" *ngIf="pair[1] as node; else blankPage">
                <ng-container *ngTemplateOutlet="page; context: { $implicit: node, editable: false }"></ng-container>
              </article>
            </section>
          </div>
        </div>

        <div class="notebook-pagination" *ngIf="layout === 'overview'">
          <button type="button" (click)="previousOverview()" [disabled]="overviewStart === 0">Previous</button>
          <span>{{ overviewStart + 1 }}–{{ Math.min(overviewStart + 8, tree.nodes.length) }} of {{ tree.nodes.length }}</span>
          <button type="button" (click)="nextOverview()" [disabled]="overviewStart + 8 >= tree.nodes.length">Next</button>
        </div>
      </div>

      <!-- Created only while printing, so large protocols do not slow the live 8-page view. -->
      <div class="print-notebook" *ngIf="printing && tree.nodes.length">
        <ng-container *ngIf="layout === 'spread'">
          <section class="notebook-spread print-spread" *ngFor="let pair of printSpreads">
            <div class="notebook-spine" aria-hidden="true"></div>
            <article class="notebook-page left-page">
              <ng-container *ngTemplateOutlet="page; context: { $implicit: pair[0], editable: false }"></ng-container>
            </article>
            <article class="notebook-page right-page" *ngIf="pair[1] as node">
              <ng-container *ngTemplateOutlet="page; context: { $implicit: node, editable: false }"></ng-container>
            </article>
            <article class="notebook-page right-page blank-page" *ngIf="!pair[1]">End of notebook</article>
          </section>
        </ng-container>

        <ng-container *ngIf="layout === 'overview'">
          <section class="print-overview-sheet" *ngFor="let sheet of printOverviewSheets">
            <div class="print-overview-cell" *ngFor="let pair of sheet">
              <section class="notebook-spread print-overview-spread">
                <div class="notebook-spine" aria-hidden="true"></div>
                <article class="notebook-page left-page">
                  <ng-container *ngTemplateOutlet="page; context: { $implicit: pair[0], editable: false }"></ng-container>
                </article>
                <article class="notebook-page right-page" *ngIf="pair[1] as node">
                  <ng-container *ngTemplateOutlet="page; context: { $implicit: node, editable: false }"></ng-container>
                </article>
                <article class="notebook-page right-page blank-page" *ngIf="!pair[1]">End of notebook</article>
              </section>
            </div>
          </section>
        </ng-container>
      </div>

      <ng-template #blankPage><article class="notebook-page right-page blank-page">End of notebook</article></ng-template>

      <ng-template #page let-node let-editable="editable">
        <header class="page-heading">
          <h2 *ngIf="!editable">{{ node.title }}</h2>
          <input *ngIf="editable" class="page-title-input" [(ngModel)]="node.title" (blur)="saveNode(node)" aria-label="Protocol step title">
        </header>

        <section class="page-steps">
          <h3>Steps</h3>
          <ol>
            <li *ngFor="let step of node.steps; let index = index">
              <span *ngIf="!editable">{{ step }}</span>
              <span class="editable-step" *ngIf="editable">
                <input [(ngModel)]="node.steps[index]" (blur)="saveNode(node)" aria-label="Protocol step">
                <button type="button" class="inline-delete" (click)="deleteStep(node, index)" aria-label="Delete step">×</button>
              </span>
            </li>
          </ol>
          <button type="button" class="add-step" *ngIf="editable" (click)="addStep(node)">+ Step</button>
        </section>

        <section class="page-notes">
          <h3>Notes</h3>
          <p class="no-notes" *ngIf="!node.leaves.length">No notes.</p>
          <article class="note-entry" *ngFor="let note of node.leaves">
            <p *ngIf="!editable">{{ note.content }}</p>
            <textarea *ngIf="editable" [(ngModel)]="note.content" (blur)="saveNode(node)" aria-label="Note content"></textarea>
          </article>
          <button type="button" class="add-note" *ngIf="editable" (click)="addNote(node)">+ Note</button>
        </section>

        <footer class="page-links" *ngIf="previousNodes(node).length || nextNodes(node).length">
          <div class="previous-links" [class.empty]="!previousNodes(node).length">
            <ng-container *ngIf="previousNodes(node).length">
              <span>Previous:</span><span class="link-list"><button type="button" *ngFor="let linked of previousNodes(node); let last = last" (click)="goToNode(linked.id)">{{ pageNumber(linked) }}{{ last ? '' : ', ' }}</button></span>
            </ng-container>
          </div>
          <div class="next-links" [class.empty]="!nextNodes(node).length">
            <ng-container *ngIf="nextNodes(node).length">
              <span>Next:</span><span class="link-list"><button type="button" *ngFor="let linked of nextNodes(node); let last = last" (click)="goToNode(linked.id)">{{ pageNumber(linked) }}{{ last ? '' : ', ' }}</button></span>
            </ng-container>
          </div>
        </footer>
        <span class="page-number">{{ pageNumber(node) }}</span>
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
    .left-page { border-radius:8px 0 0 8px; padding-right:60px; }
    .right-page { border-radius:0 8px 8px 0; padding-left:60px; }
    .notebook-spine { position:absolute; left:50%; top:0; bottom:0; z-index:2; width:22px; transform:translateX(-50%); background:radial-gradient(circle at center 9px, #5c5851 0 4px, transparent 4.5px) center top/22px 24px repeat-y; }
    .page-heading { padding-top:var(--rule); }
    h3, .page-links > div > span { font:700 .68rem Arial,sans-serif; letter-spacing:.08em; text-transform:uppercase; color:#777168; }
    h2 { margin:0; font:700 1.45rem/var(--rule) Georgia,serif; overflow-wrap:anywhere; }
    h3 { height:var(--rule); margin:0; line-height:var(--rule); }
    .page-steps ol { margin:0; padding-left:23px; font:400 .95rem/var(--rule) Georgia,serif; }
    .page-steps li { min-height:var(--rule); }
    .page-notes { margin-top:auto; }
    .note-entry { min-height:var(--rule); border-left:3px solid #8d887f; padding:0 9px; margin:0; font:400 .83rem/var(--rule) Georgia,serif; }
    .note-entry p { margin:0; white-space:pre-wrap; line-height:var(--rule); }
    .no-notes, small { display:block; height:var(--rule); color:#777168; font:italic .82rem/var(--rule) Georgia,serif; }
    .page-links { display:grid; grid-template-columns:1fr 1fr; gap:16px; border-top:1px solid #aaa397; margin:0; padding:0 0 14px; min-height:var(--rule); }
    .page-links > div { display:flex; align-items:center; min-width:0; height:var(--rule); white-space:nowrap; }
    .page-links > div:last-child { justify-content:flex-end; text-align:right; }
    .page-links > div > span { display:inline; line-height:var(--rule); }
    .page-links .link-list { display:inline-flex; align-items:center; }
    .page-links button { display:inline; width:auto; max-width:100%; height:var(--rule); padding:0; border:0; border-radius:0; background:transparent; color:#3b5c7b; font:600 .78rem/var(--rule) Arial,sans-serif; white-space:nowrap; }
    .page-links button:hover { color:#1d3557; text-decoration:underline; }
    .page-links > div:last-child button { text-align:right; }
    .page-number { position:absolute; bottom:8px; font:600 .72rem Arial,sans-serif; color:#777168; }
    .left-page .page-number { left:22px; }
    .right-page .page-number { right:22px; }
    .blank-page { justify-content:center; align-items:center; color:#777168; font:italic 1rem Georgia,serif; }
    .notebook-pagination { display:flex; align-items:center; justify-content:center; gap:18px; margin:18px auto 0; }
    .notebook-pagination span { font:600 .8rem Arial,sans-serif; color:#625d55; }
    .notebook-overview { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:4px; width:100%; max-width:1264px; margin:auto; overflow:hidden; }
    .overview-spread-cell { min-width:0; aspect-ratio:297 / 210; overflow:hidden; }
    .notebook-overview .overview-spread { width:200%; max-width:none; min-height:0; aspect-ratio:297 / 210; margin:0; transform:scale(.5); transform-origin:top left; pointer-events:none; user-select:none; }
    .page-title-input, .editable-step input, .note-entry textarea { width:100%; box-sizing:border-box; border:0; border-bottom:1px dashed #8d887f; border-radius:0; outline:none; color:#252422; background:transparent; font:inherit; }
    .page-title-input { margin:0; height:var(--rule); font:700 1.45rem/var(--rule) Georgia,serif; }
    .editable-step { display:flex; align-items:center; gap:5px; min-height:var(--rule); }
    .editable-step input { min-width:0; height:var(--rule); font:400 .95rem/var(--rule) Georgia,serif; }
    .inline-delete, .add-step, .add-note { border:0; background:transparent; color:#8b3a35; padding:0 4px; font:700 1rem/1 Arial,sans-serif; }
    .inline-delete:hover, .add-step:hover, .add-note:hover { color:#5c1c18; background:transparent; }
    .add-step, .add-note { color:#3b5c7b; font-size:.76rem; line-height:var(--rule); }
    .note-entry textarea { display:block; min-height:var(--rule); resize:vertical; padding:0; font:400 .83rem/var(--rule) Georgia,serif; }
    .notebook-empty { text-align:center; color:#625d55; }
    .print-notebook { display:none; }
    @keyframes page-turn { from { opacity:.25; transform:perspective(1200px) rotateY(-11deg); transform-origin:left center; } to { opacity:1; transform:none; } }
    @media (max-width:900px) { .notebook-spread { grid-template-columns:1fr; } .notebook-spine, .right-page { display:none; } .left-page { border-radius:8px; padding-right:48px; } .notebook-overview { grid-template-columns:1fr; } }
    @media print { @page { size:A4 landscape; margin:10mm; }
      :host { height:auto; overflow:visible; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .notebook-shell { min-height:0; padding:0; }
      .notebook-controls, .screen-notebook { display:none !important; }
      .print-notebook { display:block !important; width:100%; }
      .print-notebook .notebook-spread { grid-template-columns:1fr 1fr !important; filter:none !important; box-shadow:none !important; }
      .print-notebook .right-page { display:flex !important; }
      .print-notebook .notebook-spine { display:block !important; }
      .print-notebook .left-page { border-radius:8px 0 0 8px; padding-right:60px; }
      .print-notebook .right-page { border-radius:0 8px 8px 0; padding-left:60px; }

      .print-spread { width:268.7mm; max-width:100%; min-height:0; height:auto; aspect-ratio:297 / 210; overflow:hidden; break-after:page; page-break-after:always; }
      .print-spread:last-child { break-after:auto; page-break-after:auto; }
      .print-spread .notebook-page { min-height:0; height:100%; }

      .print-overview-sheet { display:grid; grid-template-columns:1fr 1fr; grid-template-rows:repeat(2, minmax(0, 1fr)); gap:0; width:268.7mm; max-width:100%; height:190mm; margin:0 auto; overflow:hidden; break-after:page; page-break-after:always; }
      .print-overview-sheet:last-child { break-after:auto; page-break-after:auto; }
      .print-overview-cell { min-height:0; overflow:hidden; }
      .print-overview-spread { width:200%; max-width:none; min-height:0; height:auto; aspect-ratio:297 / 210; margin:0; transform:scale(.5); transform-origin:top left; }
      .print-overview-spread .notebook-page { min-height:0; height:100%; }
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

  constructor(private namuStorageService: NamuStorageService) {}

  ngOnChanges() { this.spreadStart = 0; this.overviewStart = 0; }

  get spreadNodes(): NamuNode[] { return this.tree.nodes.slice(this.spreadStart, this.spreadStart + 2); }
  get overviewSpreads(): Array<[NamuNode, NamuNode | undefined]> {
    const nodes = this.tree.nodes.slice(this.overviewStart, this.overviewStart + 8);
    const spreads: Array<[NamuNode, NamuNode | undefined]> = [];
    for (let index = 0; index < nodes.length; index += 2) spreads.push([nodes[index], nodes[index + 1]]);
    return spreads;
  }
  get printSpreads(): Array<[NamuNode, NamuNode | undefined]> {
    const spreads: Array<[NamuNode, NamuNode | undefined]> = [];
    for (let index = 0; index < this.tree.nodes.length; index += 2) spreads.push([this.tree.nodes[index], this.tree.nodes[index + 1]]);
    return spreads;
  }
  get printOverviewSheets(): Array<Array<[NamuNode, NamuNode | undefined]>> {
    const sheets: Array<Array<[NamuNode, NamuNode | undefined]>> = [];
    const spreads = this.printSpreads;
    for (let index = 0; index < spreads.length; index += 4) sheets.push(spreads.slice(index, index + 4));
    return sheets;
  }
  setLayout(layout: 'spread' | 'overview') { this.layout = layout; }
  pageNumber(node: NamuNode): number { return this.tree.nodes.findIndex(item => item.id === node.id) + 1; }
  previousNodes(node: NamuNode): NamuNode[] { return this.tree.nodes.filter(candidate => candidate.nextNodes.includes(node.id)); }
  nextNodes(node: NamuNode): NamuNode[] { return this.tree.nodes.filter(candidate => node.nextNodes.includes(candidate.id)); }
  goToNode(nodeId: string) { const index = this.tree.nodes.findIndex(node => node.id === nodeId); if (index >= 0) { this.layout = 'spread'; this.spreadStart = Math.floor(index / 2) * 2; this.turnPage(); } }
  previousSpread() { if (this.spreadStart >= 2) { this.spreadStart -= 2; this.turnPage(); } }
  nextSpread() { if (this.spreadStart + 2 < this.tree.nodes.length) { this.spreadStart += 2; this.turnPage(); } }
  previousOverview() { if (this.overviewStart >= 8) this.overviewStart -= 8; }
  nextOverview() { if (this.overviewStart + 8 < this.tree.nodes.length) this.overviewStart += 8; }
  saveNode(node: NamuNode) { this.namuStorageService.updateNode(this.tree.id, node); }
  addStep(node: NamuNode) { node.steps.push('New protocol step'); this.saveNode(node); }
  deleteStep(node: NamuNode, index: number) { if (node.steps.length <= 1) return; node.steps.splice(index, 1); this.saveNode(node); }
  addNote(node: NamuNode) { this.namuStorageService.addLeafNote(this.tree.id, node.id, 'Note', ''); }
  printNotebook() {
    this.printing = true;
    document.body.classList.add('namu-printing');
    const cleanup = () => {
      this.printing = false;
      document.body.classList.remove('namu-printing');
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }
  private turnPage() { this.turning = false; requestAnimationFrame(() => { this.turning = true; setTimeout(() => this.turning = false, 380); }); }
}
