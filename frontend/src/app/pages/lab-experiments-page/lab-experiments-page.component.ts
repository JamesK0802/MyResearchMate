import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { LabNotebookService } from '../../services/lab-notebook.service';
import { ProtocolTreeRecord, ProtocolTreeService } from '../../services/protocol-tree.service';
import { NamuNode, NamuTree } from '../../models/namu.model';
import { MyDataHeaderComponent } from '../../components/my-data-header.component';
import { MyDataCardBadge, MyDataCardComponent } from '../../components/my-data-card.component';
import { AuthService } from '../../services/auth.service';

type ExperimentTab = 'current' | 'completed';
type StepStatus = 'pending' | 'active' | 'completed' | 'skipped';

interface ExperimentStep {
  id: string;
  protocol_node_id?: string;
  protocol_next_node_ids?: string[];
  protocol_parent_node_ids?: string[];
  branch_selected_node_ids?: string[];
  title: string;
  description?: string;
  status: StepStatus;
  comments?: string[];
  logs?: Array<{ id: string; text: string; created_at: string; kind?: string }>;
  images?: string[];
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
}

@Component({
  selector: 'app-lab-experiments-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MyDataHeaderComponent, MyDataCardComponent],
  templateUrl: './lab-experiments-page.component.html',
  styleUrl: './lab-experiments-page.component.css'
})
export class LabExperimentsPageComponent implements OnInit, OnDestroy {
  activeTab: ExperimentTab = 'current';
  currentExperiments: any[] = [];
  completedExperiments: any[] = [];
  protocols: ProtocolTreeRecord[] = [];
  loading = true;
  loadingProtocols = false;
  creating = false;
  saving = false;
  searchQuery = '';
  sortMode: 'updated-desc' | 'updated-asc' | 'name-asc' = 'updated-desc';
  showCreatePanel = false;
  selectedExperiment: any = null;
  completionExperiment: any = null;
  completionScore = 4;
  branchDecision: { experiment: any; step: ExperimentStep } | null = null;
  branchSelections: string[] = [];
  previewImageUrl: string | null = null;
  uploadingStepId: string | null = null;
  syncStates: Record<string, 'saved' | 'saving' | 'error'> = {};
  noteDrafts: Record<string, string> = {};
  createForm = this.emptyCreateForm();
  createError = '';
  private saveSubject = new Subject<any>();
  private saveSubscription?: Subscription;
  private completingExperimentIds = new Set<string>();

  constructor(
    private notebook: LabNotebookService,
    private protocolService: ProtocolTreeService,
    public auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.saveSubscription = this.saveSubject.pipe(debounceTime(550)).subscribe(exp => void this.saveExperiment(exp));
    await Promise.all([this.loadExperiments(), this.loadProtocols()]);
  }

  ngOnDestroy() { this.saveSubscription?.unsubscribe(); }

  private emptyCreateForm() {
    return { title: '', description: '', samples: '', protocolId: '', rootId: '' };
  }

