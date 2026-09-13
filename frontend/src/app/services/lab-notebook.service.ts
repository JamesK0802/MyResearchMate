import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LabNotebookService {
  private apiUrl = '/api/lab-notebook';
  private demoExperiments: any[] = Array.from({ length: 3 }, (_, experimentIndex) => ({
    id: `demo-exp-${experimentIndex + 1}`,
    title: `Demo Experiment ${experimentIndex + 1}`,
    description: `This is Demo Experiment ${experimentIndex + 1}. It demonstrates a five-step experimental workflow without changing any real data.`,
    samples: [`Sample ${experimentIndex + 1}-1`, `Sample ${experimentIndex + 1}-2`],
    work_type: 'Demo workflow', status: 'active', updated_at: `2026-08-0${7 - experimentIndex}T10:00:00Z`,
    steps: Array.from({ length: 5 }, (_, stepIndex) => ({
      id: `demo-exp-${experimentIndex + 1}-step-${stepIndex + 1}`,
      title: `Step ${stepIndex + 1}`,
      description: `This is demo step ${stepIndex + 1} for Demo Experiment ${experimentIndex + 1}.`,
      status: stepIndex === 0 ? 'completed' : stepIndex === 1 ? 'active' : 'pending',
      comments: stepIndex < 2 ? [`This is a demo note for step ${stepIndex + 1}.`] : []
    }))
  }));
  private demoArchiveExperiments: any[] = [5, 4, 3, 2].map((success_score, index) => ({
    id: `demo-archive-${index + 1}`,
    title: `Demo Completed Experiment ${index + 1}`,
    description: `This is a completed demo workflow with a ${success_score}/5 demonstration rating.`,
    samples: [`Sample ${index + 1}-1`, `Sample ${index + 1}-2`],
    work_type: 'Demo workflow', success_score,
    archived_at: `2026-07-${String(24 - index * 3).padStart(2, '0')}T14:00:00Z`,
    tags: ['demo', `rating-${success_score}`],
    steps: Array.from({ length: 5 }, (_, stepIndex) => ({
      id: `demo-archive-${index + 1}-step-${stepIndex + 1}`,
      title: `Step ${stepIndex + 1}`,
      description: `This is demo step ${stepIndex + 1}.`, status: 'completed',
      comments: [`This is a completed demo step ${stepIndex + 1}.`]
    }))
  }));
  private demoNotes = [
    { id: 'demo-note-1', title: 'Welcome to Memo', body: '<h2>Keep your research context together</h2><p>Use Memo for observations, meeting records, checklists, and quick research updates.</p><img src="/demo-labmate-landing.png" alt="My Lab Mate landing page preview" style="display:block;margin:20px auto;max-width:100%;border:1px solid #dbe5df;border-radius:12px;box-shadow:0 4px 12px rgba(15,23,42,.12);cursor:pointer" /><h3>Images can be added to every memo</h3><p>Paste a screenshot, or drag and drop an image file directly into the editor. Click an attached image to resize it or choose how text wraps around it.</p><ul><li>Record a result beside its screenshot</li><li>Add gel images, plant photos, or instrument captures</li><li>Keep each memo editable and searchable</li></ul>', tags: ['welcome', 'attachments'], updated_at: '2026-08-08T09:30:00Z' },
    { id: 'demo-note-2', title: 'Demo Note 2 — Sample observations', body: '<h2>This is a demo note</h2><p>Sample 2-1 and Sample 2-2 are included to show how observations can be stored. No real experimental data is used here.</p>', tags: ['demo', 'sample'], updated_at: '2026-08-05T14:20:00Z' },
    { id: 'demo-note-3', title: 'Demo Note 3 — Protocol reminder', body: '<h2>This is a demo protocol note</h2><p>Step 1: this is a demo step. Step 2: add your own workflow details after signing in with a regular account.</p>', tags: ['demo', 'protocol'], updated_at: '2026-08-04T11:00:00Z' },
  ];

  constructor(private http: HttpClient, private auth: AuthService) {}

  private async getAuthHeaders(): Promise<HttpHeaders> {
    const session = await this.auth.getSession();
    return new HttpHeaders({ 'Authorization': `Bearer ${session?.access_token}` });
  }

  // --- Notes ---
  async getNotes() {
    if (this.auth.isDemo) return this.demoNotes.map(({ body, ...meta }) => meta);
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/notes`, { headers }));
  }

  async getNote(id: string) {
    if (this.auth.isDemo) {
      const note = this.demoNotes.find(n => n.id === id);
      if (!note) throw new Error('Demo note not found');
      const { body, ...meta } = note;
      return { meta, body };
    }
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get<any>(`${this.apiUrl}/notes/${id}`, { headers }));
  }

  async createNote(data: any) {
    if (this.auth.isDemo) {
      const note = { id: `demo-note-${Date.now()}`, title: data.title || 'New Note', body: data.body || '', tags: data.tags || [], updated_at: new Date().toISOString() };
      this.demoNotes.unshift(note); return note;
    }
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/notes`, data, { headers }));
  }

  async updateNote(id: string, data: any) {
    if (this.auth.isDemo) {
      const note = this.demoNotes.find(n => n.id === id);
      if (!note) throw new Error('Demo note not found');
      Object.assign(note, { title: data.title, body: data.body, tags: data.tags || [], updated_at: new Date().toISOString() });
      return note;
    }
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.put<any>(`${this.apiUrl}/notes/${id}`, data, { headers }));
  }

  async deleteNote(id: string) {
    if (this.auth.isDemo) { this.demoNotes = this.demoNotes.filter(n => n.id !== id); return { message: 'Deleted locally' }; }
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.delete(`${this.apiUrl}/notes/${id}`, { headers }));
  }

  // --- Presets ---
  async getPresets() {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/presets`, { headers }));
  }

  async createPreset(data: any) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/presets`, data, { headers }));
  }

  async updatePreset(id: string, data: any) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.put<any>(`${this.apiUrl}/presets/${id}`, data, { headers }));
  }

  async deletePreset(id: string) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.delete(`${this.apiUrl}/presets/${id}`, { headers }));
  }

  // --- Experiments ---
  async getActiveExperiments() {
    if (this.auth.isDemo) return this.demoExperiments;
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/experiments/active`, { headers }));
  }

  async getArchiveExperiments() {
    if (this.auth.isDemo) return this.demoArchiveExperiments;
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/experiments/archive`, { headers }));
  }

  async getExperiment(id: string) {
    if (this.auth.isDemo) {
      const experiment = [...this.demoExperiments, ...this.demoArchiveExperiments].find(item => item.id === id);
      if (!experiment) throw new Error('Demo experiment not found');
      return experiment;
    }
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get<any>(`${this.apiUrl}/experiments/${id}`, { headers }));
  }

  async createExperiment(data: any) {
    if (this.auth.isDemo) {
      const experiment = { ...data, id: `demo-exp-${Date.now()}`, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      this.demoExperiments.unshift(experiment);
      return experiment;
    }
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/experiments`, data, { headers }));
  }

  async updateExperiment(id: string, data: any) {
    if (this.auth.isDemo) {
      const experiment = this.demoExperiments.find(item => item.id === id);
      if (!experiment) throw new Error('Demo experiment not found');
      Object.assign(experiment, data, { updated_at: new Date().toISOString() });
      return experiment;
    }
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.put<any>(`${this.apiUrl}/experiments/${id}`, data, { headers }));
  }

  async deleteExperiment(id: string) {
    if (this.auth.isDemo) {
      this.demoExperiments = this.demoExperiments.filter(exp => exp.id !== id);
      this.demoArchiveExperiments = this.demoArchiveExperiments.filter(exp => exp.id !== id);
      return { status: 'success' };
    }
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.delete(`${this.apiUrl}/experiments/${id}`, { headers }));
  }

  async archiveExperiment(id: string, successScore: number) {
    if (this.auth.isDemo) {
      const index = this.demoExperiments.findIndex(item => item.id === id);
      if (index < 0) throw new Error('Demo experiment not found');
      const [experiment] = this.demoExperiments.splice(index, 1);
      const archived = { ...experiment, success_score: successScore, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      this.demoArchiveExperiments.unshift(archived);
      return archived;
    }
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/experiments/${id}/archive`, { success_score: successScore }, { headers }));
  }

  // --- Assets ---
  async uploadAsset(file: File) {
    // Demo attachments stay in the browser only and disappear when the demo
    // session ends, matching the rest of the demo workspace behaviour.
    if (this.auth.isDemo) {
      return new Promise<{ url: string, filename: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read image file'));
        reader.onload = () => resolve({ url: String(reader.result), filename: file.name });
        reader.readAsDataURL(file);
      });
    }
    const session = await this.auth.getSession();
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${session?.access_token}` });
    const formData = new FormData();
    formData.append('file', file);
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/assets/upload`, formData, { headers }));
  }

  // --- Comments ---
  async addArchiveComment(expId: string, text: string) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/experiments/${expId}/archive/comment`, { text }, { headers }));
  }

  // --- Preset Transfers ---
  async sendPreset(presetId: string, toUserId: number) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/presets/send`, { preset_id: presetId, to_user_id: toUserId }, { headers }));
  }

  async getIncomingPresetTransfers() {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/presets/transfers/incoming`, { headers }));
  }

  async acceptPresetTransfer(transferId: string) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/presets/transfers/${transferId}/accept`, {}, { headers }));
  }

  async rejectPresetTransfer(transferId: string) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/presets/transfers/${transferId}/reject`, {}, { headers }));
  }

  // --- Lab & Individual Sharing ---
  async getWorkflowShares(workflowId: string) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get<{ lab_ids: string[], user_ids: string[] }>(`${this.apiUrl}/experiments/${workflowId}/shares`, { headers }));
  }

  async updateWorkflowShares(workflowId: string, workflowType: string, labIds: string[], userIds: string[] = []) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.put<any>(`${this.apiUrl}/experiments/${workflowId}/shares`, { 
      workflow_type: workflowType, 
      lab_ids: labIds,
      user_ids: userIds
    }, { headers }));
  }


  async getSharedWorkflows() {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/experiments/shared`, { headers }));
  }
}
