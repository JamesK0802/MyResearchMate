import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabNotebookService } from '../../services/lab-notebook.service';

@Component({
  selector: 'app-lab-archive-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lab-archive-page.component.html',
  styleUrl: './lab-archive-page.component.css'
})
export class LabArchivePageComponent implements OnInit {
  archivedExperiments: any[] = [];
  filteredExperiments: any[] = [];
  presets: any[] = [];

  // Search and Filter controls
  searchQuery = '';
  filterSample = '';
  filterTag = '';
  filterWorkType = '';
  filterScore = '';
  filterDate = '';

  // Detailed modal view
  selectedExp: any = null;

  // Lightbox preview url
  previewImageUrl: string | null = null;

  constructor(
    private labService: LabNotebookService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    try {
      this.archivedExperiments = await this.labService.getArchiveExperiments();
      this.presets = await this.labService.getPresets();
      this.applyFilters();
    } catch (e) {
      console.error(e);
    }
  }

  applyFilters() {
    let list = [...this.archivedExperiments];

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
  }

  closeModal() {
    this.selectedExp = null;
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
