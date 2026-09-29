import { MyDataPageComponent } from '../../components/my-data-page.component';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ElementRef } from '@angular/core';
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
import { LabService } from '../../services/lab.service';
import { experimentId, experimentRoute, planExperimentRoute } from '../../utils/experiment-route';
import { MyDataGridComponent, MyDataListControlsComponent, MyDataViewMode, readMyDataViewMode, saveMyDataViewMode } from '../../components/my-data-list.component';
import { ActivatedRoute, Router } from '@angular/router';
import { OverflowTooltipDirective } from '../../components/overflow-tooltip.directive';
import { ShareAccessMatrixComponent } from '../../components/share-access-matrix.component';

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
  instructions?: string[];
  node_snapshot?: NamuNode;
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
  imports: [MyDataPageComponent, CommonModule, FormsModule, MyDataHeaderComponent, MyDataCardComponent, MyDataGridComponent, MyDataListControlsComponent, OverflowTooltipDirective, ShareAccessMatrixComponent],
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
  viewMode: MyDataViewMode = readMyDataViewMode();
  showCreatePanel = false;
  selectedExperiment: any = null;
  completionExperiment: any = null;
  completionScore = 4;
  previewImageUrl: string | null = null;
  syncStates: Record<string, 'saved' | 'saving' | 'error'> = {};
  noteDrafts: Record<string, string> = {};
  createForm = this.emptyCreateForm();
  createError = '';
  pendingCreation:any = null;
  creationChoices:Record<string,string> = {};
  creationFork:ExperimentStep | null = null;
  creationOptions:ExperimentStep[] = [];
  creationChoice = '';
  memoComposerOpen = false;
  memoText = '';
  nodeIndex = 0;
  @ViewChild('nodePages') nodePages?: ElementRef<HTMLElement>;
  sharingExperiment:any = null;
  sharingLabs:any[] = [];
  sharingLabIds:string[] = [];
  sharingEditLabIds:string[] = [];
  sharingUserIds:string[] = [];
  sharingEditUserIds:string[] = [];
  sharingUsers:any[] = [];
  sharingBusy = false;
  sharingError = '';
  private saveSubject = new Subject<any>();
  private saveSubscription?: Subscription;
  private pendingSaves = new Map<string, any>();
  private completingExperimentIds = new Set<string>();
  detailExperimentId = '';

  constructor(
    private notebook: LabNotebookService,
    private protocolService: ProtocolTreeService,
    public auth: AuthService,
    private cdr: ChangeDetectorRef,
    private labs: LabService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  async ngOnInit() {
    this.detailExperimentId=this.route.snapshot.paramMap.get('experimentId') || '';
    this.saveSubscription = this.saveSubject.pipe(debounceTime(550)).subscribe(() => this.flushPendingSaves());
    await Promise.all([this.loadExperiments(), this.loadProtocols()]);
  }

  ngOnDestroy() { this.saveSubscription?.unsubscribe(); this.flushPendingSaves(); }

  private flushPendingSaves() {
    const experiments = [...this.pendingSaves.values()];
    this.pendingSaves.clear();
    for (const exp of experiments) void this.saveExperiment(exp);
  }

  private emptyCreateForm() {
    return { title: '', description: '', samples: '', protocolId: '', rootId: '', startNodeId:'' };
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
      if (this.detailExperimentId) this.selectRouteExperiment();
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
      ...step,
      id: step.id || experimentId(), title: step.title || `Step ${index + 1}`,
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
    exp.run_memos = exp.run_memos || [];
    return exp;
  }

  get selectedProtocol(): ProtocolTreeRecord | undefined {
    return this.protocols.find(protocol => protocol.id === this.createForm.protocolId);
  }

  get availableRoots(): NamuTree[] { return this.selectedProtocol?.document_json?.trees || []; }

  get startNodes(): NamuNode[] {
    const tree = this.availableRoots.find(item => item.id === this.createForm.rootId);
    if (!tree) return [];
    const incoming = new Set(tree.nodes.flatMap(node => node.nextNodes || []));
    return tree.nodes.filter(node => node.id === tree.rootNodeId || !incoming.has(node.id));
  }

  onWorkflowSelected() { this.createForm.startNodeId = this.startNodes[0]?.id || ''; }

  onProtocolSelected() {
    const roots = this.availableRoots;
    const preferredId = this.selectedProtocol?.document_json?.activeTreeId;
    this.createForm.rootId = roots.find(root => root.id === preferredId)?.id || roots[0]?.id || '';
    this.onWorkflowSelected();
    if (!this.createForm.title && this.selectedProtocol) this.createForm.title = `${this.selectedProtocol.title} run`;
  }

  openCreatePanel() { this.cancelCreationRoute(); this.createForm = this.emptyCreateForm(); this.createError = ''; this.showCreatePanel = true; }
  closeCreatePanel() { if (!this.creating) this.showCreatePanel = false; }

  async createExperiment() {
    if (this.creating) return;
    const protocol = this.selectedProtocol;
    const root = this.availableRoots.find(tree => tree.id === this.createForm.rootId);
    if (!this.createForm.title.trim()) return alert('Add an experiment title.');
    if (!protocol || !root) { this.createError = 'Choose a saved Tree Protocol.'; return; }
    this.creating = true;
    this.createError = '';
    try {
      const steps = this.buildProtocolSteps({...root, rootNodeId:this.createForm.startNodeId || root.rootNodeId});
      if (!steps.length) throw new Error('This workflow has no reachable steps. Choose another starting point.');
      this.pendingCreation = {
        title: this.createForm.title.trim(), description: this.createForm.description.trim(),
        samples: this.createForm.samples.split(',').map(value => value.trim()).filter(Boolean), tags: [], work_type: '',
        protocol_tree_id: protocol.id, protocol_title: protocol.title, protocol_root_id: root.id,
        protocol_root_name: root.name, protocol_snapshot_updated_at: protocol.updated_at, run_notes: '', run_memos:[], steps
      };
      this.creationChoices = {};
      await this.advanceCreationRoute();
    } catch (error: any) {
      console.error(error);
      this.createError = error?.error?.detail || error?.message || 'Could not create the experiment log.';
    } finally { this.creating = false; this.cdr.detectChanges(); }
  }

  cancelCreationRoute() {
    if (this.creating) return;
    this.pendingCreation = null; this.creationFork = null; this.creationOptions = []; this.creationChoice = ''; this.creationChoices = {};
  }

  async chooseCreationPath() {
    if (this.creating || !this.creationFork || !this.creationChoice) return;
    this.creationChoices[this.creationFork.protocol_node_id!] = this.creationChoice;
    this.creating = true;
    try { await this.advanceCreationRoute(); }
    catch (error:any) { this.createError = error?.error?.detail || error.message || 'Could not create experiment.'; }
    finally { this.creating = false; this.cdr.detectChanges(); }
  }

  private async advanceCreationRoute() {
    const plan = planExperimentRoute<ExperimentStep>(this.pendingCreation.steps, this.creationChoices);
    if (plan.fork) {
      this.creationFork = plan.fork; this.creationOptions = plan.options; this.creationChoice = ''; return;
    }
    // Persist only the resolved route, with its own independent protocol content.
    const steps = plan.route.map((step,index) => ({...step,
      protocol_next_node_ids: plan.route[index+1] ? [plan.route[index+1].protocol_node_id!] : [],
      protocol_parent_node_ids: index ? [plan.route[index-1].protocol_node_id!] : [],
      branch_selected_node_ids: [], status:'pending', started_at:null
    }));
    await this.notebook.createExperiment({...this.pendingCreation,steps});
    this.pendingCreation = null; this.creationFork = null;
    this.showCreatePanel = false; this.activeTab = 'current';
    await this.loadExperiments();
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
      id: experimentId(), protocol_node_id: node.id, title: node.title || `Step ${index + 1}`,
      protocol_next_node_ids: [...(node.nextNodes || [])], protocol_parent_node_ids: parentIds.get(node.id) || [], branch_selected_node_ids: [],
      description: [node.description, ...(node.steps || []).map(step => `• ${step}`)].filter(Boolean).join('\n'),
      instructions: [...(node.steps || [])], node_snapshot:JSON.parse(JSON.stringify(node)),
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
  setViewMode(mode: MyDataViewMode) { this.viewMode = mode; saveMyDataViewMode(mode); }
  openExperiment(exp: any) { void this.router.navigate(['/data/experiment-logs',exp.id]); }
  private selectRouteExperiment() {
    const current=this.currentExperiments.find(exp=>String(exp.id) === this.detailExperimentId);
    const completed=this.completedExperiments.find(exp=>String(exp.id) === this.detailExperimentId);
    const exp=current || completed;
    if (!exp) { void this.router.navigate(['/data/experiment-logs']); return; }
    this.activeTab=current ? 'current' : 'completed';
    this.selectedExperiment = exp; this.noteDrafts = {}; this.memoComposerOpen=false; this.memoText='';
    const steps=this.routeSteps(exp);
    let remembered='';
    try { remembered=localStorage.getItem(this.positionKey(exp)) || ''; } catch {}
    this.nodeIndex=Math.max(0,steps.findIndex(step=>step.id === remembered));
    this.cdr.detectChanges();
    if (this.nodePages) this.nodePages.nativeElement.scrollLeft=this.nodeIndex*this.nodePages.nativeElement.clientWidth;
  }

  private positionKey(exp:any) { return `experiment-page:${this.auth.currentProfile?.id || 'local'}:${exp.id}`; }
  nodeMemos(exp:any,step:ExperimentStep) { return (exp.run_memos || []).filter((memo:any)=>memo.node_id === step.id); }
  earlierMemos(exp:any) { return (exp.run_memos || []).filter((memo:any)=>!memo.node_id); }
  onNodeScroll() {
    const element=this.nodePages?.nativeElement;
    if (!element || !element.clientWidth || !this.selectedExperiment) return;
    const index=Math.min(this.routeSteps(this.selectedExperiment).length-1,Math.max(0,Math.round(element.scrollLeft/element.clientWidth)));
    if (index !== this.nodeIndex) { this.nodeIndex=index; this.memoComposerOpen=false; }
    const step=this.routeSteps(this.selectedExperiment)[index];
    if (step) { try { localStorage.setItem(this.positionKey(this.selectedExperiment),step.id); } catch {} }
  }
  turnNode(delta:number) {
    this.goToNode(this.nodeIndex+delta);
  }
  goToNode(index:number) {
    const element=this.nodePages?.nativeElement;
    if (!element || !this.selectedExperiment) return;
    const lastIndex=this.routeSteps(this.selectedExperiment).length-1;
    const boundedIndex=Math.max(0,Math.min(lastIndex,index));
    this.nodeIndex=boundedIndex;
    this.memoComposerOpen=false;
    const step=this.routeSteps(this.selectedExperiment)[boundedIndex];
    if (step) { try { localStorage.setItem(this.positionKey(this.selectedExperiment),step.id); } catch {} }
    element.scrollTo({left:boundedIndex*element.clientWidth,behavior:'smooth'});
  }

  async openSharing(exp:any) {
    if (exp._shared) return;
    if (this.auth.isDemo) { this.auth.notifyDemoUnavailable('Sharing experiment logs'); return; }
    this.sharingExperiment=exp; this.sharingBusy=true; this.sharingError='';
    try {
      const [labs,shares,users]=await Promise.all([this.labs.getMyLabs(),this.notebook.getWorkflowShares(exp.id),this.labs.getAllUsers()]);
      this.sharingLabs=labs;this.sharingUsers=users.filter(u=>String(u.id)!==String(this.auth.currentProfile?.id));this.sharingLabIds=[...(shares.view_lab_ids||shares.lab_ids||[])];this.sharingEditLabIds=[...(shares.edit_lab_ids||[])];this.sharingUserIds=[...(shares.view_user_ids||shares.user_ids||[])];this.sharingEditUserIds=[...(shares.edit_user_ids||[])];
    } catch { this.sharingError='Could not load sharing settings. Close and try again.'; }
    finally {this.sharingBusy=false; this.cdr.detectChanges();}
  }
  changeSharingAccess(e:{kind:'labs'|'users';id:string;permission:'view'|'edit';checked:boolean}){let view=e.kind==='labs'?this.sharingLabIds:this.sharingUserIds,edit=e.kind==='labs'?this.sharingEditLabIds:this.sharingEditUserIds;if(e.permission==='edit'){edit=e.checked?[...new Set([...edit,e.id])]:edit.filter(x=>x!==e.id);if(e.checked)view=[...new Set([...view,e.id])];}else{view=e.checked?[...new Set([...view,e.id])]:view.filter(x=>x!==e.id);if(!e.checked)edit=edit.filter(x=>x!==e.id);}if(e.kind==='labs'){this.sharingLabIds=view;this.sharingEditLabIds=edit;}else{this.sharingUserIds=view;this.sharingEditUserIds=edit;}}
  async saveSharing() {
    if (!this.sharingExperiment || this.sharingBusy || this.sharingError) return;
    this.sharingBusy=true;
    try {
      await this.notebook.updateWorkflowShares(this.sharingExperiment.id,this.activeTab === 'completed' ? 'archive':'active',this.sharingLabIds,this.sharingEditLabIds,this.sharingUserIds,this.sharingEditUserIds);
      this.sharingExperiment=null;
      await this.loadExperiments();
    } catch { this.sharingError='Could not save sharing settings. Close and try again.'; }
    finally {this.sharingBusy=false;this.cdr.detectChanges();}
  }
  closeExperiment() { this.flushPendingSaves(); this.selectedExperiment = null; void this.router.navigate(['/data/experiment-logs']); }

  onExperimentChange(exp: any) {
    if (this.activeTab === 'completed' || (exp._shared && !exp.can_edit)) return;
    this.syncStates[exp.id] = 'saving';
    this.pendingSaves.set(exp.id, exp);
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
        ,run_memos: exp.run_memos || []
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


  addMemo() {
    if (!this.selectedExperiment || !this.memoText.trim() || this.activeTab !== 'current') return;
    const step=this.routeSteps(this.selectedExperiment)[this.nodeIndex];
    if (!step) return;
    this.selectedExperiment.run_memos.push({id:experimentId(),node_id:step.id,text:this.memoText.trim(),created_at:new Date().toISOString()});
    this.onExperimentChange(this.selectedExperiment);
    this.flushPendingSaves();
    this.noteDrafts[step.id]='';
    this.memoText=''; this.memoComposerOpen=false;
  }

  stageNote(exp:any,step:ExperimentStep):string {
    if (Object.prototype.hasOwnProperty.call(this.noteDrafts,step.id)) return this.noteDrafts[step.id];
    const note=[
      ...(exp.run_memos || []).filter((memo:any)=>memo.node_id === step.id).map((memo:any)=>memo.text),
      ...(step.logs || []).filter(log=>log.kind !== 'status').map(log=>log.text),
      ...(step.comments || [])
    ].filter(Boolean).join('\n\n');
    return note;
  }

  updateStageNote(step:ExperimentStep,text:string) {
    if (!this.selectedExperiment || this.activeTab !== 'current') return;
    this.noteDrafts[step.id]=text;
    const unrelated=(this.selectedExperiment.run_memos || []).filter((memo:any)=>memo.node_id !== step.id);
    const existing=(this.selectedExperiment.run_memos || []).find((memo:any)=>memo.node_id === step.id);
    this.selectedExperiment.run_memos=text ? [...unrelated,{id:existing?.id || experimentId(),node_id:step.id,text,created_at:existing?.created_at || new Date().toISOString()}] : unrelated;
    step.logs=(step.logs || []).filter(log=>log.kind === 'status');
    step.comments=[];
    this.onExperimentChange(this.selectedExperiment);
  }

  autoGrow(event:Event) {
    const textarea=event.target as HTMLTextAreaElement;
    textarea.style.height='auto';
    textarea.style.height=`${Math.max(76,textarea.scrollHeight)}px`;
  }

  protocolInstructions(step:ExperimentStep):string[] {
    return step.instructions || (step.description || '').split('\n').map(line=>line.replace(/^•\s*/, '')).filter(Boolean);
  }

  legacyEvidence(exp:any):ExperimentStep[] {
    const visibleIds=new Set(this.routeSteps(exp).map(s=>s.id));
    return (exp.steps || []).filter((s:ExperimentStep) => !visibleIds.has(s.id) && (s.images?.length || s.comments?.length || s.logs?.some(log=>log.kind !== 'status')));
  }


  openCompletion(exp: any) { this.completionExperiment = exp; this.completionScore = 0; }

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

  routeSteps(exp: any): ExperimentStep[] { return experimentRoute<ExperimentStep>(exp.steps || []); }
  routeStepCount(exp: any): number { return this.routeSteps(exp).length; }
  completedStepCount(exp: any): number { return this.routeSteps(exp).filter(step => step.status === 'completed').length; }
  progress(exp: any): number { const total = this.routeStepCount(exp); return total ? Math.round((this.completedStepCount(exp) / total) * 100) : 0; }
  nextStep(exp: any): ExperimentStep | undefined { return this.routeSteps(exp).find(step => step.status !== 'completed' && step.status !== 'skipped'); }
  cardBadges(exp: any): MyDataCardBadge[] {
    return [
      ...(!exp._shared ? [{ label: 'OWNER', tone: 'owner' as const }] : []),
      ...(this.isExperimentShared(exp) ? [{ label: 'SHARED', tone: 'shared' as const }] : [])
    ];
  }
  isExperimentShared(exp: any): boolean {
    return !!exp._shared || ['shared_lab_ids', 'shared_user_ids', 'shared_labs', 'shared_users', 'shared_with_labs', 'shared_with_users']
      .some(key => Array.isArray(exp?.[key]) && exp[key].length > 0);
  }
  sharingSummary(exp: any): string {
    if (exp._shared) return `Shared by: ${exp.shared_by_name || 'Lab member'}`;
    const labs = exp.shared_labs || exp.shared_with_labs || [];
    const users = exp.shared_users || exp.shared_with_users || [];
    const recipients = [...labs, ...users];
    return `Shared with: ${recipients.join(', ') || 'Selected collaborators'}`;
  }
  cardMeta(exp: any): string[] {
    const date = this.formatDate(exp.created_at);
    return [`Created ${date}`, ...(this.activeTab === 'completed' && exp.success_score ? [`Outcome ${exp.success_score}/5`] : [])];
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Not recorded';
    return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
}