  async loadExperiments() {
    this.loading = true;
    try {
      const [current, completed, shared] = await Promise.all([
        this.notebook.getActiveExperiments(), this.notebook.getArchiveExperiments(),
        this.auth.isDemo ? Promise.resolve([]) : this.notebook.getSharedWorkflows().catch(() => [])
      ]);
      const ownIds = new Set([...current, ...completed].map((item: any) => item.id));
      const sharedCurrent = shared.filter((item: any) => item.workflow_type === 'active' && !ownIds.has(item.id)).map((item: any) => ({ ...item, _shared: true }));
      const sharedCompleted = shared.filter((item: any) => item.workflow_type === 'archive' && !ownIds.has(item.id)).map((item: any) => ({ ...item, _shared: true }));
      this.currentExperiments = [...current, ...sharedCurrent].map(item => this.normalizeExperiment(item));
      this.completedExperiments = [...completed, ...sharedCompleted].map(item => this.normalizeExperiment(item));
      for (const item of [...this.currentExperiments, ...this.completedExperiments]) this.syncStates[item.id] = 'saved';
    } catch (error) {
      console.error('Could not load experiment logs', error);
      this.currentExperiments = [];
      this.completedExperiments = [];
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async loadProtocols() {
    this.loadingProtocols = true;
    try {
      this.protocols = this.auth.isDemo ? [this.demoProtocol()] : await this.protocolService.getTrees('all');
    } catch (error) {
      console.error('Could not load Tree Protocol records', error);
      this.protocols = [];
    } finally {
      this.loadingProtocols = false;
      this.cdr.detectChanges();
    }
  }

  private demoProtocol(): ProtocolTreeRecord {
    const now = new Date().toISOString();
    return {
      id: 'demo-protocol', owner_user_id: 'demo', title: 'Demo transformation protocol', created_at: now, updated_at: now,
      document_json: {
        version: '1.0', title: 'Demo transformation protocol', activeTreeId: 'demo-root',
        trees: [{ id: 'demo-root', name: 'Transformation workflow', description: 'A short example protocol run.', rootNodeId: 'demo-1', createdAt: Date.now(), updatedAt: Date.now(), nodes: [
          { id: 'demo-1', title: 'Prepare samples', description: 'Label and prepare samples.', steps: ['Confirm sample IDs', 'Prepare reagents'], nextNodes: ['demo-2'], status: 'planned', leaves: [] },
          { id: 'demo-2', title: 'Assess sample quality', description: 'Choose the appropriate path from the observed sample state.', steps: ['Record the branch decision'], nextNodes: ['demo-3', 'demo-4'], status: 'planned', leaves: [] },
          { id: 'demo-3', title: 'Standard treatment', description: 'Continue with the standard treatment path.', steps: ['Apply the standard conditions'], nextNodes: ['demo-5'], status: 'planned', leaves: [] },
          { id: 'demo-4', title: 'Recovery treatment', description: 'Use this path when samples require recovery.', steps: ['Apply recovery conditions'], nextNodes: ['demo-5'], status: 'planned', leaves: [] },
          { id: 'demo-5', title: 'Review outcome', description: 'Capture results and observations.', steps: ['Attach evidence', 'Write a conclusion'], nextNodes: [], status: 'planned', leaves: [] }
        ] }]
      }
    };
  }

  private normalizeExperiment(exp: any) {
    const sourceSteps = exp.steps || [];
    exp.steps = sourceSteps.map((step: any, index: number) => ({
      id: step.id || crypto.randomUUID(), title: step.title || `Step ${index + 1}`,
      description: step.description || '', status: step.status || (index === 0 ? 'active' : 'pending'),
      comments: step.comments || [], logs: step.logs || [], images: step.images || [],
      started_at: step.started_at || null, completed_at: step.completed_at || null,
      protocol_node_id: step.protocol_node_id || step.id,
      protocol_next_node_ids: step.protocol_next_node_ids || (sourceSteps[index + 1] ? [sourceSteps[index + 1].protocol_node_id || sourceSteps[index + 1].id] : []),
      protocol_parent_node_ids: step.protocol_parent_node_ids || (index > 0 ? [sourceSteps[index - 1].protocol_node_id || sourceSteps[index - 1].id] : []),
      branch_selected_node_ids: step.branch_selected_node_ids || []
    }));
    exp.run_notes = exp.run_notes || '';
    exp.samples = exp.samples || [];
    return exp;
  }

  get selectedProtocol(): ProtocolTreeRecord | undefined {
    return this.protocols.find(protocol => protocol.id === this.createForm.protocolId);
  }

  get availableRoots(): NamuTree[] { return this.selectedProtocol?.document_json?.trees || []; }

  onProtocolSelected() {
    const roots = this.availableRoots;
    const preferredId = this.selectedProtocol?.document_json?.activeTreeId;
    this.createForm.rootId = roots.find(root => root.id === preferredId)?.id || roots[0]?.id || '';
    if (!this.createForm.title && this.selectedProtocol) this.createForm.title = `${this.selectedProtocol.title} run`;
  }

  openCreatePanel() { this.createForm = this.emptyCreateForm(); this.createError = ''; this.showCreatePanel = true; }
  closeCreatePanel() { if (!this.creating) this.showCreatePanel = false; }

  async createExperiment() {
    const protocol = this.selectedProtocol;
    const root = this.availableRoots.find(tree => tree.id === this.createForm.rootId);
    if (!this.createForm.title.trim()) return alert('Add an experiment title.');
    if (!protocol || !root) { this.createError = 'Choose a saved Tree Protocol.'; return; }
    const steps = this.buildProtocolSteps(root);
    if (!steps.length) return alert('The selected protocol root has no usable steps.');
    this.creating = true;
    this.createError = '';
    try {
      await this.notebook.createExperiment({
        title: this.createForm.title.trim(), description: this.createForm.description.trim(),
        samples: this.createForm.samples.split(',').map(value => value.trim()).filter(Boolean), tags: [], work_type: '',
        protocol_tree_id: protocol.id, protocol_title: protocol.title, protocol_root_id: root.id,
        protocol_root_name: root.name, protocol_snapshot_updated_at: protocol.updated_at, run_notes: '', steps
      });
      this.showCreatePanel = false;
      this.activeTab = 'current';
      await this.loadExperiments();
    } catch (error: any) {
      console.error(error);
      this.createError = error?.error?.detail || error?.message || 'Could not create the experiment log.';
    } finally { this.creating = false; }
  }

  private buildProtocolSteps(tree: NamuTree): ExperimentStep[] {
    const nodes = new Map(tree.nodes.map(node => [node.id, node]));
    const visited = new Set<string>();
    const ordered: NamuNode[] = [];
    const queue = [tree.rootNodeId];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      const node = nodes.get(id);
      if (!node) continue;
      visited.add(id);
      ordered.push(node);
      queue.push(...(node.nextNodes || []));
    }
    const parentIds = new Map<string, string[]>();
    for (const node of ordered) for (const nextId of node.nextNodes || []) parentIds.set(nextId, [...(parentIds.get(nextId) || []), node.id]);
    return ordered.map((node, index) => ({
      id: crypto.randomUUID(), protocol_node_id: node.id, title: node.title || `Step ${index + 1}`,
      protocol_next_node_ids: [...(node.nextNodes || [])], protocol_parent_node_ids: parentIds.get(node.id) || [], branch_selected_node_ids: [],
      description: [node.description, ...(node.steps || []).map(step => `• ${step}`)].filter(Boolean).join('\n'),
      status: index === 0 ? 'active' : 'pending', comments: [], logs: [], images: [],
      started_at: index === 0 ? new Date().toISOString() : null, completed_at: null, updated_at: new Date().toISOString()
    }));
  }

  get displayExperiments(): any[] {
    const source = this.activeTab === 'current' ? this.currentExperiments : this.completedExperiments;
    const query = this.searchQuery.trim().toLowerCase();
    const filtered = !query ? [...source] : source.filter(exp => [exp.title, exp.description, exp.protocol_title, exp.protocol_root_name, ...(exp.samples || [])].join(' ').toLowerCase().includes(query));
    return filtered.sort((a, b) => {
      if (this.sortMode === 'name-asc') return (a.title || '').localeCompare(b.title || '');
      const left = new Date(a.updated_at || a.archived_at || a.created_at || 0).getTime();
      const right = new Date(b.updated_at || b.archived_at || b.created_at || 0).getTime();
      return this.sortMode === 'updated-asc' ? left - right : right - left;
    });
  }

  setTab(tab: ExperimentTab) { this.activeTab = tab; this.selectedExperiment = null; }
  openExperiment(exp: any) { this.selectedExperiment = exp; this.noteDrafts = {}; }
  closeExperiment() { this.selectedExperiment = null; }

  onExperimentChange(exp: any) {
    if (this.activeTab === 'completed') return;
    this.syncStates[exp.id] = 'saving';
    this.saveSubject.next(exp);
  }

  private async saveExperiment(exp: any, force = false): Promise<boolean> {
    if (!force && this.completingExperimentIds.has(exp.id)) return true;
    try {
      await this.notebook.updateExperiment(exp.id, {
        title: exp.title, description: exp.description || '', samples: exp.samples || [], tags: exp.tags || [],
        protocol_tree_id: exp.protocol_tree_id, protocol_title: exp.protocol_title || '', protocol_root_id: exp.protocol_root_id,
        protocol_root_name: exp.protocol_root_name || '', protocol_snapshot_updated_at: exp.protocol_snapshot_updated_at,
        run_notes: exp.run_notes || '', steps: exp.steps || []
      });
      exp.updated_at = new Date().toISOString();
      this.syncStates[exp.id] = 'saved';
      this.cdr.detectChanges();
      return true;
    } catch (error) {
      console.error(error);
      this.syncStates[exp.id] = 'error';
      this.cdr.detectChanges();
      return false;
    }
  }

  setStepStatus(exp: any, step: ExperimentStep, status: StepStatus) {
    if (status === 'completed' && (step.protocol_next_node_ids?.length || 0) > 1) {
      this.branchDecision = { experiment: exp, step };
      this.branchSelections = [...(step.branch_selected_node_ids || [])];
      return;
    }
    this.applyStepStatus(exp, step, status, step.protocol_next_node_ids || []);
  }

  private applyStepStatus(exp: any, step: ExperimentStep, status: StepStatus, chosenNextIds: string[]) {
    const now = new Date().toISOString();
    step.status = status; step.updated_at = now;
    if (status === 'active' && !step.started_at) step.started_at = now;
    step.completed_at = status === 'completed' ? now : null;
    step.logs = step.logs || [];
    step.logs.push({ id: crypto.randomUUID(), text: status === 'completed' ? 'Step completed' : status === 'active' ? 'Step started' : 'Step reopened', created_at: now, kind: 'status' });
    if (status === 'completed') {
      step.branch_selected_node_ids = chosenNextIds;
      this.applyBranchSelection(exp, step, chosenNextIds);
      this.activateReadySteps(exp, now);
    }
    this.onExperimentChange(exp);
  }

  branchOptions(step: ExperimentStep): ExperimentStep[] {
    const ids = new Set(step.protocol_next_node_ids || []);
    return (this.branchDecision?.experiment?.steps || []).filter((candidate: ExperimentStep) => ids.has(candidate.protocol_node_id || ''));
  }

  toggleBranch(nodeId: string) {
    this.branchSelections = this.branchSelections.includes(nodeId) ? this.branchSelections.filter(id => id !== nodeId) : [...this.branchSelections, nodeId];
  }

  confirmBranchSelection() {
    if (!this.branchDecision || !this.branchSelections.length) return;
    const { experiment, step } = this.branchDecision;
    this.applyStepStatus(experiment, step, 'completed', this.branchSelections);
    this.branchDecision = null;
    this.branchSelections = [];
  }

  private applyBranchSelection(exp: any, step: ExperimentStep, chosenIds: string[]) {
    const allNext = step.protocol_next_node_ids || [];
    if (allNext.length <= 1) return;
    const chosenReachable = this.reachableNodeIds(exp, chosenIds);
    const rejectedReachable = this.reachableNodeIds(exp, allNext.filter(id => !chosenIds.includes(id)));
    for (const candidate of exp.steps as ExperimentStep[]) {
      const nodeId = candidate.protocol_node_id || '';
      if (chosenReachable.has(nodeId) && candidate.status === 'skipped') {
        candidate.status = 'pending';
        candidate.updated_at = new Date().toISOString();
      }
      if (rejectedReachable.has(nodeId) && !chosenReachable.has(nodeId) && candidate.status !== 'completed') {
        candidate.status = 'skipped';
        candidate.updated_at = new Date().toISOString();
      }
    }
  }

  private reachableNodeIds(exp: any, startingIds: string[]): Set<string> {
    const byId = new Map<string, ExperimentStep>((exp.steps || []).map((candidate: ExperimentStep) => [candidate.protocol_node_id || '', candidate]));
    const found = new Set<string>();
    const visit = (id: string) => {
      if (!id || found.has(id)) return;
      found.add(id);
      for (const next of byId.get(id)?.protocol_next_node_ids || []) visit(next);
    };
    startingIds.forEach(visit);
    return found;
  }

  private activateReadySteps(exp: any, now: string) {
    for (const candidate of exp.steps as ExperimentStep[]) {
      if (candidate.status !== 'pending') continue;
      const parents = (candidate.protocol_parent_node_ids || []).map(id => (exp.steps as ExperimentStep[]).find(step => step.protocol_node_id === id)).filter(Boolean) as ExperimentStep[];
      if (parents.length && parents.every(parent => parent.status === 'completed' || parent.status === 'skipped') && parents.some(parent => parent.status === 'completed')) {
        candidate.status = 'active'; candidate.started_at ||= now; candidate.updated_at = now;
      }
    }
  }

  addStepNote(exp: any, step: ExperimentStep) {
    const text = (this.noteDrafts[step.id] || '').trim();
    if (!text) return;
    step.logs = step.logs || [];
    step.logs.push({ id: crypto.randomUUID(), text, created_at: new Date().toISOString(), kind: 'note' });
    this.noteDrafts[step.id] = '';
    this.onExperimentChange(exp);
  }

  async uploadStepImage(event: Event, exp: any, step: ExperimentStep) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    this.uploadingStepId = step.id;
    try {
      const uploaded = await this.notebook.uploadAsset(file);
      step.images = step.images || []; step.images.push(uploaded.url);
      step.logs = step.logs || [];
      step.logs.push({ id: crypto.randomUUID(), text: `Attached ${file.name}`, created_at: new Date().toISOString(), kind: 'attachment' });
      this.onExperimentChange(exp);
    } catch (error) {
      console.error(error); alert('Could not attach this image.');
    } finally { this.uploadingStepId = null; }
  }

