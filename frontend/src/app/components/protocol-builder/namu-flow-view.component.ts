import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, AfterViewInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NamuDocument, NamuTree, NamuNode, NamuLeafNote, estimateNamuNodeHeight } from '../../models/namu.model';
import { NamuStorageService } from '../../services/namu-storage.service';

export interface ConnectionPath {
  id: string;
  sourceId: string;
  targetId: string;
  d: string;
}

@Component({
  selector: 'app-namu-flow-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="namu-flow-container" #container
      [class.connection-edit-mode]="connectionEditMode"
      [class.is-panning]="isPanningCanvas"
      tabindex="0"
      aria-label="Protocol canvas. Use the arrow keys to pan, Shift plus mouse wheel to move horizontally, Control or Command plus mouse wheel to zoom, or middle mouse drag to pan."
      (wheel)="onWheel($event)"
      (mousedown)="onCanvasMouseDown($event)"
      (touchstart)="onCanvasTouchStart($event)"
      (touchmove)="onCanvasTouchMove($event)"
      (touchend)="onCanvasTouchEnd($event)"
      (touchcancel)="onCanvasTouchEnd($event)"
      (keydown)="onCanvasKeydown($event)">

      <div class="connection-edit-frame" *ngIf="connectionEditMode" aria-hidden="true"></div>

      <div class="connection-edit-hint" *ngIf="connectionEditMode">
        <span>Drag one node onto another to create a link. Click an existing link to remove it.</span>
        <button type="button" (click)="clearConnectionSelection()">Cancel selection</button>
      </div>

      <div class="canvas-navigation-hint" aria-hidden="true">
        Middle-drag to pan · Shift + wheel for horizontal scroll · Ctrl/Cmd + wheel to zoom
      </div>

      <!-- Scalable Massive 10x Canvas Content Wrapper (25,000px x 20,000px) -->
      <div class="flow-viewport-content"
        [class.has-focused-node]="!!focusedNodeId"
        [style.transform]="'scale(' + zoomScale + ')'"
        [style.transformOrigin]="'0 0'">
        
        <!-- The selected tree owns this workspace. Other trees are opened in
             their own canvas when selected from the tree switcher. -->
        <div class="tree-boundary-box"
          *ngFor="let tb of allTreeBounds"
          [class.primary-tree-boundary]="tb.isPrimary"
          [style.left.px]="tb.bounds.left"
          [style.top.px]="tb.bounds.top"
          [style.width.px]="tb.bounds.width"
          [style.height.px]="tb.bounds.height"
          (mousedown)="startDragTree($event, tb.tree)">
          
          <div class="boundary-header-tag" [class.primary-tag]="tb.isPrimary">
            <span>📍 {{ tb.tree.name }} ({{ tb.tree.nodes.length }} Nodes)</span>
          </div>
        </div>

        <!-- SVG Layer for Connection Lines -->
        <svg class="connections-svg">
          <!-- Existing Connection Paths -->
          <g *ngFor="let conn of connections">
            <path
              [attr.d]="conn.d"
              stroke="#64748b"
              stroke-width="3"
              fill="none"
              stroke-dasharray="7,5"
              class="connection-line" />
            <path
              [attr.d]="conn.d"
              stroke="transparent"
              [attr.stroke-width]="connectionHitStrokeWidth"
              fill="none"
              class="connection-hit-area"
              (mousedown)="disconnectPath(conn.sourceId, conn.targetId); $event.preventDefault(); $event.stopPropagation()" />
          </g>

          <!-- Active Drag-to-Connect Preview Path -->
          <path *ngIf="isConnectingDrag && tempConnectionPath"
            [attr.d]="tempConnectionPath"
            stroke="#2563eb"
            stroke-width="3.5"
            stroke-dasharray="4,4"
            fill="none"
            class="temp-connection-line" />
        </svg>

        <!-- Nodes Layer: renders only the selected tree in this workspace. -->
        <div class="nodes-layer">
          <ng-container *ngFor="let t of allTrees">
            <div class="node-wrapper"
              *ngFor="let node of t.nodes"
              [attr.data-node-id]="node.id"
              [style.left.px]="node.x || 100"
              [style.top.px]="node.y || 200"
              [class.is-focused]="focusedNodeId === node.id"
              [class.connection-source]="connectionEditMode && connectionSourceNodeId === node.id"
              (mouseup)="onNodeMouseUp(node, t)">
              
              <!-- Node Card (Base Canvas Card) -->
              <div class="node-card"
                [class.focused]="focusedNodeId === node.id"
                (mousedown)="startDragNode($event, node, t)"
                (touchstart)="startTouchConnectDrag($event, node)"
                (click)="onNodeClick(node)"
                [title]="connectionEditMode ? 'Select this node for connection editing' : 'Click to edit this protocol step'">
                
                <!-- Sleek Left (+) Handle: Target connection port & Quick Prepend -->
                <button *ngIf="!connectionEditMode" type="button" class="clean-handle-btn left-handle"
                  (mousedown)="$event.stopPropagation()"
                  (click)="addNodeBefore(node, t); $event.stopPropagation()"
                  (mouseup)="onInputPortMouseUp(node, t); $event.stopPropagation()"
                  title="Click to add node BEFORE or target connection port">
                  +
                </button>

                <!-- Sleek Right (+) Handle: Drag to CONNECT or Click to APPEND -->
                <button *ngIf="!connectionEditMode" type="button" class="clean-handle-btn right-handle"
                  (mousedown)="startConnectDrag($event, node); $event.stopPropagation()"
                  (click)="addNodeAfter(node, t); $event.stopPropagation()"
                  title="Drag to CONNECT or click to add node AFTER">
                  +
                </button>

                <div class="node-card-header">
                  <strong class="node-card-title">{{ node.title }}</strong>
                </div>

                <div class="node-card-body">
                  <!-- Step List -->
                  <div class="steps-preview" *ngIf="node.steps && node.steps.length > 0">
                    <div class="step-inline-row" *ngFor="let s of node.steps; let i = index">
                      <span class="step-num-badge">{{ i + 1 }}.</span>
                      <span class="step-chip">{{ s }}</span>
                    </div>
                  </div>
                </div>

                <!-- Footer with Clean Note Count & Actions -->
                <div class="node-card-footer">
                  <span class="clean-note-count" *ngIf="node.leaves && node.leaves.length > 0">
                    {{ node.leaves.length }} {{ node.leaves.length === 1 ? 'Note' : 'Notes' }}
                  </span>
                  <div class="node-card-actions">
                    <button type="button" class="btn-action-del" (mousedown)="$event.stopPropagation()" (click)="deleteNode(node, t); $event.stopPropagation()" title="Delete node">✕</button>
                  </div>
                </div>
              </div>
            </div>
          </ng-container>
        </div>
      </div>

      <!-- ── FIXED SCREEN-VIEWPORT HERO FOCUS INSPECTOR OVERLAY ── -->
      <!-- Opens when focusedNodeId is present; fixed to screen viewport (NOT canvas zoom scale) -->
      <div class="fixed-focused-hero-overlay"
        *ngIf="focusedNode"
        (click)="closeFocusNode()">
        
        <div class="hero-modal-content-wrapper" (click)="$event.stopPropagation()">
          
          <!-- ── LEFT COLUMN: MAIN 760px HERO STEP INSPECTOR CARD ── -->
          <main class="hero-focused-card">
            <div class="node-card-header">
              <input type="text"
                class="node-title-inline-input"
                [(ngModel)]="focusedNode.title"
                (blur)="saveNode(focusedNode)"
                (click)="$event.stopPropagation()"
                (mousedown)="$event.stopPropagation()"
                (keydown)="$event.stopPropagation()"
                placeholder="Node Title...">
              
              <button type="button" class="btn-close-focus" (click)="closeFocusNode(); $event.stopPropagation()">✕</button>
            </div>

            <div class="node-card-body">
              <!-- Steps List -->
              <div class="steps-preview">
                <div class="step-inline-row" *ngFor="let s of focusedNode.steps; let i = index; trackBy: trackByIndex">
                  <span class="step-num-badge">{{ i + 1 }}.</span>
                  <input type="text"
                    [(ngModel)]="focusedNode.steps[i]"
                    (blur)="saveNode(focusedNode)"
                    (click)="$event.stopPropagation()"
                    (mousedown)="$event.stopPropagation()"
                    (keydown)="$event.stopPropagation()"
                    class="step-edit-input">
                  <button type="button" class="btn-del-step" (click)="deleteStep(focusedNode, i); $event.stopPropagation()">✕</button>
                </div>
              </div>

              <button type="button" class="btn-add-step-inline" (click)="addStep(focusedNode); $event.stopPropagation()">
                + Step
              </button>
            </div>

            <!-- Footer -->
            <div class="node-card-footer">
              <span class="clean-note-count" *ngIf="focusedNode.leaves && focusedNode.leaves.length > 0">
                {{ focusedNode.leaves.length }} {{ focusedNode.leaves.length === 1 ? 'Note' : 'Notes' }}
              </span>
              <div class="node-card-actions">
                <button type="button" class="btn-node-copy" (click)="copyNode(focusedNode); $event.stopPropagation()">Copy node</button>
                <button type="button" class="btn-node-copy" *ngIf="hasCopiedNode" (click)="pasteNode(focusedNode); $event.stopPropagation()">Paste node</button>
                <button type="button" class="btn-add-note" (click)="addLeafNote(focusedNode); $event.stopPropagation()">
                  + Add Note
                </button>
                <button type="button" class="btn-action-del" (click)="deleteNode(focusedNode); $event.stopPropagation()" title="Delete node">✕</button>
              </div>
            </div>
          </main>

          <!-- ── RIGHT COLUMN: MASSIVE 650px ULTRA-WIDE ZERO-WASTE NOTEPAD SIDEBAR ── -->
          <aside class="hero-right-leaves-sidebar" *ngIf="focusedNode.leaves && focusedNode.leaves.length > 0">
            <div class="sidebar-header">
              <span class="sidebar-title">Notes ({{ focusedNode.leaves.length }})</span>
              <button type="button" class="btn-sidebar-add-leaf" (click)="addLeafNote(focusedNode); $event.stopPropagation()">+ Add Note</button>
            </div>

            <div class="sidebar-leaves-list">
              <div class="pure-memo-card"
                *ngFor="let leaf of focusedNode.leaves; let li = index; trackBy: trackByIndex"
                [style.border-left-color]="leaf.color || '#10b981'">
                
                <button type="button" class="btn-del-memo-absolute" (click)="deleteLeafNote(focusedNode, leaf.id); $event.stopPropagation()" title="Delete note">✕</button>

                <textarea class="pure-memo-textarea"
                  [(ngModel)]="leaf.content"
                  (input)="autoExpandTextarea($event)"
                  (blur)="saveNode(focusedNode)"
                  (click)="$event.stopPropagation()"
                  (mousedown)="$event.stopPropagation()"
                  (keydown)="$event.stopPropagation()"
                  placeholder="Type research memo..."></textarea>
              </div>
            </div>
          </aside>

        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; overflow: hidden; position: relative; }
    .namu-flow-container {
      width: 100%; height: 100%; background: #f8fafc;
      background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
      background-size: 28px 28px; position: relative; overflow: auto;
      user-select: none; cursor: default; scrollbar-gutter: stable both-edges;
      scrollbar-width: auto; scrollbar-color: #94a3b8 #e2e8f0;
    }
    .namu-flow-container:focus-visible { outline: 3px solid rgba(37, 99, 235, 0.45); outline-offset: -3px; }
    .namu-flow-container.is-panning { cursor: grabbing; }
    .namu-flow-container::-webkit-scrollbar { width: 14px; height: 14px; }
    .namu-flow-container::-webkit-scrollbar-track { background: #e2e8f0; }
    .namu-flow-container::-webkit-scrollbar-thumb { background: #94a3b8; border: 3px solid #e2e8f0; border-radius: 999px; }
    .namu-flow-container::-webkit-scrollbar-thumb:hover { background: #64748b; }
    .canvas-navigation-hint {
      position: fixed; left: 28px; bottom: 22px; z-index: 30; width: max-content; padding: 7px 10px;
      border: 1px solid #cbd5e1; border-radius: 9px; background: rgba(255, 255, 255, 0.94);
      color: #475569; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.10); font-size: 0.76rem; font-weight: 600;
      pointer-events: none;
    }
    .connection-edit-frame {
      /* Fixed to the visible canvas, below the global and Tree Protocol toolbars. */
      position: fixed;
      top: calc(var(--nav-height, 56px) + 66px);
      right: 10px; bottom: 10px; left: 10px;
      z-index: 40; pointer-events: none;
      box-sizing: border-box;
      padding: 2px; border-radius: 18px;
      background: linear-gradient(120deg, #8b5cf6, #3b82f6, #34d399, #fbbf24);
      /* Cut out the centre: this is a frame only, never a colour overlay. */
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
    }
    .namu-flow-container.connection-edit-mode { cursor: crosshair; }
    .namu-flow-container.connection-edit-mode .node-card { touch-action:none; }
    .connection-edit-hint {
      position: fixed; z-index: 45;
      top: calc(var(--nav-height, 56px) + 68px);
      left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 12px; padding: 9px 12px;
      border: 1px solid transparent; border-radius: 12px;
      background:
        linear-gradient(rgba(255, 255, 255, .96), rgba(248, 250, 252, .96)) padding-box,
        linear-gradient(120deg, #8b5cf6, #3b82f6, #34d399) border-box;
      color: #1e3a8a; box-shadow: 0 8px 22px rgba(37, 99, 235, 0.16);
      font-size: 0.84rem; font-weight: 600;
    }
    .connection-edit-hint button {
      border: 0; background: transparent; color: #1d4ed8; cursor: pointer; font: inherit; text-decoration: underline;
    }

    /* MASSIVE 10x INFINITE CANVAS WORKSPACE (25,000px x 20,000px) */
    .flow-viewport-content {
      position: absolute; top: 0; left: 0; width: 25000px; height: 20000px;
    }

    /* ── VISIBLE CANVAS BOUNDARY FRAME (범위 영역 표시) ── */
    .tree-boundary-box {
      position: absolute; border: 3px dashed #94a3b8; border-radius: 20px;
      background: rgba(241, 245, 249, 0.5); pointer-events: auto; z-index: 0;
      cursor: move;
      transition: border-color 0.2s ease, background-color 0.2s ease;
    }
    .tree-boundary-box:active { cursor: grabbing; }
    .boundary-header-tag {
      position: absolute; top: -16px; left: 28px; background: #334155; color: #ffffff;
      padding: 5px 14px; border-radius: 14px; font-size: 0.82rem; font-weight: 700;
      letter-spacing: 0.4px; box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    }

    .connections-svg {
      position: absolute; top: 0; left: 0; width: 25000px; height: 20000px;
      pointer-events: none; z-index: 1;
    }
    .connection-line {
      pointer-events: none; transition: stroke 0.2s, stroke-width 0.2s;
    }
    .connection-hit-area { pointer-events: stroke; cursor: pointer; }
    .connection-edit-mode .connection-hit-area:hover { stroke: rgba(239, 68, 68, 0.24); }
    .temp-connection-line {
      pointer-events: none;
    }

    .nodes-layer {
      position: absolute; top: 0; left: 0; width: 25000px; height: 20000px; z-index: 2;
      pointer-events: none;
    }
    .node-wrapper {
      position: absolute; width: 360px; z-index: 2; transition: z-index 0.3s; pointer-events: auto;
    }
    .node-wrapper.connection-source .node-card {
      border-color: #2563eb; box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.2);
    }

    /* LARGE BASE NODE CARD (360px Base Width) */
    .node-card {
      background: #ffffff; border: 2px solid #cbd5e1; border-radius: 14px;
      box-shadow: 0 6px 12px -2px rgba(0,0,0,0.1);
      padding: 18px; display: flex; flex-direction: column; gap: 12px;
      cursor: pointer; position: relative; width: 360px; box-sizing: border-box;
      transition: transform 0.25s ease, box-shadow 0.25s, border-color 0.25s, opacity 0.25s;
    }
    .node-card:hover { transform: scale(1.03); border-color: #2563eb; box-shadow: 0 14px 24px -4px rgba(0,0,0,0.15); }
    .node-card.completed { border-top: 6px solid #16a34a; }
    .node-card.in_progress { border-top: 6px solid #2563eb; }
    .node-card.planned { border-top: 6px solid #64748b; }
    .node-card.failed { border-top: 6px solid #dc2626; }

    /* Sleek Minimal (+) Side Handles (No circle frame clutter!) */
    .clean-handle-btn {
      position: absolute; top: 50%; transform: translateY(-50%); width: 22px; height: 22px;
      border-radius: 6px; background: #ffffff; border: 1.5px solid #94a3b8; color: #2563eb;
      font-size: 14px; font-weight: 800; display: flex; align-items: center; justify-content: center;
      cursor: pointer; z-index: 15; box-shadow: 0 2px 5px rgba(0,0,0,0.12);
      transition: background 0.15s, color 0.15s, transform 0.15s, border-color 0.15s;
    }
    .clean-handle-btn:hover {
      background: #2563eb; color: #ffffff; border-color: #2563eb; transform: translateY(-50%) scale(1.25);
    }
    .clean-handle-btn.left-handle { left: -11px; }
    .clean-handle-btn.right-handle { right: -11px; }

    .node-card-header { display: flex; align-items: center; gap: 12px; }
    .status-indicator { width: 12px; height: 12px; border-radius: 50%; background: #94a3b8; flex-shrink: 0; }
    .status-indicator.completed { background: #16a34a; }
    .status-indicator.in_progress { background: #2563eb; }
    .status-indicator.planned { background: #64748b; }
    .status-indicator.failed { background: #dc2626; }
    
    .node-card-title { font-size: 1.15rem; font-weight: 700; color: #0f172a; flex: 1; white-space: normal; word-break: break-word; line-height: 1.35; }
    .node-title-inline-input { font-size: 1.3rem; font-weight: 800; color: #0f172a; flex: 1; border: none; border-bottom: 2px solid transparent; background: transparent; outline: none; padding: 2px 0; width: 100%; transition: border-color 0.2s; }
    .node-title-inline-input:focus { border-bottom-color: #2563eb; }

    .node-card-body { font-size: 0.92rem; color: #475569; display: flex; flex-direction: column; gap: 10px; }

    .steps-preview { display: flex; flex-direction: column; gap: 8px; }
    .step-inline-row { display: flex; align-items: flex-start; gap: 8px; }
    .step-num-badge { font-size: 0.9rem; font-weight: bold; color: #64748b; margin-top: 2px; }
    .step-chip { white-space: normal; word-break: break-word; line-height: 1.4; flex: 1; font-size: 0.92rem; }
    .step-edit-input { flex: 1; border: none; border-bottom: 1px solid transparent; background: transparent; outline: none; padding: 2px 0; font-size: 0.95rem; line-height: 1.5; color: #334155; transition: border-color 0.2s; font-family: inherit; }
    .step-edit-input:focus { border-bottom-color: #2563eb; }

    .btn-del-step { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px; font-weight: bold; opacity: 0.6; }
    .btn-del-step:hover { opacity: 1; }
    .btn-add-step-inline { padding: 4px 12px; background: #f1f5f9; color: #2563eb; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.84rem; font-weight: 700; cursor: pointer; align-self: flex-start; transition: background 0.15s; }
    .btn-add-step-inline:hover { background: #e2e8f0; }

    .node-card-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; pt: 10px; font-size: 0.88rem; }
    .clean-note-count { color: #64748b; font-size: 0.88rem; font-weight: 600; padding: 0; background: none; border: none; }
    .node-card-actions { display: flex; gap: 8px; }
    .btn-add-note { border: 1px solid #86efac; border-radius: 6px; padding: 5px 10px; background: #f0fdf4; color: #15803d; cursor: pointer; font-size: 0.82rem; font-weight: 700; }
    .btn-add-note:hover { background: #dcfce7; }
    .btn-node-copy { border:1px solid #bfdbfe; border-radius:6px; padding:5px 9px; background:#eff6ff; color:#1d4ed8; cursor:pointer; font-size:.78rem; font-weight:700; }
    .btn-node-copy:hover { background:#dbeafe; border-color:#93c5fd; }
    .btn-action-del { background: none; border: none; color: #94a3b8; cursor: pointer; font-weight: bold; }
    .btn-action-del:hover { color: #dc2626; }

    /* ── FIXED SCREEN-VIEWPORT HERO FOCUS INSPECTOR OVERLAY ── */
    .fixed-focused-hero-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100dvh;
      z-index: 1000; display: flex; align-items: center; justify-content: center;
      pointer-events: auto; background: rgba(15, 23, 42, 0.35); backdrop-filter: blur(4px);
    }
    .hero-modal-content-wrapper {
      display: flex; gap: 20px; align-items: flex-start; max-width: 95vw; max-height: 85vh; z-index: 1010;
    }

    /* ── RIGHT COLUMN: MASSIVE 650px ULTRA-WIDE ZERO-WASTE NOTEPAD SIDEBAR ── */
    .hero-right-leaves-sidebar {
      width: 650px; max-width: 45vw; flex-shrink: 0; background: #ffffff; border-radius: 18px;
      border: 1px solid #cbd5e1; padding: 18px; display: flex; flex-direction: column; gap: 14px;
      max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.18);
    }
    .sidebar-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
    .sidebar-title { font-size: 1.05rem; font-weight: 800; color: #16a34a; }
    .btn-sidebar-add-leaf { padding: 5px 14px; background: #dcfce7; color: #15803d; border: 1px solid #86efac; border-radius: 6px; font-size: 0.88rem; font-weight: 700; cursor: pointer; }
    .sidebar-leaves-list { display: flex; flex-direction: column; gap: 12px; }
    
    .pure-memo-card {
      position: relative; background: #ffffff; border: 1.5px solid #cbd5e1;
      border-left: 6px solid #10b981; border-radius: 12px; padding: 10px 14px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .pure-memo-card:focus-within {
      border-color: #10b981; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.2);
    }
    .btn-del-memo-absolute {
      position: absolute; top: 8px; right: 10px; background: none; border: none;
      color: #94a3b8; cursor: pointer; font-size: 14px; font-weight: bold; z-index: 5;
    }
    .btn-del-memo-absolute:hover { color: #ef4444; }
    .pure-memo-textarea {
      border: none; outline: none; width: 100%; padding-right: 20px;
      font-size: 1.02rem; line-height: 1.55; color: #0f172a; resize: none;
      min-height: 90px; background: transparent; font-family: inherit; overflow: hidden;
    }

    /* ── RIGHT COLUMN: MAIN HERO CARD STEP EDITOR (760px) ── */
    .hero-focused-card {
      width: 760px; max-width: 65vw; background: #ffffff; border: 3px solid #2563eb; border-radius: 18px;
      box-shadow: 0 25px 60px -10px rgba(37, 99, 235, 0.45); padding: 24px;
      display: flex; flex-direction: column; gap: 16px; max-height: 80vh; overflow-y: auto;
    }

    .btn-close-focus {
      background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 50%; width: 32px; height: 32px;
      font-size: 1.2rem; color: #64748b; cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center;
    }
    .btn-close-focus:hover { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
    @media (max-width: 700px) {
      .canvas-navigation-hint { display: none; }
      .namu-flow-container { touch-action: pan-x pan-y; }
      .boundary-header-tag { font-size: .7rem; padding: 4px 9px; }
      .connection-edit-hint { top: calc(var(--nav-height, 56px) + 50px); width: calc(100vw - 24px); box-sizing: border-box; font-size: .7rem; }
      .connection-edit-frame { display:none; }
      .fixed-focused-hero-overlay { align-items:flex-start; padding:10px; box-sizing:border-box; overflow:hidden; }
      .hero-modal-content-wrapper { flex-direction:column; gap:10px; width:100%; max-width:none; max-height:calc(100dvh - 20px); overflow-y:auto; }
      .hero-focused-card,
      .hero-right-leaves-sidebar { width:100%; max-width:none; max-height:none; padding:14px; border-width:2px; border-radius:13px; box-sizing:border-box; overflow:visible; }
      .hero-focused-card { gap:11px; }
      .hero-right-leaves-sidebar { flex-shrink:0; gap:10px; }
      .node-title-inline-input { min-width:0; font-size:1rem; }
      .hero-focused-card .step-inline-row { gap:5px; }
      .hero-focused-card .step-edit-input { min-width:0; font-size:.82rem; }
      .hero-focused-card .node-card-footer { align-items:flex-start; flex-wrap:wrap; gap:8px; }
      .hero-focused-card .node-card-actions { flex-wrap:wrap; }
      .pure-memo-textarea { min-height:64px; font-size:.86rem; }
    }
  `]
})
export class NamuFlowViewComponent implements AfterViewInit {
  @Input() tree!: NamuTree;
  @Input() doc?: NamuDocument;
  @Input() connectionEditMode = false;
  @Output() editNode = new EventEmitter<NamuNode>();
  @ViewChild('container') containerRef!: ElementRef;

  Math = Math;
  zoomScale: number = 1.0;

  /** Keep the invisible delete target comfortably clickable after zoom-to-fit. */
  get connectionHitStrokeWidth(): number {
    return Math.max(64, 30 / Math.max(this.zoomScale, 0.1));
  }

  focusedNodeId: string | null = null;
  connectionSourceNodeId: string | null = null;

  // Node Dragging state
  draggingNode: NamuNode | null = null;
  hasMovedNode = false;
  private readonly dragClickThreshold = 12;
  dragStartX = 0;
  dragStartY = 0;
  dragOffsetX = 0;
  dragOffsetY = 0;

  // Tree dragging state: the bottom-right handle moves every node together.
  draggingTree: NamuTree | null = null;
  treeDragStartX = 0;
  treeDragStartY = 0;
  hasMovedTree = false;
  treeDragNodePositions = new Map<string, { x: number; y: number }>();

  // Canvas panning state for conventional mouse users.
  isPanningCanvas = false;
  private canvasPanStartClientX = 0;
  private canvasPanStartClientY = 0;
  private canvasPanStartScrollLeft = 0;
  private canvasPanStartScrollTop = 0;
  private pinchStartDistance = 0;
  private pinchStartScale = 1;
  private pinchCanvasX = 0;
  private pinchCanvasY = 0;

  // Connection Dragging state (Drag-to-Connect)
  isConnectingDrag = false;
  connectSourceNode: NamuNode | null = null;
  tempMouseX = 0;
  tempMouseY = 0;
  constructor(private namuStorageService: NamuStorageService) {}

  ngAfterViewInit() {
    setTimeout(() => {
      this.centerTreeInCanvas();
    }, 120);
  }

  get allTrees(): NamuTree[] {
    return this.tree ? [this.tree] : [];
  }

  get allTreeBounds(): { tree: NamuTree; bounds: { left: number; top: number; width: number; height: number }; isPrimary: boolean }[] {
    return this.allTrees.map(t => {
      if (!t.nodes || t.nodes.length === 0) {
        return {
          tree: t,
          bounds: { left: 12400, top: 9900, width: 560, height: 440 },
          isPrimary: !!(this.tree && t.id === this.tree.id)
        };
      }
      const xs = t.nodes.map(n => n.x || 100);
      const ys = t.nodes.map(n => n.y || 200);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxBottom = Math.max(...t.nodes.map(n => (n.y || 200) + estimateNamuNodeHeight(n)));
      const padding = 100;
      return {
        tree: t,
        bounds: {
          left: minX - padding,
          top: minY - padding,
          width: (maxX - minX) + 360 + (padding * 2),
          height: (maxBottom - minY) + (padding * 2)
        },
        isPrimary: !!(this.tree && t.id === this.tree.id)
      };
    });
  }

  get focusedNode(): NamuNode | undefined {
    if (!this.focusedNodeId) return undefined;
    for (const t of this.allTrees) {
      if (t.nodes) {
        const found = t.nodes.find(n => n.id === this.focusedNodeId);
        if (found) return found;
      }
    }
    return undefined;
  }

  get hasCopiedNode(): boolean { return this.namuStorageService.hasCopiedNode; }

  get connections(): ConnectionPath[] {
    const res: ConnectionPath[] = [];
    const nodeMap = new Map<string, NamuNode>();

    this.allTrees.forEach(t => {
      if (t.nodes) {
        t.nodes.forEach(n => nodeMap.set(n.id, n));
      }
    });

    this.allTrees.forEach(t => {
      if (t.nodes) {
        t.nodes.forEach(source => {
          if (source.nextNodes) {
            source.nextNodes.forEach(targetId => {
              const target = nodeMap.get(targetId);
              if (target) {
                const d = this.connectionPathForNodes(source, target);

                res.push({
                  id: `${source.id}_${target.id}`,
                  sourceId: source.id,
                  targetId: target.id,
                  d
                });
              }
            });
          }
        });
      }
    });

    return res;
  }

  get tempConnectionPath(): string {
    if (!this.connectSourceNode) return '';
    const x1 = (this.connectSourceNode.x || 100) + 360;
    const y1 = this.nodeConnectionY(this.connectSourceNode);
    const x2 = this.tempMouseX;
    const y2 = this.tempMouseY;

    return this.roundedOrthogonalConnectionPath(x1, y1, x2, y2, x1 + Math.max(48, (x2 - x1) / 2));
  }

  private connectionPathForNodes(source: NamuNode, target: NamuNode): string {
    const x1 = (source.x || 100) + 360;
    const y1 = this.nodeConnectionY(source);
    const x2 = target.x || 100;
    const y2 = this.nodeConnectionY(target);
    const routeX = this.findDirectRouteX(source, target, x1, y1, x2, y2);
    return routeX === null
      ? this.detourAroundNodes(source, target, x1, y1, x2, y2)
      : this.roundedOrthogonalConnectionPath(x1, y1, x2, y2, routeX);
  }

  private nodeConnectionY(node: NamuNode): number {
    // Nodes are aligned by their top edge. Anchor every connection at the same
    // header-level Y position so cards with longer step lists do not create a
    // misleading vertical bend in an otherwise straight workflow.
    return (node.y || 200) + 30;
  }

  /**
   * Select a vertical routing lane that does not pass through another card.
   * Connections still leave from the right and enter from the left, but a
   * back-link detours just outside both cards instead of disappearing behind
   * a card below it.
   */
  private findDirectRouteX(source: NamuNode, target: NamuNode, x1: number, y1: number, x2: number, y2: number): number | null {
    const clearance = 28;
    const lowY = Math.min(y1, y2);
    const highY = Math.max(y1, y2);
    const blockers = this.allTrees
      .flatMap(tree => tree.nodes || [])
      .filter(node => node.id !== source.id && node.id !== target.id)
      .filter(node => {
        const top = node.y || 200;
        const bottom = top + estimateNamuNodeHeight(node);
        return bottom + clearance >= lowY && top - clearance <= highY;
      });

    const isClear = (routeX: number) => blockers.every(node => {
      const left = node.x || 100;
      return routeX < left - clearance || routeX > left + 360 + clearance;
    });

    // Direct lanes are only safe when the target sits entirely to the right
    // of the source exit. Otherwise a line would travel through a card.
    if (x2 <= x1 + clearance * 2) return null;

    const minLane = x1 + clearance;
    const maxLane = x2 - clearance;
    const preferred = (x1 + x2) / 2;
    const candidates = [
      preferred,
      minLane,
      maxLane,
      ...blockers.flatMap(node => [(node.x || 100) - clearance, (node.x || 100) + 360 + clearance])
    ].filter(candidate => candidate >= minLane && candidate <= maxLane && isClear(candidate));

    if (candidates.length > 0) {
      return candidates.reduce((best, candidate) =>
        Math.abs(candidate - preferred) < Math.abs(best - preferred) ? candidate : best
      );
    }
    return null;
  }

  /** Route crowded/backward links outside card edges, then back into the target's left port. */
  private detourAroundNodes(source: NamuNode, target: NamuNode, x1: number, y1: number, x2: number, y2: number): string {
    const clearance = 42;
    const sourceTop = source.y || 200;
    const targetTop = target.y || 200;
    const sourceBottom = sourceTop + estimateNamuNodeHeight(source);
    const targetBottom = targetTop + estimateNamuNodeHeight(target);
    const horizontalStart = Math.min(x1, x2 - clearance);
    const horizontalEnd = Math.max(x1 + clearance, x2);
    const allNodes = this.allTrees.flatMap(tree => tree.nodes || []);
    const laneIsClear = (laneY: number) => allNodes.every(node => {
      const left = node.x || 100;
      const right = left + 360;
      const top = node.y || 200;
      const bottom = top + estimateNamuNodeHeight(node);
      const overlapsHorizontal = right >= horizontalStart && left <= horizontalEnd;
      return !overlapsHorizontal || laneY < top - clearance || laneY > bottom + clearance;
    });

    const preferredTop = Math.min(sourceTop, targetTop) - clearance;
    const preferredBottom = Math.max(sourceBottom, targetBottom) + clearance;
    const laneCandidates = [
      preferredTop,
      preferredBottom,
      ...allNodes.flatMap(node => [
        (node.y || 200) - clearance,
        (node.y || 200) + estimateNamuNodeHeight(node) + clearance
      ])
    ].filter(laneIsClear);
    const midpointY = (y1 + y2) / 2;
    const routeY = laneCandidates.length > 0
      ? laneCandidates.reduce((best, candidate) => Math.abs(candidate - midpointY) < Math.abs(best - midpointY) ? candidate : best)
      : preferredBottom;
    const sourceLaneX = x1 + clearance;
    const targetLaneX = x2 - clearance;

    return this.roundedPolyline([
      { x: x1, y: y1 },
      { x: sourceLaneX, y: y1 },
      { x: sourceLaneX, y: routeY },
      { x: targetLaneX, y: routeY },
      { x: targetLaneX, y: y2 },
      { x: x2, y: y2 }
    ]);
  }

  /** Keep the readable right-angle structure, with rounded rather than sharp turns. */
  private roundedOrthogonalConnectionPath(x1: number, y1: number, x2: number, y2: number, routeX: number): string {
    if (Math.abs(y2 - y1) < 2) return `M ${x1} ${y1} H ${x2}`;
    return this.roundedPolyline([
      { x: x1, y: y1 },
      { x: routeX, y: y1 },
      { x: routeX, y: y2 },
      { x: x2, y: y2 }
    ]);
  }

  private roundedPolyline(points: Array<{ x: number; y: number }>): string {
    const radiusLimit = 22;
    let path = `M ${points[0].x} ${points[0].y}`;

    for (let index = 1; index < points.length - 1; index++) {
      const previous = points[index - 1];
      const corner = points[index];
      const next = points[index + 1];
      const incomingLength = Math.hypot(corner.x - previous.x, corner.y - previous.y);
      const outgoingLength = Math.hypot(next.x - corner.x, next.y - corner.y);
      const radius = Math.min(radiusLimit, incomingLength / 2, outgoingLength / 2);
      const before = {
        x: corner.x + ((previous.x - corner.x) / incomingLength) * radius,
        y: corner.y + ((previous.y - corner.y) / incomingLength) * radius
      };
      const after = {
        x: corner.x + ((next.x - corner.x) / outgoingLength) * radius,
        y: corner.y + ((next.y - corner.y) / outgoingLength) * radius
      };
      path += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`;
    }

    const last = points[points.length - 1];
    return `${path} L ${last.x} ${last.y}`;
  }

  // Mouse Wheel Zoom-to-Cursor
  onWheel(e: WheelEvent) {
    if (!this.containerRef) return;
    const el = this.containerRef.nativeElement as HTMLElement;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();

      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const oldScale = this.zoomScale;
      const canvasX = (cursorX + el.scrollLeft) / oldScale;
      const canvasY = (cursorY + el.scrollTop) / oldScale;

      const delta = -e.deltaY * 0.0022;
      const newScale = Math.max(0.02, Math.min(4.0, oldScale + delta));
      this.zoomScale = newScale;

      const newScrollLeft = canvasX * newScale - cursorX;
      const newScrollTop = canvasY * newScale - cursorY;

      el.scrollLeft = Math.max(0, newScrollLeft);
      el.scrollTop = Math.max(0, newScrollTop);
      return;
    }

    // Most mouse wheels only emit a vertical delta. Shift gives desktop users
    // an intentional horizontal-pan gesture without relying on a trackpad.
    if (e.shiftKey) {
      e.preventDefault();
      el.scrollLeft += e.deltaY || e.deltaX;
    }
  }

  onCanvasTouchStart(e: TouchEvent) {
    if (e.touches.length !== 2 || !this.containerRef) return;
    e.preventDefault();
    const el = this.containerRef.nativeElement as HTMLElement;
    const rect = el.getBoundingClientRect();
    const midpoint = this.touchMidpoint(e.touches);
    this.pinchStartDistance = this.touchDistance(e.touches);
    this.pinchStartScale = this.zoomScale;
    this.pinchCanvasX = (midpoint.x - rect.left + el.scrollLeft) / this.zoomScale;
    this.pinchCanvasY = (midpoint.y - rect.top + el.scrollTop) / this.zoomScale;
  }

  onCanvasTouchMove(e: TouchEvent) {
    if (this.isConnectingDrag && e.touches.length === 1) {
      e.preventDefault();
      this.updateTempTouch(e.touches[0]);
      return;
    }
    if (e.touches.length !== 2 || !this.containerRef || !this.pinchStartDistance) return;
    e.preventDefault();
    const el = this.containerRef.nativeElement as HTMLElement;
    const rect = el.getBoundingClientRect();
    const midpoint = this.touchMidpoint(e.touches);
    const ratio = this.touchDistance(e.touches) / this.pinchStartDistance;
    this.zoomScale = Math.max(0.2, Math.min(4, this.pinchStartScale * ratio));
    el.scrollLeft = Math.max(0, this.pinchCanvasX * this.zoomScale - (midpoint.x - rect.left));
    el.scrollTop = Math.max(0, this.pinchCanvasY * this.zoomScale - (midpoint.y - rect.top));
  }

  onCanvasTouchEnd(e: TouchEvent) {
    if (this.isConnectingDrag && e.changedTouches.length) {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const targetElement = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
      const targetId = targetElement?.closest<HTMLElement>('[data-node-id]')?.dataset['nodeId'];
      const targetNode = targetId ? this.tree.nodes.find(node => node.id === targetId) : undefined;
      if (targetNode) this.onPortMouseUp(targetNode, this.tree);
      else this.cancelConnectDrag();
    }
    if (e.touches.length < 2) this.pinchStartDistance = 0;
  }

  private touchDistance(touches: TouchList): number {
    return Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
  }

  private touchMidpoint(touches: TouchList): { x: number; y: number } {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }

  onCanvasKeydown(e: KeyboardEvent) {
    if (!this.containerRef || e.target !== this.containerRef.nativeElement) return;
    const step = e.shiftKey ? 420 : 140;
    const direction: Record<string, { left: number; top: number }> = {
      ArrowLeft: { left: -step, top: 0 },
      ArrowRight: { left: step, top: 0 },
      ArrowUp: { left: 0, top: -step },
      ArrowDown: { left: 0, top: step }
    };
    const movement = direction[e.key];
    if (!movement) return;
    e.preventDefault();
    (this.containerRef.nativeElement as HTMLElement).scrollBy({ ...movement, behavior: 'smooth' });
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || !this.focusedNode) return;
    const target = e.target as HTMLElement | null;
    if (target?.matches('input, textarea, [contenteditable="true"]')) return;
    if (e.key.toLowerCase() === 'c') {
      e.preventDefault();
      this.copyNode(this.focusedNode);
    } else if (e.key.toLowerCase() === 'v' && this.hasCopiedNode) {
      e.preventDefault();
      this.pasteNode(this.focusedNode);
    }
  }

  // Node Click: Focus node
  onNodeClick(node: NamuNode) {
    // A drag can also emit a click when the pointer is released. Suppress only
    // that trailing click, then clear the flag so a normal click always opens
    // the editor.
    if (this.hasMovedNode) {
      this.hasMovedNode = false;
      return;
    }

    if (this.connectionEditMode) {
      // Link editing is drag-only. A tap must never create or select a link.
      return;
    }
    
    if (this.focusedNodeId !== node.id) {
      this.focusedNodeId = node.id;
      this.centerNodeInCanvas(node);
    }
  }

  closeFocusNode() {
    this.focusedNodeId = null;
  }

  clearConnectionSelection() {
    this.cancelConnectDrag();
  }

  private editConnectionWithNode(node: NamuNode) {
    if (!this.connectionSourceNodeId) {
      this.connectionSourceNodeId = node.id;
      return;
    }

    const sourceId = this.connectionSourceNodeId;
    this.connectionSourceNodeId = null;
    if (sourceId === node.id) return;

    const sourceTree = this.allTrees.find(tree => tree.nodes.some(item => item.id === sourceId));
    const targetTree = this.getTreeForNode(node);
    if (!sourceTree || sourceTree.id !== targetTree.id) return;

    const source = sourceTree.nodes.find(item => item.id === sourceId);
    if (!source) return;

    if (source.nextNodes.includes(node.id)) {
      this.namuStorageService.disconnectNodes(sourceTree.id, sourceId, node.id);
    } else {
      this.namuStorageService.connectNodes(sourceTree.id, sourceId, node.id);
    }
  }

  // Center clicked node right in middle of screen
  centerNodeInCanvas(node: NamuNode) {
    if (!this.containerRef) return;
    const el = this.containerRef.nativeElement as HTMLElement;
    const zoom = this.zoomScale;
    const nodeCenterX = ((node.x || 100) + 180) * zoom;
    const nodeCenterY = ((node.y || 200) + 90) * zoom;
    el.scrollTo({
      left: Math.max(0, nodeCenterX - el.clientWidth / 2),
      top: Math.max(0, nodeCenterY - el.clientHeight / 2),
      behavior: 'smooth'
    });
  }

  getTreeForNode(node: NamuNode, fallbackTree?: NamuTree): NamuTree {
    if (fallbackTree) return fallbackTree;
    for (const t of this.allTrees) {
      if (t.nodes && t.nodes.some(n => n.id === node.id)) {
        return t;
      }
    }
    return this.tree;
  }

  // Zoom-to-fit Canvas Centering: Automatically adjusts zoom scale & scrolls to fit entire boundary box comfortably in screen
  centerTreeInCanvas() {
    if (!this.containerRef || !this.tree) return;
    const el = this.containerRef.nativeElement as HTMLElement;
    const primaryBoundsObj = this.allTreeBounds.find(bounds => bounds.isPrimary);
    const bounds = primaryBoundsObj?.bounds;
    if (!bounds) return;

    const vw = el.clientWidth || window.innerWidth;
    const vh = el.clientHeight || window.innerHeight;

    // Calculate ideal zoom scale so entire tree boundary fits in viewport screen with 15% margin
    const paddingMargin = 0.85;
    const scaleX = (vw * paddingMargin) / bounds.width;
    const scaleY = (vh * paddingMargin) / bounds.height;
    const idealScale = Math.min(scaleX, scaleY);

    // Safe clamped zoom scale (between 25% and 100% for comfortable initial view)
    const minimumReadableZoom = window.innerWidth <= 700 ? 0.55 : 0.25;
    const targetZoom = Math.max(minimumReadableZoom, Math.min(1.0, idealScale));
    this.zoomScale = targetZoom;

    const centerX = (bounds.left + bounds.width / 2) * targetZoom;
    const centerY = (bounds.top + bounds.height / 2) * targetZoom;
    el.scrollTo({
      left: Math.max(0, centerX - vw / 2),
      top: Math.max(0, centerY - vh / 2),
      behavior: 'smooth'
    });
  }

  trackByIndex(index: number): number {
    return index;
  }

  autoExpandTextarea(e: Event) {
    const el = e.target as HTMLTextAreaElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(90, el.scrollHeight) + 'px';
  }

  saveNode(node: NamuNode) {
    const t = this.getTreeForNode(node);
    this.namuStorageService.updateNode(t.id, node);
  }

  addStep(node: NamuNode) {
    node.steps.push('Instruction');
    this.saveNode(node);
  }

  deleteStep(node: NamuNode, idx: number) {
    node.steps.splice(idx, 1);
    this.saveNode(node);
  }

  addLeafNote(node: NamuNode) {
    const t = this.getTreeForNode(node);
    this.namuStorageService.addLeafNote(
      t.id,
      node.id,
      'New Leaf Note',
      'Write note details...',
      ['Protocol'],
      '#10b981'
    );
  }

  deleteLeafNote(node: NamuNode, leafId: string) {
    const t = this.getTreeForNode(node);
    this.namuStorageService.deleteLeafNote(t.id, node.id, leafId);
  }

  // Drag Node
  startDragNode(e: MouseEvent, node: NamuNode, tree?: NamuTree) {
    if (this.isConnectingDrag) return;
    if (this.connectionEditMode) {
      this.startConnectDrag(e, node);
      return;
    }
    this.draggingNode = node;
    this.hasMovedNode = false;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragOffsetX = (e.clientX / this.zoomScale) - (node.x || 100);
    this.dragOffsetY = (e.clientY / this.zoomScale) - (node.y || 200);
  }

  startDragTree(e: MouseEvent, tree: NamuTree) {
    e.preventDefault();
    e.stopPropagation();
    this.draggingTree = tree;
    this.treeDragStartX = e.clientX;
    this.treeDragStartY = e.clientY;
    this.hasMovedTree = false;
    this.treeDragNodePositions = new Map(
      tree.nodes.map(node => [node.id, { x: node.x || 100, y: node.y || 200 }])
    );
  }

  // Drag-to-Connect
  startConnectDrag(e: MouseEvent, node: NamuNode) {
    this.isConnectingDrag = true;
    this.connectSourceNode = node;
    this.connectionSourceNodeId = node.id;
    this.updateTempMouse(e);
  }

  startTouchConnectDrag(e: TouchEvent, node: NamuNode) {
    if (!this.connectionEditMode || e.touches.length !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    this.isConnectingDrag = true;
    this.connectSourceNode = node;
    this.connectionSourceNodeId = node.id;
    this.updateTempTouch(e.touches[0]);
  }

  onPortMouseUp(targetNode: NamuNode, tree?: NamuTree) {
    if (this.isConnectingDrag && this.connectSourceNode) {
      if (this.connectSourceNode.id !== targetNode.id) {
        const sourceTree = this.getTreeForNode(this.connectSourceNode);
        const targetTree = this.getTreeForNode(targetNode, tree);
        const source = sourceTree.nodes.find(node => node.id === this.connectSourceNode!.id);
        if (sourceTree.id === targetTree.id && source && !source.nextNodes.includes(targetNode.id)) {
          this.namuStorageService.connectNodes(sourceTree.id, this.connectSourceNode.id, targetNode.id);
        }
      }
      this.isConnectingDrag = false;
      this.connectSourceNode = null;
      this.connectionSourceNodeId = null;
    }
  }

  private cancelConnectDrag() {
    this.isConnectingDrag = false;
    this.connectSourceNode = null;
    this.connectionSourceNodeId = null;
  }

  onInputPortMouseUp(targetNode: NamuNode, tree?: NamuTree) {
    this.onPortMouseUp(targetNode, tree);
  }

  onNodeMouseUp(targetNode: NamuNode, tree?: NamuTree) {
    if (this.isConnectingDrag) {
      this.onPortMouseUp(targetNode, tree);
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onCanvasMouseMove(e: MouseEvent) {
    if (this.isPanningCanvas && this.containerRef) {
      const el = this.containerRef.nativeElement as HTMLElement;
      el.scrollLeft = this.canvasPanStartScrollLeft - (e.clientX - this.canvasPanStartClientX);
      el.scrollTop = this.canvasPanStartScrollTop - (e.clientY - this.canvasPanStartClientY);
      return;
    }

    if (this.draggingTree) {
      const deltaX = (e.clientX - this.treeDragStartX) / this.zoomScale;
      const deltaY = (e.clientY - this.treeDragStartY) / this.zoomScale;
      if (Math.hypot(e.clientX - this.treeDragStartX, e.clientY - this.treeDragStartY) > this.dragClickThreshold) {
        this.hasMovedTree = true;
      }
      this.draggingTree.nodes.forEach(node => {
        const initial = this.treeDragNodePositions.get(node.id);
        if (!initial) return;
        node.x = Math.max(20, initial.x + deltaX);
        node.y = Math.max(20, initial.y + deltaY);
      });
    }

    if (this.draggingNode) {
      const dist = Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY);
      if (dist > this.dragClickThreshold) {
        this.hasMovedNode = true;
      }
      this.draggingNode.x = Math.max(20, (e.clientX / this.zoomScale) - this.dragOffsetX);
      this.draggingNode.y = Math.max(20, (e.clientY / this.zoomScale) - this.dragOffsetY);
    }

    if (this.isConnectingDrag) {
      this.updateTempMouse(e);
    }
  }

  private updateTempMouse(e: MouseEvent) {
    if (!this.containerRef) return;
    const rect = this.containerRef.nativeElement.getBoundingClientRect();
    const container = this.containerRef.nativeElement as HTMLElement;
    // scroll offsets are measured in scaled viewport pixels, so they must be
    // combined with the cursor offset before converting back to canvas space.
    this.tempMouseX = (e.clientX - rect.left + container.scrollLeft) / this.zoomScale;
    this.tempMouseY = (e.clientY - rect.top + container.scrollTop) / this.zoomScale;
  }

  private updateTempTouch(touch: Touch) {
    if (!this.containerRef) return;
    const container = this.containerRef.nativeElement as HTMLElement;
    const rect = container.getBoundingClientRect();
    this.tempMouseX = (touch.clientX - rect.left + container.scrollLeft) / this.zoomScale;
    this.tempMouseY = (touch.clientY - rect.top + container.scrollTop) / this.zoomScale;
  }

  @HostListener('document:mouseup')
  onCanvasMouseUp() {
    if (this.isPanningCanvas) {
      this.isPanningCanvas = false;
      return;
    }
    if (this.draggingTree) {
      if (this.hasMovedTree) {
        this.namuStorageService.updateTree({ ...this.draggingTree, nodes: [...this.draggingTree.nodes] });
      }
      this.draggingTree = null;
      this.hasMovedTree = false;
      this.treeDragNodePositions.clear();
    }
    if (this.draggingNode) {
      if (this.hasMovedNode) {
        const t = this.getTreeForNode(this.draggingNode);
        this.namuStorageService.updateNode(t.id, this.draggingNode);
      }
      this.draggingNode = null;
    }
    if (this.isConnectingDrag) {
      this.cancelConnectDrag();
    }
  }

  // Canvas background click -> un-focus
  onCanvasMouseDown(e: MouseEvent) {
    if (e.button === 1 && this.containerRef) {
      e.preventDefault();
      const el = this.containerRef.nativeElement as HTMLElement;
      this.isPanningCanvas = true;
      this.canvasPanStartClientX = e.clientX;
      this.canvasPanStartClientY = e.clientY;
      this.canvasPanStartScrollLeft = el.scrollLeft;
      this.canvasPanStartScrollTop = el.scrollTop;
      el.focus({ preventScroll: true });
      return;
    }

    const target = e.target as HTMLElement;
    if (target && (target.classList.contains('namu-flow-container') || target.classList.contains('flow-viewport-content') || target.tagName.toLowerCase() === 'svg')) {
      (this.containerRef.nativeElement as HTMLElement).focus({ preventScroll: true });
      if (this.focusedNodeId) {
        this.closeFocusNode();
      }
    }
  }

  disconnectPath(sourceId: string, targetId: string) {
    if (!this.connectionEditMode) return;
    const t = this.allTrees.find(tr => tr.nodes && tr.nodes.some(n => n.id === sourceId));
    const treeId = t ? t.id : this.tree.id;
    this.namuStorageService.disconnectNodes(treeId, sourceId, targetId);
  }

  // Prepend / Append quick add
  addNodeBefore(targetNode: NamuNode, tree?: NamuTree) {
    const t = this.getTreeForNode(targetNode, tree);
    const newNode = this.namuStorageService.insertNodeBefore(t.id, targetNode.id);
    this.onNodeClick(newNode);
  }

  addNodeAfter(sourceNode: NamuNode, tree?: NamuTree) {
    const t = this.getTreeForNode(sourceNode, tree);
    const newNode = this.namuStorageService.addNode(t.id, sourceNode.id);
    this.onNodeClick(newNode);
  }

  copyNode(node: NamuNode) {
    this.namuStorageService.copyNode(node);
  }

  pasteNode(anchorNode: NamuNode) {
    const tree = this.getTreeForNode(anchorNode);
    const pasted = this.namuStorageService.pasteNode(tree.id, anchorNode.id);
    if (!pasted) return;
    this.focusedNodeId = pasted.id;
    setTimeout(() => this.centerNodeInCanvas(pasted), 0);
  }

  deleteNode(node: NamuNode, tree?: NamuTree) {
    if (confirm(`Delete node "${node.title}"?`)) {
      const t = this.getTreeForNode(node, tree);
      this.namuStorageService.deleteNode(t.id, node.id);
    }
  }
}
