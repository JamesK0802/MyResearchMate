import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabNotebookService } from '../../services/lab-notebook.service';
import { LabService } from '../../services/lab.service';

@Component({
  selector: 'app-lab-archive-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lab-archive-page.component.html',
  styleUrl: './lab-archive-page.component.css'
})
export class LabArchivePageComponent implements OnInit {
  archivedExperiments: any[] = [];
  sharedExperiments: any[] = [];
  filteredExperiments: any[] = [];
  presets: any[] = [];
  myLabs: any[] = [];

  // View Mode: 'my' or 'shared'
  viewMode: 'my' | 'shared' = 'my';

  // Search and Filter controls
  searchQuery = '';
  filterSample = '';
  filterTag = '';
  filterWorkType = '';
  filterScore = '';
  filterDate = '';

  // Detailed modal view
  selectedExp: any = null;

  // New global outcome comment text
  newCommentText = '';

  // Revocable sharing modal properties
  showShareModal = false;
  sharingExp: any = null;
  sharedLabIds: string[] = [];
  sharedUserIds: string[] = [];
  researcherSearchQuery = '';
  filteredResearchers: any[] = [];
  allUsers: any[] = [];
  savingShares = false;

  // Lightbox preview url
  previewImageUrl: string | null = null;

  constructor(
    private labNotebookService: LabNotebookService,
    private labService: LabService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    try {
      this.archivedExperiments = await this.labNotebookService.getArchiveExperiments().catch(e => {
        console.error('Failed to load archived experiments:', e);
        return [];
      });
    } catch (e) {
      this.archivedExperiments = [];
    }

    try {
      this.presets = await this.labNotebookService.getPresets().catch(e => {
        console.error('Failed to load presets:', e);
        return [];
      });
    } catch (e) {
      this.presets = [];
    }

    try {
      this.myLabs = await this.labService.getMyLabs().catch(e => {
        console.error('Failed to load my labs:', e);
        return [];
      });
    } catch (e) {
      this.myLabs = [];
    }

    try {
      this.allUsers = await this.labService.getAllUsers().catch(e => {
        console.error('Failed to load all users:', e);
        return [];
      });
    } catch (e) {
      this.allUsers = [];
    }
    
    try {
      const allShared = await this.labNotebookService.getSharedWorkflows().catch(e => {
        console.error('Failed to load shared workflows:', e);
        return [];
      });
      this.sharedExperiments = allShared.filter(e => e.workflow_type === 'archive');
    } catch (e) {
      this.sharedExperiments = [];
    }
    
    this.applyFilters();
    this.cdr.detectChanges();
  }


  getSharedNames(exp: any): string[] {
    if (!exp) return [];
    const labs = (exp.shared_labs && exp.shared_labs.length) ? exp.shared_labs : (exp.shared_with_labs || []);
    const users = (exp.shared_users && exp.shared_users.length) ? exp.shared_users : (exp.shared_with_users || []);
    return [...labs, ...users];
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
          id: c.id || c.text || Math.random().toString(),
          author: c.user_name || 'Discussion',
          text: c.comment || c.text || ''
        });
      }
    }
    return comments;
  }

  switchViewMode(mode: 'my' | 'shared') {
    this.viewMode = mode;
    this.applyFilters();
  }

  applyFilters() {
    const sourceList = this.viewMode === 'my' ? this.archivedExperiments : this.sharedExperiments;
    let list = [...sourceList];

    // Search query
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(exp => 
        exp.title?.toLowerCase().includes(q) || 
        exp.description?.toLowerCase().includes(q)
      );
    }

    // Filter by sample
    if (this.filterSample.trim()) {
      const s = this.filterSample.toLowerCase();
      list = list.filter(exp => 
        (exp.samples || []).some((sample: string) => sample.toLowerCase().includes(s))
      );
    }

    // Filter by tag
    if (this.filterTag.trim()) {
      const t = this.filterTag.toLowerCase();
      list = list.filter(exp => 
        (exp.tags || []).some((tag: string) => tag.toLowerCase().includes(t))
      );
    }

    // Filter by work type
    if (this.filterWorkType.trim()) {
      list = list.filter(exp => exp.work_type === this.filterWorkType);
    }

    // Filter by score
    if (this.filterScore) {
      const scoreNum = parseInt(this.filterScore, 10);
      list = list.filter(exp => exp.success_score === scoreNum);
    }

    // Filter by Date
    if (this.filterDate) {
      list = list.filter(exp => exp.archived_at?.startsWith(this.filterDate));
    }

    this.filteredExperiments = list;
    this.cdr.detectChanges();
  }

  resetFilters() {
    this.searchQuery = '';
    this.filterSample = '';
    this.filterTag = '';
    this.filterWorkType = '';
    this.filterScore = '';
    this.filterDate = '';
    this.applyFilters();
  }

  getPresetName(id: string) {
    const p = this.presets.find(x => x.id === id);
    return p ? p.title : id;
  }

  viewDetails(exp: any) {
    this.selectedExp = exp;
    this.newCommentText = '';
  }

  closeModal() {
    this.selectedExp = null;
  }

  async addComment() {
    if (!this.newCommentText.trim() || !this.selectedExp) return;
    try {
      const added = await this.labNotebookService.addArchiveComment(this.selectedExp.id, this.newCommentText.trim());
      if (!this.selectedExp.comments) {
        this.selectedExp.comments = [];
      }
      this.selectedExp.comments.push(added);
      this.newCommentText = '';
      this.cdr.detectChanges();
      
      // Update list state
      await this.loadData();
    } catch (e) {
      console.error('Failed to add comment', e);
    }
  }

  // Sharing Modal
  async openShareModal(exp: any, event: Event) {
    event.stopPropagation();
    this.sharingExp = exp;
    this.showShareModal = true;
    this.researcherSearchQuery = '';
    try {
      const res = await this.labNotebookService.getWorkflowShares(exp.id);
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
      await this.labNotebookService.updateWorkflowShares(this.sharingExp.id, 'archive', this.sharedLabIds, this.sharedUserIds);
      this.closeShareModal();
      await this.loadData();
    } catch (e) {
      console.error('Failed to save sharing', e);
    } finally {
      this.savingShares = false;
    }
  }

  // Lightbox control
  openImagePreview(url: string) {
    this.previewImageUrl = url;
    this.cdr.detectChanges();
  }

  closeImagePreview() {
    this.previewImageUrl = null;
    this.cdr.detectChanges();
  }

  getScoreColor(score: number) {
    if (score === 1) return '#ef4444'; // Red
    if (score === 2) return '#f97316'; // Orange
    if (score === 3) return '#eab308'; // Yellow
    if (score === 4) return '#84cc16'; // Light green
    if (score === 5) return '#22c55e'; // Green
    return '#94a3b8';
  }

  formatDate(d: string) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

