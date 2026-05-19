import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabNotebookService } from '../../services/lab-notebook.service';

@Component({
  selector: 'app-lab-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lab-page.component.html',
  styleUrl: './lab-page.component.css'
})
export class LabPageComponent implements OnInit {
  activeTab: 'notes' | 'experiments' | 'archive' = 'experiments';
  
  // --- Notes Data ---
  notes: any[] = [];
  selectedNote: any = null;
  noteForm = { title: '', body: '', tags: '' };
  
  // --- Experiments Data ---
  activeExperiments: any[] = [];
  archivedExperiments: any[] = [];
  presets: any[] = [];
  
  // Create Experiment Form
  showCreateExpForm = false;
  expForm = {
    title: '',
    description: '',
    samples: '',
    tags: '',
    work_type: ''
  };

  // Create Preset Form
  showCreatePresetForm = false;
  presetForm = {
    title: '',
    description: '',
    steps: [] as any[]
  };

  // Step image upload
  uploadingImageForStep: string | null = null;
  
  constructor(private labService: LabNotebookService, private cdr: ChangeDetectorRef) {}

  async ngOnInit() {
    await this.loadData();
  }

  async setTab(tab: 'notes' | 'experiments' | 'archive') {
    this.activeTab = tab;
    await this.loadData();
  }

  async loadData() {
    try {
      if (this.activeTab === 'notes') {
        this.notes = await this.labService.getNotes();
      } else if (this.activeTab === 'experiments') {
        this.activeExperiments = await this.labService.getActiveExperiments();
        this.presets = await this.labService.getPresets();
      } else if (this.activeTab === 'archive') {
        this.archivedExperiments = await this.labService.getArchiveExperiments();
      }
      this.cdr.detectChanges();
    } catch (e) {
      console.error("Error loading data", e);
    }
  }

  // --- General Notes ---
  async createNewNote() {
    this.selectedNote = null;
    this.noteForm = { title: 'Untitled Note', body: '', tags: '' };
  }

  async selectNote(id: string) {
    try {
      const res = await this.labService.getNote(id);
      this.selectedNote = res.meta;
      this.noteForm = {
        title: res.meta.title || '',
        body: res.body || '',
        tags: (res.meta.tags || []).join(', ')
      };
      this.cdr.detectChanges();
    } catch (e) {
      console.error(e);
    }
  }

  async saveNote() {
    const data = {
      title: this.noteForm.title,
      body: this.noteForm.body,
      tags: this.noteForm.tags.split(',').map(t => t.trim()).filter(t => t)
    };
    try {
      if (this.selectedNote) {
        await this.labService.updateNote(this.selectedNote.id, data);
      } else {
        await this.labService.createNote(data);
      }
      this.selectedNote = null;
      await this.loadData();
    } catch (e) {
      console.error(e);
    }
  }

