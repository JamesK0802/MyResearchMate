import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabNotebookService } from '../../services/lab-notebook.service';
import { LabService } from '../../services/lab.service';
import { AuthService } from '../../services/auth.service';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

@Component({
  selector: 'app-lab-experiments-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lab-experiments-page.component.html',
  styleUrl: './lab-experiments-page.component.css'
})
export class LabExperimentsPageComponent implements OnInit, OnDestroy {
  activeExperiments: any[] = [];
  presets: any[] = [];
  
  // Multi-user & Lab context
  allUsers: any[] = [];
  myLabs: any[] = [];
  
  // Individual preset sharing
  showSharePresetModal = false;
  sharingPreset: any = null;
  presetSearchQuery = '';
  filteredUsers: any[] = [];
  incomingTransfers: any[] = [];

  // Active workflow lab sharing
  showShareModal = false;
  sharingExp: any = null;
  sharedLabIds: string[] = [];
  sharedUserIds: string[] = [];
  researcherSearchQuery = '';
  filteredResearchers: any[] = [];
  savingShares = false;

  // View mode & Shared active workflows
  viewMode: 'my' | 'shared' = 'my';
  sharedExperiments: any[] = [];

  // Forms state
  showCreateExpForm = false;
  showCreatePresetForm = false;

  expForm = {
    title: '',
    description: '',
    samples: '',
    work_type: ''
  };

  presetForm = {
    title: '',
    description: '',
    steps: [] as any[]
  };

  selectedExperiment: any = null;

  uploadingImageForStep: string | null = null;

  // Custom Archive Success Rate picker state
  archivingExp: any = null;
  showRatingSelector = false;
  selectedRatingScore = 0;
  hoverRatingScore = 0;

  // Lightbox preview url
  previewImageUrl: string | null = null;

  // Sync state
  syncStates: { [expId: string]: 'saved' | 'saving' | 'error' } = {};
  private saveSubject = new Subject<any>();
  private saveSub!: Subscription;

  // Drag & Drop tracking
  draggedIndex: number | null = null;
  draggedExpId: string | null = null;
  
  editingPresetId: string | null = null;
  workflowScrollPositions: Record<string, number> = {};
  workflowScrollMaxes: Record<string, number> = {};

  constructor(
    private labService: LabNotebookService,
    private coreLabService: LabService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.loadData();

    // Debounced background saving
    this.saveSub = this.saveSubject.pipe(
      debounceTime(500)
    ).subscribe((exp) => {
      this.autoSaveExperiment(exp);
    });
  }

  ngOnDestroy() {
    if (this.saveSub) {
      this.saveSub.unsubscribe();
    }
  }

  async loadData() {
    if (this.auth.isDemo) {
      this.activeExperiments = await this.labService.getActiveExperiments();
      this.presets = [];
      this.myLabs = await this.coreLabService.getMyLabs();
      for (const exp of this.activeExperiments) {
        this.syncStates[exp.id] = 'saved';
        exp.samples_raw = (exp.samples || []).join(', ');
      }
      this.cdr.detectChanges();
      this.refreshWorkflowScrollbars();
      return;
    }
    try {
      this.activeExperiments = await this.labService.getActiveExperiments().catch(e => {
        console.error('Failed to load active experiments:', e);
        return [];
      });
    } catch (e) {
      this.activeExperiments = [];
    }

    try {
      this.presets = await this.labService.getPresets().catch(e => {
        console.error('Failed to load presets:', e);
        return [];
      });
    } catch (e) {
      this.presets = [];
    }

    try {
      this.myLabs = await this.coreLabService.getMyLabs().catch(e => {
        console.error('Failed to load my labs:', e);
        return [];
      });
    } catch (e) {
      this.myLabs = [];
    }

    try {
      this.allUsers = await this.coreLabService.getAllUsers().catch(e => {
        console.error('Failed to load all users:', e);
        return [];
      });
    } catch (e) {
      this.allUsers = [];
    }

    try {
      const allShared = await this.labService.getSharedWorkflows().catch(e => {
        console.error('Failed to load shared workflows:', e);
        return [];
      });
      this.sharedExperiments = allShared.filter(e => e.workflow_type === 'active');
    } catch (e) {
      this.sharedExperiments = [];
    }

    try {
      this.incomingTransfers = await this.labService.getIncomingPresetTransfers().catch(e => {
        console.error('Failed to load incoming transfers:', e);
        return [];
      });
    } catch (e) {
      this.incomingTransfers = [];
    }

    // Initialize sync states and samples_raw
    if (this.activeExperiments) {
      for (const exp of this.activeExperiments) {
        if (!this.syncStates[exp.id]) {
          this.syncStates[exp.id] = 'saved';
        }
        exp.samples_raw = (exp.samples || []).join(', ');
      }
    }

    if (this.sharedExperiments) {
      for (const exp of this.sharedExperiments) {
        if (!this.syncStates[exp.id]) {
          this.syncStates[exp.id] = 'saved';
        }
        exp.samples_raw = (exp.samples || []).join(', ');
      }
    }

    this.cdr.detectChanges();
    this.refreshWorkflowScrollbars();
  }

