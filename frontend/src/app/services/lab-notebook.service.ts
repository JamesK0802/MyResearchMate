import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LabNotebookService {
  private apiUrl = '/api/lab-notebook';
  private readonly demoExperiments = [
    ['PDS knockout validation', 'Confirm biallelic edits in T1 plants using amplicon sequencing.', 'PDS-T1-01 to PDS-T1-24', 'Genotyping'],
    ['CPC / TRY multiplex screen', 'Compare editing efficiency across paired guide combinations.', 'CPC-TRY library, batch 04', 'CRISPR analysis'],
    ['Q5 PCR optimisation', 'Optimise annealing temperature for difficult genotyping amplicons.', 'Primer set G12', 'PCR'],
  ].map(([title, description, samples, work_type], experimentIndex) => ({ id: `demo-exp-${experimentIndex + 1}`, title, description, samples: [samples], work_type, status: 'active', updated_at: `2026-08-0${7 - experimentIndex}T10:00:00Z`, steps: ['Prepare samples', 'Extract DNA', 'Set up reaction', 'Run and review', 'Record conclusion'].map((stepTitle, stepIndex) => ({ id: `demo-exp-${experimentIndex + 1}-step-${stepIndex + 1}`, title: stepTitle, status: stepIndex === 0 ? 'completed' : stepIndex === 1 ? 'active' : 'pending', comments: stepIndex === 0 ? ['Demo observation recorded.'] : [] })) }));
  private demoNotes = [
    { id: 'demo-note-1', title: 'CRISPR genotyping — Week 3', body: '<h2>Genotyping update</h2><p>Reviewed <strong>48 seedlings</strong> from the CPC edit line. Eight candidates show the expected amplicon shift.</p><ul><li>Run Sanger validation for candidates 12, 19, 27</li><li>Prepare fresh leaf tissue on Thursday</li></ul>', tags: ['CRISPR', 'genotyping'], updated_at: '2026-08-06T09:30:00Z' },
    { id: 'demo-note-2', title: 'Growth chamber observations', body: '<h2>Acacia Room 18</h2><p>Nicole recorded uniform germination in tray 18_01. Maintain the current 16 h light cycle and photograph plants next Monday.</p>', tags: ['growth', 'plants'], updated_at: '2026-08-05T14:20:00Z' },
    { id: 'demo-note-3', title: 'PCR optimisation notes', body: '<h2>Q5 optimisation</h2><p>Best amplification was observed with a 62 °C annealing temperature and 25 μL reaction volume. Save this as the next protocol revision.</p>', tags: ['PCR', 'protocol'], updated_at: '2026-08-04T11:00:00Z' },
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
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/experiments/archive`, { headers }));
  }

  async getExperiment(id: string) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get<any>(`${this.apiUrl}/experiments/${id}`, { headers }));
  }

  async createExperiment(data: any) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/experiments`, data, { headers }));
  }

  async updateExperiment(id: string, data: any) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.put<any>(`${this.apiUrl}/experiments/${id}`, data, { headers }));
  }

  async deleteExperiment(id: string) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.delete(`${this.apiUrl}/experiments/${id}`, { headers }));
  }

  async archiveExperiment(id: string, successScore: number) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/experiments/${id}/archive`, { success_score: successScore }, { headers }));
  }

  // --- Assets ---
  async uploadAsset(file: File) {
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
