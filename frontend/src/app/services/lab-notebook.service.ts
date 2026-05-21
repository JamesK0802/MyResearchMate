import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LabNotebookService {
  private apiUrl = '/api/lab-notebook';

  constructor(private http: HttpClient, private auth: AuthService) {}

  private async getAuthHeaders(): Promise<HttpHeaders> {
    const session = await this.auth.getSession();
    return new HttpHeaders({ 'Authorization': `Bearer ${session?.access_token}` });
  }

  // --- Notes ---
  async getNotes() {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/notes`, { headers }));
  }

  async getNote(id: string) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.get<any>(`${this.apiUrl}/notes/${id}`, { headers }));
  }

  async createNote(data: any) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/notes`, data, { headers }));
  }

  async updateNote(id: string, data: any) {
    const headers = await this.getAuthHeaders();
    return firstValueFrom(this.http.put<any>(`${this.apiUrl}/notes/${id}`, data, { headers }));
  }

  async deleteNote(id: string) {
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