  private refreshWorkflowScrollbars() {
    setTimeout(() => {
      document.querySelectorAll<HTMLElement>('.workflow-scroll-area[data-experiment-id]').forEach(area => {
        const id = area.dataset['experimentId'];
        if (!id) return;
        this.workflowScrollMaxes[id] = Math.max(0, area.scrollWidth - area.clientWidth);
        this.workflowScrollPositions[id] = area.scrollLeft;
      });
      this.cdr.detectChanges();
    });
  }

  syncWorkflowScrollbar(experimentId: string, area: HTMLElement) {
    this.workflowScrollMaxes[experimentId] = Math.max(0, area.scrollWidth - area.clientWidth);
    this.workflowScrollPositions[experimentId] = area.scrollLeft;
  }

  scrollWorkflow(experimentId: string, area: HTMLElement, event: Event) {
    const position = Number((event.target as HTMLInputElement).value);
    area.scrollLeft = position;
    this.workflowScrollPositions[experimentId] = position;
  }

  getSharedNames(exp: any): string[] {
    if (!exp) return [];
    const labs = (exp.shared_labs && exp.shared_labs.length) ? exp.shared_labs : (exp.shared_with_labs || []);
    const users = (exp.shared_users && exp.shared_users.length) ? exp.shared_users : (exp.shared_with_users || []);
    return [...labs, ...users];
  }

  toggleCreateExp() {
    this.showCreateExpForm = !this.showCreateExpForm;
    this.showCreatePresetForm = false;
  }

  toggleCreatePreset() {
    this.showCreatePresetForm = !this.showCreatePresetForm;
    this.showCreateExpForm = false;
    this.editingPresetId = null;
    this.presetForm = {
      title: '',
      description: '',
      steps: [{ title: '', description: '' }]
    };
  }

  editPreset(preset: any) {
    this.editingPresetId = preset.id;
    this.showCreatePresetForm = true;
    this.showCreateExpForm = false;
    this.presetForm = {
      title: preset.title,
      description: preset.description || '',
      steps: preset.steps ? JSON.parse(JSON.stringify(preset.steps)) : []
    };
    this.cdr.detectChanges();
  }

  addPresetStep() {
    this.presetForm.steps.push({ title: '', description: '' });
  }

  removePresetStep(index: number) {
    this.presetForm.steps.splice(index, 1);
  }

  async savePreset() {
    if (!this.presetForm.title) return alert('Title required');
    try {
      if (this.editingPresetId) {
        await this.labService.updatePreset(this.editingPresetId, this.presetForm);
      } else {
        await this.labService.createPreset(this.presetForm);
      }
      this.editingPresetId = null;
      this.showCreatePresetForm = false;
      await this.loadData();
    } catch (e) {
      console.error(e);
    }
  }

