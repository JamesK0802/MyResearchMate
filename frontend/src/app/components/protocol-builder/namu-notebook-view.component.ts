import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NamuNode, NamuTree } from '../../models/namu.model';

@Component({
  selector: 'app-namu-notebook-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="notebook-shell">
      <header class="notebook-controls">
        <div class="notebook-title">{{ tree.name }}</div>
        <div class="notebook-actions">
          <button type="button" [class.active]="layout === 'spread'" (click)="setLayout('spread')">2 Pages</button>
          <button type="button" [class.active]="layout === 'overview'" (click)="setLayout('overview')">8 Pages</button>
          <button type="button" (click)="printNotebook()">Print</button>
        </div>
      </header>

      <p class="notebook-empty" *ngIf="!tree.nodes.length">This tree has no nodes.</p>

      <div class="screen-notebook" *ngIf="tree.nodes.length">
        <div class="notebook-spread" *ngIf="layout === 'spread'" [class.turning]="turning">
          <div class="notebook-spine" aria-hidden="true"></div>
          <article class="notebook-page left-page" *ngIf="spreadNodes[0] as node">
            <ng-container *ngTemplateOutlet="page; context: { $implicit: node }"></ng-container>
          </article>
          <article class="notebook-page right-page" *ngIf="spreadNodes[1] as node; else blankPage">
            <ng-container *ngTemplateOutlet="page; context: { $implicit: node }"></ng-container>
          </article>
        </div>

        <div class="notebook-pagination" *ngIf="layout === 'spread'">
          <button type="button" (click)="previousSpread()" [disabled]="spreadStart === 0">Previous</button>
          <span>{{ spreadStart + 1 }}–{{ Math.min(spreadStart + 2, tree.nodes.length) }} of {{ tree.nodes.length }}</span>
          <button type="button" (click)="nextSpread()" [disabled]="spreadStart + 2 >= tree.nodes.length">Next</button>
        </div>

        <div class="notebook-overview" *ngIf="layout === 'overview'">
          <article class="notebook-page" *ngFor="let node of overviewNodes">
            <ng-container *ngTemplateOutlet="page; context: { $implicit: node }"></ng-container>
          </article>
        </div>
      </div>

      <!-- Printed output always contains every node as sequential two-page spreads. -->
      <div class="print-notebook" *ngIf="tree.nodes.length">
        <section class="notebook-spread print-spread" *ngFor="let pair of printSpreads">
          <div class="notebook-spine" aria-hidden="true"></div>
          <article class="notebook-page left-page">
            <ng-container *ngTemplateOutlet="page; context: { $implicit: pair[0] }"></ng-container>
          </article>
          <article class="notebook-page right-page" *ngIf="pair[1] as node; else blankPage">
            <ng-container *ngTemplateOutlet="page; context: { $implicit: node }"></ng-container>
          </article>
        </section>
      </div>

      <ng-template #blankPage><article class="notebook-page right-page blank-page">End of notebook</article></ng-template>

      <ng-template #page let-node>
        <header class="page-heading">
          <h2>{{ node.title }}</h2>
        </header>

        <section class="page-steps">
          <h3>Steps</h3>
          <ol>
            <li *ngFor="let step of node.steps">{{ step }}</li>
          </ol>
        </section>

        <section class="page-notes">
          <h3>Notes</h3>
          <p class="no-notes" *ngIf="!node.leaves.length">No notes.</p>
          <article class="note-entry" *ngFor="let note of node.leaves">
            <p>{{ note.content }}</p>
          </article>
        </section>

        <footer class="page-links">
          <div>
            <span>Previous</span>
            <button type="button" *ngFor="let previous of previousNodes(node); let last = last" (click)="goToNode(previous.id)">{{ pageNumber(previous) }}{{ last ? '' : ', ' }}</button>
            <small *ngIf="!previousNodes(node).length">None</small>
          </div>
          <div>
            <span>Next</span>
            <button type="button" *ngFor="let next of nextNodes(node); let last = last" (click)="goToNode(next.id)">{{ pageNumber(next) }}{{ last ? '' : ', ' }}</button>
            <small *ngIf="!nextNodes(node).length">None</small>
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
    .notebook-actions { display:flex; gap:6px; }
    button { font:600 .8rem Arial, sans-serif; border:1px solid #aaa397; border-radius:5px; padding:7px 10px; background:#f9f7f2; color:#322f2a; cursor:pointer; }
    button:hover, button.active { background:#37342f; border-color:#37342f; color:#fff; }
    button:disabled { opacity:.35; cursor:not-allowed; }
    .notebook-spread { position:relative; display:grid; grid-template-columns:1fr 1fr; max-width:1260px; min-height:690px; margin:auto; filter:drop-shadow(0 12px 18px rgba(45,40,32,.18)); }
    .notebook-spread.turning { animation:page-turn .38s ease-out both; }
    .notebook-page { --rule:32px; position:relative; display:flex; flex-direction:column; padding:0 48px; min-height:690px; box-sizing:border-box; background:repeating-linear-gradient(to bottom, #fffdf7 0, #fffdf7 30px, #d7e1ec 31px, #fffdf7 32px); border:1px solid #d5cec2; overflow:hidden; }
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
    .page-links { display:grid; grid-template-columns:1fr 1fr; gap:16px; border-top:1px solid #aaa397; margin:0; padding:0; min-height:calc(var(--rule) * 2); }
    .page-links > div { min-width:0; }
    .page-links > div:last-child { text-align:right; }
    .page-links button { display:inline; width:auto; max-width:100%; height:var(--rule); padding:0; border:0; border-radius:0; background:transparent; color:#3b5c7b; font:600 .78rem/var(--rule) Arial,sans-serif; white-space:nowrap; }
    .page-links button:hover { color:#1d3557; text-decoration:underline; }
    .page-links > div:last-child button { text-align:right; }
    .page-number { position:absolute; bottom:8px; font:600 .72rem Arial,sans-serif; color:#777168; }
    .left-page .page-number { left:22px; }
    .right-page .page-number { right:22px; }
    .blank-page { justify-content:center; align-items:center; color:#777168; font:italic 1rem Georgia,serif; }
    .notebook-pagination { display:flex; align-items:center; justify-content:center; gap:18px; margin:18px auto 0; }
    .notebook-pagination span { font:600 .8rem Arial,sans-serif; color:#625d55; }
    .notebook-overview { display:grid; grid-template-columns:repeat(4, minmax(220px, 1fr)); gap:14px; max-width:1500px; margin:auto; }
    .notebook-overview .notebook-page { min-height:390px; padding:0 25px; box-shadow:0 5px 12px rgba(45,40,32,.13); }
    .notebook-overview h2 { font-size:1.15rem; }
    .notebook-overview .page-notes { margin-top:10px; }
    .notebook-overview .note-entry { display:none; }
    .notebook-overview .page-links { grid-template-columns:1fr; }
    .notebook-overview .page-links > div:last-child { text-align:left; }
    .notebook-empty { text-align:center; color:#625d55; }
    .print-notebook { display:none; }
    @keyframes page-turn { from { opacity:.25; transform:perspective(1200px) rotateY(-11deg); transform-origin:left center; } to { opacity:1; transform:none; } }
    @media (max-width:900px) { .notebook-spread { grid-template-columns:1fr; } .notebook-spine, .right-page { display:none; } .left-page { border-radius:8px; padding-right:48px; } .notebook-overview { grid-template-columns:repeat(2, 1fr); } }
    @media print { @page { size:A4 landscape; margin:10mm; } :host { overflow:visible; background:#fff; } .notebook-shell { padding:0; } .notebook-controls, .screen-notebook { display:none; } .print-notebook { display:block; } .print-spread { width:100%; max-width:none; min-height:0; height:190mm; filter:none; break-after:page; page-break-after:always; } .notebook-page { min-height:0; height:190mm; box-shadow:none; } .print-spread:last-child { break-after:auto; page-break-after:auto; } }
  `]
})
export class NamuNotebookViewComponent implements OnChanges {
  @Input({ required: true }) tree!: NamuTree;
  Math = Math;
  layout: 'spread' | 'overview' = 'spread';
  spreadStart = 0;
  turning = false;

  ngOnChanges() { this.spreadStart = 0; }

  get spreadNodes(): NamuNode[] { return this.tree.nodes.slice(this.spreadStart, this.spreadStart + 2); }
  get overviewNodes(): NamuNode[] { return this.tree.nodes.slice(0, 8); }
  get printSpreads(): Array<[NamuNode, NamuNode | undefined]> {
    const spreads: Array<[NamuNode, NamuNode | undefined]> = [];
    for (let index = 0; index < this.tree.nodes.length; index += 2) {
      spreads.push([this.tree.nodes[index], this.tree.nodes[index + 1]]);
    }
    return spreads;
  }
  setLayout(layout: 'spread' | 'overview') { this.layout = layout; }
  pageNumber(node: NamuNode): number { return this.tree.nodes.findIndex(item => item.id === node.id) + 1; }
  previousNodes(node: NamuNode) { return this.tree.nodes.filter(candidate => candidate.nextNodes.includes(node.id)); }
  nextNodes(node: NamuNode) { return this.tree.nodes.filter(candidate => node.nextNodes.includes(candidate.id)); }
  goToNode(nodeId: string) { const index = this.tree.nodes.findIndex(node => node.id === nodeId); if (index >= 0) { this.spreadStart = Math.floor(index / 2) * 2; this.turnPage(); } }
  previousSpread() { if (this.spreadStart >= 2) { this.spreadStart -= 2; this.turnPage(); } }
  nextSpread() { if (this.spreadStart + 2 < this.tree.nodes.length) { this.spreadStart += 2; this.turnPage(); } }
  printNotebook() { window.print(); }
  private turnPage() { this.turning = false; requestAnimationFrame(() => { this.turning = true; setTimeout(() => this.turning = false, 380); }); }
}
