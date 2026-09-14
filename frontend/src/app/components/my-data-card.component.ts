import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface MyDataCardBadge { label: string; tone?: 'owner' | 'shared' | 'active' | 'completed'; }

@Component({
  selector: 'app-my-data-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="data-card" [class.shared-card]="shared" [class.muted-card]="muted">
      <button *ngIf="showPin" type="button" class="pin" [class.pinned]="pinned" (click)="pin.emit($event)" [attr.aria-label]="pinned ? 'Unpin from top' : 'Pin to top'">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 3h8l-1 6 3 3v2H6v-2l3-3-1-6Zm3 11h2v7l-1-1-1 1v-7Z"></path></svg>
      </button>
      <div class="heading">
        <div class="title-wrap">
          <div class="badges" *ngIf="badges.length"><span *ngFor="let badge of badges" [class]="'badge ' + (badge.tone || 'owner')">{{ badge.label }}</span></div>
          <h2>{{ title || 'Untitled' }}</h2>
        </div>
        <span *ngIf="syncLabel" class="sync" [class.error]="syncError">{{ syncLabel }}</span>
      </div>
      <p *ngIf="description" class="description">{{ description }}</p>
      <div *ngIf="meta.length" class="meta"><span *ngFor="let item of meta">{{ item }}</span></div>
      <div class="content"><ng-content select="[card-content]"></ng-content></div>
      <div class="actions">
        <button type="button" class="primary" (click)="open.emit()">{{ primaryLabel }}</button>
        <button *ngIf="secondaryLabel" type="button" class="secondary" (click)="secondary.emit()">{{ secondaryLabel }}</button>
        <button *ngIf="showShare" type="button" class="icon share" title="Manage sharing" (click)="share.emit()" aria-label="Manage sharing">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
        </button>
        <span *ngIf="readOnly" class="icon readonly" title="Read only" aria-label="Read only">🔒</span>
        <button *ngIf="showDelete" type="button" class="icon delete" title="Delete" (click)="remove.emit()" aria-label="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    </article>
  `,
  styles: [`
    :host { display:block; min-width:0; }
    .data-card { position:relative; display:flex; flex-direction:column; height:100%; box-sizing:border-box; padding:var(--space-6); border:1px solid var(--color-border-light); border-radius:var(--radius-xl); background:var(--color-surface); box-shadow:var(--shadow-xs); transition:var(--transition-normal); }
    .data-card:hover { transform:translateY(-3px); border-color:var(--color-border); box-shadow:var(--shadow-lg); }
    .shared-card { border-left:3px solid #3b82f6; }
    .muted-card { background:#f5f6f7; }
    .pin { position:absolute; z-index:1; top:var(--space-4); right:var(--space-4); width:24px; height:24px; padding:4px; border:0; border-radius:var(--radius-sm); background:transparent; color:var(--color-text-tertiary); opacity:.65; cursor:pointer; }
    .pin svg { display:block; width:16px; height:16px; transform:rotate(35deg); }
    .pin.pinned { color:var(--color-primary); background:var(--color-primary-subtle); opacity:1; }
    .heading { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; padding-right:26px; }
    .title-wrap { min-width:0; }
    h2 { margin:7px 0 0; overflow:hidden; color:var(--color-text-primary); font-size:var(--text-lg); line-height:var(--lh-tight); text-overflow:ellipsis; white-space:nowrap; }
    .badges { display:flex; flex-wrap:wrap; gap:5px; }
    .badge { display:inline-flex; padding:3px 8px; border:1px solid; border-radius:999px; font-size:.61rem; font-weight:900; letter-spacing:.04em; }
    .badge.owner,.badge.active { border-color:var(--color-primary-border); background:var(--color-primary-subtle); color:var(--color-primary); }
    .badge.shared { border-color:#bfdbfe; background:#dbeafe; color:#1e40af; }
    .badge.completed { border-color:#cbd5e1; background:#e2e8f0; color:#475569; }
    .sync { flex:none; color:#15803d; font-size:.68rem; font-weight:800; }.sync.error{color:#dc2626}
    .description { min-height:42px; margin:11px 0; display:-webkit-box; overflow:hidden; color:var(--color-text-secondary); font-size:.82rem; line-height:1.55; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
    .meta { display:flex; flex-wrap:wrap; gap:7px 16px; margin:12px 0; color:var(--color-text-secondary); font-size:var(--text-sm); font-weight:var(--fw-medium); }
    .content { display:block; }
    .actions { display:flex; gap:var(--space-2); margin-top:auto; padding-top:var(--space-5); }
    .actions button { min-height:40px; border-radius:var(--radius-md); font:inherit; font-weight:var(--fw-bold); cursor:pointer; }
    .primary { flex:1; padding:9px 12px; border:0; background:var(--color-primary); color:#fff; }
    .secondary { padding:8px 11px; border:1px solid #86c99f; background:#f0fdf4; color:#15803d; }
    .icon { display:grid; place-items:center; flex:0 0 40px; width:40px; height:40px; padding:9px; box-sizing:border-box; border-radius:var(--radius-md); }
    .icon svg { width:18px; height:18px; }.share{border:1px solid var(--color-border-light);background:var(--color-surface-alt);color:var(--color-text-secondary)}.delete{border:1px solid var(--color-error-border);background:var(--color-error-bg);color:#ef4444}.readonly{border:1px solid var(--color-border-light);background:var(--color-surface-alt);font-size:.85rem}
    @media(max-width:600px){.data-card{padding:13px 14px;border-radius:12px}.data-card:hover{transform:none}.description{min-height:0}.actions{gap:6px;padding-top:10px}.primary,.secondary{font-size:.76rem}.icon{width:36px;height:36px;flex-basis:36px;min-height:36px!important}}
  `]
})
export class MyDataCardComponent {
  @Input() title = '';
  @Input() description = '';
  @Input() badges: MyDataCardBadge[] = [];
  @Input() meta: string[] = [];
  @Input() shared = false;
  @Input() muted = false;
  @Input() showPin = false;
  @Input() pinned = false;
  @Input() syncLabel = '';
  @Input() syncError = false;
  @Input() primaryLabel = 'Open';
  @Input() secondaryLabel = '';
  @Input() showShare = false;
  @Input() showDelete = false;
  @Input() readOnly = false;
  @Output() open = new EventEmitter<void>();
  @Output() secondary = new EventEmitter<void>();
  @Output() share = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();
  @Output() pin = new EventEmitter<Event>();
}
