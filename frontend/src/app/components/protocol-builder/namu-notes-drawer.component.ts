import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NamuTree, NamuNode, NamuLeafNote } from '../../models/namu.model';
import { NamuStorageService } from '../../services/namu-storage.service';

@Component({
  selector: 'app-namu-notes-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="notes-drawer-backdrop" (click)="closeDrawer()">
      <div class="notes-drawer-panel" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="drawer-header">
          <div class="header-title">
            <h3>🍃 Leaf Notes Collection</h3>
            <span class="tree-tag">{{ tree.name }}</span>
          </div>
          <button class="btn-close" (click)="closeDrawer()">✕</button>
        </div>

        <!-- Search & Tag Filter Bar -->
        <div class="drawer-filter-bar">
          <input type="text" class="search-input" [(ngModel)]="searchQuery" placeholder="Search notes by title or content...">
          
          <div class="tags-filter-chips" *ngIf="allTags.length > 0">
            <button type="button" class="tag-chip" [class.active]="selectedTag === ''" (click)="selectedTag = ''">All</button>
            <button type="button" class="tag-chip" *ngFor="let t of allTags" [class.active]="selectedTag === t" (click)="selectedTag = t">#{{ t }}</button>
          </div>
        </div>

        <!-- Notes List -->
        <div class="drawer-body">
          <div class="note-card" *ngFor="let item of filteredNotes" [style.border-left-color]="item.note.color || '#10b981'">
            <div class="note-card-header">
              <div class="note-info">
                <strong>🍃 {{ item.note.title }}</strong>
                <span class="parent-node-badge" (click)="jumpToNode(item.node)" title="Click to view parent node">
                  📍 Step: {{ item.node.title }}
                </span>
              </div>
              <button type="button" class="btn-del-note" (click)="deleteNote(item.node.id, item.note.id)">✕</button>
            </div>

            <p class="note-card-body">{{ item.note.content }}</p>

            <div class="note-card-footer">
              <div class="note-tags">
                <span class="tag-pill" *ngFor="let tag of item.note.tags">#{{ tag }}</span>
              </div>
              <span class="note-date">{{ item.note.createdAt | date:'short' }}</span>
            </div>
          </div>

          <div class="empty-notes" *ngIf="filteredNotes.length === 0">
            No leaf notes found in this tree. Click any node to add notes!
          </div>
        </div>

        <div class="drawer-footer">
          <button type="button" class="btn-primary-close" (click)="closeDrawer()">Close Collection</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .notes-drawer-backdrop {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(2px);
      z-index: 9999; display: flex; justify-content: flex-end;
    }
    .notes-drawer-panel {
      width: 480px; max-width: 90vw; height: 100%; background: #ffffff;
      box-shadow: -10px 0 25px rgba(0,0,0,0.15); display: flex; flex-direction: column;
      border-left: 1px solid #cbd5e1;
    }
    .drawer-header {
      padding: 16px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;
      display: flex; justify-content: space-between; align-items: center;
    }
    .header-title h3 { margin: 0; font-size: 1.1rem; color: #0f172a; }
    .tree-tag { font-size: 0.78rem; color: #16a34a; font-weight: 600; }
    .btn-close { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #64748b; }

    .drawer-filter-bar {
      padding: 12px 20px; border-bottom: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 8px;
    }
    .search-input {
      width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;
    }
    .tags-filter-chips { display: flex; gap: 4px; flex-wrap: wrap; }
    .tag-chip {
      padding: 3px 8px; border-radius: 4px; border: 1px solid #cbd5e1; background: #f8fafc;
      font-size: 0.75rem; font-weight: 600; color: #475569; cursor: pointer;
    }
    .tag-chip.active { background: #2563eb; color: #ffffff; border-color: #2563eb; }

    .drawer-body {
      flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px;
    }
    .note-card {
      background: #ffffff; border: 1px solid #e2e8f0; border-left-width: 5px; border-radius: 8px;
      padding: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .note-card-header { display: flex; justify-content: space-between; align-items: flex-start; }
    .note-info strong { display: block; font-size: 0.9rem; color: #0f172a; }
    .parent-node-badge {
      display: inline-block; margin-top: 2px; font-size: 0.75rem; color: #2563eb;
      background: #eff6ff; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-weight: 600;
    }
    .parent-node-badge:hover { text-decoration: underline; }
    .btn-del-note { background: none; border: none; color: #94a3b8; cursor: pointer; }
    .btn-del-note:hover { color: #ef4444; }

    .note-card-body { margin: 0; font-size: 0.84rem; color: #334155; white-space: pre-wrap; line-height: 1.4; }

    .note-card-footer { display: flex; justify-content: space-between; align-items: center; pt: 4px; }
    .note-tags { display: flex; gap: 4px; flex-wrap: wrap; }
    .tag-pill { font-size: 0.72rem; color: #16a34a; background: #dcfce7; padding: 1px 6px; border-radius: 3px; }
    .note-date { font-size: 0.72rem; color: #94a3b8; }

    .empty-notes { text-align: center; color: #94a3b8; padding: 40px 0; font-size: 0.9rem; }

    .drawer-footer { padding: 12px 20px; border-top: 1px solid #e2e8f0; background: #f8fafc; }
    .btn-primary-close { width: 100%; padding: 8px; background: #64748b; color: white; border: none; border-radius: 6px; font-weight: 700; cursor: pointer; }
  `]
})
export class NamuNotesDrawerComponent implements OnInit {
  @Input() tree!: NamuTree;
  @Output() close = new EventEmitter<void>();
  @Output() selectNode = new EventEmitter<NamuNode>();

  searchQuery = '';
  selectedTag = '';

  constructor(private namuStorageService: NamuStorageService) {}

  ngOnInit() {}

  get allNotes(): { node: NamuNode; note: NamuLeafNote }[] {
    if (!this.tree || !this.tree.nodes) return [];
    const res: { node: NamuNode; note: NamuLeafNote }[] = [];

    this.tree.nodes.forEach(node => {
      if (node.leaves) {
        node.leaves.forEach(note => {
          res.push({ node, note });
        });
      }
    });

    return res.sort((a, b) => b.note.createdAt - a.note.createdAt);
  }

  get allTags(): string[] {
    const set = new Set<string>();
    this.allNotes.forEach(item => {
      item.note.tags.forEach(t => set.add(t));
    });
    return Array.from(set);
  }

  get filteredNotes(): { node: NamuNode; note: NamuLeafNote }[] {
    let res = this.allNotes;

    if (this.selectedTag) {
      res = res.filter(item => item.note.tags.includes(this.selectedTag));
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      res = res.filter(item =>
        item.note.title.toLowerCase().includes(q) ||
        item.note.content.toLowerCase().includes(q) ||
        item.node.title.toLowerCase().includes(q)
      );
    }

    return res;
  }

  jumpToNode(node: NamuNode) {
    this.selectNode.emit(node);
    this.closeDrawer();
  }

  deleteNote(nodeId: string, leafId: string) {
    if (confirm('Delete this leaf note?')) {
      this.namuStorageService.deleteLeafNote(this.tree.id, nodeId, leafId);
    }
  }

  closeDrawer() {
    this.close.emit();
  }
}