  async uploadNoteImage(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const res = await this.labService.uploadAsset(file);
      const markdownImage = `\n![Image](${res.url})\n`;
      this.noteForm.body += markdownImage;
    } catch (e) {
      console.error(e);
      alert('Upload failed');
    }
  }

  async deleteNote(id: string) {
    if (!confirm('Delete this note?')) return;
    try {
      await this.labService.deleteNote(id);
      if (this.selectedNote?.id === id) this.selectedNote = null;
      await this.loadData();
    } catch (e) {
      console.error(e);
    }
  }

  // --- Experiments ---
  toggleCreateExp() {
    this.showCreateExpForm = !this.showCreateExpForm;
    this.showCreatePresetForm = false;
  }

  toggleCreatePreset() {
    this.showCreatePresetForm = !this.showCreatePresetForm;
    this.showCreateExpForm = false;
    this.presetForm = { title: '', description: '', steps: [{title: '', description: ''}] };
  }

  addPresetStep() {
    this.presetForm.steps.push({title: '', description: ''});
  }

  removePresetStep(index: number) {
    this.presetForm.steps.splice(index, 1);
  }

  async savePreset() {
    if (!this.presetForm.title) return alert('Title required');
    try {
      await this.labService.createPreset(this.presetForm);
      this.showCreatePresetForm = false;
      await this.loadData();
    } catch (e) {
      console.error(e);
    }
  }

  async deletePreset(id: string) {
    if(!confirm("Delete this preset?")) return;
    try {
      await this.labService.deletePreset(id);
      await this.loadData();
    } catch (e) {
      console.error(e);
    }
  }

  async createExperiment() {
    if (!this.expForm.title) return alert('Title required');
    const data = {
      title: this.expForm.title,
      description: this.expForm.description,
      samples: this.expForm.samples.split(',').map(s => s.trim()).filter(s => s),
      tags: this.expForm.tags.split(',').map(t => t.trim()).filter(t => t),
      work_type: this.expForm.work_type
    };
    try {
      await this.labService.createExperiment(data);
      this.showCreateExpForm = false;
      this.expForm = { title: '', description: '', samples: '', tags: '', work_type: '' };
      await this.loadData();
    } catch (e) {
      console.error(e);
    }
  }

  async deleteExperiment(id: string) {
    if (!confirm('Delete experiment?')) return;
    try {
      await this.labService.deleteExperiment(id);
      await this.loadData();
    } catch (e) {
      console.error(e);
    }
  }

  // --- Workflow Steps ---
  getPresetName(id: string) {
    const p = this.presets.find(x => x.id === id);
    return p ? p.title : id;
  }

  async addStep(exp: any) {
    const newStep = {
      id: crypto.randomUUID(),
      title: 'New Step',
      description: '',
      status: 'pending',
      comments: [],
      images: []
    };
    exp.steps.push(newStep);
    await this.labService.updateExperiment(exp.id, { steps: exp.steps });
    this.cdr.detectChanges();
  }

  async removeStep(exp: any, stepId: string) {
    if (!confirm('Remove this step?')) return;
    exp.steps = exp.steps.filter((s: any) => s.id !== stepId);
    await this.labService.updateExperiment(exp.id, { steps: exp.steps });
    this.cdr.detectChanges();
  }

  async moveStepLeft(exp: any, index: number) {
    if (index === 0) return;
    const temp = exp.steps[index - 1];
    exp.steps[index - 1] = exp.steps[index];
    exp.steps[index] = temp;
    await this.labService.updateExperiment(exp.id, { steps: exp.steps });
    this.cdr.detectChanges();
  }

  async moveStepRight(exp: any, index: number) {
    if (index === exp.steps.length - 1) return;
    const temp = exp.steps[index + 1];
    exp.steps[index + 1] = exp.steps[index];
    exp.steps[index] = temp;
    await this.labService.updateExperiment(exp.id, { steps: exp.steps });
    this.cdr.detectChanges();
  }

  async saveStepChanges(exp: any) {
    await this.labService.updateExperiment(exp.id, { steps: exp.steps });
    alert('Changes saved');
  }

  async completeStep(exp: any, step: any) {
    step.status = 'completed';
    step.completed_at = new Date().toISOString();
    
    // Auto-set next pending to active
    let foundNext = false;
    for (const s of exp.steps) {
      if (s.id !== step.id && s.status === 'pending') {
        s.status = 'active';
        s.started_at = new Date().toISOString();
        foundNext = true;
        break;
      }
    }
    
    await this.labService.updateExperiment(exp.id, { steps: exp.steps });
    
    if (!foundNext) {
      const uncompleted = exp.steps.some((s:any) => s.status !== 'completed');
      if (!uncompleted) {
        this.promptExperimentCompletion(exp);
      }
    }
  }

  async undoCompleteStep(exp: any, step: any) {
    step.status = 'active';
    step.completed_at = null;
    await this.labService.updateExperiment(exp.id, { steps: exp.steps });
  }

  promptExperimentCompletion(exp: any) {
    setTimeout(async () => {
      const action = prompt(`All steps in "${exp.title}" are completed.\n\nType 'ARCHIVE' to archive it.\nType 'DELETE' to delete it.\nOr cancel to leave it active.`);
      if (action === 'ARCHIVE') {
        const scoreStr = prompt(`Enter a success score (1 to 5):\n1=Red, 5=Green`);
        const score = parseInt(scoreStr || '3', 10);
        await this.labService.archiveExperiment(exp.id, score);
        await this.loadData();
      } else if (action === 'DELETE') {
        await this.deleteExperiment(exp.id);
      }
    }, 100);
  }

  async addComment(exp: any, step: any, commentInput: any) {
    const text = commentInput.value.trim();
    if (!text) return;
    if (!step.comments) step.comments = [];
    step.comments.push(text);
    commentInput.value = '';
    await this.labService.updateExperiment(exp.id, { steps: exp.steps });
  }

  async uploadStepImage(event: any, exp: any, step: any) {
    const file = event.target.files[0];
    if (!file) return;
    
    this.uploadingImageForStep = step.id;
    this.cdr.detectChanges();
    try {
      const res = await this.labService.uploadAsset(file);
      if (!step.images) step.images = [];
      step.images.push(res.url); // Could store objects, but strings for simplicity
      await this.labService.updateExperiment(exp.id, { steps: exp.steps });
    } catch (e) {
      console.error(e);
      alert('Upload failed');
    } finally {
      this.uploadingImageForStep = null;
      this.cdr.detectChanges();
    }
  }

  // --- UI Helpers ---
  getScoreColor(score: number) {
    if (score === 1) return '#ef4444'; // red
    if (score === 2) return '#f97316'; // orange
    if (score === 3) return '#eab308'; // yellow
    if (score === 4) return '#84cc16'; // light green
    if (score === 5) return '#22c55e'; // green
    return '#94a3b8';
  }

  formatDate(d: string) {
    if (!d) return '';
    return new Date(d).toLocaleString();
  }
}
