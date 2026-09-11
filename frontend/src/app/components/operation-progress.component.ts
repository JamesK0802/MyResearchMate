import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { OperationProgress, OperationProgressService } from '../services/operation-progress.service';

@Component({
  selector: 'app-operation-progress',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="operation-progress" *ngIf="activeOperation as operation"
      [class.complete]="operation.status === 'complete'"
      [class.error]="operation.status === 'error'"
      role="status" aria-live="polite">
      <div class="operation-heading">
        <div>
          <strong>{{ operation.label }}</strong>
          <span>{{ operation.detail }}</span>
        </div>
        <div class="operation-metric">
          <b *ngIf="operation.percent !== null">{{ operation.percent | number:'1.0-0' }}%</b>
          <b *ngIf="operation.percent === null">{{ elapsedSeconds(operation) }}s</b>
          <small *ngIf="runningCount > 1">+{{ runningCount - 1 }} active</small>
        </div>
      </div>
      <div class="progress-track" [class.indeterminate]="operation.percent === null && operation.status === 'running'">
        <span [style.width.%]="operation.percent === null ? null : operation.percent"></span>
      </div>
      <div class="byte-progress" *ngIf="operation.transferred !== undefined">
        {{ formatBytes(operation.transferred || 0) }}<ng-container *ngIf="operation.total"> / {{ formatBytes(operation.total) }}</ng-container>
      </div>
    </aside>
  `,
  styles: [`
    :host { position:fixed; z-index:6000; top:78px; right:18px; width:min(390px, calc(100vw - 24px)); pointer-events:none; }
    .operation-progress { box-sizing:border-box; padding:13px 14px 11px; border:1px solid #bfdbfe; border-radius:12px; background:rgba(255,255,255,.97); color:#172033; box-shadow:0 14px 36px rgba(15,23,42,.2); backdrop-filter:blur(9px); }
    .operation-progress.complete { border-color:#86efac; }
    .operation-progress.error { border-color:#fca5a5; }
    .operation-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
    .operation-heading>div:first-child { min-width:0; }
    strong, span, small { display:block; }
    strong { overflow:hidden; color:#172033; font:800 .84rem/1.25 var(--font-sans,Arial,sans-serif); text-overflow:ellipsis; white-space:nowrap; }
    .operation-heading span { margin-top:3px; overflow:hidden; color:#64748b; font:600 .7rem/1.3 var(--font-sans,Arial,sans-serif); text-overflow:ellipsis; white-space:nowrap; }
    .operation-metric { flex:0 0 auto; min-width:42px; text-align:right; }
    .operation-metric b { color:#2563eb; font:800 .82rem/1.1 var(--font-sans,Arial,sans-serif); }
    .complete .operation-metric b { color:#15803d; }
    .error .operation-metric b { color:#b91c1c; }
    .operation-metric small { margin-top:3px; color:#94a3b8; font:700 .58rem/1 var(--font-sans,Arial,sans-serif); }
    .progress-track { position:relative; height:7px; margin-top:10px; overflow:hidden; border-radius:999px; background:#e2e8f0; }
    .progress-track span { height:100%; border-radius:inherit; background:linear-gradient(90deg,#2563eb,#22c55e); transition:width .18s ease; }
    .progress-track.indeterminate span { position:absolute; width:42% !important; animation:operation-slide 1.15s ease-in-out infinite; }
    .error .progress-track span { background:#dc2626; }
    .byte-progress { margin-top:5px; color:#64748b; font:600 .62rem/1 var(--font-sans,Arial,sans-serif); text-align:right; }
    @keyframes operation-slide { from { transform:translateX(-110%); } to { transform:translateX(345%); } }
    @media(max-width:700px) { :host { top:104px; right:12px; bottom:auto; left:12px; width:auto; }.operation-progress{padding:11px 12px 10px}.operation-heading span{max-width:72vw} }
    @media(prefers-reduced-motion:reduce) { .progress-track.indeterminate span { animation-duration:2.4s; } }
  `]
})
export class OperationProgressComponent implements OnDestroy {
  operations: OperationProgress[] = [];
  private readonly timer: number;
  private readonly subscription: Subscription;

  constructor(public progress: OperationProgressService, private cdr: ChangeDetectorRef) {
    this.timer = window.setInterval(() => this.cdr.markForCheck(), 1000);
    this.subscription = this.progress.operations$.subscribe(operations => {
      this.operations = operations;
      this.cdr.markForCheck();
    });
  }

  get activeOperation(): OperationProgress | undefined {
    return [...this.operations].reverse().find(operation => operation.status === 'running') || this.operations[this.operations.length - 1];
  }
  get runningCount(): number { return this.operations.filter(operation => operation.status === 'running').length; }
  elapsedSeconds(operation: OperationProgress): number { return Math.max(1, Math.round((Date.now() - operation.startedAt) / 1000)); }
  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }
  ngOnDestroy(): void { window.clearInterval(this.timer); this.subscription.unsubscribe(); }
}
