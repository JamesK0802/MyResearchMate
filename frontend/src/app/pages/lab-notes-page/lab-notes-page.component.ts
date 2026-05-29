import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabNotebookService } from '../../services/lab-notebook.service';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

@Component({
  selector: 'app-lab-notes-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lab-notes-page.component.html',
  styleUrl: './lab-notes-page.component.css'
})
export class LabNotesPageComponent implements OnInit, OnDestroy {
  @ViewChild('richEditor') richEditor!: ElementRef<HTMLDivElement>;

  notes: any[] = [];
  selectedNote: any = null;
  sidebarCollapsed = false;
  
  // Note fields
  noteForm = {
    title: '',
    bodyHtml: ''
  };

  // Sync state
  syncState: 'saved' | 'saving' | 'error' = 'saved';
  private saveSubject = new Subject<void>();
  private saveSub!: Subscription;

  selectedImg: HTMLImageElement | null = null;

  // Glowing Drag-to-Resize Guide properties
  currentImgWidth = 0;
  currentWrapping: 'inline' | 'left' | 'right' | 'absolute' = 'inline';
  guideStyle = {
    top: '0px',
    left: '0px',
    width: '0px',
    height: '0px'
  };
  private isResizing = false;
  isDraggingImage = false;
  private startMouseX = 0;
  private startWidth = 0;

  constructor(
    private labService: LabNotebookService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.loadNotes();

    // Set up debounced auto-save
    this.saveSub = this.saveSubject.pipe(
      debounceTime(500)
    ).subscribe(() => {
      this.triggerAutoSave();
    });
  }

  ngOnDestroy() {
    if (this.saveSub) {
      this.saveSub.unsubscribe();
    }
  }

  async loadNotes() {
    try {
      this.notes = await this.labService.getNotes();
      // If we don't have any notes, create a default one
      if (this.notes.length === 0) {
        await this.createNewNote();
      } else if (!this.selectedNote) {
        await this.selectNote(this.notes[0].id);
      }
      this.cdr.detectChanges();
    } catch (e) {
      console.error(e);
    }
  }

  async createNewNote() {
    this.syncState = 'saving';
    const defaultData = {
      title: 'New Note',
      body: '',
      tags: []
    };
    try {
      const newMeta = await this.labService.createNote(defaultData);
      await this.loadNotes();
      await this.selectNote(newMeta.id);
      this.syncState = 'saved';
    } catch (e) {
      this.syncState = 'error';
    }
  }

  async selectNote(id: string | null) {
    try {
      this.selectedImg = null;

      if (id === null) {
        this.selectedNote = null;
        this.noteForm.title = '';
        this.noteForm.bodyHtml = '';
        if (this.richEditor) {
          this.richEditor.nativeElement.innerHTML = '';
        }
        this.cdr.detectChanges();
        return;
      }

      const res = await this.labService.getNote(id);
      this.selectedNote = res.meta;
      this.noteForm.title = res.meta.title || 'Untitled Note';
      this.noteForm.bodyHtml = res.body || '';
      
      // Update contenteditable div
      if (this.richEditor) {
        this.richEditor.nativeElement.innerHTML = this.noteForm.bodyHtml;
      }
      this.syncState = 'saved';
      this.cdr.detectChanges();
    } catch (e) {
      console.error(e);
    }
  }

  // Triggered when typing title or content
  onContentChange() {
    this.syncState = 'saving';
    this.saveSubject.next();
  }

  onEditorInput() {
    if (this.richEditor) {
      this.noteForm.bodyHtml = this.richEditor.nativeElement.innerHTML;
    }
    this.onContentChange();
  }