  async deletePreset(id: string) {
    if (!confirm("Delete this preset template?")) return;
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
      tags: [],
      work_type: this.expForm.work_type
    };
    try {
      const newExp = await this.labService.createExperiment(data);
      this.syncStates[newExp.id] = 'saved';
      this.showCreateExpForm = false;
      this.expForm = { title: '', description: '', samples: '', work_type: '' };
      await this.loadData();
    } catch (e) {
      console.error(e);
    }
  }

  async deleteExperiment(id: string) {
    if (!confirm('Delete experiment?')) return;
    try {
      await this.labService.deleteExperiment(id);
      delete this.syncStates[id];
      await this.loadData();
    } catch (e) {
      console.error(e);
    }
  }

  // --- Step sequence interaction ---
  getPresetName(id: string) {
    const p = this.presets.find(x => x.id === id);
    return p ? p.title : id;
  }

  // Auto save trigger
  onExperimentChange(exp: any) {
    this.syncStates[exp.id] = 'saving';
    this.saveSubject.next(exp);
  }

  onSamplesChange(exp: any) {
    exp.samples = (exp.samples_raw || '').split(',').map((s: string) => s.trim()).filter((s: string) => s);
    this.onExperimentChange(exp);
  }

  removeSampleTag(exp: any, index: number) {
    if (exp.samples) {
      exp.samples.splice(index, 1);
      this.onExperimentChange(exp);
    }
  }

  addSampleTag(exp: any, inputEl: HTMLInputElement) {
    const val = inputEl.value.trim();
    if (val) {
      if (!exp.samples) {
        exp.samples = [];
      }
      if (!exp.samples.includes(val)) {
        exp.samples.push(val);
        this.onExperimentChange(exp);
      }
      inputEl.value = '';
    }
  }

  async autoSaveExperiment(exp: any) {
    const data = {
      title: exp.title,
      description: exp.description,
      samples: exp.samples,
      tags: [],
      steps: exp.steps
    };
    try {
      await this.labService.updateExperiment(exp.id, data);
      this.syncStates[exp.id] = 'saved';
      this.cdr.detectChanges();
    } catch (e) {
      this.syncStates[exp.id] = 'error';
      this.cdr.detectChanges();
    }
  }

  async insertStepAt(exp: any, index: number) {
    const newStep = {
      id: crypto.randomUUID(),
      title: 'New Step',
      description: '',
      status: 'pending',
      comments: [],
      images: [],
      started_at: null,
      completed_at: null,
      updated_at: new Date().toISOString()
    };
    exp.steps.splice(index, 0, newStep);
    this.onExperimentChange(exp);
    this.cdr.detectChanges();
  }

  async removeStep(exp: any, stepId: string) {
    if (!confirm('Remove this step?')) return;
    exp.steps = exp.steps.filter((s: any) => s.id !== stepId);
    this.onExperimentChange(exp);
    this.cdr.detectChanges();
  }

  // HTML5 Drag and drop reordering
  onDragStart(exp: any, index: number) {
    this.draggedIndex = index;
    this.draggedExpId = exp.id;
  }

  async onDrop(exp: any, index: number) {
    if (this.draggedExpId !== exp.id || this.draggedIndex === null) return;
    const draggedStep = exp.steps.splice(this.draggedIndex, 1)[0];
    exp.steps.splice(index, 0, draggedStep);
    this.draggedIndex = null;
    this.draggedExpId = null;
    this.onExperimentChange(exp);
    this.cdr.detectChanges();
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
    
    this.onExperimentChange(exp);
    
    if (!foundNext) {
      const uncompleted = exp.steps.some((s: any) => s.status !== 'completed');
      if (!uncompleted) {
        this.openArchiveDialog(exp);
      }
    }
  }

  async undoCompleteStep(exp: any, step: any) {
    step.status = 'active';
    step.completed_at = null;
    this.onExperimentChange(exp);
  }

  async completeAllSteps(exp: any) {
    if (!exp.steps || exp.steps.length === 0) return;
    for (const s of exp.steps) {
      s.status = 'completed';
      if (!s.completed_at) {
        s.completed_at = new Date().toISOString();
      }
    }
    this.onExperimentChange(exp);
    this.openArchiveDialog(exp);
  }

  // Custom Archiving Flow
  openArchiveDialog(exp: any) {
    this.archivingExp = exp;
    this.showRatingSelector = false;
    this.selectedRatingScore = 0;
    this.hoverRatingScore = 0;
    this.cdr.detectChanges();
  }

  cancelArchiving() {
    this.archivingExp = null;
    this.showRatingSelector = false;
    this.selectedRatingScore = 0;
    this.hoverRatingScore = 0;
    this.cdr.detectChanges();
  }

  proceedToRating() {
    this.showRatingSelector = true;
    this.cdr.detectChanges();
  }

  async deleteArchivingExp() {
    if (!confirm('Delete experiment permanently?')) return;
    const expId = this.archivingExp.id;
    this.cancelArchiving();
    await this.deleteExperiment(expId);
  }

  selectRatingScore(score: number) {
    this.selectedRatingScore = score;
    this.cdr.detectChanges();
  }

  async submitArchive() {
    if (this.selectedRatingScore === 0) return;
    const expId = this.archivingExp.id;
    const score = this.selectedRatingScore;
    this.cancelArchiving();
    try {
      await this.labService.archiveExperiment(expId, score);
      await this.loadData();
    } catch (e) {
      console.error(e);
      alert('Failed to archive');
    }
  }

  // Lightbox preview control
  openImagePreview(url: string) {
    this.previewImageUrl = url;
    this.cdr.detectChanges();
  }

  closeImagePreview() {
    this.previewImageUrl = null;
    this.cdr.detectChanges();
  }

  async addComment(exp: any, step: any, commentInput: any) {
    const text = commentInput.value.trim();
    if (!text) return;
    if (!step.comments) step.comments = [];
    step.comments.push(text);
    commentInput.value = '';
    this.onExperimentChange(exp);
  }

  async uploadStepImage(event: any, exp: any, step: any) {
    const file = event.target.files[0];
    if (!file) return;
    
    this.uploadingImageForStep = step.id;
    this.cdr.detectChanges();
    try {
      const res = await this.labService.uploadAsset(file);
      if (!step.images) step.images = [];
      step.images.push(res.url);
      this.onExperimentChange(exp);
    } catch (e) {
      console.error(e);
      alert('Upload failed');
    } finally {
      this.uploadingImageForStep = null;
      this.cdr.detectChanges();
    }
  }

  getCompletedStepsCount(exp: any): number {
    if (!exp.steps) return 0;
    return exp.steps.filter((s: any) => s.status === 'completed').length;
  }
  
  getProgressPercentage(exp: any): number {
    if (!exp.steps || exp.steps.length === 0) return 0;
    const completed = this.getCompletedStepsCount(exp);
    return Math.round((completed / exp.steps.length) * 100);
  }

  openExperimentDetails(exp: any) {
    this.selectedExperiment = exp;
  }

  closeExperimentDetails() {
    this.selectedExperiment = null;
  }

  isExperimentReadOnly(exp: any): boolean {
    return false; // Active experiments are always co-editable!
  }

  expandedComments: { [commentId: string]: boolean } = {};

  toggleCommentExpand(commentId: string, event: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.expandedComments[commentId] = !this.expandedComments[commentId];
  }

  getRecentComments(exp: any): { id: string, author?: string, text: string }[] {
    const comments: { id: string, author?: string, text: string }[] = [];
    if (exp && exp.comments && exp.comments.length) {
      for (const c of exp.comments) {
        comments.push({
          id: c.id,
          author: c.user_name || 'Discussion',
          text: c.comment || c.text || ''
        });
      }
    }
    return comments;
  }

  filterPresetUsers() {
    const q = this.presetSearchQuery.trim().toLowerCase();
    if (!q) {
      this.filteredUsers = this.allUsers;
    } else {
      this.filteredUsers = this.allUsers.filter(u => 
        u.name?.toLowerCase().includes(q) || 
        u.email?.toLowerCase().includes(q)
      );
    }
  }

  openSharePresetModal(preset: any) {
    this.sharingPreset = preset;
    this.showSharePresetModal = true;
    this.presetSearchQuery = '';
    this.filterPresetUsers();
    this.cdr.detectChanges();
  }

  closeSharePresetModal() {
    this.showSharePresetModal = false;
    this.sharingPreset = null;
  }

  async sendPresetTemplate(userId: number) {
    if (!this.sharingPreset) return;
    try {
      await this.labService.sendPreset(this.sharingPreset.id, userId);
      alert('Template preset sent successfully!');
      this.closeSharePresetModal();
    } catch (e) {
      console.error(e);
      alert('Failed to send template preset.');
    }
  }

  async acceptTransfer(transferId: string) {
    try {
      await this.labService.acceptPresetTransfer(transferId);
      alert('Template accepted and added to your collection!');
      await this.loadData();
    } catch (e) {
      console.error(e);
      alert('Failed to accept template.');
    }
  }

  async rejectTransfer(transferId: string) {
    if (!confirm('Reject this template transfer?')) return;
    try {
      await this.labService.rejectPresetTransfer(transferId);
      await this.loadData();
    } catch (e) {
      console.error(e);
      alert('Failed to reject template.');
    }
  }

  async openShareModal(exp: any, event: Event) {
    event.stopPropagation();
    this.sharingExp = exp;
    this.showShareModal = true;
    this.researcherSearchQuery = '';
    try {
      const res = await this.labService.getWorkflowShares(exp.id);
      this.sharedLabIds = res.lab_ids || [];
      this.sharedUserIds = res.user_ids || [];
    } catch (e) {
      console.error(e);
      this.sharedLabIds = [];
      this.sharedUserIds = [];
    }
    this.filterResearchers();
    this.cdr.detectChanges();
  }

  closeShareModal() {
    this.showShareModal = false;
    this.sharingExp = null;
  }

  toggleLabShare(labId: string) {
    const index = this.sharedLabIds.indexOf(labId);
    if (index > -1) {
      this.sharedLabIds.splice(index, 1);
    } else {
      this.sharedLabIds.push(labId);
    }
  }

  isLabShared(labId: string): boolean {
    return this.sharedLabIds.includes(labId);
  }

  filterResearchers() {
    const q = this.researcherSearchQuery.trim().toLowerCase();
    if (!q) {
      this.filteredResearchers = this.allUsers;
    } else {
      this.filteredResearchers = this.allUsers.filter(u =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      );
    }
  }

  toggleUserShare(userId: any) {
    const uIdStr = String(userId);
    const index = this.sharedUserIds.indexOf(uIdStr);
    if (index > -1) {
      this.sharedUserIds.splice(index, 1);
    } else {
      this.sharedUserIds.push(uIdStr);
    }
  }

  isUserShared(userId: any): boolean {
    return this.sharedUserIds.includes(String(userId));
  }

  async saveWorkflowShares() {
    if (!this.sharingExp) return;
    this.savingShares = true;
    try {
      await this.labService.updateWorkflowShares(this.sharingExp.id, 'active', this.sharedLabIds, this.sharedUserIds);
      this.closeShareModal();
      await this.loadData();
    } catch (e) {
      console.error('Failed to save sharing', e);
    } finally {
      this.savingShares = false;
    }
  }

  formatDate(d: string) {
    if (!d) return '';
    return new Date(d).toLocaleString();
  }

}
