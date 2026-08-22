import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LabService } from '../../services/lab.service';
import { PlotProjectRecord, PlotProjectService } from '../../services/plot-project.service';

@Component({
  selector: 'app-plot-projects-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="my-data-container">
      <div class="page-header"><h1>Plot Projects</h1></div>
      <div class="tabs-nav">
        <button [class.active]="activeTab === 'all'" (click)="setTab('all')">All Data</button>
        <button [class.active]="activeTab === 'my'" (click)="setTab('my')">My Data</button>
        <button [class.active]="activeTab === 'shared'" (click)="setTab('shared')">Shared with Me</button>
      </div>

      <div *ngIf="loading" class="loading-spinner"><div class="spinner"></div><p>Loading plot projects...</p></div>
      <div *ngIf="!loading && projects.length" class="results-grid">
        <article *ngFor="let project of projects" class="result-card" [class.shared-card]="project.is_shared">
          <div class="card-body">
            <div class="card-top"><h3 class="result-title">{{ project.title }}</h3><div class="card-badges"><span *ngIf="isOwner(project)" class="badge owner">OWNER</span><span *ngIf="project.is_shared" class="badge shared">SHARED</span></div></div>
            <div class="result-meta"><span>📅 {{ (project.updated_at || project.created_at) | date:'mediumDate' }}</span><span>📈 {{ getPlotCount(project) }} Plot{{ getPlotCount(project) === 1 ? '' : 's' }}</span></div>
            <div *ngIf="project.is_shared && !isOwner(project)" class="sharing-info">Shared by: {{ project.shared_by_name || 'Lab member' }}</div>
            <div *ngIf="project.is_shared && isOwner(project)" class="sharing-info">Shared with: {{ (project.shared_with_labs || []).join(', ') }}</div>
          </div>
          <div class="card-actions">
            <button class="btn-load" (click)="open(project)">Open Plot</button>
            <button *ngIf="isOwner(project)" class="btn-share" (click)="openShare(project)" title="Manage Sharing"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-svg-icon"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></button>
            <button *ngIf="isOwner(project)" class="btn-delete" (click)="remove(project)" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-svg-icon"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
          </div>
        </article>
      </div>
      <div *ngIf="!loading && !projects.length" class="empty-state"><div class="empty-icon">📁</div><h3>No plot projects found</h3><p>Save a plot from Plot Generator to keep its data, layout, and R script together.</p><button *ngIf="activeTab !== 'shared'" class="btn-primary" (click)="createNew()">Open Plot Generator</button></div>

      <div *ngIf="sharingProject" class="modal-overlay" (click)="closeShare()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header"><h2>Share Plot Project</h2><button class="close-btn" (click)="closeShare()">×</button></div>
          <div class="modal-body">
            <p class="modal-sub">Select the labs you want to share "<strong>{{ sharingProject.title }}</strong>" with.</p>
            <div *ngIf="myLabs.length === 0" class="no-labs-warning">You don't belong to any labs yet. Please register or join a lab first.</div>
            <div class="labs-list">
              <div *ngFor="let lab of myLabs" class="lab-item">
                <label class="checkbox-container">
                  <input type="checkbox" [checked]="selectedLabIds.includes(lab.id)" (change)="toggleLab(lab.id)">
                  <span class="checkmark"></span>
                  <div class="lab-info"><span class="lab-name">{{ lab.lab_name }}</span><span class="lab-role">{{ (lab.my_role || lab.role_in_lab) | titlecase }}</span></div>
                </label>
              </div>
            </div>
          </div>
          <div class="modal-footer"><button class="btn-cancel" (click)="closeShare()">Cancel</button><button class="btn-save-share" (click)="saveShare()">Update Sharing</button></div>
        </div>
      </div>
    </main>
  `,
  styles: [`
    .my-data-container { padding: var(--space-6) var(--space-6) var(--space-8); max-width: var(--page-max-width); margin: 0 auto; min-height: 80vh; }
    .page-header { margin-bottom: var(--space-3); } .page-header h1 { font-size: var(--text-3xl); font-weight: var(--fw-black); color: var(--color-text-primary); margin: 0; letter-spacing: -0.025em; }
    .tabs-nav { display: flex; gap: 0; margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); } .tabs-nav button { padding: 10px var(--space-6); border: none; background: none; font-family: var(--font-sans); font-weight: var(--fw-semi); font-size: var(--text-base); color: var(--color-text-secondary); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: var(--transition-fast); } .tabs-nav button:hover { color: var(--color-text-body); background: var(--color-surface-alt); } .tabs-nav button.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
    .results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-6); } .result-card { background: var(--color-surface); border-radius: var(--radius-xl); padding: var(--space-6); box-shadow: var(--shadow-xs); border: 1px solid var(--color-border-light); display: flex; flex-direction: column; transition: var(--transition-normal); } .result-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--color-border); } .shared-card { border-left: 3px solid #3b82f6; }
    .card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-3); gap: var(--space-3); } .result-title { font-size: var(--text-lg); font-weight: var(--fw-bold); color: var(--color-text-primary); margin: 0; line-height: var(--lh-tight); } .card-badges { display: flex; gap: var(--space-1); flex-wrap: wrap; } .badge { font-size: var(--text-xs); font-weight: var(--fw-black); padding: 3px 9px; border-radius: var(--radius-full); text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid; } .owner { background: var(--color-primary-subtle); color: var(--color-primary); border-color: var(--color-primary-border); } .shared { background: #dbeafe; color: #1e40af; border-color: #bfdbfe; }
    .result-meta { display: flex; gap: var(--space-4); font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: var(--space-5); font-weight: var(--fw-medium); } .sharing-info { background: var(--color-surface-alt); padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-5); border: 1px solid var(--color-border-light); color: var(--color-text-secondary); font-size: var(--text-sm); }
    .card-actions { display: flex; gap: var(--space-2); margin-top: auto; padding-top: var(--space-5); } button { font: inherit; cursor: pointer; } .btn-load { flex: 1; padding: 10px; background: var(--color-primary); color: white; border: none; border-radius: var(--radius-md); font-family: var(--font-sans); font-weight: var(--fw-bold); font-size: var(--text-base); cursor: pointer; transition: var(--transition-fast); } .btn-load:hover { background: var(--color-primary-hover); } .btn-share,.btn-delete { width: 40px; height: 40px; border: none; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: var(--transition-fast); flex-shrink: 0; } .btn-share { background: var(--color-surface-alt); color: var(--color-text-secondary); border: 1px solid var(--color-border-light); } .btn-share:hover { background: var(--color-border-light); color: var(--color-primary); } .btn-delete { background: var(--color-error-bg); color: #ef4444; border: 1px solid var(--color-error-border); } .btn-delete:hover { background: #fecaca; } .action-svg-icon { width: 18px; height: 18px; display: block; stroke: currentColor; }
    .empty-state { text-align: center; padding: 80px var(--space-10); background: var(--color-surface); border-radius: var(--radius-xl); border: 2px dashed var(--color-border); margin-top: var(--space-5); } .loading-spinner { text-align: center; padding: 100px 0; color:var(--color-text-secondary); } .empty-icon { font-size: 3rem; margin-bottom: var(--space-5); display: block; } .btn-primary,.btn-save-share { border:0; border-radius:var(--radius-md); padding:11px 18px; background:var(--color-primary); color:#fff; font-weight:700; } .spinner { width:36px; height:36px; border:3px solid var(--color-border-light); border-top-color:var(--color-primary); border-radius:50%; margin:0 auto var(--space-4); animation:spin .8s linear infinite; } @keyframes spin { to { transform:rotate(360deg) } }
    .modal-overlay { position:fixed; inset:0; z-index:1000; padding:var(--space-5); background:rgba(15,23,42,.55); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; } .modal-content { width:100%; max-width:500px; background:var(--color-surface); border-radius:var(--radius-2xl); box-shadow:var(--shadow-xl); overflow:hidden; animation:modalSlide .25s cubic-bezier(.16,1,.3,1); } @keyframes modalSlide { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } } .modal-header { padding:var(--space-6) var(--space-8); border-bottom:1px solid var(--color-border-light); display:flex; justify-content:space-between; align-items:center; } .modal-header h2 { font-size:var(--text-xl); font-weight:var(--fw-black); margin:0; color:var(--color-text-primary); } .close-btn { background:var(--color-surface-alt); border:1px solid var(--color-border-light); width:32px; height:32px; border-radius:var(--radius-full); display:flex; align-items:center; justify-content:center; font-size:1.1rem; color:var(--color-text-secondary); cursor:pointer; transition:var(--transition-fast); } .close-btn:hover { background:var(--color-error-bg); color:#ef4444; } .modal-body { padding:var(--space-6) var(--space-8); } .modal-sub { color:var(--color-text-secondary); margin:0 0 var(--space-6); font-size:var(--text-md); } .labs-list { display:flex; flex-direction:column; gap:var(--space-3); max-height:300px; overflow-y:auto; padding-right:var(--space-2); } .lab-item { padding:var(--space-4); border:1.5px solid var(--color-border); border-radius:var(--radius-lg); transition:var(--transition-fast); } .lab-item:hover { border-color:var(--color-primary); background:var(--color-primary-light); } .checkbox-container { display:flex; align-items:center; position:relative; cursor:pointer; font-size:var(--text-md); user-select:none; width:100%; } .checkbox-container input { position:absolute; opacity:0; cursor:pointer; height:0; width:0; } .checkmark { height:22px; width:22px; background:var(--color-surface-alt); border:2px solid var(--color-border-input); border-radius:var(--radius-sm); margin-right:var(--space-4); flex-shrink:0; position:relative; transition:var(--transition-fast); } .checkbox-container:hover input ~ .checkmark { border-color:var(--color-primary); } .checkbox-container input:checked ~ .checkmark { background:var(--color-primary); border-color:var(--color-primary); } .checkmark:after { content:""; position:absolute; display:none; left:7px; top:3px; width:5px; height:9px; border:solid white; border-width:0 2.5px 2.5px 0; transform:rotate(45deg); } .checkbox-container input:checked ~ .checkmark:after { display:block; } .lab-info { display:flex; flex-direction:column; } .lab-name { font-weight:var(--fw-bold); color:var(--color-text-primary); font-size:var(--text-base); } .lab-role { font-size:var(--text-xs); color:var(--color-text-secondary); margin-top:1px; } .modal-footer { padding:var(--space-5) var(--space-8); background:var(--color-surface-alt); display:flex; gap:var(--space-3); justify-content:flex-end; border-top:1px solid var(--color-border-light); } .btn-cancel { padding:10px var(--space-6); background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-md); font-family:var(--font-sans); font-weight:var(--fw-semi); font-size:var(--text-base); color:var(--color-text-secondary); cursor:pointer; } .btn-save-share { padding:10px var(--space-8); background:var(--color-primary); color:white; border:none; border-radius:var(--radius-md); font-family:var(--font-sans); font-weight:var(--fw-bold); font-size:var(--text-base); cursor:pointer; } .no-labs-warning { padding:var(--space-5); background:var(--color-warning-bg); border:1px solid var(--color-warning-border); color:var(--color-warning); border-radius:var(--radius-md); font-size:var(--text-base); margin-bottom:var(--space-5); }
  `]
})
export class PlotProjectsPageComponent implements OnInit {
  projects: PlotProjectRecord[] = []; loading = true; activeTab: 'all' | 'my' | 'shared' = 'all'; sharingProject: PlotProjectRecord | null = null; myLabs: any[] = []; selectedLabIds: string[] = [];
  constructor(private projectService: PlotProjectService, private router: Router, private auth: AuthService, private labs: LabService, private cdr: ChangeDetectorRef) {}
  ngOnInit() { void this.load(); }
  async load() { this.loading = true; this.cdr.detectChanges(); try { this.projects = this.auth.isDemo ? [] : await this.projectService.getProjects(this.activeTab); } catch (error) { console.error('Failed to load plot projects', error); this.projects = []; } finally { this.loading = false; this.cdr.detectChanges(); } }
  setTab(tab: 'all' | 'my' | 'shared') { this.activeTab = tab; void this.load(); }
  isOwner(project: PlotProjectRecord) { return String(project.owner_user_id) === String(this.auth.currentProfile?.id); }
  getPlotCount(project: PlotProjectRecord) { return project.project_json?.plots?.length || 1; }
  createNew() { void this.router.navigate(['/tools/plot-generator']); } open(project: PlotProjectRecord) { this.projectService.queueOpen(project); void this.router.navigate(['/tools/plot-generator']); }
  async remove(project: PlotProjectRecord) { if (!confirm(`Delete "${project.title}"?`)) return; await this.projectService.delete(project.id); this.projects = this.projects.filter(item => item.id !== project.id); this.cdr.detectChanges(); }
  async openShare(project: PlotProjectRecord) { if (this.auth.isDemo) { this.auth.notifyDemoUnavailable('Sharing saved My Data'); return; } this.sharingProject = project; this.selectedLabIds = await this.projectService.getShares(project.id); this.myLabs = await this.labs.getMyLabs(); this.cdr.detectChanges(); }
  closeShare() { this.sharingProject = null; this.selectedLabIds = []; } toggleLab(id: string) { this.selectedLabIds = this.selectedLabIds.includes(id) ? this.selectedLabIds.filter(item => item !== id) : [...this.selectedLabIds, id]; }
  async saveShare() { if (!this.sharingProject) return; await this.projectService.updateShares(this.sharingProject.id, this.selectedLabIds); this.closeShare(); await this.load(); }
}