  async triggerAutoSave() {
    if (!this.selectedNote) return;
    
    const bodyText = this.richEditor ? this.richEditor.nativeElement.innerHTML : this.noteForm.bodyHtml;
    const data = {
      title: this.noteForm.title || 'Untitled Note',
      body: bodyText,
      tags: []
    };

    try {
      const updatedMeta = await this.labService.updateNote(this.selectedNote.id, data);
      // Update local sidebar meta
      const idx = this.notes.findIndex(n => n.id === this.selectedNote.id);
      if (idx !== -1) {
        this.notes[idx].title = data.title;
        this.notes[idx].tags = [];
        this.notes[idx].updated_at = new Date().toISOString();
      }
      this.syncState = 'saved';
      this.cdr.detectChanges();
    } catch (e) {
      this.syncState = 'error';
      this.cdr.detectChanges();
    }
  }

  async deleteNote(id: string) {
    if (!confirm('Delete this note permanently?')) return;
    try {
      await this.labService.deleteNote(id);
      this.selectedNote = null;
      await this.loadNotes();
    } catch (e) {
      console.error(e);
    }
  }

  // --- Pasting and Dropping Inline Images (Word-style) ---
  async onPaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        // Prevent default text pasting of image metadata
        event.preventDefault();
        
        const file = items[i].getAsFile();
        if (file) {
          await this.uploadAndInsertImage(file);
        }
      }
    }
  }

  onDragOver(event: DragEvent) {
    const isFile = event.dataTransfer?.types.includes('Files');
    if (isFile) {
      event.preventDefault();
    }
  }

  async onDrop(event: DragEvent) {
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      event.preventDefault();
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.indexOf('image') !== -1) {
          await this.uploadAndInsertImage(files[i]);
        }
      }
    }
  }

  async uploadAndInsertImage(file: File) {
    // 1. Create a beautiful loading placeholder element in editor
    const placeholderId = 'img-upload-' + Math.random().toString(36).substring(2, 9);
    const placeholderHtml = `
      <div id="${placeholderId}" class="editor-image-placeholder" style="
        display: inline-flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        border: 2px dashed #db2777;
        border-radius: 8px;
        background: #fdf2f8;
        color: #db2777;
        font-family: inherit;
        font-weight: 700;
        margin: 12px 0;
        user-select: none;
      ">
        <span class="spinner" style="
          width: 18px;
          height: 18px;
          border: 2px solid #fbcfe8;
          border-top: 2px solid #db2777;
          border-radius: 50%;
          display: inline-block;
          animation: spin 1s linear infinite;
        "></span>
        <span>Uploading inline image...</span>
      </div>
    `;

    // Insert loading placeholder at cursor position
    this.insertHtmlAtCursor(placeholderHtml);
    this.onEditorInput();

    try {
      // 2. Upload file to backend
      const res = await this.labService.uploadAsset(file);

      // 3. Replace placeholder with actual img tag
      const placeholderEl = document.getElementById(placeholderId);
      if (placeholderEl && this.richEditor) {
        const imgHtml = `
          <img src="${res.url}" alt="${res.filename}" draggable="true" style="
            display: block;
            margin: 16px auto;
            max-width: 100%;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            border: 1px solid #e2e8f0;
            cursor: pointer;
          " /><br>
        `;
        placeholderEl.outerHTML = imgHtml;
        this.onEditorInput();
      }
    } catch (e) {
      const placeholderEl = document.getElementById(placeholderId);
      if (placeholderEl) {
        placeholderEl.outerHTML = `<div style="color: #ef4444; font-weight: 700; margin: 12px 0;">❌ Failed to upload image.</div>`;
      }
    }
  }

  insertHtmlAtCursor(html: string) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      
      const el = document.createElement('div');
      el.innerHTML = html;
      const frag = document.createDocumentFragment();
      let node;
      let lastNode;
      while ((node = el.firstChild)) {
        lastNode = frag.appendChild(node);
      }
      range.insertNode(frag);
      
      // Move cursor after the inserted node
      if (lastNode) {
        const nextRange = range.cloneRange();
        nextRange.setStartAfter(lastNode);
        nextRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nextRange);
      }
    } else if (this.richEditor) {
      this.richEditor.nativeElement.innerHTML += html;
    }
  }

  formatDate(d: string): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // --- Image Resizing and Aligning Operations ---
  onEditorClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    
    // Do not dismiss if clicking inside the guide overlay itself
    if (target.closest('.image-resize-guide')) {
      return;
    }
    
    if (target && target.tagName === 'IMG') {
      this.selectedImg = target as HTMLImageElement;
      this.positionResizeGuide();
    } else {
      this.selectedImg = null;
    }
  }

  onEditorScroll() {
    if (this.selectedImg) {
      this.positionResizeGuide();
    }
  }

  getRelativeOffset(el: HTMLElement, container: HTMLElement) {
    let top = 0;
    let left = 0;
    let current: HTMLElement | null = el;
    
    while (current && current !== container) {
      top += current.offsetTop;
      left += current.offsetLeft;
      current = current.offsetParent as HTMLElement;
    }
    return { top, left };
  }

  positionResizeGuide() {
    if (!this.selectedImg || !this.richEditor) return;
    const wrapper = this.richEditor.nativeElement.closest('.editor-canvas-wrapper') as HTMLElement;
    if (!wrapper) return;
    
    const offset = this.getRelativeOffset(this.selectedImg, wrapper);
    
    this.guideStyle = {
      top: `${offset.top}px`,
      left: `${offset.left}px`,
      width: `${this.selectedImg.offsetWidth}px`,
      height: `${this.selectedImg.offsetHeight}px`
    };
    
    this.currentImgWidth = this.selectedImg.offsetWidth;
    
    // Detect current wrapping state
    const pos = this.selectedImg.style.position;
    const float = this.selectedImg.style.float;
    if (pos === 'absolute') {
      this.currentWrapping = 'absolute';
    } else if (float === 'left') {
      this.currentWrapping = 'left';
    } else if (float === 'right') {
      this.currentWrapping = 'right';
    } else {
      this.currentWrapping = 'inline';
    }
    
    this.cdr.detectChanges();
  }

  setImageWrapping(wrapping: 'inline' | 'left' | 'right' | 'absolute') {
    if (!this.selectedImg) return;
    this.currentWrapping = wrapping;
    
    if (wrapping === 'inline') {
      this.selectedImg.style.position = 'static';
      this.selectedImg.style.display = 'block';
      this.selectedImg.style.float = 'none';
      this.selectedImg.style.margin = '16px auto';
      this.selectedImg.style.clear = 'both';
      this.selectedImg.style.left = '';
      this.selectedImg.style.top = '';
    } else if (wrapping === 'left') {
      this.selectedImg.style.position = 'static';
      this.selectedImg.style.display = 'inline';
      this.selectedImg.style.float = 'left';
      this.selectedImg.style.margin = '8px 16px 8px 0';
      this.selectedImg.style.clear = 'none';
      this.selectedImg.style.left = '';
      this.selectedImg.style.top = '';
    } else if (wrapping === 'right') {
      this.selectedImg.style.position = 'static';
      this.selectedImg.style.display = 'inline';
      this.selectedImg.style.float = 'right';
      this.selectedImg.style.margin = '8px 0 8px 16px';
      this.selectedImg.style.clear = 'none';
      this.selectedImg.style.left = '';
      this.selectedImg.style.top = '';
    } else if (wrapping === 'absolute') {
      this.selectedImg.style.position = 'absolute';
      this.selectedImg.style.zIndex = '100';
      this.selectedImg.style.margin = '0';
      this.selectedImg.style.float = 'none';
      this.selectedImg.style.clear = 'both';
      
      // Compute default offset relative to container if not present
      if (!this.selectedImg.style.left || this.selectedImg.style.left === 'auto') {
        const wrapper = this.richEditor.nativeElement.closest('.editor-canvas-wrapper') as HTMLElement;
        if (wrapper) {
          const offset = this.getRelativeOffset(this.selectedImg, wrapper);
          this.selectedImg.style.left = `${offset.left}px`;
          this.selectedImg.style.top = `${offset.top}px`;
        }
      }
    }
    
    this.onEditorInput();
    
    setTimeout(() => {
      this.positionResizeGuide();
    }, 50);
  }

  onGuideMouseDown(event: MouseEvent) {
    const target = event.target as HTMLElement;
    
    // Ignore guide movement drag if user clicked handles or format menu buttons!
    if (target.closest('.resize-handle') || target.closest('.image-format-menu')) {
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    if (!this.selectedImg || !this.richEditor) return;
    
    const wrapper = this.richEditor.nativeElement.closest('.editor-canvas-wrapper') as HTMLElement;
    if (!wrapper) return;
    
    this.isDraggingImage = true;
    const startMouseX = event.clientX;
    const startMouseY = event.clientY;
    
    const offset = this.getRelativeOffset(this.selectedImg, wrapper);
    const startLeft = offset.left;
    const startTop = offset.top;
    
    // Unlock to absolute floating layout automatically upon movement dragging
    this.selectedImg.style.position = 'absolute';
    this.selectedImg.style.zIndex = '100';
    this.selectedImg.style.margin = '0';
    this.selectedImg.style.float = 'none';
    this.selectedImg.style.clear = 'both';
    this.currentWrapping = 'absolute';
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!this.isDraggingImage || !this.selectedImg) return;
      const deltaX = moveEvent.clientX - startMouseX;
      const deltaY = moveEvent.clientY - startMouseY;
      
      const newLeft = startLeft + deltaX;
      const newTop = startTop + deltaY;
      
      this.selectedImg.style.left = `${newLeft}px`;
      this.selectedImg.style.top = `${newTop}px`;
      
      this.positionResizeGuide();
    };
    
    const onMouseUp = () => {
      this.isDraggingImage = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      this.onEditorInput();
    };
    
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  onResizeStart(event: MouseEvent, handle: string) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.selectedImg || !this.richEditor) return;
    
    const wrapper = this.richEditor.nativeElement.closest('.editor-canvas-wrapper') as HTMLElement;
    if (!wrapper) return;
    
    this.isResizing = true;
    const startMouseX = event.clientX;
    const startWidth = this.selectedImg.offsetWidth;
    
    const offset = this.getRelativeOffset(this.selectedImg, wrapper);
    const startLeft = offset.left;
    const isAbsolute = this.selectedImg.style.position === 'absolute';
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!this.isResizing || !this.selectedImg) return;
      const deltaX = moveEvent.clientX - startMouseX;
      
      let newWidth = startWidth;
      let newLeft = startLeft;
      
      if (handle === 'br' || handle === 'tr') {
        newWidth = startWidth + deltaX;
      } else if (handle === 'bl' || handle === 'tl') {
        newWidth = startWidth - deltaX;
        if (isAbsolute) {
          newLeft = startLeft + deltaX;
        }
      }
      
      const containerWidth = wrapper.getBoundingClientRect().width - 40;
      if (newWidth < 50) {
        const diff = 50 - newWidth;
        newWidth = 50;
        if (isAbsolute && (handle === 'bl' || handle === 'tl')) {
          newLeft = newLeft - diff;
        }
      }
      if (newWidth > containerWidth) {
        newWidth = containerWidth;
      }
      
      this.selectedImg.style.width = `${newWidth}px`;
      this.selectedImg.style.height = 'auto'; // Keep aspect ratio
      
      if (isAbsolute && (handle === 'bl' || handle === 'tl')) {
        this.selectedImg.style.left = `${newLeft}px`;
      }
      
      this.positionResizeGuide();
    };
    
    const onMouseUp = () => {
      this.isResizing = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      
      // Auto-save changes immediately!
      this.onEditorInput();
    };
    
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
}