  openCompletion(exp: any) { this.completionExperiment = exp; this.completionScore = 4; }

  async completeExperiment() {
    if (!this.completionExperiment) return;
    const experiment = this.completionExperiment;
    this.saving = true;
    this.completingExperimentIds.add(experiment.id);
    try {
      const saved = await this.saveExperiment(experiment, true);
      if (!saved) throw new Error('The latest experiment changes could not be saved.');
      await this.notebook.archiveExperiment(experiment.id, this.completionScore);
      this.completionExperiment = null; this.selectedExperiment = null; this.activeTab = 'completed';
      await this.loadExperiments();
    } catch (error) {
      console.error(error); alert('Could not complete this experiment.');
    } finally {
      this.completingExperimentIds.delete(experiment.id);
      this.saving = false;
    }
  }

  async deleteExperiment(exp: any) {
    if (exp._shared || !confirm(`Delete “${exp.title}” permanently?`)) return;
    try {
      await this.notebook.deleteExperiment(exp.id);
      if (this.selectedExperiment?.id === exp.id) this.selectedExperiment = null;
      await this.loadExperiments();
    } catch (error) {
      console.error(error); alert('Could not delete this experiment log.');
    }
  }

  routeStepCount(exp: any): number { return (exp.steps || []).filter((step: ExperimentStep) => step.status !== 'skipped').length; }
  completedStepCount(exp: any): number { return (exp.steps || []).filter((step: ExperimentStep) => step.status === 'completed').length; }
  progress(exp: any): number { const total = this.routeStepCount(exp); return total ? Math.round((this.completedStepCount(exp) / total) * 100) : 0; }
  nextStep(exp: any): ExperimentStep | undefined { return (exp.steps || []).find((step: ExperimentStep) => step.status === 'active') || (exp.steps || []).find((step: ExperimentStep) => step.status === 'pending'); }
  cardBadges(exp: any): MyDataCardBadge[] {
    const badges: MyDataCardBadge[] = [{ label: this.activeTab === 'completed' ? 'COMPLETED' : 'IN PROGRESS', tone: this.activeTab === 'completed' ? 'completed' : 'active' }];
    if (exp._shared) badges.push({ label: 'SHARED', tone: 'shared' });
    return badges;
  }
  cardMeta(exp: any): string[] {
    const date = this.formatDate(this.activeTab === 'completed' ? exp.archived_at : exp.updated_at);
    return [this.activeTab === 'completed' ? `Completed ${date}` : `Updated ${date}`, ...(this.activeTab === 'completed' && exp.success_score ? [`Outcome ${exp.success_score}/5`] : [])];
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Not recorded';
    return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
}
